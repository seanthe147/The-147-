import { test } from "node:test";
import assert from "node:assert/strict";
import { estimateStock } from "./stock-estimate.ts";
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
