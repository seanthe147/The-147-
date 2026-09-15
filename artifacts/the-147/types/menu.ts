export interface ModifierOption {
  id: string;
  name: string;
  price: number;
}

export interface ModifierList {
  id: string;
  name: string;
  selectionType: "SINGLE" | "MULTIPLE";
  minSelections: number;
  maxSelections: number;
  options: ModifierOption[];
}

export interface SelectedModifier {
  catalogObjectId: string;
  name: string;
  price: number;
}

export interface MenuItem {
  id: string;
  variationId: string;
  name: string;
  variationName?: string;
  description: string;
  price: number;
  soldOut?: boolean;
  imageUrl?: string;
  updatedAt?: string;
  modifiers?: ModifierList[];
  // FEATURE_DIETARY_FILTERS: comma-separated tag codes from the menu
  // override table — e.g. ["V", "GF"]. Always present in the API response
  // (the server omits the field when empty), so the client decides whether
  // to render the badges based on its own feature-flag check.
  dietaryTags?: string[];
  /** Manager-selected customer-facing age indicator. Does not enforce checkout. */
  is18Plus?: boolean;
  /** Optional manager-selected background for this product card. */
  cardBackgroundColor?: string | null;
}

// Canonical set of dietary tag codes the staff dashboard + customer filter
// chips speak. Kept here so the order screen, account screen, and (future)
// staff dashboard never drift on labels / colours.
export const DIETARY_TAGS = [
  { code: "V",  label: "Veggie",      colour: "#16A34A" },
  { code: "VG", label: "Vegan",       colour: "#15803D" },
  { code: "GF", label: "Gluten-Free", colour: "#D97706" },
  { code: "DF", label: "Dairy-Free",  colour: "#0891B2" },
  { code: "NF", label: "Nut-Free",    colour: "#9333EA" },
] as const;
export type DietaryTagCode = typeof DIETARY_TAGS[number]["code"];

export interface MenuCategory {
  id: string;
  name: string;
  imageUrl?: string;
  updatedAt?: string;
  items: MenuItem[];
  subcategories?: MenuCategory[];
  /**
   * True when items in this category are from the kitchen (food). When the
   * kitchen is closed (outside scheduled hours), the order screen + kiosk
   * grey these out and the server rejects them at checkout. Bar items
   * (drinks/snacks) leave this false / undefined so they remain orderable.
   */
  isKitchen?: boolean;
}
