import React, { useState, useMemo, useContext, useEffect } from "react";
import { Linking } from "react-native";
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Platform,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BottomTabBarHeightContext } from "@react-navigation/bottom-tabs";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient, getApiUrl } from "@/lib/query-client";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import { useCustomerGreeting } from "@/hooks/useCustomerGreeting";
import { useResponsive } from "@/hooks/useResponsive";
import Colors from "@/constants/colors";
import { useColors } from "@/hooks/useColors";
const baseColors = Colors;
import { TABLE_TYPES } from "@/lib/data";

interface VenueRewardTier {
  id: number;
  name: string;
  description: string | null;
  category: string;
  pointsCost: number;
  active: boolean;
}

interface VenueRewardClaim {
  id: number;
  tierId: number;
  claimCode: string;
  status: string;
  pointsDeducted: number;
  expiresAt: string;
  tierName?: string;
}

interface VenueRewardsResponse {
  tiers: VenueRewardTier[];
  pendingClaims: VenueRewardClaim[];
}

const BOOKING_HOURS = [
  "10:00", "10:15", "10:30", "10:45",
  "11:00", "11:15", "11:30", "11:45",
  "12:00", "12:15", "12:30", "12:45",
  "13:00", "13:15", "13:30", "13:45",
  "14:00", "14:15", "14:30", "14:45",
  "15:00", "15:15", "15:30", "15:45",
  "16:00", "16:15", "16:30", "16:45",
  "17:00", "17:15", "17:30", "17:45",
  "18:00", "18:15", "18:30", "18:45",
  "19:00", "19:15", "19:30", "19:45",
  "20:00", "20:15", "20:30", "20:45",
  "21:00", "21:15", "21:30", "21:45",
  "22:00", "22:15", "22:30", "22:45",
  "23:00",
];

const ALL_DURATION_OPTIONS = [1, 2, 3, 4];
const STANDARD_DURATION_OPTIONS = [1, 2, 3];

const SNOOKER_TABLES = Array.from({ length: 10 }, (_, i) => (i + 1).toString());
const POOL_TABLES = Array.from({ length: 6 }, (_, i) => (i + 1).toString());
const GUEST_COUNT_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];

const MAX_WEEKS_AHEAD = 26;

function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Parses a YYYY-MM-DD string as LOCAL midnight — avoids iOS JSC timezone ambiguity
function parseDateLocal(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function isDiningDay(dateStr: string): boolean {
  const d = parseDateLocal(dateStr);
  const dow = d.getDay(); // 0=Sun, 3=Wed, 4=Thu, 5=Fri, 6=Sat
  return [0, 3, 4, 5, 6].includes(dow);
}

function getWeekDays(weekOffset: number): Array<{ label: string; date: string; dayName: string; dayNum: string; monthLabel: string }> {
  const days: Array<{ label: string; date: string; dayName: string; dayNum: string; monthLabel: string }> = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() + weekOffset * 7);
  for (let i = 0; i < 7; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    const date = localDateStr(d);
    const dayName = d.toLocaleDateString("en-GB", { weekday: "short" });
    const dayNum = d.getDate().toString();
    const monthLabel = d.toLocaleDateString("en-GB", { month: "short" });
    const diffDays = Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    const label = diffDays === 0 ? "Today" : diffDays === 1 ? "Tmrw" : dayName;
    days.push({ label, date, dayName, dayNum, monthLabel });
  }
  return days;
}

type Step = "table" | "datetime" | "details" | "confirm" | "success" | "deposit";

const DEPOSIT_GUEST_THRESHOLD = 7;

