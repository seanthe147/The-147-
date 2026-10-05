import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useResponsive } from "@/hooks/useResponsive";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/query-client";
import { useColors } from "@/hooks/useColors";

type Tab = {
  id: number;
  bookingId: number | null;
  tableType: string;
  tableNumber: string | null;
  customerName: string | null;
  customerEmail: string | null;
  status: "open" | "closed" | "voided";
  openedByName: string | null;
  openedAt: string;
  closedAt: string | null;
  closedByName: string | null;
  closeMethod: string | null;
  totalPence: number;
  notes: string | null;
};

type TabItem = {
  id: number;
  tabId: number;
  name: string;
  unitPricePence: number;
  quantity: number;
  addedByName: string | null;
  addedAt: string;
  voided: boolean;
  voidReason: string | null;
};

const TABLE_TYPES = [
  { value: "snooker", label: "Snooker", icon: "ellipse" as const, color: "#0F766E" },
  { value: "pool", label: "Pool", icon: "ellipse" as const, color: "#1D4ED8" },
  { value: "dining", label: "Dining", icon: "restaurant" as const, color: "#B45309" },
  { value: "bar", label: "Bar", icon: "wine" as const, color: "#7C3AED" },
  { value: "darts", label: "Darts", icon: "locate" as const, color: "#BE185D" },
];

const QUICK_ITEMS: Array<{ name: string; pricePence: number }> = [
  { name: "Pint of lager", pricePence: 550 },
  { name: "Pint of bitter", pricePence: 520 },
  { name: "House spirit + mixer", pricePence: 600 },
  { name: "Glass of wine", pricePence: 650 },
  { name: "Soft drink", pricePence: 280 },
  { name: "Bottled beer", pricePence: 480 },
];

function fmtMoney(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

function fmtTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}

export default function AdminTabsScreen() {
  const colors = useColors();
  const styles = useMemo(() => createThemedStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { tabletPad } = useResponsive();
  const qc = useQueryClient();
  const params = useLocalSearchParams<{ openTabId?: string }>();
  const [filter, setFilter] = useState<"open" | "closed">("open");
  const [openTabId, setOpenTabId] = useState<number | null>(
    params.openTabId ? parseInt(String(params.openTabId), 10) || null : null,
  );
  const [showNewTab, setShowNewTab] = useState(false);

  // Open tab detail if a tabId param arrives later (e.g. nav from Live Tables)
  React.useEffect(() => {
    if (params.openTabId) {
      const id = parseInt(String(params.openTabId), 10);
      if (Number.isFinite(id)) setOpenTabId(id);
    }
  }, [params.openTabId]);

  const { data: tabsList = [], isLoading } = useQuery<Tab[]>({
    queryKey: [`/api/staff/tabs?status=${filter}`],
    refetchInterval: filter === "open" ? 15_000 : false,
  });

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.headerBtn}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </Pressable>
        <Text style={styles.headerTitle}>Bar Tabs</Text>
        <Pressable onPress={() => setShowNewTab(true)} style={styles.headerBtn}>
          <Ionicons name="add" size={26} color="#fff" />
        </Pressable>
      </View>

      <View style={styles.filterRow}>
        <Pressable
          onPress={() => setFilter("open")}
          style={[styles.filterBtn, filter === "open" && styles.filterBtnActive]}
        >
          <Text style={[styles.filterText, filter === "open" && styles.filterTextActive]}>Open</Text>
        </Pressable>
        <Pressable
          onPress={() => setFilter("closed")}
          style={[styles.filterBtn, filter === "closed" && styles.filterBtnActive]}
        >
          <Text style={[styles.filterText, filter === "closed" && styles.filterTextActive]}>Closed today</Text>
        </Pressable>
      </View>

      {isLoading ? (
        <View style={styles.centered}><ActivityIndicator color={colors.tint} /></View>
      ) : tabsList.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="receipt-outline" size={48} color="#9CA3AF" />
          <Text style={styles.emptyText}>
            {filter === "open" ? "No tabs are open right now." : "No tabs closed today."}
          </Text>
          {filter === "open" && (
            <Pressable onPress={() => setShowNewTab(true)} style={styles.emptyCta}>
              <Ionicons name="add-circle" size={18} color="#fff" />
              <Text style={styles.emptyCtaText}>Open a new tab</Text>
            </Pressable>
          )}
        </View>
      ) : (
        <FlatList
          data={tabsList}
          keyExtractor={(t) => String(t.id)}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, marginHorizontal: tabletPad }}
          renderItem={({ item }) => <TabCard tab={item} onOpen={() => setOpenTabId(item.id)} />}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        />
      )}

      <NewTabModal visible={showNewTab} onClose={() => setShowNewTab(false)} onCreated={(id) => { setShowNewTab(false); setOpenTabId(id); qc.invalidateQueries({ queryKey: [`/api/staff/tabs?status=open`] }); }} />
      {openTabId !== null && (
        <TabDetailModal
          tabId={openTabId}
          onClose={() => { setOpenTabId(null); qc.invalidateQueries({ queryKey: [`/api/staff/tabs?status=${filter}`] }); }}
        />
      )}
    </View>
  );
}

