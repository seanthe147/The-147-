import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { before, after, test } from "node:test";
import express from "express";
import { eq, inArray, sql } from "drizzle-orm";
import { customers, membershipPlans, membershipSubscriptions as subs, membershipBillingStates as states,
  membershipPurchaseRecords as purchases, membershipSquareEvents as events, membershipAuditLog as audit } from "@workspace/db/schema";
import { db, storage } from "./storage";
import { registerMembershipBilling, billingState, membershipSignupGuard, syncSquareMembershipGroupsForCustomer } from "./membership-billing";
import { claimPrepaidPurchases, membershipDay, prepaidCoverage, processMembershipPosPayment,
  processSquareMembershipEvent, reconcileMembershipExpiry, refreshExternalSquareMembership, registerSquareMembershipSync, validatePosMapping } from "./membership-square-sync";
import { addCalendarMonths } from "./membership-billing-policy";
import { findSquareCustomerByEmail, snookerDiscountCustomerGroupName } from "./square";

if (process.env.MEMBERSHIP_BILLING_ISOLATED_TEST !== "yes" || process.env.SQUARE_ACCESS_TOKEN !== "fixture-square-token")
  throw new Error("Use the isolated membership test runner.");
const tag = "fixture-sync-" + randomUUID(), originalFetch = globalThis.fetch;
const customerIds: number[] = [], planIds: number[] = [];
const remotes = new Map<string, any>(), invoices = new Map<string, any>(), orders = new Map<string, any>(), payments = new Map<string, any>();
const groups = new Map<string, Set<string>>(), cards = new Map<string, any>();
const directory = new Map<string, any[]>();
const calls: { method: string; path: string; body: any }[] = [];
let base = "", authCustomer = 0, failGroups = false;
let standard: any, platinum: any, vip: any, originalVipPlan: any, blue: any, pink: any, server: any;
const day = membershipDay(), end = addCalendarMonths(day, 12);
const group = (id: string) => groups.get(id) ?? new Set<string>();
async function customer(suffix: string, verified = true) {
  const c = await storage.createCustomer(`${tag}-${suffix}@example.invalid`, "Isolated membership test", null, "!fixture");
  customerIds.push(c.id);
  const squareId = tag + "-" + suffix;
  await db.update(customers).set({ emailVerified: verified, squareCustomerId: squareId }).where(eq(customers.id, c.id));
  groups.set(squareId, new Set([tag + "-vip-group"]));
  directory.set(c.email, [{ id: squareId, email_address: c.email }]);
  return { ...c, emailVerified: verified, squareCustomerId: squareId };
}
function remote(c: any, plan = standard, frequency = "monthly") {
  const r = { id: tag + "-sub-" + c.id, customer_id: c.squareCustomerId, status: "ACTIVE",
    start_date: day, charged_through_date: frequency === "annual" ? end : addCalendarMonths(day, 1),
    plan_variation_id: frequency === "annual" ? plan.squarePlanVariationIdAlt : plan.squarePlanVariationId, invoice_ids: [] as string[] };
  remotes.set(r.id, r); return r;
}
function invoice(r: any, suffix: string) {
  const i = { id: tag + "-invoice-" + suffix, subscription_id: r.id, status: "PAID",
    updated_at: new Date().toISOString(),
    payment_requests: [{ completed_at: new Date().toISOString(), computed_amount_money: { amount: 6500, currency: "GBP" } }] };
  invoices.set(i.id, i); r.invoice_ids.push(i.id); return i;
}
const paidEvent = (i: any) => ({ type: "invoice.payment_made", created_at: i.updated_at, data: { object: { invoice: i } } });
function pos(squareCustomerId: string, suffix: string, plan = standard, closed = new Date().toISOString()) {
  const id = tag + "-order-" + suffix, paymentId = tag + "-payment-" + suffix;
  const p = { id: paymentId, status: "COMPLETED", order_id: id, customer_id: squareCustomerId, amount_money: { amount: 6500, currency: "GBP" } };
  payments.set(p.id, p);
  orders.set(id, { id, state: "COMPLETED", customer_id: squareCustomerId, closed_at: closed,
    total_money: { amount: 6500, currency: "GBP" }, tenders: [{ payment_id: p.id }],
    line_items: [{ catalog_object_id: plan.squarePosVariationIds[0], quantity: "1", total_money: { amount: 6500, currency: "GBP" } }] });
  return p;
}
async function post(path: string, body: unknown, auth = true) {
  return originalFetch(base + path, { method: "POST", headers: { "Content-Type": "application/json", ...(auth ? { "x-fixture": "yes" } : {}) }, body: JSON.stringify(body) });
}
before(async () => {
  for (const [name, price, hidden] of [["Standard", 500, false], ["Platinum", 699, false]] as const) {
    const p = await storage.createMembershipPlan({ name: name === "Platinum" ? name : tag + name,
      tier: tag + name, priceMonthly: price, priceAnnual: price ? 6500 : null, hideFromSignup: hidden,
      squarePlanVariationId: tag + name + "-monthly", squarePlanVariationIdAlt: tag + name + "-annual",
      squareCustomerGroupId: tag + name + "-group",
      squarePosVariationIds: [tag + name + "-pos"] });
    planIds.push(p.id);
    if (name === "Standard") standard = p; else platinum = p;
  }
  const seededPlans = await storage.getMembershipPlans();
  originalVipPlan = seededPlans.find(plan => plan.tier === "vip") ?? null;
  if (originalVipPlan) {
    vip = await storage.updateMembershipPlan(originalVipPlan.id, {
      active: true, hideFromSignup: true, squareCustomerGroupId: tag + "-vip-group",
    });
  } else {
    vip = await storage.createMembershipPlan({ name: tag + "VIP", tier: "vip", priceMonthly: 0,
      priceAnnual: null, hideFromSignup: true, squareCustomerGroupId: tag + "-vip-group" });
    planIds.push(vip.id);
  }
  const seededBlue = seededPlans.find(plan => plan.tier === "blue");
  const seededPink = seededPlans.find(plan => plan.tier === "pink");
  if (!seededBlue || !seededPink) throw new Error("Seeded Blue/Pink plans are required by the isolated membership fixtures.");
  blue = await storage.updateMembershipPlan(seededBlue.id, {
    active: true, hideFromSignup: false, squareCustomerGroupId: tag + "-blue-group",
  });
  pink = await storage.updateMembershipPlan(seededPink.id, {
    active: true, hideFromSignup: false, squareCustomerGroupId: tag + "-pink-group",
  });
  if (!blue || !pink) throw new Error("Could not prepare Blue/Pink plans for the isolated membership fixtures.");
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.origin !== "https://connect.squareupsandbox.com") throw new Error("External request blocked by isolated sync test");
    const path = url.pathname, method = init?.method ?? "GET", body = init?.body ? JSON.parse(String(init.body)) : {};
    calls.push({ path, method, body });
    if (path === "/v2/subscriptions/search") return Response.json({ subscriptions: [...remotes.values()].filter(r => body.query.filter.customer_ids.includes(r.customer_id)) });
    if (path === "/v2/customers/search") return Response.json({ customers: directory.get(body.query.filter.email_address.exact) ?? [] });
    if (path === "/v2/customers/groups") return Response.json({ groups: [
      ...[standard, platinum, vip, blue, pink].map(p => ({ id: p.squareCustomerGroupId, name: p.name })),
      { id: tag + "-blue-snooker-group", name: snookerDiscountCustomerGroupName("blue") },
      { id: tag + "-pink-annual-snooker-group", name: snookerDiscountCustomerGroupName("pinkAnnual") },
    ] });
    const groupMatch = path.match(/^\/v2\/customers\/([^/]+)\/groups\/([^/]+)$/);
    if (groupMatch) {
      if (failGroups) return Response.json({ errors: [{ code: "TEMPORARY_ERROR" }] }, { status: 503 });
      const set = group(groupMatch[1]); groups.set(groupMatch[1], set);
      if (method === "PUT") set.add(groupMatch[2]); else set.delete(groupMatch[2]);
      return Response.json({});
    }
    if (path.startsWith("/v2/customers/")) return Response.json({ customer: { id: path.split("/").at(-1), group_ids: [...group(path.split("/").at(-1)!)] } });
    if (path.startsWith("/v2/catalog/object/")) {
      const annual = path.endsWith("-annual");
      const p = path.includes("Platinum") ? platinum : standard;
      return Response.json({ object: { subscription_plan_variation_data: { phases: [{ cadence: annual ? "ANNUAL" : "MONTHLY",
        pricing: { type: "STATIC", price_money: { amount: annual ? p.priceAnnual : p.priceMonthly, currency: "GBP" } } }] } } });
    }
    if (path === "/v2/catalog/list") return Response.json({ objects: [standard, platinum].map(p => ({ id: p.id, item_data: {
      name: p.name, variations: [{ id: p.squarePosVariationIds[0], item_variation_data: { name: "Annual prepaid", price_money: { amount: 6500, currency: "GBP" } } }],
    } })) });
    if (path.startsWith("/v2/orders/")) return Response.json({ order: orders.get(path.split("/").at(-1)!) });
    if (path.startsWith("/v2/payments/") && method === "GET") return Response.json({ payment: payments.get(path.split("/").at(-1)!) });
    if (path.startsWith("/v2/invoices/")) return Response.json({ invoice: invoices.get(path.split("/").at(-1)!) });
    if (path === "/v2/cards" && method === "POST") {
      const card = { id: "card-" + body.card.customer_id, customer_id: body.card.customer_id, last_4: "1111", card_brand: "VISA", exp_month: 12, exp_year: 2030 };
      cards.set(card.id, card); return Response.json({ card });
    }
    if (path.startsWith("/v2/cards/")) return Response.json({ card: cards.get(path.split("/").at(-1)!) });
    if (path === "/v2/subscriptions" && method === "POST") {
      const r = { id: tag + "-auto-" + remotes.size, ...body, status: "PENDING" }; remotes.set(r.id, r); return Response.json({ subscription: r });
    }
    if (path.endsWith("/cancel")) {
      const r = remotes.get(path.split("/").at(-2)!); r.status = "CANCELED"; r.canceled_date = day;
      return Response.json({ subscription: r });
    }
    if (path.startsWith("/v2/subscriptions/")) return Response.json({ subscription: remotes.get(path.split("/").at(-1)!) });
    throw new Error("Unexpected Square request blocked: " + method + " " + path);
  };
  const app = express(); app.use(express.json());
  const auth: express.RequestHandler = (req, res, next) => {
    if (req.headers["x-fixture"] !== "yes") return void res.sendStatus(401);
    (req as any).customerId = authCustomer; next();
  };
  registerMembershipBilling(app, auth, auth, auth);
  app.post("/api/membership/join", auth, membershipSignupGuard, (_req, res) => res.sendStatus(202));
  registerSquareMembershipSync(app, auth, auth);
  server = app.listen(0, "127.0.0.1"); await new Promise<void>(resolve => server.once("listening", resolve));
  base = "http://127.0.0.1:" + server.address().port;
});
after(async () => {
  globalThis.fetch = originalFetch;
  if (server) await new Promise<void>(resolve => server.close(resolve));
  await db.delete(purchases).where(sql`${purchases.id} LIKE ${"%" + tag + "%"}`);
  await db.delete(events).where(sql`${events.id} LIKE ${"%" + tag + "%"}`);
  if (customerIds.length) {
    const rows = await db.select().from(subs).where(inArray(subs.customerId, customerIds));
    if (rows.length) {
      await db.delete(states).where(inArray(states.subscriptionId, rows.map(r => r.id)));
      await db.delete(audit).where(inArray(audit.subscriptionId, rows.map(r => r.id)));
      await db.delete(subs).where(inArray(subs.customerId, customerIds));
    }
    await db.delete(customers).where(inArray(customers.id, customerIds));
  }
  if (originalVipPlan) {
    await storage.updateMembershipPlan(originalVipPlan.id, {
      active: originalVipPlan.active,
      hideFromSignup: originalVipPlan.hideFromSignup,
      squareCustomerGroupId: originalVipPlan.squareCustomerGroupId,
    });
  }
  if (planIds.length) await db.delete(membershipPlans).where(inArray(membershipPlans.id, planIds));
  assert.equal(calls.some(c => c.path === "/v2/payments" && c.method !== "GET"), false, "No real or simulated immediate charges should be created");
});

