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
  modifiers?: ModifierList[];
}

export interface MenuCategory {
  id: string;
  name: string;
  imageUrl?: string;
  items: MenuItem[];
  subcategories?: MenuCategory[];
}
