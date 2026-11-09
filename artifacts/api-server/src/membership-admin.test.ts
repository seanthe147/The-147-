import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Script } from "node:vm";
import { eq } from "drizzle-orm";
import {
  membershipPlanChanges, membershipPlanCreation, membershipMemberChanges,
  protectedMembership, changesProtectedBilling, validMemberPeriod,
} from "./membership-admin-policy";
import { prepareMembershipSaleRates } from "./membership-plan-admin";
import { registerMembershipBilling, reconcileScheduledMembership, billingState } from "./membership-billing";
import { db, storage } from "./storage";
import { customers, membershipPlans, membershipSubscriptions, membershipBillingStates, membershipPlanVariationAliases, membershipAuditLog } from "@workspace/db/schema";
import type { MembershipPlan } from "@workspace/db/schema";

const plan = { id: 40, name: "Fixture membership", tier: "fixture", active: true,
  hideFromSignup: false, priceMonthly: 699, priceAnnual: 6500,
  squarePlanVariationId: "monthly-old", squarePlanVariationIdAlt: "annual-old" } as MembershipPlan;
const member = { source: "square", squareSubscriptionId: "fixture-sub", status: "active",
  planId: 40, currentPeriodStart: "2026-01-01", currentPeriodEnd: "2026-02-01" };

test("plan editor rejects invalid prices, allowances and unknown writable fields", () => {
  for (const input of [{ priceMonthly: -1 }, { priceMonthly: 699.5 }, { priceAnnual: -1 },
    { foodDrinkDiscount: 101 }, { loyaltyMultiplier: 0 }, { hoursIncluded: -2 }, { id: 99 }, { active: "false" }]) {
    assert.equal(membershipPlanChanges.safeParse(input).success, false, JSON.stringify(input));
  }
  assert.equal(membershipPlanCreation.safeParse({ name: "   ", priceMonthly: 699 }).success, false);
  assert.equal(membershipPlanCreation.safeParse({ name: "Platinum", priceMonthly: 699, priceAnnual: 6500 }).success, true);
  assert.equal(membershipPlanChanges.safeParse({ priceAnnual: null, hideFromSignup: true }).success, true);
});

test("member editor validates notes, usage, dates, identity and status", () => {
  for (const input of [{ status: "anything" }, { customerId: 99 }, { hoursUsedThisPeriod: -1 },
    { hoursUsedThisPeriod: 1.5 }, { guestPassesUsed: -1 }, { currentPeriodEnd: "2026-02-30" }, { staffNotes: "x".repeat(501) }]) {
    assert.equal(membershipMemberChanges.safeParse(input).success, false, JSON.stringify(input));
  }
  assert.equal(membershipMemberChanges.safeParse({ staffNotes: null, hoursUsedThisPeriod: 2, guestPassesUsed: 0 }).success, true);
});

test("Square and Wix records cannot use manual billing edits, including pending records without provider ID", () => {
  for (const source of ["square", "square_annual", "square_pos", "wix_import", "wix", "wix_migrated", "app", "app_annual_native"]) {
    assert.equal(protectedMembership({ source, squareSubscriptionId: null }), true);
  }
  assert.equal(protectedMembership({ source: "staff" }), false);
  assert.equal(protectedMembership({ source: "staff", squareSubscriptionId: "fixture" }), true);
  for (const changes of [{ status: "cancelled" as const }, { planId: 99 }, { currentPeriodEnd: "2027-01-01" }, { currentPeriodStart: null }]) {
    assert.equal(changesProtectedBilling(member, changes), true);
  }
  assert.equal(changesProtectedBilling(member, { staffNotes: "test", hoursUsedThisPeriod: 2 }), false);
  assert.equal(changesProtectedBilling(member, { status: "active", planId: 40, currentPeriodEnd: "2026-02-01" }), false);
});

function fixtureProvider() {
  const created: { amountPence: number; frequency?: string }[] = [];
  const validated: { id: string; frequency: string; amount: number }[] = [];
  return {
    created, validated,
    isConfigured: () => true,
    createCatalogSubscriptionPlan: async (input: { localPlanId: number; name: string; amountPence: number; frequency?: "monthly" | "annual" }) => {
      created.push(input);
      return { planId: input.localPlanId, squarePlanId: "fixture", squarePlanVariationId: `new-${input.frequency}` };
    },
    validateSquareBillingVariation: async (id: string, frequency: "monthly" | "annual", amount: number) => { validated.push({ id, frequency, amount }); },
  };
}

