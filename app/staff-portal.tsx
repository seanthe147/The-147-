import React, { useState, useRef, useEffect } from "react";
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
  Modal,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import { useKiosk } from "@/contexts/KioskContext";
import { apiRequest } from "@/lib/query-client";
import Colors from "@/constants/colors";
import type { StaffNotice } from "@shared/schema";

interface BuildInfoResponse {
  buildId: string;
  builtAt: string;
  exportedAt?: string;
  freshness?: "fresh" | "stale" | "unknown";
  gitSha?: string | null;
}

function BuildInfoFooter() {
  const { data, isError } = useQuery<BuildInfoResponse>({
    queryKey: ["/api/build-info"],
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  if (isError || !data) return null;

  const builtAt = data.builtAt || data.exportedAt;
  let builtLabel = "";
  if (builtAt) {
    const d = new Date(builtAt);
    if (!isNaN(d.getTime())) {
      builtLabel = d.toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
  }

  const shortId = data.buildId ? data.buildId.slice(0, 12) : "";
  const isStale = data.freshness === "stale";

  return (
    <View style={styles.buildInfoChip} testID="staff-portal-build-info">
      <Ionicons
        name={isStale ? "warning-outline" : "git-commit-outline"}
        size={12}
        color={isStale ? Colors.brand.red : Colors.light.textSecondary}
      />
      <Text
        style={[styles.buildInfoText, isStale && { color: Colors.brand.red }]}
        numberOfLines={1}
      >
        Build {shortId}
        {builtLabel ? ` · deployed ${builtLabel}` : ""}
        {isStale ? " · stale" : ""}
      </Text>
    </View>
  );
}

function validatePasswordClient(pw: string): string | null {
  if (!pw || pw.length < 10) return "Password must be at least 10 characters";
  if (!/[a-zA-Z]/.test(pw)) return "Password must include a letter";
  if (!/\d/.test(pw)) return "Password must include a number";
  return null;
}

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
  const [showPin, setShowPin] = useState(false);
  const [showConfirmPin, setShowConfirmPin] = useState(false);
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
    if (!pin) {
      setError("Please enter your password");
      triggerShake();
      return;
    }

    setLoading(true);
    setError("");
    const result = await login(username.trim(), pin);
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
    const pwError = validatePasswordClient(pin);
    if (pwError) {
      setError(pwError);
      triggerShake();
      return;
    }
    if (pin !== confirmPin) {
      setError("Passwords do not match");
      triggerShake();
      return;
    }

    setLoading(true);
    setError("");
    const result = await register(masterPin.trim(), username.trim(), pin, displayName.trim() || undefined, selectedRole);
    setLoading(false);

    if (!result.success) {
      setError(result.error || "Registration failed");
      triggerShake();
    } else {
      setSuccess("Account created. The owner will need to approve it before you can sign in.");
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
            ? "Enter your username and password"
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
            <Text style={styles.inputLabel}>PASSWORD</Text>
            <View style={styles.passwordRow}>
              <TextInput
                style={[styles.textInput, styles.passwordInput, error && !pin ? styles.inputError : null]}
                value={pin}
                onChangeText={(text) => { setPin(text); setError(""); setSuccess(""); }}
                placeholder={mode === "register" ? "At least 10 characters" : "Enter password"}
                placeholderTextColor={Colors.light.textSecondary}
                secureTextEntry={!showPin}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                textContentType={mode === "login" ? "password" : "newPassword"}
                maxLength={200}
                onSubmitEditing={mode === "login" ? handleLogin : undefined}
                testID="staff-pin-input"
              />
              <Pressable
                onPress={() => setShowPin((v) => !v)}
                style={styles.passwordToggle}
                hitSlop={8}
                testID="toggle-password-visibility"
              >
                <Ionicons name={showPin ? "eye-off" : "eye"} size={20} color={Colors.light.textSecondary} />
              </Pressable>
            </View>
            {mode === "register" && (
              <Text style={styles.inputHelp}>Min 10 characters, must include a letter and a number.</Text>
            )}
          </View>

          {mode === "register" && (
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>CONFIRM PASSWORD</Text>
              <View style={styles.passwordRow}>
                <TextInput
                  style={[styles.textInput, styles.passwordInput, error && pin !== confirmPin ? styles.inputError : null]}
                  value={confirmPin}
                  onChangeText={(text) => { setConfirmPin(text); setError(""); }}
                  placeholder="Re-enter password"
                  placeholderTextColor={Colors.light.textSecondary}
                  secureTextEntry={!showConfirmPin}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="new-password"
                  textContentType="newPassword"
                  maxLength={200}
                  testID="register-confirm-pin"
                />
                <Pressable
                  onPress={() => setShowConfirmPin((v) => !v)}
                  style={styles.passwordToggle}
                  hitSlop={8}
                >
                  <Ionicons name={showConfirmPin ? "eye-off" : "eye"} size={20} color={Colors.light.textSecondary} />
                </Pressable>
              </View>
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

function KioskEnableModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { enableKioskMode } = useKiosk();
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setPin("");
    setConfirmPin("");
    setError(null);
    setSubmitting(false);
  };

  const handleEnable = async () => {
    setError(null);
    if (pin.trim().length < 4) {
      setError("PIN must be at least 4 digits");
      return;
    }
    if (pin !== confirmPin) {
      setError("PINs do not match");
      return;
    }
    setSubmitting(true);
    try {
      await enableKioskMode(pin.trim());
      reset();
      onClose();
      // Send the user to the order tab — kiosk mode will redirect there too
      // but doing it explicitly avoids a one-frame flash of the staff portal.
      router.replace("/(tabs)/order");
    } catch (err: any) {
      setError(err?.message || "Could not enable kiosk mode");
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => { reset(); onClose(); }}>
      <Pressable style={styles.kioskModalScrim} onPress={() => { reset(); onClose(); }}>
        <Pressable style={styles.kioskModalCard} onPress={() => {}}>
          <View style={styles.kioskModalHeader}>
            <Ionicons name="lock-closed" size={22} color={Colors.brand.blue} />
            <Text style={styles.kioskModalTitle}>Enable Kiosk Mode</Text>
          </View>
          <Text style={styles.kioskModalBody}>
            The app will lock to the order screen. Customers can browse the menu and send orders to the counter to pay.
            {"\n\n"}Set a staff PIN. You'll need it to exit kiosk mode by long-pressing the bottom-right corner of the attract screen.
          </Text>
          <Text style={styles.kioskModalLabel}>Staff PIN</Text>
          <TextInput
            value={pin}
            onChangeText={setPin}
            placeholder="At least 4 digits"
            placeholderTextColor="#9CA3AF"
            keyboardType="number-pad"
            secureTextEntry={Platform.OS !== "web"}
            maxLength={12}
            style={styles.kioskModalInput}
            testID="kiosk-enable-pin"
          />
          <Text style={styles.kioskModalLabel}>Confirm PIN</Text>
          <TextInput
            value={confirmPin}
            onChangeText={setConfirmPin}
            placeholder="Re-enter PIN"
            placeholderTextColor="#9CA3AF"
            keyboardType="number-pad"
            secureTextEntry={Platform.OS !== "web"}
            maxLength={12}
            style={styles.kioskModalInput}
            testID="kiosk-enable-pin-confirm"
          />
          {error ? <Text style={styles.kioskModalError}>{error}</Text> : null}
          <View style={styles.kioskModalBtnRow}>
            <Pressable
              style={({ pressed }) => [styles.kioskModalBtn, styles.kioskModalBtnGhost, { opacity: pressed ? 0.7 : 1 }]}
              onPress={() => { reset(); onClose(); }}
            >
              <Text style={styles.kioskModalBtnGhostText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.kioskModalBtn, styles.kioskModalBtnPrimary, { opacity: submitting ? 0.6 : pressed ? 0.85 : 1 }]}
              onPress={handleEnable}
              disabled={submitting}
              testID="kiosk-enable-confirm"
            >
              {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.kioskModalBtnPrimaryText}>Enable</Text>}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Customise Attract Screen Text ────────────────────────────────────────────
// Edits 5 keys in the generic site_settings table:
//   kiosk_attract_welcome   (line 1, e.g. "WELCOME TO")
//   kiosk_attract_brand     (line 2, hero,  e.g. "THE 147")
//   kiosk_attract_tagline   (line 3, e.g. "FOOD · DRINKS · SNOOKER")
//   kiosk_attract_cta       (CTA button title, e.g. "TAP TO ORDER")
//   kiosk_attract_cta_sub   (CTA subtext, e.g. "Order food & drinks · Pay at the counter")
// Empty values fall back to the hardcoded defaults inside KioskAttractOverlay.
const ATTRACT_DEFAULTS: Record<string, string> = {
  kiosk_attract_welcome: "WELCOME TO",
  kiosk_attract_brand: "THE 147",
  kiosk_attract_tagline: "FOOD · DRINKS · SNOOKER",
  kiosk_attract_cta: "TAP TO ORDER",
  kiosk_attract_cta_sub: "Order food & drinks · Pay at the counter",
};

function KioskAttractEditModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data: settings } = useQuery<Record<string, string>>({
    queryKey: ["/api/settings"],
    enabled: visible,
  });

  const [welcome, setWelcome] = useState("");
  const [brand, setBrand] = useState("");
  const [tagline, setTagline] = useState("");
  const [cta, setCta] = useState("");
  const [ctaSub, setCtaSub] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Hydrate inputs from server values (or defaults) once the modal opens
  // and settings are loaded. Re-runs whenever the modal is re-opened.
  useEffect(() => {
    if (!visible) return;
    setWelcome(settings?.kiosk_attract_welcome ?? ATTRACT_DEFAULTS.kiosk_attract_welcome);
    setBrand(settings?.kiosk_attract_brand ?? ATTRACT_DEFAULTS.kiosk_attract_brand);
    setTagline(settings?.kiosk_attract_tagline ?? ATTRACT_DEFAULTS.kiosk_attract_tagline);
    setCta(settings?.kiosk_attract_cta ?? ATTRACT_DEFAULTS.kiosk_attract_cta);
    setCtaSub(settings?.kiosk_attract_cta_sub ?? ATTRACT_DEFAULTS.kiosk_attract_cta_sub);
    setError(null);
  }, [visible, settings]);

  const handleSave = async () => {
    setError(null);
    if (!brand.trim()) {
      setError("Brand line cannot be empty");
      return;
    }
    if (!cta.trim()) {
      setError("CTA button text cannot be empty");
      return;
    }
    setSubmitting(true);
    try {
      const updates: Record<string, string> = {
        kiosk_attract_welcome: welcome.trim(),
        kiosk_attract_brand: brand.trim(),
        kiosk_attract_tagline: tagline.trim(),
        kiosk_attract_cta: cta.trim(),
        kiosk_attract_cta_sub: ctaSub.trim(),
      };
      // PUT each key. Run sequentially — there are only 5 and any failure
      // mid-flight should surface clearly without partial state surprises
      // beyond what the user can see in the editor.
      for (const [key, value] of Object.entries(updates)) {
        await apiRequest("PUT", `/api/settings/${key}`, { value });
      }
      // Invalidate so the live attract overlay (and any other screen reading
      // /api/settings) picks up the change without a manual reload.
      await queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      onClose();
    } catch (err: any) {
      setError(err?.message || "Could not save attract screen text");
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetDefaults = () => {
    setWelcome(ATTRACT_DEFAULTS.kiosk_attract_welcome);
    setBrand(ATTRACT_DEFAULTS.kiosk_attract_brand);
    setTagline(ATTRACT_DEFAULTS.kiosk_attract_tagline);
    setCta(ATTRACT_DEFAULTS.kiosk_attract_cta);
    setCtaSub(ATTRACT_DEFAULTS.kiosk_attract_cta_sub);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.kioskModalScrim} onPress={onClose}>
        <Pressable style={[styles.kioskModalCard, { maxWidth: 480 }]} onPress={() => {}}>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.kioskModalHeader}>
              <Ionicons name="text" size={22} color={Colors.brand.blue} />
              <Text style={styles.kioskModalTitle}>Attract Screen Text</Text>
            </View>
            <Text style={styles.kioskModalBody}>
              Customise the wording shown on the kiosk attract screen. Leave a field unchanged to keep it as-is.
            </Text>

            <Text style={styles.kioskModalLabel}>Top line (small)</Text>
            <TextInput
              value={welcome}
              onChangeText={setWelcome}
              placeholder="WELCOME TO"
              placeholderTextColor="#9CA3AF"
              maxLength={40}
              autoCapitalize="characters"
              style={styles.attractInput}
              testID="attract-edit-welcome"
            />

            <Text style={styles.kioskModalLabel}>Brand line (huge)</Text>
            <TextInput
              value={brand}
              onChangeText={setBrand}
              placeholder="THE 147"
              placeholderTextColor="#9CA3AF"
              maxLength={20}
              autoCapitalize="characters"
              style={styles.attractInput}
              testID="attract-edit-brand"
            />

            <Text style={styles.kioskModalLabel}>Tagline (gold)</Text>
            <TextInput
              value={tagline}
              onChangeText={setTagline}
              placeholder="FOOD · DRINKS · SNOOKER"
              placeholderTextColor="#9CA3AF"
              maxLength={60}
              autoCapitalize="characters"
              style={styles.attractInput}
              testID="attract-edit-tagline"
            />

            <Text style={styles.kioskModalLabel}>CTA button</Text>
            <TextInput
              value={cta}
              onChangeText={setCta}
              placeholder="TAP TO ORDER"
              placeholderTextColor="#9CA3AF"
              maxLength={30}
              autoCapitalize="characters"
              style={styles.attractInput}
              testID="attract-edit-cta"
            />

            <Text style={styles.kioskModalLabel}>CTA subtext</Text>
            <TextInput
              value={ctaSub}
              onChangeText={setCtaSub}
              placeholder="Order food & drinks · Pay at the counter"
              placeholderTextColor="#9CA3AF"
              maxLength={80}
              style={styles.attractInput}
              testID="attract-edit-cta-sub"
            />

            {error ? <Text style={styles.kioskModalError}>{error}</Text> : null}

            <Pressable
              onPress={handleResetDefaults}
              style={({ pressed }) => [{ paddingVertical: 10, alignItems: "center", opacity: pressed ? 0.6 : 1 }]}
              testID="attract-edit-reset"
            >
              <Text style={{ fontFamily: "Montserrat_500Medium", fontSize: 13, color: Colors.light.textSecondary }}>
                Reset to defaults
              </Text>
            </Pressable>

            <View style={styles.kioskModalBtnRow}>
              <Pressable
                style={({ pressed }) => [styles.kioskModalBtn, styles.kioskModalBtnGhost, { opacity: pressed ? 0.7 : 1 }]}
                onPress={onClose}
                disabled={submitting}
              >
                <Text style={styles.kioskModalBtnGhostText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.kioskModalBtn, styles.kioskModalBtnPrimary, { opacity: submitting ? 0.6 : pressed ? 0.85 : 1 }]}
                onPress={handleSave}
                disabled={submitting}
                testID="attract-edit-save"
              >
                {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.kioskModalBtnPrimaryText}>Save</Text>}
              </Pressable>
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const { logout, username, displayName, role, isManager, isOwner } = useStaffAuth();
  const { isKioskMode } = useKiosk();
  const [kioskModalVisible, setKioskModalVisible] = useState(false);
  const [attractEditorVisible, setAttractEditorVisible] = useState(false);

  const noticesQuery = useQuery<StaffNotice[]>({
    queryKey: ["/api/staff-notices"],
    refetchOnMount: "always",
    refetchInterval: 3600000,
  });

  const notices = noticesQuery.data ?? [];
  const canManageNotices = isManager || isOwner;

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
            {(() => {
              const name = displayName || username;
              if (!name) return "Dashboard";
              const hour = new Date().getHours();
              const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
              return `${greeting}, ${name}`;
            })()}
          </Text>
          <Text style={styles.welcomeSubtitle}>
            {isOwner ? "Full venue owner access" : isManager ? "HR & rota management" : "Clock in/out and view your rota"}
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
                  onPress={() => router.push("/admin-notices")}
                  hitSlop={8}
                  style={styles.manageNoticesLink}
                >
                  <Text style={styles.manageNoticesText}>Manage</Text>
                  <Ionicons name="chevron-forward" size={13} color="#92400E" />
                </Pressable>
              )}
            </View>

            {notices.length === 0 ? (
              <Text style={styles.noNoticesText}>No notices at this time</Text>
            ) : (
              notices.map((notice) => (
                <View key={notice.id} style={styles.noticeCard}>
                  <View style={styles.noticeCardContent}>
                    <Text style={styles.noticeMessage}>{notice.message}</Text>
                    <Text style={styles.noticeMeta}>
                      Posted by {notice.createdBy} · {new Date(notice.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        <Text style={styles.sectionLabel}>HR & ROTA</Text>

        <View style={styles.toolsList}>
          <AdminTool
            icon="time"
            title="Time & HR"
            description="Clock in/out, request leave, view your record"
            color="#0F766E"
            onPress={() => router.push("/staff-hr")}
            testID="portal-time-hr"
          />
          {isManager ? (
            <AdminTool
              icon="calendar-number"
              title="Manage Rota"
              description="Build weekly rotas, assign shifts and publish to staff"
              color="#0F766E"
              onPress={() => router.push("/admin-rota")}
              testID="portal-manage-rota"
            />
          ) : (
            <AdminTool
              icon="calendar-number"
              title="My Rota"
              description="View your upcoming shifts and schedule"
              color="#0F766E"
              onPress={() => router.push("/staff-hr")}
              testID="portal-view-rota"
            />
          )}

          {/* Extra tools for regular staff on web only.
              Bookings management is available to all staff via the
              HTML dashboard at /staff-dashboard, so we don't duplicate
              it as a tool here on the Expo web build. */}
          {!isManager && Platform.OS === "web" && (
            <>
              <AdminTool
                icon="card"
                title="Take Payment"
                description="Take a card payment for a booking or sale"
                color="#0EA5E9"
                onPress={() => router.push("/admin-events-payments")}
                testID="portal-take-payment"
              />
              <AdminTool
                icon="calendar-clear"
                title="Leave Booking"
                description="Request holiday or time off"
                color="#0F766E"
                onPress={() => router.push("/staff-hr")}
                testID="portal-leave-booking"
              />
              <AdminTool
                icon="card"
                title="Memberships"
                description="View and set up customer memberships"
                color={Colors.brand.blue}
                onPress={() => router.push("/membership")}
                testID="portal-memberships"
              />
            </>
          )}
        </View>

        {/* Admin tools — managers and owners, grouped by job. The old flat
            list of 13 tiles got long enough that finding anything took
            scrolling; splitting into FLOOR / CUSTOMERS / MARKETING /
            CONTENT / OWNER mirrors how the day actually breaks down. */}
        {isManager && (
          <>
            <Text style={styles.sectionLabel}>FLOOR</Text>
            <View style={styles.toolsList}>
              <AdminTool
                icon="tv"
                title="Live Tables"
                description="See which tables are in use right now (live from Square POS)"
                color="#059669"
                onPress={() => router.push("/admin-tables-live")}
                testID="portal-live-tables"
              />
              <AdminTool
                icon="calendar"
                title="Bookings Calendar"
                description="View and manage table bookings"
                color={Colors.brand.green}
                onPress={() => router.push("/admin-bookings")}
                testID="portal-bookings-calendar"
              />
              <AdminTool
                icon="ban"
                title="Availability Blocks"
                description="Block dates or times from being booked"
                color="#DC2626"
                onPress={() => router.push("/admin-availability")}
                testID="portal-availability-blocks"
              />
            </View>

            <Text style={styles.sectionLabel}>CUSTOMERS</Text>
            <View style={styles.toolsList}>
              <AdminTool
                icon="person-circle"
                title="Customers"
                description="Look up a customer and send a password reset email"
                color="#0EA5E9"
                onPress={() => router.push("/admin-customers")}
                testID="portal-customers"
              />
              <AdminTool
                icon="card"
                title="Memberships"
                description="View and set up customer memberships"
                color={Colors.brand.blue}
                onPress={() => router.push("/membership")}
                testID="portal-memberships"
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
                icon="ribbon"
                title="Loyalty Settings"
                description="Visit points, birthday bonus, double points day"
                color={Colors.brand.gold}
                onPress={() => router.push("/admin-loyalty")}
                testID="portal-loyalty-settings"
              />
            </View>

            <Text style={styles.sectionLabel}>EVENTS & OFFERS</Text>
            <View style={styles.toolsList}>
              <AdminTool
                icon="musical-notes"
                title="Events"
                description="Create and manage event listings"
                color="#7C3AED"
                onPress={() => router.push("/admin-events")}
                testID="portal-manage-events"
              />
              <AdminTool
                icon="pricetag"
                title="Manage Offers"
                description="Create, edit and remove promotional offers"
                color={Colors.brand.blue}
                onPress={() => router.push("/admin-offers")}
                testID="portal-manage-offers"
              />
              {Platform.OS === "web" && (
                <AdminTool
                  icon="card"
                  title="Events & Payments"
                  description="Sell tickets and take card payments"
                  color="#0EA5E9"
                  onPress={() => router.push("/admin-events-payments")}
                  testID="portal-events-payments"
                />
              )}
            </View>

            <Text style={styles.sectionLabel}>APP CONTENT</Text>
            <View style={styles.toolsList}>
              <AdminTool
                icon="images"
                title="Banner Images"
                description="Manage home screen banner photos"
                color="#8B5CF6"
                onPress={() => router.push("/admin-banner")}
                testID="portal-banner-image"
              />
              <AdminTool
                icon="megaphone"
                title="Staff Notices"
                description="Post and manage notices for all staff"
                color="#D97706"
                onPress={() => router.push("/admin-notices")}
                testID="portal-staff-notices"
              />
            </View>

            {isOwner && (
              <>
                <Text style={styles.sectionLabel}>OWNER</Text>
                <View style={styles.toolsList}>
                  <AdminTool
                    icon="people"
                    title="Staff Accounts"
                    description="Approve accounts, manage roles, reset PINs"
                    color="#F59E0B"
                    onPress={() => router.push("/admin-staff")}
                    testID="portal-staff-accounts"
                  />
                </View>
              </>
            )}
          </>
        )}

        {isManager && (
          <>
            <Text style={styles.sectionLabel}>KIOSK</Text>
            <View style={styles.toolsList}>
              <AdminTool
                icon={isKioskMode ? "lock-closed" : "tablet-landscape"}
                title={isKioskMode ? "Kiosk Mode Active" : "Enable Kiosk Mode"}
                description={
                  isKioskMode
                    ? "Long-press the bottom-right corner of the attract screen for 3 seconds to exit"
                    : "Lock this device to ordering only. Customers send orders to the counter to pay."
                }
                color={isKioskMode ? Colors.brand.green : "#0EA5E9"}
                onPress={() => {
                  if (isKioskMode) {
                    Alert.alert(
                      "Already in Kiosk Mode",
                      "Long-press the bottom-right corner of the attract screen for 3 seconds, then enter the PIN to exit.",
                    );
                    return;
                  }
                  setKioskModalVisible(true);
                }}
                testID="portal-kiosk-mode"
              />
              <AdminTool
                icon="text"
                title="Customise Attract Screen"
                description="Edit the welcome text, brand line, tagline and CTA shown when the kiosk is idle."
                color="#7C3AED"
                onPress={() => setAttractEditorVisible(true)}
                testID="portal-kiosk-attract-edit"
              />
            </View>
          </>
        )}

        <KioskEnableModal visible={kioskModalVisible} onClose={() => setKioskModalVisible(false)} />
        <KioskAttractEditModal visible={attractEditorVisible} onClose={() => setAttractEditorVisible(false)} />

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

        <BuildInfoFooter />
      </ScrollView>
    </View>
  );
}

function SetPasswordScreen() {
  const insets = useSafeAreaInsets();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const { setPassword, logout, username, displayName } = useStaffAuth();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
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

  const handleSubmit = async () => {
    const pwError = validatePasswordClient(newPassword);
    if (pwError) {
      setError(pwError);
      triggerShake();
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      triggerShake();
      return;
    }
    setLoading(true);
    setError("");
    const result = await setPassword(newPassword);
    setLoading(false);
    if (!result.success) {
      setError(result.error || "Failed to update password");
      triggerShake();
    }
  };

  return (
    <View style={[styles.loginContainer, { paddingTop: insets.top + webTopInset }]}>
      <View style={styles.loginHeader}>
        <Pressable onPress={logout} hitSlop={12} testID="set-password-cancel">
          <Ionicons name="log-out-outline" size={24} color={Colors.brand.red} />
        </Pressable>
        <Text style={styles.loginHeaderTitle}>Set New Password</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={styles.loginScrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.lockIconWrap}>
          <Ionicons name="key" size={40} color={Colors.brand.blue} />
        </View>

        <Text style={styles.loginTitle}>Choose a Password</Text>
        <Text style={styles.loginSubtitle}>
          {displayName || username
            ? `Hi ${displayName || username} — set a password to replace your PIN.`
            : "Set a password to replace your PIN."}
        </Text>

        <Animated.View style={[styles.formSection, { transform: [{ translateX: shakeAnim }] }]}>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>NEW PASSWORD</Text>
            <View style={styles.passwordRow}>
              <TextInput
                style={[styles.textInput, styles.passwordInput, error && !newPassword ? styles.inputError : null]}
                value={newPassword}
                onChangeText={(t) => { setNewPassword(t); setError(""); }}
                placeholder="At least 10 characters"
                placeholderTextColor={Colors.light.textSecondary}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="new-password"
                textContentType="newPassword"
                maxLength={200}
                testID="set-password-new"
              />
              <Pressable onPress={() => setShowPassword(v => !v)} style={styles.passwordToggle} hitSlop={8}>
                <Ionicons name={showPassword ? "eye-off" : "eye"} size={20} color={Colors.light.textSecondary} />
              </Pressable>
            </View>
            <Text style={styles.inputHelp}>Min 10 characters, must include a letter and a number.</Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>CONFIRM PASSWORD</Text>
            <TextInput
              style={[styles.textInput, error && newPassword !== confirmPassword ? styles.inputError : null]}
              value={confirmPassword}
              onChangeText={(t) => { setConfirmPassword(t); setError(""); }}
              placeholder="Re-enter password"
              placeholderTextColor={Colors.light.textSecondary}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="new-password"
              textContentType="newPassword"
              maxLength={200}
              onSubmitEditing={handleSubmit}
              testID="set-password-confirm"
            />
          </View>
        </Animated.View>

        {error ? (
          <View style={styles.errorRow}>
            <Ionicons name="alert-circle" size={16} color={Colors.brand.red} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <Pressable
          onPress={handleSubmit}
          disabled={loading}
          style={({ pressed }) => [
            styles.loginButton,
            loading && styles.loginButtonDisabled,
            { opacity: pressed ? 0.8 : 1 },
          ]}
          testID="set-password-submit"
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="checkmark" size={20} color="#FFFFFF" />
              <Text style={styles.loginButtonText}>Save Password</Text>
            </>
          )}
        </Pressable>
      </ScrollView>
    </View>
  );
}

export default function StaffPortalScreen() {
  const { isAuthenticated, isLoading, mustChangePassword } = useStaffAuth();

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

  if (mustChangePassword) {
    return <SetPasswordScreen />;
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
  passwordRow: {
    position: "relative",
  },
  passwordInput: {
    paddingRight: 48,
  },
  passwordToggle: {
    position: "absolute",
    right: 12,
    top: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    width: 32,
  },
  inputHelp: {
    marginTop: 6,
    fontFamily: "Montserrat_500Medium",
    fontSize: 11,
    color: Colors.light.textSecondary,
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
  manageNoticesLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  manageNoticesText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 12,
    color: "#92400E",
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
  buildInfoChip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 16,
    paddingVertical: 6,
    paddingHorizontal: 10,
    alignSelf: "center",
  },
  buildInfoText: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 11,
    color: Colors.light.textSecondary,
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
  kioskModalScrim: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center" as const,
    alignItems: "center" as const,
    padding: 24,
  },
  kioskModalCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 24,
    width: "100%" as const,
    maxWidth: 420,
  },
  kioskModalHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 10,
  },
  kioskModalTitle: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 20,
    color: Colors.light.text,
  },
  kioskModalBody: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 14,
    color: Colors.light.textSecondary,
    lineHeight: 20,
    marginTop: 12,
  },
  kioskModalLabel: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 13,
    color: Colors.light.text,
    marginTop: 16,
    marginBottom: 6,
  },
  kioskModalInput: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: "Montserrat_500Medium",
    fontSize: 18,
    letterSpacing: 4,
    textAlign: "center" as const,
    color: Colors.light.text,
    backgroundColor: "#F9FAFB",
  },
  kioskModalError: {
    fontFamily: "Montserrat_500Medium",
    fontSize: 13,
    color: Colors.brand.red,
    marginTop: 12,
    textAlign: "center" as const,
  },
  kioskModalBtnRow: {
    flexDirection: "row" as const,
    gap: 10,
    marginTop: 20,
  },
  kioskModalBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  kioskModalBtnGhost: {
    backgroundColor: "#F3F4F6",
  },
  kioskModalBtnPrimary: {
    backgroundColor: Colors.brand.blue,
  },
  kioskModalBtnGhostText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 15,
    color: Colors.light.text,
  },
  kioskModalBtnPrimaryText: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 15,
    color: "#fff",
  },
  // Free-form text input for the attract editor (left-aligned, normal letter
  // spacing — distinct from the centred PIN-style kioskModalInput above).
  attractInput: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: "Montserrat_500Medium",
    fontSize: 15,
    color: Colors.light.text,
    backgroundColor: "#F9FAFB",
  },
});
