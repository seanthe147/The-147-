import assert from "node:assert/strict";
import { mock } from "node:test";
import test from "node:test";

import { getSquareDeals, invalidateSquareDealsCache } from "./square.ts";

const originalFetch = globalThis.fetch;
const originalSquareAccessToken = process.env.SQUARE_ACCESS_TOKEN;

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
  });
}

function installCatalogFetch(): void {
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { object_types?: string[] };
    const objectType = body.object_types?.[0];

    if (objectType === "DISCOUNT") {
      return jsonResponse({
        objects: [
          {
            id: "discount-active",
            type: "DISCOUNT",
            discount_data: {
              name: "Active scheduled deal",
              discount_type: "FIXED_PERCENTAGE",
              percentage: "20",
            },
          },
          {
            id: "discount-expired",
            type: "DISCOUNT",
            discount_data: {
              name: "Expired scheduled deal",
              discount_type: "FIXED_PERCENTAGE",
              percentage: "15",
            },
          },
          {
            id: "discount-cutover",
            type: "DISCOUNT",
            discount_data: {
              name: "Local-time cutover deal",
              discount_type: "FIXED_AMOUNT",
              amount_money: { amount: 100 },
            },
          },
          {
            id: "discount-manual",
            type: "DISCOUNT",
            discount_data: {
              name: "Manual staff deal",
              discount_type: "FIXED_PERCENTAGE",
              percentage: "10",
            },
          },
        ],
      });
    }

    if (objectType === "PRICING_RULE") {
      return jsonResponse({
        objects: [
          {
            id: "rule-active",
            type: "PRICING_RULE",
            pricing_rule_data: {
              discount_id: "discount-active",
              valid_from_date: "2026-01-01",
              valid_until_date: "2026-12-31",
              match_products_id: "product-set-active",
            },
          },
          {
            id: "rule-expired",
            type: "PRICING_RULE",
            pricing_rule_data: {
              discount_id: "discount-expired",
              valid_from_date: "2026-01-01",
              valid_until_date: "2026-09-01",
            },
          },
          {
            id: "rule-cutover",
            type: "PRICING_RULE",
            pricing_rule_data: {
              discount_id: "discount-cutover",
              valid_from_date: "2026-09-14",
              valid_until_date: "2026-09-14",
              valid_until_local_time: "18:00:00",
            },
          },
          {
            id: "rule-manual",
            type: "PRICING_RULE",
            pricing_rule_data: {
              discount_id: "discount-manual",
            },
          },
        ],
      });
    }

    if (objectType === "PRODUCT_SET") {
      return jsonResponse({
        objects: [
          {
            id: "product-set-active",
            type: "PRODUCT_SET",
            product_set_data: { product_ids_any: ["variation-active"] },
          },
        ],
      });
    }

    if (String(_input).includes("/v2/catalog/batch-retrieve")) {
      return jsonResponse({
        objects: [
          {
            id: "variation-active",
            type: "ITEM_VARIATION",
            item_variation_data: { item_id: "item-active" },
          },
        ],
      });
    }

    throw new Error(`Unexpected Square request: ${String(_input)}`);
  }) as typeof fetch;
}

test("customer deal list excludes expired and unscheduled rules", async () => {
  process.env.SQUARE_ACCESS_TOKEN = "square-deals-test-token";
  installCatalogFetch();
  invalidateSquareDealsCache();
  mock.timers.enable({
    apis: ["Date"],
    now: new Date("2026-09-14T16:59:59.000Z"),
  });

  try {
    const deals = await getSquareDeals();

    assert.deepEqual(deals.map((deal) => deal.id), [
      "discount-active",
      "discount-cutover",
    ]);
    assert.deepEqual(deals[0]?.applicableVariationIds, [
      "variation-active",
      "item-active",
    ]);
    assert.equal(deals.find((deal) => deal.id === "discount-expired"), undefined);
    assert.equal(deals.find((deal) => deal.id === "discount-manual"), undefined);
  } finally {
    mock.timers.reset();
    invalidateSquareDealsCache();
    globalThis.fetch = originalFetch;
    if (originalSquareAccessToken === undefined) {
      delete process.env.SQUARE_ACCESS_TOKEN;
    } else {
      process.env.SQUARE_ACCESS_TOKEN = originalSquareAccessToken;
    }
  }
});

test("customer deal list treats an exact local end time as exclusive", async () => {
  process.env.SQUARE_ACCESS_TOKEN = "square-deals-test-token";
  installCatalogFetch();
  invalidateSquareDealsCache();
  mock.timers.enable({
    apis: ["Date"],
    now: new Date("2026-09-14T17:00:00.000Z"),
  });

  try {
    const deals = await getSquareDeals();

    assert.deepEqual(deals.map((deal) => deal.id), ["discount-active"]);
  } finally {
    mock.timers.reset();
    invalidateSquareDealsCache();
    globalThis.fetch = originalFetch;
    if (originalSquareAccessToken === undefined) {
      delete process.env.SQUARE_ACCESS_TOKEN;
    } else {
      process.env.SQUARE_ACCESS_TOKEN = originalSquareAccessToken;
    }
  }
});