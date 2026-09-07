export type AnalyticsData = Record<string, string | number | boolean>;

export const POSTHOG_CAPTURE_URL = "https://eu.i.posthog.com/capture/";
export const POSTHOG_LIBRARY_VERSION = "1.0.0";

type NativeAnalyticsFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export type NativeAnalyticsDeliveryOptions = {
  apiKey: string;
  distinctId: string;
  platform: string;
  fetchImpl?: NativeAnalyticsFetch;
  captureUrl?: string;
};

export function buildNativeAnalyticsPayload(
  name: string,
  distinctId: string,
  platform: string,
  data?: AnalyticsData,
  apiKey?: string,
): Record<string, unknown> {
  return {
    api_key: apiKey,
    event: name,
    distinct_id: distinctId,
    properties: {
      ...data,
      $lib: "the-147-native",
      $lib_version: POSTHOG_LIBRARY_VERSION,
      app_surface: "native",
      platform,
    },
  };
}

/**
 * Sends one event to PostHog. Keeping this transport independent from
 * React Native makes native delivery verifiable without a device.
 */
export async function deliverNativeAnalyticsEvent(
  name: string,
  data: AnalyticsData | undefined,
  options: NativeAnalyticsDeliveryOptions,
): Promise<void> {
  const response = await (options.fetchImpl ?? fetch)(
    options.captureUrl ?? POSTHOG_CAPTURE_URL,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(
        buildNativeAnalyticsPayload(
          name,
          options.distinctId,
          options.platform,
          data,
          options.apiKey,
        ),
      ),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Native analytics request failed with status ${response.status}`,
    );
  }
}
