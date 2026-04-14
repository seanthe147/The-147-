import React, { useState, useCallback, useRef } from "react";
import {
  View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator,
  Modal, TextInput, Alert, Platform, KeyboardAvoidingView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import { getApiUrl, getStaffToken } from "@/lib/query-client";
import Colors from "@/constants/colors";

// ── API helper ──────────────────────────────────────────────────────────────

async function hrApi(path: string, opts?: RequestInit) {
  const base = getApiUrl();
  const url = new URL(path, base).toString();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = getStaffToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const r = await fetch(url, { credentials: "include", headers, ...opts });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error((body as any).message || `HTTP ${r.status}`);
  }
  return r.json();
}

// ── Types ────────────────────────────────────────────────────────────────────

interface RotaShift {
  id: number;
  staffId: number;
  weekStart: string;
  dayOfWeek: number;
  shiftStart: string;
  shiftEnd: string;
  role: string | null;
  notes: string | null;
}

interface StaffUser {
  id: number;
  username: string;
  displayName: string | null;
  role: string;
  active: boolean;
}

interface RotaPublished {
  weekStart: string;
  publishedBy: string | null;
  publishedAt: string;
}

interface RotaData {
  shifts: RotaShift[];
  staffUsers: StaffUser[];
  weekLeave: Array<{ staffId: number; startDate: string; endDate: string; status: string }>;
  published: RotaPublished | null;
}

interface ShiftModalState {
  visible: boolean;
  staffId: number;
  staffName: string;
  dayOfWeek: number;
  existingShift: RotaShift | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const NAME_W = 110;
const DAY_W = 90;

function getMonday(date: Date = new Date()): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function dateToStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function fmtWeekLabel(monday: Date): string {
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  const m = monday.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const s = sunday.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return `${m} – ${s}`;
}

function isValidTime(t: string): boolean {
  return /^\d{1,2}:\d{2}$/.test(t);
}

function normaliseTime(t: string): string {
  const [h, m] = t.split(":");
  return `${h.padStart(2, "0")}:${m}`;
}

// ── Main screen ──────────────────────────────────────────────────────────────

export default function AdminRotaScreen() {
  const insets = useSafeAreaInsets();
  const webTop = Platform.OS === "web" ? 67 : 0;
  const { isAuthenticated, isManager, isLoading: authLoading } = useStaffAuth();
  const qc = useQueryClient();

  const [weekStart, setWeekStart] = useState<Date>(() => getMonday());
  const weekStr = dateToStr(weekStart);

  const [modal, setModal] = useState<ShiftModalState>({
    visible: false, staffId: 0, staffName: "", dayOfWeek: 0, existingShift: null,
  });
  const [shiftStart, setShiftStart] = useState("09:00");
  const [shiftEnd, setShiftEnd] = useState("17:00");
  const [shiftRole, setShiftRole] = useState("");
  const [shiftNotes, setShiftNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const { data: rotaData, isLoading, refetch } = useQuery<RotaData>({
    queryKey: ["/api/hr/rota", weekStr],
    queryFn: () => hrApi(`/api/hr/rota?weekStart=${weekStr}`),
    enabled: isAuthenticated && isManager,
  });

  const prevWeek = useCallback(() => {
    setWeekStart(d => { const n = new Date(d); n.setDate(n.getDate() - 7); return n; });
  }, []);

  const nextWeek = useCallback(() => {
    setWeekStart(d => { const n = new Date(d); n.setDate(n.getDate() + 7); return n; });
  }, []);

  const openModal = useCallback((staff: StaffUser, dayOfWeek: number, existing: RotaShift | null) => {
    setShiftStart(existing?.shiftStart ?? "09:00");
    setShiftEnd(existing?.shiftEnd ?? "17:00");
    setShiftRole(existing?.role ?? "");
    setShiftNotes(existing?.notes ?? "");
    setModal({
      visible: true,
      staffId: staff.id,
      staffName: staff.displayName || staff.username,
      dayOfWeek,
      existingShift: existing,
    });
  }, []);

  const closeModal = useCallback(() => {
    setModal(m => ({ ...m, visible: false }));
  }, []);

  const saveShift = useCallback(async () => {
    if (!isValidTime(shiftStart) || !isValidTime(shiftEnd)) {
      Alert.alert("Invalid Time", "Please enter times in HH:MM format (e.g. 09:00 or 17:30).");
      return;
    }
    setSaving(true);
    try {
      const body = {
        staffId: modal.staffId,
        weekStart: weekStr,
        dayOfWeek: modal.dayOfWeek,
        shiftStart: normaliseTime(shiftStart),
        shiftEnd: normaliseTime(shiftEnd),
        role: shiftRole.trim() || null,
        notes: shiftNotes.trim() || null,
        ...(modal.existingShift ? { id: modal.existingShift.id } : {}),
      };
      await hrApi("/api/hr/rota/shifts", { method: "POST", body: JSON.stringify(body) });
      closeModal();
      await refetch();
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to save shift.");
    } finally {
      setSaving(false);
    }
  }, [modal, weekStr, shiftStart, shiftEnd, shiftRole, shiftNotes, refetch, closeModal]);

  const deleteShift = useCallback(async () => {
    if (!modal.existingShift) return;
    const doDelete = async () => {
      setSaving(true);
      try {
        await hrApi(`/api/hr/rota/shifts/${modal.existingShift!.id}`, { method: "DELETE" });
        closeModal();
        await refetch();
      } catch (e: any) {
        if (Platform.OS === "web") window.alert("Error: " + (e.message || "Failed to delete shift."));
        else Alert.alert("Error", e.message || "Failed to delete shift.");
      } finally {
        setSaving(false);
      }
    };
    if (Platform.OS === "web") {
      if (window.confirm(`Remove this shift for ${modal.staffName}?`)) await doDelete();
    } else {
      Alert.alert("Delete Shift", `Remove this shift for ${modal.staffName}?`, [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: doDelete },
      ]);
    }
  }, [modal, refetch, closeModal]);

  const publishRota = useCallback(async () => {
    const shiftCount = rotaData?.shifts?.length ?? 0;
    if (shiftCount === 0) {
      if (Platform.OS === "web") window.alert("Add at least one shift before publishing the rota.");
      else Alert.alert("No Shifts", "Add at least one shift before publishing the rota.");
      return;
    }
    const doPublish = async () => {
      setPublishing(true);
      try {
        const result = await hrApi("/api/hr/rota/publish", {
          method: "POST",
          body: JSON.stringify({ weekStart: weekStr }),
        });
        const notified: number = result.staffNotified ?? 0;
        const msg = `The rota has been published and ${notified} staff member${notified === 1 ? "" : "s"} ${notified === 1 ? "has" : "have"} been notified.`;
        if (Platform.OS === "web") window.alert("Rota Published\n\n" + msg);
        else Alert.alert("Rota Published", msg);
        await refetch();
      } catch (e: any) {
        if (Platform.OS === "web") window.alert("Error: " + (e.message || "Failed to publish rota."));
        else Alert.alert("Error", e.message || "Failed to publish rota.");
      } finally {
        setPublishing(false);
      }
    };
    if (Platform.OS === "web") {
      if (window.confirm(`Publish the rota for the week of ${weekStr}?\n\nAll staff with shifts will receive a push notification.`)) {
        await doPublish();
      }
    } else {
      Alert.alert(
        "Publish Rota",
        `Publish the rota for the week of ${weekStr}?\n\nAll staff with shifts will receive a push notification.`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Publish & Notify", onPress: doPublish },
        ],
      );
    }
  }, [rotaData, weekStr, refetch]);

