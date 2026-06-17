import React, { useState, useCallback } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
  FlatList,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/query-client";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import Colors from "@/constants/colors";

// ── Types ─────────────────────────────────────────────────────────────────────

interface StockCategory {
  id: number;
  name: string;
  sortOrder: number;
}

interface StockItem {
  id: number;
  categoryId: number;
  name: string;
  supplier: string | null;
  supplierCode: string | null;
  countUnit: string;
  containerSize: string | null;
  caseSize: number | null;
  servesPerUnit: string | null;
  squareCatalogVariationId: string | null;
  squareCatalogVariationName: string | null;
  active: boolean;
}

interface CatalogVariation {
  variationId: string;
  variationName: string;
  itemName: string;
  displayName: string;
}

interface AutoMatchResult {
  stockItemId: number;
  stockItemName: string;
  currentVariationId: string | null;
  currentVariationName: string | null;
  suggestedVariationId: string | null;
  suggestedVariationName: string | null;
  confidence: "high" | "medium" | "low" | "none";
  score: number;
}

interface DeliveryLine {
  stockItemId: number;
  quantityUnits: string;
  quantityCases?: string;
}

interface Delivery {
  id: number;
  deliveredAt: string;
  supplier: string | null;
  invoiceRef: string | null;
  notes: string | null;
  enteredBy: string;
  lines: Array<DeliveryLine & { itemName: string; countUnit: string }>;
}

interface CountLine {
  stockItemId: number;
  quantityUnits: string;
}

interface StockCount {
  id: number;
  periodStart: string;
  periodEnd: string;
  countedBy: string;
  status: string;
  notes: string | null;
  lines: Array<CountLine & { itemName: string; countUnit: string }>;
}

interface ReportLine {
  itemId: number;
  itemName: string;
  countUnit: string;
  containerSize: string | null;
  categoryName: string;
  squareLinked: boolean;
  opening: number;
  delivered: number;
  closing: number;
  consumed: number;
  sold: number | null;
  variance: number | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const UNIT_LABEL: Record<string, string> = {
  keg: "keg(s)",
  bottle: "bottle(s)",
  can: "can(s)",
  bib: "BIB(s)",
  case: "case(s)",
};

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function toISOLocal(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ── Main Screen ───────────────────────────────────────────────────────────────

type Tab = "deliveries" | "count" | "report" | "catalogue";

export default function AdminStockScreen() {
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isManager, isOwner, isLoading: authLoading } = useStaffAuth();
  const canManage = isManager || isOwner;
  const [tab, setTab] = useState<Tab>("count");

  React.useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/staff-portal");
    }
  }, [authLoading, isAuthenticated]);

  const categoriesQuery = useQuery<StockCategory[]>({
    queryKey: ["/api/stock/categories"],
    refetchOnMount: "always",
  });

  const itemsQuery = useQuery<StockItem[]>({
    queryKey: ["/api/stock/items"],
    refetchOnMount: "always",
  });

  const items = itemsQuery.data ?? [];
  const categories = categoriesQuery.data ?? [];

  if (authLoading || categoriesQuery.isLoading || itemsQuery.isLoading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top + 20 }]}>
        <ActivityIndicator color={Colors.brand.gold} />
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.brand.gold} />
        </Pressable>
        <Text style={styles.headerTitle}>Stock Management</Text>
      </View>

      {/* Tab bar */}
      <View style={styles.tabBar}>
        {(canManage
          ? (["deliveries", "count", "report", "catalogue"] as Tab[])
          : (["count"] as Tab[])
        ).map((t) => (
          <Pressable key={t} onPress={() => setTab(t)} style={[styles.tabItem, tab === t && styles.tabItemActive]}>
            <Text style={[styles.tabLabel, tab === t && styles.tabLabelActive]}>
              {t === "deliveries" ? "Deliveries" : t === "count" ? "Stock Count" : t === "report" ? "Report" : "Catalogue"}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Tab content */}
      {tab === "deliveries" && canManage && <DeliveriesTab items={items} categories={categories} />}
      {tab === "count" && <CountTab items={items} categories={categories} />}
      {tab === "report" && canManage && <ReportTab categories={categories} />}
      {tab === "catalogue" && canManage && <CatalogueTab items={items} categories={categories} />}
    </View>
  );
}

// ── Deliveries Tab ────────────────────────────────────────────────────────────

