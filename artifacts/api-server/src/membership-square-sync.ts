import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  customers, membershipPlans, membershipSubscriptions as subs, membershipBillingStates as states,
  membershipPurchaseRecords as purchases, membershipSquareEvents as events,
  membershipAuditLog as audit, membershipPlanVariationAliases as aliases,
} from "@workspace/db/schema";
import { db, storage } from "./storage";
import * as square from "./square";
import { addCalendarMonths, validDate, membershipBusinessDate, isPaidMembershipPlan } from "./membership-billing-policy";
import { alignBillingStart, billingState, reconcileScheduledMembership, syncPaidMembershipGroups, syncSquareMembershipGroupsForCustomer } from "./membership-billing";
import type { Express, RequestHandler } from "express";

export const membershipDay = membershipBusinessDate;
const later = (...dates: (string | null | undefined)[]) => dates.filter((d): d is string => validDate(d)).sort().at(-1);
function instant(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}
const invoicePaidAt = (invoice: any, event?: any) =>
  (invoice.payment_requests ?? []).map((p: any) => instant(p.completed_at)).filter(Boolean).sort((a: Date, b: Date) => a.getTime() - b.getTime())[0]
    ?? (event?.type === "invoice.payment_made" ? instant(event.created_at) : null);

async function mappedPlan(variation: string) {
  const plans = await storage.getMembershipPlans();
  let plan = plans.find(p => p.squarePlanVariationId === variation || p.squarePlanVariationIdAlt === variation);
  if (!plan) {
    const [alias] = await db.select().from(aliases).where(eq(aliases.squareVariationId, variation));
    plan = alias ? plans.find(p => p.id === alias.planId) : undefined;
  }
  if (!plan) return null;
  const frequency = variation === plan.squarePlanVariationId ? "monthly"
    : variation === plan.squarePlanVariationIdAlt ? "annual" : await square.getSquareBillingFrequency(variation);
  return { plan, frequency };
}

