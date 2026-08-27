import type { MenuItem } from "@/types/menu";

export interface MenuProductGroup {
  id: string;
  name: string;
  variations: MenuItem[];
  displayItem: MenuItem;
  minPrice: number;
  maxPrice: number;
  soldOut: boolean;
}

export function groupMenuItems(items: MenuItem[]): MenuProductGroup[] {
  const groups = new Map<string, MenuItem[]>();

  for (const item of items) {
    const current = groups.get(item.id);
    if (current) current.push(item);
    else groups.set(item.id, [item]);
  }

  return Array.from(groups.entries()).map(([id, variations]) => {
    const prices = variations.map((variation) => variation.price);
    return {
      id,
      name: variations[0].name,
      variations,
      displayItem: variations[0],
      minPrice: Math.min(...prices),
      maxPrice: Math.max(...prices),
      soldOut: variations.every((variation) => !!variation.soldOut),
    };
  });
}

export function menuGroupMatchesQuery(group: MenuProductGroup, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;

  return group.variations.some((variation) =>
    variation.name.toLowerCase().includes(normalized)
    || variation.description?.toLowerCase().includes(normalized)
    || variation.variationName?.toLowerCase().includes(normalized)
  );
}

export function menuGroupMatchesDietaryFilters(
  group: MenuProductGroup,
  filters: ReadonlySet<string>,
): boolean {
  if (filters.size === 0) return true;
  return group.variations.some((variation) => {
    const tags = variation.dietaryTags ?? [];
    return Array.from(filters).every((filter) => tags.includes(filter));
  });
}