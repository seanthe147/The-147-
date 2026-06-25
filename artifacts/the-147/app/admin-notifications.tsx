import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  TextInput,
  Platform,
  Alert,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useResponsive } from "@/hooks/useResponsive";
import { router } from "expo-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/query-client";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import Colors from "@/constants/colors";
import type { PushToken, Notification } from "@workspace/db/schema";

export default function AdminNotificationsScreen() {
  const insets = useSafeAreaInsets();
  const { tabletPad } = useResponsive();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const { isAuthenticated, isManager, isLoading: authLoading } = useStaffAuth();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || !isManager)) {
      router.replace("/staff-portal");
    }
  }, [authLoading, isAuthenticated, isManager]);
  const [activeTab, setActiveTab] = useState<"compose" | "history" | "devices">("compose");

  const tokensQuery = useQuery<PushToken[]>({
    queryKey: ["/api/push-tokens"],
    refetchOnMount: "always",
  });

  const historyQuery = useQuery<Notification[]>({
    queryKey: ["/api/notifications/history"],
    refetchOnMount: "always",
  });

  const sendMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/notifications/send", { title, body });
      return res.json();
    },
    onSuccess: (data) => {
      setTitle("");
      setBody("");
      queryClient.refetchQueries({ queryKey: ["/api/notifications/history"] });
      const message = `Notification sent to ${data.sent} of ${data.total} devices`;
      if (Platform.OS === "web") {
        window.alert(message);
      } else {
        Alert.alert("Sent", message);
      }
    },
    onError: (err: Error) => {
      const message = err.message || "Failed to send notification";
      if (Platform.OS === "web") {
        window.alert(message);
      } else {
        Alert.alert("Error", message);
      }
    },
  });

  const removeTokenMutation = useMutation({
    mutationFn: async (token: string) => {
      await apiRequest("DELETE", `/api/push-tokens/${encodeURIComponent(token)}`);
    },
    onSuccess: () => {
      queryClient.refetchQueries({ queryKey: ["/api/push-tokens"] });
    },
    onError: (err: Error) => Alert.alert("Error", err.message || "Failed to remove device token"),
  });

  const handleSend = () => {
    if (!title.trim() || !body.trim()) {
      const msg = "Please enter both a title and message";
      if (Platform.OS === "web") {
        window.alert(msg);
      } else {
        Alert.alert("Missing Info", msg);
      }
      return;
    }

    const confirmMsg = `Send notification to ${tokensQuery.data?.length || 0} device(s)?`;
    if (Platform.OS === "web") {
      if (window.confirm(confirmMsg)) {
        sendMutation.mutate();
      }
    } else {
      Alert.alert("Confirm", confirmMsg, [
        { text: "Cancel", style: "cancel" },
        { text: "Send", onPress: () => sendMutation.mutate() },
      ]);
    }
  };

  const handleRemoveToken = (token: string) => {
    const msg = "Remove this device?";
    if (Platform.OS === "web") {
      if (window.confirm(msg)) {
        removeTokenMutation.mutate(token);
      }
    } else {
      Alert.alert("Remove Device", msg, [
        { text: "Cancel", style: "cancel" },
        { text: "Remove", style: "destructive", onPress: () => removeTokenMutation.mutate(token) },
      ]);
    }
  };

  const deviceCount = tokensQuery.data?.length || 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={28} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Push Notifications</Text>
        <View style={{ width: 28 }} />
      </View>

      <View style={styles.tabRow}>
        {(["compose", "history", "devices"] as const).map((tab) => (
          <Pressable
            key={tab}
            onPress={() => setActiveTab(tab)}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab === "compose" ? "Compose" : tab === "history" ? "History" : `Devices (${deviceCount})`}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={[styles.scrollContent, { marginHorizontal: tabletPad }]}>
        {activeTab === "compose" && (
          <View style={styles.composeSection}>
            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Ionicons name="phone-portrait-outline" size={24} color={Colors.brand.blue} />
                <Text style={styles.statNumber}>{deviceCount}</Text>
                <Text style={styles.statLabel}>Registered Devices</Text>
              </View>
              <View style={styles.statBox}>
                <Ionicons name="notifications-outline" size={24} color={Colors.brand.gold} />
                <Text style={styles.statNumber}>{historyQuery.data?.length || 0}</Text>
                <Text style={styles.statLabel}>Sent Total</Text>
              </View>
            </View>

            <Text style={styles.fieldLabel}>Title</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. Happy Hour Tonight!"
              placeholderTextColor={Colors.light.textSecondary}
              maxLength={100}
            />

            <Text style={styles.fieldLabel}>Message</Text>
            <TextInput
              style={[styles.input, styles.messageInput]}
              value={body}
              onChangeText={setBody}
              placeholder="e.g. 2-for-1 drinks from 5pm-7pm. Don't miss out!"
              placeholderTextColor={Colors.light.textSecondary}
              multiline
              numberOfLines={4}
              maxLength={500}
              textAlignVertical="top"
            />
            <Text style={styles.charCount}>{body.length}/500</Text>

            <Pressable
              onPress={handleSend}
              disabled={sendMutation.isPending || deviceCount === 0}
              style={({ pressed }) => [
                styles.sendButton,
                (sendMutation.isPending || deviceCount === 0) && styles.sendButtonDisabled,
                { opacity: pressed ? 0.8 : 1 },
              ]}
            >
              {sendMutation.isPending ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="send" size={18} color="#FFFFFF" />
                  <Text style={styles.sendButtonText}>
                    {deviceCount === 0 ? "No Devices Registered" : `Send to ${deviceCount} Device${deviceCount !== 1 ? "s" : ""}`}
                  </Text>
                </>
              )}
            </Pressable>
          </View>
        )}

        {activeTab === "history" && (
          <View style={styles.historySection}>
            {historyQuery.isLoading ? (
              <ActivityIndicator size="large" color={Colors.brand.blue} style={{ marginTop: 40 }} />
            ) : !historyQuery.data?.length ? (
              <View style={styles.emptyState}>
                <Ionicons name="notifications-off-outline" size={48} color={Colors.light.textSecondary} />
                <Text style={styles.emptyText}>No notifications sent yet</Text>
                <Text style={styles.emptySubtext}>Compose your first notification above</Text>
              </View>
            ) : (
              [...(historyQuery.data ?? [])].reverse().map((n) => (
                <View key={n.id} style={styles.historyCard}>
                  <View style={styles.historyHeader}>
                    <Ionicons name="notifications" size={16} color={Colors.brand.blue} />
                    <Text style={styles.historyTitle}>{n.title}</Text>
                  </View>
                  <Text style={styles.historyBody}>{n.body}</Text>
                  <View style={styles.historyFooter}>
                    <Text style={styles.historyMeta}>
                      {new Date(n.sentAt).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </Text>
                    <Text style={styles.historyRecipients}>
                      {n.recipientCount} recipient{n.recipientCount !== 1 ? "s" : ""}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {activeTab === "devices" && (
          <View style={styles.devicesSection}>
            {tokensQuery.isLoading ? (
              <ActivityIndicator size="large" color={Colors.brand.blue} style={{ marginTop: 40 }} />
            ) : !tokensQuery.data?.length ? (
              <View style={styles.emptyState}>
                <Ionicons name="phone-portrait-outline" size={48} color={Colors.light.textSecondary} />
                <Text style={styles.emptyText}>No devices registered</Text>
                <Text style={styles.emptySubtext}>Devices register when users open the app and accept notifications</Text>
              </View>
            ) : (
              tokensQuery.data.map((t) => {
                const isAndroid = t.platform === "android";
                const isIOS = t.platform === "ios";
                const platformIcon = isAndroid ? "logo-android" : isIOS ? "logo-apple" : "phone-portrait";
                const platformColor = isAndroid ? "#3DDC84" : isIOS ? "#555" : Colors.brand.blue;
                const platformLabel = isAndroid ? "Android" : isIOS ? "iOS" : (t.platform ?? "Unknown");
                return (
                  <View key={t.id} style={styles.deviceCard}>
                    <View style={styles.deviceInfo}>
                      <Ionicons name={platformIcon as any} size={20} color={platformColor} />
                      <View style={styles.deviceDetails}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <Text style={styles.deviceName}>{t.deviceName || "Unknown Device"}</Text>
                          <View style={[styles.platformBadge, { backgroundColor: isAndroid ? "#DCFCE7" : isIOS ? "#F3F4F6" : "#EFF6FF" }]}>
                            <Text style={[styles.platformBadgeText, { color: platformColor }]}>{platformLabel}</Text>
                          </View>
                        </View>
                        <Text style={styles.deviceToken} numberOfLines={1}>
                          {t.token.substring(0, 30)}...
                        </Text>
                        <Text style={styles.deviceDate}>
                          Registered {new Date(t.createdAt).toLocaleDateString("en-GB")}
                        </Text>
                      </View>
                    </View>
                    <Pressable
                      onPress={() => handleRemoveToken(t.token)}
                      hitSlop={8}
                    >
                      <Ionicons name="trash-outline" size={18} color={Colors.brand.red} />
                    </Pressable>
                  </View>
                );
              })
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  headerTitle: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 18,
    color: Colors.light.text,
  },
  tabRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: Colors.brand.blue,
  },
  tabText: {
    fontFamily: "Montserrat_500Medium",
    fontSize: 13,
    color: Colors.light.textSecondary,
  },
  tabTextActive: {
    fontFamily: "Montserrat_600SemiBold",
    color: Colors.brand.blue,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: Platform.OS === "web" ? 50 : 40,
  },
  composeSection: {
    gap: 12,
  },
  statsRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 8,
  },
  statBox: {
    flex: 1,
    backgroundColor: Colors.light.surface,
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  statNumber: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 28,
    color: Colors.light.text,
  },
  statLabel: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 11,
    color: Colors.light.textSecondary,
    textAlign: "center",
  },
  fieldLabel: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 13,
    color: Colors.light.text,
    marginTop: 4,
  },
  input: {
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.light.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: "Montserrat_400Regular",
    fontSize: 15,
    color: Colors.light.text,
  },
  messageInput: {
    minHeight: 100,
    paddingTop: 12,
  },
  charCount: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 11,
    color: Colors.light.textSecondary,
    textAlign: "right",
    marginTop: -8,
  },
  sendButton: {
    backgroundColor: Colors.brand.blue,
    borderRadius: 14,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 8,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonText: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 16,
    color: "#FFFFFF",
  },
  historySection: {
    gap: 12,
  },
  historyCard: {
    backgroundColor: Colors.light.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.light.border,
    gap: 8,
  },
  historyHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  historyTitle: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 15,
    color: Colors.light.text,
    flex: 1,
  },
  historyBody: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 14,
    color: Colors.light.textSecondary,
    lineHeight: 20,
  },
  historyFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
  },
  historyMeta: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 11,
    color: Colors.light.textSecondary,
  },
  historyRecipients: {
    fontFamily: "Montserrat_500Medium",
    fontSize: 11,
    color: Colors.brand.blue,
  },
  devicesSection: {
    gap: 12,
  },
  deviceCard: {
    backgroundColor: Colors.light.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.light.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  deviceInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  deviceDetails: {
    flex: 1,
    gap: 2,
  },
  deviceName: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 14,
    color: Colors.light.text,
  },
  deviceToken: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 11,
    color: Colors.light.textSecondary,
  },
  deviceDate: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 11,
    color: Colors.light.textSecondary,
  },
  platformBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  platformBadgeText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 10,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 60,
    gap: 12,
  },
  emptyText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 16,
    color: Colors.light.text,
  },
  emptySubtext: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 13,
    color: Colors.light.textSecondary,
    textAlign: "center",
    maxWidth: 260,
  },
});
