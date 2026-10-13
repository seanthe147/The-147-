import { PLATINUM_OFFER as offer } from "./platinum-offer.ts";

/** One-time offer migration, without changing any membership subscription. */
export async function applyPlatinumOffer(client: { query: (sql: string, params?: any[]) => Promise<any> }) {
  if (!offer.monthlyVariationId || !offer.annualVariationId) return;
  await client.query("BEGIN");
  try {
    // Serialise multiple application instances during publishing.
    await client.query("SELECT pg_advisory_xact_lock(14703, 1)");
    const completed = await client.query("SELECT key FROM site_settings WHERE key = $1", [offer.migrationKey]);
    if (!completed.rows.length) {
      const exists = await client.query("SELECT id FROM membership_plans WHERE tier = 'platinum'");
      if (!exists.rows.length) throw new Error("Platinum offer migration requires the existing Platinum plan.");
      // Preserve old IDs for paid subscribers who remain on the old Square price.
      await client.query(`
        INSERT INTO membership_plan_variation_aliases (square_variation_id, plan_id)
        SELECT square_plan_variation_id, id FROM membership_plans
        WHERE tier IN ('platinum', 'maximum') AND square_plan_variation_id IS NOT NULL
        ON CONFLICT (square_variation_id) DO NOTHING
      `);
      await client.query(`
        INSERT INTO membership_plan_variation_aliases (square_variation_id, plan_id)
        SELECT square_plan_variation_id_alt, id FROM membership_plans
        WHERE tier IN ('platinum', 'maximum') AND square_plan_variation_id_alt IS NOT NULL
        ON CONFLICT (square_variation_id) DO NOTHING
      `);
      await client.query(`
        UPDATE membership_plans SET price_monthly = $1, price_annual = $2,
          square_plan_variation_id = $3, square_plan_variation_id_alt = $4,
          hide_from_signup = FALSE, active = TRUE WHERE tier = 'platinum'
      `, [offer.monthlyPence, offer.annualPence, offer.monthlyVariationId, offer.annualVariationId]);
      // Hiding is not disabling: historical memberships retain their entitlements.
      await client.query("UPDATE membership_plans SET hide_from_signup = TRUE WHERE tier = 'maximum'");
      await client.query("INSERT INTO site_settings (key, value, updated_at) VALUES ($1, 'done', NOW())", [offer.migrationKey]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
