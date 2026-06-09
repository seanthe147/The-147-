import { useQuery } from "@tanstack/react-query";
import { useKiosk } from "@/contexts/KioskContext";

type MatchStatus = { status: "live" | "upcoming" | "finished" | "none" };

/**
 * Returns true when the NextMatchBar is currently rendered at the top of the
 * tab layout. When true, screens must NOT apply their own insets.top padding —
 * the bar has already consumed it. Mirrors the null-return conditions in
 * NextMatchBar.tsx exactly so the two stay in sync.
 *
 * React Query deduplicates the fetch: all tab screens sharing this hook hit
 * the same cached response from the NextMatchBar's own query.
 */
export function useMatchBarVisible(): boolean {
  const { isKioskMode } = useKiosk();
  const { data } = useQuery<MatchStatus>({
    queryKey: ["/api/world-cup/next-match"],
    staleTime: 25_000,
  });
  if (isKioskMode) return false;
  return !!data && data.status !== "none";
}