  if (authLoading) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator color={Colors.brand.blue} />
      </View>
    );
  }

  if (!isAuthenticated || !isManager) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <Ionicons name="lock-closed" size={36} color={Colors.light.textSecondary} />
        <Text style={styles.accessDenied}>Manager access required</Text>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const shifts = rotaData?.shifts ?? [];
  const staffUsers = rotaData?.staffUsers ?? [];
  const weekLeave = rotaData?.weekLeave ?? [];
  const published = rotaData?.published ?? null;

  // Build lookup maps
  const shiftMap = new Map<string, RotaShift[]>();
  for (const sh of shifts) {
    const key = `${sh.staffId}_${sh.dayOfWeek}`;
    if (!shiftMap.has(key)) shiftMap.set(key, []);
    shiftMap.get(key)!.push(sh);
  }

  const leaveMap = new Map<number, Set<string>>();
  for (const lv of weekLeave) {
    if (lv.status !== "approved") continue;
    if (!leaveMap.has(lv.staffId)) leaveMap.set(lv.staffId, new Set());
    const wEnd = new Date(weekStart); wEnd.setDate(wEnd.getDate() + 6);
    let cur = new Date(Math.max(new Date(lv.startDate).getTime(), weekStart.getTime()));
    while (cur <= new Date(lv.endDate) && cur <= wEnd) {
      leaveMap.get(lv.staffId)!.add(dateToStr(cur));
      cur.setDate(cur.getDate() + 1);
    }
  }

  const dayDates = DAYS.map((_, i) => {
    const d = new Date(weekStart); d.setDate(d.getDate() + i); return dateToStr(d);
  });
  const todayStr = dateToStr(new Date());

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTop }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.headerBack}>
          <Ionicons name="arrow-back" size={24} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Rota Management</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Week nav + publish */}
      <View style={styles.controls}>
        <View style={styles.weekNav}>
          <Pressable onPress={prevWeek} hitSlop={10} style={styles.navBtn}>
            <Ionicons name="chevron-back" size={20} color={Colors.light.text} />
          </Pressable>
          <Text style={styles.weekLabel}>{fmtWeekLabel(weekStart)}</Text>
          <Pressable onPress={nextWeek} hitSlop={10} style={styles.navBtn}>
            <Ionicons name="chevron-forward" size={20} color={Colors.light.text} />
          </Pressable>
        </View>

        <Pressable
          onPress={publishRota}
          disabled={publishing}
          style={({ pressed }) => [styles.publishBtn, pressed && { opacity: 0.7 }, published && styles.publishedBtn]}
        >
          {publishing
            ? <ActivityIndicator color="#fff" size="small" />
            : <>
              <Ionicons name={published ? "checkmark-circle" : "megaphone"} size={15} color="#fff" />
              <Text style={styles.publishBtnText}>{published ? "Re-publish" : "Publish & Notify"}</Text>
            </>}
        </Pressable>
      </View>

      {published && (
        <View style={styles.publishedBanner}>
          <Ionicons name="checkmark-circle" size={14} color="#059669" />
          <Text style={styles.publishedBannerText}>
            Published{published.publishedBy ? ` by ${published.publishedBy}` : ""}
            {" "}on {new Date(published.publishedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
          </Text>
        </View>
      )}

      {/* Grid */}
      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={Colors.brand.blue} />
          <Text style={styles.loadingText}>Loading rota…</Text>
        </View>
      ) : staffUsers.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="people-outline" size={40} color={Colors.light.textSecondary} />
          <Text style={styles.emptyText}>No active staff members found.</Text>
          <Text style={styles.emptySubText}>Add staff in Staff Accounts first.</Text>
        </View>
      ) : (
        <ScrollView style={styles.gridOuter} contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View>
              {/* Column headers */}
              <View style={styles.headerRow}>
                <View style={[styles.nameCell, styles.headerCell]}>
                  <Text style={styles.headerCellText}>STAFF</Text>
                </View>
                {DAYS.map((day, i) => {
                  const isToday = dayDates[i] === todayStr;
                  return (
                    <View key={day} style={[styles.dayCell, styles.headerCell, isToday && styles.todayHeader]}>
                      <Text style={[styles.headerCellText, isToday && { color: Colors.brand.blue }]}>{day}</Text>
                      <Text style={[styles.headerDateText, isToday && { color: Colors.brand.blue }]}>
                        {new Date(dayDates[i]).getDate()} {new Date(dayDates[i]).toLocaleString("en-GB", { month: "short" })}
                      </Text>
                    </View>
                  );
                })}
              </View>

              {/* Staff rows */}
              {staffUsers.map(staff => (
                <View key={staff.id} style={styles.staffRow}>
                  <View style={styles.nameCell}>
                    <Text style={styles.staffName} numberOfLines={1}>{staff.displayName || staff.username}</Text>
                    <Text style={styles.staffRole}>{staff.role}</Text>
                  </View>

                  {DAYS.map((_, dayIdx) => {
                    const key = `${staff.id}_${dayIdx}`;
                    const dayShifts = shiftMap.get(key) ?? [];
                    const isOnLeave = leaveMap.get(staff.id)?.has(dayDates[dayIdx]) ?? false;
                    const isToday = dayDates[dayIdx] === todayStr;

                    return (
                      <Pressable
                        key={dayIdx}
                        style={[
                          styles.dayCell, styles.shiftCell,
                          isToday && styles.todayCell,
                          isOnLeave && dayShifts.length === 0 && styles.leaveCell,
                        ]}
                        onPress={() => openModal(staff, dayIdx, dayShifts[0] ?? null)}
                        testID={`rota-cell-${staff.id}-${dayIdx}`}
                      >
                        {isOnLeave && dayShifts.length === 0 ? (
                          <View style={styles.leaveTag}>
                            <Text style={styles.leaveTagText}>On Leave</Text>
                          </View>
                        ) : dayShifts.length > 0 ? (
                          dayShifts.map(sh => (
                            <View key={sh.id} style={styles.shiftTag}>
                              <Text style={styles.shiftTime}>{sh.shiftStart}–{sh.shiftEnd}</Text>
                              {sh.role ? <Text style={styles.shiftRole}>{sh.role}</Text> : null}
                            </View>
                          ))
                        ) : (
                          <View style={styles.addShiftBtn}>
                            <Ionicons name="add" size={18} color={Colors.light.textSecondary} />
                          </View>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </View>
          </ScrollView>
        </ScrollView>
      )}

      {/* Shift modal */}
      <Modal visible={modal.visible} transparent animationType="slide" onRequestClose={closeModal}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalOverlay}
        >
          <Pressable style={styles.modalBackdrop} onPress={closeModal} />
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 16 }]}>
            {/* Drag handle */}
            <View style={styles.dragHandle} />

            <Text style={styles.modalTitle}>
              {modal.existingShift ? "Edit Shift" : "Add Shift"}
            </Text>
            <Text style={styles.modalSubtitle}>
              {modal.staffName} · {DAYS[modal.dayOfWeek]}{" "}
              {modal.visible && new Date(new Date(weekStart).setDate(weekStart.getDate() + modal.dayOfWeek))
                .toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
            </Text>

            <View style={styles.timeRow}>
              <View style={styles.timeField}>
                <Text style={styles.fieldLabel}>Start Time</Text>
                <TextInput
                  style={styles.timeInput}
                  value={shiftStart}
                  onChangeText={setShiftStart}
                  placeholder="09:00"
                  placeholderTextColor={Colors.light.textSecondary}
                  keyboardType="numbers-and-punctuation"
                  maxLength={5}
                />
              </View>
              <View style={styles.timeSep}><Text style={styles.timeSepText}>to</Text></View>
              <View style={styles.timeField}>
                <Text style={styles.fieldLabel}>End Time</Text>
                <TextInput
                  style={styles.timeInput}
                  value={shiftEnd}
                  onChangeText={setShiftEnd}
                  placeholder="17:00"
                  placeholderTextColor={Colors.light.textSecondary}
                  keyboardType="numbers-and-punctuation"
                  maxLength={5}
                />
              </View>
            </View>

            <Text style={styles.fieldLabel}>Role / Position (optional)</Text>
            <TextInput
              style={styles.textInput}
              value={shiftRole}
              onChangeText={setShiftRole}
              placeholder="e.g. Bartender, Floor Staff, Manager"
              placeholderTextColor={Colors.light.textSecondary}
            />

            <Text style={styles.fieldLabel}>Notes (optional)</Text>
            <TextInput
              style={[styles.textInput, styles.notesInput]}
              value={shiftNotes}
              onChangeText={setShiftNotes}
              placeholder="Any additional notes for this shift"
              placeholderTextColor={Colors.light.textSecondary}
              multiline
              numberOfLines={2}
            />

            <View style={styles.modalActions}>
              {modal.existingShift && (
                <Pressable
                  onPress={deleteShift}
                  disabled={saving}
                  style={({ pressed }) => [styles.deleteBtn, pressed && { opacity: 0.7 }]}
                >
                  <Ionicons name="trash-outline" size={16} color="#DC2626" />
                  <Text style={styles.deleteBtnText}>Delete</Text>
                </Pressable>
              )}
              <View style={{ flex: 1 }} />
              <Pressable
                onPress={closeModal}
                style={({ pressed }) => [styles.cancelBtn, pressed && { opacity: 0.7 }]}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={saveShift}
                disabled={saving}
                style={({ pressed }) => [styles.saveBtn, pressed && { opacity: 0.7 }]}
                testID="rota-save-shift"
              >
                {saving
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.saveBtnText}>Save Shift</Text>}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  accessDenied: { fontSize: 16, color: Colors.light.textSecondary, marginTop: 8 },
  backBtn: { marginTop: 16, paddingHorizontal: 24, paddingVertical: 10, backgroundColor: Colors.brand.blue, borderRadius: 8 },
  backBtnText: { color: "#fff", fontWeight: "700" },

  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#E2E8F0" },
  headerBack: { width: 36 },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 17, fontWeight: "700", color: Colors.light.text },

  controls: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10, gap: 12, borderBottomWidth: 1, borderBottomColor: "#E2E8F0" },
  weekNav: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  navBtn: { padding: 6, borderRadius: 8, backgroundColor: "#F1F5F9" },
  weekLabel: { flex: 1, fontSize: 13, fontWeight: "700", color: Colors.light.text, textAlign: "center" },

  publishBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: Colors.brand.blue, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  publishedBtn: { backgroundColor: "#059669" },
  publishBtnText: { color: "#fff", fontSize: 12, fontWeight: "700" },

  publishedBanner: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#D1FAE5", paddingHorizontal: 16, paddingVertical: 6 },
  publishedBannerText: { fontSize: 12, color: "#065F46", fontWeight: "600" },

  loadingText: { color: Colors.light.textSecondary, fontSize: 14 },
  emptyText: { fontSize: 16, color: Colors.light.text, fontWeight: "600", textAlign: "center" },
  emptySubText: { fontSize: 13, color: Colors.light.textSecondary, textAlign: "center" },

  gridOuter: { flex: 1 },

  headerRow: { flexDirection: "row" },
  headerCell: { backgroundColor: "#F8FAFC", borderBottomWidth: 2, borderBottomColor: "#E2E8F0" },
  headerCellText: { fontSize: 11, fontWeight: "700", color: Colors.light.textSecondary, textTransform: "uppercase", letterSpacing: 0.5 },
  headerDateText: { fontSize: 10, color: Colors.light.textSecondary, marginTop: 1 },
  todayHeader: { backgroundColor: "rgba(0,71,171,0.05)" },

  staffRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#F1F5F9" },
  nameCell: { width: NAME_W, paddingHorizontal: 10, paddingVertical: 10, borderRightWidth: 1, borderRightColor: "#E2E8F0", justifyContent: "center", backgroundColor: "#FAFAFA" },
  dayCell: { width: DAY_W, paddingHorizontal: 6, paddingVertical: 8, borderLeftWidth: 1, borderLeftColor: "#F1F5F9", alignItems: "center", justifyContent: "center", minHeight: 56 },
  shiftCell: { backgroundColor: "#fff" },
  todayCell: { backgroundColor: "rgba(0,71,171,0.03)" },
  leaveCell: { backgroundColor: "#FEF2F2" },

  staffName: { fontSize: 12, fontWeight: "700", color: Colors.light.text },
  staffRole: { fontSize: 10, color: Colors.light.textSecondary, marginTop: 1, textTransform: "capitalize" },

  shiftTag: { backgroundColor: "#EFF6FF", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 4, width: "100%", alignItems: "center", borderWidth: 1, borderColor: "#BFDBFE" },
  shiftTime: { fontSize: 11, fontWeight: "700", color: Colors.brand.blue },
  shiftRole: { fontSize: 9, color: "#1E40AF", textTransform: "uppercase", letterSpacing: 0.4, marginTop: 1 },

  leaveTag: { backgroundColor: "#FEE2E2", borderRadius: 6, paddingHorizontal: 4, paddingVertical: 3, width: "100%", alignItems: "center" },
  leaveTagText: { fontSize: 9, fontWeight: "700", color: "#DC2626" },

  addShiftBtn: { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, borderColor: "#CBD5E1", borderStyle: "dashed", alignItems: "center", justifyContent: "center" },

  // Modal
  modalOverlay: { flex: 1, justifyContent: "flex-end" },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.4)" },
  modalSheet: { backgroundColor: "#fff", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingTop: 12 },
  dragHandle: { width: 36, height: 4, backgroundColor: "#E2E8F0", borderRadius: 2, alignSelf: "center", marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: "700", color: Colors.light.text, marginBottom: 4 },
  modalSubtitle: { fontSize: 13, color: Colors.light.textSecondary, marginBottom: 20 },

  timeRow: { flexDirection: "row", alignItems: "flex-end", gap: 8, marginBottom: 16 },
  timeField: { flex: 1 },
  timeSep: { paddingBottom: 12 },
  timeSepText: { fontSize: 13, color: Colors.light.textSecondary },
  fieldLabel: { fontSize: 12, fontWeight: "600", color: Colors.light.textSecondary, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.4 },
  timeInput: { borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 10, padding: 12, fontSize: 18, fontWeight: "700", color: Colors.light.text, textAlign: "center", backgroundColor: "#F8FAFC" },
  textInput: { borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 10, padding: 12, fontSize: 15, color: Colors.light.text, backgroundColor: "#F8FAFC", marginBottom: 14 },
  notesInput: { height: 64, textAlignVertical: "top" },

  modalActions: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4 },
  deleteBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: "#FCA5A5" },
  deleteBtnText: { color: "#DC2626", fontSize: 14, fontWeight: "600" },
  cancelBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: "#E2E8F0" },
  cancelBtnText: { color: Colors.light.text, fontSize: 14, fontWeight: "600" },
  saveBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, backgroundColor: Colors.brand.blue },
  saveBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
});
