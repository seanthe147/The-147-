import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, Modal, TextInput,
  ActivityIndicator, Alert, Platform, RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import { getApiUrl } from "@/lib/query-client";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import Colors from "@/constants/colors";

// ── Helpers ───────────────────────────────────────────────────────────────────

function haversineDistanceM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDuration(ms: number): string {
  const totalSecs = Math.floor(ms / 1000);
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

function formatHoursDecimal(ms: number): string {
  const h = ms / 3600000;
  return h.toFixed(1) + "h";
}

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

function entryDurationMs(entry: any): number {
  if (!entry.clockedOutAt) return Date.now() - new Date(entry.clockedInAt).getTime();
  return new Date(entry.clockedOutAt).getTime() - new Date(entry.clockedInAt).getTime();
}

function weekHoursMs(entries: any[]): number {
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setHours(0, 0, 0, 0);
  startOfWeek.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1));
  return entries
    .filter((e) => new Date(e.clockedInAt) >= startOfWeek && e.status !== "active")
    .reduce((sum, e) => sum + entryDurationMs(e), 0);
}

// ── API helpers ───────────────────────────────────────────────────────────────

async function hrApi(path: string, opts?: RequestInit) {
  const base = getApiUrl();
  const url = new URL(path, base).toString();
  const r = await fetch(url, { credentials: "include", headers: { "Content-Type": "application/json" }, ...opts });
  if (!r.ok) { const body = await r.json().catch(() => ({})); throw new Error(body.message || `HTTP ${r.status}`); }
  return r.json();
}

const GDPR_KEY = "hr_gdpr_accepted_v1";

