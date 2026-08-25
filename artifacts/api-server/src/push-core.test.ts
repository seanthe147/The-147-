import assert from "node:assert/strict";
import test from "node:test";
import {
  deliverExpoPushMessages,
  isValidExpoPushToken,
  type PushNotification,
} from "./push-core.ts";
import {
  createPushRegistrationSecret,
  hashPushRegistrationSecret,
  matchesPushRegistrationSecret,
} from "./push-registration.ts";

function notification(to: string): PushNotification {
  return { to, title: "Test", body: "Test body" };
}

test("validates Expo token formats", () => {
  const token = "ExpoPushToken[valid-device-token]";
  assert.equal(isValidExpoPushToken(token), true);
  assert.equal(isValidExpoPushToken("ExpoPushToken[bad token]"), false);
});

test("device registration secrets cannot be reused for another token", () => {
  const token = "ExpoPushToken[owned-device]";
  const secret = createPushRegistrationSecret();
  const hash = hashPushRegistrationSecret(token, secret);
  assert.equal(matchesPushRegistrationSecret(token, secret, hash), true);
  assert.equal(
    matchesPushRegistrationSecret("ExpoPushToken[another-device]", secret, hash),
    false,
  );
  assert.equal(matchesPushRegistrationSecret(token, createPushRegistrationSecret(), hash), false);
  assert.equal(matchesPushRegistrationSecret(token, undefined, hash), false);
});

test("does not prune tokens when the sender credentials are invalid", async () => {
  const token = "ExpoPushToken[credential-error]";
  const result = await deliverExpoPushMessages(
    [notification(token)],
    async () => new Response(JSON.stringify({
      data: [{ status: "error", details: { error: "InvalidCredentials" } }],
    }), { status: 200 }) as never,
  );
  assert.equal(result.failureCount, 1);
  assert.deepEqual(result.deadTokens, []);
});

test("counts Expo tickets exactly and identifies permanently dead tokens", async () => {
  const live = "ExpoPushToken[live]";
  const dead = "ExpoPushToken[dead]";
  const result = await deliverExpoPushMessages(
    [notification(live), notification(dead), notification("ExpoPushToken[missing-ticket]")],
    async () => new Response(JSON.stringify({
      data: [
        { status: "ok" },
        { status: "error", details: { error: "DeviceNotRegistered" } },
      ],
    }), { status: 200 }) as never,
  );
  assert.deepEqual(result, {
    successCount: 1,
    failureCount: 2,
    deadTokens: [dead],
  });
});

test("treats non-2xx and invalid responses as complete batch failures", async () => {
  const messages = [notification("ExpoPushToken[a]"), notification("ExpoPushToken[b]")];
  const httpFailure = await deliverExpoPushMessages(
    messages,
    async () => new Response('{"errors":[{"message":"unavailable"}]}', { status: 503 }) as never,
  );
  assert.equal(httpFailure.successCount, 0);
  assert.equal(httpFailure.failureCount, 2);

  const invalidJson = await deliverExpoPushMessages(
    messages,
    async () => new Response("not-json", { status: 200 }) as never,
  );
  assert.equal(invalidJson.successCount, 0);
  assert.equal(invalidJson.failureCount, 2);
});

test("batches at Expo's 100-message limit", async () => {
  const batchSizes: number[] = [];
  const messages = Array.from({ length: 205 }, (_, index) =>
    notification(`ExpoPushToken[token-${index}]`));
  const result = await deliverExpoPushMessages(messages, async (_url, init) => {
    const batch = JSON.parse(String(init?.body)) as unknown[];
    batchSizes.push(batch.length);
    return new Response(JSON.stringify({
      data: batch.map(() => ({ status: "ok" })),
    }), { status: 200 });
  });
  assert.deepEqual(batchSizes, [100, 100, 5]);
  assert.equal(result.successCount, 205);
  assert.equal(result.failureCount, 0);
});