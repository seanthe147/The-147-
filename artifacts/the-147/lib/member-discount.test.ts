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