// Both signed webhook routes call this processor. The unique invoice key and
// transactional event key prevent duplicate renewal/failure mutations.
export async function processSquareMembershipEvent(event: any,
  failureNotice?: (customerId: number, attempts: number) => Promise<unknown>) {
  const type: string = event?.type ?? "";
  let invoice = event?.data?.object?.invoice;
  const remoteEvent = event?.data?.object?.subscription;
  if (type.startsWith("subscription.")) {
    if (!remoteEvent?.id) throw new Error("Square subscription ID missing");
    const remote = await square.getSquareSubscription(remoteEvent.id);
    let [local] = await db.select().from(subs).where(eq(subs.squareSubscriptionId, remote.id));
    if (!local && type === "subscription.created" && remote.customer_id) {
      [local] = await db.select().from(subs).where(and(eq(subs.squareCustomerId, remote.customer_id), isNull(subs.squareSubscriptionId),
        sql`(${subs.status} IN ('pending', 'pending_payment', 'pending_start', 'pending_upgrade') OR (${subs.migrationToken} IS NOT NULL AND ${subs.migrationCompletedAt} IS NULL))`));
      if (local && (["pending", "pending_payment", "pending_start", "pending_upgrade"].includes(local.status) || local.migrationToken)) {
        const match = await mappedPlan(remote.plan_variation_id);
        const state = await billingState(local.id);
        if (!match || (match.plan.id !== local.planId && match.plan.id !== state?.pendingPlanId)) return true;
        await storage.updateMembershipSubscription(local.id, { squareSubscriptionId: remote.id });
      } else local = undefined as any;
    }
    if (local) {
      if (local.squareCustomerId !== remote.customer_id) throw new Error("Square subscription ownership mismatch");
      const plan = await storage.getMembershipPlan(local.planId);
      const state = await billingState(local.id);
      // A prepaid year is not shortened when a future renewal mandate ends.
      const end = later(local.prepaidUntilDate, remote.charged_through_date, local.currentPeriodEnd);
      const futurePaid = !!end && end > membershipDay();
      const status = remote.status === "PAUSED" ? "paused"
        : remote.status === "CANCELED" ? (futurePaid && local.status === "active" ? "active" : "cancelled")
        : remote.status === "PENDING" && local.status !== "active" && local.status !== "pending_upgrade" ? "pending" : local.status;
      await storage.updateMembershipSubscription(local.id, {
        status, ...(end ? { currentPeriodEnd: end } : {}), squareGroupSyncPending: true,
        ...(remote.status === "CANCELED" ? { cancelledAt: new Date() } : {}),
        ...(remote.status === "CANCELED" && local.source === "square_pos" ? { squareSubscriptionId: null } : {}),
      });
      if (remote.status === "CANCELED") {
        await db.insert(states).values({ subscriptionId: local.id, cancellationDate: end ?? membershipDay() })
          .onConflictDoUpdate({ target: states.subscriptionId, set: { cancellationDate: end ?? membershipDay() } });
      }
      if (plan && state?.termsVersion && !state.recurringStartDate && ["pending", "pending_start", "pending_payment", "pending_upgrade"].includes(local.status))
        await alignBillingStart(local.id, plan, remote.start_date);
      await syncPaidMembershipGroups(local.id);
    } else await syncUnlinkedSquareGroups(remote.customer_id);
    return true;
  }
  if (!["invoice.payment_made", "invoice.scheduled_charge_failed", "invoice.payment_failed"].includes(type) || !invoice?.subscription_id) return false;
  if (!invoice.id) throw new Error("Square invoice ID missing");
  const remote = await square.getSquareSubscription(invoice.subscription_id);
  const [local] = await db.select().from(subs).where(eq(subs.squareSubscriptionId, remote.id));
  if (!local) {
    await processUnlinkedInvoice(event, invoice, remote, failureNotice);
    return true;
  }
  if (local.squareCustomerId !== remote.customer_id ||
      (invoice.primary_recipient?.customer_id && invoice.primary_recipient.customer_id !== remote.customer_id))
    throw new Error("Square invoice ownership mismatch");
  if (type !== "invoice.payment_made") {
    if ((await square.getSquareInvoice(invoice.id))?.status === "PAID") return true;
    const key = "failure:" + invoice.id + ":" + (invoice.updated_at ?? event.created_at ?? event.id);
    if (!invoice.updated_at && !event.created_at && !event.id) throw new Error("Failure event identity missing");
    let count: number | null = null;
    await db.transaction(async tx => {
      const inserted = await tx.insert(events).values({ id: key, eventType: type }).onConflictDoNothing().returning();
      if (!inserted.length) return;
      const [fresh] = await tx.select().from(subs).where(eq(subs.id, local.id)).for("update");
      if (fresh.status === "cancelled") return;
      count = fresh.failedPaymentAttempts + 1;
      await tx.update(subs).set({
        failedPaymentAttempts: count, ...(count >= 3 ? { status: "frozen", squareGroupSyncPending: true } : {}),
      }).where(eq(subs.id, local.id));
    });
    if (count !== null && failureNotice) await failureNotice(local.customerId, count);
    await syncPendingGroup(local.id);
    return true;
  }
  invoice = await square.getSquareInvoice(invoice.id);
  if (invoice?.status !== "PAID" || invoice.subscription_id !== remote.id) return true;
  const match = await mappedPlan(remote.plan_variation_id);
  if (!match) throw new Error("Paid Square membership variation is not mapped to a plan");
  if (!validDate(remote.charged_through_date)) throw new Error("Square has not supplied a valid paid-through date");
  const paidAt = invoicePaidAt(invoice, event);
  await reconcileScheduledMembership(remote, true);
  await db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(14702, ${local.id})`);
    const key = "invoice:" + invoice.id;
    const inserted = await tx.insert(events).values({ id: key, eventType: type }).onConflictDoNothing().returning();
    if (!inserted.length) return;
    const [fresh] = await tx.select().from(subs).where(eq(subs.id, local.id)).for("update");
    const firstActivation = ["pending", "pending_payment", "pending_start", "pending_upgrade"].includes(fresh.status) && !fresh.firstPaidAt;
    const periodStart = paidAt ? membershipDay(paidAt) : fresh.currentPeriodStart;
    await tx.insert(purchases).values({
      id: key, squareCustomerId: remote.customer_id, squareSubscriptionId: remote.id,
      subscriptionId: local.id, customerId: local.customerId, planId: match.plan.id,
      source: "square_subscription", frequency: match.frequency,
      amountPence: Number(invoice.payment_requests?.[0]?.computed_amount_money?.amount ?? 0),
      purchasedAt: paidAt, periodStart, periodEnd: remote.charged_through_date, status: "applied",
      months: match.frequency === "annual" ? 12 : 1,
    }).onConflictDoNothing();
    const isCurrent = remote.charged_through_date > membershipDay() && remote.charged_through_date >= (fresh.currentPeriodEnd ?? "");
    if (!isCurrent) return; // Late delivery of an older invoice must not roll dates/tiers back.
    if (isPaidMembershipPlan(match.plan)) {
      const vipRows = await tx.select({ id: subs.id }).from(subs)
        .innerJoin(membershipPlans, eq(subs.planId, membershipPlans.id))
        .where(and(eq(subs.customerId, fresh.customerId), eq(subs.status, "active"),
          eq(membershipPlans.tier, "vip"))).for("update");
      for (const vip of vipRows) {
        if (vip.id === fresh.id) continue;
        await tx.update(subs).set({ status: "cancelled", cancelledAt: new Date(),
          squareGroupSyncPending: true }).where(eq(subs.id, vip.id));
        await tx.insert(audit).values({ subscriptionId: vip.id, customerId: fresh.customerId,
          action: "vip_upgraded", staffUsername: "square-webhook",
          note: `VIP replaced by ${match.plan.name} after confirmed payment for membership #${fresh.id}.` });
      }
    }
    await tx.update(subs).set({
      planId: match.plan.id, status: "active", failedPaymentAttempts: 0,
      currentPeriodStart: periodStart, currentPeriodEnd: remote.charged_through_date,
      firstPaidAt: firstActivation ? paidAt : fresh.firstPaidAt,
      lastPaidAt: paidAt && (!fresh.lastPaidAt || paidAt > fresh.lastPaidAt) ? paidAt : fresh.lastPaidAt,
      squareGroupSyncPending: true,
      ...(fresh.source === "square_pos" && remote.charged_through_date > (fresh.prepaidUntilDate ?? "") ? { source: "square_pos_renewed" } : {}),
      ...(fresh.migrationToken && !fresh.migrationCompletedAt ? { migrationCompletedAt: new Date(), source: "wix_migrated" } : {}),
    }).where(eq(subs.id, fresh.id));
    await tx.update(purchases).set({ subscriptionId: fresh.id, customerId: fresh.customerId, status: "applied" })
      .where(eq(purchases.id, key));
    await tx.insert(states).values({ subscriptionId: fresh.id, billingFrequency: match.frequency })
      .onConflictDoUpdate({ target: states.subscriptionId, set: { billingFrequency: match.frequency } });
    // Paid direct Square plan changes are reflected, without inventing new
    // minimum-term consent or waiting for another local upgrade request.
    if (fresh.planId !== match.plan.id) {
      await tx.insert(audit).values({ subscriptionId: fresh.id, customerId: fresh.customerId, staffUsername: "square-webhook",
        action: "square_paid_plan_changed", note: "Plan updated from a confirmed paid Square invoice." });
      await tx.update(states).set({ pendingPlanId: null, pendingFrequency: null, pendingEffectiveDate: null })
        .where(eq(states.subscriptionId, fresh.id));
    }
  });
  await syncPendingGroup(local.id);
  return true;
}

