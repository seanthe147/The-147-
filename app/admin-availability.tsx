import React, { useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  TextInput,
  Platform,
  Alert,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/query-client";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import Colors from "@/constants/colors";
import type { BlockedPeriod } from "@shared/schema";

const TABLE_TYPES = [
  { value: "", label: "All Tables" },
  { value: "snooker", label: "Snooker" },
  { value: "pool", label: "Pool" },
  { value: "dining", label: "Dining" },
  { value: "darts", label: "Darts" },
];

const DAYS_OF_WEEK = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatBlockLabel(b: BlockedPeriod): string {
  const tableStr = b.tableType ? b.tableType.charAt(0).toUpperCase() + b.tableType.slice(1) : "All tables";
  const timeStr =
    b.startTime && b.endTime
      ? ` · ${b.startTime}–${b.endTime}`
      : b.startTime
      ? ` · from ${b.startTime}`
      : b.endTime
      ? ` · until ${b.endTime}`
      : " · All day";
  if (b.date) {
    const d = new Date(b.date + "T00:00:00");
    const dateStr = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
    return `${dateStr}${timeStr} · ${tableStr}`;
  }
  if (b.dayOfWeek != null) {
    return `Every ${DAYS_OF_WEEK.find(d => d.value === b.dayOfWeek)?.label ?? "?"}${timeStr} · ${tableStr}`;
  }
  return tableStr + timeStr;
}

export default function AdminAvailabilityScreen() {
  const insets = useSafeAreaInsets();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const { isAuthenticated, isManager, isOwner, isLoading: authLoading } = useStaffAuth();

  const [mode, setMode] = useState<"date" | "recurring">("date");
  const [date, setDate] = useState("");
  const [dayOfWeek, setDayOfWeek] = useState<number>(1);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [tableType, setTableType] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState("");

  const canManage = isManager || isOwner;

  const { data: blocks = [], isLoading } = useQuery<BlockedPeriod[]>({
    queryKey: ["/api/blocked-periods"],
  });

  const createMutation = useMutation({
    mutationFn: (data: object) => apiRequest("POST", "/api/blocked-periods", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/blocked-periods"] });
      setDate("");
      setStartTime("");
      setEndTime("");
      setTableType("");
      setLabel("");
      setError("");
    },
    onError: (e: any) => setError(e.message ?? "Failed to save"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/blocked-periods/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/blocked-periods"] }),
  });

  const handleCreate = () => {
    setError("");
    if (mode === "date") {
      if (!date.match(/^\d{4}-\d{2}-\d{2}$/)) {
        setError("Date must be in YYYY-MM-DD format (e.g. 2025-12-25)");
        return;
      }
    }
    if (startTime && !startTime.match(/^\d{2}:\d{2}$/)) {
      setError("Start time must be in HH:MM format (e.g. 14:00)");
      return;
    }
    if (endTime && !endTime.match(/^\d{2}:\d{2}$/)) {
      setError("End time must be in HH:MM format (e.g. 18:00)");
      return;
    }
    createMutation.mutate({
      date: mode === "date" ? date : null,
      dayOfWeek: mode === "recurring" ? dayOfWeek : null,
      startTime: startTime || null,
      endTime: endTime || null,
      tableType: tableType || null,
      label: label || null,
    });
  };

  const confirmDelete = (b: BlockedPeriod) => {
    if (Platform.OS === "web") {
      if (window.confirm(`Remove this block?\n\n${formatBlockLabel(b)}${b.label ? "\n" + b.label : ""}`)) {
        deleteMutation.mutate(b.id);
      }
      return;
    }
    Alert.alert(
      "Remove block?",
      formatBlockLabel(b) + (b.label ? "\n" + b.label : ""),
      [
        { text: "Cancel", style: "cancel" },
        { text: "Remove", style: "destructive", onPress: () => deleteMutation.mutate(b.id) },
      ]
    );
  };

  if (authLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.brand.blue} />
      </View>
    );
  }

  if (!isAuthenticated || !canManage) {
    return (
      <View style={[styles.center, { paddingTop: insets.top + webTopInset }]}>
        <Text style={styles.errorText}>Manager access required</Text>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + webTopInset + 16, paddingBottom: insets.bottom + 40 },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.headerBack}>
          <Ionicons name="arrow-back" size={22} color={Colors.brand.navy} />
        </Pressable>
        <Text style={styles.headerTitle}>Availability Blocks</Text>
      </View>

      <Text style={styles.sectionLabel}>ADD NEW BLOCK</Text>

      <View style={styles.card}>
        <View style={styles.modeRow}>
          <Pressable
            style={[styles.modeBtn, mode === "date" && styles.modeBtnActive]}
            onPress={() => setMode("date")}
          >
            <Text style={[styles.modeBtnText, mode === "date" && styles.modeBtnTextActive]}>
              Specific Date
            </Text>
          </Pressable>
          <Pressable
            style={[styles.modeBtn, mode === "recurring" && styles.modeBtnActive]}
            onPress={() => setMode("recurring")}
          >
            <Text style={[styles.modeBtnText, mode === "recurring" && styles.modeBtnTextActive]}>
              Recurring Weekly
            </Text>
          </Pressable>
        </View>

        {mode === "date" ? (
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Date (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.input}
              value={date}
              onChangeText={setDate}
              placeholder="e.g. 2025-12-25"
              placeholderTextColor="#aaa"
              autoCapitalize="none"
            />
          </View>
        ) : (
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Day of Week</Text>
            <View style={styles.dayGrid}>
              {DAYS_OF_WEEK.map(d => (
                <Pressable
                  key={d.value}
                  style={[styles.dayBtn, dayOfWeek === d.value && styles.dayBtnActive]}
                  onPress={() => setDayOfWeek(d.value)}
                >
                  <Text style={[styles.dayBtnText, dayOfWeek === d.value && styles.dayBtnTextActive]}>
                    {DAY_SHORT[d.value]}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        <View style={styles.rowFields}>
          <View style={[styles.field, { flex: 1, marginRight: 8 }]}>
            <Text style={styles.fieldLabel}>Start Time (optional)</Text>
            <TextInput
              style={styles.input}
              value={startTime}
              onChangeText={setStartTime}
              placeholder="e.g. 14:00"
              placeholderTextColor="#aaa"
              autoCapitalize="none"
            />
          </View>
          <View style={[styles.field, { flex: 1 }]}>
            <Text style={styles.fieldLabel}>End Time (optional)</Text>
            <TextInput
              style={styles.input}
              value={endTime}
              onChangeText={setEndTime}
              placeholder="e.g. 18:00"
              placeholderTextColor="#aaa"
              autoCapitalize="none"
            />
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Table Type</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4 }}>
            {TABLE_TYPES.map(t => (
              <Pressable
                key={t.value}
                style={[styles.typeChip, tableType === t.value && styles.typeChipActive]}
                onPress={() => setTableType(t.value)}
              >
                <Text style={[styles.typeChipText, tableType === t.value && styles.typeChipTextActive]}>
                  {t.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Reason / Label (optional)</Text>
          <TextInput
            style={styles.input}
            value={label}
            onChangeText={setLabel}
            placeholder="e.g. Private event, Maintenance..."
            placeholderTextColor="#aaa"
          />
        </View>

        {!!error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorBoxText}>{error}</Text>
          </View>
        )}

        <Pressable
          style={[styles.submitBtn, createMutation.isPending && styles.submitBtnDisabled]}
          onPress={handleCreate}
          disabled={createMutation.isPending}
        >
          {createMutation.isPending ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Ionicons name="ban" size={18} color="#fff" style={{ marginRight: 6 }} />
              <Text style={styles.submitBtnText}>Block This Period</Text>
            </>
          )}
        </Pressable>
      </View>

      <Text style={styles.sectionLabel}>ACTIVE BLOCKS</Text>

      {isLoading ? (
        <ActivityIndicator color={Colors.brand.blue} style={{ marginTop: 20 }} />
      ) : blocks.length === 0 ? (
        <View style={styles.emptyCard}>
          <Ionicons name="checkmark-circle-outline" size={32} color={Colors.brand.green} />
          <Text style={styles.emptyText}>No blocks active — all times are open to bookings</Text>
        </View>
      ) : (
        blocks.map(b => (
          <View key={b.id} style={styles.blockRow}>
            <View style={styles.blockIcon}>
              <Ionicons
                name={b.dayOfWeek != null ? "repeat" : "calendar"}
                size={18}
                color="#DC2626"
              />
            </View>
            <View style={styles.blockInfo}>
              <Text style={styles.blockMain}>{formatBlockLabel(b)}</Text>
              {!!b.label && <Text style={styles.blockSub}>{b.label}</Text>}
            </View>
            <Pressable
              style={styles.deleteBtn}
              onPress={() => confirmDelete(b)}
              disabled={deleteMutation.isPending}
            >
              <Ionicons name="trash-outline" size={18} color="#DC2626" />
            </Pressable>
          </View>
        ))
      )}

      <View style={styles.noteCard}>
        <Ionicons name="information-circle-outline" size={18} color={Colors.brand.blue} style={{ marginRight: 8 }} />
        <Text style={styles.noteText}>
          Dining is automatically restricted to Thursday–Sunday, 12pm–8pm as a business rule.
          Use blocks above for additional closures or event days.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F7FA" },
  content: { padding: 16 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  errorText: { fontSize: 16, color: "#DC2626", marginBottom: 16 },
  backBtn: { backgroundColor: Colors.brand.blue, borderRadius: 8, paddingHorizontal: 20, paddingVertical: 10 },
  backBtnText: { color: "#fff", fontWeight: "600" },

  header: { flexDirection: "row", alignItems: "center", marginBottom: 24 },
  headerBack: { padding: 4, marginRight: 12 },
  headerTitle: { fontSize: 22, fontWeight: "700", color: Colors.brand.navy },

  sectionLabel: {
    fontSize: 11, fontWeight: "700", color: "#8B9AB0",
    letterSpacing: 0.8, marginBottom: 10, marginTop: 4,
  },

  card: {
    backgroundColor: "#fff", borderRadius: 16, padding: 16,
    marginBottom: 20, shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  modeRow: { flexDirection: "row", backgroundColor: "#F1F5FB", borderRadius: 10, padding: 3, marginBottom: 16 },
  modeBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: "center" },
  modeBtnActive: { backgroundColor: "#fff", shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  modeBtnText: { fontSize: 13, fontWeight: "600", color: "#8B9AB0" },
  modeBtnTextActive: { color: Colors.brand.navy },

  field: { marginBottom: 14 },
  fieldLabel: { fontSize: 12, fontWeight: "600", color: "#6B7280", marginBottom: 6 },
  input: {
    borderWidth: 1.5, borderColor: "#E2E8F0", borderRadius: 10,
    padding: 11, fontSize: 14, color: Colors.brand.navy, backgroundColor: "#FAFAFA",
  },
  rowFields: { flexDirection: "row" },

  dayGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  dayBtn: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8,
    borderWidth: 1.5, borderColor: "#E2E8F0", backgroundColor: "#FAFAFA",
  },
  dayBtnActive: { backgroundColor: Colors.brand.blue, borderColor: Colors.brand.blue },
  dayBtnText: { fontSize: 13, fontWeight: "600", color: "#6B7280" },
  dayBtnTextActive: { color: "#fff" },

  typeChip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    borderWidth: 1.5, borderColor: "#E2E8F0", backgroundColor: "#FAFAFA", marginRight: 8,
  },
  typeChipActive: { backgroundColor: Colors.brand.blue, borderColor: Colors.brand.blue },
  typeChipText: { fontSize: 13, fontWeight: "600", color: "#6B7280" },
  typeChipTextActive: { color: "#fff" },

  errorBox: { backgroundColor: "#FEF2F2", borderRadius: 8, padding: 10, marginBottom: 10 },
  errorBoxText: { color: "#DC2626", fontSize: 13 },

  submitBtn: {
    backgroundColor: "#DC2626", borderRadius: 12, paddingVertical: 13,
    flexDirection: "row", justifyContent: "center", alignItems: "center",
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },

  emptyCard: {
    backgroundColor: "#fff", borderRadius: 16, padding: 24,
    alignItems: "center", marginBottom: 16,
  },
  emptyText: { marginTop: 10, color: "#6B7280", fontSize: 14, textAlign: "center" },

  blockRow: {
    backgroundColor: "#fff", borderRadius: 12, padding: 14, marginBottom: 10,
    flexDirection: "row", alignItems: "center",
    shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
  },
  blockIcon: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: "#FEF2F2",
    justifyContent: "center", alignItems: "center", marginRight: 12,
  },
  blockInfo: { flex: 1 },
  blockMain: { fontSize: 13, fontWeight: "600", color: Colors.brand.navy },
  blockSub: { fontSize: 12, color: "#6B7280", marginTop: 2 },
  deleteBtn: { padding: 6 },

  noteCard: {
    flexDirection: "row", backgroundColor: "#EFF6FF", borderRadius: 12, padding: 14,
    marginTop: 8, alignItems: "flex-start",
  },
  noteText: { flex: 1, fontSize: 12, color: Colors.brand.blue, lineHeight: 18 },
});
