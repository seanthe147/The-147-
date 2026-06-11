import { fetch } from "expo/fetch";
import { Platform, AppState, AppStateStatus } from "react-native";
import { QueryClient, QueryFunction, focusManager } from "@tanstack/react-query";

// Bridge React Native's AppState into TanStack Query's focus manager so that
// `refetchOnWindowFocus: true` actually fires when the user backgrounds and
// foregrounds the app on iOS/Android. Without this, that option is web-only
// and pages like the membership screen would never re-check Square when the
// customer brought the app forward — they'd see a stale snapshot from
// whenever the screen first mounted.
if (Platform.OS !== "web") {
  focusManager.setEventListener((handleFocus) => {
    const sub = AppState.addEventListener("change", (status: AppStateStatus) => {
      handleFocus(status === "active");
    });
    return () => sub.remove();
  });
}

export function getApiUrl(): string {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    return window.location.origin;
  }

  let host = process.env.EXPO_PUBLIC_DOMAIN;

  if (!host) {
    // Fall back to the known production domain so that native builds compiled
    // without EXPO_PUBLIC_DOMAIN baked in (e.g. an Android build where the env
    // var was missing at EAS build time) still reach the server instead of
    // crashing every screen that calls getApiUrl().
    host = "the147bradford.replit.app";
  }

  let url = new URL(`https://${host}`);

  return url.href;
}

let _staffToken: string | null = null;

export function setStaffToken(token: string | null) {
  _staffToken = token;
}

export function getStaffToken(): string | null {
  return _staffToken;
}

function buildHeaders(data?: unknown): Record<string, string> {
  const headers: Record<string, string> = {};
  if (data) {
    headers["Content-Type"] = "application/json";
  }
  if (_staffToken) {
    headers["Authorization"] = `Bearer ${_staffToken}`;
  }
  return headers;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  route: string,
  data?: unknown | undefined,
): Promise<Response> {
  const baseUrl = getApiUrl();
  const url = new URL(route, baseUrl);

  const res = await fetch(url.toString(), {
    method,
    headers: buildHeaders(data),
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

// Hard upper bound on every query — without this, expo/fetch on iOS can sit
// on a stalled connection indefinitely (e.g. captive portals, broken Wi-Fi,
// proxies that accept the connection but never deliver bytes). After 25s
// we bail so React Query goes to the error state and the screen can show
// a retry button instead of a forever-spinner.
const QUERY_TIMEOUT_MS = 25_000;

async function fetchWithTimeout(input: string, init: any, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (err: any) {
    if (err && (err.name === "AbortError" || /aborted/i.test(err.message || ""))) {
      throw new Error("Request timed out. Please check your connection.");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const baseUrl = getApiUrl();
    const url = new URL(queryKey.join("/") as string, baseUrl);

    const headers: Record<string, string> = {};
    if (_staffToken) {
      headers["Authorization"] = `Bearer ${_staffToken}`;
    }

    const res = await fetchWithTimeout(url.toString(), {
      credentials: "include",
      headers,
    }, QUERY_TIMEOUT_MS);

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      retry: 1,
      retryDelay: 1000,
    },
    mutations: {
      retry: false,
    },
  },
});

export function prefetchAppData() {
  // Two-tier prefetch so the home screen's network bandwidth is never starved
  // by heavier queries (menu, plans) the customer hasn't asked for yet.
  //
  // Tier 1 — fires immediately after first paint. These are the exact query
  // keys the Home tab subscribes to, so on a warm cache it renders without a
  // single spinner. /api/public/square-config sits here too because the
  // checkout WebView gates on it the moment the customer taps Pay — if the
  // request hasn't completed by then we wrongly fall back to hosted browser
  // checkout. Cheap GET so it doesn't dent the home tab's bandwidth budget.
  queryClient.prefetchQuery({ queryKey: ["/api/settings"] });
  queryClient.prefetchQuery({ queryKey: ["/api/banner-images?page=home"] });
  queryClient.prefetchQuery({ queryKey: ["/api/events?type=event"] });
  queryClient.prefetchQuery({ queryKey: ["/api/public/square-config"] });

  // Tier 2 — deferred so the Home tab finishes loading first. By the time
  // the customer taps Order / Membership / Events, the cache is warm too.
  setTimeout(() => {
    queryClient.prefetchQuery({ queryKey: ["/api/menu"] });
    queryClient.prefetchQuery({ queryKey: ["/api/ordering-status"] });
    queryClient.prefetchQuery({ queryKey: ["/api/banner-images?page=order"] });
    queryClient.prefetchQuery({ queryKey: ["/api/membership/plans"] });
    queryClient.prefetchQuery({ queryKey: ["/api/events?type=weekly"] });
  }, 600);
}

// Warm the OS-level DNS + TLS cache for Square's payment CDN before the
// customer actually opens the in-app payment sheet. The HTTP cache is NOT
// shared between the JS runtime and the in-app WebView, but DNS + TLS
// session resumption ARE shared at the OS level — so a tiny no-op fetch
// here typically shaves 100–300 ms off the WebView's first request to
// Square on cold mobile connections.
//
// Fire-and-forget. Never throws. Calling more than once per session is
// cheap (the OS will just return cached resolutions).
let _squareWarmedAt = 0;
export function prefetchSquarePaymentSdk() {
  // Don't re-warm more than once every 5 minutes — DNS / TLS records are
  // already cached, so repeat calls just waste mobile data.
  const now = Date.now();
  if (now - _squareWarmedAt < 5 * 60 * 1000) return;
  _squareWarmedAt = now;
  // Warm BOTH the production and sandbox CDNs. We don't know which the
  // server's /api/public/square-config will return until the cart actually
  // mounts the WebView, and a HEAD on the unused one is essentially free
  // (single DNS lookup + TLS handshake — no payload). This guarantees the
  // sandbox/dev environment gets the same speed-up as production.
  const targets = [
    "https://web.squarecdn.com/v1/square.js",
    "https://sandbox.web.squarecdn.com/v1/square.js",
    "https://applepay.cdn-apple.com/jsapi/v1.1.0/apple-pay-sdk.js",
  ];
  for (const url of targets) {
    // HEAD is enough to resolve DNS, complete TLS handshake, and prime the
    // CDN edge — without paying for the full bundle. expo/fetch handles HEAD
    // correctly on iOS/Android. Failures are silently swallowed.
    fetch(url, { method: "HEAD" } as any).catch(() => {});
  }
}
