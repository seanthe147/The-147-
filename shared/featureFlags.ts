// ─────────────────────────────────────────────────────────────────────────────
// Feature flag definitions — single source of truth shared by server and
// client. Each flag gates one of the four customer-experience improvements
// implemented as a "test version" in May 2026:
//
//   savedCards        — Workstream 4a/4b: save a card during checkout, then
//                       offer "Pay with •••• 4242" as a one-tap reorder CTA.
//   orderPreparingPush — Adds a "Your order is being prepared 👨‍🍳" push when
//                       kitchen advances paid → preparing. The "ready" /
//                       "delivered" / "collected" pushes already ship today
//                       inside the staff advance endpoint and are unaffected.
//   dietaryFilters    — Allergen / dietary tags on menu items + a filter
//                       chip row above the menu, plus a per-customer default.
//   personalisedHome  — "Welcome back, X" + "Reorder last round" +
//                       loyalty-progress card at the top of the home tab.
//   kdsSync           — Mirror Square KDS "Complete" taps into our
//                       app_orders table so the customer receipt and the
//                       staff portal both flip to "Order complete" without
//                       a second tap. Subscribes to Square's
//                       order.fulfillment.updated webhook event.
//
// Defaults are ALL OFF. To turn a feature on for an environment, set the
// matching FEATURE_* env var to "1" (or "true") on the server. The server
// publishes the resulting flag set to the client via /api/feature-flags so
// the UI never renders gated surfaces against a server that doesn't support
// them. Flipping a flag never requires a code change or a redeploy beyond
// updating the env var — exactly what "easy to deploy if it works" needs.
// ─────────────────────────────────────────────────────────────────────────────

export interface FeatureFlags {
  savedCards: boolean;
  orderPreparingPush: boolean;
  dietaryFilters: boolean;
  personalisedHome: boolean;
  kdsSync: boolean;
}

export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  savedCards: false,
  orderPreparingPush: false,
  dietaryFilters: false,
  personalisedHome: false,
  kdsSync: false,
};

/** Env-var name for each flag. Co-located so server + client stay in sync. */
export const FEATURE_FLAG_ENV: Record<keyof FeatureFlags, string> = {
  savedCards: "FEATURE_SAVED_CARDS",
  orderPreparingPush: "FEATURE_ORDER_PREPARING_PUSH",
  dietaryFilters: "FEATURE_DIETARY_FILTERS",
  personalisedHome: "FEATURE_PERSONALISED_HOME",
  kdsSync: "FEATURE_KDS_SYNC",
};

/** Parse a single env-var value into a boolean. Empty / unset → false. */
export function parseFlagEnv(value: string | undefined): boolean {
  if (!value) return false;
  const v = value.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}
