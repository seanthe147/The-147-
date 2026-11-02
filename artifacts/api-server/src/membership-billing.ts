import type { Express, RequestHandler } from "express";
import { createHash } from "node:crypto";
import { ReplaceMembershipCardBody, EnableMembershipAutoRenewBody, ReactivateMembershipBody } from "@workspace/api-zod";
import { and, eq, isNull, sql } from "drizzle-orm";
import { membershipBillingStates as states, membershipSubscriptions as subscriptions, membershipAuditLog, membershipPlanVariationAliases } from "@workspace/db/schema";
import { db, storage } from "./storage";
import * as square from "./square";
import {
  BILLING_TERMS_VERSION, cancellationAllowed, commitmentEnd, minimumTermMonths, isPlatinumConsolidation,
  addCalendarMonths, billingPeriodEnd, squareCadenceForPlan, validDate, variationForFrequency, membershipBusinessDate,
  membershipReactivationDeadline, snookerRateDiscountPercent, type BillingFrequency,
} from "./membership-billing-policy";

type Connection = Pick<typeof db, "select" | "insert" | "update" | "execute">;
const today = membershipBusinessDate;
const replaceable = (sub: any, remote: any) => !!sub?.squareCustomerId &&
  remote?.customer_id === sub.squareCustomerId &&
  ["ACTIVE", "PAUSED", "PENDING"].includes(remote?.status) && sub.status !== "cancelled";

// Never expose provider IDs, billing addresses, names, fingerprints or full PAN.
function permittedCard(card: any) {
  return card ? {
    brand: typeof card.card_brand === "string" ? card.card_brand : null,
    last4: /^\d{4}$/.test(card.last_4 ?? "") ? card.last_4 : null,
    expiryMonth: Number.isInteger(card.exp_month) ? card.exp_month : null,
    expiryYear: Number.isInteger(card.exp_year) ? card.exp_year : null,
  } : null;
}
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
      const existing = await storage.getLatestMembershipSubscriptionByCustomer(customerId);
      if (existing && existing.status !== "cancelled") {
        res.status(409).json({ message: "Use Manage membership to change your existing plan. Wix members must use their reviewed migration link.", code: "MEMBERSHIP_EXISTS" });
        return;
      }
      if (!square.isConfigured()) {
        res.status(503).json({ message: "Square subscription billing is not configured." });
        return;
      }
      const customer = await storage.getCustomerById(customerId);
      if (!customer?.emailVerified) {
        res.status(403).json({ message: "Verify your email before starting membership billing.", code: "EMAIL_VERIFICATION_REQUIRED" });
        return;
      }
      if (customer?.emailVerified) {
        const squareCustomer = await square.findSquareCustomerByEmail(customer.email);
        if (squareCustomer) {
          const owned = await square.listSquareSubscriptionsForCustomer(squareCustomer.id);
          const plans = await storage.getMembershipPlans();
          const historical = await db.select().from(membershipPlanVariationAliases);
          const known = new Set([...plans.flatMap(p => [p.squarePlanVariationId, p.squarePlanVariationIdAlt]),
            ...historical.map(a => a.squareVariationId)]);
          if (owned.some((s: any) => ["ACTIVE", "PENDING", "PAUSED"].includes(s.status) && known.has(s.plan_variation_id))) {
            res.status(409).json({ message: "Square already has a membership for you. Refresh Manage membership or ask staff to review it; no duplicate billing was started.", code: "SQUARE_MEMBERSHIP_EXISTS" });
            return;
          }
        }
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
        squareCadenceForPlan(plan, frequency),
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
  if (!plan || !sqSub.plan_variation_id) return;
  const currentVariation = state.pendingFrequency === "annual" ? plan.squarePlanVariationIdAlt : plan.squarePlanVariationId;
  if (currentVariation !== sqSub.plan_variation_id) {
    // Staff can change prices for new sales while an older agreed upgrade
    // is pending. Its paid historic variation still identifies the same plan.
    const [alias] = await db.select().from(membershipPlanVariationAliases)
      .where(eq(membershipPlanVariationAliases.squareVariationId, sqSub.plan_variation_id));
    if (alias?.planId !== plan.id) return;
  }
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
  const activeSubscription = activePlanId === currentMembership?.planId ? currentMembership
    : activePlanId === local.planId && local.status === "active" ? local : null;
  const activeBilling = activeSubscription ? await billingState(activeSubscription.id) : null;
  await syncSquareMembershipGroupsForCustomer(
    local.squareCustomerId,
    activePlanId,
    local.planId,
    activeBilling?.billingFrequency,
  );
  await db.update(subscriptions).set({ squareGroupSyncPending: false }).where(eq(subscriptions.id, local.id));
}