test("monthly and annual price edits prepare immutable rates independently", async () => {
  const provider = fixtureProvider();
  const result = await prepareMembershipSaleRates({ ...plan, priceMonthly: 799, priceAnnual: 7500 }, plan, provider);
  assert.deepEqual(result.rates, { squarePlanVariationId: "new-monthly", squarePlanVariationIdAlt: "new-annual" });
  assert.deepEqual(provider.created.map(p => [p.frequency, p.amountPence]), [["monthly", 799], ["annual", 7500]]);
  assert.equal(plan.squarePlanVariationId, "monthly-old");
  assert.equal(plan.squarePlanVariationIdAlt, "annual-old");
  const annualOnly = fixtureProvider();
  await prepareMembershipSaleRates({ ...plan, priceAnnual: 7500 }, plan, annualOnly);
  assert.deepEqual(annualOnly.created.map(p => p.frequency), ["annual"]);
});

test("hidden plans do not touch Square; public plans require confirmed billing and annual setup is not skipped", async () => {
  const unavailable = { ...fixtureProvider(), isConfigured: () => false };
  assert.deepEqual((await prepareMembershipSaleRates({ ...plan, hideFromSignup: true }, plan, unavailable)).rates, {});
  await assert.rejects(prepareMembershipSaleRates(plan, undefined, unavailable), /Square must be configured/);
  const provider = fixtureProvider();
  const result = await prepareMembershipSaleRates({ ...plan, squarePlanVariationIdAlt: null }, plan, provider);
  assert.deepEqual(provider.created.map(p => p.frequency), ["annual"]);
  assert.equal(result.rates.squarePlanVariationIdAlt, "new-annual");
  const failed = { ...fixtureProvider(), validateSquareBillingVariation: async () => { throw new Error("Provider unavailable"); } };
  await assert.rejects(prepareMembershipSaleRates({ ...plan, priceMonthly: 799 }, plan, failed), /Provider unavailable/);
});

test("staff billing routes preserve viewing and plan-change access while cancellation requires a manager", () => {
  const routes: { path: string; handlers: unknown[] }[] = [];
  const app = { get: (path: string, ...handlers: unknown[]) => routes.push({ path, handlers }),
    post: (path: string, ...handlers: unknown[]) => routes.push({ path, handlers }) };
  const customer = (() => {}) as any, staff = (() => {}) as any, owner = (() => {}) as any, manager = (() => {}) as any;
  registerMembershipBilling(app as any, customer, staff, owner, manager);
  const staffBilling = routes.filter(r => r.path.startsWith("/api/staff/membership/subscriptions/"));
  assert.equal(staffBilling.length, 3);
  for (const route of staffBilling) {
    assert.equal(route.handlers[0], staff);
    if (route.path.endsWith("/cancel")) assert.equal(route.handlers[1], manager);
    else {
      // Plan-specific downgrade restrictions are enforced inside scheduleMembershipChange.
      assert.notEqual(route.handlers[1], manager);
      assert.equal(typeof route.handlers[1], "function");
    }
  }
});

test("editing only one member date cannot create a reversed membership period", () => {
  const existing = { currentPeriodStart: "2026-04-01", currentPeriodEnd: "2027-04-01" };
  assert.equal(validMemberPeriod(existing, { currentPeriodEnd: "2026-03-31" }), false);
  assert.equal(validMemberPeriod(existing, { currentPeriodStart: "2027-04-02" }), false);
  assert.equal(validMemberPeriod(existing, { currentPeriodEnd: "2027-05-01" }), true);
  assert.equal(validMemberPeriod(existing, { currentPeriodStart: null }), true);
  assert.equal(validMemberPeriod(existing, {}), true);
});