// ════════════════════════════════════════════════════════════════════════════
export default function StaffHRScreen() {
  const insets = useSafeAreaInsets();
  const { displayName, role, isAuthenticated, isLoading: authLoading } = useStaffAuth();
  const qc = useQueryClient();
  const [now, setNow] = useState(Date.now());
  const [gdprAccepted, setGdprAccepted] = useState<boolean | null>(null);
  const [clockLoading, setClockLoading] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [showIncidentModal, setShowIncidentModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // redirect if not logged in
  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.replace("/staff-portal");
  }, [authLoading, isAuthenticated]);

  // live timer for clocked-in duration
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // GDPR consent check
  useEffect(() => {
    AsyncStorage.getItem(GDPR_KEY).then((v) => setGdprAccepted(v === "yes"));
  }, []);

  // ── Queries ─────────────────────────────────────────────────────────────────
  const { data: clockStatus, refetch: refetchClock } = useQuery({
    queryKey: ["/api/hr/clock-status"],
    queryFn: () => hrApi("/api/hr/clock-status"),
    enabled: isAuthenticated && gdprAccepted === true,
    refetchInterval: 30000,
  });

  const { data: timeEntries = [], refetch: refetchEntries } = useQuery({
    queryKey: ["/api/hr/time-entries"],
    queryFn: () => hrApi("/api/hr/time-entries"),
    enabled: isAuthenticated && gdprAccepted === true,
  });

  const { data: leaveBalance, refetch: refetchBalance } = useQuery({
    queryKey: ["/api/hr/leave-allowance"],
    queryFn: () => hrApi("/api/hr/leave-allowance"),
    enabled: isAuthenticated && gdprAccepted === true,
  });

  const { data: geofence } = useQuery({
    queryKey: ["/api/hr/geofence"],
    queryFn: () => hrApi("/api/hr/geofence"),
    enabled: isAuthenticated,
  });

  const { data: leaveRequests = [], refetch: refetchLeave } = useQuery({
    queryKey: ["/api/hr/leave-requests"],
    queryFn: () => hrApi("/api/hr/leave-requests"),
    enabled: isAuthenticated && gdprAccepted === true,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchClock(), refetchEntries(), refetchBalance(), refetchLeave()]);
    setRefreshing(false);
  }, [refetchClock, refetchEntries, refetchBalance, refetchLeave]);

  // ── Geofence clock action ────────────────────────────────────────────────────
  const handleClockAction = async () => {
    setClockLoading(true);
    try {
      // Request location permission
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Location Required", "Location access is needed to verify you are on site before clocking in or out. This is required by your employer's attendance policy.");
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const { latitude, longitude } = pos.coords;

      // Geofence check if venue coordinates are configured
      if (geofence?.lat && geofence?.lng) {
        const dist = haversineDistanceM(latitude, longitude, parseFloat(geofence.lat), parseFloat(geofence.lng));
        const radius = geofence.radius ?? 200;
        if (dist > radius) {
          Alert.alert(
            "Not On Site",
            `You must be within ${radius}m of the venue to clock in or out. You are currently ${Math.round(dist)}m away.\n\nIf you believe this is an error, please speak to your manager.`,
          );
          return;
        }
      }

      const isClockedIn = !!clockStatus?.active;
      if (isClockedIn) {
        await hrApi("/api/hr/clock-out", { method: "POST", body: JSON.stringify({ lat: String(latitude), lng: String(longitude) }) });
        Alert.alert("Clocked Out", "Your shift has been recorded. Have a great rest of your day!");
      } else {
        await hrApi("/api/hr/clock-in", { method: "POST", body: JSON.stringify({ lat: String(latitude), lng: String(longitude) }) });
        Alert.alert("Clocked In", "Your shift has started. Have a great shift!");
      }
      await Promise.all([refetchClock(), refetchEntries()]);
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to record attendance. Please try again.");
    } finally {
      setClockLoading(false);
    }
  };

  // ── Derived state ─────────────────────────────────────────────────────────────
  const activeEntry = clockStatus?.active ?? null;
  const isClockedIn = !!activeEntry;
  const activeDurationMs = activeEntry ? now - new Date(activeEntry.clockedInAt).getTime() : 0;
  const weekMs = weekHoursMs(timeEntries);
  const todayMs = timeEntries
    .filter((e: any) => {
      const d = new Date(e.clockedInAt);
      const today = new Date();
      return d.toDateString() === today.toDateString();
    })
    .reduce((sum: number, e: any) => sum + (e.status !== "active" ? entryDurationMs(e) : 0), 0);

  const pendingLeave = (leaveRequests as any[]).filter((r) => r.status === "pending").length;

  // 48h Working Time Regulations check (rolling week)
  const weekHoursNum = weekMs / 3600000;
  const wtReached = weekHoursNum >= 40;
  const wtWarning = weekHoursNum >= 44;

  // ── Loading / redirect states ─────────────────────────────────────────────────
  if (authLoading || gdprAccepted === null) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={Colors.brand.blue} />
      </View>
    );
  }

  // GDPR consent gate
  if (!gdprAccepted) {
    return <GDPRNotice onAccept={async () => { await AsyncStorage.setItem(GDPR_KEY, "yes"); setGdprAccepted(true); }} />;
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0) }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Time & HR</Text>
        <Pressable onPress={() => setShowHistoryModal(true)} style={styles.backBtn}>
          <Ionicons name="time-outline" size={22} color={Colors.brand.blue} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.brand.blue} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Working Time Regulations Warning */}
        {wtWarning && (
          <View style={[styles.alertBanner, { backgroundColor: "#FEF3C7", borderColor: "#F59E0B" }]}>
            <Ionicons name="warning-outline" size={16} color="#B45309" />
            <Text style={[styles.alertText, { color: "#92400E" }]}>
              You are approaching the 48-hour weekly limit under Working Time Regulations. {weekHoursNum.toFixed(1)}h this week.
            </Text>
          </View>
        )}

        {/* Clock Card */}
        <View style={[styles.clockCard, isClockedIn && styles.clockCardActive]}>
          <View style={styles.clockHeader}>
            <View style={[styles.clockDot, { backgroundColor: isClockedIn ? "#22C55E" : Colors.light.border }]} />
            <Text style={styles.clockStatusLabel}>
              {isClockedIn ? "On Shift" : "Off Shift"}
            </Text>
            {isClockedIn && (
              <Text style={styles.clockSince}>since {fmtTime(activeEntry.clockedInAt)}</Text>
            )}
          </View>

          {isClockedIn && (
            <Text style={styles.clockTimer}>{formatDuration(activeDurationMs)}</Text>
          )}

          <Pressable
            onPress={handleClockAction}
            disabled={clockLoading}
            style={({ pressed }) => [
              styles.clockBtn,
              isClockedIn ? styles.clockBtnOut : styles.clockBtnIn,
              (pressed || clockLoading) && { opacity: 0.75 },
            ]}
          >
            {clockLoading
              ? <ActivityIndicator size="small" color="#fff" />
              : <>
                  <Ionicons name={isClockedIn ? "log-out-outline" : "log-in-outline"} size={22} color="#fff" />
                  <Text style={styles.clockBtnText}>{isClockedIn ? "Clock Out" : "Clock In"}</Text>
                </>
            }
          </Pressable>

          <Text style={styles.clockGdprNote}>
            <Ionicons name="location-outline" size={11} color={Colors.light.textSecondary} /> Location is verified on-site only and not continuously tracked.
          </Text>
        </View>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <StatBox label="Today" value={todayMs > 0 ? formatHoursDecimal(todayMs) : "—"} icon="today-outline" />
          <StatBox label="This Week" value={formatHoursDecimal(weekMs)} icon="calendar-outline" colour={wtReached ? "#F59E0B" : undefined} />
          <StatBox
            label="Leave Left"
            value={leaveBalance ? `${(leaveBalance.remaining as number).toFixed(1)}d` : "—"}
            icon="airplane-outline"
            colour={leaveBalance && leaveBalance.remaining < 5 ? "#EF4444" : undefined}
          />
        </View>

        {/* Quick Actions */}
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.actionsGrid}>
          <ActionCard
            icon="calendar"
            label="Request Leave"
            colour="#7C3AED"
            badge={pendingLeave > 0 ? String(pendingLeave) : undefined}
            badgeLabel="pending"
            onPress={() => setShowLeaveModal(true)}
          />
          <ActionCard
            icon="warning"
            label="Report Incident"
            colour="#DC2626"
            onPress={() => setShowIncidentModal(true)}
          />
          <ActionCard
            icon="document-text-outline"
            label="My Leave History"
            colour="#0369A1"
            onPress={() => setShowLeaveModal(true)}
          />
          <ActionCard
            icon="time-outline"
            label="Shift History"
            colour="#065F46"
            onPress={() => setShowHistoryModal(true)}
          />
        </View>

        {/* Leave balance detail */}
        {leaveBalance && (
          <>
            <Text style={styles.sectionTitle}>Leave Allowance {new Date().getFullYear()}</Text>
            <View style={styles.leaveCard}>
              <LeaveRow label="Annual entitlement" value={`${leaveBalance.allowance.totalDays} days`} />
              <LeaveRow label="Carried over" value={`${leaveBalance.allowance.carryOver} days`} />
              <LeaveRow label="Total entitlement" value={`${(leaveBalance.totalEntitlement as number).toFixed(1)} days`} />
              <LeaveRow label="Days taken" value={`${(leaveBalance.usedDays as number).toFixed(1)} days`} colour="#EF4444" />
              <View style={[styles.leaveRow, styles.leaveRowTotal]}>
                <Text style={styles.leaveRowLabelBold}>Remaining</Text>
                <Text style={[styles.leaveRowValueBold, { color: leaveBalance.remaining < 5 ? "#EF4444" : "#22C55E" }]}>
                  {(leaveBalance.remaining as number).toFixed(1)} days
                </Text>
              </View>
            </View>
          </>
        )}

        {/* Recent shifts */}
        <Text style={styles.sectionTitle}>Recent Shifts</Text>
        {(timeEntries as any[]).slice(0, 5).map((entry: any) => (
          <View key={entry.id} style={styles.shiftRow}>
            <View>
              <Text style={styles.shiftDate}>{fmtDate(entry.clockedInAt)}</Text>
              <Text style={styles.shiftTime}>
                {fmtTime(entry.clockedInAt)} — {entry.clockedOutAt ? fmtTime(entry.clockedOutAt) : "ongoing"}
              </Text>
            </View>
            <View style={styles.shiftRight}>
              <Text style={styles.shiftDuration}>
                {entry.clockedOutAt ? formatHoursDecimal(entryDurationMs(entry)) : "—"}
              </Text>
              {entry.status === "amended" && (
                <View style={styles.amendedBadge}><Text style={styles.amendedText}>amended</Text></View>
              )}
            </View>
          </View>
        ))}
        {(timeEntries as any[]).length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="time-outline" size={32} color={Colors.light.border} />
            <Text style={styles.emptyText}>No shifts recorded yet</Text>
          </View>
        )}

        {/* Employment law notice */}
        <View style={styles.lawNotice}>
          <Ionicons name="shield-checkmark-outline" size={14} color={Colors.brand.blue} />
          <Text style={styles.lawNoticeText}>
            Records kept in compliance with UK Working Time Regulations 1998 and employment law. Data retained for 6 years post-employment under GDPR.
          </Text>
        </View>
      </ScrollView>

      {/* Leave Request Modal */}
      <LeaveRequestModal
        visible={showLeaveModal}
        onClose={() => setShowLeaveModal(false)}
        onSuccess={() => { refetchLeave(); refetchBalance(); }}
        leaveRequests={leaveRequests as any[]}
      />

      {/* Incident Report Modal */}
      <IncidentModal
        visible={showIncidentModal}
        onClose={() => setShowIncidentModal(false)}
      />

      {/* Full Shift History Modal */}
      <ShiftHistoryModal
        visible={showHistoryModal}
        onClose={() => setShowHistoryModal(false)}
        entries={timeEntries as any[]}
      />
    </View>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Sub-components
