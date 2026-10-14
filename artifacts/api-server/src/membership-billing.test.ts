import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import express from "express";
import { eq, inArray } from "drizzle-orm";
import { customers, membershipPlans, membershipSubscriptions, membershipBillingStates, membershipAuditLog } from "@workspace/db/schema";
import { db, runStartupMigrations, storage } from "./storage";
import { alignBillingStart, billingState, migrationOffer, prepareMigrationOffer, migrationBillingStart, recordBillingTerms, registerMembershipBilling, reconcileScheduledMembership, membershipSignupGuard } from "./membership-billing";

const realFetch = globalThis.fetch;
const tag = randomUUID();
let customerId: number;
let subId: number;
let oldId: number;
let blackId: number;
let base: string;
let server: ReturnType<ReturnType<typeof express>["listen"]>;
const requests: { path: string; body: any }[] = [];
let actions: any[] = [];
let catalogPence = 2000;
let declineCard = false;
let failCardUpdate = false;
const card: any = { id: "fixture-card-new", customer_id: "fixture-customer", enabled: true,
  card_brand: "VISA", last_4: "1111", exp_month: 12, exp_year: 2030,
  cardholder_name: "Must not be exposed", billing_address: { postal_code: "private" }, fingerprint: "private" };
const renewal = "2099-11-13";
const remote: any = { id: "billing-fixture-sub", customer_id: "fixture-customer", version: 3,
  status: "ACTIVE", plan_variation_id: "fixture-monthly", card_id: "fixture-card-old", actions };
let cancellationAt = renewal;

