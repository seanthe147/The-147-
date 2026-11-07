type Pack = { label: string; quantityUnits: number; costPence: number | null; supplierCode?: string };
type Item = { name: string; countUnit: string; containerSize: string | null; active?: boolean; mergedIntoId?: number | null; purchasePacks?: Pack[] | null };

/** Confirmed available sizes, not inferred invoice prices or new stock identities. */
export function availableKegPacks(item: Item): Pack[] {
  const packs = item.purchasePacks ?? [];
  if (item.active === false || item.mergedIntoId || item.countUnit !== "keg") return packs;
  const name = item.name.trim().toLowerCase();
  if (!["coors", "coors 3.4%", "carling", "madri", "madri excepcional"].includes(name)) return packs;
  const match = item.containerSize?.trim().match(/^(50|100)\s*l$/i);
  if (!match) return packs;
  const quantityUnits = 50 / Number(match[1]);
  if (packs.some(p => Math.abs(Number(p.quantityUnits) - quantityUnits) < 0.00001)) return packs;
  // A 50L delivery is half a 100L count unit. Unknown cost stays unknown.
  return [...packs, { label: "50L keg", quantityUnits, costPence: null }];
}
