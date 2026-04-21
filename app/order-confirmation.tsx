import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { fetch } from "expo/fetch";
import Colors from "@/constants/colors";
import { clearPendingConfirmation } from "@/lib/pending-order";
import { getApiUrl } from "@/lib/query-client";

interface ConfirmationItem {
  name: string;
  quantity: number;
  price: number;
  modifiers?: string[];
}

interface ConfirmationStatus {
  status: string;
  statusLabel: string;
  statusDetail: string;
  isTerminal: boolean;
  totalPence?: number;
  tableNote?: string;
  items?: ConfirmationItem[];
}

// How often to ask the server for the latest status while the screen is open.
const POLL_INTERVAL_MS = 8000;
// Stop polling after this long even if the order isn't terminal — staff can
// still progress it, but we don't want a forever-open screen hammering the API.
const POLL_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

function formatPrice(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

const STATUS_TONE: Record<string, { bg: string; fg: string; icon: keyof typeof Ionicons.glyphMap }> = {
  paid:      { bg: "#DBEAFE", fg: "#1D4ED8", icon: "receipt-outline" },
  preparing: { bg: "#FEF3C7", fg: "#B45309", icon: "restaurant-outline" },
  ready:     { bg: "#DCFCE7", fg: "#15803D", icon: "checkmark-done-outline" },
  delivered: { bg: "#DCFCE7", fg: "#15803D", icon: "happy-outline" },
  collected: { bg: "#DCFCE7", fg: "#15803D", icon: "happy-outline" },
  cancelled: { bg: "#FEE2E2", fg: "#B91C1C", icon: "close-circle-outline" },
  refunded:  { bg: "#FEE2E2", fg: "#B91C1C", icon: "return-down-back-outline" },
};

export default function OrderConfirmationScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    appOrderId?: string;
    tableNote?: string;
    totalPence?: string;
    items?: string;
    token?: string;
  }>();

  const appOrderId = params.appOrderId ? parseInt(String(params.appOrderId)) : null;
  const paramTotalPence = params.totalPence ? parseInt(String(params.totalPence)) : 0;
  const paramTableNote = params.tableNote ? String(params.tableNote) : "";
  const token = params.token ? String(params.token) : "";
  let paramItems: ConfirmationItem[] = [];
  try {
    if (params.items) paramItems = JSON.parse(String(params.items));
  } catch {}

  const orderRef = appOrderId ? `#${appOrderId.toString().padStart(5, "0")}` : "—";

  // Once the user has actually seen the receipt, clear the pending marker so
  // the Order tab won't surface it again on the next launch.
  useEffect(() => {
    if (appOrderId) void clearPendingConfirmation(appOrderId);
  }, [appOrderId]);

  // Stop polling after a sensible timeout so a forgotten receipt screen
  // doesn't hammer the API forever.
  const [pollExpired, setPollExpired] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setPollExpired(true), POLL_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);

  const canPoll = !!appOrderId && !!token;

  const statusUrl = useMemo(() => {
    if (!canPoll) return "";
    const url = new URL(`/api/orders/${appOrderId}/confirmation`, getApiUrl());
    url.searchParams.set("token", token);
    return url.toString();
  }, [appOrderId, token, canPoll]);

  const { data: statusData } = useQuery<ConfirmationStatus | null>({
    queryKey: ["order-confirmation-status", appOrderId, token],
    enabled: canPoll,
    queryFn: async () => {
      const res = await fetch(statusUrl);
      if (!res.ok) return null;
      const json = (await res.json()) as Partial<ConfirmationStatus> | null;
      if (!json || typeof json.status !== "string") return null;
      return {
        status: json.status,
        statusLabel: json.statusLabel ?? "Order received",
        statusDetail: json.statusDetail ?? "",
        isTerminal: !!json.isTerminal,
        totalPence: typeof json.totalPence === "number" ? json.totalPence : undefined,
        tableNote: typeof json.tableNote === "string" ? json.tableNote : undefined,
        items: Array.isArray(json.items) ? (json.items as ConfirmationItem[]) : undefined,
      };
    },
    refetchInterval: (query) => {
      if (pollExpired) return false;
      const data = query.state.data;
      if (data?.isTerminal) return false;
      return POLL_INTERVAL_MS;
    },
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  // Prefer values from the route params (set by the checkout flow) but
  // fall back to the API response so deep links from a push notification
  // still render the receipt with full detail (items, total, table).
  const tableNote = paramTableNote || statusData?.tableNote || "";
  const totalPence = paramTotalPence || statusData?.totalPence || 0;
  const items: ConfirmationItem[] = paramItems.length > 0
    ? paramItems
    : (statusData?.items ?? []);
  const status = statusData?.status ?? "paid";
  const statusLabel = statusData?.statusLabel ?? "Order received";
  const statusDetail = statusData?.statusDetail ?? (tableNote
    ? `We've sent it to the bar and kitchen. We'll bring it to ${tableNote}.`
    : "We've sent it to the bar and kitchen — pick it up at the bar when it's ready.");
  const isTerminal = !!statusData?.isTerminal;
  const isWaiting = canPoll && !pollExpired && !isTerminal;
  const tone = STATUS_TONE[status] ?? STATUS_TONE.paid;

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.replace("/(tabs)")} hitSlop={12} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
          <Ionicons name="close" size={26} color={Colors.light.text} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.iconRing}>
          <Ionicons name="checkmark" size={42} color="#16A34A" />
        </View>
        <Text style={styles.title}>Order placed!</Text>
        <Text style={styles.subtitle}>
          {tableNote ? `We'll bring your order to ${tableNote}.` : "Pick it up at the bar when it's ready."}
        </Text>

        <View style={[styles.statusCard, { backgroundColor: tone.bg }]}>
          <View style={styles.statusRow}>
            <Ionicons name={tone.icon} size={22} color={tone.fg} />
            <Text style={[styles.statusLabel, { color: tone.fg }]}>{statusLabel}</Text>
            {isWaiting ? <ActivityIndicator size="small" color={tone.fg} style={{ marginLeft: 8 }} /> : null}
          </View>
          {statusDetail ? <Text style={[styles.statusDetail, { color: tone.fg }]}>{statusDetail}</Text> : null}
          {pollExpired && !isTerminal ? (
            <Text style={[styles.statusDetail, { color: tone.fg, marginTop: 6 }]}>
              Tap close and reopen the receipt for the latest update, or ask a team member.
            </Text>
          ) : null}
        </View>

        <View style={styles.refCard}>
          <View style={styles.refRow}>
            <Text style={styles.refLabel}>Order</Text>
            <Text style={styles.refValue}>{orderRef}</Text>
          </View>
          {tableNote ? (
            <View style={styles.refRow}>
              <Text style={styles.refLabel}>Table</Text>
              <Text style={styles.refValue}>{tableNote}</Text>
            </View>
          ) : null}
          <View style={styles.refRow}>
            <Text style={styles.refLabel}>Total paid</Text>
            <Text style={[styles.refValue, { color: Colors.brand.blue, fontWeight: "700" as const }]}>{formatPrice(totalPence)}</Text>
          </View>
        </View>

        {items.length > 0 ? (
          <View style={styles.itemsCard}>
            <Text style={styles.itemsHeader}>Your order</Text>
            {items.map((it, idx) => (
              <View key={idx} style={styles.itemRow}>
                <Text style={styles.itemQty}>{it.quantity}×</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName}>{it.name}</Text>
                  {it.modifiers && it.modifiers.length > 0 ? (
                    <Text style={styles.itemMods} numberOfLines={2}>{it.modifiers.join(", ")}</Text>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>

      <Pressable
        onPress={() => router.replace("/(tabs)")}
        style={({ pressed }) => [styles.doneBtn, { opacity: pressed ? 0.85 : 1 }]}
      >
        <Text style={styles.doneText}>Done</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F2F5FA", paddingHorizontal: 16 },
  header: { flexDirection: "row" as const, justifyContent: "flex-end" as const },
  scroll: { paddingTop: 12, paddingBottom: 24, alignItems: "center" as const },
  iconRing: { width: 88, height: 88, borderRadius: 44, backgroundColor: "#DCFCE7", alignItems: "center" as const, justifyContent: "center" as const, marginBottom: 16 },
  title: { fontSize: 26, fontWeight: "800" as const, color: "#0A1628", marginBottom: 8 },
  subtitle: { fontSize: 15, color: "#6B7280", textAlign: "center" as const, lineHeight: 22, marginBottom: 18, paddingHorizontal: 8 },
  statusCard: { width: "100%", borderRadius: 16, padding: 14, marginBottom: 14 },
  statusRow: { flexDirection: "row" as const, alignItems: "center" as const, gap: 8 },
  statusLabel: { fontSize: 15, fontWeight: "700" as const, flexShrink: 1 },
  statusDetail: { fontSize: 13, marginTop: 6, lineHeight: 18 },
  refCard: { width: "100%", backgroundColor: "#fff", borderRadius: 16, padding: 16, marginBottom: 14, gap: 10 },
  refRow: { flexDirection: "row" as const, justifyContent: "space-between" as const, alignItems: "center" as const },
  refLabel: { color: "#6B7280", fontSize: 13, fontWeight: "600" as const },
  refValue: { color: "#0A1628", fontSize: 15, fontWeight: "600" as const },
  itemsCard: { width: "100%", backgroundColor: "#fff", borderRadius: 16, padding: 16, gap: 12 },
  itemsHeader: { fontSize: 14, fontWeight: "700" as const, color: "#0A1628", marginBottom: 4 },
  itemRow: { flexDirection: "row" as const, gap: 10 },
  itemQty: { fontSize: 14, fontWeight: "700" as const, color: Colors.brand.blue, minWidth: 28 },
  itemName: { fontSize: 14, color: "#0A1628", fontWeight: "500" as const },
  itemMods: { fontSize: 12, color: "#6B7280", marginTop: 2 },
  doneBtn: { backgroundColor: Colors.brand.blue, paddingVertical: 16, borderRadius: 14, alignItems: "center" as const, marginTop: 8 },
  doneText: { color: "#fff", fontWeight: "700" as const, fontSize: 16 },
});
