import assert from "node:assert/strict";
import test from "node:test";

import { pintHalfMenuFixture } from "../fixtures/pint-half-menu.ts";
import { groupMenuItems } from "./menu-grouping.ts";
import {
  buildOrderCartPayload,
  collectSelectedModifiers,
} from "./order-customization.ts";

test("a Pint and Half API response stays one customisable Order card", () => {
  const [category] = pintHalfMenuFixture;
  const productCards = groupMenuItems(category.items);

  assert.equal(productCards.length, 1, "the Order screen must render one product card");
  assert.equal(productCards[0].id, "square-item-lager");
  assert.deepEqual(
    productCards[0].variations.map((variation) => variation.variationName),
    ["Half", "Pint"],
    "the card must offer both Square variations",
  );

  const pint = productCards[0].variations.find(
    (variation) => variation.variationName === "Pint",
  );
  assert.ok(pint, "the Pint choice must be available");

  const modifiers = collectSelectedModifiers(pint, {
    "square-modifier-list-shandy": ["square-modifier-lemonade"],
  });
  const cartItem = buildOrderCartPayload(pint, modifiers);

  assert.deepEqual(cartItem, {
    variationId: "square-variation-pint",
    itemId: "square-item-lager",
    name: "House Lager — Pint",
    price: 500,
    modifiers: [
      {
        catalogObjectId: "square-modifier-lemonade",
        name: "Add lemonade",
        price: 25,
      },
    ],
  });
});