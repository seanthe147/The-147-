import React, { useState, useEffect, useMemo } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  TextInput,
  Platform,
  Alert,
  ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useResponsive } from "@/hooks/useResponsive";
import { router } from "expo-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/query-client";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import Colors from "@/constants/colors";
import type { Offer } from "@shared/schema";

const ICON_OPTIONS: Array<{ name: string; label: string }> = [
  { name: "beer", label: "Beer" },
  { name: "heart", label: "Heart" },
  { name: "school", label: "Student" },
  { name: "pricetag", label: "Tag" },
  { name: "gift", label: "Gift" },
  { name: "star", label: "Star" },
  { name: "restaurant", label: "Food" },
  { name: "cafe", label: "Coffee" },
  { name: "musical-notes", label: "Music" },
  { name: "trophy", label: "Trophy" },
];

const COLOR_PRESETS: Array<{ start: string; end: string; label: string }> = [
  { start: "#0047AB", end: "#1E6FD9", label: "Blue" },
  { start: "#DC2626", end: "#F87171", label: "Red" },
  { start: "#059669", end: "#34D399", label: "Green" },
  { start: "#7C3AED", end: "#A78BFA", label: "Purple" },
  { start: "#B45309", end: "#F59E0B", label: "Amber" },
  { start: "#0F766E", end: "#2DD4BF", label: "Teal" },
];

interface OfferForm {
  title: string;
  subtitle: string;
  discount: string;
  validUntil: string;
  gradientStart: string;
  gradientEnd: string;
  icon: string;
  linkUrl: string;
  linkType: string;
}

const emptyForm: OfferForm = {
  title: "",
  subtitle: "",
  discount: "",
  validUntil: "",
  gradientStart: "#0047AB",
  gradientEnd: "#1E6FD9",
  icon: "pricetag",
  linkUrl: "",
  linkType: "",
};

interface MenuItem {
  id: string;
  name: string;
  price: number;
}
interface MenuCategory {
  id: string;
  name: string;
  items: MenuItem[];
}

