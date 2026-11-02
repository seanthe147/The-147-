export const SNOOKER_HOURLY_RATE_PENCE = 795;

export function calculateSnookerBookingPrice(durationHours: number, discountPercent: number) {
  const safeDuration = Math.max(0, Math.floor(durationHours));
  const safeDiscount = Number.isFinite(discountPercent)
    ? Math.max(0, Math.min(100, discountPercent))
    : 0;
  const standardTotalPence = SNOOKER_HOURLY_RATE_PENCE * safeDuration;
  const totalPence = Math.round(standardTotalPence * (1 - safeDiscount / 100));

  return {
    standardTotalPence,
    totalPence,
    savingPence: standardTotalPence - totalPence,
  };
}

export function formatPounds(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}