export async function syncSquareMembershipGroupsForCustomer(
  squareCustomerId: string,
  activePlanId: number | null,
  previousPlanId?: number,
  billingFrequency?: string | null,
) {
  const plan = activePlanId ? await storage.getMembershipPlan(activePlanId) : null;
  if (activePlanId && !plan) throw new Error("Paid membership plan not found");
  if (squareCustomerId) {
    const plans = await storage.getMembershipPlans();
    const groups = await square.listCustomerGroups();
    const current = await square.getCustomerGroupIds(squareCustomerId);
    const [linkedActiveSubscription] = activePlanId
      ? await db.select().from(subscriptions).where(and(
          eq(subscriptions.squareCustomerId, squareCustomerId),
          eq(subscriptions.planId, activePlanId),
          eq(subscriptions.status, "active"),
        )).limit(1)
      : [];
    const linkedBilling = linkedActiveSubscription ? await billingState(linkedActiveSubscription.id) : null;
    const resolvedFrequency = billingFrequency ?? linkedBilling?.billingFrequency
      ?? (plan?.tier === "blue" ? "monthly" : null);
    const target = plan?.active ? plan.squareCustomerGroupId
      ?? await square.getOrCreateCustomerGroup(square.membershipGroupName(plan.name)) : null;
    if (target && !current.includes(target)) await square.addCustomerToGroup(squareCustomerId, target);
    for (const group of groups) {
      if (group.id !== target && current.includes(group.id) &&
          plans.some(p => (p.priceMonthly > 0 || (p.priceAnnual ?? 0) > 0 || p.id === previousPlanId) &&
            (p.squareCustomerGroupId === group.id || square.membershipGroupName(p.name) === group.name))) {
        await square.removeCustomerFromGroup(squareCustomerId, group.id);
      }
    }

    const snookerDiscountPercent = snookerRateDiscountPercent({
      tier: plan?.tier,
      billingFrequency: resolvedFrequency,
      status: linkedActiveSubscription?.status ?? (activePlanId ? "active" : null),
      cancelledAt: linkedActiveSubscription?.cancelledAt,
      periodEnd: linkedActiveSubscription?.currentPeriodEnd,
      planActive: plan?.active === true,
    });
    const eligibleSnookerGroupName = snookerDiscountPercent === 10
      ? square.snookerDiscountCustomerGroupName(plan?.tier === "blue" ? "blue" : "pinkAnnual")
      : null;
    const eligibleSnookerGroup = eligibleSnookerGroupName
      ? groups.find(group => group.name === eligibleSnookerGroupName)
        ?? { id: await square.getOrCreateCustomerGroup(eligibleSnookerGroupName), name: eligibleSnookerGroupName }
      : null;
    if (eligibleSnookerGroup && !current.includes(eligibleSnookerGroup.id)) {
      await square.addCustomerToGroup(squareCustomerId, eligibleSnookerGroup.id);
    }
    const managedSnookerGroupNames = new Set([
      square.snookerDiscountCustomerGroupName("blue"),
      square.snookerDiscountCustomerGroupName("pinkAnnual"),
    ]);
    for (const group of groups) {
      if (managedSnookerGroupNames.has(group.name) &&
          group.id !== eligibleSnookerGroup?.id &&
          current.includes(group.id)) {
        await square.removeCustomerFromGroup(squareCustomerId, group.id);
      }
    }
  }
}

type BillingSubscription = NonNullable<Awaited<ReturnType<typeof storage.getMembershipSubscription>>>;

async function membershipBillingDetails(sub: BillingSubscription | null | undefined) {
  let remote: any = null;
  let paymentCard = null;
  if (sub?.squareSubscriptionId) {
    remote = await square.getSquareSubscription(sub.squareSubscriptionId);
    if (!sub.squareCustomerId || remote.customer_id !== sub.squareCustomerId) throw new Error("Subscription ownership mismatch");
    if (remote.card_id) {
      const card = await square.getSquareCard(remote.card_id);
      if (card?.customer_id !== sub.squareCustomerId) throw new Error("Card ownership mismatch");
      paymentCard = permittedCard(card);
    }
  }
  const plans = (await storage.getMembershipPlans(true)).filter(p => !p.hideFromSignup);
  const state = sub ? await billingState(sub.id) : null;
  const current = sub ? await storage.getMembershipPlan(sub.planId) : null;
  const pending = state?.pendingPlanId ? await storage.getMembershipPlan(state.pendingPlanId) : null;
  const frequency = state?.billingFrequency ?? (sub?.source.includes("annual") || sub?.source.startsWith("square_pos") ? "annual" : "monthly");
  const paidThroughDate = [state?.cancellationDate, sub?.prepaidUntilDate, sub?.currentPeriodEnd]
    .filter((date): date is string => validDate(date))
    .sort()
    .at(-1) ?? null;
  const reactivationDeadline = sub?.status === "cancelled" && sub.source !== "wix_import"
    ? membershipReactivationDeadline(paidThroughDate, today())
    : null;
  const isLegacyPlatinumName = current &&
    (["black", "maximum"].includes(current.tier ?? "") || /^(?:the 147\s+)?black(?:\s+membership)?$/i.test(current.name));
  const reactivationPlan = isLegacyPlatinumName
    ? plans.find(plan => plan.tier === "platinum") ?? null
    : current?.active && !current.hideFromSignup ? current : null;
  const reactivationPricePence = reactivationPlan
    ? (frequency === "annual" ? reactivationPlan.priceAnnual : reactivationPlan.priceMonthly)
    : null;
  const reactivationVariation = reactivationPlan
    ? (frequency === "annual" ? reactivationPlan.squarePlanVariationIdAlt : reactivationPlan.squarePlanVariationId)
    : null;
  const cancellationAction = remote?.actions?.find((action: any) => action.type === "CANCEL");
  const cancellationReversible = !!sub?.squareSubscriptionId && sub.status === "active" &&
    !!state?.cancellationDate && state.cancellationDate >= today() && !state.pendingPlanId &&
    remote?.status === "ACTIVE" && remote.canceled_date === state.cancellationDate &&
    cancellationAction?.id && cancellationAction.effective_date === state.cancellationDate;
  const reactivation = reactivationDeadline && reactivationPlan && reactivationPricePence != null &&
      reactivationVariation && square.isConfigured()
    ? {
        available: true,
        planId: reactivationPlan.id,
        planName: reactivationPlan.name,
        frequency,
        pricePence: reactivationPricePence,
        minimumTermMonths: minimumTermMonths(reactivationPlan),
        paidThroughDate,
        deadline: reactivationDeadline,
      }
    : null;
  return {
    reactivation,
    subscription: sub ? {
      id: sub.id, planId: sub.planId, planName: current?.name ?? "Membership", source: sub.source,
      currentTier: current?.tier ?? null, currentMonthlyPence: current?.priceMonthly ?? null,
      frequency, status: sub.status, renewalDate: sub.currentPeriodEnd ?? null,
      firstPaidAt: sub.firstPaidAt?.toISOString() ?? null, lastPaidAt: sub.lastPaidAt?.toISOString() ?? null,
      prepaidUntilDate: sub.prepaidUntilDate ?? null,
      autoRenewEligible: sub.source === "square_pos" && sub.status === "active" && !sub.squareSubscriptionId &&
        !!sub.prepaidUntilDate && sub.prepaidUntilDate > today() && !!current?.active && !current.hideFromSignup && !state?.pendingPlanId,
      autoRenewScheduled: !!sub.squareSubscriptionId && !!state?.recurringStartDate && state.recurringStartDate > today() && !state.cancellationDate,
      autoRenewStartDate: state?.recurringStartDate ?? null,
      commitmentEndDate: state?.commitmentEndDate ?? null,
      cancellationAllowed: ((state?.recurringStartDate ?? "") > today() || cancellationAllowed(state?.commitmentEndDate ?? null, today(),
        frequency === "annual" && sub.status === "active" ? remote?.charged_through_date ?? null : null)) &&
        !!sub.squareSubscriptionId && sub.status !== "cancelled" && !state?.pendingPlanId && !state?.cancellationDate,
       cancellationReversible: !!cancellationReversible,
      pendingPlanName: pending?.name ?? null, pendingDate: state?.pendingEffectiveDate ?? null,
      cancellationDate: state?.cancellationDate ?? null, managedInSquare: !!sub.squareSubscriptionId,
      migrationNeedsReview: sub.source === "wix_import" && !state?.legacyBillingStoppedAt,
      cardReplacementAllowed: replaceable(sub, remote), paymentCard,
    } : null,
    plans: plans.map(p => ({ id: p.id, name: p.name, tier: p.tier, monthlyPence: p.priceMonthly,
      annualPence: p.priceAnnual ?? null, minimumTermMonths: minimumTermMonths(p) })),
  };
}

