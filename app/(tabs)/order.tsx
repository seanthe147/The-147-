import React, {
  useContext,
  useState,
  useRef,
  useCallback,
  useMemo,
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
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BottomTabBarHeightContext } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { useCart } from "@/contexts/CartContext";
import { getApiUrl } from "@/lib/query-client";
import type { MenuCategory, MenuItem } from "@/types/menu";

const FOOD_CATEGORIES = new Set([
  "Starters", "Sharers", "Pub Classic Mains", "Burgers", "Turkish Mains",
  "Loaded Fries Menu", "Pastas", "Panini", "Toasties", "Build Your Own Pizza",
  "Sides", "Kids Mains", "Kids Puddings", "Puddings",
]);

const TABLE_NUMBERS = Array.from({ length: 20 }, (_, i) => i + 1);

function formatPrice(pence: number) {
  return `£${(pence / 100).toFixed(2)}`;
}

function ItemCard({ item }: { item: MenuItem }) {
  const { addItem, updateQuantity, getQuantity } = useCart();
  const qty = getQuantity(item.variationId);
  const soldOut = !!item.soldOut;

  return (
    <View style={[styles.itemCard, soldOut && styles.itemCardSoldOut]}>
      <View style={styles.itemInfo}>
        <View style={styles.itemNameRow}>
          <Text style={[styles.itemName, soldOut && styles.itemNameSoldOut]}>{item.name}</Text>
          {soldOut && (
            <View style={styles.soldOutBadge}>
              <Text style={styles.soldOutText}>Sold Out</Text>
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
            onPress={() => addItem({ variationId: item.variationId, itemId: item.id, name: item.name, price: item.price })}
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
  const { items, updateQuantity, removeItem, clearCart, totalPrice, totalItems } = useCart();
  const [tableNote, setTableNote] = useState("");
  const [loading, setLoading] = useState(false);
  const insets = useSafeAreaInsets();

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
                  {tableNote ? `Table ${tableNote} selected` : "Select your table (optional)"}
                </Text>
                {!!tableNote && (
                  <Pressable onPress={() => setTableNote("")} hitSlop={8}>
                    <Ionicons name="close-circle" size={16} color={Colors.light.textSecondary} />
                  </Pressable>
                )}
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.tableNumRow}
              >
                {TABLE_NUMBERS.map((n) => {
                  const selected = tableNote === String(n);
                  return (
                    <Pressable
                      key={n}
                      onPress={() => setTableNote(selected ? "" : String(n))}
                      style={[styles.tableNumBtn, selected && styles.tableNumBtnSelected]}
                    >
                      <Text style={[styles.tableNumText, selected && styles.tableNumTextSelected]}>
                        {n}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            <View style={styles.cartTotal}>
              <Text style={styles.cartTotalLabel}>Total</Text>
              <Text style={styles.cartTotalPrice}>{formatPrice(totalPrice)}</Text>
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

  const activeCategory = useMemo(() => {
    if (!categories || categories.length === 0) return null;
    if (selectedCategory && categories.find((c) => c.id === selectedCategory)) {
      return selectedCategory;
    }
    return categories[0].id;
  }, [categories, selectedCategory]);

  const activeItems = useMemo(() => {
    if (!categories) return [];
    return categories.find((c) => c.id === activeCategory)?.items ?? [];
  }, [categories, activeCategory]);

  const headerHeight = insets.top + 56 + (Platform.OS === "web" ? webTopInset : 0);
  const categoryBarHeight = 52;
  const cartBarHeight = totalItems > 0 ? 72 : 0;

  const renderItem = useCallback(({ item }: { item: MenuItem }) => (
    <ItemCard item={item} />
  ), []);

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: insets.top + webTopInset }]}>
          <Text style={styles.headerTitle}>Order</Text>
          <Text style={styles.headerSubtitle}>Food & Drink</Text>
        </View>
        <View style={styles.centred}>
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
          <Text style={styles.headerTitle}>Order</Text>
          <Text style={styles.headerSubtitle}>Food & Drink</Text>
        </View>
        <View style={styles.centred}>
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

  return (
    <View style={styles.container}>
      {/* Fixed header */}
      <View style={[styles.header, { paddingTop: insets.top + webTopInset }]}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.headerTitle}>Order</Text>
            <Text style={styles.headerSubtitle}>Food & Drink</Text>
          </View>
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
        </View>
      </View>

      {/* Category tabs */}
      <View style={[styles.categoryBar, { top: headerHeight }]}>
        <ScrollView
          ref={categoryScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryScroll}
        >
          {categories.map((cat) => {
            const isActive = cat.id === activeCategory;
            const isFood = FOOD_CATEGORIES.has(cat.name);
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
                  name={isFood ? "restaurant-outline" : "beer-outline"}
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

      {/* Items list */}
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

      {/* Cart bar */}
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
  headerTitle: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 20,
    color: "#fff",
    lineHeight: 24,
  },
  headerSubtitle: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 12,
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
  },
  itemCardSoldOut: {
    opacity: 0.65,
  },
  itemInfo: {
    flex: 1,
    paddingRight: 12,
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
    textTransform: "uppercase",
    letterSpacing: 0.5,
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
    zIndex: 30,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  cartBarLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  cartBarBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(255,255,255,0.25)",
    justifyContent: "center",
    alignItems: "center",
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
    fontFamily: "Montserrat_500Medium",
    fontSize: 13,
    color: Colors.light.textSecondary,
  },
  cartDivider: {
    height: 1,
    backgroundColor: Colors.light.border,
  },
  tablePicker: {
    marginHorizontal: 20,
    marginTop: 12,
    backgroundColor: Colors.light.surfaceElevated,
    borderRadius: 12,
    overflow: "hidden",
  },
  tablePickerHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingTop: 11,
    paddingBottom: 8,
    gap: 7,
  },
  tablePickerLabel: {
    flex: 1,
    fontFamily: "Montserrat_500Medium",
    fontSize: 13,
    color: Colors.light.textSecondary,
  },
  tableNumRow: {
    paddingHorizontal: 14,
    paddingBottom: 12,
    gap: 8,
    flexDirection: "row",
  },
  tableNumBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: Colors.light.surface,
    borderWidth: 1.5,
    borderColor: Colors.light.border,
    justifyContent: "center",
    alignItems: "center",
  },
  tableNumBtnSelected: {
    backgroundColor: Colors.brand.blue,
    borderColor: Colors.brand.blue,
  },
  tableNumText: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 14,
    color: Colors.light.text,
  },
  tableNumTextSelected: {
    color: "#fff",
  },
  cartTotal: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 4,
  },
  cartTotalLabel: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 16,
    color: Colors.light.text,
  },
  cartTotalPrice: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 20,
    color: Colors.brand.blue,
  },
  checkoutBtn: {
    marginHorizontal: 20,
    marginTop: 12,
    backgroundColor: Colors.brand.blue,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  checkoutBtnText: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 17,
    color: "#fff",
  },
  checkoutBtnSub: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 11,
    color: "rgba(255,255,255,0.7)",
    marginTop: 3,
  },
});
