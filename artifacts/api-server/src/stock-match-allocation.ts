type Variation = { variationId: string; itemId?: string | null };
type Match = { stockItemId: number; suggestedVariationId: string | null; suggestedVariationName: string | null; confidence: string; score: number };

// Reserve the whole Square item: native clients may expand a pint to its half
// sibling. Never offer existing mappings (including inactive stock) for reuse.
export function allocateStockMatches<T extends Match>(
  matches: T[],
  variations: Variation[],
  mappings: { stockItemId: number; squareVariationId: string | null }[],
): T[] {
  const groups = new Map(variations.map(v => [v.variationId, v.itemId ? `item:${v.itemId}` : `variation:${v.variationId}`]));
  const group = (id: string) => groups.get(id) ?? `variation:${id}`;
  const linked = new Set(mappings.map(m => m.stockItemId));
  const used = new Set(mappings.flatMap(m => m.squareVariationId ? [group(m.squareVariationId)] : []));
  const accepted = new Set<number>();
  for (const match of [...matches].sort((a, b) => b.score - a.score || a.stockItemId - b.stockItemId)) {
    if (!match.suggestedVariationId || linked.has(match.stockItemId)) continue;
    const key = group(match.suggestedVariationId);
    if (used.has(key)) continue;
    used.add(key);
    accepted.add(match.stockItemId);
  }
  return matches.map(m => accepted.has(m.stockItemId) ? m : {
    ...m, suggestedVariationId: null, suggestedVariationName: null, confidence: "none", score: 0,
  });
}
