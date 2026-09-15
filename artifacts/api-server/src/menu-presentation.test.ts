import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMenuItemPresentationOverride,
  MENU_CARD_BACKGROUND_COLORS,
  validateMenuItemPresentation,
} from "./menu-presentation.ts";

test("accepts manager palette colours and normalises an omitted colour to null", () => {
  const result = validateMenuItemPresentation({
    is18Plus: true,
    cardBackgroundColor: MENU_CARD_BACKGROUND_COLORS[0],
  });

  assert.deepEqual(result, {
    ok: true,
    value: {
      is18Plus: true,
      cardBackgroundColor: MENU_CARD_BACKGROUND_COLORS[0],
    },
  });
  assert.deepEqual(validateMenuItemPresentation({ is18Plus: false }), {
    ok: true,
    value: { is18Plus: false, cardBackgroundColor: null },
  });
});

test("rejects malformed presentation metadata and colours outside the palette", () => {
  assert.equal(validateMenuItemPresentation({ is18Plus: "yes" }).ok, false);
  assert.equal(
    validateMenuItemPresentation({ is18Plus: false, cardBackgroundColor: "#ffffff" }).ok,
    false,
  );
  assert.equal(validateMenuItemPresentation(null).ok, false);
});

test("preserves operational override fields when presentation is first persisted", () => {
  const preserved = buildMenuItemPresentationOverride(
    {
      soldOut: true,
      hidden: true,
      kioskHidden: true,
      dietaryTags: "V,GF",
    },
    { is18Plus: true, cardBackgroundColor: MENU_CARD_BACKGROUND_COLORS[2] },
  );

  assert.deepEqual(preserved, {
    soldOut: true,
    hidden: true,
    kioskHidden: true,
    dietaryTags: "V,GF",
    is18Plus: true,
    cardBackgroundColor: MENU_CARD_BACKGROUND_COLORS[2],
  });
});