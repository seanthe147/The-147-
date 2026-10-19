// Fixture harness for the staff portal membership directory helpers.
// Extracts the pure helper block from the legacy template and runs it with synthetic data.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("./templates/staff-dashboard.html", import.meta.url), "utf8");
const start = html.indexOf("/* MEMBERSHIP-DIRECTORY-HELPERS:START");
const end = html.indexOf("/* MEMBERSHIP-DIRECTORY-HELPERS:END */");
assert.ok(start > 0 && end > start, "helper markers present");
const src = html.slice(start, end);
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const h = new Function("esc", "STATUS_COLORS", "STATUS_LABELS",
  src + "\nreturn {mdSource,mdFilter,mdCounts,mdRowHtml,mdStatusGroup,mdPeriod};")(
  esc, { active: "pill-green" }, { active: "Active", pending_payment: "Awaiting Payment" });

const platinum = { id: 3, name: "Platinum", color: "#334155", minimumTermMonths: 12 };
const subs = [
  { id: 1, planId: 3, plan: platinum, status: "active", source: "app_checkout", squareSubscriptionId: "S1", billingFrequency: "MONTHLY", commitmentEndDate: "2027-03-02", currentPeriodEnd: "2026-11-02", customer: { name: "Morven Achterberg", email: "morven@example.test", phone: "07700 900412" } },
  { id: 2, planId: 3, plan: platinum, status: "active", source: "square_pos", firstPaidAt: "2026-01-14", prepaidUntilDate: "2027-01-14", customer: { name: "Tobiah Quell", email: "tq@example.test" } },
  { id: 3, planId: 1, status: "pending_payment", source: "complimentary", customer: { name: "Ines <b>Varga</b>", email: "iv@example.test" } },
  { id: 4, planId: 1, status: "cancelled", source: "wix_import", customer: null },
];

test("classifies payment sources", () => {
  assert.deepEqual(subs.map((s) => h.mdSource(s).key), ["card", "till", "comp", "wix"]);
});
test("counts and filters by status, plan, source and search", () => {
  assert.deepEqual(h.mdCounts(subs), { all: 4, active: 2, attention: 1, paused: 0, cancelled: 1 });
  assert.equal(h.mdFilter(subs, { status: "attention" }).length, 1);
  assert.equal(h.mdFilter(subs, { status: "all", plan: "3" }).length, 2);
  assert.equal(h.mdFilter(subs, { status: "all", source: "till" })[0].id, 2);
  assert.equal(h.mdFilter(subs, { status: "all", q: "900412" })[0].id, 1);
  assert.equal(h.mdFilter(subs, { status: "all", q: "TQ@EX" })[0].id, 2);
});
test("row shows paid-through, minimum term and escapes names", () => {
  const till = h.mdRowHtml(subs[1]);
  assert.match(till, /Paid through/);
  assert.match(till, /14 Jan 2027/);
  assert.match(h.mdRowHtml(subs[0]), /Until 2 Mar 2027/);
  assert.match(h.mdRowHtml(subs[0]), /Next renewal/);
  assert.doesNotMatch(h.mdRowHtml(subs[2]), /<b>Varga/);
  assert.match(h.mdRowHtml(subs[3]), /Unknown customer/);
});

test("source edge cases", () => {
  assert.equal(h.mdSource({ source: "square_group_sync" }).key, "group");
  assert.equal(h.mdSource({ source: "square_group_sync", squareSubscriptionId: "X" }).key, "group");
  const wm = h.mdSource({ source: "wix_migrated", squareSubscriptionId: "X" });
  assert.equal(wm.key, "card"); assert.doesNotMatch(wm.hint, /Needs/);
  assert.equal(h.mdSource({ source: "wix_import" }).key, "wix");
  const optIn = h.mdSource({ source: "square_pos", squareSubscriptionId: "X", billingFrequency: "MONTHLY", recurringStartDate: "2027-01-14T00:00:00Z" });
  assert.match(optIn.label, /then card/); assert.match(optIn.hint, /auto renewal from 14 Jan 2027/); assert.doesNotMatch(optIn.hint, /no auto renewal/);
});
test("unknown minimum term is not inferred from plan", () => {
  const row = h.mdRowHtml({ id: 9, planId: 3, plan: platinum, status: "active", source: "app_checkout", squareSubscriptionId: "S", customer: { name: "A B" } });
  assert.match(row, /Not recorded/); assert.doesNotMatch(row, /12 months/);
});
test("held and ended memberships never say next renewal", () => {
  for (const status of ["cancelled", "paused", "frozen"]) {
    const per = h.mdPeriod({ status, currentPeriodEnd: "2026-11-02" }, { key: "card" });
    assert.equal(per.label, "Recorded period end");
  }
  assert.equal(h.mdPeriod({ status: "pending_payment" }, { key: "card" }).label, "Billing period ends");
  assert.equal(h.mdPeriod({ status: "active", cancellationDate: "2026-12-01" }, { key: "card" }).label, "Access ends");
});
test("dates use Europe/London day", () => {
  const row = h.mdRowHtml({ id: 10, status: "active", source: "app_checkout", squareSubscriptionId: "S", currentPeriodEnd: "2026-06-30T23:30:00Z", customer: { name: "C" } });
  assert.match(row, /1 Jul 2026/);
});
