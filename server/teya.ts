// ── Teya POSLink integration ─────────────────────────────────────────────────
// Wraps Teya's OAuth2 + POSLink REST/SSE API for kiosk card payments and
// (later) Teya Pro receipt printing. Mirrors the shape of `server/square.ts`
// so the kiosk-checkout fork in routes.ts can pick a terminal vendor at
// runtime without the calling code branching on provider details.
//
// Env vars (all required for live use; isConfigured() gates everything):
//   TEYA_CLIENT_ID       — OAuth2 client id from poslink@teya.com
//   TEYA_CLIENT_SECRET   — OAuth2 client secret (NEVER log)
//   TEYA_REDIRECT_URI    — must match what's registered with Teya;
//                          we default to <PUBLIC_APP_URL>/api/staff/teya/oauth/callback
//
// Architecture notes:
// • Auth Code flow, not Client Credentials — the venue owner authorises once
//   from the staff portal; we keep a refresh token and rotate access tokens
//   automatically. Tokens live in the `teya_oauth_tokens` table, encrypted
//   at rest.
// • Status updates arrive via Server-Sent Events (`GET /payment-requests/{id}`),
//   not webhooks. We open the stream from the server (kiosks are behind NAT
//   and Teya doesn't push to clients), parse SSE frames manually with the
//   native fetch ReadableStream — no extra dependency.
// • All write paths require an `Idempotency-Key` per Teya's spec. We derive
//   it from a stable client-side key (e.g. app_order id) hashed to 64 chars.

import { storage } from "./storage";
import { encrypt, decrypt } from "./encryption";
import { createHash } from "node:crypto";

const ID_BASE = "https://id.teya.com";
const API_BASE = "https://api.teya.com";

// Default scopes we request on the consent screen. Real list may need
// trimming once Teya documents fine-grained scopes — for now we request
// what the spec implies POSLink endpoints need. Override via env if needed.
const DEFAULT_SCOPES = (process.env.TEYA_SCOPES || "openid offline_access poslink:read poslink:write").split(/\s+/).filter(Boolean);

export class TeyaError extends Error {
  constructor(message: string, public statusCode: number, public body?: any) {
    super(message);
    this.name = "TeyaError";
  }
}

export class TeyaNotConfiguredError extends Error {
  constructor() {
    super("Teya is not configured — set TEYA_CLIENT_ID + TEYA_CLIENT_SECRET");
    this.name = "TeyaNotConfiguredError";
  }
}

export class TeyaNotAuthorizedError extends Error {
  constructor() {
    super("Teya account is not connected — owner must authorise via the staff portal");
    this.name = "TeyaNotAuthorizedError";
  }
}

// ── Configuration helpers ─────────────────────────────────────────────────────
export function isConfigured(): boolean {
  return !!(process.env.TEYA_CLIENT_ID && process.env.TEYA_CLIENT_SECRET);
}

function getClientId(): string {
  const v = process.env.TEYA_CLIENT_ID;
  if (!v) throw new TeyaNotConfiguredError();
  return v;
}

function getClientSecret(): string {
  const v = process.env.TEYA_CLIENT_SECRET;
  if (!v) throw new TeyaNotConfiguredError();
  return v;
}

// Computes the OAuth redirect URI. Prefers the explicit env var (so staff
// can register an exact value with Teya) and falls back to the venue's
// public origin so dev/staging just works.
export function getRedirectUri(publicOrigin: string): string {
  const explicit = process.env.TEYA_REDIRECT_URI?.trim();
  if (explicit) return explicit;
  return `${publicOrigin.replace(/\/+$/, "")}/api/staff/teya/oauth/callback`;
}

// ── OAuth flow ────────────────────────────────────────────────────────────────
// Builds the consent-screen URL the staff portal opens in a popup/system
// browser. `state` is opaque to Teya — we round-trip a short-lived random
// token to defeat CSRF on the callback.
export function buildAuthorizationUrl(opts: { redirectUri: string; state: string }): string {
  const params = new URLSearchParams({
    client_id: getClientId(),
    redirect_uri: opts.redirectUri,
    response_type: "code",
    scope: DEFAULT_SCOPES.join(" "),
    state: opts.state,
  });
  return `${ID_BASE}/oauth/v2/oauth-authorize?${params.toString()}`;
}

