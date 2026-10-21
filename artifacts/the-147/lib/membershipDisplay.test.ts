import { test } from "node:test";
import assert from "node:assert/strict";
import { accessEndDate, addMonthsIso, billingSummary, canonicalBenefits, hasManageableMembership, isUpgradeOffer, statusInfo, type BillingSub } from "./membershipDisplay";

const sub = (overrides: Partial<BillingSub> = {}): BillingSub => ({
  id: 1, planId: 4, planName: "Platinum", currentTier: "platinum", currentMonthlyPence: 699, source: "app",
  frequency: "monthly", status: "active", renewalDate: "2030-08-01",
  commitmentEndDate: null, cancellationAllowed: true, cancellationReversible: false, pendingPlanName: null,
  pendingDate: null, cancellationDate: null, managedInSquare: true,
  migrationNeedsReview: false, ...overrides,
});

test("canonical benefits ignore stale unlimited descriptions and respect yearly hours", () => {
  const plan = { description: "Unlimited snooker", hoursIncluded: 10, hoursUnit: "year", snookerUnlimited: false };
  const benefits = canonicalBenefits(plan);
  assert.equal(benefits[0].text, "10 hours snooker per year");
  assert.ok(!benefits.some(b => b.text.includes("Unlimited")));
});

test("server benefit wording is used; monthly and unlimited fallback are accurate", () => {
  assert.deepEqual(canonicalBenefits({ benefitsDetailed: [{ key: "hours", text: "Club-approved allowance" }], hoursIncluded: 10 }),
    [{ key: "hours", text: "Club-approved allowance" }]);
  assert.equal(canonicalBenefits({ hoursIncluded: 4, hoursUnit: "month" })[0].text, "4 hours snooker per month");
  assert.equal(canonicalBenefits({ snookerUnlimited: true })[0].text, "Unlimited snooker access");
  assert.ok(!canonicalBenefits({ loyaltyMultiplier: 1 }).some(b => b.key === "loyalty"));
});

test("held and pending members retain management instead of duplicate signup", () => {
  for (const status of ["held", "frozen", "pending", "pending_start", "paused", "active"]) {
    assert.equal(hasManageableMembership(sub({ status })), true);
  }
  assert.equal(hasManageableMembership(null), false);
  assert.equal(statusInfo({ status: "held" }).label, "On hold");
});

test("cancelled paid access uses London day boundaries, including BST", () => {
  const cancelled = sub({ status: "cancelled", cancellationDate: "2030-06-02" });
  assert.equal(hasManageableMembership(cancelled, new Date("2030-06-01T22:59:00Z")), true);
  assert.equal(hasManageableMembership(cancelled, new Date("2030-06-01T23:01:00Z")), false);
  assert.equal(hasManageableMembership(sub({ status: "cancelled", renewalDate: null })), false);
  assert.equal(accessEndDate(cancelled), "2030-06-02");
});

test("billing distinguishes prepaid access and future authorised automatic billing", () => {
  assert.deepEqual(billingSummary(sub({ source: "square_pos", prepaidUntilDate: "2030-10-01" })),
    { method: "Prepaid at the club (no auto-renew)", dateLabel: "Paid through", date: "2030-10-01" });
  assert.deepEqual(billingSummary(sub({ source: "square_pos", frequency: "annual", autoRenewScheduled: true, autoRenewStartDate: "2030-10-01" })),
    { method: "Prepaid, then annual automatic billing", dateLabel: "First automatic charge", date: "2030-10-01" });
});

test("billing does not label period end as signup start or cancellation renewal", () => {
  assert.equal(billingSummary(sub({ status: "pending" })).dateLabel, "Current period ends");
  assert.equal(billingSummary(sub({ status: "cancelled" })).dateLabel, "Access until");
  assert.equal(billingSummary(sub({ status: "frozen" })).dateLabel, "Payment due");
  assert.equal(billingSummary(sub({ frequency: "annual" })).method, "Annual billing");
  assert.equal(billingSummary(sub({ managedInSquare: false })).dateLabel, "Current period ends");
});

test("minimum term month arithmetic clamps end-of-month dates", () => {
  assert.equal(addMonthsIso("2028-02-29", 12), "2029-02-28");
  assert.equal(addMonthsIso("2030-01-31", 1), "2030-02-28");
});

test("upgrade eligibility follows monthly plan rank regardless of annual discounts", () => {
  assert.equal(isUpgradeOffer(699, "platinum", 800, "higher"), true);
  assert.equal(isUpgradeOffer(699, "platinum", 600, "lower"), false);
  assert.equal(isUpgradeOffer(5499, "maximum", 699, "platinum"), true);
  assert.equal(isUpgradeOffer(undefined, undefined, 699, "platinum"), false);
});
