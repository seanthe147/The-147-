import React, { useState, useMemo, useContext } from "react";
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
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BottomTabBarHeightContext } from "@react-navigation/bottom-tabs";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/query-client";
import Colors from "@/constants/colors";
import { TABLE_TYPES } from "@/lib/data";

const BOOKING_HOURS = [
  "10:00", "11:00", "12:00", "13:00", "14:00", "15:00",
  "16:00", "17:00", "18:00", "19:00", "20:00", "21:00",
  "22:00", "23:00",
];

const DURATION_OPTIONS = [1, 2, 3];

const SNOOKER_TABLES = Array.from({ length: 10 }, (_, i) => (i + 1).toString());

function getNext7Days(): Array<{ label: string; date: string; dayName: string; dayNum: string }> {
  const days: Array<{ label: string; date: string; dayName: string; dayNum: string }> = [];
  const now = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    const date = d.toISOString().slice(0, 10);
    const dayName = d.toLocaleDateString("en-GB", { weekday: "short" });
    const dayNum = d.getDate().toString();
    const label = i === 0 ? "Today" : i === 1 ? "Tomorrow" : dayName;
    days.push({ label, date, dayName, dayNum });
  }
  return days;
}

type Step = "table" | "datetime" | "details" | "confirm" | "success";

export default function BookScreen() {
  const insets = useSafeAreaInsets();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0;

  const [step, setStep] = useState<Step>("table");
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [selectedTableNumber, setSelectedTableNumber] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [duration, setDuration] = useState(1);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [gdprConsent, setGdprConsent] = useState(false);

  const days = useMemo(() => getNext7Days(), []);

  const isSnooker = selectedTable === "snooker";
  const availabilityQueryStr = isSnooker && selectedTableNumber
    ? `?date=${selectedDate}&tableType=${selectedTable}&tableNumber=${selectedTableNumber}`
    : `?date=${selectedDate}&tableType=${selectedTable}`;
  const availabilityQuery = useQuery<Array<{ startTime: string; duration: number }>>({
    queryKey: ["/api/bookings/availability", availabilityQueryStr],
    enabled: !!selectedDate && !!selectedTable && (!isSnooker || !!selectedTableNumber),
  });

  const bookedSlots = availabilityQuery.data ?? [];

  const isSlotBooked = (time: string, dur: number) => {
    const reqStart = parseInt(time.replace(":", ""));
    const reqEnd = reqStart + dur * 100;
    for (const slot of bookedSlots) {
      const slotStart = parseInt(slot.startTime.replace(":", ""));
      const slotEnd = slotStart + slot.duration * 100;
      if (reqStart < slotEnd && reqEnd > slotStart) return true;
    }
    return false;
  };

  const bookMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/bookings", data),
    onSuccess: () => {
      setStep("success");
      queryClient.refetchQueries({ queryKey: ["/api/bookings/availability"] });
    },
    onError: (err: Error) => {
      if (Platform.OS === "web") {
        window.alert(err.message || "Booking failed. Please try again.");
      } else {
        Alert.alert("Booking Error", err.message || "Booking failed. Please try again.");
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
      tableNumber: selectedTableNumber || null,
      date: selectedDate,
      startTime: selectedTime,
      duration,
      notes: notes.trim() || null,
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
    setName("");
    setEmail("");
    setPhone("");
    setNotes("");
    setGdprConsent(false);
  };

  const stepIndex = ["table", "datetime", "details", "confirm", "success"].indexOf(step);

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Book a Table</Text>
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
          contentContainerStyle={[styles.scrollContent, { paddingBottom: Platform.OS === "web" ? 50 : tabBarHeight + 20 }]}
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
                      onPress={() => { setSelectedTable(table.id); if (table.id !== "snooker") setSelectedTableNumber(null); }}
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
                        {table.pricePerHour === "Free" ? "Free" : `\u00A3${table.pricePerHour}/${table.priceUnit === "game" ? "game" : "hr"}`}
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
                      const isSelected = selectedTableNumber === num;
                      return (
                        <Pressable
                          key={num}
                          onPress={() => setSelectedTableNumber(num)}
                          style={[styles.tableNumberChip, isSelected && styles.tableNumberChipSelected]}
                          testID={`snooker-table-${num}`}
                        >
                          <Text style={[styles.tableNumberText, isSelected && styles.tableNumberTextSelected]}>{num}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </>
              )}

              <Pressable
                onPress={() => { if (selectedTable && (!isSnooker || selectedTableNumber)) setStep("datetime"); }}
                disabled={!selectedTable || (isSnooker && !selectedTableNumber)}
                style={[styles.nextButton, (!selectedTable || (isSnooker && !selectedTableNumber)) && styles.nextButtonDisabled]}
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
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.daysRow}>
                {days.map((day) => {
                  const isSelected = selectedDate === day.date;
                  return (
                    <Pressable
                      key={day.date}
                      onPress={() => { setSelectedDate(day.date); setSelectedTime(null); }}
                      style={[styles.dayCard, isSelected && styles.dayCardSelected]}
                      testID={`day-${day.date}`}
                    >
                      <Text style={[styles.dayLabel, isSelected && styles.dayLabelSelected]}>{day.label}</Text>
                      <Text style={[styles.dayNum, isSelected && styles.dayNumSelected]}>{day.dayNum}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              {selectedDate && (
                <>
                  <Text style={[styles.stepTitle, { marginTop: 24 }]}>Duration</Text>
                  <View style={styles.durationRow}>
                    {DURATION_OPTIONS.map((d) => (
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
                      {BOOKING_HOURS.map((time) => {
                        const booked = isSlotBooked(time, duration);
                        const isSelected = selectedTime === time;
                        const timeHour = parseInt(time.split(":")[0]);
                        const endHour = timeHour + duration;
                        const tooLate = endHour > 24;
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

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Full Name *</Text>
                <TextInput
                  style={styles.formInput}
                  value={name}
                  onChangeText={setName}
                  placeholder="John Smith"
                  placeholderTextColor={Colors.light.textSecondary}
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
                  placeholderTextColor={Colors.light.textSecondary}
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
                  placeholderTextColor={Colors.light.textSecondary}
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
                  placeholderTextColor={Colors.light.textSecondary}
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
                      {selectedDate ? new Date(selectedDate + "T00:00:00").toLocaleDateString("en-GB", {
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
                      {selectedTime} - {selectedTime ? `${(parseInt(selectedTime.split(":")[0]) + duration).toString().padStart(2, "0")}:00` : ""} ({duration} {duration === 1 ? "hour" : "hours"})
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
                            : `\u00A3${parseInt(selectedTableData.pricePerHour) * duration}`}
                        </Text>
                      </View>
                    </View>
                  </>
                )}
              </View>

              <Pressable
                onPress={handleSubmit}
                disabled={bookMutation.isPending}
                style={[styles.confirmButton, bookMutation.isPending && { opacity: 0.6 }]}
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

          {step === "success" && (
            <View style={styles.successSection}>
              <View style={styles.successIconWrap}>
                <Ionicons name="checkmark-circle" size={64} color={Colors.brand.green} />
              </View>
              <Text style={styles.successTitle}>Booking Confirmed!</Text>
              <Text style={styles.successSubtitle}>
                Your {selectedTableData?.name?.toLowerCase()}{selectedTableNumber ? ` (Table ${selectedTableNumber})` : ""} has been booked for {selectedDate ? new Date(selectedDate + "T00:00:00").toLocaleDateString("en-GB", {
                  weekday: "short", day: "numeric", month: "short",
                }) : ""} at {selectedTime}.
              </Text>
              <Text style={styles.successNote}>
                You'll receive a confirmation at {email}. Please arrive 5 minutes before your slot.
              </Text>
              <Pressable onPress={resetForm} style={styles.newBookingButton} testID="book-new-booking">
                <Ionicons name="add-circle" size={20} color={Colors.brand.blue} />
                <Text style={styles.newBookingText}>Make Another Booking</Text>
              </Pressable>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  header: {
    backgroundColor: Colors.brand.navy,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  headerTitle: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 22,
    color: "#FFFFFF",
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
});
