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
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useResponsive } from "@/hooks/useResponsive";
import { router } from "expo-router";
import { useColors } from "@/hooks/useColors";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { useStaffAuth } from "@/contexts/StaffAuthContext";

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
      const url = new URL("/api/staff/customers/search", getApiUrl());
      url.searchParams.set("q", q.trim());
      const res = await fetch(url.toString(), { credentials: "include" });
      const data: CustomerResult[] = res.ok ? await res.json() : [];
      setResults(data);
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

  if (!isAuthenticated || !isManager) {
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
          You can send a password reset email to any customer with a verified email address. The link goes to their email on file.
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
          </View>
        ))}

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
