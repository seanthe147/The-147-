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
  Linking,
  Switch,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import { useKiosk } from "@/contexts/KioskContext";
import { apiRequest } from "@/lib/query-client";
import { useResponsive } from "@/hooks/useResponsive";
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
  const { isTablet } = useResponsive();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.toolCard, isTablet && styles.toolCardTablet, { opacity: pressed ? 0.8 : 1 }]}
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

// ── Square Terminal pairing & status ──────────────────────────────────────────
// Manager-only modal that lets staff pair a Square Terminal to the venue,
// toggle whether kiosk orders are pushed to it, and unpair if they need to
// move the device. Pairing flow:
//   1. Tap "Pair a Terminal" → POST /pair-code → server returns a 6-char code.
//   2. Modal shows the code with instructions (Settings → Sign In → Use a code).
//   3. Modal polls GET /pair-code/:id every 3s. When status === "PAIRED",
//      the server has already saved the device_id, so we just refetch status.
// Disabled by default — toggling Enabled on actually starts pushing orders.
type TerminalStatus = {
  paired: boolean;
  deviceId: string | null;
  deviceName: string | null;
  enabled: boolean;
};
function SquareTerminalModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data: status, refetch } = useQuery<TerminalStatus>({
    queryKey: ["/api/staff/square-terminal/status"],
    enabled: visible,
  });

  const [pairing, setPairing] = useState<{ codeId: string; code: string } | null>(null);
  const [pairError, setPairError] = useState<string | null>(null);
  const [pairing_busy, setPairingBusy] = useState(false);
  const [enableSaving, setEnableSaving] = useState(false);
  const [unpairBusy, setUnpairBusy] = useState(false);

  // Reset transient state every time the modal opens so the user always
  // sees the current paired status, not the leftover pairing screen from
  // a previous session.
  useEffect(() => {
    if (!visible) {
      setPairing(null);
      setPairError(null);
    }
  }, [visible]);

  // Poll for pairing completion while a code is on screen. Server-side the
  // /pair-code/:id route auto-saves the device_id when status flips to
  // PAIRED, so all we need to do is refetch our local status query and
  // close the pairing screen when it appears.
  useEffect(() => {
    if (!visible || !pairing) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await apiRequest("GET", `/api/staff/square-terminal/pair-code/${pairing.codeId}`);
        const data = await res.json();
        if (cancelled) return;
        if (data?.status === "PAIRED") {
          setPairing(null);
          await queryClient.invalidateQueries({ queryKey: ["/api/staff/square-terminal/status"] });
        } else if (data?.status === "EXPIRED") {
          setPairing(null);
          setPairError("Pairing code expired. Tap 'Pair a Terminal' to try again.");
        }
      } catch {
        // Silent — just keep polling. Network blips shouldn't kill the flow.
      }
    };
    const id = setInterval(tick, 3000);
    return () => { cancelled = true; clearInterval(id); };
  }, [visible, pairing, queryClient]);

  const startPairing = async () => {
    setPairError(null);
    setPairingBusy(true);
    try {
      const res = await apiRequest("POST", "/api/staff/square-terminal/pair-code", { name: "The 147 Counter" });
      const data = await res.json();
      if (!data?.code || !data?.codeId) throw new Error("Square didn't return a pairing code");
      setPairing({ codeId: data.codeId, code: data.code });
    } catch (err: any) {
      setPairError(err?.message || "Could not start pairing");
    } finally {
      setPairingBusy(false);
    }
  };

  const cancelPairing = () => {
    setPairing(null);
    setPairError(null);
  };

  const toggleEnabled = async () => {
    if (!status?.paired) return;
    setEnableSaving(true);
    try {
      await apiRequest("PUT", "/api/staff/square-terminal/enabled", { enabled: !status.enabled });
      await refetch();
    } catch (err: any) {
      Alert.alert("Could not update", err?.message || "Please try again");
    } finally {
      setEnableSaving(false);
    }
  };

  const handleUnpair = () => {
    if (!status?.paired) return;
    Alert.alert(
      "Unpair this terminal?",
      "Kiosk orders will no longer be pushed to this terminal. You can pair it again at any time.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Unpair",
          style: "destructive",
          onPress: async () => {
            setUnpairBusy(true);
            try {
              await apiRequest("DELETE", "/api/staff/square-terminal/pairing");
              await refetch();
            } catch (err: any) {
              Alert.alert("Could not unpair", err?.message || "Please try again");
            } finally {
              setUnpairBusy(false);
            }
          },
        },
      ],
    );
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.kioskModalScrim} onPress={onClose}>
        <Pressable style={[styles.kioskModalCard, { maxWidth: 520 }]} onPress={() => {}}>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.kioskModalHeader}>
              <Ionicons name="card" size={22} color={Colors.brand.blue} />
              <Text style={styles.kioskModalTitle}>Square Terminal</Text>
            </View>

            {/* PAIRING SCREEN — code on display, polling for completion */}
            {pairing ? (
              <>
                <Text style={styles.kioskModalBody}>
                  On your Square Terminal device:
                </Text>
                <Text style={[styles.kioskModalBody, { marginTop: 4 }]}>
                  1. Tap{" "}
                  <Text style={{ fontWeight: "700" }}>Settings</Text>
                  {" → "}
                  <Text style={{ fontWeight: "700" }}>Sign In</Text>
                  {" → "}
                  <Text style={{ fontWeight: "700" }}>Sign in with a device code</Text>
                </Text>
                <Text style={[styles.kioskModalBody, { marginTop: 4 }]}>
                  2. Enter this code:
                </Text>

                <View style={styles.terminalCodeBox}>
                  <Text style={styles.terminalCodeText}>{pairing.code}</Text>
                </View>

                <View style={styles.terminalWaitingRow}>
                  <ActivityIndicator size="small" color={Colors.brand.blue} />
                  <Text style={styles.terminalWaitingText}>
                    Waiting for terminal… checking every 3 seconds
                  </Text>
                </View>

                <Pressable
                  onPress={cancelPairing}
                  style={({ pressed }) => [styles.kioskModalBtn, styles.kioskModalBtnGhost, { opacity: pressed ? 0.7 : 1, marginTop: 12 }]}
                >
                  <Text style={styles.kioskModalBtnGhostText}>Cancel</Text>
                </Pressable>
              </>
            ) : (
              <>
                {/* STATUS — paired or not */}
                <View style={styles.terminalStatusRow}>
                  <View style={[styles.terminalStatusDot, { backgroundColor: status?.paired ? Colors.brand.green : "#9CA3AF" }]} />
                  <Text style={styles.terminalStatusLabel}>
                    {status?.paired ? `Paired: ${status.deviceName || "Square Terminal"}` : "Not paired"}
                  </Text>
                </View>

                {pairError && (
                  <Text style={[styles.kioskModalError, { marginTop: 8 }]}>{pairError}</Text>
                )}

                {!status?.paired ? (
                  <>
                    <Text style={[styles.kioskModalBody, { marginTop: 12 }]}>
                      Pair a Square Terminal so kiosk customers can tap their card at the counter — orders will be pushed to the terminal automatically and marked paid the moment payment completes.
                    </Text>
                    <Pressable
                      onPress={startPairing}
                      disabled={pairing_busy}
                      style={({ pressed }) => [
                        styles.kioskModalBtn,
                        { backgroundColor: Colors.brand.blue, opacity: pressed || pairing_busy ? 0.7 : 1, marginTop: 16 },
                      ]}
                    >
                      {pairing_busy ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={styles.kioskModalBtnPrimaryText}>Pair a Terminal</Text>
                      )}
                    </Pressable>
                  </>
                ) : (
                  <>
                    <View style={styles.terminalToggleCard}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.terminalToggleTitle}>Push kiosk orders to terminal</Text>
                        <Text style={styles.terminalToggleSub}>
                          {status.enabled
                            ? "Customers tap card on the counter terminal. The order auto-marks paid."
                            : "Off — staff still charge each kiosk order in the Square POS app."}
                        </Text>
                      </View>
                      <Pressable
                        onPress={toggleEnabled}
                        disabled={enableSaving}
                        style={({ pressed }) => [
                          styles.terminalToggleBtn,
                          { backgroundColor: status.enabled ? Colors.brand.green : "#E5E7EB", opacity: pressed || enableSaving ? 0.7 : 1 },
                        ]}
                      >
                        <View style={[styles.terminalToggleThumb, { alignSelf: status.enabled ? "flex-end" : "flex-start" }]} />
                      </Pressable>
                    </View>

                    <Pressable
                      onPress={handleUnpair}
                      disabled={unpairBusy}
                      style={({ pressed }) => [
                        styles.kioskModalBtn,
                        styles.kioskModalBtnGhost,
                        { opacity: pressed || unpairBusy ? 0.7 : 1, marginTop: 16 },
                      ]}
                    >
                      {unpairBusy ? (
                        <ActivityIndicator color={Colors.brand.red} />
                      ) : (
                        <Text style={[styles.kioskModalBtnGhostText, { color: Colors.brand.red }]}>Unpair Terminal</Text>
                      )}
                    </Pressable>
                  </>
                )}

                <Pressable
                  onPress={onClose}
                  style={({ pressed }) => [styles.kioskModalBtn, styles.kioskModalBtnGhost, { opacity: pressed ? 0.7 : 1, marginTop: 8 }]}
                >
                  <Text style={styles.kioskModalBtnGhostText}>Close</Text>
                </Pressable>
              </>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Teya Pro terminal pairing & status (OAuth2 + POSLink) ─────────────────────
