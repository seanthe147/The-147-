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
  modifiers?: ModifierList[];
}

export interface MenuCategory {
  id: string;
  name: string;
  imageUrl?: string;
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
  if (subcatIds.size > 0) {
    const catData = await squareRequest("POST", "/v2/catalog/batch-retrieve", {
      object_ids: Array.from(subcatIds),
    });
    (catData.objects || []).forEach((o: any) => {
      catNames[o.id] = o.category_data?.name || "Other";
      if (o.category_data?.image_ids?.[0]) {
        catImageIds[o.id] = o.category_data.image_ids[0];
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

  const categoryMap: Record<string, { name: string; imageUrl?: string; items: MenuItem[] }> = {};
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
        items: [],
      };
    }

    const itemImgId = itemImageIds[item.id];
    const itemImageUrl = itemImgId ? imageUrlMap[itemImgId] : undefined;

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
        ...(itemModifiers.length > 0 ? { modifiers: itemModifiers } : {}),
      });
    });
  });

  const result = Object.entries(categoryMap)
    .map(([id, { name, imageUrl, items: its }]) => ({
      id,
      name,
      imageUrl,
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
  modifiers: Array<{ name: string; pricePence: number }>;
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

  const ticketName = tableNote || (customer?.name ? customer.name.split(" ")[0] : "Guest");
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
  for (let i = 0; i < idsToFetch.length; i += 100) {
    const chunk = idsToFetch.slice(i, i + 100);
    const data = await squareRequest("POST", "/v2/catalog/batch-retrieve", {
      object_ids: chunk,
    });
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

  const activeDeals = await getSquareDeals().catch(() => [] as Deal[]);
  const dealByVariationId = new Map<string, Deal>();
  for (const deal of activeDeals) {
    if (!deal.applicableVariationIds) continue;
    for (const vid of deal.applicableVariationIds) {
      if (!dealByVariationId.has(vid)) dealByVariationId.set(vid, deal);
    }
  }
  const matchedDeals = items
    .filter((i) => dealByVariationId.has(i.variationId) || (i.itemId && dealByVariationId.has(i.itemId)))
    .map((i) => (dealByVariationId.get(i.variationId) ?? dealByVariationId.get(i.itemId!))!.name);

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
    ...(orderDiscounts.length ? { discounts: orderDiscounts } : {}),
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
    }));
    return {
      name: item.name ?? "Item",
      quantity: item.quantity,
      pricePence: itemPrice,
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
export async function createSquareOrderForCheckout(
  items: OrderLineItem[],
  tableNote?: string,
  customer?: CheckoutCustomer,
  discountPercent?: number,
  discountLabel?: string,
  excludeWithDeals?: boolean,
  orderNote?: string,
): Promise<{ orderId: string; totalPence: number; pricedItems: PricedLineItem[] }> {
  const idempotencyKey = `order-create-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const { order, pricedItems } = await buildSquareOrderBody(
    items, tableNote, customer, discountPercent, discountLabel, excludeWithDeals, orderNote,
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
  orderNote?: string
): Promise<{ url: string; linkId: string; squareOrderId: string; pricedItems: PricedLineItem[]; rawTotalPence: number }> {
  const idempotencyKey = `order-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const { order, prePopulated, pricedItems, rawTotalPence } = await buildSquareOrderBody(
    items, tableNote, customer, discountPercent, discountLabel, excludeWithDeals, orderNote,
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
