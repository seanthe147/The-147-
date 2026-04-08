export interface MenuItem {
  id: string;
  variationId: string;
  name: string;
  description: string;
  price: number;
}

export interface MenuCategory {
  id: string;
  name: string;
  items: MenuItem[];
}
