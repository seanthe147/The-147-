export interface MenuItem {
  id: string;
  variationId: string;
  name: string;
  variationName?: string;
  description: string;
  price: number;
  soldOut?: boolean;
  imageUrl?: string;
}

export interface MenuCategory {
  id: string;
  name: string;
  imageUrl?: string;
  items: MenuItem[];
}
