import React, { useState, useCallback } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Platform,
  Alert,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { TABLE_TYPES, TIME_SLOTS, PARTY_SIZES } from "@/lib/data";

function generateDateOptions() {
  const dates: { label: string; value: string; dayName: string; dayNum: string; month: string }[] = [];
  const today = new Date();
  for (let i = 0; i < 14; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const dayName = d.toLocaleDateString("en-GB", { weekday: "short" });
    const dayNum = d.getDate().toString();
    const month = d.toLocaleDateString("en-GB", { month: "short" });
    const value = d.toISOString().split("T")[0];
    dates.push({ label: i === 0 ? "Today" : i === 1 ? "Tomorrow" : dayName, value, dayName, dayNum, month });
  }
  return dates;
}

export default function BookScreen() {
  const insets = useSafeAreaInsets();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const dates = generateDateOptions();

  const [selectedDate, setSelectedDate] = useState(dates[0].value);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [selectedPartySize, setSelectedPartySize] = useState(2);
  const [showConfirmation, setShowConfirmation] = useState(false);

  const tableTypeIcons: Record<string, keyof typeof Ionicons.glyphMap> = {
    snooker: "ellipse",
    pool: "ellipse-outline",
    dining: "restaurant",
    vip: "star",
  };

  const canBook = selectedDate && selectedTime && selectedTable;

  const handleBook = useCallback(() => {
    if (!canBook) return;
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowConfirmation(true);
  }, [canBook]);

  const resetForm = useCallback(() => {
    setSelectedTime(null);
    setSelectedTable(null);
    setSelectedPartySize(2);
    setShowConfirmation(false);
  }, []);

  const selectedTableInfo = TABLE_TYPES.find((t) => t.id === selectedTable);
  const selectedDateInfo = dates.find((d) => d.value === selectedDate);

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 16 + webTopInset },
        ]}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.pageTitle}>Book a Table</Text>
        <Text style={styles.pageSubtitle}>Select your preferences below</Text>

        <Text style={styles.sectionLabel}>Select Date</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.dateRow}
        >
          {dates.map((d) => {
            const isSelected = d.value === selectedDate;
            return (
              <Pressable
                key={d.value}
                onPress={() => {
                  if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setSelectedDate(d.value);
                }}
                style={[
                  styles.dateChip,
                  isSelected && styles.dateChipSelected,
                ]}
              >
                <Text style={[styles.dateDayName, isSelected && styles.dateTextSelected]}>{d.label}</Text>
                <Text style={[styles.dateDayNum, isSelected && styles.dateTextSelected]}>{d.dayNum}</Text>
                <Text style={[styles.dateMonth, isSelected && styles.dateTextSelected]}>{d.month}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <Text style={styles.sectionLabel}>Table Type</Text>
        <View style={styles.tableGrid}>
          {TABLE_TYPES.map((table) => {
            const isSelected = selectedTable === table.id;
            return (
              <Pressable
                key={table.id}
                onPress={() => {
                  if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setSelectedTable(table.id);
                }}
                style={[styles.tableCard, isSelected && styles.tableCardSelected]}
              >
                <View style={[styles.tableIcon, isSelected && styles.tableIconSelected]}>
                  <Ionicons
                    name={tableTypeIcons[table.id] || "ellipse"}
                    size={22}
                    color={isSelected ? "#FFFFFF" : Colors.brand.blue}
                  />
                </View>
                <Text style={[styles.tableName, isSelected && styles.tableNameSelected]}>{table.name}</Text>
                <Text style={[styles.tablePrice, isSelected && styles.tablePriceSelected]}>
                  {table.pricePerHour === "Free" ? "Free" : `\u00A3${table.pricePerHour}/hr`}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.sectionLabel}>Party Size</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.partySizeRow}
        >
          {PARTY_SIZES.map((size) => {
            const isSelected = selectedPartySize === size;
            return (
              <Pressable
                key={size}
                onPress={() => {
                  if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setSelectedPartySize(size);
                }}
                style={[styles.sizeChip, isSelected && styles.sizeChipSelected]}
              >
                <Text style={[styles.sizeText, isSelected && styles.sizeTextSelected]}>
                  {size}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <Text style={styles.sectionLabel}>Select Time</Text>
        <View style={styles.timeGrid}>
          {TIME_SLOTS.map((time) => {
            const isSelected = selectedTime === time;
            return (
              <Pressable
                key={time}
                onPress={() => {
                  if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setSelectedTime(time);
                }}
                style={[styles.timeChip, isSelected && styles.timeChipSelected]}
              >
                <Text style={[styles.timeText, isSelected && styles.timeTextSelected]}>
                  {time}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={{ height: Platform.OS === "web" ? 34 : 140 }} />
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 16 }]}>
        <Pressable
          onPress={handleBook}
          disabled={!canBook}
          style={({ pressed }) => [
            styles.bookButton,
            !canBook && styles.bookButtonDisabled,
            { transform: [{ scale: pressed && canBook ? 0.97 : 1 }] },
          ]}
        >
          <LinearGradient
            colors={canBook ? [Colors.brand.blue, Colors.brand.navy] : ["#9CA3AF", "#6B7280"]}
            style={styles.bookButtonGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
            <Text style={styles.bookButtonText}>Confirm Booking</Text>
          </LinearGradient>
        </Pressable>
      </View>

      <Modal
        visible={showConfirmation}
        transparent
        animationType="fade"
        onRequestClose={() => setShowConfirmation(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.successIcon}>
              <Ionicons name="checkmark-circle" size={56} color={Colors.brand.blue} />
            </View>
            <Text style={styles.modalTitle}>Booking Confirmed!</Text>
            <Text style={styles.modalSubtitle}>We've reserved your spot</Text>

            <View style={styles.modalDetails}>
              <View style={styles.modalDetailRow}>
                <Ionicons name="calendar-outline" size={18} color={Colors.light.textSecondary} />
                <Text style={styles.modalDetailText}>
                  {selectedDateInfo?.label === "Today" || selectedDateInfo?.label === "Tomorrow"
                    ? selectedDateInfo.label
                    : `${selectedDateInfo?.dayName} ${selectedDateInfo?.dayNum} ${selectedDateInfo?.month}`}
                </Text>
              </View>
              <View style={styles.modalDetailRow}>
                <Ionicons name="time-outline" size={18} color={Colors.light.textSecondary} />
                <Text style={styles.modalDetailText}>{selectedTime}</Text>
              </View>
              <View style={styles.modalDetailRow}>
                <Ionicons name="people-outline" size={18} color={Colors.light.textSecondary} />
                <Text style={styles.modalDetailText}>{selectedPartySize} {selectedPartySize === 1 ? "person" : "people"}</Text>
              </View>
              <View style={styles.modalDetailRow}>
                <Ionicons name="location-outline" size={18} color={Colors.light.textSecondary} />
                <Text style={styles.modalDetailText}>{selectedTableInfo?.name}</Text>
              </View>
            </View>

            <Pressable
              onPress={resetForm}
              style={({ pressed }) => [
                styles.modalButton,
                { opacity: pressed ? 0.9 : 1 },
              ]}
            >
              <Text style={styles.modalButtonText}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  scrollContent: {
    paddingHorizontal: 20,
  },
  pageTitle: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 28,
    color: Colors.light.text,
    marginBottom: 4,
  },
  pageSubtitle: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 14,
    color: Colors.light.textSecondary,
    marginBottom: 24,
  },
  sectionLabel: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 16,
    color: Colors.light.text,
    marginBottom: 12,
    marginTop: 8,
  },
  dateRow: {
    gap: 10,
    paddingBottom: 4,
    marginBottom: 8,
  },
  dateChip: {
    width: 72,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: Colors.light.surface,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: Colors.light.border,
  },
  dateChipSelected: {
    backgroundColor: Colors.brand.blue,
    borderColor: Colors.brand.blue,
  },
  dateDayName: {
    fontFamily: "Montserrat_500Medium",
    fontSize: 11,
    color: Colors.light.textSecondary,
    marginBottom: 2,
  },
  dateDayNum: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 20,
    color: Colors.light.text,
  },
  dateMonth: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 11,
    color: Colors.light.textSecondary,
    marginTop: 1,
  },
  dateTextSelected: {
    color: "#FFFFFF",
  },
  tableGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 8,
  },
  tableCard: {
    width: "47%" as any,
    flexGrow: 1,
    flexBasis: "45%" as any,
    padding: 16,
    borderRadius: 14,
    backgroundColor: Colors.light.surface,
    borderWidth: 1.5,
    borderColor: Colors.light.border,
    alignItems: "center",
  },
  tableCardSelected: {
    borderColor: Colors.brand.blue,
    backgroundColor: Colors.brand.blue + "08",
  },
  tableIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.brand.blue + "12",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  tableIconSelected: {
    backgroundColor: Colors.brand.blue,
  },
  tableName: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 13,
    color: Colors.light.text,
    textAlign: "center",
  },
  tableNameSelected: {
    color: Colors.brand.blue,
  },
  tablePrice: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 12,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  tablePriceSelected: {
    color: Colors.brand.blue,
  },
  partySizeRow: {
    gap: 10,
    paddingBottom: 4,
    marginBottom: 8,
  },
  sizeChip: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: Colors.light.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: Colors.light.border,
  },
  sizeChipSelected: {
    backgroundColor: Colors.brand.blue,
    borderColor: Colors.brand.blue,
  },
  sizeText: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 16,
    color: Colors.light.text,
  },
  sizeTextSelected: {
    color: "#FFFFFF",
  },
  timeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 8,
  },
  timeChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Colors.light.surface,
    borderWidth: 1.5,
    borderColor: Colors.light.border,
  },
  timeChipSelected: {
    backgroundColor: Colors.brand.blue,
    borderColor: Colors.brand.blue,
  },
  timeText: {
    fontFamily: "Montserrat_500Medium",
    fontSize: 13,
    color: Colors.light.text,
  },
  timeTextSelected: {
    color: "#FFFFFF",
  },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: "rgba(248,249,251,0.95)",
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
  },
  bookButton: {
    borderRadius: 14,
    overflow: "hidden",
  },
  bookButtonDisabled: {
    opacity: 0.6,
  },
  bookButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
  },
  bookButtonText: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 16,
    color: "#FFFFFF",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  modalCard: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 32,
    alignItems: "center",
  },
  successIcon: {
    marginBottom: 16,
  },
  modalTitle: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 22,
    color: Colors.light.text,
    marginBottom: 4,
  },
  modalSubtitle: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 14,
    color: Colors.light.textSecondary,
    marginBottom: 24,
  },
  modalDetails: {
    width: "100%",
    gap: 14,
    marginBottom: 28,
  },
  modalDetailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  modalDetailText: {
    fontFamily: "Montserrat_500Medium",
    fontSize: 15,
    color: Colors.light.text,
  },
  modalButton: {
    width: "100%",
    backgroundColor: Colors.brand.blue,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  modalButtonText: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 15,
    color: "#FFFFFF",
  },
});