function OfferPreview({ form }: { form: OfferForm }) {
  return (
    <View style={styles.previewCard}>
      <LinearGradient
        colors={[form.gradientStart || "#0047AB", form.gradientEnd || "#1E6FD9"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.previewGradient}
      >
        <View style={styles.previewIconRow}>
          <View style={styles.previewIconCircle}>
            <Ionicons
              name={(form.icon || "pricetag") as keyof typeof Ionicons.glyphMap}
              size={20}
              color="#FFFFFF"
            />
          </View>
          {form.discount ? (
            <View style={styles.previewBadge}>
              <Text style={styles.previewBadgeText}>{form.discount}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.previewTitle}>{form.title || "Offer Title"}</Text>
        <Text style={styles.previewSubtitle}>{form.subtitle || "Offer description"}</Text>
        {form.validUntil ? (
          <View style={styles.previewFooter}>
            <Ionicons name="calendar-outline" size={11} color="rgba(255,255,255,0.7)" />
            <Text style={styles.previewValidText}>{form.validUntil}</Text>
          </View>
        ) : null}
      </LinearGradient>
    </View>
  );
}

export default function AdminOffersScreen() {
  const insets = useSafeAreaInsets();
  const { tabletPad } = useResponsive();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const { isAuthenticated, isLoading: authLoading } = useStaffAuth();

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/staff-portal");
    }
  }, [authLoading, isAuthenticated]);

  const [form, setForm] = useState<OfferForm>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [pickerCat, setPickerCat] = useState<string | null>(null);

  const STAFF_OFFERS_KEY = ["/api/staff/offers"];

  const { data: menuCategories } = useQuery<MenuCategory[]>({
    queryKey: ["/api/menu"],
    enabled: showForm && form.linkType === "order_item",
  });

  const allMenuItems = useMemo(() => {
    if (!menuCategories) return [];
    return menuCategories.flatMap((c) => c.items.map((i) => ({ ...i, catId: c.id, catName: c.name })));
  }, [menuCategories]);

  const pickerCatItems = useMemo(() => {
    if (!pickerCat || !menuCategories) return [];
    return menuCategories.find((c) => c.id === pickerCat)?.items ?? [];
  }, [pickerCat, menuCategories]);

  const { data: offers, isLoading } = useQuery<Offer[]>({
    queryKey: STAFF_OFFERS_KEY,
  });

  const createMutation = useMutation({
    mutationFn: (data: OfferForm) => apiRequest("POST", "/api/offers", data),
    onSuccess: async () => {
      await queryClient.refetchQueries({ queryKey: STAFF_OFFERS_KEY });
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: OfferForm }) =>
      apiRequest("PUT", `/api/offers/${id}`, data),
    onSuccess: async () => {
      await queryClient.refetchQueries({ queryKey: STAFF_OFFERS_KEY });
      resetForm();
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (id: number) => apiRequest("PATCH", `/api/staff/offers/${id}/toggle`, {}),
    onSuccess: async () => {
      await queryClient.refetchQueries({ queryKey: STAFF_OFFERS_KEY });
    },
    onError: () => {
      Alert.alert("Error", "Failed to update offer status.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/offers/${id}`);
      return id;
    },
    onSuccess: async () => {
      await queryClient.refetchQueries({ queryKey: STAFF_OFFERS_KEY });
    },
    onError: () => {
      Alert.alert("Error", "Failed to delete offer. Please try again.");
    },
  });

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(false);
  }

  function startEdit(offer: Offer) {
    setForm({
      title: offer.title,
      subtitle: offer.subtitle,
      discount: offer.discount,
      validUntil: offer.validUntil,
      gradientStart: offer.gradientStart,
      gradientEnd: offer.gradientEnd,
      icon: offer.icon,
      linkUrl: (offer as any).linkUrl ?? "",
      linkType: (offer as any).linkType ?? "",
    });
    setEditingId(offer.id);
    setShowForm(true);
  }

  function handleSave() {
    if (!form.title.trim() || !form.discount.trim()) {
      Alert.alert("Missing Info", "Please fill in at least the title and discount.");
      return;
    }
    if (editingId !== null) {
      updateMutation.mutate({ id: editingId, data: form });
    } else {
      createMutation.mutate(form);
    }
  }

  function handleDelete(id: number) {
    if (Platform.OS === "web") {
      const confirmed = window.confirm("Are you sure you want to remove this offer?");
      if (confirmed) {
        deleteMutation.mutate(id);
      }
    } else {
      Alert.alert("Delete Offer", "Are you sure you want to remove this offer?", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteMutation.mutate(id),
        },
      ]);
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={28} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Manage Offers</Text>
        <Pressable
          onPress={() => {
            if (showForm) {
              resetForm();
            } else {
              setShowForm(true);
            }
          }}
          hitSlop={12}
        >
          <Ionicons
            name={showForm ? "close-circle" : "add-circle"}
            size={28}
            color={Colors.brand.blue}
          />
        </Pressable>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={[styles.scrollContent, { marginHorizontal: tabletPad }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {showForm && (
          <View style={styles.formContainer}>
            <Text style={styles.formHeading}>
              {editingId !== null ? "Edit Offer" : "New Offer"}
            </Text>

            <OfferPreview form={form} />

            <Text style={styles.fieldLabel}>Title</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Happy Hour"
              placeholderTextColor="#9CA3AF"
              value={form.title}
              onChangeText={(t) => setForm((f) => ({ ...f, title: t }))}
            />

            <Text style={styles.fieldLabel}>Description</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 50% off all drinks Mon-Thu"
              placeholderTextColor="#9CA3AF"
              value={form.subtitle}
              onChangeText={(t) => setForm((f) => ({ ...f, subtitle: t }))}
            />

            <Text style={styles.fieldLabel}>Discount / Price</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 50% OFF or £39.99"
              placeholderTextColor="#9CA3AF"
              value={form.discount}
              onChangeText={(t) => setForm((f) => ({ ...f, discount: t }))}
            />

            <Text style={styles.fieldLabel}>Valid Until</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Ongoing, Every Friday"
              placeholderTextColor="#9CA3AF"
              value={form.validUntil}
              onChangeText={(t) => setForm((f) => ({ ...f, validUntil: t }))}
            />

            <Text style={styles.fieldLabel}>Link <Text style={styles.fieldLabelOptional}>(optional — make the card tappable)</Text></Text>
            <View style={styles.linkTypeRow}>
              {[
                { val: "", label: "None" },
                { val: "url", label: "Website URL" },
                { val: "order_item", label: "Menu item" },
              ].map((opt) => (
                <Pressable
                  key={opt.val}
                  onPress={() => setForm((f) => ({ ...f, linkType: opt.val, linkUrl: "" }))}
                  style={[styles.linkTypeBtn, form.linkType === opt.val && styles.linkTypeBtnActive]}
                >
                  <Text style={[styles.linkTypeBtnText, form.linkType === opt.val && styles.linkTypeBtnTextActive]}>
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {form.linkType === "url" && (
              <>
                <TextInput
                  style={[styles.input, { marginTop: 8 }]}
                  placeholder="https://the147bradford.co.uk/menu"
                  placeholderTextColor="#9CA3AF"
                  value={form.linkUrl}
                  onChangeText={(t) => setForm((f) => ({ ...f, linkUrl: t }))}
                  autoCapitalize="none"
                  keyboardType="url"
                  autoCorrect={false}
                />
                {form.linkUrl ? (
                  <View style={styles.linkHint}>
                    <Ionicons name="link-outline" size={13} color={Colors.brand.blue} />
                    <Text style={styles.linkHintText}>Opens in browser when customer taps the card</Text>
                  </View>
                ) : null}
              </>
            )}

            {form.linkType === "order_item" && (
              <View style={styles.menuPicker}>
                {!menuCategories ? (
                  <ActivityIndicator size="small" color={Colors.brand.blue} style={{ marginTop: 8 }} />
                ) : (
                  <>
                    {form.linkUrl ? (
                      <View style={styles.selectedItemRow}>
                        <Ionicons name="fast-food-outline" size={14} color={Colors.brand.blue} />
                        <Text style={styles.selectedItemText} numberOfLines={1}>
                          {form.linkUrl.split("|")[2] || "Selected"} — {menuCategories.find(c => c.id === form.linkUrl.split("|")[0])?.name}
                        </Text>
                        <Pressable onPress={() => { setForm((f) => ({ ...f, linkUrl: "" })); setPickerCat(null); }}>
                          <Ionicons name="close-circle" size={16} color={Colors.brand.red} />
                        </Pressable>
                      </View>
                    ) : null}
                    <Text style={[styles.fieldLabel, { marginTop: 8, fontSize: 11 }]}>Pick a category:</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                      <View style={{ flexDirection: "row", gap: 6 }}>
                        {menuCategories.map((cat) => (
                          <Pressable
                            key={cat.id}
                            onPress={() => setPickerCat(cat.id)}
                            style={[styles.linkTypeBtn, pickerCat === cat.id && styles.linkTypeBtnActive]}
                          >
                            <Text style={[styles.linkTypeBtnText, pickerCat === cat.id && styles.linkTypeBtnTextActive]}>
                              {cat.name}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    </ScrollView>
                    {pickerCat && pickerCatItems.length > 0 && (
                      <View style={styles.itemPickerList}>
                        {pickerCatItems.map((item) => (
                          <Pressable
                            key={item.id}
                            onPress={() => {
                              setForm((f) => ({ ...f, linkUrl: `${pickerCat}|${item.id}|${item.name}` }));
                            }}
                            style={[styles.itemPickerRow, form.linkUrl === `${pickerCat}|${item.id}|${item.name}` && styles.itemPickerRowSelected]}
                          >
                            <Text style={styles.itemPickerName}>{item.name}</Text>
                            <Text style={styles.itemPickerPrice}>£{(item.price / 100).toFixed(2)}</Text>
                            {form.linkUrl === `${pickerCat}|${item.id}|${item.name}` && (
                              <Ionicons name="checkmark-circle" size={16} color={Colors.brand.blue} />
                            )}
                          </Pressable>
                        ))}
                      </View>
                    )}
                    {form.linkUrl && (
                      <View style={styles.linkHint}>
                        <Ionicons name="fast-food-outline" size={13} color={Colors.brand.blue} />
                        <Text style={styles.linkHintText}>Tapping opens the Order tab with this item highlighted</Text>
                      </View>
                    )}
                  </>
                )}
              </View>
            )}

            <Text style={styles.fieldLabel}>Icon</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.optionScroll}>
              {ICON_OPTIONS.map((opt) => (
                <Pressable
                  key={opt.name}
                  onPress={() => setForm((f) => ({ ...f, icon: opt.name }))}
                  style={[
                    styles.iconOption,
                    form.icon === opt.name && styles.iconOptionSelected,
                  ]}
                >
                  <Ionicons
                    name={opt.name as keyof typeof Ionicons.glyphMap}
                    size={20}
                    color={form.icon === opt.name ? Colors.brand.blue : "#6B7280"}
                  />
                  <Text
                    style={[
                      styles.iconOptionLabel,
                      form.icon === opt.name && { color: Colors.brand.blue },
                    ]}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <Text style={styles.fieldLabel}>Color Theme</Text>
            <View style={styles.colorGrid}>
              {COLOR_PRESETS.map((preset) => (
                <Pressable
                  key={preset.label}
                  onPress={() =>
                    setForm((f) => ({
                      ...f,
                      gradientStart: preset.start,
                      gradientEnd: preset.end,
                    }))
                  }
                  style={[
                    styles.colorOption,
                    form.gradientStart === preset.start && styles.colorOptionSelected,
                  ]}
                >
                  <LinearGradient
                    colors={[preset.start, preset.end]}
                    style={styles.colorSwatch}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                  />
                  <Text
                    style={[
                      styles.colorLabel,
                      form.gradientStart === preset.start && { color: Colors.brand.blue },
                    ]}
                  >
                    {preset.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.formActions}>
              <Pressable
                onPress={resetForm}
                style={[styles.formButton, styles.cancelButton]}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleSave}
                disabled={isSaving}
                style={[styles.formButton, styles.saveButton, isSaving && { opacity: 0.6 }]}
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveButtonText}>
                    {editingId !== null ? "Update" : "Create"}
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        )}

        {isLoading ? (
          <ActivityIndicator size="large" color={Colors.brand.blue} style={{ marginTop: 40 }} />
        ) : offers && offers.length > 0 ? (
          <View style={styles.offerList}>
            <View style={styles.listHeader}>
              <Text style={styles.listHeading}>All Offers</Text>
              <View style={styles.listStats}>
                <View style={styles.statPill}>
                  <View style={[styles.statDot, { backgroundColor: "#16A34A" }]} />
                  <Text style={styles.statText}>{offers.filter((o) => o.active).length} live</Text>
                </View>
                {offers.filter((o) => !o.active).length > 0 && (
                  <View style={styles.statPill}>
                    <View style={[styles.statDot, { backgroundColor: "#9CA3AF" }]} />
                    <Text style={styles.statText}>{offers.filter((o) => !o.active).length} hidden</Text>
                  </View>
                )}
              </View>
            </View>
            {offers.map((offer) => {
              const isToggling = toggleMutation.isPending && toggleMutation.variables === offer.id;
              return (
                <View key={offer.id} style={[styles.offerRow, !offer.active && styles.offerRowInactive]}>
                  <LinearGradient
                    colors={offer.active ? [offer.gradientStart, offer.gradientEnd] : ["#D1D5DB", "#9CA3AF"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.offerRowGradient}
                  >
                    <Ionicons
                      name={offer.icon as keyof typeof Ionicons.glyphMap}
                      size={20}
                      color="#FFFFFF"
                    />
                  </LinearGradient>

                  <View style={styles.offerRowInfo}>
                    <Text style={[styles.offerRowTitle, !offer.active && styles.offerRowTitleInactive]}>
                      {offer.title}
                    </Text>
                    <Text style={styles.offerRowSub}>{offer.discount}</Text>
                  </View>

                  <Pressable
                    onPress={() => toggleMutation.mutate(offer.id)}
                    disabled={isToggling}
                    style={[styles.toggleBtn, offer.active ? styles.toggleBtnLive : styles.toggleBtnHidden]}
                    testID={`toggle-offer-${offer.id}`}
                  >
                    {isToggling ? (
                      <ActivityIndicator size="small" color={offer.active ? "#16A34A" : "#9CA3AF"} />
                    ) : (
                      <>
                        <Ionicons
                          name={offer.active ? "eye" : "eye-off"}
                          size={13}
                          color={offer.active ? "#16A34A" : "#6B7280"}
                        />
                        <Text style={[styles.toggleBtnText, offer.active ? styles.toggleBtnTextLive : styles.toggleBtnTextHidden]}>
                          {offer.active ? "Live" : "Hidden"}
                        </Text>
                      </>
                    )}
                  </Pressable>

                  <Pressable
                    onPress={() => startEdit(offer)}
                    style={styles.offerRowAction}
                    testID={`edit-offer-${offer.id}`}
                  >
                    <Ionicons name="create-outline" size={21} color={Colors.brand.blue} />
                  </Pressable>
                  <Pressable
                    onPress={() => handleDelete(offer.id)}
                    style={styles.offerRowAction}
                    testID={`delete-offer-${offer.id}`}
                  >
                    <Ionicons name="trash-outline" size={21} color={Colors.brand.red} />
                  </Pressable>
                </View>
              );
            })}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="pricetag-outline" size={48} color="#D1D5DB" />
            <Text style={styles.emptyText}>No offers yet</Text>
            <Text style={styles.emptySubtext}>
              Tap the + button above to create your first offer
            </Text>
          </View>
        )}

        <View style={{ height: Platform.OS === "web" ? 34 : 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
  },
  headerTitle: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 18,
    color: Colors.light.text,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  formContainer: {
    backgroundColor: Colors.light.surface,
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  formHeading: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 18,
    color: Colors.light.text,
    marginBottom: 16,
  },
  previewCard: {
    borderRadius: 14,
    overflow: "hidden",
    marginBottom: 20,
    elevation: 3,
    boxShadow: "0px 2px 6px rgba(0,0,0,0.12)",
  },
  previewGradient: {
    padding: 16,
    minHeight: 120,
    justifyContent: "space-between",
  },
  previewIconRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  previewIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  previewBadge: {
    backgroundColor: "rgba(255,255,255,0.25)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  previewBadgeText: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 12,
    color: "#FFFFFF",
  },
  previewTitle: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 16,
    color: "#FFFFFF",
    marginBottom: 3,
  },
  previewSubtitle: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 12,
    color: "rgba(255,255,255,0.85)",
    marginBottom: 8,
  },
  previewFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  previewValidText: {
    fontFamily: "Montserrat_500Medium",
    fontSize: 10,
    color: "rgba(255,255,255,0.7)",
  },
  fieldLabel: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 13,
    color: Colors.light.textSecondary,
    marginBottom: 6,
    marginTop: 12,
  },
  fieldLabelOptional: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 12,
    color: Colors.light.textSecondary,
  },
  linkHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 6,
    marginBottom: 2,
  },
  linkHintText: {
    fontFamily: "Montserrat_500Medium",
    fontSize: 12,
    color: Colors.brand.blue,
    flex: 1,
  },
  linkTypeRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
    flexWrap: "wrap",
  },
  linkTypeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surfaceElevated,
  },
  linkTypeBtnActive: {
    backgroundColor: Colors.brand.blue,
    borderColor: Colors.brand.blue,
  },
  linkTypeBtnText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 12,
    color: Colors.light.textSecondary,
  },
  linkTypeBtnTextActive: {
    color: "#fff",
  },
  menuPicker: {
    marginTop: 8,
    backgroundColor: Colors.light.surfaceElevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.light.border,
    padding: 12,
  },
  selectedItemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.brand.blue + "12",
    borderRadius: 8,
    padding: 8,
    marginBottom: 4,
  },
  selectedItemText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 12,
    color: Colors.brand.blue,
    flex: 1,
  },
  itemPickerList: {
    borderRadius: 8,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  itemPickerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: Colors.light.background,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
    gap: 8,
  },
  itemPickerRowSelected: {
    backgroundColor: Colors.brand.blue + "0F",
  },
  itemPickerName: {
    fontFamily: "Montserrat_500Medium",
    fontSize: 13,
    color: Colors.light.text,
    flex: 1,
  },
  itemPickerPrice: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 12,
    color: Colors.light.textSecondary,
  },
  input: {
    backgroundColor: Colors.light.surfaceElevated,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: "Montserrat_400Regular",
    fontSize: 15,
    color: Colors.light.text,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  optionScroll: {
    marginBottom: 4,
  },
  iconOption: {
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    marginRight: 8,
    backgroundColor: Colors.light.surfaceElevated,
    borderWidth: 1.5,
    borderColor: "transparent",
    minWidth: 60,
  },
  iconOptionSelected: {
    borderColor: Colors.brand.blue,
    backgroundColor: Colors.brand.blue + "10",
  },
  iconOptionLabel: {
    fontFamily: "Montserrat_500Medium",
    fontSize: 10,
    color: "#6B7280",
    marginTop: 4,
  },
  colorGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 4,
  },
  colorOption: {
    alignItems: "center",
    padding: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "transparent",
    width: 70,
  },
  colorOptionSelected: {
    borderColor: Colors.brand.blue,
    backgroundColor: Colors.brand.blue + "10",
  },
  colorSwatch: {
    width: 36,
    height: 24,
    borderRadius: 6,
    marginBottom: 4,
  },
  colorLabel: {
    fontFamily: "Montserrat_500Medium",
    fontSize: 10,
    color: "#6B7280",
  },
  formActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 20,
  },
  formButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelButton: {
    backgroundColor: Colors.light.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  cancelButtonText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 15,
    color: Colors.light.textSecondary,
  },
  saveButton: {
    backgroundColor: Colors.brand.blue,
  },
  saveButtonText: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 15,
    color: "#FFFFFF",
  },
  offerList: {
    marginTop: 4,
  },
  listHeader: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", marginBottom: 12,
  },
  listHeading: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 16,
    color: Colors.light.text,
  },
  listStats: { flexDirection: "row", gap: 8 },
  statPill: {
    flexDirection: "row", alignItems: "center",
    gap: 5, backgroundColor: "#F3F4F6",
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
  },
  statDot: { width: 7, height: 7, borderRadius: 3.5 },
  statText: { fontFamily: "Montserrat_500Medium", fontSize: 12, color: Colors.light.textSecondary },
  offerRowInactive: { opacity: 0.6 },
  offerRowTitleInactive: { color: Colors.light.textSecondary },
  toggleBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 9, paddingVertical: 5,
    borderRadius: 8, borderWidth: 1,
  },
  toggleBtnLive: { backgroundColor: "#F0FDF4", borderColor: "#86EFAC" },
  toggleBtnHidden: { backgroundColor: "#F9FAFB", borderColor: "#D1D5DB" },
  toggleBtnText: { fontFamily: "Montserrat_600SemiBold", fontSize: 12 },
  toggleBtnTextLive: { color: "#16A34A" },
  toggleBtnTextHidden: { color: "#6B7280" },
  offerRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.light.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.light.border,
    gap: 12,
  },
  offerRowGradient: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  offerRowInfo: {
    flex: 1,
  },
  offerRowTitle: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 15,
    color: Colors.light.text,
  },
  offerRowSub: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 13,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  offerRowAction: {
    padding: 10,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 60,
    gap: 8,
  },
  emptyText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 16,
    color: Colors.light.textSecondary,
  },
  emptySubtext: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 13,
    color: "#9CA3AF",
    textAlign: "center",
  },
});
