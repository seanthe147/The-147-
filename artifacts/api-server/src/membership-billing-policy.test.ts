import assert from "node:assert/strict";
import test from "node:test";
import { addCalendarMonths, cancellationAllowed, commitmentEnd, membershipReactivationDeadline, minimumTermMonths, snookerRateDiscountPercent, validDate, variationForFrequency } from "./membership-billing-policy.ts";

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
test("membership reactivation is available for one calendar month after paid access ends", () => {
  assert.equal(membershipReactivationDeadline("2026-01-31", "2026-01-31"), null);
  assert.equal(membershipReactivationDeadline("2026-01-31", "2026-02-01"), "2026-02-28");
  assert.equal(membershipReactivationDeadline("2026-01-31", "2026-02-28"), "2026-02-28");
  assert.equal(membershipReactivationDeadline("2026-01-31", "2026-03-01"), null);
  assert.equal(membershipReactivationDeadline("invalid", "2026-02-01"), null);
});
test("cancellation allowed on/after minimum-term end", () => {
  assert.equal(cancellationAllowed("2027-10-13", "2027-10-12"), false);
  assert.equal(cancellationAllowed("2027-10-13", "2027-10-13"), true);
  assert.equal(cancellationAllowed(null, "2026-10-13"), true);
});
test("paid annual members can stop next year's renewal without shortening their 12-month access", () => {
  assert.equal(cancellationAllowed("2027-10-13", "2026-10-13", "2027-10-13"), true);
  assert.equal(cancellationAllowed("2027-10-13", "2026-10-13", "2026-11-13"), false);
});
test("annual billing must never fall back to a monthly Square variation", () => {
  assert.throws(() => variationForFrequency({ squarePlanVariationId: "monthly", priceAnnual: 10000 }, "annual"));
  assert.equal(variationForFrequency({ squarePlanVariationId: "monthly", squarePlanVariationIdAlt: "annual", priceAnnual: 10000 }, "annual"), "annual");
});
test("snooker-only member rate is limited to Blue monthly and Pink annual active memberships", () => {
  const base = { status: "active", planActive: true, periodEnd: "2027-01-01T00:00:00Z" };
  assert.equal(snookerRateDiscountPercent({ ...base, tier: "blue", billingFrequency: "monthly" }, new Date("2026-10-01")), 10);
  assert.equal(snookerRateDiscountPercent({ ...base, tier: "pink", billingFrequency: "annual" }, new Date("2026-10-01")), 10);
  assert.equal(snookerRateDiscountPercent({ ...base, tier: "pink", billingFrequency: "monthly" }, new Date("2026-10-01")), 0);
  assert.equal(snookerRateDiscountPercent({ ...base, tier: "platinum", billingFrequency: "annual" }, new Date("2026-10-01")), 0);
  assert.equal(snookerRateDiscountPercent({ ...base, tier: "blue", billingFrequency: "monthly", cancelledAt: "2026-09-30" }, new Date("2026-10-01")), 0);
  assert.equal(snookerRateDiscountPercent({ ...base, tier: "blue", billingFrequency: "monthly", status: "frozen" }, new Date("2026-10-01")), 0);
  assert.equal(snookerRateDiscountPercent({ ...base, tier: "blue", billingFrequency: "monthly", periodEnd: "2026-09-30T23:59:59Z" }, new Date("2026-10-01")), 0);
  assert.equal(snookerRateDiscountPercent({ ...base, tier: "blue", billingFrequency: "monthly", periodEnd: "2026-10-01" }, new Date("2026-10-01T22:00:00Z")), 10);
  assert.equal(snookerRateDiscountPercent({ ...base, tier: "blue", billingFrequency: "monthly", periodEnd: "2026-09-30" }, new Date("2026-10-01T22:00:00Z")), 0);
});
test("impossible dates cannot authorise a Wix migration", () => {
  for (const value of ["2026-02-30", "2026-13-01", "13/10/2026", "", null]) assert.equal(validDate(value), false);
  assert.equal(validDate("2026-10-13"), true);
});
