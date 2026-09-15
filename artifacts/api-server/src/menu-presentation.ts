/**
 * Customer-facing menu card presentation metadata.
 *
 * Keep this validation independent from Express so the staff route and its
 * regression checks share exactly the same accepted values.
 */
export const MENU_CARD_BACKGROUND_COLORS = [
  "#FEF3C7", // amber
  "#DCFCE7", // green
  "#DBEAFE", // blue
  "#FCE7F3", // pink
  "#EDE9FE", // purple
  "#FFEDD5", // orange
] as const;

const menuCardBackgroundColors = new Set<string>(MENU_CARD_BACKGROUND_COLORS);

export type MenuItemPresentation = {
  is18Plus: boolean;
  cardBackgroundColor: string | null;
};

export type MenuItemPresentationValidation =
  | { ok: true; value: MenuItemPresentation }
  | { ok: false; message: string };

/**
 * Validate and normalise the JSON body accepted by the staff endpoint.
 * Undefined/null both mean "use the default card colour"; all other colours
 * must come from the finite manager-selectable palette.
 */
export function validateMenuItemPresentation(input: unknown): MenuItemPresentationValidation {
  if (!input || typeof input !== "object") {
    return { ok: false, message: "Presentation metadata is required" };
  }

  const body = input as Record<string, unknown>;
  if (typeof body.is18Plus !== "boolean") {
    return { ok: false, message: "is18Plus must be boolean" };
  }

  const rawColour = body.cardBackgroundColor;
  if (
    rawColour !== null
    && rawColour !== undefined
    && (typeof rawColour !== "string" || !menuCardBackgroundColors.has(rawColour))
  ) {
    return { ok: false, message: "cardBackgroundColor is not supported" };
  }

  return {
    ok: true,
    value: {
      is18Plus: body.is18Plus,
      cardBackgroundColor: rawColour ?? null,
    },
  };
}

export type ExistingMenuItemOverride = {
  soldOut: boolean;
  hidden: boolean;
  kioskHidden: boolean;
  dietaryTags: string | null;
};

/**
 * Build the insert portion used when an item has no override row yet. Keeping
 * this as a pure function makes it difficult for a new metadata write to
 * accidentally reset an existing operational override.
 */
export function buildMenuItemPresentationOverride(
  existing: ExistingMenuItemOverride | undefined,
  presentation: MenuItemPresentation,
): ExistingMenuItemOverride & MenuItemPresentation {
  return {
    soldOut: existing?.soldOut ?? false,
    hidden: existing?.hidden ?? false,
    kioskHidden: existing?.kioskHidden ?? false,
    dietaryTags: existing?.dietaryTags ?? null,
    ...presentation,
  };
}