function TabCard({ tab, onOpen }: { tab: Tab; onOpen: () => void }) {
  const colors = useColors();
  const styles = useMemo(() => createThemedStyles(colors), [colors]);
  const meta = TABLE_TYPES.find((t) => t.value === tab.tableType);
  return (
    <Pressable onPress={onOpen} style={styles.tabCard} testID={`tab-card-${tab.id}`}>
      <View style={[styles.tabIcon, { backgroundColor: (meta?.color || "#6B7280") + "22" }]}>
        <Ionicons name={meta?.icon || "receipt"} size={22} color={meta?.color || "#374151"} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.tabTitle}>
          {tab.tableNumber ? `${meta?.label || tab.tableType} · ${tab.tableNumber}` : meta?.label || tab.tableType}
        </Text>
        <Text style={styles.tabSubtitle} numberOfLines={1}>
          {tab.customerName || "Walk-in"} · opened {fmtTime(tab.openedAt)}
        </Text>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Text style={styles.tabTotal}>{fmtMoney(tab.totalPence)}</Text>
        {tab.status === "closed" && tab.closeMethod && (
          <Text style={styles.tabClosed}>{tab.closeMethod}</Text>
        )}
      </View>
    </Pressable>
  );
}

function NewTabModal({ visible, onClose, onCreated }: { visible: boolean; onClose: () => void; onCreated: (id: number) => void }) {
  const colors = useColors();
  const styles = useMemo(() => createThemedStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const [tableType, setTableType] = useState("snooker");
  const [tableNumber, setTableNumber] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [notes, setNotes] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", "/api/staff/tabs", {
        tableType,
        tableNumber: tableNumber.trim() || null,
        customerName: customerName.trim() || null,
        notes: notes.trim() || null,
      });
      return r.json();
    },
    onSuccess: (created: any) => {
      setTableNumber(""); setCustomerName(""); setNotes("");
      onCreated(created.id);
    },
    onError: (e: any) => Alert.alert("Could not open tab", e?.message || "Please try again."),
  });

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalOverlay}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.dragHandle} />
          <Text style={styles.modalTitle}>Open new tab</Text>

          <Text style={styles.fieldLabel}>Table type</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 8 }}>
            {TABLE_TYPES.map((t) => (
              <Pressable
                key={t.value}
                onPress={() => setTableType(t.value)}
                style={[styles.typeChip, tableType === t.value && { backgroundColor: t.color, borderColor: t.color }]}
              >
                <Ionicons name={t.icon} size={14} color={tableType === t.value ? "#fff" : t.color} />
                <Text style={[styles.typeChipText, tableType === t.value && { color: "#fff" }]}>{t.label}</Text>
              </Pressable>
            ))}
          </ScrollView>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>Table number</Text>
              <TextInput
                style={styles.input}
                value={tableNumber}
                onChangeText={setTableNumber}
                placeholder="e.g. 4"
                placeholderTextColor="#9CA3AF"
              />
            </View>
            <View style={{ flex: 1.4 }}>
              <Text style={styles.fieldLabel}>Customer (optional)</Text>
              <TextInput
                style={styles.input}
                value={customerName}
                onChangeText={setCustomerName}
                placeholder="Name on tab"
                placeholderTextColor="#9CA3AF"
              />
            </View>
          </View>

          <Text style={styles.fieldLabel}>Notes (optional)</Text>
          <TextInput
            style={[styles.input, { height: 60, textAlignVertical: "top", paddingTop: 10 }]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Allergies, table number changed, etc."
            placeholderTextColor="#9CA3AF"
            multiline
          />

          <View style={styles.modalActions}>
            <Pressable onPress={onClose} style={[styles.btnSecondary, { flex: 1 }]}>
              <Text style={styles.btnSecondaryText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => create.mutate()}
              disabled={create.isPending}
              style={[styles.btnPrimary, { flex: 1.3 }, create.isPending && { opacity: 0.6 }]}
            >
              {create.isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnPrimaryText}>Open tab</Text>}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function TabDetailModal({ tabId, onClose }: { tabId: number; onClose: () => void }) {
  const colors = useColors();
  const styles = useMemo(() => createThemedStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [itemName, setItemName] = useState("");
  const [itemPrice, setItemPrice] = useState("");
  const [showClose, setShowClose] = useState(false);

  const { data, isLoading, refetch } = useQuery<{ tab: Tab; items: TabItem[] }>({
    queryKey: [`/api/staff/tabs/${tabId}`],
    refetchInterval: 10_000,
  });

  const addItem = useMutation({
    mutationFn: async (payload: { name: string; unitPricePence: number; quantity?: number }) =>
      apiRequest("POST", `/api/staff/tabs/${tabId}/items`, payload),
    onSuccess: () => { setItemName(""); setItemPrice(""); refetch(); },
    onError: (e: any) => Alert.alert("Could not add", e?.message || "Please try again."),
  });

  const voidItem = useMutation({
    mutationFn: async (itemId: number) => apiRequest("DELETE", `/api/staff/tabs/${tabId}/items/${itemId}`, { reason: "voided by staff" }),
    onSuccess: () => refetch(),
    onError: (e: any) => Alert.alert("Could not void", e?.message || "Manager access required."),
  });

  const closeTab = useMutation({
    mutationFn: async (method: string) => apiRequest("POST", `/api/staff/tabs/${tabId}/close`, { method }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/staff/tabs?status=open`] });
      qc.invalidateQueries({ queryKey: [`/api/staff/tabs?status=closed`] });
      qc.invalidateQueries({ queryKey: [`/api/staff/tables-live`] });
      onClose();
    },
    onError: (e: any) => Alert.alert("Could not close", e?.message || "Please try again."),
  });

  const tab = data?.tab;
  const items = data?.items ?? [];
  const live = useMemo(() => items.filter((i) => !i.voided), [items]);

  function quickAdd(name: string, pricePence: number) {
    addItem.mutate({ name, unitPricePence: pricePence });
  }

  function manualAdd() {
    const price = Math.round(parseFloat(itemPrice) * 100);
    if (!itemName.trim() || !Number.isFinite(price) || price < 0) {
      Alert.alert("Invalid item", "Enter a name and a price (e.g. 4.50).");
      return;
    }
    addItem.mutate({ name: itemName.trim(), unitPricePence: price });
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={onClose} style={styles.headerBtn}>
            <Ionicons name="close" size={26} color="#fff" />
          </Pressable>
          <Text style={styles.headerTitle}>
            {tab ? (tab.tableNumber ? `${tab.tableType} · ${tab.tableNumber}` : tab.tableType) : "Tab"}
          </Text>
          <View style={styles.headerBtn} />
        </View>

        {isLoading || !tab ? (
          <View style={styles.centered}><ActivityIndicator color={colors.tint} /></View>
        ) : (
          <>
            <View style={styles.totalBar}>
              <View>
                <Text style={styles.totalBarLabel}>{tab.customerName || "Walk-in"}</Text>
                <Text style={styles.totalBarSub}>opened {fmtTime(tab.openedAt)} by {tab.openedByName || "staff"}</Text>
              </View>
              <Text style={styles.totalBarAmount}>{fmtMoney(tab.totalPence)}</Text>
            </View>

            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 200 }}>
              {tab.status === "open" && (
                <>
                  <Text style={styles.sectionLabel}>QUICK ADD</Text>
                  <View style={styles.quickGrid}>
                    {QUICK_ITEMS.map((qi) => (
                      <Pressable
                        key={qi.name}
                        onPress={() => quickAdd(qi.name, qi.pricePence)}
                        style={styles.quickBtn}
                      >
                        <Text style={styles.quickBtnName} numberOfLines={2}>{qi.name}</Text>
                        <Text style={styles.quickBtnPrice}>{fmtMoney(qi.pricePence)}</Text>
                      </Pressable>
                    ))}
                  </View>

                  <Text style={[styles.sectionLabel, { marginTop: 16 }]}>OR ADD MANUAL</Text>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <TextInput
                      style={[styles.input, { flex: 2 }]}
                      placeholder="Item name"
                      placeholderTextColor="#9CA3AF"
                      value={itemName}
                      onChangeText={setItemName}
                    />
                    <TextInput
                      style={[styles.input, { flex: 1 }]}
                      placeholder="£0.00"
                      placeholderTextColor="#9CA3AF"
                      value={itemPrice}
                      onChangeText={setItemPrice}
                      keyboardType="decimal-pad"
                    />
                    <Pressable onPress={manualAdd} style={styles.addBtn} disabled={addItem.isPending}>
                      {addItem.isPending ? <ActivityIndicator color="#fff" /> : <Ionicons name="add" size={22} color="#fff" />}
                    </Pressable>
                  </View>
                </>
              )}

              <Text style={[styles.sectionLabel, { marginTop: 18 }]}>ITEMS ({live.length})</Text>
              {items.length === 0 ? (
                <Text style={styles.emptyHint}>No items added yet.</Text>
              ) : (
                items.map((i) => (
                  <View key={i.id} style={[styles.itemRow, i.voided && { opacity: 0.5 }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.itemName, i.voided && { textDecorationLine: "line-through" }]}>
                        {i.quantity > 1 ? `${i.quantity}× ` : ""}{i.name}
                      </Text>
                      <Text style={styles.itemMeta}>
                        added {fmtTime(i.addedAt)}{i.addedByName ? ` by ${i.addedByName}` : ""}
                        {i.voided ? ` · ${i.voidReason || "voided"}` : ""}
                      </Text>
                    </View>
                    <Text style={styles.itemPrice}>{fmtMoney(i.unitPricePence * i.quantity)}</Text>
                    {tab.status === "open" && !i.voided && (
                      <Pressable onPress={() => voidItem.mutate(i.id)} hitSlop={8} style={{ marginLeft: 8 }}>
                        <Ionicons name="trash-outline" size={18} color="#DC2626" />
                      </Pressable>
                    )}
                  </View>
                ))
              )}
            </ScrollView>

            {tab.status === "open" && (
              <View style={[styles.closeBar, { paddingBottom: insets.bottom + 12 }]}>
                <Pressable onPress={() => setShowClose(true)} style={styles.closeBarBtn} testID="close-tab-btn">
                  <Ionicons name="checkmark-done-circle" size={20} color="#fff" />
                  <Text style={styles.closeBarText}>Close & charge {fmtMoney(tab.totalPence)}</Text>
                </Pressable>
              </View>
            )}

            {showClose && (
              <Modal transparent animationType="fade" onRequestClose={() => setShowClose(false)}>
                <Pressable style={styles.modalBackdrop} onPress={() => setShowClose(false)} />
                <View style={styles.confirmSheet}>
                  <Text style={styles.confirmTitle}>How was it paid?</Text>
                  <Text style={styles.confirmAmount}>{fmtMoney(tab.totalPence)}</Text>
                  {([
                    { method: "card", label: "Card", icon: "card" as const, color: "#0047AB" },
                    { method: "cash", label: "Cash", icon: "cash" as const, color: "#059669" },
                    { method: "added-to-booking", label: "Add to booking bill", icon: "receipt" as const, color: "#7C3AED" },
                    { method: "comp", label: "Comp / on the house", icon: "gift" as const, color: "#D97706" },
                  ]).map((opt) => (
                    <Pressable
                      key={opt.method}
                      onPress={() => { setShowClose(false); closeTab.mutate(opt.method); }}
                      style={[styles.confirmOption, { borderColor: opt.color }]}
                    >
                      <Ionicons name={opt.icon} size={20} color={opt.color} />
                      <Text style={[styles.confirmOptionText, { color: opt.color }]}>{opt.label}</Text>
                    </Pressable>
                  ))}
                  <Pressable onPress={() => setShowClose(false)} style={styles.cancelLink}>
                    <Text style={styles.cancelLinkText}>Cancel</Text>
                  </Pressable>
                </View>
              </Modal>
            )}
          </>
        )}
      </View>
    </Modal>
  );
}

const createThemedStyles = (colors: ReturnType<typeof useColors>) => themedStyleSheet({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: colors.surfaceElevated, paddingHorizontal: 12, paddingVertical: 12,
  },
  headerBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: colors.text, fontSize: 18, fontWeight: "700" },
  filterRow: { flexDirection: "row", padding: 12, gap: 8 },
  filterBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: colors.surface, alignItems: "center", borderWidth: 1, borderColor: colors.border },
  filterBtnActive: { backgroundColor: colors.tint, borderColor: colors.tint },
  filterText: { fontSize: 14, fontWeight: "600", color: "#4B5A72" },
  filterTextActive: { color: "#fff" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  emptyText: { marginTop: 12, color: "#6B7280", fontSize: 15, textAlign: "center" },
  emptyCta: { marginTop: 16, flexDirection: "row", gap: 6, backgroundColor: colors.tint, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10 },
  emptyCtaText: { color: "#fff", fontWeight: "700" },
  tabCard: {
    backgroundColor: colors.surface, borderRadius: 14, padding: 14,
    flexDirection: "row", alignItems: "center", gap: 12,
    shadowColor: colors.cardShadow, shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },
  tabIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  tabTitle: { fontSize: 16, fontWeight: "700", color: colors.text, textTransform: "capitalize" },
  tabSubtitle: { fontSize: 13, color: "#6B7280", marginTop: 2 },
  tabTotal: { fontSize: 17, fontWeight: "800", color: colors.tint },
  tabClosed: { fontSize: 11, color: "#6B7280", textTransform: "capitalize", marginTop: 2 },
  modalOverlay: { flex: 1, justifyContent: "flex-end" },
  modalBackdrop: { ...StyleSheet.absoluteFill, backgroundColor: colors.overlay },
  modalSheet: { backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  dragHandle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: "#D1D5DB", marginBottom: 12 },
  modalTitle: { fontSize: 20, fontWeight: "800", color: colors.text, marginBottom: 12 },
  fieldLabel: { fontSize: 12, fontWeight: "700", color: "#4B5A72", marginTop: 8, marginBottom: 4, letterSpacing: 0.4 },
  input: { backgroundColor: colors.input, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, height: 44, fontSize: 15, color: colors.text },
  typeChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: "#E5E7EB", backgroundColor: "#fff", marginRight: 8 },
  typeChipText: { fontSize: 13, fontWeight: "600", color: "#374151", textTransform: "capitalize" },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 18 },
  btnPrimary: { backgroundColor: colors.tint, paddingVertical: 14, borderRadius: 12, alignItems: "center" },
  btnPrimaryText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  btnSecondary: { backgroundColor: "#F3F4F6", paddingVertical: 14, borderRadius: 12, alignItems: "center" },
  btnSecondaryText: { color: "#374151", fontWeight: "700", fontSize: 15 },
  totalBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  totalBarLabel: { fontSize: 15, fontWeight: "700", color: colors.text },
  totalBarSub: { fontSize: 12, color: "#6B7280", marginTop: 2 },
  totalBarAmount: { fontSize: 22, fontWeight: "800", color: colors.tint },
  sectionLabel: { fontSize: 11, fontWeight: "800", color: "#6B7280", letterSpacing: 0.6, marginBottom: 8 },
  quickGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  quickBtn: { width: "31%", minHeight: 70, backgroundColor: colors.surface, borderRadius: 10, padding: 10, justifyContent: "space-between", borderWidth: 1, borderColor: colors.border },
  quickBtnName: { fontSize: 12, fontWeight: "600", color: colors.text },
  quickBtnPrice: { fontSize: 14, fontWeight: "800", color: colors.tint, marginTop: 6 },
  addBtn: { width: 44, backgroundColor: colors.tint, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  emptyHint: { color: "#9CA3AF", fontStyle: "italic", paddingVertical: 8 },
  itemRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#F3F4F6" },
  itemName: { fontSize: 14, fontWeight: "600", color: colors.text },
  itemMeta: { fontSize: 11, color: "#9CA3AF", marginTop: 2 },
  itemPrice: { fontSize: 14, fontWeight: "700", color: colors.text, marginLeft: 12 },
  closeBar: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 12, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  closeBarBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.tint, paddingVertical: 14, borderRadius: 12 },
  closeBarText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  confirmSheet: { position: "absolute", left: 16, right: 16, top: "20%", backgroundColor: colors.surface, borderRadius: 18, padding: 20 },
  confirmTitle: { fontSize: 16, fontWeight: "700", color: "#374151", textAlign: "center" },
  confirmAmount: { fontSize: 30, fontWeight: "900", color: colors.tint, textAlign: "center", marginVertical: 10 },
  confirmOption: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderRadius: 12, borderWidth: 2, marginTop: 10 },
  confirmOptionText: { fontSize: 15, fontWeight: "700" },
  cancelLink: { alignItems: "center", paddingVertical: 14, marginTop: 4 },
  cancelLinkText: { color: "#6B7280", fontWeight: "600" },
}, colors);
function themedStyleSheet(source: any, colors: ReturnType<typeof useColors>) { return StyleSheet.create(themeSource(source, colors)); }
function themeSource(source: any, colors: ReturnType<typeof useColors>): any { return Object.fromEntries(Object.entries(source).map(([name, value]: any) => [name, Object.fromEntries(Object.entries(value).map(([key, token]: any) => [key, themeToken(name, key, token, colors)]))])); }
function themeToken(name: string, key: string, token: any, colors: ReturnType<typeof useColors>) { if (typeof token !== "string") return token; if (key === "color" && /^#fff(?:fff)?$/i.test(token)) return /btn|button|badge|chip|pill|selected|active|primary|action|cta|fab|submit|save|publish|approve|confirm|complete|clock|gdpr|back|close|filter|tab|preview|retry|claim|redeem|login/i.test(name) ? token : colors.text; if (key === "color") return ["#111827", "#374151"].includes(token) ? colors.text : ["#4B5A72", "#6B7280", "#9CA3AF"].includes(token) ? colors.textSecondary : token; if (/border.*color/i.test(key) && ["#E5E7EB", "#F3F4F6", "#D1D5DB"].includes(token)) return colors.border; if (key === "backgroundColor") return ["#F2F5FA"].includes(token) ? colors.background : ["#fff", "#F3F4F6"].includes(token) ? colors.surface : token; return token; }