// ════════════════════════════════════════════════════════════════════════════

function GDPRNotice({ onAccept }: { onAccept: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.container, styles.centered, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20, paddingHorizontal: 24 }]}>
      <Ionicons name="shield-checkmark" size={48} color={Colors.brand.blue} style={{ marginBottom: 20 }} />
      <Text style={styles.gdprTitle}>Data & Privacy Notice</Text>
      <Text style={styles.gdprBody}>
        The 147 Bradford collects and stores your attendance and leave data to meet employment law obligations under the Working Time Regulations 1998.{"\n\n"}
        <Text style={{ fontWeight: "700" }}>What we collect:</Text>
        {"\n"}• Clock-in and clock-out times{"\n"}• GPS coordinates at clock-in/out (on-site verification only){"\n"}• Leave requests and approvals{"\n"}• Incident reports{"\n\n"}
        <Text style={{ fontWeight: "700" }}>Your rights (GDPR):</Text>
        {"\n"}• View all your data at any time{"\n"}• Request correction of errors{"\n"}• Request deletion when you leave (subject to legal retention periods){"\n\n"}
        <Text style={{ fontWeight: "700" }}>Retention:</Text> Employment records are kept for 6 years after employment ends as required by UK law.{"\n\n"}
        Location data is only captured at the moment of clocking in or out and is not continuously tracked.
      </Text>
      <Pressable onPress={onAccept} style={styles.gdprBtn}>
        <Text style={styles.gdprBtnText}>I Understand — Continue</Text>
      </Pressable>
    </View>
  );
}

