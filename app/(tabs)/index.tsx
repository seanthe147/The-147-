import React, { useRef, useState, useEffect, useCallback, useContext } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Platform,
  Linking,
  ActivityIndicator,
  Image,
  ImageBackground,
  Dimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BottomTabBarHeightContext } from "@react-navigation/bottom-tabs";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { useQuery } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { OPENING_HOURS } from "@/lib/data";
import type { Event, BannerImage } from "@shared/schema";

const logoImage = require("@/assets/images/logo-147.png");
const { width: SCREEN_WIDTH } = Dimensions.get("window");

function QuickActionPill({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={() => {
        if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      style={({ pressed }) => [
        styles.pill,
        { opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] },
      ]}
    >
      <Ionicons name={icon} size={18} color={Colors.brand.blue} />
      <Text style={styles.pillLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={14} color={Colors.light.textSecondary} />
    </Pressable>
  );
}

const BANNER_WIDTH = SCREEN_WIDTH - 40;
const BANNER_HEIGHT = 180;
const AUTO_SCROLL_INTERVAL = 5000;

function BannerCarousel({ images }: { images: BannerImage[] }) {
  const scrollRef = useRef<ScrollView>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startAutoScroll = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (images.length <= 1) return;
    timerRef.current = setInterval(() => {
      setActiveIndex((prev) => {
        const next = (prev + 1) % images.length;
        scrollRef.current?.scrollTo({ x: next * (BANNER_WIDTH + 12), animated: true });
        return next;
      });
    }, AUTO_SCROLL_INTERVAL);
  }, [images.length]);

  useEffect(() => {
    startAutoScroll();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [startAutoScroll]);

  const onScrollEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    const idx = Math.round(x / (BANNER_WIDTH + 12));
    setActiveIndex(idx);
    startAutoScroll();
  }, [startAutoScroll]);

  return (
    <View style={styles.bannerSection}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={BANNER_WIDTH + 12}
        decelerationRate="fast"
        contentContainerStyle={{ paddingHorizontal: 20 }}
        onMomentumScrollEnd={onScrollEnd}
        scrollEnabled={images.length > 1}
      >
        {images.map((item) => (
          <View key={item.id} style={styles.bannerSlide}>
            <Image source={{ uri: item.imageUrl }} style={styles.bannerImage} resizeMode="cover" />
            {item.title ? (
              <LinearGradient
                colors={["transparent", "rgba(0,0,0,0.6)"]}
                style={styles.bannerOverlay}
              >
                <Text style={styles.bannerCaption} numberOfLines={2}>{item.title}</Text>
              </LinearGradient>
            ) : null}
          </View>
        ))}
      </ScrollView>
      {images.length > 1 && (
        <View style={styles.dotRow}>
          {images.map((_, i) => (
            <View
              key={i}
              style={[styles.dot, i === activeIndex && styles.dotActive]}
            />
          ))}
        </View>
      )}
    </View>
  );
}

