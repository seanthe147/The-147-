import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, Modal, TextInput,
  ActivityIndicator, Alert, Platform, RefreshControl, Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { getApiUrl, getStaffToken } from "@/lib/query-client";
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
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = getStaffToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const r = await fetch(url, { credentials: "include", headers, ...opts });
  if (!r.ok) { const body = await r.json().catch(() => ({})); throw new Error(body.message || `HTTP ${r.status}`); }
  return r.json();
}

function getWeekMonday(date: Date = new Date()): Date {
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

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

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
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [rotaWeekStart, setRotaWeekStart] = useState<Date>(() => getWeekMonday());

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

  const rotaWeekStr = dateToStr(rotaWeekStart);
  const { data: rotaData, refetch: refetchRota } = useQuery({
    queryKey: ["/api/hr/rota/my", rotaWeekStr],
    queryFn: () => hrApi(`/api/hr/rota/my?weekStart=${rotaWeekStr}`),
    enabled: isAuthenticated && gdprAccepted === true,
  });

  // Register push token once auth + GDPR accepted
  useEffect(() => {
    if (!isAuthenticated || gdprAccepted !== true || Platform.OS === "web") return;
    (async () => {
      try {
        const { status } = await Notifications.requestPermissionsAsync();
        if (status !== "granted") return;
        const tokenData = await Notifications.getExpoPushTokenAsync();
        const pushToken = tokenData.data;
        await hrApi("/api/hr/staff-push-token", { method: "POST", body: JSON.stringify({ token: pushToken }) });
      } catch {
        // non-critical — silently ignore
      }
    })();
  }, [isAuthenticated, gdprAccepted]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchClock(), refetchEntries(), refetchBalance(), refetchLeave(), refetchRota()]);
    setRefreshing(false);
  }, [refetchClock, refetchEntries, refetchBalance, refetchLeave, refetchRota]);

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
      const msg: string = err.message || "";
      const isAuthError = msg.toLowerCase().includes("authentication") || msg.toLowerCase().includes("expired") || msg.toLowerCase().includes("invalid");
      if (isAuthError) {
        Alert.alert(
          "Session Expired",
          "Your session has expired. Please log in again.",
          [{ text: "Log In", onPress: () => router.replace("/staff-portal") }],
        );
      } else {
        Alert.alert("Error", msg || "Failed to record attendance. Please try again.");
      }
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
            icon="document-text-outline"
            label="Leave History"
            colour="#0369A1"
            onPress={() => setShowLeaveModal(true)}
          />
          <ActionCard
            icon="time-outline"
            label="Shift History"
            colour="#065F46"
            onPress={() => setShowHistoryModal(true)}
          />
          <ActionCard
            icon="person-circle-outline"
            label="My Details"
            colour="#B45309"
            onPress={() => router.push("/staff-onboarding")}
          />
        </View>

        {/* Leave balance detail */}
        {leaveBalance && (
          <>
            <Text style={styles.sectionTitle}>Annual Leave — {leaveBalance.leaveYearLabel ?? new Date().getFullYear()}</Text>
            <View style={styles.leaveCard}>
              {leaveBalance.isProRata && (
                <View style={[styles.leaveRow, { marginBottom: 4 }]}>
                  <Text style={[styles.leaveRowLabel, { color: "#7C3AED", fontWeight: "600" as const }]}>Pro-rata ({leaveBalance.monthsAccrued}/12 months)</Text>
                </View>
              )}
              <LeaveRow label={`Entitlement (${leaveBalance.contractedDaysPerWeek}d/week × 5.6 wks)`} value={`${leaveBalance.actualEntitlement} days`} />
              {parseFloat(String(leaveBalance.carryOver ?? 0)) > 0 && (
                <LeaveRow label={`Carried over${leaveBalance.carryOverCapped ? " (capped)" : ""}`} value={`+${(leaveBalance.carryOver as number).toFixed(1)} days`} />
              )}
              <LeaveRow label="Total entitlement" value={`${(leaveBalance.totalEntitlement as number).toFixed(1)} days`} />
              <LeaveRow label="Annual leave taken" value={`−${(leaveBalance.annualLeaveUsed as number).toFixed(1)} days`} colour="#EF4444" />
              {(leaveBalance.pendingAnnualDays as number) > 0 && (
                <LeaveRow label="Pending approval" value={`${(leaveBalance.pendingAnnualDays as number).toFixed(1)} days`} colour="#F59E0B" />
              )}
              <View style={[styles.leaveRow, styles.leaveRowTotal]}>
                <Text style={styles.leaveRowLabelBold}>Remaining</Text>
                <Text style={[styles.leaveRowValueBold, { color: leaveBalance.remaining < 5 ? "#EF4444" : "#22C55E" }]}>
                  {(leaveBalance.remaining as number).toFixed(1)} days
                </Text>
              </View>
            </View>
            {((leaveBalance.sickDaysThisYear as number) > 0 || (leaveBalance.unpaidDaysThisYear as number) > 0) && (
              <>
                <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Other Leave (not deducted from annual)</Text>
                <View style={styles.leaveCard}>
                  {(leaveBalance.sickDaysThisYear as number) > 0 && (
                    <LeaveRow label="Sick leave recorded" value={`${(leaveBalance.sickDaysThisYear as number).toFixed(1)} days`} colour="#6B7280" />
                  )}
                  {(leaveBalance.unpaidDaysThisYear as number) > 0 && (
                    <LeaveRow label="Unpaid leave recorded" value={`${(leaveBalance.unpaidDaysThisYear as number).toFixed(1)} days`} colour="#6B7280" />
                  )}
                </View>
              </>
            )}
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

        {/* My Rota */}
        <View style={styles.rotaHeader}>
          <Text style={styles.sectionTitle}>My Rota</Text>
          <View style={styles.rotaNav}>
            <Pressable
              onPress={() => { const d = new Date(rotaWeekStart); d.setDate(d.getDate() - 7); setRotaWeekStart(d); }}
              style={({ pressed }) => [styles.rotaNavBtn, pressed && { opacity: 0.6 }]}
            >
              <Ionicons name="chevron-back" size={18} color={Colors.brand.blue} />
            </Pressable>
            <Text style={styles.rotaWeekLabel}>
              {rotaWeekStart.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
              {" — "}
              {(() => { const e = new Date(rotaWeekStart); e.setDate(e.getDate() + 6); return e.toLocaleDateString("en-GB", { day: "numeric", month: "short" }); })()}
            </Text>
            <Pressable
              onPress={() => { const d = new Date(rotaWeekStart); d.setDate(d.getDate() + 7); setRotaWeekStart(d); }}
              style={({ pressed }) => [styles.rotaNavBtn, pressed && { opacity: 0.6 }]}
            >
              <Ionicons name="chevron-forward" size={18} color={Colors.brand.blue} />
            </Pressable>
          </View>
        </View>

        {rotaData == null ? (
          <ActivityIndicator size="small" color={Colors.brand.blue} style={{ marginVertical: 12 }} />
        ) : !rotaData.published ? (
          <View style={styles.rotaUnpublished}>
            <Ionicons name="time-outline" size={22} color={Colors.light.textSecondary} />
            <Text style={styles.rotaUnpublishedText}>Rota not yet published for this week</Text>
          </View>
        ) : (rotaData.shifts as any[]).length === 0 ? (
          <View style={styles.rotaUnpublished}>
            <Ionicons name="calendar-outline" size={22} color={Colors.light.textSecondary} />
            <Text style={styles.rotaUnpublishedText}>No shifts scheduled for this week</Text>
          </View>
        ) : (
          <View style={styles.rotaDays}>
            {DAY_NAMES.map((dayName, idx) => {
              const dayShifts = (rotaData.shifts as any[]).filter((s: any) => s.dayOfWeek === idx);
              const dayDate = new Date(rotaWeekStart);
              dayDate.setDate(dayDate.getDate() + idx);
              const isToday = dayDate.toDateString() === new Date().toDateString();
              return (
                <View key={idx} style={[styles.rotaDayRow, isToday && styles.rotaDayRowToday]}>
                  <View style={[styles.rotaDayLabel, isToday && styles.rotaDayLabelToday]}>
                    <Text style={[styles.rotaDayName, isToday && { color: "#fff" }]}>{dayName}</Text>
                    <Text style={[styles.rotaDayDate, isToday && { color: "rgba(255,255,255,0.8)" }]}>{dayDate.getDate()}</Text>
                  </View>
                  <View style={styles.rotaDayShifts}>
                    {dayShifts.length === 0 ? (
                      <Text style={styles.rotaDayOff}>Off</Text>
                    ) : dayShifts.map((s: any, si: number) => (
                      <View key={si} style={styles.rotaShiftChip}>
                        <Text style={styles.rotaShiftTime}>{s.shiftStart} – {s.shiftEnd}</Text>
                        {s.role && <Text style={styles.rotaShiftRole}>{s.role}</Text>}
                      </View>
                    ))}
                  </View>
                </View>
              );
            })}
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
  const privacyUrl = `${getApiUrl().replace(/\/api$/, "")}/staff-privacy-notice`;
  return (
    <View style={[styles.container, styles.centered, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20, paddingHorizontal: 24 }]}>
      <Ionicons name="shield-checkmark" size={48} color={Colors.brand.blue} style={{ marginBottom: 20 }} />
      <Text style={styles.gdprTitle}>Data & Privacy Notice</Text>
      <Text style={styles.gdprBody}>
        The 147 Bradford collects and stores your attendance and leave data to meet employment law obligations under the Working Time Regulations 1998.{"\n\n"}
        <Text style={{ fontWeight: "700" }}>What we collect:</Text>
        {"\n"}• Clock-in and clock-out times{"\n"}• GPS coordinates at clock-in/out (on-site verification only){"\n"}• Leave requests and approvals{"\n"}• Incident reports{"\n\n"}
        <Text style={{ fontWeight: "700" }}>Your rights (UK GDPR):</Text>
        {"\n"}• Access all data held about you{"\n"}• Request correction of errors{"\n"}• Request deletion when you leave (subject to legal retention){"\n\n"}
        <Text style={{ fontWeight: "700" }}>Retention:</Text> GPS removed after 3 years. Employment records kept for 7 years as required by UK law.{"\n\n"}
        Location is only captured at the moment of clocking in or out — not continuously tracked.
      </Text>
      <Pressable
        onPress={() => Linking.openURL(privacyUrl)}
        style={{ marginBottom: 12 }}
      >
        <Text style={{ fontSize: 13, color: Colors.brand.blue, textDecorationLine: "underline", textAlign: "center" }}>
          View full Staff Privacy Notice →
        </Text>
      </Pressable>
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

const LEAVE_TYPE_LABELS: Record<string, string> = {
  annual: "Annual Leave",
  sick: "Sick Leave",
  unpaid: "Unpaid Leave",
  other: "Other",
};

const LEAVE_TYPE_COLOURS: Record<string, string> = {
  annual: "#0047AB",
  sick: "#DC2626",
  unpaid: "#6B7280",
  other: "#92400E",
};

// ── Leave Request Modal ───────────────────────────────────────────────────────
function LeaveRequestModal({ visible, onClose, onSuccess, leaveRequests }: { visible: boolean; onClose: () => void; onSuccess: () => void; leaveRequests: any[] }) {
  const [tab, setTab] = useState<"request" | "history">("request");
  const [leaveType, setLeaveType] = useState("annual");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Server-side working day preview (excludes weekends + England/Wales bank holidays)
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  const datesValid = dateRegex.test(startDate) && dateRegex.test(endDate) && endDate >= startDate;
  const { data: previewData, isFetching: previewLoading } = useQuery({
    queryKey: ["/api/hr/leave-preview", startDate, endDate],
    queryFn: () => hrApi(`/api/hr/leave-preview?startDate=${startDate}&endDate=${endDate}`),
    enabled: datesValid,
    staleTime: 60_000,
  });
  const previewDays: number = previewData?.workingDays ?? 0;

  async function submit() {
    setError("");
    if (!startDate || !endDate) { setError("Please enter start and end dates."); return; }
    if (!datesValid) { setError("End date must be on or after start date (YYYY-MM-DD format)."); return; }
    if (previewDays <= 0) { setError("No working days in the selected range — weekends and bank holidays are excluded."); return; }
    setLoading(true);
    try {
      // totalDays is calculated server-side; we do NOT send it to prevent manipulation
      await hrApi("/api/hr/leave-requests", { method: "POST", body: JSON.stringify({ leaveType, startDate, endDate, reason }) });
      setStartDate(""); setEndDate(""); setReason(""); setLeaveType("annual");
      onSuccess();
      if (Platform.OS === "web") window.alert("Request Submitted\n\nYour leave request has been sent to your manager for approval.");
      else Alert.alert("Request Submitted", "Your leave request has been sent to your manager for approval.");
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
              {leaveType === "sick" && (
                <View style={styles.infoBox}>
                  <Ionicons name="information-circle-outline" size={14} color="#0369A1" />
                  <Text style={styles.infoBoxText}>Sick leave does not deduct from your annual leave allowance.</Text>
                </View>
              )}
              {leaveType === "annual" && (
                <View style={styles.infoBox}>
                  <Ionicons name="information-circle-outline" size={14} color="#0369A1" />
                  <Text style={styles.infoBoxText}>Working days only. Weekends and England & Wales bank holidays are automatically excluded.</Text>
                </View>
              )}
              <Text style={styles.fieldLabel}>Start Date</Text>
              <TextInput style={styles.input} value={startDate} onChangeText={setStartDate} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" />
              <Text style={styles.fieldLabel}>End Date</Text>
              <TextInput style={styles.input} value={endDate} onChangeText={setEndDate} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" />
              {datesValid && (
                <View style={styles.dayCountBanner}>
                  {previewLoading
                    ? <ActivityIndicator size="small" color={Colors.brand.blue} />
                    : <>
                        <Ionicons name="calendar" size={14} color={Colors.brand.blue} />
                        <Text style={styles.dayCountText}>
                          {previewDays > 0
                            ? `${previewDays} working day${previewDays !== 1 ? "s" : ""} (excl. weekends & bank holidays)`
                            : "No working days in this range"}
                        </Text>
                      </>
                  }
                </View>
              )}
              <Text style={styles.fieldLabel}>Reason <Text style={{ color: Colors.light.textSecondary, fontWeight: "400" }}>(optional)</Text></Text>
              <TextInput style={[styles.input, { height: 80 }]} value={reason} onChangeText={setReason} multiline placeholder="Additional details..." />
              {!!error && <Text style={styles.errorText}>{error}</Text>}
              <Pressable onPress={submit} disabled={loading || (datesValid && previewDays <= 0)} style={[styles.submitBtn, (loading || (datesValid && previewDays <= 0)) && { opacity: 0.5 }]}>
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
              {leaveRequests.map((r) => {
                const typeLabel = LEAVE_TYPE_LABELS[r.leaveType] ?? r.leaveType;
                const typeColour = LEAVE_TYPE_COLOURS[r.leaveType] ?? "#374151";
                const countsTowardBalance = r.leaveType === "annual";
                return (
                  <View key={r.id} style={styles.leaveHistoryRow}>
                    <View style={[styles.leaveStatusDot, { backgroundColor: r.status === "approved" ? "#22C55E" : r.status === "rejected" ? "#EF4444" : "#F59E0B" }]} />
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Text style={[styles.leaveHistoryTitle, { color: typeColour }]}>{typeLabel}</Text>
                        <Text style={styles.leaveHistoryTitle}>— {r.totalDays}d</Text>
                      </View>
                      <Text style={styles.leaveHistoryDates}>{r.startDate} → {r.endDate}</Text>
                      {!countsTowardBalance && r.status === "approved" && (
                        <Text style={{ fontSize: 11, color: "#6B7280" }}>Does not affect annual balance</Text>
                      )}
                      {r.reviewNotes && <Text style={styles.leaveHistoryNotes}>Manager: {r.reviewNotes}</Text>}
                    </View>
                    <View style={[styles.leaveStatusBadge, { backgroundColor: r.status === "approved" ? "#DCFCE7" : r.status === "rejected" ? "#FEE2E2" : "#FEF9C3" }]}>
                      <Text style={[styles.leaveStatusText, { color: r.status === "approved" ? "#166534" : r.status === "rejected" ? "#991B1B" : "#92400E" }]}>{r.status}</Text>
                    </View>
                  </View>
                );
              })}
            </>
          )}
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
  dayCountText: { fontFamily: "Montserrat_600SemiBold", fontSize: 12, color: Colors.brand.blue, flex: 1 },
  infoBox: { flexDirection: "row", gap: 6, alignItems: "flex-start", backgroundColor: "#EFF6FF", borderRadius: 8, padding: 10, marginVertical: 8 },
  infoBoxText: { fontFamily: "Montserrat_500Medium", fontSize: 12, color: "#0369A1", flex: 1, lineHeight: 17 },
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
  // History modal
  historyStatsRow: { flexDirection: "row", padding: 16, gap: 10, borderBottomWidth: 1, borderBottomColor: Colors.light.border },
  historyStatBox: { flex: 1, alignItems: "center", gap: 2 },
  historyStatValue: { fontFamily: "Montserrat_700Bold", fontSize: 18, color: Colors.brand.blue },
  historyStatLabel: { fontFamily: "Montserrat_400Regular", fontSize: 11, color: Colors.light.textSecondary },

  // My Rota
  rotaHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  rotaNav: { flexDirection: "row", alignItems: "center", gap: 6 },
  rotaNavBtn: { padding: 6 },
  rotaWeekLabel: { fontFamily: "Montserrat_600SemiBold", fontSize: 12, color: Colors.light.textSecondary },
  rotaUnpublished: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: Colors.light.surface, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: Colors.light.border },
  rotaUnpublishedText: { fontFamily: "Montserrat_500Medium", fontSize: 13, color: Colors.light.textSecondary, flex: 1 },
  rotaDays: { backgroundColor: Colors.light.surface, borderRadius: 14, borderWidth: 1, borderColor: Colors.light.border, overflow: "hidden" },
  rotaDayRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: Colors.light.border },
  rotaDayRowToday: { backgroundColor: Colors.brand.blue + "08" },
  rotaDayLabel: { width: 40, alignItems: "center", backgroundColor: Colors.light.surfaceElevated, borderRadius: 8, paddingVertical: 6, marginRight: 12 },
  rotaDayLabelToday: { backgroundColor: Colors.brand.blue },
  rotaDayName: { fontFamily: "Montserrat_700Bold", fontSize: 11, color: Colors.light.textSecondary },
  rotaDayDate: { fontFamily: "Montserrat_700Bold", fontSize: 15, color: Colors.light.text, marginTop: 1 },
  rotaDayShifts: { flex: 1, gap: 4 },
  rotaDayOff: { fontFamily: "Montserrat_400Regular", fontSize: 13, color: Colors.light.textSecondary },
  rotaShiftChip: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: Colors.brand.blue + "12", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, alignSelf: "flex-start" },
  rotaShiftTime: { fontFamily: "Montserrat_600SemiBold", fontSize: 13, color: Colors.brand.blue },
  rotaShiftRole: { fontFamily: "Montserrat_400Regular", fontSize: 11, color: Colors.brand.blue + "BB" },
});
