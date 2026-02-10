import React from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Platform,
  Linking,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { EVENTS, formatDate } from "@/lib/data";

function QuickAction({
  icon,
  label,
  onPress,
  color,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  color: string;
}) {
  return (
    <Pressable
      onPress={() => {
        if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      style={({ pressed }) => [
        styles.quickAction,
        { transform: [{ scale: pressed ? 0.95 : 1 }] },
      ]}
    >
      <View style={[styles.quickActionIcon, { backgroundColor: color + "15" }]}>
        <Ionicons name={icon} size={24} color={color} />
      </View>
      <Text style={styles.quickActionLabel}>{label}</Text>
    </Pressable>
  );
}

function FeaturedEventCard({ event }: { event: typeof EVENTS[0] }) {
  return (
    <Pressable
      onPress={() => router.push("/(tabs)/events")}
      style={({ pressed }) => [
        styles.featuredCard,
        { transform: [{ scale: pressed ? 0.98 : 1 }] },
      ]}
    >
      <LinearGradient
        colors={[event.imageColor, event.imageColor + "CC"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.featuredGradient}
      >
        <View style={styles.featuredBadge}>
          <Text style={styles.featuredBadgeText}>{formatDate(event.date)}</Text>
        </View>
        <View style={styles.featuredContent}>
          <Text style={styles.featuredTitle}>{event.title}</Text>
          <View style={styles.featuredMeta}>
            <Ionicons name="time-outline" size={14} color="rgba(255,255,255,0.8)" />
            <Text style={styles.featuredMetaText}>{event.time}</Text>
            <Ionicons name="pricetag-outline" size={14} color="rgba(255,255,255,0.8)" />
            <Text style={styles.featuredMetaText}>
              {event.price === "0" ? "Free" : `\u00A3${event.price}`}
            </Text>
          </View>
        </View>
      </LinearGradient>
    </Pressable>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const upcomingEvents = EVENTS.slice(0, 3);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.scrollContent,
        { paddingTop: insets.top + webTopInset },
      ]}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
    >
      <LinearGradient
        colors={[Colors.brand.dark, Colors.brand.navy, Colors.brand.blue + "90"]}
        style={styles.heroGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      >
        <View style={[styles.heroContent, { paddingTop: insets.top + 20 + webTopInset }]}>
          <Text style={styles.logoText}>The 147</Text>
          <Text style={styles.heroSubtitle}>Venue  /  Snooker  /  Bar  /  Restaurant</Text>
          <Pressable
            onPress={() => {
              if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              Linking.openURL("https://www.the147.co.uk/book-online");
            }}
            style={({ pressed }) => [
              styles.heroButton,
              { opacity: pressed ? 0.9 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] },
            ]}
          >
            <Ionicons name="calendar" size={18} color={Colors.brand.dark} />
            <Text style={styles.heroButtonText}>Book Now</Text>
            <Ionicons name="open-outline" size={14} color={Colors.brand.dark} />
          </Pressable>
        </View>
      </LinearGradient>

      <View style={styles.body}>
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.quickActions}>
          <QuickAction
            icon="calendar"
            label="Book Table"
            onPress={() => Linking.openURL("https://www.the147.co.uk/book-online")}
            color={Colors.brand.blue}
          />
          <QuickAction
            icon="ticket"
            label="Events"
            onPress={() => router.push("/(tabs)/events")}
            color={Colors.brand.red}
          />
          <QuickAction
            icon="restaurant"
            label="Order"
            onPress={() => router.push("/(tabs)/order")}
            color={Colors.brand.gold}
          />
          <QuickAction
            icon="information-circle"
            label="About Us"
            onPress={() => router.push("/(tabs)/about")}
            color={Colors.brand.green}
          />
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>What's On</Text>
          <Pressable onPress={() => router.push("/(tabs)/events")}>
            <Text style={styles.seeAll}>See All</Text>
          </Pressable>
        </View>

        {upcomingEvents.map((event) => (
          <FeaturedEventCard key={event.id} event={event} />
        ))}

        <View style={styles.infoCard}>
          <LinearGradient
            colors={[Colors.brand.navy, Colors.brand.dark]}
            style={styles.infoGradient}
          >
            <Ionicons name="time" size={28} color={Colors.brand.gold} />
            <View style={styles.infoTextContainer}>
              <Text style={styles.infoTitle}>Open Today</Text>
              <Text style={styles.infoSubtitle}>
                {getOpeningHoursToday()}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.5)" />
          </LinearGradient>
        </View>

        <View style={{ height: Platform.OS === "web" ? 34 : 100 }} />
      </View>
    </ScrollView>
  );
}

function getOpeningHoursToday(): string {
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const today = days[new Date().getDay()];
  const hours: Record<string, string> = {
    Monday: "12:00 - 23:00",
    Tuesday: "12:00 - 23:00",
    Wednesday: "12:00 - 23:00",
    Thursday: "12:00 - 23:00",
    Friday: "12:00 - 00:00",
    Saturday: "10:00 - 00:00",
    Sunday: "10:00 - 22:00",
  };
  return `${today}: ${hours[today]}`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  scrollContent: {
    paddingTop: 0,
  },
  heroGradient: {
    width: "100%",
    minHeight: 280,
  },
  heroContent: {
    paddingHorizontal: 24,
    paddingBottom: 32,
    alignItems: "center",
  },
  logoText: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 42,
    color: "#FFFFFF",
    letterSpacing: 1,
    marginBottom: 4,
  },
  heroSubtitle: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 13,
    color: "rgba(255,255,255,0.7)",
    letterSpacing: 2,
    marginBottom: 24,
  },
  heroButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.brand.gold,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 30,
  },
  heroButtonText: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 15,
    color: Colors.brand.dark,
  },
  body: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    marginTop: 8,
  },
  sectionTitle: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 20,
    color: Colors.light.text,
    marginBottom: 16,
  },
  seeAll: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 14,
    color: Colors.brand.blue,
    marginBottom: 16,
  },
  quickActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  quickAction: {
    alignItems: "center",
    flex: 1,
  },
  quickActionIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  quickActionLabel: {
    fontFamily: "Montserrat_500Medium",
    fontSize: 12,
    color: Colors.light.textSecondary,
  },
  featuredCard: {
    borderRadius: 16,
    marginBottom: 14,
    overflow: "hidden",
    elevation: 4,
    boxShadow: "0px 2px 8px rgba(0, 0, 0, 0.15)",
  },
  featuredGradient: {
    padding: 20,
    minHeight: 120,
    justifyContent: "flex-end",
  },
  featuredBadge: {
    position: "absolute",
    top: 14,
    right: 14,
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  featuredBadgeText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 11,
    color: "#FFFFFF",
  },
  featuredContent: {
    gap: 6,
  },
  featuredTitle: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 18,
    color: "#FFFFFF",
  },
  featuredMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  featuredMetaText: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 13,
    color: "rgba(255,255,255,0.8)",
    marginRight: 8,
  },
  infoCard: {
    borderRadius: 16,
    overflow: "hidden",
    marginTop: 4,
  },
  infoGradient: {
    flexDirection: "row",
    alignItems: "center",
    padding: 20,
    gap: 16,
  },
  infoTextContainer: {
    flex: 1,
  },
  infoTitle: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 16,
    color: "#FFFFFF",
  },
  infoSubtitle: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 13,
    color: "rgba(255,255,255,0.7)",
    marginTop: 2,
  },
});
