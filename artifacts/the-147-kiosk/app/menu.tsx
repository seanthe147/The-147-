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
              <Ionicons name="close" size={28} color={Colors.light.textSecondary} />
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
}

function ItemCard({ item, onPress, quantity }: ItemCardProps) {
  const soldOut = !!item.soldOut;
  return (
    <Pressable
      onPress={() => !soldOut && onPress(item)}
      style={({ pressed }) => [
        cardStyles.card,
        soldOut && cardStyles.cardSoldOut,
        pressed && !soldOut && { opacity: 0.85 },
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
          <Text style={[cardStyles.price, soldOut && { color: Colors.light.textSecondary }]}>
            {soldOut ? "Sold out" : formatPrice(item.price)}
          </Text>
          {quantity > 0 && !soldOut && (
            <View style={cardStyles.qtyBadge}>
              <Text style={cardStyles.qtyBadgeText}>{quantity}</Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
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

  const allCategories = useMemo<MenuCategory[]>(() => {
    if (!categories) return [];
    const flat: MenuCategory[] = [];
    for (const cat of categories) {
      flat.push(cat);
      if (cat.subcategories?.length) flat.push(...cat.subcategories);
    }
    return flat.filter((c) => c.items?.length > 0);
  }, [categories]);

  const selectedCategory = useMemo(
    () => allCategories.find((c) => c.id === selectedCatId) ?? allCategories[0] ?? null,
    [allCategories, selectedCatId]
  );

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

  return (
    <Pressable
      style={[screenStyles.root, { paddingTop: insets.top }]}
      onTouchStart={handleTouch}
    >
      {/* Header bar */}
      <View style={screenStyles.header}>
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
      </View>

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
          {/* Sidebar */}
          <View style={screenStyles.sidebar}>
            <ScrollView showsVerticalScrollIndicator={false}>
              {allCategories.map((cat) => {
                const active = cat.id === (selectedCategory?.id ?? null);
                return (
                  <Pressable
                    key={cat.id}
                    onPress={() => { resetIdle(); setSelectedCatId(cat.id); }}
                    style={[sidebarStyles.item, active && sidebarStyles.itemActive]}
                  >
                    <Text style={[sidebarStyles.itemText, active && sidebarStyles.itemTextActive]}>
                      {cat.name}
                    </Text>
                    {active && <View style={sidebarStyles.activeIndicator} />}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

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
                    />
                  </View>
                )}
                ListHeaderComponent={
                  <View style={screenStyles.catHeader}>
                    <Text style={screenStyles.catName}>{selectedCategory.name}</Text>
                    {selectedCategory.isKitchen && (
                      <View style={screenStyles.kitchenTag}>
                        <Ionicons name="flame-outline" size={14} color={Colors.brand.gold} />
                        <Text style={screenStyles.kitchenTagText}>Kitchen</Text>
                      </View>
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
    backgroundColor: Colors.brand.navy,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
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
    backgroundColor: Colors.brand.navy,
    borderRightWidth: 1,
    borderRightColor: "rgba(255,255,255,0.08)",
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
    backgroundColor: "rgba(0,71,171,0.2)",
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
  activeIndicator: {
    position: "absolute",
    left: 0,
    top: 8,
    bottom: 8,
    width: 3,
    borderRadius: 2,
    backgroundColor: Colors.brand.gold,
  },
});

const cardStyles = StyleSheet.create({
  card: {
    backgroundColor: Colors.brand.navy,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  cardSoldOut: {
    opacity: 0.45,
  },
  image: {
    width: "100%",
    height: 130,
    backgroundColor: "#1a2f4a",
  },
  imagePlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    padding: 12,
    gap: 4,
  },
  name: {
    fontSize: 15,
    fontWeight: "700",
    color: "#fff",
    lineHeight: 20,
  },
  desc: {
    fontSize: 12,
    color: "rgba(255,255,255,0.45)",
    lineHeight: 16,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 6,
  },
  price: {
    fontSize: 16,
    fontWeight: "800",
    color: Colors.brand.gold,
  },
  qtyBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.brand.blue,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyBadgeText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#fff",
  },
});

const modStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
  },
  sheet: {
    width: "90%",
    maxWidth: 600,
    maxHeight: "85%",
    backgroundColor: "#fff",
    borderRadius: 24,
    overflow: "hidden",
  },
  header: {
    padding: 24,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
    position: "relative",
  },
  itemName: {
    fontSize: 22,
    fontWeight: "800",
    color: Colors.light.text,
    paddingRight: 40,
  },
  itemDesc: {
    fontSize: 14,
    color: Colors.light.textSecondary,
    marginTop: 4,
  },
  closeBtn: {
    position: "absolute",
    top: 20,
    right: 20,
  },
  listSection: {
    paddingHorizontal: 24,
    paddingTop: 20,
  },
  listName: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.light.text,
    marginBottom: 2,
  },
  listHint: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    marginBottom: 10,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.light.border,
    marginBottom: 8,
    gap: 12,
  },
  optionSelected: {
    borderColor: Colors.brand.blue,
    backgroundColor: "#EFF6FF",
  },
  optCheck: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.light.border,
    alignItems: "center",
    justifyContent: "center",
  },
  optCheckSelected: {
    backgroundColor: Colors.brand.blue,
    borderColor: Colors.brand.blue,
  },
  optName: {
    flex: 1,
    fontSize: 16,
    color: Colors.light.text,
  },
  optPrice: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.light.textSecondary,
  },
  footer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
  },
  addBtn: {
    backgroundColor: Colors.brand.blue,
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: "center",
  },
  addBtnText: {
    fontSize: 18,
    fontWeight: "800",
    color: "#fff",
  },
});
