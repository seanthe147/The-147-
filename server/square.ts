const SQUARE_BASE_URL = process.env.SQUARE_ENVIRONMENT === "production"
  ? "https://connect.squareup.com"
  : "https://connect.squareupsandbox.com";

// SQUARE_LOC_ID takes precedence over SQUARE_LOCATION_ID (which may be set to wrong value)
function getLocationId(): string {
  const loc = process.env.SQUARE_LOC_ID || process.env.SQUARE_LOCATION_ID;
  if (!loc) throw new Error("SQUARE_LOCATION_ID not configured");
  return loc;
}

function getHeaders(): Record<string, string> {
  const token = process.env.SQUARE_ACCESS_TOKEN;
  if (!token) throw new Error("SQUARE_ACCESS_TOKEN not configured");
  return {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
    "Square-Version": "2024-01-18",
  };
}

async function squareRequest(method: string, path: string, body?: unknown) {
  const url = `${SQUARE_BASE_URL}${path}`;
  const options: RequestInit = { method, headers: getHeaders() };
  if (body) options.body = JSON.stringify(body);

  const response = await fetch(url, options);
  const data = await response.json();

  if (!response.ok) {
    const errorDetail = data.errors?.[0]?.detail || "Square API error";
    const errorCode = data.errors?.[0]?.code || "UNKNOWN";
    throw new SquareError(errorDetail, errorCode, response.status);
  }

  return data;
}

export class SquareError extends Error {
  code: string;
  statusCode: number;
  constructor(message: string, code: string, statusCode: number) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

export function toE164(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("44")) return `+${digits}`;
  if (digits.startsWith("0")) return `+44${digits.slice(1)}`;
  if (digits.length === 10 || digits.length === 11) return `+44${digits}`;
  return `+${digits}`;
}

export async function getLoyaltyProgram() {
  const data = await squareRequest("GET", "/v2/loyalty/programs");
  const program = data.programs?.[0] || data.program;
  if (!program) return null;
  return program;
}

export async function searchLoyaltyAccount(phone: string) {
  const e164Phone = toE164(phone);
  const data = await squareRequest("POST", "/v2/loyalty/accounts/search", {
    query: {
      mappings: [{ phone_number: e164Phone }],
    },
  });
  return data.loyalty_accounts?.[0] || null;
}

export async function createLoyaltyAccount(phone: string, programId: string) {
  const e164Phone = toE164(phone);
  const data = await squareRequest("POST", "/v2/loyalty/accounts", {
    loyalty_account: {
      program_id: programId,
      mapping: { phone_number: e164Phone },
    },
    idempotency_key: `create-${e164Phone}-${Date.now()}`,
  });
  return data.loyalty_account;
}

export async function getLoyaltyAccount(accountId: string) {
  const data = await squareRequest("GET", `/v2/loyalty/accounts/${accountId}`);
  return data.loyalty_account;
}

export async function accumulateLoyaltyPoints(accountId: string, points: number, idempotencyKey: string) {
  const locationId = getLocationId();

  const data = await squareRequest("POST", `/v2/loyalty/accounts/${accountId}/accumulate`, {
    accumulate_points: { points },
    location_id: locationId,
    idempotency_key: idempotencyKey,
  });
  return data.event;
}

export async function adjustLoyaltyPoints(accountId: string, points: number, reason: string, idempotencyKey: string) {
  const data = await squareRequest("POST", `/v2/loyalty/accounts/${accountId}/adjust`, {
    adjust_points: { points, reason },
    idempotency_key: idempotencyKey,
  });
  return data.event;
}

export async function redeemLoyaltyReward(accountId: string, rewardTierId: string, idempotencyKey: string) {
  const locationId = getLocationId();

  const data = await squareRequest("POST", "/v2/loyalty/rewards", {
    reward: {
      loyalty_account_id: accountId,
      reward_tier_id: rewardTierId,
    },
    idempotency_key: idempotencyKey,
  });
  return data.reward;
}

export async function deleteLoyaltyReward(rewardId: string) {
  await squareRequest("DELETE", `/v2/loyalty/rewards/${rewardId}`);
}

// ── Loyalty Reward Tiers ─────────────────────────────────────────────────────
// Returns the reward tiers configured in Square Dashboard (read-only via API).
// Used by the prize modal dropdown so managers can pick an existing tier.
export async function getLoyaltyProgramRewardTiers(): Promise<Array<{
  id: string;
  name: string;
  points: number;
  discountType: "FIXED_PERCENTAGE" | "FIXED_AMOUNT" | null;
  discountValue: number | null;
}>> {
  const program = await getLoyaltyProgram();
  if (!program?.reward_tiers) return [];
  return (program.reward_tiers as any[]).map((t) => ({
    id: t.id as string,
    name: t.name as string,
    points: (t.points as number) ?? 0,
    discountType: (t.definition?.discount_type as "FIXED_PERCENTAGE" | "FIXED_AMOUNT" | null) ?? null,
    // FIXED_PERCENTAGE: percentage_discount is a string like "10"
    // FIXED_AMOUNT: fixed_discount_money.amount is pence
    discountValue:
      t.definition?.discount_type === "FIXED_PERCENTAGE"
        ? parseInt(t.definition.percentage_discount ?? "0", 10)
        : t.definition?.fixed_discount_money?.amount ?? null,
  }));
}

// Issues a loyalty reward to a customer as a FREE game prize.
// Because Square's CreateLoyaltyReward deducts points from the account, we first
// add exactly `tierPoints` to the customer's balance (so the net change is zero),
// then immediately create the reward (which spends those same points).
// Result: customer's existing point balance is unchanged, but they have an ISSUED
// reward sitting in their Square account ready to use at the till.
export async function issueFreeGameReward(
  accountId: string,
  rewardTierId: string,
  tierPoints: number,
  idempotencyKey: string,
): Promise<{ id: string } | null> {
  // Step 1 — gift the exact number of points needed to cover the reward cost
  await adjustLoyaltyPoints(
    accountId,
    tierPoints,
    "Scratch card game prize",
    `${idempotencyKey}-pts`,
  );
  // Step 2 — create the ISSUED reward (deducts the gifted points)
  const data = await squareRequest("POST", "/v2/loyalty/rewards", {
    reward: {
      loyalty_account_id: accountId,
      reward_tier_id: rewardTierId,
    },
    idempotency_key: idempotencyKey,
  });
  return data.reward as { id: string } | null;
}

// DEPRECATED — createLoyaltyRewardTier / deleteLoyaltyRewardTier are kept for
// reference only. Square does not support creating reward tiers via API (only via
// Square Dashboard). These functions always return NOT_FOUND and are no longer
// called by the prize-save routes.
export async function createLoyaltyRewardTier(
  programId: string,
  name: string,
  discountType: "FIXED_PERCENTAGE" | "FIXED_AMOUNT",
  discountValue: number,
): Promise<{ id: string; name: string }> {
  const definition: Record<string, any> = {
    discount_type: discountType,
    scope: { scope_type: "ORDER" },
  };
  if (discountType === "FIXED_PERCENTAGE") {
    definition.percentage_discount = String(discountValue);
  } else {
    definition.fixed_discount_money = { amount: discountValue, currency: "GBP" };
  }
  const data = await squareRequest(
    "POST",
    `/v2/loyalty/programs/${programId}/reward-tiers`,
    {
      idempotency_key: `create-tier-${programId}-${name.replace(/\s+/g, "-").toLowerCase()}-${Date.now()}`,
      reward_tier: { name, definition },
    },
  );
  return data.reward_tier as { id: string; name: string };
}

// Deletes a reward tier from the loyalty programme. Called when the definition
// changes on edit so a fresh tier is created with the updated discount.
export async function deleteLoyaltyRewardTier(programId: string, tierId: string): Promise<void> {
  try {
    await squareRequest("DELETE", `/v2/loyalty/programs/${programId}/reward-tiers/${tierId}`);
  } catch (err: any) {
    console.warn(`[LOYALTY] Could not delete reward tier ${tierId}:`, err?.message);
  }
}

// Mark an ISSUED reward as REDEEMED against an order.
// This is the Square API call that actually uses up the reward so it can't
// be double-redeemed at the till. Safe to call after payment is confirmed.
export async function redeemIssuedLoyaltyReward(rewardId: string, orderId: string): Promise<void> {
  try {
    await squareRequest("POST", `/v2/loyalty/rewards/${rewardId}/redeem`, {
      idempotency_key: `redeem-issued-${rewardId}-${orderId}`,
      order_id: orderId,
    });
  } catch (err: any) {
    // Log but don't throw — a failed redemption marking is recoverable by
    // staff; we must not fail the entire checkout for this.
    console.error(`[LOYALTY] Failed to mark reward ${rewardId} redeemed on order ${orderId}:`, err?.message);
  }
}