async function syncPendingGroup(id: number) {
  const [local] = await db.select().from(subs).where(eq(subs.id, id));
  if (local?.squareGroupSyncPending) await syncPaidMembershipGroups(id);
}

async function processUnlinkedInvoice(event: any, incoming: any, remote: any, failureNotice?: (id: number, attempts: number) => Promise<unknown>) {
  const match = await mappedPlan(remote.plan_variation_id);
  if (!match) return; // Not every Square subscription is a club membership.
  const invoice = await square.getSquareInvoice(incoming.id);
  if (invoice?.subscription_id !== remote.id) throw new Error("Invoice subscription mismatch");
  if (event.type === "invoice.payment_made") {
    if (invoice.status !== "PAID" || !validDate(remote.charged_through_date)) return;
    const paidAt = invoicePaidAt(invoice, event);
    await db.transaction(async tx => {
      await tx.insert(purchases).values({
        id: "invoice:" + invoice.id, squareCustomerId: remote.customer_id, squareSubscriptionId: remote.id,
        planId: match.plan.id, source: "square_subscription", frequency: match.frequency,
        months: match.frequency === "annual" ? 12 : 1,
        amountPence: Number(invoice.payment_requests?.[0]?.computed_amount_money?.amount ?? 0),
        purchasedAt: paidAt, periodStart: paidAt ? membershipDay(paidAt) : null,
        periodEnd: remote.charged_through_date, status: remote.charged_through_date > membershipDay() ? "unclaimed" : "expired",
      }).onConflictDoNothing();
      if (remote.charged_through_date > membershipDay()) await tx.update(purchases).set({ status: "resolved" })
        .where(and(eq(purchases.squareSubscriptionId, remote.id), eq(purchases.source, "square_failure")));
    });
  } else if (invoice.status !== "PAID") {
    const at = incoming.updated_at ?? event.created_at ?? event.id;
    if (!at) throw new Error("Failure identity missing");
    const [inserted] = await db.insert(purchases).values({
      id: "failure:" + invoice.id + ":" + at, squareCustomerId: remote.customer_id, squareSubscriptionId: remote.id,
      planId: match.plan.id, source: "square_failure", frequency: match.frequency, amountPence: 0,
      purchasedAt: instant(event.created_at), status: "failed",
    }).onConflictDoNothing().returning();
    const failures = await db.select().from(purchases).where(and(eq(purchases.squareSubscriptionId, remote.id),
      eq(purchases.source, "square_failure"), eq(purchases.status, "failed")));
    if (failures.length >= 3) await db.update(purchases).set({ status: "frozen" })
      .where(and(eq(purchases.squareSubscriptionId, remote.id), eq(purchases.source, "square_subscription")));
    const customer = inserted ? await storage.getCustomerBySquareCustomerId(remote.customer_id) : null;
    if (customer?.emailVerified && failureNotice) await failureNotice(customer.id, failures.length);
  }
  await syncUnlinkedSquareGroups(remote.customer_id);
}

export function prepaidCoverage<T extends { purchasedAt: Date | null; months: number; id: string }>(rows: T[]) {
  let end: string | undefined;
  return rows.filter(r => r.purchasedAt).sort((a, b) => a.purchasedAt!.getTime() - b.purchasedAt!.getTime() || a.id.localeCompare(b.id))
    .map(r => {
      const start = later(membershipDay(r.purchasedAt!), end)!;
      end = addCalendarMonths(start, r.months);
      return { ...r, periodStart: start, periodEnd: end };
    });
}