// The staff and customer entry points deliberately use the same financial
// operations. Neither can grant an upgrade early or bypass an accepted term.
export async function scheduleMembershipChange(sub: BillingSubscription, planId: number, frequency: BillingFrequency, actor: string) {
  if (!sub.squareSubscriptionId || sub.status !== "active") throw new Error("An active Square subscription is required. Use the reviewed migration process for Wix memberships.");
  return db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(14702, ${sub.id})`);
    const state = await billingState(sub.id, tx);
    if (state?.pendingPlanId || state?.cancellationDate) throw new Error("A billing change is already scheduled.");
    const target = await storage.getMembershipPlan(planId);
    const current = await storage.getMembershipPlan(sub.planId);
    if (!target?.active || target.hideFromSignup || !current) throw new Error("Plan is not available.");
    if (target.id !== current.id && target.priceMonthly <= current.priceMonthly && !isPlatinumConsolidation(current, target)) {
      throw new Error("Only upgrades or a change of billing frequency are supported. A downgrade requires a separate agreed process.");
    }
    const currentFrequency = state?.billingFrequency ?? (sub.source.includes("annual") ? "annual" : "monthly");
    if (target.id === current.id && currentFrequency === frequency) throw new Error("This plan and billing frequency are already in use.");
    const remote = await square.getSquareSubscription(sub.squareSubscriptionId!);
    if (!sub.squareCustomerId || remote.customer_id !== sub.squareCustomerId) throw new Error("Subscription ownership could not be verified.");
    if (remote.status !== "ACTIVE" || remote.canceled_date ||
        remote.actions?.some((a: any) => a.type === "SWAP_PLAN" || a.type === "CANCEL")) {
      throw new Error("Square already has a billing change or cancellation, or the subscription is not active. Refresh before retrying.");
    }
    const variation = variationForFrequency(target, frequency);
    await square.validateSquareBillingVariation(
      variation, frequency, frequency === "annual" ? target.priceAnnual! : target.priceMonthly,
      squareCadenceForPlan(target, frequency),
    );
    const result = await square.swapSquareSubscriptionPlan(sub.squareSubscriptionId!, variation);
    const action = result.actions?.find((a: any) => a.type === "SWAP_PLAN");
    if (!validDate(action?.effective_date)) throw new Error("Square did not confirm the upgrade date. Refresh billing before trying again.");
    await tx.insert(states).values({
      subscriptionId: sub.id, billingFrequency: currentFrequency,
      pendingPlanId: target.id, pendingFrequency: frequency, pendingEffectiveDate: action.effective_date,
      termsVersion: BILLING_TERMS_VERSION,
    }).onConflictDoUpdate({ target: states.subscriptionId, set: {
      pendingPlanId: target.id, pendingFrequency: frequency,
      pendingEffectiveDate: action.effective_date, termsVersion: BILLING_TERMS_VERSION,
    } });
    await tx.insert(membershipAuditLog).values({ subscriptionId: sub.id, customerId: sub.customerId,
      action: "upgrade_scheduled", staffUsername: actor,
      note: `${target.name}; ${frequency}; effective ${action.effective_date}; terms ${BILLING_TERMS_VERSION}; customer authorisation confirmed` });
    return { message: "The change is scheduled for the next renewal. Current benefits remain until the new plan is paid.", effectiveDate: action.effective_date };
  });
}

export async function scheduleMembershipCancellation(sub: BillingSubscription, actor: string) {
  if (!sub.squareSubscriptionId || sub.status === "cancelled") throw new Error("A current Square subscription is required. Use the reviewed migration process for Wix memberships.");
  return db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(14702, ${sub.id})`);
    const state = await billingState(sub.id, tx);
    const remote = await square.getSquareSubscription(sub.squareSubscriptionId!);
    if (!sub.squareCustomerId || remote.customer_id !== sub.squareCustomerId) throw new Error("Subscription ownership could not be verified.");
    const futurePrepaidRenewal = sub.source === "square_pos" && (state?.recurringStartDate ?? "") > today();
    if (!futurePrepaidRenewal && !cancellationAllowed(state?.commitmentEndDate ?? null, today(),
      state?.billingFrequency === "annual" && sub.status === "active" ? remote.charged_through_date ?? null : null)) {
      throw new Error(`The minimum term runs until ${state!.commitmentEndDate}. Cancellation is not yet available.`);
    }
    if (state?.pendingPlanId || remote.actions?.some((a: any) => a.type === "SWAP_PLAN")) throw new Error("An upgrade is already scheduled.");
    const result = remote.canceled_date ? remote : await square.cancelSquareSubscription(sub.squareSubscriptionId!);
    if (!validDate(result.canceled_date)) throw new Error("Square did not confirm the cancellation date. Refresh billing before retrying.");
    if (futurePrepaidRenewal && result.canceled_date > state!.recurringStartDate!)
      throw new Error("Square has not confirmed stopping billing before the first charge. Ask staff to review; prepaid access is unchanged.");
    const effectiveDate = futurePrepaidRenewal && (sub.prepaidUntilDate ?? "") > result.canceled_date
      ? sub.prepaidUntilDate! : result.canceled_date;
    await tx.insert(states).values({
      subscriptionId: sub.id, cancellationDate: effectiveDate,
      billingFrequency: sub.source.includes("annual") ? "annual" : "monthly",
    }).onConflictDoUpdate({ target: states.subscriptionId, set: { cancellationDate: effectiveDate,
      ...(futurePrepaidRenewal ? { commitmentStartDate: null, commitmentEndDate: null, termsVersion: null, recurringStartDate: null } : {}) } });
    if (futurePrepaidRenewal && result.status === "CANCELED")
      await tx.update(subscriptions).set({ squareSubscriptionId: null }).where(eq(subscriptions.id, sub.id));
    await tx.insert(membershipAuditLog).values({ subscriptionId: sub.id, customerId: sub.customerId,
      action: "cancellation_scheduled", staffUsername: actor, note: `Effective ${effectiveDate}` });
    return { message: "Cancellation is scheduled. Access continues through the paid billing period.", effectiveDate };
  });
}