export default function BookScreen() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { tabletPad } = useResponsive();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0;

  const [step, setStep] = useState<Step>("table");
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [selectedTableNumber, setSelectedTableNumber] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [duration, setDuration] = useState(1);
  const [guestCount, setGuestCount] = useState(2);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [gdprConsent, setGdprConsent] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);
  const [depositPaymentUrl, setDepositPaymentUrl] = useState<string | null>(null);
  const { isAuthenticated, customer, login, register, getCustomerToken } = useCustomerAuth();
  const { greeting } = useCustomerGreeting();
  const [autoFilled, setAutoFilled] = useState(false);

  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginMode, setLoginMode] = useState<"login" | "register">("login");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginName, setLoginName] = useState("");
  const [loginPhone, setLoginPhone] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  useEffect(() => {
    if (isAuthenticated && customer && !autoFilled) {
      setName(customer.name || "");
      setEmail(customer.email || "");
      setPhone(customer.phone || "");
      setAutoFilled(true);
    }
  }, [isAuthenticated, customer, autoFilled]);

  const handleModalLogin = async () => {
    if (!loginEmail.trim() || !loginPassword.trim()) {
      setLoginError("Please enter your email and password.");
      return;
    }
    setLoginLoading(true);
    setLoginError("");
    const result = await login(loginEmail.trim(), loginPassword);
    setLoginLoading(false);
    if (result.success) {
      setAutoFilled(false);
      setShowLoginModal(false);
    } else {
      setLoginError(result.error || "Login failed. Please try again.");
    }
  };

  const handleModalRegister = async () => {
    if (!loginName.trim() || !loginEmail.trim() || !loginPhone.trim() || !loginPassword.trim()) {
      setLoginError("Please fill in all fields.");
      return;
    }
    setLoginLoading(true);
    setLoginError("");
    const result = await register(loginName.trim(), loginEmail.trim(), loginPhone.trim(), loginPassword);
    setLoginLoading(false);
    if (result.success) {
      setAutoFilled(false);
      setShowLoginModal(false);
    } else {
      setLoginError(result.error || "Registration failed. Please try again.");
    }
  };

  const days = useMemo(() => getWeekDays(weekOffset), [weekOffset]);

  const isSnooker = selectedTable === "snooker";
  const isPool = selectedTable === "pool";
  const isDining = selectedTable === "dining";
  const needsTableNumber = isSnooker || isPool;
  const canSubmit = !!(name.trim() && email.trim() && phone.trim() && gdprConsent &&
    (!needsTableNumber || selectedTableNumber));

  const availabilityQueryStr = needsTableNumber && selectedTableNumber
    ? `?date=${selectedDate}&tableType=${selectedTable}&tableNumber=${selectedTableNumber}`
    : `?date=${selectedDate}&tableType=${selectedTable}`;
  const availabilityQuery = useQuery<{ slots: Array<{ startTime: string; duration: number }>; totalTables: number }>({
    queryKey: ["/api/bookings/availability", availabilityQueryStr],
    enabled: !!selectedDate && !!selectedTable && (!needsTableNumber || !!selectedTableNumber),
  });

  const bookedSlots = availabilityQuery.data?.slots ?? [];
  const totalTables = availabilityQuery.data?.totalTables ?? 1;

  const isSlotBooked = (time: string, dur: number) => {
    const reqStart = parseInt(time.replace(":", ""));
    const reqEnd = reqStart + dur * 100;
    if (isDining) {
      // Count concurrent bookings; block if all 25 tables occupied
      let count = 0;
      for (const slot of bookedSlots) {
        const slotStart = parseInt(slot.startTime.replace(":", ""));
        const slotEnd = slotStart + slot.duration * 100;
        if (reqStart < slotEnd && reqEnd > slotStart) count++;
      }
      return count >= totalTables;
    }
    // Per-table: any overlap = booked
    for (const slot of bookedSlots) {
      const slotStart = parseInt(slot.startTime.replace(":", ""));
      const slotEnd = slotStart + slot.duration * 100;
      if (reqStart < slotEnd && reqEnd > slotStart) return true;
    }
    return false;
  };

  const [isClaiming, setIsClaiming] = useState(false);

  const venueRewardsQuery = useQuery<VenueRewardsResponse>({
    queryKey: ["/api/venue-rewards", customer?.id],
    queryFn: async () => {
      const token = getCustomerToken();
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(new URL("/api/venue-rewards", getApiUrl()).toString(), { headers });
      if (!res.ok) throw new Error("Failed to load rewards");
      return res.json();
    },
    enabled: isAuthenticated && step === "success",
    staleTime: 30_000,
  });

  const handleVenueClaim = async (tier: VenueRewardTier) => {
    if (isClaiming) return;
    const token = getCustomerToken();
    if (!token) return;
    setIsClaiming(true);
    try {
      const res = await fetch(new URL(`/api/venue-rewards/${tier.id}/claim`, getApiUrl()).toString(), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) {
        Alert.alert("Couldn't claim reward", data.message || "Please try again.");
        return;
      }
      await venueRewardsQuery.refetch();
      Alert.alert(
        "Reward Claimed! 🎉",
        `Your claim code is: ${data.claim?.claimCode ?? ""}\n\nShow this to a member of staff. Valid for 7 days.`
      );
    } catch {
      Alert.alert("Error", "Something went wrong. Please try again.");
    } finally {
      setIsClaiming(false);
    }
  };

  const bookMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/bookings", data).then((res) => res.json()),
    onSuccess: (response: any) => {
      queryClient.refetchQueries({ queryKey: ["/api/bookings/availability"] });
      if (response?.depositRequired && response?.depositPaymentUrl) {
        setDepositPaymentUrl(response.depositPaymentUrl);
        setStep("deposit");
      } else {
        setStep("success");
      }
    },
    onError: (err: Error) => {
      let msg = "Booking failed. Please try again.";
      try {
        const text = err.message || "";
        const jsonStart = text.indexOf("{");
        if (jsonStart !== -1) {
          const parsed = JSON.parse(text.slice(jsonStart));
          if (parsed.message) msg = parsed.message;
        } else if (text) {
          msg = text;
        }
      } catch {
        msg = err.message || msg;
      }
      if (Platform.OS === "web") {
        window.alert(msg);
      } else {
        Alert.alert("Booking Error", msg);
      }
    },
  });

  const selectedTableData = TABLE_TYPES.find((t) => t.id === selectedTable);

  const handleSubmit = () => {
    if (!name.trim() || !email.trim() || !phone.trim()) {
      const msg = "Please fill in all required fields.";
      if (Platform.OS === "web") window.alert(msg);
      else Alert.alert("Missing Information", msg);
      return;
    }
    if (isPool && !selectedTableNumber) {
      const msg = "Please select a pool table number (1–6) before confirming.";
      if (Platform.OS === "web") window.alert(msg);
      else Alert.alert("Table Required", msg);
      return;
    }
    if (isSnooker && !selectedTableNumber) {
      const msg = "Please select a snooker table number (1–10) before confirming.";
      if (Platform.OS === "web") window.alert(msg);
      else Alert.alert("Table Required", msg);
      return;
    }
    if (!gdprConsent) {
      const msg = "You must consent to data processing to make a booking.";
      if (Platform.OS === "web") window.alert(msg);
      else Alert.alert("Consent Required", msg);
      return;
    }
    bookMutation.mutate({
      customerName: name.trim(),
      customerEmail: email.trim(),
      customerPhone: phone.trim(),
      tableType: selectedTable,
      tableNumber: selectedTableNumber || undefined,
      guestCount: isDining ? guestCount : undefined,
      date: selectedDate,
      startTime: selectedTime,
      duration,
      notes: notes.trim() || undefined,
      gdprConsent: true,
      status: "confirmed",
    });
  };

  const resetForm = () => {
    setStep("table");
    setSelectedTable(null);
    setSelectedTableNumber(null);
    setSelectedDate(null);
    setSelectedTime(null);
    setDuration(1);
    setGuestCount(2);
    setName("");
    setEmail("");
    setPhone("");
    setNotes("");
    setGdprConsent(false);
    setAutoFilled(false);
    setDepositPaymentUrl(null);
  };

  const stepIndex = ["table", "datetime", "details", "confirm", "success"].indexOf(step);

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Book a Table</Text>
        {greeting ? (
          // Personal touch when signed in. Stays visible across every
          // step of the booking flow (table → success) so the warmth
          // carries through to the confirmation moment.
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {greeting} — let's get you booked in
          </Text>
        ) : null}
      </View>

      {step !== "success" && (
        <View style={styles.progressRow}>
          {["Table", "Date & Time", "Details", "Confirm"].map((label, i) => (
            <View key={label} style={styles.progressItem}>
              <View style={[styles.progressDot, i <= stepIndex && styles.progressDotActive]}>
                {i < stepIndex ? (
                  <Ionicons name="checkmark" size={12} color="#FFFFFF" />
                ) : (
                  <Text style={[styles.progressNum, i <= stepIndex && styles.progressNumActive]}>{i + 1}</Text>
                )}
              </View>
              <Text style={[styles.progressLabel, i <= stepIndex && styles.progressLabelActive]}>{label}</Text>
            </View>
          ))}
        </View>
      )}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={90}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: Platform.OS === "web" ? 50 : tabBarHeight + 20, paddingHorizontal: 16 + tabletPad }]}
          keyboardShouldPersistTaps="handled"
        >
          {step === "table" && (
            <View style={styles.stepSection}>
              <Text style={styles.stepTitle}>Choose Your Table</Text>
              <Text style={styles.stepSubtitle}>Select the type of table you'd like to book</Text>
              <View style={styles.tableGrid}>
                {TABLE_TYPES.map((table) => {
                  const isSelected = selectedTable === table.id;
                  return (
                    <Pressable
                      key={table.id}
                      onPress={() => {
                      setSelectedTable(table.id);
                      setSelectedTableNumber(null);
                      if (table.id !== "snooker" && duration > 3) setDuration(3);
                      if (table.id === "dining" && selectedDate && !isDiningDay(selectedDate)) {
                        setSelectedDate(null);
                        setSelectedTime(null);
                      }
                    }}
                      style={[styles.tableCard, isSelected && styles.tableCardSelected]}
                      testID={`table-${table.id}`}
                    >
                      <View style={[styles.tableIconWrap, isSelected && styles.tableIconWrapSelected]}>
                        <Ionicons
                          name={table.icon as any}
                          size={28}
                          color={isSelected ? "#FFFFFF" : Colors.brand.blue}
                        />
                      </View>
                      <Text style={[styles.tableName, isSelected && styles.tableNameSelected]}>{table.name}</Text>
                      <Text style={styles.tableDesc}>{table.description}</Text>
                      <Text style={[styles.tablePrice, isSelected && styles.tablePriceSelected]}>
                        {table.pricePerHour === "Free" ? "Free" : table.priceLabel ?? `\u00A3${table.pricePerHour}/${table.priceUnit === "game" ? "game" : "hr"}`}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {isSnooker && selectedTable && (
                <>
                  <Text style={[styles.stepTitle, { marginTop: 24 }]}>Select Table Number</Text>
                  <Text style={styles.stepSubtitle}>Choose from our 10 full-size snooker tables</Text>
                  <View style={styles.tableNumberGrid}>
                    {SNOOKER_TABLES.map((num) => {
                      const isSel = selectedTableNumber === num;
                      return (
                        <Pressable
                          key={num}
                          onPress={() => setSelectedTableNumber(num)}
                          style={[styles.tableNumberChip, isSel && styles.tableNumberChipSelected]}
                          testID={`snooker-table-${num}`}
                        >
                          <Text style={[styles.tableNumberText, isSel && styles.tableNumberTextSelected]}>{num}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </>
              )}

              {isPool && selectedTable && (
                <>
                  <Text style={[styles.stepTitle, { marginTop: 24 }]}>Select Table Number</Text>
                  <Text style={styles.stepSubtitle}>Choose from our 6 pool tables</Text>
                  <View style={styles.tableNumberGrid}>
                    {POOL_TABLES.map((num) => {
                      const isSel = selectedTableNumber === num;
                      return (
                        <Pressable
                          key={num}
                          onPress={() => setSelectedTableNumber(num)}
                          style={[styles.tableNumberChip, isSel && styles.tableNumberChipSelected]}
                          testID={`pool-table-${num}`}
                        >
                          <Text style={[styles.tableNumberText, isSel && styles.tableNumberTextSelected]}>{num}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </>
              )}

              {isDining && selectedTable && (
                <>
                  <Text style={[styles.stepTitle, { marginTop: 24 }]}>Party Size</Text>
                  <Text style={styles.stepSubtitle}>How many guests are in your party?</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
                    <View style={{ flexDirection: "row", gap: 8, paddingVertical: 4 }}>
                      {GUEST_COUNT_OPTIONS.map((count) => {
                        const isSel = guestCount === count;
                        return (
                          <Pressable
                            key={count}
                            onPress={() => setGuestCount(count)}
                            style={[styles.tableNumberChip, isSel && styles.tableNumberChipSelected, { width: 52 }]}
                            testID={`guest-count-${count}`}
                          >
                            <Text style={[styles.tableNumberText, isSel && styles.tableNumberTextSelected]}>{count}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </ScrollView>
                </>
              )}

              <Pressable
                onPress={() => { if (selectedTable && (!needsTableNumber || selectedTableNumber)) setStep("datetime"); }}
                disabled={!selectedTable || (needsTableNumber && !selectedTableNumber)}
                style={[styles.nextButton, (!selectedTable || (needsTableNumber && !selectedTableNumber)) && styles.nextButtonDisabled]}
                testID="book-next-step-1"
              >
                <Text style={styles.nextButtonText}>Continue</Text>
                <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
              </Pressable>
            </View>
          )}

          {step === "datetime" && (
            <View style={styles.stepSection}>
              <Pressable onPress={() => setStep("table")} style={styles.backRow}>
                <Ionicons name="arrow-back" size={18} color={Colors.brand.blue} />
                <Text style={styles.backText}>Back</Text>
              </Pressable>

              <Text style={styles.stepTitle}>Pick a Date</Text>

              {isDining && (
                <View style={styles.diningNotice}>
                  <Ionicons name="information-circle-outline" size={16} color="#92400e" />
                  <Text style={styles.diningNoticeText}>Dining available Wednesday–Sunday, 12pm–8pm only</Text>
                </View>
              )}

              <View style={styles.weekNavRow}>
                <Pressable
                  onPress={() => {
                    const next = weekOffset - 1;
                    setWeekOffset(next);
                    if (selectedDate && !getWeekDays(next).some((d) => d.date === selectedDate)) {
                      setSelectedDate(null);
                      setSelectedTime(null);
                    }
                  }}
                  disabled={weekOffset === 0}
                  style={[styles.weekNavBtn, weekOffset === 0 && { opacity: 0.3 }]}
                  testID="week-prev"
                >
                  <Ionicons name="chevron-back" size={20} color={Colors.brand.blue} />
                </Pressable>
                <Text style={styles.weekNavLabel}>
                  {days[0].monthLabel} {days[0].dayNum} – {days[6].monthLabel} {days[6].dayNum}
                  {weekOffset === 0 ? "  (This week)" : ""}
                </Text>
                <Pressable
                  onPress={() => {
                    const next = weekOffset + 1;
                    setWeekOffset(next);
                    if (selectedDate && !getWeekDays(next).some((d) => d.date === selectedDate)) {
                      setSelectedDate(null);
                      setSelectedTime(null);
                    }
                  }}
                  disabled={weekOffset >= MAX_WEEKS_AHEAD}
                  style={[styles.weekNavBtn, weekOffset >= MAX_WEEKS_AHEAD && { opacity: 0.3 }]}
                  testID="week-next"
                >
                  <Ionicons name="chevron-forward" size={20} color={Colors.brand.blue} />
                </Pressable>
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.daysRow}>
                {days.map((day) => {
                  const isSelected = selectedDate === day.date;
                  const diningRestricted = isDining && !isDiningDay(day.date);
                  return (
                    <Pressable
                      key={day.date}
                      onPress={() => { if (!diningRestricted) { setSelectedDate(day.date); setSelectedTime(null); } }}
                      disabled={diningRestricted}
                      style={[styles.dayCard, isSelected && styles.dayCardSelected, diningRestricted && styles.dayCardDisabled]}
                      testID={`day-${day.date}`}
                    >
                      <Text style={[styles.dayLabel, isSelected && styles.dayLabelSelected, diningRestricted && styles.dayTextDisabled]}>{day.label}</Text>
                      <Text style={[styles.dayNum, isSelected && styles.dayNumSelected, diningRestricted && styles.dayTextDisabled]}>{day.dayNum}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              {selectedDate && (
                <>
                  <Text style={[styles.stepTitle, { marginTop: 24 }]}>Duration</Text>
                  <View style={styles.durationRow}>
                    {(isSnooker ? ALL_DURATION_OPTIONS : STANDARD_DURATION_OPTIONS).filter((d) => {
                      if (!isDining) return true;
                      // For dining, only show durations where at least one slot fits within 12pm–8pm
                      return d <= 8;
                    }).map((d) => (
                      <Pressable
                        key={d}
                        onPress={() => { setDuration(d); setSelectedTime(null); }}
                        style={[styles.durationChip, duration === d && styles.durationChipSelected]}
                      >
                        <Text style={[styles.durationText, duration === d && styles.durationTextSelected]}>
                          {d} {d === 1 ? "hour" : "hours"}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  <Text style={[styles.stepTitle, { marginTop: 24 }]}>Select Time</Text>
                  {availabilityQuery.isLoading ? (
                    <ActivityIndicator color={Colors.brand.blue} style={{ marginTop: 16 }} />
                  ) : (
                    <View style={styles.timeGrid}>
                      {BOOKING_HOURS.filter((time) => {
                        const [slotH, slotM] = time.split(":").map(Number);
                        const slotMins = slotH * 60 + slotM;
                        // Dining: only 12:00–20:00, slot must end by 20:00
                        if (isDining) {
                          const slotEndMins = slotMins + duration * 60;
                          if (slotMins < 12 * 60 || slotEndMins > 20 * 60) return false;
                        }
                        // Past-time filter for today
                        if (!selectedDate) return true;
                        const todayStr = localDateStr(new Date());
                        if (selectedDate !== todayStr) return true;
                        const now = new Date();
                        const nowMins = now.getHours() * 60 + now.getMinutes();
                        return slotMins > nowMins + 60;
                      }).map((time) => {
                        const booked = isSlotBooked(time, duration);
                        const isSelected = selectedTime === time;
                        const [tH, tM] = time.split(":").map(Number);
                        const endMins = tH * 60 + tM + duration * 60;
                        const tooLate = !isDining && endMins > 24 * 60;
                        const disabled = booked || tooLate;
                        return (
                          <Pressable
                            key={time}
                            onPress={() => { if (!disabled) setSelectedTime(time); }}
                            disabled={disabled}
                            style={[
                              styles.timeChip,
                              isSelected && styles.timeChipSelected,
                              disabled && styles.timeChipDisabled,
                            ]}
                            testID={`time-${time}`}
                          >
                            <Text
                              style={[
                                styles.timeText,
                                isSelected && styles.timeTextSelected,
                                disabled && styles.timeTextDisabled,
                              ]}
                            >
                              {time}
                            </Text>
                            {booked && <Text style={styles.bookedLabel}>Booked</Text>}
                          </Pressable>
                        );
                      })}
                    </View>
                  )}
                </>
              )}

              {selectedDate && selectedTime && (
                <Pressable
                  onPress={() => setStep("details")}
                  style={styles.nextButton}
                  testID="book-next-step-2"
                >
                  <Text style={styles.nextButtonText}>Continue</Text>
                  <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
                </Pressable>
              )}
            </View>
          )}

          {step === "details" && (
            <View style={styles.stepSection}>
              <Pressable onPress={() => setStep("datetime")} style={styles.backRow}>
                <Ionicons name="arrow-back" size={18} color={Colors.brand.blue} />
                <Text style={styles.backText}>Back</Text>
              </Pressable>

              <Text style={styles.stepTitle}>Your Details</Text>
              <Text style={styles.stepSubtitle}>We need your details to confirm the booking</Text>

              {!isAuthenticated && (
                <Pressable
                  onPress={() => {
                    setLoginMode("login");
                    setLoginError("");
                    setShowLoginModal(true);
                  }}
                  style={styles.loginBanner}
                >
                  <Ionicons name="person-circle-outline" size={22} color={Colors.brand.blue} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.loginBannerTitle}>Have an account?</Text>
                    <Text style={styles.loginBannerSub}>Log in to auto-fill your details</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={Colors.brand.blue} />
                </Pressable>
              )}

              {isAuthenticated && customer && (
                <View style={styles.autoFilledBanner}>
                  <Ionicons name="checkmark-circle" size={18} color={Colors.brand.green} />
                  <Text style={styles.autoFilledText}>Details filled from your account</Text>
                </View>
              )}

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Full Name *</Text>
                <TextInput
                  style={styles.formInput}
                  value={name}
                  onChangeText={setName}
                  placeholder="John Smith"
                  placeholderTextColor={colors.textSecondary}
                  autoCapitalize="words"
                  testID="booking-name-input"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Email *</Text>
                <TextInput
                  style={styles.formInput}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="john@example.com"
                  placeholderTextColor={colors.textSecondary}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  testID="booking-email-input"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Phone *</Text>
                <TextInput
                  style={styles.formInput}
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="07700 900000"
                  placeholderTextColor={colors.textSecondary}
                  keyboardType="phone-pad"
                  testID="booking-phone-input"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Notes (optional)</Text>
                <TextInput
                  style={[styles.formInput, styles.notesInput]}
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Any special requests?"
                  placeholderTextColor={colors.textSecondary}
                  multiline
                  numberOfLines={3}
                  testID="booking-notes-input"
                />
              </View>

              <Pressable
                onPress={() => setGdprConsent(!gdprConsent)}
                style={styles.consentRow}
                testID="booking-gdpr-consent"
              >
                <View style={[styles.checkbox, gdprConsent && styles.checkboxChecked]}>
                  {gdprConsent && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
                </View>
                <Text style={styles.consentText}>
                  I consent to The 147 processing my personal data for the purpose of this booking. 
                  Your data will be retained for 90 days then automatically deleted. 
                  You can request deletion at any time by contacting us. 
                  See our Privacy Policy for full details.
                </Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  if (!name.trim() || !email.trim() || !phone.trim()) {
                    const msg = "Please fill in all required fields.";
                    if (Platform.OS === "web") window.alert(msg);
                    else Alert.alert("Missing Information", msg);
                    return;
                  }
                  if (!gdprConsent) {
                    const msg = "You must consent to data processing to make a booking.";
                    if (Platform.OS === "web") window.alert(msg);
                    else Alert.alert("Consent Required", msg);
                    return;
                  }
                  setStep("confirm");
                }}
                style={styles.nextButton}
                testID="book-next-step-3"
              >
                <Text style={styles.nextButtonText}>Review Booking</Text>
                <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
              </Pressable>
            </View>
          )}

          {step === "confirm" && (
            <View style={styles.stepSection}>
              <Pressable onPress={() => setStep("details")} style={styles.backRow}>
                <Ionicons name="arrow-back" size={18} color={Colors.brand.blue} />
                <Text style={styles.backText}>Back</Text>
              </Pressable>

              <Text style={styles.stepTitle}>Confirm Booking</Text>
              <Text style={styles.stepSubtitle}>Please review your booking details</Text>

              <View style={styles.summaryCard}>
                <View style={styles.summaryRow}>
                  <Ionicons name={selectedTableData?.icon as any} size={20} color={Colors.brand.blue} />
                  <View style={styles.summaryInfo}>
                    <Text style={styles.summaryLabel}>Table</Text>
                    <Text style={styles.summaryValue}>
                      {selectedTableData?.name}{selectedTableNumber ? ` - Table ${selectedTableNumber}` : ""}
                    </Text>
                  </View>
                </View>
                <View style={styles.divider} />
                <View style={styles.summaryRow}>
                  <Ionicons name="calendar" size={20} color={Colors.brand.blue} />
                  <View style={styles.summaryInfo}>
                    <Text style={styles.summaryLabel}>Date</Text>
                    <Text style={styles.summaryValue}>
                      {selectedDate ? parseDateLocal(selectedDate).toLocaleDateString("en-GB", {
                        weekday: "long", day: "numeric", month: "long", year: "numeric",
                      }) : ""}
                    </Text>
                  </View>
                </View>
                <View style={styles.divider} />
                <View style={styles.summaryRow}>
                  <Ionicons name="time" size={20} color={Colors.brand.blue} />
                  <View style={styles.summaryInfo}>
                    <Text style={styles.summaryLabel}>Time</Text>
                    <Text style={styles.summaryValue}>
                      {selectedTime} - {selectedTime ? (() => { const [h, m] = selectedTime.split(":").map(Number); const e = h * 60 + m + duration * 60; return `${Math.floor(e / 60).toString().padStart(2, "0")}:${(e % 60).toString().padStart(2, "0")}`; })() : ""} ({duration} {duration === 1 ? "hour" : "hours"})
                    </Text>
                  </View>
                </View>
                <View style={styles.divider} />
                <View style={styles.summaryRow}>
                  <Ionicons name="person" size={20} color={Colors.brand.blue} />
                  <View style={styles.summaryInfo}>
                    <Text style={styles.summaryLabel}>Name</Text>
                    <Text style={styles.summaryValue}>{name}</Text>
                  </View>
                </View>
                <View style={styles.divider} />
                <View style={styles.summaryRow}>
                  <Ionicons name="mail" size={20} color={Colors.brand.blue} />
                  <View style={styles.summaryInfo}>
                    <Text style={styles.summaryLabel}>Email</Text>
                    <Text style={styles.summaryValue}>{email}</Text>
                  </View>
                </View>
                <View style={styles.divider} />
                <View style={styles.summaryRow}>
                  <Ionicons name="call" size={20} color={Colors.brand.blue} />
                  <View style={styles.summaryInfo}>
                    <Text style={styles.summaryLabel}>Phone</Text>
                    <Text style={styles.summaryValue}>{phone}</Text>
                  </View>
                </View>
                {isDining && (
                  <>
                    <View style={styles.divider} />
                    <View style={styles.summaryRow}>
                      <Ionicons name="people" size={20} color={Colors.brand.blue} />
                      <View style={styles.summaryInfo}>
                        <Text style={styles.summaryLabel}>Party Size</Text>
                        <Text style={styles.summaryValue}>{guestCount} {guestCount === 1 ? "guest" : "guests"}</Text>
                      </View>
                    </View>
                  </>
                )}
                {notes.trim() ? (
                  <>
                    <View style={styles.divider} />
                    <View style={styles.summaryRow}>
                      <Ionicons name="chatbubble" size={20} color={Colors.brand.blue} />
                      <View style={styles.summaryInfo}>
                        <Text style={styles.summaryLabel}>Notes</Text>
                        <Text style={styles.summaryValue}>{notes}</Text>
                      </View>
                    </View>
                  </>
                ) : null}
                {selectedTableData && selectedTableData.pricePerHour !== "Free" && (
                  <>
                    <View style={styles.divider} />
                    <View style={styles.summaryRow}>
                      <Ionicons name="cash" size={20} color={Colors.brand.gold} />
                      <View style={styles.summaryInfo}>
                        <Text style={styles.summaryLabel}>
                          {selectedTableData.priceUnit === "game" ? "Price" : "Estimated Cost"}
                        </Text>
                        <Text style={[styles.summaryValue, { color: Colors.brand.gold }]}>
                          {selectedTableData.priceUnit === "game"
                            ? `\u00A3${selectedTableData.pricePerHour}/game`
                            : selectedTableData.priceLabel ?? `\u00A3${parseFloat(selectedTableData.pricePerHour) * duration}`}
                        </Text>
                      </View>
                    </View>
                  </>
                )}
              </View>

              {needsTableNumber && !selectedTableNumber && (
                <Text style={styles.tableNumberHint}>
                  ← Please select a table number above before confirming
                </Text>
              )}

              {isDining && guestCount >= DEPOSIT_GUEST_THRESHOLD && (
                <View style={{ backgroundColor: "rgba(212,168,67,0.1)", borderRadius: 10, padding: 12, marginBottom: 12, flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: "rgba(212,168,67,0.25)" }}>
                  <Ionicons name="card-outline" size={18} color={Colors.brand.gold} />
                  <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: 13, flex: 1 }}>
                    A £5 deposit is required for dining bookings of {DEPOSIT_GUEST_THRESHOLD}+ guests. You'll be redirected to a secure payment page after confirming.
                  </Text>
                </View>
              )}

              <Pressable
                onPress={handleSubmit}
                disabled={bookMutation.isPending || !canSubmit}
                style={[styles.confirmButton, (bookMutation.isPending || !canSubmit) && { opacity: 0.4 }]}
                testID="book-confirm-button"
              >
                {bookMutation.isPending ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
                    <Text style={styles.confirmButtonText}>Confirm Booking</Text>
                  </>
                )}
              </Pressable>
            </View>
          )}

          {step === "deposit" && (
            <View style={styles.successSection}>
              <View style={styles.successIconWrap}>
                <Ionicons name="card" size={64} color={Colors.brand.blue} />
              </View>
              <Text style={styles.successTitle}>Deposit Required</Text>
              <Text style={styles.successSubtitle}>
                A £5 deposit is required for dining bookings of {DEPOSIT_GUEST_THRESHOLD}+ guests. You'll be taken to a secure payment page.
              </Text>
              <Text style={styles.successNote}>
                Your booking will be confirmed automatically once the deposit is paid.
              </Text>
              {depositPaymentUrl ? (
                <Pressable
                  onPress={() => Linking.openURL(depositPaymentUrl)}
                  style={[styles.newBookingButton, { backgroundColor: Colors.brand.blue, borderRadius: 12, justifyContent: "center" }]}
                >
                  <Ionicons name="card" size={20} color="#fff" />
                  <Text style={[styles.newBookingText, { color: "#fff", marginLeft: 8 }]}>Pay £5 Deposit</Text>
                </Pressable>
              ) : null}
              <Pressable onPress={resetForm} style={[styles.newBookingButton, { marginTop: 12 }]}>
                <Text style={[styles.newBookingText, { color: colors.textSecondary }]}>Cancel Booking</Text>
              </Pressable>
            </View>
          )}

          {step === "success" && (
            <View style={styles.successSection}>
              <View style={styles.successIconWrap}>
                <Ionicons name="checkmark-circle" size={64} color={Colors.brand.green} />
              </View>
              <Text style={styles.successTitle}>Booking Confirmed!</Text>
              <Text style={styles.successSubtitle}>
                Your {selectedTableData?.name?.toLowerCase()}{selectedTableNumber ? ` (Table ${selectedTableNumber})` : ""} has been booked for {selectedDate ? parseDateLocal(selectedDate).toLocaleDateString("en-GB", {
                  weekday: "short", day: "numeric", month: "short",
                }) : ""} at {selectedTime}.
              </Text>
              <Text style={styles.successNote}>
                You'll receive a confirmation at {email}. Please arrive 5 minutes before your slot.
              </Text>

              {/* ── Venue Rewards ── */}
              {isAuthenticated && venueRewardsQuery.data && (
                (() => {
                  const { tiers, pendingClaims } = venueRewardsQuery.data;
                  if (tiers.length === 0 && pendingClaims.length === 0) return null;
                  return (
                    <View style={styles.rewardsSection}>
                      <View style={styles.rewardsSectionHeader}>
                        <Ionicons name="gift-outline" size={18} color="#7C3AED" />
                        <Text style={styles.rewardsSectionTitle}>Redeem Your Points</Text>
                      </View>
                      <Text style={styles.rewardsSubtitle}>Claim a reward while you're here — show the code to any member of staff.</Text>

                      {/* Active claim codes */}
                      {pendingClaims.map((claim) => {
                        const expiresAt = new Date(claim.expiresAt);
                        const minutesLeft = Math.max(0, Math.round((expiresAt.getTime() - Date.now()) / 60000));
                        const hoursLeft = Math.floor(minutesLeft / 60);
                        const minsLeft = minutesLeft % 60;
                        const expiry = hoursLeft > 0 ? `${hoursLeft}h ${minsLeft}m left` : `${minutesLeft}m left`;
                        return (
                          <View key={claim.id} style={styles.claimCodeCard}>
                            <View style={styles.claimCodeLeft}>
                              <Text style={styles.claimCodeTierName}>{claim.tierName ?? "Venue Reward"}</Text>
                              <Text style={styles.claimCodeExpiry}>{expiry}</Text>
                            </View>
                            <View style={styles.claimCodeBadge}>
                              <Text style={styles.claimCodeText}>{claim.claimCode}</Text>
                            </View>
                          </View>
                        );
                      })}

                      {/* Available tiers to claim */}
                      {tiers.map((tier) => {
                        const alreadyPending = pendingClaims.some((c) => c.tierId === tier.id);
                        return (
                          <View key={tier.id} style={styles.rewardTierCard}>
                            <View style={styles.rewardTierBody}>
                              <Text style={styles.rewardTierName}>{tier.name}</Text>
                              {tier.description ? <Text style={styles.rewardTierDesc}>{tier.description}</Text> : null}
                              <Text style={styles.rewardTierPoints}>{tier.pointsCost} points</Text>
                            </View>
                            <Pressable
                              onPress={() => handleVenueClaim(tier)}
                              disabled={isClaiming || alreadyPending}
                              style={({ pressed }) => [
                                styles.rewardClaimBtn,
                                alreadyPending && styles.rewardClaimBtnClaimed,
                                pressed && !alreadyPending && { opacity: 0.75 },
                              ]}
                            >
                              <Text style={[styles.rewardClaimBtnText, alreadyPending && styles.rewardClaimBtnTextClaimed]}>
                                {alreadyPending ? "Claimed ✓" : "Claim"}
                              </Text>
                            </Pressable>
                          </View>
                        );
                      })}
                    </View>
                  );
                })()
              )}

              <Pressable onPress={resetForm} style={styles.newBookingButton} testID="book-new-booking">
                <Ionicons name="add-circle" size={20} color={Colors.brand.blue} />
                <Text style={styles.newBookingText}>Make Another Booking</Text>
              </Pressable>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={showLoginModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowLoginModal(false)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {loginMode === "login" ? "Sign In" : "Create Account"}
              </Text>
              <Pressable onPress={() => setShowLoginModal(false)} style={styles.modalClose}>
                <Ionicons name="close" size={22} color={colors.text} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
              <Text style={styles.modalSubtitle}>
                {loginMode === "login"
                  ? "Sign in and your details will be filled in automatically."
                  : "Create an account and your details will be filled in automatically."}
              </Text>

              <View style={styles.modalToggleRow}>
                <Pressable
                  onPress={() => { setLoginMode("login"); setLoginError(""); }}
                  style={[styles.modalToggleBtn, loginMode === "login" && styles.modalToggleBtnActive]}
                >
                  <Text style={[styles.modalToggleText, loginMode === "login" && styles.modalToggleTextActive]}>Sign In</Text>
                </Pressable>
                <Pressable
                  onPress={() => { setLoginMode("register"); setLoginError(""); }}
                  style={[styles.modalToggleBtn, loginMode === "register" && styles.modalToggleBtnActive]}
                >
                  <Text style={[styles.modalToggleText, loginMode === "register" && styles.modalToggleTextActive]}>Create Account</Text>
                </Pressable>
              </View>

              {loginMode === "register" && (
                <>
                  <Text style={styles.modalLabel}>Full Name *</Text>
                  <TextInput
                    style={styles.modalInput}
                    value={loginName}
                    onChangeText={setLoginName}
                    placeholder="John Smith"
                    placeholderTextColor={colors.textSecondary}
                    autoCapitalize="words"
                  />
                  <Text style={styles.modalLabel}>Phone *</Text>
                  <TextInput
                    style={styles.modalInput}
                    value={loginPhone}
                    onChangeText={setLoginPhone}
                    placeholder="07700 900000"
                    placeholderTextColor={colors.textSecondary}
                    keyboardType="phone-pad"
                  />
                </>
              )}

              <Text style={styles.modalLabel}>Email *</Text>
              <TextInput
                style={styles.modalInput}
                value={loginEmail}
                onChangeText={setLoginEmail}
                placeholder="john@example.com"
                placeholderTextColor={colors.textSecondary}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />

              <Text style={styles.modalLabel}>Password *</Text>
              <TextInput
                style={styles.modalInput}
                value={loginPassword}
                onChangeText={setLoginPassword}
                placeholder="••••••••"
                placeholderTextColor={colors.textSecondary}
                secureTextEntry
                onSubmitEditing={loginMode === "login" ? handleModalLogin : handleModalRegister}
              />

              {loginError ? (
                <Text style={styles.modalError}>{loginError}</Text>
              ) : null}

              <Pressable
                onPress={loginMode === "login" ? handleModalLogin : handleModalRegister}
                disabled={loginLoading}
                style={[styles.modalSubmitBtn, loginLoading && { opacity: 0.6 }]}
              >
                {loginLoading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalSubmitText}>
                    {loginMode === "login" ? "Sign In & Auto-Fill" : "Create Account & Auto-Fill"}
                  </Text>
                )}
              </Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const createStyles = (palette: ReturnType<typeof useColors>) => {
  const Colors = { ...baseColors, light: palette };
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  header: {
    backgroundColor: palette.surface,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  headerTitle: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 22,
    color: palette.text,
  },
  headerSubtitle: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 13,
    color: palette.textSecondary,
    marginTop: 2,
  },
  progressRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: Colors.light.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  progressItem: {
    alignItems: "center",
    gap: 4,
  },
  progressDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.light.border,
    alignItems: "center",
    justifyContent: "center",
  },
  progressDotActive: {
    backgroundColor: Colors.brand.blue,
  },
  progressNum: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 11,
    color: Colors.light.textSecondary,
  },
  progressNumActive: {
    color: "#FFFFFF",
  },
  progressLabel: {
    fontFamily: "Montserrat_500Medium",
    fontSize: 10,
    color: Colors.light.textSecondary,
  },
  progressLabelActive: {
    color: Colors.brand.blue,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  stepSection: {
    gap: 4,
  },
  stepTitle: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 20,
    color: Colors.light.text,
    marginBottom: 4,
  },
  stepSubtitle: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 13,
    color: Colors.light.textSecondary,
    marginBottom: 16,
  },
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 12,
  },
  backText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 14,
    color: Colors.brand.blue,
  },
  tableGrid: {
    gap: 10,
    marginBottom: 20,
  },
  tableCard: {
    backgroundColor: Colors.light.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 2,
    borderColor: Colors.light.border,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  tableCardSelected: {
    borderColor: Colors.brand.blue,
    backgroundColor: Colors.brand.blue + "08",
  },
  tableIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: Colors.brand.blue + "12",
    alignItems: "center",
    justifyContent: "center",
  },
  tableIconWrapSelected: {
    backgroundColor: Colors.brand.blue,
  },
  tableName: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 15,
    color: Colors.light.text,
    flex: 1,
  },
  tableNameSelected: {
    color: Colors.brand.blue,
  },
  tableDesc: {
    display: "none",
  },
  tablePrice: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 14,
    color: Colors.light.textSecondary,
  },
  tablePriceSelected: {
    color: Colors.brand.blue,
  },
  tableNumberGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 20,
  },
  tableNumberChip: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: Colors.light.surface,
    borderWidth: 2,
    borderColor: Colors.light.border,
    alignItems: "center",
    justifyContent: "center",
  },
  tableNumberChipSelected: {
    borderColor: Colors.brand.blue,
    backgroundColor: Colors.brand.blue,
  },
  tableNumberText: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 18,
    color: Colors.light.text,
  },
  tableNumberTextSelected: {
    color: "#FFFFFF",
  },
  nextButton: {
    backgroundColor: Colors.brand.blue,
    borderRadius: 14,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 8,
  },
  nextButtonDisabled: {
    opacity: 0.4,
  },
  nextButtonText: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 16,
    color: "#FFFFFF",
  },
  weekNavRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  weekNavBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: Colors.light.surface,
  },
  weekNavLabel: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 14,
    color: Colors.light.text,
    flex: 1,
    textAlign: "center",
  },
  daysRow: {
    marginBottom: 4,
  },
  dayCard: {
    backgroundColor: Colors.light.surface,
    borderRadius: 14,
    padding: 14,
    marginRight: 10,
    alignItems: "center",
    borderWidth: 2,
    borderColor: Colors.light.border,
    minWidth: 72,
  },
  dayCardSelected: {
    borderColor: Colors.brand.blue,
    backgroundColor: Colors.brand.blue,
  },
  dayLabel: {
    fontFamily: "Montserrat_500Medium",
    fontSize: 11,
    color: Colors.light.textSecondary,
    marginBottom: 4,
  },
  dayLabelSelected: {
    color: "#FFFFFF",
  },
  dayNum: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 20,
    color: Colors.light.text,
  },
  dayNumSelected: {
    color: "#FFFFFF",
  },
  dayCardDisabled: {
    opacity: 0.35,
    backgroundColor: Colors.light.background,
  },
  dayTextDisabled: {
    color: Colors.light.textSecondary,
  },
  diningNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(212,168,67,0.08)",
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(212,168,67,0.25)",
  },
  diningNoticeText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: "#92400E",
    flex: 1,
  },
  durationRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 4,
  },
  durationChip: {
    flex: 1,
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 2,
    borderColor: Colors.light.border,
  },
  durationChipSelected: {
    borderColor: Colors.brand.blue,
    backgroundColor: Colors.brand.blue + "10",
  },
  durationText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 13,
    color: Colors.light.textSecondary,
  },
  durationTextSelected: {
    color: Colors.brand.blue,
  },
  timeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  timeChip: {
    backgroundColor: Colors.light.surface,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 4,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: Colors.light.border,
    width: "22%" as any,
  },
  timeChipSelected: {
    borderColor: Colors.brand.blue,
    backgroundColor: Colors.brand.blue,
  },
  timeChipDisabled: {
    backgroundColor: Colors.light.surfaceElevated,
    opacity: 0.5,
  },
  timeText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 14,
    color: Colors.light.text,
  },
  timeTextSelected: {
    color: "#FFFFFF",
  },
  timeTextDisabled: {
    color: Colors.light.textSecondary,
  },
  bookedLabel: {
    fontFamily: "Montserrat_500Medium",
    fontSize: 8,
    color: Colors.brand.red,
    marginTop: 2,
  },
  formGroup: {
    marginBottom: 16,
  },
  formLabel: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 13,
    color: Colors.light.text,
    marginBottom: 6,
  },
  formInput: {
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.light.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontFamily: "Montserrat_400Regular",
    fontSize: 15,
    color: Colors.light.text,
  },
  notesInput: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  consentRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 20,
    alignItems: "flex-start",
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Colors.light.border,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  checkboxChecked: {
    backgroundColor: Colors.brand.blue,
    borderColor: Colors.brand.blue,
  },
  consentText: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 12,
    color: Colors.light.textSecondary,
    flex: 1,
    lineHeight: 18,
  },
  summaryCard: {
    backgroundColor: Colors.light.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.light.border,
    marginBottom: 20,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 8,
  },
  summaryInfo: {
    flex: 1,
    gap: 2,
  },
  summaryLabel: {
    fontFamily: "Montserrat_500Medium",
    fontSize: 11,
    color: Colors.light.textSecondary,
  },
  summaryValue: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 14,
    color: Colors.light.text,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.light.border,
  },
  confirmButton: {
    backgroundColor: Colors.brand.green,
    borderRadius: 14,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  confirmButtonText: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 16,
    color: "#FFFFFF",
  },
  tableNumberHint: {
    fontFamily: "Montserrat_500Medium",
    fontSize: 13,
    color: Colors.brand.red,
    textAlign: "center",
    marginBottom: 8,
  },
  successSection: {
    alignItems: "center",
    paddingTop: 60,
    gap: 12,
  },
  successIconWrap: {
    marginBottom: 8,
  },
  successTitle: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 24,
    color: Colors.light.text,
  },
  successSubtitle: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 14,
    color: Colors.light.textSecondary,
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 20,
  },
  successNote: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 12,
    color: Colors.light.textSecondary,
    textAlign: "center",
    lineHeight: 18,
    paddingHorizontal: 20,
    marginTop: 8,
  },
  newBookingButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.brand.blue + "10",
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 20,
  },
  newBookingText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 14,
    color: Colors.brand.blue,
  },
  loginBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Colors.brand.blue + "12",
    borderWidth: 1,
    borderColor: Colors.brand.blue + "30",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 20,
  },
  loginBannerTitle: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 14,
    color: Colors.brand.blue,
  },
  loginBannerSub: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 12,
    color: Colors.light.textSecondary,
    marginTop: 1,
  },
  autoFilledBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.brand.green + "15",
    borderWidth: 1,
    borderColor: Colors.brand.green + "30",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 20,
  },
  autoFilledText: {
    fontFamily: "Montserrat_500Medium",
    fontSize: 13,
    color: Colors.brand.green,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  modalTitle: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 18,
    color: Colors.light.text,
  },
  modalClose: {
    padding: 4,
  },
  modalBody: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
  },
  modalSubtitle: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 14,
    color: Colors.light.textSecondary,
    lineHeight: 20,
    marginBottom: 24,
  },
  modalToggleRow: {
    flexDirection: "row",
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    padding: 4,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  modalToggleBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
  },
  modalToggleBtnActive: {
    backgroundColor: Colors.brand.blue,
  },
  modalToggleText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 14,
    color: Colors.light.textSecondary,
  },
  modalToggleTextActive: {
    color: "#FFFFFF",
  },
  modalLabel: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 13,
    color: Colors.light.text,
    marginBottom: 8,
    marginTop: 4,
  },
  modalInput: {
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.light.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontFamily: "Montserrat_400Regular",
    fontSize: 15,
    color: Colors.light.text,
    marginBottom: 16,
  },
  modalError: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 13,
    color: "#EF4444",
    marginBottom: 16,
    textAlign: "center",
  },
  modalSubmitBtn: {
    backgroundColor: Colors.brand.blue,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  modalSubmitText: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 15,
    color: "#FFFFFF",
  },
  rewardsSection: {
    marginTop: 24,
    backgroundColor: "#F5F3FF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#DDD6FE",
    padding: 16,
    gap: 12,
  },
  rewardsSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rewardsSectionTitle: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 15,
    color: "#5B21B6",
  },
  rewardsSubtitle: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 13,
    color: "#6B7280",
    marginTop: -4,
  },
  claimCodeCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#EDE9FE",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#C4B5FD",
  },
  claimCodeLeft: {
    flex: 1,
    marginRight: 12,
  },
  claimCodeTierName: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 13,
    color: "#3730A3",
  },
  claimCodeExpiry: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 11,
    color: "#7C3AED",
    marginTop: 2,
  },
  claimCodeBadge: {
    backgroundColor: "#7C3AED",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  claimCodeText: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 14,
    color: "#FFFFFF",
    letterSpacing: 2,
  },
  rewardTierCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  rewardTierBody: {
    flex: 1,
    marginRight: 12,
  },
  rewardTierName: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 13,
    color: Colors.light.text,
  },
  rewardTierDesc: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 12,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  rewardTierPoints: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 11,
    color: "#7C3AED",
    marginTop: 4,
  },
  rewardClaimBtn: {
    backgroundColor: "#7C3AED",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  rewardClaimBtnClaimed: {
    backgroundColor: "#D1FAE5",
  },
  rewardClaimBtnText: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 13,
    color: "#FFFFFF",
  },
  rewardClaimBtnTextClaimed: {
    color: "#065F46",
  },
  });
};
