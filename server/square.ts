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

function toE164(phone: string): string {
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

export function isConfigured(): boolean {
  return !!(process.env.SQUARE_ACCESS_TOKEN && (process.env.SQUARE_LOC_ID || process.env.SQUARE_LOCATION_ID));
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

export async function createSquareSubscription(
  squareCustomerId: string,
  planVariationId: string,
  locationId: string,
  cardId?: string
) {
  const today = new Date().toISOString().slice(0, 10);
  const body: Record<string, unknown> = {
    idempotency_key: `sub-${squareCustomerId}-${Date.now()}`,
    location_id: locationId,
    plan_variation_id: planVariationId,
    customer_id: squareCustomerId,
    start_date: today,
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

export async function createDepositPaymentLink(opts: {
  amountPence: number;
  description: string;
  referenceId: string;
  redirectUrl: string;
}): Promise<{ url: string; paymentLinkId: string }> {
  const locationId = getLocationId();

  const data = await squareRequest("POST", "/v2/online-checkout/payment-links", {
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
  });

  const link = data.payment_link;
  return {
    url: link.url,
    paymentLinkId: link.id,
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
  const body: Record<string, unknown> = {
    idempotency_key: `sub-checkout-${opts.subscriptionId}-${Date.now()}`,
    subscription_plan_variation_id: opts.planVariationId,
    checkout_options: {
      redirect_url: opts.redirectUrl,
      subscription_cancel_url: "https://the147bradford.replit.app/membership",
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

// Group name used in Square for a given membership plan name
export function membershipGroupName(planName: string): string {
  return `147 Bradford — ${planName} Members`;
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
