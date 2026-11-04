// Development-only smoke test. Creates synthetic stock data and always removes it.
import pg from "pg";
import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";
if (!process.argv.includes("--run-dev") || process.env.NODE_ENV === "production") throw new Error("Development opt-in required");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const token = randomBytes(32).toString("hex");
const counts = [], deliveries = [], items = [];
const request = async (path, method = "GET", body) => {
  const response = await fetch(`http://localhost:8080/api/${path}`, {
    method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
};
try {
  const session = await pool.query(`INSERT INTO staff_sessions(token,staff_username,staff_user_id,expires_at,active)
    SELECT $1,username,id,NOW()+interval '10 minutes',true FROM staff_users
    WHERE active AND approval_status='approved' AND role IN ('manager','owner') LIMIT 1 RETURNING staff_user_id`, [token]);
  assert.equal(session.rowCount, 1);
  const cats = await request("stock/categories");
  const product = await request("stock/items", "POST", { categoryId: cats.body[0].id, name: `Stock smoke ${Date.now()}`, countUnit: "bottle", caseSize: 24, unitCostPence: 100 });
  assert.equal(product.status, 200); items.push(product.body.id);
  const id = product.body.id;
  const before = await pool.query("SELECT count(*)::int AS n FROM stock_deliveries");
  const invalid = await request("stock/deliveries", "POST", { deliveredAt: "2035-01-02", lines: [{ stockItemId: id, quantityCases: "-2" }] });
  assert.equal(invalid.status, 400);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM stock_deliveries")).rows[0].n, before.rows[0].n);
  const delivery = await request("stock/deliveries", "POST", { deliveredAt: "2035-01-02", lines: [{ stockItemId: id, quantityCases: "2", invoiceLineCostPence: 4800 }] });
  assert.equal(delivery.status, 200); deliveries.push(delivery.body.id);
  assert.equal(Number((await pool.query("SELECT quantity_units FROM stock_delivery_lines WHERE delivery_id=$1", deliveries)).rows[0].quantity_units), 48);
  for (const [date, qty] of [["2035-01-01", "10"], ["2035-01-03", "20"]]) {
    const created = await request("stock/counts", "POST", { periodStart: date, periodEnd: date, lines: [{ stockItemId: id, quantityUnits: "1" }] });
    assert.equal(created.status, 200); counts.push(created.body.id);
    const updated = await request(`stock/counts/${created.body.id}`, "PATCH", { status: "submitted", lines: [{ stockItemId: id, quantityUnits: qty }] });
    assert.equal(updated.status, 200);
    const locked = await request(`stock/counts/${created.body.id}`, "PATCH", { lines: [{ stockItemId: id, quantityUnits: "999" }] });
    assert.equal(locked.status, 400);
    assert.equal(Number((await pool.query("SELECT quantity_units FROM stock_count_lines WHERE count_id=$1", [created.body.id])).rows[0].quantity_units), Number(qty));
  }
  const report = await request("stock/report?periodStart=2035-01-01&periodEnd=2035-01-03");
  assert.equal(report.status, 200);
  const row = report.body.find(r => r.itemId === id);
  assert.equal(row.delivered, 48);
  assert.equal(row.opening, 10);
  assert.equal(row.closing, 20);
  assert.equal(row.consumed, 38);
  assert.equal(row.variance, null); // unlinked product, never invent Square sales
  assert.equal(row.openingValuePence, 1000);
  assert.equal(row.deliveredValuePence, 4800);
  assert.equal(row.closingValuePence, 2000);
  assert.equal(row.consumedCostPence, 3800);
  assert.equal(row.grossProfitPence, null, "unlinked sales cannot produce profit");
  assert.equal((await request(`stock/items/${id}`, "PATCH", { unitCostPence: 999 })).status, 200);
  const unchanged = await request("stock/report?periodStart=2035-01-01&periodEnd=2035-01-03");
  assert.equal(unchanged.body.find(r => r.itemId === id).openingValuePence, 1000, "catalogue cost cannot rewrite count snapshot");
  assert.equal((await request(`stock/items/${id}`, "PATCH", { countUnit: "keg" })).status, 409);
  const keg = await request("stock/items", "POST", { categoryId: cats.body[0].id, name: "Coors 3.4% stock test",
    countUnit: "keg", containerSize: "100L", servesPerUnit: 176 });
  assert.equal(keg.status, 200); items.push(keg.body.id);
  const price = await request("stock/invoice-prices", "POST", { key: "MC-5005796", stockItemId: keg.body.id });
  assert.equal(price.status, 200);
  assert.equal(Number(price.body.unitCostPence), 25228);
  assert.equal(price.body.purchasePacks[0].quantityUnits, .5);
  assert.equal(price.body.purchasePacks[0].costPence, 12614);
  assert.equal((await request("stock/invoice-prices", "POST", { key: "MC-5005796", stockItemId: id })).status, 400,
    "invoice cost cannot be applied to an incompatible item");
  assert.equal((await request("stock/deliveries", "POST", { deliveredAt: "2035-01-02",
    lines: [{ stockItemId: id, quantityUnits: 1, invoiceLineCostPence: -1 }] })).status, 400);
  console.log("PASS: delivery atomicity/conversion, draft update/submit/lock and reconciliation");
} finally {
  await pool.query("DELETE FROM stock_counts WHERE id = ANY($1::int[])", [counts]);
  await pool.query("DELETE FROM stock_deliveries WHERE id = ANY($1::int[])", [deliveries]);
  await pool.query("DELETE FROM stock_items WHERE id = ANY($1::int[])", [items]);
  await pool.query("DELETE FROM staff_sessions WHERE token=$1", [token]);
  await pool.end();
}
