import { getPlanBenefits, type BenefitKey } from "@workspace/db/schema";
import type { MembershipBillingSubscription } from "@workspace/api-client-react";

export function apiErrorMessage(err: unknown, fallback: string): string {
  if (!err) return fallback;
  const data = (err as { data?: unknown }).data;
  if (data && typeof data === "object" && typeof (data as { message?: unknown }).message === "string") {
    return (data as { message: string }).message;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

export function fmtDate(d: string | null | undefined, long = false) {
  if (!d) return "Not set";
  const x = new Date(d);
  if (isNaN(x.getTime())) return "Not set";
  return x.toLocaleDateString("en-GB", { day: "numeric", month: long ? "long" : "short", year: "numeric", timeZone: "Europe/London" });
}

export function money(pence: number | null | undefined) {
  if (pence == null) return "";
  return `£${(pence / 100).toFixed(2)}`;
}

/** Match server upgrade policy: compare plan prices, not annual-discount equivalents. */
export function isUpgradeOffer(currentMonthly: number | null | undefined, currentTier: string | undefined,
  targetMonthly: number, targetTier: string | undefined) {
  return (currentTier === "maximum" && targetTier === "platinum") ||
    (currentMonthly != null && targetMonthly > currentMonthly);
}

export function addMonthsIso(d: string | null, n: number): string | null {
  if (!d) return null;
  const x = new Date(String(d).slice(0, 10) + "T12:00:00Z");
  if (isNaN(x.getTime())) return null;
  const day = x.getUTCDate();
  x.setUTCDate(1);
  x.setUTCMonth(x.getUTCMonth() + n);
  const last = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0)).getUTCDate();
  x.setUTCDate(Math.min(day, last));
  return x.toISOString().slice(0, 10);
}

export type BillingSub = MembershipBillingSubscription;
type AccessMembership = Pick<BillingSub, "status"> & Partial<Pick<BillingSub, "source" | "cancellationDate" | "prepaidUntilDate" | "renewalDate">>;

function isFuture(d: string | null | undefined, now: Date) {
  if (!d) return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(now);
    const part = (type: string) => parts.find(p => p.type === type)?.value;
    return d > `${part("year")}-${part("month")}-${part("day")}`;
  }
  const t = new Date(d).getTime();
  return !isNaN(t) && t > now.getTime();
}

/** Last date the customer keeps paid access, if the API tells us. */
export function accessEndDate(sub: AccessMembership): string | null {
  if (sub.cancellationDate) return sub.cancellationDate;
  if (sub.source === "square_pos" && sub.prepaidUntilDate) return sub.prepaidUntilDate;
  return sub.status === "cancelled" ? sub.renewalDate ?? null : null;
}

/**
 * True when the customer has an existing membership record they must manage
 * rather than buy again: any non-cancelled status (incl. held/frozen/pending),
 * or a cancelled one that still has paid access to a future date.
 */
export function hasManageableMembership(sub: AccessMembership | null | undefined, now = new Date()): boolean {
  if (!sub) return false;
  if (sub.status !== "cancelled") return true;
  return isFuture(accessEndDate(sub), now);
}

export type Tone = "good" | "warn" | "bad" | "muted";

export function statusInfo(sub: { status: string; cancellationDate?: string | null }): { label: string; tone: Tone } {
  switch (sub.status) {
    case "active":
      return sub.cancellationDate ? { label: "Ending", tone: "warn" } : { label: "Active", tone: "good" };
    case "paused": return { label: "Paused", tone: "warn" };
    case "pending": return { label: "Payment pending", tone: "warn" };
    case "frozen": return { label: "On hold", tone: "bad" };
    case "held": return { label: "On hold", tone: "bad" };
    case "cancelled": return { label: "Cancelled", tone: "muted" };
    default: return { label: sub.status.replace(/_/g, " "), tone: "muted" };
  }
}

/** Honest description of how this specific membership is paid and when it next changes. */
export function billingSummary(sub: BillingSub): { method: string; dateLabel: string; date: string | null } {
  if (sub.source === "square_pos") {
    if (sub.autoRenewScheduled) {
      return { method: `Prepaid, then ${sub.frequency} automatic billing`, dateLabel: "First automatic charge", date: sub.autoRenewStartDate ?? sub.prepaidUntilDate ?? null };
    }
    return { method: "Prepaid at the club (no auto-renew)", dateLabel: "Paid through", date: sub.prepaidUntilDate ?? null };
  }
  const method = sub.frequency === "annual" ? "Annual billing" : "Monthly billing";
  if (sub.status === "cancelled" || sub.cancellationDate) {
    return { method: `${method}, cancelled`, dateLabel: "Access until", date: accessEndDate(sub) };
  }
  if (sub.status === "frozen" || sub.status === "held") {
    return { method, dateLabel: "Payment due", date: sub.renewalDate };
  }
  if (sub.status === "pending" || sub.status === "pending_start") {
    return { method: `${method}, ${sub.status === "pending" ? "payment pending" : "awaiting start"}`, dateLabel: "Current period ends", date: sub.renewalDate };
  }
  if (!sub.managedInSquare) {
    return { method: `${method}, managed by the club`, dateLabel: "Current period ends", date: sub.renewalDate };
  }
  return { method, dateLabel: "Renews", date: sub.renewalDate };
}

export interface BenefitSourcePlan {
  hoursIncluded?: number | null;
  hoursUnit?: string | null;
  snookerUnlimited?: boolean | null;
  foodDrinkDiscount?: number | null;
  priorityBooking?: boolean | null;
  guestPassesMonthly?: number | null;
  loyaltyMultiplier?: number | null;
  benefitsDetailed?: { key: BenefitKey | string; text: string }[] | null;
}

const HAS_STRUCTURED = (p: BenefitSourcePlan) =>
  ["hoursIncluded", "snookerUnlimited", "foodDrinkDiscount", "priorityBooking", "guestPassesMonthly", "loyaltyMultiplier"].some(
    k => k in (p as Record<string, unknown>),
  );

/** Canonical benefits: server-rendered list first, then the shared schema helper. Never plan.description. */
export function canonicalBenefits(plan: BenefitSourcePlan & { benefits?: string[] | null }): { key: string; text: string }[] {
  if (Array.isArray(plan.benefitsDetailed) && plan.benefitsDetailed.length > 0) return plan.benefitsDetailed;
  if (HAS_STRUCTURED(plan)) return getPlanBenefits(plan);
  if (Array.isArray(plan.benefits)) return plan.benefits.map(text => ({ key: "app", text }));
  return [];
}

export const BENEFIT_ICON: Record<string, "time-outline" | "infinite-outline" | "restaurant-outline" | "flash-outline" | "people-outline" | "star-outline" | "phone-portrait-outline"> = {
  hours: "time-outline",
  discount: "restaurant-outline",
  priority: "flash-outline",
  guests: "people-outline",
  loyalty: "star-outline",
  app: "phone-portrait-outline",
};