before(async () => {
  // Every Square request is intercepted. These tests never reach the provider.
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (/^https:\/\/connect(?:\.squareup|\.squareupsandbox)\.com\//.test(url)) {
      const path = new URL(url).pathname;
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      requests.push({ path, body });
      if (path === "/v2/cards") {
        if (declineCard) return Response.json({ errors: [{ code: "CARD_DECLINED", detail: "private provider detail" }] }, { status: 400 });
        return Response.json({ card });
      }
      if (path.startsWith("/v2/cards/")) return Response.json({ card });
      if (path === `/v2/subscriptions/${remote.id}` && init?.method === "PUT") {
        if (failCardUpdate) return Response.json({ errors: [{ code: "VERSION_MISMATCH" }] }, { status: 409 });
        remote.card_id = body.subscription.card_id;
        remote.version++;
        return Response.json({ subscription: { ...remote, actions: undefined } });
      }
      if (path.includes("/catalog/")) {
        return Response.json({ object: { subscription_plan_variation_data: { phases: [{ cadence: "MONTHLY", pricing: { type: "STATIC", price_money: { amount: catalogPence, currency: "GBP" } } }] } } });
      }
      if (path.endsWith("/swap-plan")) {
        actions = [{ type: "SWAP_PLAN", effective_date: renewal }];
        return Response.json({ subscription: { ...remote, actions: undefined }, actions });
      }
      if (path.endsWith("/cancel")) return Response.json({ subscription: { ...remote, canceled_date: cancellationAt } });
      return Response.json({ subscription: { ...remote, actions: undefined }, actions });
    }
    if (!url.startsWith(base)) throw new Error("Unexpected external request blocked by billing test");
    return realFetch(input, init);
  };
  await runStartupMigrations();
  const customer = await storage.createCustomer(`billing-${tag}@example.invalid`, "Billing test customer", null, "!locked-fixture");
  customerId = customer.id;
  const old = await storage.createMembershipPlan({ name: "Billing fixture base", tier: `fixture-base-${tag}`, priceMonthly: 1000 });
  const black = await storage.createMembershipPlan({ name: "Black", tier: `fixture-black-${tag}`, priceMonthly: 2000, squarePlanVariationId: "fixture-black-monthly" });
  oldId = old.id;
  blackId = black.id;
  const sub = await storage.createMembershipSubscription({
    customerId, planId: oldId, status: "active", squareSubscriptionId: remote.id, squareCustomerId: remote.customer_id,
    currentPeriodStart: "2099-10-13", currentPeriodEnd: renewal, source: "app",
  });
  subId = sub.id;
  const app = express();
  app.use(express.json());
  const auth: express.RequestHandler = (req, res, next) => {
    if (req.headers["x-billing-test-auth"] !== "yes") { res.sendStatus(401); return; }
    (req as any).customerId = customerId;
    next();
  };
  registerMembershipBilling(app, auth, auth, auth);
  app.post("/api/membership/join", auth, membershipSignupGuard, (_req, res) => res.sendStatus(202));
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as any).port}`;
});

after(async () => {
  globalThis.fetch = realFetch;
  if (server) await new Promise<void>(resolve => server.close(() => resolve()));
  if (subId) {
    await db.delete(membershipBillingStates).where(eq(membershipBillingStates.subscriptionId, subId));
    await db.delete(membershipAuditLog).where(eq(membershipAuditLog.subscriptionId, subId));
    await db.delete(membershipSubscriptions).where(eq(membershipSubscriptions.id, subId));
  }
  if (customerId) await db.delete(customers).where(eq(customers.id, customerId));
  if (oldId && blackId) await db.delete(membershipPlans).where(inArray(membershipPlans.id, [oldId, blackId]));
});

const request = (path: string, body?: unknown, auth = true) => fetch(base + path, {
  method: body ? "POST" : "GET",
  headers: { ...(auth ? { "x-billing-test-auth": "yes" } : {}), "Content-Type": "application/json" },
  ...(body ? { body: JSON.stringify(body) } : {}),
});

test("billing and financial actions require authentication", async () => {
  assert.equal((await request("/api/membership/billing", undefined, false)).status, 401);
  assert.equal((await request("/api/membership/change-plan", { planId: blackId }, false)).status, 401);
});
test("a mismatched Square price is rejected before changing any subscription", async () => {
  catalogPence = 999;
  try {
    const result = await request("/api/membership/change-plan", { planId: blackId, billingFrequency: "monthly", termsAccepted: true });
    assert.equal(result.status, 409);
    assert.equal(requests.filter(r => r.path.endsWith("/swap-plan")).length, 0);
  } finally { catalogPence = 2000; }
});
test("an upgrade uses Square swap-plan, keeps current local benefits, and schedules renewal", async () => {
  const result = await request("/api/membership/change-plan", { planId: blackId, billingFrequency: "monthly", termsAccepted: true });
  assert.equal(result.status, 200, JSON.stringify(await result.clone().json()));
  assert.equal((await result.json() as any).effectiveDate, renewal);
  assert.equal((await storage.getMembershipSubscriptionByCustomer(customerId))?.planId, oldId);
  assert.equal((await billingState(subId))?.pendingPlanId, blackId);
  assert.equal(requests.filter(r => r.path.endsWith("/swap-plan")).length, 1);
  assert.equal(requests.some(r => r.path === "/v2/subscriptions" && r.body.customer_id), false);
});
test("repeated upgrade and cancellation cannot overlap with pending upgrade", async () => {
  assert.equal((await request("/api/membership/change-plan", { planId: blackId, billingFrequency: "monthly", termsAccepted: true })).status, 409);
  assert.equal((await request("/api/membership/cancel", { confirmed: true })).status, 409);
  assert.equal(requests.filter(r => r.path.endsWith("/swap-plan")).length, 1);
});
const replacement = { sourceId: "cnon:fixture-fresh-card", verificationToken: "fixture-sca", authorised: true };
test("card replacement requires authentication and fresh authorisation, not a stored card ID", async () => {
  const before = requests.length;
  assert.equal((await request("/api/membership/payment-card", replacement, false)).status, 401);
  for (const body of [
    { ...replacement, verificationToken: "" }, { ...replacement, verificationToken: null },
    { ...replacement, authorised: false }, { ...replacement, sourceId: "ccof:existing-card" },
  ]) assert.equal((await request("/api/membership/payment-card", body)).status, 400);
  assert.equal(requests.length, before);
});
test("foreign Square customer is rejected before storing a card; metadata fails closed too", async () => {
  remote.customer_id = "another-customer";
  const before = requests.filter(r => r.path === "/v2/cards").length;
  try {
    assert.equal((await request("/api/membership/payment-card", replacement)).status, 409);
    assert.equal((await request("/api/membership/billing")).status, 503);
    assert.equal(requests.filter(r => r.path === "/v2/cards").length, before);
  } finally { remote.customer_id = "fixture-customer"; }
});
test("declined card keeps subscription unchanged and gives safe retry guidance", async () => {
  declineCard = true;
  const before = requests.filter(r => r.body.subscription?.card_id).length;
  try {
    const result = await request("/api/membership/payment-card", replacement);
    assert.equal(result.status, 422);
    assert.match((await result.json() as any).message, /try another card/);
    assert.equal(remote.card_id, "fixture-card-old");
    assert.equal(requests.filter(r => r.body.subscription?.card_id).length, before);
  } finally { declineCard = false; }
});
test("retry changes only the existing subscription card and preserves pending upgrade and minimum term", async () => {
  await db.update(membershipBillingStates).set({
    commitmentStartDate: "2099-10-13", commitmentEndDate: "2100-10-13",
  }).where(eq(membershipBillingStates.subscriptionId, subId));
  const beforeSub = await storage.getMembershipSubscriptionByCustomer(customerId);
  const beforeState = await billingState(subId);
  assert.equal(beforeState?.pendingPlanId, blackId);
  assert.equal(beforeState?.commitmentEndDate, "2100-10-13");
  const result = await request("/api/membership/payment-card", { ...replacement, sourceId: "cnon:fixture-retry" });
  assert.equal(result.status, 200);
  const update = requests.find(r => r.body.subscription?.card_id);
  assert.equal(update?.path, `/v2/subscriptions/${remote.id}`);
  assert.deepEqual(update?.body, { subscription: { card_id: card.id, version: 3 } });
  assert.deepEqual(await storage.getMembershipSubscriptionByCustomer(customerId), beforeSub);
  assert.deepEqual(await billingState(subId), beforeState);
  assert.equal(actions[0].type, "SWAP_PLAN");
  assert.equal(requests.some(r => r.path === "/v2/payments" || r.path === "/v2/subscriptions"), false);
  const saved = requests.filter(r => r.path === "/v2/cards").at(-1)!;
  assert.equal(saved.body.card.customer_id, remote.customer_id);
  assert.equal(saved.body.verification_token, replacement.verificationToken);
});
test("billing returns only permitted display metadata, never provider IDs or PII", async () => {
  const result = await request("/api/membership/billing");
  assert.equal(result.status, 200);
  const data = await result.json() as any;
  assert.deepEqual(data.subscription.paymentCard, { brand: "VISA", last4: "1111", expiryMonth: 12, expiryYear: 2030 });
  assert.equal(data.subscription.cardReplacementAllowed, true);
  assert.equal(JSON.stringify(data).includes("private"), false);
  assert.equal(JSON.stringify(data).includes("fixture-card"), false);
});
test("failed subscription update can retry the same authorisation without duplicating the saved card", async () => {
  failCardUpdate = true;
  try {
    assert.equal((await request("/api/membership/payment-card", replacement)).status, 409);
  } finally { failCardUpdate = false; }
  assert.equal((await request("/api/membership/payment-card", replacement)).status, 200);
  const attempts = requests.filter(r => r.path === "/v2/cards" && r.body.source_id === replacement.sourceId);
  assert.equal(attempts.at(-1)!.body.idempotency_key, attempts.at(-2)!.body.idempotency_key);
});
test("terminated memberships reject replacement before card authorisation", async () => {
  remote.status = "CANCELED";
  const before = requests.filter(r => r.path === "/v2/cards").length;
  try {
    assert.equal((await request("/api/membership/payment-card", replacement)).status, 409);
    assert.equal(requests.filter(r => r.path === "/v2/cards").length, before);
  } finally { remote.status = "ACTIVE"; }
});
test("a Square lifecycle event alone must not grant upgraded benefits", async () => {
  await reconcileScheduledMembership({ id: remote.id, plan_variation_id: "fixture-black-monthly", status: "ACTIVE" });
  assert.equal((await storage.getMembershipSubscriptionByCustomer(customerId))?.planId, oldId);
});
test("existing members cannot use signup to create a second subscription", async () => {
  const result = await request("/api/membership/join", { planId: blackId, billingFrequency: "monthly", termsAccepted: true, minimumTermAccepted: true });
  assert.equal(result.status, 409);
  assert.equal((await result.json() as any).code, "MEMBERSHIP_EXISTS");
});
test("Black minimum term rejects cancellation before any Square cancel request", async () => {
  actions = [];
  await db.delete(membershipBillingStates).where(eq(membershipBillingStates.subscriptionId, subId));
  await recordBillingTerms(subId, { name: "Black" }, "monthly", "2099-10-13");
  const result = await request("/api/membership/cancel", { confirmed: true });
  assert.equal(result.status, 409);
  assert.match((await result.json() as any).message, /minimum term/);
  assert.equal(requests.filter(r => r.path.endsWith("/cancel")).length, 0);
});
test("terms snapshot cannot be overwritten by retry, and expired term allows cancellation", async () => {
  await recordBillingTerms(subId, { name: "Gold" }, "annual", "2000-01-01");
  assert.equal((await billingState(subId))?.commitmentEndDate, "2100-10-13");
  await db.update(membershipBillingStates).set({ commitmentEndDate: "2000-01-01" }).where(eq(membershipBillingStates.subscriptionId, subId));
  const result = await request("/api/membership/cancel", { confirmed: true });
  assert.equal(result.status, 200);
  assert.equal((await storage.getMembershipSubscriptionByCustomer(customerId))?.status, "active");
  assert.equal((await billingState(subId))?.cancellationDate, renewal);
});
test("migration requires a verified stopped legacy payment and a paid-through date", async () => {
  await assert.rejects(() => migrationBillingStart(subId), /verify/);
  await db.update(membershipSubscriptions).set({ source: "wix_import", squareSubscriptionId: null }).where(eq(membershipSubscriptions.id, subId));
  const result = await request(`/api/staff/wix-migration/${subId}/review`, { legacyBillingStopped: true, paidThroughDate: renewal });
  assert.equal(result.status, 200);
  assert.equal(await migrationBillingStart(subId), renewal);
  assert.equal(requests.filter(r => r.path.endsWith("/cancel")).length, 1);
});
test("legacy Maximum migration offers Platinum and changes benefits only after paid confirmation", async () => {
  const maximum = (await storage.getMembershipPlans()).find(p => p.tier === "maximum");
  assert.ok(maximum);
  const platinum = await migrationOffer(maximum);
  assert.equal(platinum.tier, "platinum");
  assert.equal(platinum.priceMonthly, 699);
  assert.equal(platinum.priceAnnual, 6500);
  await db.delete(membershipBillingStates).where(eq(membershipBillingStates.subscriptionId, subId));
  await db.update(membershipSubscriptions).set({ planId: maximum.id, squareSubscriptionId: remote.id }).where(eq(membershipSubscriptions.id, subId));
  const start = new Date().toISOString().slice(0, 10);
  await prepareMigrationOffer(subId, maximum.id, platinum, "annual", start);
  await alignBillingStart(subId, maximum, start);
  assert.equal((await storage.getMembershipSubscriptionByCustomer(customerId))?.planId, maximum.id);
  assert.ok((await billingState(subId))?.commitmentEndDate);
  const confirmed = { ...remote, plan_variation_id: platinum.squarePlanVariationIdAlt };
  await reconcileScheduledMembership(confirmed);
  assert.equal((await storage.getMembershipSubscriptionByCustomer(customerId))?.planId, maximum.id);
  await reconcileScheduledMembership(confirmed, true);
  assert.equal((await storage.getMembershipSubscriptionByCustomer(customerId))?.planId, platinum.id);
  assert.equal((await billingState(subId))?.billingFrequency, "annual");
  assert.equal((await billingState(subId))?.pendingPlanId, null);
});
test("changing only billing frequency preserves the accepted minimum-term dates", async () => {
  const platinum = (await storage.getMembershipPlans()).find(p => p.tier === "platinum");
  assert.ok(platinum);
  const start = "2025-01-15";
  const end = "2026-01-15";
  await db.update(membershipBillingStates).set({
    billingFrequency: "monthly", commitmentStartDate: start, commitmentEndDate: end,
    pendingPlanId: platinum.id, pendingFrequency: "annual",
    pendingEffectiveDate: new Date().toISOString().slice(0, 10),
  }).where(eq(membershipBillingStates.subscriptionId, subId));
  await reconcileScheduledMembership({ ...remote, plan_variation_id: platinum.squarePlanVariationIdAlt }, true);
  const state = await billingState(subId);
  assert.equal(state?.billingFrequency, "annual");
  assert.equal(state?.commitmentStartDate, start);
  assert.equal(state?.commitmentEndDate, end);
  assert.equal(state?.pendingPlanId, null);
});
test("a paid annual member can stop renewal while retaining access through the full term", async () => {
  const state = await billingState(subId);
  assert.ok(state?.commitmentEndDate);
  cancellationAt = state.commitmentEndDate;
  remote.charged_through_date = cancellationAt;
  const sub = await storage.getMembershipSubscriptionByCustomer(customerId);
  remote.plan_variation_id = (await storage.getMembershipPlan(sub!.planId))!.squarePlanVariationIdAlt;
  await db.update(membershipSubscriptions).set({ currentPeriodEnd: cancellationAt }).where(eq(membershipSubscriptions.id, subId));
  const overview = await request("/api/membership/billing");
  assert.equal(((await overview.json()) as any).subscription.cancellationAllowed, true);
  const result = await request("/api/membership/cancel", { confirmed: true });
  assert.equal(result.status, 200);
  assert.equal((await billingState(subId))?.cancellationDate, cancellationAt);
  assert.equal((await storage.getMembershipSubscriptionByCustomer(customerId))?.status, "active");
  assert.equal(requests.filter(r => r.path.endsWith("/cancel")).length, 2);
});
