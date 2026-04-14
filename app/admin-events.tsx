import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  TextInput,
  Platform,
  Alert,
  ActivityIndicator,
  Linking,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/query-client";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import Colors from "@/constants/colors";
import type { Event } from "@shared/schema";

const COLOR_PRESETS = [
  { value: "#0047AB", label: "Blue" },
  { value: "#7C3AED", label: "Purple" },
  { value: "#059669", label: "Green" },
  { value: "#DC2626", label: "Red" },
  { value: "#B45309", label: "Amber" },
  { value: "#0891B2", label: "Teal" },
  { value: "#BE185D", label: "Pink" },
  { value: "#6D28D9", label: "Violet" },
];

const DAYS_OF_WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

interface EventForm {
  title: string;
  description: string;
  date: string;
  time: string;
  endTime: string;
  ticketUrl: string;
  imageColor: string;
  active: boolean;
  eventType: "event" | "weekly";
  dayOfWeek: string;
}

const emptyForm: EventForm = {
  title: "",
  description: "",
  date: "",
  time: "",
  endTime: "",
  ticketUrl: "",
  imageColor: "#0047AB",
  active: true,
  eventType: "event",
  dayOfWeek: "",
};

function formatDisplayDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

function formatDisplayTime(timeStr: string): string {
  if (!timeStr) return "";
  const [h, m] = timeStr.split(":");
  const hour = parseInt(h, 10);
  const suffix = hour >= 12 ? "pm" : "am";
  const dh = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return m === "00" ? `${dh}${suffix}` : `${dh}:${m}${suffix}`;
}