async function syncUnlinkedSquareGroups(squareCustomerId: string) {
  if (!squareCustomerId) return;
  const rows = await db.select().from(purchases).where(and(eq(purchases.squareCustomerId, squareCustomerId),
    isNull(purchases.customerId), inArray(purchases.status, ["unclaimed", "frozen"])));
  const pos = prepaidCoverage(rows.filter(r => r.source === "square_pos")).find(r => r.periodStart <= membershipDay() && r.periodEnd > membershipDay());
  let planId: number | null = pos?.planId ?? null;
  let frequency: string | null = pos?.frequency ?? null;
  if (!pos) {
    const paid = rows.filter(r => r.source === "square_subscription")
      .sort((a, b) => (b.periodEnd ?? "").localeCompare(a.periodEnd ?? ""))[0];
    frequency = paid?.frequency ?? null;
    if (paid?.squareSubscriptionId && paid.status !== "frozen") {
      const remote = await square.getSquareSubscription(paid.squareSubscriptionId);
      if (remote.customer_id !== squareCustomerId) throw new Error("Subscription ownership mismatch");
      if (remote.status === "ACTIVE" || (remote.status === "CANCELED" && (paid.periodEnd ?? "") > membershipDay())) planId = paid.planId;
    }
  }
  // Unrelated Square payments must never remove a customer's existing groups.
  if (rows.length) await syncSquareMembershipGroupsForCustomer(squareCustomerId, planId, undefined, frequency);
}

async function hasLiveSquareMembership(squareCustomerId: string) {
  const remote = await square.listSquareSubscriptionsForCustomer(squareCustomerId);
  for (const sub of remote) if (["ACTIVE", "PENDING", "PAUSED"].includes(sub.status) && await mappedPlan(sub.plan_variation_id)) return true;
  return false;
}