export async function reverseScheduledMembershipCancellation(sub: BillingSubscription, actor: string) {
  if (!sub.squareSubscriptionId || sub.status !== "active") {
    throw new Error("An active Square subscription is required to keep this membership.");
  }
  return db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(14702, ${sub.id})`);
    const state = await billingState(sub.id, tx);
    const scheduledDate = state?.cancellationDate;
    if (!validDate(scheduledDate) || scheduledDate < today()) {
      throw new Error("There is no upcoming cancellation to reverse.");
    }
    if (state?.pendingPlanId) throw new Error("A plan change is also scheduled. Refresh billing and contact the club.");

    const remote = await square.getSquareSubscription(sub.squareSubscriptionId!);
    if (!sub.squareCustomerId || remote.customer_id !== sub.squareCustomerId) {
      throw new Error("Subscription ownership could not be verified.");
    }
    if (remote.status !== "ACTIVE") throw new Error("Square has already ended this subscription; contact the club.");

    // Recover safely if Square already removed the action but the local save did not complete.
    if (!remote.canceled_date && !remote.actions?.some((action: any) => action.type === "CANCEL")) {
      await tx.update(states).set({ cancellationDate: null }).where(eq(states.subscriptionId, sub.id));
      await tx.insert(membershipAuditLog).values({
        subscriptionId: sub.id, customerId: sub.customerId, action: "cancellation_reversed",
        staffUsername: actor, note: "Square already had no scheduled cancellation; local billing state reconciled",
      });
      return { message: "Your scheduled cancellation has been removed. Your billing schedule is unchanged, and no payment was taken today." };
    }

    const cancelAction = remote.actions?.find((action: any) =>
      action.type === "CANCEL" && action.effective_date === scheduledDate);
    if (remote.canceled_date !== scheduledDate || !cancelAction?.id ||
        !validDate(cancelAction.effective_date) || cancelAction.effective_date < today()) {
      throw new Error("Square's scheduled cancellation could not be safely verified. Contact the club before retrying.");
    }

    await square.deleteSquareSubscriptionAction(sub.squareSubscriptionId!, cancelAction.id);
    const confirmed = await square.getSquareSubscription(sub.squareSubscriptionId!);
    if (confirmed.status !== "ACTIVE" || confirmed.canceled_date ||
        confirmed.actions?.some((action: any) => action.type === "CANCEL")) {
      throw new Error("Square did not confirm removing the scheduled cancellation. Refresh billing before retrying.");
    }

    await tx.update(states).set({ cancellationDate: null }).where(eq(states.subscriptionId, sub.id));
    await tx.insert(membershipAuditLog).values({
      subscriptionId: sub.id, customerId: sub.customerId, action: "cancellation_reversed",
      staffUsername: actor, note: `Scheduled cancellation removed; existing billing dates retained through ${scheduledDate}`,
    });
    return { message: "Your scheduled cancellation has been removed. Your billing schedule is unchanged, and no payment was taken today." };
  });
}

export function registerMembershipBilling(app: Express, customerAuth: RequestHandler, staffAuth: RequestHandler, ownerAuth: RequestHandler, managerAuth: RequestHandler = ownerAuth) {
  app.post("/api/membership/enable-auto-renew", customerAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const parsed = EnableMembershipAutoRenewBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Supply valid recurring billing consent and fresh card storage verification." });
    const body = parsed.data;
    if (!["monthly", "annual"].includes(body.billingFrequency) || body.termsAccepted !== true ||
        typeof body.sourceId !== "string" || !body.sourceId.startsWith("cnon:") ||
        typeof body.verificationToken !== "string" || !body.verificationToken.trim()) {
      return res.status(400).json({ message: "Choose a billing frequency, accept recurring billing and authorise a fresh card for storage." });
    }
    try {
      const customerId = (req as any).customerId as number;
      const result = await db.transaction(async tx => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(14701, ${customerId})`);
        const sub = await storage.getLatestMembershipSubscriptionByCustomer(customerId);
        if (!sub || sub.source !== "square_pos" || sub.status !== "active" ||
            sub.squareSubscriptionId || !validDate(sub.prepaidUntilDate) || sub.prepaidUntilDate! <= today())
          throw new Error("An active prepaid till membership without automatic renewal is required.");
        await tx.execute(sql`SELECT pg_advisory_xact_lock(14702, ${sub.id})`);
        const state = await billingState(sub.id, tx);
        if (state?.pendingPlanId) throw new Error("Finish the pending membership plan change before enabling renewal.");
        const plan = await storage.getMembershipPlan(sub.planId);
        const customer = await storage.getCustomerById(customerId);
        if (!plan?.active || plan.hideFromSignup || !customer?.emailVerified || !sub.squareCustomerId)
          throw new Error("A verified customer and available membership plan are required.");
        if (minimumTermMonths(plan) && body.minimumTermAccepted !== true)
          throw new Error("Explicitly accept the 12-month minimum term starting at the first renewal.");
        const frequency: BillingFrequency = body.billingFrequency;
        const variation = variationForFrequency(plan, frequency);
        const locationId = square.getPublicLocationId();
        if (!locationId) throw new Error("Square location is not configured.");
        await square.validateSquareBillingVariation(
          variation, frequency, frequency === "annual" ? plan.priceAnnual! : plan.priceMonthly,
          squareCadenceForPlan(plan, frequency),
        );
        const firstCharge = sub.prepaidUntilDate!;
        const remoteSubs = await square.listSquareSubscriptionsForCustomer(sub.squareCustomerId);
        const live = remoteSubs.filter((r: any) => ["ACTIVE", "PENDING", "PAUSED"].includes(r.status));
        let remote = live.find((r: any) => r.start_date === firstCharge && r.plan_variation_id === variation && r.card_id);
        let recovered = false;
        if (remote) {
          // Recover a response lost after Square succeeded, without creating
          // another subscription or silently replacing its existing card.
          const card = await square.getSquareCard(remote.card_id);
          if (card?.customer_id !== sub.squareCustomerId) throw new Error("Card ownership mismatch.");
          recovered = true;
        } else {
          if (live.length) throw new Error("Square already has billing for this customer. Ask staff to review it before adding another renewal.");
          const hash = createHash("sha256").update(sub.id + ":" + body.sourceId).digest("hex");
          const card = await square.saveCardOnFile({ customerId: sub.squareCustomerId,
            sourceId: body.sourceId, verificationToken: body.verificationToken,
            cardholderName: customer.name, idempotencyKey: hash });
          if (!card?.id) throw new Error("Card could not be saved.");
          remote = await square.createSquareSubscription(sub.squareCustomerId, variation,
            locationId, card.id, firstCharge,
            createHash("sha256").update("prepaid-renewal:" + sub.id + ":" + firstCharge + ":" + frequency).digest("hex"));
        }
        if (!remote?.id || remote.customer_id !== sub.squareCustomerId || remote.start_date !== firstCharge)
          throw new Error("Square did not confirm the deferred renewal. Refresh billing before retrying.");
        await tx.update(subscriptions).set({ squareSubscriptionId: remote.id, termsAcceptedAt: new Date() }).where(eq(subscriptions.id, sub.id));
        const accepted = { billingFrequency: frequency, recurringStartDate: firstCharge,
          commitmentStartDate: firstCharge, commitmentEndDate: commitmentEnd(plan, firstCharge),
          termsVersion: BILLING_TERMS_VERSION, cancellationDate: null };
        await tx.insert(states).values({ subscriptionId: sub.id, ...accepted })
          .onConflictDoUpdate({ target: states.subscriptionId, set: accepted });
        await tx.insert(membershipAuditLog).values({ subscriptionId: sub.id, customerId,
          action: "auto_renew_authorised", staffUsername: "customer",
          note: "Customer authorised " + frequency + " renewal from " + firstCharge + "; prepaid access preserved." });
        return { message: recovered
          ? "Your existing Square renewal has been linked. No charge was taken and its card was not changed; use Manage card if needed."
          : "Automatic renewal is scheduled after your prepaid membership ends. No charge was taken today.", effectiveDate: firstCharge };
      });
      res.json(result);
    } catch (error: any) {
      res.status(409).json({ message: error.message || "Could not enable automatic renewal. Your prepaid access is unchanged." });
    }
  });
  app.post("/api/membership/payment-card", customerAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const parsed = ReplaceMembershipCardBody.safeParse(req.body);
    if (!parsed.success || parsed.data.authorised !== true ||
        !parsed.data.sourceId.startsWith("cnon:") || !parsed.data.verificationToken.trim()) {
      res.status(400).json({ message: "Authorise a new card using the secure card form before retrying." }); return;
    }
    try {
      const sub = await storage.getLatestMembershipSubscriptionByCustomer((req as any).customerId);
      if (!sub?.squareSubscriptionId || !sub.squareCustomerId) {
        res.status(409).json({ message: "This membership does not support card replacement. Please contact the club." }); return;
      }
      await db.transaction(async tx => {
        // Same lock as upgrades/cancellations; pending upgrades remain untouched.
        await tx.execute(sql`SELECT pg_advisory_xact_lock(14702, ${sub.id})`);
        const remote = await square.getSquareSubscription(sub.squareSubscriptionId!);
        if (!replaceable(sub, remote) || !Number.isInteger(remote.version)) {
          throw new Error("Subscription ownership or status could not be verified.");
        }
        const { sourceId, verificationToken } = parsed.data;
        const card = await square.saveCardOnFile({
          customerId: sub.squareCustomerId!, sourceId, verificationToken,
          // A network retry with the same token must not create another card.
          idempotencyKey: createHash("sha256").update(`${sub.id}:${sourceId}`).digest("hex"),
        });
        if (!card?.id || card.customer_id !== sub.squareCustomerId || card.enabled === false) {
          throw new Error("Square did not confirm the replacement card.");
        }
        const updated = await square.updateSquareSubscriptionCard(remote.id, card.id, remote.version);
        if (updated?.id !== remote.id || updated?.card_id !== card.id) {
          throw new Error("Square did not confirm the subscription update.");
        }
      });
      res.json({ message: "Your membership payment card has been updated. Your renewal date, minimum term and scheduled plan changes are unchanged. No payment was taken." });
    } catch (error) {
      // Do not echo provider payloads or card/token details to clients or logs.
      const declined = error instanceof square.SquareError &&
        ["CARD_DECLINED", "VERIFY_CVV_FAILURE", "VERIFY_AVS_FAILURE", "CARD_EXPIRED", "GENERIC_DECLINE", "CARD_TOKEN_EXPIRED", "INVALID_CARD", "CARD_NOT_SUPPORTED", "VERIFICATION_REQUIRED", "CARD_DECLINED_VERIFICATION_REQUIRED"].includes(error.code);
      res.status(declined ? 422 : 409).json({ message: declined
        ? "Square could not authorise this card. Check the details or try another card. Your existing subscription is unchanged."
        : "We could not confirm the card update. Refresh your billing details before retrying. No payment was taken." });
    }
  });
  app.get("/api/membership/billing", customerAuth, async (req, res) => {
    try {
      const sub = await storage.getLatestMembershipSubscriptionByCustomer((req as any).customerId);
      res.setHeader("Cache-Control", "no-store");
      res.json(await membershipBillingDetails(sub));
    } catch {
      res.status(503).json({ message: "Unable to load billing from Square. Please retry; no payments have been changed." });
    }
  });

  app.post("/api/membership/reactivate", customerAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const parsed = ReactivateMembershipBody.safeParse(req.body);
    if (!parsed.success || parsed.data.termsAccepted !== true ||
        !parsed.data.sourceId.startsWith("cnon:") || !parsed.data.verificationToken.trim()) {
      res.status(400).json({ message: "Accept the recurring membership terms and authorise a card before reactivating." });
      return;
    }
    const body = parsed.data;
    const customerId = (req as any).customerId as number;
    let pendingSubscriptionId: number | null = null;
    let squareCustomerId: string | null = null;
    let squareSubscriptionId: string | null = null;
    try {
      const customer = await storage.getCustomerById(customerId);
      if (!customer?.emailVerified) throw new Error("Verify your email before reactivating membership.");
      if (!square.isConfigured()) throw new Error("Square recurring billing is not configured.");
      const locationId = square.getPublicLocationId();
      if (!locationId) throw new Error("Square payment location is not configured.");

      const offer = await db.transaction(async tx => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(14701, ${customerId})`);
        const existing = await storage.getLatestMembershipSubscriptionByCustomer(customerId);
        if (!existing || existing.status !== "cancelled" || existing.source === "wix_import") {
          throw new Error("This membership cannot be reactivated. Choose a current plan or contact the club.");
        }
        const details = await membershipBillingDetails(existing);
        const reactivation = details.reactivation;
        if (!reactivation || reactivation.planId !== body.planId || reactivation.frequency !== body.billingFrequency) {
          throw new Error("The reactivation period has ended or this offer changed. Refresh your membership details.");
        }
        if (reactivation.minimumTermMonths > 0 && body.minimumTermAccepted !== true) {
          throw new Error(`Please accept the ${reactivation.minimumTermMonths}-month minimum term to reactivate.`);
        }
        const plan = await storage.getMembershipPlan(reactivation.planId);
        if (!plan?.active || plan.hideFromSignup) throw new Error("This membership is no longer available to reactivate.");
        const variation = variationForFrequency(plan, reactivation.frequency);
        await square.validateSquareBillingVariation(
          variation, reactivation.frequency, reactivation.pricePence,
          squareCadenceForPlan(plan, reactivation.frequency),
        );

        squareCustomerId = existing.squareCustomerId ?? null;
        if (!squareCustomerId) {
          const found = await square.findSquareCustomerByEmail(customer.email);
          const squareCustomer = found ?? await square.createSquareCustomer(customer.name, customer.email, customer.phone || undefined);
          squareCustomerId = squareCustomer?.id ?? null;
        }
        if (!squareCustomerId) throw new Error("Could not verify your Square customer profile.");

        const remoteSubscriptions = await square.listSquareSubscriptionsForCustomer(squareCustomerId);
        const membershipPlans = await storage.getMembershipPlans();
        const aliases = await tx.select().from(membershipPlanVariationAliases);
        const knownVariations = new Set([
          ...membershipPlans.flatMap(p => [p.squarePlanVariationId, p.squarePlanVariationIdAlt]).filter(Boolean),
          ...aliases.map(alias => alias.squareVariationId),
        ]);
        if (remoteSubscriptions.some((remote: any) =>
          ["ACTIVE", "PENDING", "PAUSED"].includes(remote.status) && knownVariations.has(remote.plan_variation_id))) {
          throw new Error("Square already has an active membership for this account. Refresh your membership details or contact the club.");
        }
        const localSubscriptions = await tx.select().from(subscriptions).where(eq(subscriptions.customerId, customerId));
        if (localSubscriptions.some(local => local.id !== existing.id &&
            ["active", "pending", "pending_payment", "pending_start", "held", "frozen"].includes(local.status))) {
          throw new Error("Another membership is already active or being processed for this account.");
        }

        const todayDate = today();
        const newSubscription = await tx.insert(subscriptions).values({
          customerId,
          planId: plan.id,
          status: "pending",
          currentPeriodStart: todayDate,
          currentPeriodEnd: billingPeriodEnd(plan, reactivation.frequency, todayDate),
          hoursUsedThisPeriod: 0,
          guestPassesUsed: 0,
          source: "app_reactivation",
          termsAcceptedAt: new Date(),
          squareCustomerId,
        }).returning();
        const created = newSubscription[0];
        if (!created) throw new Error("Could not prepare the membership reactivation.");
        pendingSubscriptionId = created.id;
        await tx.insert(states).values({ subscriptionId: created.id, billingFrequency: reactivation.frequency })
          .onConflictDoNothing({ target: states.subscriptionId });
        await tx.update(states).set({
          commitmentStartDate: todayDate,
          commitmentEndDate: commitmentEnd(plan, todayDate),
          termsVersion: BILLING_TERMS_VERSION,
        }).where(eq(states.subscriptionId, created.id));
        await tx.insert(membershipAuditLog).values({
          subscriptionId: created.id,
          customerId,
          action: "reactivation_started",
          staffUsername: "customer",
          note: `Plan ${plan.name}; ${reactivation.frequency}; first billing starts ${todayDate}; reactivated from membership ${existing.id}`,
        });
        return { plan, variation, frequency: reactivation.frequency, todayDate, previousId: existing.id };
      });

      const card = await square.saveCardOnFile({
        customerId: squareCustomerId!,
        sourceId: body.sourceId,
        verificationToken: body.verificationToken,
        cardholderName: customer.name,
        idempotencyKey: createHash("sha256").update(`membership-reactivation-card:${customerId}:${body.sourceId}`).digest("hex").slice(0, 45),
      });
      if (!card?.id || card.customer_id !== squareCustomerId) throw new Error("Square could not verify the authorised payment card.");

      let createdSquareSubscription: any;
      try {
        createdSquareSubscription = await square.createSquareSubscription(
          squareCustomerId!,
          offer.variation,
          locationId,
          card.id,
          offer.todayDate,
          createHash("sha256").update(`membership-reactivation:${offer.previousId}:${offer.todayDate}:${offer.variation}:${body.sourceId}`).digest("hex").slice(0, 45),
        );
      } catch (error) {
        // A timed-out create can still have succeeded at Square. Reconcile by
        // the exact customer, variation and start date before allowing retry.
        const remoteSubscriptions = await square.listSquareSubscriptionsForCustomer(squareCustomerId!).catch(() => null);
        createdSquareSubscription = remoteSubscriptions?.find((remote: any) =>
          ["ACTIVE", "PENDING", "PAUSED"].includes(remote.status) &&
          remote.plan_variation_id === offer.variation &&
          remote.start_date === offer.todayDate &&
          remote.customer_id === squareCustomerId) ?? null;
        if (!createdSquareSubscription) throw error;
      }
      if (!createdSquareSubscription?.id || createdSquareSubscription.customer_id !== squareCustomerId ||
          createdSquareSubscription.plan_variation_id !== offer.variation ||
          createdSquareSubscription.start_date !== offer.todayDate) {
        throw new Error("Square did not confirm the new recurring membership. Please contact the club before retrying.");
      }
      squareSubscriptionId = createdSquareSubscription.id;
      await db.update(subscriptions).set({ squareSubscriptionId }).where(eq(subscriptions.id, pendingSubscriptionId!));
      res.status(201).json({
        message: "Reactivation submitted. Square will confirm the first payment; membership benefits resume after payment succeeds.",
        effectiveDate: offer.todayDate,
      });
    } catch (error: any) {
      if (pendingSubscriptionId && !squareSubscriptionId) {
        const remoteSubscriptions = squareCustomerId
          ? await square.listSquareSubscriptionsForCustomer(squareCustomerId).catch(() => null)
          : null;
        const uncertain = remoteSubscriptions?.some((remote: any) =>
          ["ACTIVE", "PENDING", "PAUSED"].includes(remote.status) && remote.customer_id === squareCustomerId);
        if (!uncertain) {
          await db.transaction(async tx => {
            await tx.delete(states).where(eq(states.subscriptionId, pendingSubscriptionId!));
            await tx.delete(membershipAuditLog).where(eq(membershipAuditLog.subscriptionId, pendingSubscriptionId!));
            await tx.delete(subscriptions).where(eq(subscriptions.id, pendingSubscriptionId!));
          }).catch(() => {});
        }
      }
      if (!res.headersSent) res.status(409).json({
        message: error.message || "Could not reactivate membership. Refresh your membership details before retrying.",
      });
    }
  });

  app.post("/api/membership/change-plan", customerAuth, async (req, res) => {
    try {
      const { planId, billingFrequency, termsAccepted } = req.body ?? {};
      if (!Number.isInteger(planId) || !["monthly", "annual"].includes(billingFrequency) || termsAccepted !== true) {
        res.status(400).json({ message: "Choose a plan, billing frequency and accept its terms." }); return;
      }
      const sub = await storage.getLatestMembershipSubscriptionByCustomer((req as any).customerId);
      if (!sub?.squareSubscriptionId || sub.status !== "active") {
        res.status(409).json({ message: "An active Square subscription is required. Contact the club about migration." }); return;
      }
      res.json(await scheduleMembershipChange(sub, planId, billingFrequency, "customer"));
    } catch (error: any) {
      if (!res.headersSent) res.status(409).json({ message: error.message || "Could not schedule the plan change." });
    }
  });

  app.post("/api/membership/cancel", customerAuth, async (req, res) => {
    try {
      if (req.body?.confirmed !== true) { res.status(400).json({ message: "Please confirm cancellation." }); return; }
      const sub = await storage.getLatestMembershipSubscriptionByCustomer((req as any).customerId);
      if (!sub?.squareSubscriptionId) throw new Error("Contact the club to manage this membership.");
      res.json(await scheduleMembershipCancellation(sub, "customer"));
    } catch (error: any) {
      if (!res.headersSent) res.status(409).json({ message: error.message || "Could not cancel membership." });
    }
  });

  app.post("/api/membership/undo-cancel", customerAuth, async (req, res) => {
    try {
      if (req.body?.confirmed !== true) {
        res.status(400).json({ message: "Confirm that you want to keep your recurring membership." }); return;
      }
      const sub = await storage.getLatestMembershipSubscriptionByCustomer((req as any).customerId);
      if (!sub) throw new Error("No membership was found.");
      res.json(await reverseScheduledMembershipCancellation(sub, "customer"));
    } catch (error: any) {
      if (!res.headersSent) res.status(409).json({ message: error.message || "Could not remove the scheduled cancellation." });
    }
  });

  app.get("/api/staff/membership/subscriptions/:id/billing", staffAuth, managerAuth, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) { res.status(400).json({ message: "Invalid membership ID." }); return; }
    try {
      const sub = await storage.getMembershipSubscription(id);
      if (!sub) { res.status(404).json({ message: "Membership not found." }); return; }
      res.setHeader("Cache-Control", "no-store");
      res.json(await membershipBillingDetails(sub));
    } catch {
      res.status(503).json({ message: "Billing could not be verified with Square. No payments or memberships were changed." });
    }
  });

  for (const operation of ["change-plan", "cancel"] as const) {
    app.post(`/api/staff/membership/subscriptions/:id/${operation}`, staffAuth, managerAuth, async (req, res) => {
      const id = Number(req.params.id);
      if (!Number.isSafeInteger(id) || id < 1) { res.status(400).json({ message: "Invalid membership ID." }); return; }
      const input = req.body ?? {};
      if (operation === "change-plan" ? (!Number.isInteger(input.planId) || input.planId < 1 ||
          !["monthly", "annual"].includes(input.billingFrequency) || input.termsAccepted !== true || input.customerAuthorised !== true)
          : input.confirmed !== true) {
        res.status(400).json({ message: operation === "cancel" ? "Confirm the cancellation." : "Choose a plan and confirm the customer's authorisation and acceptance of its terms." }); return;
      }
      try {
        const sub = await storage.getMembershipSubscription(id);
        if (!sub) { res.status(404).json({ message: "Membership not found." }); return; }
        const actor = (req as any).staffUsername ?? (req as any).staffUser?.username ?? "staff";
        res.json(operation === "change-plan"
          ? await scheduleMembershipChange(sub, input.planId, input.billingFrequency, actor)
          : await scheduleMembershipCancellation(sub, actor));
      } catch (error: any) {
        res.status(409).json({ message: error.message || "Square did not confirm this change. Refresh billing before retrying." });
      }
    });
  }

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
