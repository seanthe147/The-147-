import type { Express, RequestHandler } from "express";
import { eq, isNull, sql } from "drizzle-orm";
import { membershipBillingStates as states, membershipSubscriptions as subscriptions } from "@workspace/db/schema";
import { db, storage } from "./storage";
import * as square from "./square";
import {
  BILLING_TERMS_VERSION, cancellationAllowed, commitmentEnd, minimumTermMonths, isPlatinumConsolidation,
  validDate, variationForFrequency, type BillingFrequency,
} from "./membership-billing-policy";

type Connection = Pick<typeof db, "select" | "insert" | "update" | "execute">;
const today = () => new Date().toISOString().slice(0, 10);
export async function billingState(id: number, connection: Connection = db) {
  const [state] = await connection.select().from(states).where(eq(states.subscriptionId, id));
  return state;
}

export async function recordBillingTerms(
  subscriptionId: number,
  plan: { name: string; tier?: string },
  frequency: BillingFrequency,
  start: string,
) {
  await db.insert(states).values({
    subscriptionId, billingFrequency: frequency,
    commitmentStartDate: start, commitmentEndDate: commitmentEnd(plan, start),
    termsVersion: BILLING_TERMS_VERSION,
  }).onConflictDoUpdate({
    target: states.subscriptionId,
    set: { billingFrequency: frequency, commitmentStartDate: start,
      commitmentEndDate: commitmentEnd(plan, start), termsVersion: BILLING_TERMS_VERSION },
    setWhere: isNull(states.termsVersion),
  });
}

export async function alignBillingStart(id: number, plan: { name: string; tier?: string }, start: string) {
  if (!validDate(start)) return;
  const state = await billingState(id);
  if (!state?.termsVersion) return; // Never impose a term on an old customer retroactively.
  const acceptedPlan = state.pendingPlanId ? await storage.getMembershipPlan(state.pendingPlanId) : plan;
  if (!acceptedPlan) throw new Error("Accepted membership plan not found");
  await db.update(states).set({
    commitmentStartDate: start, commitmentEndDate: commitmentEnd(acceptedPlan, start),
    ...(state.pendingPlanId ? { pendingEffectiveDate: start } : {}),
  }).where(eq(states.subscriptionId, id));
}

export async function migrationOffer(plan: Awaited<ReturnType<typeof storage.getMembershipPlan>>) {
  if (plan?.tier === "maximum") {
    plan = (await storage.getMembershipPlans()).find(p => p.tier === "platinum");
  }
  if (!plan?.active || plan.hideFromSignup) throw new Error("This migration needs staff to select an available plan.");
  return plan;
}

export async function prepareMigrationOffer(id: number, oldPlanId: number, plan: NonNullable<Awaited<ReturnType<typeof storage.getMembershipPlan>>>, frequency: BillingFrequency, start: string) {
  await recordBillingTerms(id, plan, frequency, start);
  if (oldPlanId !== plan.id) {
    // Preserve legacy entitlements until a signed successful-payment event.
    await db.update(states).set({
      pendingPlanId: plan.id, pendingFrequency: frequency, pendingEffectiveDate: start,
    }).where(eq(states.subscriptionId, id));
  }
}

export async function migrationBillingStart(id: number): Promise<string> {
  const state = await billingState(id);
  if (!state?.legacyBillingStoppedAt || !validDate(state.legacyPaidThroughDate)) {
    throw new Error("The club must first verify that Wix recurring billing has stopped and record the date already paid through.");
  }
  return state.legacyPaidThroughDate > today() ? state.legacyPaidThroughDate : today();
}

// Shared across autoscaled instances: a concurrent signup cannot create two
// Square subscriptions. The lock is held until the existing handler completes.
export const membershipSignupGuard: RequestHandler = async (req, res, next) => {
  try {
    const customerId = (req as any).customerId as number;
    await db.transaction(async tx => {
      const locked = await tx.execute(sql`SELECT pg_try_advisory_xact_lock(14701, ${customerId}) AS locked`);
      if (!(locked.rows[0] as any)?.locked) {
        res.status(409).json({ message: "A membership request is already being processed. Please wait." });
        return;
      }
      const existing = await storage.getMembershipSubscriptionByCustomer(customerId);
      if (existing && existing.status !== "cancelled") {
        res.status(409).json({ message: "Use Manage membership to change your existing plan. Wix members must use their reviewed migration link.", code: "MEMBERSHIP_EXISTS" });
        return;
      }
      if (!square.isConfigured()) {
        res.status(503).json({ message: "Square subscription billing is not configured." });
        return;
      }
      const plan = await storage.getMembershipPlan(Number(req.body?.planId));
      const frequency = req.body?.billingFrequency ?? "monthly";
      if (frequency !== "monthly" && frequency !== "annual") {
        res.status(400).json({ message: "Choose monthly or annual billing." });
        return;
      }
      if (plan && minimumTermMonths(plan) && req.body?.minimumTermAccepted !== true) {
        res.status(400).json({ message: "Please explicitly accept this plan's 12-month minimum term.", code: "MINIMUM_TERM_ACCEPTANCE_REQUIRED" });
        return;
      }
      if (plan) await square.validateSquareBillingVariation(
        variationForFrequency(plan, frequency), frequency,
        frequency === "annual" ? plan.priceAnnual! : plan.priceMonthly,
      );
      if (req.path.endsWith("/join") && req.body?.startDate > today()) {
        res.status(400).json({ message: "Future starts require the in-app card setup. Hosted Square checkout would charge immediately." });
        return;
      }
      await new Promise<void>(resolve => {
        res.once("finish", resolve);
        res.once("close", resolve);
        next();
      });
    });
  } catch (error: any) {
    if (!res.headersSent) res.status(503).json({ message: error.message || "Unable to verify membership billing." });
  }
};

