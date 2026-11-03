import React, { useCallback, useEffect, useRef, useState, useMemo } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Platform,
  ActivityIndicator,
  Alert,
  TextInput,
  Linking,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useResponsive } from "@/hooks/useResponsive";
import { router } from "expo-router";
import { useColors } from "@/hooks/useColors";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import {
  CustomerAccount,
  HISTORY_LIMITS,
  LinkCandidate,
  currentMembership,
  formatDate,
  formatPence,
  orderItemsSummary,
  parseApiError,
  planOptions,
  recurringChangeBlocker,
} from "@/lib/customer-account";

type MembershipBadge = {
  planName: string;
  tier: string;
  color: string | null;
  status: string;
  foodDrinkDiscount: number;
};

type CustomerResult = {
  id?: number;
  name: string;
  phone: string;
  email: string;
  membership?: MembershipBadge | null;
};

type ResetAuditEntry = {
  id: number;
  staffUsername: string;
  customerId: number | null;
  customerEmail: string | null;
  customerName: string | null;
  outcome: string;
  createdAt: string;
};

const OUTCOME_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  sent: { label: "Sent", color: "#065F46", bg: "#D1FAE5" },
  email_not_verified: { label: "Email not verified", color: "#92400E", bg: "#FEF3C7" },
  not_found: { label: "Customer not found", color: "#92400E", bg: "#FEF3C7" },
  send_failed: { label: "Send failed", color: "#991B1B", bg: "#FEE2E2" },
  rate_limited: { label: "Rate limited", color: "#92400E", bg: "#FEF3C7" },
  rate_limited_recent_send: { label: "Throttled (recent send)", color: "#92400E", bg: "#FEF3C7" },
  error: { label: "Error", color: "#991B1B", bg: "#FEE2E2" },
};

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function AdminCustomersScreen() {
  const { Colors, styles } = useAdminTheme();
  const insets = useSafeAreaInsets();
  const { tabletPad } = useResponsive();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;
  const { isAuthenticated, isLoading: authLoading, isManager } = useStaffAuth();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CustomerResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [resettingEmail, setResettingEmail] = useState<string | null>(null);
  const [history, setHistory] = useState<ResetAuditEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await apiRequest("GET", "/api/staff/customers/password-reset-history?limit=50");
      const data: ResetAuditEntry[] = await res.json();
      setHistory(Array.isArray(data) ? data : []);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated && isManager) {
      loadHistory();
    }
  }, [isAuthenticated, isManager, loadHistory]);

  const runSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults([]);
      setSearched(false);
      return;
    }
    setSearching(true);
    try {
      const res = await apiRequest("GET", `/api/staff/customers/search?q=${encodeURIComponent(q.trim())}`);
      const data = await res.json();
      setResults(Array.isArray(data) ? data : data?.customers || []);
      setSearched(true);
    } catch {
      setResults([]);
      setSearched(true);
    } finally {
      setSearching(false);
    }
  }, []);

  const onChangeQuery = (text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(text), 300);
  };

  if (authLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.brand.blue} />
      </View>
    );
  }

  if (!isAuthenticated) {
    router.replace("/staff-portal");
    return null;
  }

  const showAlert = (title: string, message: string) => {
    if (Platform.OS === "web") window.alert(`${title}\n\n${message}`);
    else Alert.alert(title, message);
  };

  const confirm = (title: string, message: string, onConfirm: () => void) => {
    if (Platform.OS === "web") {
      if (window.confirm(`${title}\n\n${message}`)) onConfirm();
    } else {
      Alert.alert(title, message, [
        { text: "Cancel", style: "cancel" },
        { text: "Send Reset Email", style: "destructive", onPress: onConfirm },
      ]);
    }
  };

  const triggerReset = async (customer: CustomerResult) => {
    if (!customer.email) {
      showAlert("Cannot Reset", "This customer has no email on file.");
      return;
    }
    setResettingEmail(customer.email);
    try {
      const body: Record<string, unknown> = { email: customer.email };
      if (customer.id) body.customerId = customer.id;
      const res = await apiRequest("POST", "/api/staff/customers/forgot-password", body);
      const data = await res.json().catch(() => ({}));
      showAlert(
        "Reset Email Sent",
        `A password reset link has been emailed to ${data.email || customer.email}. The link is valid for 1 hour.`,
      );
    } catch (err: any) {
      let message = "Could not send the reset email.";
      let code = "";
      try {
        const text = err?.message || "";
        const jsonStart = text.indexOf("{");
        if (jsonStart !== -1) {
          const parsed = JSON.parse(text.slice(jsonStart));
          if (parsed.message) message = parsed.message;
          if (parsed.code) code = parsed.code;
        } else if (text) message = text;
      } catch {
        message = err?.message || message;
      }
      showAlert(code === "EMAIL_NOT_VERIFIED" ? "Email Not Verified" : "Reset Failed", message);
    } finally {
      setResettingEmail(null);
      loadHistory();
    }
  };

  const handleResetPress = (customer: CustomerResult) => {
    confirm(
      "Send Password Reset?",
      `This will email a password reset link to ${customer.email}. The link is valid for 1 hour. The customer's existing password is not changed until they complete the reset.`,
      () => triggerReset(customer),
    );
  };

  if (openId != null) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
        <AccountView id={openId} onBack={() => setOpenId(null)} bottomPad={insets.bottom + webBottomInset + 24} tabletPad={tabletPad} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} testID="back-btn">
          <Ionicons name="chevron-back" size={24} color={Colors.brand.blue} />
        </Pressable>
        <Text style={styles.title}>Customers</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + webBottomInset + 24, marginHorizontal: tabletPad }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.sectionLabel}>FIND A CUSTOMER</Text>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={Colors.light.textSecondary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name, phone, or email"
            placeholderTextColor={Colors.light.textSecondary}
            value={query}
            onChangeText={onChangeQuery}
            autoCapitalize="none"
            autoCorrect={false}
            testID="customer-search-input"
          />
          {searching ? <ActivityIndicator size="small" color={Colors.brand.blue} /> : null}
        </View>

        <Text style={styles.helperText}>
          Open a customer to see bookings, orders, membership and billing.{isManager ? " Managers can also send a password reset to a verified email." : ""}
        </Text>

        {searched && results.length === 0 && !searching ? (
          <View style={styles.emptyBox}>
            <Ionicons name="person-outline" size={28} color={Colors.light.textSecondary} />
            <Text style={styles.emptyText}>No customers match "{query.trim()}"</Text>
          </View>
        ) : null}

        {results.length > 0 ? <Text style={styles.sectionLabel}>RESULTS</Text> : null}
        {results.map((c, idx) => (
          <View key={`${c.email}-${idx}`} style={styles.row} testID={`customer-row-${idx}`}>
            <View style={styles.rowMain}>
              <Text style={styles.rowName}>{c.name}</Text>
              <Text style={styles.rowMeta}>{c.email}</Text>
              {c.phone ? <Text style={styles.rowMeta}>{c.phone}</Text> : null}
              {!c.id ? (
                <Text style={styles.noAccountBadge}>No customer account</Text>
              ) : null}
              {c.membership ? (
                <View style={styles.badgeRow}>
                  <Text
                    style={[
                      styles.membershipBadge,
                      { backgroundColor: c.membership.color || Colors.brand.blue },
                    ]}
                    testID={`membership-badge-${c.id}`}
                  >
                    {c.membership.planName.toUpperCase()}
                    {c.membership.status !== "active" ? ` · ${c.membership.status.toUpperCase()}` : ""}
                    {c.membership.foodDrinkDiscount > 0 ? ` · ${c.membership.foodDrinkDiscount}%` : ""}
                  </Text>
                </View>
              ) : c.id ? (
                <Text style={styles.noMembershipBadge}>No membership</Text>
              ) : null}
            </View>
            <View style={{ gap: 8 }}>
            {c.id ? (
              <Pressable
                onPress={() => setOpenId(c.id!)}
                style={({ pressed }) => [styles.openBtn, pressed ? { opacity: 0.85 } : null]}
                accessibilityRole="button"
                accessibilityLabel={`Open account for ${c.name}`}
                testID={`open-account-${idx}`}
              >
                <Text style={styles.openBtnText}>Open account</Text>
                <Ionicons name="chevron-forward" size={14} color={Colors.brand.blue} />
              </Pressable>
            ) : null}
            {isManager ? (
            <Pressable
              onPress={() => handleResetPress(c)}
              disabled={resettingEmail === c.email || !c.id}
              style={({ pressed }) => [
                styles.resetBtn,
                !c.id ? styles.resetBtnDisabled : null,
                pressed && c.id ? { opacity: 0.85 } : null,
              ]}
              testID={`reset-btn-${idx}`}
            >
              {resettingEmail === c.email ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="mail-outline" size={16} color="#fff" />
                  <Text style={styles.resetBtnText}>Send Reset</Text>
                </>
              )}
            </Pressable>
            ) : null}
            </View>
          </View>
        ))}

        {isManager ? (<>
        <View style={styles.historyHeader}>
          <Text style={styles.sectionLabel}>RESET HISTORY</Text>
          <Pressable onPress={loadHistory} style={styles.refreshBtn} testID="refresh-history-btn">
            {historyLoading ? (
              <ActivityIndicator size="small" color={Colors.brand.blue} />
            ) : (
              <Ionicons name="refresh" size={16} color={Colors.brand.blue} />
            )}
            <Text style={styles.refreshBtnText}>Refresh</Text>
          </Pressable>
        </View>
        <Text style={styles.helperText}>
          Most recent password resets initiated by managers. Includes the staff member who triggered the reset and the result.
        </Text>

        {!historyLoading && history.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="time-outline" size={28} color={Colors.light.textSecondary} />
            <Text style={styles.emptyText}>No password resets have been sent yet.</Text>
          </View>
        ) : null}

        {history.map((entry) => {
          const meta = OUTCOME_LABELS[entry.outcome] || {
            label: entry.outcome,
            color: Colors.light.text,
            bg: Colors.light.border,
          };
          const displayName = entry.customerName || (entry.customerEmail ?? "Unknown customer");
          return (
            <View key={entry.id} style={styles.historyRow} testID={`history-row-${entry.id}`}>
              <View style={styles.historyTopRow}>
                <Text style={styles.historyName} numberOfLines={1}>
                  {displayName}
                </Text>
                <View style={[styles.outcomeBadge, { backgroundColor: meta.bg }]}>
                  <Text style={[styles.outcomeBadgeText, { color: meta.color }]}>{meta.label}</Text>
                </View>
              </View>
              {entry.customerEmail && entry.customerName ? (
                <Text style={styles.historyMeta}>{entry.customerEmail}</Text>
              ) : null}
              <Text style={styles.historyMeta}>
                By {entry.staffUsername} · {formatTimestamp(entry.createdAt)}
              </Text>
            </View>
          );
        })}
        </>) : null}
      </ScrollView>
    </View>
  );
}

