export interface MenuItem {
  id: string;
  variationId: string;
  name: string;
  variationName?: string;
  description: string;
  price: number;
  soldOut?: boolean;
}

export interface MenuCategory {
  id: string;
  name: string;
  items: MenuItem[];
}
