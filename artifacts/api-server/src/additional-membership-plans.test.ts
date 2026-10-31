import assert from "node:assert/strict";
import test from "node:test";
import { applyBluePinkMembershipPlans, provisionMembershipOffer } from "./additional-membership-plans.ts";

test("Blue and Pink seed once and stay hidden until Square rates are verified", async () => {
  const calls: { sql: string; params?: any[] }[] = [];
  await applyBluePinkMembershipPlans({
    async query(sql, params) {
      calls.push({ sql, params });
      return { rows: [] };
    },
  });
  assert.equal(calls[0].sql, "BEGIN");
  assert.match(calls[2].sql, /ON CONFLICT \(tier\) DO NOTHING/);
  assert.match(calls[2].sql, /'Blue', 'blue', 399/);
  assert.match(calls[2].sql, /'Pink', 'pink', 299/);
  assert.match(calls[2].sql, /TRUE, TRUE, 4/);
  assert.match(calls[2].sql, /TRUE, TRUE, 5/);
  assert.equal(calls.at(-1)?.sql, "COMMIT");
});

test("Pink creates and confirms monthly and annual Square rates before publication", async () => {
  type CatalogInput = { localPlanId: number; name: string; amountPence: number; frequency?: "monthly" | "annual"; cadence?: "MONTHLY" | "THIRTY_DAYS" | "ANNUAL" };
  const changes: Record<string, unknown>[] = [];
  const created: string[] = [];
  const frequencies: string[] = [];
  const updatedPlan = {
    id: 2, name: "Pink", priceMonthly: 299, priceAnnual: 2000, active: true,
    squarePlanVariationId: null as string | null, squarePlanVariationIdAlt: null as string | null,
    hideFromSignup: true, tier: "pink", squareCustomerGroupId: null as string | null,
  };
  const result = await provisionMembershipOffer(updatedPlan, async update => {
    changes.push(update as Record<string, unknown>);
    Object.assign(updatedPlan, update);
    return updatedPlan as any;
  }, {
    isConfigured: () => true,
    async createCatalogSubscriptionPlan(input: CatalogInput) {
      created.push(`${input.frequency}:${input.amountPence}:${input.cadence}`);
      return { planId: input.localPlanId, squarePlanId: "parent", squarePlanVariationId: `${input.frequency}-rate` };
    },
    async validateSquareBillingVariation(_id: string, frequency: "monthly" | "annual", amount: number, cadence?: "MONTHLY" | "THIRTY_DAYS" | "ANNUAL") {
      frequencies.push(`${frequency}:${amount}`);
      assert.equal(cadence, frequency === "monthly" ? "THIRTY_DAYS" : "ANNUAL");
    },
    membershipGroupName: (name: string) => `147 Bradford — ${name} Members`,
    async getOrCreateCustomerGroup(name: string) {
      assert.equal(name, "147 Bradford — Pink Members");
      return "pink-square-group";
    },
  } as any);

  assert.deepEqual(created, ["monthly:299:THIRTY_DAYS", "annual:2000:ANNUAL"]);
  assert.deepEqual(frequencies, ["monthly:299", "annual:2000"]);
  assert.deepEqual(changes.slice(-2), [
    { squareCustomerGroupId: "pink-square-group" },
    { hideFromSignup: false },
  ]);
  assert.equal(result.hideFromSignup, false);
});

test("Blue publishes with only its monthly Square rate", async () => {
  type CatalogInput = { localPlanId: number; name: string; amountPence: number; frequency?: "monthly" | "annual"; cadence?: "MONTHLY" | "THIRTY_DAYS" | "ANNUAL" };
  const changes: Record<string, unknown>[] = [];
  const blue = {
    id: 1, name: "Blue", priceMonthly: 399, priceAnnual: null, active: true,
    squarePlanVariationId: null, squarePlanVariationIdAlt: null, hideFromSignup: true,
    tier: "blue", squareCustomerGroupId: null,
  };
  await provisionMembershipOffer(blue as any, async update => {
    changes.push(update as Record<string, unknown>);
    return { ...blue, ...update } as any;
  }, {
    isConfigured: () => true,
    async createCatalogSubscriptionPlan(input: CatalogInput) {
      assert.equal(input.cadence, "THIRTY_DAYS");
      return { planId: input.localPlanId, squarePlanId: "parent", squarePlanVariationId: "blue-monthly" };
    },
    async validateSquareBillingVariation() {},
    membershipGroupName: (name: string) => `147 Bradford — ${name} Members`,
    async getOrCreateCustomerGroup() { return "blue-square-group"; },
  } as any);
  assert.deepEqual(changes, [
    { squarePlanVariationId: "blue-monthly" },
    { squareCustomerGroupId: "blue-square-group" },
    { hideFromSignup: false },
  ]);
});

test("Square cadence mismatch leaves a new membership hidden", async () => {
  const changes: Record<string, unknown>[] = [];
  const pink = {
    id: 2, name: "Pink", priceMonthly: 299, priceAnnual: 2000, active: true,
    squarePlanVariationId: "pink-monthly", squarePlanVariationIdAlt: "pink-annual", hideFromSignup: true,
    tier: "pink", squareCustomerGroupId: null,
  };
  await assert.rejects(
    provisionMembershipOffer(pink as any, async update => {
      changes.push(update as Record<string, unknown>);
      return { ...pink, ...update } as any;
    }, {
      isConfigured: () => true,
      async createCatalogSubscriptionPlan() { throw new Error("Unexpected catalog create"); },
      async validateSquareBillingVariation(_id: string, frequency: "monthly" | "annual") {
        if (frequency === "annual") throw new Error("Square annual cadence does not match.");
      },
      membershipGroupName: () => "",
      async getOrCreateCustomerGroup() { return "unused"; },
    } as any),
    /annual cadence/,
  );
  assert.deepEqual(changes, []);
});
