import assert from "node:assert/strict";
import test from "node:test";
import { provisionSnookerMemberDiscount } from "./square";
import { createApp } from "./app";

test("snooker catalog payload uses Square percentage and remains idempotent", async () => {
  assert.equal(process.env.MEMBERSHIP_BILLING_ISOLATED_TEST, "yes");
  const originalFetch = globalThis.fetch;
  const objects = new Map<string, any>();
  let writes = 0;
  globalThis.fetch = async (_url, init) => {
    const url = String(_url);
    const body = JSON.parse(String(init?.body));
    if (url.endsWith("/v2/catalog/search")) {
      const existing = objects.get(body.object_types[0]);
      return new Response(JSON.stringify({ objects: existing ? [existing] : [] }));
    }
    assert.ok(url.endsWith("/v2/catalog/object"), "no unrelated provider writes");
    const object = body.object;
    if (object.type === "DISCOUNT") {
      assert.equal(object.discount_data.percentage, "10");
      assert.equal(object.discount_data.discount_type, "FIXED_PERCENTAGE");
      assert.equal(object.discount_data.percentage_discount, undefined);
    }
    if (object.type === "PRODUCT_SET") {
      assert.equal(object.product_set_data.all_products, false);
      assert.deepEqual(object.product_set_data.product_ids_any, ["snooker-hour"]);
    }
    if (object.type === "PRICING_RULE") assert.deepEqual(object.pricing_rule_data.customer_group_ids_any, ["blue", "pink-annual"]);
    const saved = { ...object, id: object.type + "-fixture", version: 1 };
    objects.set(object.type, saved);
    writes++;
    return new Response(JSON.stringify({ catalog_object: saved }));
  };
  try {
    const input = { productVariationIds: ["snooker-hour"], customerGroupIds: ["pink-annual", "blue"] };
    await provisionSnookerMemberDiscount(input);
    assert.equal(writes, 3);
    await provisionSnookerMemberDiscount(input);
    assert.equal(writes, 3, "unchanged configuration must not be written again");
  } finally { globalThis.fetch = originalFetch; }
});

test("application exposes unauthenticated health route", async () => {
  const server = createApp().listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  try {
    const port = (server.address() as any).port;
    const response = await fetch(`http://127.0.0.1:${port}/api/healthz`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "ok" });
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
