import assert from "node:assert/strict";
import test from "node:test";

import {
  buildNativeAnalyticsPayload,
  deliverNativeAnalyticsEvent,
} from "./analytics-core.ts";

test("builds a privacy-safe iOS payload with the existing event name", () => {
  const payload = buildNativeAnalyticsPayload(
    "booking_completed",
    "native-test-install",
    "ios",
    { deposit_required: false },
    "phc_test_project",
  );

  assert.deepEqual(payload, {
    api_key: "phc_test_project",
    event: "booking_completed",
    distinct_id: "native-test-install",
    properties: {
      deposit_required: false,
      $lib: "the-147-native",
      $lib_version: "1.0.0",
      app_surface: "native",
      platform: "ios",
    },
  });
});

test("delivers Android events to the EU PostHog capture endpoint", async () => {
  let requestUrl = "";
  let requestInit: RequestInit | undefined;

  await deliverNativeAnalyticsEvent(
    "order_checkout_succeeded",
    { method: "payment_sheet" },
    {
      apiKey: "phc_test_project",
      distinctId: "native-test-install",
      platform: "android",
      fetchImpl: async (input, init) => {
        requestUrl = String(input);
        requestInit = init;
        return { ok: true, status: 200 } as Response;
      },
    },
  );

  assert.equal(requestUrl, "https://eu.i.posthog.com/capture/");
  assert.equal(requestInit?.method, "POST");
  assert.equal(
    requestInit?.headers &&
      (requestInit.headers as Record<string, string>)["Content-Type"],
    "application/json",
  );
  assert.deepEqual(JSON.parse(String(requestInit?.body)), {
    api_key: "phc_test_project",
    event: "order_checkout_succeeded",
    distinct_id: "native-test-install",
    properties: {
      method: "payment_sheet",
      $lib: "the-147-native",
      $lib_version: "1.0.0",
      app_surface: "native",
      platform: "android",
    },
  });
});
