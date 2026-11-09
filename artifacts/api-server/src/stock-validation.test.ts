import { test } from "node:test";
import assert from "node:assert/strict";
import { stockCountInput, stockDeliveryInput, stockItemInput } from "./stock-validation.ts";

test("products validate names, conversion factors and case sizes", () => {
  const item = { categoryId: 1, name: "Test keg", countUnit: "keg", servesPerUnit: 88 };
  assert.equal(stockItemInput.parse(item).servesPerUnit, "88");
  for (const patch of [{ name: " " }, { caseSize: 0 }, { caseSize: 2.5 }, { servesPerUnit: -1 }, { active: "false" }]) {
    assert.equal(stockItemInput.safeParse({ ...item, ...patch }).success, false);
  }
  assert.equal(stockItemInput.partial().safeParse({ caseSize: null }).success, true);
});
test("deliveries reject malformed, negative, zero and duplicate quantities", () => {
  const delivery = { deliveredAt: "2026-11-01", lines: [{ stockItemId: 1, quantityCases: "2" }] };
  assert.equal(stockDeliveryInput.safeParse(delivery).success, true);
  for (const quantityCases of ["-1", "2junk", "", "Infinity", "0"]) {
    assert.equal(stockDeliveryInput.safeParse({ ...delivery, lines: [{ stockItemId: 1, quantityCases }] }).success, false);
  }
  assert.equal(stockDeliveryInput.safeParse({ ...delivery, lines: [...delivery.lines, ...delivery.lines] }).success, false);
  assert.equal(stockDeliveryInput.safeParse({ ...delivery, deliveredAt: "invalid" }).success, false);
});
test("counts preserve explicit zero, reject bad status and reversed dates", () => {
  const count = { periodStart: "2026-10-01", periodEnd: "2026-11-01", lines: [{ stockItemId: 1, quantityUnits: "0" }] };
  assert.equal(stockCountInput.safeParse(count).success, true);
  assert.equal(stockCountInput.safeParse({ ...count, periodEnd: "2026-09-01" }).success, false);
  assert.equal(stockCountInput.safeParse({ ...count, status: "complete" }).success, false);
  assert.equal(stockCountInput.safeParse({ ...count, lines: [{ stockItemId: 1, quantityUnits: "-1" }] }).success, false);
  assert.equal(stockCountInput.safeParse({ lines: [] }).success, true);
});

test("stock dates reject impossible calendar days and ambiguous regional strings", () => {
  for (const deliveredAt of ["2026-02-30", "2026-02-29", "2026-04-31T12:00:00Z", "11/09/2026", "9", "2026-13-01"]) {
    assert.equal(stockDeliveryInput.safeParse({ deliveredAt, lines: [{ stockItemId: 1, quantityUnits: "1" }] }).success, false, deliveredAt);
    assert.equal(stockCountInput.safeParse({ periodEnd: deliveredAt }).success, false, deliveredAt);
  }
  for (const deliveredAt of ["2028-02-29", "2026-11-09T12:30", "2026-11-09T12:30:00.000Z", "2026-07-01T12:30:00+01:00"]) {
    assert.equal(stockDeliveryInput.safeParse({ deliveredAt, lines: [{ stockItemId: 1, quantityUnits: "1" }] }).success, true, deliveredAt);
  }
});
