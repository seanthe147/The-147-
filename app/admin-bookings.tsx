import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Platform,
  Alert,
  ActivityIndicator,
  TextInput,
  Modal,
  KeyboardAvoidingView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/query-client";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import Colors from "@/constants/colors";
import type { Booking, StaffNotice } from "@shared/schema";

const TABLE_LABELS: Record<string, string> = {
  snooker: "Snooker",
  pool: "Pool",
  dining: "Dining",
  darts: "Darts",
};

const TABLE_ICONS: Record<string, string> = {
  snooker: "ellipse",
  pool: "ellipse-outline",
  dining: "restaurant",
  darts: "disc",
};

const BOOKING_HOURS = [
  "10:00", "10:30", "11:00", "11:30", "12:00", "12:30",
  "13:00", "13:30", "14:00", "14:30", "15:00", "15:30",
  "16:00", "16:30", "17:00", "17:30", "18:00", "18:30",
  "19:00", "19:30", "20:00", "20:30", "21:00", "21:30",
  "22:00", "22:30", "23:00",
];
const SNOOKER_TABLES = Array.from({ length: 10 }, (_, i) => String(i + 1));
const POOL_TABLES = Array.from({ length: 6 }, (_, i) => String(i + 1));
const TABLE_TYPES_LIST = [
  { id: "snooker", label: "Snooker", icon: "ellipse" as const },
  { id: "pool", label: "Pool", icon: "ellipse-outline" as const },
  { id: "dining", label: "Dining", icon: "restaurant" as const },
  { id: "darts", label: "Darts", icon: "disc" as const },
];

function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

function getWeekDays(startDate: Date): Array<{ date: string; dayName: string; dayNum: string; isToday: boolean }> {
  const days: Array<{ date: string; dayName: string; dayNum: string; isToday: boolean }> = [];
  const today = localDateStr(new Date());
  for (let i = 0; i < 7; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    const date = localDateStr(d);
    days.push({
      date,
      dayName: d.toLocaleDateString("en-GB", { weekday: "short" }),
      dayNum: d.getDate().toString(),
      isToday: date === today,
    });
  }
  return days;
}

