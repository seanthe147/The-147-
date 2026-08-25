import { storage } from "./storage";
import {
  deliverExpoPushMessages,
  type PushData,
  type PushNotification,
} from "./push-core";

export {
  isValidExpoPushToken,
  type PushData,
  type PushNotification,
} from "./push-core";

export async function sendPushToTokens(
  tokens: string[],
  title: string,
  body: string,
  data?: PushData,
): Promise<{ successCount: number; failureCount: number }> {
  return sendPushMessages(tokens.map((to) => ({
    to,
    title,
    body,
    ...(data ? { data } : {}),
  })));
}

export async function sendPushMessages(
  notifications: PushNotification[],
): Promise<{ successCount: number; failureCount: number }> {
  const result = await deliverExpoPushMessages(notifications);

  for (const token of result.deadTokens) {
    try {
      await Promise.all([
        storage.removePushToken(token),
        storage.removeStaffPushToken(token),
      ]);
    } catch (error) {
      console.error(`[push] Failed to remove undeliverable token ${token}:`, error);
    }
  }

  return {
    successCount: result.successCount,
    failureCount: result.failureCount,
  };
}

export async function sendPushToCustomerEmail(
  email: string,
  title: string,
  body: string,
  data?: PushData,
): Promise<{ successCount: number; failureCount: number }> {
  if (!email) return { successCount: 0, failureCount: 0 };
  const tokens = await storage.getPushTokensByEmail(email);
  return sendPushToTokens(tokens.map((token) => token.token), title, body, data);
}