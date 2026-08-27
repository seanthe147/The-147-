import assert from "node:assert/strict";
import test from "node:test";

import {
  isActiveMenuCatalogObject,
  itemUsesAnyMenuCategory,
  selectMenuCategoryId,
} from "./square.ts";

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