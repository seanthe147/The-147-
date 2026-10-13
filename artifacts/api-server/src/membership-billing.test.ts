import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import express from "express";
import { eq, inArray } from "drizzle-orm";
import { customers, membershipPlans, membershipSubscriptions, membershipBillingStates, membershipAuditLog } from "@workspace/db/schema";
import { db, runStartupMigrations, storage } from "./storage";
import { billingState, migrationBillingStart, recordBillingTerms, registerMembershipBilling, reconcileScheduledMembership, membershipSignupGuard } from "./membership-billing";

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
const renewal = "2099-11-13";
const remote: any = { id: "billing-fixture-sub", status: "ACTIVE", plan_variation_id: "fixture-monthly", actions };

before(async () => {
  // Every Square request is intercepted. These tests never reach the provider.
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (/^https:\/\/connect(?:\.squareup|\.squareupsandbox)\.com\//.test(url)) {
      const path = new URL(url).pathname;
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      requests.push({ path, body });
      if (path.includes("/catalog/")) {
        return Response.json({ object: { subscription_plan_variation_data: { phases: [{ cadence: "MONTHLY", pricing: { type: "STATIC", price_money: { amount: catalogPence, currency: "GBP" } } }] } } });
      }
      if (path.endsWith("/swap-plan")) {
        actions = [{ type: "SWAP_PLAN", effective_date: renewal }];
        return Response.json({ subscription: { ...remote, actions: undefined }, actions });
      }
      if (path.endsWith("/cancel")) return Response.json({ subscription: { ...remote, canceled_date: renewal } });
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
    customerId, planId: oldId, status: "active", squareSubscriptionId: remote.id,
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
