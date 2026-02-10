import React from "react";
import {
  StyleSheet,
  View,
  Text,
  Platform,
  Pressable,
  ScrollView,
  Linking,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { EVENTS, formatDate, getCategoryLabel } from "@/lib/data";

const EVENTS_URL = "https://www.ticketsource.com/the147";

export default function EventsScreen() {
  const insets = useSafeAreaInsets();
  const webTopInset = Platform.OS === "web" ? 67 : 0;

  const openTicketSource = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Linking.openURL(EVENTS_URL);
  };

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
              onPress={openTicketSource}
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
          <Text style={styles.sectionTitle}>Upcoming Events</Text>

          {EVENTS.map((event) => (
            <Pressable
              key={event.id}
              onPress={openTicketSource}
              style={({ pressed }) => [
                styles.eventCard,
                { transform: [{ scale: pressed ? 0.98 : 1 }] },
              ]}
            >
              <LinearGradient
                colors={[event.imageColor + "20", event.imageColor + "08"]}
                style={styles.eventCardGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <View style={styles.eventCardLeft}>
                  <View style={[styles.eventDateBadge, { backgroundColor: event.imageColor }]}>
                    <Text style={styles.eventDateDay}>
                      {new Date(event.date + "T00:00:00").getDate()}
                    </Text>
                    <Text style={styles.eventDateMonth}>
                      {new Date(event.date + "T00:00:00")
                        .toLocaleDateString("en-GB", { month: "short" })
                        .toUpperCase()}
                    </Text>
                  </View>
                </View>
                <View style={styles.eventCardContent}>
                  <View style={[styles.categoryBadge, { backgroundColor: event.imageColor + "18" }]}>
                    <Text style={[styles.categoryText, { color: event.imageColor }]}>
                      {getCategoryLabel(event.category)}
                    </Text>
                  </View>
                  <Text style={styles.eventTitle} numberOfLines={2}>
                    {event.title}
                  </Text>
                  <View style={styles.eventMeta}>
                    <Ionicons name="time-outline" size={13} color={Colors.light.textSecondary} />
                    <Text style={styles.eventMetaText}>{event.time}</Text>
                    <View style={styles.metaDot} />
                    <Text style={styles.eventPrice}>
                      {event.price === "0" ? "Free" : `\u00A3${event.price}`}
                    </Text>
                  </View>
                </View>
                <Ionicons name="open-outline" size={16} color={Colors.light.textSecondary} />
              </LinearGradient>
            </Pressable>
          ))}

          <Pressable
            onPress={openTicketSource}
            style={({ pressed }) => [
              styles.viewAllButton,
              { opacity: pressed ? 0.9 : 1 },
            ]}
          >
            <Text style={styles.viewAllText}>View All Events on TicketSource</Text>
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
  categoryBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 2,
  },
  categoryText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 10,
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
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: Colors.light.textSecondary,
    marginHorizontal: 4,
  },
  eventPrice: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 12,
    color: Colors.brand.blue,
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
