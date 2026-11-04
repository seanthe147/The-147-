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
import { DatePicker } from "@/components/DateTimePickers";
import Colors from "@/constants/colors";
import { useColors } from "@/hooks/useColors";

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

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
  posLinks?: PosLink[];
  active: boolean;
  unitCostPence?: string | null;
  costSource?: string | null;
  costDate?: string | null;
  purchasePacks?: PurchasePack[];
}

interface PurchasePack {
  label: string;
  quantityUnits: number;
  costPence: number | null;
  supplierCode?: string;
}

interface PosLink {
  id?: number;
  squareVariationId: string;
  squareVariationName: string | null;
  soldUnitFactor: number;
}

interface CatalogVariation {
  variationId: string;
  variationName: string;
  itemId?: string;
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
  invoiceLineCostPence?: number | null;
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
  unitCostPence?: string | number | null;
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
  baseUnit: string;
  containerSize: string | null;
  categoryName: string;
  squareLinked: boolean;
  squareSalesAvailable: boolean;
  squareSalesError: string | null;
  opening: number | null;
  delivered: number;
  closing: number | null;
  consumed: number | null;
  actualPeriodStart: string;
  actualPeriodEnd: string;
  sold: number | null;
  variance: number | null;
  costPerBaseUnitPence?: number | null;
  openingValuePence?: number | null;
  deliveredValuePence?: number | null;
  closingValuePence?: number | null;
  consumedCostPence?: number | null;
  expectedSalesCostPence?: number | null;
  varianceValuePence?: number | null;
  netSalesPence?: number | null;
  grossProfitPence?: number | null;
  grossMarginPercent?: number | null;
  financialWarnings?: string[];
  valuationMethod?: string;
}

