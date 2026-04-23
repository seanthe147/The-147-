import { fetch } from "expo/fetch";
import { Platform } from "react-native";
import { QueryClient, QueryFunction } from "@tanstack/react-query";

export function getApiUrl(): string {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    return window.location.origin;
  }

  let host = process.env.EXPO_PUBLIC_DOMAIN;

  if (!host) {
    throw new Error("EXPO_PUBLIC_DOMAIN is not set");
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
  // Fire-and-forget background prefetch so by the time the customer taps
  // Order, Membership, or Events the data is already cached. We deliberately
  // include the menu (heaviest payload) and ordering-status (cheap, but the
  // Order tab can't render without it) here — without these, the Order tab
  // showed a spinner for 1–3s on first open even on fast networks.
  queryClient.prefetchQuery({ queryKey: ["/api/settings"] });
  queryClient.prefetchQuery({ queryKey: ["/api/banner-images"] });
  queryClient.prefetchQuery({ queryKey: ["/api/events?type=event"] });
  queryClient.prefetchQuery({ queryKey: ["/api/events?type=weekly"] });
  queryClient.prefetchQuery({ queryKey: ["/api/membership/plans"] });
  queryClient.prefetchQuery({ queryKey: ["/api/menu"] });
  queryClient.prefetchQuery({ queryKey: ["/api/ordering-status"] });
  queryClient.prefetchQuery({ queryKey: ["/api/public/square-config"] });
}
