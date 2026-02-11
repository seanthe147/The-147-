import React from "react";
import {
  StyleSheet,
  View,
  Text,
  Platform,
  Pressable,
  ScrollView,
  Linking,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useQuery } from "@tanstack/react-query";
import Colors from "@/constants/colors";

const TICKETSOURCE_URL = "https://www.ticketsource.com/the147";

interface AppEvent {
  id: string;
  title: string;
  description: string;
  date: string;
  time: string;
  endDate: string | null;
  endTime: string | null;
  status: string;
  isSoldOut: boolean;
  ticketUrl: string;
  capacity: number | null;
  availableCapacity: number | null;
}

const EVENT_COLORS = [
  "#0047AB", "#7C3AED", "#059669", "#DC2626", "#B45309", "#0891B2", "#6D28D9", "#BE185D",
];

function getEventColor(index: number): string {
  return EVENT_COLORS[index % EVENT_COLORS.length];
}

function formatEventDate(dateStr: string): { day: string; month: string; weekday: string; full: string } {
  if (!dateStr) return { day: "--", month: "---", weekday: "", full: "Date TBC" };
  const d = new Date(dateStr + "T00:00:00");
  return {
    day: d.getDate().toString(),
    month: d.toLocaleDateString("en-GB", { month: "short" }).toUpperCase(),
    weekday: d.toLocaleDateString("en-GB", { weekday: "short" }),
    full: d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }),
  };
}

function formatTime(timeStr: string): string {
  if (!timeStr) return "Time TBC";
  const [h, m] = timeStr.split(":");
  const hour = parseInt(h, 10);
  const suffix = hour >= 12 ? "pm" : "am";
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return m === "00" ? `${displayHour}${suffix}` : `${displayHour}:${m}${suffix}`;
}