// Mirrors SquareTerminalModal's shape but the underlying flow is different:
//   1. Owner taps "Connect Teya" → opens id.teya.com consent screen in the
//      system browser. After consent Teya redirects to our /oauth/callback
//      which stores the access + refresh tokens server-side.
//   2. Once connected, we fetch /stores then /stores/:id/terminals so the
//      owner can pick which physical terminal at the venue acts as the
//      kiosk's counter terminal.
//   3. Enable toggle starts pushing kiosk orders to that terminal.
type TeyaStatus = {
  configured: boolean;
  connected: boolean;
  expiresAt: string | null;
  scope: string | null;
  paired: boolean;
  storeId: string | null;
  terminalId: string | null;
  terminalName: string | null;
  enabled: boolean;
  printReceipt: boolean;
};
type TeyaRecentPayment = {
  requestId: string;
  appOrderId: number | null;
  ticketNumber: number | null;
  amountPence: number;
  status: "PENDING" | "SUCCESSFUL" | "FAILED" | "CANCELLED" | "EXPIRED" | string;
  startedAt: string;
  finishedAt: string | null;
};
function TeyaTerminalModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data: status, refetch } = useQuery<TeyaStatus>({
    queryKey: ["/api/staff/teya/status"],
    enabled: visible,
    refetchInterval: visible ? 5000 : false, // catches the moment the popup callback completes
  });

  const [stores, setStores] = useState<Array<{ id: string; name: string }> | null>(null);
  const [terminals, setTerminals] = useState<Array<{ id: string; name: string }> | null>(null);
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "connect" | "stores" | "terminals" | "pair" | "enabled" | "unpair" | "disconnect" | "test" | "printReceipt">(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Recent payments — only fetched when connected. Polls every 5s while
  // the modal is open so SSE-driven status changes show up in near-real-time.
  const { data: recentData } = useQuery<{ payments: TeyaRecentPayment[] }>({
    queryKey: ["/api/staff/teya/recent-payments"],
    enabled: visible && !!status?.connected,
    refetchInterval: visible && status?.connected ? 5000 : false,
  });
  const recent = recentData?.payments || [];

  useEffect(() => {
    if (!visible) {
      setErrorMsg(null);
      setStores(null);
      setTerminals(null);
      setSelectedStoreId(null);
    }
  }, [visible]);

  // Pre-select the currently-paired store the moment we know it, and load
  // the terminal list so the owner can see what's wired up at a glance.
  useEffect(() => {
    if (visible && status?.connected && status?.storeId && !selectedStoreId) {
      setSelectedStoreId(status.storeId);
    }
  }, [visible, status, selectedStoreId]);

  const startConnect = async () => {
    setErrorMsg(null);
    setBusy("connect");
    try {
      const res = await apiRequest("GET", "/api/staff/teya/oauth/start?format=json");
      const data = await res.json();
      if (!data?.url) throw new Error("Server did not return a Teya consent URL");
      // Open the system browser. The callback page closes itself; the
      // 5-second poll on /status picks up the new connection.
      await Linking.openURL(data.url);
    } catch (err: any) {
      setErrorMsg(err?.message || "Could not start Teya connection");
    } finally {
      setBusy(null);
    }
  };

  const loadStores = async () => {
    setErrorMsg(null);
    setBusy("stores");
    try {
      const res = await apiRequest("GET", "/api/staff/teya/stores");
      const data = await res.json();
      setStores(data?.stores || []);
    } catch (err: any) {
      setErrorMsg(err?.message || "Could not load stores");
    } finally {
      setBusy(null);
    }
  };

  const loadTerminals = async (storeId: string) => {
    setErrorMsg(null);
    setBusy("terminals");
    try {
      setSelectedStoreId(storeId);
      const res = await apiRequest("GET", `/api/staff/teya/stores/${encodeURIComponent(storeId)}/terminals`);
      const data = await res.json();
      setTerminals(data?.terminals || []);
    } catch (err: any) {
      setErrorMsg(err?.message || "Could not load terminals");
    } finally {
      setBusy(null);
    }
  };

  const pickTerminal = async (terminalId: string, terminalName: string) => {
    if (!selectedStoreId) return;
    setBusy("pair");
    try {
      await apiRequest("PUT", "/api/staff/teya/pairing", {
        storeId: selectedStoreId,
        terminalId,
        terminalName,
      });
      await refetch();
    } catch (err: any) {
      setErrorMsg(err?.message || "Could not pair terminal");
    } finally {
      setBusy(null);
    }
  };

  const togglePrintReceipt = async () => {
    if (!status?.paired) return;
    setBusy("printReceipt");
    try {
      await apiRequest("PUT", "/api/staff/teya/print-receipt", { enabled: !status.printReceipt });
      await refetch();
    } catch (err: any) {
      Alert.alert("Could not update", err?.message || "Please try again");
    } finally {
      setBusy(null);
    }
  };

  const runTestConnection = async () => {
    setTestResult(null);
    setBusy("test");
    try {
      const res = await apiRequest("GET", "/api/staff/teya/test-connection");
      const data = await res.json();
      setTestResult({ ok: !!data?.ok, message: data?.ok ? `OK — ${data.storeCount ?? 0} store(s) reachable` : (data?.message || "Test failed") });
    } catch (err: any) {
      setTestResult({ ok: false, message: err?.message || "Test failed" });
    } finally {
      setBusy(null);
    }
  };

  const toggleEnabled = async () => {
    if (!status?.paired) return;
    setBusy("enabled");
    try {
      await apiRequest("PUT", "/api/staff/teya/enabled", { enabled: !status.enabled });
      await refetch();
    } catch (err: any) {
      Alert.alert("Could not update", err?.message || "Please try again");
    } finally {
      setBusy(null);
    }
  };

  const handleUnpair = () => {
    Alert.alert(
      "Unpair this terminal?",
      "Kiosk orders will no longer be pushed to this Teya terminal. You can pair it again at any time.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Unpair",
          style: "destructive",
          onPress: async () => {
            setBusy("unpair");
            try {
              await apiRequest("DELETE", "/api/staff/teya/pairing");
              await refetch();
              setTerminals(null);
            } catch (err: any) {
              Alert.alert("Could not unpair", err?.message || "Please try again");
            } finally {
              setBusy(null);
            }
          },
        },
      ],
    );
  };

  const handleDisconnect = () => {
    Alert.alert(
      "Disconnect Teya account?",
      "We'll forget the access tokens. The owner will need to authorise again to re-connect.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Disconnect",
          style: "destructive",
          onPress: async () => {
            setBusy("disconnect");
            try {
              await apiRequest("DELETE", "/api/staff/teya/oauth");
              await queryClient.invalidateQueries({ queryKey: ["/api/staff/teya/status"] });
              setStores(null);
              setTerminals(null);
              setSelectedStoreId(null);
            } catch (err: any) {
              Alert.alert("Could not disconnect", err?.message || "Please try again");
            } finally {
              setBusy(null);
            }
          },
        },
      ],
    );
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.kioskModalScrim} onPress={onClose}>
        <Pressable style={[styles.kioskModalCard, { maxWidth: 560 }]} onPress={() => {}}>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.kioskModalHeader}>
              <Ionicons name="card" size={22} color={Colors.brand.blue} />
              <Text style={styles.kioskModalTitle}>Teya Pro Terminal</Text>
            </View>

            {/* SERVER-SIDE CONFIG MISSING — surface clearly so the owner knows
                they can't use this until env vars are set. */}
            {status && !status.configured ? (
              <View style={{ marginTop: 12 }}>
                <Text style={styles.kioskModalBody}>
                  Teya isn't configured on the server yet. Once Teya provides
                  the venue with a Client ID, Client Secret, and registered
                  Redirect URI, set them as <Text style={{ fontWeight: "700" }}>TEYA_CLIENT_ID</Text>,{" "}
                  <Text style={{ fontWeight: "700" }}>TEYA_CLIENT_SECRET</Text>, and (optionally){" "}
                  <Text style={{ fontWeight: "700" }}>TEYA_REDIRECT_URI</Text>{" "}
                  in the deployment secrets, redeploy, then reopen this screen.
                </Text>
              </View>
            ) : (
              <>
                {/* Connection status */}
                <View style={styles.terminalStatusRow}>
                  <View style={[styles.terminalStatusDot, { backgroundColor: status?.connected ? Colors.brand.green : "#9CA3AF" }]} />
                  <Text style={styles.terminalStatusLabel}>
                    {status?.connected ? "Teya account connected" : "Not connected"}
                  </Text>
                </View>

                {errorMsg && (
                  <Text style={[styles.kioskModalError, { marginTop: 8 }]}>{errorMsg}</Text>
                )}

                {!status?.connected ? (
                  <>
                    <Text style={[styles.kioskModalBody, { marginTop: 12 }]}>
                      Connect your Teya merchant account so the kiosk can push card payments straight to the Teya Pro terminal at the counter.
                    </Text>
                    <Pressable
                      onPress={startConnect}
                      disabled={busy === "connect"}
                      style={({ pressed }) => [
                        styles.kioskModalBtn,
                        { backgroundColor: Colors.brand.blue, opacity: pressed || busy === "connect" ? 0.7 : 1, marginTop: 16 },
                      ]}
                    >
                      {busy === "connect" ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={styles.kioskModalBtnPrimaryText}>Connect Teya account</Text>
                      )}
                    </Pressable>
                  </>
                ) : (
                  <>
                    {/* Already paired — show what's paired + the enable toggle */}
                    {status.paired && (
                      <View style={[styles.terminalToggleCard, { marginTop: 12 }]}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.terminalToggleTitle}>Push kiosk orders to terminal</Text>
                          <Text style={styles.terminalToggleSub}>
                            {status.enabled
                              ? `Customers tap card on "${status.terminalName || status.terminalId}". The order auto-marks paid.`
                              : `Off — paired to "${status.terminalName || status.terminalId}" but not pushing yet.`}
                          </Text>
                        </View>
                        <Pressable
                          onPress={toggleEnabled}
                          disabled={busy === "enabled"}
                          style={({ pressed }) => [
                            styles.terminalToggleBtn,
                            { backgroundColor: status.enabled ? Colors.brand.green : "#E5E7EB", opacity: pressed || busy === "enabled" ? 0.7 : 1 },
                          ]}
                        >
                          <View style={[styles.terminalToggleThumb, { alignSelf: status.enabled ? "flex-end" : "flex-start" }]} />
                        </Pressable>
                      </View>
                    )}

                    {/* Print receipt on success — optional courtesy receipt
                        printed on the Teya Pro's built-in printer. Off by
                        default. Failures here never affect order state. */}
                    {status.paired && (
                      <View style={[styles.terminalToggleCard, { marginTop: 8 }]}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.terminalToggleTitle}>Print receipt on success</Text>
                          <Text style={styles.terminalToggleSub}>
                            {status.printReceipt
                              ? "Auto-prints a customer ticket on the Teya Pro printer when payment lands."
                              : "Off — no auto receipt. Customer just sees the on-screen ticket number."}
                          </Text>
                        </View>
                        <Pressable
                          onPress={togglePrintReceipt}
                          disabled={busy === "printReceipt"}
                          style={({ pressed }) => [
                            styles.terminalToggleBtn,
                            { backgroundColor: status.printReceipt ? Colors.brand.green : "#E5E7EB", opacity: pressed || busy === "printReceipt" ? 0.7 : 1 },
                          ]}
                        >
                          <View style={[styles.terminalToggleThumb, { alignSelf: status.printReceipt ? "flex-end" : "flex-start" }]} />
                        </Pressable>
                      </View>
                    )}

                    {/* Pick / change store + terminal */}
                    <Text style={[styles.kioskModalBody, { marginTop: 16, fontWeight: "700" }]}>
                      {status.paired ? "Change paired terminal" : "Pick a store and terminal"}
                    </Text>

                    {!stores && (
                      <Pressable
                        onPress={loadStores}
                        disabled={busy === "stores"}
                        style={({ pressed }) => [
                          styles.kioskModalBtn,
                          { backgroundColor: Colors.brand.blue, opacity: pressed || busy === "stores" ? 0.7 : 1, marginTop: 8 },
                        ]}
                      >
                        {busy === "stores" ? (
                          <ActivityIndicator color="#fff" />
                        ) : (
                          <Text style={styles.kioskModalBtnPrimaryText}>Load stores from Teya</Text>
                        )}
                      </Pressable>
                    )}

                    {stores && stores.length === 0 && (
                      <Text style={[styles.kioskModalBody, { marginTop: 8 }]}>
                        No stores returned by Teya. Check the merchant account has at least one store configured.
                      </Text>
                    )}

                    {stores && stores.length > 0 && (
                      <View style={{ marginTop: 8 }}>
                        {stores.map((s) => (
                          <Pressable
                            key={s.id}
                            onPress={() => loadTerminals(s.id)}
                            style={({ pressed }) => [
                              styles.terminalListRow,
                              {
                                borderColor: selectedStoreId === s.id ? Colors.brand.blue : "#E5E7EB",
                                opacity: pressed ? 0.7 : 1,
                              },
                            ]}
                          >
                            <Ionicons name="business-outline" size={18} color={Colors.brand.blue} />
                            <Text style={styles.terminalListText}>{s.name}</Text>
                            {selectedStoreId === s.id && busy === "terminals" && <ActivityIndicator size="small" />}
                          </Pressable>
                        ))}
                      </View>
                    )}

                    {terminals && (
                      <View style={{ marginTop: 8 }}>
                        {terminals.length === 0 ? (
                          <Text style={[styles.kioskModalBody, { marginTop: 8 }]}>
                            No terminals in this store.
                          </Text>
                        ) : (
                          terminals.map((t) => {
                            const isCurrent = status.terminalId === t.id && selectedStoreId === status.storeId;
                            return (
                              <Pressable
                                key={t.id}
                                onPress={() => pickTerminal(t.id, t.name)}
                                disabled={busy === "pair"}
                                style={({ pressed }) => [
                                  styles.terminalListRow,
                                  {
                                    borderColor: isCurrent ? Colors.brand.green : "#E5E7EB",
                                    backgroundColor: isCurrent ? "#ECFDF5" : "#FFFFFF",
                                    opacity: pressed || busy === "pair" ? 0.7 : 1,
                                  },
                                ]}
                              >
                                <Ionicons name="card-outline" size={18} color={isCurrent ? Colors.brand.green : Colors.brand.blue} />
                                <Text style={styles.terminalListText}>{t.name}</Text>
                                {isCurrent && (
                                  <Text style={{ color: Colors.brand.green, fontWeight: "700", fontSize: 12 }}>PAIRED</Text>
                                )}
                              </Pressable>
                            );
                          })
                        )}
                      </View>
                    )}

                    {/* Diagnostics — test the live OAuth token and see the
                        last few kiosk → Teya attempts at a glance. Lost on
                        server restart but plenty for day-to-day troubleshooting. */}
                    <Text style={[styles.kioskModalBody, { marginTop: 20, fontWeight: "700" }]}>Diagnostics</Text>
                    <Pressable
                      onPress={runTestConnection}
                      disabled={busy === "test"}
                      style={({ pressed }) => [
                        styles.kioskModalBtn,
                        styles.kioskModalBtnGhost,
                        { marginTop: 8, opacity: pressed || busy === "test" ? 0.7 : 1 },
                      ]}
                    >
                      {busy === "test" ? (
                        <ActivityIndicator color={Colors.brand.blue} />
                      ) : (
                        <Text style={styles.kioskModalBtnGhostText}>Test connection</Text>
                      )}
                    </Pressable>
                    {testResult && (
                      <Text style={[styles.kioskModalBody, { marginTop: 6, color: testResult.ok ? Colors.brand.green : Colors.brand.red }]}>
                        {testResult.ok ? "✓ " : "✗ "}{testResult.message}
                      </Text>
                    )}

                    {recent.length > 0 && (
                      <View style={{ marginTop: 14 }}>
                        <Text style={[styles.kioskModalBody, { fontWeight: "700", marginBottom: 6 }]}>Recent payments</Text>
                        {recent.slice(0, 6).map((p) => {
                          const colour =
                            p.status === "SUCCESSFUL" ? Colors.brand.green :
                            p.status === "PENDING" ? "#9CA3AF" :
                            Colors.brand.red;
                          const time = new Date(p.startedAt).toLocaleTimeString();
                          return (
                            <View key={p.requestId} style={styles.terminalListRow}>
                              <View style={[styles.terminalStatusDot, { backgroundColor: colour }]} />
                              <View style={{ flex: 1 }}>
                                <Text style={styles.terminalListText}>
                                  {p.ticketNumber ? `Ticket #${p.ticketNumber}` : `Order #${p.appOrderId ?? "?"}`} · £{(p.amountPence / 100).toFixed(2)}
                                </Text>
                                <Text style={{ fontFamily: "Montserrat_500Medium", fontSize: 11, color: Colors.light.textSecondary }}>
                                  {time} · {p.status}
                                </Text>
                              </View>
                            </View>
                          );
                        })}
                      </View>
                    )}

                    {/* Maintenance actions */}
                    <View style={{ flexDirection: "row", gap: 8, marginTop: 16 }}>
                      {status.paired && (
                        <Pressable
                          onPress={handleUnpair}
                          disabled={busy === "unpair"}
                          style={({ pressed }) => [
                            styles.kioskModalBtn,
                            styles.kioskModalBtnGhost,
                            { flex: 1, opacity: pressed || busy === "unpair" ? 0.7 : 1 },
                          ]}
                        >
                          {busy === "unpair" ? (
                            <ActivityIndicator color={Colors.brand.red} />
                          ) : (
                            <Text style={[styles.kioskModalBtnGhostText, { color: Colors.brand.red }]}>Unpair</Text>
                          )}
                        </Pressable>
                      )}
                      <Pressable
                        onPress={handleDisconnect}
                        disabled={busy === "disconnect"}
                        style={({ pressed }) => [
                          styles.kioskModalBtn,
                          styles.kioskModalBtnGhost,
                          { flex: 1, opacity: pressed || busy === "disconnect" ? 0.7 : 1 },
                        ]}
                      >
                        {busy === "disconnect" ? (
                          <ActivityIndicator color={Colors.brand.red} />
                        ) : (
                          <Text style={[styles.kioskModalBtnGhostText, { color: Colors.brand.red }]}>Disconnect</Text>
                        )}
                      </Pressable>
                    </View>
                  </>
                )}
              </>
            )}

            <Pressable
              onPress={onClose}
              style={({ pressed }) => [styles.kioskModalBtn, styles.kioskModalBtnGhost, { opacity: pressed ? 0.7 : 1, marginTop: 12 }]}
            >
              <Text style={styles.kioskModalBtnGhostText}>Close</Text>
            </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Active terminal vendor row ────────────────────────────────────────────────
