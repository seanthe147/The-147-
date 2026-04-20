import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";

interface ConfirmationItem {
  name: string;
  quantity: number;
  price: number;
  modifiers?: string[];
}

function formatPrice(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

export default function OrderConfirmationScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    appOrderId?: string;
    tableNote?: string;
    totalPence?: string;
    items?: string;
  }>();

  const appOrderId = params.appOrderId ? parseInt(String(params.appOrderId)) : null;
  const totalPence = params.totalPence ? parseInt(String(params.totalPence)) : 0;
  const tableNote = params.tableNote ? String(params.tableNote) : "";
  let items: ConfirmationItem[] = [];
  try {
    if (params.items) items = JSON.parse(String(params.items));
  } catch {}

  const orderRef = appOrderId ? `#${appOrderId.toString().padStart(5, "0")}` : "—";

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
          Your order has been sent to the bar and kitchen. {tableNote ? `We'll bring it to ${tableNote}.` : "Pick it up at the bar when it's ready."}
        </Text>

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
  subtitle: { fontSize: 15, color: "#6B7280", textAlign: "center" as const, lineHeight: 22, marginBottom: 22, paddingHorizontal: 8 },
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
