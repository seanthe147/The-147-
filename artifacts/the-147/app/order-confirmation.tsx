import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Alert } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { fetch } from "expo/fetch";
import Colors from "@/constants/colors";
import { clearPendingConfirmation } from "@/lib/pending-order";
import { getApiUrl } from "@/lib/query-client";
import { useCart } from "@/contexts/CartContext";
import { useCustomerGreeting } from "@/hooks/useCustomerGreeting";
import { useResponsive } from "@/hooks/useResponsive";
import type { SelectedModifier } from "@/types/menu";

interface ReorderResponse {
  items: Array<{
    variationId: string;
    itemId: string;
    name: string;
    price: number;
    quantity: number;
    modifiers?: SelectedModifier[];
  }>;
  skipped: string[];
}

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
  paid:      { bg: "rgba(29,78,216,0.2)",  fg: "#60A5FA", icon: "receipt-outline" },
  preparing: { bg: "rgba(180,83,9,0.2)",   fg: "#FCD34D", icon: "restaurant-outline" },
  ready:     { bg: "rgba(21,128,61,0.2)",  fg: "#4ADE80", icon: "checkmark-done-outline" },
  delivered: { bg: "rgba(21,128,61,0.2)",  fg: "#4ADE80", icon: "happy-outline" },
  collected: { bg: "rgba(21,128,61,0.2)",  fg: "#4ADE80", icon: "happy-outline" },
  completed: { bg: "rgba(21,128,61,0.2)",  fg: "#4ADE80", icon: "happy-outline" },
  cancelled: { bg: "rgba(185,28,28,0.2)",  fg: "#F87171", icon: "close-circle-outline" },
  refunded:  { bg: "rgba(185,28,28,0.2)",  fg: "#F87171", icon: "return-down-back-outline" },
};

