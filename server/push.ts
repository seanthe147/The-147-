// Centralised Expo push helper used by background schedulers and webhook
// handlers. The interactive admin "send to everyone" flow has its own copy
// inside server/routes.ts (it does deeper Expo error handling and dead-token
// cleanup); the helpers below are for targeted, low-volume pushes where we
// just need fire-and-forget delivery with structured `data` payloads.

import { storage } from "./storage";

type PushData = Record<string, unknown>;

interface PushMessage {
  to: string;
  sound: "default";
  title: string;
  body: string;
  data?: PushData;
}

/**
 * Send a push notification to a list of Expo push tokens. Splits batches at
 * Expo's 100-message limit. Removes any tokens that come back as
 * `DeviceNotRegistered` so we don't keep retrying dead installs.
 */
export async function sendPushToTokens(
  tokens: string[],
  title: string,
  body: string,
  data?: PushData,
): Promise<{ successCount: number; failureCount: number }> {
  if (!tokens.length) return { successCount: 0, failureCount: 0 };

  const messages: PushMessage[] = tokens.map((to) => ({
    to,
    sound: "default",
    title,
    body,
    ...(data ? { data } : {}),
  }));

  let successCount = 0;
  let failureCount = 0;
  const deadTokens: string[] = [];

  for (let i = 0; i < messages.length; i += 100) {
    const batch = messages.slice(i, i + 100);
    try {
      const response = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify(batch),
      });
      const json = await response.json() as {
        data?: Array<{ status: string; message?: string; details?: { error?: string } }>;
        errors?: Array<{ code: string; message: string }>;
      };
      if (json.errors && json.errors.length) {
        console.error("[push] Expo API error:", JSON.stringify(json.errors));
        failureCount += batch.length;
        continue;
      }
      if (Array.isArray(json.data)) {
        json.data.forEach((result, index) => {
          const token = batch[index]?.to;
          if (result.status === "ok") {
            successCount += 1;
          } else {
            failureCount += 1;
            if (result.details?.error === "DeviceNotRegistered" && token) {
              deadTokens.push(token);
            }
          }
        });
      } else {
        failureCount += batch.length;
      }
    } catch (err) {
      console.error("[push] network error sending to Expo:", err);
      failureCount += batch.length;
    }
  }

  for (const token of deadTokens) {
    try {
      await storage.removePushToken(token);
    } catch (err) {
      console.error(`[push] failed to remove dead token ${token}:`, err);
    }
  }

  return { successCount, failureCount };
}

/**
 * Look up a customer's registered push tokens by email and send them a push.
 * Returns the same shape as sendPushToTokens; safe to call when the customer
 * has no devices registered.
 */
export async function sendPushToCustomerEmail(
  email: string,
  title: string,
  body: string,
  data?: PushData,
): Promise<{ successCount: number; failureCount: number }> {
  if (!email) return { successCount: 0, failureCount: 0 };
  const tokens = await storage.getPushTokensByEmail(email);
  if (!tokens.length) return { successCount: 0, failureCount: 0 };
  return sendPushToTokens(tokens.map((t) => t.token), title, body, data);
}
