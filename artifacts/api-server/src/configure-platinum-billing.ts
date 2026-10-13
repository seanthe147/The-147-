// Explicit operator setup for the user-approved offer. Creates only catalog
// objects: no card capture, subscriptions, cancellations or customer charges.
import { storage } from "./storage";
import { createCatalogSubscriptionPlan, validateSquareBillingVariation } from "./square";

const plan = (await storage.getMembershipPlans()).find(p => p.tier === "platinum");
if (!plan) throw new Error("Existing Platinum plan not found; do not create a duplicate.");
const monthly = await createCatalogSubscriptionPlan({ localPlanId: plan.id, name: "Platinum", amountPence: 699, frequency: "monthly" });
const annual = await createCatalogSubscriptionPlan({ localPlanId: plan.id, name: "Platinum", amountPence: 6500, frequency: "annual" });
await validateSquareBillingVariation(monthly.squarePlanVariationId, "monthly", 699);
await validateSquareBillingVariation(annual.squarePlanVariationId, "annual", 6500);
console.log(JSON.stringify({ monthlyVariationId: monthly.squarePlanVariationId, annualVariationId: annual.squarePlanVariationId }));
process.exit(0);