export default function OrderConfirmationScreen() {
  const insets = useSafeAreaInsets();
  const { tabletPad } = useResponsive();
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

  // Reorder: rebuild the cart from this past receipt and bounce the
  // customer back to the order tab so they can pick a table and pay.
  const { addItems } = useCart();
  const { firstName } = useCustomerGreeting();
  const [reordering, setReordering] = useState(false);
  const canReorder = !!appOrderId && !!token && status !== "cancelled" && status !== "refunded";

  const handleReorder = async () => {
    if (!canReorder || reordering) return;
    setReordering(true);
    try {
      const url = new URL(`/api/orders/${appOrderId}/reorder`, getApiUrl());
      url.searchParams.set("token", token);
      const res = await fetch(url.toString());
      if (res.status === 409) {
        Alert.alert(
          "Can't reorder this order",
          "This order has been cancelled or refunded, so we can't rebuild it.",
        );
        return;
      }
      if (!res.ok) throw new Error("Reorder unavailable");
      const data = (await res.json()) as ReorderResponse;
      if (!data.items || data.items.length === 0) {
        Alert.alert(
          "Nothing to reorder",
          "None of the items from this order are available on the menu right now.",
        );
        return;
      }
      addItems(data.items);
      const skipped = data.skipped ?? [];
      const goToOrder = () => router.replace("/(tabs)/order");
      if (skipped.length > 0) {
        const list = skipped.slice(0, 5).join(", ") + (skipped.length > 5 ? "…" : "");
        Alert.alert(
          "Some items were skipped",
          `These aren't available on the menu right now: ${list}`,
          [{ text: "Continue", onPress: goToOrder }],
        );
      } else {
        goToOrder();
      }
    } catch {
      Alert.alert(
        "Couldn't reorder",
        "We couldn't rebuild your cart from this order. Please try again in a moment.",
      );
    } finally {
      setReordering(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.replace("/(tabs)")} hitSlop={12} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
          <Ionicons name="close" size={26} color={Colors.light.text} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={[styles.scroll, { marginHorizontal: tabletPad }]}>
        <View style={styles.iconRing}>
          <Ionicons name="checkmark" size={42} color="#16A34A" />
        </View>
        <Text style={styles.title}>
          {firstName ? `Thanks, ${firstName}!` : "Order placed!"}
        </Text>
        <Text style={styles.subtitle}>
          {tableNote
            ? `We'll bring your order to ${tableNote}.`
            : appOrderId
            ? `Collect from the bar when it's ready — quote collection number ${orderRef}.`
            : "Pick it up at the bar when it's ready."}
        </Text>
        {!tableNote && appOrderId ? (
          <View style={styles.collectionBadge}>
            <Ionicons name="bag-handle-outline" size={16} color={Colors.brand.blue} />
            <Text style={styles.collectionBadgeLabel}>Collection</Text>
            <Text style={styles.collectionBadgeNumber}>{orderRef}</Text>
          </View>
        ) : null}

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
            <Text style={styles.refLabel}>{tableNote ? "Order" : "Collection number"}</Text>
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

      {canReorder ? (
        <Pressable
          onPress={handleReorder}
          disabled={reordering}
          style={({ pressed }) => [
            styles.reorderBtn,
            { opacity: pressed || reordering ? 0.85 : 1 },
          ]}
          testID="reorder-btn"
        >
          {reordering ? (
            <ActivityIndicator color={Colors.brand.blue} size="small" />
          ) : (
            <>
              <Ionicons name="repeat-outline" size={18} color={Colors.brand.blue} />
              <Text style={styles.reorderText}>Reorder these items</Text>
            </>
          )}
        </Pressable>
      ) : null}

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
  container: { flex: 1, backgroundColor: "#0A1628", paddingHorizontal: 16 },
  header: { flexDirection: "row" as const, justifyContent: "flex-end" as const },
  scroll: { paddingTop: 12, paddingBottom: 24, alignItems: "center" as const },
  iconRing: { width: 88, height: 88, borderRadius: 44, backgroundColor: "rgba(21,128,61,0.2)", borderWidth: 1, borderColor: "rgba(74,222,128,0.3)", alignItems: "center" as const, justifyContent: "center" as const, marginBottom: 16 },
  title: { fontSize: 26, fontWeight: "800" as const, color: "#FFFFFF", marginBottom: 8 },
  subtitle: { fontSize: 15, color: "rgba(255,255,255,0.55)", textAlign: "center" as const, lineHeight: 22, marginBottom: 18, paddingHorizontal: 8 },
  collectionBadge: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    backgroundColor: "rgba(0,71,171,0.2)",
    borderWidth: 1,
    borderColor: "rgba(0,71,171,0.35)",
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginBottom: 18,
    marginTop: -6,
  },
  collectionBadgeLabel: { color: "#60A5FA", fontSize: 13, fontWeight: "600" as const },
  collectionBadgeNumber: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" as const, letterSpacing: 0.5 },
  statusCard: { width: "100%", borderRadius: 16, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  statusRow: { flexDirection: "row" as const, alignItems: "center" as const, gap: 8 },
  statusLabel: { fontSize: 15, fontWeight: "700" as const, flexShrink: 1 },
  statusDetail: { fontSize: 13, marginTop: 6, lineHeight: 18 },
  refCard: { width: "100%", backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", borderRadius: 16, padding: 16, marginBottom: 14, gap: 10 },
  refRow: { flexDirection: "row" as const, justifyContent: "space-between" as const, alignItems: "center" as const },
  refLabel: { color: "rgba(255,255,255,0.45)", fontSize: 13, fontWeight: "600" as const },
  refValue: { color: "#FFFFFF", fontSize: 15, fontWeight: "600" as const },
  itemsCard: { width: "100%", backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", borderRadius: 16, padding: 16, gap: 12 },
  itemsHeader: { fontSize: 14, fontWeight: "700" as const, color: "#FFFFFF", marginBottom: 4 },
  itemRow: { flexDirection: "row" as const, gap: 10 },
  itemQty: { fontSize: 14, fontWeight: "700" as const, color: "#60A5FA", minWidth: 28 },
  itemName: { fontSize: 14, color: "rgba(255,255,255,0.9)", fontWeight: "500" as const },
  itemMods: { fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 2 },
  reorderBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1.5,
    borderColor: Colors.brand.blue,
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 8,
    minHeight: 50,
  },
  reorderText: { color: "#60A5FA", fontWeight: "700" as const, fontSize: 15 },
  doneBtn: { backgroundColor: Colors.brand.blue, paddingVertical: 16, borderRadius: 14, alignItems: "center" as const, marginTop: 8 },
  doneText: { color: "#fff", fontWeight: "700" as const, fontSize: 16 },
});
