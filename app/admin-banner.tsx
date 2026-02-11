import React, { useState, useEffect } from "react";
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

export default function AdminBannerScreen() {
  const insets = useSafeAreaInsets();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const { isAuthenticated, isLoading: authLoading } = useStaffAuth();
  const [imageUrl, setImageUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  const { data: settings, isLoading } = useQuery<Record<string, string>>({
    queryKey: ["/api/settings"],
  });

  useEffect(() => {
    if (settings?.banner_image) {
      setImageUrl(settings.banner_image);
    }
  }, [settings]);

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

  const handleSave = async () => {
    setSaving(true);
    setSuccess(false);
    try {
      await apiRequest("PUT", "/api/settings/banner_image", { value: imageUrl.trim() });
      await queryClient.refetchQueries({ queryKey: ["/api/settings"] });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch {
      if (Platform.OS === "web") {
        window.alert("Failed to save banner image");
      } else {
        Alert.alert("Error", "Failed to save banner image");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    const doClear = async () => {
      setSaving(true);
      try {
        await apiRequest("PUT", "/api/settings/banner_image", { value: "" });
        setImageUrl("");
        await queryClient.refetchQueries({ queryKey: ["/api/settings"] });
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      } catch {
        if (Platform.OS === "web") {
          window.alert("Failed to clear banner");
        } else {
          Alert.alert("Error", "Failed to clear banner");
        }
      } finally {
        setSaving(false);
      }
    };

    if (Platform.OS === "web") {
      if (window.confirm("Remove the banner image? The home screen will show the default gradient.")) {
        doClear();
      }
    } else {
      Alert.alert("Remove Banner", "Remove the banner image? The home screen will show the default gradient.", [
        { text: "Cancel", style: "cancel" },
        { text: "Remove", style: "destructive", onPress: doClear },
      ]);
    }
  };

  const previewUrl = imageUrl.trim();

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={28} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Banner Image</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.section}>
          <Ionicons name="image" size={32} color={Colors.brand.blue} />
          <Text style={styles.sectionTitle}>Home Screen Banner</Text>
          <Text style={styles.sectionDesc}>
            Set a banner image for the home screen hero area. Paste a URL to any image hosted online.
          </Text>
        </View>

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
        ) : (
          <View style={styles.noPreview}>
            <Ionicons name="image-outline" size={48} color={Colors.light.border} />
            <Text style={styles.noPreviewText}>No banner image set</Text>
            <Text style={styles.noPreviewSubtext}>Default gradient will be shown</Text>
          </View>
        )}

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>IMAGE URL</Text>
          <TextInput
            style={styles.textInput}
            value={imageUrl}
            onChangeText={(t) => { setImageUrl(t); setSuccess(false); }}
            placeholder="https://example.com/image.jpg"
            placeholderTextColor={Colors.light.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            testID="banner-url-input"
          />
        </View>

        {success && (
          <View style={styles.successRow}>
            <Ionicons name="checkmark-circle" size={16} color={Colors.brand.green} />
            <Text style={styles.successText}>Banner updated successfully</Text>
          </View>
        )}

        <View style={styles.buttonRow}>
          <Pressable
            onPress={handleSave}
            disabled={saving}
            style={({ pressed }) => [
              styles.saveButton,
              saving && styles.buttonDisabled,
              { opacity: pressed ? 0.8 : 1 },
            ]}
            testID="banner-save"
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <>
                <Ionicons name="checkmark" size={18} color="#FFFFFF" />
                <Text style={styles.saveButtonText}>Save Banner</Text>
              </>
            )}
          </Pressable>

          {(settings?.banner_image || previewUrl) ? (
            <Pressable
              onPress={handleClear}
              disabled={saving}
              style={({ pressed }) => [
                styles.clearButton,
                { opacity: pressed ? 0.8 : 1 },
              ]}
              testID="banner-clear"
            >
              <Ionicons name="trash-outline" size={18} color={Colors.brand.red} />
              <Text style={styles.clearButtonText}>Remove</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.tipsSection}>
          <Text style={styles.tipsTitle}>Tips</Text>
          <Text style={styles.tipText}>Use a wide landscape image (at least 800px wide) for best results.</Text>
          <Text style={styles.tipText}>The image will be overlaid with a dark gradient so text remains readable.</Text>
          <Text style={styles.tipText}>You can use any publicly accessible image URL.</Text>
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
  previewContainer: {
    marginBottom: 20,
    gap: 8,
  },
  previewLabel: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 11,
    color: Colors.light.textSecondary,
    letterSpacing: 1,
  },
  previewImageWrap: {
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  previewImage: {
    width: "100%",
    height: 180,
  },
  noPreview: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 32,
    marginBottom: 20,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: Colors.light.border,
    borderStyle: "dashed",
    gap: 6,
  },
  noPreviewText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 15,
    color: Colors.light.textSecondary,
  },
  noPreviewSubtext: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 12,
    color: Colors.light.textSecondary,
  },
  inputGroup: {
    gap: 6,
    marginBottom: 16,
  },
  inputLabel: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 11,
    color: Colors.light.textSecondary,
    letterSpacing: 1,
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
  successRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginBottom: 12,
  },
  successText: {
    fontFamily: "Montserrat_500Medium",
    fontSize: 13,
    color: Colors.brand.green,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 24,
  },
  saveButton: {
    flex: 1,
    backgroundColor: Colors.brand.blue,
    borderRadius: 14,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  saveButtonText: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 15,
    color: "#FFFFFF",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  clearButton: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: Colors.brand.red,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  clearButtonText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 14,
    color: Colors.brand.red,
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
