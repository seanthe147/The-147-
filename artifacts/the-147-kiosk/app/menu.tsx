/**
 * Menu screen — two-panel layout for the kiosk iPad.
 *
 * Left sidebar: category list loaded from GET /api/menu
 * Right panel: item grid for the selected category
 * Top-right: cart badge → opens KioskCheckoutSheet
 * Bottom-left: back button → returns to attract screen
 */
import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Modal,
  ActivityIndicator,
  FlatList,
  Image,
} from "react-native";
import { BlurView } from "expo-blur";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useCart } from "@/contexts/CartContext";
import { useKiosk } from "@/contexts/KioskContext";
import { KioskCheckoutSheet } from "@/components/KioskCheckoutSheet";
import Colors from "@/constants/colors";
import type { MenuCategory, MenuItem, ModifierList, SelectedModifier } from "@/types/menu";

function formatPrice(pence: number) {
  return `£${(pence / 100).toFixed(2)}`;
}

// ─── Ordering-status type ─────────────────────────────────────────────────────

interface OrderingStatus {
  enabled: boolean;
  kitchenOpen?: boolean;
  barOpen?: boolean;
  reason?: string;
  kitchenReason?: string;
  barReason?: string;
  nextOpen?: string;
  barNextOpen?: string;
  closesAt?: string;
  barClosesAt?: string;
}

// ─── Modifier modal ───────────────────────────────────────────────────────────

interface ModifierModalProps {
  item: MenuItem | null;
  onAdd: (item: MenuItem, modifiers: SelectedModifier[]) => void;
  onClose: () => void;
}

