import { test } from "node:test";
import assert from "node:assert/strict";
import { estimateStock, historicalStockConversion } from "./stock-estimate.ts";
import { stockLiveCache } from "./stock-live-cache.ts";
import { readFileSync } from "node:fs";
test("keg estimates deduct pints and halves once in base units", () => {
  assert.deepEqual(estimateStock(0.5, 2, 88, [
    { squareVariationId: "pint", soldUnitFactor: "1" },
    { squareVariationId: "half", soldUnitFactor: "0.5" },
  ], new Map([["pint", 10], ["half", 4]])), { sold: 12, remaining: 208 });
});
test("bottle delivery quantities are already converted from cases", () => {
  assert.deepEqual(estimateStock(10, 48, 1, [{ squareVariationId: "bottle", soldUnitFactor: "1" }], new Map([["bottle", 20]])), { sold: 20, remaining: 38 });
});
test("negative estimates remain visible instead of hiding discrepancies", () => {
  assert.equal(estimateStock(0, 0, 1, [{ squareVariationId: "bottle", soldUnitFactor: "1" }], new Map([["bottle", 3]])).remaining, -3);
});

test("saved keg yields survive catalogue changes and unknown history stays unknown", () => {
  assert.deepEqual(historicalStockConversion("keg", "187", "keg", "176", 0), { conversion: 176, issue: null });
  assert.match(historicalStockConversion("keg", "187", "keg", "176", 1).issue!, /deliveries have no saved yield/);
  assert.match(historicalStockConversion("keg", "176", null, null, 0).issue!, /no saved keg yield/);
  assert.match(historicalStockConversion("bottle", null, "keg", "88", 0).issue!, /units changed/);
  assert.equal(historicalStockConversion("bottle", null, null, null, 12).conversion, 1);
  assert.equal(historicalStockConversion("keg", "88", "keg", "88", 2).conversion, 88);
});

test("stock cache refreshes on changed database inputs and expires sales snapshots", async () => {
  let time = 0, calls = 0;
  const cache = stockLiveCache<number>(300_000, () => time);
  const load = async () => ++calls;
  assert.equal(await cache("original", load), 1);
  assert.equal(await cache("original", load), 1);
  assert.equal(await cache("new delivery", load), 2);
  time += 300_000;
  assert.equal(await cache("new delivery", load), 3);
});

test("stock cache shares requests but stale work cannot replace a newer result", async () => {
  const cache = stockLiveCache<number>();
  let release!: (n: number) => void;
  const slow = new Promise<number>(resolve => { release = resolve; });
  const old = cache("old", () => slow);
  const shared = cache("old", () => { throw Error("must share pending work"); });
  assert.equal(await cache("new", async () => 2), 2);
  release(1);
  assert.equal(await old, 1);
  assert.equal(await shared, 1);
  assert.equal(await cache("new", async () => 3), 2);
});

test("failed stock calculations are not cached", async () => {
  const cache = stockLiveCache<number>();
  await assert.rejects(cache("same", async () => { throw Error("offline"); }));
  assert.equal(await cache("same", async () => 1), 1);
});

test("count edits take the shared advisory lock before locking a count row", () => {
  const source = readFileSync(new URL("./routes/routes.ts", import.meta.url), "utf8");
  const route = source.slice(source.indexOf('app.patch("/api/stock/counts/:id"'), source.indexOf('// Square catalog variations —'));
  assert.ok(route.indexOf("pg_advisory_xact_lock(14700031)") >= 0);
  assert.ok(route.indexOf("pg_advisory_xact_lock(14700031)") < route.indexOf('.for("update")'));
});
