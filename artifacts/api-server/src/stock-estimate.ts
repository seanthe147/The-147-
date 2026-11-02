export function estimateStock(opening: number, delivered: number, conversion: number, links: { squareVariationId: string; soldUnitFactor: string }[], sales: Map<string, number>) {
  const sold = links.reduce((sum, link) => sum + (sales.get(link.squareVariationId) ?? 0) * Number(link.soldUnitFactor), 0);
  return { sold, remaining: Math.round(((opening + delivered) * conversion - sold) * 100) / 100 };
}
