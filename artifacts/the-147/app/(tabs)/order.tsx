import React, {
  useContext,
  useState,
  useRef,
  useCallback,
  useMemo,
  useEffect,
} from "react";
import {
  StyleSheet,
  View,
  Text,
  Platform,
  Pressable,
  FlatList,
  ScrollView,
  ActivityIndicator,
  Modal,
  Linking,
  Alert,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
  TextInput,
  KeyboardAvoidingView,
  AppState,
  type AppStateStatus,
} from "react-native";
// expo-image gives us on-disk caching, off-thread decoding and a smooth
// fade-in transition. The menu is image-heavy and was the slowest part of
// the Order tab to render on cold start with React Native's built-in Image.
import { Image as ExpoImage } from "expo-image";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BottomTabBarHeightContext } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams, useFocusEffect } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useColors } from "@/hooks/useColors";
const baseColors = Colors;
import { useCart } from "@/contexts/CartContext";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import { useKiosk } from "@/contexts/KioskContext";
import { KioskCheckoutSheet } from "@/components/KioskCheckoutSheet";
import { useNotifications } from "@/contexts/NotificationContext";
import { getApiUrl, prefetchSquarePaymentSdk } from "@/lib/query-client";
import { trackEvent } from "@/lib/analytics";
import { SquarePaymentSheet } from "@/components/SquarePaymentSheet";
import { useSquareGooglePay } from "@/hooks/useSquareGooglePay";
import * as LocalAuthentication from "expo-local-authentication";
import { getBiometricKind, biometricLabel, shouldPromptForPaymentBiometric } from "@/lib/biometric";
import {
  setPendingConfirmation,
  getPendingConfirmation,
  clearPendingConfirmation,
} from "@/lib/pending-order";
import type { MenuCategory, MenuItem, ModifierList, SelectedModifier } from "@/types/menu";
import { DIETARY_TAGS, type DietaryTagCode } from "@/types/menu";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { useResponsive } from "@/hooks/useResponsive";
import {
  groupMenuItems,
  menuGroupMatchesDietaryFilters,
  menuGroupMatchesQuery,
  type MenuProductGroup,
} from "@/lib/menu-grouping";
import {
  buildOrderCartPayload,
  collectSelectedModifiers,
} from "@/lib/order-customization";
import {
  calculateMemberDiscountPreviewPence,
  getMemberDiscountPreviewExcludedItemIds,
} from "@/lib/member-discount";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
// Ratio matches the recommended 1500×650 upload size (2.308:1).
const BANNER_HEIGHT = Math.round(SCREEN_WIDTH / 2.3);

const FOOD_CATEGORIES = new Set([
  "Starters", "Sharers", "Pub Classic Mains", "Burgers", "Turkish Mains",
  "Loaded Fries Menu", "Pastas", "Panini", "Toasties", "Build Your Own Pizza",
  "Sides", "Kids Mains", "Kids Puddings", "Puddings", "Light Bites",
  "Breakfast & Baps", "Extras",
]);

const TABLE_SECTIONS = [
  { label: "Snooker", color: "#1B7A3F", tables: Array.from({ length: 10 }, (_, i) => ({ display: String(i + 1), value: `Snooker ${i + 1}` })) },
  { label: "Restaurant", color: "#C2570A", tables: Array.from({ length: 6 }, (_, i) => ({ display: String(i + 11), value: `Restaurant ${i + 11}` })) },
  { label: "Main Area", color: "#1552A0", tables: Array.from({ length: 22 }, (_, i) => ({ display: String(i + 17), value: `Main Area ${i + 17}` })) },
  { label: "Balcony", color: "#7B2F9E", tables: Array.from({ length: 5 }, (_, i) => ({ display: String(i + 39), value: `Balcony ${i + 39}` })) },
  { label: "Pool", color: "#0E7C6E", tables: Array.from({ length: 6 }, (_, i) => ({ display: String(i + 1), value: `Pool ${i + 1}` })) },
  { label: "Darts", color: "#B91C1C", tables: [{ display: "1", value: "Darts" }] },
];

const ALL_TABLES: { display: string; value: string; section: string; color: string }[] =
  TABLE_SECTIONS.flatMap((s) =>
    s.tables.map((t) => ({ display: t.display, value: t.value, section: s.label, color: s.color }))
  );

function formatPrice(pence: number) {
  return `£${(pence / 100).toFixed(2)}`;
}

type CategoryStyle = { icon: string; color: string; bg: string };

function getCategoryStyle(name: string): CategoryStyle {
  const n = name.toLowerCase();
  if (n.includes("starter")) return { icon: "leaf-outline", color: "#166534", bg: "#dcfce7" };
  if (n.includes("sharer")) return { icon: "people-outline", color: "#9a3412", bg: "#ffedd5" };
  if (n.includes("burger")) return { icon: "fast-food-outline", color: "#92400e", bg: "#fef3c7" };
  if (n.includes("pizza")) return { icon: "pizza-outline", color: "#991b1b", bg: "#fee2e2" };
  if (n.includes("breakfast") || n.includes("bap")) return { icon: "sunny-outline", color: "#b45309", bg: "#fef3c7" };
  if (n.includes("turkish")) return { icon: "flame-outline", color: "#9a3412", bg: "#ffedd5" };
  if (n.includes("fries") || n.includes("loaded")) return { icon: "fast-food-outline", color: "#854d0e", bg: "#fef9c3" };
  if (n.includes("pasta")) return { icon: "restaurant-outline", color: "#7c3aed", bg: "#ede9fe" };
  if (n.includes("panini") || n.includes("toastie")) return { icon: "restaurant-outline", color: "#c2410c", bg: "#ffedd5" };
  if (n.includes("light bite")) return { icon: "nutrition-outline", color: "#065f46", bg: "#d1fae5" };
  if (n.includes("kids")) return { icon: "happy-outline", color: "#be185d", bg: "#fce7f3" };
  if (n.includes("pudding")) return { icon: "ice-cream-outline", color: "#db2777", bg: "#fce7f3" };
  if (n.includes("snack")) return { icon: "nutrition-outline", color: "#b45309", bg: "#fef3c7" };
  if (n.includes("side") || n.includes("extra")) return { icon: "apps-outline", color: "#374151", bg: "#f3f4f6" };
  if (n.includes("golden year")) return { icon: "heart-outline", color: "#b45309", bg: "#fef3c7" };
  if (n.includes("pub classic") || n.includes("main")) return { icon: "restaurant-outline", color: "#1e40af", bg: "#dbeafe" };
  if (n.includes("draught") || n.includes("draft")) return { icon: "beer-outline", color: "#1d4ed8", bg: "#dbeafe" };
  if (n.includes("beer") || n.includes("lager")) return { icon: "beer-outline", color: "#1d4ed8", bg: "#dbeafe" };
  if (n.includes("bitter") || n.includes("stout")) return { icon: "beer-outline", color: "#78350f", bg: "#fef3c7" };
  if (n.includes("cider")) return { icon: "wine-outline", color: "#15803d", bg: "#dcfce7" };
  if (n.includes("bottle")) return { icon: "wine-outline", color: "#7c3aed", bg: "#ede9fe" };
  if (n.includes("spirit") || n.includes("shot")) return { icon: "wine-outline", color: "#6d28d9", bg: "#ede9fe" };
  if (n.includes("wine")) return { icon: "wine-outline", color: "#881337", bg: "#ffe4e6" };
  if (n.includes("soft") || n.includes("water")) return { icon: "water-outline", color: "#0369a1", bg: "#e0f2fe" };
  if (n.includes("hot drink") || n.includes("coffee") || n.includes("tea")) return { icon: "cafe-outline", color: "#92400e", bg: "#fef3c7" };
  if (n.includes("low") || n.includes("no alcohol") || n.includes("mocktail")) return { icon: "leaf-outline", color: "#065f46", bg: "#d1fae5" };
  if (n.includes("offer") || n.includes("promo")) return { icon: "pricetag-outline", color: "#b45309", bg: "#fef3c7" };
  if (n.includes("snooker") || n.includes("darts") || n.includes("dart") || n.includes("pool")) return { icon: "ellipse-outline", color: "#0f766e", bg: "#ccfbf1" };
  if (n.includes("easter")) return { icon: "egg-outline", color: "#be185d", bg: "#fce7f3" };
  return { icon: "grid-outline", color: "#374151", bg: "#f3f4f6" };
}

interface BannerImage {
  id: number;
  imageUrl: string;
  title?: string | null;
  active: boolean;
  updatedAt?: string | Date | null;
}