function EventPreview() {
  const { data: events } = useQuery<Event[]>({
    queryKey: ["/api/events?type=event"],
  });

  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const upcoming = (events || [])
    .filter((e) => {
      if (!e.date) return true;
      return new Date(e.date + "T23:59:59") >= now;
    })
    .slice(0, 3);

  if (upcoming.length === 0) return null;

  return (
    <View style={styles.eventsSection}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Upcoming Events</Text>
        <Pressable
          onPress={() => router.push("/(tabs)/events")}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
        >
          <Text style={styles.seeAllText}>See All</Text>
        </Pressable>
      </View>
      {upcoming.map((event) => {
        const color = event.imageColor || "#0047AB";
        let dayNum = "--";
        let monthStr = "---";
        if (event.date) {
          const eventDate = new Date(event.date + "T00:00:00");
          dayNum = eventDate.getDate().toString();
          monthStr = eventDate.toLocaleDateString("en-GB", { month: "short" }).toUpperCase();
        }
        const timeDisplay = event.time
          ? (() => {
              const [h, m] = event.time.split(":");
              const hour = parseInt(h, 10);
              const suffix = hour >= 12 ? "pm" : "am";
              const dh = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
              return m === "00" ? `${dh}${suffix}` : `${dh}:${m}${suffix}`;
            })()
          : "";
        return (
          <Pressable
            key={event.id}
            onPress={() => router.push("/(tabs)/events")}
            style={({ pressed }) => [styles.eventRow, { opacity: pressed ? 0.8 : 1 }]}
          >
            <View style={[styles.eventDateBox, { backgroundColor: color + "18" }]}>
              <Text style={[styles.eventDateDay, { color }]}>{dayNum}</Text>
              <Text style={[styles.eventDateMonth, { color }]}>{monthStr}</Text>
            </View>
            <View style={styles.eventInfo}>
              <Text style={styles.eventTitle} numberOfLines={1}>{event.title}</Text>
              <Text style={styles.eventMeta}>
                {event.date ? `${dayNum} ${monthStr}` : "Date TBC"}
                {timeDisplay ? ` at ${timeDisplay}` : ""}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={Colors.light.border} />
          </Pressable>
        );
      })}
    </View>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0;

  const { data: bannerImages, isLoading: bannersLoading } = useQuery<BannerImage[]>({
    queryKey: ["/api/banner-images"],
  });

  const { data: settings } = useQuery<Record<string, string>>({
    queryKey: ["/api/settings"],
  });

  const bannerImageUrl = settings?.banner_image;
  const todayHours = getOpeningHoursToday();

  const heroOverlay = (
    <LinearGradient
      colors={
        bannerImageUrl
          ? ["transparent", "rgba(10,22,40,0.55)", "rgba(10,22,40,0.92)"]
          : [Colors.brand.dark, Colors.brand.navy, Colors.brand.blue + "70"]
      }
      locations={bannerImageUrl ? [0, 0.5, 1] : [0, 0.6, 1]}
      style={StyleSheet.absoluteFillObject}
    />
  );

  const heroContent = (
    <View style={[styles.heroContent, { paddingTop: insets.top + 10 + webTopInset }]}>
      <View style={styles.heroTopBar}>
        <Image source={logoImage} style={styles.logoImage} resizeMode="contain" />
        <Pressable
          onPress={() => router.push("/about")}
          style={({ pressed }) => [styles.hoursChip, { opacity: pressed ? 0.8 : 1 }]}
        >
          <View style={styles.liveDot} />
          <Text style={styles.hoursChipText}>Open until {todayHours.closeTime}</Text>
        </Pressable>
      </View>

      <View style={styles.heroCenter}>
        <Text style={styles.heroTitle}>The 147</Text>
        <View style={styles.heroTagline}>
          <View style={styles.tagDivider} />
          <Text style={styles.heroSubtitle}>Venue</Text>
          <View style={styles.tagDot} />
          <Text style={styles.heroSubtitle}>Snooker</Text>
          <View style={styles.tagDot} />
          <Text style={styles.heroSubtitle}>Bar</Text>
          <View style={styles.tagDot} />
          <Text style={styles.heroSubtitle}>Restaurant</Text>
          <View style={styles.tagDivider} />
        </View>
      </View>

      <View style={styles.heroActions}>
        <Pressable
          onPress={() => {
            if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            router.push("/(tabs)/book");
          }}
          style={({ pressed }) => [
            styles.primaryCta,
            { transform: [{ scale: pressed ? 0.97 : 1 }] },
          ]}
        >
          <Ionicons name="calendar" size={17} color={Colors.brand.dark} />
          <Text style={styles.primaryCtaText}>Book a Table</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/(tabs)/order");
          }}
          style={({ pressed }) => [
            styles.secondaryCta,
            { transform: [{ scale: pressed ? 0.97 : 1 }] },
          ]}
        >
          <Ionicons name="restaurant" size={17} color="#FFFFFF" />
          <Text style={styles.secondaryCtaText}>Order Food</Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {bannerImageUrl ? (
          <ImageBackground
            source={{ uri: bannerImageUrl }}
            style={styles.heroBanner}
            resizeMode="cover"
          >
            {heroOverlay}
            {heroContent}
          </ImageBackground>
        ) : (
          <View style={styles.heroBanner}>
            {heroOverlay}
            {heroContent}
          </View>
        )}

        <View style={styles.body}>
          <View style={styles.quickNav}>
            <QuickActionPill
              icon="calendar-outline"
              label="Book a Table"
              onPress={() => router.push("/(tabs)/book")}
            />
            <QuickActionPill
              icon="ticket-outline"
              label="Events & Tickets"
              onPress={() => router.push("/(tabs)/events")}
            />
            <QuickActionPill
              icon="restaurant-outline"
              label="Food & Drinks Menu"
              onPress={() => router.push("/(tabs)/order")}
            />
            <QuickActionPill
              icon="mail-outline"
              label="Contact Us"
              onPress={() => router.push("/contact")}
            />
          </View>

          {bannersLoading ? (
            <ActivityIndicator size="small" color={Colors.brand.blue} style={{ marginVertical: 20 }} />
          ) : bannerImages && bannerImages.length > 0 ? (
            <BannerCarousel images={bannerImages} />
          ) : null}

          <EventPreview />

          <Pressable
            onPress={() => router.push("/about")}
            style={({ pressed }) => [styles.hoursCard, { transform: [{ scale: pressed ? 0.98 : 1 }] }]}
          >
            <View style={styles.hoursCardLeft}>
              <View style={styles.hoursIconWrap}>
                <Ionicons name="time" size={22} color={Colors.brand.gold} />
              </View>
              <View>
                <Text style={styles.hoursCardTitle}>Opening Hours</Text>
                <Text style={styles.hoursCardSub}>{todayHours.day}: {todayHours.hours}</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.light.textSecondary} />
          </Pressable>

          <Pressable
            onPress={() => Linking.openURL("https://www.the147.co.uk")}
            style={({ pressed }) => [styles.websiteCard, { opacity: pressed ? 0.8 : 1 }]}
          >
            <Ionicons name="globe-outline" size={18} color={Colors.brand.blue} />
            <Text style={styles.websiteText}>Visit www.the147.co.uk</Text>
            <Ionicons name="open-outline" size={13} color={Colors.light.textSecondary} />
          </Pressable>

          <View style={{ height: Platform.OS === "web" ? 50 : tabBarHeight + 20 }} />
        </View>
      </ScrollView>
    </View>
  );
}