export async function claimPrepaidPurchases(customerId: number, squareCustomerId: string) {
  const customer = await storage.getCustomerById(customerId);
  if (!customer?.emailVerified) return;
  const receipts = await db.select().from(purchases).where(and(
    eq(purchases.squareCustomerId, squareCustomerId), eq(purchases.source, "square_pos"),
    inArray(purchases.status, ["unclaimed", "needs_review"]),
  )).orderBy(purchases.purchasedAt, purchases.id);
  if (!receipts.length) return;
  if (await hasLiveSquareMembership(squareCustomerId)) {
    await db.update(purchases).set({ status: "needs_review", customerId,
      reviewReason: "Automatic Square membership billing already exists. Review it before applying till time to avoid overlapping payments." })
      .where(inArray(purchases.id, receipts.map(r => r.id)));
    return;
  }
  const syncIds = new Set<number>();
  for (const receipt of receipts) {
    if (!receipt.purchasedAt) continue; // No invented purchase date.
    let id: number | null = null;
    await db.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(14701, ${customerId})`);
      const [fresh] = await tx.select().from(purchases).where(eq(purchases.id, receipt.id)).for("update");
      if (!fresh || !["unclaimed", "needs_review"].includes(fresh.status)) return;
      const existing = await storage.getLatestMembershipSubscriptionByCustomer(customerId);
      if (existing?.squareSubscriptionId && existing.status !== "cancelled") {
        await tx.update(purchases).set({ status: "needs_review", customerId,
          reviewReason: "An automatic Square subscription already exists. Review its renewal before applying prepaid till time to avoid overlapping billing." }).where(eq(purchases.id, fresh.id));
        return;
      }
      if (existing && !["square_pos", "square_sync", "square_group_sync"].includes(existing.source) && !["cancelled", "expired"].includes(existing.status)) {
        await tx.update(purchases).set({ status: "needs_review", customerId,
          reviewReason: "This customer has another manual or legacy membership. Staff must review the existing entitlement first." }).where(eq(purchases.id, fresh.id));
        return;
      }
      const history = await tx.select().from(purchases).where(and(eq(purchases.squareCustomerId, squareCustomerId),
        eq(purchases.source, "square_pos"), inArray(purchases.status, ["unclaimed", "applied", "needs_review"])));
      const coverage = prepaidCoverage(history);
      const current = coverage.filter(r => r.periodStart <= membershipDay()).at(-1);
      if (!current) throw new Error("No completed prepaid membership period was found.");
      const next = coverage.find(r => r.periodStart > membershipDay() && r.planId !== current.planId);
      const start = current.periodStart, end = next?.periodStart ?? coverage.at(-1)!.periodEnd;
      const prepaidEnd = coverage.at(-1)!.periodEnd;
      const lastPaid = coverage.at(-1)!.purchasedAt!;
      if (existing) {
        id = existing.id;
        await tx.update(subs).set({
          source: "square_pos", squareCustomerId, squareSubscriptionId: null,
          planId: current.planId, status: end > membershipDay() ? "active" : "cancelled",
          currentPeriodStart: start, currentPeriodEnd: end,
          prepaidUntilDate: prepaidEnd, firstPaidAt: existing.firstPaidAt && coverage[0].purchasedAt! < existing.firstPaidAt ? coverage[0].purchasedAt : existing.firstPaidAt,
          lastPaidAt: existing.lastPaidAt && existing.lastPaidAt > lastPaid ? existing.lastPaidAt : lastPaid,
          cancelledAt: null, squareGroupSyncPending: true,
        }).where(eq(subs.id, existing.id));
      } else {
        const [created] = await tx.insert(subs).values({
          customerId, planId: current.planId, source: "square_pos", squareCustomerId,
          status: end > membershipDay() ? "active" : "cancelled",
          currentPeriodStart: start, currentPeriodEnd: end, prepaidUntilDate: prepaidEnd,
          firstPaidAt: coverage[0].purchasedAt, lastPaidAt: lastPaid, squareGroupSyncPending: true,
        }).returning();
        id = created.id;
      }
      const pending = { billingFrequency: "annual", cancellationDate: null, pendingPlanId: next?.planId ?? null,
        pendingFrequency: next ? "annual" : null, pendingEffectiveDate: next?.periodStart ?? null };
      await tx.insert(states).values({ subscriptionId: id!, ...pending })
        .onConflictDoUpdate({ target: states.subscriptionId, set: pending });
      for (const row of coverage) await tx.update(purchases).set({ subscriptionId: id!, customerId,
        periodStart: row.periodStart, periodEnd: row.periodEnd, status: "applied", reviewReason: null }).where(eq(purchases.id, row.id));
      await tx.insert(audit).values({ subscriptionId: id!, customerId, staffUsername: "square-webhook", action: "pos_membership_paid",
        note: "Confirmed prepaid till purchase: " + fresh.months + " months; paid through " + end + ". No recurring charge created." });
    });
    if (id) syncIds.add(id);
  }
  for (const id of syncIds) await syncPendingGroup(id);
}

export async function processMembershipPosPayment(payment: any) {
  if (payment?.status !== "COMPLETED" || !payment.order_id) return false;
  const order = await square.getOrder(payment.order_id);
  // Fulfilment can keep a fully paid mixed food/membership order OPEN.
  // Payment evidence below, not kitchen completion, decides entitlement.
  if (!order || !["COMPLETED", "OPEN"].includes(order.state)) return false;
  const plans = await storage.getMembershipPlans();
  const lines = (order.line_items ?? []).flatMap((line: any) => {
    const matches = plans.filter(p => p.squarePosVariationIds.includes(line.catalog_object_id));
    if (matches.length > 1) throw new Error("Till membership item is mapped to multiple plans");
    return matches.length ? [{ line, plan: matches[0] }] : [];
  });
  if (!lines.length) return false;
  const customerId = payment.customer_id ?? order.customer_id;
  if (!customerId || (payment.customer_id && order.customer_id && payment.customer_id !== order.customer_id))
    throw new Error("Membership till sale needs one identified Square customer");
  if (new Set(lines.map((l: any) => l.plan.id)).size !== 1) throw new Error("Mixed-plan till sale needs staff review");
  const amount = lines.reduce((sum: number, { line }: any) => sum + Number(line.total_money?.amount ?? 0), 0);
  const quantity = lines.reduce((sum: number, { line }: any) => sum + Number(line.quantity), 0);
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 10 || !Number.isSafeInteger(amount) || amount <= 0 ||
      lines.some(({ line }: any) => line.total_money?.currency !== "GBP")) throw new Error("Invalid paid till membership amount or duration");
  // A completed split payment alone is not proof that the whole order was paid.
  const tenders = order.tenders ?? [];
  const verifiedPayments = await Promise.all(tenders.map((t: any) => t.payment_id ? square.getPayment(t.payment_id) : null));
  if (!tenders.length || verifiedPayments.some((p: any) => !p || p.status !== "COMPLETED" || p.order_id !== order.id))
    throw new Error("Till order payment could not be verified in full");
  const paid = verifiedPayments.reduce((sum: number, p: any) => sum + Number(p.amount_money?.amount ?? 0), 0);
  if (order.total_money?.currency !== "GBP" || paid < Number(order.total_money?.amount ?? Infinity) ||
      verifiedPayments.some((p: any) => Number(p.refunded_money?.amount ?? 0) > 0)) throw new Error("Till order is not fully paid or has been refunded");
  const paymentDates = verifiedPayments.map((p: any) => instant(
    p.card_details?.card_payment_timeline?.captured_at ??
    (p.source_type === "CASH" ? p.created_at : p.updated_at ?? p.created_at),
  ));
  const bought = paymentDates.every(Boolean)
    ? paymentDates.sort((a: Date, b: Date) => b.getTime() - a.getTime())[0]
    : instant(order.closed_at);
  if (!bought) throw new Error("Till purchase has no confirmed completion date");
  const overlap = await hasLiveSquareMembership(customerId);
  await db.transaction(async tx => {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${customerId}))`);
  await tx.insert(purchases).values({
    id: "pos-order:" + order.id, squareCustomerId: customerId, squarePaymentId: payment.id,
    squareOrderId: order.id, planId: lines[0].plan.id, source: "square_pos",
    frequency: "annual", amountPence: amount, purchasedAt: bought, months: quantity * 12,
    status: overlap ? "needs_review" : "unclaimed",
    reviewReason: overlap ? "Automatic Square membership billing already exists. Review it before adding prepaid time." : null,
  }).onConflictDoNothing();
  const rows = await tx.select().from(purchases).where(and(eq(purchases.squareCustomerId, customerId),
    eq(purchases.source, "square_pos"), inArray(purchases.status, ["unclaimed", "applied"])));
  for (const row of prepaidCoverage(rows)) await tx.update(purchases).set({
    periodStart: row.periodStart, periodEnd: row.periodEnd,
  }).where(eq(purchases.id, row.id));
  });
  const customer = await storage.getCustomerBySquareCustomerId(customerId);
  if (customer?.emailVerified) {
    await claimPrepaidPurchases(customer.id, customerId);
    const local = await storage.getLatestMembershipSubscriptionByCustomer(customer.id);
    if (local) await syncPendingGroup(local.id);
  }
  else await syncUnlinkedSquareGroups(customerId);
  return true;
}