// Exchanges the one-time `code` from the callback for an access + refresh
// token. Persists encrypted to the DB so the next server boot is still
// authorised. Returns the decoded scope so the UI can warn the owner if
// Teya granted fewer permissions than we asked for.
export async function exchangeAuthorizationCode(opts: {
  code: string;
  redirectUri: string;
}): Promise<{ scope: string | null; expiresAt: Date }> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: opts.code,
    redirect_uri: opts.redirectUri,
    client_id: getClientId(),
    client_secret: getClientSecret(),
  });
  const res = await fetch(`${ID_BASE}/oauth/v2/oauth-token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new TeyaError(json?.error_description || json?.error || "Token exchange failed", res.status, json);
  }
  return persistTokenResponse(json);
}

// Performs a refresh-token grant when the current access token is within
// 60s of expiry (or already expired). Stores the rotated refresh token —
// Teya, like most strict OAuth servers, may issue a new one on every
// refresh and invalidate the old one immediately.
async function refreshAccessToken(refreshTokenPlain: string): Promise<{ scope: string | null; expiresAt: Date }> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshTokenPlain,
    client_id: getClientId(),
    client_secret: getClientSecret(),
  });
  const res = await fetch(`${ID_BASE}/oauth/v2/oauth-token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Refresh failed — most likely the merchant revoked access in their
    // Teya dashboard. Surface as not-authorized so the staff UI prompts
    // a fresh connect. We do NOT auto-clear the row: the owner should
    // see the failure and re-consent rather than silently losing state.
    if (res.status === 400 || res.status === 401) throw new TeyaNotAuthorizedError();
    throw new TeyaError(json?.error_description || json?.error || "Token refresh failed", res.status, json);
  }
  return persistTokenResponse(json);
}

// Stores the response from /oauth-token. The Teya spec returns:
//   { access_token, refresh_token, token_type, expires_in, scope }
async function persistTokenResponse(json: any): Promise<{ scope: string | null; expiresAt: Date }> {
  const accessToken = json?.access_token as string | undefined;
  const refreshToken = json?.refresh_token as string | undefined;
  const expiresIn = Number(json?.expires_in ?? 3600);
  const tokenType = (json?.token_type as string | undefined) || "Bearer";
  const scope = (json?.scope as string | undefined) || null;
  if (!accessToken || !refreshToken) {
    throw new TeyaError("Token response missing access_token or refresh_token", 502, json);
  }
  const expiresAt = new Date(Date.now() + expiresIn * 1000);
  await storage.saveTeyaTokens({
    accessTokenEnc: encrypt(accessToken),
    refreshTokenEnc: encrypt(refreshToken),
    tokenType,
    scope,
    expiresAt,
  });
  return { scope, expiresAt };
}

// Returns a valid bearer token, refreshing on the fly if needed. Throws
// TeyaNotAuthorizedError when there is no stored token or refresh fails.
async function getAccessToken(): Promise<string> {
  if (!isConfigured()) throw new TeyaNotConfiguredError();
  const row = await storage.getTeyaTokens();
  if (!row) throw new TeyaNotAuthorizedError();
  // Refresh if within 60s of expiry. Teya tokens are typically 1h.
  const safetyMs = 60_000;
  if (row.expiresAt.getTime() - Date.now() < safetyMs) {
    const refreshPlain = decrypt(row.refreshTokenEnc);
    await refreshAccessToken(refreshPlain);
    const refreshed = await storage.getTeyaTokens();
    if (!refreshed) throw new TeyaNotAuthorizedError();
    return decrypt(refreshed.accessTokenEnc);
  }
  return decrypt(row.accessTokenEnc);
}

// Revoke local copy of the tokens. We don't call Teya's revoke endpoint
// because the spec doesn't list one publicly — the owner can delete the
// app from their Teya dashboard if they want a hard revoke.
export async function disconnect(): Promise<void> {
  await storage.clearTeyaTokens();
}

export async function getConnectionInfo(): Promise<{
  connected: boolean;
  expiresAt: Date | null;
  scope: string | null;
}> {
  const row = await storage.getTeyaTokens();
  if (!row) return { connected: false, expiresAt: null, scope: null };
  return { connected: true, expiresAt: row.expiresAt, scope: row.scope ?? null };
}

