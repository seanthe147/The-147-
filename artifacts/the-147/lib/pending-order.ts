import AsyncStorage from "@react-native-async-storage/async-storage";

const PENDING_KEY = "pending_order_confirmation_v2";

export interface PendingConfirmation {
  appOrderId: number;
  token: string;
}

export async function setPendingConfirmation(p: PendingConfirmation): Promise<void> {
  try {
    await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(p));
  } catch {}
}

export async function getPendingConfirmation(): Promise<PendingConfirmation | null> {
  try {
    const v = await AsyncStorage.getItem(PENDING_KEY);
    if (!v) return null;
    const parsed = JSON.parse(v);
    if (
      parsed &&
      typeof parsed.appOrderId === "number" &&
      typeof parsed.token === "string" &&
      parsed.token.length > 0
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export async function clearPendingConfirmation(appOrderId?: number): Promise<void> {
  try {
    if (appOrderId !== undefined) {
      const cur = await getPendingConfirmation();
      if (cur && cur.appOrderId !== appOrderId) return;
    }
    await AsyncStorage.removeItem(PENDING_KEY);
  } catch {}
}
