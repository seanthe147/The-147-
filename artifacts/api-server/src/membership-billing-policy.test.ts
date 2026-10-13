import assert from "node:assert/strict";
import test from "node:test";
import { addCalendarMonths, cancellationAllowed, commitmentEnd, minimumTermMonths, validDate, variationForFrequency } from "./membership-billing-policy.ts";

test("only Black and Platinum receive 12-month minimum terms", () => {
  assert.equal(minimumTermMonths({ name: "Black", tier: "black" }), 12);
  assert.equal(minimumTermMonths({ name: "Platinum", tier: "platinum" }), 12);
  assert.equal(minimumTermMonths({ name: "The 147 Black Membership" }), 12);
  assert.equal(minimumTermMonths({ name: "Gold", tier: "gold" }), 0);
  assert.equal(minimumTermMonths({ name: "Black Friday special" }), 0);
});
test("commitments expire after 12 calendar months, including leap day", () => {
  assert.equal(commitmentEnd({ name: "Platinum" }, "2024-02-29"), "2025-02-28");
  assert.equal(commitmentEnd({ name: "Black" }, "2026-10-13"), "2027-10-13");
  assert.equal(commitmentEnd({ name: "Gold" }, "2026-10-13"), null);
});
test("monthly renewals clamp to month end instead of skipping February", () => {
  assert.equal(addCalendarMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(addCalendarMonths("2024-01-31", 1), "2024-02-29");
});
test("cancellation allowed on/after minimum-term end", () => {
  assert.equal(cancellationAllowed("2027-10-13", "2027-10-12"), false);
  assert.equal(cancellationAllowed("2027-10-13", "2027-10-13"), true);
  assert.equal(cancellationAllowed(null, "2026-10-13"), true);
});
test("annual billing must never fall back to a monthly Square variation", () => {
  assert.throws(() => variationForFrequency({ squarePlanVariationId: "monthly", priceAnnual: 10000 }, "annual"));
  assert.equal(variationForFrequency({ squarePlanVariationId: "monthly", squarePlanVariationIdAlt: "annual", priceAnnual: 10000 }, "annual"), "annual");
});
test("impossible dates cannot authorise a Wix migration", () => {
  for (const value of ["2026-02-30", "2026-13-01", "13/10/2026", "", null]) assert.equal(validDate(value), false);
  assert.equal(validDate("2026-10-13"), true);
});
