import React, { createContext, useContext, useEffect, useRef, useState, useMemo, useCallback, ReactNode } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { EventSubscription } from "expo-modules-core";
import { router } from "expo-router";
import { apiRequest, queryClient } from "@/lib/query-client";

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
const NOTIFICATION_PROMPT_DELAY = 3000;

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
  permissionStatus: string | null;
  registerForPushNotifications: () => Promise<string | null>;
  notification: Notifications.Notification | null;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<string | null>(null);
  const [notification, setNotification] = useState<Notifications.Notification | null>(null);
  const notificationListener = useRef<EventSubscription | null>(null);
  const responseListener = useRef<EventSubscription | null>(null);
  const hasAttempted = useRef(false);

  const registerForPushNotifications = useCallback(async (): Promise<string | null> => {
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

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Default",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
      });
    }

    let token: string | null = null;
    try {
      // Hardcode the EAS project ID so the token is always scoped to the
      // production EAS project (@the-147/the-147), regardless of build type.
      // Reading from Constants.expoConfig?.extra?.eas?.projectId is unreliable
      // in TestFlight / Expo Launch builds and causes tokens to fall back to
      // the Replit-private experience, which has no APNs credentials and
      // results in 100% delivery failure with InvalidCredentials.
      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId: "3f31dfb1-b149-43ca-ab9a-91b6d7cb230a",
      });
      token = tokenData.data;
      setExpoPushToken(token);
      console.log("[Push] Got token:", token?.slice(0, 30) + "...");
    } catch (err) {
      console.error("[Push] getExpoPushTokenAsync failed:", err);
      return null;
    }

    try {
      await apiRequest("POST", "/api/push-tokens", {
        token,
        deviceName: Device.deviceName ?? "Unknown Device",
        platform: Platform.OS,
      });
      console.log("[Push] Token registered with server");
    } catch (err) {
      console.error("[Push] Token registration error:", err);
    }

    // Persist token so the auth context can bind it to a customer after login.
    try { await AsyncStorage.setItem("expo_push_token", token); } catch {}

    return token;
  }, []);

  useEffect(() => {
    if (Platform.OS === "web" || hasAttempted.current) return;
    hasAttempted.current = true;

    const initNotifications = async () => {
      if (!Device.isDevice) return;

      const { status } = await Notifications.getPermissionsAsync();

      if (status === "granted") {
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
      handleNotificationResponse(response);
    });

    // Cold-start: if the app was launched by tapping a notification,
    // addNotificationResponseReceivedListener may miss it. Replay the last
    // response on mount so deep links survive a full app restart, then
    // clear it so subsequent cold starts (e.g. user reopens the app a day
    // later) don't re-trigger the same deep link.
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      handleNotificationResponse(response);
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
  }, []);

  const value = useMemo(
    () => ({
      expoPushToken,
      permissionStatus,
      registerForPushNotifications,
      notification,
    }),
    [expoPushToken, permissionStatus, registerForPushNotifications, notification]
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
