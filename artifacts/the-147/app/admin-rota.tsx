import React, { useState, useCallback, useRef } from "react";
import {
  View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator,
  Modal, TextInput, Alert, Platform, KeyboardAvoidingView, Linking,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useResponsive } from "@/hooks/useResponsive";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import { getApiUrl, getStaffToken } from "@/lib/query-client";
import BaseColors from "@/constants/colors";
import { useColors } from "@/hooks/useColors";
import { TimePicker } from "@/components/DateTimePickers";
import { useWindowDimensions } from "react-native";

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

interface TimeEntry {
  id: number;
  staffId: number;
  staffName: string;
  clockedInAt: string;
  clockedOutAt: string | null;
  clockInLat: string | null;
  clockInLng: string | null;
  clockOutLat: string | null;
  clockOutLng: string | null;
  notes: string | null;
  status: string;
  amendedBy: number | null;
  amendedAt: string | null;
  amendReason: string | null;
  needsManagerReview?: boolean;
  managerReviewedAt?: string | null;
  managerReviewedBy?: string | null;
}

interface AmendModalState {
  visible: boolean;
  entry: TimeEntry | null;
  clockedInAt: string;
  clockedOutAt: string;
  reason: string;
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
  const { styles, Colors } = useThemedStyles();
  const insets = useSafeAreaInsets();
  const { tabletPad } = useResponsive();
  const { width: windowWidth } = useWindowDimensions();
  const isNarrow = windowWidth < 700;
  const [narrowDayIdx, setNarrowDayIdx] = useState<number>(() => {
    const dow = new Date().getDay(); // 0=Sun, 1=Mon, ...
    return dow === 0 ? 6 : dow - 1; // map to Mon=0..Sun=6
  });
  const webTop = Platform.OS === "web" ? 67 : 0;
  const { isAuthenticated, isManager, isOwner, isLoading: authLoading } = useStaffAuth();
  const qc = useQueryClient();

  const [activeView, setActiveView] = useState<"rota" | "completed">("rota");
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

  const [amendModal, setAmendModal] = useState<AmendModalState>({
    visible: false, entry: null, clockedInAt: "", clockedOutAt: "", reason: "",
  });
  const [amending, setAmending] = useState(false);

  const { data: rotaData, isLoading, refetch } = useQuery<RotaData>({
    queryKey: ["/api/hr/rota", weekStr],
    queryFn: () => hrApi(`/api/hr/rota?weekStart=${weekStr}`),
    enabled: isAuthenticated && isManager,
  });

