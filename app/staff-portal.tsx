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
  Animated,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/query-client";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import Colors from "@/constants/colors";
import type { StaffNotice } from "@shared/schema";

function LoginScreen() {
  const insets = useSafeAreaInsets();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const { login, register } = useStaffAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [masterPin, setMasterPin] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [selectedRole, setSelectedRole] = useState<"staff" | "manager">("staff");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const shakeAnim = useRef(new Animated.Value(0)).current;

  const triggerShake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  };

  const handleLogin = async () => {
    if (!username.trim()) {
      setError("Please enter your username");
      triggerShake();
      return;
    }
    if (!pin.trim()) {
      setError("Please enter your PIN");
      triggerShake();
      return;
    }

    setLoading(true);
    setError("");
    const result = await login(username.trim(), pin.trim());
    setLoading(false);

    if (!result.success) {
      setError(result.error || "Login failed");
      setPin("");
      triggerShake();
    }
  };

  const handleRegister = async () => {
    if (!masterPin.trim()) {
      setError("Master PIN is required to create an account");
      triggerShake();
      return;
    }
    if (!username.trim() || username.trim().length < 3) {
      setError("Username must be at least 3 characters");
      triggerShake();
      return;
    }
    if (!/^[a-zA-Z0-9_.-]+$/.test(username.trim())) {
      setError("Username can only contain letters, numbers, dots, hyphens, and underscores");
      triggerShake();
      return;
    }
    if (!pin.trim() || pin.length < 4) {
      setError("PIN must be at least 4 digits");
      triggerShake();
      return;
    }
    if (!/^\d+$/.test(pin)) {
      setError("PIN must contain only numbers");
      triggerShake();
      return;
    }
    if (pin !== confirmPin) {
      setError("PINs do not match");
      triggerShake();
      return;
    }

    setLoading(true);
    setError("");
    const result = await register(masterPin.trim(), username.trim(), pin.trim(), displayName.trim() || undefined, selectedRole);
    setLoading(false);

    if (!result.success) {
      setError(result.error || "Registration failed");
      triggerShake();
    } else {
      setSuccess("Account created! You can now sign in.");
      setMode("login");
      setMasterPin("");
      setConfirmPin("");
      setDisplayName("");
      setPin("");
      setSelectedRole("staff");
    }
  };

  return (
    <View style={[styles.loginContainer, { paddingTop: insets.top + webTopInset }]}>
      <View style={styles.loginHeader}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={28} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.loginHeaderTitle}>Staff Access</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={styles.loginScrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.lockIconWrap}>
          <Ionicons name={mode === "login" ? "lock-closed" : "person-add"} size={40} color={Colors.brand.blue} />
        </View>

        <Text style={styles.loginTitle}>{mode === "login" ? "Staff Sign In" : "Create Account"}</Text>
        <Text style={styles.loginSubtitle}>
          {mode === "login"
            ? "Enter your username and PIN"
            : "Set up your staff account"}
        </Text>

        {success ? (
          <View style={styles.successRow}>
            <Ionicons name="checkmark-circle" size={16} color={Colors.brand.green} />
            <Text style={styles.successText}>{success}</Text>
          </View>
        ) : null}

        <Animated.View style={[styles.formSection, { transform: [{ translateX: shakeAnim }] }]}>
          {mode === "register" && (
            <>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>MASTER PIN</Text>
                <TextInput
                  style={[styles.textInput, error && !masterPin ? styles.inputError : null]}
                  value={masterPin}
                  onChangeText={(text) => { setMasterPin(text); setError(""); setSuccess(""); }}
                  placeholder="Venue master PIN"
                  placeholderTextColor={Colors.light.textSecondary}
                  secureTextEntry
                  keyboardType="number-pad"
                  maxLength={10}
                  testID="register-master-pin"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>DISPLAY NAME (OPTIONAL)</Text>
                <TextInput
                  style={styles.textInput}
                  value={displayName}
                  onChangeText={(text) => { setDisplayName(text); setError(""); }}
                  placeholder="Your name"
                  placeholderTextColor={Colors.light.textSecondary}
                  maxLength={50}
                  testID="register-display-name"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>ROLE</Text>
                <View style={styles.roleSelector}>
                  <Pressable
                    onPress={() => setSelectedRole("staff")}
                    style={[styles.roleOption, selectedRole === "staff" && styles.roleOptionActive]}
                    testID="role-staff"
                  >
                    <Ionicons name="person" size={18} color={selectedRole === "staff" ? Colors.brand.blue : Colors.light.textSecondary} />
                    <Text style={[styles.roleOptionText, selectedRole === "staff" && styles.roleOptionTextActive]}>Staff</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setSelectedRole("manager")}
                    style={[styles.roleOption, selectedRole === "manager" && styles.roleOptionActive]}
                    testID="role-manager"
                  >
                    <Ionicons name="shield" size={18} color={selectedRole === "manager" ? Colors.brand.blue : Colors.light.textSecondary} />
                    <Text style={[styles.roleOptionText, selectedRole === "manager" && styles.roleOptionTextActive]}>Manager</Text>
                  </Pressable>
                </View>
              </View>
            </>
          )}

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>USERNAME</Text>
            <TextInput
              style={[styles.textInput, error && !username ? styles.inputError : null]}
              value={username}
              onChangeText={(text) => { setUsername(text); setError(""); setSuccess(""); }}
              placeholder="Enter username"
              placeholderTextColor={Colors.light.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={30}
              testID="staff-username-input"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>PIN</Text>
            <TextInput
              style={[styles.textInput, error && !pin ? styles.inputError : null]}
              value={pin}
              onChangeText={(text) => { setPin(text); setError(""); setSuccess(""); }}
              placeholder="Enter PIN"
              placeholderTextColor={Colors.light.textSecondary}
              secureTextEntry
              keyboardType="number-pad"
              maxLength={8}
              onSubmitEditing={mode === "login" ? handleLogin : undefined}
              testID="staff-pin-input"
            />
          </View>

          {mode === "register" && (
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>CONFIRM PIN</Text>
              <TextInput
                style={[styles.textInput, error && pin !== confirmPin ? styles.inputError : null]}
                value={confirmPin}
                onChangeText={(text) => { setConfirmPin(text); setError(""); }}
                placeholder="Re-enter PIN"
                placeholderTextColor={Colors.light.textSecondary}
                secureTextEntry
                keyboardType="number-pad"
                maxLength={8}
                testID="register-confirm-pin"
              />
            </View>
          )}
        </Animated.View>

        {error ? (
          <View style={styles.errorRow}>
            <Ionicons name="alert-circle" size={16} color={Colors.brand.red} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <Pressable
          onPress={mode === "login" ? handleLogin : handleRegister}
          disabled={loading}
          style={({ pressed }) => [
            styles.loginButton,
            loading && styles.loginButtonDisabled,
            { opacity: pressed ? 0.8 : 1 },
          ]}
          testID="staff-login-button"
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name={mode === "login" ? "log-in-outline" : "person-add-outline"} size={20} color="#FFFFFF" />
              <Text style={styles.loginButtonText}>
                {mode === "login" ? "Sign In" : "Create Account"}
              </Text>
            </>
          )}
        </Pressable>

        <Pressable
          onPress={() => {
            setMode(mode === "login" ? "register" : "login");
            setError("");
            setSuccess("");
            setMasterPin("");
            setConfirmPin("");
            setDisplayName("");
          }}
          style={({ pressed }) => [styles.switchModeButton, { opacity: pressed ? 0.7 : 1 }]}
          testID="switch-auth-mode"
        >
          <Text style={styles.switchModeText}>
            {mode === "login"
              ? "New staff? Create an account"
              : "Already have an account? Sign in"}
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

interface AdminToolProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  color: string;
  onPress: () => void;
  testID?: string;
}

