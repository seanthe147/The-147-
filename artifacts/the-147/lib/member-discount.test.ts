import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateMemberDiscountPreviewPence,
  getMemberDiscountPreviewExcludedItemIds,
} from "./member-discount.ts";

test("always excludes Fosters and The 147 Lager from the app preview", () => {
  const excluded = getMemberDiscountPreviewExcludedItemIds(undefined);

  assert.equal(excluded.has("JZ7SZSGOYKY5RV3VG3WBBZJM"), true);
  assert.equal(excluded.has("HNDZFILFTLJVB23X5WLWZGX5"), true);
  assert.equal(excluded.has("XJEZEEDYSLEA4L6TUHTYCKHD"), true);
});

test("current lager pint and half stay full price alongside eligible food", () => {
  const excluded = getMemberDiscountPreviewExcludedItemIds(undefined);
  const lines = [
    { itemId: "XJEZEEDYSLEA4L6TUHTYCKHD", price: 300, quantity: 1 },
    { itemId: "XJEZEEDYSLEA4L6TUHTYCKHD", price: 150, quantity: 2 },
    { itemId: "eligible-food-item", price: 1000, quantity: 1 },
  ];
  const eligibleSubtotalPence = lines.reduce(
    (total, line) => total + (excluded.has(line.itemId) ? 0 : line.price * line.quantity),
    0,
  );
  assert.equal(
    calculateMemberDiscountPreviewPence({
      discountPercent: 10,
      eligibleSubtotalPence,
      exclusionsLoaded: true,
    }),
    100,
  );
});

test("merges additional server exclusions into the app preview", () => {
  const excluded = getMemberDiscountPreviewExcludedItemIds(["ANOTHER-SQUARE-ITEM"]);

  assert.equal(excluded.has("ANOTHER-SQUARE-ITEM"), true);
  assert.equal(excluded.has("JZ7SZSGOYKY5RV3VG3WBBZJM"), true);
});

test("does not preview a member discount before exclusions have loaded", () => {
  assert.equal(
    calculateMemberDiscountPreviewPence({
      discountPercent: 10,
      eligibleSubtotalPence: 275,
      exclusionsLoaded: false,
    }),
    0,
  );
});

test("calculates the member discount after exclusions have loaded", () => {
  assert.equal(
    calculateMemberDiscountPreviewPence({
      discountPercent: 10,
      eligibleSubtotalPence: 275,
      exclusionsLoaded: true,
    }),
    28,
  );
});