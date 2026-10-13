/** Read-only pre-launch check. Never creates catalog items, customers or charges. */
import { storage } from "./storage";
import { isConfigured, validateSquareBillingVariation } from "./square";
import { variationForFrequency } from "./membership-billing-policy";

if (!isConfigured()) {
  console.error("Square is not configured. No billing can be enabled.");
  process.exit(1);
}
const plans = (await storage.getMembershipPlans()).filter(p => p.active && !p.hideFromSignup);
let failures = 0;
for (const plan of plans) {
  for (const frequency of ["monthly", "annual"] as const) {
    if (frequency === "annual" && plan.priceAnnual == null) continue;
    try {
      await validateSquareBillingVariation(variationForFrequency(plan, frequency), frequency,
        frequency === "annual" ? plan.priceAnnual! : plan.priceMonthly);
      console.log(`${plan.name}: ${frequency} price and cadence verified`);
    } catch (error) {
      failures++;
      console.error(`${plan.name}: ${frequency} unavailable — ${error instanceof Error ? error.message : "catalog check failed"}`);
    }
  }
}
process.exit(failures ? 1 : 0);