// Inline segmented control rendered under the two terminal AdminTools so the
// owner can pick which vendor receives kiosk pushes. Stored in the
// `active_kiosk_terminal` setting; defaults to "square" so existing venues
// see no behaviour change after the Teya integration ships.
function ActiveTerminalRow() {
  const queryClient = useQueryClient();
  const { data } = useQuery<{ provider: "square" | "teya" | "none" }>({
    queryKey: ["/api/staff/active-terminal"],
  });
  // Health probe — small dot/label so the owner knows whether the chosen
  // vendor is actually reachable right now (paired, OAuth still valid, etc).
  // Polled every 30s; cheap server-side.
  const { data: health } = useQuery<{ provider: string; healthy: boolean; reason: string }>({
    queryKey: ["/api/staff/active-terminal/health"],
    refetchInterval: 30_000,
  });
  const provider = data?.provider || "square";
  const [busy, setBusy] = useState<"square" | "teya" | "none" | null>(null);
  const set = async (next: "square" | "teya" | "none") => {
    if (provider === next || busy) return;
    setBusy(next);
    try {
      await apiRequest("PUT", "/api/staff/active-terminal", { provider: next });
      await queryClient.invalidateQueries({ queryKey: ["/api/staff/active-terminal"] });
    } catch (err: any) {
      Alert.alert("Could not update", err?.message || "Please try again");
    } finally {
      setBusy(null);
    }
  };
  const Btn = ({ value, label }: { value: "square" | "teya" | "none"; label: string }) => {
    const active = provider === value;
    return (
      <Pressable
        onPress={() => set(value)}
        disabled={!!busy}
        style={({ pressed }) => [
          styles.activeTerminalBtn,
          {
            backgroundColor: active ? Colors.brand.blue : "transparent",
            opacity: pressed || busy ? 0.7 : 1,
          },
        ]}
      >
        {busy === value ? (
          <ActivityIndicator size="small" color={active ? "#fff" : Colors.brand.blue} />
        ) : (
          <Text style={[styles.activeTerminalBtnText, { color: active ? "#fff" : Colors.brand.blue }]}>{label}</Text>
        )}
      </Pressable>
    );
  };
  return (
    <View style={styles.activeTerminalCard}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text style={[styles.activeTerminalTitle, { flex: 1 }]}>Active card terminal</Text>
        {health && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View style={[styles.terminalStatusDot, { backgroundColor: health.healthy ? Colors.brand.green : "#EF4444" }]} />
            <Text style={{ fontFamily: "Montserrat_600SemiBold", fontSize: 11, color: health.healthy ? Colors.brand.green : "#EF4444" }}>
              {health.healthy ? "REACHABLE" : "UNREACHABLE"}
            </Text>
          </View>
        )}
      </View>
      <Text style={styles.activeTerminalSub}>
        Kiosk orders push to whichever vendor you pick here. Each must be paired and enabled in its own panel above for the push to fire.
        {health && !health.healthy ? `\n\n${health.reason}` : ""}
      </Text>
      <View style={styles.activeTerminalRow}>
        <Btn value="square" label="Square" />
        <Btn value="teya" label="Teya" />
        <Btn value="none" label="Off" />
      </View>
    </View>
  );
}

