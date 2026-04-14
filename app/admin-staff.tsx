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

type DbsCheck = {
  id: number;
  staffId: number;
  checkType: string;
  certificateNumber: string | null;
  issuedDate: string | null;
  expiryDate: string | null;
  status: string;
  notes: string | null;
  addedByUsername: string | null;
  updatedAt: string;
};

const ROLES = [
  { value: "staff", label: "Staff", icon: "shield-checkmark" as const, color: Colors.brand.green },
  { value: "manager", label: "Manager", icon: "shield" as const, color: "#7C3AED" },
  { value: "owner", label: "Owner", icon: "star" as const, color: Colors.brand.gold },
];

const CHECK_TYPES = [
  { value: "basic", label: "Basic" },
  { value: "standard", label: "Standard" },
  { value: "enhanced", label: "Enhanced" },
  { value: "enhanced_barred", label: "Enhanced + Barred Lists" },
];

const DBS_STATUSES = [
  { value: "not_checked", label: "Not Checked", color: "#DC2626", icon: "alert-circle" as const },
  { value: "valid", label: "Valid", color: "#059669", icon: "checkmark-circle" as const },
  { value: "renewal_due", label: "Renewal Due", color: "#D97706", icon: "time" as const },
  { value: "expired", label: "Expired", color: "#6B7280", icon: "close-circle" as const },
];

function dbsStatusConfig(status: string) {
  return DBS_STATUSES.find(s => s.value === status) || DBS_STATUSES[0];
}

