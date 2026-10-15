import test from "node:test";
import assert from "node:assert/strict";
import { applyPlatinumOffer, applyPlatinumTillMapping, PLATINUM_PREPAID_TILL_ID } from "./platinum-offer-migration.ts";
import { PLATINUM_OFFER } from "./platinum-offer.ts";
import { isPlatinumConsolidation } from "./membership-billing-policy.ts";

test("offer is exactly £6.99/month or £65/year", () => {
  assert.equal(PLATINUM_OFFER.monthlyPence, 699);
  assert.equal(PLATINUM_OFFER.annualPence, 6500);
  assert.notEqual(PLATINUM_OFFER.monthlyVariationId, PLATINUM_OFFER.annualVariationId);
});
test("approved till setup maps only the annual variation and never edits billing", async () => {
  const queries: { sql: string; params?: any[] }[] = [];
  await applyPlatinumTillMapping({ async query(sql, params) {
    queries.push({ sql, params });
    return { rows: sql.startsWith("SELECT id") ? [{ id: 4, square_pos_variation_ids: [] }] : [] };
  } });
  const update = queries.find(q => q.sql.startsWith("UPDATE"));
  assert.deepEqual(update?.params, [[PLATINUM_PREPAID_TILL_ID], 4]);
  assert.equal(PLATINUM_PREPAID_TILL_ID, "GGVOQBI653HE4BNPXABOVDPK");
  assert.ok(queries.every(q => !/membership_subscriptions|price_monthly|price_annual|square_plan_variation_id/.test(q.sql)));
  assert.equal(queries.at(-1)?.sql, "COMMIT");
});
test("completed till setup and pre-existing staff mappings are never overwritten", async () => {
  for (const alreadyCompleted of [false, true]) {
    const queries: string[] = [];
    await applyPlatinumTillMapping({ async query(sql) {
      queries.push(sql);
      return { rows: sql.startsWith("SELECT key") && alreadyCompleted ? [{ key: "done" }]
        : sql.startsWith("SELECT id") ? [{ id: 4, square_pos_variation_ids: ["staff-chosen"] }] : [] };
    } });
    assert.ok(queries.every(q => !q.startsWith("UPDATE")));
  }
});
test("offer migration preserves aliases, hides Maximum without disabling, and never edits subscriptions", async () => {
  const queries: string[] = [];
  await applyPlatinumOffer({
    async query(query) {
      queries.push(query);
      return { rows: query.startsWith("SELECT id") ? [{ id: 1 }] : [] };
    },
  });
  assert.ok(queries.some(q => q.includes("INSERT INTO membership_plan_variation_aliases")));
  assert.ok(queries.some(q => q.includes("hide_from_signup = TRUE WHERE tier = 'maximum'")));
  assert.ok(queries.every(q => !/UPDATE membership_subscriptions|DELETE FROM|active = FALSE/i.test(q)));
  assert.equal(queries.at(-1), "COMMIT");
});
test("completed offer migration cannot overwrite later owner edits", async () => {
  const queries: string[] = [];
  await applyPlatinumOffer({
    async query(query) {
      queries.push(query);
      return { rows: query.startsWith("SELECT key") ? [{ key: PLATINUM_OFFER.migrationKey }] : [] };
    },
  });
  assert.equal(queries.some(q => q.includes("UPDATE membership_plans")), false);
});
test("Maximum customers can opt in to equivalent Platinum at renewal, not arbitrary downgrades", () => {
  assert.equal(isPlatinumConsolidation({ tier: "maximum" }, { tier: "platinum" }), true);
  assert.equal(isPlatinumConsolidation({ tier: "gold" }, { tier: "platinum" }), false);
});