export async function searchLoyaltyEvents(accountId: string, limit = 10): Promise<any[]> {
  try {
    const data = await squareRequest("POST", "/v2/loyalty/events/search", {
      query: {
        filter: {
          loyalty_account_filter: { loyalty_account_id: accountId },
        },
      },
      limit,
    });
    return data.events || [];
  } catch {
    return [];
  }
}

export async function searchIssuedRewards(accountId: string): Promise<any[]> {
  try {
    const data = await squareRequest("POST", "/v2/loyalty/rewards/search", {
      query: {
        loyalty_account_id: accountId,
        status: "ISSUED",
      },
    });
    return data.rewards || [];
  } catch {
    return [];
  }
}

// ── Orders (used by Live Tables / POS sync) ─────────────────────────────────
// Returns OPEN orders at the configured location. Square's Orders search API
// requires a state filter; we ask for OPEN explicitly so completed/cancelled
// orders aren't counted as in-use tables.
export async function searchOpenOrders(): Promise<any[]> {
  const locationId = getLocationId();
  const data = await squareRequest("POST", "/v2/orders/search", {
    location_ids: [locationId],
    query: {
      filter: { state_filter: { states: ["OPEN"] } },
      sort: { sort_field: "CREATED_AT", sort_order: "DESC" },
    },
    limit: 200,
  });
  return data.orders || [];
}

export async function getOrder(orderId: string): Promise<any | null> {
  try {
    const data = await squareRequest("GET", `/v2/orders/${orderId}`);
    return data.order || null;
  } catch (err) {
    if (err instanceof SquareError && err.statusCode === 404) return null;
    throw err;
  }
}

// Cancels (voids) an Open Ticket in Square POS by transitioning its state
// to CANCELED. Used when staff cancel a kiosk order that the customer never
// paid for — without this, the ticket lingers in the Square POS Open
// Tickets list forever and clutters staff's view.
//
// Square requires the current order version on PUT to prevent concurrent
// modification, so we GET first to read it. Errors are swallowed and
// logged because the local DB cancel is the source of truth — a Square
// failure shouldn't block the staff action.
export async function cancelSquareOrder(orderId: string): Promise<boolean> {
  try {
    const order = await getOrder(orderId);
    if (!order) return false;
    if (order.state === "CANCELED" || order.state === "COMPLETED") return true;
    await squareRequest("PUT", `/v2/orders/${orderId}`, {
      order: { version: order.version, state: "CANCELED", location_id: order.location_id },
    });
    return true;
  } catch (err: any) {
    console.error(`[SQUARE] cancelSquareOrder(${orderId}) failed:`, err?.message || err);
    return false;
  }
}

export async function getPayment(paymentId: string): Promise<any | null> {
  try {
    const data = await squareRequest("GET", `/v2/payments/${paymentId}`);
    return data.payment || null;
  } catch (err) {
    if (err instanceof SquareError && err.statusCode === 404) return null;
    throw err;
  }
}

export function isConfigured(): boolean {
  return !!(process.env.SQUARE_ACCESS_TOKEN && (process.env.SQUARE_LOC_ID || process.env.SQUARE_LOCATION_ID));
}

// ── Web Payments SDK helpers (for staff card-not-present / MOTO payments) ─────
// The Web Payments SDK needs the public Application ID + Location ID + environment.
// These are safe to expose to the browser (unlike SQUARE_ACCESS_TOKEN).
export function getApplicationId(): string | null {
  return process.env.SQUARE_APPLICATION_ID || null;
}

export function getEnvironment(): "production" | "sandbox" {
  return process.env.SQUARE_ENVIRONMENT === "production" ? "production" : "sandbox";
}

export function getPublicLocationId(): string | null {
  return process.env.SQUARE_LOC_ID || process.env.SQUARE_LOCATION_ID || null;
}

export function isWebPaymentsConfigured(): boolean {
  return !!(getApplicationId() && getPublicLocationId() && process.env.SQUARE_ACCESS_TOKEN);
}

// Charge a card token from the Web Payments SDK. For UK MOTO, the merchant must
// have MOTO enabled on their Square account — the lower MOTO rate is then applied
// automatically by Square based on entry method (no API flag required).
export async function createCardPayment(opts: {
  sourceId: string;
  amountPence: number;
  idempotencyKey: string;
  note?: string;
  referenceId?: string;
  buyerEmail?: string | null;
  verificationToken?: string | null;
  orderId?: string | null;
}): Promise<{ id: string; status: string; receipt_url?: string; card_details?: any }> {
  const body: any = {
    idempotency_key: opts.idempotencyKey,
    source_id: opts.sourceId,
    amount_money: { amount: opts.amountPence, currency: "GBP" },
    location_id: getLocationId(),
    autocomplete: true,
  };
  if (opts.note) body.note = opts.note.slice(0, 500);
  if (opts.referenceId) body.reference_id = opts.referenceId.slice(0, 40);
  if (opts.buyerEmail) body.buyer_email_address = opts.buyerEmail;
  if (opts.verificationToken) body.verification_token = opts.verificationToken;
  if (opts.orderId) body.order_id = opts.orderId;
  const data = await squareRequest("POST", "/v2/payments", body);
  return data.payment;
}

// ── Subscription helpers ──────────────────────────────────────────────────────

export async function createSquareCustomer(name: string, email: string, phone?: string) {
  const data = await squareRequest("POST", "/v2/customers", {
    given_name: name.split(" ")[0],
    family_name: name.split(" ").slice(1).join(" ") || "",
    email_address: email,
    phone_number: phone ? toE164(phone) : undefined,
    idempotency_key: `cust-${email}-${Date.now()}`,
  });
  return data.customer;
}

export async function findSquareCustomerByEmail(email: string) {
  const data = await squareRequest("POST", "/v2/customers/search", {
    query: { filter: { email_address: { fuzzy: email } } },
    limit: 1,
  });
  return data.customers?.[0] || null;
}

/**
 * Disable a card on file (FEATURE_SAVED_CARDS — Forget Card flow). Square
 * doesn't offer hard-delete on the cards endpoint; disabling makes the card
 * unusable for future charges and is what the Square dashboard does too.
 * Errors are swallowed by the caller so a Square outage can never block
 * the local DB from also forgetting the card.
 */
export async function disableSquareCard(cardId: string): Promise<void> {
  await squareRequest("POST", `/v2/cards/${cardId}/disable`, {});
}

/**
 * One-tap charge against a previously-saved card on file (FEATURE_SAVED_CARDS).
 * Square accepts the saved-card id directly as `source_id` on the standard
 * /v2/payments endpoint — no extra "merchant initiated" flag is required for
 * customer-present reorders, which is exactly the flow we want here.
 */
export async function chargeSavedCard(opts: {
  squareCustomerId: string;
  squareCardId: string;
  amountPence: number;
  idempotencyKey: string;
  note?: string;
  referenceId?: string;
  buyerEmail?: string | null;
  orderId?: string | null;
}): Promise<{ id: string; status: string; receipt_url?: string }> {
  const body: any = {
    idempotency_key: opts.idempotencyKey,
    source_id: opts.squareCardId,
    customer_id: opts.squareCustomerId,
    amount_money: { amount: opts.amountPence, currency: "GBP" },
    location_id: getLocationId(),
    autocomplete: true,
  };
  if (opts.note) body.note = opts.note.slice(0, 500);
  if (opts.referenceId) body.reference_id = opts.referenceId.slice(0, 40);
  if (opts.buyerEmail) body.buyer_email_address = opts.buyerEmail;
  if (opts.orderId) body.order_id = opts.orderId;
  const data = await squareRequest("POST", "/v2/payments", body);
  return data.payment;
}

/**
 * Save a tokenised card on file against a Square customer so it can be re-used
 * for recurring billing (memberships). `sourceId` comes from the Web Payments
 * SDK `tokenize()` call. `verificationToken` is the optional 3DS/SCA token from
 * `payments.verifyBuyer({ intent: 'STORE' })` — required for European cards
 * subject to PSD2.
 */
export async function saveCardOnFile(opts: {
  customerId: string;
  sourceId: string;
  verificationToken?: string | null;
  cardholderName?: string | null;
}) {
  const body: Record<string, unknown> = {
    idempotency_key: `card-${opts.customerId}-${Date.now()}`,
    source_id: opts.sourceId,
    card: {
      customer_id: opts.customerId,
      ...(opts.cardholderName ? { cardholder_name: opts.cardholderName.slice(0, 96) } : {}),
    },
  };
  if (opts.verificationToken) body.verification_token = opts.verificationToken;
  const data = await squareRequest("POST", "/v2/cards", body);
  return data.card;
}

