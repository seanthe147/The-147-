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
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BottomTabBarHeightContext } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { useCart } from "@/contexts/CartContext";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import { getApiUrl } from "@/lib/query-client";
import type { MenuCategory, MenuItem } from "@/types/menu";

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
            {hasImage ? (
              <>
                <Image
                  source={{ uri: cat.imageUrl }}
                  style={gridStyles.cardBgImage}
                  resizeMode="cover"
                />
                <View style={gridStyles.cardImageOverlay} />
                <View style={gridStyles.cardImageContent}>
                  <Text style={gridStyles.cardNameLight} numberOfLines={2}>{cat.name}</Text>
                  <Text style={gridStyles.cardCountLight}>{cat.items.length} items</Text>
                </View>
              </>
            ) : (
              <>
                <View style={[gridStyles.iconWrap, { backgroundColor: catStyle.bg }]}>
                  <Ionicons name={catStyle.icon as any} size={28} color={catStyle.color} />
                </View>
                <Text style={gridStyles.cardName} numberOfLines={2}>{cat.name}</Text>
                <Text style={gridStyles.cardCount}>{cat.items.length} items</Text>
              </>
            )}
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

function ItemCard({ item }: { item: MenuItem }) {
  const { addItem, updateQuantity, getQuantity } = useCart();
  const qty = getQuantity(item.variationId);
  const soldOut = !!item.soldOut;
  const cartName = item.variationName ? `${item.name} — ${item.variationName}` : item.name;
  const hasImage = !!item.imageUrl;

  return (
    <View style={[styles.itemCard, soldOut && styles.itemCardSoldOut]}>
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
        ) : qty === 0 ? (
          <Pressable
            onPress={() => addItem({ variationId: item.variationId, itemId: item.id, name: cartName, price: item.price })}
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
              onPress={() => updateQuantity(item.variationId, 1)}
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
  const [tableNote, setTableNote] = useState("");
  const [loading, setLoading] = useState(false);
  const insets = useSafeAreaInsets();

  const { data: memberSub } = useQuery<{
    status: string;
    cancelledAt: string | null;
    currentPeriodEnd: string | null;
    plan: { name: string; foodDrinkDiscount: number } | null;
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
    (memberSub.plan?.foodDrinkDiscount ?? 0) > 0;
  const discountPercent = isValidMember ? memberSub!.plan!.foodDrinkDiscount : 0;
  const discountLabel = discountPercent > 0 ? `${memberSub!.plan!.name} Member Discount` : "";
  const discountAmountPence = discountPercent > 0 ? Math.round(totalPrice * discountPercent / 100) : 0;
  const finalPrice = totalPrice - discountAmountPence;

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
            name: i.name,
            price: i.price,
            quantity: i.quantity,
          })),
          tableNote: tableNote.trim() || undefined,
          customer: customer
            ? { name: customer.name, email: customer.email, phone: customer.phone ?? undefined }
            : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Checkout failed");

      onClose();
      clearCart();
      setTableNote("");
      await Linking.openURL(data.url);
    } catch (err: any) {
      Alert.alert("Checkout Error", err.message || "Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.sheetContainer, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Your Order</Text>
          <Pressable onPress={onClose} hitSlop={12} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
            <Ionicons name="close" size={24} color={Colors.light.text} />
          </Pressable>
        </View>

        {items.length === 0 ? (
          <View style={styles.emptyCart}>
            <Ionicons name="cart-outline" size={48} color={Colors.light.textSecondary} />
            <Text style={styles.emptyCartText}>Your cart is empty</Text>
          </View>
        ) : (
          <>
            <FlatList
              data={items}
              keyExtractor={(i) => i.variationId}
              style={styles.cartList}
              contentContainerStyle={{ paddingBottom: 8 }}
              renderItem={({ item }) => (
                <View style={styles.cartItem}>
                  <View style={styles.cartItemInfo}>
                    <Text style={styles.cartItemName}>{item.name}</Text>
                    <Text style={styles.cartItemPrice}>{formatPrice(item.price * item.quantity)}</Text>
                  </View>
                  <View style={styles.qtyRow}>
                    <Pressable
                      onPress={() => updateQuantity(item.variationId, -1)}
                      style={({ pressed }) => [styles.qtyBtn, { opacity: pressed ? 0.7 : 1 }]}
                    >
                      <Ionicons name="remove" size={16} color={Colors.brand.blue} />
                    </Pressable>
                    <Text style={styles.qtyText}>{item.quantity}</Text>
                    <Pressable
                      onPress={() => updateQuantity(item.variationId, 1)}
                      style={({ pressed }) => [styles.qtyBtn, { opacity: pressed ? 0.7 : 1 }]}
                    >
                      <Ionicons name="add" size={16} color={Colors.brand.blue} />
                    </Pressable>
                  </View>
                </View>
              )}
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

            <View style={styles.cartTotal}>
              {discountPercent > 0 ? (
                <>
                  <View style={styles.cartTotalRow}>
                    <Text style={styles.cartTotalLabel}>Subtotal</Text>
                    <Text style={[styles.cartTotalPrice, { color: Colors.light.textSecondary, fontSize: 15, fontWeight: "500" }]}>{formatPrice(totalPrice)}</Text>
                  </View>
                  <View style={[styles.cartTotalRow, styles.discountRow]}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
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

            <Pressable
              onPress={handleCheckout}
              disabled={loading}
              style={({ pressed }) => [styles.checkoutBtn, { opacity: pressed || loading ? 0.8 : 1 }]}
              testID="checkout-btn"
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Text style={styles.checkoutBtnText}>Pay Now</Text>
                  <Text style={styles.checkoutBtnSub}>Apple Pay · Google Pay · Card</Text>
                </>
              )}
            </Pressable>
          </>
        )}
      </View>
    </Modal>
  );
}

