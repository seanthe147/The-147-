import React, { useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  TextInput,
  Platform,
  ActivityIndicator,
  Image,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { apiRequest, queryClient } from "@/lib/query-client";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import type { BannerImage } from "@shared/schema";

export default function AdminBannerScreen() {
  const insets = useSafeAreaInsets();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const { isAuthenticated, isLoading: authLoading } = useStaffAuth();
  const [imageUrl, setImageUrl] = useState("");
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: bannerImages, isLoading } = useQuery<BannerImage[]>({
    queryKey: ["/api/banner-images/all"],
  });

  if (authLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.brand.blue} />
      </View>
    );
  }

  if (!isAuthenticated) {
    router.replace("/staff-portal");
    return null;
  }

  const handleAdd = async () => {
    const url = imageUrl.trim();
    if (!url) {
      const msg = "Please enter an image URL";
      Platform.OS === "web" ? window.alert(msg) : Alert.alert("Error", msg);
      return;
    }
    setSaving(true);
    try {
      const maxOrder = bannerImages && bannerImages.length > 0
        ? Math.max(...bannerImages.map(b => b.sortOrder)) + 1
        : 0;
      await apiRequest("POST", "/api/banner-images", {
        imageUrl: url,
        title: title.trim() || null,
        sortOrder: maxOrder,
        active: true,
      });
      setImageUrl("");
      setTitle("");
      await queryClient.refetchQueries({ queryKey: ["/api/banner-images/all"] });
      await queryClient.refetchQueries({ queryKey: ["/api/banner-images"] });
    } catch {
      const msg = "Failed to add banner image";
      Platform.OS === "web" ? window.alert(msg) : Alert.alert("Error", msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id: number) => {
    const doDelete = async () => {
      try {
        await apiRequest("DELETE", `/api/banner-images/${id}`);
        await queryClient.refetchQueries({ queryKey: ["/api/banner-images/all"] });
        await queryClient.refetchQueries({ queryKey: ["/api/banner-images"] });
      } catch {
        const msg = "Failed to delete banner image";
        Platform.OS === "web" ? window.alert(msg) : Alert.alert("Error", msg);
      }
    };

    if (Platform.OS === "web") {
      if (window.confirm("Delete this banner image?")) doDelete();
    } else {
      Alert.alert("Delete", "Delete this banner image?", [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: doDelete },
      ]);
    }
  };

  const handleToggle = async (id: number, currentActive: boolean) => {
    try {
      await apiRequest("PUT", `/api/banner-images/${id}`, { active: !currentActive });
      await queryClient.refetchQueries({ queryKey: ["/api/banner-images/all"] });
      await queryClient.refetchQueries({ queryKey: ["/api/banner-images"] });
    } catch {
      const msg = "Failed to update banner image";
      Platform.OS === "web" ? window.alert(msg) : Alert.alert("Error", msg);
    }
  };

  const handleMoveUp = async (index: number) => {
    if (!bannerImages || index <= 0) return;
    const current = bannerImages[index];
    const prev = bannerImages[index - 1];
    try {
      await apiRequest("PUT", `/api/banner-images/${current.id}`, { sortOrder: prev.sortOrder });
      await apiRequest("PUT", `/api/banner-images/${prev.id}`, { sortOrder: current.sortOrder });
      await queryClient.refetchQueries({ queryKey: ["/api/banner-images/all"] });
      await queryClient.refetchQueries({ queryKey: ["/api/banner-images"] });
    } catch {}
  };

  const handleMoveDown = async (index: number) => {
    if (!bannerImages || index >= bannerImages.length - 1) return;
    const current = bannerImages[index];
    const next = bannerImages[index + 1];
    try {
      await apiRequest("PUT", `/api/banner-images/${current.id}`, { sortOrder: next.sortOrder });
      await apiRequest("PUT", `/api/banner-images/${next.id}`, { sortOrder: current.sortOrder });
      await queryClient.refetchQueries({ queryKey: ["/api/banner-images/all"] });
      await queryClient.refetchQueries({ queryKey: ["/api/banner-images"] });
    } catch {}
  };

  const previewUrl = imageUrl.trim();

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={28} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Banner Images</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.section}>
          <Ionicons name="images" size={32} color={Colors.brand.blue} />
          <Text style={styles.sectionTitle}>Home Screen Banners</Text>
          <Text style={styles.sectionDesc}>
            Add images that will display as a scrollable banner on the home screen. Use landscape images for best results.
          </Text>
        </View>

        <View style={styles.addSection}>
          <Text style={styles.inputLabel}>IMAGE URL</Text>
          <TextInput
            style={styles.textInput}
            value={imageUrl}
            onChangeText={setImageUrl}
            placeholder="https://example.com/image.jpg"
            placeholderTextColor={Colors.light.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            testID="banner-url-input"
          />
          <Text style={[styles.inputLabel, { marginTop: 10 }]}>CAPTION (OPTIONAL)</Text>
          <TextInput
            style={styles.textInput}
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Weekend Special"
            placeholderTextColor={Colors.light.textSecondary}
            testID="banner-title-input"
          />

          {previewUrl ? (
            <View style={styles.previewContainer}>
              <Text style={styles.previewLabel}>PREVIEW</Text>
              <View style={styles.previewImageWrap}>
                <Image
                  source={{ uri: previewUrl }}
                  style={styles.previewImage}
                  resizeMode="cover"
                />
              </View>
            </View>
          ) : null}

          <Pressable
            onPress={handleAdd}
            disabled={saving}
            style={({ pressed }) => [
              styles.addButton,
              saving && styles.buttonDisabled,
              { opacity: pressed ? 0.8 : 1 },
            ]}
            testID="banner-add"
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <>
                <Ionicons name="add-circle" size={18} color="#FFFFFF" />
                <Text style={styles.addButtonText}>Add Banner</Text>
              </>
            )}
          </Pressable>
        </View>

        <View style={styles.listSection}>
          <Text style={styles.listTitle}>
            Current Banners ({bannerImages?.length ?? 0})
          </Text>

          {isLoading ? (
            <ActivityIndicator size="small" color={Colors.brand.blue} style={{ marginVertical: 20 }} />
          ) : !bannerImages || bannerImages.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="image-outline" size={48} color={Colors.light.border} />
              <Text style={styles.emptyText}>No banner images yet</Text>
              <Text style={styles.emptySubtext}>Add your first banner above</Text>
            </View>
          ) : (
            bannerImages.map((img, index) => (
              <View key={img.id} style={[styles.imageCard, !img.active && styles.imageCardInactive]}>
                <Image source={{ uri: img.imageUrl }} style={styles.cardImage} resizeMode="cover" />
                <View style={styles.cardInfo}>
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {img.title || `Banner ${index + 1}`}
                  </Text>
                  <Text style={styles.cardUrl} numberOfLines={1}>{img.imageUrl}</Text>
                  <View style={styles.cardStatus}>
                    <View style={[styles.statusDot, { backgroundColor: img.active ? "#4ADE80" : "#9CA3AF" }]} />
                    <Text style={styles.statusText}>{img.active ? "Active" : "Hidden"}</Text>
                  </View>
                </View>
                <View style={styles.cardActions}>
                  <View style={styles.reorderButtons}>
                    <Pressable
                      onPress={() => handleMoveUp(index)}
                      disabled={index === 0}
                      style={({ pressed }) => [styles.iconBtn, { opacity: index === 0 ? 0.3 : pressed ? 0.6 : 1 }]}
                    >
                      <Ionicons name="chevron-up" size={18} color={Colors.light.text} />
                    </Pressable>
                    <Pressable
                      onPress={() => handleMoveDown(index)}
                      disabled={index === bannerImages.length - 1}
                      style={({ pressed }) => [styles.iconBtn, { opacity: index === bannerImages.length - 1 ? 0.3 : pressed ? 0.6 : 1 }]}
                    >
                      <Ionicons name="chevron-down" size={18} color={Colors.light.text} />
                    </Pressable>
                  </View>
                  <Pressable
                    onPress={() => handleToggle(img.id, img.active)}
                    style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.6 : 1 }]}
                  >
                    <Ionicons name={img.active ? "eye" : "eye-off"} size={18} color={Colors.brand.blue} />
                  </Pressable>
                  <Pressable
                    onPress={() => handleDelete(img.id)}
                    style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.6 : 1 }]}
                  >
                    <Ionicons name="trash-outline" size={18} color={Colors.brand.red} />
                  </Pressable>
                </View>
              </View>
            ))
          )}
        </View>

        <View style={styles.tipsSection}>
          <Text style={styles.tipsTitle}>Tips</Text>
          <Text style={styles.tipText}>Use wide landscape images (at least 800px wide) for best results.</Text>
          <Text style={styles.tipText}>Add a caption to display text over the image.</Text>
          <Text style={styles.tipText}>Reorder banners with the up/down arrows.</Text>
          <Text style={styles.tipText}>Toggle visibility with the eye icon without deleting.</Text>
        </View>

        <View style={{ height: Platform.OS === "web" ? 50 : insets.bottom + 20 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.light.background,
  },
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  headerTitle: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 18,
    color: Colors.light.text,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  section: {
    alignItems: "center",
    marginBottom: 24,
    gap: 8,
  },
  sectionTitle: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 22,
    color: Colors.light.text,
    marginTop: 4,
  },
  sectionDesc: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 14,
    color: Colors.light.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  addSection: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  inputLabel: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 11,
    color: Colors.light.textSecondary,
    letterSpacing: 1,
    marginBottom: 6,
  },
  textInput: {
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.light.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontFamily: "Montserrat_500Medium",
    fontSize: 14,
    color: Colors.light.text,
  },
  previewContainer: {
    marginTop: 12,
    gap: 6,
  },
  previewLabel: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 11,
    color: Colors.light.textSecondary,
    letterSpacing: 1,
  },
  previewImageWrap: {
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  previewImage: {
    width: "100%",
    height: 140,
  },
  addButton: {
    backgroundColor: Colors.brand.blue,
    borderRadius: 14,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 14,
  },
  addButtonText: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 15,
    color: "#FFFFFF",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  listSection: {
    marginBottom: 24,
  },
  listTitle: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 16,
    color: Colors.light.text,
    marginBottom: 12,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 32,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: Colors.light.border,
    borderStyle: "dashed",
    gap: 6,
  },
  emptyText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 15,
    color: Colors.light.textSecondary,
  },
  emptySubtext: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 12,
    color: Colors.light.textSecondary,
  },
  imageCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.light.border,
    gap: 10,
  },
  imageCardInactive: {
    opacity: 0.6,
  },
  cardImage: {
    width: 72,
    height: 50,
    borderRadius: 8,
    backgroundColor: Colors.light.surface,
  },
  cardInfo: {
    flex: 1,
    gap: 2,
  },
  cardTitle: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 13,
    color: Colors.light.text,
  },
  cardUrl: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 10,
    color: Colors.light.textSecondary,
  },
  cardStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontFamily: "Montserrat_500Medium",
    fontSize: 10,
    color: Colors.light.textSecondary,
  },
  cardActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  reorderButtons: {
    gap: 0,
  },
  iconBtn: {
    padding: 6,
  },
  tipsSection: {
    backgroundColor: Colors.light.surface,
    borderRadius: 14,
    padding: 16,
    gap: 6,
  },
  tipsTitle: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 14,
    color: Colors.light.text,
    marginBottom: 4,
  },
  tipText: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 13,
    color: Colors.light.textSecondary,
    lineHeight: 18,
  },
});
