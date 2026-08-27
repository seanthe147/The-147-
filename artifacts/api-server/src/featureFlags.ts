// Server-side feature-flag resolver. Reads each FEATURE_* env var on every
// call (cheap — process.env is a synchronous object) so changing a flag in
// the deployment dashboard takes effect on the next request without a
// redeploy.

export interface FeatureFlags {
  savedCards: boolean;
  orderPreparingPush: boolean;
  dietaryFilters: boolean;
  personalisedHome: boolean;
  kdsSync: boolean;
  appearanceThemes: boolean;
}

export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  savedCards: false,
  orderPreparingPush: false,
  dietaryFilters: false,
  personalisedHome: false,
  kdsSync: false,
  appearanceThemes: false,
};

export const FEATURE_FLAG_ENV: Record<keyof FeatureFlags, string> = {
  savedCards: "FEATURE_SAVED_CARDS",
  orderPreparingPush: "FEATURE_ORDER_PREPARING_PUSH",
  dietaryFilters: "FEATURE_DIETARY_FILTERS",
  personalisedHome: "FEATURE_PERSONALISED_HOME",
  kdsSync: "FEATURE_KDS_SYNC",
  appearanceThemes: "FEATURE_APPEARANCE_THEMES",
};

export function parseFlagEnv(val: string | undefined): boolean {
  return val === "1" || val === "true";
}

export function getServerFeatureFlags(): FeatureFlags {
  const out = { ...DEFAULT_FEATURE_FLAGS };
  (Object.keys(FEATURE_FLAG_ENV) as Array<keyof FeatureFlags>).forEach((k) => {
    out[k] = parseFlagEnv(process.env[FEATURE_FLAG_ENV[k]]);
  });
  return out;
}

export function isFeatureEnabled(flag: keyof FeatureFlags): boolean {
  return getServerFeatureFlags()[flag];
}
