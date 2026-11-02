export type BillingFrequency = "monthly" | "annual";
export type SquareBillingCadence = "MONTHLY" | "THIRTY_DAYS" | "ANNUAL";
export function membershipBusinessDate(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
}
export const BILLING_TERMS_VERSION = "membership-12-month-rolling";

export function isPlatinumConsolidation(current: { tier?: string }, target: { tier?: string }): boolean {
  return current.tier === "maximum" && target.tier === "platinum";
}

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

export function addCalendarDays(date: string, days: number): string {
  if (!validDate(date)) throw new Error("Invalid billing date");
  const result = new Date(date + "T12:00:00Z");
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

export function squareCadenceForPlan(
  plan: { tier?: string | null },
  frequency: BillingFrequency,
): SquareBillingCadence {
  if (frequency === "annual") return "ANNUAL";
  return plan.tier === "blue" || plan.tier === "pink" ? "THIRTY_DAYS" : "MONTHLY";
}

export function billingPeriodEnd(
  plan: { tier?: string | null },
  frequency: BillingFrequency,
  start: string,
): string {
  const cadence = squareCadenceForPlan(plan, frequency);
  if (cadence === "ANNUAL") return addCalendarMonths(start, 12);
  if (cadence === "THIRTY_DAYS") return addCalendarDays(start, 30);
  return addCalendarMonths(start, 1);
}

export function snookerRateDiscountPercent(input: {
  tier?: string | null;
  billingFrequency?: string | null;
  status?: string | null;
  cancelledAt?: Date | string | null;
  periodEnd?: Date | string | null;
  planActive?: boolean;
}, now = new Date()): number {
  if (input.status !== "active" || input.cancelledAt || input.planActive !== true) return 0;
  if (input.periodEnd) {
    if (typeof input.periodEnd === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.periodEnd)) {
      if (!validDate(input.periodEnd) || input.periodEnd < membershipBusinessDate(now)) return 0;
    } else {
      const periodEnd = new Date(input.periodEnd);
      if (!Number.isFinite(periodEnd.getTime()) || periodEnd.getTime() < now.getTime()) return 0;
    }
  }

  if (input.tier === "blue" && input.billingFrequency === "monthly") return 10;
  if (input.tier === "pink" && input.billingFrequency === "annual") return 10;
  return 0;
}

export function membershipReactivationDeadline(paidThroughDate: string | null | undefined, today: string): string | null {
  if (!validDate(paidThroughDate) || !validDate(today) || paidThroughDate >= today) return null;
  const deadline = addCalendarMonths(paidThroughDate, 1);
  return today <= deadline ? deadline : null;
}

export function commitmentEnd(plan: { name: string; tier?: string }, start: string): string | null {
  const months = minimumTermMonths(plan);
  return months ? addCalendarMonths(start, months) : null;
}

export function cancellationAllowed(termEnd: string | null, today: string, prepaidThrough: string | null = null): boolean {
  // Stopping next year's renewal does not shorten an already-paid annual term.
  return !termEnd || termEnd <= today || (!!prepaidThrough && validDate(prepaidThrough) && prepaidThrough >= termEnd);
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