export default function AdminEventsScreen() {
  const insets = useSafeAreaInsets();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const { isAuthenticated, isLoading: authLoading } = useStaffAuth();

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/staff-portal");
    }
  }, [authLoading, isAuthenticated]);

  const [form, setForm] = useState<EventForm>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [adminTab, setAdminTab] = useState<"events" | "weekly">("events");

  const { data: oneOffEvents, isLoading: loadingOneOff, isError: errorOneOff, refetch: refetchOneOff } = useQuery<Event[]>({
    queryKey: ["/api/events/all?type=event"],
    enabled: isAuthenticated,
    staleTime: 0,
  });

  const { data: weeklyEventsData, isLoading: loadingWeekly, isError: errorWeekly, refetch: refetchWeekly } = useQuery<Event[]>({
    queryKey: ["/api/events/all?type=weekly"],
    enabled: isAuthenticated,
    staleTime: 0,
  });

  const isLoading = loadingOneOff || loadingWeekly;
  const isError = errorOneOff || errorWeekly;
  const [refreshing, setRefreshing] = useState(false);

  async function handleRefresh() {
    setRefreshing(true);
    await Promise.all([refetchOneOff(), refetchWeekly()]);
    setRefreshing(false);
  }

  async function invalidateAll() {
    await queryClient.invalidateQueries({ queryKey: ["/api/events/all?type=event"] });
    await queryClient.invalidateQueries({ queryKey: ["/api/events/all?type=weekly"] });
    await queryClient.invalidateQueries({ queryKey: ["/api/events?type=event"] });
    await queryClient.invalidateQueries({ queryKey: ["/api/events?type=weekly"] });
  }

  const createMutation = useMutation({
    mutationFn: (data: EventForm) => apiRequest("POST", "/api/events", data),
    onSuccess: async () => {
      resetForm();
      await invalidateAll();
    },
    onError: () => {
      Alert.alert("Error", "Failed to create event. Please check your connection and try again.");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: EventForm }) =>
      apiRequest("PUT", `/api/events/${id}`, data),
    onSuccess: async () => {
      resetForm();
      await invalidateAll();
    },
    onError: () => {
      Alert.alert("Error", "Failed to update event. Please try again.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/events/${id}`);
      return id;
    },
    onSuccess: async () => {
      await invalidateAll();
    },
    onError: () => {
      Alert.alert("Error", "Failed to delete event. Please try again.");
    },
  });

  function resetForm() {
    setForm({ ...emptyForm, eventType: adminTab === "weekly" ? "weekly" : "event" });
    setEditingId(null);
    setShowForm(false);
  }

  function startEdit(event: Event) {
    setForm({
      title: event.title,
      description: event.description || "",
      date: event.date || "",
      time: event.time || "",
      endTime: event.endTime || "",
      ticketUrl: event.ticketUrl || "",
      imageColor: event.imageColor,
      active: event.active,
      eventType: (event.eventType as "event" | "weekly") || "event",
      dayOfWeek: event.dayOfWeek || "",
    });
    setEditingId(event.id);
    setShowForm(true);
  }

  function handleSave() {
    if (!form.title.trim()) {
      Alert.alert("Missing Info", "Please enter an event title.");
      return;
    }
    if (form.eventType === "event") {
      if (!form.date.trim()) {
        Alert.alert("Missing Info", "Please enter a date (YYYY-MM-DD).");
        return;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date.trim())) {
        Alert.alert("Invalid Date", "Please enter the date in YYYY-MM-DD format (e.g. 2026-03-15).");
        return;
      }
    } else {
      if (!form.dayOfWeek) {
        Alert.alert("Missing Info", "Please select a day of the week.");
        return;
      }
    }
    if (form.time && !/^\d{2}:\d{2}$/.test(form.time.trim())) {
      Alert.alert("Invalid Time", "Please enter the time in HH:MM format (e.g. 19:30).");
      return;
    }

    const submitData = {
      ...form,
      title: form.title.trim(),
      description: form.description.trim() || null,
      date: form.eventType === "event" ? form.date.trim() : null,
      time: form.time.trim() || null,
      endTime: form.endTime.trim() || null,
      ticketUrl: form.ticketUrl.trim() || null,
      dayOfWeek: form.eventType === "weekly" ? form.dayOfWeek : null,
    };

    if (editingId !== null) {
      updateMutation.mutate({ id: editingId, data: submitData as any });
    } else {
      createMutation.mutate(submitData as any);
    }
  }

  function handleDelete(id: number) {
    if (Platform.OS === "web") {
      const confirmed = window.confirm("Are you sure you want to delete this event?");
      if (confirmed) deleteMutation.mutate(id);
    } else {
      Alert.alert("Delete Event", "Are you sure you want to delete this event?", [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate(id) },
      ]);
    }
  }

  async function toggleActive(event: Event) {
    try {
      await apiRequest("PUT", `/api/events/${event.id}`, { active: !event.active });
      await invalidateAll();
    } catch {
      Alert.alert("Error", "Failed to update event visibility.");
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  const filteredEvents = adminTab === "events"
    ? (oneOffEvents || [])
    : (weeklyEventsData || []);

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const upcoming = adminTab === "events"
    ? filteredEvents.filter((e) => e.date && new Date(e.date + "T23:59:59") >= now)
    : filteredEvents;
  const past = adminTab === "events"
    ? filteredEvents.filter((e) => e.date && new Date(e.date + "T23:59:59") < now)
    : [];

  function openNewForm() {
    setForm({ ...emptyForm, eventType: adminTab === "weekly" ? "weekly" : "event" });
    setEditingId(null);
    setShowForm(true);
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={28} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Manage Events</Text>
        <Pressable
          onPress={() => {
            if (showForm) resetForm();
            else openNewForm();
          }}
          hitSlop={12}
        >
          <Ionicons
            name={showForm ? "close-circle" : "add-circle"}
            size={28}
            color={Colors.brand.blue}
          />
        </Pressable>
      </View>

      <View style={styles.adminTabBar}>
        <Pressable
          onPress={() => { setAdminTab("events"); if (showForm) resetForm(); }}
          style={[styles.adminTab, adminTab === "events" && styles.adminTabActive]}
        >
          <Ionicons name="calendar" size={16} color={adminTab === "events" ? Colors.brand.blue : Colors.light.textSecondary} />
          <Text style={[styles.adminTabText, adminTab === "events" && styles.adminTabTextActive]}>
            One-Off Events
          </Text>
        </Pressable>
        <Pressable
          onPress={() => { setAdminTab("weekly"); if (showForm) resetForm(); }}
          style={[styles.adminTab, adminTab === "weekly" && styles.adminTabActive]}
        >
          <Ionicons name="repeat" size={16} color={adminTab === "weekly" ? Colors.brand.blue : Colors.light.textSecondary} />
          <Text style={[styles.adminTabText, adminTab === "weekly" && styles.adminTabTextActive]}>
            Weekly (What's On)
          </Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.brand.blue} />
        }
      >
        {showForm && (
          <View style={styles.formContainer}>
            <Text style={styles.formHeading}>
              {editingId !== null ? "Edit" : "New"} {form.eventType === "weekly" ? "Weekly Event" : "Event"}
            </Text>

            {editingId === null && (
              <View style={styles.typeToggle}>
                <Pressable
                  onPress={() => setForm((f) => ({ ...f, eventType: "event", dayOfWeek: "" }))}
                  style={[styles.typeOption, form.eventType === "event" && styles.typeOptionActive]}
                >
                  <Ionicons name="calendar" size={16} color={form.eventType === "event" ? Colors.brand.blue : Colors.light.textSecondary} />
                  <Text style={[styles.typeOptionText, form.eventType === "event" && { color: Colors.brand.blue }]}>One-Off Event</Text>
                </Pressable>
                <Pressable
                  onPress={() => setForm((f) => ({ ...f, eventType: "weekly", date: "" }))}
                  style={[styles.typeOption, form.eventType === "weekly" && styles.typeOptionActive]}
                >
                  <Ionicons name="repeat" size={16} color={form.eventType === "weekly" ? Colors.brand.blue : Colors.light.textSecondary} />
                  <Text style={[styles.typeOptionText, form.eventType === "weekly" && { color: Colors.brand.blue }]}>Weekly</Text>
                </Pressable>
              </View>
            )}

            <Text style={styles.fieldLabel}>Event Title *</Text>
            <TextInput
              style={styles.input}
              placeholder={form.eventType === "weekly" ? "e.g. Curry Night" : "e.g. Kids Easter Party"}
              placeholderTextColor="#9CA3AF"
              value={form.title}
              onChangeText={(t) => setForm((f) => ({ ...f, title: t }))}
              testID="event-title-input"
            />

            <Text style={styles.fieldLabel}>Description</Text>
            <TextInput
              style={[styles.input, { minHeight: 80, textAlignVertical: "top" }]}
              placeholder="Event details..."
              placeholderTextColor="#9CA3AF"
              value={form.description}
              onChangeText={(t) => setForm((f) => ({ ...f, description: t }))}
              multiline
              testID="event-description-input"
            />

            {form.eventType === "weekly" ? (
              <>
                <Text style={styles.fieldLabel}>Day of the Week *</Text>
                <View style={styles.dayGrid}>
                  {DAYS_OF_WEEK.map((day) => (
                    <Pressable
                      key={day}
                      onPress={() => setForm((f) => ({ ...f, dayOfWeek: day }))}
                      style={[styles.dayOption, form.dayOfWeek === day && styles.dayOptionActive]}
                    >
                      <Text style={[styles.dayOptionText, form.dayOfWeek === day && styles.dayOptionTextActive]}>
                        {day.slice(0, 3)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : (
              <View style={styles.rowFields}>
                <View style={styles.halfField}>
                  <Text style={styles.fieldLabel}>Date * (YYYY-MM-DD)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="2026-03-15"
                    placeholderTextColor="#9CA3AF"
                    value={form.date}
                    onChangeText={(t) => setForm((f) => ({ ...f, date: t }))}
                    testID="event-date-input"
                  />
                </View>
                <View style={styles.halfField}>
                  <Text style={styles.fieldLabel}>Start Time (HH:MM)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="19:30"
                    placeholderTextColor="#9CA3AF"
                    value={form.time}
                    onChangeText={(t) => setForm((f) => ({ ...f, time: t }))}
                    testID="event-time-input"
                  />
                </View>
              </View>
            )}

            {form.eventType === "weekly" && (
              <View style={styles.rowFields}>
                <View style={styles.halfField}>
                  <Text style={styles.fieldLabel}>Start Time (HH:MM)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="19:00"
                    placeholderTextColor="#9CA3AF"
                    value={form.time}
                    onChangeText={(t) => setForm((f) => ({ ...f, time: t }))}
                  />
                </View>
                <View style={styles.halfField}>
                  <Text style={styles.fieldLabel}>End Time (HH:MM)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="23:00"
                    placeholderTextColor="#9CA3AF"
                    value={form.endTime}
                    onChangeText={(t) => setForm((f) => ({ ...f, endTime: t }))}
                  />
                </View>
              </View>
            )}

            {form.eventType === "event" && (
              <>
                <Text style={styles.fieldLabel}>End Time (HH:MM)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="23:00"
                  placeholderTextColor="#9CA3AF"
                  value={form.endTime}
                  onChangeText={(t) => setForm((f) => ({ ...f, endTime: t }))}
                />
              </>
            )}

            <Text style={styles.fieldLabel}>Ticket Link (URL)</Text>
            <TextInput
              style={styles.input}
              placeholder="https://www.ticketsource.com/the147/..."
              placeholderTextColor="#9CA3AF"
              value={form.ticketUrl}
              onChangeText={(t) => setForm((f) => ({ ...f, ticketUrl: t }))}
              autoCapitalize="none"
              keyboardType="url"
              testID="event-ticket-url-input"
            />

            <Text style={styles.fieldLabel}>Color</Text>
            <View style={styles.colorGrid}>
              {COLOR_PRESETS.map((preset) => (
                <Pressable
                  key={preset.value}
                  onPress={() => setForm((f) => ({ ...f, imageColor: preset.value }))}
                  style={[
                    styles.colorOption,
                    form.imageColor === preset.value && styles.colorOptionSelected,
                  ]}
                >
                  <View style={[styles.colorSwatch, { backgroundColor: preset.value }]} />
                  <Text
                    style={[
                      styles.colorLabel,
                      form.imageColor === preset.value && { color: Colors.brand.blue },
                    ]}
                  >
                    {preset.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Pressable
              onPress={() => setForm((f) => ({ ...f, active: !f.active }))}
              style={styles.activeToggle}
            >
              <Ionicons
                name={form.active ? "checkmark-circle" : "ellipse-outline"}
                size={22}
                color={form.active ? Colors.brand.green : Colors.light.textSecondary}
              />
              <Text style={styles.activeToggleText}>
                {form.active ? "Active (visible to customers)" : "Hidden (draft)"}
              </Text>
            </Pressable>

            <View style={styles.formActions}>
              <Pressable onPress={resetForm} style={[styles.formButton, styles.cancelButton]}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleSave}
                disabled={isSaving}
                style={[styles.formButton, styles.saveButton, isSaving && { opacity: 0.6 }]}
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveButtonText}>
                    {editingId !== null ? "Update" : "Create"}
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        )}

        {isLoading ? (
          <ActivityIndicator size="large" color={Colors.brand.blue} style={{ marginTop: 40 }} />
        ) : isError ? (
          <View style={styles.emptyState}>
            <Ionicons name="cloud-offline-outline" size={48} color="#EF4444" />
            <Text style={[styles.emptyText, { color: "#EF4444" }]}>Could not load events</Text>
            <Text style={styles.emptySubtext}>Pull down to refresh, or log out and back in if this persists.</Text>
            <Pressable
              onPress={handleRefresh}
              style={{ marginTop: 16, backgroundColor: Colors.brand.blue, borderRadius: 8, paddingHorizontal: 20, paddingVertical: 10 }}
            >
              <Text style={{ color: "#fff", fontWeight: "600" }}>Retry</Text>
            </Pressable>
          </View>
        ) : filteredEvents.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name={adminTab === "weekly" ? "repeat-outline" : "calendar-outline"} size={48} color="#D1D5DB" />
            <Text style={styles.emptyText}>
              {adminTab === "weekly" ? "No weekly events yet" : "No events yet"}
            </Text>
            <Text style={styles.emptySubtext}>
              Tap the + button above to create {adminTab === "weekly" ? "a weekly event" : "an event"}
            </Text>
          </View>
        ) : (
          <>
            {upcoming.length > 0 && (
              <View style={styles.eventSection}>
                <Text style={styles.listHeading}>
                  {adminTab === "weekly"
                    ? `Weekly Events (${upcoming.length})`
                    : `Upcoming Events (${upcoming.length})`}
                </Text>
                {upcoming.map((event) => (
                  <EventRow
                    key={event.id}
                    event={event}
                    onEdit={() => startEdit(event)}
                    onDelete={() => handleDelete(event.id)}
                    onToggleActive={() => toggleActive(event)}
                  />
                ))}
              </View>
            )}

            {past.length > 0 && (
              <View style={styles.eventSection}>
                <Text style={styles.listHeading}>
                  Past Events ({past.length})
                </Text>
                {past.map((event) => (
                  <EventRow
                    key={event.id}
                    event={event}
                    onEdit={() => startEdit(event)}
                    onDelete={() => handleDelete(event.id)}
                    onToggleActive={() => toggleActive(event)}
                    isPast
                  />
                ))}
              </View>
            )}
          </>
        )}

        <View style={{ height: Platform.OS === "web" ? 34 : 40 }} />
      </ScrollView>
    </View>
  );
}

function EventRow({
  event,
  onEdit,
  onDelete,
  onToggleActive,
  isPast,
}: {
  event: Event;
  onEdit: () => void;
  onDelete: () => void;
  onToggleActive: () => void;
  isPast?: boolean;
}) {
  const isWeekly = event.eventType === "weekly";
  const dateDisplay = isWeekly
    ? `Every ${event.dayOfWeek || "week"}`
    : formatDisplayDate(event.date);
  const timeDisplay = event.time ? formatDisplayTime(event.time) : "";

  return (
    <View style={[styles.eventRow, isPast && { opacity: 0.6 }]}>
      <View style={[styles.eventColorStrip, { backgroundColor: event.imageColor }]} />
      <View style={styles.eventRowContent}>
        <View style={styles.eventRowTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.eventRowTitle} numberOfLines={1}>{event.title}</Text>
            <View style={styles.eventRowMetaLine}>
              {isWeekly && <Ionicons name="repeat-outline" size={12} color={Colors.light.textSecondary} style={{ marginRight: 4 }} />}
              <Text style={styles.eventRowDate}>
                {dateDisplay}{timeDisplay ? ` at ${timeDisplay}` : ""}
              </Text>
            </View>
            {event.ticketUrl ? (
              <Pressable
                onPress={() => Linking.openURL(event.ticketUrl!)}
                style={styles.ticketLinkRow}
              >
                <Ionicons name="ticket-outline" size={12} color={Colors.brand.blue} />
                <Text style={styles.ticketLinkText} numberOfLines={1}>Ticket link</Text>
              </Pressable>
            ) : null}
          </View>

          <View style={styles.badges}>
            {isWeekly && (
              <View style={styles.weeklyBadge}>
                <Text style={styles.weeklyBadgeText}>WEEKLY</Text>
              </View>
            )}
            {!event.active && (
              <View style={styles.draftBadge}>
                <Text style={styles.draftBadgeText}>HIDDEN</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.eventRowActions}>
          <Pressable onPress={onToggleActive} style={styles.actionBtn}>
            <Ionicons
              name={event.active ? "eye-outline" : "eye-off-outline"}
              size={20}
              color={event.active ? Colors.brand.green : Colors.light.textSecondary}
            />
          </Pressable>
          <Pressable onPress={onEdit} style={styles.actionBtn}>
            <Ionicons name="create-outline" size={20} color={Colors.brand.blue} />
          </Pressable>
          <Pressable onPress={onDelete} style={styles.actionBtn}>
            <Ionicons name="trash-outline" size={20} color={Colors.brand.red} />
          </Pressable>
        </View>
      </View>
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
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
  },
  headerTitle: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 18,
    color: Colors.light.text,
  },
  adminTabBar: {
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingVertical: 10,
    gap: 8,
    backgroundColor: Colors.light.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  adminTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: Colors.light.surfaceElevated,
  },
  adminTabActive: {
    backgroundColor: Colors.brand.blue + "12",
    borderWidth: 1,
    borderColor: Colors.brand.blue + "30",
  },
  adminTabText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 13,
    color: Colors.light.textSecondary,
  },
  adminTabTextActive: {
    color: Colors.brand.blue,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  formContainer: {
    backgroundColor: Colors.light.surface,
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  formHeading: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 18,
    color: Colors.light.text,
    marginBottom: 16,
  },
  typeToggle: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 8,
  },
  typeOption: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Colors.light.surfaceElevated,
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  typeOptionActive: {
    borderColor: Colors.brand.blue,
    backgroundColor: Colors.brand.blue + "10",
  },
  typeOptionText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 13,
    color: Colors.light.textSecondary,
  },
  fieldLabel: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 13,
    color: Colors.light.textSecondary,
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    backgroundColor: Colors.light.surfaceElevated,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: "Montserrat_400Regular",
    fontSize: 15,
    color: Colors.light.text,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  rowFields: {
    flexDirection: "row",
    gap: 12,
  },
  halfField: {
    flex: 1,
  },
  dayGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  dayOption: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: Colors.light.surfaceElevated,
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  dayOptionActive: {
    borderColor: Colors.brand.blue,
    backgroundColor: Colors.brand.blue + "10",
  },
  dayOptionText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 13,
    color: Colors.light.textSecondary,
  },
  dayOptionTextActive: {
    color: Colors.brand.blue,
  },
  colorGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 4,
  },
  colorOption: {
    alignItems: "center",
    padding: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "transparent",
    width: 70,
  },
  colorOptionSelected: {
    borderColor: Colors.brand.blue,
    backgroundColor: Colors.brand.blue + "10",
  },
  colorSwatch: {
    width: 36,
    height: 24,
    borderRadius: 6,
    marginBottom: 4,
  },
  colorLabel: {
    fontFamily: "Montserrat_500Medium",
    fontSize: 10,
    color: "#6B7280",
  },
  activeToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 16,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: Colors.light.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  activeToggleText: {
    fontFamily: "Montserrat_500Medium",
    fontSize: 14,
    color: Colors.light.text,
  },
  formActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 20,
  },
  formButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelButton: {
    backgroundColor: Colors.light.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  cancelButtonText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 15,
    color: Colors.light.textSecondary,
  },
  saveButton: {
    backgroundColor: Colors.brand.blue,
  },
  saveButtonText: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 15,
    color: "#FFFFFF",
  },
  eventSection: {
    marginBottom: 20,
  },
  listHeading: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 16,
    color: Colors.light.text,
    marginBottom: 14,
  },
  eventRow: {
    flexDirection: "row",
    backgroundColor: Colors.light.surface,
    borderRadius: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.light.border,
    overflow: "hidden",
  },
  eventColorStrip: {
    width: 5,
  },
  eventRowContent: {
    flex: 1,
    padding: 14,
  },
  eventRowTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  eventRowTitle: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 15,
    color: Colors.light.text,
  },
  eventRowMetaLine: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 3,
  },
  eventRowDate: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 12,
    color: Colors.light.textSecondary,
  },
  ticketLinkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  ticketLinkText: {
    fontFamily: "Montserrat_500Medium",
    fontSize: 11,
    color: Colors.brand.blue,
  },
  badges: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
  },
  weeklyBadge: {
    backgroundColor: "#7C3AED" + "20",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  weeklyBadgeText: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 9,
    color: "#7C3AED",
    letterSpacing: 0.5,
  },
  draftBadge: {
    backgroundColor: Colors.brand.gold + "20",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  draftBadgeText: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 9,
    color: Colors.brand.gold,
    letterSpacing: 0.5,
  },
  eventRowActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 4,
    marginTop: 8,
  },
  actionBtn: {
    padding: 8,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 60,
    gap: 8,
  },
  emptyText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 16,
    color: Colors.light.textSecondary,
  },
  emptySubtext: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 13,
    color: "#9CA3AF",
    textAlign: "center",
  },
});
