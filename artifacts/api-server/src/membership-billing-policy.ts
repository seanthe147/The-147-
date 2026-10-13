export type BillingFrequency = "monthly" | "annual";
export const BILLING_TERMS_VERSION = "membership-12-month-rolling";

export function minimumTermMonths(plan: { name: string; tier?: string }): number {
  return [plan.name, plan.tier ?? ""].some(
    value => /^(?:the 147\s+)?(?:black|platinum)(?:\s+membership)?$/i.test(value.trim()),
  ) ? 12 : 0;
}

export function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T12:00:00Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function addCalendarMonths(date: string, months: number): string {
  if (!validDate(date)) throw new Error("Invalid billing date");
  const start = new Date(date + "T12:00:00Z");
  const day = start.getUTCDate();
  start.setUTCDate(1);
  start.setUTCMonth(start.getUTCMonth() + months);
  const last = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
  start.setUTCDate(Math.min(day, last));
  return start.toISOString().slice(0, 10);
}

export function commitmentEnd(plan: { name: string; tier?: string }, start: string): string | null {
  const months = minimumTermMonths(plan);
  return months ? addCalendarMonths(start, months) : null;
}

export function cancellationAllowed(termEnd: string | null, today: string): boolean {
  return !termEnd || termEnd <= today;
}

export function variationForFrequency(
  plan: { squarePlanVariationId?: string | null; squarePlanVariationIdAlt?: string | null; priceAnnual?: number | null },
  frequency: BillingFrequency,
): string {
  // Never substitute the monthly variation for annual billing.
  const id = frequency === "annual" ? plan.squarePlanVariationIdAlt : plan.squarePlanVariationId;
  if (!id || (frequency === "annual" && plan.priceAnnual == null)) {
    throw new Error(`This plan is not configured for ${frequency} Square billing. Please contact the club.`);
  }
  return id;
}