// ── Money helpers (all ex VAT; null = unknown, never zero) ──
function costNum(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function fmtPence(v: string | number | null | undefined): string {
  const n = costNum(v);
  if (n === null) return "Unknown";
  const ab = Math.abs(n) / 100;
  const frac = Math.abs(ab * 100 - Math.round(ab * 100)) > 0.0001;
  return `${n < 0 ? "−" : ""}£${ab.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: frac ? 4 : 2 })}`;
}
/** Parses "£1.15" → pence (decimal allowed up to maxDp pound places). null = blank. undefined = invalid. */
function parsePounds(raw: string, maxDp = 2): number | null | undefined {
  const t = raw.trim().replace(/^£/, "").replace(/,/g, "");
  if (t === "") return null;
  if (!new RegExp(`^\\d+(\\.\\d{1,${maxDp}})?$`).test(t)) return undefined;
  const [w, f = ""] = t.split(".");
  return (Number(w) * 10000 + Number((f + "0000").slice(0, 4))) / 100;
}
function poundsInput(v: string | number | null | undefined): string {
  const n = costNum(v);
  if (n === null) return "";
  return (n / 100).toFixed(4).replace(/(\.\d\d\d*?)0+$/, "$1");
}
function knownSum(rows: ReportLine[], key: keyof ReportLine): { sum: number; known: number; total: number } {
  let sum = 0, known = 0;
  rows.forEach((r) => { const v = costNum(r[key] as number | null | undefined); if (v !== null) { sum += v; known += 1; } });
  return { sum, known, total: rows.length };
}
function itemPacks(item: StockItem | undefined): PurchasePack[] {
  return Array.isArray(item?.purchasePacks) ? item!.purchasePacks!.filter((p) => p && Number(p.quantityUnits) > 0) : [];
}
function varianceLabel(v: number | null): string {
  if (v === null) return "Not calculated";
  if (Math.abs(v) < 0.005) return "Balanced";
  return v > 0 ? "Unexplained shortage" : "Unexplained surplus";
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const UNIT_LABEL: Record<string, string> = {
  keg: "keg(s)",
  bottle: "bottle(s)",
  can: "can(s)",
  bib: "BIB(s)",
  case: "case(s)",
};

// ── POS link helpers (multi-size: pint + half count as 1 + 0.5) ──
function deriveSoldFactor(name: string | null | undefined): number {
  return /(\bhalf\b|½|1\/2)/i.test(name ?? "") ? 0.5 : 1;
}
function isDraughtSizeName(name: string | null | undefined): boolean {
  return /(\bpint\b|\bhalf\b|½)/i.test(name ?? "");
}
// Build the link set for a chosen Square variation. If its Square item has a
// half-pint sibling size, link pint + half together; otherwise link just it.
function buildPosLinks(variationId: string, vars: CatalogVariation[]): PosLink[] {
  const chosen = vars.find((v) => v.variationId === variationId);
  if (!chosen) return [{ squareVariationId: variationId, squareVariationName: null, soldUnitFactor: 1 }];
  const siblings = vars.filter((v) => v.itemId && chosen.itemId && v.itemId === chosen.itemId);
  const hasHalf = siblings.some((v) => deriveSoldFactor(v.variationName) === 0.5);
  if (siblings.length > 1 && hasHalf && isDraughtSizeName(chosen.variationName)) {
    return siblings
      .filter((v) => isDraughtSizeName(v.variationName))
      .map((v) => ({ squareVariationId: v.variationId, squareVariationName: v.displayName, soldUnitFactor: deriveSoldFactor(v.variationName) }));
  }
  return [{ squareVariationId: chosen.variationId, squareVariationName: chosen.displayName, soldUnitFactor: deriveSoldFactor(chosen.variationName) }];
}
function itemIsLinked(item: StockItem): boolean {
  return !!((item.posLinks && item.posLinks.length > 0) || item.squareCatalogVariationId);
}
function itemLinkLabel(item: StockItem): string {
  if (item.posLinks && item.posLinks.length) {
    return item.posLinks.map((l) => `${l.squareVariationName ?? "POS"}${Number(l.soldUnitFactor) !== 1 ? ` ×${l.soldUnitFactor}` : ""}`).join(", ");
  }
  return item.squareCatalogVariationName ?? "POS linked";
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

// ── Main Screen ───────────────────────────────────────────────────────────────

type Tab = "deliveries" | "count" | "report" | "catalogue" | "live";

export default function AdminStockScreen() {
  const colors = useColors();
  const styles = React.useMemo(() => createThemedStyles(colors), [colors]);
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
          ? (["deliveries", "count", "report", "catalogue", "live"] as Tab[])
          : (["count"] as Tab[])
        ).map((t) => (
          <Pressable key={t} onPress={() => setTab(t)} style={[styles.tabItem, tab === t && styles.tabItemActive]}>
            <Text style={[styles.tabLabel, tab === t && styles.tabLabelActive]}>
              {t === "deliveries" ? "Deliveries" : t === "count" ? "Stock Count" : t === "report" ? "Report" : t === "live" ? "Live" : "Catalogue"}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Tab content */}
      {tab === "deliveries" && canManage && <DeliveriesTab items={items} categories={categories} />}
      {tab === "count" && <CountTab items={items} categories={categories} />}
      {tab === "report" && canManage && <ReportTab categories={categories} />}
      {tab === "catalogue" && canManage && <CatalogueTab items={items} categories={categories} />}
      {tab === "live" && canManage && <LiveStockTab />}
    </View>
  );
}

function LiveStockTab() {
  const query = useQuery<{ updatedAt: string; items: { id: number; name: string; remaining: number | null; unit: string; issue: string | null }[] }>({
    queryKey: ["/api/stock/live"], refetchInterval: 300_000, staleTime: 0, refetchOnMount: "always",
  });
  const colors = useColors();
  return <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
    <Text style={{ color: colors.text }}>Estimated stock: latest count + deliveries − completed Square sales. Updates every five minutes while open. Excludes unrecorded wastage.</Text>
    {query.isLoading && <ActivityIndicator />}
    {query.isError && <Text style={{ color: "#DC2626" }}>Unable to refresh stock. {query.error.message}</Text>}
    {query.data && <Text style={{ color: colors.text }}>Last checked: {new Date(query.data.updatedAt).toLocaleString("en-GB")}</Text>}
    {query.data?.items.map(item => <View key={item.id} style={{ paddingVertical: 8 }}>
      <Text style={{ color: colors.text, fontWeight: "700" }}>{item.name}</Text>
      <Text style={{ color: colors.text }}>{item.issue ?? `${item.remaining} ${item.unit}${(item.remaining ?? 0) < 0 ? " — check count or product links" : ""}`}</Text>
    </View>)}
  </ScrollView>;
}

// ── Deliveries Tab ────────────────────────────────────────────────────────────

function DeliveriesTab({ items, categories }: { items: StockItem[]; categories: StockCategory[] }) {
  const colors = useColors();
  const styles = React.useMemo(() => createThemedStyles(colors), [colors]);
  const [showForm, setShowForm] = useState(false);
  const [deliveredAt, setDeliveredAt] = useState(() => localDateStr(new Date()));
  const [supplier, setSupplier] = useState("Molson Coors");
  const [invoiceRef, setInvoiceRef] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Record<number, string>>({});
  const [lineCosts, setLineCosts] = useState<Record<number, string>>({});
  const [linePacks, setLinePacks] = useState<Record<number, number | null>>({});
  const [costTouched, setCostTouched] = useState<Record<number, boolean>>({});

  /** Returns converted count units and a catalogue-based suggested invoice total (pence) for a line. */
  const lineCalc = (item: StockItem, qtyRaw: string, packIdx: number | null | undefined) => {
    const q = parseFloat(qtyRaw);
    if (!(q > 0)) return null;
    const pk = packIdx != null ? itemPacks(item)[packIdx] : undefined;
    const units = pk ? q * Number(pk.quantityUnits) : item.caseSize ? q * item.caseSize : q;
    let suggest: number | null = null;
    if (pk && costNum(pk.costPence) !== null) suggest = costNum(pk.costPence)! * q;
    else if (costNum(item.unitCostPence) !== null) suggest = costNum(item.unitCostPence)! * units;
    return { units: Math.round(units * 10000) / 10000, suggest: suggest === null ? null : Math.round(suggest), pk };
  };
  const refreshSuggestion = (item: StockItem, qtyRaw: string, packIdx: number | null | undefined) => {
    if (costTouched[item.id]) return;
    const c = lineCalc(item, qtyRaw, packIdx);
    setLineCosts((prev) => ({ ...prev, [item.id]: c && c.suggest !== null ? (c.suggest / 100).toFixed(2) : "" }));
  };

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
      setLineCosts({});
      setLinePacks({});
      setCostTouched({});
      setInvoiceRef("");
      setNotes("");
    },
    onError: (e: Error) => Alert.alert("Error", e.message),
  });

  const handleSave = () => {
    const bad: string[] = [];
    const orphan: string[] = [];
    Object.entries(lineCosts).forEach(([id, c]) => {
      const name = items.find((i) => i.id === Number(id))?.name ?? `Item #${id}`;
      const pc = parsePounds(c ?? "");
      if (pc === undefined) bad.push(name);
      else if (pc !== null && !(parseFloat(lines[Number(id)] ?? "") > 0)) orphan.push(name);
    });
    if (bad.length) return Alert.alert("Check invoice £", `Use pounds and pence, e.g. 245.60: ${bad.slice(0, 5).join(", ")}`);
    if (orphan.length) return Alert.alert("Cost without quantity", `Add a quantity or clear the £ for: ${orphan.slice(0, 5).join(", ")}`);
    const lineItems = Object.entries(lines)
      .filter(([, qty]) => qty && parseFloat(qty) > 0)
      .map(([id, qty]) => {
        const item = items.find((i) => i.id === Number(id));
        const pc = parsePounds(lineCosts[Number(id)] ?? "");
        const invoiceLineCostPence = pc === null || pc === undefined ? null : Math.round(pc);
        const packIdx = linePacks[Number(id)];
        const pk = packIdx != null ? itemPacks(item)[packIdx] : undefined;
        // Pack chosen: convert to count units client-side and send units only (never cases too).
        if (pk) return { stockItemId: Number(id), quantityUnits: String(Math.round(parseFloat(qty) * Number(pk.quantityUnits) * 10000) / 10000), invoiceLineCostPence };
        // Case-packed items are entered in cases; the server multiplies by caseSize.
        if (item?.caseSize) return { stockItemId: Number(id), quantityCases: qty, invoiceLineCostPence };
        return { stockItemId: Number(id), quantityUnits: qty, invoiceLineCostPence };
      });
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

          <Text style={styles.fieldLabel}>Arrived</Text>
          <DatePicker value={deliveredAt} onChange={setDeliveredAt} placeholder="Select delivery date" />
          <Text style={styles.fieldHint}>Backdate if logging after the fact</Text>

          <Text style={styles.fieldLabel}>Supplier</Text>
          <TextInput style={styles.input} value={supplier} onChangeText={setSupplier} placeholderTextColor="#666" />

          <Text style={styles.fieldLabel}>Invoice / Delivery Note Ref</Text>
          <TextInput style={styles.input} value={invoiceRef} onChangeText={setInvoiceRef} placeholderTextColor="#666" placeholder="Optional" />

          <Text style={styles.fieldLabel}>Notes</Text>
          <TextInput style={[styles.input, { height: 64 }]} value={notes} onChangeText={setNotes} multiline placeholderTextColor="#666" placeholder="Optional" />

          <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Quantities received</Text>
          <Text style={styles.fieldHint}>Leave blank for items not in this delivery. £ = invoice line TOTAL ex VAT for that product (whole line, not per case). Blank £ stays unknown, not £0.</Text>

          {groupedItems.map(({ cat, items: catItems }) => (
            <View key={cat.id}>
              <Text style={styles.catHeader}>{cat.name}</Text>
              {catItems.map((item) => (
                <React.Fragment key={item.id}>
                <View style={styles.lineRow}>
                  <View style={styles.lineInfo}>
                    <Text style={styles.lineName}>{item.name}</Text>
                    <Text style={styles.lineUnit}>{item.containerSize} · {item.caseSize ? `case of ${item.caseSize}` : UNIT_LABEL[item.countUnit]}</Text>
                  </View>
                  <TextInput
                    style={styles.qtyInput}
                    value={lines[item.id] ?? ""}
                    onChangeText={(v) => { setLines((prev) => ({ ...prev, [item.id]: v })); refreshSuggestion(item, v, linePacks[item.id]); }}
                    accessibilityLabel={`Quantity delivered for ${item.name}`}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor="#555"
                  />
                  <Text style={styles.unitTag}>{item.countUnit === "keg" ? "kegs" : item.caseSize ? "cases" : UNIT_LABEL[item.countUnit]}</Text>
                  <TextInput
                    style={[styles.qtyInput, { width: 76 }]}
                    value={lineCosts[item.id] ?? ""}
                    onChangeText={(v) => { setLineCosts((prev) => ({ ...prev, [item.id]: v })); setCostTouched((prev) => ({ ...prev, [item.id]: true })); }}
                    keyboardType="decimal-pad"
                    placeholder="£ line"
                    placeholderTextColor="#555"
                    accessibilityLabel={`Invoice line total in pounds ex VAT for ${item.name}`}
                  />
                </View>
                {(itemPacks(item).length > 0 || lineCalc(item, lines[item.id] ?? "", linePacks[item.id])) && (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6, paddingHorizontal: 4, paddingBottom: 8 }}>
                    {itemPacks(item).length > 0 && (
                      <>
                        {[{ idx: null as number | null, label: item.caseSize ? `Cases ×${item.caseSize}` : unitWord(item.countUnit, 2) }, ...itemPacks(item).map((pk, i) => ({ idx: i as number | null, label: pk.label }))].map((o) => {
                          const on = (linePacks[item.id] ?? null) === o.idx;
                          return (
                            <Pressable key={String(o.idx)} onPress={() => { setLinePacks((prev) => ({ ...prev, [item.id]: o.idx })); refreshSuggestion(item, lines[item.id] ?? "", o.idx); }}
                              accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={`Enter ${item.name} quantity as ${o.label}`}
                              style={{ paddingHorizontal: 10, paddingVertical: 6, minHeight: 32, borderRadius: 16, borderWidth: 1, borderColor: on ? Colors.brand.gold : colors.border, backgroundColor: on ? Colors.brand.gold : "transparent" }}>
                              <Text style={{ fontSize: 12, fontWeight: "700", color: on ? "#000" : colors.text }}>{o.label}</Text>
                            </Pressable>
                          );
                        })}
                      </>
                    )}
                    {(() => {
                      const c = lineCalc(item, lines[item.id] ?? "", linePacks[item.id]);
                      if (!c) return null;
                      return <Text style={{ fontSize: 12, color: colors.textSecondary }}>= {fmtQty(c.units)} {unitWord(item.countUnit, c.units)}{c.suggest !== null ? ` · suggested ${fmtPence(c.suggest)} (check invoice)` : ""}</Text>;
                    })()}
                  </View>
                )}
                </React.Fragment>
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
                  <Text style={styles.deliveryLineQty}>{l.quantityUnits} {l.countUnit === "keg" ? "kegs" : l.countUnit + "(s)"} · {l.invoiceLineCostPence == null ? "cost unknown" : fmtPence(l.invoiceLineCostPence)}</Text>
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

type CountFilter = "all" | "blank" | "counted" | "zero";
type LineState = "blank" | "counted" | "zero" | "invalid";

function countLineState(raw: string | undefined): LineState {
  const v = (raw ?? "").trim();
  if (v === "") return "blank";
  if (!/^\d*\.?\d+$|^\d+\.$/.test(v)) return "invalid";
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return "invalid";
  return n === 0 ? "zero" : "counted";
}

function fmtQty(q: string | number): string {
  const n = Number(q);
  return Number.isFinite(n) ? String(Math.round(n * 100) / 100) : String(q);
}

function unitWord(unit: string, qty: number): string {
  const map: Record<string, [string, string]> = { keg: ["keg", "kegs"], bottle: ["bottle", "bottles"], can: ["can", "cans"], bib: ["BIB", "BIBs"], case: ["case", "cases"] };
  const m = map[unit];
  return m ? (qty === 1 ? m[0] : m[1]) : unit;
}

const STATE_LABEL: Record<LineState, string> = { blank: "Not counted", counted: "Counted", zero: "Counted as zero", invalid: "Invalid quantity" };
const STATE_COLOR: Record<LineState, string> = { blank: "#94A3B8", counted: "#16A34A", zero: "#D97706", invalid: "#DC2626" };

function CountTab({ items, categories }: { items: StockItem[]; categories: StockCategory[] }) {
  const colors = useColors();
  const styles = React.useMemo(() => createThemedStyles(colors), [colors]);
  const cs = React.useMemo(() => createCountStyles(colors), [colors]);
  const [showForm, setShowForm] = useState(false);
  const [periodStart, setPeriodStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return localDateStr(d);
  });
  const [periodEnd, setPeriodEnd] = useState(() => localDateStr(new Date()));
  const [notes, setNotes] = useState("");
  const [counts, setCounts] = useState<Record<number, string>>({});
  const [draftId, setDraftId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<CountFilter>("all");
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  const countsQuery = useQuery<StockCount[]>({
    queryKey: ["/api/stock/counts"],
    refetchOnMount: "always",
  });

  const buildLines = useCallback(
    () =>
      Object.entries(counts)
        .filter(([, qty]) => (qty ?? "").trim() !== "")
        .map(([id, qty]) => ({ stockItemId: Number(id), quantityUnits: String(Number(qty.trim())) })),
    [counts],
  );

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
      const res = await apiRequest(draftId ? "PATCH" : "POST", draftId ? `/api/stock/counts/${draftId}` : "/api/stock/counts", {
        periodStart: new Date(periodStart).toISOString(),
        periodEnd: new Date(periodEnd).toISOString(),
        notes,
        status: "submitted",
        lines: buildLines(),
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

  // Items on the form: all active items plus any inactive item already saved on this draft.
  const formItems = React.useMemo(
    () => items.filter((i) => i.active || counts[i.id] !== undefined),
    [items, counts],
  );

  const summary = React.useMemo(() => {
    const s = { total: formItems.length, counted: 0, zero: 0, blank: 0, invalid: 0 };
    formItems.forEach((i) => { s[countLineState(counts[i.id])] += 1; });
    return s;
  }, [formItems, counts]);

  const valuePreview = React.useMemo(() => {
    let pence = 0, priced = 0, noCost = 0;
    formItems.forEach((i) => {
      const st = countLineState(counts[i.id]);
      if (st !== "counted" && st !== "zero") return;
      const c = costNum(i.unitCostPence);
      if (c === null) { noCost += 1; return; }
      pence += Number(counts[i.id]) * c; priced += 1;
    });
    return { pence, priced, noCost };
  }, [formItems, counts]);

  const validate = (): boolean => {
    if (!periodStart || !periodEnd) { Alert.alert("Set dates", "Please set period start and end dates."); return false; }
    if (periodStart > periodEnd) { Alert.alert("Invalid dates", "Period end must be on or after the period start."); return false; }
    const bad = formItems.filter((i) => countLineState(counts[i.id]) === "invalid");
    if (bad.length) {
      setFilter("blank");
      Alert.alert("Check quantities", `Quantities must be 0 or more: ${bad.slice(0, 5).map((i) => i.name).join(", ")}${bad.length > 5 ? ` and ${bad.length - 5} more` : ""}`);
      return false;
    }
    if (!buildLines().length) { Alert.alert("Enter quantities", "Enter at least one quantity."); return false; }
    return true;
  };

  const handleSaveDraft = () => {
    if (!validate()) return;
    saveMutation.mutate({ periodStart: new Date(periodStart).toISOString(), periodEnd: new Date(periodEnd).toISOString(), notes, lines: buildLines() });
  };

  const handleSubmit = () => {
    if (!validate()) return;
    Alert.alert(
      "Submit count?",
      `${fmtDate(periodStart)} – ${fmtDate(periodEnd)}\n\nCounted with stock: ${summary.counted}\nCounted as zero: ${summary.zero}\nNot counted (blank): ${summary.blank}\n\nBlank items stay uncounted, not zero. Submitted counts are locked and cannot be edited.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Submit", onPress: () => submitMutation.mutate() },
      ],
    );
  };

  const startNew = () => {
    setDraftId(null);
    setCounts({});
    setNotes("");
    const d = new Date();
    d.setDate(d.getDate() - 7);
    setPeriodStart(localDateStr(d));
    setPeriodEnd(localDateStr(new Date()));
    setSearch("");
    setFilter("all");
    setShowForm(true);
  };

  const editDraft = (c: StockCount) => {
    if (c.status === "submitted") return;
    const next: Record<number, string> = {};
    c.lines.forEach((l) => { next[l.stockItemId] = String(l.quantityUnits); });
    setCounts(next);
    setDraftId(c.id);
    setPeriodStart(c.periodStart.slice(0, 10));
    setPeriodEnd(c.periodEnd.slice(0, 10));
    setNotes(c.notes ?? "");
    setSearch("");
    setFilter("all");
    setShowForm(true);
  };

  const setQty = (id: number, v: string) => setCounts((prev) => ({ ...prev, [id]: v.replace(",", ".") }));
  const setFraction = (id: number, frac: number) =>
    setCounts((prev) => {
      const cur = Number(prev[id]);
      const whole = Number.isFinite(cur) && cur > 0 ? Math.floor(cur) : 0;
      return { ...prev, [id]: String(whole + frac) };
    });
  const addPack = (id: number, units: number) =>
    setCounts((prev) => {
      const cur = Number(prev[id]);
      const base = prev[id] !== undefined && prev[id] !== "" && Number.isFinite(cur) && cur >= 0 ? cur : 0;
      return { ...prev, [id]: String(Math.round((base + Number(units)) * 10000) / 10000) };
    });

  if (showForm) {
    const q = search.trim().toLowerCase();
    const matches = (i: StockItem) => {
      const st = countLineState(counts[i.id]);
      const okF = filter === "all" || (filter === "blank" && (st === "blank" || st === "invalid")) || filter === st;
      const okQ = !q || `${i.name} ${i.supplier ?? ""} ${i.containerSize ?? ""}`.toLowerCase().includes(q);
      return okF && okQ;
    };
    const inactiveSaved = formItems.filter((i) => !i.active);
    const groups = [
      ...categories.map((c) => ({ key: String(c.id), title: c.name, items: formItems.filter((i) => i.active && i.categoryId === c.id) })),
      { key: "inactive", title: "Inactive products on this draft", items: inactiveSaved },
    ].filter((g) => g.items.length > 0);
    const shown = formItems.filter(matches).length;
    const done = summary.counted + summary.zero;
    const pct = summary.total ? done / summary.total : 0;
    const FILTERS: { key: CountFilter; label: string }[] = [
      { key: "all", label: "All" }, { key: "blank", label: "Not counted" }, { key: "counted", label: "Counted" }, { key: "zero", label: "Zero" },
    ];

    return (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView style={styles.formScroll} contentContainerStyle={{ paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
          <Text style={styles.formTitle} accessibilityRole="header">{draftId ? "Continue Draft Count" : "New Stock Count"}</Text>
          <Text style={styles.fieldHint}>Blank means not counted. Type 0 (or tap Mark 0) when an item is out.</Text>

          <Text style={styles.fieldLabel}>Period Start</Text>
          <DatePicker value={periodStart} onChange={setPeriodStart} placeholder="Select start date" />

          <Text style={styles.fieldLabel}>Period End</Text>
          <DatePicker value={periodEnd} onChange={setPeriodEnd} placeholder="Select end date" />

          <Text style={styles.fieldLabel}>Notes</Text>
          <TextInput style={[styles.input, { height: 56 }]} value={notes} onChangeText={setNotes} multiline placeholderTextColor={colors.textSecondary} placeholder="Optional, e.g. end of Sunday shift" accessibilityLabel="Count notes" />

          <View style={cs.guide}>
            <Text style={cs.guideText}><Text style={cs.guideStrong}>Kegs: </Text>count whole kegs, then tap ¼ ½ ¾ for a part-used keg.</Text>
            <Text style={cs.guideText}><Text style={cs.guideStrong}>Bottles & cans: </Text>count singles. Cases are only for deliveries.</Text>
          </View>

          <View style={cs.progressWrap} accessible accessibilityRole="progressbar" accessibilityLabel={`${done} of ${summary.total} counted`} accessibilityValue={{ min: 0, max: summary.total, now: done }}>
            <View style={cs.progressTop}>
              <Text style={cs.progressLabel}>{done} of {summary.total} counted</Text>
              <Text style={cs.progressStats}>{summary.counted} stock · {summary.zero} zero · {summary.blank} blank{summary.invalid ? ` · ${summary.invalid} invalid` : ""}</Text>
            </View>
            <View style={cs.progressTrack}><View style={[cs.progressFill, { width: `${Math.round(pct * 100)}%` }]} /></View>
            <Text style={[cs.progressStats, { marginTop: 6 }]} accessibilityLiveRegion="polite">
              {valuePreview.priced
                ? `Entered value (ex VAT, current cost): ${fmtPence(Math.round(valuePreview.pence))} for ${valuePreview.priced} priced item${valuePreview.priced === 1 ? "" : "s"}${valuePreview.noCost || summary.blank || summary.invalid ? " — partial" : ""}`
                : "Entered value: unknown — no counted items have a cost"}
              {valuePreview.noCost ? ` · ${valuePreview.noCost} without cost` : ""}{summary.blank ? ` · ${summary.blank} not counted` : ""}{summary.invalid ? ` · ${summary.invalid} invalid` : ""}. Cost is captured on submit.
            </Text>
          </View>

          <View style={cs.searchRow}>
            <Ionicons name="search" size={16} color={colors.textSecondary} />
            <TextInput style={cs.searchInput} value={search} onChangeText={setSearch} placeholder="Search product or supplier" placeholderTextColor={colors.textSecondary} accessibilityLabel="Search products" autoCorrect={false} />
            {search ? <Pressable onPress={() => setSearch("")} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear search"><Ionicons name="close-circle" size={18} color={colors.textSecondary} /></Pressable> : null}
          </View>
          <View style={cs.filterRow} accessibilityRole="tablist">
            {FILTERS.map((f) => (
              <Pressable key={f.key} onPress={() => setFilter(f.key)} style={[cs.pill, filter === f.key && cs.pillActive]} accessibilityRole="tab" accessibilityState={{ selected: filter === f.key }}>
                <Text style={[cs.pillText, filter === f.key && cs.pillTextActive]}>{f.label}</Text>
              </Pressable>
            ))}
          </View>
          {shown < summary.total ? <Text style={cs.filterNote}>Showing {shown} of {summary.total}. Hidden quantities are kept and still saved.</Text> : null}

          {groups.map((g) => {
            const visible = g.items.filter(matches);
            if (!visible.length) return null;
            return (
              <View key={g.key}>
                <Text style={styles.catHeader}>{g.title}</Text>
                {visible.map((item) => {
                  const st = countLineState(counts[item.id]);
                  const isKeg = item.countUnit === "keg";
                  const serves = Number(item.servesPerUnit);
                  const meta = [item.containerSize, item.supplier ? `${item.supplier}${item.supplierCode ? ` #${item.supplierCode}` : ""}` : null].filter(Boolean).join(" · ");
                  const hint = isKeg && serves > 0
                    ? `${fmtQty(serves)} pints/keg${st === "counted" ? ` · about ${Math.round(Number(counts[item.id]) * serves)} pints` : ""}`
                    : item.caseSize ? `Count singles (case of ${item.caseSize} is delivery only)`
                    : item.countUnit === "bottle" || item.countUnit === "can" ? "Count singles" : "";
                  return (
                    <View key={item.id} style={[cs.row, { borderLeftColor: STATE_COLOR[st] }]}>
                      <View style={cs.rowMain}>
                        <View style={styles.lineInfo}>
                          <Text style={styles.lineName}>{item.name}</Text>
                          {meta ? <Text style={styles.lineUnit}>{meta}</Text> : null}
                          {!item.active ? <Text style={cs.inactive}>Inactive · saved on this draft</Text> : null}
                          <Text style={[cs.state, { color: STATE_COLOR[st] }]}>{STATE_LABEL[st]}</Text>
                        </View>
                        <TextInput
                          style={[styles.qtyInput, st === "invalid" && { borderColor: STATE_COLOR.invalid }]}
                          value={counts[item.id] ?? ""}
                          onChangeText={(v) => setQty(item.id, v)}
                          keyboardType="decimal-pad"
                          placeholder="—"
                          placeholderTextColor={colors.textSecondary}
                          accessibilityLabel={`${item.name} quantity in ${unitWord(item.countUnit, 2)}`}
                          accessibilityHint={hint || undefined}
                        />
                        <Text style={styles.unitTag}>{unitWord(item.countUnit, 2)}</Text>
                      </View>
                      <View style={cs.rowFoot}>
                        {isKeg && [0.25, 0.5, 0.75].map((f) => (
                          <Pressable key={f} style={cs.chip} onPress={() => setFraction(item.id, f)} accessibilityRole="button" accessibilityLabel={`Set ${f} keg fraction for ${item.name}`}>
                            <Text style={cs.chipText}>{f === 0.25 ? "¼" : f === 0.5 ? "½" : "¾"}</Text>
                          </Pressable>
                        ))}
                        {itemPacks(item).map((pk, pi) => (
                          <Pressable key={`pk${pi}`} style={cs.chip} onPress={() => addPack(item.id, Number(pk.quantityUnits))} accessibilityRole="button" accessibilityLabel={`Add one ${pk.label}, ${pk.quantityUnits} ${unitWord(item.countUnit, Number(pk.quantityUnits))}, to ${item.name}`}>
                            <Text style={cs.chipText}>+ {pk.label}</Text>
                          </Pressable>
                        ))}
                        <Pressable style={cs.chip} onPress={() => setQty(item.id, "0")} accessibilityRole="button" accessibilityLabel={`Mark ${item.name} as zero`}>
                          <Text style={cs.chipText}>Mark 0</Text>
                        </Pressable>
                        {counts[item.id] ? (
                          <Pressable style={cs.chip} onPress={() => setCounts((prev) => { const n = { ...prev }; if (item.active) delete n[item.id]; else n[item.id] = ""; return n; })} accessibilityRole="button" accessibilityLabel={`Clear ${item.name}`}>
                            <Text style={cs.chipText}>Clear</Text>
                          </Pressable>
                        ) : null}
                        {hint ? <Text style={cs.hint}>{hint}</Text> : null}
                      </View>
                    </View>
                  );
                })}
              </View>
            );
          })}
          {shown === 0 ? <Text style={[styles.emptyHint, { textAlign: "center", marginTop: 20 }]}>No products match this search or filter.</Text> : null}

          <View style={styles.formActions}>
            <Pressable style={styles.cancelBtn} accessibilityRole="button" onPress={() => {
              const close = () => { setShowForm(false); setDraftId(null); setCounts({}); };
              if (Object.values(counts).some((v) => v !== "")) Alert.alert("Discard changes?", "Unsaved quantities will be lost.", [{ text: "Keep counting", style: "cancel" }, { text: "Discard", style: "destructive", onPress: close }]);
              else close();
            }}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
            <Pressable style={[styles.saveBtn, { backgroundColor: "#374151" }]} onPress={handleSaveDraft} disabled={saveMutation.isPending} accessibilityRole="button">
              {saveMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={[styles.saveBtnText, { color: "#fff" }]}>Save Draft</Text>}
            </Pressable>
            <Pressable style={styles.saveBtn} onPress={handleSubmit} disabled={submitMutation.isPending} accessibilityRole="button" accessibilityLabel="Review and submit count">
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
        <Pressable style={styles.addBtn} onPress={startNew} accessibilityRole="button">
          <Ionicons name="add" size={18} color="#000" />
          <Text style={styles.addBtnText}>New Count</Text>
        </Pressable>
      </View>

      {countsQuery.isLoading ? (
        <ActivityIndicator color={Colors.brand.gold} style={{ marginTop: 40 }} />
      ) : countsQuery.isError ? (
        <View style={styles.emptyState}>
          <Ionicons name="alert-circle-outline" size={40} color="#DC2626" />
          <Text style={styles.emptyText}>Could not load counts</Text>
          <Pressable style={[styles.addBtn, { marginTop: 12 }]} onPress={() => countsQuery.refetch()} accessibilityRole="button"><Text style={styles.addBtnText}>Retry</Text></Pressable>
        </View>
      ) : !countsQuery.data?.length ? (
        <View style={styles.emptyState}>
          <Ionicons name="list-outline" size={40} color="#444" />
          <Text style={styles.emptyText}>No stock counts yet</Text>
          <Text style={styles.emptyHint}>Tap "New Count" to start your first count</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          {countsQuery.data.map((c) => {
            const submitted = c.status === "submitted";
            const zeros = c.lines.filter((l) => Number(l.quantityUnits) === 0).length;
            const open = !!expanded[c.id];
            return (
              <View key={c.id} style={[styles.deliveryCard, cs.histCard, { borderLeftColor: submitted ? "#16A34A" : "#D97706" }]}>
                <View style={styles.deliveryCardHeader}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={styles.deliveryDate}>{fmtDate(c.periodStart)} – {fmtDate(c.periodEnd)}</Text>
                    <Text style={styles.deliverySupplier}>Counted by {c.countedBy} · {c.lines.length} item{c.lines.length === 1 ? "" : "s"}{zeros ? ` (${zeros} at zero)` : ""}</Text>
                  </View>
                  <View style={[styles.deliveryCountBadge, submitted ? { backgroundColor: "#064E3B" } : { backgroundColor: "#78350F" }]}>
                    <Text style={styles.deliveryCountText}>{submitted ? "Submitted · locked" : "Draft"}</Text>
                  </View>
                </View>
                {c.notes ? <Text style={styles.deliveryNotes}>{c.notes}</Text> : null}
                <View style={cs.histActions}>
                  {c.lines.length ? (
                    <Pressable style={cs.chip} onPress={() => setExpanded((p) => ({ ...p, [c.id]: !p[c.id] }))} accessibilityRole="button" accessibilityState={{ expanded: open }}>
                      <Text style={cs.chipText}>{open ? "Hide quantities" : "View quantities"}</Text>
                    </Pressable>
                  ) : null}
                  {!submitted ? (
                    <Pressable style={[cs.chip, cs.pillActive]} onPress={() => editDraft(c)} accessibilityRole="button" accessibilityLabel="Continue draft count">
                      <Text style={[cs.chipText, cs.pillTextActive]}>Continue draft</Text>
                    </Pressable>
                  ) : null}
                </View>
                {open && c.lines.map((l, idx) => (
                  <View key={idx} style={styles.deliveryLine}>
                    <Text style={styles.deliveryLineName}>{l.itemName}</Text>
                    <Text style={styles.deliveryLineQty}>{fmtQty(l.quantityUnits)} {unitWord(l.countUnit, Number(l.quantityUnits))}</Text>
                  </View>
                ))}
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

function createCountStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    guide: { marginTop: 14, padding: 10, borderLeftWidth: 3, borderLeftColor: colors.tint, backgroundColor: colors.surfaceElevated, borderRadius: 8, gap: 4 },
    guideText: { color: colors.textSecondary, fontSize: 12, lineHeight: 17 },
    guideStrong: { color: colors.text, fontWeight: "700" },
    progressWrap: { marginTop: 14 },
    progressTop: { flexDirection: "row", justifyContent: "space-between", flexWrap: "wrap", gap: 6, marginBottom: 6 },
    progressLabel: { color: colors.text, fontWeight: "800", fontSize: 13 },
    progressStats: { color: colors.textSecondary, fontSize: 12, fontWeight: "600" },
    progressTrack: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceElevated, overflow: "hidden", borderWidth: 1, borderColor: colors.border },
    progressFill: { height: "100%", backgroundColor: "#16A34A" },
    searchRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: colors.input },
    searchInput: { flex: 1, paddingVertical: 10, fontSize: 15, color: colors.text },
    filterRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
    pill: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
    pillActive: { backgroundColor: colors.tint, borderColor: colors.tint },
    pillText: { fontSize: 12, fontWeight: "700", color: colors.textSecondary },
    pillTextActive: { color: "#fff" },
    filterNote: { marginTop: 8, fontSize: 12, fontWeight: "600", color: "#D97706" },
    row: { borderLeftWidth: 4, borderBottomWidth: 1, borderBottomColor: colors.border, paddingLeft: 10, paddingVertical: 8, marginBottom: 4 },
    rowMain: { flexDirection: "row", alignItems: "center", gap: 8 },
    rowFoot: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6, marginTop: 6 },
    chip: { paddingHorizontal: 10, paddingVertical: 6, minHeight: 32, justifyContent: "center", borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
    chipText: { fontSize: 12, fontWeight: "700", color: colors.text },
    hint: { fontSize: 11, color: colors.textSecondary, flexShrink: 1 },
    state: { fontSize: 10, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 },
    inactive: { fontSize: 10, fontWeight: "800", color: "#7C3AED", textTransform: "uppercase", marginTop: 2 },
    histCard: { borderLeftWidth: 4 },
    histActions: { flexDirection: "row", gap: 8, marginTop: 10, flexWrap: "wrap" },
  });
}

// ── Report Tab ────────────────────────────────────────────────────────────────

function ReportTab({ categories }: { categories: StockCategory[] }) {
  const colors = useColors();
  const styles = React.useMemo(() => createThemedStyles(colors), [colors]);
  const [periodStart, setPeriodStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return localDateStr(d);
  });
  const [periodEnd, setPeriodEnd] = useState(() => localDateStr(new Date()));
  const [fetched, setFetched] = useState(false);

  const reportQuery = useQuery<ReportLine[]>({
    queryKey: ["/api/stock/report", periodStart, periodEnd],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/stock/report?periodStart=${encodeURIComponent(periodStart)}&periodEnd=${encodeURIComponent(periodEnd)}`);
      return res.json();
    },
    enabled: fetched && !!periodStart && !!periodEnd,
    refetchOnMount: false,
  });

  const handleRun = () => {
    if (!periodStart || !periodEnd) return Alert.alert("Set dates", "Please enter both a start and end date.");
    if (periodStart >= periodEnd) return Alert.alert("Invalid dates", "The end must be after the start.");
    if (fetched) { void reportQuery.refetch(); return; }
    setFetched(true);
  };

  const data = reportQuery.data ?? [];
  const grouped = categories
    .map((c) => ({ cat: c, lines: shown.filter((l) => l.categoryName === c.name) }))
    .filter((g) => g.lines.length > 0);
  const hasSquareData = data.some((l) => l.squareLinked);
  const linkedCount = data.filter((l) => l.squareLinked).length;
  const squareSalesError = data.find((l) => !l.squareSalesAvailable)?.squareSalesError;
  const [rFilter, setRFilter] = useState<"all" | "shortage" | "surplus" | "incomplete">("all");
  const isIncomplete = (l: ReportLine) => l.opening === null || l.closing === null || l.variance === null || costNum(l.consumedCostPence) === null || costNum(l.varianceValuePence) === null || costNum(l.grossProfitPence) === null || (l.financialWarnings?.length ?? 0) > 0;
  const shown = data.filter((l) => rFilter === "all" ? true : rFilter === "shortage" ? l.variance !== null && l.variance > 0.005 : rFilter === "surplus" ? l.variance !== null && l.variance < -0.005 : isIncomplete(l));
  const totals = ([
    ["openingValuePence", "Opening value"], ["deliveredValuePence", "Delivered value"], ["closingValuePence", "Closing value"],
    ["consumedCostPence", "Consumed cost"], ["netSalesPence", "Net sales"], ["grossProfitPence", "Gross profit"], ["varianceValuePence", "Variance cost (+ shortage)"],
  ] as [keyof ReportLine, string][]).map(([k, label]) => ({ label, ...knownSum(data, k) }));
  const anyMissingTotal = totals.some((t) => t.known < t.total);

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Text style={styles.formTitle}>Stock Reconciliation Report</Text>
      <Text style={styles.fieldHint}>
        Opens + Deliveries − Closing = Used (physical).{"\n"}
        Sold = Square POS units. Variance = Used − Sold.
      </Text>

      <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Period Start</Text>
      <DatePicker value={periodStart} onChange={v => { setPeriodStart(v); setFetched(false); }} placeholder="Select start date" />
      <Text style={styles.fieldLabel}>Period End</Text>
      <DatePicker value={periodEnd} onChange={v => { setPeriodEnd(v); setFetched(false); }} placeholder="Select end date" />
      <Pressable style={[styles.saveBtn, { marginTop: 12, alignSelf: "stretch" }]} onPress={handleRun}>
        <Text style={styles.saveBtnText}>Run Report</Text>
      </Pressable>

      {reportQuery.isLoading && <ActivityIndicator color={Colors.brand.gold} style={{ marginTop: 32 }} />}
      {reportQuery.isError && <Text style={styles.emptyText}>{reportQuery.error.message}</Text>}
      {data.length > 0 && <Text style={styles.fieldHint}>Between counts: {new Date(data[0].actualPeriodStart).toLocaleDateString("en-GB")} – {new Date(data[0].actualPeriodEnd).toLocaleDateString("en-GB")}. Missing quantities are unknown, not zero.</Text>}

      {fetched && !reportQuery.isLoading && !reportQuery.isError && data.length === 0 && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No data for this period</Text>
          <Text style={styles.emptyHint}>You need at least one submitted stock count and some delivery records for this date range.</Text>
        </View>
      )}

      {fetched && data.length > 0 && (
        <>
        {squareSalesError && (
          <View style={[styles.reportSummaryBanner, { borderColor: "#EF4444" }]}>
            <Ionicons name="cloud-offline-outline" size={14} color="#EF4444" />
            <Text style={[styles.reportSummaryText, { color: "#EF4444" }]}> POS sales unavailable: {squareSalesError}. Sold and variance are left blank.</Text>
          </View>
        )}
        <Text style={styles.fieldHint}>All £ ex VAT, periodic weighted average cost. Gross profit uses physically consumed stock cost (shortages reduce it) — a stock margin, not a full P&L. Shortage/surplus is unexplained, not proven wastage.</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginVertical: 8 }}>
          {totals.map((t) => (
            <View key={t.label} style={{ minWidth: 140, flexGrow: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 10, backgroundColor: colors.surface }}>
              <Text style={{ fontSize: 11, color: colors.textSecondary, textTransform: "uppercase" }}>{t.label}</Text>
              <Text style={{ fontSize: 16, fontWeight: "800", color: colors.text, marginTop: 2 }}>{t.known ? fmtPence(Math.round(t.sum)) : "Unknown"}</Text>
              {t.known > 0 && t.known < t.total && <Text style={{ fontSize: 11, color: "#D97706" }}>known {t.known}/{t.total} items only</Text>}
            </View>
          ))}
        </View>
        {anyMissingTotal && <Text style={[styles.fieldHint, { color: "#D97706" }]}>Some items have unknown values. Totals are known-value subtotals, not complete venue totals.</Text>}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 }} accessibilityRole="radiogroup">
          {(["all", "shortage", "surplus", "incomplete"] as const).map((f) => (
            <Pressable key={f} onPress={() => setRFilter(f)} accessibilityRole="radio" accessibilityState={{ selected: rFilter === f }} style={{ paddingHorizontal: 12, paddingVertical: 8, minHeight: 36, borderRadius: 18, borderWidth: 1, borderColor: rFilter === f ? Colors.brand.gold : colors.border, backgroundColor: rFilter === f ? Colors.brand.gold : "transparent" }}>
              <Text style={{ fontSize: 13, fontWeight: "700", color: rFilter === f ? "#000" : colors.text }}>{{ all: "All", shortage: "Shortages", surplus: "Surpluses", incomplete: "Incomplete" }[f]}</Text>
            </Pressable>
          ))}
        </View>
        {shown.length === 0 && <Text style={styles.emptyHint}>No items match this filter.</Text>}
        <View style={styles.reportSummaryBanner}>
          {hasSquareData
            ? <><Ionicons name="link" size={14} color="#22C55E" /><Text style={styles.reportSummaryText}> {linkedCount} of {data.length} items linked to Square POS</Text></>
            : <><Ionicons name="alert-circle-outline" size={14} color="#F59E0B" /><Text style={[styles.reportSummaryText, { color: "#F59E0B" }]}> No items linked to Square POS — link items in the Catalogue tab to see Sold & Variance</Text></>
          }
        </View>
        </>
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
                <Text style={[styles.reportCell, styles.reportNumColWide, styles.reportHeader]}>Used{"\n"}cost</Text>
                <Text style={[styles.reportCell, styles.reportNumColWide, styles.reportHeader]}>Var £</Text>
                <Text style={[styles.reportCell, styles.reportNumColWide, styles.reportHeader]}>Net{"\n"}sales</Text>
                <Text style={[styles.reportCell, styles.reportNumColWide, styles.reportHeader]}>GP</Text>
                <Text style={[styles.reportCell, styles.reportNumColWide, styles.reportHeader]}>Margin</Text>
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
                      <Text style={styles.reportItemUnit}>{l.containerSize} · in {l.baseUnit === "pint" ? "pints" : l.baseUnit} · {fmtPence(l.costPerBaseUnitPence)}/unit</Text>
                      {(l.financialWarnings?.length ?? 0) > 0 && <Text style={[styles.reportItemUnit, { color: "#D97706" }]}>{l.financialWarnings!.join(" · ")}</Text>}
                    </View>
                    <Text style={[styles.reportCell, styles.reportNumCol, styles.reportNum]}>{l.opening ?? "–"}</Text>
                    <Text style={[styles.reportCell, styles.reportNumCol, styles.reportNum]}>{l.delivered}</Text>
                    <Text style={[styles.reportCell, styles.reportNumCol, styles.reportNum]}>{l.closing ?? "–"}</Text>
                    <Text style={[styles.reportCell, styles.reportNumCol, styles.reportNum, l.consumed !== null && l.consumed < 0 ? styles.reportNeg : {}]}>{l.consumed ?? "–"}</Text>
                    <Text style={[styles.reportCell, styles.reportNumColWide, styles.reportNum, { color: l.sold !== null ? Colors.light.text : "#555" }]}>
                      {l.sold !== null ? l.sold : "–"}
                    </Text>
                    <Text style={[styles.reportCell, styles.reportNumColWide, styles.reportNum, { color: varColor, fontWeight: "700" }]}>
                      {l.variance !== null ? (l.variance > 0 ? `+${l.variance}` : String(l.variance)) : "–"}
                    </Text>
                    <Text style={[styles.reportCell, styles.reportNumColWide, styles.reportNum]}>{fmtPence(l.consumedCostPence)}</Text>
                    <Text style={[styles.reportCell, styles.reportNumColWide, styles.reportNum, { color: varColor }]} accessibilityLabel={`${varianceLabel(l.variance)} ${fmtPence(l.varianceValuePence)}`}>{costNum(l.varianceValuePence) !== null && Number(l.varianceValuePence) > 0 ? "+" : ""}{fmtPence(l.varianceValuePence)}</Text>
                    <Text style={[styles.reportCell, styles.reportNumColWide, styles.reportNum]}>{fmtPence(l.netSalesPence)}</Text>
                    <Text style={[styles.reportCell, styles.reportNumColWide, styles.reportNum]}>{fmtPence(l.grossProfitPence)}</Text>
                    <Text style={[styles.reportCell, styles.reportNumColWide, styles.reportNum]}>{l.grossMarginPercent == null ? "Unknown" : `${Math.round(l.grossMarginPercent * 10) / 10}%`}</Text>
                  </View>
                );
              })}
            </View>
          </ScrollView>
          {/* Variance legend */}
          {lines.some((l) => l.squareLinked) && (
            <View style={styles.varianceLegend}>
              <Text style={[styles.varianceLegendItem, { color: "#F59E0B" }]}>+n = unexplained shortage</Text>
              <Text style={[styles.varianceLegendItem, { color: "#22C55E" }]}>0 = perfect</Text>
              <Text style={[styles.varianceLegendItem, { color: "#EF4444" }]}>−n = unexplained surplus</Text>
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
  const colors = useColors();
  const styles = React.useMemo(() => createThemedStyles(colors), [colors]);
  const [view, setView] = useState<CatView>("list");
  const [editItem, setEditItem] = useState<StockItem | null>(null);
  const [editServes, setEditServes] = useState("");
  const [editCost, setEditCost] = useState("");
  const [editCostOrig, setEditCostOrig] = useState("");
  const [editActive, setEditActive] = useState(true);
  // POS link state in edit view
  const [variationSearch, setVariationSearch] = useState("");
  const [pendingVarId, setPendingVarId] = useState<string | null>(null);
  const [pendingVarName, setPendingVarName] = useState<string | null>(null);
  const [pendingLinks, setPendingLinks] = useState<PosLink[]>([]);
  // Auto-match state
  const [autoResults, setAutoResults] = useState<AutoMatchResult[]>([]);
  const [confirmed, setConfirmed] = useState<Record<number, boolean>>({});

  const variationsQuery = useQuery<CatalogVariation[]>({
    queryKey: ["/api/staff/stock/square-variations"],
    staleTime: 10 * 60 * 1000,
  });

  const patchMutation = useMutation({
    mutationFn: async (payload: { id: number; servesPerUnit?: string; active?: boolean; unitCostPence?: string | null; costSource?: string | null; costDate?: string | null }) => {
      const { id, ...body } = payload;
      const res = await apiRequest("PATCH", `/api/stock/items/${id}`, body);
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      return res.json();
    },
    onError: (e: Error) => Alert.alert("Error", e.message),
  });

  const linksMutation = useMutation({
    mutationFn: async ({ id, links }: { id: number; links: PosLink[] }) => {
      const res = await apiRequest("PUT", `/api/staff/stock/items/${id}/square-links`, { links });
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
    const vars = variationsQuery.data ?? [];
    for (const r of toSave) {
      const links = buildPosLinks(r.suggestedVariationId!, vars);
      await linksMutation.mutateAsync({ id: r.stockItemId, links });
    }
    queryClient.invalidateQueries({ queryKey: ["/api/stock/items"] });
    setView("list");
  }, [autoResults, confirmed, variationsQuery.data]);

  const handleEdit = (item: StockItem) => {
    setEditItem(item);
    setEditServes(item.servesPerUnit ?? "");
    setEditCost(poundsInput(item.unitCostPence));
    setEditCostOrig(poundsInput(item.unitCostPence));
    setEditActive(item.active);
    setVariationSearch("");
    setPendingVarId(item.squareCatalogVariationId ?? null);
    setPendingVarName(item.squareCatalogVariationName ?? null);
    setPendingLinks(item.posLinks?.length
      ? item.posLinks.map((link) => ({ ...link, soldUnitFactor: Number(link.soldUnitFactor) }))
      : (item.squareCatalogVariationId ? [{
          squareVariationId: item.squareCatalogVariationId,
          squareVariationName: item.squareCatalogVariationName,
          soldUnitFactor: 1,
        }] : []));
    setView("edit");
  };

  const handleSave = async () => {
    if (!editItem) return;
    if (pendingLinks.some((link) => !Number.isFinite(Number(link.soldUnitFactor)) || Number(link.soldUnitFactor) <= 0)) {
      return Alert.alert("Check POS quantities", "Each sale quantity must be greater than zero.");
    }
    const pc = parsePounds(editCost, 4);
    if (pc === undefined) return Alert.alert("Check cost", "Enter pounds, e.g. 1.15 or 0.9583 (max 4 decimal places).");
    const costPatch = editCost.trim() === editCostOrig.trim() ? {} : {
      unitCostPence: pc === null ? null : String(pc),
      costSource: pc === null ? null : "manual",
      costDate: pc === null ? null : localDateStr(new Date()),
    };
    try {
      await patchMutation.mutateAsync({ id: editItem.id, servesPerUnit: editServes || undefined, active: editActive, ...costPatch });
      await linksMutation.mutateAsync({ id: editItem.id, links: pendingLinks });
      await queryClient.invalidateQueries({ queryKey: ["/api/stock/items"] });
      setView("list");
    } catch {
      // Mutations show the server's error message.
    }
  };

  const selectVariation = (variation: CatalogVariation) => {
    const links = buildPosLinks(variation.variationId, variationsQuery.data ?? []);
    setPendingLinks(links);
    setPendingVarId(variation.variationId);
    setPendingVarName(variation.displayName);
    setVariationSearch("");
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
          <Pressable style={styles.saveBtn} onPress={applyAutoMatch} disabled={applyCount === 0 || linksMutation.isPending}>
            {linksMutation.isPending
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

          <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Default cost per {editItem.countUnit}, £ ex VAT (manual)</Text>
          <TextInput style={styles.input} value={editCost} onChangeText={setEditCost} keyboardType="decimal-pad" placeholder="Blank = unknown" placeholderTextColor="#666" accessibilityLabel={`Cost per ${editItem.countUnit} in pounds ex VAT`} />
          <Text style={styles.fieldHint}>
            Price of ONE {editItem.countUnit}, not a case.{(() => { const p = parsePounds(editCost, 4); return editItem.caseSize && typeof p === "number" ? ` Case of ${editItem.caseSize} ≈ ${fmtPence(p * editItem.caseSize)}.` : ""; })()} New cost applies to counts submitted from now; submitted counts keep their captured cost.
            {editItem.costSource ? ` Current source: ${editItem.costSource}${editItem.costDate ? ` (${fmtDate(editItem.costDate)})` : ""}.` : ""}
            {editItem.purchasePacks?.length ? ` Packs: ${editItem.purchasePacks.map((pk) => `${pk.label} = ${pk.quantityUnits}`).join(", ")} (edit packs on web).` : ""}
          </Text>

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
            <>
              {pendingLinks.map((link, index) => (
                <View key={link.squareVariationId} style={styles.posLinkedBadge}>
                  <Ionicons name="link" size={14} color="#22C55E" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.posLinkedText} numberOfLines={1}>{link.squareVariationName ?? pendingVarName}</Text>
                    <Text style={styles.fieldHint}>One POS sale uses this many {editItem.countUnit === "keg" ? "pints" : editItem.countUnit + "s"}:</Text>
                  </View>
                  <TextInput
                    style={[styles.qtyInput, { width: 62 }]}
                    value={String(link.soldUnitFactor)}
                    onChangeText={(value) => setPendingLinks((current) => current.map((entry, entryIndex) =>
                      entryIndex === index ? { ...entry, soldUnitFactor: Number(value) } : entry
                    ))}
                    keyboardType="decimal-pad"
                    placeholder="1"
                    placeholderTextColor={colors.textSecondary}
                  />
                </View>
              ))}
              <Pressable onPress={() => { setPendingVarId(null); setPendingVarName(null); setPendingLinks([]); }} hitSlop={8}>
                <Text style={[styles.fieldHint, { color: "#EF4444", marginTop: 6 }]}>Remove POS link</Text>
              </Pressable>
            </>
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
                  onPress={() => selectVariation(v)}
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
            <Pressable style={styles.saveBtn} onPress={handleSave} disabled={patchMutation.isPending || linksMutation.isPending}>
              {patchMutation.isPending || linksMutation.isPending ? <ActivityIndicator color="#000" /> : <Text style={styles.saveBtnText}>Save</Text>}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ── List view ─────────────────────────────────────────────────────────────
  const grouped = categories.map((c) => ({ cat: c, items: items.filter((i) => i.categoryId === c.id) })).filter((g) => g.items.length > 0);
  const linkedCount = items.filter((i) => itemIsLinked(i)).length;

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
              {itemIsLinked(item)
                ? <View style={styles.posLinkedPill}><Ionicons name="link" size={10} color="#22C55E" /><Text style={styles.posLinkedPillText}>POS{item.posLinks && item.posLinks.length > 1 ? ` ×${item.posLinks.length}` : ""}</Text></View>
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

const createThemedStyles = (colors: any) => themedStyleSheet({
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
  input: { backgroundColor: colors.input, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: colors.text, fontSize: 14, borderWidth: 1, borderColor: colors.border },
  catHeader: { fontSize: 11, fontWeight: "700", color: Colors.brand.gold, letterSpacing: 1, marginTop: 16, marginBottom: 6, textTransform: "uppercase" },
  lineRow: { flexDirection: "row", alignItems: "center", marginBottom: 8, gap: 8 },
  lineInfo: { flex: 1 },
  lineName: { fontSize: 13, color: Colors.light.text, fontWeight: "500" },
  lineUnit: { fontSize: 11, color: "#666" },
  qtyInput: { width: 56, backgroundColor: colors.input, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 8, color: colors.text, fontSize: 14, textAlign: "center", borderWidth: 1, borderColor: colors.border },
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
}, colors);
function themedStyleSheet(source: any, colors: ReturnType<typeof useColors>) { return StyleSheet.create(themeSource(source, colors)); } function themeSource(source: any, colors: ReturnType<typeof useColors>): any { return Object.fromEntries(Object.entries(source).map(([n,v]: any) => [n,Object.fromEntries(Object.entries(v).map(([k,t]: any)=>[k,themeToken(n,k,t,colors)]))])); } function themeToken(n:string,k:string,t:any,c:ReturnType<typeof useColors>) { if(typeof t!=="string")return t;if(k==="color"&&/^#fff(?:fff)?$/i.test(t))return /btn|button|badge|chip|pill|selected|active|primary|action|cta|fab|submit|save|publish|approve|confirm|complete|clock|gdpr|back|close|filter|tab|preview|retry|claim|redeem|login/i.test(n)?t:c.text;if(k==="color")return ["#0A1628","#132742","#111827","#1E293B","#1F2937","#334155","#374151","#4B5563"].includes(t)?c.text:["#475569","#4B5A72","#64748B","#6B7280","#94A3B8"].includes(t)?c.textSecondary:t;if(/border.*color/i.test(k)&&["#E2E8F0","#E5E7EB","#CBD5E1","#D1D5DB"].includes(t))return c.border;if(/backgroundcolor/i.test(k))return ["#F2F5FA","#F4F7FB","#F8FAFC","#F9FAFB","#F1F5F9"].includes(t)?c.background:["#fff","#FFFFFF"].includes(t)?c.surface:["#0A1628","#132742","#0F172A","#1E293B"].includes(t)?c.surfaceElevated:t;return t;}
