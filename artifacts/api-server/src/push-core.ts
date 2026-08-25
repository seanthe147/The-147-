export type PushData = Record<string, unknown>;

interface PushMessage {
  to: string;
  sound: "default";
  title: string;
  body: string;
  channelId: string;
  data?: PushData;
}

export type PushNotification = Pick<PushMessage, "to" | "title" | "body" | "data">;

interface ExpoTicket {
  status?: string;
  message?: string;
  details?: { error?: string };
}

interface ExpoError {
  code?: string;
  message?: string;
  details?: Record<string, string[]>;
}

interface ExpoResponse {
  data?: ExpoTicket[];
  errors?: ExpoError[];
}

export interface PushDeliveryResult {
  successCount: number;
  failureCount: number;
  deadTokens: string[];
}

export function isValidExpoPushToken(token: unknown): token is string {
  return typeof token === "string"
    && /^(?:Exponent|Expo)PushToken\[[^\]\s]+\]$/.test(token)
    && token.length <= 300;
}

/**
 * Sends Expo messages in batches of at most 100. Every input message is
 * counted exactly once, including malformed/short responses and HTTP errors.
 */
export async function deliverExpoPushMessages(
  notifications: PushNotification[],
  fetchImpl: typeof fetch = fetch,
): Promise<PushDeliveryResult> {
  if (notifications.length === 0) {
    return { successCount: 0, failureCount: 0, deadTokens: [] };
  }

  const messages: PushMessage[] = notifications.map((notification) => ({
    ...notification,
    sound: "default",
    channelId: "default",
  }));
  let successCount = 0;
  let failureCount = 0;
  const deadTokens = new Set<string>();

  async function sendBatch(batch: PushMessage[], allowSplit = true): Promise<void> {
    let response: Response;
    try {
      response = await fetchImpl("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "Accept-Encoding": "gzip, deflate",
        },
        body: JSON.stringify(batch),
      });
    } catch (error) {
      console.error("[push] Network error sending to Expo:", error);
      failureCount += batch.length;
      return;
    }

    let responseData: ExpoResponse;
    try {
      const text = await response.text();
      responseData = text ? JSON.parse(text) as ExpoResponse : {};
    } catch (error) {
      console.error(`[push] Invalid Expo response (HTTP ${response.status}):`, error);
      failureCount += batch.length;
      return;
    }

    if (!response.ok) {
      console.error(`[push] Expo HTTP ${response.status}:`, JSON.stringify(responseData));
      failureCount += batch.length;
      return;
    }

    const mixedError = responseData.errors?.find(
      (error) => error.code === "PUSH_TOO_MANY_EXPERIENCE_IDS",
    );
    if (allowSplit && mixedError?.details) {
      const remaining = new Set(batch.map((message) => message.to));
      for (const groupTokens of Object.values(mixedError.details)) {
        const groupSet = new Set(groupTokens);
        const group = batch.filter((message) => remaining.has(message.to) && groupSet.has(message.to));
        group.forEach((message) => remaining.delete(message.to));
        if (group.length > 0) await sendBatch(group, false);
      }
      failureCount += batch.filter((message) => remaining.has(message.to)).length;
      return;
    }

    if (responseData.errors?.length) {
      console.error("[push] Expo API error:", JSON.stringify(responseData.errors));
      failureCount += batch.length;
      return;
    }

    if (!Array.isArray(responseData.data)) {
      console.error("[push] Unexpected Expo response:", JSON.stringify(responseData));
      failureCount += batch.length;
      return;
    }

    for (let index = 0; index < batch.length; index++) {
      const ticket = responseData.data[index];
      if (ticket?.status === "ok") {
        successCount++;
        continue;
      }
      failureCount++;
      const error = ticket?.details?.error;
      if (error === "DeviceNotRegistered") {
        deadTokens.add(batch[index].to);
      }
    }
  }

  for (let index = 0; index < messages.length; index += 100) {
    await sendBatch(messages.slice(index, index + 100));
  }

  return { successCount, failureCount, deadTokens: [...deadTokens] };
}