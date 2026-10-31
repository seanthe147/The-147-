import type { MembershipPlan } from "@workspace/db/schema";
import * as square from "./square";
import { squareCadenceForPlan } from "./membership-billing-policy";

/** Add Wix's Blue and Pink offers without overwriting staff edits on later boots. */
export async function applyBluePinkMembershipPlans(client: {
  query: (sql: string, params?: any[]) => Promise<any>;
}) {
  await client.query("BEGIN");
  try {
    await client.query("SELECT pg_advisory_xact_lock(14703, 3)");
    await client.query(
      `INSERT INTO membership_plans
        (name, tier, price_monthly, hours_included, hours_unit, food_drink_discount,
         priority_booking, loyalty_multiplier, guest_passes_monthly, price_annual,
         active, hide_from_signup, sort_order, color, description)
       VALUES
        ('Blue', 'blue', 399, NULL, 'month', 0, FALSE, 1, 0, NULL,
         TRUE, TRUE, 4, '#2563EB',
         'No sign-in fees; 10% off snooker hourly rate.'),
        ('Pink', 'pink', 299, NULL, 'month', 0, FALSE, 1, 0, 2000,
         TRUE, TRUE, 5, '#EC4899',
         'No sign-in fees. Annual option includes 10% off snooker hourly rate.')
       ON CONFLICT (tier) DO NOTHING`,
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

type PublicOffer = Pick<MembershipPlan,
  "id" | "name" | "priceMonthly" | "priceAnnual" | "active" | "squarePlanVariationId" |
  "squarePlanVariationIdAlt" | "hideFromSignup"
> & Partial<Pick<MembershipPlan, "squareCustomerGroupId" | "tier">>;

type MembershipCatalogProvider = Pick<typeof square,
  "isConfigured" | "createCatalogSubscriptionPlan" | "validateSquareBillingVariation" |
  "getOrCreateCustomerGroup" | "membershipGroupName"
>;

/** Create and verify every advertised cadence before exposing a new offer. */
export async function provisionMembershipOffer(
  offer: PublicOffer,
  update: (changes: Partial<MembershipPlan>) => Promise<MembershipPlan | undefined>,
  provider: MembershipCatalogProvider = square,
): Promise<MembershipPlan> {
  if (!offer.active) throw new Error("An inactive membership cannot be published.");
  if (!provider.isConfigured()) throw new Error("Square must be configured before publishing this membership.");

  let current: PublicOffer = { ...offer };
  for (const frequency of ["monthly", "annual"] as const) {
    const amount = frequency === "monthly" ? current.priceMonthly : current.priceAnnual;
    if (amount == null) continue;

    const key = frequency === "monthly" ? "squarePlanVariationId" : "squarePlanVariationIdAlt";
    let variationId = current[key];
    if (!variationId) {
      const created = await provider.createCatalogSubscriptionPlan({
        localPlanId: current.id,
        name: current.name,
        amountPence: amount,
        frequency,
        cadence: squareCadenceForPlan(current, frequency),
      });
      variationId = created.squarePlanVariationId;
      if (!variationId) throw new Error(`Square did not return a ${frequency} rate for ${current.name}.`);
      current = {
        ...current,
        [key]: variationId,
      };
      await update({ [key]: variationId });
    }

    await provider.validateSquareBillingVariation(
      variationId, frequency, amount, squareCadenceForPlan(current, frequency),
    );
  }

  if (!current.squareCustomerGroupId) {
    const squareCustomerGroupId = await provider.getOrCreateCustomerGroup(
      provider.membershipGroupName(current.name),
    );
    if (!squareCustomerGroupId) throw new Error(`Square did not return a customer group for ${current.name}.`);
    current = { ...current, squareCustomerGroupId };
    await update({ squareCustomerGroupId });
  }

  const published = await update({ hideFromSignup: false });
  if (!published) throw new Error(`Could not publish ${current.name} after verifying its Square setup.`);
  return published;
}
