import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
  Easing,
  Modal,
  TextInput,
  Alert,
  Platform,
  useWindowDimensions,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useKiosk } from "@/contexts/KioskContext";
import { useCart } from "@/contexts/CartContext";
import Colors from "@/constants/colors";

interface BannerImage {
  id: number;
  imageUrl: string;
  title?: string | null;
  active: boolean;
}

const BANNER_ROTATE_MS = 6000;

export function KioskAttractOverlay() {
  const { isKioskMode, attractVisible, dismissAttract, disableKioskMode } = useKiosk();
  const { clearCart } = useCart();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  // Tablet ≈ ≥768pt on the short side (iPad mini portrait = 744w / iPad = 810w).
  // Used to scale up brand text and add a max-width to the CTA so it doesn't
  // span an entire 1366pt iPad Pro landscape screen.
  const isTablet = Math.min(width, height) >= 700;
  const [pinModalVisible, setPinModalVisible] = useState(false);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const longPressActive = useRef(false);

  const { data: banners } = useQuery<BannerImage[]>({
    queryKey: ["/api/banner-images"],
    staleTime: 5 * 60 * 1000,
    enabled: isKioskMode,
  });

  // Manager-customisable attract-screen text. Stored in the generic
  // site_settings key/value table; managers edit it from the staff portal.
  // We fall back to the original hardcoded copy when a key is empty so a
  // never-touched DB still renders the same screen as before.
  const { data: settings } = useQuery<Record<string, string>>({
    queryKey: ["/api/settings"],
    staleTime: 60 * 1000,
    enabled: isKioskMode,
  });
  const txt = (key: string, fallback: string) => {
    const v = settings?.[key];
    return v && v.trim().length > 0 ? v : fallback;
  };
  const welcomeText = txt("kiosk_attract_welcome", "WELCOME TO");
  const brandText = txt("kiosk_attract_brand", "THE 147");
  const taglineText = txt("kiosk_attract_tagline", "FOOD · DRINKS · SNOOKER");
  const ctaText = txt("kiosk_attract_cta", "TAP TO ORDER");
  const ctaSubText = txt("kiosk_attract_cta_sub", "Order food & drinks · Pay at the counter");

  const activeBanners = (banners ?? []).filter((b) => b.active);
  const [bannerIdx, setBannerIdx] = useState(0);

  useEffect(() => {
    if (!attractVisible || activeBanners.length <= 1) return;
    const t = setInterval(() => {
      setBannerIdx((i) => (i + 1) % activeBanners.length);
    }, BANNER_ROTATE_MS);
    return () => clearInterval(t);
  }, [attractVisible, activeBanners.length]);

  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!attractVisible) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.06, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [attractVisible, pulse]);

  if (!isKioskMode || !attractVisible) return null;

  const banner = activeBanners[bannerIdx];

  const handleTap = () => {
    // Clear any leftover cart state from a previous session before
    // entering the menu, so each customer starts fresh.
    clearCart();
    dismissAttract();
  };

  const handleHiddenLongPress = () => {
    longPressActive.current = true;
    setPin("");
    setPinError(null);
    setPinModalVisible(true);
  };

  const handleSubmitPin = async () => {
    setPinError(null);
    const ok = await disableKioskMode(pin);
    if (!ok) {
      setPinError("Incorrect PIN");
      return;
    }
    setPinModalVisible(false);
    setPin("");
  };

  return (
    <>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={handleTap}
        testID="kiosk-attract-overlay"
      >
        <View style={styles.bg}>
          {banner ? (
            <ExpoImage
              source={{ uri: banner.imageUrl }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              transition={400}
            />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: "#0A1628" }]} />
          )}
          <View style={styles.scrim} />
          <View
            style={[
              styles.content,
              {
                paddingTop: Math.max(insets.top, 32) + (isLandscape ? 12 : 48),
                paddingBottom: Math.max(insets.bottom, 24) + (isLandscape ? 16 : 36),
                paddingHorizontal: isTablet ? 64 : 32,
              },
            ]}
            pointerEvents="none"
          >
            <View style={styles.brandWrap}>
              <Text style={[styles.brandSmall, isTablet && { fontSize: 20, letterSpacing: 6 }]}>{welcomeText}</Text>
              <Text style={[styles.brandBig, isTablet && { fontSize: isLandscape ? 96 : 120, letterSpacing: 8 }]}>{brandText}</Text>
              <Text style={[styles.brandTag, isTablet && { fontSize: 18, letterSpacing: 8 }]}>{taglineText}</Text>
            </View>

            <Animated.View style={[styles.ctaWrap, { transform: [{ scale: pulse }] }]}>
              <View style={[styles.cta, isTablet && { paddingHorizontal: 80, paddingVertical: 48, maxWidth: 560 }]}>
                <Ionicons name="hand-left" size={isTablet ? 48 : 36} color={Colors.brand.blue} />
                <Text style={[styles.ctaText, isTablet && { fontSize: 48 }]}>{ctaText}</Text>
                <Text style={[styles.ctaSub, isTablet && { fontSize: 16 }]}>{ctaSubText}</Text>
              </View>
            </Animated.View>

            <View style={styles.footer}>
              <Text style={[styles.footerText, isTablet && { fontSize: 14, letterSpacing: 3 }]}>Tap anywhere to start</Text>
            </View>
          </View>
        </View>

        {/* Hidden 80×80 staff exit corner — bottom-right. Long-press 3s. */}
        <Pressable
          onLongPress={handleHiddenLongPress}
          delayLongPress={3000}
          style={styles.hiddenExit}
          testID="kiosk-hidden-exit"
        />
      </Pressable>

      <Modal
        visible={pinModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPinModalVisible(false)}
      >
        <Pressable style={styles.pinScrim} onPress={() => setPinModalVisible(false)}>
          <Pressable style={styles.pinCard} onPress={() => {}}>
            <Text style={styles.pinTitle}>Exit Kiosk Mode</Text>
            <Text style={styles.pinSub}>Enter the staff PIN</Text>
            <TextInput
              value={pin}
              onChangeText={setPin}
              placeholder="••••"
              placeholderTextColor="#9CA3AF"
              style={styles.pinInput}
              keyboardType="number-pad"
              secureTextEntry={Platform.OS !== "web"}
              maxLength={12}
              autoFocus
              onSubmitEditing={handleSubmitPin}
            />
            {pinError ? <Text style={styles.pinError}>{pinError}</Text> : null}
            <View style={styles.pinBtnRow}>
              <Pressable
                style={({ pressed }) => [styles.pinBtn, styles.pinBtnGhost, pressed && { opacity: 0.7 }]}
                onPress={() => setPinModalVisible(false)}
              >
                <Text style={styles.pinBtnGhostText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.pinBtn, styles.pinBtnPrimary, pressed && { opacity: 0.85 }]}
                onPress={handleSubmitPin}
              >
                <Text style={styles.pinBtnPrimaryText}>Unlock</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: "#0A1628" },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(10,22,40,0.55)" },
  content: { flex: 1, justifyContent: "space-between" },
  brandWrap: { alignItems: "center" },
  brandSmall: { color: "rgba(255,255,255,0.85)", fontSize: 16, letterSpacing: 4, fontWeight: "600" as const },
  brandBig: { color: "#fff", fontSize: 84, letterSpacing: 6, fontWeight: "700" as const, marginTop: 8 },
  brandTag: { color: Colors.brand.gold, fontSize: 14, letterSpacing: 6, fontWeight: "600" as const, marginTop: 8 },
  ctaWrap: { alignItems: "center", justifyContent: "center" },
  cta: {
    backgroundColor: "#fff",
    paddingHorizontal: 56,
    paddingVertical: 36,
    borderRadius: 28,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 12,
  },
  ctaText: { color: Colors.brand.blue, fontSize: 38, fontWeight: "700" as const, letterSpacing: 1, marginTop: 8 },
  ctaSub: { color: Colors.light.textSecondary, fontSize: 14, marginTop: 6 },
  footer: { alignItems: "center" },
  footerText: { color: "rgba(255,255,255,0.7)", fontSize: 12, letterSpacing: 2, fontWeight: "500" as const },
  hiddenExit: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 80,
    height: 80,
  },
  pinScrim: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center", padding: 24 },
  pinCard: { backgroundColor: "#fff", borderRadius: 16, padding: 24, width: "100%", maxWidth: 360 },
  pinTitle: { fontSize: 20, fontWeight: "700" as const, color: Colors.light.text, textAlign: "center" },
  pinSub: { fontSize: 14, color: Colors.light.textSecondary, textAlign: "center", marginTop: 6 },
  pinInput: {
    marginTop: 20,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 22,
    textAlign: "center",
    letterSpacing: 8,
    color: Colors.light.text,
  },
  pinError: { color: Colors.brand.red, fontSize: 13, textAlign: "center", marginTop: 10 },
  pinBtnRow: { flexDirection: "row", gap: 10, marginTop: 20 },
  pinBtn: { flex: 1, borderRadius: 10, paddingVertical: 14, alignItems: "center" },
  pinBtnGhost: { backgroundColor: "#F3F4F6" },
  pinBtnPrimary: { backgroundColor: Colors.brand.blue },
  pinBtnGhostText: { color: Colors.light.text, fontWeight: "600" as const, fontSize: 15 },
  pinBtnPrimaryText: { color: "#fff", fontWeight: "700" as const, fontSize: 15 },
});