// ── Generic authed REST helper ────────────────────────────────────────────────
// Wraps fetch with bearer auth + a one-shot retry on 401 (in case the token
// expired between our pre-check and the request reaching Teya). All Teya
// endpoints return JSON, so we parse for the caller.
async function teyaRequest(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  opts: { body?: any; idempotencyKey?: string; query?: Record<string, string | undefined> } = {},
): Promise<any> {
  const url = new URL(path.startsWith("http") ? path : `${API_BASE}${path}`);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
    }
  }
  const send = async (token: string) => {
    const headers: Record<string, string> = {
      authorization: `Bearer ${token}`,
      accept: "application/json",
    };
    let body: BodyInit | undefined;
    if (opts.body !== undefined) {
      headers["content-type"] = "application/json";
      body = JSON.stringify(opts.body);
    }
    if (opts.idempotencyKey) headers["idempotency-key"] = opts.idempotencyKey;
    return fetch(url, { method, headers, body });
  };
  let token = await getAccessToken();
  let res = await send(token);
  if (res.status === 401) {
    // Force a refresh and retry once. Pull the refresh token directly so
    // we don't depend on the lazy expiry check.
    const row = await storage.getTeyaTokens();
    if (!row) throw new TeyaNotAuthorizedError();
    await refreshAccessToken(decrypt(row.refreshTokenEnc));
    token = await getAccessToken();
    res = await send(token);
  }
  if (res.status === 204) return null;
  const text = await res.text();
  const json = text ? safeJson(text) : null;
  if (!res.ok) {
    throw new TeyaError(json?.message || json?.error || res.statusText || "Teya request failed", res.status, json);
  }
  return json;
}

