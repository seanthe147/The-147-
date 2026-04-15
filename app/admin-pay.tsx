import React, { useState, useEffect } from "react";
import {
  View, Text, ScrollView, StyleSheet, Pressable, TextInput,
  ActivityIndicator, Alert, Platform,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getApiUrl, getStaffToken } from "@/lib/query-client";
import { Colors } from "@/constants/colors";

const SSP_RATE_YEAR = "2025/26";
const SSP_WEEKLY = 118.75;
const SSP_LEL = 123.00;

type Tab = "pay" | "ssp" | "holiday";

function fmt(n: number) { return `£${n.toFixed(2)}`; }
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

async function apiFetch(path: string, opts?: RequestInit) {
  const token = getStaffToken();
  const url = new URL(path, getApiUrl());
  const res = await fetch(url.toString(), {
    ...opts,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...opts?.headers },
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message ?? "Request failed"); }
  return res.json();
}

export default function AdminPayScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { staffId, staffName } = useLocalSearchParams<{ staffId: string; staffName: string }>();
  const sid = parseInt(staffId ?? "0", 10);
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("pay");

  // Pay details
  const [payType, setPayType] = useState<"hourly" | "salary">("hourly");
  const [hourlyRate, setHourlyRate] = useState("");
  const [annualSalary, setAnnualSalary] = useState("");
  const [weeklyHours, setWeeklyHours] = useState("37.5");
  const [payLoaded, setPayLoaded] = useState(false);

  const { isLoading: payLoading, data: payQueryData } = useQuery({
    queryKey: ["/api/hr/staff/pay", sid],
    queryFn: () => apiFetch(`/api/hr/staff/${sid}/pay`),
    enabled: sid > 0,
  });

  useEffect(() => {
    if (payQueryData && !payLoaded) {
      const d = payQueryData as any;
      setPayType(d.payType ?? "hourly");
      setHourlyRate(d.hourlyRate ?? "");
      setAnnualSalary(d.annualSalary ?? "");
      setWeeklyHours(d.weeklyHours ?? "37.5");
      setPayLoaded(true);
    }
  }, [payQueryData, payLoaded]);

  const savePay = useMutation({
    mutationFn: () => apiFetch(`/api/hr/staff/${sid}/pay`, {
      method: "PUT",
      body: JSON.stringify({ payType, hourlyRate: hourlyRate || null, annualSalary: annualSalary || null, weeklyHours }),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/hr/staff/pay", sid] });
      qc.invalidateQueries({ queryKey: ["/api/hr/staff/ssp", sid] });
      qc.invalidateQueries({ queryKey: ["/api/hr/staff/holiday-pay", sid] });
      Alert.alert("Saved", "Pay details updated successfully.");
    },
    onError: (e: any) => Alert.alert("Error", e.message),
  });

  const { data: sspData, isLoading: sspLoading, error: sspErr } = useQuery({
    queryKey: ["/api/hr/staff/ssp", sid],
    queryFn: () => apiFetch(`/api/hr/staff/${sid}/ssp`),
    enabled: sid > 0 && tab === "ssp",
  });

  const { data: hpData, isLoading: hpLoading, error: hpErr } = useQuery({
    queryKey: ["/api/hr/staff/holiday-pay", sid],
    queryFn: () => apiFetch(`/api/hr/staff/${sid}/holiday-pay`),
    enabled: sid > 0 && tab === "holiday",
  });

  // Derived weekly earnings preview
  const wkEarnings = payType === "salary" && annualSalary
    ? parseFloat(annualSalary) / 52
    : payType === "hourly" && hourlyRate && weeklyHours
    ? parseFloat(hourlyRate) * parseFloat(weeklyHours)
    : 0;
  const aboveLEL = wkEarnings >= SSP_LEL;

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.root, { paddingTop: topPad }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.back}>
          <Ionicons name="chevron-back" size={24} color={Colors.light.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>{staffName ?? "Staff Member"}</Text>
          <Text style={styles.headerSub}>Pay & Statutory Calculations</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabBar}>
        {(["pay", "ssp", "holiday"] as Tab[]).map(t => (
          <Pressable key={t} onPress={() => setTab(t)} style={[styles.tabBtn, tab === t && styles.tabBtnActive]}>
            <Text style={[styles.tabBtnText, tab === t && styles.tabBtnTextActive]}>
              {t === "pay" ? "Pay Details" : t === "ssp" ? "SSP" : "Holiday Pay"}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* ── PAY DETAILS TAB ── */}
      {tab === "pay" && (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {payLoading && <ActivityIndicator color={Colors.brand.blue} style={{ marginTop: 40 }} />}
          {!payLoading && (
            <>
              <Text style={styles.sectionTitle}>Pay Type</Text>
              <View style={styles.toggleRow}>
                {(["hourly", "salary"] as const).map(pt => (
                  <Pressable key={pt} onPress={() => setPayType(pt)} style={[styles.toggleBtn, payType === pt && styles.toggleBtnActive]}>
                    <Text style={[styles.toggleBtnText, payType === pt && styles.toggleBtnTextActive]}>
                      {pt === "hourly" ? "Hourly" : "Salaried"}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {payType === "hourly" && (
                <>
                  <Text style={styles.fieldLabel}>Hourly Rate (£)</Text>
                  <TextInput
                    style={styles.input}
                    value={hourlyRate}
                    onChangeText={setHourlyRate}
                    keyboardType="decimal-pad"
                    placeholder="e.g. 12.50"
                    placeholderTextColor={Colors.light.textSecondary}
                  />
                  <Text style={styles.fieldLabel}>Contracted Hours per Week</Text>
                  <TextInput
                    style={styles.input}
                    value={weeklyHours}
                    onChangeText={setWeeklyHours}
                    keyboardType="decimal-pad"
                    placeholder="e.g. 37.5"
                    placeholderTextColor={Colors.light.textSecondary}
                  />
                </>
              )}
              {payType === "salary" && (
                <>
                  <Text style={styles.fieldLabel}>Annual Salary (£)</Text>
                  <TextInput
                    style={styles.input}
                    value={annualSalary}
                    onChangeText={setAnnualSalary}
                    keyboardType="decimal-pad"
                    placeholder="e.g. 25000"
                    placeholderTextColor={Colors.light.textSecondary}
                  />
                  <Text style={styles.fieldLabel}>Contracted Hours per Week</Text>
                  <TextInput
                    style={styles.input}
                    value={weeklyHours}
                    onChangeText={setWeeklyHours}
                    keyboardType="decimal-pad"
                    placeholder="e.g. 37.5"
                    placeholderTextColor={Colors.light.textSecondary}
                  />
                </>
              )}

              {/* Earnings preview */}
              {wkEarnings > 0 && (
                <View style={[styles.infoBox, { borderColor: aboveLEL ? "#22C55E" : "#EF4444" }]}>
                  <Text style={styles.infoBoxLabel}>Weekly earnings</Text>
                  <Text style={[styles.infoBoxValue, { color: aboveLEL ? "#22C55E" : "#EF4444" }]}>
                    {fmt(wkEarnings)} / week
                  </Text>
                  <Text style={styles.infoBoxNote}>
                    {aboveLEL
                      ? `✓ Above LEL (£${SSP_LEL}) — qualifies for SSP`
                      : `✗ Below LEL (£${SSP_LEL}) — does not qualify for SSP`}
                  </Text>
                </View>
              )}

              <View style={styles.encNote}>
                <Ionicons name="lock-closed-outline" size={13} color={Colors.light.textSecondary} />
                <Text style={styles.encNoteText}> Pay rate encrypted at rest (AES-256)</Text>
              </View>

              <Pressable
                onPress={() => savePay.mutate()}
                disabled={savePay.isPending}
                style={({ pressed }) => [styles.saveBtn, { opacity: pressed || savePay.isPending ? 0.7 : 1 }]}
              >
                {savePay.isPending
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.saveBtnText}>Save Pay Details</Text>}
              </Pressable>
            </>
          )}
        </ScrollView>
      )}

      {/* ── SSP TAB ── */}
      {tab === "ssp" && (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {sspLoading && <ActivityIndicator color={Colors.brand.blue} style={{ marginTop: 40 }} />}
          {sspErr && <Text style={styles.errText}>Failed to load SSP data</Text>}
          {sspData && (
            <>
              {/* SSP summary card */}
              <View style={[styles.summaryCard, { borderColor: sspData.qualifiesForSSP ? "#22C55E" : "#EF4444" }]}>
                <Text style={styles.summaryLabel}>SSP Rate ({SSP_RATE_YEAR})</Text>
                <Text style={styles.summaryValue}>{fmt(SSP_WEEKLY)} / week</Text>
                <View style={styles.summaryDivider} />
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryKey}>Weekly earnings</Text>
                  <Text style={styles.summaryVal}>{fmt(sspData.weeklyEarnings)}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryKey}>Lower Earnings Limit</Text>
                  <Text style={styles.summaryVal}>{fmt(SSP_LEL)}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryKey}>SSP eligible?</Text>
                  <Text style={[styles.summaryVal, { color: sspData.qualifiesForSSP ? "#22C55E" : "#EF4444", fontFamily: "Montserrat_700Bold" }]}>
                    {sspData.qualifiesForSSP ? "Yes" : "No — below LEL"}
                  </Text>
                </View>
                {sspData.qualifiesForSSP && (
                  <>
                    <View style={styles.summaryDivider} />
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryKey}>Total SSP payable</Text>
                      <Text style={[styles.summaryVal, { fontFamily: "Montserrat_700Bold", color: Colors.brand.blue }]}>{fmt(sspData.totalSSP)}</Text>
                    </View>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryKey}>SSP days paid</Text>
                      <Text style={styles.summaryVal}>{sspData.totalPayableDays} days ({sspData.totalSSPWeeks} wks of {sspData.maxWeeks} max)</Text>
                    </View>
                    {sspData.limitReached && (
                      <Text style={styles.limitWarn}>⚠ 28-week SSP limit reached — employer obligation has ended</Text>
                    )}
                  </>
                )}
              </View>

              {!sspData.qualifiesForSSP && sspData.weeklyEarnings === 0 && (
                <View style={styles.noPay}>
                  <Ionicons name="alert-circle-outline" size={32} color="#F59E0B" />
                  <Text style={styles.noPayText}>No pay rate set. Go to the Pay Details tab to add this person's hourly rate or salary before calculating SSP.</Text>
                </View>
              )}

              {/* Period breakdown */}
              {sspData.periods.length === 0 && (
                <View style={styles.emptyState}>
                  <Ionicons name="medkit-outline" size={36} color={Colors.light.textSecondary} />
                  <Text style={styles.emptyStateText}>No approved sick leave on record</Text>
                </View>
              )}

              {sspData.periods.length > 0 && (
                <>
                  <Text style={styles.sectionTitle}>Sick Leave Breakdown</Text>
                  {sspData.periods.map((p: any) => (
                    <View key={p.id} style={styles.periodCard}>
                      <View style={styles.periodHeader}>
                        <Text style={styles.periodDates}>{fmtDate(p.startDate)} – {fmtDate(p.endDate)}</Text>
                        <View style={[styles.badge, p.isPIW ? { backgroundColor: "#22C55E20" } : { backgroundColor: "#6B728020" }]}>
                          <Text style={[styles.badgeText, { color: p.isPIW ? "#15803D" : "#6B7280" }]}>
                            {p.isPIW ? (p.isLinked ? "Linked PIW" : "PIW") : "Not a PIW"}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.periodRow}>
                        <Text style={styles.periodKey}>Calendar days</Text>
                        <Text style={styles.periodVal}>{p.calendarDays}</Text>
                      </View>
                      <View style={styles.periodRow}>
                        <Text style={styles.periodKey}>Working days absent</Text>
                        <Text style={styles.periodVal}>{p.workingDays}</Text>
                      </View>
                      {p.isPIW && (
                        <>
                          <View style={styles.periodRow}>
                            <Text style={styles.periodKey}>Waiting days</Text>
                            <Text style={styles.periodVal}>{p.waitingWorkingDays} working days</Text>
                          </View>
                          <View style={styles.periodRow}>
                            <Text style={styles.periodKey}>SSP payable days</Text>
                            <Text style={styles.periodVal}>{p.payableDays}</Text>
                          </View>
                          <View style={[styles.periodRow, styles.periodRowTotal]}>
                            <Text style={styles.periodKeyBold}>SSP amount</Text>
                            <Text style={[styles.periodValBold, { color: p.sspAmount > 0 ? Colors.brand.blue : Colors.light.textSecondary }]}>
                              {fmt(p.sspAmount)}
                            </Text>
                          </View>
                        </>
                      )}
                      {p.notes ? <Text style={styles.periodNote}>{p.notes}</Text> : null}
                    </View>
                  ))}
                </>
              )}

              <View style={styles.disclaimerBox}>
                <Ionicons name="information-circle-outline" size={14} color={Colors.light.textSecondary} />
                <Text style={styles.disclaimerText}> {sspData.disclaimer}</Text>
              </View>
            </>
          )}
        </ScrollView>
      )}

      {/* ── HOLIDAY PAY TAB ── */}
      {tab === "holiday" && (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {hpLoading && <ActivityIndicator color={Colors.brand.blue} style={{ marginTop: 40 }} />}
          {hpErr && <Text style={styles.errText}>Failed to load holiday pay data</Text>}
          {hpData && (
            <>
              {!hpData.hasPay && (
                <View style={styles.noPay}>
                  <Ionicons name="alert-circle-outline" size={32} color="#F59E0B" />
                  <Text style={styles.noPayText}>No pay rate set. Go to the Pay Details tab to add this person's hourly rate or salary before calculating holiday pay.</Text>
                </View>
              )}

              {hpData.hasPay && (
                <View style={[styles.summaryCard, { borderColor: Colors.brand.blue }]}>
                  <Text style={styles.summaryLabel}>
                    {hpData.payType === "salary" ? "Salaried — Daily Rate" : "Hourly Rate — Daily Equivalent"}
                  </Text>
                  <Text style={styles.summaryValue}>{fmt(hpData.dailyRate)} / day</Text>
                  <View style={styles.summaryDivider} />
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryKey}>Contracted days/week</Text>
                    <Text style={styles.summaryVal}>{hpData.contractedDaysPerWeek}</Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryKey}>Weekly hours</Text>
                    <Text style={styles.summaryVal}>{hpData.weeklyHours}</Text>
                  </View>
                  {hpData.payType === "salary" && (
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryKey}>Annual salary</Text>
                      <Text style={styles.summaryVal}>{fmt(hpData.annualSalary)}</Text>
                    </View>
                  )}
                  {hpData.payType === "hourly" && (
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryKey}>Hourly rate</Text>
                      <Text style={styles.summaryVal}>{fmt(hpData.hourlyRate)}/hr</Text>
                    </View>
                  )}
                  <View style={styles.summaryDivider} />
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryKey}>Total holiday pay (approved)</Text>
                    <Text style={[styles.summaryVal, { fontFamily: "Montserrat_700Bold", color: Colors.brand.blue }]}>{fmt(hpData.totalApprovedHolidayPay)}</Text>
                  </View>
                  {hpData.totalPendingHolidayPay > 0 && (
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryKey}>Pending leave pay</Text>
                      <Text style={[styles.summaryVal, { color: "#F59E0B" }]}>{fmt(hpData.totalPendingHolidayPay)}</Text>
                    </View>
                  )}
                  <Text style={styles.payNote}>{hpData.note}</Text>
                </View>
              )}

              {hpData.results.length === 0 && (
                <View style={styles.emptyState}>
                  <Ionicons name="umbrella-outline" size={36} color={Colors.light.textSecondary} />
                  <Text style={styles.emptyStateText}>No annual leave on record</Text>
                </View>
              )}

              {hpData.results.length > 0 && (
                <>
                  <Text style={styles.sectionTitle}>Leave Periods</Text>
                  {hpData.results.map((r: any) => (
                    <View key={r.id} style={styles.periodCard}>
                      <View style={styles.periodHeader}>
                        <Text style={styles.periodDates}>{fmtDate(r.startDate)} – {fmtDate(r.endDate)}</Text>
                        <View style={[styles.badge, r.status === "approved" ? { backgroundColor: "#22C55E20" } : r.status === "pending" ? { backgroundColor: "#F59E0B20" } : { backgroundColor: "#EF444420" }]}>
                          <Text style={[styles.badgeText, { color: r.status === "approved" ? "#15803D" : r.status === "pending" ? "#B45309" : "#B91C1C" }]}>
                            {r.status}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.periodRow}>
                        <Text style={styles.periodKey}>Days taken</Text>
                        <Text style={styles.periodVal}>{r.days}</Text>
                      </View>
                      <View style={styles.periodRow}>
                        <Text style={styles.periodKey}>Daily rate</Text>
                        <Text style={styles.periodVal}>{fmt(r.dailyRate)}</Text>
                      </View>
                      <View style={[styles.periodRow, styles.periodRowTotal]}>
                        <Text style={styles.periodKeyBold}>Holiday pay</Text>
                        <Text style={[styles.periodValBold, { color: Colors.brand.blue }]}>{fmt(r.holidayPay)}</Text>
                      </View>
                    </View>
                  ))}
                </>
              )}

              {hpData.hasPay && (
                <View style={styles.disclaimerBox}>
                  <Ionicons name="information-circle-outline" size={14} color={Colors.light.textSecondary} />
                  <Text style={styles.disclaimerText}> {hpData.disclaimer}</Text>
                </View>
              )}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.light.background },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 12, gap: 8, borderBottomWidth: 1, borderBottomColor: Colors.light.border },
  back: { padding: 4 },
  headerTitle: { fontFamily: "Montserrat_700Bold", fontSize: 17, color: Colors.light.text },
  headerSub: { fontFamily: "Montserrat_400Regular", fontSize: 12, color: Colors.light.textSecondary },
  tabBar: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: Colors.light.border },
  tabBtn: { flex: 1, paddingVertical: 12, alignItems: "center", borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabBtnActive: { borderBottomColor: Colors.brand.blue },
  tabBtnText: { fontFamily: "Montserrat_500Medium", fontSize: 13, color: Colors.light.textSecondary },
  tabBtnTextActive: { color: Colors.brand.blue, fontFamily: "Montserrat_600SemiBold" },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 48 },
  sectionTitle: { fontFamily: "Montserrat_600SemiBold", fontSize: 14, color: Colors.light.text, marginTop: 16, marginBottom: 10 },
  toggleRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  toggleBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1.5, borderColor: Colors.light.border, alignItems: "center" },
  toggleBtnActive: { borderColor: Colors.brand.blue, backgroundColor: "#EFF6FF" },
  toggleBtnText: { fontFamily: "Montserrat_500Medium", fontSize: 14, color: Colors.light.textSecondary },
  toggleBtnTextActive: { color: Colors.brand.blue, fontFamily: "Montserrat_700Bold" },
  fieldLabel: { fontFamily: "Montserrat_500Medium", fontSize: 13, color: Colors.light.text, marginBottom: 6 },
  input: { borderWidth: 1.5, borderColor: Colors.light.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontFamily: "Montserrat_400Regular", fontSize: 15, color: Colors.light.text, backgroundColor: "#FAFAFA", marginBottom: 14 },
  infoBox: { borderWidth: 1.5, borderRadius: 12, padding: 14, marginBottom: 16 },
  infoBoxLabel: { fontFamily: "Montserrat_500Medium", fontSize: 12, color: Colors.light.textSecondary, marginBottom: 2 },
  infoBoxValue: { fontFamily: "Montserrat_700Bold", fontSize: 22 },
  infoBoxNote: { fontFamily: "Montserrat_400Regular", fontSize: 12, color: Colors.light.textSecondary, marginTop: 4 },
  encNote: { flexDirection: "row", alignItems: "center", marginBottom: 20 },
  encNoteText: { fontFamily: "Montserrat_400Regular", fontSize: 11, color: Colors.light.textSecondary },
  saveBtn: { backgroundColor: Colors.brand.blue, borderRadius: 12, paddingVertical: 15, alignItems: "center" },
  saveBtnText: { fontFamily: "Montserrat_700Bold", fontSize: 15, color: "#fff" },
  summaryCard: { borderWidth: 1.5, borderRadius: 14, padding: 16, marginBottom: 16 },
  summaryLabel: { fontFamily: "Montserrat_500Medium", fontSize: 12, color: Colors.light.textSecondary },
  summaryValue: { fontFamily: "Montserrat_700Bold", fontSize: 26, color: Colors.light.text, marginBottom: 4 },
  summaryDivider: { height: 1, backgroundColor: Colors.light.border, marginVertical: 10 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  summaryKey: { fontFamily: "Montserrat_400Regular", fontSize: 13, color: Colors.light.textSecondary },
  summaryVal: { fontFamily: "Montserrat_500Medium", fontSize: 13, color: Colors.light.text },
  limitWarn: { fontFamily: "Montserrat_600SemiBold", fontSize: 12, color: "#EF4444", marginTop: 8 },
  noPay: { alignItems: "center", padding: 24, backgroundColor: "#FFFBEB", borderRadius: 14, gap: 10, marginBottom: 16 },
  noPayText: { fontFamily: "Montserrat_400Regular", fontSize: 13, color: Colors.light.text, textAlign: "center", lineHeight: 20 },
  emptyState: { alignItems: "center", paddingVertical: 48, gap: 10 },
  emptyStateText: { fontFamily: "Montserrat_400Regular", fontSize: 14, color: Colors.light.textSecondary },
  periodCard: { borderWidth: 1, borderColor: Colors.light.border, borderRadius: 12, padding: 14, marginBottom: 10 },
  periodHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  periodDates: { fontFamily: "Montserrat_600SemiBold", fontSize: 13, color: Colors.light.text },
  badge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontFamily: "Montserrat_600SemiBold", fontSize: 11 },
  periodRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  periodRowTotal: { borderTopWidth: 1, borderTopColor: Colors.light.border, marginTop: 8, paddingTop: 8 },
  periodKey: { fontFamily: "Montserrat_400Regular", fontSize: 13, color: Colors.light.textSecondary },
  periodVal: { fontFamily: "Montserrat_500Medium", fontSize: 13, color: Colors.light.text },
  periodKeyBold: { fontFamily: "Montserrat_600SemiBold", fontSize: 13, color: Colors.light.text },
  periodValBold: { fontFamily: "Montserrat_700Bold", fontSize: 15 },
  periodNote: { fontFamily: "Montserrat_400Regular", fontSize: 11, color: Colors.light.textSecondary, marginTop: 6, fontStyle: "italic" },
  payNote: { fontFamily: "Montserrat_400Regular", fontSize: 11, color: Colors.light.textSecondary, marginTop: 10, lineHeight: 16 },
  disclaimerBox: { flexDirection: "row", alignItems: "flex-start", backgroundColor: "#F9FAFB", borderRadius: 10, padding: 12, marginTop: 16 },
  disclaimerText: { fontFamily: "Montserrat_400Regular", fontSize: 11, color: Colors.light.textSecondary, flex: 1, lineHeight: 16 },
  errText: { fontFamily: "Montserrat_400Regular", fontSize: 14, color: "#EF4444", textAlign: "center", marginTop: 40 },
});
