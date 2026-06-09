import React, { useEffect, useState, useCallback, memo } from "react";
import { StyleSheet, Text, View, Pressable, Platform, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Device from "expo-device";
import { useNotifications } from "@/contexts/NotificationContext";
import Colors from "@/constants/colors";

const SNOOZE_KEY = "notif_banner_snoozed_until";
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

function EnableNotificationsBannerInner() {
  const { permissionStatus, expoPushToken, registerForPushNotifications } = useNotifications();
  const [snoozed, setSnoozed] = useState<boolean | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(SNOOZE_KEY).then((raw) => {
      const until = raw ? parseInt(raw, 10) : 0;
      setSnoozed(Date.now() < until);
    }).catch(() => setSnoozed(false));
  }, []);

  const snooze = useCallback(async () => {
    const until = Date.now() + SNOOZE_MS;
    await AsyncStorage.setItem(SNOOZE_KEY, String(until));
    setSnoozed(true);
  }, []);

  const handleEnable = useCallback(async () => {
    if (permissionStatus === "denied") {
      try { await Linking.openSettings(); } catch {}
      return;
    }
    await registerForPushNotifications();
  }, [permissionStatus, registerForPushNotifications]);

  if (Platform.OS === "web") return null;
  if (!Device.isDevice) return null;
  // Wait until BOTH the snooze flag and the OS permission status have resolved
  // before deciding what to show. Rendering before either is known causes a
  // visible flash on cold start: a "granted" user would briefly see the banner
  // while permissionStatus is still null, and the rest of the home screen
  // would jump down once the AsyncStorage hydration completes.
  if (snoozed === null) return null;
  if (snoozed) return null;
  if (permissionStatus === null) return null;
  // Once permission is granted we hide immediately — no need to wait on the
  // token fetch (~500ms on cold start), which would otherwise flash the
  // banner for granted users.
  if (permissionStatus === "granted") return null;

  const isDenied = permissionStatus === "denied";

  return (
    <View style={styles.card}>
      <View style={styles.iconWrap}>
        <Ionicons name="notifications" size={22} color={Colors.brand.blue} />
      </View>
      <View style={styles.body}>
        <Text style={styles.title}>Stay in the loop</Text>
        <Text style={styles.subtitle}>
          {isDenied
            ? "Notifications are off. Turn them on in Settings to get table-ready alerts, booking confirmations and members-only offers."
            : "Get table-ready alerts, booking confirmations and members-only offers — straight to your phone."}
        </Text>
        <View style={styles.actions}>
          <Pressable
            onPress={handleEnable}
            style={({ pressed }) => [styles.primaryBtn, { opacity: pressed ? 0.85 : 1 }]}
            testID="enable-notifications-btn"
          >
            <Text style={styles.primaryBtnText}>
              {isDenied ? "Open Settings" : "Turn on notifications"}
            </Text>
          </Pressable>
          <Pressable onPress={snooze} hitSlop={10} testID="enable-notifications-snooze">
            <Text style={styles.snoozeText}>Not now</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export const EnableNotificationsBanner = memo(EnableNotificationsBannerInner);

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    backgroundColor: "rgba(19,39,66,0.75)",
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    gap: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    boxShadow: "0px 8px 24px rgba(0,0,0,0.35)",
    elevation: 4,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(0,71,171,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  body: { flex: 1 },
  title: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 15,
    color: "#FFFFFF",
    marginBottom: 4,
  },
  subtitle: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 12,
    color: "rgba(255,255,255,0.55)",
    lineHeight: 17,
    marginBottom: 12,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  primaryBtn: {
    backgroundColor: Colors.brand.blue,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  primaryBtnText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 13,
    color: "#FFFFFF",
  },
  snoozeText: {
    fontFamily: "Montserrat_500Medium",
    fontSize: 13,
    color: "rgba(255,255,255,0.4)",
  },
});