function getOpeningHoursToday(): { day: string; hours: string; closeTime: string } {
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const today = days[new Date().getDay()];
  const entry = OPENING_HOURS.find((h) => h.day === today);
  const hours = entry?.hours ?? "Closed";
  const closeTime = hours.includes("-") ? hours.split("-")[1].trim() : "late";
  return { day: today, hours, closeTime };
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F6F8",
  },
  scrollContent: {
    paddingTop: 0,
  },
  heroBanner: {
    width: "100%",
    minHeight: 360,
  },
  heroContent: {
    paddingHorizontal: 22,
    paddingBottom: 28,
    flex: 1,
    justifyContent: "space-between",
  },
  heroTopBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  logoImage: {
    width: 46,
    height: 46,
    borderRadius: 10,
  },
  hoursChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.15)",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#4ADE80",
  },
  hoursChipText: {
    fontFamily: "Montserrat_500Medium",
    fontSize: 11,
    color: "rgba(255,255,255,0.9)",
    letterSpacing: 0.2,
  },
  heroCenter: {
    alignItems: "center",
    marginVertical: 20,
  },
  heroTitle: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 48,
    color: "#FFFFFF",
    letterSpacing: -0.5,
    textShadowColor: "rgba(0,0,0,0.3)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  heroTagline: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
    gap: 8,
  },
  heroSubtitle: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 12,
    color: "rgba(255,255,255,0.7)",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  tagDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: Colors.brand.gold,
  },
  tagDivider: {
    width: 16,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  heroActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  primaryCta: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.brand.gold,
    paddingVertical: 14,
    borderRadius: 14,
  },
  primaryCtaText: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 14,
    color: Colors.brand.dark,
  },
  secondaryCta: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.12)",
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  secondaryCtaText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 14,
    color: "#FFFFFF",
  },
  body: {
    paddingTop: 20,
  },
  quickNav: {
    paddingHorizontal: 20,
    gap: 6,
    marginBottom: 24,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#EEF0F3",
  },
  pillLabel: {
    flex: 1,
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 14,
    color: Colors.light.text,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    marginBottom: 14,
  },
  sectionTitle: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 18,
    color: Colors.light.text,
    letterSpacing: -0.3,
  },
  seeAllText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 13,
    color: Colors.brand.blue,
  },
  bannerSection: {
    marginBottom: 28,
  },
  bannerSlide: {
    width: BANNER_WIDTH,
    height: BANNER_HEIGHT,
    borderRadius: 16,
    overflow: "hidden",
    marginRight: 12,
    backgroundColor: Colors.light.surface,
  },
  bannerImage: {
    width: "100%",
    height: "100%",
  },
  bannerOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingBottom: 14,
    paddingTop: 30,
  },
  bannerCaption: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 16,
    color: "#FFFFFF",
    textShadowColor: "rgba(0,0,0,0.3)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  dotRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.light.border,
  },
  dotActive: {
    backgroundColor: Colors.brand.blue,
    width: 20,
    borderRadius: 3,
  },
  eventsSection: {
    marginBottom: 24,
  },
  eventRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginHorizontal: 20,
    backgroundColor: "#FFFFFF",
    padding: 14,
    borderRadius: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#EEF0F3",
  },
  eventDateBox: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  eventDateDay: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 18,
    lineHeight: 22,
  },
  eventDateMonth: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 9,
    letterSpacing: 0.5,
  },
  eventInfo: {
    flex: 1,
  },
  eventTitle: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 14,
    color: Colors.light.text,
    marginBottom: 2,
  },
  eventMeta: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 12,
    color: Colors.light.textSecondary,
  },
  hoursCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 20,
    backgroundColor: Colors.brand.navy,
    padding: 16,
    borderRadius: 16,
    marginBottom: 10,
  },
  hoursCardLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  hoursIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: "rgba(212,168,67,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  hoursCardTitle: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 14,
    color: "#FFFFFF",
  },
  hoursCardSub: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 12,
    color: "rgba(255,255,255,0.6)",
    marginTop: 1,
  },
  websiteCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#EEF0F3",
  },
  websiteText: {
    fontFamily: "Montserrat_500Medium",
    fontSize: 13,
    color: Colors.brand.blue,
  },
});