function useAdminTheme() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const Colors = useMemo(() => ({
    light: colors,
    brand: { blue: colors.tint, red: colors.accent, gold: colors.gold, green: "#1B5E20" },
  } as const), [colors]);
  return { Colors, styles };
}

function createStyles(colors: ReturnType<typeof useColors>) {
  const Colors = {
    light: colors,
    brand: { blue: colors.tint, red: colors.accent, gold: colors.gold, green: "#1B5E20" },
  } as const;
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: Colors.light.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
  },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 18, fontWeight: "600", color: Colors.light.text },
  scroll: { flex: 1 },
  scrollContent: { padding: 16 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.light.textSecondary,
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.light.surface,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 12 : 8,
  },
  searchInput: { flex: 1, fontSize: 16, color: Colors.light.text },
  helperText: {
    fontSize: 13,
    color: Colors.light.textSecondary,
    marginTop: 10,
    marginBottom: 16,
    lineHeight: 18,
  },
  emptyBox: {
    alignItems: "center",
    paddingVertical: 32,
    gap: 8,
  },
  emptyText: { color: Colors.light.textSecondary, fontSize: 14 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.light.surface,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    gap: 12,
  },
  rowMain: { flex: 1 },
  rowName: { fontSize: 15, fontWeight: "600", color: Colors.light.text },
  rowMeta: { fontSize: 13, color: Colors.light.textSecondary, marginTop: 2 },
  noAccountBadge: {
    marginTop: 6,
    fontSize: 11,
    color: "#92400E",
    backgroundColor: "#FEF3C7",
    alignSelf: "flex-start",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: "hidden",
  },
  badgeRow: { marginTop: 6, flexDirection: "row" },
  membershipBadge: {
    fontSize: 11,
    fontWeight: "700",
    color: "#fff",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    overflow: "hidden",
    letterSpacing: 0.3,
  },
  noMembershipBadge: {
    marginTop: 6,
    fontSize: 11,
    color: Colors.light.textSecondary,
    alignSelf: "flex-start",
    fontStyle: "italic",
  },
  resetBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.brand.blue,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 110,
    justifyContent: "center",
  },
  openBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, borderWidth: 1, borderColor: Colors.brand.blue, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 8, minWidth: 110 },
  openBtnText: { color: Colors.brand.blue, fontSize: 13, fontWeight: "700" },
  resetBtnDisabled: { backgroundColor: Colors.light.textSecondary, opacity: 0.5 },
  resetBtnText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  historyHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 24,
    marginBottom: 8,
  },
  refreshBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  refreshBtnText: { color: Colors.brand.blue, fontSize: 13, fontWeight: "600" },
  historyRow: {
    backgroundColor: Colors.light.surface,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  historyTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  historyName: { flex: 1, fontSize: 14, fontWeight: "600", color: Colors.light.text },
  historyMeta: { fontSize: 12, color: Colors.light.textSecondary, marginTop: 4 },
  outcomeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  outcomeBadgeText: { fontSize: 11, fontWeight: "600" },
  });
}