test("historic rates preserve a customer's agreed pending change after staff publishes a new sale rate", async () => {
  const tag = randomUUID();
  let customerId: number | undefined, planId: number | undefined, subId: number | undefined;
  try {
    const customer = await storage.createCustomer(`admin-billing-${tag}@example.invalid`, "Admin billing fixture", null, "!locked-fixture");
    customerId = customer.id;
    const offer = await storage.createMembershipPlan({
      name: "Admin billing fixture", tier: `admin-fixture-${tag}`, priceMonthly: 699,
      priceAnnual: 6500, hideFromSignup: true,
      squarePlanVariationId: `monthly-${tag}`, squarePlanVariationIdAlt: `annual-old-${tag}`,
    });
    planId = offer.id;
    const subscription = await storage.createMembershipSubscription({
      customerId, planId, status: "active", source: "square",
      squareSubscriptionId: `fixture-${tag}`, squareCustomerId: `fixture-customer-${tag}`,
    });
    subId = subscription.id;
    await db.insert(membershipBillingStates).values({
      subscriptionId: subId, billingFrequency: "monthly", pendingPlanId: planId,
      pendingFrequency: "annual", pendingEffectiveDate: "2020-01-01", commitmentEndDate: "2099-01-01",
    });
    await storage.updateMembershipPlan(planId, { priceAnnual: 7500, squarePlanVariationIdAlt: `annual-new-${tag}` });
    const [alias] = await db.select().from(membershipPlanVariationAliases)
      .where(eq(membershipPlanVariationAliases.squareVariationId, `annual-old-${tag}`));
    assert.equal(alias?.planId, planId);
    const event = { id: subscription.squareSubscriptionId, plan_variation_id: `annual-old-${tag}` };
    await reconcileScheduledMembership(event, false);
    assert.equal((await billingState(subId))?.pendingPlanId, planId);
    await reconcileScheduledMembership({ ...event, plan_variation_id: `unrelated-${tag}` }, true);
    assert.equal((await billingState(subId))?.pendingPlanId, planId);
    await reconcileScheduledMembership(event, true);
    const state = await billingState(subId);
    assert.equal(state?.billingFrequency, "annual");
    assert.equal(state?.pendingPlanId, null);
    assert.equal(state?.commitmentEndDate, "2099-01-01");
  } finally {
    if (subId) {
      await db.delete(membershipBillingStates).where(eq(membershipBillingStates.subscriptionId, subId));
      await db.delete(membershipAuditLog).where(eq(membershipAuditLog.subscriptionId, subId));
      await db.delete(membershipSubscriptions).where(eq(membershipSubscriptions.id, subId));
    }
    if (planId) {
      await db.delete(membershipPlanVariationAliases).where(eq(membershipPlanVariationAliases.planId, planId));
      await db.delete(membershipPlans).where(eq(membershipPlans.id, planId));
    }
    if (customerId) await db.delete(customers).where(eq(customers.id, customerId));
  }
});

const dashboard = readFileSync("src/templates/staff-dashboard.html", "utf8");
function dashboardClick(buttonId: string, values: Record<string, string>, extra: Record<string, unknown> = {}) {
  const nodes: Record<string, any> = {};
  const listeners: Record<string, () => Promise<void>> = {};
  let requests = 0;
  const el = (id: string): any => nodes[id] ??= {
    value: values[id] ?? "", dataset: id === "editPlanModal" ? { planId: "1" } : {},
    style: {}, classList: { add() {}, remove() {} }, textContent: "", disabled: false,
    child: { textContent: "" }, querySelector() { return this.child; },
    addEventListener(_type: string, callback: () => Promise<void>) { listeners[id] = callback; },
  };
  const start = dashboard.indexOf(`el('${buttonId}').addEventListener('click',async()=>{`);
  assert.ok(start >= 0);
  const closing = "\n  });";
  const end = dashboard.indexOf(closing, start);
  assert.ok(end > start);
  new Script(dashboard.slice(start, end + closing.length)).runInNewContext({
    el, URL, window: { location: { origin: "https://example.invalid" } },
    api: async () => { requests++; throw new Error("Unexpected HTTP request"); }, ...extra,
  });
  return { run: listeners[buttonId], el, requestCount: () => requests };
}

test("staff plan UI rejects fractional multipliers instead of silently truncating benefits", async () => {
  const form = dashboardClick("epSaveBtn", { epName: "Fixture", epPrice: "6.99", epLoyaltyMult: "1.5" });
  await form.run();
  assert.match(form.el("epErr").textContent, /Loyalty multiplier must be a whole number/);
  assert.equal(form.requestCount(), 0);
});

test("staff signup links work without an existing app customer and never create a subscription or email", async () => {
  const form = dashboardClick("amSaveBtn", { amCustomerId: "", amPlanId: "42", amNotes: "Private staff note", amStartDate: "2026-10-15" }, {
    document: { querySelector: () => ({ dataset: { val: "paylink" } }) },
    membershipsData: { plans: [{ id: 42, active: true, hideFromSignup: false }] },
  });
  await form.run();
  const link = new URL(form.el("amLinkUrl").value);
  assert.equal(link.pathname, "/widget/membership");
  assert.equal(link.searchParams.get("planId"), "42");
  assert.equal([...link.searchParams.keys()].join(","), "planId");
  assert.match(form.el("amLinkResult").child.textContent, /no email has been sent/i);
  assert.equal(form.requestCount(), 0);
});

test("Wix-imported member banners never incorrectly claim Square management", () => {
  const line = dashboard.split("\n").find(line => line.includes("if(prot){pn.style.display"));
  assert.ok(line);
  const pn = { style: {}, textContent: "" };
  new Script(line).runInNewContext({ prot: true, pn, sub: { source: "wix_import" } });
  assert.match(pn.textContent, /^Wix-sourced membership/);
  assert.doesNotMatch(pn.textContent, /Square-managed/);
});