test("prepaid periods preserve calendar dates and historical import order", () => {
  assert.equal(membershipDay(new Date("2026-10-14T23:30:00Z")), "2026-10-15");
  const rows = prepaidCoverage([{ id: "later", purchasedAt: new Date("2026-10-15T12:00:00Z"), months: 12 },
    { id: "first", purchasedAt: new Date("2025-10-15T12:00:00Z"), months: 12 }]);
  assert.equal(rows[0].periodEnd, "2026-10-15"); assert.equal(rows[1].periodEnd, "2027-10-15");
  assert.equal(prepaidCoverage([{ id: "leap", purchasedAt: new Date("2024-02-29T12:00:00Z"), months: 12 }])[0].periodEnd, "2025-02-28");
});
test("unverified accounts and ambiguous Square email matches cannot start billing", async () => {
  const c = await customer("unverified", false); authCustomer = c.id;
  const before = calls.filter(c => c.path === "/v2/subscriptions" && c.method === "POST").length;
  assert.equal((await post("/api/membership/join", { planId: standard.id })).status, 403);
  directory.set(c.email, [{ id: "other", email_address: c.email.toUpperCase() }, { id: c.squareCustomerId, email_address: c.email }]);
  await assert.rejects(findSquareCustomerByEmail(c.email), /Multiple Square customer/);
  assert.equal(calls.filter(c => c.path === "/v2/subscriptions" && c.method === "POST").length, before);
});
test("till sale upgrades Square before app registration, then links once to a verified account", async () => {
  const c = await customer("pos", false), p = pos(c.squareCustomerId, "pos");
  await processMembershipPosPayment(p); await processMembershipPosPayment(p);
  assert(group(c.squareCustomerId).has(standard.squareCustomerGroupId));
  assert.equal(await storage.getMembershipSubscriptionByCustomer(c.id), null);
  await db.update(customers).set({ emailVerified: true }).where(eq(customers.id, c.id));
  await claimPrepaidPurchases(c.id, c.squareCustomerId); await claimPrepaidPurchases(c.id, c.squareCustomerId);
  const s = await storage.getMembershipSubscriptionByCustomer(c.id);
  assert.equal(s?.currentPeriodEnd, end); assert.equal(s?.source, "square_pos"); assert(s?.firstPaidAt);
  assert.equal((await db.select().from(subs).where(eq(subs.customerId, c.id))).length, 1);
  assert.equal(calls.filter(c => c.path === "/v2/subscriptions" && c.method === "POST").length, 0);
});
test("partial/split payments cannot grant unpaid access and POS mappings cannot overlap", async () => {
  const c = await customer("partial"), p = pos(c.squareCustomerId, "partial");
  orders.get(p.order_id).tenders.push({ payment_id: "missing" });
  await assert.rejects(processMembershipPosPayment(p), /verified in full/);
  assert.equal(await storage.getMembershipSubscriptionByCustomer(c.id), null);
  await assert.rejects(validatePosMapping(standard.squarePosVariationIds, platinum.id), /another membership/);
});
test("fully paid mixed orders need not wait for food fulfilment", async () => {
  const c = await customer("open-order"), p: any = pos(c.squareCustomerId, "open-order");
  orders.get(p.order_id).state = "OPEN"; delete orders.get(p.order_id).closed_at;
  p.updated_at = new Date().toISOString();
  await processMembershipPosPayment(p);
  assert.equal((await storage.getLatestMembershipSubscriptionByCustomer(c.id))?.currentPeriodEnd, end);
});
test("historical receipts preserve original payment dates without adding a fictitious extra year", async () => {
  const c = await customer("historical"), current = pos(c.squareCustomerId, "historical-current");
  await processMembershipPosPayment(current);
  const oldDate = addCalendarMonths(day, -12) + "T12:00:00Z";
  await processMembershipPosPayment(pos(c.squareCustomerId, "historical-old", standard, oldDate));
  const s = (await storage.getLatestMembershipSubscriptionByCustomer(c.id))!;
  assert.equal(s.currentPeriodEnd, end); assert.equal(s.firstPaidAt?.toISOString(), new Date(oldDate).toISOString());
});
test("direct Square annual purchase records dates; a paid plan change upgrades groups only after payment", async () => {
  const c = await customer("recurring"), r = remote(c, standard, "annual"), i = invoice(r, "annual");
  await processSquareMembershipEvent(paidEvent(i));
  assert(group(c.squareCustomerId).has(standard.squareCustomerGroupId));
  await refreshExternalSquareMembership(c.id, { id: c.squareCustomerId });
  let s = await storage.getMembershipSubscriptionByCustomer(c.id);
  assert.equal(s?.currentPeriodEnd, end); assert(s?.firstPaidAt);
  r.plan_variation_id = platinum.squarePlanVariationIdAlt;
  await processSquareMembershipEvent({ type: "subscription.updated", data: { object: { subscription: r } } });
  assert.equal((await storage.getMembershipSubscriptionByCustomer(c.id))?.planId, standard.id);
  await processSquareMembershipEvent(paidEvent(invoice(r, "upgrade")));
  s = await storage.getMembershipSubscriptionByCustomer(c.id);
  assert.equal(s?.planId, platinum.id); assert.equal((await billingState(s!.id))?.billingFrequency, "annual");
  assert(group(c.squareCustomerId).has(platinum.squareCustomerGroupId));
  assert(!group(c.squareCustomerId).has(standard.squareCustomerGroupId)); assert(group(c.squareCustomerId).has(vip.squareCustomerGroupId));
});
test("VIP remains until the first paid upgrade invoice, then its membership and Square group are removed", async () => {
  const c = await customer("vip-upgrade");
  const vipSub = await storage.createMembershipSubscription({
    customerId: c.id, planId: vip.id, status: "active", source: "square_group_sync",
  });
  const r = remote(c, standard), i = invoice(r, "vip-upgrade");
  const paidSub = await storage.createMembershipSubscription({
    customerId: c.id, planId: standard.id, status: "pending", source: "app_native",
    squareCustomerId: c.squareCustomerId, squareSubscriptionId: r.id,
  });

  assert.equal((await storage.getMembershipSubscription(vipSub.id))?.status, "active");
  assert(group(c.squareCustomerId).has(vip.squareCustomerGroupId));
  await processSquareMembershipEvent(paidEvent(i));

  assert.equal((await storage.getMembershipSubscription(vipSub.id))?.status, "cancelled");
  assert.equal((await storage.getMembershipSubscription(paidSub.id))?.status, "active");
  assert(group(c.squareCustomerId).has(standard.squareCustomerGroupId));
  assert(!group(c.squareCustomerId).has(vip.squareCustomerGroupId));
});
test("duplicate failed charge events count once, notify 1/2, and hold access only at failure 3", async () => {
  const c = await customer("failures"), r = remote(c), first = invoice(r, "first-payment");
  await refreshExternalSquareMembership(c.id, { id: c.squareCustomerId });
  const failed = invoice(r, "failed"); failed.status = "UNPAID";
  const notices: number[] = [];
  for (let n = 1; n <= 3; n++) {
    failed.updated_at = `2099-01-0${n}T12:00:00Z`;
    const event = { type: "invoice.scheduled_charge_failed", data: { object: { invoice: { ...failed } } } };
    await processSquareMembershipEvent(event, async (_id, count) => { notices.push(count); });
    await processSquareMembershipEvent(event, async (_id, count) => { notices.push(count); });
    assert.equal((await storage.getLatestMembershipSubscriptionByCustomer(c.id))?.status, n < 3 ? "active" : "frozen");
  }
  assert.deepEqual(notices, [1, 2, 3]); assert(!group(c.squareCustomerId).has(standard.squareCustomerGroupId));
  authCustomer = c.id;
  const details = await originalFetch(base + "/api/membership/billing", { headers: { "x-fixture": "yes" } });
  const dto: any = await details.json();
  assert.equal(dto.subscription.status, "frozen"); assert.equal(dto.subscription.cardReplacementAllowed, true);
  assert.equal((await post("/api/membership/join", { planId: standard.id })).status, 409);
  failed.status = "PAID"; await processSquareMembershipEvent(paidEvent(failed));
  assert.equal((await storage.getMembershipSubscriptionByCustomer(c.id))?.status, "active");
  assert.equal((await storage.getMembershipSubscriptionByCustomer(c.id))?.failedPaymentAttempts, 0);
  assert.equal(first.status, "PAID");
});
test("cancelled subscriptions retain paid access; expiry removes even hidden paid-plan discounts, not VIP", async () => {
  const c = await customer("cancel"), r = remote(c), i = invoice(r, "cancel");
  await refreshExternalSquareMembership(c.id, { id: c.squareCustomerId });
  r.status = "CANCELED";
  await processSquareMembershipEvent({ type: "subscription.updated", data: { object: { subscription: r } } });
  const s = (await storage.getMembershipSubscriptionByCustomer(c.id))!;
  assert.equal(s.status, "active"); assert.equal(s.currentPeriodEnd, r.charged_through_date);
  await db.update(membershipPlans).set({ hideFromSignup: true }).where(eq(membershipPlans.id, standard.id));
  await db.update(subs).set({ currentPeriodEnd: day }).where(eq(subs.id, s.id));
  await db.update(states).set({ cancellationDate: day }).where(eq(states.subscriptionId, s.id));
  await reconcileMembershipExpiry();
  assert.equal((await storage.getLatestMembershipSubscriptionByCustomer(c.id))?.status, "cancelled");
  assert(!group(c.squareCustomerId).has(standard.squareCustomerGroupId)); assert(group(c.squareCustomerId).has(vip.squareCustomerGroupId));
  await db.update(membershipPlans).set({ hideFromSignup: false }).where(eq(membershipPlans.id, standard.id));
});
test("Square POS snooker groups include only Blue monthly and Pink annual members", async () => {
  async function syncEligibleGroup(suffix: string, plan: any, frequency: string) {
    const c = await customer(suffix);
    const sub = await storage.createMembershipSubscription({
      customerId: c.id, planId: plan.id, status: "active", source: "app", squareCustomerId: c.squareCustomerId,
    });
    await db.insert(states).values({ subscriptionId: sub.id, billingFrequency: frequency });
    await syncSquareMembershipGroupsForCustomer(c.squareCustomerId, plan.id);
    return group(c.squareCustomerId);
  }

  const blueMonthlyGroups = await syncEligibleGroup("blue-monthly", blue, "monthly");
  assert(blueMonthlyGroups.has(tag + "-blue-snooker-group"));
  assert(!blueMonthlyGroups.has(tag + "-pink-annual-snooker-group"));

  const blueAnnualGroups = await syncEligibleGroup("blue-annual", blue, "annual");
  assert(!blueAnnualGroups.has(tag + "-blue-snooker-group"));

  const pinkMonthlyGroups = await syncEligibleGroup("pink-monthly", pink, "monthly");
  assert(!pinkMonthlyGroups.has(tag + "-pink-annual-snooker-group"));

  const pinkAnnualGroups = await syncEligibleGroup("pink-annual", pink, "annual");
  assert(pinkAnnualGroups.has(tag + "-pink-annual-snooker-group"));
  assert(!pinkAnnualGroups.has(tag + "-blue-snooker-group"));
});
test("prepaid renewal needs explicit minimum-term consent and STORE verification; no immediate charge or duplicate", async () => {
  const c = await customer("auto"), p = pos(c.squareCustomerId, "auto", platinum);
  await processMembershipPosPayment(p); authCustomer = c.id;
  const body = { billingFrequency: "monthly", termsAccepted: true, sourceId: "cnon:fixture", verificationToken: "fixture-store" };
  assert.equal((await post("/api/membership/enable-auto-renew", body, false)).status, 401);
  assert.equal((await post("/api/membership/enable-auto-renew", { ...body, verificationToken: "" })).status, 400);
  assert.equal((await post("/api/membership/enable-auto-renew", body)).status, 409);
  const response = await post("/api/membership/enable-auto-renew", { ...body, minimumTermAccepted: true });
  assert.equal(response.status, 200, await response.text());
  const s = (await storage.getMembershipSubscriptionByCustomer(c.id))!, r = remotes.get(s.squareSubscriptionId!);
  assert.equal(r.start_date, end); assert.equal(s.status, "active"); assert.equal(s.currentPeriodEnd, end);
  assert.equal((await billingState(s.id))?.commitmentEndDate, addCalendarMonths(end, 12));
  const created = calls.filter(c => c.path === "/v2/subscriptions" && c.method === "POST").length;
  assert.equal((await post("/api/membership/enable-auto-renew", { ...body, minimumTermAccepted: true })).status, 409);
  assert.equal(calls.filter(c => c.path === "/v2/subscriptions" && c.method === "POST").length, created);
  const cancelled = await post("/api/membership/cancel", { confirmed: true });
  assert.equal(cancelled.status, 200, await cancelled.text());
  assert.equal((await storage.getMembershipSubscriptionByCustomer(c.id))?.status, "active");
  assert.equal((await storage.getMembershipSubscriptionByCustomer(c.id))?.currentPeriodEnd, end);
  assert.equal((await billingState(s.id))?.commitmentEndDate, null);
});
test("group provider errors retain pending reconciliation and succeed on retry without another payment", async () => {
  const c = await customer("retry"), r = remote(c), i = invoice(r, "retry");
  const s = await storage.createMembershipSubscription({ customerId: c.id, planId: standard.id, status: "pending",
    source: "app", squareCustomerId: c.squareCustomerId, squareSubscriptionId: r.id });
  failGroups = true; await assert.rejects(processSquareMembershipEvent(paidEvent(i)));
  assert.equal((await storage.getMembershipSubscription(s.id))?.squareGroupSyncPending, true);
  failGroups = false; await processSquareMembershipEvent(paidEvent(i));
  assert.equal((await storage.getMembershipSubscription(s.id))?.squareGroupSyncPending, false);
  assert.equal((await db.select().from(purchases).where(eq(purchases.id, "invoice:" + i.id))).length, 1);
});