type HistTab = "bookings" | "orders" | "audit";

function AccountView({ id, onBack, bottomPad, tabletPad }: { id: number; onBack: () => void; bottomPad: number; tabletPad: number }) {
  const { Colors, styles } = useAdminTheme();
  const a = useMemo(() => createAccountStyles(Colors.light, Colors.brand.blue), [Colors]);
  const { isManager } = useStaffAuth();
  const [data, setData] = useState<CustomerAccount | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [flash, setFlash] = useState<string | null>(null);
  const [tab, setTab] = useState<HistTab>("bookings");
  const [planId, setPlanId] = useState<number | null>(null);
  const [freq, setFreq] = useState<"monthly" | "annual">("monthly");
  const [reason, setReason] = useState("");
  const [terms, setTerms] = useState(false);
  const [authd, setAuthd] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [linkKey, setLinkKey] = useState<string | null>(null);
  const [linkReason, setLinkReason] = useState("");
  const [linkIdOk, setLinkIdOk] = useState(false);
  const [linkErr, setLinkErr] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest("GET", `/api/staff/customers/${id}/account`);
      setData(await res.json());
    } catch (e) {
      setError(parseApiError(e, "Could not load this account."));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const opts = useMemo(() => (data ? planOptions(data) : []), [data]);
  const chosen = opts.find((o) => o.plan.id === planId) || null;
  const blocker = data ? recurringChangeBlocker(data) : null;
  const sub = data?.billing?.subscription || null;
  const membership = data ? currentMembership(data.memberships) : null;

  const ask = (title: string, msg: string, onOk: () => void) => {
    if (Platform.OS === "web") { if (window.confirm(`${title}\n\n${msg}`)) onOk(); }
    else Alert.alert(title, msg, [{ text: "Cancel", style: "cancel" }, { text: "Confirm", onPress: onOk }]);
  };

  const submit = () => {
    setFormErr(null);
    if (!chosen || chosen.blockedReason || !sub) return setFormErr("Choose an available plan.");
    if (!reason.trim()) return setFormErr("Enter a reason for the change.");
    if (!terms || !authd) return setFormErr("Both customer confirmations are required.");
    const price = freq === "annual" ? `${formatPence(chosen.plan.annualPence)}/year` : `${formatPence(chosen.plan.monthlyPence)}/month`;
    ask(
      "Confirm plan change",
      `${data!.customer.name}: ${sub.currentTier || "current plan"} to ${chosen.plan.name} at ${price}.\n${chosen.isDowngrade ? `Takes effect at next renewal (${formatDate(sub.renewalDate)}).` : "Applied via Square."}\n\nReason: ${reason.trim()}`,
      async () => {
        setSubmitting(true);
        try {
          const subId = sub.id ?? membership?.id;
          const res = await apiRequest("POST", `/api/staff/membership/subscriptions/${subId}/change-plan`, {
            planId: chosen.plan.id, billingFrequency: freq, termsAccepted: true, customerAuthorised: true, reason: reason.trim(),
          });
          const j = await res.json().catch(() => ({}));
          setFlash(j?.message || `Plan change to ${chosen.plan.name} submitted.`);
          setPlanId(null); setReason(""); setTerms(false); setAuthd(false);
          await load();
        } catch (e) {
          setFormErr(`Change not made: ${parseApiError(e, "request failed")}`);
        } finally {
          setSubmitting(false);
        }
      },
    );
  };

  const linkRecord = (c: LinkCandidate) => {
    setLinkErr(null);
    if (!linkIdOk) return setLinkErr("Confirm the customer's identity first.");
    if (!linkReason.trim()) return setLinkErr("Enter a reason.");
    ask("Link record?", `Link ${c.kind} #${c.id} to ${data?.customer.name || "this customer"}? This does not merge accounts.`, async () => {
      setLinking(true);
      try {
        await apiRequest("POST", `/api/staff/customers/${id}/link-record`, { kind: c.kind, recordId: c.id, confirmed: true, reason: linkReason.trim() });
        setFlash(`${c.kind === "order" ? "Order" : "Booking"} #${c.id} linked.`);
        setLinkKey(null); setLinkReason(""); setLinkIdOk(false);
        await load();
      } catch (e) {
        setLinkErr(`Not linked: ${parseApiError(e, "request failed")}`);
      } finally {
        setLinking(false);
      }
    });
  };

  const openMembershipSite = async () => {
    try {
      await Linking.openURL(new URL("/widget/membership", getApiUrl()).toString());
    } catch (e) {
      setFormErr(`Could not open the membership website: ${parseApiError(e, "unknown error")}`);
    }
  };

  const Check = ({ on, set, label }: { on: boolean; set: (v: boolean) => void; label: string }) => (
    <Pressable onPress={() => set(!on)} style={a.check} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
      <Ionicons name={on ? "checkbox" : "square-outline"} size={20} color={Colors.brand.blue} />
      <Text style={a.checkText}>{label}</Text>
    </Pressable>
  );

  return (
    <>
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.backBtn} accessibilityLabel="Back to search" testID="account-back">
          <Ionicons name="chevron-back" size={24} color={Colors.brand.blue} />
        </Pressable>
        <Text style={styles.title}>Customer account</Text>
        <Pressable onPress={load} style={styles.backBtn} accessibilityLabel="Refresh">
          <Ionicons name="refresh" size={20} color={Colors.brand.blue} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPad, marginHorizontal: tabletPad }]} keyboardShouldPersistTaps="handled">
        {loading && !data ? (
          <View style={{ gap: 10 }}>{[0, 1, 2].map((i) => <View key={i} style={a.skel} />)}</View>
        ) : error ? (
          <View style={a.card}>
            <Text style={a.err}>{error}</Text>
            <Pressable onPress={load} style={a.secondaryBtn}><Text style={a.secondaryBtnText}>Retry</Text></Pressable>
          </View>
        ) : data ? (
          <>
            <View style={a.hero}>
              <Text style={a.heroName}>{data.customer.name || "Unnamed customer"}</Text>
              <Text style={a.heroMeta}>{data.customer.email || "No email"}</Text>
              <Text style={a.heroMeta}>{data.customer.phone || "No phone"} · since {formatDate(data.customer.createdAt)}</Text>
            </View>
            {flash ? <Text style={[a.notice, a.ok]}>{flash}</Text> : null}

            <View style={a.card}>
              <Text style={a.cardTitle}>Membership</Text>
              {membership ? (
                <View style={a.kvWrap}>
                  <KV a={a} k="Plan" v={membership.planName} />
                  <KV a={a} k="Status" v={membership.status} />
                  <KV a={a} k="Source" v={membership.source || "—"} />
                  <KV a={a} k="Period ends" v={formatDate(membership.currentPeriodEnd)} />
                  {membership.prepaidUntilDate ? <KV a={a} k="Prepaid until" v={formatDate(membership.prepaidUntilDate)} /> : null}
                </View>
              ) : null}
              {sub && !blocker ? (
                <View style={a.kvWrap}>
                  <KV a={a} k="Monthly" v={formatPence(sub.currentMonthlyPence)} />
                  <KV a={a} k="Minimum term ends" v={formatDate(sub.commitmentEndDate)} />
                  <KV a={a} k="Next renewal" v={formatDate(sub.renewalDate)} />
                </View>
              ) : null}
              {sub?.pendingPlanName ? <Text style={[a.notice, a.info]}>Scheduled: moves to {sub.pendingPlanName} on {formatDate(sub.pendingDate)}.</Text> : null}
              {blocker ? (
                <>
                  <Text style={[a.notice, data.billingError ? a.errBox : a.warn]}>{blocker}</Text>
                  {!data.billingError ? (
                    <Pressable onPress={openMembershipSite} style={a.secondaryBtn} accessibilityRole="link">
                      <Text style={a.secondaryBtnText}>Open membership website</Text>
                    </Pressable>
                  ) : null}
                  {formErr ? <Text style={[a.notice, a.errBox]}>{formErr}</Text> : null}
                  {false ? (<View />
                  ) : null}
                </>
              ) : (
                <>
                  <Text style={a.label}>CHANGE PLAN</Text>
                  {opts.map((o) => (
                    <Pressable
                      key={o.plan.id}
                      disabled={!!o.blockedReason}
                      onPress={() => { setPlanId(o.plan.id); setFreq("monthly"); }}
                      style={[a.plan, planId === o.plan.id && a.planOn, o.blockedReason ? { opacity: 0.5 } : null]}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: planId === o.plan.id, disabled: !!o.blockedReason }}
                    >
                      <Text style={a.planName}>{o.plan.name}</Text>
                      <Text style={a.planMeta}>
                        {formatPence(o.plan.monthlyPence)}/month{o.plan.annualPence ? ` · ${formatPence(o.plan.annualPence)}/year` : ""} · min term {o.plan.minimumTermMonths ? `${o.plan.minimumTermMonths} months` : "none"}
                      </Text>
                      <Text style={a.planTag}>{o.blockedReason || (o.isDowngrade ? "DOWNGRADE · NEXT RENEWAL" : "UPGRADE")}</Text>
                    </Pressable>
                  ))}
                  {chosen && !chosen.blockedReason ? (
                    <View style={{ marginTop: 6 }}>
                      {chosen.plan.annualPence ? (
                        <View style={a.freqRow}>
                          {(["monthly", "annual"] as const).map((f) => (
                            <Pressable key={f} onPress={() => setFreq(f)} style={[a.freq, freq === f && a.planOn]}>
                              <Text style={a.planName}>{f === "monthly" ? `Monthly ${formatPence(chosen.plan.monthlyPence)}` : `Annual ${formatPence(chosen.plan.annualPence)}`}</Text>
                            </Pressable>
                          ))}
                        </View>
                      ) : null}
                      <Text style={[a.notice, a.info]}>
                        {chosen.isDowngrade
                          ? `Downgrade scheduled for next renewal (${formatDate(sub?.renewalDate)}). Current benefits continue until then.`
                          : "Upgrade billed through the existing Square subscription."}
                      </Text>
                      <TextInput
                        value={reason}
                        onChangeText={setReason}
                        placeholder="Reason (required)"
                        placeholderTextColor={Colors.light.textSecondary}
                        style={a.input}
                        multiline
                        maxLength={500}
                        accessibilityLabel="Reason for plan change"
                      />
                      <Check on={terms} set={setTerms} label="Customer was shown the price and minimum term and accepts the membership terms." />
                      <Check on={authd} set={setAuthd} label="Customer has personally authorised this change to their recurring payment." />
                      {formErr ? <Text style={[a.notice, a.errBox]}>{formErr}</Text> : null}
                      <Pressable onPress={submit} disabled={submitting} style={[styles.resetBtn, { marginTop: 6 }]}>
                        {submitting ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.resetBtnText}>Review and confirm change</Text>}
                      </Pressable>
                    </View>
                  ) : null}
                </>
              )}
            </View>

            {data.linking?.message ? <Text style={[a.notice, a.info]}>{data.linking.message}</Text> : null}
            {data.linking?.candidates?.length ? (
              isManager && data.linking.canReview ? (
                <View style={a.card}>
                  <Text style={a.cardTitle}>Unlinked records to review</Text>
                  <Text style={a.limit}>Links one record at a time. Accounts are never merged.</Text>
                  {data.linking.candidates.map((c) => {
                    const key = `${c.kind}-${c.id}`;
                    const open = linkKey === key;
                    return (
                      <View key={key} style={a.histRow}>
                        <Pressable onPress={() => { setLinkKey(open ? null : key); setLinkReason(""); setLinkIdOk(false); setLinkErr(null); }} accessibilityRole="button" accessibilityState={{ expanded: open }}>
                          <Text style={a.histMain}>{c.kind === "order" ? "Order" : "Booking"} #{c.id} · {formatDate(c.date)}</Text>
                          <Text style={a.histSub}>{c.label}{open ? "" : " · Tap to review"}</Text>
                        </Pressable>
                        {open ? (
                          <View style={{ marginTop: 8 }}>
                            <Check on={linkIdOk} set={setLinkIdOk} label={`I have confirmed with the customer that this ${c.kind} is theirs (name and contact details checked).`} />
                            <TextInput value={linkReason} onChangeText={setLinkReason} placeholder="Reason (required)" placeholderTextColor={Colors.light.textSecondary} style={a.input} multiline maxLength={500} accessibilityLabel="Reason for linking" />
                            {linkErr ? <Text style={[a.notice, a.errBox]}>{linkErr}</Text> : null}
                            <Pressable onPress={() => linkRecord(c)} disabled={linking} style={[styles.resetBtn, { alignSelf: "flex-start" }]}>
                              {linking ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.resetBtnText}>Link record</Text>}
                            </Pressable>
                          </View>
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              ) : (
                <Text style={[a.notice, a.warn]}>{data.linking.candidates.length} unlinked record(s) share this email. A manager can review them.</Text>
              )
            ) : null}

            <View style={a.card}>
              <View style={a.tabs}>
                {(["bookings", "orders", "audit"] as HistTab[]).map((t) => (
                  <Pressable key={t} onPress={() => setTab(t)} style={[a.tab, tab === t && a.tabOn]} accessibilityRole="tab" accessibilityState={{ selected: tab === t }}>
                    <Text style={[a.tabText, tab === t && { color: Colors.brand.blue }]}>
                      {t === "audit" ? "Activity" : t[0].toUpperCase() + t.slice(1)} ({(data[t] || []).length})
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Text style={a.limit}>Showing up to the {HISTORY_LIMITS[tab]} most recent.</Text>
              {(data[tab] || []).length === 0 ? <Text style={a.limit}>Nothing recorded yet.</Text> : null}
              {tab === "bookings" && data.bookings.map((b) => (
                <View key={b.id} style={a.histRow}>
                  <Text style={a.histMain}>{formatDate(b.date)} · {b.startTime}{b.duration ? ` · ${b.duration} min` : ""}</Text>
                  <Text style={a.histSub}>{b.tableType} {b.tableNumber ?? ""} · {b.status}{b.notes ? ` · ${b.notes}` : ""}</Text>
                </View>
              ))}
              {tab === "orders" && data.orders.map((o) => (
                <View key={o.id} style={a.histRow}>
                  <Text style={a.histMain}>{formatTimestamp(o.createdAt)} · {formatPence(o.totalPence)}</Text>
                  <Text style={a.histSub}>{orderItemsSummary(o.itemsJson)} · {o.paymentMethod || "—"} · {o.status}</Text>
                </View>
              ))}
              {tab === "audit" && data.audit.map((x) => (
                <View key={x.id} style={a.histRow}>
                  <Text style={a.histMain}>{String(x.action).replace(/_/g, " ")}</Text>
                  <Text style={a.histSub}>{x.staffUsername || "system"} · {formatTimestamp(x.createdAt)}{x.note ? ` · ${x.note}` : ""}</Text>
                </View>
              ))}
            </View>
          </>
        ) : null}
      </ScrollView>
    </>
  );
}

function KV({ a, k, v }: { a: ReturnType<typeof createAccountStyles>; k: string; v: string }) {
  return (
    <View style={a.kv}>
      <Text style={a.kvK}>{k.toUpperCase()}</Text>
      <Text style={a.kvV}>{v}</Text>
    </View>
  );
}

function createAccountStyles(c: ReturnType<typeof useColors>, blue: string) {
  return StyleSheet.create({
    hero: { backgroundColor: "#0A1628", borderRadius: 14, padding: 18, marginBottom: 12 },
    heroName: { color: "#F5EBD3", fontSize: 21, fontWeight: "800" },
    heroMeta: { color: "rgba(245,235,211,0.7)", fontSize: 13, marginTop: 3 },
    card: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 12, padding: 14, marginBottom: 12 },
    cardTitle: { fontSize: 15, fontWeight: "800", color: c.text, marginBottom: 8 },
    kvWrap: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 8 },
    kv: { minWidth: 130 },
    kvK: { fontSize: 10, fontWeight: "700", color: c.textSecondary, letterSpacing: 0.6 },
    kvV: { fontSize: 14, fontWeight: "600", color: c.text },
    label: { fontSize: 11, fontWeight: "700", color: c.textSecondary, letterSpacing: 0.6, marginTop: 8, marginBottom: 6 },
    notice: { fontSize: 13, lineHeight: 19, padding: 10, borderRadius: 8, marginVertical: 6, overflow: "hidden" },
    ok: { backgroundColor: "#DCFCE7", color: "#14532D" },
    info: { backgroundColor: "#E6EEF9", color: "#003A8C" },
    warn: { backgroundColor: "#FEF3C7", color: "#7C4A03" },
    errBox: { backgroundColor: "#FEE2E2", color: "#991B1B" },
    err: { color: "#991B1B", fontSize: 14, marginBottom: 10 },
    secondaryBtn: { alignSelf: "flex-start", borderWidth: 1, borderColor: blue, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, marginTop: 4 },
    secondaryBtnText: { color: blue, fontWeight: "700", fontSize: 13 },
    plan: { borderWidth: 2, borderColor: c.border, borderRadius: 10, padding: 12, marginBottom: 8 },
    planOn: { borderColor: blue, backgroundColor: "rgba(0,71,171,0.06)" },
    planName: { fontSize: 14, fontWeight: "800", color: c.text },
    planMeta: { fontSize: 12, color: c.textSecondary, marginTop: 2 },
    planTag: { fontSize: 10, fontWeight: "800", color: c.textSecondary, marginTop: 6, letterSpacing: 0.5 },
    freqRow: { flexDirection: "row", gap: 8 },
    freq: { flex: 1, borderWidth: 2, borderColor: c.border, borderRadius: 10, padding: 10 },
    input: { borderWidth: 1, borderColor: c.border, borderRadius: 8, padding: 10, minHeight: 60, color: c.text, fontSize: 15, marginVertical: 6, textAlignVertical: "top" },
    check: { flexDirection: "row", gap: 8, alignItems: "flex-start", marginVertical: 5 },
    checkText: { flex: 1, fontSize: 13, color: c.text, lineHeight: 18 },
    tabs: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: c.border, marginBottom: 6 },
    tab: { paddingVertical: 8, paddingHorizontal: 10, borderBottomWidth: 2, borderBottomColor: "transparent" },
    tabOn: { borderBottomColor: "#D4A843" },
    tabText: { fontSize: 13, fontWeight: "700", color: c.textSecondary },
    limit: { fontSize: 11, color: c.textSecondary, marginVertical: 4 },
    histRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.border },
    histMain: { fontSize: 14, fontWeight: "600", color: c.text },
    histSub: { fontSize: 12, color: c.textSecondary, marginTop: 2 },
    skel: { height: 70, borderRadius: 12, backgroundColor: c.border, opacity: 0.6 },
  });
}
