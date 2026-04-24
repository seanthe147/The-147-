import React, { useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Platform,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { apiRequest, queryClient } from "@/lib/query-client";
import { useStaffAuth } from "@/contexts/StaffAuthContext";

type StaffUser = {
  id: number;
  username: string;
  displayName: string | null;
  role: string;
  active: boolean;
  approvalStatus: string;
  createdAt: string;
};

const ROLES = [
  { value: "staff", label: "Staff", icon: "shield-checkmark" as const, color: Colors.brand.green },
  { value: "manager", label: "Manager", icon: "shield" as const, color: "#7C3AED" },
  { value: "owner", label: "Owner", icon: "star" as const, color: Colors.brand.gold },
];

export default function AdminStaffScreen() {
  const insets = useSafeAreaInsets();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const { isAuthenticated, isLoading: authLoading, username: currentUsername, isManager, isOwner } = useStaffAuth();

  const [updatingUser, setUpdatingUser] = useState<number | null>(null);
  const [resetPinUserId, setResetPinUserId] = useState<number | null>(null);
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [pinSaving, setPinSaving] = useState(false);
  const [showNewPin, setShowNewPin] = useState(false);

  const { data: staffUsers, isLoading } = useQuery<StaffUser[]>({
    queryKey: ["/api/staff/users"],
  });

  if (authLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.brand.blue} />
      </View>
    );
  }

  if (!isAuthenticated || !isManager) {
    router.replace("/staff-portal");
    return null;
  }

  const resetPinUser = staffUsers?.find(u => u.id === resetPinUserId);

  const handleRoleChange = (user: StaffUser, newRole: string) => {
    if (user.username === currentUsername) {
      const msg = "You cannot change your own role";
      Platform.OS === "web" ? window.alert(msg) : Alert.alert("Error", msg);
      return;
    }
    const doUpdate = async () => {
      setUpdatingUser(user.id);
      try {
        await apiRequest("PATCH", "/api/staff/update-role", { username: user.username, role: newRole });
        await queryClient.refetchQueries({ queryKey: ["/api/staff/users"] });
      } catch (e: any) {
        const msg = e?.message || "Failed to update role";
        Platform.OS === "web" ? window.alert(msg) : Alert.alert("Error", msg);
      } finally {
        setUpdatingUser(null);
      }
    };
    const roleName = ROLES.find(r => r.value === newRole)?.label || newRole;
    if (Platform.OS === "web") {
      if (window.confirm(`Change ${user.displayName || user.username}'s role to ${roleName}?`)) doUpdate();
    } else {
      Alert.alert("Change Role", `Change ${user.displayName || user.username}'s role to ${roleName}?`, [
        { text: "Cancel", style: "cancel" },
        { text: "Confirm", onPress: doUpdate },
      ]);
    }
  };

  const handleToggleLock = (user: StaffUser) => {
    if (user.username === currentUsername) {
      const msg = "You cannot lock your own account";
      Platform.OS === "web" ? window.alert(msg) : Alert.alert("Error", msg);
      return;
    }
    const willLock = user.active;
    const doToggle = async () => {
      setUpdatingUser(user.id);
      try {
        await apiRequest("PATCH", "/api/staff/toggle-active", { id: user.id, active: !user.active });
        await queryClient.refetchQueries({ queryKey: ["/api/staff/users"] });
      } catch (e: any) {
        const msg = e?.message || "Failed to update account";
        Platform.OS === "web" ? window.alert(msg) : Alert.alert("Error", msg);
      } finally {
        setUpdatingUser(null);
      }
    };
    const name = user.displayName || user.username;
    if (Platform.OS === "web") {
      if (window.confirm(willLock ? `Lock ${name}'s account? They won't be able to sign in.` : `Unlock ${name}'s account?`)) doToggle();
    } else {
      Alert.alert(
        willLock ? "Lock Account" : "Unlock Account",
        willLock ? `Lock ${name}'s account? They won't be able to sign in until unlocked.` : `Unlock ${name}'s account?`,
        [
          { text: "Cancel", style: "cancel" },
          { text: willLock ? "Lock" : "Unlock", style: willLock ? "destructive" : "default", onPress: doToggle },
        ]
      );
    }
  };

  const handleDelete = (user: StaffUser) => {
    if (user.username === currentUsername) {
      const msg = "You cannot delete your own account";
      Platform.OS === "web" ? window.alert(msg) : Alert.alert("Error", msg);
      return;
    }
    const doDelete = async () => {
      setUpdatingUser(user.id);
      try {
        await apiRequest("DELETE", `/api/staff/${user.id}`);
        await queryClient.refetchQueries({ queryKey: ["/api/staff/users"] });
      } catch (e: any) {
        const msg = e?.message || "Failed to delete account";
        Platform.OS === "web" ? window.alert(msg) : Alert.alert("Error", msg);
      } finally {
        setUpdatingUser(null);
      }
    };
    const name = user.displayName || user.username;
    if (Platform.OS === "web") {
      if (window.confirm(`Permanently delete ${name}'s account? This cannot be undone.`)) doDelete();
    } else {
      Alert.alert("Delete Account", `Permanently delete ${name}'s account? This cannot be undone.`, [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: doDelete },
      ]);
    }
  };

  const handleApprove = (user: StaffUser, status: "approved" | "rejected") => {
    const name = user.displayName || user.username;
    const action = status === "approved" ? "Approve" : "Reject";
    const doApprove = async () => {
      setUpdatingUser(user.id);
      try {
        await apiRequest("PATCH", "/api/staff/approve", { username: user.username, approvalStatus: status });
        await queryClient.refetchQueries({ queryKey: ["/api/staff/users"] });
      } catch (e: any) {
        const msg = e?.message || "Failed to update account";
        Platform.OS === "web" ? window.alert(msg) : Alert.alert("Error", msg);
      } finally {
        setUpdatingUser(null);
      }
    };
    if (Platform.OS === "web") {
      if (window.confirm(`${action} ${name}'s account?`)) doApprove();
    } else {
      Alert.alert(`${action} Account`, `${action} ${name}'s account?`, [
        { text: "Cancel", style: "cancel" },
        { text: action, style: status === "rejected" ? "destructive" : "default", onPress: doApprove },
      ]);
    }
  };

  const openResetPin = (user: StaffUser) => {
    setResetPinUserId(user.id);
    setNewPin("");
    setConfirmPin("");
    setPinError("");
    setShowNewPin(false);
  };

  const handleResetPin = async () => {
    if (!newPin || newPin.length < 10) {
      setPinError("Password must be at least 10 characters");
      return;
    }
    if (!/[a-zA-Z]/.test(newPin)) {
      setPinError("Password must include a letter");
      return;
    }
    if (!/\d/.test(newPin)) {
      setPinError("Password must include a number");
      return;
    }
    if (newPin !== confirmPin) {
      setPinError("Passwords do not match");
      return;
    }
    setPinSaving(true);
    setPinError("");
    try {
      await apiRequest("POST", "/api/staff/reset-password", {
        username: resetPinUser?.username,
        tempPassword: newPin,
      });
      setResetPinUserId(null);
      const name = resetPinUser?.displayName || resetPinUser?.username;
      const msg = `Temporary password set for ${name}. They will be asked to choose a new one at next sign-in.`;
      Platform.OS === "web" ? window.alert(msg) : Alert.alert("Done", msg);
    } catch (e: any) {
      setPinError(e?.message || "Failed to reset password");
    } finally {
      setPinSaving(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={28} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Staff Accounts</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <View style={styles.section}>
          <Ionicons name="people" size={32} color="#F59E0B" />
          <Text style={styles.sectionTitle}>Manage Team</Text>
          <Text style={styles.sectionDesc}>
            {isOwner
              ? "Approve accounts, change roles, reset PINs, lock or delete accounts."
              : "View staff accounts and reset PINs."}
          </Text>
        </View>

        {isLoading ? (
          <ActivityIndicator size="large" color={Colors.brand.blue} style={{ marginVertical: 40 }} />
        ) : !staffUsers || staffUsers.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="person-outline" size={48} color={Colors.light.border} />
            <Text style={styles.emptyText}>No staff accounts</Text>
          </View>
        ) : (
          <>
            {staffUsers.filter(u => u.approvalStatus === "pending").length > 0 && (
              <View style={styles.pendingBanner}>
                <Ionicons name="time" size={18} color="#92400E" style={{ marginRight: 8 }} />
                <Text style={styles.pendingBannerText}>
                  {staffUsers.filter(u => u.approvalStatus === "pending").length} account{staffUsers.filter(u => u.approvalStatus === "pending").length > 1 ? "s" : ""} awaiting your approval
                </Text>
              </View>
            )}

            {staffUsers.map((user) => {
              const roleConfig = ROLES.find(r => r.value === user.role) || ROLES[0];
              const isSelf = user.username === currentUsername;
              const isBusy = updatingUser === user.id;
              const isLocked = !user.active;
              const isPending = user.approvalStatus === "pending";
              const isRejected = user.approvalStatus === "rejected";

              return (
                <View key={user.id} style={[
                  styles.userCard,
                  isSelf && styles.userCardSelf,
                  isLocked && styles.userCardLocked,
                  isPending && styles.userCardPending,
                ]}>
                  <View style={styles.userHeader}>
                    <View style={[styles.userIconWrap, { backgroundColor: isPending ? "#FEF3C715" : isLocked ? "#9CA3AF15" : roleConfig.color + "15" }]}>
                      <Ionicons
                        name={isPending ? "time-outline" : isLocked ? "lock-closed" : roleConfig.icon}
                        size={22}
                        color={isPending ? "#D97706" : isLocked ? "#9CA3AF" : roleConfig.color}
                      />
                    </View>
                    <View style={styles.userInfo}>
                      <View style={styles.userNameRow}>
                        <Text style={[styles.userName, isLocked && styles.lockedText]}>
                          {user.displayName || user.username}
                        </Text>
                        {isSelf && (
                          <View style={styles.youBadge}>
                            <Text style={styles.youBadgeText}>You</Text>
                          </View>
                        )}
                        {isPending && (
                          <View style={styles.pendingBadge}>
                            <Text style={styles.pendingBadgeText}>Pending</Text>
                          </View>
                        )}
                        {isRejected && (
                          <View style={styles.rejectedBadge}>
                            <Text style={styles.rejectedBadgeText}>Rejected</Text>
                          </View>
                        )}
                        {isLocked && !isPending && (
                          <View style={styles.lockedBadge}>
                            <Text style={styles.lockedBadgeText}>Locked</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.userUsername}>@{user.username}</Text>
                      <Text style={styles.userJoined}>
                        Joined {new Date(user.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                      </Text>
                    </View>
                  </View>

                  {isPending && isOwner && (
                    <View style={styles.approvalRow}>
                      <Pressable
                        onPress={() => handleApprove(user, "approved")}
                        disabled={isBusy}
                        style={({ pressed }) => [styles.approveBtn, { opacity: pressed ? 0.7 : 1 }]}
                      >
                        {isBusy ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <>
                            <Ionicons name="checkmark-circle" size={16} color="#fff" />
                            <Text style={styles.approveBtnText}>Approve</Text>
                          </>
                        )}
                      </Pressable>
                      <Pressable
                        onPress={() => handleApprove(user, "rejected")}
                        disabled={isBusy}
                        style={({ pressed }) => [styles.rejectBtn, { opacity: pressed ? 0.7 : 1 }]}
                      >
                        {isBusy ? (
                          <ActivityIndicator size="small" color="#DC2626" />
                        ) : (
                          <>
                            <Ionicons name="close-circle" size={16} color="#DC2626" />
                            <Text style={styles.rejectBtnText}>Reject</Text>
                          </>
                        )}
                      </Pressable>
                    </View>
                  )}

                  {!isPending && (
                    <>
                      {isOwner ? (
                        <View style={styles.roleSection}>
                          <Text style={styles.roleLabel}>ROLE</Text>
                          <View style={styles.roleButtons}>
                            {ROLES.map((r) => {
                              const isActive = user.role === r.value;
                              return (
                                <Pressable
                                  key={r.value}
                                  onPress={() => !isSelf && !isActive && handleRoleChange(user, r.value)}
                                  disabled={isSelf || isActive || isBusy}
                                  style={({ pressed }) => [
                                    styles.roleButton,
                                    isActive && { backgroundColor: r.color + "15", borderColor: r.color },
                                    (isSelf && !isActive) && { opacity: 0.4 },
                                    pressed && !isSelf && !isActive ? { opacity: 0.7 } : null,
                                  ]}
                                >
                                  {isBusy && !isActive ? (
                                    <ActivityIndicator size="small" color={r.color} />
                                  ) : (
                                    <Ionicons name={r.icon} size={14} color={isActive ? r.color : Colors.light.textSecondary} />
                                  )}
                                  <Text style={[styles.roleButtonText, isActive && { color: r.color }]}>
                                    {r.label}
                                  </Text>
                                </Pressable>
                              );
                            })}
                          </View>
                        </View>
                      ) : (
                        <View style={styles.roleSection}>
                          <Text style={styles.roleLabel}>ROLE</Text>
                          <View style={[styles.roleButton, { backgroundColor: roleConfig.color + "15", borderColor: roleConfig.color, alignSelf: "flex-start" }]}>
                            <Ionicons name={roleConfig.icon} size={14} color={roleConfig.color} />
                            <Text style={[styles.roleButtonText, { color: roleConfig.color }]}>{roleConfig.label}</Text>
                          </View>
                        </View>
                      )}

                      {!isSelf && (
                        <View style={styles.actionsRow}>
                          <Pressable
                            onPress={() => router.push({ pathname: "/admin-staff-docs", params: { staffId: String(user.id), staffName: user.displayName || user.username } })}
                            style={({ pressed }) => [styles.actionBtn, { borderColor: "#7C3AED", opacity: pressed ? 0.7 : 1 }]}
                          >
                            <Ionicons name="documents-outline" size={15} color="#7C3AED" />
                            <Text style={[styles.actionBtnText, { color: "#7C3AED" }]}>Documents</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => router.push({ pathname: "/admin-pay", params: { staffId: String(user.id), staffName: user.displayName || user.username } })}
                            style={({ pressed }) => [styles.actionBtn, { borderColor: "#065F46", opacity: pressed ? 0.7 : 1 }]}
                          >
                            <Ionicons name="cash-outline" size={15} color="#065F46" />
                            <Text style={[styles.actionBtnText, { color: "#065F46" }]}>Pay & SSP</Text>
                          </Pressable>
                          {(isOwner || user.role !== "owner") && (
                            <Pressable
                              onPress={() => openResetPin(user)}
                              disabled={isBusy}
                              style={({ pressed }) => [styles.actionBtn, styles.actionBtnPrimary, { opacity: pressed ? 0.7 : 1 }]}
                            >
                              <Ionicons name="key-outline" size={15} color={Colors.brand.blue} />
                              <Text style={[styles.actionBtnText, { color: Colors.brand.blue }]}>Reset Password</Text>
                            </Pressable>
                          )}

                          {isOwner && (
                            <Pressable
                              onPress={() => handleToggleLock(user)}
                              disabled={isBusy}
                              style={({ pressed }) => [
                                styles.actionBtn,
                                isLocked ? styles.actionBtnSuccess : styles.actionBtnWarning,
                                { opacity: pressed ? 0.7 : 1 },
                              ]}
                            >
                              {isBusy ? (
                                <ActivityIndicator size="small" color={isLocked ? Colors.brand.green : "#D97706"} />
                              ) : (
                                <Ionicons
                                  name={isLocked ? "lock-open-outline" : "lock-closed-outline"}
                                  size={15}
                                  color={isLocked ? Colors.brand.green : "#D97706"}
                                />
                              )}
                              <Text style={[styles.actionBtnText, { color: isLocked ? Colors.brand.green : "#D97706" }]}>
                                {isLocked ? "Unlock" : "Lock"}
                              </Text>
                            </Pressable>
                          )}

                          {isOwner && (
                            <Pressable
                              onPress={() => handleDelete(user)}
                              disabled={isBusy}
                              style={({ pressed }) => [styles.actionBtn, styles.actionBtnDanger, { opacity: pressed ? 0.7 : 1 }]}
                            >
                              <Ionicons name="trash-outline" size={15} color={Colors.brand.red} />
                              <Text style={[styles.actionBtnText, { color: Colors.brand.red }]}>Delete</Text>
                            </Pressable>
                          )}
                        </View>
                      )}
                    </>
                  )}
                </View>
              );
            })}
          </>
        )}

        <View style={{ height: Platform.OS === "web" ? 50 : insets.bottom + 20 }} />
      </ScrollView>

      <Modal
        visible={resetPinUserId !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setResetPinUserId(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setResetPinUserId(null)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <Ionicons name="key" size={22} color={Colors.brand.blue} />
              <Text style={styles.modalTitle}>Reset Password</Text>
              <Pressable onPress={() => setResetPinUserId(null)} hitSlop={12}>
                <Ionicons name="close" size={22} color={Colors.light.textSecondary} />
              </Pressable>
            </View>

            <Text style={styles.modalSubtitle}>
              Set a temporary password for <Text style={styles.modalUsername}>{resetPinUser?.displayName || resetPinUser?.username}</Text>. They will be asked to choose a new one at next sign-in.
            </Text>

            <Text style={styles.inputLabel}>NEW PASSWORD</Text>
            <View style={{ position: "relative" }}>
              <TextInput
                style={[styles.pinInput, { paddingRight: 44 }]}
                value={newPin}
                onChangeText={(t) => { setNewPin(t); setPinError(""); }}
                placeholder="At least 10 characters"
                placeholderTextColor={Colors.light.textSecondary}
                secureTextEntry={!showNewPin}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="new-password"
                textContentType="newPassword"
                maxLength={200}
              />
              <Pressable
                onPress={() => setShowNewPin(v => !v)}
                hitSlop={8}
                style={{ position: "absolute", right: 8, top: 0, bottom: 0, justifyContent: "center", paddingHorizontal: 6 }}
              >
                <Ionicons name={showNewPin ? "eye-off" : "eye"} size={18} color={Colors.light.textSecondary} />
              </Pressable>
            </View>
            <Text style={[styles.inputLabel, { marginTop: 4 }]}>CONFIRM PASSWORD</Text>
            <TextInput
              style={[styles.pinInput, { marginTop: 8 }]}
              value={confirmPin}
              onChangeText={(t) => { setConfirmPin(t); setPinError(""); }}
              placeholder="Re-enter password"
              placeholderTextColor={Colors.light.textSecondary}
              secureTextEntry={!showNewPin}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="new-password"
              textContentType="newPassword"
              maxLength={200}
            />
            {pinError ? (
              <View style={styles.pinErrorRow}>
                <Ionicons name="alert-circle" size={16} color={Colors.brand.red} />
                <Text style={styles.pinErrorText}>{pinError}</Text>
              </View>
            ) : null}

            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setResetPinUserId(null)}
                style={({ pressed }) => [styles.modalCancelBtn, { opacity: pressed ? 0.7 : 1 }]}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleResetPin}
                disabled={pinSaving}
                style={({ pressed }) => [styles.modalConfirmBtn, { opacity: pressed ? 0.7 : 1 }]}
              >
                {pinSaving ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalConfirmText}>Set PIN</Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: Colors.light.background },
  container: { flex: 1, backgroundColor: Colors.light.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  headerTitle: { fontFamily: "Montserrat_700Bold", fontSize: 18, color: Colors.light.text },
  scrollView: { flex: 1 },
  scrollContent: { padding: 20 },
  section: { alignItems: "center", marginBottom: 24, gap: 8 },
  sectionTitle: { fontFamily: "Montserrat_700Bold", fontSize: 22, color: Colors.light.text, marginTop: 4 },
  sectionDesc: { fontFamily: "Montserrat_400Regular", fontSize: 14, color: Colors.light.textSecondary, textAlign: "center", lineHeight: 20 },
  emptyState: { alignItems: "center", justifyContent: "center", paddingVertical: 32, gap: 6 },
  emptyText: { fontFamily: "Montserrat_600SemiBold", fontSize: 15, color: Colors.light.textSecondary },
  userCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  userCardSelf: { borderColor: Colors.brand.gold + "40", borderWidth: 2 },
  userCardLocked: { opacity: 0.75, borderColor: "#E5E7EB" },
  userHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 },
  userIconWrap: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  userInfo: { flex: 1 },
  userNameRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  userName: { fontFamily: "Montserrat_700Bold", fontSize: 16, color: Colors.light.text },
  lockedText: { color: "#9CA3AF" },
  youBadge: { backgroundColor: Colors.brand.blue + "15", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  youBadgeText: { fontFamily: "Montserrat_600SemiBold", fontSize: 10, color: Colors.brand.blue },
  lockedBadge: { backgroundColor: "#FEE2E2", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  lockedBadgeText: { fontFamily: "Montserrat_600SemiBold", fontSize: 10, color: Colors.brand.red },
  userUsername: { fontFamily: "Montserrat_500Medium", fontSize: 13, color: Colors.light.textSecondary, marginTop: 2 },
  userJoined: { fontFamily: "Montserrat_400Regular", fontSize: 11, color: Colors.light.textSecondary, marginTop: 2 },
  roleSection: { borderTopWidth: 1, borderTopColor: Colors.light.border, paddingTop: 12 },
  roleLabel: { fontFamily: "Montserrat_700Bold", fontSize: 11, color: Colors.light.textSecondary, letterSpacing: 1, marginBottom: 8 },
  roleButtons: { flexDirection: "row", gap: 8 },
  roleButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
  },
  roleButtonText: { fontFamily: "Montserrat_600SemiBold", fontSize: 12, color: Colors.light.textSecondary },
  actionsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  actionBtnPrimary: { borderColor: Colors.brand.blue + "40", backgroundColor: Colors.brand.blue + "08" },
  actionBtnWarning: { borderColor: "#D97706" + "40", backgroundColor: "#D97706" + "08" },
  actionBtnSuccess: { borderColor: Colors.brand.green + "40", backgroundColor: Colors.brand.green + "08" },
  actionBtnDanger: { borderColor: Colors.brand.red + "40", backgroundColor: Colors.brand.red + "08" },
  actionBtnText: { fontFamily: "Montserrat_600SemiBold", fontSize: 12 },
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
    maxWidth: 400,
  },
  modalHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16 },
  modalTitle: { fontFamily: "Montserrat_700Bold", fontSize: 18, color: Colors.light.text, flex: 1 },
  modalSubtitle: { fontFamily: "Montserrat_400Regular", fontSize: 14, color: Colors.light.textSecondary, marginBottom: 20, lineHeight: 20 },
  modalUsername: { fontFamily: "Montserrat_700Bold", color: Colors.light.text },
  inputLabel: { fontFamily: "Montserrat_700Bold", fontSize: 11, color: Colors.light.textSecondary, letterSpacing: 1, marginBottom: 6 },
  pinInput: {
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.light.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontFamily: "Montserrat_500Medium",
    fontSize: 18,
    color: Colors.light.text,
    letterSpacing: 4,
  },
  pinErrorRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 },
  pinErrorText: { fontFamily: "Montserrat_500Medium", fontSize: 13, color: Colors.brand.red },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 20 },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.light.border,
    alignItems: "center",
  },
  modalCancelText: { fontFamily: "Montserrat_600SemiBold", fontSize: 15, color: Colors.light.textSecondary },
  modalConfirmBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: Colors.brand.blue,
    alignItems: "center",
  },
  modalConfirmText: { fontFamily: "Montserrat_700Bold", fontSize: 15, color: "#FFFFFF" },
  ownerBadge: { backgroundColor: Colors.brand.gold + "15" },
  managerBadge: { backgroundColor: "#7C3AED15" },
  ownerBadgeText: { color: Colors.brand.gold },
  managerBadgeText: { color: "#7C3AED" },
  pendingBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEF3C7",
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#FCD34D",
  },
  pendingBannerText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 13,
    color: "#92400E",
    flex: 1,
  },
  userCardPending: {
    borderColor: "#FCD34D",
    borderWidth: 2,
    backgroundColor: "#FFFBEB",
  },
  pendingBadge: {
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  pendingBadgeText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 10,
    color: "#D97706",
  },
  rejectedBadge: {
    backgroundColor: "#FEE2E2",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  rejectedBadgeText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 10,
    color: "#DC2626",
  },
  approvalRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#FCD34D",
  },
  approveBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: Colors.brand.green,
  },
  approveBtnText: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 14,
    color: "#fff",
  },
  rejectBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#DC2626",
    backgroundColor: "#FEF2F2",
  },
  rejectBtnText: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 14,
    color: "#DC2626",
  },
});
