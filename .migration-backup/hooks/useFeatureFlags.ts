// React Query hook that fetches the server-published feature flag set.
// All four customer-facing experiments default to OFF — surfaces gated by
// flags should treat the snapshot as authoritative and not render until the
// fetch resolves (use the `isReady` boolean below). The endpoint is public
// (no auth) and cached for the lifetime of the app session: flags only
// flip via env-var changes which require a backend redeploy, so refetching
// per render is wasted bandwidth.

import { useQuery } from "@tanstack/react-query";
import { getApiUrl } from "@/lib/query-client";
import {
  type FeatureFlags,
  DEFAULT_FEATURE_FLAGS,
} from "@shared/featureFlags";

export function useFeatureFlags(): { flags: FeatureFlags; isReady: boolean } {
  const { data, isFetched } = useQuery<FeatureFlags>({
    queryKey: ["/api/feature-flags"],
    queryFn: async () => {
      const res = await fetch(new URL("/api/feature-flags", getApiUrl()).toString());
      if (!res.ok) throw new Error(`feature-flags ${res.status}`);
      return res.json();
    },
    // Flags very rarely change — staleTime is effectively the app lifetime.
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 1,
    // Falling back to DEFAULT_FEATURE_FLAGS (all OFF) while the request is
    // in flight is the safe choice — never accidentally render an
    // experimental surface against a server that doesn't support it yet.
    placeholderData: DEFAULT_FEATURE_FLAGS,
  });
  return { flags: data ?? DEFAULT_FEATURE_FLAGS, isReady: isFetched };
}
