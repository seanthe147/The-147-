// Pure helpers for the staff unified customer account view.
// Kept framework-free so the eligibility rules can be unit-tested.

export type AccountCustomer = { id: number; name: string; email: string; phone: string; createdAt: string };
export type AccountBooking = { id: number; tableType: string; tableNumber: number | string | null; date: string; startTime: string; duration: number | null; status: string; notes: string | null };
export type AccountOrder = { id: number; createdAt: string; status: string; totalPence: number; itemsJson: unknown; paymentMethod: string | null };
export type AccountMembership = { id: number; planId: number; planName: string; status: string; source: string | null; startDate: string | null; currentPeriodEnd: string | null; prepaidUntilDate: string | null };
export type AccountAudit = { id: number; action: string; staffUsername: string | null; note: string | null; createdAt: string };
export type BillingPlan = { id: number; name: string; tier: string; monthlyPence: number; annualPence: number | null; minimumTermMonths: number | null };
export type BillingSubscription = {
  id: number | string;
  planId?: number;
  planName?: string;
  cancellationDate?: string | null;
  currentTier: string | null;
  currentMonthlyPence: number | null;
  managedInSquare: boolean;
  commitmentEndDate: string | null;
  renewalDate: string | null;
  pendingPlanName: string | null;
  pendingDate: string | null;
  status: string | null;
};
export type CustomerAccount = {
  customer: AccountCustomer;
  bookings: AccountBooking[];
  orders: AccountOrder[];
  memberships: AccountMembership[];
  audit: AccountAudit[];
  billing: { subscription: BillingSubscription | null; plans: BillingPlan[] } | null;
  billingError: string | null;
  permissions: { role: string; canDowngradePlatinum: boolean };
  linking: { message: string; canReview?: boolean; candidates?: LinkCandidate[] };
};

export type LinkCandidate = { kind: "booking" | "order"; id: number; date: string | null; label: string };

export const HISTORY_LIMITS = { bookings: 200, orders: 100, audit: 100 } as const;
const HIGH_TIERS = ["platinum", "black", "maximum"];

export function formatPence(p: number | null | undefined): string {
  if (p == null || Number.isNaN(Number(p))) return "—";
  return `£${(Number(p) / 100).toFixed(2)}`;
}

export function formatDate(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function currentMembership(ms: AccountMembership[] | undefined): AccountMembership | null {
  if (!ms || !ms.length) return null;
  return ms.find((m) => ["active", "past_due", "pending"].includes(String(m.status).toLowerCase())) || ms[0];
}

export type PlanOption = { plan: BillingPlan; isDowngrade: boolean; blockedReason: string | null };

export function planOptions(account: CustomerAccount, now: Date = new Date()): PlanOption[] {
  const sub = account.billing?.subscription;
  if (!sub || !sub.managedInSquare || account.billingError) return [];
  const cur = Number(sub.currentMonthlyPence) || 0;
  const curTier = String(sub.currentTier || "").toLowerCase();
  const commitFuture = !!sub.commitmentEndDate && new Date(sub.commitmentEndDate) > now;
  const canHigh = !!account.permissions?.canDowngradePlatinum;
  return (account.billing?.plans || [])
    .filter((p) => String(p.tier).toLowerCase() !== "vip" && !/\bvip\b/i.test(p.name || ""))
    .map((plan) => {
      const isCurrent = sub.planId != null ? plan.id === sub.planId : String(plan.tier).toLowerCase() === curTier;
      const isDowngrade = !isCurrent && Number(plan.monthlyPence) <= cur;
      let blockedReason: string | null = null;
      if (isCurrent) blockedReason = "Current plan";
      else if (isDowngrade && commitFuture) blockedReason = `Minimum term runs to ${formatDate(sub.commitmentEndDate)}`;
      else if (isDowngrade && (HIGH_TIERS.includes(curTier) || /platinum|black|maximum/i.test(sub.planName ?? "")) && !canHigh) blockedReason = "Manager or owner required";
      return { plan, isDowngrade, blockedReason };
    });
}

/** Explains why the recurring change tool can't be used, or null if it can. */
export function recurringChangeBlocker(account: CustomerAccount): string | null {
  if (account.billingError) return `Square billing could not be loaded: ${account.billingError}. Managed billing actions are unavailable until this is resolved.`;
  const m = currentMembership(account.memberships);
  if (!m) return "No membership on this account. New memberships must be bought by the customer on the membership website.";
  const sub = account.billing?.subscription;
  if (sub && sub.managedInSquare) {
    if (sub.status !== "active") return "Plan changes require an active, paid membership.";
    if (sub.pendingPlanName || sub.cancellationDate) return "A change or cancellation is already scheduled. Another change cannot be submitted.";
    return null;
  }
  const src = String(m.source || "").toLowerCase();
  const why = m.prepaidUntilDate
    ? `This is a prepaid membership (paid until ${formatDate(m.prepaidUntilDate)})`
    : src.includes("wix")
      ? "This membership came from Wix"
      : src.includes("comp")
        ? "This is a complimentary membership"
        : "This membership has no recurring Square subscription";
  return `${why}, so it cannot be switched with the recurring plan-change tool. The customer needs to make a new purchase or renewal on the membership website, or a manager can review a migration. No payment is taken from here.`;
}

export function orderItemsSummary(j: unknown): string {
  try {
    const arr = typeof j === "string" ? JSON.parse(j) : j;
    if (!Array.isArray(arr)) return "—";
    return arr.map((i: any) => `${i.quantity || i.qty || 1} x ${i.name || i.title || "item"}`).join(", ");
  } catch {
    return "—";
  }
}

export function parseApiError(err: unknown, fallback: string): string {
  const text = (err as any)?.message || "";
  const i = text.indexOf("{");
  if (i !== -1) {
    try {
      const j = JSON.parse(text.slice(i));
      return j.message || j.error || fallback;
    } catch { /* ignore */ }
  }
  return text || fallback;
}
