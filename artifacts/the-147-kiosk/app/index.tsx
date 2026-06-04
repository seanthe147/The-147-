/**
 * Attract screen — the "idle" face of the kiosk.
 *
 * Full-screen dark background, centred 147 branding, pulsing gold CTA,
 * live clock + date, and a bottom banner cycling through promotional slides.
 * Tapping anywhere dismisses the attract screen and navigates to the menu.
 */
import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { useKiosk } from "@/contexts/KioskContext";
import { useCart } from "@/contexts/CartContext";

const BANNER_SLIDES = [
  {
    title: "Welcome to The 147",
    subtitle: "Bradford's premier snooker club",
    icon: "🎱",
  },
  {
    title: "Fresh Food & Drinks",
    subtitle: "Order from the full kitchen & bar menu",
    icon: "🍔",
  },
  {
    title: "Earn Loyalty Points",
    subtitle: "Add your phone number at checkout",
    icon: "⭐",
  },
  {
    title: "Book a Table",
    subtitle: "Reserve snooker & pool tables in the app",
    icon: "📱",
  },
  {
    title: "Live Sports",
    subtitle: "Shown daily on our big screens",
    icon: "📺",
  },
  {
    title: "Become a Member",
    subtitle: "Exclusive discounts & benefits",
    icon: "🏆",
  },
];

const SLIDE_DURATION = 6000;
const FADE_DURATION = 600;

function useClockDisplay() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const timeStr = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const dateStr = now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  return { timeStr, dateStr };
}

function BannerCarousel() {
  const [slideIdx, setSlideIdx] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const tick = setInterval(() => {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: FADE_DURATION,
        useNativeDriver: true,
      }).start(() => {
        setSlideIdx((i) => (i + 1) % BANNER_SLIDES.length);
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: FADE_DURATION,
          useNativeDriver: true,
        }).start();
      });
    }, SLIDE_DURATION);
    return () => clearInterval(tick);
  }, [fadeAnim]);

  const slide = BANNER_SLIDES[slideIdx];

  return (
    <View style={bannerStyles.container}>
      <View style={bannerStyles.dotsRow}>
        {BANNER_SLIDES.map((_, i) => (
          <View
            key={i}
            style={[bannerStyles.dot, i === slideIdx && bannerStyles.dotActive]}
          />
        ))}
      </View>
      <Animated.View style={[bannerStyles.slideRow, { opacity: fadeAnim }]}>
        <Text style={bannerStyles.icon}>{slide.icon}</Text>
        <View>
          <Text style={bannerStyles.title}>{slide.title}</Text>
          <Text style={bannerStyles.subtitle}>{slide.subtitle}</Text>
        </View>
      </Animated.View>
    </View>
  );
}

function PulsingButton({ onPress }: { onPress: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.06, duration: 800, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [scale]);

  return (
    <Pressable onPress={onPress}>
      <Animated.View style={[attractStyles.ctaBtn, { transform: [{ scale }] }]}>
        <Text style={attractStyles.ctaBtnText}>Tap to Start Your Order</Text>
      </Animated.View>
    </Pressable>
  );
}

export default function AttractScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { attractVisible, dismissAttract } = useKiosk();
  const { clearCart } = useCart();
  const { timeStr, dateStr } = useClockDisplay();

  useEffect(() => {
    if (!attractVisible) {
      router.replace("/menu");
    }
  }, [attractVisible, router]);

  const handleStart = useCallback(() => {
    clearCart();
    dismissAttract();
  }, [clearCart, dismissAttract]);

  return (
    <Pressable style={[attractStyles.root, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8 }]} onPress={handleStart}>
      {/* Top bar: date left, time right */}
      <View style={attractStyles.topBar}>
        <Text style={attractStyles.dateText}>{dateStr}</Text>
        <Text style={attractStyles.timeText}>{timeStr}</Text>
      </View>

      {/* Centre: branding */}
      <View style={attractStyles.centre}>
        <View style={attractStyles.logoBox}>
          <Text style={attractStyles.logoNumber}>147</Text>
        </View>
        <Text style={attractStyles.venueName}>The 147</Text>
        <Text style={attractStyles.tagline}>SNOOKER · BAR · RESTAURANT</Text>
        <View style={attractStyles.divider} />
        <PulsingButton onPress={handleStart} />
      </View>

      {/* Bottom: promotional banner carousel */}
      <BannerCarousel />
    </Pressable>
  );
}

const attractStyles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.brand.dark,
    justifyContent: "space-between",
    paddingHorizontal: 40,
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 8,
  },
  dateText: {
    fontSize: 18,
    color: "rgba(255,255,255,0.5)",
    fontWeight: "400",
  },
  timeText: {
    fontSize: 18,
    color: "rgba(255,255,255,0.5)",
    fontWeight: "400",
  },
  centre: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  logoBox: {
    width: 120,
    height: 120,
    borderRadius: 24,
    backgroundColor: Colors.brand.blue,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  logoNumber: {
    fontSize: 52,
    fontWeight: "900",
    color: "#fff",
    letterSpacing: -2,
  },
  venueName: {
    fontSize: 56,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: 2,
  },
  tagline: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.brand.gold,
    letterSpacing: 4,
    marginTop: -4,
  },
  divider: {
    width: 60,
    height: 2,
    backgroundColor: Colors.brand.gold,
    borderRadius: 1,
    marginVertical: 16,
  },
  ctaBtn: {
    backgroundColor: Colors.brand.gold,
    paddingVertical: 22,
    paddingHorizontal: 56,
    borderRadius: 50,
  },
  ctaBtnText: {
    fontSize: 26,
    fontWeight: "800",
    color: Colors.brand.dark,
    letterSpacing: 0.5,
  },
});

const bannerStyles = StyleSheet.create({
  container: {
    backgroundColor: Colors.brand.navy,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 28,
    marginBottom: 8,
    gap: 10,
  },
  dotsRow: {
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  dotActive: {
    backgroundColor: Colors.brand.gold,
    width: 20,
  },
  slideRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  icon: {
    fontSize: 32,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#fff",
  },
  subtitle: {
    fontSize: 15,
    color: "rgba(255,255,255,0.65)",
    marginTop: 2,
  },
});
