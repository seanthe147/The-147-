import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

import {
  deliverNativeAnalyticsEvent,
  type AnalyticsData,
} from "./analytics-core";

const ANONYMOUS_ID_STORAGE_KEY = "the147.analytics.anonymous_id";

declare global {
  interface Window {
    umami?: {
      track(name: string, data?: AnalyticsData): void;
    };
  }
}

let anonymousIdPromise: Promise<string> | null = null;

function createAnonymousId(): string {
  // Keep this dependency-free and compatible with Expo Go. This identifier is
  // random and cannot be used to identify a customer.
  return `native_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 12)}`;
}

async function getAnonymousId(): Promise<string> {
  if (!anonymousIdPromise) {
    anonymousIdPromise = AsyncStorage.getItem(ANONYMOUS_ID_STORAGE_KEY)
      .then(async (storedId) => {
        if (storedId) return storedId;

        const newId = createAnonymousId();
        await AsyncStorage.setItem(ANONYMOUS_ID_STORAGE_KEY, newId);
        return newId;
      })
      .catch(() => createAnonymousId());
  }

  return anonymousIdPromise;
}

async function sendNativeAnalyticsEvent(
  name: string,
  data?: AnalyticsData,
): Promise<void> {
  const apiKey = process.env.EXPO_PUBLIC_POSTHOG_PROJECT_KEY?.trim();
  if (!apiKey) return;

  const distinctId = await getAnonymousId();
  await deliverNativeAnalyticsEvent(name, data, {
    apiKey,
    distinctId,
    platform: Platform.OS,
  });
}

/**
 * Replit injects the Umami tracker into published web builds. Native builds
 * use PostHog instead, and each event is sent through exactly one provider.
 */
export function trackEvent(name: string, data?: AnalyticsData): void {
  if (Platform.OS === "web") {
    if (typeof window === "undefined") return;

    try {
      window.umami?.track(name, data);
    } catch {
      // Analytics must never affect the customer experience.
    }
    return;
  }

  // Do not await analytics from an interaction handler. A slow or unavailable
  // analytics service must never delay navigation, booking, or checkout.
  void sendNativeAnalyticsEvent(name, data).catch(() => {
    // Analytics must never affect the customer experience.
  });
}
