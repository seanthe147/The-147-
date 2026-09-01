import type { MenuItem, SelectedModifier } from "../types/menu.ts";

export interface OrderCartPayload {
  variationId: string;
  itemId: string;
  name: string;
  price: number;
  modifiers?: SelectedModifier[];
}

export function collectSelectedModifiers(
  item: MenuItem,
  selections: Readonly<Record<string, readonly string[]>>,
): SelectedModifier[] {
  const modifiers: SelectedModifier[] = [];

  for (const list of item.modifiers ?? []) {
    for (const optionId of selections[list.id] ?? []) {
      const option = list.options.find((candidate) => candidate.id === optionId);
      if (option) {
        modifiers.push({
          catalogObjectId: option.id,
          name: option.name,
          price: option.price,
        });
      }
    }
  }

  return modifiers;
}

export function buildOrderCartPayload(
  item: MenuItem,
  modifiers: SelectedModifier[] = [],
): OrderCartPayload {
  return {
    variationId: item.variationId,
    itemId: item.id,
    name: item.variationName ? `${item.name} — ${item.variationName}` : item.name,
    price: item.price,
    modifiers: modifiers.length > 0 ? modifiers : undefined,
  };
}