function withBannerCacheBuster(url: string, ts: string | number | Date | null | undefined): string {
  if (!ts || url.startsWith("data:")) return url;
  const v = ts instanceof Date ? ts.getTime() : ts;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}v=${v}`;
}

function BannerCarousel({ banners }: { banners: BannerImage[] }) {
  const [current, setCurrent] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (banners.length <= 1) return;
    timerRef.current = setInterval(() => {
      setCurrent((prev) => {
        const next = (prev + 1) % banners.length;
        scrollRef.current?.scrollTo({ x: next * SCREEN_WIDTH, animated: true });
        return next;
      });
    }, 4000);
  }, [banners.length]);

  useEffect(() => {
    startTimer();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [startTimer]);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    const idx = Math.round(x / SCREEN_WIDTH);
    if (idx !== current) {
      setCurrent(idx);
      startTimer();
    }
  }, [current, startTimer]);

  if (banners.length === 0) return null;

  return (
    <View style={bannerStyles.container}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={onScroll}
      >
        {banners.map((banner) => (
          <View key={banner.id} style={bannerStyles.slide}>
            <ExpoImage
              source={{ uri: withBannerCacheBuster(banner.imageUrl, banner.updatedAt) }}
              style={bannerStyles.image}
              contentFit="cover"
              transition={150}
              cachePolicy="disk"
            />
            {!!banner.title && (
              <View style={bannerStyles.titleOverlay}>
                <Text style={bannerStyles.titleText}>{banner.title}</Text>
              </View>
            )}
          </View>
        ))}
      </ScrollView>
      {banners.length > 1 && (
        <View style={bannerStyles.dots}>
          {banners.map((_, i) => (
            <View key={i} style={[bannerStyles.dot, i === current && bannerStyles.dotActive]} />
          ))}
        </View>
      )}
    </View>
  );
}

const bannerStyles = StyleSheet.create({
  container: { position: "relative" },
  slide: { width: SCREEN_WIDTH, height: BANNER_HEIGHT },
  image: { width: "100%", height: "100%" },
  titleOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0,0,0,0.45)",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  titleText: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 15,
    color: "#fff",
  },
  dots: {
    position: "absolute",
    bottom: 10,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.5)",
  },
  dotActive: {
    backgroundColor: "#fff",
    width: 18,
  },
});

function CategoryGrid({
  categories,
  onSelect,
}: {
  categories: MenuCategory[];
  onSelect: (id: string) => void;
}) {
  const colors = useColors();
  const gridStyles = useMemo(() => createGridStyles(colors), [colors]);
  // Multi-column grid sized to the actual content width (not the raw
  // screen) so iPad gets 3 cols portrait / 4 cols landscape and phone
  // keeps the original 2-up layout. The parent ScrollView already
  // applies tabletPad which constrains content to ~1100pt on iPad —
  // we mirror that calc here so card width matches.
  const { isTablet, isLandscape, width } = useResponsive(1100);
  const cols = isTablet ? (isLandscape ? 4 : 3) : 2;
  const contentWidth = isTablet ? Math.min(width, 1100) : width;
  const GAP = 12;
  const PAD = 16;
  // (cols-1) gaps + 2*PAD horizontal insets eaten by the parent.
  const cardSize = (contentWidth - PAD * 2 - GAP * (cols - 1)) / cols;

  return (
    <View style={gridStyles.grid}>
      {categories.map((cat) => {
        const catStyle = getCategoryStyle(cat.name);
        const hasImage = !!cat.imageUrl;
        return (
          <Pressable
            key={cat.id}
            onPress={() => onSelect(cat.id)}
            style={({ pressed }) => [
              gridStyles.card,
              { width: cardSize, height: cardSize * 0.85, opacity: pressed ? 0.78 : 1 },
            ]}
            testID={`cat-${cat.id}`}
          >
            {(() => {
              const subCount = cat.subcategories?.length ?? 0;
              const itemCount = cat.items.length + (cat.subcategories?.reduce((s, c) => s + c.items.length, 0) ?? 0);
              const countLabel = subCount > 0 ? `${subCount} group${subCount !== 1 ? "s" : ""} · ${itemCount} items` : `${itemCount} items`;
              return hasImage ? (
                <>
                  <ExpoImage
                    source={{ uri: withBannerCacheBuster(cat.imageUrl ?? "", cat.updatedAt) }}
                    style={gridStyles.cardBgImage}
                    contentFit="cover"
                    transition={150}
                    cachePolicy="disk"
                  />
                  <View style={gridStyles.cardImageOverlay} />
                  <View style={gridStyles.cardImageContent}>
                    <Text style={gridStyles.cardNameLight} numberOfLines={2}>{cat.name}</Text>
                    <Text style={gridStyles.cardCountLight}>{countLabel}</Text>
                  </View>
                </>
              ) : (
                <>
                  <View style={[gridStyles.iconWrap, { backgroundColor: catStyle.bg }]}>
                    <Ionicons name={catStyle.icon as any} size={28} color={catStyle.color} />
                  </View>
                  <Text style={gridStyles.cardName} numberOfLines={2}>{cat.name}</Text>
                  <Text style={gridStyles.cardCount}>{countLabel}</Text>
                </>
              );
            })()}
          </Pressable>
        );
      })}
    </View>
  );
}

const createGridStyles = (palette: ReturnType<typeof useColors>) => {
  const Colors = { ...baseColors, light: palette };
  return StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    padding: 16,
  },
  card: {
    backgroundColor: Colors.light.surface,
    borderRadius: 16,
    padding: 14,
    alignItems: "flex-start",
    justifyContent: "flex-end",
    borderWidth: 1,
    borderColor: Colors.light.border,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  cardBgImage: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: "100%",
    height: "100%",
  },
  cardImageOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.42)",
  },
  cardImageContent: {
    position: "absolute",
    bottom: 12,
    left: 12,
    right: 12,
  },
  cardNameLight: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 13,
    color: "#fff",
    lineHeight: 17,
    textShadowColor: "rgba(0,0,0,0.4)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  cardCountLight: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 11,
    color: "rgba(255,255,255,0.8)",
    marginTop: 2,
  },
  iconWrap: {
    position: "absolute",
    top: 14,
    left: 14,
    width: 52,
    height: 52,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  cardName: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 13,
    color: Colors.light.text,
    lineHeight: 17,
  },
  cardCount: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 11,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  });
};
function ModifierModal({
  item,
  visible,
  onClose,
  onConfirm,
}: {
  item: MenuItem | null;
  visible: boolean;
  onClose: () => void;
  onConfirm: (modifiers: SelectedModifier[]) => void;
}) {
  const colors = useColors();
  const modStyles = useMemo(() => createModifierStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const [selections, setSelections] = useState<Record<string, string[]>>({});

  useEffect(() => {
    if (visible && item?.modifiers) {
      const init: Record<string, string[]> = {};
      item.modifiers.forEach((ml) => { init[ml.id] = []; });
      setSelections(init);
    }
  }, [visible, item]);

  if (!item) return null;

  const toggle = (listId: string, optId: string, selType: "SINGLE" | "MULTIPLE") => {
    setSelections((prev) => {
      const current = prev[listId] || [];
      if (selType === "SINGLE") {
        return { ...prev, [listId]: current[0] === optId ? [] : [optId] };
      }
      const idx = current.indexOf(optId);
      return { ...prev, [listId]: idx >= 0 ? current.filter((id) => id !== optId) : [...current, optId] };
    });
  };

  const handleConfirm = () => {
    onConfirm(collectSelectedModifiers(item, selections));
  };

  const cartName = item.variationName ? `${item.name} — ${item.variationName}` : item.name;
  const modifierTotal = (item.modifiers || []).reduce((sum, ml) => {
    return sum + (selections[ml.id] || []).reduce((s, optId) => {
      const opt = ml.options.find((o) => o.id === optId);
      return s + (opt?.price ?? 0);
    }, 0);
  }, 0);
  const lineTotal = item.price + modifierTotal;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={[modStyles.header, { paddingTop: insets.top + 16 }]}>
          <Text style={modStyles.title} numberOfLines={2}>{cartName}</Text>
          <Pressable onPress={onClose} hitSlop={12} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
            <Ionicons name="close" size={24} color={colors.text} />
          </Pressable>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 120 }}>
          {(item.modifiers || []).map((ml) => (
            <View key={ml.id} style={modStyles.group}>
              <View style={modStyles.groupHeader}>
                <Text style={modStyles.groupName}>{ml.name}</Text>
                <Text style={modStyles.groupHint}>
                  {ml.selectionType === "MULTIPLE" ? "Choose any" : "Optional"}
                </Text>
              </View>
              {ml.options.map((opt) => {
                const isSelected = (selections[ml.id] || []).includes(opt.id);
                return (
                  <Pressable
                    key={opt.id}
                    onPress={() => toggle(ml.id, opt.id, ml.selectionType)}
                    style={[modStyles.option, isSelected && modStyles.optionSelected]}
                    testID={`modifier-${ml.id}-${opt.id}`}
                  >
                    <View style={[
                      ml.selectionType === "SINGLE" ? modStyles.radio : modStyles.checkbox,
                      isSelected && modStyles.radioSelected,
                    ]}>
                      {isSelected && (
                        <View style={ml.selectionType === "SINGLE" ? modStyles.radioDot : modStyles.checkDot}>
                          {ml.selectionType === "MULTIPLE" && (
                            <Ionicons name="checkmark" size={12} color="#fff" />
                          )}
                        </View>
                      )}
                    </View>
                    <Text style={modStyles.optionName}>{opt.name}</Text>
                    {opt.price > 0 && (
                      <Text style={modStyles.optionPrice}>+{formatPrice(opt.price)}</Text>
                    )}
                  </Pressable>
                );
              })}
            </View>
          ))}
        </ScrollView>

        <View style={[modStyles.footer, { paddingBottom: insets.bottom + 16 }]}>
          <Pressable
            onPress={handleConfirm}
            style={({ pressed }) => [modStyles.addBtn, { opacity: pressed ? 0.8 : 1 }]}
            testID="modifier-confirm-btn"
          >
            <Text style={modStyles.addBtnText}>Add to Order · {formatPrice(lineTotal)}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const createModifierStyles = (palette: ReturnType<typeof useColors>) => {
  const Colors = { ...baseColors, light: palette };
  return StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
    gap: 12,
  },
  title: {
    flex: 1,
    fontFamily: "Montserrat_700Bold",
    fontSize: 18,
    color: Colors.light.text,
  },
  group: {
    marginBottom: 24,
  },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  groupName: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 15,
    color: Colors.light.text,
    flex: 1,
  },
  groupHint: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 12,
    color: Colors.light.textSecondary,
  },
  requiredBadge: {
    backgroundColor: "rgba(212,168,67,0.15)",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  requiredText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 11,
    color: "#D4A843",
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: Colors.light.border,
    marginBottom: 8,
    backgroundColor: Colors.light.background,
  },
  optionSelected: {
    borderColor: Colors.brand.blue,
    backgroundColor: "#EFF6FF",
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Colors.light.border,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: Colors.light.border,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  radioSelected: {
    borderColor: Colors.brand.blue,
    backgroundColor: Colors.brand.blue,
  },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#fff",
  },
  checkDot: {
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  optionName: {
    flex: 1,
    fontFamily: "Montserrat_500Medium",
    fontSize: 14,
    color: Colors.light.text,
  },
  optionPrice: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 13,
    color: Colors.light.textSecondary,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
    backgroundColor: Colors.light.background,
  },
  addBtn: {
    backgroundColor: Colors.brand.blue,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
  },
  addBtnText: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 16,
    color: "#fff",
  },
  });
};
function VariationModal({
  group,
  visible,
  onClose,
  onSelect,
}: {
  group: MenuProductGroup | null;
  visible: boolean;
  onClose: () => void;
  onSelect: (item: MenuItem) => void;
}) {
  const colors = useColors();
  const modStyles = useMemo(() => createModifierStyles(colors), [colors]);
  const variationStyles = useMemo(() => createVariationStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  if (!group) return null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={[modStyles.header, { paddingTop: insets.top + 16 }]}>
          <View style={{ flex: 1 }}>
            <Text style={modStyles.title} numberOfLines={2}>{group.name}</Text>
            <Text style={variationStyles.subtitle}>Choose a size</Text>
          </View>
          <Pressable onPress={onClose} hitSlop={12} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
            <Ionicons name="close" size={24} color={colors.text} />
          </Pressable>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={variationStyles.content}>
          {group.variations.map((variation) => {
            const unavailable = !!variation.soldOut;
            return (
              <Pressable
                key={variation.variationId}
                disabled={unavailable}
                onPress={() => onSelect(variation)}
                accessibilityRole="button"
                accessibilityState={{ disabled: unavailable }}
                accessibilityLabel={`${variation.variationName || "Regular"}, ${formatPrice(variation.price)}${unavailable ? ", unavailable" : ""}`}
                style={({ pressed }) => [
                  variationStyles.option,
                  unavailable && variationStyles.optionUnavailable,
                  pressed && !unavailable && variationStyles.optionPressed,
                ]}
                testID={`choose-variation-${variation.variationId}`}
              >
                <View style={{ flex: 1 }}>
                  <Text style={variationStyles.optionName}>
                    {variation.variationName || "Regular"}
                  </Text>
                  {unavailable && <Text style={variationStyles.unavailableText}>Unavailable</Text>}
                </View>
                <Text style={variationStyles.optionPrice}>{formatPrice(variation.price)}</Text>
                {!unavailable && <Ionicons name="chevron-forward" size={20} color={Colors.brand.blue} />}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}

const createVariationStyles = (palette: ReturnType<typeof useColors>) => {
  const Colors = { ...baseColors, light: palette };
  return StyleSheet.create({
  subtitle: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 13,
    color: Colors.light.textSecondary,
    marginTop: 4,
  },
  content: {
    padding: 20,
    gap: 10,
  },
  option: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
  },
  optionPressed: {
    borderColor: Colors.brand.blue,
    backgroundColor: "#EFF6FF",
  },
  optionUnavailable: {
    opacity: 0.5,
  },
  optionName: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 16,
    color: Colors.light.text,
  },
  unavailableText: {
    fontFamily: "Montserrat_500Medium",
    fontSize: 12,
    color: Colors.light.textSecondary,
    marginTop: 3,
  },
  optionPrice: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 15,
    color: Colors.brand.blue,
  },
  });
};
function ItemCard({
  group,
  onSelectProduct,
  highlighted,
  showDietaryTags,
  kitchenClosed,
  barClosed,
}: {
  group: MenuProductGroup;
  onSelectProduct: (group: MenuProductGroup) => void;
  highlighted?: boolean;
  /** FEATURE_DIETARY_FILTERS: render dietary badges next to the item name. */
  showDietaryTags?: boolean;
  /** Item belongs to a kitchen-tagged category and the kitchen is closed
   *  right now → render greyed out + show "Kitchen closed" badge + block
   *  taps. Drinks/snacks are unaffected. */
  kitchenClosed?: boolean;
  /** Item belongs to a bar (non-kitchen) category and the bar schedule is
   *  closed → grey out and show "Bar closed" badge. */
  barClosed?: boolean;
}) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { addItem, updateQuantity, getQuantity } = useCart();
  const item = group.displayItem;
  const hasMultipleVariations = group.variations.length > 1;
  const qty = group.variations.reduce((sum, variation) => sum + getQuantity(variation.variationId), 0);
  const soldOut = group.soldOut || !!kitchenClosed || !!barClosed;
  const cartName = item.variationName ? `${item.name} — ${item.variationName}` : item.name;
  const hasImage = !!item.imageUrl;
  const hasModifiers = group.variations.some((variation) => !!variation.modifiers?.length);
  // FEATURE_DIETARY_FILTERS: resolve tag codes to {label, colour}. Skipped
  // when the parent didn't opt in via showDietaryTags so menus rendered
  // for venues without the flag stay visually identical to before.
  const tagBadges = (showDietaryTags && item.dietaryTags && item.dietaryTags.length > 0)
    ? item.dietaryTags
        .map(code => DIETARY_TAGS.find(t => t.code === code))
        .filter((t): t is typeof DIETARY_TAGS[number] => !!t)
    : [];

  const handleAdd = () => {
    if (hasMultipleVariations) {
      onSelectProduct(group);
      return;
    }
    if (hasModifiers) {
      onSelectProduct(group);
    } else {
      addItem({ variationId: item.variationId, itemId: item.id, name: cartName, price: item.price });
    }
  };

  return (
    <View style={[styles.itemCard, soldOut && styles.itemCardSoldOut, highlighted && styles.itemCardHighlighted]}>
      {highlighted && (
        <View style={styles.highlightedBanner}>
          <Ionicons name="pricetag" size={11} color="#fff" />
          <Text style={styles.highlightedBannerText}>Featured offer</Text>
        </View>
      )}
      {hasImage && (
        <ExpoImage
          source={{ uri: withBannerCacheBuster(item.imageUrl ?? "", item.updatedAt) }}
          style={styles.itemImage}
          contentFit="cover"
          transition={150}
          cachePolicy="disk"
        />
      )}
      <View style={[styles.itemInfo, hasImage && styles.itemInfoWithImage]}>
        <View style={styles.itemNameRow}>
          <Text style={[styles.itemName, soldOut && styles.itemNameSoldOut]} numberOfLines={2}>{item.name}</Text>
          {!hasMultipleVariations && !!item.variationName && (
            <View style={styles.variationBadge}>
              <Text style={styles.variationText}>{item.variationName}</Text>
            </View>
          )}
          {soldOut && (
            <View style={styles.soldOutBadge}>
              <Text style={styles.soldOutText}>{!item.soldOut && kitchenClosed ? "Kitchen closed" : !item.soldOut && barClosed ? "Bar closed" : "Unavailable"}</Text>
            </View>
          )}
          {hasModifiers && !soldOut && (
            <View style={[styles.variationBadge, { backgroundColor: "#EFF6FF" }]}>
              <Text style={[styles.variationText, { color: Colors.brand.blue }]}>Customisable</Text>
            </View>
          )}
          {hasMultipleVariations && !soldOut && (
            <View style={[styles.variationBadge, { backgroundColor: "#EFF6FF" }]}>
              <Text style={[styles.variationText, { color: Colors.brand.blue }]}>Choose size</Text>
            </View>
          )}
        </View>
        {!!item.description && (
          <Text style={[styles.itemDesc, soldOut && { opacity: 0.4 }]} numberOfLines={2}>{item.description}</Text>
        )}
        {tagBadges.length > 0 && (
          <View style={styles.dietaryRow}>
            {tagBadges.map(t => (
              <View key={t.code} style={[styles.dietaryBadge, { backgroundColor: t.colour + "1A", borderColor: t.colour + "55" }]}>
                <Text style={[styles.dietaryBadgeText, { color: t.colour }]}>{t.code}</Text>
              </View>
            ))}
          </View>
        )}
        <Text style={[styles.itemPrice, soldOut && { opacity: 0.4 }]}>
          {hasMultipleVariations && group.minPrice !== group.maxPrice
            ? `From ${formatPrice(group.minPrice)}`
            : formatPrice(group.minPrice)}
        </Text>
      </View>

      <View style={styles.itemActions}>
        {soldOut ? (
          <View style={styles.addBtnDisabled}>
            <Ionicons name="close" size={18} color="rgba(255,255,255,0.5)" />
          </View>
        ) : hasModifiers || hasMultipleVariations ? (
          <View style={{ alignItems: "center", gap: 4 }}>
            {qty > 0 && (
              <View style={styles.modQtyBadge}>
                <Text style={styles.modQtyText}>{qty}</Text>
              </View>
            )}
            <Pressable
              onPress={handleAdd}
              accessibilityRole="button"
              accessibilityLabel={hasMultipleVariations ? `Choose a size for ${item.name}` : `Customise ${item.name}`}
              style={({ pressed }) => [styles.addBtn, { opacity: pressed ? 0.7 : 1 }]}
              testID={`add-${group.id}`}
            >
              <Ionicons name="add" size={20} color="#fff" />
            </Pressable>
          </View>
        ) : qty === 0 ? (
          <Pressable
            onPress={handleAdd}
            style={({ pressed }) => [styles.addBtn, { opacity: pressed ? 0.7 : 1 }]}
            testID={`add-${item.variationId}`}
          >
            <Ionicons name="add" size={20} color="#fff" />
          </Pressable>
        ) : (
          <View style={styles.qtyRow}>
            <Pressable
              onPress={() => updateQuantity(item.variationId, -1)}
              style={({ pressed }) => [styles.qtyBtn, { opacity: pressed ? 0.7 : 1 }]}
            >
              <Ionicons name="remove" size={16} color={Colors.brand.blue} />
            </Pressable>
            <Text style={styles.qtyText}>{qty}</Text>
            <Pressable
              onPress={handleAdd}
              style={({ pressed }) => [styles.qtyBtn, { opacity: pressed ? 0.7 : 1 }]}
            >
              <Ionicons name="add" size={16} color={Colors.brand.blue} />
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

function CartSheet({
  visible,
  onClose,
  initialStep,
  initialGuestEmail,
  onInitialConsumed,
}: {
  visible: boolean;
  onClose: () => void;
  initialStep?: "cart" | "customer";
  initialGuestEmail?: string;
  onInitialConsumed?: () => void;
}) {
  const colors = useColors();
  const Colors = { ...baseColors, light: colors };
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { items, removeItem, updateQuantity, clearCart, totalPrice } = useCart();
  const { customer, getCustomerToken } = useCustomerAuth();
  const { expoPushToken } = useNotifications();
  const { flags } = useFeatureFlags();
  const [step, setStep] = useState<"cart" | "customer">("cart");
  const [selectedRewardId, setSelectedRewardId] = useState<string | null>(null);
  const [tableNote, setTableNote] = useState("");
  const [tableModalVisible, setTableModalVisible] = useState(false);
  const [tableSearch, setTableSearch] = useState("");
  const [orderNote, setOrderNote] = useState("");
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestMode, setGuestMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [paymentSheetVisible, setPaymentSheetVisible] = useState(false);
  const [pendingOrder, setPendingOrder] = useState<{ appOrderId: number; amountPence: number; confirmationToken?: string } | null>(null);
  // Incrementing this key forces SquarePaymentSheet to fully unmount and
  // remount (fresh WebView, fresh JS state) on "Try Again" — without it the
  // WebView stays alive with fatalSent=true and the card form never reappears.
  const [paySheetKey, setPaySheetKey] = useState(0);
  const [cancelledNotice, setCancelledNotice] = useState<string | null>(null);
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const unavailableItems = items.filter((item) => item.unavailable);
  const hasUnavailableItems = unavailableItems.length > 0;
  const unavailableItemNames = Array.from(
    new Set(unavailableItems.map((item) => item.name)),
  );

  // If the customer modifies their cart after closing the payment sheet, clear
  // any stale pendingOrder so that tapping "Continue" creates a fresh order
  // with the correct items and total rather than reusing the old one.
  const itemsFingerprint = items
    .map(i => `${i.variationId}:${i.quantity}:${i.unavailable ? "unavailable" : "available"}`)
    .join("|");
  const prevItemsFingerprintRef = React.useRef(itemsFingerprint);
  React.useEffect(() => {
    if (prevItemsFingerprintRef.current !== itemsFingerprint) {
      prevItemsFingerprintRef.current = itemsFingerprint;
      if (pendingOrder) setPendingOrder(null);
    }
  }, [itemsFingerprint]);

  useEffect(() => {
    if (!hasUnavailableItems) return;
    setStep("cart");
    setPaymentSheetVisible(false);
    setPendingOrder(null);
    setPayError(null);
  }, [hasUnavailableItems]);

  // FEATURE_SAVED_CARDS: snapshot of the customer's stored card, if any.
  // Only fetched when both the flag is on AND the customer is authenticated
  // (anonymous orders have no account to attach a card to). The endpoint
  // returns 404 when nothing is saved — we map that to `null` so the rest
  // of the checkout can do a simple truthy check.
  const { data: savedCard } = useQuery<
    { brand: string; last4: string; expMonth: number | null; expYear: number | null } | null
  >({
    queryKey: ["/api/customers/me/saved-card", customer?.id],
    enabled: !!flags.savedCards && !!customer,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const token = getCustomerToken();
      if (!token) return null;
      const res = await fetch(new URL("/api/customers/me/saved-card", getApiUrl()).toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`saved-card ${res.status}`);
      return res.json();
    },
  });

  // Square Web Payments SDK config (cached for the session)
  const { data: squareConfig } = useQuery<{
    applicationId: string | null;
    locationId: string | null;
    environment: "production" | "sandbox";
    configured: boolean;
    memberDiscountExcludedItemIds?: string[];
  } | null>({
    queryKey: ["/api/public/square-config"],
    staleTime: 60 * 60 * 1000,
  });

  // Initialise Google Pay at the screen level (not inside SquarePaymentSheet)
  // so the canUseGooglePay() async check resolves BEFORE the payment modal
  // opens. Without this, the check ran after paySheetKey incremented (remount)
  // and the async result came back after the slide-in animation, causing the
  // Google Pay button to appear late or not at all on Android.
  const {
    canUseGooglePay: screenCanUseGooglePay,
    requestNonce: screenGooglePayRequestNonce,
  } = useSquareGooglePay({
    applicationId: squareConfig?.applicationId ?? null,
    locationId: squareConfig?.locationId ?? null,
    environment: squareConfig?.environment ?? "sandbox",
    buyerEmail: customer?.email ?? null,
    buyerName: customer?.name ?? null,
  });

  // Issued loyalty rewards — only fetched when customer is signed in
  const { data: loyaltyData } = useQuery<{
    rewards?: Array<{ id: string; reward_tier_id: string; status: string }>;
    program?: { reward_tiers?: Array<{ id: string; name: string; definition?: { discount_type?: string; percentage_discount?: string; fixed_discount_money?: { amount: number; currency: string } } }> };
  }>({
    queryKey: ["/api/loyalty/me"],
    enabled: !!customer,
    staleTime: 0,
    queryFn: async () => {
      const token = await getCustomerToken();
      if (!token) return {};
      const res = await fetch(new URL("/api/loyalty/me", getApiUrl()).toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return {};
      return res.json();
    },
  });
  const issuedRewards = (loyaltyData?.rewards ?? []).filter((r) => r.status === "ISSUED");

  useEffect(() => {
    if (!visible) {
      setStep("cart");
      setGuestMode(false);
      setPayError(null);
      setPaymentSheetVisible(false);
      setPendingOrder(null);
      setCancelledNotice(null);
      setSelectedRewardId(null);
    } else {
      // Apply deep-link state when the sheet opens (e.g. after returning
      // from /account during the member-discount sign-in flow).
      if (initialStep === "customer") {
        setStep("customer");
        if (!customer && initialGuestEmail) {
          setGuestMode(true);
          setGuestEmail(initialGuestEmail);
        }
      }
      // Warm DNS + TLS for Square's payment CDN now — the customer is one
      // tap away from opening the in-app payment sheet, and the OS-level
      // resolver/session cache is shared with the WebView. Saves 100–300 ms
      // off the SDK's first byte on cold mobile connections.
      prefetchSquarePaymentSdk();
      onInitialConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Clear the cancellation notice as soon as the user changes the cart
  useEffect(() => {
    if (cancelledNotice) setCancelledNotice(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length]);

  const { data: memberSub } = useQuery<{
    status: string;
    cancelledAt: string | null;
    currentPeriodEnd: string | null;
    plan: { name: string; foodDrinkDiscount: number; active: boolean; excludeWithDeals?: boolean } | null;
  } | null>({
    queryKey: ["/api/membership/my-subscription"],
    queryFn: async () => {
      if (!customer) return null;
      const baseUrl = getApiUrl();
      const url = new URL("/api/membership/my-subscription", baseUrl);
      const token = await getCustomerToken();
      const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!customer,
    staleTime: 5 * 60 * 1000,
  });


  const isValidMember =
    memberSub?.status === "active" &&
    !memberSub.cancelledAt &&
    (!memberSub.currentPeriodEnd || new Date(memberSub.currentPeriodEnd) >= new Date()) &&
    memberSub.plan?.active === true &&
    (memberSub.plan?.foodDrinkDiscount ?? 0) > 0;
  const discountPercent = isValidMember ? memberSub!.plan!.foodDrinkDiscount : 0;
  const discountLabel = discountPercent > 0 ? `${memberSub!.plan!.name} Member Discount` : "";

  // Live Square promotional discounts (e.g. "Weekend of Hawkstone") that
  // will actually be applied to this cart at checkout. We hit /api/deals
  // with ?surface=order so the result already respects the staff-portal
  // "Square offers — Order tab" toggle: when off, the array is empty and
  // no preview is shown. The default fetcher uses the queryKey as the
  // URL path, which works for query-string keys too.
  const { data: applicableDeals } = useQuery<Array<{
    id: string;
    name: string;
    discountType: "FIXED_AMOUNT" | "FIXED_PERCENTAGE";
    amountPence?: number;
    percentage?: string;
    applicableVariationIds?: string[];
  }>>({
    queryKey: ["/api/deals?surface=order"],
    staleTime: 60_000,
  });
  // Build a map of variationId/itemId -> deal so per-line lookup is O(1).
  // Mirrors the server-side dealByVariationId logic in buildSquareOrderBody
  // so the cart preview reflects exactly what Square will compute.
  const dealLookup = (() => {
    const m = new Map<string, typeof applicableDeals extends (infer U)[] | undefined ? U : never>();
    for (const d of applicableDeals || []) {
      for (const id of d.applicableVariationIds || []) {
        if (!m.has(id)) m.set(id, d as any);
      }
    }
    return m;
  })();
  // Walk the cart once and split each line into "deal applies" vs "no deal".
  // We need both the total deal saving AND the non-deal subtotal so the
  // member-discount preview can mirror the server's `excludeWithDeals`
  // behaviour: when the plan excludes stacking, the % is calculated on
  // non-deal lines only — exactly how `buildSquareOrderBody` stamps it
  // (LINE_ITEM scope, applied only to lines without an `applied_discounts`
  // entry for the deal).
  let dealsAmountPence = 0;
  let memberEligibleSubtotalAfterDealsPence = 0;
  let memberEligibleNonDealSubtotalPence = 0;
  const serverMemberDiscountExcludedItemIds =
    squareConfig?.memberDiscountExcludedItemIds;
  const memberDiscountExcludedItemIds = getMemberDiscountPreviewExcludedItemIds(
    serverMemberDiscountExcludedItemIds,
  );
  for (const i of items) {
    const lineSubtotal = i.price * i.quantity;
    const deal = dealLookup.get(i.variationId) ?? (i.itemId ? dealLookup.get(i.itemId) : undefined);
    const excludedFromMemberDiscount =
      !!i.itemId && memberDiscountExcludedItemIds.has(i.itemId);
    if (!deal) {
      if (!excludedFromMemberDiscount) {
        memberEligibleNonDealSubtotalPence += lineSubtotal;
        memberEligibleSubtotalAfterDealsPence += lineSubtotal;
      }
      continue;
    }
    let lineDealSavingPence = 0;
    if (deal.discountType === "FIXED_AMOUNT" && typeof deal.amountPence === "number") {
      lineDealSavingPence = deal.amountPence * i.quantity;
    } else if (deal.discountType === "FIXED_PERCENTAGE" && deal.percentage) {
      const pct = parseFloat(deal.percentage);
      if (!Number.isNaN(pct) && pct > 0) {
        lineDealSavingPence = Math.round((lineSubtotal * pct) / 100);
      }
    }
    dealsAmountPence += lineDealSavingPence;
    if (!excludedFromMemberDiscount) {
      memberEligibleSubtotalAfterDealsPence += Math.max(0, lineSubtotal - lineDealSavingPence);
    }
  }

  const excludeWithDeals = !!memberSub?.plan?.excludeWithDeals;
  const subtotalAfterDeals = Math.max(0, totalPrice - dealsAmountPence);
  // The membership percentage never applies to explicitly excluded Square
  // items. Plans that also disallow deal stacking use only eligible,
  // non-deal lines; otherwise the deal-adjusted eligible subtotal is used.
  const memberDiscountBase = excludeWithDeals
    ? memberEligibleNonDealSubtotalPence
    : memberEligibleSubtotalAfterDealsPence;
  const discountAmountPence = calculateMemberDiscountPreviewPence({
    discountPercent,
    eligibleSubtotalPence: memberDiscountBase,
    exclusionsLoaded: Array.isArray(serverMemberDiscountExcludedItemIds),
  });
  const finalPrice = Math.max(0, subtotalAfterDeals - discountAmountPence);

  // Loyalty reward discount — calculated client-side for display only.
  // The server independently verifies the discount amount from Square when
  // the order is placed, so the client value is never trusted for billing.
  const selectedReward = issuedRewards.find((r) => r.id === selectedRewardId) ?? null;
  const selectedRewardTier = selectedReward
    ? (loyaltyData?.program?.reward_tiers ?? []).find((t) => t.id === selectedReward.reward_tier_id) ?? null
    : null;
  const selectedRewardDef = selectedRewardTier?.definition ?? null;
  const rewardDiscountPence = (() => {
    if (!selectedRewardDef) return 0;
    if (
      selectedRewardDef.discount_type === "FIXED_AMOUNT" &&
      selectedRewardDef.fixed_discount_money?.amount
    ) {
      return Math.min(finalPrice, Number(selectedRewardDef.fixed_discount_money.amount));
    }
    if (
      selectedRewardDef.discount_type === "FIXED_PERCENTAGE" &&
      selectedRewardDef.percentage_discount
    ) {
      return Math.round(finalPrice * Number(selectedRewardDef.percentage_discount) / 100);
    }
    return 0;
  })();
  const finalPriceAfterReward = Math.max(0, finalPrice - rewardDiscountPence);

  const effectiveCustomer = customer
    ? { name: customer.name, email: customer.email, phone: customer.phone ?? undefined }
    : guestMode && (guestName.trim() || guestEmail.trim())
    ? { name: guestName.trim() || undefined, email: guestEmail.trim() || undefined }
    : undefined;

  const buildOrderPayload = () => ({
    items: items.map((i) => ({
      variationId: i.variationId,
      itemId: i.itemId,
      name: i.name,
      price: i.price,
      quantity: i.quantity,
      ...(i.modifiers?.length ? { modifiers: i.modifiers } : {}),
    })),
    tableNote: tableNote.trim() || undefined,
    orderNote: orderNote.trim() || undefined,
    customer: effectiveCustomer,
    // Send the originating device's Expo push token so the server can
    // notify ONLY this device when the order is ready / delivered /
    // collected — without bothering the customer's other signed-in
    // devices. The server validates the token format before storing.
    pushToken: expoPushToken || undefined,
    // Loyalty reward to redeem with this order (if the customer selected one)
    loyaltyRewardId: selectedRewardId || undefined,
  });

  // Fallback path: hosted Square checkout via in-app browser modal.
  // Used when the Web Payments SDK is not configured.
  const fallbackToHostedCheckout = async () => {
    setLoading(true);
    try {
      const apiBase = getApiUrl();
      const url = new URL("/api/orders/checkout", apiBase);
      // Include the signed-in customer's session token so the server can
      // identify the buyer and apply their member discount. Without this,
      // every order is treated as a guest and the discount is silently
      // dropped — even though the cart preview showed it.
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (customer) {
        const token = await getCustomerToken();
        if (token) headers.Authorization = `Bearer ${token}`;
      }
      const res = await fetch(url.toString(), {
        method: "POST",
        headers,
        body: JSON.stringify(buildOrderPayload()),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Checkout failed");
      trackEvent("order_checkout_succeeded", { method: "hosted_checkout" });
      onClose();
      clearCart();
      setTableNote("");
      setOrderNote("");
      setGuestName("");
      setGuestEmail("");
      setStep("cart");
      setGuestMode(false);
      // In-app browser modal — never fully leaves the app
      try {
        await WebBrowser.openBrowserAsync(data.url);
      } catch {
        await Linking.openURL(data.url);
      }
    } catch (err: any) {
      trackEvent("order_checkout_failed", { method: "hosted_checkout", reason: "request_error" });
      Alert.alert("Checkout Error", err.message || "Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Snapshot the cart at order creation so confirmation shows what was paid for
  const snapshottedItemsRef = React.useRef<{ name: string; quantity: number; price: number; modifiers?: string[] }[]>([]);
  const snapshottedTableRef = React.useRef<string>("");

  // FEATURE_SAVED_CARDS: one-tap reorder using the customer's saved card.
  // Creates the pending order on the server (so totals/discounts are
  // re-validated), then immediately POSTs to /pay-with-saved-card. On
  // success the user goes straight to the confirmation screen, skipping
  // the payment sheet entirely. On failure we surface the error inline
  // and keep the cart so the user can try again or use a new card.
  const handlePayWithSavedCard = async () => {
    if (items.length === 0) return;
    if (!customer) return;
    setLoading(true);
    setPayError(null);
    trackEvent("order_checkout_started", { method: "saved_card" });
    try {
      const apiBase = getApiUrl();
      const token = await getCustomerToken();
      if (!token) throw new Error("Not signed in");

      // Step 1: create the pending order (same payload as normal flow).
      const createUrl = new URL("/api/orders/create", apiBase);
      const createRes = await fetch(createUrl.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(buildOrderPayload()),
      });
      const createData = await createRes.json();
      if (!createRes.ok) {
        if (createRes.status === 503) {
          void queryClient.invalidateQueries({ queryKey: ["/api/ordering-status"] });
        }
        throw new Error(createData.message || "Could not start checkout");
      }

      // Snapshot for confirmation screen
      snapshottedItemsRef.current = items.map((i) => ({
        name: i.name,
        quantity: i.quantity,
        price: i.price,
        ...(i.modifiers?.length ? { modifiers: i.modifiers.map((m) => m.name) } : {}),
      }));
      snapshottedTableRef.current = tableNote.trim();
      const created = { appOrderId: createData.appOrderId, amountPence: createData.amountPence, confirmationToken: createData.confirmationToken };
      setPendingOrder(created);
      if (typeof created.confirmationToken === "string" && created.confirmationToken.length > 0) {
        void setPendingConfirmation({ appOrderId: created.appOrderId, token: created.confirmationToken });
      }

      // Step 2: charge the saved card.
      setPaying(true);
      const payUrl = new URL(`/api/orders/${created.appOrderId}/pay-with-saved-card`, apiBase);
      const payRes = await fetch(payUrl.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      const payData = await payRes.json();
      const alreadyPaid =
        payRes.status === 409 &&
        typeof payData?.message === "string" &&
        /already.?paid|already.?processed/i.test(payData.message);
      if (!alreadyPaid && (!payRes.ok || !payData.ok)) {
        // 412 = no card on file (race with delete from another device).
        // Refetch the saved-card query so the UI removes the CTA, then
        // surface a helpful message rather than a raw API error.
        if (payRes.status === 412) {
          void queryClient.invalidateQueries({ queryKey: ["/api/customers/me/saved-card", customer.id] });
          throw new Error("Your saved card is no longer on file. Please use a different card.");
        }
        throw new Error(payData.message || "Payment was declined.");
      }

      // Step 3: success — same teardown as the normal flow.
      const confirmationParams: Record<string, string> = {
        appOrderId: String(created.appOrderId),
        tableNote: snapshottedTableRef.current,
        totalPence: String(created.amountPence),
        items: JSON.stringify(snapshottedItemsRef.current),
      };
      if (created.confirmationToken) {
        confirmationParams.token = created.confirmationToken;
      }
      setPendingOrder(null);
      onClose();
      clearCart();
      setTableNote("");
      setOrderNote("");
      setStep("cart");
      router.push({ pathname: "/order-confirmation", params: confirmationParams });
      trackEvent("order_checkout_succeeded", { method: "saved_card" });
    } catch (err: any) {
      trackEvent("order_checkout_failed", { method: "saved_card", reason: "request_error" });
      setPayError(err.message || "Payment failed. Please try again.");
    } finally {
      setLoading(false);
      setPaying(false);
    }
  };

  const handleCheckout = async () => {
    if (items.length === 0) return;
    trackEvent("order_checkout_started", {
      method: squareConfig?.configured ? "payment_sheet" : "hosted_checkout",
    });
    if (!squareConfig?.configured) {
      // Web Payments SDK not available — fall back to hosted checkout
      return fallbackToHostedCheckout();
    }
    // If a pending order already exists (the customer closed the payment sheet
    // and is retrying), reopen the sheet against the same server-side order
    // instead of creating a duplicate. This prevents orphaned pending orders
    // that would otherwise sit in the DB until the 30-min expiry job clears them.
    if (pendingOrder) {
      setPaySheetKey(k => k + 1); // remount the SDK cleanly
      setPaymentSheetVisible(true);
      return;
    }
    setLoading(true);
    setPayError(null);
    try {
      const apiBase = getApiUrl();
      const url = new URL("/api/orders/create", apiBase);
      // Include the signed-in customer's session token so the server can
      // identify the buyer and apply their member discount. Without this,
      // every order is treated as a guest and the discount is silently
      // dropped — even though the cart preview showed it.
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (customer) {
        const token = await getCustomerToken();
        if (token) headers.Authorization = `Bearer ${token}`;
      }
      const res = await fetch(url.toString(), {
        method: "POST",
        headers,
        body: JSON.stringify(buildOrderPayload()),
      });
      const data = await res.json();
      if (!res.ok) {
        // Ordering was just turned off — refresh status so the closed banner appears immediately.
        if (res.status === 503) {
          void queryClient.invalidateQueries({ queryKey: ["/api/ordering-status"] });
        }
        throw new Error(data.message || "Could not start checkout");
      }
      // Snapshot for confirmation screen
      snapshottedItemsRef.current = items.map((i) => ({
        name: i.name,
        quantity: i.quantity,
        price: i.price,
        ...(i.modifiers?.length ? { modifiers: i.modifiers.map((m) => m.name) } : {}),
      }));
      snapshottedTableRef.current = tableNote.trim();
      setPendingOrder({ appOrderId: data.appOrderId, amountPence: data.amountPence, confirmationToken: data.confirmationToken });
      // Persist the pending order id + confirmation token so we can recover
      // the receipt if the app is closed/backgrounded before the in-app
      // confirmation appears. The token is required by the server; without
      // it, knowing an order id alone reveals nothing.
      if (typeof data.confirmationToken === "string" && data.confirmationToken.length > 0) {
        void setPendingConfirmation({ appOrderId: data.appOrderId, token: data.confirmationToken });
      }

      // Zero-amount guard: when a loyalty reward covers 100% of the order,
      // the server returns amountPence=0. Square immediately rejects a
      // payment request for £0, causing the payment sheet to fatal on open.
      // Instead, call the free-complete endpoint and go straight to the
      // confirmation screen — no card needed.
      if (data.amountPence === 0) {
        const freeUrl = new URL(`/api/orders/${data.appOrderId}/complete-free`, apiBase);
        const freeRes = await fetch(freeUrl.toString(), {
          method: "POST",
          headers,
          body: JSON.stringify({ confirmationToken: data.confirmationToken }),
        });
        if (!freeRes.ok) {
          const freeErr = await freeRes.json().catch(() => ({}));
          throw new Error((freeErr as any).message || "Could not complete free order");
        }
        const confirmationParams: Record<string, string> = {
          appOrderId: String(data.appOrderId),
          tableNote: snapshottedTableRef.current,
          totalPence: "0",
          items: JSON.stringify(snapshottedItemsRef.current),
        };
        if (data.confirmationToken) confirmationParams.token = data.confirmationToken;
        setPendingOrder(null);
        onClose();
        clearCart();
        setTableNote("");
        setOrderNote("");
        setGuestName("");
        setGuestEmail("");
        setStep("cart");
        setGuestMode(false);
        router.push({ pathname: "/order-confirmation", params: confirmationParams });
        trackEvent("order_checkout_succeeded", { method: "payment_sheet", amount_pence: 0 });
        return;
      }

      setPaymentSheetVisible(true);
    } catch (err: any) {
      trackEvent("order_checkout_failed", { method: "payment_sheet", reason: "request_error" });
      Alert.alert("Checkout Error", err.message || "Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleTokenized = async (payload: { sourceId: string; verificationToken?: string | null; saveCard?: boolean }) => {
    if (!pendingOrder) return;
    // Biometric (Face ID / Touch ID / Fingerprint) confirmation step. We
    // only prompt on devices that have it enrolled — if the device doesn't
    // support biometrics or the user hasn't set them up, we proceed straight
    // to the charge so the flow falls back gracefully. On web there is no
    // local biometric API, so this is a no-op there too.
    if (Platform.OS !== "web") {
      try {
        if (await shouldPromptForPaymentBiometric()) {
          const kind = await getBiometricKind();
          const result = await LocalAuthentication.authenticateAsync({
            promptMessage: `Confirm payment of ${formatPrice(pendingOrder.amountPence)} with ${biometricLabel(kind)}`,
            fallbackLabel: "Use passcode",
            cancelLabel: "Cancel",
            disableDeviceFallback: false,
          });
          if (!result.success) {
            setPayError("Payment cancelled. Tap Pay to try again.");
            return;
          }
        }
      } catch {
        // If the biometric layer itself errors, don't block the payment —
        // Square's own card / wallet flow has already authenticated the user.
      }
    }
    setPaying(true);
    setPayError(null);
    try {
      const apiBase = getApiUrl();
      const url = new URL(`/api/orders/${pendingOrder.appOrderId}/pay`, apiBase);
      // FEATURE_SAVED_CARDS: forward the save-card opt-in flag and the
      // session token. The session is required so the server can attach
      // the card to the right customer; without it the server safely
      // ignores saveCard and behaves like a plain charge.
      const payHeaders: Record<string, string> = { "Content-Type": "application/json" };
      if (flags.savedCards && payload.saveCard && customer) {
        const t = await getCustomerToken();
        if (t) payHeaders.Authorization = `Bearer ${t}`;
      }
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: payHeaders,
        body: JSON.stringify({
          sourceId: payload.sourceId,
          verificationToken: payload.verificationToken ?? undefined,
          buyerEmail: customer?.email || guestEmail.trim() || undefined,
          ...(flags.savedCards && payload.saveCard ? { saveCard: true } : {}),
        }),
      });
      const data = await res.json();
      // Treat "already paid" (e.g. webhook beat us to it) as success.
      const alreadyPaid =
        res.status === 409 &&
        typeof data?.message === "string" &&
        /already.?paid|already.?processed/i.test(data.message);
      if (!alreadyPaid && (!res.ok || !data.ok)) {
        throw new Error(data.message || "Payment was declined.");
      }
      // Success — close everything, clear cart, route to confirmation
      const confirmationParams: Record<string, string> = {
        appOrderId: String(pendingOrder.appOrderId),
        tableNote: snapshottedTableRef.current,
        totalPence: String(pendingOrder.amountPence),
        items: JSON.stringify(snapshottedItemsRef.current),
      };
      if (pendingOrder.confirmationToken) {
        confirmationParams.token = pendingOrder.confirmationToken;
      }
      setPaymentSheetVisible(false);
      setPendingOrder(null);
      onClose();
      clearCart();
      setTableNote("");
      setOrderNote("");
      setGuestName("");
      setGuestEmail("");
      setStep("cart");
      setGuestMode(false);
      router.push({ pathname: "/order-confirmation", params: confirmationParams });
      trackEvent("order_checkout_succeeded", { method: "payment_sheet" });
    } catch (err: any) {
      trackEvent("order_checkout_failed", { method: "payment_sheet", reason: "payment_error" });
      setPayError(err.message || "Payment failed. Please try again.");
    } finally {
      setPaying(false);
    }
  };

  const handleClosePaymentSheet = () => {
    if (paying) return;
    setPaymentSheetVisible(false);
    // Intentionally keep pendingOrder so that tapping "Continue" again reopens
    // the payment sheet against the same server-side Square order rather than
    // creating a duplicate. The order is cleared on success, on cart change,
    // or when the user explicitly cancels via the Cancel alert button.
    setPayError(null);
    // Inline cancellation message so the user knows what happened. The cart
    // is intentionally left intact so they can retry or change their order.
    setCancelledNotice("Payment cancelled. Your cart has been kept — tap Pay to try again.");
  };

  const handleSheetUnavailable = (reason: string) => {
    // The SDK reported a fatal error (3DS fingerprint timeout, init failure,
    // offline, etc.). Do NOT automatically open an external browser — that
    // is confusing and removes control from the user. Instead:
    //   1. Hide the payment sheet but KEEP pendingOrder intact so "Try Again"
    //      can reopen the sheet against the same server-side order.
    //   2. Show an Alert giving the user the choice to retry or fall back
    //      to the hosted web checkout (which does open a browser).
    setPaymentSheetVisible(false);
    setPayError(null);
    if (__DEV__) console.warn("Square SDK unavailable:", reason);
    Alert.alert(
      "Payment Screen Issue",
      "The payment screen couldn't load — this is usually temporary.\n\nTap \"Try Again\" to reopen it, or \"Web Checkout\" to pay via browser.",
      [
        {
          text: "Try Again",
          style: "default",
          // Increment the key to force a full unmount+remount of the WebView
          // (resets fatalSent=true and restarts SDK init from scratch), then
          // make the sheet visible again against the same server-side order.
          onPress: () => {
            setPaySheetKey(k => k + 1);
            setPaymentSheetVisible(true);
          },
        },
        {
          text: "Web Checkout",
          style: "default",
          onPress: () => {
            // Abandon the in-flight Square order and create a fresh one
            // via hosted checkout instead.
            setPendingOrder(null);
            fallbackToHostedCheckout();
          },
        },
        {
          text: "Cancel",
          style: "cancel",
          // Clean up the pending order so it doesn't linger as a zombie.
          onPress: () => setPendingOrder(null),
        },
      ]
    );
  };

  const handleClose = () => {
    setStep("cart");
    setGuestMode(false);
    onClose();
  };

  const TotalSummary = () => {
    const hasDeals = dealsAmountPence > 0;
    const hasMember = discountPercent > 0;
    const hasReward = rewardDiscountPence > 0;
    const showSubtotal = hasDeals || hasMember || hasReward;
    return (
      <View style={styles.cartTotal}>
        {showSubtotal ? (
          <View style={styles.cartTotalRow}>
            <Text style={styles.cartTotalLabel}>Subtotal</Text>
            <Text style={[styles.cartTotalPrice, { color: Colors.light.textSecondary, fontSize: 15, fontWeight: "500" as const }]}>{formatPrice(totalPrice)}</Text>
          </View>
        ) : null}
        {hasDeals ? (
          <View style={[styles.cartTotalRow, styles.discountRow]}>
            <View style={{ flexDirection: "row" as const, alignItems: "center" as const, gap: 6 }}>
              <Ionicons name="pricetag-outline" size={14} color="#166534" />
              <Text style={styles.discountLabel}>Square offers</Text>
            </View>
            <Text style={styles.discountAmount}>−{formatPrice(dealsAmountPence)}</Text>
          </View>
        ) : null}
        {hasMember ? (
          <View style={[styles.cartTotalRow, styles.discountRow]}>
            <View style={{ flexDirection: "row" as const, alignItems: "center" as const, gap: 6 }}>
              <Ionicons name="diamond-outline" size={14} color="#166534" />
              <Text style={styles.discountLabel}>{discountLabel}</Text>
            </View>
            <Text style={styles.discountAmount}>−{formatPrice(discountAmountPence)}</Text>
          </View>
        ) : null}
        {hasReward ? (
          <View style={[styles.cartTotalRow, styles.discountRow]}>
            <View style={{ flexDirection: "row" as const, alignItems: "center" as const, gap: 6 }}>
              <Ionicons name="gift-outline" size={14} color="#166534" />
              <Text style={styles.discountLabel}>{selectedRewardTier?.name ?? "Loyalty reward"}</Text>
            </View>
            <Text style={styles.discountAmount}>−{formatPrice(rewardDiscountPence)}</Text>
          </View>
        ) : null}
        <View style={styles.cartTotalRow}>
          <Text style={styles.cartTotalLabel}>Total</Text>
          <Text style={styles.cartTotalPrice}>{formatPrice(showSubtotal ? finalPriceAfterReward : totalPrice)}</Text>
        </View>
        <View style={styles.discountNoteRow}>
          <Ionicons name="information-circle-outline" size={13} color={Colors.light.textSecondary} />
          <Text style={styles.discountNoteText}>
            {customer
              ? "Any member discount is applied automatically at checkout."
              : "Sign in before checkout to receive your member discount."}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <>
    <Modal
      // iOS refuses to stack a full-screen modal on top of a pageSheet, so
      // we hide the cart while the payment sheet is presenting and restore
      // it again on close. Without this on iOS, tapping Place Order does nothing.
      // On Android both modals are full-screen and can be layered safely — hiding
      // the cart first creates a race where the payment sheet never appears.
      visible={Platform.OS === "ios" ? (visible && !paymentSheetVisible && !tableModalVisible) : visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={[styles.sheetContainer, { paddingBottom: insets.bottom + 16 }]}>
          {/* Header */}
          <View style={styles.sheetHeader}>
            {step === "customer" ? (
              <Pressable onPress={() => setStep("cart")} hitSlop={12} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
                <Ionicons name="chevron-back" size={26} color={Colors.light.text} />
              </Pressable>
            ) : (
              <View style={{ width: 26 }} />
            )}
            <Text style={styles.sheetTitle}>{step === "cart" ? "Your Order" : "Checkout"}</Text>
            <Pressable onPress={handleClose} hitSlop={12} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
              <Ionicons name="close" size={24} color={Colors.light.text} />
            </Pressable>
          </View>

          {items.length === 0 ? (
            <View style={styles.emptyCart}>
              <Ionicons name="cart-outline" size={48} color={Colors.light.textSecondary} />
              <Text style={styles.emptyCartText}>Your cart is empty</Text>
            </View>
          ) : step === "cart" ? (
            /* ── Step 1: Cart ── */
            <>
              <FlatList
                data={items}
                keyExtractor={(i) => i.cartKey}
                style={styles.cartList}
                contentContainerStyle={{ paddingBottom: 8 }}
                ListHeaderComponent={hasUnavailableItems ? (
                  <View style={styles.unavailableNotice} testID="cart-unavailable-notice">
                    <Ionicons name="alert-circle" size={20} color="#B91C1C" />
                    <View style={styles.unavailableNoticeCopy}>
                      <Text style={styles.unavailableNoticeTitle}>
                        {unavailableItemNames.length === 1
                          ? `${unavailableItemNames[0]} has just sold out`
                          : `${unavailableItemNames.join(", ")} have just sold out`}
                      </Text>
                      <Text style={styles.unavailableNoticeText}>
                        Remove {unavailableItemNames.length === 1 ? "it" : "them"} before continuing.
                      </Text>
                    </View>
                  </View>
                ) : null}
                renderItem={({ item }) => {
                  const linePrice = (item.price + (item.modifiers?.reduce((s, m) => s + m.price, 0) ?? 0)) * item.quantity;
                  return (
                    <View style={[styles.cartItem, item.unavailable && styles.cartItemUnavailable]}>
                      <View style={styles.cartItemInfo}>
                        <Text style={styles.cartItemName}>{item.name}</Text>
                        {item.unavailable ? (
                          <Text style={styles.cartItemUnavailableLabel}>Sold out</Text>
                        ) : null}
                        {item.modifiers && item.modifiers.length > 0 && (
                          <Text style={styles.cartItemMods} numberOfLines={2}>
                            {item.modifiers.map((m) => m.name).join(", ")}
                          </Text>
                        )}
                        <Text style={styles.cartItemPrice}>{formatPrice(linePrice)}</Text>
                      </View>
                      {item.unavailable ? (
                        <Pressable
                          onPress={() => removeItem(item.cartKey)}
                          accessibilityRole="button"
                          accessibilityLabel={`Remove sold out item ${item.name}`}
                          style={({ pressed }) => [
                            styles.removeUnavailableBtn,
                            { opacity: pressed ? 0.7 : 1 },
                          ]}
                          testID={`remove-unavailable-${item.cartKey}`}
                        >
                          <Ionicons name="trash-outline" size={15} color="#B91C1C" />
                          <Text style={styles.removeUnavailableBtnText}>Remove</Text>
                        </Pressable>
                      ) : (
                      <View style={styles.qtyRow}>
                        <Pressable
                          onPress={() => updateQuantity(item.cartKey, -1)}
                          style={({ pressed }) => [styles.qtyBtn, { opacity: pressed ? 0.7 : 1 }]}
                        >
                          <Ionicons name="remove" size={16} color={Colors.brand.blue} />
                        </Pressable>
                        <Text style={styles.qtyText}>{item.quantity}</Text>
                        <Pressable
                          onPress={() => updateQuantity(item.cartKey, 1)}
                          style={({ pressed }) => [styles.qtyBtn, { opacity: pressed ? 0.7 : 1 }]}
                        >
                          <Ionicons name="add" size={16} color={Colors.brand.blue} />
                        </Pressable>
                      </View>
                      )}
                    </View>
                  );
                }}
                ItemSeparatorComponent={() => <View style={styles.cartDivider} />}
              />

              {/* ── Loyalty Reward Picker ── */}
              {issuedRewards.length > 0 && (
                <View style={styles.rewardPickerSection}>
                  <View style={styles.rewardPickerHeader}>
                    <Ionicons name="gift-outline" size={16} color={Colors.brand.blue} />
                    <Text style={styles.rewardPickerTitle}>Redeem a reward</Text>
                  </View>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.rewardPickerRow}
                  >
                    {issuedRewards.map((reward) => {
                      const tier = loyaltyData?.program?.reward_tiers?.find(
                        (t) => t.id === reward.reward_tier_id
                      );
                      const isSelected = selectedRewardId === reward.id;
                      const def = tier?.definition;
                      const label = tier?.name ?? "Reward";
                      let valueLabel = "";
                      if (def?.discount_type === "FIXED_PERCENTAGE" && def.percentage_discount) {
                        valueLabel = `${def.percentage_discount}% off`;
                      } else if (def?.discount_type === "FIXED_AMOUNT" && def.fixed_discount_money) {
                        valueLabel = formatPrice(def.fixed_discount_money.amount);
                      }
                      return (
                        <Pressable
                          key={reward.id}
                          onPress={() =>
                            setSelectedRewardId(isSelected ? null : reward.id)
                          }
                          style={[
                            styles.rewardPill,
                            isSelected && styles.rewardPillSelected,
                          ]}
                        >
                          <Ionicons
                            name={isSelected ? "gift" : "gift-outline"}
                            size={14}
                            color={isSelected ? "#fff" : Colors.brand.blue}
                          />
                          <View style={{ marginLeft: 6 }}>
                            <Text
                              style={[
                                styles.rewardPillLabel,
                                isSelected && styles.rewardPillLabelSelected,
                              ]}
                            >
                              {label}
                            </Text>
                            {valueLabel ? (
                              <Text
                                style={[
                                  styles.rewardPillValue,
                                  isSelected && styles.rewardPillValueSelected,
                                ]}
                              >
                                {valueLabel}
                              </Text>
                            ) : null}
                          </View>
                          {isSelected && (
                            <Ionicons
                              name="checkmark-circle"
                              size={16}
                              color="#fff"
                              style={{ marginLeft: 6 }}
                            />
                          )}
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                  {selectedRewardId && (
                    <Text style={styles.rewardPickerNote}>
                      Reward will be applied and redeemed when you pay.
                    </Text>
                  )}
                </View>
              )}

              {/* ── Table / Collect buttons ── */}
              <Text style={styles.tableSelectorTitle}>
                Select your table or collect from the bar
              </Text>
              <View style={styles.tableSelectorRow}>
                <Pressable
                  style={({ pressed }) => [
                    styles.tableBtn,
                    tableNote ? styles.tableBtnActive : styles.tableBtnInactive,
                    { opacity: pressed ? 0.82 : 1 },
                  ]}
                  onPress={() => { setTableSearch(""); setTableModalVisible(true); }}
                  testID="table-selector-btn"
                >
                  <Ionicons name="grid-outline" size={16} color="#fff" />
                  <Text style={styles.tableBtnText} numberOfLines={1}>
                    {tableNote || "Select a table"}
                  </Text>
                  {tableNote ? (
                    <Pressable onPress={() => setTableNote("")} hitSlop={10}>
                      <Ionicons name="close-circle" size={17} color="rgba(255,255,255,0.8)" />
                    </Pressable>
                  ) : null}
                </Pressable>

                <Pressable
                  style={({ pressed }) => [
                    styles.tableBtn,
                    !tableNote ? styles.tableBtnActive : styles.tableBtnInactive,
                    { opacity: pressed ? 0.82 : 1 },
                  ]}
                  onPress={() => setTableNote("")}
                  testID="collect-bar-btn"
                >
                  <Ionicons name="storefront-outline" size={16} color="#fff" />
                  <Text style={styles.tableBtnText}>Collect from bar</Text>
                </Pressable>
              </View>

              <TotalSummary />

              {cancelledNotice ? (
                <View style={styles.cancelledBanner}>
                  <Ionicons name="information-circle" size={18} color="#0047AB" />
                  <Text style={styles.cancelledBannerText}>{cancelledNotice}</Text>
                </View>
              ) : null}

              <Pressable
                onPress={() => setStep("customer")}
                disabled={hasUnavailableItems}
                style={({ pressed }) => [
                  styles.checkoutBtn,
                  { opacity: hasUnavailableItems ? 0.45 : pressed ? 0.8 : 1 },
                ]}
                testID="continue-btn"
              >
                <Text style={styles.checkoutBtnText}>
                  {hasUnavailableItems ? "Remove sold out items" : "Continue"}
                </Text>
                <Text style={styles.checkoutBtnSub}>{formatPrice(finalPriceAfterReward)}</Text>
              </Pressable>
            </>
          ) : (
            /* ── Step 2: Customer + Notes ── */
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingBottom: 8 }}
              keyboardShouldPersistTaps="handled"
            >
              {/* Customer section */}
              <View style={styles.coSection}>
                {customer ? (
                  /* Logged in */
                  <View style={styles.coCustomerCard}>
                    <View style={styles.coAvatar}>
                      <Text style={styles.coAvatarText}>
                        {customer.name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.coCustomerName}>{customer.name}</Text>
                      <Text style={styles.coCustomerEmail}>{customer.email}</Text>
                    </View>
                    <View style={styles.coVerifiedBadge}>
                      <Ionicons name="checkmark-circle" size={20} color="#16A34A" />
                    </View>
                  </View>
                ) : !guestMode ? (
                  /* Not logged in — show options */
                  <>
                    <Text style={styles.coSectionTitle}>How would you like to continue?</Text>
                    <Text style={styles.coSectionSub}>
                      Sign in to earn loyalty points and get your member discount automatically applied.
                    </Text>
                    <Pressable
                      style={({ pressed }) => [styles.coOptionBtn, styles.coOptionBtnPrimary, { opacity: pressed ? 0.85 : 1 }]}
                      onPress={() => {
                        handleClose();
                        router.push({
                          pathname: "/account",
                          params: { returnTo: "order", authMode: "login" },
                        });
                      }}
                    >
                      <Ionicons name="person-circle-outline" size={20} color="#fff" />
                      <Text style={styles.coOptionBtnTextPrimary}>Sign In to My Account</Text>
                    </Pressable>
                    <Pressable
                      style={({ pressed }) => [styles.coOptionBtn, styles.coOptionBtnSecondary, { opacity: pressed ? 0.85 : 1 }]}
                      onPress={() => {
                        handleClose();
                        router.push({
                          pathname: "/account",
                          params: { returnTo: "order", authMode: "register" },
                        });
                      }}
                    >
                      <Ionicons name="person-add-outline" size={20} color={Colors.brand.blue} />
                      <Text style={styles.coOptionBtnTextSecondary}>Create an Account</Text>
                    </Pressable>
                    <Pressable
                      style={({ pressed }) => [styles.coOptionBtn, styles.coOptionBtnGhost, { opacity: pressed ? 0.85 : 1 }]}
                      onPress={() => setGuestMode(true)}
                    >
                      <Ionicons name="arrow-forward-outline" size={20} color={Colors.light.textSecondary} />
                      <Text style={styles.coOptionBtnTextGhost}>Continue as Guest</Text>
                    </Pressable>
                  </>
                ) : (
                  /* Guest mode */
                  <>
                    <Text style={styles.coSectionTitle}>Your details (optional)</Text>
                    <Text style={styles.coSectionSub}>
                      Add your name or email if you'd like to be identifiable on your order.
                    </Text>
                    <View style={styles.coInputGroup}>
                      <Ionicons name="person-outline" size={16} color={Colors.light.textSecondary} style={styles.coInputIcon} />
                      <TextInput
                        style={styles.coInput}
                        placeholder="Name"
                        placeholderTextColor={Colors.light.textSecondary}
                        value={guestName}
                        onChangeText={setGuestName}
                        autoCapitalize="words"
                        returnKeyType="next"
                      />
                    </View>
                    <View style={styles.coInputGroup}>
                      <Ionicons name="mail-outline" size={16} color={Colors.light.textSecondary} style={styles.coInputIcon} />
                      <TextInput
                        style={styles.coInput}
                        placeholder="Email (optional)"
                        placeholderTextColor={Colors.light.textSecondary}
                        value={guestEmail}
                        onChangeText={setGuestEmail}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        returnKeyType="done"
                      />
                    </View>
                    <Pressable onPress={() => setGuestMode(false)} hitSlop={8}>
                      <Text style={styles.coBackLink}>← Back to options</Text>
                    </Pressable>
                  </>
                )}
              </View>

              {/* Order notes */}
              <View style={[styles.coSection, { marginTop: 12 }]}>
                <View style={styles.coNotesHeader}>
                  <Ionicons name="create-outline" size={16} color={Colors.light.textSecondary} />
                  <Text style={styles.coNotesLabel}>Order notes</Text>
                </View>
                <TextInput
                  style={styles.coNotesInput}
                  placeholder="Allergies, dietary requirements, special requests…"
                  placeholderTextColor={Colors.light.textSecondary}
                  value={orderNote}
                  onChangeText={setOrderNote}
                  multiline
                  numberOfLines={3}
                  maxLength={200}
                  returnKeyType="done"
                />
                <Text style={styles.coNotesCount}>{orderNote.length}/200</Text>
              </View>

              {/* Loyalty reward picker — shown in checkout step too so customers
                  can claim a reward without having to scroll past the table
                  picker back in the cart step. Selecting/deselecting here
                  updates the same selectedRewardId state, so TotalSummary
                  and the server checkout call both reflect the choice. */}
              {issuedRewards.length > 0 && (
                <View style={styles.rewardPickerSection}>
                  <View style={styles.rewardPickerHeader}>
                    <Ionicons name="gift-outline" size={16} color={Colors.brand.blue} />
                    <Text style={styles.rewardPickerTitle}>Redeem a reward</Text>
                  </View>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.rewardPickerRow}
                  >
                    {issuedRewards.map((reward) => {
                      const tier = loyaltyData?.program?.reward_tiers?.find(
                        (t) => t.id === reward.reward_tier_id
                      );
                      const isSelected = selectedRewardId === reward.id;
                      const def = tier?.definition;
                      const label = tier?.name ?? "Reward";
                      let valueLabel = "";
                      if (def?.discount_type === "FIXED_PERCENTAGE" && def.percentage_discount) {
                        valueLabel = `${def.percentage_discount}% off`;
                      } else if (def?.discount_type === "FIXED_AMOUNT" && def.fixed_discount_money) {
                        valueLabel = formatPrice(def.fixed_discount_money.amount);
                      }
                      return (
                        <Pressable
                          key={reward.id}
                          onPress={() =>
                            setSelectedRewardId(isSelected ? null : reward.id)
                          }
                          style={[
                            styles.rewardPill,
                            isSelected && styles.rewardPillSelected,
                          ]}
                        >
                          <Ionicons
                            name={isSelected ? "gift" : "gift-outline"}
                            size={14}
                            color={isSelected ? "#fff" : Colors.brand.blue}
                          />
                          <View style={{ marginLeft: 6 }}>
                            <Text
                              style={[
                                styles.rewardPillLabel,
                                isSelected && styles.rewardPillLabelSelected,
                              ]}
                            >
                              {label}
                            </Text>
                            {valueLabel ? (
                              <Text
                                style={[
                                  styles.rewardPillValue,
                                  isSelected && styles.rewardPillValueSelected,
                                ]}
                              >
                                {valueLabel}
                              </Text>
                            ) : null}
                          </View>
                          {isSelected && (
                            <Ionicons
                              name="checkmark-circle"
                              size={16}
                              color="#fff"
                              style={{ marginLeft: 6 }}
                            />
                          )}
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                  {selectedRewardId && (
                    <Text style={styles.rewardPickerNote}>
                      Reward will be applied and redeemed when you pay.
                    </Text>
                  )}
                </View>
              )}

              {/* Compact order summary */}
              <TotalSummary />

              {/* FEATURE_SAVED_CARDS: one-tap "Pay with •••• 4242" button
                  shown when the customer has a card on file. Tapping it
                  creates the order and immediately charges the saved card —
                  no payment sheet appears. The "Use a different card" link
                  below falls back to the standard sheet flow. */}
              {flags.savedCards && customer && savedCard ? (
                <View style={{ paddingHorizontal: 16 }}>
                  <Pressable
                    onPress={handlePayWithSavedCard}
                    disabled={loading || paying}
                    style={({ pressed }) => [styles.checkoutBtn, { opacity: pressed || loading || paying ? 0.8 : 1 }]}
                    testID="checkout-saved-card-btn"
                  >
                    {(loading || paying) ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <>
                        <Text style={styles.checkoutBtnText}>Pay with {savedCard.brand} •••• {savedCard.last4}</Text>
                        <Text style={styles.checkoutBtnSub}>One-tap reorder</Text>
                      </>
                    )}
                  </Pressable>
                  <Pressable
                    onPress={handleCheckout}
                    disabled={loading || paying}
                    hitSlop={8}
                    style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, marginTop: 12, alignItems: "center" })}
                  >
                    <Text style={styles.useNewCardLink}>Use a different card →</Text>
                  </Pressable>
                </View>
              ) : (
                /* Place order button */
                <Pressable
                  onPress={handleCheckout}
                  disabled={loading}
                  style={({ pressed }) => [styles.checkoutBtn, { opacity: pressed || loading ? 0.8 : 1, marginHorizontal: 16 }]}
                  testID="checkout-btn"
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <Text style={styles.checkoutBtnText}>Place Order</Text>
                      <Text style={styles.checkoutBtnSub}>Apple Pay · Google Pay · Card</Text>
                    </>
                  )}
                </Pressable>
              )}
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
    {/* ── Table search modal ── */}
    <Modal
      visible={tableModalVisible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => setTableModalVisible(false)}
    >
      <View style={styles.tableModalContainer}>
        {/* Header */}
        <View style={styles.tableModalHeader}>
          <Text style={styles.tableModalTitle}>Select your table</Text>
          <Pressable onPress={() => setTableModalVisible(false)} hitSlop={12}>
            <Ionicons name="close" size={24} color={Colors.light.text} />
          </Pressable>
        </View>

        {/* Search */}
        <View style={styles.tableModalSearchRow}>
          <Ionicons name="search-outline" size={16} color={Colors.light.textSecondary} />
          <TextInput
            style={styles.tableModalSearchInput}
            placeholder="Search tables…"
            placeholderTextColor={Colors.light.textSecondary}
            value={tableSearch}
            onChangeText={setTableSearch}
            autoCapitalize="none"
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
        </View>

        {/* Options list */}
        <FlatList
          data={(() => {
            const q = tableSearch.trim().toLowerCase();
            if (!q) return ALL_TABLES;
            return ALL_TABLES.filter(
              (t) =>
                t.value.toLowerCase().includes(q) ||
                t.section.toLowerCase().includes(q) ||
                t.display.toLowerCase().includes(q)
            );
          })()}
          keyExtractor={(t) => t.value}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 32 }}
          ListHeaderComponent={
            tableSearch.trim() === "" ? (
              <Pressable
                style={[styles.tableModalRow, !tableNote && styles.tableModalRowSelected]}
                onPress={() => { setTableNote(""); setTableModalVisible(false); }}
                testID="collect-from-bar-btn"
              >
                <View style={[styles.tableModalDot, { backgroundColor: "#6B7280" }]} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.tableModalRowText, !tableNote && styles.tableModalRowTextSelected]}>
                    Collect from the bar
                  </Text>
                  <Text style={styles.tableModalRowSub}>We'll give you a collection number</Text>
                </View>
                {!tableNote && <Ionicons name="checkmark-circle" size={20} color={Colors.brand.blue} />}
              </Pressable>
            ) : null
          }
          renderItem={({ item }) => {
            const selected = tableNote === item.value;
            return (
              <Pressable
                style={[styles.tableModalRow, selected && styles.tableModalRowSelected]}
                onPress={() => { setTableNote(item.value); setTableModalVisible(false); }}
              >
                <View style={[styles.tableModalDot, { backgroundColor: item.color }]} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.tableModalRowText, selected && styles.tableModalRowTextSelected]}>
                    {item.value}
                  </Text>
                  <Text style={styles.tableModalRowSub}>{item.section}</Text>
                </View>
                {selected && <Ionicons name="checkmark-circle" size={20} color={Colors.brand.blue} />}
              </Pressable>
            );
          }}
          ItemSeparatorComponent={() => <View style={styles.tableModalDivider} />}
        />
      </View>
    </Modal>

    {/* Only mount when there's an active pending order — prevents the WebView
        from initialising in the background with amountPence=0 (before any
        order exists), which caused Square's SDK to fire a fatal immediately
        and show the "Payment Screen Issue" alert before the user had done
        anything. The component is unmounted entirely when not in use so
        each payment attempt gets a fresh WebView with the correct amount. */}
    {pendingOrder !== null && (
      <SquarePaymentSheet
        key={paySheetKey}
        visible={paymentSheetVisible}
        onClose={handleClosePaymentSheet}
        onTokenized={handleTokenized}
        onUnavailable={handleSheetUnavailable}
        applicationId={squareConfig?.applicationId ?? null}
        locationId={squareConfig?.locationId ?? null}
        environment={squareConfig?.environment ?? "sandbox"}
        amountPence={pendingOrder.amountPence}
        buyerEmail={customer?.email || guestEmail.trim() || null}
        inProgress={paying}
        errorMessage={payError}
        googlePayAvailable={screenCanUseGooglePay}
        googlePayRequestNonce={screenGooglePayRequestNonce}
        // FEATURE_SAVED_CARDS: opt-in checkbox is only shown when (a) the flag
        // is on, (b) the buyer is signed in, AND (c) they don't already have
        // a saved card. CHARGE_AND_STORE intent triggers a 3DS challenge if
        // the customer ticks the box; otherwise it behaves identically to
        // CHARGE so latency / SCA UX is unaffected for non-opt-in users.
        intent={flags.savedCards && customer && !savedCard ? "CHARGE_AND_STORE" : "CHARGE"}
        showSaveCard={!!(flags.savedCards && customer && !savedCard)}
      />
    )}
    </>
  );
}

export default function OrderScreen() {
  const colors = useColors();
  const Colors = { ...baseColors, light: colors };
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0;
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const params = useLocalSearchParams<{ hlCatId?: string; hlItemId?: string; hlItemName?: string; openCheckout?: string; checkoutStep?: string; prefillEmail?: string }>();

  const { isKioskMode } = useKiosk();
  // Bump the menu's max content width to 1100pt on iPad so the multi-
  // column item grid + multi-column category grid have room to breathe.
  // Phone is unaffected (tabletPad returns 0 below 700pt smallest dim).
  const { tabletPad, isTablet, isLandscape } = useResponsive(1100);
  // Items FlatList columns: 1 on phone, 2 on iPad portrait, 3 on landscape.
  const itemCols = isTablet ? (isLandscape ? 3 : 2) : 1;
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(null);
  const [cartVisible, setCartVisible] = useState(false);
  const [pendingCheckoutStep, setPendingCheckoutStep] = useState<"cart" | "customer" | undefined>();
  const [pendingPrefillEmail, setPendingPrefillEmail] = useState<string | undefined>();

  // Re-open the cart sheet at the customer step after the user signs in
  // from the member-discount prompt (deep-linked back from /account).
  useEffect(() => {
    if (params.openCheckout === "1") {
      setPendingCheckoutStep((params.checkoutStep as "cart" | "customer") || "customer");
      setPendingPrefillEmail(typeof params.prefillEmail === "string" ? params.prefillEmail : undefined);
      setCartVisible(true);
      router.setParams({ openCheckout: undefined, checkoutStep: undefined, prefillEmail: undefined });
    }
  }, [params.openCheckout, params.checkoutStep, params.prefillEmail]);
  const [variationGroup, setVariationGroup] = useState<MenuProductGroup | null>(null);
  const [modifierItem, setModifierItem] = useState<MenuItem | null>(null);
  const [highlightItemId, setHighlightItemId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  // FEATURE_DIETARY_FILTERS: which tag codes the customer has toggled on.
  // Local state only for the test-version — when the flag promotes to a
  // long-lived feature we'll persist this via PATCH /api/customers/me/dietary-filters.
  const [dietaryFilters, setDietaryFilters] = useState<Set<DietaryTagCode>>(new Set());
  const { totalItems, totalPrice, addItem, syncUnavailableVariations } = useCart();
  const { flags: featureFlags } = useFeatureFlags();
  const categoryScrollRef = useRef<ScrollView>(null);
  const searchRef = useRef<TextInput>(null);

  const { data: categories, isLoading, isError, refetch } = useQuery<MenuCategory[]>({
    queryKey: ["/api/menu"],
    // Staff can hide or sell-out items at any time. The old five-minute
    // stale window meant customers could keep seeing unavailable products
    // long after the staff change had saved. Refresh on the same cadence as
    // ordering status, and always check again when the Order tab mounts or
    // the app returns to the foreground.
    staleTime: 0,
    refetchInterval: 15 * 1000,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
  });

  useEffect(() => {
    if (!categories) return;
    const soldOutVariationIds = new Set<string>();
    const collectSoldOutVariations = (menuCategories: MenuCategory[]) => {
      for (const category of menuCategories) {
        for (const item of category.items) {
          if (item.soldOut) soldOutVariationIds.add(item.variationId);
        }
        if (category.subcategories?.length) {
          collectSoldOutVariations(category.subcategories);
        }
      }
    };
    collectSoldOutVariations(categories);
    syncUnavailableVariations(soldOutVariationIds);
  }, [categories, syncUnavailableVariations]);

  const { data: banners } = useQuery<BannerImage[]>({
    queryKey: ["/api/banner-images?page=order"],
    staleTime: 10 * 60 * 1000,
  });

  const queryClient = useQueryClient();
  const { data: orderingStatus } = useQuery<{ enabled: boolean; kitchenOpen?: boolean; barOpen?: boolean; reason?: string; kitchenReason?: string; barReason?: string; nextOpen?: string; barNextOpen?: string; closesAt?: string; barClosesAt?: string }>({
    queryKey: ["/api/ordering-status"],
    staleTime: 5 * 1000,
    refetchInterval: 15 * 1000,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
  });

  const orderingEnabled = orderingStatus?.enabled !== false;
  // `kitchenOpen` is missing on legacy clients/responses → treat undefined
  // as open so we never hide food in error. Only when explicitly false do
  // we grey out kitchen items + show the "drinks only" banner.
  const kitchenOpen = orderingStatus?.kitchenOpen !== false;
  // Same defensive default for `barOpen` — undefined on legacy responses
  // means we don't grey drinks out unless the server explicitly says so.
  const barOpen = orderingStatus?.barOpen !== false;

  const activeBanners = useMemo(
    () => (banners ?? []).filter((b) => b.active),
    [banners]
  );

  const activeTopCategory = useMemo(() => {
    if (!categories || categories.length === 0) return null;
    if (selectedCategory && categories.find((c) => c.id === selectedCategory)) {
      return categories.find((c) => c.id === selectedCategory) ?? null;
    }
    return null;
  }, [categories, selectedCategory]);

  const activeSubcategory = useMemo(() => {
    if (!activeTopCategory || !selectedSubcategory) return null;
    return activeTopCategory.subcategories?.find((c) => c.id === selectedSubcategory) ?? null;
  }, [activeTopCategory, selectedSubcategory]);

  // The category whose ITEMS are being viewed (or whose subcategory grid is being viewed)
  const activeCategoryData = activeSubcategory ?? activeTopCategory;
  const activeCategory = activeCategoryData?.id ?? null;
  // True when we are showing a sub-category grid (parent has children, no leaf selected)
  const showingSubcategoryGrid = !!activeTopCategory && !activeSubcategory && (activeTopCategory.subcategories?.length ?? 0) > 0;

  const activeItems = useMemo(() => {
    const base = showingSubcategoryGrid ? [] : (activeCategoryData?.items ?? []);
    const groups = groupMenuItems(base);
    // FEATURE_DIETARY_FILTERS: when chips are active, hide items that don't
    // include EVERY selected tag. We intentionally don't hide untagged items
    // when no chips are selected — that would empty the menu for venues
    // that haven't tagged anything yet.
    if (!featureFlags.dietaryFilters || dietaryFilters.size === 0) return groups;
    return groups.filter((group) => menuGroupMatchesDietaryFilters(group, dietaryFilters));
  }, [activeCategoryData, showingSubcategoryGrid, featureFlags.dietaryFilters, dietaryFilters]);

  const toggleDietaryFilter = useCallback((code: DietaryTagCode) => {
    setDietaryFilters(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });
  }, []);

  const headerHeight = (insets.top) + 56 + (Platform.OS === "web" ? webTopInset : 0);
  const searchBarHeight = 52;
  const categoryPageHeaderHeight = headerHeight + searchBarHeight;
  const categoryBarHeight = 52;
  const cartBarHeight = totalItems > 0 ? 72 : 0;

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q || !categories) return [];
    const results: Array<{ group: MenuProductGroup; categoryName: string }> = [];
    const walk = (cat: MenuCategory, prefix?: string) => {
      const label = prefix ? `${prefix} › ${cat.name}` : cat.name;
      for (const group of groupMenuItems(cat.items)) {
        if (menuGroupMatchesQuery(group, q)) results.push({ group, categoryName: label });
      }
      for (const sub of cat.subcategories ?? []) {
        walk(sub, cat.name);
      }
    };
    for (const cat of categories) walk(cat);
    return results;
  }, [searchQuery, categories]);

  const addVariationToOrder = useCallback((item: MenuItem) => {
    if (item.modifiers?.length) {
      setModifierItem(item);
      return;
    }
    addItem(buildOrderCartPayload(item));
  }, [addItem]);

  const handleSelectProduct = useCallback((group: MenuProductGroup) => {
    if (group.variations.length > 1) {
      setVariationGroup(group);
      return;
    }
    addVariationToOrder(group.variations[0]);
  }, [addVariationToOrder]);

  const handleVariationSelect = useCallback((item: MenuItem) => {
    setVariationGroup(null);
    if (item.modifiers?.length) {
      setTimeout(() => setModifierItem(item), 250);
      return;
    }
    addVariationToOrder(item);
  }, [addVariationToOrder]);

  const handleModifierConfirm = useCallback((modifiers: SelectedModifier[]) => {
    if (!modifierItem) return;
    addItem(buildOrderCartPayload(modifierItem, modifiers));
    setModifierItem(null);
  }, [modifierItem, addItem]);

  // Recover a confirmation screen for a paid order we created on this device
  // but never showed (e.g. app was backgrounded mid-payment, or the webhook
  // completed the order before the in-app response returned). Runs on Order
  // tab focus AND when the app returns from the background — the tab can
  // stay mounted across foreground cycles, so a mount-only check would miss
  // the most common "user backgrounded then came back" case.
  const recoveringRef = useRef(false);
  const recoverPendingConfirmation = useCallback(async () => {
    if (recoveringRef.current) return;
    recoveringRef.current = true;
    try {
      const pending = await getPendingConfirmation();
      if (!pending) return;
      const url = new URL(`/api/orders/${pending.appOrderId}/confirmation`, getApiUrl());
      url.searchParams.set("token", pending.token);
      const res = await fetch(url.toString());
      if (!res.ok) {
        // 404 = not paid yet (or too old) — leave the marker alone so
        // we'll try again on the next focus/foreground.
        return;
      }
      const data = await res.json();
      router.push({
        pathname: "/order-confirmation",
        params: {
          appOrderId: String(data.appOrderId),
          tableNote: data.tableNote ?? "",
          totalPence: String(data.totalPence ?? 0),
          items: JSON.stringify(data.items ?? []),
          token: pending.token,
        },
      });
      // Clear after navigation. The confirmation screen also clears the
      // marker on mount (belt-and-braces) so it never re-prompts.
      await clearPendingConfirmation(pending.appOrderId);
    } catch {
      // Network error — try again next time.
    } finally {
      recoveringRef.current = false;
    }
  }, []);

  // Fire on every Order-tab focus (covers initial mount + tab switches).
  useFocusEffect(
    useCallback(() => {
      void recoverPendingConfirmation();
    }, [recoverPendingConfirmation])
  );

  // Fire when the app returns from the background while the tab is mounted.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
      if (next === "active") void recoverPendingConfirmation();
    });
    return () => sub.remove();
  }, [recoverPendingConfirmation]);

  useEffect(() => {
    if (params.hlCatId && params.hlItemId && categories && categories.length > 0) {
      const catExists = categories.find((c) => c.id === params.hlCatId);
      if (catExists) {
        setSelectedCategory(params.hlCatId);
        setHighlightItemId(params.hlItemId ?? null);
      }
    }
  }, [params.hlCatId, params.hlItemId, categories]);

  const renderItem = useCallback(({ item }: { item: MenuProductGroup }) => (
    // On iPad we render in a multi-column grid, so each cell needs flex:1
    // to share the row width evenly. On phone (itemCols===1) the wrapper
    // is a no-op and the card renders full-width as before.
    <View style={itemCols > 1 ? { flex: 1 / itemCols } : undefined}>
      <ItemCard group={item} onSelectProduct={handleSelectProduct} highlighted={item.id === highlightItemId} showDietaryTags={featureFlags.dietaryFilters} kitchenClosed={!kitchenOpen && !!activeCategoryData?.isKitchen} barClosed={!barOpen && !activeCategoryData?.isKitchen} />
    </View>
  ), [handleSelectProduct, highlightItemId, featureFlags.dietaryFilters, kitchenOpen, barOpen, activeCategoryData?.isKitchen, itemCols]);

  const handleSelectCategory = useCallback((id: string) => {
    setSelectedCategory(id);
    setSelectedSubcategory(null);
  }, []);

  const handleSelectSubcategory = useCallback((id: string) => {
    setSelectedSubcategory(id);
  }, []);

  const handleBack = useCallback(() => {
    if (selectedSubcategory) {
      setSelectedSubcategory(null);
    } else {
      setSelectedCategory(null);
    }
  }, [selectedSubcategory]);

  const CartButton = () => (
    <Pressable
      onPress={() => setCartVisible(true)}
      style={({ pressed }) => [styles.cartIconBtn, { opacity: pressed ? 0.7 : 1 }]}
      testID="cart-icon"
    >
      <Ionicons name="cart-outline" size={24} color="#fff" />
      {totalItems > 0 && (
        <View style={styles.cartBadge}>
          <Text style={styles.cartBadgeText}>{totalItems > 99 ? "99+" : totalItems}</Text>
        </View>
      )}
    </Pressable>
  );

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: (insets.top) + webTopInset }]}>
          {Platform.OS === "ios" && <BlurView intensity={65} tint={colors.scheme} style={StyleSheet.absoluteFill} />}
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.headerTitle}>Order</Text>
              <Text style={styles.headerSubtitle}>Food & Drink</Text>
            </View>
          </View>
        </View>
        <View style={[styles.centred, { marginTop: headerHeight }]}>
          <ActivityIndicator size="large" color={Colors.brand.blue} />
          <Text style={styles.loadingText}>Loading menu…</Text>
        </View>
      </View>
    );
  }

  if (isError || !categories) {
    return (
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: (insets.top) + webTopInset }]}>
          {Platform.OS === "ios" && <BlurView intensity={65} tint={colors.scheme} style={StyleSheet.absoluteFill} />}
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.headerTitle}>Order</Text>
              <Text style={styles.headerSubtitle}>Food & Drink</Text>
            </View>
          </View>
        </View>
        <View style={[styles.centred, { marginTop: headerHeight }]}>
          <Ionicons name="cloud-offline-outline" size={48} color={Colors.light.textSecondary} />
          <Text style={styles.errorTitle}>Menu unavailable</Text>
          <Text style={styles.errorSub}>Please check your connection</Text>
          <Pressable onPress={() => refetch()} style={({ pressed }) => [styles.retryBtn, { opacity: pressed ? 0.8 : 1 }]}>
            <Text style={styles.retryBtnText}>Try Again</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (!activeCategory) {
    const isSearching = searchQuery.trim().length > 0;
    return (
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: (insets.top) + webTopInset }]}>
          {Platform.OS === "ios" && <BlurView intensity={65} tint={colors.scheme} style={StyleSheet.absoluteFill} />}
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.headerTitle}>Order</Text>
              <Text style={styles.headerSubtitle}>Food & Drink</Text>
            </View>
            <CartButton />
          </View>
          <View style={styles.searchBar}>
            <Ionicons name="search-outline" size={16} color={Colors.light.textSecondary} style={{ marginRight: 8 }} />
            <TextInput
              ref={searchRef}
              style={styles.searchInput}
              placeholder="Search food & drinks…"
              placeholderTextColor={Colors.light.textSecondary}
              value={searchQuery}
              onChangeText={setSearchQuery}
              returnKeyType="search"
              clearButtonMode="while-editing"
              autoCorrect={false}
            />
            {searchQuery.length > 0 && (
              <Pressable onPress={() => setSearchQuery("")} hitSlop={8}>
                <Ionicons name="close-circle" size={16} color={Colors.light.textSecondary} />
              </Pressable>
            )}
          </View>
        </View>

        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingTop: categoryPageHeaderHeight, paddingBottom: tabBarHeight + cartBarHeight + 16, paddingHorizontal: tabletPad }}
          showsVerticalScrollIndicator={false}
        >
          {isSearching ? (
            <>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>
                  {searchResults.length > 0 ? `${searchResults.length} result${searchResults.length !== 1 ? "s" : ""} for "${searchQuery.trim()}"` : `No results for "${searchQuery.trim()}"`}
                </Text>
              </View>
              {searchResults.length === 0 ? (
                <View style={styles.searchEmpty}>
                  <Ionicons name="search-outline" size={40} color={Colors.light.textSecondary} />
                  <Text style={styles.searchEmptyText}>Try a different word</Text>
                </View>
              ) : (
                <View style={{ paddingHorizontal: 16, gap: 0 }}>
                  {searchResults.map(({ group, categoryName }) => (
                    <View key={`${categoryName}-${group.id}`}>
                      <View style={styles.searchCatLabel}>
                        <Text style={styles.searchCatLabelText}>{categoryName}</Text>
                      </View>
                      {(() => {
                        const cat = categories?.find(c => c.name === categoryName)
                          ?? categories?.find(c => c.subcategories?.some(s => s.name === categoryName));
                        const isKitchenCat = !!cat?.isKitchen;
                        return <ItemCard group={group} onSelectProduct={handleSelectProduct} showDietaryTags={featureFlags.dietaryFilters} kitchenClosed={!kitchenOpen && isKitchenCat} barClosed={!barOpen && !isKitchenCat} />;
                      })()}
                    </View>
                  ))}
                </View>
              )}
            </>
          ) : (
            <>
              {activeBanners.length > 0 && (
                <BannerCarousel banners={activeBanners} />
              )}

              {!orderingEnabled && (
                <View style={styles.orderingClosedBanner}>
                  <Ionicons name="time-outline" size={22} color="#92400e" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.orderingClosedTitle}>Ordering is currently closed</Text>
                    <Text style={styles.orderingClosedSub}>
                      {orderingStatus?.reason ?? "Please speak to a member of staff to place your order"}
                    </Text>
                    {orderingStatus?.nextOpen && (
                      <Text style={[styles.orderingClosedSub, { marginTop: 4, fontWeight: "700" as const, color: "#78350f" }]}>
                        Next open: {orderingStatus.nextOpen}
                      </Text>
                    )}
                  </View>
                </View>
              )}

              {orderingEnabled && !kitchenOpen && barOpen && (
                <View style={styles.orderingClosedBanner}>
                  <Ionicons name="restaurant-outline" size={22} color="#92400e" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.orderingClosedTitle}>Kitchen closed — drinks only</Text>
                    <Text style={styles.orderingClosedSub}>
                      {orderingStatus?.kitchenReason ?? "The bar is still open — food items are unavailable until the kitchen reopens."}
                    </Text>
                    {orderingStatus?.nextOpen && (
                      <Text style={[styles.orderingClosedSub, { marginTop: 4, fontWeight: "700" as const, color: "#78350f" }]}>
                        Kitchen back: {orderingStatus.nextOpen}
                      </Text>
                    )}
                  </View>
                </View>
              )}

              {orderingEnabled && !barOpen && kitchenOpen && (
                <View style={styles.orderingClosedBanner}>
                  <Ionicons name="wine-outline" size={22} color="#92400e" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.orderingClosedTitle}>Bar closed — food only</Text>
                    <Text style={styles.orderingClosedSub}>
                      {orderingStatus?.barReason ?? "Drinks are unavailable right now."}
                    </Text>
                    {orderingStatus?.barNextOpen && (
                      <Text style={[styles.orderingClosedSub, { marginTop: 4, fontWeight: "700" as const, color: "#78350f" }]}>
                        Bar back: {orderingStatus.barNextOpen}
                      </Text>
                    )}
                  </View>
                </View>
              )}

              {orderingEnabled && !kitchenOpen && !barOpen && (
                <View style={styles.orderingClosedBanner}>
                  <Ionicons name="moon-outline" size={22} color="#92400e" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.orderingClosedTitle}>Closed for ordering</Text>
                    <Text style={styles.orderingClosedSub}>
                      {orderingStatus?.reason ?? "Both the kitchen and bar are closed right now."}
                    </Text>
                    {(orderingStatus?.barNextOpen || orderingStatus?.nextOpen) && (
                      <Text style={[styles.orderingClosedSub, { marginTop: 4, fontWeight: "700" as const, color: "#78350f" }]}>
                        Back: {orderingStatus?.barNextOpen ?? orderingStatus?.nextOpen}
                      </Text>
                    )}
                  </View>
                </View>
              )}

              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>What would you like?</Text>
              </View>

              {/* FEATURE_DIETARY_FILTERS: chip row of allergen / lifestyle
                  filters. Tapping a chip toggles it; "Clear" resets all.
                  Filtering is applied inside activeItems so only the menu
                  list reacts — the category grid stays visible. */}
              {featureFlags.dietaryFilters && (
                <View style={styles.dietaryChipBar}>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.dietaryChipScroll}
                  >
                    {DIETARY_TAGS.map(tag => {
                      const active = dietaryFilters.has(tag.code);
                      return (
                        <Pressable
                          key={tag.code}
                          onPress={() => {
                            if (Platform.OS !== "web") Haptics.selectionAsync();
                            toggleDietaryFilter(tag.code);
                          }}
                          style={({ pressed }) => [
                            styles.dietaryChip,
                            active && { backgroundColor: tag.colour, borderColor: tag.colour },
                            pressed && { opacity: 0.7 },
                          ]}
                          testID={`dietary-chip-${tag.code}`}
                        >
                          <Text style={[styles.dietaryChipText, active && styles.dietaryChipTextActive]}>
                            {tag.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                    {dietaryFilters.size > 0 && (
                      <Pressable
                        onPress={() => setDietaryFilters(new Set())}
                        style={({ pressed }) => [styles.dietaryClearChip, pressed && { opacity: 0.6 }]}
                        testID="dietary-chip-clear"
                      >
                        <Ionicons name="close" size={14} color={Colors.light.textSecondary} />
                        <Text style={styles.dietaryClearText}>Clear</Text>
                      </Pressable>
                    )}
                  </ScrollView>
                </View>
              )}

              <CategoryGrid categories={categories} onSelect={handleSelectCategory} />
            </>
          )}
        </ScrollView>

        {totalItems > 0 && (
          <Pressable
            onPress={() => setCartVisible(true)}
            style={({ pressed }) => [
              styles.cartBar,
              { bottom: tabBarHeight + 10, opacity: pressed ? 0.9 : 1 },
            ]}
            testID="cart-bar"
          >
            <View style={styles.cartBarLeft}>
              <View style={styles.cartBarBadge}>
                <Text style={styles.cartBarBadgeText}>{totalItems}</Text>
              </View>
              <Text style={styles.cartBarText}>View Order</Text>
            </View>
            <Text style={styles.cartBarPrice}>{formatPrice(totalPrice)}</Text>
          </Pressable>
        )}

        {isKioskMode ? (
          <KioskCheckoutSheet
            visible={cartVisible}
            onClose={() => setCartVisible(false)}
          />
        ) : (
          <CartSheet
            visible={cartVisible}
            onClose={() => setCartVisible(false)}
            initialStep={pendingCheckoutStep}
            initialGuestEmail={pendingPrefillEmail}
            onInitialConsumed={() => {
              setPendingCheckoutStep(undefined);
              setPendingPrefillEmail(undefined);
            }}
          />
        )}
        <ModifierModal
          item={modifierItem}
          visible={!!modifierItem}
          onClose={() => setModifierItem(null)}
          onConfirm={handleModifierConfirm}
        />
        <VariationModal
          group={variationGroup}
          visible={!!variationGroup}
          onClose={() => setVariationGroup(null)}
          onSelect={handleVariationSelect}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: (insets.top) + webTopInset }]}>
        {Platform.OS === "ios" && <BlurView intensity={65} tint={colors.scheme} style={StyleSheet.absoluteFill} />}
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Pressable onPress={handleBack} hitSlop={8} style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.7 : 1 }]}>
              <Ionicons name="chevron-back" size={22} color="#fff" />
            </Pressable>
            <View>
              <Text style={styles.headerTitle}>{activeCategoryData?.name ?? "Menu"}</Text>
              <Text style={styles.headerSubtitle}>
                {showingSubcategoryGrid
                  ? `${activeTopCategory?.subcategories?.length ?? 0} groups`
                  : `${activeItems.length} items`}
                {activeSubcategory && activeTopCategory ? ` · ${activeTopCategory.name}` : ""}
              </Text>
            </View>
          </View>
          <CartButton />
        </View>
      </View>

      {!showingSubcategoryGrid && (() => {
        const pillCats = activeSubcategory && activeTopCategory
          ? (activeTopCategory.subcategories ?? [])
          : (categories.filter(c => !c.subcategories || c.subcategories.length === 0));
        if (pillCats.length === 0) return null;
        return (
          <View style={[styles.categoryBar, { top: headerHeight }]}>
            <ScrollView
              ref={categoryScrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.categoryScroll}
            >
              {pillCats.map((cat) => {
                const isActive = cat.id === activeCategory;
                const catStyle = getCategoryStyle(cat.name);
                return (
                  <Pressable
                    key={cat.id}
                    onPress={() => activeSubcategory ? setSelectedSubcategory(cat.id) : handleSelectCategory(cat.id)}
                    style={({ pressed }) => [
                      styles.catPill,
                      isActive && styles.catPillActive,
                      { opacity: pressed ? 0.7 : 1 },
                    ]}
                  >
                    <Ionicons
                      name={catStyle.icon as any}
                      size={13}
                      color={isActive ? "#fff" : Colors.light.textSecondary}
                      style={{ marginRight: 4 }}
                    />
                    <Text style={[styles.catPillText, isActive && styles.catPillTextActive]}>
                      {cat.name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        );
      })()}

      {showingSubcategoryGrid ? (
        <ScrollView
          contentContainerStyle={{
            paddingTop: headerHeight + 8,
            paddingBottom: tabBarHeight + cartBarHeight + 16,
            paddingHorizontal: tabletPad,
          }}
          showsVerticalScrollIndicator={false}
        >
          <CategoryGrid
            categories={activeTopCategory!.subcategories!}
            onSelect={handleSelectSubcategory}
          />
        </ScrollView>
      ) : (
        <FlatList
          // FlatList requires a key change when numColumns changes, otherwise
          // it crashes ("Changing numColumns on the fly is not supported").
          // Re-mounting on rotation/iPad-detection is cheap here — the menu
          // data is small and already cached.
          key={`items-${itemCols}`}
          data={activeItems}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          numColumns={itemCols}
          columnWrapperStyle={itemCols > 1 ? { gap: 10, marginBottom: 10 } : undefined}
          contentContainerStyle={{
            paddingTop: headerHeight + categoryBarHeight + 8,
            paddingBottom: tabBarHeight + cartBarHeight + 16,
            paddingHorizontal: 16 + tabletPad,
          }}
          showsVerticalScrollIndicator={false}
          // Only the single-column layout uses the row separator; the
          // multi-column layout uses columnWrapperStyle.marginBottom for
          // vertical spacing instead, otherwise we'd get double-gaps.
          ItemSeparatorComponent={itemCols > 1 ? undefined : () => <View style={{ height: 10 }} />}
          ListEmptyComponent={
            <View style={styles.centred}>
              <Text style={styles.errorSub}>No items in this category</Text>
            </View>
          }
        />
      )}

      {totalItems > 0 && (
        <Pressable
          onPress={() => setCartVisible(true)}
          style={({ pressed }) => [
            styles.cartBar,
            { bottom: tabBarHeight + 10, opacity: pressed ? 0.9 : 1 },
          ]}
          testID="cart-bar"
        >
          <View style={styles.cartBarLeft}>
            <View style={styles.cartBarBadge}>
              <Text style={styles.cartBarBadgeText}>{totalItems}</Text>
            </View>
            <Text style={styles.cartBarText}>View Order</Text>
          </View>
          <Text style={styles.cartBarPrice}>{formatPrice(totalPrice)}</Text>
        </Pressable>
      )}

      {isKioskMode ? (
        <KioskCheckoutSheet
          visible={cartVisible}
          onClose={() => setCartVisible(false)}
        />
      ) : (
        <CartSheet
          visible={cartVisible}
          onClose={() => setCartVisible(false)}
          initialStep={pendingCheckoutStep}
          initialGuestEmail={pendingPrefillEmail}
          onInitialConsumed={() => {
            setPendingCheckoutStep(undefined);
            setPendingPrefillEmail(undefined);
          }}
        />
      )}
      <ModifierModal
        item={modifierItem}
        visible={!!modifierItem}
        onClose={() => setModifierItem(null)}
        onConfirm={handleModifierConfirm}
      />
      <VariationModal
        group={variationGroup}
        visible={!!variationGroup}
        onClose={() => setVariationGroup(null)}
        onSelect={handleVariationSelect}
      />
    </View>
  );
}

const createStyles = (palette: ReturnType<typeof useColors>) => {
  const Colors = { ...baseColors, light: palette };
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    backgroundColor: Platform.OS === "ios" ? "transparent" : palette.surface,
    paddingHorizontal: 20,
    paddingBottom: 10,
    overflow: "hidden" as const,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 46,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: palette.surfaceElevated,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 18,
    color: palette.text,
    lineHeight: 22,
  },
  headerSubtitle: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 11,
    color: palette.textSecondary,
    marginTop: 1,
  },
  cartIconBtn: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  cartBadge: {
    position: "absolute",
    top: 2,
    right: 2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.brand.red,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 3,
  },
  cartBadgeText: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 10,
    color: "#fff",
  },
  orderingClosedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "rgba(180,83,9,0.18)",
    borderRadius: 14,
    marginHorizontal: 16,
    marginTop: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(252,211,77,0.25)",
  },
  orderingClosedTitle: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 14,
    color: "#FCD34D",
    marginBottom: 2,
  },
  orderingClosedSub: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 12,
    color: "rgba(252,211,77,0.75)",
    lineHeight: 16,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 6,
    backgroundColor: palette.input,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 36,
  },
  searchInput: {
    flex: 1,
    fontFamily: "Montserrat_500Medium",
    fontSize: 14,
    color: palette.text,
    height: 36,
  },
  searchEmpty: {
    alignItems: "center",
    paddingTop: 60,
    gap: 12,
  },
  searchEmptyText: {
    fontFamily: "Montserrat_500Medium",
    fontSize: 15,
    color: Colors.light.textSecondary,
  },
  searchCatLabel: {
    paddingTop: 8,
    paddingBottom: 4,
  },
  searchCatLabelText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 11,
    color: Colors.light.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 4,
  },
  sectionTitle: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 20,
    color: Colors.light.text,
  },
  categoryBar: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 15,
    backgroundColor: Colors.light.background,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  categoryScroll: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  catPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: Colors.light.surface,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  catPillActive: {
    backgroundColor: Colors.brand.blue,
    borderColor: Colors.brand.blue,
  },
  catPillText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 12,
    color: Colors.light.textSecondary,
  },
  catPillTextActive: {
    color: "#fff",
  },
  itemCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.light.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.light.border,
    overflow: "hidden",
  },
  itemCardSoldOut: {
    opacity: 0.65,
  },
  itemCardHighlighted: {
    borderWidth: 2,
    borderColor: Colors.brand.blue,
    backgroundColor: Colors.brand.blue + "08",
  },
  highlightedBanner: {
    position: "absolute",
    top: 0,
    right: 0,
    backgroundColor: Colors.brand.blue,
    borderBottomLeftRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    zIndex: 1,
  },
  highlightedBannerText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 10,
    color: "#fff",
    letterSpacing: 0.3,
  },
  itemImage: {
    width: 72,
    height: 72,
    borderRadius: 10,
    marginRight: 12,
    backgroundColor: Colors.light.surfaceElevated,
  },
  itemInfo: {
    flex: 1,
    paddingRight: 12,
  },
  itemInfoWithImage: {
    paddingRight: 8,
  },
  itemNameRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 3,
  },
  itemName: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 14,
    color: Colors.light.text,
  },
  itemNameSoldOut: {
    color: Colors.light.textSecondary,
  },
  soldOutBadge: {
    backgroundColor: "#ef444420",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: "#ef4444",
  },
  soldOutText: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 10,
    color: "#ef4444",
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  variationBadge: {
    backgroundColor: "rgba(0,71,171,0.2)",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: "rgba(0,71,171,0.4)",
  },
  variationText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 10,
    color: "#60A5FA",
    letterSpacing: 0.3,
  },
  itemDesc: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 12,
    color: Colors.light.textSecondary,
    lineHeight: 16,
    marginBottom: 6,
  },
  itemPrice: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 14,
    color: Colors.brand.blue,
  },
  itemActions: {
    alignItems: "center",
    justifyContent: "center",
  },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.brand.blue,
    justifyContent: "center",
    alignItems: "center",
  },
  addBtnDisabled: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.12)",
    justifyContent: "center",
    alignItems: "center",
  },
  qtyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  qtyBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1.5,
    borderColor: Colors.brand.blue,
    justifyContent: "center",
    alignItems: "center",
  },
  qtyText: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 14,
    color: Colors.light.text,
    minWidth: 20,
    textAlign: "center",
  },
  cartBar: {
    position: "absolute",
    left: 16,
    right: 16,
    height: 56,
    borderRadius: 16,
    backgroundColor: Colors.brand.blue,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    shadowColor: Colors.brand.blue,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  cartBarLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  cartBarBadge: {
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(255,255,255,0.25)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
  },
  cartBarBadgeText: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 12,
    color: "#fff",
  },
  cartBarText: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 15,
    color: "#fff",
  },
  cartBarPrice: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 15,
    color: "#fff",
  },
  centred: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 40,
    paddingTop: 60,
  },
  loadingText: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 14,
    color: Colors.light.textSecondary,
  },
  errorTitle: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 18,
    color: Colors.light.text,
  },
  errorSub: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 14,
    color: Colors.light.textSecondary,
    textAlign: "center",
  },
  retryBtn: {
    backgroundColor: Colors.brand.blue,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 4,
  },
  retryBtnText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 14,
    color: "#fff",
  },
  sheetContainer: {
    flex: 1,
    backgroundColor: Colors.light.background,
    paddingTop: 16,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  sheetTitle: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 20,
    color: Colors.light.text,
  },
  emptyCart: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  emptyCartText: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 16,
    color: Colors.light.textSecondary,
  },
  cartList: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  cartItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
  },
  cartItemUnavailable: {
    backgroundColor: "rgba(185,28,28,0.06)",
    marginHorizontal: -8,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  cartItemInfo: {
    flex: 1,
    paddingRight: 12,
  },
  cartItemName: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 14,
    color: Colors.light.text,
    marginBottom: 3,
  },
  cartItemUnavailableLabel: {
    alignSelf: "flex-start",
    fontFamily: "Montserrat_700Bold",
    fontSize: 11,
    color: "#B91C1C",
    backgroundColor: "rgba(185,28,28,0.1)",
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginBottom: 3,
  },
  unavailableNotice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "rgba(185,28,28,0.08)",
    borderWidth: 1,
    borderColor: "rgba(185,28,28,0.25)",
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  unavailableNoticeCopy: {
    flex: 1,
  },
  unavailableNoticeTitle: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 13,
    color: "#B91C1C",
    marginBottom: 3,
  },
  unavailableNoticeText: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 12,
    color: Colors.light.textSecondary,
  },
  removeUnavailableBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: "rgba(185,28,28,0.35)",
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  removeUnavailableBtnText: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 12,
    color: "#B91C1C",
  },
  cartItemPrice: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 13,
    color: Colors.brand.blue,
    marginTop: 2,
  },
  cartItemMods: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 12,
    color: Colors.light.textSecondary,
    marginBottom: 2,
  },
  modQtyBadge: {
    backgroundColor: Colors.brand.blue,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  modQtyText: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 11,
    color: "#fff",
  },
  cartDivider: {
    height: 1,
    backgroundColor: Colors.light.border,
  },
  cartTotal: {
    flexDirection: "column",
    marginHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
    gap: 6,
  },
  cartTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  discountRow: {
    backgroundColor: "rgba(21,128,61,0.15)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  discountLabel: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 13,
    color: "#4ADE80",
  },
  discountAmount: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 13,
    color: "#4ADE80",
  },
  cartTotalLabel: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 16,
    color: Colors.light.text,
  },
  cartTotalPrice: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 18,
    color: Colors.brand.blue,
  },
  discountNoteRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    marginTop: 4,
  },
  discountNoteText: {
    flex: 1,
    fontFamily: "Montserrat_400Regular",
    fontSize: 11,
    lineHeight: 15,
    color: Colors.light.textSecondary,
  },
  rewardPickerSection: {
    marginHorizontal: 20,
    marginBottom: 14,
    backgroundColor: "rgba(0,71,171,0.15)",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "rgba(0,71,171,0.3)",
  },
  rewardPickerHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
  },
  rewardPickerTitle: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 13,
    color: Colors.brand.blue,
  },
  rewardPickerRow: {
    flexDirection: "row",
    gap: 8,
    paddingRight: 4,
  },
  rewardPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: Colors.brand.blue,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  rewardPillSelected: {
    backgroundColor: Colors.brand.blue,
    borderColor: Colors.brand.blue,
  },
  rewardPillLabel: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 12,
    color: Colors.brand.blue,
  },
  rewardPillLabelSelected: {
    color: "#fff",
  },
  rewardPillValue: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 11,
    color: Colors.light.textSecondary,
    marginTop: 1,
  },
  rewardPillValueSelected: {
    color: "rgba(255,255,255,0.85)",
  },
  rewardPickerNote: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 11,
    color: Colors.brand.blue,
    marginTop: 10,
    opacity: 0.8,
  },
  checkoutBtn: {
    marginHorizontal: 20,
    marginTop: 4,
    backgroundColor: Colors.brand.blue,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
  },
  cancelledBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "rgba(0,71,171,0.2)",
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginHorizontal: 20,
    marginBottom: 8,
    borderRadius: 10,
  },
  cancelledBannerText: {
    flex: 1,
    color: "rgba(255,255,255,0.85)",
    fontSize: 13,
    fontFamily: "Montserrat_500Medium",
    lineHeight: 18,
  },
  checkoutBtnText: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 16,
    color: "#fff",
  },
  checkoutBtnSub: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 11,
    color: "rgba(255,255,255,0.7)",
    marginTop: 2,
  },
  tableSelectorTitle: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 13,
    color: Colors.light.textSecondary,
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 8,
    textAlign: "center",
  },
  tableSelectorRow: {
    flexDirection: "row",
    marginHorizontal: 20,
    gap: 10,
    marginBottom: 4,
  },
  tableBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 10,
  },
  tableBtnActive: {
    backgroundColor: Colors.brand.blue,
  },
  tableBtnInactive: {
    backgroundColor: "#5B8FD4",
  },
  tableBtnText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 13,
    color: "#fff",
    flexShrink: 1,
  },
  tableModalContainer: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  tableModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  tableModalTitle: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 18,
    color: Colors.light.text,
  },
  tableModalSearchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    backgroundColor: Colors.light.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.light.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  tableModalSearchInput: {
    flex: 1,
    fontFamily: "Montserrat_400Regular",
    fontSize: 14,
    color: Colors.light.text,
  },
  tableModalRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  tableModalRowSelected: {
    backgroundColor: "rgba(0,71,171,0.15)",
  },
  tableModalDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  tableModalRowText: {
    fontFamily: "Montserrat_500Medium",
    fontSize: 14,
    color: Colors.light.text,
  },
  tableModalRowTextSelected: {
    fontFamily: "Montserrat_600SemiBold",
    color: Colors.brand.blue,
  },
  tableModalRowSub: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 12,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  tableModalDivider: {
    height: 1,
    backgroundColor: Colors.light.border,
    marginLeft: 44,
  },
  // ── Step 2 checkout styles ──────────────────────────────────────────────────
  coSection: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: Colors.light.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.light.border,
    padding: 16,
  },
  coSectionTitle: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 15,
    color: Colors.light.text,
    marginBottom: 6,
  },
  coSectionSub: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 13,
    color: Colors.light.textSecondary,
    marginBottom: 14,
    lineHeight: 19,
  },
  coCustomerCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  coAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.brand.blue,
    alignItems: "center",
    justifyContent: "center",
  },
  coAvatarText: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 18,
    color: "#fff",
  },
  coCustomerName: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 15,
    color: Colors.light.text,
  },
  coCustomerEmail: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 13,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  coVerifiedBadge: {
    marginLeft: "auto",
  },
  coOptionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 10,
    paddingVertical: 13,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  coOptionBtnPrimary: {
    backgroundColor: Colors.brand.blue,
  },
  coOptionBtnSecondary: {
    backgroundColor: "transparent",
    borderWidth: 1.5,
    borderColor: Colors.brand.blue,
  },
  coOptionBtnGhost: {
    backgroundColor: Colors.light.background,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  coOptionBtnTextPrimary: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 14,
    color: "#fff",
  },
  coOptionBtnTextSecondary: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 14,
    color: Colors.brand.blue,
  },
  coOptionBtnTextGhost: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 14,
    color: Colors.light.textSecondary,
  },
  coInputGroup: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.light.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.light.border,
    paddingHorizontal: 12,
    marginBottom: 10,
    height: 46,
  },
  coInputIcon: {
    marginRight: 8,
  },
  coInput: {
    flex: 1,
    fontFamily: "Montserrat_400Regular",
    fontSize: 14,
    color: Colors.light.text,
  },
  coBackLink: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 13,
    color: Colors.brand.blue,
    marginTop: 4,
  },
  coNotesHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
  },
  coNotesLabel: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 13,
    color: Colors.light.textSecondary,
  },
  coNotesInput: {
    backgroundColor: Colors.light.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.light.border,
    padding: 12,
    fontFamily: "Montserrat_400Regular",
    fontSize: 14,
    color: Colors.light.text,
    minHeight: 80,
    textAlignVertical: "top",
  },
  coNotesCount: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 11,
    color: Colors.light.textSecondary,
    textAlign: "right",
    marginTop: 4,
  },

  // FEATURE_DIETARY_FILTERS — badges shown on each ItemCard.
  dietaryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 6,
    marginBottom: 4,
  },
  dietaryBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  dietaryBadgeText: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 9,
    letterSpacing: 0.4,
  },

  // FEATURE_DIETARY_FILTERS — horizontally-scrolling chip row above the
  // category grid. Active chips fill with their tag colour.
  dietaryChipBar: {
    marginTop: -6,
    marginBottom: 6,
  },
  dietaryChipScroll: {
    paddingHorizontal: 16,
    gap: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  dietaryChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: Colors.light.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  dietaryChipText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 12,
    color: Colors.light.textSecondary,
  },
  dietaryChipTextActive: {
    color: "#FFFFFF",
  },
  dietaryClearChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  dietaryClearText: {
    fontFamily: "Montserrat_500Medium",
    fontSize: 12,
    color: Colors.light.textSecondary,
  },

  // FEATURE_SAVED_CARDS — link below the saved-card CTA that lets the
  // customer fall through to the standard new-card sheet.
  useNewCardLink: {
    fontFamily: "Montserrat_500Medium",
    fontSize: 13,
    color: Colors.brand.blue,
  },
  });
};
