import React, { useCallback, useRef, useState } from "react";
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
import { router } from "expo-router";
import Colors from "@/constants/colors";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { useStaffAuth } from "@/contexts/StaffAuthContext";

type CustomerResult = { id?: number; name: string; phone: string; email: string };

export default function AdminCustomersScreen() {
  const insets = useSafeAreaInsets();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;
  const { isAuthenticated, isLoading: authLoading, isManager } = useStaffAuth();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CustomerResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [resettingEmail, setResettingEmail] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + webBottomInset + 24 }]}
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

        {results.map((c, idx) => (
          <View key={`${c.email}-${idx}`} style={styles.row} testID={`customer-row-${idx}`}>
            <View style={styles.rowMain}>
              <Text style={styles.rowName}>{c.name}</Text>
              <Text style={styles.rowMeta}>{c.email}</Text>
              {c.phone ? <Text style={styles.rowMeta}>{c.phone}</Text> : null}
              {!c.id ? (
                <Text style={styles.noAccountBadge}>No customer account</Text>
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
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
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
});
