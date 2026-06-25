import React, { useState, useEffect } from "react";
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
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useResponsive } from "@/hooks/useResponsive";
import { router } from "expo-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/query-client";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import Colors from "@/constants/colors";
import type { StaffNotice } from "@workspace/db/schema";

export default function AdminNoticesScreen() {
  const insets = useSafeAreaInsets();
  const { tabletPad } = useResponsive();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const { isAuthenticated, isManager, isOwner, isLoading: authLoading } = useStaffAuth();

  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState("");

  const canManage = isManager || isOwner;

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || !canManage)) {
      router.replace("/staff-portal");
    }
  }, [authLoading, isAuthenticated, canManage]);

  const noticesQuery = useQuery<StaffNotice[]>({
    queryKey: ["/api/staff-notices"],
    enabled: isAuthenticated && canManage,
    refetchOnMount: "always",
  });

  const addMutation = useMutation({
    mutationFn: async (msg: string) => {
      const res = await apiRequest("POST", "/api/staff-notices", { message: msg });
      return res.json();
    },
    onSuccess: () => {
      setMessage("");
      setShowForm(false);
      queryClient.refetchQueries({ queryKey: ["/api/staff-notices"] });
    },
    onError: (err: Error) => Alert.alert("Error", err.message || "Failed to add notice"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/staff-notices/${id}`);
    },
    onSuccess: () => {
      queryClient.refetchQueries({ queryKey: ["/api/staff-notices"] });
    },
    onError: (err: Error) => Alert.alert("Error", err.message || "Failed to remove notice"),
  });

  const handleDelete = (notice: StaffNotice) => {
    const msg = "Remove this notice? Staff will no longer see it.";
    if (Platform.OS === "web") {
      if (window.confirm(msg)) deleteMutation.mutate(notice.id);
    } else {
      Alert.alert("Remove Notice", msg, [
        { text: "Cancel", style: "cancel" },
        { text: "Remove", style: "destructive", onPress: () => deleteMutation.mutate(notice.id) },
      ]);
    }
  };

  const handlePost = () => {
    if (!message.trim()) return;
    addMutation.mutate(message.trim());
  };

  const notices = noticesQuery.data ?? [];

  if (authLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={Colors.brand.blue} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Staff Notices</Text>
        <Pressable
          onPress={() => { setShowForm(!showForm); setMessage(""); }}
          hitSlop={12}
          style={styles.addBtn}
        >
          <Ionicons name={showForm ? "close" : "add"} size={26} color={Colors.brand.blue} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { marginHorizontal: tabletPad }]}
        keyboardShouldPersistTaps="handled"
      >
        {showForm && (
          <View style={styles.formCard}>
            <Text style={styles.formLabel}>NEW NOTICE</Text>
            <TextInput
              style={styles.textInput}
              value={message}
              onChangeText={setMessage}
              placeholder="Write a notice for all staff..."
              placeholderTextColor={Colors.light.textSecondary}
              multiline
              maxLength={300}
              autoFocus
              textAlignVertical="top"
            />
            <Text style={styles.charCount}>{message.length}/300</Text>
            <View style={styles.formActions}>
              <Pressable
                onPress={() => { setShowForm(false); setMessage(""); }}
                style={styles.cancelBtn}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handlePost}
                disabled={!message.trim() || addMutation.isPending}
                style={({ pressed }) => [
                  styles.postBtn,
                  (!message.trim() || addMutation.isPending) && styles.postBtnDisabled,
                  { opacity: pressed ? 0.8 : 1 },
                ]}
              >
                {addMutation.isPending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="megaphone-outline" size={16} color="#fff" />
                    <Text style={styles.postBtnText}>Post Notice</Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>
        )}

        <View style={styles.infoRow}>
          <Ionicons name="information-circle-outline" size={15} color={Colors.light.textSecondary} />
          <Text style={styles.infoText}>
            Notices appear on every staff member's dashboard when they sign in.
          </Text>
        </View>

        {noticesQuery.isLoading ? (
          <ActivityIndicator color={Colors.brand.blue} style={{ marginTop: 40 }} />
        ) : notices.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="megaphone-outline" size={36} color={Colors.light.textSecondary} />
            </View>
            <Text style={styles.emptyTitle}>No Active Notices</Text>
            <Text style={styles.emptySubtitle}>
              Tap the + button to post a notice for all staff.
            </Text>
          </View>
        ) : (
          <View style={styles.noticesList}>
            <Text style={styles.sectionLabel}>{notices.length} ACTIVE {notices.length === 1 ? "NOTICE" : "NOTICES"}</Text>
            {notices.map((notice) => (
              <View key={notice.id} style={styles.noticeCard}>
                <View style={styles.noticeIconWrap}>
                  <Ionicons name="warning" size={18} color="#92400E" />
                </View>
                <View style={styles.noticeBody}>
                  <Text style={styles.noticeMessage}>{notice.message}</Text>
                  <View style={styles.noticeMeta}>
                    <Ionicons name="person-outline" size={12} color="#A16207" />
                    <Text style={styles.noticeMetaText}>
                      {notice.createdBy} · {new Date(notice.createdAt).toLocaleDateString("en-GB", {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </Text>
                  </View>
                </View>
                <Pressable
                  onPress={() => handleDelete(notice)}
                  hitSlop={10}
                  style={({ pressed }) => [styles.deleteBtn, { opacity: pressed ? 0.6 : 1 }]}
                  disabled={deleteMutation.isPending}
                >
                  <Ionicons name="trash-outline" size={18} color={Colors.brand.red} />
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
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
  addBtn: {
    padding: 2,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: Platform.OS === "web" ? 50 : 40,
    gap: 16,
  },
  formCard: {
    backgroundColor: Colors.light.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.light.border,
    padding: 16,
    gap: 12,
  },
  formLabel: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 11,
    color: Colors.light.textSecondary,
    letterSpacing: 1.5,
  },
  textInput: {
    backgroundColor: Colors.light.background,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.light.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: "Montserrat_400Regular",
    fontSize: 15,
    color: Colors.light.text,
    minHeight: 100,
  },
  charCount: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 11,
    color: Colors.light.textSecondary,
    textAlign: "right",
    marginTop: -6,
  },
  formActions: {
    flexDirection: "row",
    gap: 10,
  },
  cancelBtn: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.light.border,
    paddingVertical: 12,
    alignItems: "center",
  },
  cancelBtnText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 14,
    color: Colors.light.textSecondary,
  },
  postBtn: {
    flex: 2,
    backgroundColor: "#D97706",
    borderRadius: 12,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  postBtnDisabled: {
    opacity: 0.5,
  },
  postBtnText: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 14,
    color: "#fff",
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    paddingHorizontal: 4,
  },
  infoText: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 12,
    color: Colors.light.textSecondary,
    flex: 1,
    lineHeight: 18,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 60,
    gap: 12,
  },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: Colors.light.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.light.border,
    marginBottom: 4,
  },
  emptyTitle: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 18,
    color: Colors.light.text,
  },
  emptySubtitle: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 14,
    color: Colors.light.textSecondary,
    textAlign: "center",
    paddingHorizontal: 24,
  },
  noticesList: {
    gap: 10,
  },
  sectionLabel: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 11,
    color: Colors.light.textSecondary,
    letterSpacing: 1.5,
    marginBottom: 2,
  },
  noticeCard: {
    backgroundColor: "#FEF3C7",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#FDE68A",
    padding: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  noticeIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#FCD34D30",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  noticeBody: {
    flex: 1,
    gap: 6,
  },
  noticeMessage: {
    fontFamily: "Montserrat_500Medium",
    fontSize: 14,
    color: "#78350F",
    lineHeight: 20,
  },
  noticeMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  noticeMetaText: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 11,
    color: "#A16207",
  },
  deleteBtn: {
    padding: 4,
    marginTop: 2,
  },
});