function safeJson(text: string): any {
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

// Idempotency keys must be unique per logical operation. We hash a stable
// caller-supplied key so retries with the same key collapse, and so we
// don't leak internal IDs to Teya's logs.
export function buildIdempotencyKey(seed: string): string {
  return createHash("sha256").update(seed).digest("hex");
}

// ── Stores + terminals (used by the staff pairing UI) ────────────────────────
export async function listStores(): Promise<Array<{ id: string; name: string }>> {
  const data = await teyaRequest("GET", "/poslink/v1/stores");
  const items = (data?.stores || data?.items || data || []) as any[];
  return items.map((s) => ({
    id: String(s.id ?? s.store_id ?? ""),
    name: String(s.name ?? s.display_name ?? s.id ?? "Unnamed store"),
  })).filter((s) => s.id);
}

export async function listTerminals(storeId: string): Promise<Array<{ id: string; name: string; status?: string }>> {
  const data = await teyaRequest("GET", `/poslink/v1/stores/${encodeURIComponent(storeId)}/terminals`);
  const items = (data?.terminals || data?.items || data || []) as any[];
  return items.map((t) => ({
    id: String(t.id ?? t.terminal_id ?? ""),
    name: String(t.name ?? t.display_name ?? t.id ?? "Unnamed terminal"),
    status: t.status ?? undefined,
  })).filter((t) => t.id);
}

// ── Payment requests ──────────────────────────────────────────────────────────
// Push a payment to a paired terminal. The customer sees the amount on
// the device and taps / inserts / swipes their card. `merchantReference`
// links back to our local order (we set it to the app_order id as a string
// so the SSE listener can find the row).
export async function createPaymentRequest(opts: {
  storeId: string;
  terminalId: string;
  amountPence: number;
  merchantReference: string;
  description?: string;
  idempotencyKey: string;
}): Promise<{ id: string; status: string }> {
  const data = await teyaRequest("POST", "/poslink/v2/payment-requests", {
    idempotencyKey: opts.idempotencyKey,
    body: {
      store_id: opts.storeId,
      terminal_id: opts.terminalId,
      amount: { value: opts.amountPence, currency: "GBP" },
      merchant_reference: opts.merchantReference.slice(0, 64),
      description: (opts.description || "").slice(0, 200),
      // Spec hints at intent flags; we default to a straightforward sale.
      intent: "SALE",
    },
  });
  return {
    id: String(data?.id ?? data?.payment_request_id ?? ""),
    status: String(data?.status ?? "NEW"),
  };
}

// One-shot read of a payment request's current status. Useful for UI
// polling fallbacks when SSE isn't appropriate. Most kiosk flows should
// use streamPaymentStatus() instead.
export async function getPaymentRequest(id: string): Promise<any> {
  return teyaRequest("GET", `/poslink/v2/payment-requests/${encodeURIComponent(id)}`);
}

// Cancels a payment request mid-flight (customer changed their mind, etc.).
// Teya's API uses PATCH with {status: "CANCELLING"} per the spec. Errors
// are swallowed because the local DB state is the source of truth.
export async function cancelPaymentRequest(id: string): Promise<boolean> {
  try {
    await teyaRequest("PATCH", `/poslink/v2/payment-requests/${encodeURIComponent(id)}`, {
      body: { status: "CANCELLING" },
    });
    return true;
  } catch (err: any) {
    console.error(`[TEYA] cancelPaymentRequest(${id}) failed:`, err?.message || err);
    return false;
  }
}

// ── SSE: live status stream ───────────────────────────────────────────────────
// The Teya spec exposes the same GET /payment-requests/{id} URL as a
// Server-Sent Events stream when the client requests `text/event-stream`.
// Status flow: NEW → IN_PROGRESS (with progress_status: WAITING_FOR_CARD_ENTRY,
// CARD_PRESENTED, etc.) → SUCCESSFUL | FAILED | CANCELLED. The stream closes
// once a final status is reached.
//
// We parse SSE frames manually rather than depending on `eventsource` so the
// implementation stays a single file with no extra dependency. The parser
// is small but obeys the SSE rules that matter for Teya: events separated
// by blank lines, "event:" + "data:" fields, ignore everything else.

export type TeyaTerminalStatus =
  | "NEW"
  | "IN_PROGRESS"
  | "SUCCESSFUL"
  | "FAILED"
  | "CANCELLING"
  | "CANCELLED"
  | "EXPIRED"
  | string;

export type TeyaStatusEvent = {
  event: "full" | "diff" | string;
  data: any;
};

export async function streamPaymentStatus(
  id: string,
  onEvent: (ev: TeyaStatusEvent) => void | Promise<void>,
  opts: { signal?: AbortSignal } = {},
): Promise<void> {
  const token = await getAccessToken();
  const url = `${API_BASE}/poslink/v2/payment-requests/${encodeURIComponent(id)}`;
  const res = await fetch(url, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: "text/event-stream",
    },
    signal: opts.signal,
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new TeyaError(`SSE stream failed: ${res.status} ${text}`, res.status, text);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  // SSE frame parser. We normalise CRLF → LF on every chunk so the only
  // event separator we ever look for is "\n\n" — that sidesteps the whole
  // class of bugs around mixed line endings (\n\n vs \r\n\r\n vs the
  // half-and-half cases that can arise across chunk boundaries) that an
  // earlier version of this parser was vulnerable to.
  //
  // Within a frame: "event:" sets the type, "data:" lines accumulate into
  // a JSON payload. Anything else (id:, retry:, comments starting with ":")
  // is ignored — Teya's spec doesn't surface them and we don't need them
  // for kiosk status updates.
  const flushFrame = async (raw: string) => {
    let event = "message";
    const dataLines: string[] = [];
    for (const line of raw.split("\n")) {
      if (!line || line.startsWith(":")) continue;
      const idx = line.indexOf(":");
      const field = idx === -1 ? line : line.slice(0, idx);
      const value = idx === -1 ? "" : line.slice(idx + 1).replace(/^ /, "");
      if (field === "event") event = value;
      else if (field === "data") dataLines.push(value);
    }
    if (!dataLines.length) return;
    const dataStr = dataLines.join("\n");
    let parsed: any = dataStr;
    try { parsed = JSON.parse(dataStr); } catch { /* leave as string */ }
    await onEvent({ event, data: parsed });
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        if (buffer.trim()) await flushFrame(buffer);
        return;
      }
      // Normalise line endings before appending. Keeps frame splitting
      // trivial regardless of what the server sends.
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
      let sepIdx: number;
      while ((sepIdx = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, sepIdx);
        buffer = buffer.slice(sepIdx + 2);
        if (frame.trim()) await flushFrame(frame);
      }
    }
  } finally {
    try { reader.releaseLock(); } catch {}
  }
}