// ── Square promotional discounts on/off per surface ─────────────────────────
// Two switches the owner can flick to stop Square pricing rules ("deals"
// like "Hawkstone Weekend") from auto-applying at checkout. Order tab and
// Kiosk are independent so the venue can, for example, keep the deal
// active in-app but disable it on the kiosk during a busy event. Member
// discounts are unaffected — this only governs Square's Discounts catalog.
function SquareDealsRow() {
  const queryClient = useQueryClient();
  const { data } = useQuery<{ order: boolean; kiosk: boolean }>({
    queryKey: ["/api/staff/square-deals/settings"],
  });
  const [busy, setBusy] = useState<"order" | "kiosk" | null>(null);
  const set = async (which: "order" | "kiosk", next: boolean) => {
    if (busy) return;
    setBusy(which);
    try {
      await apiRequest("PUT", "/api/staff/square-deals/settings", { [which]: next });
      await queryClient.invalidateQueries({ queryKey: ["/api/staff/square-deals/settings"] });
    } catch (err: any) {
      Alert.alert("Could not update", err?.message || "Please try again");
    } finally {
      setBusy(null);
    }
  };
  const orderOn = data?.order ?? true;
  const kioskOn = data?.kiosk ?? true;
  return (
    <View style={styles.activeTerminalCard}>
      <Text style={styles.activeTerminalTitle}>Square offers (deals)</Text>
      <Text style={styles.activeTerminalSub}>
        Turn Square pricing-rule discounts (like "Hawkstone Weekend") on or off per surface. Member discounts are unaffected.
      </Text>
      <View style={{ marginTop: 12, gap: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={{ fontFamily: "Montserrat_600SemiBold", fontSize: 14, color: Colors.light.text }}>Order tab</Text>
            <Text style={{ fontFamily: "Montserrat_400Regular", fontSize: 12, color: Colors.light.textSecondary, marginTop: 2 }}>
              In-app customer ordering
            </Text>
          </View>
          {busy === "order" ? (
            <ActivityIndicator size="small" color={Colors.brand.blue} />
          ) : (
            <Switch
              value={orderOn}
              onValueChange={(v) => set("order", v)}
              trackColor={{ false: "#D1D5DB", true: Colors.brand.green }}
              thumbColor="#fff"
              testID="square-deals-order-switch"
            />
          )}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={{ fontFamily: "Montserrat_600SemiBold", fontSize: 14, color: Colors.light.text }}>Kiosk</Text>
            <Text style={{ fontFamily: "Montserrat_400Regular", fontSize: 12, color: Colors.light.textSecondary, marginTop: 2 }}>
              On-table self-service
            </Text>
          </View>
          {busy === "kiosk" ? (
            <ActivityIndicator size="small" color={Colors.brand.blue} />
          ) : (
            <Switch
              value={kioskOn}
              onValueChange={(v) => set("kiosk", v)}
              trackColor={{ false: "#D1D5DB", true: Colors.brand.green }}
              thumbColor="#fff"
              testID="square-deals-kiosk-switch"
            />
          )}
        </View>
      </View>
    </View>
  );
}

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
  const { tabletPad, isTablet } = useResponsive();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const { logout, username, displayName, role, isManager, isOwner } = useStaffAuth();
  const { isKioskMode } = useKiosk();
  const queryClient = useQueryClient();
  const [kioskModalVisible, setKioskModalVisible] = useState(false);
  const [attractEditorVisible, setAttractEditorVisible] = useState(false);
  const [terminalModalVisible, setTerminalModalVisible] = useState(false);
  const [teyaModalVisible, setTeyaModalVisible] = useState(false);
  const [kioskOrderingSaving, setKioskOrderingSaving] = useState(false);

  // Kiosk-ordering on/off — separate from the global ordering toggle, so
  // staff can disable the kiosk specifically (tablet being moved, kitchen
  // short-staffed, etc.) without taking down regular online ordering.
  const { data: settings } = useQuery<Record<string, string>>({
    queryKey: ["/api/settings"],
    enabled: isManager,
  });
  const kioskOrderingEnabled = settings?.kiosk_ordering_enabled !== "false";

  const toggleKioskOrdering = async () => {
    const next = !kioskOrderingEnabled;
    setKioskOrderingSaving(true);
    try {
      await apiRequest("PUT", "/api/settings/kiosk_ordering_enabled", { value: String(next) });
      await queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
    } catch (err: any) {
      Alert.alert("Could not update", err?.message || "Please try again");
    } finally {
      setKioskOrderingSaving(false);
    }
  };

  const handleToggleKioskOrdering = () => {
    if (kioskOrderingSaving) return;
    if (kioskOrderingEnabled) {
      Alert.alert(
        "Pause kiosk ordering?",
        "Customers using the kiosk tablet will see an 'Ordering Paused' message and won't be able to place orders. Regular online ordering is unaffected.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Pause Kiosk", style: "destructive", onPress: toggleKioskOrdering },
        ],
      );
    } else {
      toggleKioskOrdering();
    }
  };

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
        contentContainerStyle={[styles.scrollContent, { paddingHorizontal: 16 + tabletPad }]}
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

        <View style={[styles.toolsList, isTablet && styles.toolsListTablet]}>
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
            <View style={[styles.toolsList, isTablet && styles.toolsListTablet]}>
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
            <View style={[styles.toolsList, isTablet && styles.toolsListTablet]}>
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
            <View style={[styles.toolsList, isTablet && styles.toolsListTablet]}>
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
            <View style={[styles.toolsList, isTablet && styles.toolsListTablet]}>
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
                <View style={[styles.toolsList, isTablet && styles.toolsListTablet]}>
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
            <View style={[styles.toolsList, isTablet && styles.toolsListTablet]}>
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
              <AdminTool
                icon={kioskOrderingEnabled ? "pause-circle" : "play-circle"}
                title={kioskOrderingEnabled ? "Pause Kiosk Ordering" : "Resume Kiosk Ordering"}
                description={
                  kioskOrderingEnabled
                    ? "Show an 'Ordering Paused' message on the kiosk. Regular online ordering keeps working."
                    : "Kiosk ordering is currently paused. Tap to re-enable."
                }
                color={kioskOrderingEnabled ? "#D97706" : Colors.brand.green}
                onPress={handleToggleKioskOrdering}
                testID="portal-kiosk-ordering-toggle"
              />
              <AdminTool
                icon="card"
                title="Square Terminal"
                description="Pair a Square Terminal so kiosk customers can tap their card at the counter."
                color={Colors.brand.blue}
                onPress={() => setTerminalModalVisible(true)}
                testID="portal-square-terminal"
              />
              {/* Teya Pro — POSLink (OAuth2 + push-to-terminal + SSE status).
                  Mirrors the Square Terminal tool above. The user picks
                  which vendor to use via the "Active card terminal" row
                  rendered below. */}
              <AdminTool
                icon="card-outline"
                title="Teya Pro Terminal"
                description="Push kiosk payments to your Teya Pro terminal via POSLink."
                color={Colors.brand.blue}
                onPress={() => setTeyaModalVisible(true)}
                testID="portal-teya-terminal"
              />
              <ActiveTerminalRow />
              <SquareDealsRow />
            </View>
          </>
        )}

        <KioskEnableModal visible={kioskModalVisible} onClose={() => setKioskModalVisible(false)} />
        <KioskAttractEditModal visible={attractEditorVisible} onClose={() => setAttractEditorVisible(false)} />
        <SquareTerminalModal visible={terminalModalVisible} onClose={() => setTerminalModalVisible(false)} />
        <TeyaTerminalModal visible={teyaModalVisible} onClose={() => setTeyaModalVisible(false)} />

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
  toolsListTablet: {
    flexDirection: "row",
    flexWrap: "wrap",
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
  toolCardTablet: {
    flexBasis: "48%",
    flexGrow: 0,
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
  // ── Square Terminal modal ──────────────────────────────────────────────────
  // Styles specific to the Square Terminal pairing/status modal. Kept here
  // (rather than alongside the existing modal styles) so they're easy to
  // remove together if the integration is ever pulled.
  terminalCodeBox: {
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
    paddingVertical: 24,
    marginTop: 12,
    alignItems: "center" as const,
    borderWidth: 2,
    borderColor: Colors.brand.blue,
    borderStyle: "dashed" as const,
  },
  terminalCodeText: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 40,
    letterSpacing: 8,
    color: Colors.brand.blue,
  },
  terminalWaitingRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 10,
    marginTop: 14,
    paddingHorizontal: 4,
  },
  terminalWaitingText: {
    fontFamily: "Montserrat_500Medium",
    fontSize: 13,
    color: Colors.light.textSecondary,
    flex: 1,
  },
  terminalStatusRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: "#F9FAFB",
    borderRadius: 10,
    marginTop: 4,
  },
  terminalStatusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  terminalStatusLabel: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 14,
    color: Colors.light.text,
    flex: 1,
  },
  terminalToggleCard: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
    backgroundColor: "#F9FAFB",
    borderRadius: 10,
    padding: 14,
    marginTop: 16,
  },
  terminalToggleTitle: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 14,
    color: Colors.light.text,
  },
  terminalToggleSub: {
    fontFamily: "Montserrat_500Medium",
    fontSize: 12,
    color: Colors.light.textSecondary,
    marginTop: 4,
    lineHeight: 16,
  },
  terminalToggleBtn: {
    width: 48,
    height: 28,
    borderRadius: 14,
    padding: 2,
    justifyContent: "center" as const,
  },
  terminalToggleThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  // Teya store/terminal picker rows
  terminalListRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 10,
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 6,
    backgroundColor: "#FFFFFF",
  },
  terminalListText: {
    flex: 1,
    fontFamily: "Montserrat_500Medium",
    fontSize: 14,
    color: Colors.light.text,
  },
  // Active-terminal vendor segmented control (sits under the two terminal
  // tools so the owner picks which vendor is "live").
  activeTerminalCard: {
    marginTop: 12,
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  activeTerminalTitle: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 14,
    color: Colors.light.text,
  },
  activeTerminalSub: {
    fontFamily: "Montserrat_500Medium",
    fontSize: 12,
    color: Colors.light.textSecondary,
    marginTop: 4,
    lineHeight: 16,
  },
  activeTerminalRow: {
    flexDirection: "row" as const,
    gap: 8,
    marginTop: 12,
  },
  activeTerminalBtn: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: Colors.brand.blue,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  activeTerminalBtnText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 13,
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