// Read-only provider matching for a verified app account, including purchases
// made before it registered. Never infer a purchase date from group membership.
export async function refreshExternalSquareMembership(customerId: number, squareCustomer: any) {
  if (!(await storage.getCustomerById(customerId))?.emailVerified) return false;
  await claimPrepaidPurchases(customerId, squareCustomer.id);
  const existing = await storage.getLatestMembershipSubscriptionByCustomer(customerId);
  const remoteSubs = await square.listSquareSubscriptionsForCustomer(squareCustomer.id);
  const [upgrade] = await db.select().from(subs).where(and(
    eq(subs.customerId, customerId), eq(subs.status, "pending_upgrade"),
  ));
  if (upgrade) {
    // Never attach the new mandate to the old VIP entitlement. Link the
    // upgrade attempt and use the same verified-invoice activation path.
    let candidate = remoteSubs.find((r: any) => r.id === upgrade.squareSubscriptionId);
    if (!candidate && !upgrade.squareSubscriptionId) {
      for (const remote of remoteSubs) {
        if (remote.customer_id === upgrade.squareCustomerId &&
            ["ACTIVE", "PENDING"].includes(remote.status) &&
            (await mappedPlan(remote.plan_variation_id))?.plan.id === upgrade.planId) {
          candidate = remote;
          break;
        }
      }
    }
    if (candidate) {
      await processSquareMembershipEvent({ type: "subscription.created", data: { object: { subscription: candidate } } });
      for (const id of (candidate.invoice_ids ?? []).slice(0, 50)) {
        const invoice = await square.getSquareInvoice(id);
        if (invoice?.status === "PAID") {
          await processSquareMembershipEvent({ type: "invoice.payment_made", data: { object: { invoice } } });
        }
      }
    }
    return true;
  }
  const linked = existing?.squareSubscriptionId ? remoteSubs.find((r: any) => r.id === existing.squareSubscriptionId) : null;
  const candidates: any[] = [];
  for (const r of remoteSubs) if (r.status === "ACTIVE" && validDate(r.charged_through_date) &&
    r.charged_through_date > membershipDay() && await mappedPlan(r.plan_variation_id)) candidates.push(r);
  if (candidates.length > 1) throw new Error("Multiple paid Square memberships need staff review.");
  const remote = linked && !["cancelled", "expired"].includes(existing!.status) ? linked : candidates[0] ?? linked;
  if (!remote) return !!existing && existing.source !== "square_group_sync";
  if (existing?.squareSubscriptionId && ["CANCELED", "PAUSED"].includes(remote.status)) {
    await processSquareMembershipEvent({ type: "subscription.updated", data: { object: { subscription: remote } } });
    return true;
  }
  if (existing && !existing.squareSubscriptionId && existing.status === "active" &&
      (existing.source === "square_pos" && (existing.prepaidUntilDate ?? "") > membershipDay() ||
       !["square_sync", "square_group_sync", "square_pos"].includes(existing.source))) return true;
  const match = await mappedPlan(remote.plan_variation_id);
  if (!match) return !!existing;
  if (!existing && match.plan.hideFromSignup && match.plan.priceMonthly <= 0 && (match.plan.priceAnnual ?? 0) <= 0) return false;
  const invoices = await Promise.all((remote.invoice_ids ?? []).slice(0, 50).map((id: string) => square.getSquareInvoice(id)));
  const paidInvoices = invoices.filter((i: any) => i.subscription_id === remote.id && i.status === "PAID");
  if (!paidInvoices.length || !validDate(remote.charged_through_date) || remote.charged_through_date <= membershipDay()) return !!existing;
  if (!existing) {
    const paidDates = paidInvoices.map((i: any) => invoicePaidAt(i)).filter(Boolean).sort((a: Date, b: Date) => a.getTime() - b.getTime());
    await storage.createMembershipSubscription({
      customerId, planId: match.plan.id, status: "active", source: "square_sync",
      squareCustomerId: squareCustomer.id, squareSubscriptionId: remote.id,
      currentPeriodStart: remote.start_date, currentPeriodEnd: remote.charged_through_date,
      firstPaidAt: (remote.invoice_ids?.length ?? 0) <= 50 ? paidDates[0] ?? null : null,
      lastPaidAt: paidDates.at(-1) ?? null, squareGroupSyncPending: true,
    });
  } else if (existing.squareSubscriptionId !== remote.id) {
    await db.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(14701, ${customerId})`);
      await tx.execute(sql`SELECT pg_advisory_xact_lock(14702, ${existing.id})`);
      const [fresh] = await tx.select().from(subs).where(eq(subs.id, existing.id)).for("update");
      if (!fresh || fresh.squareSubscriptionId !== existing.squareSubscriptionId || fresh.status !== existing.status) return;
      await tx.update(subs).set({ squareSubscriptionId: remote.id, squareCustomerId: squareCustomer.id,
        source: "square_sync", status: "pending", squareGroupSyncPending: true }).where(eq(subs.id, existing.id));
      await tx.update(states).set({ cancellationDate: null, pendingPlanId: null, pendingFrequency: null,
        pendingEffectiveDate: null, commitmentStartDate: null, commitmentEndDate: null, termsVersion: null, recurringStartDate: null })
        .where(eq(states.subscriptionId, existing.id));
    });
  }
  const latest = paidInvoices.sort((a: any, b: any) => (invoicePaidAt(b)?.getTime() ?? 0) - (invoicePaidAt(a)?.getTime() ?? 0))[0];
  await processSquareMembershipEvent({ type: "invoice.payment_made", data: { object: { invoice: latest } } });
  return true;
}

export async function reconcileMembershipExpiry() {
  const today = membershipDay();
  const all = await db.select().from(subs);
  for (const local of all) {
    try {
    const state = await billingState(local.id);
    const pendingPrepaid = local.source === "square_pos" && state?.pendingPlanId &&
      state.pendingEffectiveDate && state.pendingEffectiveDate <= today && local.prepaidUntilDate && local.prepaidUntilDate > today;
    if (pendingPrepaid) {
      await db.transaction(async tx => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(14702, ${local.id})`);
        const [fresh] = await tx.select().from(states).where(eq(states.subscriptionId, local.id)).for("update");
        if (!fresh?.pendingPlanId || !fresh.pendingEffectiveDate || fresh.pendingEffectiveDate > today) return;
        const rows = await tx.select().from(purchases).where(and(eq(purchases.subscriptionId, local.id), eq(purchases.source, "square_pos"), eq(purchases.status, "applied")));
        const coverage = prepaidCoverage(rows);
        const current = coverage.filter(r => r.periodStart <= today).at(-1);
        const next = current ? coverage.find(r => r.periodStart > today && r.planId !== current.planId) : undefined;
        await tx.update(subs).set({ planId: current?.planId ?? fresh.pendingPlanId,
          currentPeriodStart: current?.periodStart ?? fresh.pendingEffectiveDate,
          currentPeriodEnd: next?.periodStart ?? local.prepaidUntilDate, status: "active", squareGroupSyncPending: true }).where(eq(subs.id, local.id));
        await tx.update(states).set({ pendingPlanId: next?.planId ?? null, pendingFrequency: next ? "annual" : null,
          pendingEffectiveDate: next?.periodStart ?? null }).where(eq(states.subscriptionId, local.id));
      });
    } else if (local.status === "active" && validDate(local.currentPeriodEnd) && local.currentPeriodEnd! <= today &&
      ((!local.squareSubscriptionId && local.source === "square_pos") || (state?.cancellationDate && state.cancellationDate <= today))) {
      await storage.updateMembershipSubscription(local.id, { status: "cancelled", cancelledAt: new Date(), squareGroupSyncPending: true });
    }
    await syncPendingGroup(local.id);
    } catch (error: any) {
      console.warn("[MEMBERSHIP] Expiry/group reconciliation needs retry:", error?.message ?? "provider unavailable");
    }
  }
  const unlinked = await db.selectDistinct({ squareCustomerId: purchases.squareCustomerId }).from(purchases)
    .where(and(isNull(purchases.customerId), inArray(purchases.status, ["unclaimed", "frozen"])));
  for (const row of unlinked) {
    try { await syncUnlinkedSquareGroups(row.squareCustomerId); }
    catch { console.warn("[MEMBERSHIP] Unlinked Square discount sync will retry."); }
  }
}

