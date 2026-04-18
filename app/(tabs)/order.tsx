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
  Image,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
  TextInput,
  KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BottomTabBarHeightContext } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import Colors from "@/constants/colors";
import { useCart } from "@/contexts/CartContext";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import { getApiUrl } from "@/lib/query-client";
import type { MenuCategory, MenuItem, ModifierList, SelectedModifier } from "@/types/menu";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const BANNER_HEIGHT = 200;

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
] as const;

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
            <Image
              source={{ uri: banner.imageUrl }}
              style={bannerStyles.image}
              resizeMode="cover"
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
  const cardSize = (SCREEN_WIDTH - 16 * 3) / 2;

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
                  <Image
                    source={{ uri: cat.imageUrl }}
                    style={gridStyles.cardBgImage}
                    resizeMode="cover"
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

const gridStyles = StyleSheet.create({
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
    const mods: SelectedModifier[] = [];
    (item.modifiers || []).forEach((ml) => {
      (selections[ml.id] || []).forEach((optId) => {
        const opt = ml.options.find((o) => o.id === optId);
        if (opt) mods.push({ catalogObjectId: opt.id, name: opt.name, price: opt.price });
      });
    });
    onConfirm(mods);
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
      <View style={{ flex: 1, backgroundColor: Colors.light.background }}>
        <View style={[modStyles.header, { paddingTop: insets.top + 16 }]}>
          <Text style={modStyles.title} numberOfLines={2}>{cartName}</Text>
          <Pressable onPress={onClose} hitSlop={12} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
            <Ionicons name="close" size={24} color={Colors.light.text} />
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
          >
            <Text style={modStyles.addBtnText}>Add to Order · {formatPrice(lineTotal)}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const modStyles = StyleSheet.create({
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
    backgroundColor: "#FEF3C7",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  requiredText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 11,
    color: "#92400E",
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

function ItemCard({
  item,
  onOpenModifiers,
  highlighted,
}: {
  item: MenuItem;
  onOpenModifiers: (item: MenuItem) => void;
  highlighted?: boolean;
}) {
  const { addItem, updateQuantity, getQuantity } = useCart();
  const qty = getQuantity(item.variationId);
  const soldOut = !!item.soldOut;
  const cartName = item.variationName ? `${item.name} — ${item.variationName}` : item.name;
  const hasImage = !!item.imageUrl;
  const hasModifiers = !!(item.modifiers && item.modifiers.length > 0);

  const handleAdd = () => {
    if (hasModifiers) {
      onOpenModifiers(item);
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
        <Image
          source={{ uri: item.imageUrl }}
          style={styles.itemImage}
          resizeMode="cover"
        />
      )}
      <View style={[styles.itemInfo, hasImage && styles.itemInfoWithImage]}>
        <View style={styles.itemNameRow}>
          <Text style={[styles.itemName, soldOut && styles.itemNameSoldOut]} numberOfLines={2}>{item.name}</Text>
          {!!item.variationName && (
            <View style={styles.variationBadge}>
              <Text style={styles.variationText}>{item.variationName}</Text>
            </View>
          )}
          {soldOut && (
            <View style={styles.soldOutBadge}>
              <Text style={styles.soldOutText}>Unavailable</Text>
            </View>
          )}
          {hasModifiers && !soldOut && (
            <View style={[styles.variationBadge, { backgroundColor: "#EFF6FF" }]}>
              <Text style={[styles.variationText, { color: Colors.brand.blue }]}>Customisable</Text>
            </View>
          )}
        </View>
        {!!item.description && (
          <Text style={[styles.itemDesc, soldOut && { opacity: 0.4 }]} numberOfLines={2}>{item.description}</Text>
        )}
        <Text style={[styles.itemPrice, soldOut && { opacity: 0.4 }]}>{formatPrice(item.price)}</Text>
      </View>

      <View style={styles.itemActions}>
        {soldOut ? (
          <View style={styles.addBtnDisabled}>
            <Ionicons name="close" size={18} color="rgba(255,255,255,0.5)" />
          </View>
        ) : hasModifiers ? (
          <View style={{ alignItems: "center", gap: 4 }}>
            {qty > 0 && (
              <View style={styles.modQtyBadge}>
                <Text style={styles.modQtyText}>{qty}</Text>
              </View>
            )}
            <Pressable
              onPress={handleAdd}
              style={({ pressed }) => [styles.addBtn, { opacity: pressed ? 0.7 : 1 }]}
              testID={`add-${item.variationId}`}
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
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { items, updateQuantity, clearCart, totalPrice } = useCart();
  const { customer, getCustomerToken } = useCustomerAuth();
  const [step, setStep] = useState<"cart" | "customer">("cart");
  const [tableNote, setTableNote] = useState("");
  const [orderNote, setOrderNote] = useState("");
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestMode, setGuestMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!visible) {
      setStep("cart");
      setGuestMode(false);
    }
  }, [visible]);

  const { data: memberSub } = useQuery<{
    status: string;
    cancelledAt: string | null;
    currentPeriodEnd: string | null;
    plan: { name: string; foodDrinkDiscount: number; active: boolean } | null;
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
  const discountAmountPence = discountPercent > 0 ? Math.round(totalPrice * discountPercent / 100) : 0;
  const finalPrice = totalPrice - discountAmountPence;

  const effectiveCustomer = customer
    ? { name: customer.name, email: customer.email, phone: customer.phone ?? undefined }
    : guestMode && (guestName.trim() || guestEmail.trim())
    ? { name: guestName.trim() || undefined, email: guestEmail.trim() || undefined }
    : undefined;

  const handleCheckout = async () => {
    if (items.length === 0) return;
    setLoading(true);
    try {
      const apiBase = getApiUrl();
      const url = new URL("/api/orders/checkout", apiBase);
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Checkout failed");

      onClose();
      clearCart();
      setTableNote("");
      setOrderNote("");
      setGuestName("");
      setGuestEmail("");
      setStep("cart");
      setGuestMode(false);
      await Linking.openURL(data.url);
    } catch (err: any) {
      Alert.alert("Checkout Error", err.message || "Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setStep("cart");
    setGuestMode(false);
    onClose();
  };

  const TotalSummary = () => (
    <View style={styles.cartTotal}>
      {discountPercent > 0 ? (
        <>
          <View style={styles.cartTotalRow}>
            <Text style={styles.cartTotalLabel}>Subtotal</Text>
            <Text style={[styles.cartTotalPrice, { color: Colors.light.textSecondary, fontSize: 15, fontWeight: "500" as const }]}>{formatPrice(totalPrice)}</Text>
          </View>
          <View style={[styles.cartTotalRow, styles.discountRow]}>
            <View style={{ flexDirection: "row" as const, alignItems: "center" as const, gap: 6 }}>
              <Ionicons name="diamond-outline" size={14} color="#166534" />
              <Text style={styles.discountLabel}>{discountLabel}</Text>
            </View>
            <Text style={styles.discountAmount}>−{formatPrice(discountAmountPence)}</Text>
          </View>
          <View style={styles.cartTotalRow}>
            <Text style={styles.cartTotalLabel}>Total</Text>
            <Text style={styles.cartTotalPrice}>{formatPrice(finalPrice)}</Text>
          </View>
        </>
      ) : (
        <View style={styles.cartTotalRow}>
          <Text style={styles.cartTotalLabel}>Total</Text>
          <Text style={styles.cartTotalPrice}>{formatPrice(totalPrice)}</Text>
        </View>
      )}
    </View>
  );

  return (
    <Modal
      visible={visible}
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
                renderItem={({ item }) => {
                  const linePrice = (item.price + (item.modifiers?.reduce((s, m) => s + m.price, 0) ?? 0)) * item.quantity;
                  return (
                    <View style={styles.cartItem}>
                      <View style={styles.cartItemInfo}>
                        <Text style={styles.cartItemName}>{item.name}</Text>
                        {item.modifiers && item.modifiers.length > 0 && (
                          <Text style={styles.cartItemMods} numberOfLines={2}>
                            {item.modifiers.map((m) => m.name).join(", ")}
                          </Text>
                        )}
                        <Text style={styles.cartItemPrice}>{formatPrice(linePrice)}</Text>
                      </View>
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
                    </View>
                  );
                }}
                ItemSeparatorComponent={() => <View style={styles.cartDivider} />}
              />

              <View style={styles.tablePicker}>
                <View style={styles.tablePickerHeader}>
                  <Ionicons name="grid-outline" size={15} color={Colors.light.textSecondary} />
                  <Text style={styles.tablePickerLabel}>
                    {tableNote ? `${tableNote} selected` : "Select your table (optional)"}
                  </Text>
                  {!!tableNote && (
                    <Pressable onPress={() => setTableNote("")} hitSlop={8}>
                      <Ionicons name="close-circle" size={16} color={Colors.light.textSecondary} />
                    </Pressable>
                  )}
                </View>
                {TABLE_SECTIONS.map((section) => (
                  <View key={section.label} style={styles.tableSectionRow}>
                    <View style={[styles.tableSectionLabelWrap, { borderLeftColor: section.color }]}>
                      <Text style={[styles.tableSectionLabel, { color: section.color }]} numberOfLines={2}>
                        {section.label}
                      </Text>
                    </View>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.tableNumRow}
                    >
                      {section.tables.map((table) => {
                        const selected = tableNote === table.value;
                        return (
                          <Pressable
                            key={table.value}
                            onPress={() => setTableNote(selected ? "" : table.value)}
                            style={[
                              styles.tableNumBtn,
                              selected && { backgroundColor: section.color, borderColor: section.color },
                            ]}
                          >
                            <Text style={[styles.tableNumText, selected && styles.tableNumTextSelected]}>
                              {table.display}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </View>
                ))}
              </View>

              <TotalSummary />

              <Pressable
                onPress={() => setStep("customer")}
                style={({ pressed }) => [styles.checkoutBtn, { opacity: pressed ? 0.8 : 1 }]}
                testID="continue-btn"
              >
                <Text style={styles.checkoutBtnText}>Continue</Text>
                <Text style={styles.checkoutBtnSub}>{formatPrice(finalPrice)}</Text>
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
                      onPress={() => { handleClose(); router.push("/account"); }}
                    >
                      <Ionicons name="person-circle-outline" size={20} color="#fff" />
                      <Text style={styles.coOptionBtnTextPrimary}>Sign In to My Account</Text>
                    </Pressable>
                    <Pressable
                      style={({ pressed }) => [styles.coOptionBtn, styles.coOptionBtnSecondary, { opacity: pressed ? 0.85 : 1 }]}
                      onPress={() => { handleClose(); router.push("/account"); }}
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

              {/* Compact order summary */}
              <TotalSummary />

              {/* Place order button */}
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
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default function OrderScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0;
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const params = useLocalSearchParams<{ hlCatId?: string; hlItemId?: string; hlItemName?: string }>();

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(null);
  const [cartVisible, setCartVisible] = useState(false);
  const [modifierItem, setModifierItem] = useState<MenuItem | null>(null);
  const [highlightItemId, setHighlightItemId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const { totalItems, totalPrice, addItem } = useCart();
  const categoryScrollRef = useRef<ScrollView>(null);
  const searchRef = useRef<TextInput>(null);

  const { data: categories, isLoading, isError, refetch } = useQuery<MenuCategory[]>({
    queryKey: ["/api/menu"],
    staleTime: 5 * 60 * 1000,
  });

  const { data: banners } = useQuery<BannerImage[]>({
    queryKey: ["/api/banner-images?page=order"],
    staleTime: 10 * 60 * 1000,
  });

  const { data: orderingStatus } = useQuery<{ enabled: boolean; reason?: string; nextOpen?: string; closesAt?: string }>({
    queryKey: ["/api/ordering-status"],
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });

  const orderingEnabled = orderingStatus?.enabled !== false;

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

  const activeItems = useMemo(
    () => (showingSubcategoryGrid ? [] : activeCategoryData?.items ?? []),
    [activeCategoryData, showingSubcategoryGrid]
  );

  const headerHeight = insets.top + 56 + (Platform.OS === "web" ? webTopInset : 0);
  const searchBarHeight = 52;
  const categoryPageHeaderHeight = headerHeight + searchBarHeight;
  const categoryBarHeight = 52;
  const cartBarHeight = totalItems > 0 ? 72 : 0;

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q || !categories) return [];
    const results: Array<{ item: MenuItem; categoryName: string }> = [];
    const walk = (cat: MenuCategory, prefix?: string) => {
      const label = prefix ? `${prefix} › ${cat.name}` : cat.name;
      for (const item of cat.items) {
        if (
          item.name.toLowerCase().includes(q) ||
          item.description?.toLowerCase().includes(q) ||
          item.variationName?.toLowerCase().includes(q)
        ) {
          results.push({ item, categoryName: label });
        }
      }
      for (const sub of cat.subcategories ?? []) {
        walk(sub, cat.name);
      }
    };
    for (const cat of categories) walk(cat);
    return results;
  }, [searchQuery, categories]);

  const handleOpenModifiers = useCallback((item: MenuItem) => {
    setModifierItem(item);
  }, []);

  const handleModifierConfirm = useCallback((modifiers: SelectedModifier[]) => {
    if (!modifierItem) return;
    const cartName = modifierItem.variationName
      ? `${modifierItem.name} — ${modifierItem.variationName}`
      : modifierItem.name;
    addItem({
      variationId: modifierItem.variationId,
      itemId: modifierItem.id,
      name: cartName,
      price: modifierItem.price,
      modifiers: modifiers.length > 0 ? modifiers : undefined,
    });
    setModifierItem(null);
  }, [modifierItem, addItem]);

  useEffect(() => {
    if (params.hlCatId && params.hlItemId && categories && categories.length > 0) {
      const catExists = categories.find((c) => c.id === params.hlCatId);
      if (catExists) {
        setSelectedCategory(params.hlCatId);
        setHighlightItemId(params.hlItemId ?? null);
      }
    }
  }, [params.hlCatId, params.hlItemId, categories]);

  const renderItem = useCallback(({ item }: { item: MenuItem }) => (
    <ItemCard item={item} onOpenModifiers={handleOpenModifiers} highlighted={item.id === highlightItemId} />
  ), [handleOpenModifiers, highlightItemId]);

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
        <View style={[styles.header, { paddingTop: insets.top + webTopInset }]}>
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
        <View style={[styles.header, { paddingTop: insets.top + webTopInset }]}>
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
        <View style={[styles.header, { paddingTop: insets.top + webTopInset }]}>
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
          contentContainerStyle={{ paddingTop: categoryPageHeaderHeight, paddingBottom: tabBarHeight + cartBarHeight + 16 }}
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
                  {searchResults.map(({ item, categoryName }) => (
                    <View key={item.variationId}>
                      <View style={styles.searchCatLabel}>
                        <Text style={styles.searchCatLabelText}>{categoryName}</Text>
                      </View>
                      <ItemCard item={item} onOpenModifiers={handleOpenModifiers} />
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

              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>What would you like?</Text>
              </View>

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

        <CartSheet visible={cartVisible} onClose={() => setCartVisible(false)} />
        <ModifierModal
          item={modifierItem}
          visible={!!modifierItem}
          onClose={() => setModifierItem(null)}
          onConfirm={handleModifierConfirm}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + webTopInset }]}>
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
          data={activeItems}
          keyExtractor={(item) => item.variationId}
          renderItem={renderItem}
          contentContainerStyle={{
            paddingTop: headerHeight + categoryBarHeight + 8,
            paddingBottom: tabBarHeight + cartBarHeight + 16,
            paddingHorizontal: 16,
          }}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
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

      <CartSheet visible={cartVisible} onClose={() => setCartVisible(false)} />
      <ModifierModal
        item={modifierItem}
        visible={!!modifierItem}
        onClose={() => setModifierItem(null)}
        onConfirm={handleModifierConfirm}
      />
    </View>
  );
}

const styles = StyleSheet.create({
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
    backgroundColor: Colors.brand.navy,
    paddingHorizontal: 20,
    paddingBottom: 10,
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
    backgroundColor: "rgba(255,255,255,0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 18,
    color: "#fff",
    lineHeight: 22,
  },
  headerSubtitle: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 11,
    color: "rgba(255,255,255,0.6)",
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
    backgroundColor: "#fef3c7",
    borderRadius: 14,
    marginHorizontal: 16,
    marginTop: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "#fcd34d",
  },
  orderingClosedTitle: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 14,
    color: "#92400e",
    marginBottom: 2,
  },
  orderingClosedSub: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 12,
    color: "#a16207",
    lineHeight: 16,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 6,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 36,
  },
  searchInput: {
    flex: 1,
    fontFamily: "Montserrat_500Medium",
    fontSize: 14,
    color: "#fff",
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
    backgroundColor: "#eff6ff",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: "#bfdbfe",
  },
  variationText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 10,
    color: "#2563eb",
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
    backgroundColor: "#f0fdf4",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  discountLabel: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 13,
    color: "#166534",
  },
  discountAmount: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 13,
    color: "#166534",
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
  checkoutBtn: {
    marginHorizontal: 20,
    marginTop: 4,
    backgroundColor: Colors.brand.blue,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
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
  tablePicker: {
    marginHorizontal: 20,
    marginTop: 8,
    marginBottom: 4,
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.light.border,
    overflow: "hidden",
  },
  tablePickerHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  tablePickerLabel: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 12,
    color: Colors.light.textSecondary,
    flex: 1,
  },
  tableSectionRow: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  tableSectionLabelWrap: {
    width: 72,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderLeftWidth: 3,
    justifyContent: "center",
  },
  tableSectionLabel: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 10,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  tableNumRow: {
    flexDirection: "row",
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 6,
  },
  tableNumBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.background,
    justifyContent: "center",
    alignItems: "center",
  },
  tableNumText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 12,
    color: Colors.light.text,
  },
  tableNumTextSelected: {
    color: "#fff",
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
});