export async function createSquareSubscription(
  squareCustomerId: string,
  planVariationId: string,
  locationId: string,
  cardId?: string,
  startDate?: string
) {
  const today = new Date().toISOString().slice(0, 10);
  const body: Record<string, unknown> = {
    idempotency_key: `sub-${squareCustomerId}-${Date.now()}`,
    location_id: locationId,
    plan_variation_id: planVariationId,
    customer_id: squareCustomerId,
    start_date: startDate || today,
  };
  if (cardId) body.card_id = cardId;
  const data = await squareRequest("POST", "/v2/subscriptions", body);
  return data.subscription;
}

export async function cancelSquareSubscription(subscriptionId: string) {
  const data = await squareRequest("POST", `/v2/subscriptions/${subscriptionId}/cancel`, {});
  return data.subscription;
}

export async function pauseSquareSubscription(subscriptionId: string) {
  const data = await squareRequest("POST", `/v2/subscriptions/${subscriptionId}/pause`, {
    pause_subscription_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  });
  return data.subscription;
}

export async function resumeSquareSubscription(subscriptionId: string) {
  const data = await squareRequest("POST", `/v2/subscriptions/${subscriptionId}/resume`, {
    resume_change_timing: "IMMEDIATE",
  });
  return data.subscription;
}

export async function getSquareSubscription(subscriptionId: string) {
  const data = await squareRequest("GET", `/v2/subscriptions/${subscriptionId}`);
  return data.subscription;
}

export async function listSquareSubscriptionsForCustomer(squareCustomerId: string) {
  const data = await squareRequest("POST", "/v2/subscriptions/search", {
    query: { filter: { customer_ids: [squareCustomerId] } },
  });
  return data.subscriptions || [];
}

// List Square payments for a given Square customer (most recent first).
// Used by the leftover-one-time-membership audit to detect customers who
// paid via the now-removed one-time browser fallback.
export async function listSquarePaymentsForCustomer(
  squareCustomerId: string,
  opts: { maxPages?: number; pageSize?: number } = {},
): Promise<any[]> {
  const pageSize = Math.max(1, Math.min(opts.pageSize ?? 100, 100));
  const maxPages = Math.max(1, opts.maxPages ?? 5); // up to 500 most recent payments
  const out: any[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < maxPages; i += 1) {
    const params = new URLSearchParams({
      customer_id: squareCustomerId,
      sort_order: "DESC",
      limit: String(pageSize),
    });
    if (cursor) params.set("cursor", cursor);
    const data = await squareRequest("GET", `/v2/payments?${params.toString()}`);
    const page = (data.payments as any[]) || [];
    out.push(...page);
    cursor = data.cursor as string | undefined;
    if (!cursor || page.length === 0) break;
  }
  return out;
}

export async function getSquareOrder(orderId: string): Promise<any | null> {
  try {
    const data = await squareRequest("GET", `/v2/orders/${orderId}`);
    return data.order ?? null;
  } catch {
    return null;
  }
}

export async function createDepositPaymentLink(opts: {
  amountPence: number;
  description: string;
  referenceId: string;
  redirectUrl: string;
  buyerEmail?: string;
}): Promise<{ url: string; paymentLinkId: string; orderId?: string }> {
  const locationId = getLocationId();

  const body: Record<string, unknown> = {
    idempotency_key: `deposit-${opts.referenceId}-${Date.now()}`,
    quick_pay: {
      name: opts.description,
      price_money: {
        amount: opts.amountPence,
        currency: "GBP",
      },
      location_id: locationId,
    },
    checkout_options: {
      redirect_url: opts.redirectUrl,
    },
    payment_note: opts.referenceId,
  };

  if (opts.buyerEmail) {
    body.pre_populated_data = { buyer_email: opts.buyerEmail };
  }

  const data = await squareRequest("POST", "/v2/online-checkout/payment-links", body);

  const link = data.payment_link;
  return {
    url: link.url,
    paymentLinkId: link.id,
    orderId: (link.order_id as string | undefined) ?? undefined,
  };
}

// ── Customer Groups ───────────────────────────────────────────────────────────

export async function listCustomerGroups(): Promise<Array<{ id: string; name: string }>> {
  const data = await squareRequest("GET", "/v2/customers/groups");
  return data.groups || [];
}

export async function getOrCreateCustomerGroup(name: string): Promise<string> {
  const groups = await listCustomerGroups();
  const existing = groups.find((g: { id: string; name: string }) => g.name === name);
  if (existing) return existing.id;
  const data = await squareRequest("POST", "/v2/customers/groups", {
    idempotency_key: `group-${name.replace(/\s+/g, "-").toLowerCase()}-${Date.now()}`,
    group: { name },
  });
  return data.group.id;
}

export async function addCustomerToGroup(customerId: string, groupId: string): Promise<void> {
  await squareRequest("PUT", `/v2/customers/${customerId}/groups/${groupId}`);
}

export async function removeCustomerFromGroup(customerId: string, groupId: string): Promise<void> {
  await squareRequest("DELETE", `/v2/customers/${customerId}/groups/${groupId}`);
}

export async function getCustomerGroupIds(customerId: string): Promise<string[]> {
  const data = await squareRequest("GET", `/v2/customers/${customerId}`);
  return data.customer?.group_ids || [];
}

/**
 * Return every Square customer that is a member of the given customer group.
 * Used by the one-shot VIP backfill to keep the scan tightly scoped — we
 * only want to (re-)sync customers actually affected by the new mapping,
 * not every app account.
 */
export async function listCustomersInGroup(groupId: string): Promise<Array<{ id: string; email_address?: string; given_name?: string; family_name?: string; phone_number?: string; created_at?: string }>> {
  const out: Array<{ id: string; email_address?: string; given_name?: string; family_name?: string; phone_number?: string; created_at?: string }> = [];
  let cursor: string | undefined;
  // Cap pagination defensively — the VIP group is expected to hold a handful
  // of people, not thousands.
  for (let page = 0; page < 10; page++) {
    const body: Record<string, unknown> = {
      query: { filter: { group_ids: { all: [groupId] } } },
      limit: 100,
    };
    if (cursor) body.cursor = cursor;
    const data = await squareRequest("POST", "/v2/customers/search", body);
    const batch = (data.customers as Array<{ id: string; email_address?: string; given_name?: string; family_name?: string; phone_number?: string; created_at?: string }>) || [];
    out.push(...batch);
    cursor = data.cursor;
    if (!cursor) break;
  }
  return out;
}

// ── Membership Checkout Link (one-time, used when no plan variation ID set) ───

export async function createMembershipCheckoutLink(opts: {
  planName: string;
  amountPence: number;
  subscriptionId: number;
  redirectUrl: string;
}): Promise<{ url: string; paymentLinkId: string }> {
  const locationId = getLocationId();

  const data = await squareRequest("POST", "/v2/online-checkout/payment-links", {
    idempotency_key: `membership-${opts.subscriptionId}-${Date.now()}`,
    quick_pay: {
      name: `${opts.planName} Membership`,
      price_money: {
        amount: opts.amountPence,
        currency: "GBP",
      },
      location_id: locationId,
    },
    payment_note: `MEMBERSHIP:${opts.subscriptionId}`,
    checkout_options: {
      redirect_url: opts.redirectUrl,
    },
  });

  const link = data.payment_link;
  return { url: link.url, paymentLinkId: link.id };
}

// ── Subscription Checkout Link (recurring billing) ────────────────────────────

export async function createSubscriptionCheckoutLink(opts: {
  planVariationId: string;
  subscriptionId: number;
  buyerEmail?: string;
  redirectUrl: string;
}): Promise<{ url: string; paymentLinkId: string }> {
  const locationId = getLocationId();
  const body: Record<string, unknown> = {
    idempotency_key: `sub-checkout-${opts.subscriptionId}-${Date.now()}`,
    order: {
      location_id: locationId,
      line_items: [
        {
          quantity: "1",
          catalog_object_id: opts.planVariationId,
        },
      ],
    },
    checkout_options: {
      redirect_url: opts.redirectUrl,
      subscription_plan_id: opts.planVariationId,
    },
  };
  if (opts.buyerEmail) {
    body.pre_populated_data = { buyer_email: opts.buyerEmail };
  }

  const data = await squareRequest("POST", "/v2/online-checkout/payment-links", body);
  const link = data.payment_link;
  return { url: link.url, paymentLinkId: link.id };
}

// ── Square Catalog Subscription Plan Setup ────────────────────────────────────

export interface PlanSetupResult {
  planId: number;
  squarePlanId: string;
  squarePlanVariationId: string;
}