export function registerSquareMembershipSync(app: Express, staffAuth: RequestHandler, managerAuth: RequestHandler) {
  app.get("/api/staff/membership/pos-catalog", staffAuth, managerAuth, async (_req, res) => {
    try { res.json({ items: await square.listMembershipPosCatalog() }); }
    catch { res.status(502).json({ message: "Square till items could not be loaded. Existing mappings were not changed." }); }
  });
  app.get("/api/staff/membership/pos-purchases", staffAuth, managerAuth, async (_req, res) => {
    const receipts = await db.select().from(purchases).where(sql`(${purchases.source} IN ('square_pos', 'legacy_payment') OR ${purchases.status} = 'needs_review')`)
      .orderBy(sql`${purchases.recordedAt} DESC`).limit(100);
    const plans = await storage.getMembershipPlans();
    res.json({ purchases: receipts.map(r => ({
      id: r.id, planName: plans.find(p => p.id === r.planId)?.name ?? "Membership",
      purchasedAt: r.purchasedAt?.toISOString() ?? null, periodEnd: r.periodEnd,
      status: r.status === "applied" ? "matched" : r.status, reviewReason: r.reviewReason, customerMatched: r.customerId !== null,
    })) });
  });
  app.post("/api/staff/membership/pos-purchases/import", staffAuth, managerAuth, async (req, res) => {
    if (typeof req.body?.orderId !== "string" || !/^[A-Za-z0-9_-]{1,192}$/.test(req.body.orderId))
      return res.status(400).json({ message: "Enter the Square order ID." });
    try {
      const order = await square.getOrder(req.body.orderId);
      const paymentId = order?.tenders?.find((t: any) => t.payment_id)?.payment_id;
      if (!paymentId) throw new Error("No completed payment is associated with that order.");
      const payment = await square.getPayment(paymentId);
      if (!await processMembershipPosPayment(payment)) throw new Error("Order is not completed or contains no mapped membership till item.");
      res.json({ message: "The paid receipt was imported once. Check its matching/review status below; no charge was created." });
    } catch (error: any) { res.status(409).json({ message: error.message || "Receipt import failed; no membership was granted." }); }
  });
  app.post("/api/staff/membership/pos-purchases/:id/retry", staffAuth, managerAuth, async (req, res) => {
    const [receipt] = await db.select().from(purchases).where(eq(purchases.id, String(req.params.id)));
    if (!receipt) return res.status(404).json({ message: "Receipt not found." });
    if (receipt.source !== "square_pos") return res.status(409).json({ message: "This legacy payment needs an owner review; its duration must not be guessed." });
    const customer = await storage.getCustomerBySquareCustomerId(receipt.squareCustomerId);
    if (!customer?.emailVerified) return res.status(409).json({ message: "The customer must register and verify their app/website account before this sale can be matched." });
    try {
      await claimPrepaidPurchases(customer.id, receipt.squareCustomerId);
      const [after] = await db.select().from(purchases).where(eq(purchases.id, receipt.id));
      if (after.status !== "applied") return res.status(409).json({ message: after.reviewReason || "This purchase still needs review." });
      res.json({ message: "Prepaid membership matched. Its original paid date was preserved; no new charge was made." });
    } catch { res.status(503).json({ message: "Matching could not finish. Retry; payment evidence is retained and will not be applied twice." }); }
  });
  // A durable pending flag retries group removal after transient Square errors.
  // No provider payment, subscription creation or cancellation happens here.
  if (process.env.NODE_ENV === "production") {
    let running = false;
    const run = async () => {
      if (running) return;
      running = true;
      try { await reconcileMembershipExpiry(); }
      catch { console.warn("[MEMBERSHIP] Expiry reconciliation will retry."); }
      finally { running = false; }
    };
    setTimeout(() => { void run(); }, 30_000).unref();
    setInterval(() => { void run(); }, 5 * 60_000).unref();
  }
}

