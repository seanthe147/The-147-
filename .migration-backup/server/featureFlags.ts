// Server-side feature-flag resolver. Reads each FEATURE_* env var on every
// call (cheap — process.env is a synchronous object) so changing a flag in
// the deployment dashboard takes effect on the next request without a
// redeploy. Co-located with shared/featureFlags.ts so the env-var names and
// flag keys stay in sync.

import {
  type FeatureFlags,
  DEFAULT_FEATURE_FLAGS,
  FEATURE_FLAG_ENV,
  parseFlagEnv,
} from "@shared/featureFlags";

export function getServerFeatureFlags(): FeatureFlags {
  const out = { ...DEFAULT_FEATURE_FLAGS };
  (Object.keys(FEATURE_FLAG_ENV) as Array<keyof FeatureFlags>).forEach((k) => {
    out[k] = parseFlagEnv(process.env[FEATURE_FLAG_ENV[k]]);
  });
  return out;
}

/** Convenience guard for inside route handlers. */
export function isFeatureEnabled(flag: keyof FeatureFlags): boolean {
  return getServerFeatureFlags()[flag];
}
