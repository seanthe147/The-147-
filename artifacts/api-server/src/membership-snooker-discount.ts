import * as square from "./square";

export const SNOOKER_RATE_VARIATIONS = [
  { id: "IDQPE7ZQ7DZLVX2GLS7AF63Q", itemName: "Standard Snooker Hour" },
  { id: "X42RSRX33SCZWJ2DQLDC2KH6", itemName: "Match Table Snooker Hour" },
] as const;

type MembershipPlanForDiscount = {
  tier: string;
  active: boolean;
  hideFromSignup: boolean;
  squareCustomerGroupId: string | null;
};

type SnookerCatalogRow = {
  variationId: string;
  itemName: string;
  variationName: string;
  pricePence: number | null;
  currency: string | null;
};

type SnookerDiscountProvider = {
  listMembershipPosCatalog(): Promise<SnookerCatalogRow[]>;
  getOrCreateCustomerGroup(name: string): Promise<string>;
  snookerDiscountCustomerGroupName(tier: square.SnookerDiscountTier): string;
  provisionSnookerMemberDiscount(options: {
    productVariationIds: string[];
    customerGroupIds: string[];
  }): Promise<{ discountId: string; productSetId: string; pricingRuleId: string }>;
};

/**
 * Configure Square only after both offers are live and the exact Square rate
 * variations still match the catalog snapshot used to scope the discount.
 */
export async function provisionSnookerMembershipDiscount(
  plans: MembershipPlanForDiscount[],
  provider: SnookerDiscountProvider = square,
) {
  const blue = plans.find(plan => plan.tier === "blue");
  const pink = plans.find(plan => plan.tier === "pink");
  if (!blue?.active || blue.hideFromSignup || !blue.squareCustomerGroupId ||
      !pink?.active || pink.hideFromSignup || !pink.squareCustomerGroupId) {
    throw new Error("Blue and Pink plans must both be active and fully connected to Square before enabling the snooker discount.");
  }

  const catalog = await provider.listMembershipPosCatalog();
  const variationIds: string[] = [];
  for (const expected of SNOOKER_RATE_VARIATIONS) {
    const matches = catalog.filter(item => item.variationId === expected.id);
    if (matches.length !== 1) {
      throw new Error(`Expected exactly one Square catalog variation for ${expected.itemName}; discount setup was stopped.`);
    }
    const item = matches[0];
    if (item.itemName !== expected.itemName || item.variationName !== "Regular" ||
        item.currency !== "GBP" || !Number.isFinite(item.pricePence) || (item.pricePence ?? 0) <= 0) {
      throw new Error(`Square catalog details changed for ${expected.itemName}; discount setup was stopped for review.`);
    }
    variationIds.push(item.variationId);
  }

  const blueDiscountGroupId = await provider.getOrCreateCustomerGroup(
    provider.snookerDiscountCustomerGroupName("blue"),
  );
  const pinkAnnualDiscountGroupId = await provider.getOrCreateCustomerGroup(
    provider.snookerDiscountCustomerGroupName("pinkAnnual"),
  );
  const result = await provider.provisionSnookerMemberDiscount({
    productVariationIds: variationIds,
    customerGroupIds: [blueDiscountGroupId, pinkAnnualDiscountGroupId],
  });

  return {
    ...result,
    productVariationIds: variationIds,
    customerGroupIds: [blueDiscountGroupId, pinkAnnualDiscountGroupId],
  };
}