// Convenience: subscribes to the SSE stream and resolves once a terminal
// status (SUCCESSFUL / FAILED / CANCELLED / EXPIRED) is observed. Used by
// the kiosk-checkout server flow to mark the local order paid the instant
// Teya confirms — no polling, no webhook to receive.
export async function awaitFinalStatus(
  id: string,
  opts: {
    onProgress?: (status: TeyaTerminalStatus, raw: any) => void;
    timeoutMs?: number;
  } = {},
): Promise<{ status: TeyaTerminalStatus; raw: any }> {
  const ac = new AbortController();
  const timeoutMs = opts.timeoutMs ?? 5 * 60_000;
  const t = setTimeout(() => ac.abort(), timeoutMs);
  let lastRaw: any = null;
  try {
    return await new Promise<{ status: TeyaTerminalStatus; raw: any }>((resolve, reject) => {
      streamPaymentStatus(id, (ev) => {
        const status = (ev.data?.status as string) || "";
        lastRaw = ev.data;
        if (status === "IN_PROGRESS" || status === "NEW") {
          opts.onProgress?.(status, ev.data);
          return;
        }
        if (status === "SUCCESSFUL" || status === "FAILED" || status === "CANCELLED" || status === "EXPIRED") {
          ac.abort();
          resolve({ status, raw: ev.data });
        }
      }, { signal: ac.signal }).catch((err) => {
        if (ac.signal.aborted && lastRaw?.status) return; // we resolved already
        reject(err);
      });
    });
  } finally {
    clearTimeout(t);
  }
}

// ── Recent payments ring buffer ──────────────────────────────────────────────
// Teya doesn't expose a "list recent payment-requests" endpoint, so we keep
// a small in-memory log of the last 20 attempts (recorded by routes.ts when
// the SSE listener resolves). Lost on restart — that's fine, this exists
// purely for staff troubleshooting in the Teya panel.
export type TeyaRecentPayment = {
  requestId: string;
  appOrderId: number | null;
  ticketNumber: number | null;
  amountPence: number;
  status: TeyaTerminalStatus | "PENDING";
  startedAt: string;
  finishedAt: string | null;
};
const RECENT_LIMIT = 20;
const recentPayments: TeyaRecentPayment[] = [];
export function recordPaymentStarted(p: { requestId: string; appOrderId: number | null; ticketNumber: number | null; amountPence: number }) {
  recentPayments.unshift({
    requestId: p.requestId,
    appOrderId: p.appOrderId,
    ticketNumber: p.ticketNumber,
    amountPence: p.amountPence,
    status: "PENDING",
    startedAt: new Date().toISOString(),
    finishedAt: null,
  });
  while (recentPayments.length > RECENT_LIMIT) recentPayments.pop();
}
export function recordPaymentFinished(requestId: string, status: TeyaTerminalStatus) {
  const row = recentPayments.find((r) => r.requestId === requestId);
  if (!row) return;
  row.status = status;
  row.finishedAt = new Date().toISOString();
}
export function listRecentPayments(): TeyaRecentPayment[] {
  return recentPayments.slice();
}

// ── Receipt printing (Teya Pro built-in printer) ─────────────────────────────
// Spec: POST /poslink/v1/receipt-requests with either a multipart image or
// a JSON document. We use the JSON form for kiosk tickets (faster + no
// image processing). Failures are non-fatal — kiosk flow continues.
export async function printReceipt(opts: {
  storeId: string;
  terminalId: string;
  title: string;
  lines: string[];
  idempotencyKey: string;
}): Promise<boolean> {
  try {
    await teyaRequest("POST", "/poslink/v1/receipt-requests", {
      idempotencyKey: opts.idempotencyKey,
      body: {
        store_id: opts.storeId,
        terminal_id: opts.terminalId,
        document: {
          title: opts.title.slice(0, 60),
          lines: opts.lines.slice(0, 60).map((l) => String(l).slice(0, 80)),
        },
      },
    });
    return true;
  } catch (err: any) {
    console.warn(`[TEYA] printReceipt failed (non-fatal):`, err?.message || err);
    return false;
  }
}