function StatBox({ label, value, icon, colour }: { label: string; value: string; icon: any; colour?: string }) {
  return (
    <View style={styles.statBox}>
      <Ionicons name={icon} size={18} color={colour ?? Colors.brand.blue} />
      <Text style={[styles.statValue, colour ? { color: colour } : {}]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function ActionCard({ icon, label, colour, badge, badgeLabel, onPress }: { icon: any; label: string; colour: string; badge?: string; badgeLabel?: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.actionCard, pressed && { opacity: 0.75 }]}>
      <View style={[styles.actionIcon, { backgroundColor: colour + "18" }]}>
        <Ionicons name={icon} size={22} color={colour} />
      </View>
      <Text style={styles.actionLabel}>{label}</Text>
      {badge && (
        <View style={styles.actionBadge}>
          <Text style={styles.actionBadgeText}>{badge} {badgeLabel}</Text>
        </View>
      )}
    </Pressable>
  );
}

function LeaveRow({ label, value, colour }: { label: string; value: string; colour?: string }) {
  return (
    <View style={styles.leaveRow}>
      <Text style={styles.leaveRowLabel}>{label}</Text>
      <Text style={[styles.leaveRowValue, colour ? { color: colour } : {}]}>{value}</Text>
    </View>
  );
}

// ── Leave Request Modal ───────────────────────────────────────────────────────
function LeaveRequestModal({ visible, onClose, onSuccess, leaveRequests }: { visible: boolean; onClose: () => void; onSuccess: () => void; leaveRequests: any[] }) {
  const [tab, setTab] = useState<"request" | "history">("request");
  const [leaveType, setLeaveType] = useState("annual");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function calcWorkingDays(start: string, end: string): number {
    if (!start || !end) return 0;
    const s = new Date(start); const e = new Date(end);
    if (isNaN(s.getTime()) || isNaN(e.getTime()) || e < s) return 0;
    let days = 0;
    const cur = new Date(s);
    while (cur <= e) {
      const dow = cur.getDay();
      if (dow !== 0 && dow !== 6) days++;
      cur.setDate(cur.getDate() + 1);
    }
    return days;
  }

  const totalDays = calcWorkingDays(startDate, endDate);

  async function submit() {
    setError("");
    if (!startDate || !endDate) { setError("Please enter start and end dates."); return; }
    if (totalDays <= 0) { setError("End date must be after start date and include working days."); return; }
    setLoading(true);
    try {
      await hrApi("/api/hr/leave-requests", { method: "POST", body: JSON.stringify({ leaveType, startDate, endDate, totalDays: String(totalDays), reason }) });
      setStartDate(""); setEndDate(""); setReason(""); setLeaveType("annual");
      onSuccess();
      Alert.alert("Request Submitted", "Your leave request has been sent to your manager for approval.");
      setTab("history");
    } catch (e: any) { setError(e.message || "Failed to submit. Please try again."); }
    finally { setLoading(false); }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Leave Requests</Text>
          <Pressable onPress={onClose}><Ionicons name="close" size={24} color={Colors.light.textSecondary} /></Pressable>
        </View>
        <View style={styles.tabRow}>
          {(["request", "history"] as const).map((t) => (
            <Pressable key={t} onPress={() => setTab(t)} style={[styles.tabBtn, tab === t && styles.tabBtnActive]}>
              <Text style={[styles.tabBtnText, tab === t && styles.tabBtnTextActive]}>{t === "request" ? "New Request" : "History"}</Text>
            </Pressable>
          ))}
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
          {tab === "request" ? (
            <>
              <Text style={styles.fieldLabel}>Type of Leave</Text>
              <View style={styles.typeRow}>
                {[["annual", "Annual"], ["sick", "Sick"], ["unpaid", "Unpaid"], ["other", "Other"]].map(([val, lbl]) => (
                  <Pressable key={val} onPress={() => setLeaveType(val)} style={[styles.typePill, leaveType === val && styles.typePillActive]}>
                    <Text style={[styles.typePillText, leaveType === val && styles.typePillTextActive]}>{lbl}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.fieldLabel}>Start Date</Text>
              <TextInput style={styles.input} value={startDate} onChangeText={setStartDate} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" />
              <Text style={styles.fieldLabel}>End Date</Text>
              <TextInput style={styles.input} value={endDate} onChangeText={setEndDate} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" />
              {totalDays > 0 && (
                <View style={styles.dayCountBanner}>
                  <Ionicons name="calendar" size={14} color={Colors.brand.blue} />
                  <Text style={styles.dayCountText}>{totalDays} working day{totalDays !== 1 ? "s" : ""}</Text>
                </View>
              )}
              <Text style={styles.fieldLabel}>Reason <Text style={{ color: Colors.light.textSecondary, fontWeight: "400" }}>(optional)</Text></Text>
              <TextInput style={[styles.input, { height: 80 }]} value={reason} onChangeText={setReason} multiline placeholder="Additional details..." />
              {!!error && <Text style={styles.errorText}>{error}</Text>}
              <Pressable onPress={submit} disabled={loading} style={[styles.submitBtn, loading && { opacity: 0.6 }]}>
                {loading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.submitBtnText}>Submit Request</Text>}
              </Pressable>
            </>
          ) : (
            <>
              {leaveRequests.length === 0 && (
                <View style={styles.emptyState}>
                  <Ionicons name="calendar-outline" size={32} color={Colors.light.border} />
                  <Text style={styles.emptyText}>No leave requests yet</Text>
                </View>
              )}
              {leaveRequests.map((r) => (
                <View key={r.id} style={styles.leaveHistoryRow}>
                  <View style={[styles.leaveStatusDot, { backgroundColor: r.status === "approved" ? "#22C55E" : r.status === "rejected" ? "#EF4444" : "#F59E0B" }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.leaveHistoryTitle}>{r.leaveType.charAt(0).toUpperCase() + r.leaveType.slice(1)} leave — {r.totalDays}d</Text>
                    <Text style={styles.leaveHistoryDates}>{r.startDate} → {r.endDate}</Text>
                    {r.reviewNotes && <Text style={styles.leaveHistoryNotes}>Manager: {r.reviewNotes}</Text>}
                  </View>
                  <View style={[styles.leaveStatusBadge, { backgroundColor: r.status === "approved" ? "#DCFCE7" : r.status === "rejected" ? "#FEE2E2" : "#FEF9C3" }]}>
                    <Text style={[styles.leaveStatusText, { color: r.status === "approved" ? "#166534" : r.status === "rejected" ? "#991B1B" : "#92400E" }]}>{r.status}</Text>
                  </View>
                </View>
              ))}
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ── Incident Report Modal ─────────────────────────────────────────────────────
function IncidentModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [incidentDate, setIncidentDate] = useState(new Date().toISOString().split("T")[0]);
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [injuryType, setInjuryType] = useState("none");
  const [personsInvolved, setPersonsInvolved] = useState("");
  const [witnessNames, setWitnessNames] = useState("");
  const [actionTaken, setActionTaken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setError("");
    if (!location.trim() || !description.trim()) { setError("Location and description are required."); return; }
    setLoading(true);
    try {
      await hrApi("/api/hr/incidents", { method: "POST", body: JSON.stringify({ incidentDate, location, description, injuryType, personsInvolved, witnessNames, actionTaken }) });
      Alert.alert("Report Submitted", "Your incident report has been logged and your manager has been notified. Retain a copy for your records.");
      setLocation(""); setDescription(""); setInjuryType("none"); setPersonsInvolved(""); setWitnessNames(""); setActionTaken("");
      onClose();
    } catch (e: any) { setError(e.message || "Failed to submit report."); }
    finally { setLoading(false); }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Incident Report</Text>
          <Pressable onPress={onClose}><Ionicons name="close" size={24} color={Colors.light.textSecondary} /></Pressable>
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
          <View style={styles.incidentWarning}>
            <Ionicons name="warning" size={16} color="#B45309" />
            <Text style={styles.incidentWarningText}>Report all accidents, near-misses and dangerous occurrences immediately, however minor. This is required by RIDDOR 2013.</Text>
          </View>
          <Text style={styles.fieldLabel}>Date of Incident</Text>
          <TextInput style={styles.input} value={incidentDate} onChangeText={setIncidentDate} placeholder="YYYY-MM-DD" />
          <Text style={styles.fieldLabel}>Location in venue</Text>
          <TextInput style={styles.input} value={location} onChangeText={setLocation} placeholder="e.g. Table 4 area, kitchen, reception" />
          <Text style={styles.fieldLabel}>What happened? <Text style={{ color: "#EF4444" }}>*</Text></Text>
          <TextInput style={[styles.input, { height: 100 }]} value={description} onChangeText={setDescription} multiline placeholder="Describe the incident in detail..." />
          <Text style={styles.fieldLabel}>Type of injury</Text>
          <View style={styles.typeRow}>
            {[["none", "None"], ["minor", "Minor"], ["medical_treatment", "Medical"], ["lost_time", "Lost Time"]].map(([val, lbl]) => (
              <Pressable key={val} onPress={() => setInjuryType(val)} style={[styles.typePill, injuryType === val && styles.typePillActive]}>
                <Text style={[styles.typePillText, injuryType === val && styles.typePillTextActive]}>{lbl}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.fieldLabel}>Persons involved</Text>
          <TextInput style={styles.input} value={personsInvolved} onChangeText={setPersonsInvolved} placeholder="Names of staff/customers involved" />
          <Text style={styles.fieldLabel}>Witness names</Text>
          <TextInput style={styles.input} value={witnessNames} onChangeText={setWitnessNames} placeholder="Names of any witnesses" />
          <Text style={styles.fieldLabel}>Immediate action taken</Text>
          <TextInput style={[styles.input, { height: 80 }]} value={actionTaken} onChangeText={setActionTaken} multiline placeholder="First aid given, area secured, etc." />
          {!!error && <Text style={styles.errorText}>{error}</Text>}
          <Pressable onPress={submit} disabled={loading} style={[styles.submitBtn, { backgroundColor: "#DC2626" }, loading && { opacity: 0.6 }]}>
            {loading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.submitBtnText}>Submit Report</Text>}
          </Pressable>
          <Text style={styles.riddorNote}>Lost-time injuries (3+ consecutive days away) must be reported to the HSE under RIDDOR 2013. Speak to your manager immediately.</Text>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ── Shift History Modal ───────────────────────────────────────────────────────
function ShiftHistoryModal({ visible, onClose, entries }: { visible: boolean; onClose: () => void; entries: any[] }) {
  const totalThisWeekMs = weekHoursMs(entries);
  const totalAllMs = entries.filter((e) => e.status !== "active" && e.clockedOutAt).reduce((sum, e) => sum + entryDurationMs(e), 0);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Shift History</Text>
          <Pressable onPress={onClose}><Ionicons name="close" size={24} color={Colors.light.textSecondary} /></Pressable>
        </View>
        <View style={styles.historyStatsRow}>
          <View style={styles.historyStatBox}>
            <Text style={styles.historyStatValue}>{formatHoursDecimal(totalThisWeekMs)}</Text>
            <Text style={styles.historyStatLabel}>This week</Text>
          </View>
          <View style={styles.historyStatBox}>
            <Text style={styles.historyStatValue}>{entries.length}</Text>
            <Text style={styles.historyStatLabel}>Total shifts</Text>
          </View>
          <View style={styles.historyStatBox}>
            <Text style={styles.historyStatValue}>{formatHoursDecimal(totalAllMs)}</Text>
            <Text style={styles.historyStatLabel}>All recorded</Text>
          </View>
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
          {entries.length === 0 && (
            <View style={styles.emptyState}>
              <Ionicons name="time-outline" size={32} color={Colors.light.border} />
              <Text style={styles.emptyText}>No shifts recorded yet</Text>
            </View>
          )}
          {entries.map((e) => (
            <View key={e.id} style={styles.shiftRow}>
              <View>
                <Text style={styles.shiftDate}>{fmtDate(e.clockedInAt)}</Text>
                <Text style={styles.shiftTime}>{fmtTime(e.clockedInAt)} — {e.clockedOutAt ? fmtTime(e.clockedOutAt) : "ongoing"}</Text>
                {e.status === "amended" && <Text style={[styles.amendedText, { fontSize: 11, marginTop: 2 }]}>Amended — {e.amendReason}</Text>}
              </View>
              <View style={styles.shiftRight}>
                <Text style={styles.shiftDuration}>{e.clockedOutAt ? formatHoursDecimal(entryDurationMs(e)) : "—"}</Text>
                {e.status === "amended" && <View style={styles.amendedBadge}><Text style={styles.amendedText}>amended</Text></View>}
              </View>
            </View>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ════════════════════════════════════════════════════════════════════════════
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.light.border, backgroundColor: Colors.light.surface },
  backBtn: { padding: 4, minWidth: 36 },
  headerTitle: { flex: 1, fontFamily: "Montserrat_700Bold", fontSize: 17, color: Colors.light.text, textAlign: "center" },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 16 },

  alertBanner: { flexDirection: "row", gap: 8, alignItems: "flex-start", padding: 12, borderRadius: 10, borderWidth: 1 },
  alertText: { fontFamily: "Montserrat_500Medium", fontSize: 12, flex: 1, lineHeight: 18 },

  clockCard: { backgroundColor: Colors.light.surface, borderRadius: 18, padding: 20, borderWidth: 1.5, borderColor: Colors.light.border, gap: 12 },
  clockCardActive: { borderColor: "#22C55E", backgroundColor: "#F0FDF4" },
  clockHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  clockDot: { width: 10, height: 10, borderRadius: 5 },
  clockStatusLabel: { fontFamily: "Montserrat_600SemiBold", fontSize: 14, color: Colors.light.text },
  clockSince: { fontFamily: "Montserrat_400Regular", fontSize: 12, color: Colors.light.textSecondary, marginLeft: "auto" },
  clockTimer: { fontFamily: "Montserrat_700Bold", fontSize: 42, color: "#166534", textAlign: "center", letterSpacing: -1 },
  clockBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 14 },
  clockBtnIn: { backgroundColor: "#22C55E" },
  clockBtnOut: { backgroundColor: "#EF4444" },
  clockBtnText: { fontFamily: "Montserrat_700Bold", fontSize: 16, color: "#fff" },
  clockGdprNote: { fontFamily: "Montserrat_400Regular", fontSize: 11, color: Colors.light.textSecondary, textAlign: "center" },

  statsRow: { flexDirection: "row", gap: 10 },
  statBox: { flex: 1, backgroundColor: Colors.light.surface, borderRadius: 14, padding: 14, alignItems: "center", gap: 4, borderWidth: 1, borderColor: Colors.light.border },
  statValue: { fontFamily: "Montserrat_700Bold", fontSize: 20, color: Colors.light.text },
  statLabel: { fontFamily: "Montserrat_400Regular", fontSize: 11, color: Colors.light.textSecondary },

  sectionTitle: { fontFamily: "Montserrat_700Bold", fontSize: 14, color: Colors.light.text, marginTop: 4 },

  actionsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  actionCard: { flex: 1, minWidth: "45%", backgroundColor: Colors.light.surface, borderRadius: 14, padding: 16, gap: 8, borderWidth: 1, borderColor: Colors.light.border, alignItems: "flex-start" },
  actionIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  actionLabel: { fontFamily: "Montserrat_600SemiBold", fontSize: 13, color: Colors.light.text },
  actionBadge: { backgroundColor: "#FEF3C7", borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 },
  actionBadgeText: { fontFamily: "Montserrat_600SemiBold", fontSize: 11, color: "#92400E" },

  leaveCard: { backgroundColor: Colors.light.surface, borderRadius: 14, borderWidth: 1, borderColor: Colors.light.border, overflow: "hidden" },
  leaveRow: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: Colors.light.border },
  leaveRowTotal: { borderBottomWidth: 0, backgroundColor: Colors.light.surfaceElevated },
  leaveRowLabel: { fontFamily: "Montserrat_400Regular", fontSize: 13, color: Colors.light.textSecondary },
  leaveRowLabelBold: { fontFamily: "Montserrat_700Bold", fontSize: 13, color: Colors.light.text },
  leaveRowValue: { fontFamily: "Montserrat_600SemiBold", fontSize: 13, color: Colors.light.text },
  leaveRowValueBold: { fontFamily: "Montserrat_700Bold", fontSize: 15 },

  shiftRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: Colors.light.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.light.border },
  shiftDate: { fontFamily: "Montserrat_600SemiBold", fontSize: 13, color: Colors.light.text },
  shiftTime: { fontFamily: "Montserrat_400Regular", fontSize: 12, color: Colors.light.textSecondary, marginTop: 2 },
  shiftRight: { alignItems: "flex-end", gap: 4 },
  shiftDuration: { fontFamily: "Montserrat_700Bold", fontSize: 15, color: Colors.brand.blue },
  amendedBadge: { backgroundColor: "#FEF3C7", borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  amendedText: { fontFamily: "Montserrat_600SemiBold", fontSize: 10, color: "#92400E" },

  emptyState: { alignItems: "center", justifyContent: "center", gap: 8, padding: 40 },
  emptyText: { fontFamily: "Montserrat_500Medium", fontSize: 14, color: Colors.light.textSecondary },

  lawNotice: { flexDirection: "row", gap: 8, alignItems: "flex-start", backgroundColor: Colors.brand.blue + "0C", padding: 12, borderRadius: 10, marginTop: 4 },
  lawNoticeText: { fontFamily: "Montserrat_400Regular", fontSize: 11, color: Colors.light.textSecondary, flex: 1, lineHeight: 17 },

  // GDPR notice
  gdprTitle: { fontFamily: "Montserrat_700Bold", fontSize: 20, color: Colors.light.text, marginBottom: 16, textAlign: "center" },
  gdprBody: { fontFamily: "Montserrat_400Regular", fontSize: 13, color: Colors.light.textSecondary, lineHeight: 21, marginBottom: 28 },
  gdprBtn: { backgroundColor: Colors.brand.blue, borderRadius: 14, paddingVertical: 16, alignItems: "center", width: "100%" },
  gdprBtnText: { fontFamily: "Montserrat_700Bold", fontSize: 16, color: "#fff" },

  // Modals
  modalContainer: { flex: 1, backgroundColor: Colors.light.background },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: Colors.light.border },
  modalTitle: { fontFamily: "Montserrat_700Bold", fontSize: 18, color: Colors.light.text },
  tabRow: { flexDirection: "row", gap: 8, paddingHorizontal: 20, paddingVertical: 12 },
  tabBtn: { flex: 1, paddingVertical: 9, borderRadius: 10, borderWidth: 1.5, borderColor: Colors.light.border, alignItems: "center" },
  tabBtnActive: { backgroundColor: Colors.brand.blue, borderColor: Colors.brand.blue },
  tabBtnText: { fontFamily: "Montserrat_600SemiBold", fontSize: 13, color: Colors.light.textSecondary },
  tabBtnTextActive: { color: "#fff" },
  fieldLabel: { fontFamily: "Montserrat_600SemiBold", fontSize: 13, color: Colors.light.text, marginBottom: 6, marginTop: 14 },
  input: { backgroundColor: Colors.light.surfaceElevated, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontFamily: "Montserrat_400Regular", fontSize: 14, color: Colors.light.text, borderWidth: 1, borderColor: Colors.light.border },
  typeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  typePill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: Colors.light.border, backgroundColor: Colors.light.surfaceElevated },
  typePillActive: { backgroundColor: Colors.brand.blue, borderColor: Colors.brand.blue },
  typePillText: { fontFamily: "Montserrat_600SemiBold", fontSize: 12, color: Colors.light.textSecondary },
  typePillTextActive: { color: "#fff" },
  dayCountBanner: { flexDirection: "row", gap: 6, alignItems: "center", backgroundColor: Colors.brand.blue + "10", borderRadius: 8, padding: 10, marginTop: 8 },
  dayCountText: { fontFamily: "Montserrat_600SemiBold", fontSize: 13, color: Colors.brand.blue },
  errorText: { fontFamily: "Montserrat_500Medium", fontSize: 13, color: "#EF4444", marginTop: 8 },
  submitBtn: { backgroundColor: Colors.brand.blue, borderRadius: 14, paddingVertical: 15, alignItems: "center", marginTop: 20 },
  submitBtnText: { fontFamily: "Montserrat_700Bold", fontSize: 15, color: "#fff" },
  leaveHistoryRow: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: Colors.light.surface, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: Colors.light.border },
  leaveStatusDot: { width: 10, height: 10, borderRadius: 5 },
  leaveHistoryTitle: { fontFamily: "Montserrat_600SemiBold", fontSize: 13, color: Colors.light.text },
  leaveHistoryDates: { fontFamily: "Montserrat_400Regular", fontSize: 12, color: Colors.light.textSecondary, marginTop: 2 },
  leaveHistoryNotes: { fontFamily: "Montserrat_400Regular", fontSize: 11, color: Colors.light.textSecondary, marginTop: 4, fontStyle: "italic" },
  leaveStatusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  leaveStatusText: { fontFamily: "Montserrat_600SemiBold", fontSize: 11 },
  incidentWarning: { flexDirection: "row", gap: 8, backgroundColor: "#FEF3C7", borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: "#F59E0B" },
  incidentWarningText: { fontFamily: "Montserrat_500Medium", fontSize: 12, color: "#92400E", flex: 1, lineHeight: 18 },
  riddorNote: { fontFamily: "Montserrat_400Regular", fontSize: 11, color: Colors.light.textSecondary, marginTop: 16, lineHeight: 17, fontStyle: "italic" },

  // History modal
  historyStatsRow: { flexDirection: "row", padding: 16, gap: 10, borderBottomWidth: 1, borderBottomColor: Colors.light.border },
  historyStatBox: { flex: 1, alignItems: "center", gap: 2 },
  historyStatValue: { fontFamily: "Montserrat_700Bold", fontSize: 18, color: Colors.brand.blue },
  historyStatLabel: { fontFamily: "Montserrat_400Regular", fontSize: 11, color: Colors.light.textSecondary },
});
