import React from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import Colors from "@/constants/colors";

type SquareSession = {
  orderId: string;
  ticketName: string | null;
  totalPence: number;
  itemCount: number;
  openedAt: string;
};

type LiveBooking = {
  bookingId: number;
  tableType: string;
  tableNumber: string | null;
  customerName: string | null;
  startTime: string;
  duration: number;
  endTime: string;
  state: "upcoming" | "in-play" | "ending-soon" | "finished";
  minsToEnd: number;
  minsElapsed: number;
  squareSession: SquareSession | null;
};

type OrphanSession = SquareSession & {
  tableType: string | null;
  tableNumber: string | null;
};

const STATE_META: Record<LiveBooking["state"], { label: string; color: string; bg: string }> = {
  "upcoming":     { label: "Upcoming",     color: "#1E40AF", bg: "#DBEAFE" },
  "in-play":      { label: "In play",      color: "#065F46", bg: "#D1FAE5" },
  "ending-soon":  { label: "Ending soon",  color: "#9A3412", bg: "#FED7AA" },
  "finished":     { label: "Finished",     color: "#6B7280", bg: "#F3F4F6" },
};

function fmtMoney(pence: number | null | undefined): string {
  if (pence === null || pence === undefined) return "—";
  return `£${(pence / 100).toFixed(2)}`;
}

function fmtRemaining(b: LiveBooking): string {
  if (b.state === "upcoming") return `Starts ${b.startTime}`;
  if (b.state === "finished") return `Ended ${b.endTime}`;
  return `${b.minsToEnd} min left · ends ${b.endTime}`;
}

export default function AdminTablesLiveScreen() {
  const insets = useSafeAreaInsets();

  const { data, isLoading, refetch, isRefetching } = useQuery<{
    now: string;
    bookings: LiveBooking[];
    orphanSessions: OrphanSession[];
  }>({
    queryKey: ["/api/staff/tables-live"],
    refetchInterval: 30_000,
  });

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.headerBtn}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </Pressable>
        <Text style={styles.headerTitle}>Live Tables</Text>
        <View style={styles.headerBtn} />
      </View>

      {isLoading ? (
        <View style={styles.centered}><ActivityIndicator color={Colors.brand.blue} /></View>
      ) : (
        <FlatList
          data={data?.bookings || []}
          keyExtractor={(b) => String(b.bookingId)}
          ListHeaderComponent={
            <Text style={styles.headerNote}>
              Today's bookings · live from Square POS · auto-refresh 30s
            </Text>
          }
          ListEmptyComponent={
            <View style={styles.centered}>
              <Ionicons name="calendar-outline" size={48} color="#9CA3AF" />
              <Text style={styles.emptyText}>No bookings for today.</Text>
            </View>
          }
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
          renderItem={({ item }) => <LiveCard booking={item} />}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          ListFooterComponent={
            (data?.orphanSessions?.length ?? 0) > 0 ? (
              <View style={{ marginTop: 24 }}>
                <Text style={styles.sectionLabel}>WALK-IN CHECKS (no booking)</Text>
                {data!.orphanSessions.map((s) => (
                  <View key={s.orderId} style={[styles.card, { marginTop: 8 }]}>
                    <View style={[styles.stateStripe, { backgroundColor: "#065F46" }]} />
                    <View style={{ flex: 1, paddingLeft: 12 }}>
                      <Text style={styles.tableLine}>
                        {s.ticketName || (s.tableType && s.tableNumber ? `${s.tableType} ${s.tableNumber}` : "Unlabeled check")}
                      </Text>
                      <Text style={styles.metaLine}>{s.itemCount} item{s.itemCount === 1 ? "" : "s"}</Text>
                    </View>
                    <Text style={styles.tabAmount}>{fmtMoney(s.totalPence)}</Text>
                  </View>
                ))}
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
}

function LiveCard({ booking }: { booking: LiveBooking }) {
  const meta = STATE_META[booking.state];
  const sess = booking.squareSession;
  return (
    <View style={styles.card}>
      <View style={[styles.stateStripe, { backgroundColor: meta.color }]} />
      <View style={{ flex: 1, paddingLeft: 12, paddingVertical: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Text style={styles.tableLine}>
            {booking.tableNumber ? `${booking.tableType} · ${booking.tableNumber}` : booking.tableType}
          </Text>
          <View style={[styles.statePill, { backgroundColor: meta.bg }]}>
            <Text style={[styles.statePillText, { color: meta.color }]}>{meta.label}</Text>
          </View>
          {sess && (
            <View style={[styles.statePill, { backgroundColor: "#D1FAE5" }]}>
              <Text style={[styles.statePillText, { color: "#065F46" }]}>In use · Square</Text>
            </View>
          )}
        </View>
        <Text style={styles.customerLine} numberOfLines={1}>
          {booking.customerName || "Customer"}
        </Text>
        <Text style={styles.metaLine}>{fmtRemaining(booking)}</Text>
        {sess && (
          <View style={styles.tabBadge}>
            <Ionicons name="receipt" size={12} color={Colors.brand.blue} />
            <Text style={styles.tabBadgeText}>
              {fmtMoney(sess.totalPence)} · {sess.itemCount} item{sess.itemCount === 1 ? "" : "s"}
            </Text>
          </View>
        )}
      </View>
      {sess ? (
        <View style={[styles.totalBadge]}>
          <Text style={styles.totalBadgeText}>{fmtMoney(sess.totalPence)}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F2F5FA" },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: Colors.brand.dark, paddingHorizontal: 12, paddingVertical: 12,
  },
  headerBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: "700" },
  headerNote: { fontSize: 12, color: "#6B7280", marginBottom: 8, textAlign: "center" },
  centered: { padding: 60, alignItems: "center", justifyContent: "center" },
  emptyText: { marginTop: 12, color: "#6B7280", fontSize: 15, textAlign: "center" },
  card: {
    flexDirection: "row", alignItems: "center", backgroundColor: "#fff",
    borderRadius: 14, overflow: "hidden",
    shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },
  stateStripe: { width: 4, height: "100%", alignSelf: "stretch" },
  tableLine: { fontSize: 16, fontWeight: "800", color: Colors.brand.dark, textTransform: "capitalize" },
  customerLine: { fontSize: 14, color: "#374151", marginTop: 4 },
  metaLine: { fontSize: 12, color: "#6B7280", marginTop: 2 },
  statePill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  statePillText: { fontSize: 11, fontWeight: "700" },
  tabBadge: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6, alignSelf: "flex-start", backgroundColor: "#EFF6FF", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  tabBadgeText: { fontSize: 11, fontWeight: "700", color: Colors.brand.blue },
  totalBadge: { paddingHorizontal: 12, paddingVertical: 10, marginRight: 12, alignItems: "center" },
  totalBadgeText: { fontSize: 16, fontWeight: "800", color: Colors.brand.blue },
  sectionLabel: { fontSize: 11, fontWeight: "800", color: "#6B7280", letterSpacing: 0.6 },
  tabAmount: { fontSize: 16, fontWeight: "800", color: Colors.brand.blue, marginRight: 12 },
});
