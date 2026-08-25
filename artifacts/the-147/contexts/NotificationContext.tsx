import React, { createContext, useContext, useEffect, useRef, useState, useMemo, useCallback, ReactNode } from "react";
import { AppState, Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { fetch } from "expo/fetch";
type EventSubscription = { remove: () => void };
import { router, useRootNavigationState } from "expo-router";
import { apiRequest, getApiUrl, queryClient } from "@/lib/query-client";

// Routes a notification tap to the appropriate in-app screen. Today the
// only typed payload is `order-status`, sent when staff advance an order to
// ready / delivered / collected — we deep-link straight back into the
// receipt for that specific order so the customer sees the full status,
// items, and total without re-navigating.
function handleNotificationResponse(response: Notifications.NotificationResponse) {
  const data = response?.notification?.request?.content?.data as
    | { type?: string; appOrderId?: number | string; token?: string }
    | undefined;
  if (!data || data.type !== "order-status") return;
  const appOrderId = data.appOrderId != null ? String(data.appOrderId) : "";
  if (!appOrderId) return;
  const params: Record<string, string> = { appOrderId };
  if (typeof data.token === "string" && data.token.length > 0) {
    params.token = data.token;
  }
  // Use push so the user can back out to where they were if they had the
  // app open. The receipt screen is presented as a modal in _layout.tsx.
  router.push({ pathname: "/order-confirmation", params });
}

const NOTIFICATION_ASKED_KEY = "notifications_asked";
const PUSH_TOKEN_KEY = "expo_push_token";
const PUSH_REGISTRATION_SECRET_KEY = "expo_push_registration_secret";
const PUSH_ENABLED_KEY = "push_notifications_enabled";
const NOTIFICATION_PROMPT_DELAY = 3000;

function getExpoProjectId(): string {
  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (typeof projectId !== "string" || projectId.trim().length === 0) {
    throw new Error(
      "[Push] Missing expo.extra.eas.projectId in app.json; push registration cannot continue.",
    );
  }
  return projectId;
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

interface NotificationContextValue {
  expoPushToken: string | null;
  pushRegistrationSecret: string | null;
  permissionStatus: string | null;
  registrationError: string | null;
  registerForPushNotifications: () => Promise<string | null>;
  unregisterForPushNotifications: () => Promise<boolean>;
  notification: Notifications.Notification | null;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [pushRegistrationSecret, setPushRegistrationSecret] = useState<string | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<string | null>(null);
  const [registrationError, setRegistrationError] = useState<string | null>(null);
  const [notification, setNotification] = useState<Notifications.Notification | null>(null);
  const notificationListener = useRef<EventSubscription | null>(null);
  const responseListener = useRef<EventSubscription | null>(null);
  const hasAttempted = useRef(false);
  const pendingResponse = useRef<Notifications.NotificationResponse | null>(null);
  const rootNavigationState = useRootNavigationState() as
    | ReturnType<typeof useRootNavigationState>
    | undefined;
  const rootReady = useRef(false);
  rootReady.current = !!rootNavigationState?.key;

  const registerTokenWithServer = useCallback(async (token: string): Promise<boolean> => {
    try {
      const storedSecret = await AsyncStorage.getItem(PUSH_REGISTRATION_SECRET_KEY);
      const response = await apiRequest("POST", "/api/push-tokens", {
        token,
        deviceName: Device.deviceName ?? "Unknown Device",
        platform: Platform.OS,
        ...(storedSecret ? { pushRegistrationSecret: storedSecret } : {}),
      });
      const result = await response.json() as { pushRegistrationSecret?: unknown };
      if (
        typeof result.pushRegistrationSecret !== "string"
        || result.pushRegistrationSecret.length === 0
      ) {
        throw new Error("Server did not return a device registration proof");
      }
      await AsyncStorage.setItem(
        PUSH_REGISTRATION_SECRET_KEY,
        result.pushRegistrationSecret,
      );
      setPushRegistrationSecret(result.pushRegistrationSecret);
      const customerSessionToken = await AsyncStorage.getItem("customer_session_token");
      if (customerSessionToken) {
        const bindUrl = new URL("/api/customers/me/push-token", getApiUrl());
        const bindResponse = await fetch(bindUrl.toString(), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${customerSessionToken}`,
          },
          body: JSON.stringify({
            token,
            pushRegistrationSecret: result.pushRegistrationSecret,
          }),
        });
        if (!bindResponse.ok && bindResponse.status !== 401) {
          console.warn("[Push] Customer token binding failed:", bindResponse.status);
        }
      }
      setRegistrationError(null);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Token registration failed";
      setRegistrationError(message);
      console.error("[Push] Token registration error:", err);
      return false;
    }
  }, []);

  const registerForPushNotifications = useCallback(async (): Promise<string | null> => {
    setRegistrationError(null);
    if (Platform.OS === "web") {
      setPermissionStatus("web_unsupported");
      return null;
    }

    if (!Device.isDevice) {
      setPermissionStatus("simulator");
      return null;
    }

    // Expo Go registers tokens under a Replit-private experience ID that has
    // no APNs credentials — they can never be delivered from the production
    // server and will cause 100% of those notifications to fail with
    // InvalidCredentials. Skip registration entirely in Expo Go.
    if (Constants.appOwnership === "expo") {
      setPermissionStatus("expo_go_unsupported");
      return null;
    }

    // Android 13+ permission behavior depends on a channel existing, so create
    // it before checking or requesting notification permission.
    if (Platform.OS === "android") {
      try {
        await Notifications.setNotificationChannelAsync("default", {
          name: "Default",
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Could not create notification channel";
        setRegistrationError(message);
        console.error("[Push] Android notification channel setup failed:", err);
        return null;
      }
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    setPermissionStatus(finalStatus);
    await AsyncStorage.setItem(NOTIFICATION_ASKED_KEY, "true");

    if (finalStatus !== "granted") {
      return null;
    }

    let token: string | null = null;
    try {
      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId: getExpoProjectId(),
      });
      token = tokenData.data;
      // Persist first. If the server is temporarily unavailable, foreground
      // retry can finish registration without asking permission or minting a
      // replacement token.
      await AsyncStorage.multiSet([
        [PUSH_TOKEN_KEY, token],
        [PUSH_ENABLED_KEY, "true"],
      ]);
      setExpoPushToken(token);
      console.log("[Push] Got token:", token?.slice(0, 30) + "...");
    } catch (err) {
      console.error("[Push] getExpoPushTokenAsync failed:", err);
      setRegistrationError(err instanceof Error ? err.message : "Could not get a push token");
      return null;
    }

    await registerTokenWithServer(token);

    return token;
  }, [registerTokenWithServer]);

  const unregisterForPushNotifications = useCallback(async (): Promise<boolean> => {
    const token = expoPushToken ?? await AsyncStorage.getItem(PUSH_TOKEN_KEY);
    if (!token) {
      await AsyncStorage.multiRemove([PUSH_TOKEN_KEY, PUSH_REGISTRATION_SECRET_KEY]);
      await AsyncStorage.setItem(PUSH_ENABLED_KEY, "false");
      setExpoPushToken(null);
      setPushRegistrationSecret(null);
      setRegistrationError(null);
      return true;
    }

    try {
      const storedSecret = await AsyncStorage.getItem(PUSH_REGISTRATION_SECRET_KEY);
      if (!storedSecret) {
        throw new Error("Device registration proof is unavailable");
      }
      await apiRequest("DELETE", "/api/push-tokens", {
        token,
        pushRegistrationSecret: storedSecret,
      });
      await AsyncStorage.multiRemove([PUSH_TOKEN_KEY, PUSH_REGISTRATION_SECRET_KEY]);
      await AsyncStorage.setItem(PUSH_ENABLED_KEY, "false");
      setExpoPushToken(null);
      setPushRegistrationSecret(null);
      setRegistrationError(null);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not disable notifications";
      setRegistrationError(message);
      console.error("[Push] Token unregister error:", err);
      return false;
    }
  }, [expoPushToken]);

  useEffect(() => {
    if (Platform.OS === "web" || hasAttempted.current) return;
    hasAttempted.current = true;

    const initNotifications = async () => {
      if (!Device.isDevice) return;

      const [{ status }, storedToken, storedProof, enabledPreference] = await Promise.all([
        Notifications.getPermissionsAsync(),
        AsyncStorage.getItem(PUSH_TOKEN_KEY),
        AsyncStorage.getItem(PUSH_REGISTRATION_SECRET_KEY),
        AsyncStorage.getItem(PUSH_ENABLED_KEY),
      ]);
      setPermissionStatus(status);
      if (status === "granted" && storedToken && enabledPreference !== "false") {
        setExpoPushToken(storedToken);
        setPushRegistrationSecret(storedProof);
      }

      if (status === "granted" && enabledPreference !== "false") {
        await registerForPushNotifications();
        return;
      }

      const asked = await AsyncStorage.getItem(NOTIFICATION_ASKED_KEY);
      if (asked) return;

      const timer = setTimeout(() => {
        registerForPushNotifications();
      }, NOTIFICATION_PROMPT_DELAY);

      return () => clearTimeout(timer);
    };

    initNotifications();
  }, [registerForPushNotifications]);

  useEffect(() => {
    if (Platform.OS === "web") return;
    const retryStoredRegistration = async () => {
      const [token, enabledPreference] = await Promise.all([
        AsyncStorage.getItem(PUSH_TOKEN_KEY),
        AsyncStorage.getItem(PUSH_ENABLED_KEY),
      ]);
      const { status } = await Notifications.getPermissionsAsync();
      setPermissionStatus(status);
      if (status !== "granted" || enabledPreference === "false") return;
      if (token) {
        setExpoPushToken(token);
        await registerTokenWithServer(token);
      } else {
        await registerForPushNotifications();
      }
    };
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") retryStoredRegistration().catch(() => {});
    });
    return () => subscription.remove();
  }, [registerForPushNotifications, registerTokenWithServer]);

  const routeNotificationResponse = useCallback((response: Notifications.NotificationResponse) => {
    if (!rootReady.current) {
      pendingResponse.current = response;
      return;
    }
    handleNotificationResponse(response);
  }, []);

  useEffect(() => {
    if (!rootNavigationState?.key || !pendingResponse.current) return;
    const response = pendingResponse.current;
    pendingResponse.current = null;
    handleNotificationResponse(response);
  }, [rootNavigationState?.key]);

  useEffect(() => {
    notificationListener.current = Notifications.addNotificationReceivedListener((n) => {
      setNotification(n);

      // When a loyalty-related push arrives in the foreground, refresh the
      // loyalty cache so the balance/banner updates without the customer
      // having to pull-to-refresh. We invalidate by the root /api/loyalty/me
      // key — RQ will refetch any active subscriber regardless of customer id.
      const data = n?.request?.content?.data as { type?: string } | undefined;
      if (data?.type === "loyalty_balance_changed" || data?.type === "double_points_day" || data?.type === "birthday_week") {
        queryClient.invalidateQueries({ queryKey: ["/api/loyalty/me"] });
      }
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      routeNotificationResponse(response);
    });

    // Cold-start: if the app was launched by tapping a notification,
    // addNotificationResponseReceivedListener may miss it. Replay the last
    // response on mount so deep links survive a full app restart, then
    // clear it so subsequent cold starts (e.g. user reopens the app a day
    // later) don't re-trigger the same deep link.
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      routeNotificationResponse(response);
      Notifications.clearLastNotificationResponseAsync?.().catch(() => {});
    }).catch(() => {});

    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, [routeNotificationResponse]);

  const value = useMemo(
    () => ({
      expoPushToken,
      pushRegistrationSecret,
      permissionStatus,
      registrationError,
      registerForPushNotifications,
      unregisterForPushNotifications,
      notification,
    }),
    [expoPushToken, pushRegistrationSecret, permissionStatus, registrationError, registerForPushNotifications, unregisterForPushNotifications, notification]
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotifications must be used within a NotificationProvider");
  }
  return context;
}