export async function validatePosMapping(ids: string[], planId?: number) {
  if (new Set(ids).size !== ids.length) throw new Error("Choose each till variation only once.");
  const plans = await storage.getMembershipPlans();
  if (plans.some(p => p.id !== planId && p.squarePosVariationIds.some(id => ids.includes(id))))
    throw new Error("A till variation is already assigned to another membership plan.");
  const previous = plans.find(p => p.id === planId)?.squarePosVariationIds ?? [];
  const added = ids.filter(id => !previous.includes(id));
  if (added.length) {
    const valid = new Set((await square.listMembershipPosCatalog()).map(i => i.variationId));
    if (added.some(id => !valid.has(id))) throw new Error("Choose valid Square till item variations, not subscription rate IDs.");
  }
}

export async function recordLegacyMembershipPayment(payment: any, subscriptionId: number) {
  const local = await storage.getMembershipSubscription(subscriptionId);
  if (!local || payment.status !== "COMPLETED") return;
  await db.insert(purchases).values({
    id: "legacy-payment:" + payment.id, squareCustomerId: local.squareCustomerId ?? payment.customer_id ?? "unidentified",
    squarePaymentId: payment.id, squareOrderId: payment.order_id ?? null,
    subscriptionId, customerId: local.customerId, planId: local.planId,
    source: "legacy_payment", frequency: "unknown", amountPence: Number(payment.amount_money?.amount ?? 0),
    purchasedAt: instant(payment.created_at), status: "needs_review",
    reviewReason: "Legacy one-time membership payment. Its duration and recurring consent need owner review; no automatic subscription was started.",
  }).onConflictDoNothing();
}
