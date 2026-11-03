import { test } from "node:test";
import assert from "node:assert/strict";
import { allocateStockMatches } from "./stock-match-allocation.ts";

const variations = [
  { variationId: "pint", itemId: "beer" },
  { variationId: "half", itemId: "beer" },
  { variationId: "bottle", itemId: "bottle" },
];
const match = (stockItemId: number, suggestedVariationId: string, score = 80) => ({
  stockItemId, suggestedVariationId, suggestedVariationName: suggestedVariationId, score, confidence: "high",
});
test("existing links reserve sibling sizes, including mappings on inactive stock", () => {
  const result = allocateStockMatches([match(1, "half"), match(2, "bottle")], variations, [{ stockItemId: 99, squareVariationId: "pint" }]);
  assert.equal(result[0].suggestedVariationId, null);
  assert.equal(result[1].suggestedVariationId, "bottle");
});
test("highest scoring suggestion wins collisions across sibling sizes", () => {
  const result = allocateStockMatches([match(1, "half", 30), match(2, "pint", 90)], variations, []);
  assert.equal(result[0].confidence, "none");
  assert.equal(result[1].suggestedVariationId, "pint");
});
test("auto matching does not replace an already linked stock item", () => {
  const result = allocateStockMatches([match(1, "bottle")], variations, [{ stockItemId: 1, squareVariationId: "pint" }]);
  assert.equal(result[0].suggestedVariationId, null);
});
