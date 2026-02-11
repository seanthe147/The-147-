import React, { useState } from "react";
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
import { router } from "expo-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/query-client";
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
}

const emptyForm: OfferForm = {
  title: "",
  subtitle: "",
  discount: "",
  validUntil: "",
  gradientStart: "#0047AB",
  gradientEnd: "#1E6FD9",
  icon: "pricetag",
};

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
  const webTopInset = Platform.OS === "web" ? 67 : 0;

  const [form, setForm] = useState<OfferForm>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);

  const { data: offers, isLoading } = useQuery<Offer[]>({
    queryKey: ["/api/offers"],
  });

  const createMutation = useMutation({
    mutationFn: (data: OfferForm) => apiRequest("POST", "/api/offers", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/offers"] });
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: OfferForm }) =>
      apiRequest("PUT", `/api/offers/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/offers"] });
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/offers/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/offers"] });
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
    Alert.alert("Delete Offer", "Are you sure you want to remove this offer?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => deleteMutation.mutate(id),
      },
    ]);
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
        contentContainerStyle={styles.scrollContent}
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
            <Text style={styles.listHeading}>
              Current Offers ({offers.length})
            </Text>
            {offers.map((offer) => (
              <View key={offer.id} style={styles.offerRow}>
                <LinearGradient
                  colors={[offer.gradientStart, offer.gradientEnd]}
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
                  <Text style={styles.offerRowTitle}>{offer.title}</Text>
                  <Text style={styles.offerRowSub}>{offer.discount}</Text>
                </View>
                <Pressable
                  onPress={() => startEdit(offer)}
                  hitSlop={8}
                  style={styles.offerRowAction}
                >
                  <Ionicons name="create-outline" size={22} color={Colors.brand.blue} />
                </Pressable>
                <Pressable
                  onPress={() => handleDelete(offer.id)}
                  hitSlop={8}
                  style={styles.offerRowAction}
                >
                  <Ionicons name="trash-outline" size={22} color={Colors.brand.red} />
                </Pressable>
              </View>
            ))}
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
  listHeading: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 16,
    color: Colors.light.text,
    marginBottom: 14,
  },
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
    padding: 4,
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
