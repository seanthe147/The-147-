import React, { useState, useEffect, useMemo } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
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
import type { Booking } from "@shared/schema";

const TABLE_LABELS: Record<string, string> = {
  snooker: "Snooker",
  pool: "Pool",
  dining: "Dining",
  vip: "VIP Lounge",
};

const TABLE_ICONS: Record<string, string> = {
  snooker: "ellipse",
  pool: "ellipse-outline",
  dining: "restaurant",
  vip: "star",
};

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

function getWeekDays(startDate: Date): Array<{ date: string; dayName: string; dayNum: string; isToday: boolean }> {
  const days: Array<{ date: string; dayName: string; dayNum: string; isToday: boolean }> = [];
  const today = new Date().toISOString().slice(0, 10);
  for (let i = 0; i < 7; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    const date = d.toISOString().slice(0, 10);
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
  const { isAuthenticated, isLoading: authLoading } = useStaffAuth();

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/staff-portal");
    }
  }, [authLoading, isAuthenticated]);

  const [weekStart, setWeekStart] = useState(() => {
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(today.getFullYear(), today.getMonth(), diff);
  });
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));

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
    setSelectedDate(today.toISOString().slice(0, 10));
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
        <Pressable onPress={goToToday} hitSlop={12}>
          <Text style={styles.todayBtn}>Today</Text>
        </Pressable>
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
});
