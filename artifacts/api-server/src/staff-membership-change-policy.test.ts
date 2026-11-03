import assert from "node:assert/strict";
import test from "node:test";
import { staffPlanChangePolicy } from "./staff-membership-change-policy.ts";

const current = { name: "Platinum", tier: "platinum", priceMonthly: 699 };
const target = { name: "Pink", tier: "pink", priceMonthly: 299 };
test("only manager and owner may downgrade Platinum including old names", () => {
  for (const name of ["Platinum", "Black", "Maximum"]) {
    assert.throws(() => staffPlanChangePolicy({ role: "staff", current: { ...current, name }, target, today: "2026-11-03" }), /manager or owner/);
    for (const role of ["manager", "owner"]) {
      assert.equal(staffPlanChangePolicy({ role, current: { ...current, name }, target, today: "2026-11-03" }).downgrade, true);
    }
  }
});
test("staff can change other plans but nobody can waive a minimum term or choose VIP", () => {
  assert.equal(staffPlanChangePolicy({ role: "staff", current: { name: "Blue", tier: "blue", priceMonthly: 500 }, target, today: "2026-11-03" }).downgrade, true);
  assert.throws(() => staffPlanChangePolicy({ role: "owner", current, target, today: "2026-11-03", commitmentEndDate: "2027-01-01" }), /minimum term/);
  assert.throws(() => staffPlanChangePolicy({ role: "owner", current, target: { ...target, tier: "vip" }, today: "2026-11-03" }), /invitation-only/);
});
