export function historicalStockConversion(unit: string, current: string | null, savedUnit: string | null, saved: string | null, delivered: number) {
  if (savedUnit && savedUnit !== unit) return { conversion: null, issue: "Count units changed — submit a new physical count." };
  if (unit !== "keg") return { conversion: 1, issue: null };
  const conversion = Number(saved);
  if (!saved || !Number.isFinite(conversion) || conversion <= 0)
    return { conversion: null, issue: "Count has no saved keg yield — submit a new physical count." };
  if (delivered > 0 && conversion !== Number(current))
    return { conversion: null, issue: "Keg yield changed since this count and deliveries have no saved yield — submit a new physical count." };
  return { conversion, issue: null };
}

export function estimateStock(opening: number, delivered: number, conversion: number, links: { squareVariationId: string; soldUnitFactor: string }[], sales: Map<string, number>) {
  const sold = links.reduce((sum, link) => sum + (sales.get(link.squareVariationId) ?? 0) * Number(link.soldUnitFactor), 0);
  return { sold, remaining: Math.round(((opening + delivered) * conversion - sold) * 100) / 100 };
}
