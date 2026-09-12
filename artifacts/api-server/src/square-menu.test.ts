import assert from "node:assert/strict";
import test from "node:test";

import {
  getMemberDiscountExcludedItemIds,
  isActiveMenuCatalogObject,
  isMemberDiscountExcludedItem,
  isMemberDiscountEligibleItem,
  isVariationSoldOutAtLocation,
  itemUsesAnyMenuCategory,
  selectMenuCategoryId,
} from "./square.ts";

test("uses Square's sold-out flag for the configured location", () => {
  const variation = {
    item_variation_data: {
      location_overrides: [
        { location_id: "OTHER", sold_out: true },
        { location_id: "THE-147", sold_out: true },
      ],
    },
  };

  assert.equal(isVariationSoldOutAtLocation(variation, "THE-147"), true);
  assert.equal(isVariationSoldOutAtLocation(variation, "ANOTHER"), false);
});

test("keeps a variation available when Square has not marked it sold out", () => {
  assert.equal(
    isVariationSoldOutAtLocation(
      {
        item_variation_data: {
          location_overrides: [{ location_id: "THE-147", sold_out: false }],
        },
      },
      "THE-147",
    ),
    false,
  );
});

test("prefers an app-configured category over an earlier Square category", () => {
  const item = {
    item_data: {
      categories: [
        { id: "U4FPHVKPDJ3APM2V4NCNDRTK" },
        { id: "square-specials" },
        { id: "app-pub-classics" },
      ],
    },
  };

  assert.equal(
    selectMenuCategoryId(item, new Set(["app-pub-classics"])),
    "app-pub-classics",
  );
});

test("keeps the first eligible Square category when none is app-configured", () => {
  const item = {
    item_data: {
      categories: [
        { id: "U4FPHVKPDJ3APM2V4NCNDRTK" },
        { id: "fallback-category" },
      ],
    },
  };

  assert.equal(selectMenuCategoryId(item, new Set()), "fallback-category");
});

test("rejects deleted or archived menu catalog objects", () => {
  assert.equal(isActiveMenuCatalogObject({ is_deleted: true }), false);
  assert.equal(isActiveMenuCatalogObject({ item_data: { is_archived: true } }), false);
  assert.equal(
    isActiveMenuCatalogObject({ item_variation_data: { is_archived: true } }),
    false,
  );
  assert.equal(isActiveMenuCatalogObject({ category_data: { is_archived: true } }), false);
  assert.equal(isActiveMenuCatalogObject({ item_data: { is_archived: false } }), true);
});

test("honors a hidden category across every Square category assigned to an item", () => {
  const item = {
    categoryIds: ["beer", "hidden-draught"],
  };

  assert.equal(itemUsesAnyMenuCategory(item, new Set(["hidden-draught"])), true);
  assert.equal(itemUsesAnyMenuCategory(item, new Set(["wine"])), false);
});

test("excludes every variation of Fosters and The 147 Lager from member discounts", () => {
  const excludedIds = getMemberDiscountExcludedItemIds();

  assert.deepEqual(
    new Set(excludedIds),
    new Set([
      "JZ7SZSGOYKY5RV3VG3WBBZJM",
      "HNDZFILFTLJVB23X5WLWZGX5",
    ]),
  );
  assert.equal(isMemberDiscountExcludedItem("JZ7SZSGOYKY5RV3VG3WBBZJM"), true);
  assert.equal(isMemberDiscountExcludedItem("HNDZFILFTLJVB23X5WLWZGX5"), true);
  assert.equal(isMemberDiscountExcludedItem("4PG6COZWTPBHCDV2XLPLAVSJ"), false);
  assert.equal(isMemberDiscountExcludedItem("D4FG2XLD4VQY4S6XDKCGFHCP"), false);
});

test("keeps blocked lager at full price without blocking eligible basket lines", () => {
  assert.equal(
    isMemberDiscountEligibleItem("JZ7SZSGOYKY5RV3VG3WBBZJM", false, false),
    false,
  );
  assert.equal(
    isMemberDiscountEligibleItem("HNDZFILFTLJVB23X5WLWZGX5", false, false),
    false,
  );
  assert.equal(
    isMemberDiscountEligibleItem("eligible-food-item", false, false),
    true,
  );
  assert.equal(
    isMemberDiscountEligibleItem("eligible-food-item", true, true),
    false,
  );
  assert.equal(
    isMemberDiscountEligibleItem("eligible-food-item", true, false),
    true,
  );
});