function ModifierModal({ item, onAdd, onClose }: ModifierModalProps) {
  const [selections, setSelections] = useState<Record<string, SelectedModifier>>({});

  if (!item) return null;

  const modifiers = item.modifiers ?? [];

  const toggle = (list: ModifierList, opt: { id: string; name: string; price: number }) => {
    const key = `${list.id}:${opt.id}`;
    setSelections((prev) => {
      if (list.selectionType === "SINGLE") {
        const next: Record<string, SelectedModifier> = { ...prev };
        Object.keys(next).forEach((k) => {
          if (k.startsWith(`${list.id}:`)) delete next[k];
        });
        next[key] = { catalogObjectId: opt.id, name: opt.name, price: opt.price };
        return next;
      }
      if (prev[key]) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: { catalogObjectId: opt.id, name: opt.name, price: opt.price } };
    });
  };

  const isSelected = (listId: string, optId: string) =>
    !!selections[`${listId}:${optId}`];

  const handleAdd = () => {
    onAdd(item, Object.values(selections));
    setSelections({});
    onClose();
  };

  const totalMod = Object.values(selections).reduce((s, m) => s + m.price, 0);

  return (
    <Modal visible={!!item} animationType="fade" transparent onRequestClose={onClose}>
      <Pressable style={modStyles.backdrop} onPress={onClose}>
        <Pressable style={modStyles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={modStyles.header}>
            <Text style={modStyles.itemName}>{item.name}</Text>
            {item.description ? <Text style={modStyles.itemDesc}>{item.description}</Text> : null}
            <Pressable onPress={onClose} hitSlop={12} style={modStyles.closeBtn}>
              <Ionicons name="close" size={28} color="rgba(255,255,255,0.5)" />
            </Pressable>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }}>
            {modifiers.map((list) => (
              <View key={list.id} style={modStyles.listSection}>
                <Text style={modStyles.listName}>{list.name}</Text>
                {list.selectionType === "SINGLE" && (
                  <Text style={modStyles.listHint}>Choose one</Text>
                )}
                {list.options.map((opt) => {
                  const sel = isSelected(list.id, opt.id);
                  return (
                    <Pressable
                      key={opt.id}
                      onPress={() => toggle(list, opt)}
                      style={[modStyles.option, sel && modStyles.optionSelected]}
                    >
                      <View style={[modStyles.optCheck, sel && modStyles.optCheckSelected]}>
                        {sel && <Ionicons name="checkmark" size={16} color="#fff" />}
                      </View>
                      <Text style={[modStyles.optName, sel && { color: Colors.brand.blue }]}>
                        {opt.name}
                      </Text>
                      {opt.price > 0 && (
                        <Text style={modStyles.optPrice}>+{formatPrice(opt.price)}</Text>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </ScrollView>

          <View style={modStyles.footer}>
            <Pressable style={modStyles.addBtn} onPress={handleAdd}>
              <Text style={modStyles.addBtnText}>
                Add to order — {formatPrice(item.price + totalMod)}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Menu item card ──────────────────────────────────────────────────────────

interface ItemCardProps {
  item: MenuItem;
  onPress: (item: MenuItem) => void;
  quantity: number;
  categoryClosed?: boolean;
}

function ItemCard({ item, onPress, quantity, categoryClosed }: ItemCardProps) {
  const soldOut = !!item.soldOut;
  const blocked = soldOut || !!categoryClosed;
  return (
    <Pressable
      onPress={() => !blocked && onPress(item)}
      style={({ pressed }) => [
        cardStyles.card,
        blocked && cardStyles.cardBlocked,
        pressed && !blocked && cardStyles.cardPressed,
      ]}
    >
      {item.imageUrl ? (
        <Image source={{ uri: item.imageUrl }} style={cardStyles.image} resizeMode="cover" />
      ) : (
        <View style={[cardStyles.image, cardStyles.imagePlaceholder]}>
          <Ionicons name="fast-food-outline" size={32} color="rgba(255,255,255,0.3)" />
        </View>
      )}
      <View style={cardStyles.body}>
        <Text style={cardStyles.name} numberOfLines={2}>{item.name}</Text>
        {item.description ? (
          <Text style={cardStyles.desc} numberOfLines={2}>{item.description}</Text>
        ) : null}
        <View style={cardStyles.footer}>
          <Text style={[cardStyles.price, blocked && { color: "rgba(255,255,255,0.3)" }]}>
            {soldOut ? "Sold out" : categoryClosed ? "Unavailable" : formatPrice(item.price)}
          </Text>
          {quantity > 0 && !blocked && (
            <View style={cardStyles.qtyBadge}>
              <Text style={cardStyles.qtyBadgeText}>{quantity}</Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

// ─── Closed banner ────────────────────────────────────────────────────────────

interface ClosedBannerProps {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  title: string;
  subtitle: string;
  nextOpen?: string;
  nextOpenLabel?: string;
}

function ClosedBanner({ icon, title, subtitle, nextOpen, nextOpenLabel }: ClosedBannerProps) {
  return (
    <View style={bannerStyles.wrap}>
      <Ionicons name={icon} size={22} color={Colors.brand.gold} />
      <View style={{ flex: 1 }}>
        <Text style={bannerStyles.title}>{title}</Text>
        <Text style={bannerStyles.sub}>{subtitle}</Text>
        {nextOpen ? (
          <Text style={bannerStyles.nextOpen}>
            {nextOpenLabel ?? "Back:"} {nextOpen}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function MenuScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { totalItems, addItem, getQuantity, clearCart } = useCart();
  const { showAttract, resetIdle } = useKiosk();
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null);
  const [modifierItem, setModifierItem] = useState<MenuItem | null>(null);
  const [checkoutVisible, setCheckoutVisible] = useState(false);

  const { data: categories, isLoading, error } = useQuery<MenuCategory[]>({
    queryKey: ["/api/menu"],
  });

  const { data: orderingStatus } = useQuery<OrderingStatus>({
    queryKey: ["/api/ordering-status"],
    staleTime: 5 * 1000,
    refetchInterval: 15 * 1000,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
  });

  // Defensive defaults: treat undefined as open so we never block items on
  // a stale/missing response — only block when the server explicitly says false.
  const orderingEnabled = orderingStatus?.enabled !== false;
  const kitchenOpen = orderingStatus?.kitchenOpen !== false;
  const barOpen = orderingStatus?.barOpen !== false;

  const allCategories = useMemo<MenuCategory[]>(() => {
    if (!categories) return [];
    const flat: MenuCategory[] = [];
    for (const cat of categories) {
      if (cat.kioskHidden) continue;
      const visibleItems = (cat.items ?? []).filter((i) => !i.kioskHidden);
      flat.push({ ...cat, items: visibleItems });
      if (cat.subcategories?.length) {
        for (const sub of cat.subcategories) {
          if (sub.kioskHidden) continue;
          const subItems = (sub.items ?? []).filter((i) => !i.kioskHidden);
          flat.push({ ...sub, items: subItems });
        }
      }
    }
    return flat.filter((c) => c.items?.length > 0);
  }, [categories]);

  const selectedCategory = useMemo(
    () => allCategories.find((c) => c.id === selectedCatId) ?? allCategories[0] ?? null,
    [allCategories, selectedCatId]
  );

  // Determine if the currently-selected category is unavailable.
  const selectedCatClosed = useMemo(() => {
    if (!selectedCategory) return false;
    if (!orderingEnabled) return true;
    if (selectedCategory.isKitchen && !kitchenOpen) return true;
    if (!selectedCategory.isKitchen && !barOpen) return true;
    return false;
  }, [selectedCategory, orderingEnabled, kitchenOpen, barOpen]);

  const handleItemPress = useCallback((item: MenuItem) => {
    resetIdle();
    if (item.modifiers && item.modifiers.length > 0) {
      setModifierItem(item);
    } else {
      addItem({
        variationId: item.variationId,
        itemId: item.id,
        name: item.name,
        price: item.price,
      });
    }
  }, [addItem, resetIdle]);

  const handleModifierAdd = useCallback(
    (item: MenuItem, mods: SelectedModifier[]) => {
      addItem({
        variationId: item.variationId,
        itemId: item.id,
        name: item.name,
        price: item.price,
        modifiers: mods.length > 0 ? mods : undefined,
      });
    },
    [addItem]
  );

  const handleBack = useCallback(() => {
    clearCart();
    showAttract();
    router.replace("/");
  }, [clearCart, showAttract, router]);

  const handleTouch = useCallback(() => resetIdle(), [resetIdle]);

  // Build the closed banner for the selected category (if any).
  const closedBanner = useMemo((): ClosedBannerProps | null => {
    if (!selectedCategory || !orderingEnabled) return null;
    if (selectedCategory.isKitchen && !kitchenOpen) {
      return {
        icon: "restaurant-outline",
        title: "Kitchen closed",
        subtitle: orderingStatus?.kitchenReason ?? "Food items are unavailable until the kitchen reopens.",
        nextOpen: orderingStatus?.nextOpen,
        nextOpenLabel: "Kitchen back:",
      };
    }
    if (!selectedCategory.isKitchen && !barOpen) {
      return {
        icon: "wine-outline",
        title: "Bar closed",
        subtitle: orderingStatus?.barReason ?? "Drinks are unavailable right now.",
        nextOpen: orderingStatus?.barNextOpen,
        nextOpenLabel: "Bar back:",
      };
    }
    return null;
  }, [selectedCategory, orderingEnabled, kitchenOpen, barOpen, orderingStatus]);

  return (
    <Pressable
      style={[screenStyles.root, { paddingTop: insets.top }]}
      onTouchStart={handleTouch}
    >
      {/* Header bar — frosted glass */}
      <BlurView intensity={40} tint="dark" style={screenStyles.header}>
        <Pressable onPress={handleBack} style={screenStyles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.brand.gold} />
          <Text style={screenStyles.backText}>Back</Text>
        </Pressable>

        <View style={screenStyles.headerTitle}>
          <View style={screenStyles.headerLogo}>
            <Text style={screenStyles.headerLogoText}>147</Text>
          </View>
          <Text style={screenStyles.headerName}>The 147</Text>
        </View>

        <Pressable
          onPress={() => setCheckoutVisible(true)}
          style={screenStyles.cartBtn}
          disabled={totalItems === 0}
        >
          <Ionicons
            name="cart"
            size={26}
            color={totalItems > 0 ? Colors.brand.gold : "rgba(255,255,255,0.4)"}
          />
          {totalItems > 0 && (
            <View style={screenStyles.cartBadge}>
              <Text style={screenStyles.cartBadgeText}>{totalItems}</Text>
            </View>
          )}
          {totalItems > 0 && (
            <Text style={screenStyles.cartLabel}>View Order</Text>
          )}
        </Pressable>
      </BlurView>

      {/* Body */}
      {isLoading ? (
        <View style={screenStyles.loadingWrap}>
          <ActivityIndicator size="large" color={Colors.brand.gold} />
          <Text style={screenStyles.loadingText}>Loading menu…</Text>
        </View>
      ) : error ? (
        <View style={screenStyles.loadingWrap}>
          <Ionicons name="cloud-offline-outline" size={56} color="rgba(255,255,255,0.3)" />
          <Text style={screenStyles.errorText}>Couldn't load the menu</Text>
          <Text style={screenStyles.errorSub}>Please ask a member of staff for assistance</Text>
        </View>
      ) : (
        <View style={screenStyles.body}>
          {/* Sidebar — frosted glass */}
          <BlurView intensity={20} tint="dark" style={screenStyles.sidebar}>
            <ScrollView showsVerticalScrollIndicator={false}>
              {allCategories.map((cat) => {
                const active = cat.id === (selectedCategory?.id ?? null);
                const catClosed =
                  !orderingEnabled ||
                  (cat.isKitchen ? !kitchenOpen : !barOpen);
                return (
                  <Pressable
                    key={cat.id}
                    onPress={() => { resetIdle(); setSelectedCatId(cat.id); }}
                    style={[sidebarStyles.item, active && sidebarStyles.itemActive]}
                  >
                    <Text
                      style={[
                        sidebarStyles.itemText,
                        active && sidebarStyles.itemTextActive,
                        catClosed && sidebarStyles.itemTextClosed,
                      ]}
                    >
                      {cat.name}
                    </Text>
                    {catClosed && (
                      <Ionicons
                        name="lock-closed-outline"
                        size={12}
                        color="rgba(255,255,255,0.3)"
                        style={{ marginTop: 2 }}
                      />
                    )}
                    {active && <View style={sidebarStyles.activeIndicator} />}
                  </Pressable>
                );
              })}
            </ScrollView>
          </BlurView>

          {/* Item grid */}
          <View style={screenStyles.grid}>
            {selectedCategory ? (
              <FlatList
                key={selectedCategory.id}
                data={selectedCategory.items}
                keyExtractor={(item) => item.variationId}
                numColumns={3}
                columnWrapperStyle={{ gap: 14 }}
                contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: insets.bottom + 20 }}
                renderItem={({ item }) => (
                  <View style={{ flex: 1 }}>
                    <ItemCard
                      item={item}
                      onPress={handleItemPress}
                      quantity={getQuantity(item.variationId)}
                      categoryClosed={selectedCatClosed}
                    />
                  </View>
                )}
                ListHeaderComponent={
                  <View>
                    <View style={screenStyles.catHeader}>
                      <Text style={screenStyles.catName}>{selectedCategory.name}</Text>
                      {selectedCategory.isKitchen && (
                        <View style={screenStyles.kitchenTag}>
                          <Ionicons name="flame-outline" size={14} color={Colors.brand.gold} />
                          <Text style={screenStyles.kitchenTagText}>Kitchen</Text>
                        </View>
                      )}
                    </View>
                    {closedBanner && (
                      <ClosedBanner
                        icon={closedBanner.icon}
                        title={closedBanner.title}
                        subtitle={closedBanner.subtitle}
                        nextOpen={closedBanner.nextOpen}
                        nextOpenLabel={closedBanner.nextOpenLabel}
                      />
                    )}
                  </View>
                }
                showsVerticalScrollIndicator={false}
              />
            ) : (
              <View style={screenStyles.loadingWrap}>
                <Text style={screenStyles.loadingText}>No items found</Text>
              </View>
            )}
          </View>
        </View>
      )}

      {/* Modifier modal */}
      <ModifierModal
        item={modifierItem}
        onAdd={handleModifierAdd}
        onClose={() => setModifierItem(null)}
      />

      {/* Checkout sheet */}
      <KioskCheckoutSheet
        visible={checkoutVisible}
        onClose={() => setCheckoutVisible(false)}
      />
    </Pressable>
  );
}

const screenStyles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.brand.dark,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: "rgba(10,22,40,0.65)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
    overflow: "hidden",
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 4,
    minWidth: 80,
  },
  backText: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.brand.gold,
  },
  headerTitle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerLogo: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: Colors.brand.blue,
    alignItems: "center",
    justifyContent: "center",
  },
  headerLogoText: {
    fontSize: 14,
    fontWeight: "900",
    color: "#fff",
  },
  headerName: {
    fontSize: 20,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: 1,
  },
  cartBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: "rgba(212,168,67,0.12)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(212,168,67,0.3)",
    minWidth: 80,
    justifyContent: "center",
    position: "relative",
  },
  cartBadge: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.brand.blue,
    alignItems: "center",
    justifyContent: "center",
  },
  cartBadgeText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#fff",
  },
  cartLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.brand.gold,
  },
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  loadingText: {
    fontSize: 20,
    color: "rgba(255,255,255,0.5)",
  },
  errorText: {
    fontSize: 22,
    fontWeight: "700",
    color: "#fff",
    textAlign: "center",
  },
  errorSub: {
    fontSize: 16,
    color: "rgba(255,255,255,0.5)",
    textAlign: "center",
  },
  body: {
    flex: 1,
    flexDirection: "row",
  },
  sidebar: {
    width: 180,
    backgroundColor: "rgba(19,39,66,0.55)",
    borderRightWidth: 1,
    borderRightColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
  },
  grid: {
    flex: 1,
    backgroundColor: "#0D1F38",
  },
  catHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 4,
  },
  catName: {
    fontSize: 22,
    fontWeight: "800",
    color: "#fff",
  },
  kitchenTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(212,168,67,0.12)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(212,168,67,0.3)",
  },
  kitchenTagText: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.brand.gold,
  },
});

const sidebarStyles = StyleSheet.create({
  item: {
    paddingVertical: 18,
    paddingHorizontal: 20,
    position: "relative",
  },
  itemActive: {
    backgroundColor: "rgba(0,71,171,0.22)",
  },
  itemText: {
    fontSize: 15,
    fontWeight: "500",
    color: "rgba(255,255,255,0.55)",
  },
  itemTextActive: {
    color: "#fff",
    fontWeight: "700",
  },
  itemTextClosed: {
    color: "rgba(255,255,255,0.28)",
  },
  activeIndicator: {
    position: "absolute",
    left: 0,
    top: 8,
    bottom: 8,
    width: 3,
    borderRadius: 2,
    backgroundColor: Colors.brand.blue,
  },
});

const cardStyles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    shadowColor: "#000",
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 4,
  },
  cardBlocked: {
    opacity: 0.45,
  },
  cardPressed: {
    opacity: 0.82,
  },
  image: {
    width: "100%",
    aspectRatio: 4 / 3,
  },
  imagePlaceholder: {
    backgroundColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    padding: 12,
    flex: 1,
    justifyContent: "space-between",
    gap: 4,
  },
  name: {
    fontSize: 15,
    fontWeight: "700",
    color: "#fff",
  },
  desc: {
    fontSize: 12,
    color: "rgba(255,255,255,0.5)",
    lineHeight: 16,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
  },
  price: {
    fontSize: 16,
    fontWeight: "800",
    color: Colors.brand.gold,
  },
  qtyBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.brand.blue,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyBadgeText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#fff",
  },
});

