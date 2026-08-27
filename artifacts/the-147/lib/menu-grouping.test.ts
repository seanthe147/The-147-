import assert from "node:assert/strict";
import test from "node:test";

import {
  groupMenuItems,
  menuGroupMatchesDietaryFilters,
  menuGroupMatchesQuery,
} from "./menu-grouping.ts";
import type { MenuItem } from "../types/menu.ts";

const half: MenuItem = {
  id: "coors",
  variationId: "coors-half",
  name: "Coors",
  variationName: "Half",
  description: "Draught lager",
  price: 250,
  dietaryTags: ["GF"],
};

const pint: MenuItem = {
  ...half,
  variationId: "coors-pint",
  variationName: "Pint",
  price: 500,
  soldOut: true,
};

test("groups Square variations by item ID while preserving order", () => {
  const groups = groupMenuItems([
    half,
    pint,
    { ...half, id: "lager", variationId: "lager-pint", name: "Lager" },
  ]);

  assert.equal(groups.length, 2);
  assert.equal(groups[0].name, "Coors");
  assert.deepEqual(groups[0].variations.map((item) => item.variationName), ["Half", "Pint"]);
  assert.equal(groups[0].minPrice, 250);
  assert.equal(groups[0].maxPrice, 500);
  assert.equal(groups[0].soldOut, false);
});

test("returns one search match when the query matches a variation", () => {
  const [group] = groupMenuItems([half, pint]);
  assert.equal(menuGroupMatchesQuery(group, "pint"), true);
  assert.equal(menuGroupMatchesQuery(group, "wine"), false);
});

test("keeps a group when any available variation satisfies dietary filters", () => {
  const [group] = groupMenuItems([half, pint]);
  assert.equal(menuGroupMatchesDietaryFilters(group, new Set(["GF"])), true);
  assert.equal(menuGroupMatchesDietaryFilters(group, new Set(["VG"])), false);
});