export async function createCatalogSubscriptionPlan(opts: {
  localPlanId: number;
  name: string;
  amountPence: number;
}): Promise<PlanSetupResult> {
  const tempPlanId = `#plan-${opts.localPlanId}`;
  const tempVarId = `#var-${opts.localPlanId}`;

  const data = await squareRequest("POST", "/v2/catalog/batch-upsert", {
    idempotency_key: `147-membership-plan-${opts.localPlanId}-${Date.now()}`,
    batches: [
      {
        objects: [
          {
            type: "SUBSCRIPTION_PLAN",
            id: tempPlanId,
            subscription_plan_data: {
              name: `The 147 Bradford — ${opts.name} Membership`,
              subscription_plan_variations: [
                {
                  type: "SUBSCRIPTION_PLAN_VARIATION",
                  id: tempVarId,
                  subscription_plan_variation_data: {
                    name: "Monthly",
                    phases: [
                      {
                        cadence: "MONTHLY",
                        pricing: {
                          type: "STATIC",
                          price_money: {
                            amount: opts.amountPence,
                            currency: "GBP",
                          },
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    ],
  });

  const idMapping: Record<string, string> = data.id_mappings?.reduce(
    (acc: Record<string, string>, m: { client_object_id: string; object_id: string }) => {
      acc[m.client_object_id] = m.object_id;
      return acc;
    },
    {}
  ) ?? {};

  const squarePlanId = idMapping[tempPlanId] ?? "";
  const squarePlanVariationId = idMapping[tempVarId] ?? "";

  if (!squarePlanVariationId) {
    throw new Error(`Square did not return a variation ID for plan ${opts.name}`);
  }

  return { planId: opts.localPlanId, squarePlanId, squarePlanVariationId };
}

// ── Sync plan price/name to Square Catalog ────────────────────────────────────
// Returns the variation ID that should be saved to the DB (may be new if price changed)

export async function syncPlanToSquareCatalog(opts: {
  localPlanId: number;
  planVariationId: string;
  planName: string;
  newAmountPence: number;
  priceChanged: boolean;
  nameChanged: boolean;
}): Promise<{ newVariationId: string | null }> {
  let newVariationId: string | null = null;

  if (opts.priceChanged) {
    // Square does not allow editing the price of an existing plan variation (to protect
    // existing subscribers). Create a new plan with the new price instead — existing
    // subscribers automatically stay on the old plan at their original price.
    const result = await createCatalogSubscriptionPlan({
      localPlanId: opts.localPlanId,
      name: opts.planName,
      amountPence: opts.newAmountPence,
    });
    newVariationId = result.squarePlanVariationId;
    return { newVariationId };
  }

  if (opts.nameChanged) {
    // Name-only change: update the parent plan's display name in Square
    const current = await squareRequest(
      "GET",
      `/v2/catalog/object/${opts.planVariationId}?include_related_objects=true`
    ).catch(() => null);
    const parentPlanId: string | undefined =
      current?.object?.subscription_plan_variation_data?.subscription_plan_id;
    if (parentPlanId) {
      const parentData = await squareRequest("GET", `/v2/catalog/object/${parentPlanId}`).catch(() => null);
      if (parentData?.object) {
        await squareRequest("POST", "/v2/catalog/object", {
          idempotency_key: `update-plan-name-${parentPlanId}-${Date.now()}`,
          object: {
            type: "SUBSCRIPTION_PLAN",
            id: parentPlanId,
            version: parentData.object.version,
            subscription_plan_data: {
              name: `The 147 Bradford — ${opts.planName} Membership`,
            },
          },
        }).catch(() => {}); // best-effort
      }
    }
  }

  return { newVariationId };
}

// Group name used in Square for a given membership plan name
export function membershipGroupName(planName: string): string {
  return `147 Bradford — ${planName} Members`;
}

// ── Menu / Ordering ───────────────────────────────────────────────────────────

const PARENT_CATEGORY_IDS = new Set([
  "U4FPHVKPDJ3APM2V4NCNDRTK",
  "EZKBBONU2F3MW2D2YIAKCUFQ",
  "OJC6HWZ2YC274FOIWONUY2FI",
  "C7GP3UY7G5KANXQH6TSG4QN3",
]);

const SKIP_ITEMS = new Set([
  "Platinum Membership",
  "Click and collect (example service)",
]);

const CATEGORY_ORDER: Record<string, number> = {
  "Starters": 1,
  "Sharers": 2,
  "Light Bites": 3,
  "Pub Classic Mains": 4,
  "Burgers": 5,
  "Turkish Mains": 6,
  "Loaded Fries Menu": 7,
  "Pastas": 8,
  "Panini": 9,
  "Toasties": 10,
  "Build Your Own Pizza": 11,
  "Breakfast & Baps": 12,
  "Sides": 13,
  "Extras": 14,
  "Snack's": 15,
  "Snacks": 16,
  "Kids Mains": 17,
  "Kids": 18,
  "Kids Puddings": 19,
  "Puddings": 20,
  "Golden Years - Starters": 21,
  "Golden Years - Mains": 22,
  "Golden Years - Puddings": 23,
  "Draught": 24,
  "Drinks - Draught": 24,
  "Beer": 25,
  "Bitters & Stouts": 26,
  "Cider": 27,
  "Bottles": 28,
  "Bottles - Beers": 29,
  "Bottles - Cider": 30,
  "Soft Drinks": 31,
  "Soft drinks": 31,
  "Bottled Soft Drinks": 32,
  "Low & No alcohol": 33,
  "Spirits": 34,
  "Spirits - Shots & Bombs": 35,
  "Wine": 36,
  "Drinks - Wines - Wine Promo": 37,
  "Hot Drinks": 38,
  "Offers & Promotions": 39,
  "Snooker, Darts": 40,
  "Darts": 41,
};

export interface Deal {
  id: string;
  name: string;
  discountType: "FIXED_PERCENTAGE" | "FIXED_AMOUNT";
  percentage?: string;
  amountPence?: number;
  expiresOn?: string; // "YYYY-MM-DD" from Square pricing rule valid_until_date
  applicableVariationIds?: string[]; // catalog IDs from linked product set — for auto-apply at checkout
}

const DEAL_EXCLUDE_PATTERNS = [
  /next.?time/i,
  /next.?visit/i,
  /next.?purchase/i,
  /\bstaff\b/i,
  /\bmember\b/i,
  /\bplatinum\b/i,
  /\bgold\b/i,
  /\bvip\b/i,
  /blue.?light/i,
  /\bbulls?\b/i,
  /loyalty/i,
];

let dealsCache: { data: Deal[]; expiry: number } | null = null;

export async function getSquareDeals(): Promise<Deal[]> {
  if (dealsCache && Date.now() < dealsCache.expiry) return dealsCache.data;
  try {
    const [discountData, ruleData, productSetData] = await Promise.all([
      squareRequest("POST", "/v2/catalog/search", {
        object_types: ["DISCOUNT"],
        include_deleted_objects: false,
      }),
      squareRequest("POST", "/v2/catalog/search", {
        object_types: ["PRICING_RULE"],
        include_deleted_objects: false,
      }),
      squareRequest("POST", "/v2/catalog/search", {
        object_types: ["PRODUCT_SET"],
        include_deleted_objects: false,
      }),
    ]);

    // Build map: product_set_id -> array of item/variation IDs
    const productSetMap = new Map<string, string[]>();
    for (const o of (productSetData.objects || []) as any[]) {
      if (o.type !== "PRODUCT_SET" || o.is_deleted) continue;
      const ids: string[] = o.product_set_data?.product_ids_any || [];
      if (ids.length > 0) productSetMap.set(o.id, ids);
    }

    // Collect all unique product IDs from product sets, then batch-retrieve to
    // find which are ITEM_VARIATION (and get their parent item ID) vs ITEM (all variants covered).
    const allProductIds = [...new Set([...(productSetMap.values())].flat())];
    const variationParentItemId = new Map<string, string>(); // variation_id -> parent item_id
    if (allProductIds.length > 0) {
      try {
        const batchData = await squareRequest("POST", "/v2/catalog/batch-retrieve", {
          object_ids: allProductIds,
          include_related_objects: false,
        });
        for (const o of (batchData.objects || []) as any[]) {
          if (o.type === "ITEM_VARIATION" && o.item_variation_data?.item_id) {
            variationParentItemId.set(o.id, o.item_variation_data.item_id);
          }
        }
      } catch {
        // non-fatal — fall back to variation-only matching
      }
    }

    // Build maps from pricing rules: discount_id -> expiry date + applicable IDs
    // applicableIds includes both the product set IDs AND parent item IDs of any variations,
    // so matching at checkout works for ALL sizes of an item (Pint + Half, etc.)
    const expiryByDiscountId = new Map<string, string>();
    const variationsByDiscountId = new Map<string, string[]>();
    for (const o of (ruleData.objects || []) as any[]) {
      if (o.type !== "PRICING_RULE" || o.is_deleted) continue;
      const pd = o.pricing_rule_data || {};
      if (!pd.discount_id) continue;
      // Expiry date
      if (pd.valid_until_date) {
        const existing = expiryByDiscountId.get(pd.discount_id);
        if (!existing || pd.valid_until_date < existing) {
          expiryByDiscountId.set(pd.discount_id, pd.valid_until_date);
        }
      }
      // Applicable product IDs: include original IDs + parent item IDs for any variations
      if (pd.match_products_id) {
        const ids = productSetMap.get(pd.match_products_id) || [];
        if (ids.length > 0) {
          const expanded = new Set<string>(ids);
          for (const id of ids) {
            const parentItemId = variationParentItemId.get(id);
            if (parentItemId) expanded.add(parentItemId); // covers all variations of the item
          }
          const existing = variationsByDiscountId.get(pd.discount_id) || [];
          variationsByDiscountId.set(pd.discount_id, [...new Set([...existing, ...expanded])]);
        }
      }
    }

    const today = new Date().toISOString().slice(0, 10);
    const seen = new Set<string>();
    const deals: Deal[] = [];
    for (const o of (discountData.objects || []) as any[]) {
      if (o.type !== "DISCOUNT" || o.is_deleted) continue;
      const dd = o.discount_data || {};
      const name: string = (dd.name || "").trim();
      if (!name) continue;
      if (DEAL_EXCLUDE_PATTERNS.some((p) => p.test(name))) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const expiresOn = expiryByDiscountId.get(o.id);
      if (expiresOn && expiresOn < today) continue;
      const applicableVariationIds = variationsByDiscountId.get(o.id);
      deals.push({
        id: o.id,
        name,
        discountType: dd.discount_type === "FIXED_AMOUNT" ? "FIXED_AMOUNT" : "FIXED_PERCENTAGE",
        percentage: dd.percentage,
        amountPence: dd.amount_money?.amount,
        ...(expiresOn ? { expiresOn } : {}),
        ...(applicableVariationIds ? { applicableVariationIds } : {}),
      });
    }
    dealsCache = { data: deals, expiry: Date.now() + 5 * 60 * 1000 };
    return deals;
  } catch {
    return dealsCache?.data ?? [];
  }
}

export interface ModifierOption {
  id: string;           // Square catalog object ID of the modifier
  name: string;
  price: number;        // extra price in pence (0 if free)
}

export interface ModifierList {
  id: string;           // Square modifier list ID
  name: string;
  selectionType: "SINGLE" | "MULTIPLE";
  minSelections: number;
  maxSelections: number;
  options: ModifierOption[];
}

export interface MenuItem {
  id: string;
  variationId: string;
  name: string;
  variationName?: string;
  description: string;
  price: number;
  imageUrl?: string;
  updatedAt?: string;
  modifiers?: ModifierList[];
}

export interface MenuCategory {
  id: string;
  name: string;
  imageUrl?: string;
  updatedAt?: string;
  items: MenuItem[];
}

let menuCache: { data: MenuCategory[]; expiry: number } | null = null;

export async function getMenuFromSquare(): Promise<MenuCategory[]> {
  if (menuCache && Date.now() < menuCache.expiry) return menuCache.data;

  let allItems: any[] = [];
  let cursor: string | null = null;
  do {
    const url = `/v2/catalog/list?types=ITEM${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    const data = await squareRequest("GET", url);
    allItems = allItems.concat(data.objects || []);
    cursor = data.cursor || null;
  } while (cursor);

  const items = allItems.filter(
    (o) => o.type === "ITEM" && !SKIP_ITEMS.has(o.item_data?.name)
  );

  const subcatIds = new Set<string>();
  const modifierListIds = new Set<string>();
  items.forEach((item) => {
    (item.item_data?.categories || []).forEach((c: any) => {
      if (!PARENT_CATEGORY_IDS.has(c.id)) subcatIds.add(c.id);
    });
    (item.item_data?.modifier_list_info || []).forEach((m: any) => {
      if (m.enabled !== false) modifierListIds.add(m.modifier_list_id);
    });
  });

  const catNames: Record<string, string> = {};
  const catImageIds: Record<string, string> = {};
  const catUpdatedAt: Record<string, string> = {};
  if (subcatIds.size > 0) {
    const catData = await squareRequest("POST", "/v2/catalog/batch-retrieve", {
      object_ids: Array.from(subcatIds),
    });
    (catData.objects || []).forEach((o: any) => {
      catNames[o.id] = o.category_data?.name || "Other";
      if (o.category_data?.image_ids?.[0]) {
        catImageIds[o.id] = o.category_data.image_ids[0];
      }
      if (o.updated_at) {
        catUpdatedAt[o.id] = o.updated_at;
      }
    });
  }

  // Fetch modifier lists
  const modifierListMap: Record<string, ModifierList> = {};
  if (modifierListIds.size > 0) {
    const modIds = Array.from(modifierListIds);
    for (let i = 0; i < modIds.length; i += 100) {
      try {
        const chunk = modIds.slice(i, i + 100);
        const modData = await squareRequest("POST", "/v2/catalog/batch-retrieve", {
          object_ids: chunk,
        });
        (modData.objects || []).forEach((o: any) => {
          if (o.type !== "MODIFIER_LIST") return;
          const mld = o.modifier_list_data || {};
          modifierListMap[o.id] = {
            id: o.id,
            name: mld.name || "",
            selectionType: mld.selection_type === "MULTIPLE" ? "MULTIPLE" : "SINGLE",
            minSelections: mld.min_selected_modifiers ?? (mld.selection_type === "SINGLE" ? 1 : 0),
            maxSelections: mld.max_selected_modifiers ?? (mld.selection_type === "SINGLE" ? 1 : 999),
            options: (mld.modifiers || []).map((m: any) => ({
              id: m.id,
              name: m.modifier_data?.name || "",
              price: m.modifier_data?.price_money?.amount || 0,
            })),
          };
        });
      } catch {
        // Non-fatal — continue without modifiers for this chunk
      }
    }
  }

  // Collect all image IDs referenced by items and categories
  const itemImageIds: Record<string, string> = {};
  items.forEach((item) => {
    if (item.item_data?.image_ids?.[0]) {
      itemImageIds[item.id] = item.item_data.image_ids[0];
    }
  });

  const allImageObjectIds = [
    ...new Set([...Object.values(itemImageIds), ...Object.values(catImageIds)]),
  ];
  const imageUrlMap: Record<string, string> = {};
  if (allImageObjectIds.length > 0) {
    for (let i = 0; i < allImageObjectIds.length; i += 100) {
      try {
        const chunk = allImageObjectIds.slice(i, i + 100);
        const imgData = await squareRequest("POST", "/v2/catalog/batch-retrieve", {
          object_ids: chunk,
        });
        (imgData.objects || []).forEach((o: any) => {
          if (o.image_data?.url) imageUrlMap[o.id] = o.image_data.url;
        });
      } catch {
        // Non-fatal — continue without images for this chunk
      }
    }
  }

  const categoryMap: Record<string, { name: string; imageUrl?: string; updatedAt?: string; items: MenuItem[] }> = {};
  items.forEach((item) => {
    const subcatId = (item.item_data?.categories || []).find(
      (c: any) => !PARENT_CATEGORY_IDS.has(c.id)
    )?.id;
    if (!subcatId) return;
    const variations: any[] = item.item_data?.variations || [];
    if (!variations.length) return;

    if (!categoryMap[subcatId]) {
      const catImgId = catImageIds[subcatId];
      categoryMap[subcatId] = {
        name: catNames[subcatId] || "Other",
        imageUrl: catImgId ? imageUrlMap[catImgId] : undefined,
        updatedAt: catUpdatedAt[subcatId],
        items: [],
      };
    }

    const itemImgId = itemImageIds[item.id];
    const itemImageUrl = itemImgId ? imageUrlMap[itemImgId] : undefined;
    const itemUpdatedAt: string | undefined = item.updated_at ?? undefined;

    const hasMultiple = variations.length > 1;
    const isGenericName = (n: string) => ["regular", "standard", ""].includes(n.toLowerCase());

    const hasMeaningfulVariations = hasMultiple &&
      variations.some((v: any) => !isGenericName(v.item_variation_data?.name || ""));

    const variationsToShow: any[] = hasMeaningfulVariations
      ? variations
      : [variations[0]];

    // Resolve modifier lists for this item
    const itemModifiers: ModifierList[] = (item.item_data?.modifier_list_info || [])
      .filter((m: any) => m.enabled !== false && modifierListMap[m.modifier_list_id])
      .map((m: any) => modifierListMap[m.modifier_list_id]);

    variationsToShow.forEach((variation: any) => {
      const rawVarName: string = variation.item_variation_data?.name || "";
      const variationName = hasMeaningfulVariations && !isGenericName(rawVarName) ? rawVarName : undefined;
      categoryMap[subcatId].items.push({
        id: item.id,
        variationId: variation.id,
        name: item.item_data.name,
        variationName,
        description: item.item_data.description || "",
        price: variation.item_variation_data?.price_money?.amount || 0,
        imageUrl: itemImageUrl,
        ...(itemUpdatedAt ? { updatedAt: itemUpdatedAt } : {}),
        ...(itemModifiers.length > 0 ? { modifiers: itemModifiers } : {}),
      });
    });
  });

  const result = Object.entries(categoryMap)
    .map(([id, { name, imageUrl, updatedAt, items: its }]) => ({
      id,
      name,
      imageUrl,
      ...(updatedAt ? { updatedAt } : {}),
      items: its.sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => {
      const oa = CATEGORY_ORDER[a.name] ?? 99;
      const ob = CATEGORY_ORDER[b.name] ?? 99;
      return oa !== ob ? oa - ob : a.name.localeCompare(b.name);
    });

  menuCache = { data: result, expiry: Date.now() + 5 * 60 * 1000 };
  return result;
}

export function invalidateMenuCache() {
  menuCache = null;
}

export interface SelectedModifier {
  catalogObjectId: string;  // Square modifier catalog object ID
  name: string;
  price: number;            // extra price in pence
}

export interface OrderLineItem {
  variationId: string;
  itemId?: string;
  name: string;
  price: number;
  quantity: number;
  modifiers?: SelectedModifier[];
}

interface CheckoutCustomer {
  name?: string;
  email?: string;
  phone?: string;
}

export interface PricedLineItem {
  name: string;
  quantity: number;
  pricePence: number;
  variationId: string;
  itemId?: string;
  modifiers: Array<{ name: string; pricePence: number; catalogObjectId: string }>;
}

function normalizeUkPhone(phone: string): string | undefined {
  const digits = phone.replace(/[\s\-\(\)]/g, "");
  if (digits.startsWith("+44")) return digits;
  if (digits.startsWith("44") && digits.length >= 12) return "+" + digits;
  if (digits.startsWith("07") && digits.length === 11) return "+44" + digits.slice(1);
  if (digits.startsWith("7") && digits.length === 10) return "+44" + digits;
  return undefined;
}

// Build the inner Square `order` body shared by checkout-link and standalone
// order creation. Centralises line-item, modifier, deal, member-discount,
// fulfillment, and note logic so both flows produce identical Square orders.
async function buildSquareOrderBody(
  items: OrderLineItem[],
  tableNote: string | undefined,
  customer: CheckoutCustomer | undefined,
  discountPercent: number | undefined,
  discountLabel: string | undefined,
  excludeWithDeals: boolean | undefined,
  orderNote: string | undefined,
  orderNumber: number | undefined,
  // When true, the order is built WITHOUT a PICKUP fulfillment so that
  // Square for Restaurants surfaces it in the "Open Orders" / "Open
  // Tickets" screen instead of routing it to the "Online Orders → Pickup"
  // queue. Used by the kiosk flow (customer pays at the counter).
  asOpenTicket: boolean | undefined,
  // When false, Square pricing rules / discounts ("deals") are NOT
  // auto-applied to matching cart items. Member discounts still apply
  // either way — this flag only governs the venue-wide promotional
  // discounts that come from Square's Discounts catalog. Defaults to
  // true to preserve existing behaviour for callers that don't pass it.
  applyDeals: boolean | undefined = true,
): Promise<{
  order: any;
  prePopulated: Record<string, any> | undefined;
  pricedItems: PricedLineItem[];
  rawTotalPence: number;
}> {
  const locationId = getLocationId();

  // Build pre-populated buyer data for logged-in customers (used by checkout link only)
  let prePopulated: Record<string, any> | undefined;
  if (customer?.email || customer?.name || customer?.phone) {
    prePopulated = {};
    if (customer.email) prePopulated.buyer_email = customer.email;
    if (customer.phone) {
      const e164 = normalizeUkPhone(customer.phone);
      if (e164) prePopulated.buyer_phone_number = e164;
    }
    if (customer.name) {
      const parts = customer.name.trim().split(/\s+/);
      const lastName = parts.length > 1 ? parts.slice(1).join(" ") : "";
      prePopulated.buyer_address = {
        first_name: parts[0],
        ...(lastName ? { last_name: lastName } : {}),
      };
    }
  }

  // KDS ticket name precedence:
  //   1. name + table  → "Sam · Table 5"
  //   2. name only     → "Sam"
  //   3. table only    → "Table 5"
  //   4. neither       → "Collection #1234" (uses pre-reserved app order id
  //                      so kitchen has something to call out at the bar)
  //   5. truly nothing → "Guest"
  const firstName = customer?.name ? customer.name.trim().split(/\s+/)[0] : "";
  let ticketName: string;
  if (firstName && tableNote) ticketName = `${firstName} · ${tableNote}`;
  else if (firstName) ticketName = firstName;
  else if (tableNote) ticketName = tableNote;
  // Pad to 5 digits to match the receipt the customer sees on the
  // confirmation screen (e.g. app shows "#00123", so KDS shows the same).
  else if (orderNumber) ticketName = `Collection #${String(orderNumber).padStart(5, "0")}`;
  else ticketName = "Guest";
  const memberDiscountUid = "MEMBER-DISCOUNT";

  // ── Server-side price validation ────────────────────────────────────────────
  // Look up every variation and modifier from the Square catalog so customers
  // can only ever be charged the published menu price — never a value supplied
  // in the request body. Reject any unknown IDs with a clear error.
  const catalogIds = new Set<string>();
  for (const item of items) {
    if (!item.variationId) {
      throw new SquareError("Order contained an item with no variation id", "INVALID_CATALOG_ID", 400);
    }
    catalogIds.add(item.variationId);
    for (const m of item.modifiers ?? []) {
      if (!m.catalogObjectId) {
        throw new SquareError("Order contained a modifier with no catalog id", "INVALID_CATALOG_ID", 400);
      }
      catalogIds.add(m.catalogObjectId);
    }
  }
  const catalogPriceById = new Map<string, number>();
  const catalogTypeById = new Map<string, string>();
  const idsToFetch = Array.from(catalogIds);
  // Build chunks of ≤100 ids (Square's batch-retrieve cap) and fire them all
  // in parallel alongside the deals lookup below. The previous implementation
  // awaited each chunk in series and then awaited deals after, adding 150–400 ms
  // of avoidable Square round-trips to every checkout. With typical carts of
  // 1–2 chunks + 1 deals call, parallelisation collapses 3 sequential RTTs into
  // 1 wall-clock RTT.
  const catalogChunks: string[][] = [];
  for (let i = 0; i < idsToFetch.length; i += 100) {
    catalogChunks.push(idsToFetch.slice(i, i + 100));
  }
  const [catalogResults, activeDeals] = await Promise.all([
    Promise.all(
      catalogChunks.map((chunk) =>
        squareRequest("POST", "/v2/catalog/batch-retrieve", { object_ids: chunk }),
      ),
    ),
    getSquareDeals().catch(() => [] as Deal[]),
  ]);
  for (const data of catalogResults) {
    for (const o of (data.objects || []) as any[]) {
      if (o.is_deleted) continue;
      if (o.type === "ITEM_VARIATION") {
        catalogPriceById.set(o.id, o.item_variation_data?.price_money?.amount ?? 0);
        catalogTypeById.set(o.id, "ITEM_VARIATION");
      } else if (o.type === "MODIFIER") {
        catalogPriceById.set(o.id, o.modifier_data?.price_money?.amount ?? 0);
        catalogTypeById.set(o.id, "MODIFIER");
      }
    }
  }
  for (const item of items) {
    if (catalogTypeById.get(item.variationId) !== "ITEM_VARIATION") {
      throw new SquareError(
        `Unknown or unavailable menu item (id ${item.variationId})`,
        "INVALID_CATALOG_ID",
        400,
      );
    }
    for (const m of item.modifiers ?? []) {
      if (catalogTypeById.get(m.catalogObjectId) !== "MODIFIER") {
        throw new SquareError(
          `Unknown or unavailable modifier (id ${m.catalogObjectId})`,
          "INVALID_CATALOG_ID",
          400,
        );
      }
    }
  }

  // activeDeals was fetched above in parallel with the catalog lookup.
  // When applyDeals === false (staff has disabled Square offers for this
  // surface) we leave the map empty so no deal discounts are stamped on
  // line items. We still fetched the deals because cancelling that work
  // mid-Promise.all would complicate the catalog-fetch parallelism.
  const dealByVariationId = new Map<string, Deal>();
  if (applyDeals) {
    for (const deal of activeDeals) {
      if (!deal.applicableVariationIds) continue;
      for (const vid of deal.applicableVariationIds) {
        if (!dealByVariationId.has(vid)) dealByVariationId.set(vid, deal);
      }
    }
  }
  const matchedDeals = items
    .filter((i) => dealByVariationId.has(i.variationId) || (i.itemId && dealByVariationId.has(i.itemId)))
    .map((i) => (dealByVariationId.get(i.variationId) ?? dealByVariationId.get(i.itemId!))!.name);
  // Diagnostic: leaves a trail in production logs whenever a Square deal
  // is stamped onto a real order. Helps confirm the deal-application path
  // is firing without having to reproduce locally.
  if (matchedDeals.length > 0) {
    console.log(`[SQUARE DEALS] Applied to order: ${matchedDeals.join(", ")}`);
  } else if (applyDeals && activeDeals.length > 0) {
    console.log(`[SQUARE DEALS] No matching deals for cart of ${items.length} item(s); ${activeDeals.length} active deal(s) in catalog.`);
  }

  const hasMemberDiscount = typeof discountPercent === "number" && discountPercent > 0;
  const dealsInCart = matchedDeals.length > 0;
  const itemLevelMemberDiscount = hasMemberDiscount && excludeWithDeals && dealsInCart;
  const orderLevelMemberDiscount = hasMemberDiscount && !itemLevelMemberDiscount;

  const orderDiscounts: any[] = orderLevelMemberDiscount ? [{
    uid: memberDiscountUid,
    name: discountLabel ?? "Member Discount",
    type: "FIXED_PERCENTAGE",
    percentage: String(discountPercent),
    scope: "ORDER",
  }] : itemLevelMemberDiscount ? [{
    uid: memberDiscountUid,
    name: discountLabel ?? "Member Discount",
    type: "FIXED_PERCENTAGE",
    percentage: String(discountPercent),
    scope: "LINE_ITEM",
  }] : [];

  const lineItems = items.map((item, idx) => {
    const lineUid = `li-${idx}`;
    const deal = dealByVariationId.get(item.variationId) ?? (item.itemId ? dealByVariationId.get(item.itemId) : undefined);
    const appliedDiscounts: any[] = [];
    if (deal) {
      const discountUid = `deal-${idx}`;
      if (deal.discountType === "FIXED_AMOUNT" && deal.amountPence != null) {
        orderDiscounts.push({
          uid: discountUid,
          name: deal.name,
          type: "FIXED_AMOUNT",
          amount_money: { amount: deal.amountPence * item.quantity, currency: "GBP" },
          scope: "LINE_ITEM",
        });
      } else if (deal.discountType === "FIXED_PERCENTAGE" && deal.percentage) {
        orderDiscounts.push({
          uid: discountUid,
          name: deal.name,
          type: "FIXED_PERCENTAGE",
          percentage: deal.percentage,
          scope: "LINE_ITEM",
        });
      }
      if (orderDiscounts.find((d) => d.uid === discountUid)) {
        appliedDiscounts.push({ discount_uid: discountUid });
      }
    } else if (itemLevelMemberDiscount) {
      appliedDiscounts.push({ discount_uid: memberDiscountUid });
    }
    // Use the catalog price we just looked up — never the request value.
    const catalogItemPrice = catalogPriceById.get(item.variationId) ?? 0;
    return {
      uid: lineUid,
      catalog_object_id: item.variationId,
      quantity: String(item.quantity),
      base_price_money: { amount: catalogItemPrice, currency: "GBP" },
      ...(item.modifiers?.length
        ? {
            modifiers: item.modifiers.map((m) => ({
              catalog_object_id: m.catalogObjectId,
              base_price_money: {
                amount: catalogPriceById.get(m.catalogObjectId) ?? 0,
                currency: "GBP",
              },
            })),
          }
        : {}),
      ...(appliedDiscounts.length ? { applied_discounts: appliedDiscounts } : {}),
    };
  });

  const noteParts = [tableNote, orderNote].filter(Boolean);
  const combinedNote = noteParts.join(" | ");

  const order: any = {
    location_id: locationId,
    line_items: lineItems,
    // `ticket_name` is the field Square POS uses to surface orders in the
    // "Open Tickets" list on the till. Without it, the order exists in
    // Square but staff can't find it. Cap at 30 chars (Square limit).
    ticket_name: ticketName.slice(0, 30),
    // Disable Square's automatic pricing-rule discount engine. Square
    // creates an auto-apply Pricing Rule for every dashboard "Discount"
    // (e.g. "The Weekend of Hawkstone"), which would normally subtract
    // the deal a SECOND time on top of the LINE_ITEM discount we stamp
    // ourselves below — so the customer was getting £2.80 off twice and
    // landing at £0.20 instead of £3.00. We own deal application here so
    // that the staff-portal Order/Kiosk toggles can turn deals off
    // per-channel without touching the Square dashboard. Taxes are also
    // disabled to keep behaviour deterministic.
    pricing_options: { auto_apply_discounts: false, auto_apply_taxes: false },
    ...(orderDiscounts.length ? { discounts: orderDiscounts } : {}),
    // Fulfillment selection:
    //   asOpenTicket = true  (kiosk)  → SIMPLE/PROPOSED fulfillment.
    //     PICKUP/DELIVERY route the order into Square's "Online Orders"
    //     queue, hiding it from the till's Open Tickets list. But OMITTING
    //     fulfillment entirely also hides the order from the till — the
    //     order lives in Square's data layer (visible via API + Dashboard)
    //     but Square POS / Square for Restaurants will not render it on
    //     the device. SIMPLE/PROPOSED is what the till itself attaches to
    //     a fresh ticket, and is the only shape that makes a kiosk order
    //     surface in the standard Open Tickets list with no quirks.
    //   asOpenTicket = false (online checkout-link / web payment) → keep
    //     the PICKUP fulfillment so the customer-pays-remotely flow works
    //     unchanged.
    // Spoof source.name to "Point of Sale". OrderSource.name is settable on
    // CreateOrder per Square API docs (we verified Square accepts it).
    // Square POS / Square for Restaurants store the OAuth application_id as
    // immutable internal metadata and use that — NOT source.name — to
    // filter the on-device dine-in Open Tickets list. So this spoof alone
    // doesn't make orders appear in the dine-in tab. What it DOES help with
    // is keeping the source label consistent across kiosk + till orders in
    // reporting / Dashboard, and avoiding any UI that surfaces source.name
    // as a "made by an outside app" label.
    source: { name: "Point of Sale" },
    // Fulfillment: PICKUP/PROPOSED for both kiosk + online checkout-link.
    // PICKUP routes the order into Square for Restaurants' "Online Orders /
    // Pickup" queue on the till — that's the ONE on-device tab that shows
    // orders from outside apps. Staff open the ticket from there to take
    // counter payment for unpaid orders. For kiosk orders that the kiosk
    // has already taken payment for (Teya / Square Terminal), the
    // kiosk-checkout route attaches a CASH tender after the fact, which
    // moves the order onto the KDS.
    fulfillments: [
      {
        type: "PICKUP",
        state: "PROPOSED",
        pickup_details: {
          recipient: { display_name: ticketName.slice(0, 60) },
          schedule_type: "ASAP",
          is_curbside_pickup: false,
          note: combinedNote || undefined,
        },
      },
    ],
    ...(combinedNote ? {
      note: combinedNote.slice(0, 500),
      reference_id: (tableNote || "ORDER").replace(/\s+/g, "-").toUpperCase().slice(0, 40),
    } : {}),
  };

  const pricedItems: PricedLineItem[] = items.map((item) => {
    const itemPrice = catalogPriceById.get(item.variationId) ?? 0;
    const mods = (item.modifiers ?? []).map((m) => ({
      name: m.name ?? "",
      pricePence: catalogPriceById.get(m.catalogObjectId) ?? 0,
      catalogObjectId: m.catalogObjectId,
    }));
    return {
      name: item.name ?? "Item",
      quantity: item.quantity,
      pricePence: itemPrice,
      variationId: item.variationId,
      ...(item.itemId ? { itemId: item.itemId } : {}),
      modifiers: mods,
    };
  });
  const rawTotalPence = pricedItems.reduce((sum, p) => {
    const modSum = p.modifiers.reduce((s, m) => s + m.pricePence, 0);
    return sum + (p.pricePence + modSum) * p.quantity;
  }, 0);

  return { order, prePopulated, pricedItems, rawTotalPence };
}

// Create a standalone Square Order (no hosted checkout) so we can charge it
// in-app via the Web Payments SDK. Returns the Square order id and computed
// total in pence (Square evaluates discounts server-side).
// Mark a Square Order as paid by attaching a CASH tender. Used by the
// kiosk flow when payment has been collected outside Square (Teya
// terminal, Square Terminal handled by Square's own webhook flow, or a
// staff "Mark Paid" action for cash). Once the tender is attached,
// Square treats the order as a completed sale: it leaves the till's
// Pickup queue and is routed to the KDS based on item categories.
//
// Idempotent on the supplied key — safe to retry. Logs but does not
// throw on conflict (the order may already have a tender if a previous
// attempt succeeded), so callers can fire-and-forget.
export async function payOrderWithCashTender(
  orderId: string,
  amountPence: number,
  idempotencyKey: string,
): Promise<{ paymentId?: string; alreadyPaid?: boolean }> {
  const locationId = getLocationId();
  if (amountPence <= 0) {
    console.warn(`[SQUARE] payOrderWithCashTender: zero/negative amount for order ${orderId}, skipping`);
    return { alreadyPaid: true };
  }
  try {
    const data = await squareRequest("POST", "/v2/payments", {
      idempotency_key: idempotencyKey,
      source_id: "CASH",
      amount_money: { amount: amountPence, currency: "GBP" },
      cash_details: { buyer_supplied_money: { amount: amountPence, currency: "GBP" } },
      order_id: orderId,
      location_id: locationId,
    });
    const paymentId = data.payment?.id as string | undefined;
    console.log(`[SQUARE] CASH tender attached to order ${orderId} → payment ${paymentId ?? "(none)"} status ${data.payment?.status ?? "?"}`);
    return { paymentId };
  } catch (err: any) {
    // Square returns 4xx with "Order has already been paid" / similar
    // when a tender already covers the total. Treat as success.
    const msg = err?.message || "";
    if (err instanceof SquareError && err.statusCode >= 400 && err.statusCode < 500 &&
        /already.*(paid|tender)|tender.*total/i.test(msg)) {
      console.log(`[SQUARE] Order ${orderId} already paid — CASH tender skipped (${msg})`);
      return { alreadyPaid: true };
    }
    throw err;
  }
}

export async function createSquareOrderForCheckout(
  items: OrderLineItem[],
  tableNote?: string,
  customer?: CheckoutCustomer,
  discountPercent?: number,
  discountLabel?: string,
  excludeWithDeals?: boolean,
  orderNote?: string,
  orderNumber?: number,
  asOpenTicket?: boolean,
  applyDeals: boolean = true,
): Promise<{ orderId: string; totalPence: number; pricedItems: PricedLineItem[] }> {
  const idempotencyKey = `order-create-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const { order, pricedItems } = await buildSquareOrderBody(
    items, tableNote, customer, discountPercent, discountLabel, excludeWithDeals, orderNote, orderNumber, asOpenTicket, applyDeals,
  );
  const data = await squareRequest("POST", "/v2/orders", {
    idempotency_key: idempotencyKey,
    order,
  });
  if (!data.order?.id) throw new Error("No order returned from Square");
  const totalPence = Number(data.order.total_money?.amount ?? data.order.net_amounts?.total_money?.amount ?? 0);
  return { orderId: data.order.id as string, totalPence, pricedItems };
}

export async function createOrderCheckoutLink(
  items: OrderLineItem[],
  tableNote?: string,
  customer?: CheckoutCustomer,
  discountPercent?: number,
  discountLabel?: string,
  excludeWithDeals?: boolean,
  orderNote?: string,
  orderNumber?: number,
  applyDeals: boolean = true,
): Promise<{ url: string; linkId: string; squareOrderId: string; pricedItems: PricedLineItem[]; rawTotalPence: number }> {
  const idempotencyKey = `order-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const { order, prePopulated, pricedItems, rawTotalPence } = await buildSquareOrderBody(
    items, tableNote, customer, discountPercent, discountLabel, excludeWithDeals, orderNote, orderNumber, false, applyDeals,
  );
  const body: any = {
    idempotency_key: idempotencyKey,
    order,
    checkout_options: {
      allow_tipping: false,
      ...(prePopulated ? { pre_populated_data: prePopulated } : {}),
    },
  };
  const data = await squareRequest("POST", "/v2/online-checkout/payment-links", body);
  if (!data.payment_link?.url) throw new Error("No checkout URL returned from Square");
  return {
    url: data.payment_link.url as string,
    linkId: (data.payment_link.id ?? "") as string,
    squareOrderId: (data.payment_link.order_id ?? "") as string,
    pricedItems,
    rawTotalPence,
  };
}

// ── Refunds ───────────────────────────────────────────────────────────────────

export async function createRefund(opts: {
  paymentId: string;
  amountPence: number;
  reason: string;
  idempotencyKey: string;
}): Promise<{ id: string; status: string }> {
  const data = await squareRequest("POST", "/v2/refunds", {
    idempotency_key: opts.idempotencyKey,
    payment_id: opts.paymentId,
    amount_money: {
      amount: opts.amountPence,
      currency: "GBP",
    },
    reason: opts.reason,
  });
  return data.refund;
}

// ── Square Terminal API ──────────────────────────────────────────────────────
//
// Square Terminal is Square's standalone payment device. The Terminal API
// lets us push a payment request to a paired terminal — the device lights
// up showing the amount and waits for the customer to tap / insert / swipe
// their card. This means kiosk customers can pay at the counter without
// staff having to open the ticket in Square POS first.
//
// Pairing flow:
//   1. POST /v2/devices/codes — generates a one-time code (e.g. "ABCDXYZ")
//   2. Staff types the code on the terminal under
//      Settings → Sign In → Sign in with code
//   3. Poll GET /v2/devices/codes/{id} until status === "PAIRED"
//   4. Save the returned device_id — it can be reused indefinitely
//
// Once paired, POST /v2/terminals/checkouts pushes a checkout to the
// device. Square fires `terminal.checkout.updated` webhooks as the status
// changes (PENDING → IN_PROGRESS → COMPLETED / CANCELED / FAILED).
//
// Docs: https://developer.squareup.com/docs/terminal-api/overview

export async function createTerminalDeviceCode(name: string): Promise<{
  id: string;
  code: string;
  status: string;
  pairBy: string | null;
}> {
  const data = await squareRequest("POST", "/v2/devices/codes", {
    idempotency_key: `pair-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    device_code: {
      name: (name || "The 147 Counter").slice(0, 128),
      product_type: "TERMINAL_API",
      location_id: getLocationId(),
    },
  });
  const dc = data.device_code || {};
  return {
    id: dc.id,
    code: dc.code,
    status: dc.status || "UNKNOWN",
    pairBy: dc.pair_by || null,
  };
}

export async function getTerminalDeviceCode(codeId: string): Promise<{
  id: string;
  code: string;
  status: string;
  deviceId: string | null;
  name: string | null;
} | null> {
  try {
    const data = await squareRequest("GET", `/v2/devices/codes/${codeId}`);
    const dc = data.device_code;
    if (!dc) return null;
    return {
      id: dc.id,
      code: dc.code,
      status: dc.status || "UNKNOWN",
      deviceId: dc.device_id || null,
      name: dc.name || null,
    };
  } catch (err) {
    if (err instanceof SquareError && err.statusCode === 404) return null;
    throw err;
  }
}

// Pushes a checkout to a paired terminal. The customer sees the amount on
// the device and taps / inserts / swipes their card. Use `referenceId` to
// link back to your local order (we set it to the app_order id as a string
// so the webhook handler can find the row).
export async function createTerminalCheckout(opts: {
  deviceId: string;
  amountPence: number;
  referenceId: string;
  note: string;
  idempotencyKey: string;
}): Promise<{ id: string; status: string }> {
  const data = await squareRequest("POST", "/v2/terminals/checkouts", {
    idempotency_key: opts.idempotencyKey,
    checkout: {
      amount_money: { amount: opts.amountPence, currency: "GBP" },
      reference_id: opts.referenceId.slice(0, 40),
      note: opts.note.slice(0, 500),
      device_options: {
        device_id: opts.deviceId,
        skip_receipt_screen: true,
        tip_settings: { allow_tipping: false },
      },
    },
  });
  const c = data.checkout || {};
  return { id: c.id, status: c.status || "PENDING" };
}

export async function getTerminalCheckout(checkoutId: string): Promise<{
  id: string;
  status: string;
  referenceId: string | null;
  paymentIds: string[];
} | null> {
  try {
    const data = await squareRequest("GET", `/v2/terminals/checkouts/${checkoutId}`);
    const c = data.checkout;
    if (!c) return null;
    return {
      id: c.id,
      status: c.status || "UNKNOWN",
      referenceId: c.reference_id || null,
      paymentIds: c.payment_ids || [],
    };
  } catch (err) {
    if (err instanceof SquareError && err.statusCode === 404) return null;
    throw err;
  }
}

// Cancels a pending / in-progress terminal checkout. Used if staff need to
// abort a charge (e.g. customer changed their mind). Errors are swallowed
// because the local DB cancel is the source of truth.
export async function cancelTerminalCheckout(checkoutId: string): Promise<boolean> {
  try {
    await squareRequest("POST", `/v2/terminals/checkouts/${checkoutId}/cancel`, {});
    return true;
  } catch (err: any) {
    console.error(`[SQUARE-TERMINAL] cancelTerminalCheckout(${checkoutId}) failed:`, err?.message || err);
    return false;
  }
}
