import React, { useState, useContext } from "react";
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
import { BottomTabBarHeightContext } from "@react-navigation/bottom-tabs";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useQuery } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import type { Event } from "@shared/schema";

const DAYS_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function formatEventDate(dateStr: string | null): { day: string; month: string; weekday: string } {
  if (!dateStr) return { day: "--", month: "---", weekday: "" };
  const d = new Date(dateStr + "T00:00:00");
  return {
    day: d.getDate().toString(),
    month: d.toLocaleDateString("en-GB", { month: "short" }).toUpperCase(),
    weekday: d.toLocaleDateString("en-GB", { weekday: "short" }),
  };
}

function formatTime(timeStr: string): string {
  if (!timeStr) return "";
  const [h, m] = timeStr.split(":");
  const hour = parseInt(h, 10);
  const suffix = hour >= 12 ? "pm" : "am";
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return m === "00" ? `${displayHour}${suffix}` : `${displayHour}:${m}${suffix}`;
}

function EventCard({ event }: { event: Event }) {
  const color = event.imageColor || "#0047AB";
  const isWeekly = event.eventType === "weekly";

  const openTicketUrl = () => {
    if (!event.ticketUrl) return;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Linking.openURL(event.ticketUrl);
  };

  let badgeTop = "";
  let badgeBottom = "";
  if (isWeekly && event.dayOfWeek) {
    badgeTop = event.dayOfWeek.slice(0, 3).toUpperCase();
    badgeBottom = "WEEKLY";
  } else if (event.date) {
    const dateInfo = formatEventDate(event.date);
    badgeTop = dateInfo.day;
    badgeBottom = dateInfo.month;
  }

  let metaText = "";
  if (isWeekly && event.dayOfWeek) {
    metaText = `Every ${event.dayOfWeek}`;
  } else if (event.date) {
    const dateInfo = formatEventDate(event.date);
    metaText = `${dateInfo.weekday} ${dateInfo.day} ${dateInfo.month}`;
  } else {
    metaText = "Date TBC";
  }
  if (event.time) metaText += ` at ${formatTime(event.time)}`;
  if (event.endTime) metaText += ` - ${formatTime(event.endTime)}`;

  return (
    <Pressable
      onPress={event.ticketUrl ? openTicketUrl : undefined}
      disabled={!event.ticketUrl}
      style={({ pressed }) => [
        styles.eventCard,
        { transform: [{ scale: pressed && event.ticketUrl ? 0.98 : 1 }] },
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
            <Text style={[styles.eventDateDay, isWeekly && { fontSize: 13 }]}>{badgeTop}</Text>
            <Text style={styles.eventDateMonth}>{badgeBottom}</Text>
          </View>
        </View>
        <View style={styles.eventCardContent}>
          <Text style={styles.eventTitle} numberOfLines={2}>{event.title}</Text>
          <View style={styles.eventMeta}>
            <Ionicons name={isWeekly ? "repeat-outline" : "time-outline"} size={13} color={Colors.light.textSecondary} />
            <Text style={styles.eventMetaText}>{metaText}</Text>
          </View>
          {event.description ? (
            <Text style={styles.eventDesc} numberOfLines={2}>{event.description}</Text>
          ) : null}
          {event.ticketUrl ? (
            <View style={styles.ticketRow}>
              <Ionicons name="ticket-outline" size={13} color={Colors.brand.blue} />
              <Text style={styles.ticketText}>Get Tickets</Text>
              <Ionicons name="open-outline" size={12} color={Colors.brand.blue} />
            </View>
          ) : null}
        </View>
      </LinearGradient>
    </Pressable>
  );
}

function UpcomingEventsTab() {
  const { data: events, isLoading, isError } = useQuery<Event[]>({
    queryKey: ["/api/events", { type: "event" }],
    queryFn: async () => {
      const res = await fetch(`${process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}` : ""}/api/events?type=event`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const upcomingEvents = (events || []).filter((e) => {
    if (!e.date) return true;
    return new Date(e.date + "T23:59:59") >= now;
  });

  if (isLoading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={Colors.brand.blue} />
        <Text style={styles.loadingText}>Loading events...</Text>
      </View>
    );
  }

  if (isError || !events) {
    return (
      <View style={styles.emptyWrap}>
        <Ionicons name="cloud-offline-outline" size={40} color={Colors.light.textSecondary} />
        <Text style={styles.emptyTitle}>Couldn't load events</Text>
        <Text style={styles.emptySubtext}>Check back soon for upcoming events</Text>
      </View>
    );
  }

  if (upcomingEvents.length === 0) {
    return (
      <View style={styles.emptyWrap}>
        <Ionicons name="calendar-outline" size={40} color={Colors.light.textSecondary} />
        <Text style={styles.emptyTitle}>No upcoming events</Text>
        <Text style={styles.emptySubtext}>New events are added regularly - check back soon!</Text>
      </View>
    );
  }

  return (
    <>
      <Text style={styles.sectionTitle}>
        {upcomingEvents.length} Upcoming Event{upcomingEvents.length !== 1 ? "s" : ""}
      </Text>
      {upcomingEvents.map((event) => (
        <EventCard key={event.id} event={event} />
      ))}
    </>
  );
}

function WhatsOnTab() {
  const { data: events, isLoading, isError } = useQuery<Event[]>({
    queryKey: ["/api/events", { type: "weekly" }],
    queryFn: async () => {
      const res = await fetch(`${process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}` : ""}/api/events?type=weekly`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={Colors.brand.blue} />
        <Text style={styles.loadingText}>Loading weekly events...</Text>
      </View>
    );
  }

  if (isError || !events) {
    return (
      <View style={styles.emptyWrap}>
        <Ionicons name="cloud-offline-outline" size={40} color={Colors.light.textSecondary} />
        <Text style={styles.emptyTitle}>Couldn't load weekly events</Text>
        <Text style={styles.emptySubtext}>Check back soon</Text>
      </View>
    );
  }

  if (events.length === 0) {
    return (
      <View style={styles.emptyWrap}>
        <Ionicons name="repeat-outline" size={40} color={Colors.light.textSecondary} />
        <Text style={styles.emptyTitle}>No weekly events yet</Text>
        <Text style={styles.emptySubtext}>Regular weekly events will appear here</Text>
      </View>
    );
  }

  const grouped: Record<string, Event[]> = {};
  for (const event of events) {
    const day = event.dayOfWeek || "Other";
    if (!grouped[day]) grouped[day] = [];
    grouped[day].push(event);
  }

  const sortedDays = Object.keys(grouped).sort((a, b) => {
    const ia = DAYS_ORDER.indexOf(a);
    const ib = DAYS_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  return (
    <>
      <Text style={styles.sectionTitle}>What's On This Week</Text>
      {sortedDays.map((day) => (
        <View key={day} style={styles.dayGroup}>
          <View style={styles.dayHeader}>
            <View style={styles.dayDot} />
            <Text style={styles.dayHeaderText}>{day}</Text>
          </View>
          {grouped[day].map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </View>
      ))}
    </>
  );
}

export default function EventsScreen() {
  const insets = useSafeAreaInsets();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0;
  const [activeTab, setActiveTab] = useState<"events" | "whats-on">("events");

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
          </View>

          <View style={styles.tabBar}>
            <Pressable
              onPress={() => {
                setActiveTab("events");
                if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
              style={[styles.tab, activeTab === "events" && styles.tabActive]}
            >
              <Ionicons
                name="calendar"
                size={16}
                color={activeTab === "events" ? "#FFFFFF" : "rgba(255,255,255,0.5)"}
              />
              <Text style={[styles.tabText, activeTab === "events" && styles.tabTextActive]}>
                Events
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setActiveTab("whats-on");
                if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
              style={[styles.tab, activeTab === "whats-on" && styles.tabActive]}
            >
              <Ionicons
                name="repeat"
                size={16}
                color={activeTab === "whats-on" ? "#FFFFFF" : "rgba(255,255,255,0.5)"}
              />
              <Text style={[styles.tabText, activeTab === "whats-on" && styles.tabTextActive]}>
                What's On
              </Text>
            </Pressable>
          </View>
        </LinearGradient>

        <View style={styles.contentSection}>
          {activeTab === "events" ? <UpcomingEventsTab /> : <WhatsOnTab />}
        </View>

        <View style={{ height: Platform.OS === "web" ? 84 + 34 : tabBarHeight + 20 }} />
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
    paddingBottom: 16,
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
    lineHeight: 20,
  },
  tabBar: {
    flexDirection: "row",
    marginHorizontal: 24,
    marginBottom: 20,
    gap: 8,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  tabActive: {
    backgroundColor: "rgba(255,255,255,0.2)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
  },
  tabText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 14,
    color: "rgba(255,255,255,0.5)",
  },
  tabTextActive: {
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
  dayGroup: {
    marginBottom: 8,
  },
  dayHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  dayDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.brand.blue,
  },
  dayHeaderText: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 16,
    color: Colors.brand.dark,
  },
  eventCard: {
    borderRadius: 16,
    marginBottom: 12,
    overflow: "hidden",
    backgroundColor: Colors.light.surface,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
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
  ticketRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 6,
  },
  ticketText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 12,
    color: Colors.brand.blue,
  },
});