const bannerStyles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "rgba(212,168,67,0.1)",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(212,168,67,0.25)",
  },
  title: {
    fontSize: 15,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 2,
  },
  sub: {
    fontSize: 13,
    color: "rgba(255,255,255,0.6)",
  },
  nextOpen: {
    fontSize: 12,
    color: Colors.brand.gold,
    marginTop: 4,
    fontWeight: "600",
  },
});

const modStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    alignItems: "center",
    justifyContent: "center",
  },
  sheet: {
    backgroundColor: "rgba(12,24,44,0.95)",
    borderRadius: 24,
    overflow: "hidden",
    width: "85%",
    maxWidth: 560,
    maxHeight: "82%",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    shadowColor: "#000",
    shadowOpacity: 0.6,
    shadowRadius: 40,
    elevation: 24,
  },
  header: {
    padding: 24,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
    position: "relative",
  },
  itemName: {
    fontSize: 22,
    fontWeight: "800",
    color: "#fff",
    paddingRight: 36,
  },
  itemDesc: {
    fontSize: 14,
    color: "rgba(255,255,255,0.55)",
    marginTop: 4,
    paddingRight: 36,
  },
  closeBtn: {
    position: "absolute",
    top: 20,
    right: 20,
  },
  listSection: {
    paddingHorizontal: 24,
    paddingTop: 20,
    gap: 8,
  },
  listName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 2,
  },
  listHint: {
    fontSize: 12,
    color: "rgba(255,255,255,0.4)",
    marginBottom: 4,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  optionSelected: {
    backgroundColor: "rgba(0,71,171,0.18)",
    borderColor: "rgba(0,71,171,0.4)",
  },
  optCheck: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  optCheckSelected: {
    backgroundColor: Colors.brand.blue,
    borderColor: Colors.brand.blue,
  },
  optName: {
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
    color: "#fff",
  },
  optPrice: {
    fontSize: 14,
    fontWeight: "600",
    color: "rgba(255,255,255,0.55)",
  },
  footer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
  },
  addBtn: {
    backgroundColor: Colors.brand.blue,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.25)",
  },
  addBtnText: {
    fontSize: 17,
    fontWeight: "700",
    color: "#fff",
  },
});