export default function AdminBookingsScreen() {
  const insets = useSafeAreaInsets();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const { isAuthenticated, isManager, username, isLoading: authLoading } = useStaffAuth();
  const [showAddNotice, setShowAddNotice] = useState(false);
  const [newNoticeText, setNewNoticeText] = useState("");

  // Staff booking modal state
  const [showWalkIn, setShowWalkIn] = useState(false);
  const [wiSource, setWiSource] = useState<"walkin" | "telephone">("walkin");
  const [wiName, setWiName] = useState("");
  const [wiPhone, setWiPhone] = useState("");
  const [wiEmail, setWiEmail] = useState("");
  const [wiTableType, setWiTableType] = useState("snooker");
  const [wiTableNumber, setWiTableNumber] = useState("");
  const [wiTime, setWiTime] = useState("10:00");
  const [wiDuration, setWiDuration] = useState(1);
  const [wiGuestCount, setWiGuestCount] = useState(2);
  const [wiNotes, setWiNotes] = useState("");
  const [wiError, setWiError] = useState("");

  // Customer lookup autocomplete
  type CustomerSuggestion = { name: string; phone: string; email: string };
  const [suggestions, setSuggestions] = useState<CustomerSuggestion[]>([]);
  const [suggestionsFor, setSuggestionsFor] = useState<"name" | "phone" | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const searchCustomers = useCallback((q: string, field: "name" | "phone") => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.trim().length < 2) { setSuggestions([]); setSuggestionsFor(null); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        const { getApiUrl } = await import("@/lib/query-client");
        const url = new URL("/api/staff/customers/search", getApiUrl());
        url.searchParams.set("q", q.trim());
        const res = await fetch(url.toString(), { credentials: "include" });
        if (res.ok) {
          const data: CustomerSuggestion[] = await res.json();
          setSuggestions(data);
          setSuggestionsFor(data.length > 0 ? field : null);
        }
      } catch { /* silently ignore */ }
    }, 300);
  }, []);

  const applyCustomerSuggestion = (s: CustomerSuggestion) => {
    setWiName(s.name);
    setWiPhone(s.phone);
    // Don't auto-fill the email if it looks like a generated walk-in placeholder
    if (s.email && !s.email.includes("@the147.co.uk")) setWiEmail(s.email);
    setSuggestions([]);
    setSuggestionsFor(null);
  };

  const resetWalkIn = () => {
    setWiSource("walkin"); setWiName(""); setWiPhone(""); setWiEmail("");
    setWiTableType("snooker"); setWiTableNumber(""); setWiTime("10:00");
    setWiDuration(1); setWiGuestCount(2); setWiNotes(""); setWiError("");
    setSuggestions([]); setSuggestionsFor(null);
  };

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/staff-portal");
    }
  }, [authLoading, isAuthenticated]);

  const noticesQuery = useQuery<StaffNotice[]>({
    queryKey: ["/api/staff-notices"],
    enabled: isAuthenticated,
    refetchOnMount: "always",
  });

  const addNoticeMutation = useMutation({
    mutationFn: async (message: string) => {
      const res = await apiRequest("POST", "/api/staff-notices", { message });
      return res.json();
    },
    onSuccess: () => {
      setNewNoticeText("");
      setShowAddNotice(false);
      queryClient.refetchQueries({ queryKey: ["/api/staff-notices"] });
    },
  });

  const deleteNoticeMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/staff-notices/${id}`);
    },
    onSuccess: () => {
      queryClient.refetchQueries({ queryKey: ["/api/staff-notices"] });
    },
  });

  const handleAddNotice = () => {
    if (!newNoticeText.trim()) return;
    addNoticeMutation.mutate(newNoticeText.trim());
  };

  const handleDeleteNotice = (notice: StaffNotice) => {
    const msg = "Remove this notice?";
    if (Platform.OS === "web") {
      if (window.confirm(msg)) deleteNoticeMutation.mutate(notice.id);
    } else {
      Alert.alert("Remove Notice", msg, [
        { text: "Cancel", style: "cancel" },
        { text: "Remove", style: "destructive", onPress: () => deleteNoticeMutation.mutate(notice.id) },
      ]);
    }
  };

  const [weekStart, setWeekStart] = useState(() => {
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(today.getFullYear(), today.getMonth(), diff);
  });
  const [selectedDate, setSelectedDate] = useState(localDateStr(new Date()));

  const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart.toISOString()]);

  const bookingsQuery = useQuery<Booking[]>({
    queryKey: ["/api/bookings", `?date=${selectedDate}`],
    enabled: isAuthenticated,
  });

  const cancelMutation = useMutation({
    mutationFn: (id: number) => apiRequest("PATCH", `/api/bookings/${id}/status`, { status: "cancelled" }),
    onSuccess: () => {
      queryClient.refetchQueries({ queryKey: ["/api/bookings"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/bookings/${id}`),
    onSuccess: () => {
      queryClient.refetchQueries({ queryKey: ["/api/bookings"] });
    },
  });

  const walkInMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => apiRequest("POST", "/api/bookings", data),
    onSuccess: () => {
      queryClient.refetchQueries({ queryKey: ["/api/bookings"] });
      setShowWalkIn(false);
      resetWalkIn();
    },
    onError: (err: Error) => {
      let msg = "Booking failed. Please try again.";
      try {
        const text = err.message || "";
        const jsonStart = text.indexOf("{");
        if (jsonStart !== -1) {
          const parsed = JSON.parse(text.slice(jsonStart));
          if (parsed.message) msg = parsed.message;
        } else if (text) msg = text;
      } catch { msg = err.message || msg; }
      setWiError(msg);
    },
  });

  const handleWalkInSubmit = () => {
    setWiError("");
    if (!wiName.trim() || !wiPhone.trim()) {
      setWiError("Customer name and phone are required");
      return;
    }
    if ((wiTableType === "snooker" || wiTableType === "pool") && !wiTableNumber) {
      setWiError(`Please select a ${wiTableType} table number`);
      return;
    }
    const sourcePrefix = wiSource === "telephone" ? "[TEL] " : "[WALK-IN] ";
    const finalNotes = wiNotes.trim() ? `${sourcePrefix}${wiNotes.trim()}` : sourcePrefix.trim();
    walkInMutation.mutate({
      customerName: wiName.trim(),
      customerPhone: wiPhone.trim(),
      customerEmail: wiEmail.trim() || `${wiSource}-${Date.now()}@the147.co.uk`,
      tableType: wiTableType,
      tableNumber: (wiTableType === "snooker" || wiTableType === "pool") ? wiTableNumber : undefined,
      guestCount: wiTableType === "dining" ? wiGuestCount : undefined,
      date: selectedDate,
      startTime: wiTime,
      duration: wiDuration,
      notes: finalNotes,
      gdprConsent: true,
      status: "confirmed",
    });
  };

  const handleCancel = (booking: Booking) => {
    const msg = `Cancel booking for ${booking.customerName}?`;
    if (Platform.OS === "web") {
      if (window.confirm(msg)) cancelMutation.mutate(booking.id);
    } else {
      Alert.alert("Cancel Booking", msg, [
        { text: "No", style: "cancel" },
        { text: "Yes, Cancel", style: "destructive", onPress: () => cancelMutation.mutate(booking.id) },
      ]);
    }
  };

  const handleDelete = (booking: Booking) => {
    const msg = `Permanently delete booking for ${booking.customerName}? This cannot be undone.`;
    if (Platform.OS === "web") {
      if (window.confirm(msg)) deleteMutation.mutate(booking.id);
    } else {
      Alert.alert("Delete Booking", msg, [
        { text: "No", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate(booking.id) },
      ]);
    }
  };

  const prevWeek = () => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() - 7);
    setWeekStart(d);
  };

  const nextWeek = () => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 7);
    setWeekStart(d);
  };

  const goToToday = () => {
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1);
    setWeekStart(new Date(today.getFullYear(), today.getMonth(), diff));
    setSelectedDate(localDateStr(today));
  };

  const allBookings = bookingsQuery.data ?? [];
  const confirmedBookings = allBookings.filter((b) => b.status === "confirmed");
  const cancelledBookings = allBookings.filter((b) => b.status === "cancelled");

  const HOURS = Array.from({ length: 15 }, (_, i) => i + 10);

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Bookings Calendar</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Pressable onPress={goToToday} hitSlop={12}>
            <Text style={styles.todayBtn}>Today</Text>
          </Pressable>
          <Pressable
            onPress={() => { resetWalkIn(); setShowWalkIn(true); }}
            style={styles.addWalkInBtn}
            hitSlop={8}
            testID="add-walkin-btn"
          >
            <Ionicons name="add" size={20} color="#fff" />
          </Pressable>
        </View>
      </View>

      {/* NOTICES SECTION */}
      <View style={styles.noticesSection}>
        <View style={styles.noticesHeader}>
          <View style={styles.noticesTitleRow}>
            <Ionicons name="warning" size={16} color="#92400E" />
            <Text style={styles.noticesTitle}>NOTICES</Text>
          </View>
          {isManager && (
            <Pressable
              onPress={() => setShowAddNotice(!showAddNotice)}
              style={styles.addNoticeBtn}
              hitSlop={8}
            >
              <Ionicons name={showAddNotice ? "close" : "add"} size={18} color="#92400E" />
            </Pressable>
          )}
        </View>

        {showAddNotice && isManager && (
          <View style={styles.addNoticeForm}>
            <TextInput
              style={styles.noticeInput}
              value={newNoticeText}
              onChangeText={setNewNoticeText}
              placeholder="Type a notice for staff..."
              placeholderTextColor="#A16207"
              multiline
              maxLength={300}
              autoFocus
            />
            <Pressable
              onPress={handleAddNotice}
              disabled={!newNoticeText.trim() || addNoticeMutation.isPending}
              style={({ pressed }) => [
                styles.postNoticeBtn,
                (!newNoticeText.trim() || addNoticeMutation.isPending) && { opacity: 0.5 },
                { opacity: pressed ? 0.8 : 1 },
              ]}
            >
              {addNoticeMutation.isPending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.postNoticeBtnText}>Post Notice</Text>
              )}
            </Pressable>
          </View>
        )}

        {noticesQuery.data && noticesQuery.data.length === 0 && !showAddNotice && (
          <Text style={styles.noNoticesText}>No notices at this time</Text>
        )}

        {noticesQuery.data?.map((notice) => (
          <View key={notice.id} style={styles.noticeCard}>
            <View style={styles.noticeCardContent}>
              <Text style={styles.noticeMessage}>{notice.message}</Text>
              <Text style={styles.noticeMeta}>
                Posted by {notice.createdBy} · {new Date(notice.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              </Text>
            </View>
            {isManager && (
              <Pressable onPress={() => handleDeleteNotice(notice)} hitSlop={8}>
                <Ionicons name="trash-outline" size={16} color="#B45309" />
              </Pressable>
            )}
          </View>
        ))}
      </View>

      <View style={styles.weekNav}>
        <Pressable onPress={prevWeek} hitSlop={12}>
          <Ionicons name="chevron-back" size={22} color={Colors.brand.blue} />
        </Pressable>
        <Text style={styles.weekLabel}>
          {weekDays[0] ? formatDateLabel(weekDays[0].date).split(",")[0] : ""} - {weekDays[6] ? formatDateLabel(weekDays[6].date) : ""}
        </Text>
        <Pressable onPress={nextWeek} hitSlop={12}>
          <Ionicons name="chevron-forward" size={22} color={Colors.brand.blue} />
        </Pressable>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.daysScroll}>
        {weekDays.map((day) => {
          const isSelected = selectedDate === day.date;
          return (
            <Pressable
              key={day.date}
              onPress={() => setSelectedDate(day.date)}
              style={[styles.dayChip, isSelected && styles.dayChipSelected, day.isToday && !isSelected && styles.dayChipToday]}
            >
              <Text style={[styles.dayName, isSelected && styles.dayNameSelected]}>{day.dayName}</Text>
              <Text style={[styles.dayNumber, isSelected && styles.dayNumberSelected]}>{day.dayNum}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.dateSummary}>
        <Text style={styles.dateSummaryText}>{formatDateLabel(selectedDate)}</Text>
        <View style={styles.badgeRow}>
          <View style={[styles.countBadge, { backgroundColor: Colors.brand.blue + "15" }]}>
            <Text style={[styles.countText, { color: Colors.brand.blue }]}>{confirmedBookings.length} confirmed</Text>
          </View>
          {cancelledBookings.length > 0 && (
            <View style={[styles.countBadge, { backgroundColor: Colors.brand.red + "15" }]}>
              <Text style={[styles.countText, { color: Colors.brand.red }]}>{cancelledBookings.length} cancelled</Text>
            </View>
          )}
        </View>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {bookingsQuery.isLoading ? (
          <ActivityIndicator color={Colors.brand.blue} style={{ marginTop: 40 }} />
        ) : confirmedBookings.length === 0 && cancelledBookings.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="calendar-outline" size={48} color={Colors.light.textSecondary} />
            <Text style={styles.emptyTitle}>No Bookings</Text>
            <Text style={styles.emptySubtitle}>No bookings for this date</Text>
          </View>
        ) : (
          <>
            {confirmedBookings.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>CONFIRMED</Text>
                {confirmedBookings.map((booking) => (
                  <View key={booking.id} style={styles.bookingCard}>
                    <View style={styles.bookingHeader}>
                      <View style={styles.timeBlock}>
                        <Text style={styles.timeBlockText}>{booking.startTime}</Text>
                        <Text style={styles.durationLabel}>{booking.duration}h</Text>
                      </View>
                      <View style={styles.bookingInfo}>
                        <View style={styles.bookingNameRow}>
                          <Ionicons name={TABLE_ICONS[booking.tableType] as any} size={16} color={Colors.brand.blue} />
                          <Text style={styles.bookingTableType}>
                            {TABLE_LABELS[booking.tableType] || booking.tableType}{booking.tableNumber ? ` - Table ${booking.tableNumber}` : ""}
                          </Text>
                        </View>
                        <Text style={styles.bookingName}>{booking.customerName}</Text>
                        <View style={styles.contactRow}>
                          <Ionicons name="call-outline" size={12} color={Colors.light.textSecondary} />
                          <Text style={styles.contactText}>{booking.customerPhone}</Text>
                        </View>
                        <View style={styles.contactRow}>
                          <Ionicons name="mail-outline" size={12} color={Colors.light.textSecondary} />
                          <Text style={styles.contactText}>{booking.customerEmail}</Text>
                        </View>
                        {booking.notes ? (
                          <View style={styles.contactRow}>
                            <Ionicons name="chatbubble-outline" size={12} color={Colors.light.textSecondary} />
                            <Text style={styles.contactText}>{booking.notes}</Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                    <View style={styles.bookingActions}>
                      <Pressable
                        onPress={() => handleCancel(booking)}
                        style={({ pressed }) => [styles.actionBtn, styles.cancelBtn, { opacity: pressed ? 0.7 : 1 }]}
                      >
                        <Ionicons name="close-circle-outline" size={16} color={Colors.brand.red} />
                        <Text style={[styles.actionText, { color: Colors.brand.red }]}>Cancel</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => handleDelete(booking)}
                        style={({ pressed }) => [styles.actionBtn, styles.deleteBtn, { opacity: pressed ? 0.7 : 1 }]}
                      >
                        <Ionicons name="trash-outline" size={16} color={Colors.light.textSecondary} />
                      </Pressable>
                    </View>
                  </View>
                ))}
              </>
            )}

            {cancelledBookings.length > 0 && (
              <>
                <Text style={[styles.sectionLabel, { marginTop: 20 }]}>CANCELLED</Text>
                {cancelledBookings.map((booking) => (
                  <View key={booking.id} style={[styles.bookingCard, styles.cancelledCard]}>
                    <View style={styles.bookingHeader}>
                      <View style={[styles.timeBlock, styles.cancelledTimeBlock]}>
                        <Text style={[styles.timeBlockText, { color: Colors.light.textSecondary }]}>{booking.startTime}</Text>
                        <Text style={styles.durationLabel}>{booking.duration}h</Text>
                      </View>
                      <View style={styles.bookingInfo}>
                        <Text style={[styles.bookingName, { color: Colors.light.textSecondary }]}>{booking.customerName}</Text>
                        <Text style={[styles.bookingTableType, { color: Colors.light.textSecondary }]}>{TABLE_LABELS[booking.tableType] || booking.tableType}</Text>
                      </View>
                    </View>
                    <View style={styles.bookingActions}>
                      <Pressable
                        onPress={() => handleDelete(booking)}
                        style={({ pressed }) => [styles.actionBtn, styles.deleteBtn, { opacity: pressed ? 0.7 : 1 }]}
                      >
                        <Ionicons name="trash-outline" size={16} color={Colors.light.textSecondary} />
                      </Pressable>
                    </View>
                  </View>
                ))}
              </>
            )}
          </>
        )}
      </ScrollView>

      {/* Walk-in Booking Modal */}
      <Modal visible={showWalkIn} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowWalkIn(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <View style={[styles.modalContainer, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16) }]}>
            <View style={styles.modalHeader}>
              <Pressable onPress={() => setShowWalkIn(false)} hitSlop={12}>
                <Ionicons name="close" size={26} color={Colors.light.text} />
              </Pressable>
              <Text style={styles.modalTitle}>New Booking</Text>
              <View style={{ width: 26 }} />
            </View>
            <Text style={styles.modalSubtitle}>{formatDateLabel(selectedDate)}</Text>

            <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent} keyboardShouldPersistTaps="handled">
              {/* Booking Source */}
              <Text style={styles.fieldLabel}>BOOKING TYPE</Text>
              <View style={[styles.sourceRow, { marginBottom: 18 }]}>
                <Pressable
                  onPress={() => setWiSource("walkin")}
                  style={[styles.sourceBtn, wiSource === "walkin" && styles.sourceBtnSelected]}
                >
                  <Ionicons name="walk-outline" size={18} color={wiSource === "walkin" ? "#fff" : Colors.brand.blue} />
                  <Text style={[styles.sourceBtnText, wiSource === "walkin" && styles.sourceBtnTextSelected]}>Walk-in</Text>
                </Pressable>
                <Pressable
                  onPress={() => setWiSource("telephone")}
                  style={[styles.sourceBtn, wiSource === "telephone" && styles.sourceBtnSelected]}
                >
                  <Ionicons name="call-outline" size={18} color={wiSource === "telephone" ? "#fff" : Colors.brand.blue} />
                  <Text style={[styles.sourceBtnText, wiSource === "telephone" && styles.sourceBtnTextSelected]}>Telephone</Text>
                </Pressable>
              </View>

              {/* Customer Details */}
              <Text style={styles.fieldLabel}>CUSTOMER NAME *</Text>
              <View style={styles.autocompleteWrap}>
                <TextInput
                  style={styles.fieldInput}
                  value={wiName}
                  onChangeText={(v) => { setWiName(v); searchCustomers(v, "name"); }}
                  placeholder="Full name"
                  placeholderTextColor={Colors.light.textSecondary}
                  autoCapitalize="words"
                  testID="wi-name"
                />
                {suggestionsFor === "name" && suggestions.length > 0 && (
                  <View style={styles.suggestionsList}>
                    {suggestions.map((s, i) => (
                      <Pressable
                        key={i}
                        onPress={() => applyCustomerSuggestion(s)}
                        style={({ pressed }) => [styles.suggestionItem, pressed && styles.suggestionItemPressed, i < suggestions.length - 1 && styles.suggestionItemBorder]}
                      >
                        <Ionicons name="person-outline" size={14} color={Colors.brand.blue} style={{ marginTop: 1 }} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.suggestionName}>{s.name}</Text>
                          <Text style={styles.suggestionSub}>{s.phone}{s.email && !s.email.includes("@the147.co.uk") ? `  ·  ${s.email}` : ""}</Text>
                        </View>
                        <Ionicons name="arrow-forward-outline" size={13} color={Colors.light.textSecondary} />
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>

              <Text style={styles.fieldLabel}>PHONE *</Text>
              <View style={styles.autocompleteWrap}>
                <TextInput
                  style={styles.fieldInput}
                  value={wiPhone}
                  onChangeText={(v) => { setWiPhone(v); searchCustomers(v, "phone"); }}
                  placeholder="Phone number"
                  placeholderTextColor={Colors.light.textSecondary}
                  keyboardType="phone-pad"
                  testID="wi-phone"
                />
                {suggestionsFor === "phone" && suggestions.length > 0 && (
                  <View style={styles.suggestionsList}>
                    {suggestions.map((s, i) => (
                      <Pressable
                        key={i}
                        onPress={() => applyCustomerSuggestion(s)}
                        style={({ pressed }) => [styles.suggestionItem, pressed && styles.suggestionItemPressed, i < suggestions.length - 1 && styles.suggestionItemBorder]}
                      >
                        <Ionicons name="call-outline" size={14} color={Colors.brand.blue} style={{ marginTop: 1 }} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.suggestionName}>{s.name}</Text>
                          <Text style={styles.suggestionSub}>{s.phone}</Text>
                        </View>
                        <Ionicons name="arrow-forward-outline" size={13} color={Colors.light.textSecondary} />
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>

              <Text style={styles.fieldLabel}>EMAIL (OPTIONAL)</Text>
              <TextInput
                style={styles.fieldInput}
                value={wiEmail}
                onChangeText={setWiEmail}
                placeholder="Email address"
                placeholderTextColor={Colors.light.textSecondary}
                keyboardType="email-address"
                autoCapitalize="none"
              />

              {/* Table Type */}
              <Text style={styles.fieldLabel}>TABLE TYPE</Text>
              <View style={styles.chipRow}>
                {TABLE_TYPES_LIST.map((t) => (
                  <Pressable
                    key={t.id}
                    onPress={() => { setWiTableType(t.id); setWiTableNumber(""); if (t.id !== "snooker" && wiDuration > 3) setWiDuration(3); }}
                    style={[styles.chip, wiTableType === t.id && styles.chipSelected]}
                  >
                    <Ionicons name={t.icon} size={14} color={wiTableType === t.id ? "#fff" : Colors.brand.blue} />
                    <Text style={[styles.chipText, wiTableType === t.id && styles.chipTextSelected]}>{t.label}</Text>
                  </Pressable>
                ))}
              </View>

              {/* Table Number for Snooker / Pool */}
              {(wiTableType === "snooker" || wiTableType === "pool") && (
                <>
                  <Text style={styles.fieldLabel}>TABLE NUMBER *</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                    <View style={styles.chipRow}>
                      {(wiTableType === "snooker" ? SNOOKER_TABLES : POOL_TABLES).map((n) => (
                        <Pressable
                          key={n}
                          onPress={() => setWiTableNumber(n)}
                          style={[styles.numChip, wiTableNumber === n && styles.chipSelected]}
                        >
                          <Text style={[styles.numChipText, wiTableNumber === n && styles.chipTextSelected]}>{n}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </ScrollView>
                </>
              )}

              {/* Guest Count for Dining */}
              {wiTableType === "dining" && (
                <>
                  <Text style={styles.fieldLabel}>GUESTS</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                    <View style={styles.chipRow}>
                      {[2,3,4,5,6,7,8,9,10,12,15,20].map((n) => (
                        <Pressable
                          key={n}
                          onPress={() => setWiGuestCount(n)}
                          style={[styles.numChip, wiGuestCount === n && styles.chipSelected]}
                        >
                          <Text style={[styles.numChipText, wiGuestCount === n && styles.chipTextSelected]}>{n}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </ScrollView>
                </>
              )}

              {/* Time */}
              <Text style={styles.fieldLabel}>START TIME</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                <View style={styles.chipRow}>
                  {BOOKING_HOURS.map((h) => (
                    <Pressable key={h} onPress={() => setWiTime(h)} style={[styles.timeChip, wiTime === h && styles.chipSelected]}>
                      <Text style={[styles.timeChipText, wiTime === h && styles.chipTextSelected]}>{h}</Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>

              {/* Duration */}
              <Text style={styles.fieldLabel}>DURATION</Text>
              <View style={[styles.chipRow, { marginBottom: 16 }]}>
                {(wiTableType === "snooker" ? [1, 2, 3, 4] : [1, 2, 3]).map((d) => (
                  <Pressable key={d} onPress={() => setWiDuration(d)} style={[styles.chip, wiDuration === d && styles.chipSelected]}>
                    <Text style={[styles.chipText, wiDuration === d && styles.chipTextSelected]}>{d} {d === 1 ? "hour" : "hours"}</Text>
                  </Pressable>
                ))}
              </View>

              {/* Notes */}
              <Text style={styles.fieldLabel}>NOTES (OPTIONAL)</Text>
              <TextInput
                style={[styles.fieldInput, { minHeight: 72, textAlignVertical: "top" }]}
                value={wiNotes}
                onChangeText={setWiNotes}
                placeholder="Any special requests..."
                placeholderTextColor={Colors.light.textSecondary}
                multiline
                maxLength={300}
              />

              {!!wiError && (
                <Text style={styles.wiErrorText}>{wiError}</Text>
              )}

              <Pressable
                onPress={handleWalkInSubmit}
                disabled={walkInMutation.isPending}
                style={({ pressed }) => [styles.submitBtn, { opacity: pressed || walkInMutation.isPending ? 0.7 : 1 }]}
                testID="wi-submit"
              >
                {walkInMutation.isPending
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.submitBtnText}>Confirm Booking</Text>
                }
              </Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  headerTitle: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 18,
    color: Colors.light.text,
  },
  todayBtn: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 14,
    color: Colors.brand.blue,
  },
  weekNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  weekLabel: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 13,
    color: Colors.light.text,
  },
  daysScroll: {
    paddingHorizontal: 12,
    marginBottom: 4,
  },
  dayChip: {
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    marginHorizontal: 4,
    backgroundColor: Colors.light.surface,
    borderWidth: 1.5,
    borderColor: Colors.light.border,
    minWidth: 52,
  },
  dayChipSelected: {
    backgroundColor: Colors.brand.blue,
    borderColor: Colors.brand.blue,
  },
  dayChipToday: {
    borderColor: Colors.brand.blue,
  },
  dayName: {
    fontFamily: "Montserrat_500Medium",
    fontSize: 10,
    color: Colors.light.textSecondary,
    marginBottom: 2,
  },
  dayNameSelected: {
    color: "#FFFFFF",
  },
  dayNumber: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 16,
    color: Colors.light.text,
  },
  dayNumberSelected: {
    color: "#FFFFFF",
  },
  dateSummary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  dateSummaryText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 14,
    color: Colors.light.text,
  },
  badgeRow: {
    flexDirection: "row",
    gap: 8,
  },
  countBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  countText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 11,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: Platform.OS === "web" ? 50 : 40,
  },
  emptyState: {
    alignItems: "center",
    paddingTop: 60,
    gap: 8,
  },
  emptyTitle: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 18,
    color: Colors.light.text,
  },
  emptySubtitle: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 13,
    color: Colors.light.textSecondary,
  },
  sectionLabel: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 11,
    color: Colors.light.textSecondary,
    letterSpacing: 1.5,
    marginBottom: 12,
  },
  bookingCard: {
    backgroundColor: Colors.light.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderLeftWidth: 4,
    borderLeftColor: Colors.brand.blue,
  },
  cancelledCard: {
    borderLeftColor: Colors.light.textSecondary,
    opacity: 0.6,
  },
  bookingHeader: {
    flexDirection: "row",
    gap: 14,
  },
  timeBlock: {
    backgroundColor: Colors.brand.blue + "10",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 56,
  },
  cancelledTimeBlock: {
    backgroundColor: Colors.light.surfaceElevated,
  },
  timeBlockText: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 16,
    color: Colors.brand.blue,
  },
  durationLabel: {
    fontFamily: "Montserrat_500Medium",
    fontSize: 10,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  bookingInfo: {
    flex: 1,
    gap: 3,
  },
  bookingNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  bookingTableType: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 12,
    color: Colors.brand.blue,
  },
  bookingName: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 15,
    color: Colors.light.text,
  },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  contactText: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 12,
    color: Colors.light.textSecondary,
  },
  bookingActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
    paddingTop: 10,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  cancelBtn: {
    backgroundColor: Colors.brand.red + "10",
  },
  deleteBtn: {
    backgroundColor: Colors.light.surfaceElevated,
  },
  actionText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 12,
  },
  noticesSection: {
    backgroundColor: "#FEF3C7",
    borderBottomWidth: 1,
    borderBottomColor: "#FDE68A",
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
  },
  noticesHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  noticesTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  noticesTitle: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 11,
    color: "#92400E",
    letterSpacing: 1,
  },
  addNoticeBtn: {
    padding: 2,
  },
  addNoticeForm: {
    gap: 8,
    marginBottom: 8,
  },
  noticeInput: {
    backgroundColor: "#FFFBEB",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#FCD34D",
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: "Montserrat_400Regular",
    fontSize: 14,
    color: "#78350F",
    minHeight: 70,
    textAlignVertical: "top",
  },
  postNoticeBtn: {
    backgroundColor: "#D97706",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  postNoticeBtnText: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 14,
    color: "#fff",
  },
  noNoticesText: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 13,
    color: "#A16207",
    fontStyle: "italic",
  },
  noticeCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "#FFFBEB",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#FCD34D",
    padding: 10,
    marginBottom: 6,
  },
  noticeCardContent: {
    flex: 1,
    gap: 4,
  },
  noticeMessage: {
    fontFamily: "Montserrat_500Medium",
    fontSize: 13,
    color: "#78350F",
    lineHeight: 18,
  },
  noticeMeta: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 11,
    color: "#A16207",
  },
  addWalkInBtn: {
    backgroundColor: Colors.brand.blue,
    borderRadius: 8,
    padding: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  autocompleteWrap: {
    position: "relative",
    zIndex: 10,
    marginBottom: 0,
  },
  suggestionsList: {
    backgroundColor: Colors.light.background,
    borderWidth: 1,
    borderColor: Colors.brand.blue + "40",
    borderRadius: 10,
    marginTop: 4,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 4,
  },
  suggestionItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: Colors.light.background,
  },
  suggestionItemPressed: {
    backgroundColor: Colors.brand.blue + "10",
  },
  suggestionItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  suggestionName: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 14,
    color: Colors.light.text,
  },
  suggestionSub: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 12,
    color: Colors.light.textSecondary,
    marginTop: 1,
  },
  sourceRow: {
    flexDirection: "row",
    gap: 10,
  },
  sourceBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: Colors.light.surface,
    borderWidth: 2,
    borderColor: Colors.brand.blue + "40",
  },
  sourceBtnSelected: {
    backgroundColor: Colors.brand.blue,
    borderColor: Colors.brand.blue,
  },
  sourceBtnText: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 14,
    color: Colors.brand.blue,
  },
  sourceBtnTextSelected: {
    color: "#fff",
  },
  modalContainer: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  modalTitle: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 18,
    color: Colors.light.text,
  },
  modalSubtitle: {
    fontFamily: "Montserrat_500Medium",
    fontSize: 13,
    color: Colors.light.textSecondary,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  modalScroll: {
    flex: 1,
  },
  modalScrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  fieldLabel: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 10,
    color: Colors.light.textSecondary,
    letterSpacing: 1.2,
    marginBottom: 6,
    marginTop: 14,
  },
  fieldInput: {
    backgroundColor: Colors.light.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.light.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: "Montserrat_400Regular",
    fontSize: 15,
    color: Colors.light.text,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 4,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: Colors.light.surface,
    borderWidth: 1.5,
    borderColor: Colors.brand.blue + "50",
  },
  chipSelected: {
    backgroundColor: Colors.brand.blue,
    borderColor: Colors.brand.blue,
  },
  chipText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 13,
    color: Colors.brand.blue,
  },
  chipTextSelected: {
    color: "#fff",
  },
  numChip: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: Colors.light.surface,
    borderWidth: 1.5,
    borderColor: Colors.light.border,
    alignItems: "center",
    justifyContent: "center",
  },
  numChipText: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 15,
    color: Colors.light.text,
  },
  timeChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: Colors.light.surface,
    borderWidth: 1.5,
    borderColor: Colors.light.border,
  },
  timeChipText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 13,
    color: Colors.light.text,
  },
  wiErrorText: {
    fontFamily: "Montserrat_500Medium",
    fontSize: 13,
    color: Colors.brand.red,
    marginTop: 8,
    marginBottom: 4,
    textAlign: "center",
  },
  submitBtn: {
    backgroundColor: Colors.brand.blue,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 20,
  },
  submitBtnText: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 16,
    color: "#fff",
  },
});