export async function reconcileScheduledMembership(sqSub: any, paymentConfirmed = false) {
  // Subscription lifecycle alone does not prove payment. Apply a new tier
  // only from the signed invoice.payment_made webhook.
  if (!paymentConfirmed) return;
  if (!sqSub?.id) return;
  const [local] = await db.select().from(subscriptions).where(eq(subscriptions.squareSubscriptionId, sqSub.id));
  if (!local) return;
  const state = await billingState(local.id);
  if (!state?.pendingPlanId || !state.pendingFrequency || !state.pendingEffectiveDate || state.pendingEffectiveDate > today()) return;
  const plan = await storage.getMembershipPlan(state.pendingPlanId);
  if (!plan || variationForFrequency(plan, state.pendingFrequency as BillingFrequency) !== sqSub.plan_variation_id) return;
  // A scheduled action does not grant the new benefits early. Square must
  // report that the target variation is actually in use.
  await db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(14702, ${local.id})`);
    const fresh = await billingState(local.id, tx);
    if (!fresh?.pendingPlanId) return;
    // Changing payment frequency is not a new membership or a new minimum term.
    const startsNewTerm = local.planId !== plan.id && minimumTermMonths(plan) > 0;
    await tx.update(subscriptions).set({ planId: plan.id }).where(eq(subscriptions.id, local.id));
    await tx.update(states).set({
      billingFrequency: fresh.pendingFrequency!,
      commitmentStartDate: startsNewTerm ? fresh.pendingEffectiveDate : fresh.commitmentStartDate,
      commitmentEndDate: startsNewTerm ? commitmentEnd(plan, fresh.pendingEffectiveDate!) : fresh.commitmentEndDate,
      pendingPlanId: null, pendingFrequency: null, pendingEffectiveDate: null,
    }).where(eq(states.subscriptionId, local.id));
  });
}

export async function syncPaidMembershipGroups(subscriptionId: number) {
  const [local] = await db.select().from(subscriptions).where(eq(subscriptions.id, subscriptionId));
  if (!local?.squareCustomerId) return;
  const currentMembership = await storage.getMembershipSubscriptionByCustomer(local.customerId);
  const activePlanId = local.status === "active" ? local.planId
    : currentMembership?.status === "active" && currentMembership.squareCustomerId === local.squareCustomerId
      ? currentMembership.planId : null;
  const plan = activePlanId ? await storage.getMembershipPlan(activePlanId) : null;
  if (activePlanId && !plan) throw new Error("Paid membership plan not found");
  if (local.squareCustomerId) {
    const plans = await storage.getMembershipPlans();
    const groups = await square.listCustomerGroups();
    const current = await square.getCustomerGroupIds(local.squareCustomerId);
    const target = plan ? plan.squareCustomerGroupId
      ?? await square.getOrCreateCustomerGroup(square.membershipGroupName(plan.name)) : null;
    if (target) await square.addCustomerToGroup(local.squareCustomerId, target);
    for (const group of groups) {
      if (group.id !== target && current.includes(group.id) &&
          plans.some(p => (!p.hideFromSignup || p.tier === "maximum") &&
            (p.squareCustomerGroupId === group.id || square.membershipGroupName(p.name) === group.name))) {
        await square.removeCustomerFromGroup(local.squareCustomerId, group.id);
      }
    }
  }
}

export function registerMembershipBilling(app: Express, customerAuth: RequestHandler, staffAuth: RequestHandler, ownerAuth: RequestHandler) {
  app.get("/api/membership/billing", customerAuth, async (req, res) => {
    try {
      let sub = await storage.getMembershipSubscriptionByCustomer((req as any).customerId);
      let remote: any = null;
      if (sub?.squareSubscriptionId) {
        remote = await square.getSquareSubscription(sub.squareSubscriptionId);
        await reconcileScheduledMembership(remote);
        sub = await storage.getMembershipSubscriptionByCustomer((req as any).customerId);
      }
      const plans = (await storage.getMembershipPlans(true)).filter(p => !p.hideFromSignup);
      const state = sub ? await billingState(sub.id) : null;
      const pending = state?.pendingPlanId ? await storage.getMembershipPlan(state.pendingPlanId) : null;
      res.setHeader("Cache-Control", "no-store");
      res.json({
        subscription: sub ? {
          id: sub.id, planId: sub.planId, planName: sub.plan?.name ?? "Membership",
          frequency: state?.billingFrequency ?? (sub.source.includes("annual") ? "annual" : "monthly"),
          status: sub.status, renewalDate: sub.currentPeriodEnd ?? null,
          commitmentEndDate: state?.commitmentEndDate ?? null,
          cancellationAllowed: cancellationAllowed(state?.commitmentEndDate ?? null, today(),
            state?.billingFrequency === "annual" && sub.status === "active" ? remote?.charged_through_date ?? null : null) &&
            !!sub.squareSubscriptionId && !state?.pendingPlanId && !state?.cancellationDate,
          pendingPlanName: pending?.name ?? null, pendingDate: state?.pendingEffectiveDate ?? null,
          cancellationDate: state?.cancellationDate ?? null, managedInSquare: !!sub.squareSubscriptionId,
          migrationNeedsReview: sub.source === "wix_import" && !state?.legacyBillingStoppedAt,
        } : null,
        plans: plans.map(p => ({ id: p.id, name: p.name, monthlyPence: p.priceMonthly,
          annualPence: p.priceAnnual ?? null, minimumTermMonths: minimumTermMonths(p) })),
      });
    } catch {
      res.status(503).json({ message: "Unable to load billing from Square. Please retry; no payments have been changed." });
    }
  });

  app.post("/api/membership/change-plan", customerAuth, async (req, res) => {
    try {
      const { planId, billingFrequency, termsAccepted } = req.body ?? {};
      if (!Number.isInteger(planId) || !["monthly", "annual"].includes(billingFrequency) || termsAccepted !== true) {
        res.status(400).json({ message: "Choose a plan, billing frequency and accept its terms." }); return;
      }
      const sub = await storage.getMembershipSubscriptionByCustomer((req as any).customerId);
      if (!sub?.squareSubscriptionId || sub.status !== "active") {
        res.status(409).json({ message: "An active Square subscription is required. Contact the club about migration." }); return;
      }
      const response = await db.transaction(async tx => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(14702, ${sub.id})`);
        const state = await billingState(sub.id, tx);
        if (state?.pendingPlanId || state?.cancellationDate) throw new Error("A billing change is already scheduled.");
        const target = await storage.getMembershipPlan(planId);
        const current = await storage.getMembershipPlan(sub.planId);
        if (!target?.active || target.hideFromSignup || !current) throw new Error("Plan is not available.");
        if (target.id !== current.id && target.priceMonthly <= current.priceMonthly && !isPlatinumConsolidation(current, target)) {
          throw new Error("Only upgrades are available here. Contact the club about a downgrade.");
        }
        const currentFrequency = state?.billingFrequency ?? (sub.source.includes("annual") ? "annual" : "monthly");
        if (target.id === current.id && currentFrequency === billingFrequency) throw new Error("You already have this plan and billing frequency.");
        const variation = variationForFrequency(target, billingFrequency);
        await square.validateSquareBillingVariation(variation, billingFrequency,
          billingFrequency === "annual" ? target.priceAnnual! : target.priceMonthly);
        const remote = await square.getSquareSubscription(sub.squareSubscriptionId!);
        if (remote.status !== "ACTIVE" || remote.canceled_date ||
            remote.actions?.some((a: any) => a.type === "SWAP_PLAN" || a.type === "CANCEL")) {
          throw new Error("Square already has a billing change or cancellation. Contact the club.");
        }
        const result = await square.swapSquareSubscriptionPlan(sub.squareSubscriptionId!, variation);
        const action = result.actions?.find((a: any) => a.type === "SWAP_PLAN");
        if (!validDate(action?.effective_date)) throw new Error("Square did not confirm the upgrade date. Contact the club before trying again.");
        await tx.insert(states).values({
          subscriptionId: sub.id, billingFrequency: currentFrequency,
          pendingPlanId: target.id, pendingFrequency: billingFrequency, pendingEffectiveDate: action.effective_date,
          termsVersion: BILLING_TERMS_VERSION,
        }).onConflictDoUpdate({ target: states.subscriptionId, set: {
          pendingPlanId: target.id, pendingFrequency: billingFrequency,
          pendingEffectiveDate: action.effective_date, termsVersion: BILLING_TERMS_VERSION,
        } });
        await storage.logMembershipAction({ subscriptionId: sub.id, customerId: sub.customerId,
          action: "upgrade_scheduled", staffUsername: "customer", note: `${target.name}; ${billingFrequency}; effective ${action.effective_date}; terms ${BILLING_TERMS_VERSION}` });
        return { message: "Your change is scheduled for the next renewal. Your current benefits remain until then.", effectiveDate: action.effective_date };
      });
      res.json(response);
    } catch (error: any) {
      if (!res.headersSent) res.status(409).json({ message: error.message || "Could not schedule the plan change." });
    }
  });

  app.post("/api/membership/cancel", customerAuth, async (req, res) => {
    try {
      if (req.body?.confirmed !== true) { res.status(400).json({ message: "Please confirm cancellation." }); return; }
      const sub = await storage.getMembershipSubscriptionByCustomer((req as any).customerId);
      if (!sub?.squareSubscriptionId) throw new Error("Contact the club to manage this membership.");
      const response = await db.transaction(async tx => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(14702, ${sub.id})`);
        const state = await billingState(sub.id, tx);
        const remote = await square.getSquareSubscription(sub.squareSubscriptionId!);
        if (!cancellationAllowed(state?.commitmentEndDate ?? null, today(),
          state?.billingFrequency === "annual" && sub.status === "active" ? remote.charged_through_date ?? null : null)) {
          throw new Error(`Your minimum term runs until ${state!.commitmentEndDate}. Contact the club for exceptional circumstances.`);
        }
        if (state?.pendingPlanId) throw new Error("An upgrade is already scheduled. Contact the club.");
        if (remote.actions?.some((a: any) => a.type === "SWAP_PLAN")) throw new Error("Square has a scheduled upgrade. Contact the club.");
        const result = remote.canceled_date ? remote : await square.cancelSquareSubscription(sub.squareSubscriptionId!);
        if (!validDate(result.canceled_date)) throw new Error("Square did not confirm the cancellation date. Contact the club before retrying.");
        await tx.insert(states).values({ subscriptionId: sub.id, cancellationDate: result.canceled_date,
          billingFrequency: sub.source.includes("annual") ? "annual" : "monthly",
        }).onConflictDoUpdate({ target: states.subscriptionId, set: { cancellationDate: result.canceled_date } });
        await storage.logMembershipAction({ subscriptionId: sub.id, customerId: sub.customerId,
          action: "cancellation_scheduled", staffUsername: "customer", note: `Effective ${result.canceled_date}` });
        return { message: "Cancellation is scheduled. You keep access through your paid billing period.", effectiveDate: result.canceled_date };
      });
      res.json(response);
    } catch (error: any) {
      if (!res.headersSent) res.status(409).json({ message: error.message || "Could not cancel membership." });
    }
  });

  app.post("/api/staff/wix-migration/:id/review", staffAuth, ownerAuth, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { legacyBillingStopped, paidThroughDate } = req.body ?? {};
      if (!Number.isInteger(id) || legacyBillingStopped !== true || !validDate(paidThroughDate)) {
        res.status(400).json({ message: "Confirm Wix recurring billing has stopped and enter the paid-through date." }); return;
      }
      const all = await storage.getMembershipSubscriptions();
      const sub = all.find(s => s.id === id);
      if (!sub || sub.source !== "wix_import" || sub.squareSubscriptionId) {
        res.status(409).json({ message: "This is not an unmigrated Wix membership." }); return;
      }
      const reviewer = (req as any).staffUsername ?? (req as any).staffSession?.staffUsername ?? "owner";
      await db.insert(states).values({ subscriptionId: id, legacyBillingStoppedAt: new Date(),
        legacyPaidThroughDate: paidThroughDate, migrationReviewedBy: reviewer,
      }).onConflictDoUpdate({ target: states.subscriptionId, set: {
        legacyBillingStoppedAt: new Date(), legacyPaidThroughDate: paidThroughDate, migrationReviewedBy: reviewer,
      } });
      await storage.logMembershipAction({ subscriptionId: id, customerId: sub.customerId,
        action: "wix_billing_reviewed", staffUsername: reviewer, note: `Old recurring billing confirmed stopped; paid through ${paidThroughDate}` });
      res.json({ message: "Migration reviewed. The customer must authorise Square billing; no payment was charged.", effectiveDate: await migrationBillingStart(id) });
    } catch {
      res.status(500).json({ message: "Could not record the migration review." });
    }
  });
}