function DeliveriesTab({ items, categories }: { items: StockItem[]; categories: StockCategory[] }) {
  const [showForm, setShowForm] = useState(false);
  const [deliveredAt, setDeliveredAt] = useState(toISOLocal(new Date()));
  const [supplier, setSupplier] = useState("Molson Coors");
  const [invoiceRef, setInvoiceRef] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Record<number, string>>({});

  const deliveriesQuery = useQuery<Delivery[]>({
    queryKey: ["/api/stock/deliveries"],
    refetchOnMount: "always",
  });

  const createMutation = useMutation({
    mutationFn: async (payload: object) => {
      const res = await apiRequest("POST", "/api/stock/deliveries", payload);
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to save");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/stock/deliveries"] });
      setShowForm(false);
      setLines({});
      setInvoiceRef("");
      setNotes("");
    },
    onError: (e: Error) => Alert.alert("Error", e.message),
  });

  const handleSave = () => {
    const lineItems = Object.entries(lines)
      .filter(([, qty]) => qty && parseFloat(qty) > 0)
      .map(([id, qty]) => ({ stockItemId: Number(id), quantityUnits: qty }));
    if (!lineItems.length) return Alert.alert("Enter quantities", "Add at least one item quantity.");
    createMutation.mutate({ deliveredAt: new Date(deliveredAt).toISOString(), supplier, invoiceRef, notes, lines: lineItems });
  };

  const activeItems = items.filter((i) => i.active);
  const groupedItems = categories.map((c) => ({ cat: c, items: activeItems.filter((i) => i.categoryId === c.id) })).filter((g) => g.items.length > 0);

  if (showForm) {
    return (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView style={styles.formScroll} contentContainerStyle={{ paddingBottom: 40 }}>
          <Text style={styles.formTitle}>Log Delivery</Text>

          <Text style={styles.fieldLabel}>Arrived (date & time)</Text>
          <TextInput
            style={styles.input}
            value={deliveredAt}
            onChangeText={setDeliveredAt}
            placeholder="YYYY-MM-DDTHH:MM"
            placeholderTextColor="#666"
          />
          <Text style={styles.fieldHint}>Backdate if logging after the fact</Text>

          <Text style={styles.fieldLabel}>Supplier</Text>
          <TextInput style={styles.input} value={supplier} onChangeText={setSupplier} placeholderTextColor="#666" />

          <Text style={styles.fieldLabel}>Invoice / Delivery Note Ref</Text>
          <TextInput style={styles.input} value={invoiceRef} onChangeText={setInvoiceRef} placeholderTextColor="#666" placeholder="Optional" />

          <Text style={styles.fieldLabel}>Notes</Text>
          <TextInput style={[styles.input, { height: 64 }]} value={notes} onChangeText={setNotes} multiline placeholderTextColor="#666" placeholder="Optional" />

          <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Quantities received</Text>
          <Text style={styles.fieldHint}>Leave blank for items not in this delivery</Text>

          {groupedItems.map(({ cat, items: catItems }) => (
            <View key={cat.id}>
              <Text style={styles.catHeader}>{cat.name}</Text>
              {catItems.map((item) => (
                <View key={item.id} style={styles.lineRow}>
                  <View style={styles.lineInfo}>
                    <Text style={styles.lineName}>{item.name}</Text>
                    <Text style={styles.lineUnit}>{item.containerSize} · {item.caseSize ? `case of ${item.caseSize}` : UNIT_LABEL[item.countUnit]}</Text>
                  </View>
                  <TextInput
                    style={styles.qtyInput}
                    value={lines[item.id] ?? ""}
                    onChangeText={(v) => setLines((prev) => ({ ...prev, [item.id]: v }))}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor="#555"
                  />
                  <Text style={styles.unitTag}>{item.countUnit === "keg" ? "kegs" : item.caseSize ? "cases" : UNIT_LABEL[item.countUnit]}</Text>
                </View>
              ))}
            </View>
          ))}

          <View style={styles.formActions}>
            <Pressable style={styles.cancelBtn} onPress={() => setShowForm(false)}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
            <Pressable style={styles.saveBtn} onPress={handleSave} disabled={createMutation.isPending}>
              {createMutation.isPending ? <ActivityIndicator color="#000" /> : <Text style={styles.saveBtnText}>Save Delivery</Text>}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.listHeader}>
        <Text style={styles.listTitle}>Delivery Log</Text>
        <Pressable style={styles.addBtn} onPress={() => setShowForm(true)}>
          <Ionicons name="add" size={18} color="#000" />
          <Text style={styles.addBtnText}>Log Delivery</Text>
        </Pressable>
      </View>

      {deliveriesQuery.isLoading ? (
        <ActivityIndicator color={Colors.brand.gold} style={{ marginTop: 40 }} />
      ) : !deliveriesQuery.data?.length ? (
        <View style={styles.emptyState}>
          <Ionicons name="cube-outline" size={40} color="#444" />
          <Text style={styles.emptyText}>No deliveries logged yet</Text>
          <Text style={styles.emptyHint}>Tap "Log Delivery" to record your first one</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          {deliveriesQuery.data.map((d) => (
            <View key={d.id} style={styles.deliveryCard}>
              <View style={styles.deliveryCardHeader}>
                <View>
                  <Text style={styles.deliveryDate}>{fmtDateTime(d.deliveredAt)}</Text>
                  <Text style={styles.deliverySupplier}>{d.supplier ?? "Unknown supplier"}{d.invoiceRef ? ` · ${d.invoiceRef}` : ""}</Text>
                </View>
                <View style={styles.deliveryCountBadge}>
                  <Text style={styles.deliveryCountText}>{d.lines.length} item{d.lines.length !== 1 ? "s" : ""}</Text>
                </View>
              </View>
              {d.lines.map((l, idx) => (
                <View key={idx} style={styles.deliveryLine}>
                  <Text style={styles.deliveryLineName}>{l.itemName}</Text>
                  <Text style={styles.deliveryLineQty}>{l.quantityUnits} {l.countUnit === "keg" ? "kegs" : l.countUnit + "(s)"}</Text>
                </View>
              ))}
              {d.notes ? <Text style={styles.deliveryNotes}>{d.notes}</Text> : null}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

// ── Stock Count Tab ───────────────────────────────────────────────────────────

function CountTab({ items, categories }: { items: StockItem[]; categories: StockCategory[] }) {
  const [showForm, setShowForm] = useState(false);
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState(toISOLocal(new Date()));
  const [notes, setNotes] = useState("");
  const [counts, setCounts] = useState<Record<number, string>>({});
  const [draftId, setDraftId] = useState<number | null>(null);

  const countsQuery = useQuery<StockCount[]>({
    queryKey: ["/api/stock/counts"],
    refetchOnMount: "always",
  });

  const saveMutation = useMutation({
    mutationFn: async (payload: object) => {
      const res = await apiRequest(draftId ? "PATCH" : "POST", draftId ? `/api/stock/counts/${draftId}` : "/api/stock/counts", payload);
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to save");
      return res.json() as Promise<{ id: number }>;
    },
    onSuccess: (data) => {
      setDraftId(data.id);
      queryClient.invalidateQueries({ queryKey: ["/api/stock/counts"] });
      Alert.alert("Saved", "Count saved as draft.");
    },
    onError: (e: Error) => Alert.alert("Error", e.message),
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const countLines = Object.entries(counts)
        .filter(([, qty]) => qty !== "")
        .map(([id, qty]) => ({ stockItemId: Number(id), quantityUnits: qty || "0" }));
      const res = await apiRequest(draftId ? "PATCH" : "POST", draftId ? `/api/stock/counts/${draftId}` : "/api/stock/counts", {
        periodStart: new Date(periodStart).toISOString(),
        periodEnd: new Date(periodEnd).toISOString(),
        notes,
        status: "submitted",
        lines: countLines,
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to submit");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/stock/counts"] });
      setShowForm(false);
      setDraftId(null);
      setCounts({});
    },
    onError: (e: Error) => Alert.alert("Error", e.message),
  });

  const handleSaveDraft = () => {
    if (!periodStart || !periodEnd) return Alert.alert("Set dates", "Please set period start and end dates.");
    const countLines = Object.entries(counts)
      .filter(([, qty]) => qty !== "")
      .map(([id, qty]) => ({ stockItemId: Number(id), quantityUnits: qty || "0" }));
    saveMutation.mutate({ periodStart: new Date(periodStart).toISOString(), periodEnd: new Date(periodEnd).toISOString(), notes, lines: countLines });
  };

  const handleSubmit = () => {
    if (!periodStart || !periodEnd) return Alert.alert("Set dates", "Please set period start and end dates.");
    Alert.alert("Submit count?", "Once submitted this count will be used for variance reports and cannot be edited.", [
      { text: "Cancel", style: "cancel" },
      { text: "Submit", onPress: () => submitMutation.mutate() },
    ]);
  };

  const activeItems = items.filter((i) => i.active);
  const groupedItems = categories.map((c) => ({ cat: c, items: activeItems.filter((i) => i.categoryId === c.id) })).filter((g) => g.items.length > 0);

  if (showForm) {
    return (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView style={styles.formScroll} contentContainerStyle={{ paddingBottom: 60 }}>
          <Text style={styles.formTitle}>{draftId ? "Continue Count" : "New Stock Count"}</Text>

          <Text style={styles.fieldLabel}>Period Start</Text>
          <TextInput style={styles.input} value={periodStart} onChangeText={setPeriodStart} placeholder="YYYY-MM-DDTHH:MM" placeholderTextColor="#666" />

          <Text style={styles.fieldLabel}>Period End</Text>
          <TextInput style={styles.input} value={periodEnd} onChangeText={setPeriodEnd} placeholder="YYYY-MM-DDTHH:MM" placeholderTextColor="#666" />

          <Text style={styles.fieldLabel}>Notes</Text>
          <TextInput style={[styles.input, { height: 56 }]} value={notes} onChangeText={setNotes} multiline placeholderTextColor="#666" placeholder="Optional" />

          <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Physical count</Text>
          <Text style={styles.fieldHint}>Enter what you physically counted for each item</Text>

          {groupedItems.map(({ cat, items: catItems }) => (
            <View key={cat.id}>
              <Text style={styles.catHeader}>{cat.name}</Text>
              {catItems.map((item) => (
                <View key={item.id} style={styles.lineRow}>
                  <View style={styles.lineInfo}>
                    <Text style={styles.lineName}>{item.name}</Text>
                    {item.servesPerUnit ? (
                      <Text style={styles.lineUnit}>{item.containerSize} · {item.servesPerUnit} pints/keg</Text>
                    ) : (
                      <Text style={styles.lineUnit}>{item.containerSize}{item.caseSize ? ` · case of ${item.caseSize}` : ""}</Text>
                    )}
                  </View>
                  <TextInput
                    style={styles.qtyInput}
                    value={counts[item.id] ?? ""}
                    onChangeText={(v) => setCounts((prev) => ({ ...prev, [item.id]: v }))}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor="#555"
                  />
                  <Text style={styles.unitTag}>{item.countUnit === "keg" ? "kegs" : item.countUnit + "(s)"}</Text>
                </View>
              ))}
            </View>
          ))}

          <View style={styles.formActions}>
            <Pressable style={styles.cancelBtn} onPress={() => { setShowForm(false); setDraftId(null); setCounts({}); }}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
            <Pressable style={[styles.saveBtn, { backgroundColor: "#374151" }]} onPress={handleSaveDraft} disabled={saveMutation.isPending}>
              <Text style={[styles.saveBtnText, { color: "#fff" }]}>Save Draft</Text>
            </Pressable>
            <Pressable style={styles.saveBtn} onPress={handleSubmit} disabled={submitMutation.isPending}>
              {submitMutation.isPending ? <ActivityIndicator color="#000" /> : <Text style={styles.saveBtnText}>Submit</Text>}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.listHeader}>
        <Text style={styles.listTitle}>Count Sessions</Text>
        <Pressable style={styles.addBtn} onPress={() => setShowForm(true)}>
          <Ionicons name="add" size={18} color="#000" />
          <Text style={styles.addBtnText}>New Count</Text>
        </Pressable>
      </View>

      {countsQuery.isLoading ? (
        <ActivityIndicator color={Colors.brand.gold} style={{ marginTop: 40 }} />
      ) : !countsQuery.data?.length ? (
        <View style={styles.emptyState}>
          <Ionicons name="list-outline" size={40} color="#444" />
          <Text style={styles.emptyText}>No stock counts yet</Text>
          <Text style={styles.emptyHint}>Tap "New Count" to start your first monthly count</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          {countsQuery.data.map((c) => (
            <View key={c.id} style={styles.deliveryCard}>
              <View style={styles.deliveryCardHeader}>
                <View>
                  <Text style={styles.deliveryDate}>{fmtDate(c.periodStart)} – {fmtDate(c.periodEnd)}</Text>
                  <Text style={styles.deliverySupplier}>by {c.countedBy} · {c.lines.length} items counted</Text>
                </View>
                <View style={[styles.deliveryCountBadge, c.status === "submitted" ? { backgroundColor: "#064E3B" } : { backgroundColor: "#78350F" }]}>
                  <Text style={styles.deliveryCountText}>{c.status === "submitted" ? "Submitted" : "Draft"}</Text>
                </View>
              </View>
              {c.notes ? <Text style={styles.deliveryNotes}>{c.notes}</Text> : null}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

// ── Report Tab ────────────────────────────────────────────────────────────────

function ReportTab({ categories }: { categories: StockCategory[] }) {
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState(toISOLocal(new Date()));
  const [fetched, setFetched] = useState(false);

  const reportQuery = useQuery<ReportLine[]>({
    queryKey: ["/api/stock/report", periodStart, periodEnd],
    enabled: fetched && !!periodStart && !!periodEnd,
    refetchOnMount: false,
  });

  const handleRun = () => {
    if (!periodStart || !periodEnd) return Alert.alert("Set dates", "Please enter both a start and end date.");
    setFetched(true);
  };

  const data = reportQuery.data ?? [];
  const grouped = categories
    .map((c) => ({ cat: c, lines: data.filter((l) => l.categoryName === c.name) }))
    .filter((g) => g.lines.length > 0);
  const hasSquareData = data.some((l) => l.squareLinked);
  const linkedCount = data.filter((l) => l.squareLinked).length;

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Text style={styles.formTitle}>Stock Reconciliation Report</Text>
      <Text style={styles.fieldHint}>
        Opens + Deliveries − Closing = Used (physical).{"\n"}
        Sold = Square POS units. Variance = Used − Sold.
      </Text>

      <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Period Start</Text>
      <TextInput
        style={styles.input}
        value={periodStart}
        onChangeText={v => { setPeriodStart(v); setFetched(false); }}
        placeholder="YYYY-MM-DDTHH:MM"
        placeholderTextColor="#666"
      />
      <Text style={styles.fieldLabel}>Period End</Text>
      <TextInput
        style={styles.input}
        value={periodEnd}
        onChangeText={v => { setPeriodEnd(v); setFetched(false); }}
        placeholder="YYYY-MM-DDTHH:MM"
        placeholderTextColor="#666"
      />
      <Pressable style={[styles.saveBtn, { marginTop: 12, alignSelf: "stretch" }]} onPress={handleRun}>
        <Text style={styles.saveBtnText}>Run Report</Text>
      </Pressable>

      {reportQuery.isLoading && <ActivityIndicator color={Colors.brand.gold} style={{ marginTop: 32 }} />}

      {fetched && !reportQuery.isLoading && data.length === 0 && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No data for this period</Text>
          <Text style={styles.emptyHint}>You need at least one submitted stock count and some delivery records for this date range.</Text>
        </View>
      )}

      {fetched && data.length > 0 && (
        <View style={styles.reportSummaryBanner}>
          {hasSquareData
            ? <><Ionicons name="link" size={14} color="#22C55E" /><Text style={styles.reportSummaryText}> {linkedCount} of {data.length} items linked to Square POS</Text></>
            : <><Ionicons name="alert-circle-outline" size={14} color="#F59E0B" /><Text style={[styles.reportSummaryText, { color: "#F59E0B" }]}> No items linked to Square POS — link items in the Catalogue tab to see Sold & Variance</Text></>
          }
        </View>
      )}

      {grouped.map(({ cat, lines }) => (
        <View key={cat.id} style={{ marginTop: 20 }}>
          <Text style={styles.catHeader}>{cat.name}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.reportTable}>
              {/* Header */}
              <View style={styles.reportHeaderRow}>
                <Text style={[styles.reportCell, styles.reportItemCol, styles.reportHeader]}>Item</Text>
                <Text style={[styles.reportCell, styles.reportNumCol, styles.reportHeader]}>Open</Text>
                <Text style={[styles.reportCell, styles.reportNumCol, styles.reportHeader]}>+Del</Text>
                <Text style={[styles.reportCell, styles.reportNumCol, styles.reportHeader]}>Close</Text>
                <Text style={[styles.reportCell, styles.reportNumCol, styles.reportHeader]}>Used</Text>
                <Text style={[styles.reportCell, styles.reportNumColWide, styles.reportHeader]}>Sold{"\n"}(Square)</Text>
                <Text style={[styles.reportCell, styles.reportNumColWide, styles.reportHeader]}>Variance</Text>
              </View>
              {lines.map((l) => {
                const varColor = l.variance === null ? "#555"
                  : l.variance === 0 ? "#22C55E"
                  : l.variance > 0 ? "#F59E0B"   // used more than sold → wastage/spillage
                  : "#EF4444";                    // used less than sold → count discrepancy
                return (
                  <View key={l.itemId} style={styles.reportRow}>
                    <View style={[styles.reportCell, styles.reportItemCol]}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                        <Text style={styles.reportItemName}>{l.itemName}</Text>
                        {l.squareLinked && <Ionicons name="link" size={10} color="#22C55E" />}
                      </View>
                      <Text style={styles.reportItemUnit}>{l.containerSize} · {l.countUnit}</Text>
                    </View>
                    <Text style={[styles.reportCell, styles.reportNumCol, styles.reportNum]}>{l.opening}</Text>
                    <Text style={[styles.reportCell, styles.reportNumCol, styles.reportNum]}>{l.delivered}</Text>
                    <Text style={[styles.reportCell, styles.reportNumCol, styles.reportNum]}>{l.closing}</Text>
                    <Text style={[styles.reportCell, styles.reportNumCol, styles.reportNum, l.consumed < 0 ? styles.reportNeg : {}]}>{l.consumed}</Text>
                    <Text style={[styles.reportCell, styles.reportNumColWide, styles.reportNum, { color: l.sold !== null ? Colors.light.text : "#555" }]}>
                      {l.sold !== null ? l.sold : "–"}
                    </Text>
                    <Text style={[styles.reportCell, styles.reportNumColWide, styles.reportNum, { color: varColor, fontWeight: "700" }]}>
                      {l.variance !== null ? (l.variance > 0 ? `+${l.variance}` : String(l.variance)) : "–"}
                    </Text>
                  </View>
                );
              })}
            </View>
          </ScrollView>
          {/* Variance legend */}
          {lines.some((l) => l.squareLinked) && (
            <View style={styles.varianceLegend}>
              <Text style={[styles.varianceLegendItem, { color: "#F59E0B" }]}>+n = wastage/spillage</Text>
              <Text style={[styles.varianceLegendItem, { color: "#22C55E" }]}>0 = perfect</Text>
              <Text style={[styles.varianceLegendItem, { color: "#EF4444" }]}>−n = count discrepancy</Text>
            </View>
          )}
        </View>
      ))}
    </ScrollView>
  );
}

// ── Catalogue Tab ─────────────────────────────────────────────────────────────

type CatView = "list" | "edit" | "autoMatch";

function CatalogueTab({ items, categories }: { items: StockItem[]; categories: StockCategory[] }) {
  const [view, setView] = useState<CatView>("list");
  const [editItem, setEditItem] = useState<StockItem | null>(null);
  const [editServes, setEditServes] = useState("");
  const [editActive, setEditActive] = useState(true);
  // POS link state in edit view
  const [variationSearch, setVariationSearch] = useState("");
  const [pendingVarId, setPendingVarId] = useState<string | null>(null);
  const [pendingVarName, setPendingVarName] = useState<string | null>(null);
  // Auto-match state
  const [autoResults, setAutoResults] = useState<AutoMatchResult[]>([]);
  const [confirmed, setConfirmed] = useState<Record<number, boolean>>({});

  const variationsQuery = useQuery<CatalogVariation[]>({
    queryKey: ["/api/staff/stock/square-variations"],
    staleTime: 10 * 60 * 1000,
  });

  const patchMutation = useMutation({
    mutationFn: async (payload: { id: number; servesPerUnit?: string; active?: boolean }) => {
      const { id, ...body } = payload;
      const res = await apiRequest("PATCH", `/api/stock/items/${id}`, body);
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/stock/items"] }); setView("list"); },
    onError: (e: Error) => Alert.alert("Error", e.message),
  });

  const mappingMutation = useMutation({
    mutationFn: async ({ id, variationId, variationName }: { id: number; variationId: string | null; variationName: string | null }) => {
      const res = await apiRequest("PATCH", `/api/staff/stock/items/${id}/square-mapping`, { squareCatalogVariationId: variationId, squareCatalogVariationName: variationName });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/stock/items"] }),
    onError: (e: Error) => Alert.alert("Error", e.message),
  });

  const autoMatchMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/staff/stock/auto-match", {});
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      return res.json() as Promise<AutoMatchResult[]>;
    },
    onSuccess: (results) => {
      setAutoResults(results.filter((r) => r.confidence !== "none"));
      const initial: Record<number, boolean> = {};
      results.forEach((r) => { if (r.confidence === "high") initial[r.stockItemId] = true; });
      setConfirmed(initial);
      setView("autoMatch");
    },
    onError: (e: Error) => Alert.alert("Error", e.message),
  });

  const applyAutoMatch = useCallback(async () => {
    const toSave = autoResults.filter((r) => confirmed[r.stockItemId] && r.suggestedVariationId);
    for (const r of toSave) {
      await mappingMutation.mutateAsync({ id: r.stockItemId, variationId: r.suggestedVariationId, variationName: r.suggestedVariationName });
    }
    queryClient.invalidateQueries({ queryKey: ["/api/stock/items"] });
    setView("list");
  }, [autoResults, confirmed]);

  const handleEdit = (item: StockItem) => {
    setEditItem(item);
    setEditServes(item.servesPerUnit ?? "");
    setEditActive(item.active);
    setVariationSearch("");
    setPendingVarId(item.squareCatalogVariationId ?? null);
    setPendingVarName(item.squareCatalogVariationName ?? null);
    setView("edit");
  };

  const handleSave = () => {
    if (!editItem) return;
    patchMutation.mutate({ id: editItem.id, servesPerUnit: editServes || undefined, active: editActive });
    if (pendingVarId !== editItem.squareCatalogVariationId) {
      mappingMutation.mutate({ id: editItem.id, variationId: pendingVarId, variationName: pendingVarName });
    }
  };

  const filteredVariations = (variationsQuery.data ?? []).filter((v) =>
    v.displayName.toLowerCase().includes(variationSearch.toLowerCase())
  ).slice(0, 30);

  // ── Auto-match review screen ─────────────────────────────────────────────
  if (view === "autoMatch") {
    const highCount = autoResults.filter((r) => r.confidence === "high").length;
    const applyCount = autoResults.filter((r) => confirmed[r.stockItemId]).length;
    return (
      <ScrollView style={styles.formScroll} contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 16 }}>
          <Pressable onPress={() => setView("list")} hitSlop={12}>
            <Ionicons name="arrow-back" size={20} color={Colors.brand.gold} />
          </Pressable>
          <Text style={[styles.formTitle, { marginBottom: 0, marginLeft: 10 }]}>POS Auto-Link Results</Text>
        </View>
        <Text style={styles.fieldHint}>
          {highCount} high-confidence matches found. Review and confirm which to apply. Tick to include, untick to skip.
        </Text>
        {["high", "medium", "low"].map((conf) => {
          const group = autoResults.filter((r) => r.confidence === conf);
          if (!group.length) return null;
          const confColor = conf === "high" ? "#22C55E" : conf === "medium" ? "#F59E0B" : "#6B7280";
          const confLabel = conf === "high" ? "HIGH" : conf === "medium" ? "MEDIUM" : "LOW";
          return (
            <View key={conf} style={{ marginTop: 16 }}>
              <Text style={[styles.catHeader, { color: confColor }]}>{confLabel} CONFIDENCE</Text>
              {group.map((r) => (
                <Pressable
                  key={r.stockItemId}
                  style={[styles.autoMatchRow, confirmed[r.stockItemId] && styles.autoMatchRowSelected]}
                  onPress={() => setConfirmed((prev) => ({ ...prev, [r.stockItemId]: !prev[r.stockItemId] }))}
                >
                  <View style={[styles.autoMatchCheck, confirmed[r.stockItemId] && styles.autoMatchCheckOn]}>
                    {confirmed[r.stockItemId] && <Ionicons name="checkmark" size={14} color="#000" />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.autoMatchStock}>{r.stockItemName}</Text>
                    <Text style={styles.autoMatchSquare}>→ {r.suggestedVariationName}</Text>
                  </View>
                  <Text style={[styles.autoMatchScore, { color: confColor }]}>{r.score}%</Text>
                </Pressable>
              ))}
            </View>
          );
        })}
        <View style={[styles.formActions, { marginTop: 24 }]}>
          <Pressable style={styles.cancelBtn} onPress={() => setView("list")}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </Pressable>
          <Pressable style={styles.saveBtn} onPress={applyAutoMatch} disabled={applyCount === 0 || mappingMutation.isPending}>
            {mappingMutation.isPending
              ? <ActivityIndicator color="#000" />
              : <Text style={styles.saveBtnText}>Apply {applyCount} Link{applyCount !== 1 ? "s" : ""}</Text>}
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  // ── Item edit screen ──────────────────────────────────────────────────────
  if (view === "edit" && editItem) {
    return (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView style={styles.formScroll} contentContainerStyle={{ paddingBottom: 40 }}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
            <Pressable onPress={() => setView("list")} hitSlop={12}>
              <Ionicons name="arrow-back" size={20} color={Colors.brand.gold} />
            </Pressable>
            <Text style={[styles.formTitle, { marginBottom: 0, marginLeft: 10 }]}>{editItem.name}</Text>
          </View>
          <Text style={styles.fieldHint}>{editItem.containerSize} · {editItem.countUnit}{editItem.caseSize ? ` · case of ${editItem.caseSize}` : ""}</Text>

          {editItem.countUnit === "keg" && (
            <>
              <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Pints per keg (your actual yield)</Text>
              <TextInput style={styles.input} value={editServes} onChangeText={setEditServes} keyboardType="decimal-pad" placeholder="e.g. 88" placeholderTextColor="#666" />
              <Text style={styles.fieldHint}>Standard: 50L = 88 pints, 100L = 176 pints</Text>
            </>
          )}

          <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Active in stock counts</Text>
          <Pressable style={styles.toggleRow} onPress={() => setEditActive(!editActive)}>
            <View style={[styles.toggle, editActive && styles.toggleOn]}>
              <View style={[styles.toggleKnob, editActive && styles.toggleKnobOn]} />
            </View>
            <Text style={styles.toggleLabel}>{editActive ? "Active — shown in counts & deliveries" : "Inactive — hidden from counts"}</Text>
          </Pressable>

          {/* POS Link section */}
          <Text style={[styles.fieldLabel, { marginTop: 20 }]}>Square POS Link</Text>
          {pendingVarId ? (
            <View style={styles.posLinkedBadge}>
              <Ionicons name="link" size={14} color="#22C55E" />
              <Text style={styles.posLinkedText} numberOfLines={1}>{pendingVarName}</Text>
              <Pressable onPress={() => { setPendingVarId(null); setPendingVarName(null); }} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color="#EF4444" />
              </Pressable>
            </View>
          ) : (
            <Text style={styles.fieldHint}>Not linked — sales won't appear in the reconciliation report</Text>
          )}
          <TextInput
            style={[styles.input, { marginTop: 8 }]}
            value={variationSearch}
            onChangeText={setVariationSearch}
            placeholder="Search Square POS items…"
            placeholderTextColor="#666"
          />
          {variationSearch.length > 0 && (
            <View style={styles.variationList}>
              {variationsQuery.isLoading && <ActivityIndicator color={Colors.brand.gold} style={{ margin: 12 }} />}
              {filteredVariations.length === 0 && !variationsQuery.isLoading && (
                <Text style={[styles.fieldHint, { padding: 12 }]}>No matches</Text>
              )}
              {filteredVariations.map((v) => (
                <Pressable
                  key={v.variationId}
                  style={[styles.variationRow, pendingVarId === v.variationId && styles.variationRowSelected]}
                  onPress={() => { setPendingVarId(v.variationId); setPendingVarName(v.displayName); setVariationSearch(""); }}
                >
                  <Text style={styles.variationName}>{v.displayName}</Text>
                  {pendingVarId === v.variationId && <Ionicons name="checkmark-circle" size={16} color="#22C55E" />}
                </Pressable>
              ))}
            </View>
          )}

          <View style={styles.formActions}>
            <Pressable style={styles.cancelBtn} onPress={() => setView("list")}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
            <Pressable style={styles.saveBtn} onPress={handleSave} disabled={patchMutation.isPending}>
              {patchMutation.isPending ? <ActivityIndicator color="#000" /> : <Text style={styles.saveBtnText}>Save</Text>}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ── List view ─────────────────────────────────────────────────────────────
  const grouped = categories.map((c) => ({ cat: c, items: items.filter((i) => i.categoryId === c.id) })).filter((g) => g.items.length > 0);
  const linkedCount = items.filter((i) => i.squareCatalogVariationId).length;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      {/* Auto-link banner */}
      <View style={styles.posLinkBanner}>
        <View style={{ flex: 1 }}>
          <Text style={styles.posLinkBannerTitle}>Square POS Reconciliation</Text>
          <Text style={styles.posLinkBannerSub}>{linkedCount}/{items.length} items linked to Square POS</Text>
        </View>
        <Pressable
          style={styles.autoLinkBtn}
          onPress={() => autoMatchMutation.mutate()}
          disabled={autoMatchMutation.isPending}
        >
          {autoMatchMutation.isPending
            ? <ActivityIndicator color="#000" size="small" />
            : <Text style={styles.autoLinkBtnText}>Auto-Link</Text>}
        </Pressable>
      </View>

      {grouped.map(({ cat, items: catItems }) => (
        <View key={cat.id} style={{ marginBottom: 8 }}>
          <Text style={styles.catHeader}>{cat.name}</Text>
          {catItems.map((item) => (
            <Pressable key={item.id} style={[styles.catalogueRow, !item.active && { opacity: 0.45 }]} onPress={() => handleEdit(item)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.catalogueName}>{item.name}</Text>
                <Text style={styles.catalogueMeta}>
                  {item.containerSize}
                  {item.caseSize ? ` · case of ${item.caseSize}` : ""}
                  {item.servesPerUnit ? ` · ${item.servesPerUnit} pints/keg` : ""}
                </Text>
              </View>
              {item.squareCatalogVariationId
                ? <View style={styles.posLinkedPill}><Ionicons name="link" size={10} color="#22C55E" /><Text style={styles.posLinkedPillText}>POS</Text></View>
                : <View style={styles.posUnlinkedPill}><Text style={styles.posUnlinkedPillText}>No POS</Text></View>}
              <Ionicons name="chevron-forward" size={16} color="#666" style={{ marginLeft: 6 }} />
            </Pressable>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.light.background },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: Colors.light.background },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#1E293B" },
  backBtn: { marginRight: 12 },
  headerTitle: { fontSize: 18, fontWeight: "700", color: Colors.light.text },
  tabBar: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#1E293B" },
  tabItem: { flex: 1, paddingVertical: 10, alignItems: "center" },
  tabItemActive: { borderBottomWidth: 2, borderBottomColor: Colors.brand.gold },
  tabLabel: { fontSize: 12, color: "#888", fontWeight: "500" },
  tabLabelActive: { color: Colors.brand.gold },
  listHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16 },
  listTitle: { fontSize: 16, fontWeight: "700", color: Colors.light.text },
  addBtn: { flexDirection: "row", alignItems: "center", backgroundColor: Colors.brand.gold, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, gap: 4 },
  addBtnText: { fontSize: 13, fontWeight: "700", color: "#000" },
  emptyState: { alignItems: "center", paddingTop: 60, paddingHorizontal: 32 },
  emptyText: { color: Colors.light.text, fontSize: 16, fontWeight: "600", marginTop: 12 },
  emptyHint: { color: "#888", fontSize: 13, textAlign: "center", marginTop: 6 },
  formScroll: { flex: 1, padding: 16 },
  formTitle: { fontSize: 18, fontWeight: "700", color: Colors.light.text, marginBottom: 16 },
  fieldLabel: { fontSize: 13, fontWeight: "600", color: "#AAB4C8", marginBottom: 4, marginTop: 12 },
  fieldHint: { fontSize: 12, color: "#666", marginBottom: 4 },
  input: { backgroundColor: "#111827", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: Colors.light.text, fontSize: 14, borderWidth: 1, borderColor: "#1E293B" },
  catHeader: { fontSize: 11, fontWeight: "700", color: Colors.brand.gold, letterSpacing: 1, marginTop: 16, marginBottom: 6, textTransform: "uppercase" },
  lineRow: { flexDirection: "row", alignItems: "center", marginBottom: 8, gap: 8 },
  lineInfo: { flex: 1 },
  lineName: { fontSize: 13, color: Colors.light.text, fontWeight: "500" },
  lineUnit: { fontSize: 11, color: "#666" },
  qtyInput: { width: 56, backgroundColor: "#111827", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 8, color: Colors.light.text, fontSize: 14, textAlign: "center", borderWidth: 1, borderColor: "#374151" },
  unitTag: { fontSize: 11, color: "#888", width: 48 },
  formActions: { flexDirection: "row", gap: 10, marginTop: 24 },
  cancelBtn: { flex: 1, borderWidth: 1, borderColor: "#374151", borderRadius: 8, paddingVertical: 12, alignItems: "center" },
  cancelBtnText: { color: "#888", fontWeight: "600" },
  saveBtn: { flex: 1, backgroundColor: Colors.brand.gold, borderRadius: 8, paddingVertical: 12, alignItems: "center" },
  saveBtnText: { color: "#000", fontWeight: "700" },
  deliveryCard: { marginHorizontal: 16, marginBottom: 12, backgroundColor: "#0F1B2D", borderRadius: 10, padding: 14, borderWidth: 1, borderColor: "#1E293B" },
  deliveryCardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 },
  deliveryDate: { fontSize: 14, fontWeight: "700", color: Colors.light.text },
  deliverySupplier: { fontSize: 12, color: "#888", marginTop: 2 },
  deliveryCountBadge: { backgroundColor: "#1E3A5F", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  deliveryCountText: { fontSize: 11, color: "#93C5FD", fontWeight: "600" },
  deliveryLine: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3, borderTopWidth: 1, borderTopColor: "#1E293B" },
  deliveryLineName: { fontSize: 13, color: Colors.light.text },
  deliveryLineQty: { fontSize: 13, color: Colors.brand.gold, fontWeight: "600" },
  deliveryNotes: { fontSize: 12, color: "#666", marginTop: 8, fontStyle: "italic" },
  catalogueRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#0F1B2D", borderRadius: 8, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: "#1E293B" },
  catalogueName: { fontSize: 13, fontWeight: "600", color: Colors.light.text },
  catalogueMeta: { fontSize: 11, color: "#666", marginTop: 2 },
  reportTable: { borderRadius: 8, overflow: "hidden", borderWidth: 1, borderColor: "#1E293B" },
  reportHeaderRow: { flexDirection: "row", backgroundColor: "#0F1B2D", paddingVertical: 8 },
  reportRow: { flexDirection: "row", paddingVertical: 8, borderTopWidth: 1, borderTopColor: "#1E293B" },
  reportCell: { paddingHorizontal: 8 },
  reportItemCol: { flex: 1 },
  reportNumCol: { width: 48, textAlign: "center" },
  reportHeader: { fontSize: 11, fontWeight: "700", color: "#AAB4C8" },
  reportItemName: { fontSize: 12, color: Colors.light.text, fontWeight: "500" },
  reportItemUnit: { fontSize: 10, color: "#666" },
  reportNum: { fontSize: 13, color: Colors.light.text, textAlign: "center" },
  reportNeg: { color: "#EF4444" },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 8 },
  toggle: { width: 44, height: 24, borderRadius: 12, backgroundColor: "#374151", justifyContent: "center", padding: 2 },
  toggleOn: { backgroundColor: Colors.brand.gold },
  toggleKnob: { width: 20, height: 20, borderRadius: 10, backgroundColor: "#9CA3AF" },
  toggleKnobOn: { alignSelf: "flex-end", backgroundColor: "#000" },
  toggleLabel: { fontSize: 13, color: Colors.light.text, flex: 1 },
  // POS link styles
  posLinkBanner: { flexDirection: "row", alignItems: "center", backgroundColor: "#0F1B2D", borderRadius: 10, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: "#1E3A5F", gap: 12 },
  posLinkBannerTitle: { fontSize: 13, fontWeight: "700", color: Colors.light.text },
  posLinkBannerSub: { fontSize: 11, color: "#888", marginTop: 2 },
  autoLinkBtn: { backgroundColor: Colors.brand.gold, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  autoLinkBtnText: { fontSize: 13, fontWeight: "700", color: "#000" },
  posLinkedPill: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#14532D", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  posLinkedPillText: { fontSize: 10, color: "#22C55E", fontWeight: "600" },
  posUnlinkedPill: { backgroundColor: "#1F2937", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  posUnlinkedPillText: { fontSize: 10, color: "#6B7280" },
  posLinkedBadge: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#14532D30", borderRadius: 8, padding: 10, borderWidth: 1, borderColor: "#22C55E40" },
  posLinkedText: { flex: 1, fontSize: 13, color: "#22C55E", fontWeight: "500" },
  variationList: { backgroundColor: "#0F1B2D", borderRadius: 8, borderWidth: 1, borderColor: "#1E293B", marginTop: 4, maxHeight: 220, overflow: "hidden" },
  variationRow: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#1E293B", flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  variationRowSelected: { backgroundColor: "#14532D30" },
  variationName: { fontSize: 13, color: Colors.light.text, flex: 1 },
  // Auto-match styles
  autoMatchRow: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#0F1B2D", borderRadius: 8, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: "#1E293B" },
  autoMatchRowSelected: { borderColor: Colors.brand.gold + "60" },
  autoMatchCheck: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: "#374151", alignItems: "center", justifyContent: "center" },
  autoMatchCheckOn: { backgroundColor: Colors.brand.gold, borderColor: Colors.brand.gold },
  autoMatchStock: { fontSize: 13, color: Colors.light.text, fontWeight: "600" },
  autoMatchSquare: { fontSize: 12, color: "#888", marginTop: 2 },
  autoMatchScore: { fontSize: 12, fontWeight: "700" },
  // Report extras
  reportNumColWide: { width: 68, textAlign: "center" as const },
  reportSummaryBanner: { flexDirection: "row", alignItems: "center", backgroundColor: "#0F1B2D", borderRadius: 8, padding: 10, marginTop: 12, borderWidth: 1, borderColor: "#1E293B" },
  reportSummaryText: { fontSize: 12, color: "#AAB4C8", flex: 1 },
  varianceLegend: { flexDirection: "row", gap: 12, marginTop: 6, paddingHorizontal: 4, flexWrap: "wrap" as const },
  varianceLegendItem: { fontSize: 10, fontWeight: "600" },
});
