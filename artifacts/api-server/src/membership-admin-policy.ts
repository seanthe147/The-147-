import { z } from "zod";
import { validDate } from "./membership-billing-policy.ts";

const money = z.number().int().min(0).max(10_000_000);
const providerId = z.string().trim().max(192).nullable().optional();
export const membershipPlanChanges = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  tier: z.string().trim().min(1).max(120).optional(),
  priceMonthly: money.optional(),
  priceAnnual: money.nullable().optional(),
  hoursIncluded: z.number().int().min(0).max(100_000).nullable().optional(),
  hoursUnit: z.enum(["month", "year"]).optional(),
  snookerUnlimited: z.boolean().optional(),
  foodDrinkDiscount: z.number().int().min(0).max(100).optional(),
  priorityBooking: z.boolean().optional(),
  loyaltyMultiplier: z.number().int().min(1).max(100).optional(),
  guestPassesMonthly: z.number().int().min(0).max(100_000).optional(),
  squarePlanVariationId: providerId,
  squarePlanVariationIdAlt: providerId,
  squarePosVariationIds: z.array(z.string().trim().min(1).max(192)).max(100).optional(),
  squareCustomerGroupId: providerId,
  excludeWithDeals: z.boolean().optional(),
  active: z.boolean().optional(),
  hideFromSignup: z.boolean().optional(),
  sortOrder: z.number().int().min(-100_000).max(100_000).optional(),
  color: z.string().max(100).optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  confirmDisable: z.boolean().optional(),
}).strict();
export const membershipPlanCreation = membershipPlanChanges.required({ name: true, priceMonthly: true });

const calendarDate = z.string().refine(validDate, "Use a valid YYYY-MM-DD date.").nullable().optional();
export const membershipMemberChanges = z.object({
  status: z.enum(["active", "paused", "past_due", "pending", "pending_start", "pending_payment", "frozen", "cancelled", "expired"]).optional(),
  staffNotes: z.string().max(500).nullable().optional(),
  planId: z.number().int().positive().optional(),
  hoursUsedThisPeriod: z.number().int().min(0).max(100_000).optional(),
  guestPassesUsed: z.number().int().min(0).max(100_000).optional(),
  currentPeriodStart: calendarDate,
  currentPeriodEnd: calendarDate,
}).strict();

export function protectedMembership(sub: { squareSubscriptionId?: string | null; source: string }): boolean {
  return !!sub.squareSubscriptionId || /^(?:square|wix|app)(?:_|$)/.test(sub.source);
}

export function changesProtectedBilling(
  sub: { status: string; planId: number; currentPeriodStart: string | null; currentPeriodEnd: string | null },
  changes: z.infer<typeof membershipMemberChanges>,
): boolean {
  return (["status", "planId", "currentPeriodStart", "currentPeriodEnd"] as const).some(key => {
    if (changes[key] === undefined) return false;
    const original = sub[key];
    return key === "currentPeriodStart" || key === "currentPeriodEnd"
      ? (changes[key] || null) !== (original ? String(original).slice(0, 10) : null)
      : changes[key] !== original;
  });
}
