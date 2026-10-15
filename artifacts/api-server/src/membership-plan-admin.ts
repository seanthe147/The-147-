import type { MembershipPlan } from "@workspace/db/schema";
import * as square from "./square";

/** Prepare immutable sale rates BEFORE publishing local price changes.
 * Existing Square subscriptions retain their original variations and prices. */
export async function prepareMembershipSaleRates(plan: MembershipPlan, previous?: MembershipPlan) {
  if (!plan.active || plan.hideFromSignup) return { squareSynced: false, rates: {} };
  if (!square.isConfigured()) throw new Error("Square must be configured before publishing a membership for customer purchase.");
  const rates: { squarePlanVariationId?: string; squarePlanVariationIdAlt?: string | null } = {};
  for (const frequency of ["monthly", "annual"] as const) {
    const key = frequency === "monthly" ? "squarePlanVariationId" : "squarePlanVariationIdAlt";
    const amount = frequency === "monthly" ? plan.priceMonthly : plan.priceAnnual;
    if (amount == null) { if (frequency === "annual") rates.squarePlanVariationIdAlt = null; continue; }
    const oldAmount = frequency === "monthly" ? previous?.priceMonthly : previous?.priceAnnual;
    let id = plan[key];
    const suppliedNewId = !!id && id !== previous?.[key];
    const changed = !previous || previous.name !== plan.name || oldAmount !== amount ||
      !previous.active || previous.hideFromSignup || !id;
    if (!changed && !suppliedNewId) continue;
    if (!id || (changed && previous && !suppliedNewId)) {
      id = (await square.createCatalogSubscriptionPlan({
        localPlanId: plan.id, name: plan.name, amountPence: amount, frequency,
      })).squarePlanVariationId;
    }
    await square.validateSquareBillingVariation(id, frequency, amount);
    rates[key] = id;
  }
  return { squareSynced: Object.keys(rates).length > 0, rates };
}
