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
    const [discountData, ruleData] = await Promise.all([
      squareRequest("POST", "/v2/catalog/search", {
        object_types: ["DISCOUNT"],
        include_deleted_objects: false,
      }),
      squareRequest("POST", "/v2/catalog/search", {
        object_types: ["PRICING_RULE"],
        include_deleted_objects: false,
      }),
    ]);

    // Build map: discount_id -> earliest valid_until_date from pricing rules
    const expiryByDiscountId = new Map<string, string>();
    for (const o of (ruleData.objects || []) as any[]) {
      if (o.type !== "PRICING_RULE" || o.is_deleted) continue;
      const pd = o.pricing_rule_data || {};
      if (pd.discount_id && pd.valid_until_date) {
        const existing = expiryByDiscountId.get(pd.discount_id);
        // Keep the earliest expiry if multiple rules reference the same discount
        if (!existing || pd.valid_until_date < existing) {
          expiryByDiscountId.set(pd.discount_id, pd.valid_until_date);
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
      // Skip deals whose expiry has already passed
      if (expiresOn && expiresOn < today) continue;
      deals.push({
        id: o.id,
        name,
        discountType: dd.discount_type === "FIXED_AMOUNT" ? "FIXED_AMOUNT" : "FIXED_PERCENTAGE",
        percentage: dd.percentage,
        amountPence: dd.amount_money?.amount,
        ...(expiresOn ? { expiresOn } : {}),
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

function normalizeUkPhone(phone: string): string | undefined {
  const digits = phone.replace(/[\s\-\(\)]/g, "");
  if (digits.startsWith("+44")) return digits;
  if (digits.startsWith("44") && digits.length >= 12) return "+" + digits;
  if (digits.startsWith("07") && digits.length === 11) return "+44" + digits.slice(1);
  if (digits.startsWith("7") && digits.length === 10) return "+44" + digits;
  return undefined;
}

export async function createOrderCheckoutLink(
  items: OrderLineItem[],
  tableNote?: string,
  customer?: CheckoutCustomer,
  discountPercent?: number,
  discountLabel?: string
): Promise<{ url: string; linkId: string; squareOrderId: string }> {
  const locationId = getLocationId();
  const idempotencyKey = `order-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Build pre-populated buyer data for logged-in customers
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

  // Recipient name: "Table 3" or customer name, shown on the KDS ticket
  const ticketName = tableNote || (customer?.name ? customer.name.split(" ")[0] : "Guest");

  const memberDiscountUid = "MEMBER-DISCOUNT";
  const applyDiscount = typeof discountPercent === "number" && discountPercent > 0;

  const body: any = {
    idempotency_key: idempotencyKey,
    order: {
      location_id: locationId,
      line_items: items.map((item) => ({
        catalog_object_id: item.variationId,
        quantity: String(item.quantity),
        base_price_money: { amount: item.price, currency: "GBP" },
        ...(item.modifiers?.length
          ? {
              modifiers: item.modifiers.map((m) => ({
                catalog_object_id: m.catalogObjectId,
                base_price_money: { amount: m.price, currency: "GBP" },
              })),
            }
          : {}),
      })),
      ...(applyDiscount ? {
        discounts: [{
          uid: memberDiscountUid,
          name: discountLabel ?? "Member Discount",
          type: "FIXED_PERCENTAGE",
          percentage: String(discountPercent),
          scope: "ORDER",
        }],
      } : {}),
      // PICKUP fulfillment is required for Square KDS to display the order.
      // KDS routing rules on each device then split food → kitchen and drinks → bar.
      fulfillments: [
        {
          type: "PICKUP",
          state: "PROPOSED",
          pickup_details: {
            recipient: {
              display_name: ticketName.slice(0, 60),
            },
            schedule_type: "ASAP",
            is_curbside_pickup: false,
            note: tableNote || undefined,
          },
        },
      ],
      ...(tableNote ? {
        note: tableNote,
        reference_id: tableNote.replace(/\s+/g, "-").toUpperCase().slice(0, 40),
      } : {}),
    },
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
