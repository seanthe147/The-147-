import assert from "node:assert/strict";
import test from "node:test";
import {
  provisionSnookerMembershipDiscount,
  SNOOKER_RATE_VARIATIONS,
} from "./membership-snooker-discount";

const visiblePlans = [
  { tier: "blue", active: true, hideFromSignup: false, squareCustomerGroupId: "blue-general" },
  { tier: "pink", active: true, hideFromSignup: false, squareCustomerGroupId: "pink-general" },
];

function providerWith(rows = SNOOKER_RATE_VARIATIONS.map(item => ({
  variationId: item.id,
  itemName: item.itemName,
  variationName: "Regular",
  pricePence: 795,
  currency: "GBP",
}))) {
  let discount: any;
  const groups: string[] = [];
  return {
    groups,
    get discount() { return discount; },
    listMembershipPosCatalog: async () => rows,
    getOrCreateCustomerGroup: async (name: string) => {
      groups.push(name);
      return name.toLowerCase().includes("blue") ? "blue-snooker" : "pink-annual-snooker";
    },
    snookerDiscountCustomerGroupName: (tier: string) => `${tier} Snooker`,
    provisionSnookerMemberDiscount: async (options: any) => {
      discount = options;
      return { discountId: "discount", productSetId: "set", pricingRuleId: "rule" };
    },
  };
}

test("provisions the POS discount for only the two verified snooker hourly variations", async () => {
  const provider = providerWith();
  const result = await provisionSnookerMembershipDiscount(visiblePlans, provider as any);

  assert.deepEqual(result.productVariationIds, SNOOKER_RATE_VARIATIONS.map(item => item.id));
  assert.deepEqual(provider.discount.productVariationIds, SNOOKER_RATE_VARIATIONS.map(item => item.id));
  assert.deepEqual(provider.discount.customerGroupIds, ["blue-snooker", "pink-annual-snooker"]);
  assert.equal(provider.groups.length, 2);
});

test("fails closed if an advertised plan is not live in Square", async () => {
  const provider = providerWith();
  await assert.rejects(
    provisionSnookerMembershipDiscount(
      [{ ...visiblePlans[0], hideFromSignup: true }, visiblePlans[1]],
      provider as any,
    ),
    /must both be active/,
  );
  assert.equal(provider.discount, undefined);
});

test("fails closed when a Square snooker variation has been changed or removed", async () => {
  const rows = SNOOKER_RATE_VARIATIONS.slice(1).map(item => ({
    variationId: item.id,
    itemName: item.itemName,
    variationName: "Regular",
    pricePence: 795,
    currency: "GBP",
  }));
  const provider = providerWith(rows);
  await assert.rejects(
    provisionSnookerMembershipDiscount(visiblePlans, provider as any),
    /Expected exactly one Square catalog variation/,
  );
  assert.equal(provider.discount, undefined);
});