  const { data: allEntries = [], isLoading: entriesLoading, refetch: refetchEntries } = useQuery<TimeEntry[]>({
    queryKey: ["/api/hr/time-entries/all", "includeUnreviewed"],
    // Manager audit view: pass includeUnreviewed=true so pending-review entries
    // appear alongside approved ones. Entries still carry needsManagerReview so
    // the UI can display them with a distinct "pending" badge.
    queryFn: () => hrApi("/api/hr/time-entries/all?includeUnreviewed=true"),
    enabled: isAuthenticated && isManager && activeView === "completed",
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

  // ── Amend helpers ─────────────────────────────────────────────────────────

  function fmtForInput(iso: string | null | undefined): string {
    if (!iso) return "";
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function openAmend(entry: TimeEntry) {
    setAmendModal({
      visible: true,
      entry,
      clockedInAt: fmtForInput(entry.clockedInAt),
      clockedOutAt: fmtForInput(entry.clockedOutAt),
      reason: "",
    });
  }

  async function submitAmend() {
    if (!amendModal.entry) return;
    if (!amendModal.reason.trim()) {
      if (Platform.OS === "web") window.alert("Please enter a reason for the amendment.");
      else Alert.alert("Required", "Please enter a reason for the amendment.");
      return;
    }
    setAmending(true);
    try {
      await hrApi(`/api/hr/time-entries/${amendModal.entry.id}/amend`, {
        method: "PATCH",
        body: JSON.stringify({
          clockedInAt: amendModal.clockedInAt ? new Date(amendModal.clockedInAt).toISOString() : undefined,
          clockedOutAt: amendModal.clockedOutAt ? new Date(amendModal.clockedOutAt).toISOString() : undefined,
          reason: amendModal.reason.trim(),
        }),
      });
      setAmendModal(m => ({ ...m, visible: false }));
      refetchEntries();
    } catch (e: any) {
      if (Platform.OS === "web") window.alert("Error: " + (e.message || "Amendment failed."));
      else Alert.alert("Error", e.message || "Amendment failed.");
    } finally {
      setAmending(false);
    }
  }

  // ── Week-filtered entries ──────────────────────────────────────────────────

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  const weekEntries = allEntries.filter(e => {
    const d = new Date(e.clockedInAt);
    return d >= weekStart && d <= weekEnd;
  });

  function calcHours(entry: TimeEntry): string {
    if (!entry.clockedOutAt) return "Active";
    const ms = new Date(entry.clockedOutAt).getTime() - new Date(entry.clockedInAt).getTime();
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return `${h}h ${m}m`;
  }

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

      {/* Tab switcher */}
      <View style={styles.tabBar}>
        <Pressable
          onPress={() => setActiveView("rota")}
          style={[styles.tabBtn, activeView === "rota" && styles.tabBtnActive]}
        >
          <Ionicons name="calendar-number" size={15} color={activeView === "rota" ? Colors.brand.blue : Colors.light.textSecondary} />
          <Text style={[styles.tabBtnText, activeView === "rota" && styles.tabBtnTextActive]}>Rota Planner</Text>
        </Pressable>
        {isOwner && (
          <Pressable
            onPress={() => setActiveView("completed")}
            style={[styles.tabBtn, activeView === "completed" && styles.tabBtnActive]}
          >
            <Ionicons name="checkmark-circle" size={15} color={activeView === "completed" ? Colors.brand.blue : Colors.light.textSecondary} />
            <Text style={[styles.tabBtnText, activeView === "completed" && styles.tabBtnTextActive]}>Completed Shifts</Text>
          </Pressable>
        )}
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

        {activeView === "rota" && (
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
        )}
      </View>

      {activeView === "rota" && published && (
        <View style={styles.publishedBanner}>
          <Ionicons name="checkmark-circle" size={14} color="#059669" />
          <Text style={styles.publishedBannerText}>
            Published{published.publishedBy ? ` by ${published.publishedBy}` : ""}
            {" "}on {new Date(published.publishedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
          </Text>
        </View>
      )}

      {/* Completed Shifts View — owner only */}
      {activeView === "completed" && !isOwner && (
        <View style={styles.centered}>
          <Ionicons name="lock-closed" size={36} color={Colors.light.textSecondary} />
          <Text style={styles.accessDenied}>Owner access required</Text>
        </View>
      )}
      {activeView === "completed" && isOwner && (() => {
        const pendingCount = weekEntries.filter((e: TimeEntry) => e.needsManagerReview && !e.clockedOutAt === false).length;
        return pendingCount > 0 ? (
          <View style={styles.pendingReviewBanner}>
            <Ionicons name="alert-circle-outline" size={16} color="#92400E" />
            <Text style={styles.pendingReviewBannerText}>
              {pendingCount} shift{pendingCount !== 1 ? "s" : ""} pending your approval — not counted in payroll until reviewed.
            </Text>
          </View>
        ) : null;
      })()}
      {activeView === "completed" && isOwner && (
        entriesLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={Colors.brand.blue} />
            <Text style={styles.loadingText}>Loading shifts…</Text>
          </View>
        ) : weekEntries.length === 0 ? (
          <View style={styles.centered}>
            <Ionicons name="time-outline" size={40} color={Colors.light.textSecondary} />
            <Text style={styles.emptyText}>No completed shifts this week.</Text>
          </View>
        ) : (
          <ScrollView style={styles.gridOuter} contentContainerStyle={{ paddingBottom: insets.bottom + 24, paddingHorizontal: 16, marginHorizontal: tabletPad }}>
            {weekEntries.map(entry => {
              const isAmended = entry.status === "amended";
              const isActive = !entry.clockedOutAt;
              const clockIn = new Date(entry.clockedInAt);
              const clockOut = entry.clockedOutAt ? new Date(entry.clockedOutAt) : null;
              return (
                <Pressable
                  key={entry.id}
                  onPress={() => openAmend(entry)}
                  style={({ pressed }) => [styles.entryCard, pressed && { opacity: 0.8 }]}
                  testID={`entry-${entry.id}`}
                >
                  <View style={styles.entryTop}>
                    <View style={styles.entryNameRow}>
                      <Ionicons name="person-circle-outline" size={18} color={Colors.light.textSecondary} />
                      <Text style={styles.entryName}>{entry.staffName}</Text>
                      {isAmended && (
                        <View style={styles.amendedBadge}>
                          <Text style={styles.amendedBadgeText}>Amended</Text>
                        </View>
                      )}
                      {isActive && (
                        <View style={styles.activeBadge}>
                          <Text style={styles.activeBadgeText}>Active</Text>
                        </View>
                      )}
                      {entry.needsManagerReview && !isActive && (
                        <View style={styles.pendingBadge}>
                          <Ionicons name="alert-circle" size={10} color="#92400E" />
                          <Text style={styles.pendingBadgeText}>Pending Review</Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.entryHours}>
                      <Text style={styles.entryHoursText}>{calcHours(entry)}</Text>
                    </View>
                  </View>
                  <View style={styles.entryTimes}>
                    <View style={styles.entryTimeBlock}>
                      <Text style={styles.entryTimeLabel}>CLOCKED IN</Text>
                      <Text style={styles.entryTimeVal}>
                        {clockIn.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} {clockIn.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                      </Text>
                    </View>
                    <Ionicons name="arrow-forward" size={14} color={Colors.light.textSecondary} />
                    <View style={styles.entryTimeBlock}>
                      <Text style={styles.entryTimeLabel}>CLOCKED OUT</Text>
                      <Text style={[styles.entryTimeVal, isActive && { color: Colors.brand.green }]}>
                        {clockOut
                          ? `${clockOut.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} ${clockOut.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`
                          : "Still clocked in"}
                      </Text>
                    </View>
                  </View>
                  {/* GPS locations */}
                  {(entry.clockInLat || entry.clockOutLat) && (
                    <View style={styles.entryGps}>
                      {entry.clockInLat && entry.clockInLng && (
                        <Pressable
                          onPress={() => {
                            const url = Platform.OS === "web"
                              ? `https://www.google.com/maps?q=${entry.clockInLat},${entry.clockInLng}`
                              : `https://maps.google.com/?q=${entry.clockInLat},${entry.clockInLng}`;
                            Linking.openURL(url);
                          }}
                          style={styles.gpsChip}
                        >
                          <Ionicons name="location" size={12} color="#059669" />
                          <Text style={styles.gpsChipText}>
                            In: {parseFloat(entry.clockInLat).toFixed(5)}, {parseFloat(entry.clockInLng).toFixed(5)}
                          </Text>
                          <Ionicons name="open-outline" size={10} color="#059669" />
                        </Pressable>
                      )}
                      {entry.clockOutLat && entry.clockOutLng && (
                        <Pressable
                          onPress={() => {
                            const url = Platform.OS === "web"
                              ? `https://www.google.com/maps?q=${entry.clockOutLat},${entry.clockOutLng}`
                              : `https://maps.google.com/?q=${entry.clockOutLat},${entry.clockOutLng}`;
                            Linking.openURL(url);
                          }}
                          style={[styles.gpsChip, styles.gpsChipOut]}
                        >
                          <Ionicons name="location-outline" size={12} color="#DC2626" />
                          <Text style={[styles.gpsChipText, styles.gpsChipOutText]}>
                            Out: {parseFloat(entry.clockOutLat).toFixed(5)}, {parseFloat(entry.clockOutLng).toFixed(5)}
                          </Text>
                          <Ionicons name="open-outline" size={10} color="#DC2626" />
                        </Pressable>
                      )}
                      {!entry.clockInLat && (
                        <View style={styles.gpsNoData}>
                          <Ionicons name="location-outline" size={12} color={Colors.light.textSecondary} />
                          <Text style={styles.gpsNoDataText}>No GPS recorded at clock-in</Text>
                        </View>
                      )}
                    </View>
                  )}
                  {!entry.clockInLat && !entry.clockOutLat && (
                    <View style={[styles.entryGps, { marginTop: 8 }]}>
                      <View style={styles.gpsNoData}>
                        <Ionicons name="location-outline" size={12} color={Colors.light.textSecondary} />
                        <Text style={styles.gpsNoDataText}>No GPS data recorded</Text>
                      </View>
                    </View>
                  )}

                  {isAmended && entry.amendReason && (
                    <Text style={styles.entryAmendNote}>Amendment: {entry.amendReason}</Text>
                  )}
                  {entry.needsManagerReview && !isActive && (
                    <View style={styles.reviewRow}>
                      <View style={styles.reviewWarning}>
                        <Ionicons name="information-circle-outline" size={12} color="#92400E" />
                        <Text style={styles.reviewWarningText}>GPS unverified — approve to count toward payroll</Text>
                      </View>
                      <Pressable
                        onPress={async (ev) => {
                          ev.stopPropagation();
                          try {
                            await hrApi(`/api/hr/time-entries/${entry.id}/review`, { method: "PATCH" });
                            refetchEntries();
                          } catch (e: any) {
                            Alert.alert("Error", e.message || "Failed to approve entry.");
                          }
                        }}
                        style={({ pressed }) => [styles.approveBtn, pressed && { opacity: 0.75 }]}
                      >
                        <Ionicons name="checkmark-circle-outline" size={14} color="#fff" />
                        <Text style={styles.approveBtnText}>Approve</Text>
                      </Pressable>
                    </View>
                  )}
                  {entry.managerReviewedAt && !entry.needsManagerReview && (
                    <Text style={styles.reviewedNote}>
                      <Ionicons name="checkmark-circle" size={11} color="#059669" /> Approved {new Date(entry.managerReviewedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    </Text>
                  )}
                  <View style={styles.entryEditHint}>
                    <Ionicons name="create-outline" size={13} color={Colors.brand.blue} />
                    <Text style={styles.entryEditHintText}>Tap to edit</Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        )
      )}

      {/* Rota Grid */}
      {activeView === "rota" && (isLoading ? (
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
      ) : isNarrow ? (
        // ── NARROW LAYOUT (mobile): day picker + per-staff list for that day ──
        <View style={{ flex: 1 }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.dayPickerRow}
          >
            {DAYS.map((day, i) => {
              const isToday = dayDates[i] === todayStr;
              const isSelected = i === narrowDayIdx;
              const dayDate = new Date(dayDates[i]);
              return (
                <Pressable
                  key={day}
                  onPress={() => setNarrowDayIdx(i)}
                  style={[styles.dayChip, isSelected && styles.dayChipActive, isToday && !isSelected && styles.dayChipToday]}
                  testID={`rota-day-${i}`}
                >
                  <Text style={[styles.dayChipDay, isSelected && styles.dayChipDayActive]}>{day}</Text>
                  <Text style={[styles.dayChipDate, isSelected && styles.dayChipDateActive]}>
                    {dayDate.getDate()}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: insets.bottom + 24 }}>
            <Text style={styles.narrowDayHeader}>
              {new Date(dayDates[narrowDayIdx]).toLocaleDateString("en-GB", {
                weekday: "long", day: "numeric", month: "long",
              })}
            </Text>
            {staffUsers.map(staff => {
              const key = `${staff.id}_${narrowDayIdx}`;
              const dayShifts = shiftMap.get(key) ?? [];
              const isOnLeave = leaveMap.get(staff.id)?.has(dayDates[narrowDayIdx]) ?? false;
              return (
                <Pressable
                  key={staff.id}
                  onPress={() => openModal(staff, narrowDayIdx, dayShifts[0] ?? null)}
                  style={styles.narrowRow}
                  testID={`rota-narrow-${staff.id}-${narrowDayIdx}`}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.narrowName} numberOfLines={1}>
                      {staff.displayName || staff.username}
                    </Text>
                    <Text style={styles.narrowRole}>{staff.role}</Text>
                  </View>
                  <View style={{ alignItems: "flex-end", flexShrink: 0 }}>
                    {isOnLeave && dayShifts.length === 0 ? (
                      <View style={styles.narrowLeavePill}>
                        <Text style={styles.narrowLeaveText}>On Leave</Text>
                      </View>
                    ) : dayShifts.length > 0 ? (
                      dayShifts.map(sh => (
                        <View key={sh.id} style={styles.narrowShiftPill}>
                          <Text style={styles.narrowShiftTime}>{sh.shiftStart}–{sh.shiftEnd}</Text>
                          {sh.role ? <Text style={styles.narrowShiftRole}>{sh.role}</Text> : null}
                        </View>
                      ))
                    ) : (
                      <View style={styles.narrowAddBtn}>
                        <Ionicons name="add" size={18} color={Colors.brand.blue} />
                        <Text style={styles.narrowAddText}>Add shift</Text>
                      </View>
                    )}
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : (
        <ScrollView style={styles.gridOuter} contentContainerStyle={{ paddingBottom: insets.bottom + 24, marginHorizontal: tabletPad }}>
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
      ))}

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
                <TimePicker value={shiftStart} onChange={setShiftStart} placeholder="09:00" testID="rota-shift-start" />
              </View>
              <View style={styles.timeSep}><Text style={styles.timeSepText}>to</Text></View>
              <View style={styles.timeField}>
                <Text style={styles.fieldLabel}>End Time</Text>
                <TimePicker value={shiftEnd} onChange={setShiftEnd} placeholder="17:00" testID="rota-shift-end" />
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

      {/* Amend modal */}
      <Modal visible={amendModal.visible} transparent animationType="slide" onRequestClose={() => setAmendModal(m => ({ ...m, visible: false }))}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalOverlay}
        >
          <Pressable style={styles.modalBackdrop} onPress={() => setAmendModal(m => ({ ...m, visible: false }))} />
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.dragHandle} />
            <Text style={styles.modalTitle}>Edit Completed Shift</Text>
            {amendModal.entry && (
              <Text style={styles.modalSubtitle}>{amendModal.entry.staffName}</Text>
            )}

            <Text style={styles.fieldLabel}>Clock-in Date/Time</Text>
            <TextInput
              style={styles.amendInput}
              value={amendModal.clockedInAt}
              onChangeText={v => setAmendModal(m => ({ ...m, clockedInAt: v }))}
              placeholder="YYYY-MM-DDTHH:MM"
              placeholderTextColor={Colors.light.textSecondary}
              autoCapitalize="none"
            />

            <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Clock-out Date/Time</Text>
            <TextInput
              style={styles.amendInput}
              value={amendModal.clockedOutAt}
              onChangeText={v => setAmendModal(m => ({ ...m, clockedOutAt: v }))}
              placeholder="YYYY-MM-DDTHH:MM (leave blank if still active)"
              placeholderTextColor={Colors.light.textSecondary}
              autoCapitalize="none"
            />

            <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Reason for Amendment *</Text>
            <TextInput
              style={[styles.amendInput, { height: 72, textAlignVertical: "top" }]}
              value={amendModal.reason}
              onChangeText={v => setAmendModal(m => ({ ...m, reason: v }))}
              placeholder="Explain why you are amending this shift…"
              placeholderTextColor={Colors.light.textSecondary}
              multiline
            />

            {amendModal.entry?.amendReason && (
              <View style={styles.prevAmendNote}>
                <Text style={styles.prevAmendLabel}>Previous amendment:</Text>
                <Text style={styles.prevAmendText}>{amendModal.entry.amendReason}</Text>
              </View>
            )}

            <View style={[styles.btnRow, { marginTop: 20 }]}>
              <Pressable
                onPress={() => setAmendModal(m => ({ ...m, visible: false }))}
                style={({ pressed }) => [styles.cancelBtn, pressed && { opacity: 0.7 }]}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={submitAmend}
                disabled={amending}
                style={({ pressed }) => [styles.saveBtn, pressed && { opacity: 0.7 }]}
                testID="amend-save-btn"
              >
                {amending
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.saveBtnText}>Save Amendment</Text>}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const createThemedStyles = (colors: ReturnType<typeof useColors>) => {
  const Colors = { ...BaseColors, light: colors, glass: colors.glass };
  return themedStyleSheet({
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
  btnRow: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 10 },

  // Narrow / mobile rota layout
  dayPickerRow: { paddingHorizontal: 12, paddingVertical: 10, gap: 8, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#E5E7EB" },
  dayChip: { width: 48, paddingVertical: 8, marginRight: 8, borderRadius: 10, alignItems: "center", backgroundColor: "#F3F4F6", borderWidth: 1, borderColor: "transparent" },
  dayChipActive: { backgroundColor: Colors.brand.blue, borderColor: Colors.brand.blue },
  dayChipToday: { borderColor: Colors.brand.blue },
  dayChipDay: { fontSize: 11, fontWeight: "700", color: "#4B5A72", letterSpacing: 0.4 },
  dayChipDate: { fontSize: 18, fontWeight: "800", color: Colors.brand.dark, marginTop: 2 },
  dayChipDayActive: { color: "#fff" },
  dayChipDateActive: { color: "#fff" },
  narrowDayHeader: { fontSize: 13, fontWeight: "700", color: "#6B7280", marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.6 },
  narrowRow: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#fff", borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: "#E5E7EB" },
  narrowName: { fontSize: 15, fontWeight: "700", color: Colors.brand.dark },
  narrowRole: { fontSize: 12, color: "#6B7280", marginTop: 2, textTransform: "capitalize" },
  narrowShiftPill: { backgroundColor: "#EFF6FF", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: "#BFDBFE", marginTop: 4, alignItems: "center" },
  narrowShiftTime: { fontSize: 13, fontWeight: "800", color: Colors.brand.blue },
  narrowShiftRole: { fontSize: 10, color: "#1D4ED8", marginTop: 2, textTransform: "capitalize" },
  narrowLeavePill: { backgroundColor: "#FEE2E2", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  narrowLeaveText: { fontSize: 12, fontWeight: "700", color: "#B91C1C" },
  narrowAddBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: Colors.brand.blue, borderStyle: "dashed" },
  narrowAddText: { fontSize: 12, fontWeight: "600", color: Colors.brand.blue },

  // Tab bar
  tabBar: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#E2E8F0", backgroundColor: "#fff" },
  tabBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10 },
  tabBtnActive: { borderBottomWidth: 2, borderBottomColor: Colors.brand.blue },
  tabBtnText: { fontSize: 13, fontWeight: "600", color: Colors.light.textSecondary },
  tabBtnTextActive: { color: Colors.brand.blue },

  // Entry cards
  entryCard: { backgroundColor: "#fff", borderRadius: 12, padding: 14, marginTop: 12, borderWidth: 1, borderColor: "#E2E8F0", shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  entryTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  entryNameRow: { flexDirection: "row", alignItems: "center", gap: 6, flex: 1, flexWrap: "wrap" },
  entryName: { fontSize: 14, fontWeight: "700", color: Colors.light.text },
  entryHours: { backgroundColor: "#EFF6FF", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  entryHoursText: { fontSize: 12, fontWeight: "700", color: Colors.brand.blue },
  entryTimes: { flexDirection: "row", alignItems: "center", gap: 8 },
  entryTimeBlock: { flex: 1 },
  entryTimeLabel: { fontSize: 10, fontWeight: "700", color: Colors.light.textSecondary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 },
  entryTimeVal: { fontSize: 13, fontWeight: "600", color: Colors.light.text },
  entryAmendNote: { marginTop: 8, fontSize: 12, color: "#92400E", backgroundColor: "#FEF3C7", padding: 8, borderRadius: 8 },
  entryEditHint: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8, justifyContent: "flex-end" },
  entryEditHintText: { fontSize: 11, color: Colors.brand.blue, fontWeight: "600" },

  // Badges
  amendedBadge: { backgroundColor: "#FEF3C7", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  amendedBadgeText: { fontSize: 10, fontWeight: "700", color: "#92400E" },
  activeBadge: { backgroundColor: "#D1FAE5", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  activeBadgeText: { fontSize: 10, fontWeight: "700", color: "#065F46" },
  pendingBadge: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#FEF3C7", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  pendingBadgeText: { fontSize: 10, fontWeight: "700", color: "#92400E" },

  // Pending review banner + approve UI
  pendingReviewBanner: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#FEF9C3", borderBottomWidth: 1, borderBottomColor: "#FDE68A", paddingHorizontal: 16, paddingVertical: 10 },
  pendingReviewBannerText: { flex: 1, fontSize: 12, fontWeight: "600", color: "#92400E" },
  reviewRow: { marginTop: 10, gap: 6 },
  reviewWarning: { flexDirection: "row", alignItems: "center", gap: 5 },
  reviewWarningText: { fontSize: 11, color: "#92400E", fontStyle: "italic", flex: 1 },
  approveBtn: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#059669", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, alignSelf: "flex-start" },
  approveBtnText: { fontSize: 13, fontWeight: "700", color: "#fff" },
  reviewedNote: { marginTop: 6, fontSize: 11, color: "#059669", fontWeight: "600" },

  // Amend modal
  amendInput: { borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 10, padding: 12, fontSize: 14, color: Colors.light.text, backgroundColor: "#F8FAFC", marginBottom: 4 },
  prevAmendNote: { backgroundColor: "#FEF3C7", borderRadius: 8, padding: 10, marginTop: 12 },
  prevAmendLabel: { fontSize: 11, fontWeight: "700", color: "#92400E", marginBottom: 2 },
  prevAmendText: { fontSize: 12, color: "#78350F" },

  // GPS
  entryGps: { marginTop: 8, gap: 4 },
  gpsChip: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#F0FDF4", borderWidth: 1, borderColor: "#BBF7D0", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5, alignSelf: "flex-start" },
  gpsChipText: { fontSize: 11, color: "#059669", fontWeight: "600", fontVariant: ["tabular-nums"] as any },
  gpsChipOut: { backgroundColor: "#FFF5F5", borderColor: "#FECACA" },
  gpsChipOutText: { color: "#DC2626" },
  gpsNoData: { flexDirection: "row", alignItems: "center", gap: 5 },
  gpsNoDataText: { fontSize: 11, color: Colors.light.textSecondary, fontStyle: "italic" },
  }, colors);
};

function useThemedStyles() {
  const colors = useColors();
  const styles = React.useMemo(() => createThemedStyles(colors), [colors]);
  const themedColors = React.useMemo(() => ({ ...BaseColors, light: colors, glass: colors.glass }), [colors]);
  return { colors, styles, Colors: themedColors };
}

function themedStyleSheet(source: any, colors: ReturnType<typeof useColors>) { return StyleSheet.create(themeSource(source, colors)); }
function themeSource(source: any, colors: ReturnType<typeof useColors>): any { return Object.fromEntries(Object.entries(source).map(([n, v]: any) => [n, Object.fromEntries(Object.entries(v).map(([k, t]: any) => [k, themeToken(n, k, t, colors)]))])); }
function themeToken(n: string, k: string, t: any, c: ReturnType<typeof useColors>) { if (typeof t !== "string") return t; if (k === "color" && /^#fff(?:fff)?$/i.test(t)) return /btn|button|badge|chip|pill|selected|active|primary|action|cta|fab|submit|save|publish|approve|confirm|complete|clock|gdpr|back|close|filter|tab|preview|retry|claim|redeem|login/i.test(n) ? t : c.text; if (k === "color") return ["#0A1628", "#132742", "#111827", "#1E293B", "#1F2937", "#334155", "#374151", "#4B5563"].includes(t) ? c.text : ["#475569", "#4B5A72", "#64748B", "#6B7280", "#94A3B8", "#9CA3AF"].includes(t) ? c.textSecondary : t; if (/border.*color/i.test(k) && ["#E2E8F0", "#E5E7EB", "#CBD5E1", "#D1D5DB"].includes(t)) return c.border; if (/backgroundcolor/i.test(k)) return ["#F2F5FA", "#F4F7FB", "#F8FAFC", "#F9FAFB", "#F1F5F9", "#F3F4F6"].includes(t) ? c.background : ["#fff", "#FFFFFF"].includes(t) ? c.surface : ["#0A1628", "#132742", "#0F172A", "#1E293B"].includes(t) ? c.surfaceElevated : t; return t; }