export default function AdminStaffScreen() {
  const insets = useSafeAreaInsets();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const { isAuthenticated, isLoading: authLoading, username: currentUsername, isManager, isOwner } = useStaffAuth();

  const [activeTab, setActiveTab] = useState<"accounts" | "dbs">("accounts");

  // Accounts state
  const [updatingUser, setUpdatingUser] = useState<number | null>(null);
  const [resetPinUserId, setResetPinUserId] = useState<number | null>(null);
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [pinSaving, setPinSaving] = useState(false);

  // DBS state
  const [dbsModal, setDbsModal] = useState<{ staffId: number; name: string; existing: DbsCheck | null } | null>(null);
  const [dbsCheckType, setDbsCheckType] = useState("enhanced");
  const [dbsCertNum, setDbsCertNum] = useState("");
  const [dbsIssuedDate, setDbsIssuedDate] = useState("");
  const [dbsExpiryDate, setDbsExpiryDate] = useState("");
  const [dbsStatus, setDbsStatus] = useState("not_checked");
  const [dbsNotes, setDbsNotes] = useState("");
  const [dbsSaving, setDbsSaving] = useState(false);

  const { data: staffUsers, isLoading } = useQuery<StaffUser[]>({
    queryKey: ["/api/staff/users"],
  });

  const { data: dbsChecks = [], isLoading: dbsLoading } = useQuery<DbsCheck[]>({
    queryKey: ["/api/hr/dbs"],
    enabled: activeTab === "dbs",
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

  // ── Accounts handlers ────────────────────────────────────────────────────────
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
      if (window.confirm(willLock ? `Lock ${name}'s account?` : `Unlock ${name}'s account?`)) doToggle();
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
  };

  const handleResetPin = async () => {
    if (!newPin || newPin.length < 4 || newPin.length > 8 || !/^\d+$/.test(newPin)) {
      setPinError("PIN must be 4–8 digits");
      return;
    }
    if (newPin !== confirmPin) {
      setPinError("PINs do not match");
      return;
    }
    setPinSaving(true);
    setPinError("");
    try {
      await apiRequest("POST", "/api/staff/reset-pin", { username: resetPinUser?.username, newPin });
      setResetPinUserId(null);
      const msg = `PIN updated for ${resetPinUser?.displayName || resetPinUser?.username}`;
      Platform.OS === "web" ? window.alert(msg) : Alert.alert("Done", msg);
    } catch (e: any) {
      setPinError(e?.message || "Failed to reset PIN");
    } finally {
      setPinSaving(false);
    }
  };

  // ── DBS handlers ─────────────────────────────────────────────────────────────
  const openDbsModal = (user: StaffUser) => {
    const existing = dbsChecks.find(c => c.staffId === user.id) || null;
    setDbsModal({ staffId: user.id, name: user.displayName || user.username, existing });
    setDbsCheckType(existing?.checkType || "enhanced");
    setDbsCertNum(existing?.certificateNumber || "");
    setDbsIssuedDate(existing?.issuedDate || "");
    setDbsExpiryDate(existing?.expiryDate || "");
    setDbsStatus(existing?.status || "not_checked");
    setDbsNotes(existing?.notes || "");
  };

  const handleSaveDbs = async () => {
    if (!dbsModal) return;
    setDbsSaving(true);
    try {
      await apiRequest("POST", "/api/hr/dbs", {
        staffId: dbsModal.staffId,
        checkType: dbsCheckType,
        certificateNumber: dbsCertNum.trim() || null,
        issuedDate: dbsIssuedDate.trim() || null,
        expiryDate: dbsExpiryDate.trim() || null,
        status: dbsStatus,
        notes: dbsNotes.trim() || null,
      });
      await queryClient.refetchQueries({ queryKey: ["/api/hr/dbs"] });
      setDbsModal(null);
    } catch (e: any) {
      const msg = e?.message || "Failed to save DBS record";
      Platform.OS === "web" ? window.alert(msg) : Alert.alert("Error", msg);
    } finally {
      setDbsSaving(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  const pendingCount = staffUsers?.filter(u => u.approvalStatus === "pending").length || 0;
  const dbsAlertCount = staffUsers?.filter(u => {
    const check = dbsChecks.find(c => c.staffId === u.id);
    return !check || check.status === "not_checked" || check.status === "expired";
  }).length || 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={28} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Staff Management</Text>
        <View style={{ width: 28 }} />
      </View>

      {/* Tab bar */}
      <View style={styles.tabBar}>
        <Pressable
          onPress={() => setActiveTab("accounts")}
          style={[styles.tab, activeTab === "accounts" && styles.tabActive]}
        >
          <Ionicons name="people" size={16} color={activeTab === "accounts" ? Colors.brand.blue : Colors.light.textSecondary} />
          <Text style={[styles.tabText, activeTab === "accounts" && styles.tabTextActive]}>Accounts</Text>
          {pendingCount > 0 && (
            <View style={styles.tabBadge}>
              <Text style={styles.tabBadgeText}>{pendingCount}</Text>
            </View>
          )}
        </Pressable>
        <Pressable
          onPress={() => setActiveTab("dbs")}
          style={[styles.tab, activeTab === "dbs" && styles.tabActive]}
        >
          <Ionicons name="shield-checkmark" size={16} color={activeTab === "dbs" ? Colors.brand.blue : Colors.light.textSecondary} />
          <Text style={[styles.tabText, activeTab === "dbs" && styles.tabTextActive]}>DBS Checks</Text>
          {activeTab !== "dbs" && dbsAlertCount > 0 && (
            <View style={[styles.tabBadge, { backgroundColor: "#DC2626" }]}>
              <Text style={styles.tabBadgeText}>{dbsAlertCount}</Text>
            </View>
          )}
        </Pressable>
      </View>

      {/* ── ACCOUNTS TAB ─────────────────────────────────────────────────────── */}
      {activeTab === "accounts" && (
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
              {pendingCount > 0 && (
                <View style={styles.pendingBanner}>
                  <Ionicons name="time" size={18} color="#92400E" style={{ marginRight: 8 }} />
                  <Text style={styles.pendingBannerText}>
                    {pendingCount} account{pendingCount > 1 ? "s" : ""} awaiting your approval
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
                          {isSelf && <View style={styles.youBadge}><Text style={styles.youBadgeText}>You</Text></View>}
                          {isPending && <View style={styles.pendingBadge}><Text style={styles.pendingBadgeText}>Pending</Text></View>}
                          {isRejected && <View style={styles.rejectedBadge}><Text style={styles.rejectedBadgeText}>Rejected</Text></View>}
                          {isLocked && !isPending && <View style={styles.lockedBadge}><Text style={styles.lockedBadgeText}>Locked</Text></View>}
                        </View>
                        <Text style={styles.userUsername}>@{user.username}</Text>
                        <Text style={styles.userJoined}>
                          Joined {new Date(user.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                        </Text>
                      </View>
                    </View>

                    {isPending && isOwner && (
                      <View style={styles.approvalRow}>
                        <Pressable onPress={() => handleApprove(user, "approved")} disabled={isBusy} style={({ pressed }) => [styles.approveBtn, { opacity: pressed ? 0.7 : 1 }]}>
                          {isBusy ? <ActivityIndicator size="small" color="#fff" /> : <><Ionicons name="checkmark-circle" size={16} color="#fff" /><Text style={styles.approveBtnText}>Approve</Text></>}
                        </Pressable>
                        <Pressable onPress={() => handleApprove(user, "rejected")} disabled={isBusy} style={({ pressed }) => [styles.rejectBtn, { opacity: pressed ? 0.7 : 1 }]}>
                          {isBusy ? <ActivityIndicator size="small" color="#DC2626" /> : <><Ionicons name="close-circle" size={16} color="#DC2626" /><Text style={styles.rejectBtnText}>Reject</Text></>}
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
                                    {isBusy && !isActive ? <ActivityIndicator size="small" color={r.color} /> : <Ionicons name={r.icon} size={14} color={isActive ? r.color : Colors.light.textSecondary} />}
                                    <Text style={[styles.roleButtonText, isActive && { color: r.color }]}>{r.label}</Text>
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
                            <Pressable onPress={() => openResetPin(user)} disabled={isBusy} style={({ pressed }) => [styles.actionBtn, styles.actionBtnPrimary, { opacity: pressed ? 0.7 : 1 }]}>
                              <Ionicons name="key-outline" size={15} color={Colors.brand.blue} />
                              <Text style={[styles.actionBtnText, { color: Colors.brand.blue }]}>Reset PIN</Text>
                            </Pressable>
                            {isOwner && (
                              <Pressable onPress={() => handleToggleLock(user)} disabled={isBusy} style={({ pressed }) => [styles.actionBtn, isLocked ? styles.actionBtnSuccess : styles.actionBtnWarning, { opacity: pressed ? 0.7 : 1 }]}>
                                {isBusy ? <ActivityIndicator size="small" color={isLocked ? Colors.brand.green : "#D97706"} /> : <Ionicons name={isLocked ? "lock-open-outline" : "lock-closed-outline"} size={15} color={isLocked ? Colors.brand.green : "#D97706"} />}
                                <Text style={[styles.actionBtnText, { color: isLocked ? Colors.brand.green : "#D97706" }]}>{isLocked ? "Unlock" : "Lock"}</Text>
                              </Pressable>
                            )}
                            {isOwner && (
                              <Pressable onPress={() => handleDelete(user)} disabled={isBusy} style={({ pressed }) => [styles.actionBtn, styles.actionBtnDanger, { opacity: pressed ? 0.7 : 1 }]}>
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
      )}

      {/* ── DBS TAB ───────────────────────────────────────────────────────────── */}
      {activeTab === "dbs" && (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          <View style={styles.section}>
            <Ionicons name="shield-checkmark" size={32} color="#7C3AED" />
            <Text style={styles.sectionTitle}>DBS Checks</Text>
            <Text style={styles.sectionDesc}>
              Track Disclosure & Barring Service checks for all staff. UK legal compliance requirement.
            </Text>
          </View>

          {dbsLoading || isLoading ? (
            <ActivityIndicator size="large" color={Colors.brand.blue} style={{ marginVertical: 40 }} />
          ) : !staffUsers || staffUsers.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="person-outline" size={48} color={Colors.light.border} />
              <Text style={styles.emptyText}>No staff accounts</Text>
            </View>
          ) : (
            <>
              {/* Alert banner for outstanding checks */}
              {(() => {
                const outstanding = staffUsers.filter(u => {
                  const check = dbsChecks.find(c => c.staffId === u.id);
                  return !check || check.status === "not_checked" || check.status === "expired";
                });
                if (!outstanding.length) return null;
                return (
                  <View style={styles.dbsAlertBanner}>
                    <Ionicons name="alert-circle" size={18} color="#92400E" style={{ marginRight: 8 }} />
                    <Text style={styles.dbsAlertText}>
                      {outstanding.length} staff member{outstanding.length > 1 ? "s" : ""} require{outstanding.length === 1 ? "s" : ""} a DBS check
                    </Text>
                  </View>
                );
              })()}

              {staffUsers.map((user) => {
                const check = dbsChecks.find(c => c.staffId === user.id);
                const statusCfg = dbsStatusConfig(check?.status || "not_checked");
                const checkTypLabel = CHECK_TYPES.find(t => t.value === check?.checkType)?.label || "Enhanced";

                return (
                  <Pressable
                    key={user.id}
                    onPress={() => openDbsModal(user)}
                    style={({ pressed }) => [styles.dbsCard, { opacity: pressed ? 0.85 : 1 }]}
                  >
                    <View style={styles.dbsCardLeft}>
                      <View style={[styles.dbsStatusDot, { backgroundColor: statusCfg.color + "20", borderColor: statusCfg.color }]}>
                        <Ionicons name={statusCfg.icon} size={20} color={statusCfg.color} />
                      </View>
                      <View style={styles.dbsCardInfo}>
                        <Text style={styles.dbsName}>{user.displayName || user.username}</Text>
                        <Text style={styles.dbsUsername}>@{user.username}</Text>
                        {check ? (
                          <View style={styles.dbsMeta}>
                            <Text style={styles.dbsMetaText}>{checkTypLabel}</Text>
                            {check.issuedDate && <Text style={styles.dbsMetaText}> · Issued {check.issuedDate}</Text>}
                            {check.expiryDate && <Text style={styles.dbsMetaText}> · Renew by {check.expiryDate}</Text>}
                          </View>
                        ) : (
                          <Text style={[styles.dbsMetaText, { color: "#DC2626" }]}>No record — tap to add</Text>
                        )}
                      </View>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <View style={[styles.dbsStatusBadge, { backgroundColor: statusCfg.color + "15" }]}>
                        <Text style={[styles.dbsStatusBadgeText, { color: statusCfg.color }]}>{statusCfg.label}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={Colors.light.textSecondary} />
                    </View>
                  </Pressable>
                );
              })}
            </>
          )}
          <View style={{ height: Platform.OS === "web" ? 50 : insets.bottom + 20 }} />
        </ScrollView>
      )}

      {/* ── Reset PIN Modal ───────────────────────────────────────────────────── */}
      <Modal visible={resetPinUserId !== null} transparent animationType="fade" onRequestClose={() => setResetPinUserId(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setResetPinUserId(null)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <Ionicons name="key" size={22} color={Colors.brand.blue} />
              <Text style={styles.modalTitle}>Reset PIN</Text>
              <Pressable onPress={() => setResetPinUserId(null)} hitSlop={12}>
                <Ionicons name="close" size={22} color={Colors.light.textSecondary} />
              </Pressable>
            </View>
            <Text style={styles.modalSubtitle}>
              Set a new PIN for <Text style={styles.modalUsername}>{resetPinUser?.displayName || resetPinUser?.username}</Text>
            </Text>
            <Text style={styles.inputLabel}>NEW PIN</Text>
            <TextInput
              style={styles.pinInput}
              value={newPin}
              onChangeText={(t) => { setNewPin(t); setPinError(""); }}
              placeholder="4–8 digits"
              placeholderTextColor={Colors.light.textSecondary}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={8}
            />
            <Text style={styles.inputLabel}>CONFIRM PIN</Text>
            <TextInput
              style={[styles.pinInput, { marginTop: 8 }]}
              value={confirmPin}
              onChangeText={(t) => { setConfirmPin(t); setPinError(""); }}
              placeholder="Re-enter PIN"
              placeholderTextColor={Colors.light.textSecondary}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={8}
            />
            {pinError ? (
              <View style={styles.pinErrorRow}>
                <Ionicons name="alert-circle" size={16} color={Colors.brand.red} />
                <Text style={styles.pinErrorText}>{pinError}</Text>
              </View>
            ) : null}
            <View style={styles.modalActions}>
              <Pressable onPress={() => setResetPinUserId(null)} style={({ pressed }) => [styles.modalCancelBtn, { opacity: pressed ? 0.7 : 1 }]}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable onPress={handleResetPin} disabled={pinSaving} style={({ pressed }) => [styles.modalConfirmBtn, { opacity: pressed ? 0.7 : 1 }]}>
                {pinSaving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.modalConfirmText}>Set PIN</Text>}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── DBS Edit Modal ────────────────────────────────────────────────────── */}
      <Modal visible={dbsModal !== null} transparent animationType="slide" onRequestClose={() => setDbsModal(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setDbsModal(null)}>
          <Pressable style={[styles.modalCard, { maxHeight: "90%" }]} onPress={() => {}}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.modalHeader}>
                <Ionicons name="shield-checkmark" size={22} color="#7C3AED" />
                <Text style={styles.modalTitle}>DBS Check</Text>
                <Pressable onPress={() => setDbsModal(null)} hitSlop={12}>
                  <Ionicons name="close" size={22} color={Colors.light.textSecondary} />
                </Pressable>
              </View>
              <Text style={styles.modalSubtitle}>
                Recording DBS check for <Text style={styles.modalUsername}>{dbsModal?.name}</Text>
              </Text>

              {/* Status */}
              <Text style={styles.inputLabel}>STATUS</Text>
              <View style={styles.dbsOptionRow}>
                {DBS_STATUSES.map(s => (
                  <Pressable
                    key={s.value}
                    onPress={() => setDbsStatus(s.value)}
                    style={[styles.dbsOptionBtn, dbsStatus === s.value && { borderColor: s.color, backgroundColor: s.color + "10" }]}
                  >
                    <Ionicons name={s.icon} size={14} color={dbsStatus === s.value ? s.color : Colors.light.textSecondary} />
                    <Text style={[styles.dbsOptionText, dbsStatus === s.value && { color: s.color }]}>{s.label}</Text>
                  </Pressable>
                ))}
              </View>

              {/* Check type */}
              <Text style={[styles.inputLabel, { marginTop: 16 }]}>CHECK TYPE</Text>
              <View style={styles.dbsOptionRow}>
                {CHECK_TYPES.map(t => (
                  <Pressable
                    key={t.value}
                    onPress={() => setDbsCheckType(t.value)}
                    style={[styles.dbsOptionBtn, dbsCheckType === t.value && { borderColor: "#7C3AED", backgroundColor: "#7C3AED10" }]}
                  >
                    <Text style={[styles.dbsOptionText, dbsCheckType === t.value && { color: "#7C3AED" }]}>{t.label}</Text>
                  </Pressable>
                ))}
              </View>

              {/* Certificate number */}
              <Text style={[styles.inputLabel, { marginTop: 16 }]}>CERTIFICATE NUMBER</Text>
              <TextInput
                style={styles.textInput}
                value={dbsCertNum}
                onChangeText={setDbsCertNum}
                placeholder="e.g. 001234567890"
                placeholderTextColor={Colors.light.textSecondary}
                keyboardType="number-pad"
              />

              {/* Dates */}
              <View style={styles.dateRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>ISSUE DATE</Text>
                  <TextInput
                    style={styles.textInput}
                    value={dbsIssuedDate}
                    onChangeText={setDbsIssuedDate}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={Colors.light.textSecondary}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>RENEWAL REMINDER</Text>
                  <TextInput
                    style={styles.textInput}
                    value={dbsExpiryDate}
                    onChangeText={setDbsExpiryDate}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={Colors.light.textSecondary}
                  />
                </View>
              </View>

              {/* Notes */}
              <Text style={[styles.inputLabel, { marginTop: 16 }]}>NOTES</Text>
              <TextInput
                style={[styles.textInput, { height: 72, textAlignVertical: "top" }]}
                value={dbsNotes}
                onChangeText={setDbsNotes}
                placeholder="Any relevant notes..."
                placeholderTextColor={Colors.light.textSecondary}
                multiline
              />

              <View style={[styles.modalActions, { marginTop: 20 }]}>
                <Pressable onPress={() => setDbsModal(null)} style={({ pressed }) => [styles.modalCancelBtn, { opacity: pressed ? 0.7 : 1 }]}>
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </Pressable>
                <Pressable onPress={handleSaveDbs} disabled={dbsSaving} style={({ pressed }) => [styles.modalConfirmBtn, { backgroundColor: "#7C3AED", opacity: pressed ? 0.7 : 1 }]}>
                  {dbsSaving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.modalConfirmText}>Save Record</Text>}
                </Pressable>
              </View>
            </ScrollView>
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
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.light.border,
  },
  headerTitle: { fontFamily: "Montserrat_700Bold", fontSize: 18, color: Colors.light.text },

  // Tabs
  tabBar: {
    flexDirection: "row", borderBottomWidth: 1, borderBottomColor: Colors.light.border,
    backgroundColor: Colors.light.background,
  },
  tab: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 12,
    borderBottomWidth: 2, borderBottomColor: "transparent",
  },
  tabActive: { borderBottomColor: Colors.brand.blue },
  tabText: { fontFamily: "Montserrat_600SemiBold", fontSize: 13, color: Colors.light.textSecondary },
  tabTextActive: { color: Colors.brand.blue },
  tabBadge: {
    backgroundColor: "#D97706", borderRadius: 8, minWidth: 16, height: 16,
    alignItems: "center", justifyContent: "center", paddingHorizontal: 4,
  },
  tabBadgeText: { fontFamily: "Montserrat_700Bold", fontSize: 10, color: "#fff" },

  scrollView: { flex: 1 },
  scrollContent: { padding: 20 },
  section: { alignItems: "center", marginBottom: 24, gap: 8 },
  sectionTitle: { fontFamily: "Montserrat_700Bold", fontSize: 22, color: Colors.light.text, marginTop: 4 },
  sectionDesc: { fontFamily: "Montserrat_400Regular", fontSize: 14, color: Colors.light.textSecondary, textAlign: "center", lineHeight: 20 },
  emptyState: { alignItems: "center", justifyContent: "center", paddingVertical: 32, gap: 6 },
  emptyText: { fontFamily: "Montserrat_600SemiBold", fontSize: 15, color: Colors.light.textSecondary },

  // Staff cards
  userCard: {
    backgroundColor: "#FFFFFF", borderRadius: 16, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: Colors.light.border,
  },
  userCardSelf: { borderColor: Colors.brand.gold + "40", borderWidth: 2 },
  userCardLocked: { opacity: 0.75, borderColor: "#E5E7EB" },
  userCardPending: { borderColor: "#FCD34D", borderWidth: 2, backgroundColor: "#FFFBEB" },
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
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    paddingVertical: 10, borderRadius: 10, borderWidth: 2,
    borderColor: Colors.light.border, backgroundColor: Colors.light.surface,
  },
  roleButtonText: { fontFamily: "Montserrat_600SemiBold", fontSize: 12, color: Colors.light.textSecondary },
  actionsRow: {
    flexDirection: "row", gap: 8, marginTop: 12, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: Colors.light.border,
  },
  actionBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5,
    paddingVertical: 9, borderRadius: 10, borderWidth: 1.5,
  },
  actionBtnPrimary: { borderColor: Colors.brand.blue + "40", backgroundColor: Colors.brand.blue + "08" },
  actionBtnWarning: { borderColor: "#D97706" + "40", backgroundColor: "#D97706" + "08" },
  actionBtnSuccess: { borderColor: Colors.brand.green + "40", backgroundColor: Colors.brand.green + "08" },
  actionBtnDanger: { borderColor: Colors.brand.red + "40", backgroundColor: Colors.brand.red + "08" },
  actionBtnText: { fontFamily: "Montserrat_600SemiBold", fontSize: 12 },

  // Approval
  pendingBanner: {
    flexDirection: "row", alignItems: "center", backgroundColor: "#FEF3C7",
    borderRadius: 12, padding: 12, marginBottom: 16,
    borderWidth: 1, borderColor: "#FCD34D",
  },
  pendingBannerText: { fontFamily: "Montserrat_600SemiBold", fontSize: 13, color: "#92400E", flex: 1 },
  approvalRow: {
    flexDirection: "row", gap: 10, marginTop: 12, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: "#FCD34D",
  },
  approveBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 11, borderRadius: 10, backgroundColor: Colors.brand.green,
  },
  approveBtnText: { fontFamily: "Montserrat_700Bold", fontSize: 14, color: "#fff" },
  rejectBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 11, borderRadius: 10,
    borderWidth: 1.5, borderColor: "#DC2626", backgroundColor: "#FEF2F2",
  },
  rejectBtnText: { fontFamily: "Montserrat_700Bold", fontSize: 14, color: "#DC2626" },
  pendingBadge: { backgroundColor: "#FEF3C7", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  pendingBadgeText: { fontFamily: "Montserrat_600SemiBold", fontSize: 10, color: "#D97706" },
  rejectedBadge: { backgroundColor: "#FEE2E2", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  rejectedBadgeText: { fontFamily: "Montserrat_600SemiBold", fontSize: 10, color: "#DC2626" },

  // DBS cards
  dbsAlertBanner: {
    flexDirection: "row", alignItems: "center", backgroundColor: "#FEF3C7",
    borderRadius: 12, padding: 12, marginBottom: 16,
    borderWidth: 1, borderColor: "#FCD34D",
  },
  dbsAlertText: { fontFamily: "Montserrat_600SemiBold", fontSize: 13, color: "#92400E", flex: 1 },
  dbsCard: {
    backgroundColor: "#FFFFFF", borderRadius: 16, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: Colors.light.border,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  dbsCardLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  dbsStatusDot: {
    width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center",
    borderWidth: 2,
  },
  dbsCardInfo: { flex: 1 },
  dbsName: { fontFamily: "Montserrat_700Bold", fontSize: 15, color: Colors.light.text },
  dbsUsername: { fontFamily: "Montserrat_400Regular", fontSize: 12, color: Colors.light.textSecondary, marginTop: 1 },
  dbsMeta: { flexDirection: "row", flexWrap: "wrap", marginTop: 3 },
  dbsMetaText: { fontFamily: "Montserrat_400Regular", fontSize: 12, color: Colors.light.textSecondary },
  dbsStatusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  dbsStatusBadgeText: { fontFamily: "Montserrat_700Bold", fontSize: 11 },
  dbsOptionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 },
  dbsOptionBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
    borderWidth: 1.5, borderColor: Colors.light.border, backgroundColor: Colors.light.surface,
  },
  dbsOptionText: { fontFamily: "Montserrat_600SemiBold", fontSize: 12, color: Colors.light.textSecondary },

  // Modals
  modalBackdrop: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center", alignItems: "center", padding: 24,
  },
  modalCard: {
    backgroundColor: "#FFFFFF", borderRadius: 20, padding: 24, width: "100%", maxWidth: 420,
  },
  modalHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16 },
  modalTitle: { fontFamily: "Montserrat_700Bold", fontSize: 18, color: Colors.light.text, flex: 1 },
  modalSubtitle: { fontFamily: "Montserrat_400Regular", fontSize: 14, color: Colors.light.textSecondary, marginBottom: 20, lineHeight: 20 },
  modalUsername: { fontFamily: "Montserrat_700Bold", color: Colors.light.text },
  inputLabel: { fontFamily: "Montserrat_700Bold", fontSize: 11, color: Colors.light.textSecondary, letterSpacing: 1, marginBottom: 6 },
  pinInput: {
    backgroundColor: Colors.light.surface, borderRadius: 12, borderWidth: 2,
    borderColor: Colors.light.border, paddingHorizontal: 16, paddingVertical: 14,
    fontFamily: "Montserrat_500Medium", fontSize: 18, color: Colors.light.text, letterSpacing: 4,
  },
  textInput: {
    backgroundColor: Colors.light.surface, borderRadius: 12, borderWidth: 1.5,
    borderColor: Colors.light.border, paddingHorizontal: 14, paddingVertical: 12,
    fontFamily: "Montserrat_500Medium", fontSize: 14, color: Colors.light.text,
  },
  dateRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  pinErrorRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 },
  pinErrorText: { fontFamily: "Montserrat_500Medium", fontSize: 13, color: Colors.brand.red },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 8 },
  modalCancelBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 12,
    borderWidth: 2, borderColor: Colors.light.border, alignItems: "center",
  },
  modalCancelText: { fontFamily: "Montserrat_600SemiBold", fontSize: 15, color: Colors.light.textSecondary },
  modalConfirmBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 12,
    backgroundColor: Colors.brand.blue, alignItems: "center",
  },
  modalConfirmText: { fontFamily: "Montserrat_700Bold", fontSize: 15, color: "#FFFFFF" },
});
