// Helpers used by /api/orders/:appOrderId/reorder. Extracted so they can be
// covered by unit tests without spinning up the full Express app or making
// live Square API calls.

export interface ReorderModifierOption {
  id: string;
  name: string;
  price: number;
}

export interface ReorderModifierList {
  id: string;
  options: ReorderModifierOption[];
}

export interface ReorderMenuItem {
  id: string;
  variationId: string;
  name: string;
  variationName?: string;
  price: number;
  modifiers?: ReorderModifierList[];
}

export interface ReorderRawItem {
  name: string;
  quantity: number;
  price: number;
  modifiers?: string[];
  variationName?: string;
  // Newer orders persist these IDs alongside names so reorder survives renames.
  // Older orders won't have them — we fall back to name matching in that case.
  variationId?: string;
  itemId?: string;
  modifierIds?: string[];
}

export interface ReorderResolvedLine {
  variationId: string;
  itemId: string;
  name: string;
  price: number;
  quantity: number;
  modifiers?: Array<{ catalogObjectId: string; name: string; price: number }>;
}

export interface ReorderResult {
  items: ReorderResolvedLine[];
  skipped: string[];
}

const norm = (s: string | undefined) => (s ?? "").trim().toLowerCase();

// Receipt names are saved as "<item name>" or "<item name> — <variation>"
// (the cart formats them that way before checkout). Splitting on the
// em-dash separator lets us match on both halves.
function splitName(raw: string): { base: string; variation?: string } {
  const parts = raw.split(" — ");
  if (parts.length >= 2) {
    return {
      base: parts.slice(0, -1).join(" — ").trim(),
      variation: parts[parts.length - 1].trim(),
    };
  }
  return { base: raw.trim() };
}

export function findMenuItemForReorder(
  flat: ReorderMenuItem[],
  rawName: string,
  rawVariation?: string,
): ReorderMenuItem | null {
  const { base, variation: nameVariation } = splitName(rawName);
  const baseN = norm(base);
  const wantedVariation = norm(rawVariation || nameVariation);

  if (wantedVariation) {
    const exact = flat.find(
      (m) => norm(m.name) === baseN && norm(m.variationName) === wantedVariation,
    );
    if (exact) return exact;
  }

  const baseCandidates = flat.filter((m) => norm(m.name) === baseN);
  if (baseCandidates.length === 1) return baseCandidates[0];
  if (baseCandidates.length > 1) {
    const noVariation = baseCandidates.find((m) => !m.variationName);
    if (noVariation) return noVariation;
    if (wantedVariation) {
      const fuzzy = baseCandidates.find(
        (m) => m.variationName && norm(m.variationName).includes(wantedVariation),
      );
      if (fuzzy) return fuzzy;
    }
    return baseCandidates[0];
  }

  // Last resort: match the full raw name against the full display name in
  // case the original item name itself contained an em-dash.
  const fullN = norm(rawName);
  const fullMatch = flat.find(
    (m) => norm(m.variationName ? `${m.name} — ${m.variationName}` : m.name) === fullN,
  );
  return fullMatch ?? null;
}

export function buildReorderPayload(
  flat: ReorderMenuItem[],
  rawItems: ReorderRawItem[],
  isUnavailable: (variationId: string) => boolean,
): ReorderResult {
  const items: ReorderResolvedLine[] = [];
  const skipped: string[] = [];

  // Index by variation id for fast ID-based lookup (preferred over name match).
  const byVariationId = new Map<string, ReorderMenuItem>();
  for (const m of flat) {
    if (m.variationId && !byVariationId.has(m.variationId)) byVariationId.set(m.variationId, m);
  }

  for (const raw of rawItems) {
    // Prefer the saved catalog IDs — they survive menu renames. Fall back to
    // name matching for receipts saved before we started persisting IDs.
    let match: ReorderMenuItem | null = null;
    if (raw.variationId) {
      match = byVariationId.get(raw.variationId) ?? null;
    }
    if (!match) {
      match = findMenuItemForReorder(flat, raw.name, raw.variationName);
    }
    if (!match) {
      skipped.push(raw.name);
      continue;
    }
    if (isUnavailable(match.variationId)) {
      skipped.push(raw.name);
      continue;
    }

    const modOptions = (match.modifiers ?? []).flatMap((ml) => ml.options);
    const resolvedMods: Array<{ catalogObjectId: string; name: string; price: number }> = [];
    const rawModNames = raw.modifiers ?? [];
    const rawModIds = raw.modifierIds ?? [];
    const modCount = Math.max(rawModNames.length, rawModIds.length);
    for (let i = 0; i < modCount; i++) {
      const modId = rawModIds[i];
      const modName = rawModNames[i];
      let opt: ReorderModifierOption | undefined;
      if (modId) opt = modOptions.find((o) => o.id === modId);
      if (!opt && modName) opt = modOptions.find((o) => norm(o.name) === norm(modName));
      if (opt) resolvedMods.push({ catalogObjectId: opt.id, name: opt.name, price: opt.price });
    }

    items.push({
      variationId: match.variationId,
      itemId: match.id,
      name: match.variationName ? `${match.name} — ${match.variationName}` : match.name,
      price: match.price,
      quantity: Math.max(1, raw.quantity || 1),
      ...(resolvedMods.length > 0 ? { modifiers: resolvedMods } : {}),
    });
  }

  return { items, skipped };
}