function AdminTool({ icon, title, description, color, onPress, testID }: AdminToolProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.toolCard, { opacity: pressed ? 0.8 : 1 }]}
      testID={testID}
    >
      <View style={[styles.toolIconWrap, { backgroundColor: color + "15" }]}>
        <Ionicons name={icon} size={24} color={color} />
      </View>
      <View style={styles.toolInfo}>
        <Text style={styles.toolTitle}>{title}</Text>
        <Text style={styles.toolDesc}>{description}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={Colors.light.textSecondary} />
    </Pressable>
  );
}

function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const { logout, username, displayName, role, isManager, isOwner } = useStaffAuth();
  const [showAddNotice, setShowAddNotice] = useState(false);
  const [newNoticeText, setNewNoticeText] = useState("");

  const noticesQuery = useQuery<StaffNotice[]>({
    queryKey: ["/api/staff-notices"],
    refetchOnMount: "always",
    refetchInterval: 3600000,
  });

  const notices = noticesQuery.data ?? [];
  const canManageNotices = isManager || isOwner;

  const addNoticeMutation = useMutation({
    mutationFn: async (message: string) => {
      const res = await apiRequest("POST", "/api/staff-notices", { message });
      return res.json();
    },
    onSuccess: () => {
      setNewNoticeText("");
      setShowAddNotice(false);
      queryClient.refetchQueries({ queryKey: ["/api/staff-notices"] });
    },
  });

  const deleteNoticeMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/staff-notices/${id}`);
    },
    onSuccess: () => {
      queryClient.refetchQueries({ queryKey: ["/api/staff-notices"] });
    },
  });

  const handleDeleteNotice = (notice: StaffNotice) => {
    const msg = "Remove this notice?";
    if (Platform.OS === "web") {
      if (window.confirm(msg)) deleteNoticeMutation.mutate(notice.id);
    } else {
      Alert.alert("Remove Notice", msg, [
        { text: "Cancel", style: "cancel" },
        { text: "Remove", style: "destructive", onPress: () => deleteNoticeMutation.mutate(notice.id) },
      ]);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={28} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Staff Portal</Text>
        <Pressable onPress={logout} hitSlop={12} testID="staff-logout-button">
          <Ionicons name="log-out-outline" size={24} color={Colors.brand.red} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.welcomeSection}>
          <View style={[styles.welcomeBadge, isOwner ? styles.ownerBadge : isManager ? styles.managerBadge : null]}>
            <Ionicons name={isOwner ? "star" : isManager ? "shield" : "shield-checkmark"} size={16} color={isOwner ? Colors.brand.gold : isManager ? "#7C3AED" : Colors.brand.green} />
            <Text style={[styles.welcomeBadgeText, isOwner ? styles.ownerBadgeText : isManager ? styles.managerBadgeText : null]}>
              {isOwner ? "Owner" : isManager ? "Manager" : "Staff"}
            </Text>
          </View>
          <Text style={styles.welcomeTitle}>
            {displayName || username ? `Welcome, ${displayName || username}` : "Dashboard"}
          </Text>
          <Text style={styles.welcomeSubtitle}>
            {isOwner ? "Full venue owner access" : isManager ? "Full venue management access" : "Bookings management"}
          </Text>
        </View>

        {(notices.length > 0 || canManageNotices) && (
          <View style={styles.noticesSection}>
            <View style={styles.noticesHeader}>
              <View style={styles.noticesTitleRow}>
                <Ionicons name="warning" size={15} color="#92400E" />
                <Text style={styles.noticesTitle}>NOTICES</Text>
              </View>
              {canManageNotices && (
                <Pressable
                  onPress={() => { setShowAddNotice(!showAddNotice); setNewNoticeText(""); }}
                  style={styles.addNoticeBtn}
                  hitSlop={8}
                >
                  <Ionicons name={showAddNotice ? "close" : "add"} size={20} color="#92400E" />
                </Pressable>
              )}
            </View>

            {showAddNotice && canManageNotices && (
              <View style={styles.addNoticeForm}>
                <TextInput
                  style={styles.noticeInput}
                  value={newNoticeText}
                  onChangeText={setNewNoticeText}
                  placeholder="Type a notice for all staff..."
                  placeholderTextColor="#A16207"
                  multiline
                  maxLength={300}
                  autoFocus
                />
                <Pressable
                  onPress={() => { if (newNoticeText.trim()) addNoticeMutation.mutate(newNoticeText.trim()); }}
                  disabled={!newNoticeText.trim() || addNoticeMutation.isPending}
                  style={({ pressed }) => [
                    styles.postNoticeBtn,
                    (!newNoticeText.trim() || addNoticeMutation.isPending) && { opacity: 0.5 },
                    { opacity: pressed ? 0.8 : 1 },
                  ]}
                >
                  {addNoticeMutation.isPending ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.postNoticeBtnText}>Post Notice</Text>
                  )}
                </Pressable>
              </View>
            )}

            {notices.length === 0 && !showAddNotice && (
              <Text style={styles.noNoticesText}>No notices at this time</Text>
            )}

            {notices.map((notice) => (
              <View key={notice.id} style={styles.noticeCard}>
                <View style={styles.noticeCardContent}>
                  <Text style={styles.noticeMessage}>{notice.message}</Text>
                  <Text style={styles.noticeMeta}>
                    Posted by {notice.createdBy} · {new Date(notice.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </Text>
                </View>
                {canManageNotices && (
                  <Pressable onPress={() => handleDeleteNotice(notice)} hitSlop={8}>
                    <Ionicons name="trash-outline" size={16} color="#B45309" />
                  </Pressable>
                )}
              </View>
            ))}
          </View>
        )}

        <Text style={styles.sectionLabel}>
          {isManager ? "ADMIN TOOLS" : "YOUR TOOLS"}
        </Text>

        <View style={styles.toolsList}>
          <AdminTool
            icon="calendar"
            title="Bookings Calendar"
            description="View and manage table bookings"
            color={Colors.brand.green}
            onPress={() => router.push("/admin-bookings")}
            testID="portal-bookings-calendar"
          />
          {isManager && (
            <>
              <AdminTool
                icon="pricetag"
                title="Manage Offers"
                description="Create, edit and remove promotional offers"
                color={Colors.brand.blue}
                onPress={() => router.push("/admin-offers")}
                testID="portal-manage-offers"
              />
              <AdminTool
                icon="musical-notes"
                title="Events"
                description="Create and manage event listings"
                color="#7C3AED"
                onPress={() => router.push("/admin-events")}
                testID="portal-manage-events"
              />
              <AdminTool
                icon="notifications"
                title="Push Notifications"
                description="Send notifications to app users"
                color={Colors.brand.gold}
                onPress={() => router.push("/admin-notifications")}
                testID="portal-push-notifications"
              />
              <AdminTool
                icon="images"
                title="Banner Images"
                description="Manage home screen banner photos"
                color="#8B5CF6"
                onPress={() => router.push("/admin-banner")}
                testID="portal-banner-image"
              />
            </>
          )}
          {isOwner && (
            <AdminTool
              icon="people"
              title="Staff Accounts"
              description="View accounts, manage roles and permissions"
              color="#F59E0B"
              onPress={() => router.push("/admin-staff")}
              testID="portal-staff-accounts"
            />
          )}
        </View>

        <Text style={styles.sectionLabel}>SESSION</Text>

        {username ? (
          <View style={styles.sessionInfo}>
            <Ionicons name="person-circle-outline" size={20} color={Colors.light.textSecondary} />
            <Text style={styles.sessionInfoText}>Signed in as {username} ({role})</Text>
          </View>
        ) : null}

        <Pressable
          onPress={logout}
          style={({ pressed }) => [styles.logoutButton, { opacity: pressed ? 0.8 : 1 }]}
          testID="staff-logout-full-button"
        >
          <Ionicons name="log-out-outline" size={20} color={Colors.brand.red} />
          <Text style={styles.logoutText}>Sign Out</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

export default function StaffPortalScreen() {
  const { isAuthenticated, isLoading } = useStaffAuth();

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.brand.blue} />
      </View>
    );
  }

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  return <DashboardScreen />;
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.light.background,
  },
  loginContainer: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  loginHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  loginHeaderTitle: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 18,
    color: Colors.light.text,
  },
  loginScrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingBottom: 40,
  },
  lockIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: Colors.brand.blue + "10",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: 24,
  },
  loginTitle: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 26,
    color: Colors.light.text,
    textAlign: "center",
    marginBottom: 8,
  },
  loginSubtitle: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 14,
    color: Colors.light.textSecondary,
    textAlign: "center",
    marginBottom: 28,
  },
  formSection: {
    marginBottom: 12,
  },
  inputGroup: {
    marginBottom: 16,
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
    fontSize: 16,
    color: Colors.light.text,
  },
  inputError: {
    borderColor: Colors.brand.red,
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginBottom: 12,
  },
  errorText: {
    fontFamily: "Montserrat_500Medium",
    fontSize: 13,
    color: Colors.brand.red,
  },
  successRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginBottom: 16,
    backgroundColor: Colors.brand.green + "12",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  successText: {
    fontFamily: "Montserrat_500Medium",
    fontSize: 13,
    color: Colors.brand.green,
  },
  loginButton: {
    backgroundColor: Colors.brand.blue,
    borderRadius: 14,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 8,
  },
  loginButtonDisabled: {
    opacity: 0.6,
  },
  loginButtonText: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 16,
    color: "#FFFFFF",
  },
  switchModeButton: {
    marginTop: 20,
    alignItems: "center",
  },
  switchModeText: {
    fontFamily: "Montserrat_500Medium",
    fontSize: 14,
    color: Colors.brand.blue,
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
    padding: 16,
    paddingBottom: Platform.OS === "web" ? 50 : 40,
  },
  welcomeSection: {
    alignItems: "center",
    marginBottom: 28,
    marginTop: 8,
  },
  welcomeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.brand.green + "12",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 12,
  },
  welcomeBadgeText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 12,
    color: Colors.brand.green,
  },
  welcomeTitle: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 24,
    color: Colors.light.text,
    marginBottom: 4,
    textAlign: "center",
  },
  welcomeSubtitle: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 14,
    color: Colors.light.textSecondary,
  },
  noticesSection: {
    backgroundColor: "#FEF3C7",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#FDE68A",
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 20,
    gap: 8,
  },
  noticesHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  noticesTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  noticesTitle: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 11,
    color: "#92400E",
    letterSpacing: 1,
  },
  addNoticeBtn: {
    padding: 2,
  },
  addNoticeForm: {
    gap: 8,
  },
  noticeInput: {
    backgroundColor: "#FFFBEB",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#FCD34D",
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: "Montserrat_400Regular",
    fontSize: 14,
    color: "#78350F",
    minHeight: 80,
    textAlignVertical: "top",
  },
  postNoticeBtn: {
    backgroundColor: "#D97706",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  postNoticeBtnText: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 14,
    color: "#fff",
  },
  noNoticesText: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 13,
    color: "#A16207",
    fontStyle: "italic",
  },
  noticeCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "#FFFBEB",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#FCD34D",
    padding: 10,
  },
  noticeCardContent: {
    flex: 1,
    gap: 4,
  },
  noticeMessage: {
    fontFamily: "Montserrat_500Medium",
    fontSize: 13,
    color: "#78350F",
    lineHeight: 18,
  },
  noticeMeta: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 11,
    color: "#A16207",
  },
  sectionLabel: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 11,
    color: Colors.light.textSecondary,
    letterSpacing: 1.5,
    marginBottom: 12,
    marginTop: 8,
  },
  toolsList: {
    gap: 10,
    marginBottom: 28,
  },
  toolCard: {
    backgroundColor: Colors.light.surface,
    borderRadius: 16,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  toolIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  toolInfo: {
    flex: 1,
    gap: 2,
  },
  toolTitle: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 15,
    color: Colors.light.text,
  },
  toolDesc: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 12,
    color: Colors.light.textSecondary,
  },
  sessionInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  sessionInfoText: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 13,
    color: Colors.light.textSecondary,
  },
  logoutButton: {
    backgroundColor: Colors.brand.red + "08",
    borderRadius: 14,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.brand.red + "20",
  },
  logoutText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 15,
    color: Colors.brand.red,
  },
  managerBadge: {
    backgroundColor: "#7C3AED" + "12",
  },
  managerBadgeText: {
    color: "#7C3AED",
  },
  ownerBadge: {
    backgroundColor: Colors.brand.gold + "12",
  },
  ownerBadgeText: {
    color: Colors.brand.gold,
  },
  roleSelector: {
    flexDirection: "row" as const,
    gap: 10,
    marginBottom: 16,
  },
  roleOption: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
    alignItems: "center" as const,
    gap: 6,
  },
  roleOptionActive: {
    borderColor: Colors.brand.blue,
    backgroundColor: Colors.brand.blue + "08",
  },
  roleOptionText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 13,
    color: Colors.light.textSecondary,
  },
  roleOptionTextActive: {
    color: Colors.brand.blue,
  },
});