export default function OrderScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0;
  const webTopInset = Platform.OS === "web" ? 67 : 0;

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [cartVisible, setCartVisible] = useState(false);
  const { totalItems, totalPrice } = useCart();
  const categoryScrollRef = useRef<ScrollView>(null);

  const { data: categories, isLoading, isError, refetch } = useQuery<MenuCategory[]>({
    queryKey: ["/api/menu"],
    staleTime: 5 * 60 * 1000,
  });

  const { data: banners } = useQuery<BannerImage[]>({
    queryKey: ["/api/banner-images"],
    staleTime: 10 * 60 * 1000,
  });

  const { data: orderingStatus } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/ordering-status"],
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });

  const orderingEnabled = orderingStatus?.enabled !== false;

  const activeBanners = useMemo(
    () => (banners ?? []).filter((b) => b.active),
    [banners]
  );

  const activeCategory = useMemo(() => {
    if (!categories || categories.length === 0) return null;
    if (selectedCategory && categories.find((c) => c.id === selectedCategory)) {
      return selectedCategory;
    }
    return null;
  }, [categories, selectedCategory]);

  const activeCategoryData = useMemo(
    () => categories?.find((c) => c.id === activeCategory) ?? null,
    [categories, activeCategory]
  );

  const activeItems = useMemo(
    () => activeCategoryData?.items ?? [],
    [activeCategoryData]
  );

  const headerHeight = insets.top + 56 + (Platform.OS === "web" ? webTopInset : 0);
  const categoryBarHeight = 52;
  const cartBarHeight = totalItems > 0 ? 72 : 0;

  const renderItem = useCallback(({ item }: { item: MenuItem }) => (
    <ItemCard item={item} />
  ), []);

  const handleSelectCategory = useCallback((id: string) => {
    setSelectedCategory(id);
  }, []);

  const handleBack = useCallback(() => {
    setSelectedCategory(null);
  }, []);

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
        </View>

        <ScrollView
          contentContainerStyle={{ paddingTop: headerHeight, paddingBottom: tabBarHeight + cartBarHeight + 16 }}
          showsVerticalScrollIndicator={false}
        >
          {activeBanners.length > 0 && (
            <BannerCarousel banners={activeBanners} />
          )}

          {!orderingEnabled && (
            <View style={styles.orderingClosedBanner}>
              <Ionicons name="moon-outline" size={22} color="#92400e" />
              <View style={{ flex: 1 }}>
                <Text style={styles.orderingClosedTitle}>Ordering is currently closed</Text>
                <Text style={styles.orderingClosedSub}>Please speak to a member of staff to place your order</Text>
              </View>
            </View>
          )}

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>What would you like?</Text>
          </View>

          <CategoryGrid categories={categories} onSelect={handleSelectCategory} />
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
              <Text style={styles.headerSubtitle}>{activeItems.length} items</Text>
            </View>
          </View>
          <CartButton />
        </View>
      </View>

      <View style={[styles.categoryBar, { top: headerHeight }]}>
        <ScrollView
          ref={categoryScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryScroll}
        >
          {categories.map((cat) => {
            const isActive = cat.id === activeCategory;
            const catStyle = getCategoryStyle(cat.name);
            return (
              <Pressable
                key={cat.id}
                onPress={() => setSelectedCategory(cat.id)}
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
});
