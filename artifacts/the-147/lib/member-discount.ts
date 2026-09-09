// Client-side safety net for the order preview. The API remains authoritative
// at checkout, but these products must never appear discounted while the public
// Square configuration is loading or an older response remains in memory.
export const MEMBER_DISCOUNT_PREVIEW_EXCLUDED_ITEM_IDS = [
  "JZ7SZSGOYKY5RV3VG3WBBZJM", // Fosters
  "HNDZFILFTLJVB23X5WLWZGX5", // The 147 Lager*
] as const;

export function getMemberDiscountPreviewExcludedItemIds(
  serverItemIds: string[] | undefined,
): Set<string> {
  return new Set([
    ...MEMBER_DISCOUNT_PREVIEW_EXCLUDED_ITEM_IDS,
    ...(serverItemIds ?? []),
  ]);
}

export function calculateMemberDiscountPreviewPence({
  discountPercent,
  eligibleSubtotalPence,
  exclusionsLoaded,
}: {
  discountPercent: number;
  eligibleSubtotalPence: number;
  exclusionsLoaded: boolean;
}): number {
  if (!exclusionsLoaded || discountPercent <= 0 || eligibleSubtotalPence <= 0) {
    return 0;
  }

  return Math.round((eligibleSubtotalPence * discountPercent) / 100);
}