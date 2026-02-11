import React from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Platform,
  Linking,
  ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { useQuery } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import type { Offer } from "@shared/schema";

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

function OfferCard({ offer }: { offer: Offer }) {
  return (
    <View style={[styles.offerCard, { width: 260, marginRight: 14 }]}>
      <LinearGradient
        colors={[offer.gradientStart, offer.gradientEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.offerGradient}
      >
        <View style={styles.offerIconRow}>
          <View style={styles.offerIconCircle}>
            <Ionicons
              name={offer.icon as keyof typeof Ionicons.glyphMap}
              size={22}
              color="#FFFFFF"
            />
          </View>
          <View style={styles.offerDiscountBadge}>
            <Text style={styles.offerDiscountText}>{offer.discount}</Text>
          </View>
        </View>
        <Text style={styles.offerTitle}>{offer.title}</Text>
        <Text style={styles.offerSubtitle}>{offer.subtitle}</Text>
        <View style={styles.offerFooter}>
          <Ionicons name="calendar-outline" size={12} color="rgba(255,255,255,0.7)" />
          <Text style={styles.offerValidText}>{offer.validUntil}</Text>
        </View>
      </LinearGradient>
    </View>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const webTopInset = Platform.OS === "web" ? 67 : 0;

  const { data: offers, isLoading } = useQuery<Offer[]>({
    queryKey: ["/api/offers"],
  });

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

        {isLoading ? (
          <ActivityIndicator size="small" color={Colors.brand.blue} style={{ marginVertical: 24 }} />
        ) : offers && offers.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>Offers</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.offerScroll}
              contentContainerStyle={styles.offerScrollContent}
            >
              {offers.map((offer) => (
                <OfferCard key={offer.id} offer={offer} />
              ))}
            </ScrollView>
          </>
        ) : null}

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
  sectionTitle: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 20,
    color: Colors.light.text,
    marginBottom: 16,
    marginTop: 8,
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
  offerScroll: {
    marginHorizontal: -20,
    marginBottom: 16,
  },
  offerScrollContent: {
    paddingHorizontal: 20,
  },
  offerCard: {
    borderRadius: 16,
    overflow: "hidden",
    elevation: 4,
    boxShadow: "0px 2px 8px rgba(0, 0, 0, 0.15)",
  },
  offerGradient: {
    padding: 18,
    minHeight: 150,
    justifyContent: "space-between",
  },
  offerIconRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  offerIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  offerDiscountBadge: {
    backgroundColor: "rgba(255,255,255,0.25)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  offerDiscountText: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 13,
    color: "#FFFFFF",
  },
  offerTitle: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 17,
    color: "#FFFFFF",
    marginBottom: 4,
  },
  offerSubtitle: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 13,
    color: "rgba(255,255,255,0.85)",
    marginBottom: 10,
  },
  offerFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  offerValidText: {
    fontFamily: "Montserrat_500Medium",
    fontSize: 11,
    color: "rgba(255,255,255,0.7)",
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
