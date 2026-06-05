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
  hidden?: boolean;
  kioskHidden?: boolean;
  imageUrl?: string;
  updatedAt?: string;
  modifiers?: ModifierList[];
  dietaryTags?: string[];
}

export interface MenuCategory {
  id: string;
  name: string;
  imageUrl?: string;
  updatedAt?: string;
  items: MenuItem[];
  subcategories?: MenuCategory[];
  isKitchen?: boolean;
  kioskHidden?: boolean;
}