export default function EventsScreen() {
  const insets = useSafeAreaInsets();
  const webTopInset = Platform.OS === "web" ? 67 : 0;

  const { data: events, isLoading, isError } = useQuery<AppEvent[]>({
    queryKey: ["/api/events"],
  });

  const openTicketSource = (url?: string) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Linking.openURL(url || TICKETSOURCE_URL);
  };

  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const upcomingEvents = (events || []).filter((e) => {
    if (!e.date) return true;
    return new Date(e.date + "T23:59:59") >= now;
  });

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + webTopInset },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient
          colors={[Colors.brand.dark, Colors.brand.navy]}
          style={styles.heroSection}
        >
          <View style={styles.heroInner}>
            <Text style={styles.heroTitle}>Events & Tickets</Text>
            <Text style={styles.heroSubtitle}>
              Live entertainment, tournaments & special nights at The 147
            </Text>
            <Pressable
              onPress={() => openTicketSource()}
              style={({ pressed }) => [
                styles.heroButton,
                { opacity: pressed ? 0.9 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] },
              ]}
            >
              <LinearGradient
                colors={[Colors.brand.blue, "#3366CC"]}
                style={styles.heroButtonGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Ionicons name="ticket" size={18} color="#FFFFFF" />
                <Text style={styles.heroButtonText}>Browse & Buy Tickets</Text>
                <Ionicons name="open-outline" size={16} color="rgba(255,255,255,0.7)" />
              </LinearGradient>
            </Pressable>
          </View>
        </LinearGradient>

        <View style={styles.contentSection}>
          {isLoading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="large" color={Colors.brand.blue} />
              <Text style={styles.loadingText}>Loading events...</Text>
            </View>
          ) : isError || !events ? (
            <View style={styles.emptyWrap}>
              <Ionicons name="cloud-offline-outline" size={40} color={Colors.light.textSecondary} />
              <Text style={styles.emptyTitle}>Couldn't load events</Text>
              <Text style={styles.emptySubtext}>Check back soon or browse events on TicketSource</Text>
              <Pressable
                onPress={() => openTicketSource()}
                style={({ pressed }) => [styles.emptyButton, { opacity: pressed ? 0.8 : 1 }]}
              >
                <Ionicons name="open-outline" size={16} color={Colors.brand.blue} />
                <Text style={styles.emptyButtonText}>View on TicketSource</Text>
              </Pressable>
            </View>
          ) : upcomingEvents.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Ionicons name="calendar-outline" size={40} color={Colors.light.textSecondary} />
              <Text style={styles.emptyTitle}>No upcoming events</Text>
              <Text style={styles.emptySubtext}>New events are added regularly - check back soon!</Text>
              <Pressable
                onPress={() => openTicketSource()}
                style={({ pressed }) => [styles.emptyButton, { opacity: pressed ? 0.8 : 1 }]}
              >
                <Ionicons name="open-outline" size={16} color={Colors.brand.blue} />
                <Text style={styles.emptyButtonText}>View on TicketSource</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <Text style={styles.sectionTitle}>
                {upcomingEvents.length} Upcoming Event{upcomingEvents.length !== 1 ? "s" : ""}
              </Text>

              {upcomingEvents.map((event, index) => {
                const dateInfo = formatEventDate(event.date);
                const color = getEventColor(index);
                return (
                  <Pressable
                    key={event.id}
                    onPress={() => openTicketSource(event.ticketUrl)}
                    style={({ pressed }) => [
                      styles.eventCard,
                      { transform: [{ scale: pressed ? 0.98 : 1 }] },
                    ]}
                  >
                    <LinearGradient
                      colors={[color + "20", color + "08"]}
                      style={styles.eventCardGradient}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                    >
                      <View style={styles.eventCardLeft}>
                        <View style={[styles.eventDateBadge, { backgroundColor: color }]}>
                          <Text style={styles.eventDateDay}>{dateInfo.day}</Text>
                          <Text style={styles.eventDateMonth}>{dateInfo.month}</Text>
                        </View>
                      </View>
                      <View style={styles.eventCardContent}>
                        {event.isSoldOut && (
                          <View style={styles.soldOutBadge}>
                            <Text style={styles.soldOutText}>SOLD OUT</Text>
                          </View>
                        )}
                        <Text style={styles.eventTitle} numberOfLines={2}>
                          {event.title}
                        </Text>
                        <View style={styles.eventMeta}>
                          <Ionicons name="time-outline" size={13} color={Colors.light.textSecondary} />
                          <Text style={styles.eventMetaText}>
                            {event.date ? `${dateInfo.weekday} ${dateInfo.day} ${dateInfo.month}` : "Date TBC"}
                            {event.time ? ` at ${formatTime(event.time)}` : ""}
                          </Text>
                        </View>
                        {event.description ? (
                          <Text style={styles.eventDesc} numberOfLines={2}>{event.description}</Text>
                        ) : null}
                      </View>
                      <Ionicons name="open-outline" size={16} color={Colors.light.textSecondary} />
                    </LinearGradient>
                  </Pressable>
                );
              })}
            </>
          )}

          <Pressable
            onPress={() => openTicketSource()}
            style={({ pressed }) => [
              styles.viewAllButton,
              { opacity: pressed ? 0.9 : 1 },
            ]}
          >
            <Text style={styles.viewAllText}>View All on TicketSource</Text>
            <Ionicons name="open-outline" size={16} color={Colors.brand.blue} />
          </Pressable>
        </View>

        <View style={{ height: Platform.OS === "web" ? 84 + 34 : 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  scrollContent: {
    paddingTop: 0,
  },
  heroSection: {
    width: "100%",
  },
  heroInner: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 32,
  },
  heroTitle: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 28,
    color: "#FFFFFF",
    marginBottom: 8,
  },
  heroSubtitle: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 14,
    color: "rgba(255,255,255,0.7)",
    marginBottom: 24,
    lineHeight: 20,
  },
  heroButton: {
    borderRadius: 14,
    overflow: "hidden",
  },
  heroButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
  },
  heroButtonText: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 16,
    color: "#FFFFFF",
  },
  contentSection: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  sectionTitle: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 20,
    color: Colors.light.text,
    marginBottom: 16,
  },
  loadingWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    gap: 12,
  },
  loadingText: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 14,
    color: Colors.light.textSecondary,
  },
  emptyWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
    gap: 8,
  },
  emptyTitle: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 16,
    color: Colors.light.text,
    marginTop: 4,
  },
  emptySubtext: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 13,
    color: Colors.light.textSecondary,
    textAlign: "center",
  },
  emptyButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: Colors.brand.blue,
  },
  emptyButtonText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 13,
    color: Colors.brand.blue,
  },
  eventCard: {
    borderRadius: 16,
    marginBottom: 12,
    overflow: "hidden",
    backgroundColor: Colors.light.surface,
    boxShadow: "0px 1px 4px rgba(0, 0, 0, 0.08)",
  },
  eventCardGradient: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 14,
  },
  eventCardLeft: {},
  eventDateBadge: {
    width: 52,
    height: 56,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  eventDateDay: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 20,
    color: "#FFFFFF",
    lineHeight: 22,
  },
  eventDateMonth: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 10,
    color: "rgba(255,255,255,0.85)",
    letterSpacing: 1,
  },
  eventCardContent: {
    flex: 1,
    gap: 4,
  },
  soldOutBadge: {
    alignSelf: "flex-start",
    backgroundColor: Colors.brand.red + "18",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 2,
  },
  soldOutText: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 9,
    color: Colors.brand.red,
    letterSpacing: 0.5,
  },
  eventTitle: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 15,
    color: Colors.light.text,
  },
  eventMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  eventMetaText: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 12,
    color: Colors.light.textSecondary,
  },
  eventDesc: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 12,
    color: Colors.light.textSecondary,
    lineHeight: 16,
    marginTop: 2,
  },
  viewAllButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    marginTop: 8,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Colors.brand.blue,
  },
  viewAllText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 14,
    color: Colors.brand.blue,
  },
});
