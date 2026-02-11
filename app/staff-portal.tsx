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
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import Colors from "@/constants/colors";

function LoginScreen() {
  const insets = useSafeAreaInsets();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const { login } = useStaffAuth();
  const [pin, setPin] = useState("");
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

  const handleLogin = async () => {
    if (!pin.trim()) {
      setError("Please enter the staff PIN");
      triggerShake();
      return;
    }

    setLoading(true);
    setError("");
    const result = await login(pin.trim());
    setLoading(false);

    if (!result.success) {
      setError(result.error || "Login failed");
      setPin("");
      triggerShake();
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

      <View style={styles.loginContent}>
        <View style={styles.lockIconWrap}>
          <Ionicons name="lock-closed" size={40} color={Colors.brand.blue} />
        </View>

        <Text style={styles.loginTitle}>Staff Portal</Text>
        <Text style={styles.loginSubtitle}>Enter your staff PIN to access admin tools</Text>

        <Animated.View style={[styles.pinSection, { transform: [{ translateX: shakeAnim }] }]}>
          <TextInput
            style={[styles.pinInput, error ? styles.pinInputError : null]}
            value={pin}
            onChangeText={(text) => {
              setPin(text);
              if (error) setError("");
            }}
            placeholder="Enter PIN"
            placeholderTextColor={Colors.light.textSecondary}
            secureTextEntry
            keyboardType="number-pad"
            maxLength={10}
            autoFocus
            onSubmitEditing={handleLogin}
            testID="staff-pin-input"
          />
        </Animated.View>

        {error ? (
          <View style={styles.errorRow}>
            <Ionicons name="alert-circle" size={16} color={Colors.brand.red} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <Pressable
          onPress={handleLogin}
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
              <Ionicons name="log-in-outline" size={20} color="#FFFFFF" />
              <Text style={styles.loginButtonText}>Sign In</Text>
            </>
          )}
        </Pressable>
      </View>
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
  const { logout } = useStaffAuth();

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
          <View style={styles.welcomeBadge}>
            <Ionicons name="shield-checkmark" size={16} color={Colors.brand.green} />
            <Text style={styles.welcomeBadgeText}>Authenticated</Text>
          </View>
          <Text style={styles.welcomeTitle}>Admin Dashboard</Text>
          <Text style={styles.welcomeSubtitle}>Manage your venue from here</Text>
        </View>

        <Text style={styles.sectionLabel}>ADMIN TOOLS</Text>

        <View style={styles.toolsList}>
          <AdminTool
            icon="pricetag"
            title="Manage Offers"
            description="Create, edit and remove promotional offers"
            color={Colors.brand.blue}
            onPress={() => router.push("/admin-offers")}
            testID="portal-manage-offers"
          />
          <AdminTool
            icon="notifications"
            title="Push Notifications"
            description="Send notifications to app users"
            color={Colors.brand.gold}
            onPress={() => router.push("/admin-notifications")}
            testID="portal-push-notifications"
          />
        </View>

        <Text style={styles.sectionLabel}>SESSION</Text>

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
  loginContent: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 32,
    marginTop: -60,
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
    marginBottom: 32,
  },
  pinSection: {
    marginBottom: 12,
  },
  pinInput: {
    backgroundColor: Colors.light.surface,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: Colors.light.border,
    paddingHorizontal: 20,
    paddingVertical: 16,
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 22,
    color: Colors.light.text,
    textAlign: "center",
    letterSpacing: 8,
  },
  pinInputError: {
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
  },
  welcomeSubtitle: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 14,
    color: Colors.light.textSecondary,
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
});
