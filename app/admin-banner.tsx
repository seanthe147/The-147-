import React, { useState, useRef } from "react";
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
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useResponsive } from "@/hooks/useResponsive";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import Colors from "@/constants/colors";
import { apiRequest, queryClient, getApiUrl, getStaffToken } from "@/lib/query-client";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import type { BannerImage } from "@shared/schema";
import { isSafePublicUrl } from "@shared/schema";

function formatRelativeDate(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return "Unknown";
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  if (isNaN(date.getTime())) return "Unknown";
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 30) return `${diffDays} days ago`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths === 1) return "1 month ago";
  if (diffMonths < 12) return `${diffMonths} months ago`;
  const diffYears = Math.floor(diffMonths / 12);
  return diffYears === 1 ? "1 year ago" : `${diffYears} years ago`;
}

export default function AdminBannerScreen() {
  const insets = useSafeAreaInsets();
  const { tabletPad } = useResponsive();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const { isAuthenticated, isLoading: authLoading } = useStaffAuth();
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [linkType, setLinkType] = useState<"" | "event" | "order" | "url">("");
  const [linkUrl, setLinkUrl] = useState("");
  const [editingLinkId, setEditingLinkId] = useState<number | null>(null);
  const [editLinkType, setEditLinkType] = useState<"" | "event" | "order" | "url">("");
  const [editLinkUrl, setEditLinkUrl] = useState("");

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

  const pickImageNative = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission Required", "Please allow access to your photo library to upload banner images.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setSelectedImage(result.assets[0].uri);
    }
  };

  const pickImageWeb = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleWebFileChange = (e: any) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)) {
        window.alert("Please select a JPEG, PNG, WebP or GIF image.");
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        window.alert("Image must be less than 10MB.");
        return;
      }
      setSelectedFile(file);
      setSelectedImage(URL.createObjectURL(file));
    }
  };

  const uploadImage = async (): Promise<string | null> => {
    const formData = new FormData();

    if (Platform.OS === "web" && selectedFile) {
      formData.append("image", selectedFile);
    } else if (selectedImage) {
      const filename = selectedImage.split("/").pop() || "image.jpg";
      const match = /\.(\w+)$/.exec(filename);
      const type = match ? `image/${match[1] === "jpg" ? "jpeg" : match[1]}` : "image/jpeg";
      formData.append("image", {
        uri: selectedImage,
        name: filename,
        type,
      } as any);
    } else {
      return null;
    }

    const baseUrl = getApiUrl();
    const url = new URL("/api/upload/banner", baseUrl).toString();
    const headers: Record<string, string> = {};
    const token = getStaffToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const res = await fetch(url, {
      method: "POST",
      body: formData,
      headers,
      credentials: "include",
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: "Upload failed" }));
      throw new Error(err.message || "Upload failed");
    }

    const data = await res.json();
    return data.imageUrl;
  };

  const handleAdd = async () => {
    if (!selectedImage) {
      const msg = "Please select an image to upload";
      Platform.OS === "web" ? window.alert(msg) : Alert.alert("Error", msg);
      return;
    }
    setSaving(true);
    try {
      const maxOrder = bannerImages && bannerImages.length > 0
        ? Math.max(...bannerImages.map(b => b.sortOrder)) + 1
        : 0;

      const formData = new FormData();
      if (Platform.OS === "web" && selectedFile) {
        formData.append("image", selectedFile);
      } else if (selectedImage) {
        const filename = selectedImage.split("/").pop() || "image.jpg";
        const match = /\.(\w+)$/.exec(filename);
        const type = match ? `image/${match[1] === "jpg" ? "jpeg" : match[1]}` : "image/jpeg";
        formData.append("image", { uri: selectedImage, name: filename, type } as any);
      }
      formData.append("title", title.trim());
      formData.append("sortOrder", String(maxOrder));
      formData.append("active", "true");
      if (linkType) {
        formData.append("linkType", linkType);
        if (linkType === "url" && linkUrl.trim()) {
          if (!isSafePublicUrl(linkUrl.trim())) {
            const msg = "Banner URL must start with https:// or http://";
            Platform.OS === "web" ? window.alert(msg) : Alert.alert("Error", msg);
            setSaving(false);
            return;
          }
          formData.append("linkValue", linkUrl.trim());
        }
      }

      const baseUrl = getApiUrl();
      const url = new URL("/api/banner-images", baseUrl).toString();
      const headers: Record<string, string> = {};
      const token = getStaffToken();
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(url, { method: "POST", body: formData, headers, credentials: "include" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Upload failed" }));
        throw new Error(err.message || "Upload failed");
      }

      setSelectedImage(null);
      setSelectedFile(null);
      setTitle("");
      setLinkType("");
      setLinkUrl("");
      if (Platform.OS === "web" && fileInputRef.current) fileInputRef.current.value = "";
      await queryClient.refetchQueries({ queryKey: ["/api/banner-images/all"] });
      await queryClient.refetchQueries({ queryKey: ["/api/banner-images"] });
    } catch (e: any) {
      const msg = e?.message || "Failed to add banner image";
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

  const openEditLink = (img: BannerImage) => {
    setEditingLinkId(img.id);
    setEditLinkType((img.linkType as any) || "");
    setEditLinkUrl(img.linkValue || "");
  };

  const handleSaveLink = async () => {
    if (!editingLinkId) return;
    if (editLinkType === "url") {
      if (!editLinkUrl.trim()) {
        const msg = "Please enter a URL";
        Platform.OS === "web" ? window.alert(msg) : Alert.alert("Error", msg);
        return;
      }
      if (!isSafePublicUrl(editLinkUrl.trim())) {
        const msg = "Banner URL must start with https:// or http://";
        Platform.OS === "web" ? window.alert(msg) : Alert.alert("Error", msg);
        return;
      }
    }
    try {
      await apiRequest("PUT", `/api/banner-images/${editingLinkId}`, {
        linkType: editLinkType || null,
        linkValue: editLinkType === "url" ? editLinkUrl.trim() : null,
      });
      await queryClient.refetchQueries({ queryKey: ["/api/banner-images/all"] });
      await queryClient.refetchQueries({ queryKey: ["/api/banner-images"] });
      setEditingLinkId(null);
    } catch {
      const msg = "Failed to update link";
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
        contentContainerStyle={[styles.scrollContent, { marginHorizontal: tabletPad }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.section}>
          <Ionicons name="images" size={32} color={Colors.brand.blue} />
          <Text style={styles.sectionTitle}>Home Screen Banners</Text>
          <Text style={styles.sectionDesc}>
            Upload images that display as a scrollable banner on the home, events, and order screens. For best results use{" "}
          <Text style={{ fontWeight: "700", color: Colors.brand.blue }}>1500 × 650 px</Text>
          {" "}(landscape, 2.3:1 ratio) — the banner slot is sized to match so nothing gets cropped.
          </Text>
        </View>

        <View style={styles.addSection}>
          <Text style={styles.inputLabel}>UPLOAD IMAGE</Text>

          {Platform.OS === "web" && (
            <input
              ref={fileInputRef as any}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={handleWebFileChange}
              style={{ display: "none" }}
            />
          )}

          <Pressable
            onPress={Platform.OS === "web" ? pickImageWeb : pickImageNative}
            style={({ pressed }) => [
              styles.uploadButton,
              { opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <Ionicons
              name={selectedImage ? "checkmark-circle" : "cloud-upload-outline"}
              size={22}
              color={selectedImage ? "#4ADE80" : Colors.brand.blue}
            />
            <Text style={styles.uploadButtonText}>
              {selectedImage ? "Image Selected — Tap to Change" : "Choose Image"}
            </Text>
          </Pressable>

          <Text style={[styles.inputLabel, { marginTop: 10 }]}>CAPTION (OPTIONAL)</Text>
          <TextInput
            style={styles.textInput}
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Weekend Special"
            placeholderTextColor={Colors.light.textSecondary}
            testID="banner-title-input"
          />

          <Text style={[styles.inputLabel, { marginTop: 14 }]}>LINK TO (OPTIONAL)</Text>
          <View style={styles.linkTypeRow}>
            {([
              { value: "", label: "None" },
              { value: "event", label: "Events", icon: "ticket-outline" },
              { value: "order", label: "Order & Pay", icon: "restaurant-outline" },
              { value: "url", label: "URL", icon: "open-outline" },
            ] as const).map((opt) => (
              <Pressable
                key={opt.value}
                onPress={() => setLinkType(opt.value)}
                style={[styles.linkTypeBtn, linkType === opt.value && styles.linkTypeBtnActive]}
              >
                {"icon" in opt ? (
                  <Ionicons
                    name={opt.icon}
                    size={13}
                    color={linkType === opt.value ? "#FFFFFF" : Colors.light.textSecondary}
                  />
                ) : null}
                <Text style={[styles.linkTypeBtnText, linkType === opt.value && styles.linkTypeBtnTextActive]}>
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>
          {linkType === "url" ? (
            <>
              <Text style={[styles.inputLabel, { marginTop: 10 }]}>EXTERNAL URL</Text>
              <TextInput
                style={styles.textInput}
                value={linkUrl}
                onChangeText={setLinkUrl}
                placeholder="https://example.com/offer"
                placeholderTextColor={Colors.light.textSecondary}
                autoCapitalize="none"
                keyboardType="url"
              />
            </>
          ) : null}

          {selectedImage ? (
            <View style={styles.previewContainer}>
              <Text style={styles.previewLabel}>PREVIEW</Text>
              <View style={styles.previewImageWrap}>
                <Image
                  source={{ uri: selectedImage }}
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
              <Text style={styles.emptySubtext}>Upload your first banner above</Text>
            </View>
          ) : (
            bannerImages.map((img, index) => (
              <View key={img.id} style={[styles.imageCard, !img.active && styles.imageCardInactive]}>
                <Image source={{ uri: (img.imageUrl.startsWith("http") || img.imageUrl.startsWith("data:")) ? img.imageUrl : new URL(img.imageUrl, getApiUrl()).toString() }} style={styles.cardImage} resizeMode="cover" />
                <View style={styles.cardInfo}>
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {img.title || `Banner ${index + 1}`}
                  </Text>
                  <View style={styles.cardStatus}>
                    <View style={[styles.statusDot, { backgroundColor: img.active ? "#4ADE80" : "#9CA3AF" }]} />
                    <Text style={styles.statusText}>{img.active ? "Active" : "Hidden"}</Text>
                    {img.linkType ? (
                      <View style={styles.linkBadge}>
                        <Ionicons
                          name={img.linkType === "event" ? "ticket-outline" : img.linkType === "order" ? "restaurant-outline" : "open-outline"}
                          size={10}
                          color={Colors.brand.blue}
                        />
                        <Text style={styles.linkBadgeText}>
                          {img.linkType === "event" ? "→ Events" : img.linkType === "order" ? "→ Order" : "→ URL"}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.cardUpdatedAt}>
                    Last updated: {formatRelativeDate(img.updatedAt)}
                  </Text>
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
                    onPress={() => openEditLink(img)}
                    style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.6 : 1 }]}
                  >
                    <Ionicons name="link-outline" size={18} color={img.linkType ? Colors.brand.blue : Colors.light.textSecondary} />
                  </Pressable>
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
          <Text style={styles.tipText}>Max file size: 10MB. Supported formats: JPEG, PNG, WebP, GIF.</Text>
          <Text style={styles.tipText}>Add a caption to display text over the image.</Text>
          <Text style={styles.tipText}>Set a link so tapping a banner opens Events, Order & Pay, or an external URL.</Text>
          <Text style={styles.tipText}>Tap the link icon on any existing banner to add or change its link.</Text>
          <Text style={styles.tipText}>Reorder banners with the up/down arrows.</Text>
          <Text style={styles.tipText}>Toggle visibility with the eye icon without deleting.</Text>
        </View>

        <View style={{ height: Platform.OS === "web" ? 50 : insets.bottom + 20 }} />
      </ScrollView>

      <Modal
        visible={editingLinkId !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setEditingLinkId(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setEditingLinkId(null)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Set Banner Link</Text>
            <Text style={styles.modalSubtitle}>When tapped, this banner will navigate to:</Text>

            <View style={[styles.linkTypeRow, { marginBottom: 16 }]}>
              {([
                { value: "", label: "None" },
                { value: "event", label: "Events", icon: "ticket-outline" },
                { value: "order", label: "Order & Pay", icon: "restaurant-outline" },
                { value: "url", label: "URL", icon: "open-outline" },
              ] as const).map((opt) => (
                <Pressable
                  key={opt.value}
                  onPress={() => setEditLinkType(opt.value)}
                  style={[styles.linkTypeBtn, editLinkType === opt.value && styles.linkTypeBtnActive]}
                >
                  {"icon" in opt ? (
                    <Ionicons
                      name={opt.icon}
                      size={13}
                      color={editLinkType === opt.value ? "#FFFFFF" : Colors.light.textSecondary}
                    />
                  ) : null}
                  <Text style={[styles.linkTypeBtnText, editLinkType === opt.value && styles.linkTypeBtnTextActive]}>
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {editLinkType === "url" ? (
              <>
                <Text style={[styles.inputLabel, { marginBottom: 6 }]}>EXTERNAL URL</Text>
                <TextInput
                  style={[styles.textInput, { marginBottom: 16 }]}
                  value={editLinkUrl}
                  onChangeText={setEditLinkUrl}
                  placeholder="https://example.com/offer"
                  placeholderTextColor={Colors.light.textSecondary}
                  autoCapitalize="none"
                  keyboardType="url"
                  autoFocus
                />
              </>
            ) : null}

            <View style={styles.modalButtons}>
              <Pressable
                onPress={() => setEditingLinkId(null)}
                style={({ pressed }) => [styles.modalCancelBtn, { opacity: pressed ? 0.7 : 1 }]}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleSaveLink}
                style={({ pressed }) => [styles.modalSaveBtn, { opacity: pressed ? 0.8 : 1 }]}
              >
                <Text style={styles.modalSaveText}>Save Link</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
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
  uploadButton: {
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.light.border,
    borderStyle: "dashed",
    paddingVertical: 24,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  uploadButtonText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 14,
    color: Colors.brand.blue,
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
  cardUpdatedAt: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 10,
    color: Colors.light.textSecondary,
    marginTop: 2,
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
  linkTypeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 4,
  },
  linkTypeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
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
    color: "#FFFFFF",
  },
  linkBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginLeft: 6,
  },
  linkBadgeText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 10,
    color: Colors.brand.blue,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 24,
    width: "100%",
    maxWidth: 420,
  },
  modalTitle: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 18,
    color: Colors.light.text,
    marginBottom: 6,
  },
  modalSubtitle: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 13,
    color: Colors.light.textSecondary,
    marginBottom: 16,
    lineHeight: 18,
  },
  modalButtons: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.light.border,
    alignItems: "center",
  },
  modalCancelText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 14,
    color: Colors.light.textSecondary,
  },
  modalSaveBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: Colors.brand.blue,
    alignItems: "center",
  },
  modalSaveText: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 14,
    color: "#FFFFFF",
  },
});
