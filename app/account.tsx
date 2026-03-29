import React, { useState, useCallback } from "react";
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  Platform,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import { apiRequest, queryClient, getApiUrl } from "@/lib/query-client";
import Colors from "@/constants/colors";
import { TABLE_TYPES } from "@/lib/data";
import { fetch } from "expo/fetch";

type AuthMode = "login" | "register";

interface CustomerBooking {
  id: number;
  tableType: string;
  tableNumber: string | null;
  date: string;
  startTime: string;
  duration: number;
  status: string;
  notes: string | null;
  createdAt: string;
}

export default function AccountScreen() {
  const insets = useSafeAreaInsets();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const { isAuthenticated, isLoading: authLoading, customer, login, register, logout, updateProfile, deleteAccount } = useCustomerAuth();

  if (authLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
        <ActivityIndicator size="large" color={Colors.brand.blue} style={{ marginTop: 60 }} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + webTopInset }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="close" size={24} color="#FFFFFF" />
        </Pressable>
        <Text style={styles.headerTitle}>My Account</Text>
        <View style={{ width: 40 }} />
      </View>
      {isAuthenticated && customer ? (
        <LoggedInView customer={customer} logout={logout} updateProfile={updateProfile} deleteAccount={deleteAccount} />
      ) : (
        <AuthView login={login} register={register} />
      )}
    </View>
  );
}

function AuthView({ login, register }: {
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (name: string, email: string, phone: string, password: string) => Promise<{ success: boolean; error?: string }>;
}) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [privacyConsent, setPrivacyConsent] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      setError("Please enter your email and password");
      return;
    }
    setLoading(true);
    setError("");
    const result = await login(email.trim(), password);
    setLoading(false);
    if (!result.success) {
      setError(result.error || "Login failed");
    }
  };

  const handleRegister = async () => {
    if (!name.trim() || !email.trim() || !password) {
      setError("Please fill in all required fields");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    if (!privacyConsent) {
      setError("You must agree to the Privacy Policy to create an account");
      return;
    }
    setLoading(true);
    setError("");
    const result = await register(name.trim(), email.trim(), phone.trim(), password);
    setLoading(false);
    if (!result.success) {
      setError(result.error || "Registration failed");
    }
  };

  return (
    <ScrollView style={styles.scrollContent} contentContainerStyle={styles.scrollInner} keyboardShouldPersistTaps="handled">
      <View style={styles.authIcon}>
        <Ionicons name="person-circle" size={80} color={Colors.brand.blue} />
      </View>
      <Text style={styles.authTitle}>
        {mode === "login" ? "Welcome Back" : "Create Account"}
      </Text>
      <Text style={styles.authSubtitle}>
        {mode === "login"
          ? "Sign in to manage your bookings"
          : "Join The 147 to book tables and track reservations"}
      </Text>

      {error ? (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle" size={18} color="#DC2626" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {mode === "register" && (
        <>
          <Text style={styles.inputLabel}>Full Name *</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Your full name"
            placeholderTextColor="#9CA3AF"
            autoCapitalize="words"
            testID="register-name"
          />
          <Text style={styles.inputLabel}>Phone Number</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="Your phone number"
            placeholderTextColor="#9CA3AF"
            keyboardType="phone-pad"
            testID="register-phone"
          />
        </>
      )}

      <Text style={styles.inputLabel}>Email Address *</Text>
      <TextInput
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        placeholder="your@email.com"
        placeholderTextColor="#9CA3AF"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        testID="auth-email"
      />

      <Text style={styles.inputLabel}>Password *</Text>
      <TextInput
        style={styles.input}
        value={password}
        onChangeText={setPassword}
        placeholder={mode === "register" ? "Min. 6 characters" : "Your password"}
        placeholderTextColor="#9CA3AF"
        secureTextEntry
        testID="auth-password"
      />

      {mode === "register" && (
        <Pressable
          onPress={() => setPrivacyConsent(!privacyConsent)}
          style={styles.consentRow}
          testID="privacy-consent"
        >
          <View style={[styles.consentCheckbox, privacyConsent && styles.consentCheckboxChecked]}>
            {privacyConsent && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
          </View>
          <Text style={styles.consentText}>
            I agree to the{" "}
            <Text style={styles.consentLink} onPress={() => router.push("/privacy-policy")}>
              Privacy Policy
            </Text>
            {" "}and consent to The 147 processing my personal data to manage my account. You can delete your account and all data at any time.
          </Text>
        </Pressable>
      )}

      <Pressable
        onPress={mode === "login" ? handleLogin : handleRegister}
        disabled={loading}
        style={({ pressed }) => [styles.submitButton, { opacity: pressed || loading ? 0.7 : 1 }]}
        testID="auth-submit"
      >
        {loading ? (
          <ActivityIndicator color="#FFFFFF" size="small" />
        ) : (
          <Text style={styles.submitButtonText}>
            {mode === "login" ? "Sign In" : "Create Account"}
          </Text>
        )}
      </Pressable>

      <Pressable
        onPress={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}
        style={styles.switchMode}
      >
        <Text style={styles.switchModeText}>
          {mode === "login" ? "Don't have an account? " : "Already have an account? "}
          <Text style={styles.switchModeLink}>
            {mode === "login" ? "Sign Up" : "Sign In"}
          </Text>
        </Text>
      </Pressable>
    </ScrollView>
  );
}

function LoggedInView({ customer, logout, updateProfile, deleteAccount }: {
  customer: { id: number; name: string; email: string; phone: string | null };
  logout: () => Promise<void>;
  updateProfile: (data: { name?: string; phone?: string }) => Promise<{ success: boolean; error?: string }>;
  deleteAccount: () => Promise<{ success: boolean; error?: string }>;
}) {
  const [editingProfile, setEditingProfile] = useState(false);
  const [editName, setEditName] = useState(customer.name);
  const [editPhone, setEditPhone] = useState(customer.phone || "");
  const [saving, setSaving] = useState(false);

  const bookingsQuery = useQuery<CustomerBooking[]>({
    queryKey: ["/api/customers/bookings"],
    queryFn: async () => {
      const baseUrl = getApiUrl();
      const url = new URL("/api/customers/bookings", baseUrl);
      const token = await getCustomerToken();
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load bookings");
      return res.json();
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (bookingId: number) => {
      const baseUrl = getApiUrl();
      const url = new URL(`/api/customers/bookings/${bookingId}/cancel`, baseUrl);
      const token = await getCustomerToken();
      const res = await fetch(url.toString(), {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Cancel failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers/bookings"] });
    },
    onError: (err: Error) => {
      const msg = err.message || "Failed to cancel booking";
      if (Platform.OS === "web") window.alert(msg);
      else Alert.alert("Error", msg);
    },
  });

  const handleCancelBooking = (bookingId: number) => {
    if (Platform.OS === "web") {
      if (window.confirm("Are you sure you want to cancel this booking?")) {
        cancelMutation.mutate(bookingId);
      }
    } else {
      Alert.alert("Cancel Booking", "Are you sure you want to cancel this booking?", [
        { text: "No", style: "cancel" },
        { text: "Yes, Cancel", style: "destructive", onPress: () => cancelMutation.mutate(bookingId) },
      ]);
    }
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    const result = await updateProfile({ name: editName.trim(), phone: editPhone.trim() });
    setSaving(false);
    if (result.success) {
      setEditingProfile(false);
    } else {
      const msg = result.error || "Update failed";
      if (Platform.OS === "web") window.alert(msg);
      else Alert.alert("Error", msg);
    }
  };

  const handleLogout = async () => {
    await logout();
    queryClient.removeQueries({ queryKey: ["/api/customers/bookings"] });
  };

  const today = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; })();
  const upcomingBookings = (bookingsQuery.data || [])
    .filter((b) => b.date >= today && b.status === "confirmed")
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
  const pastBookings = (bookingsQuery.data || [])
    .filter((b) => b.date < today || b.status === "cancelled")
    .sort((a, b) => b.date.localeCompare(a.date));

  return (
    <ScrollView
      style={styles.scrollContent}
      contentContainerStyle={styles.scrollInner}
      refreshControl={
        <RefreshControl refreshing={bookingsQuery.isRefetching} onRefresh={() => bookingsQuery.refetch()} />
      }
    >
      <View style={styles.profileCard}>
        <View style={styles.profileRow}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>{customer.name.charAt(0).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            {editingProfile ? (
              <>
                <TextInput
                  style={[styles.input, { marginBottom: 8 }]}
                  value={editName}
                  onChangeText={setEditName}
                  placeholder="Full Name"
                  placeholderTextColor="#9CA3AF"
                />
                <TextInput
                  style={[styles.input, { marginBottom: 8 }]}
                  value={editPhone}
                  onChangeText={setEditPhone}
                  placeholder="Phone Number"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="phone-pad"
                />
                <View style={styles.editActions}>
                  <Pressable
                    onPress={handleSaveProfile}
                    disabled={saving}
                    style={({ pressed }) => [styles.saveButton, { opacity: pressed || saving ? 0.7 : 1 }]}
                  >
                    <Text style={styles.saveButtonText}>{saving ? "Saving..." : "Save"}</Text>
                  </Pressable>
                  <Pressable onPress={() => { setEditingProfile(false); setEditName(customer.name); setEditPhone(customer.phone || ""); }} style={styles.cancelEditButton}>
                    <Text style={styles.cancelEditText}>Cancel</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.profileName}>{customer.name}</Text>
                <Text style={styles.profileEmail}>{customer.email}</Text>
                {customer.phone ? <Text style={styles.profilePhone}>{customer.phone}</Text> : null}
              </>
            )}
          </View>
          {!editingProfile && (
            <Pressable onPress={() => setEditingProfile(true)} style={styles.editButton}>
              <Ionicons name="pencil" size={18} color={Colors.brand.blue} />
            </Pressable>
          )}
        </View>
      </View>

      <View style={styles.actionRow}>
        <Pressable
          onPress={() => { router.back(); setTimeout(() => router.push("/(tabs)/book"), 100); }}
          style={({ pressed }) => [styles.actionButton, { opacity: pressed ? 0.8 : 1 }]}
        >
          <Ionicons name="calendar" size={20} color="#FFFFFF" />
          <Text style={styles.actionButtonText}>New Booking</Text>
        </Pressable>
        <Pressable
          onPress={handleLogout}
          style={({ pressed }) => [styles.logoutButton, { opacity: pressed ? 0.8 : 1 }]}
        >
          <Ionicons name="log-out-outline" size={20} color={Colors.brand.red} />
          <Text style={[styles.actionButtonText, { color: Colors.brand.red }]}>Sign Out</Text>
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>Upcoming Bookings</Text>
      {bookingsQuery.isLoading ? (
        <ActivityIndicator color={Colors.brand.blue} style={{ marginTop: 20 }} />
      ) : upcomingBookings.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="calendar-outline" size={40} color="#9CA3AF" />
          <Text style={styles.emptyText}>No upcoming bookings</Text>
        </View>
      ) : (
        upcomingBookings.map((booking) => (
          <BookingCard key={booking.id} booking={booking} onCancel={() => handleCancelBooking(booking.id)} showCancel />
        ))
      )}

      {pastBookings.length > 0 && (
        <>
          <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Past Bookings</Text>
          {pastBookings.slice(0, 10).map((booking) => (
            <BookingCard key={booking.id} booking={booking} showCancel={false} />
          ))}
        </>
      )}

      <View style={styles.dangerZone}>
        <Text style={styles.dangerTitle}>Data & Privacy</Text>
        <Pressable
          onPress={() => router.push("/privacy-policy")}
          style={({ pressed }) => [styles.privacyLink, { opacity: pressed ? 0.7 : 1 }]}
        >
          <Ionicons name="shield-checkmark-outline" size={18} color={Colors.brand.blue} />
          <Text style={styles.privacyLinkText}>View Privacy Policy</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            const doDelete = async () => {
              const result = await deleteAccount();
              if (!result.success) {
                const msg = result.error || "Failed to delete account";
                if (Platform.OS === "web") window.alert(msg);
                else Alert.alert("Error", msg);
              }
            };
            if (Platform.OS === "web") {
              if (window.confirm("This will permanently delete your account and all associated booking data. This cannot be undone.\n\nAre you sure?")) {
                doDelete();
              }
            } else {
              Alert.alert(
                "Delete Account",
                "This will permanently delete your account and all associated booking data. This cannot be undone.",
                [
                  { text: "Cancel", style: "cancel" },
                  { text: "Delete Everything", style: "destructive", onPress: doDelete },
                ]
              );
            }
          }}
          style={({ pressed }) => [styles.deleteAccountButton, { opacity: pressed ? 0.7 : 1 }]}
          testID="delete-account"
        >
          <Ionicons name="trash-outline" size={18} color="#DC2626" />
          <Text style={styles.deleteAccountText}>Delete Account & All Data</Text>
        </Pressable>
        <Text style={styles.dangerNote}>
          This permanently removes your account, booking history, and all personal data (UK GDPR Article 17).
        </Text>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function BookingCard({ booking, onCancel, showCancel }: { booking: CustomerBooking; onCancel?: () => void; showCancel: boolean }) {
  const tableData = TABLE_TYPES.find((t) => t.id === booking.tableType);
  const tableName = tableData?.name || booking.tableType;
  const date = new Date(booking.date + "T00:00:00");
  const dateStr = date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  const isCancelled = booking.status === "cancelled";

  return (
    <View style={[styles.bookingCard, isCancelled && styles.bookingCardCancelled]}>
      <View style={styles.bookingTop}>
        <View style={styles.bookingInfo}>
          <Text style={styles.bookingTable}>{tableName}{booking.tableNumber ? ` #${booking.tableNumber}` : ""}</Text>
          <Text style={styles.bookingDate}>{dateStr} at {booking.startTime}</Text>
          <Text style={styles.bookingDuration}>{booking.duration} hour{booking.duration > 1 ? "s" : ""}</Text>
        </View>
        <View style={[styles.statusBadge, isCancelled ? styles.statusCancelled : styles.statusConfirmed]}>
          <Text style={[styles.statusText, isCancelled ? styles.statusTextCancelled : styles.statusTextConfirmed]}>
            {isCancelled ? "Cancelled" : "Confirmed"}
          </Text>
        </View>
      </View>
      {showCancel && !isCancelled && (
        <Pressable onPress={onCancel} style={({ pressed }) => [styles.cancelButton, { opacity: pressed ? 0.7 : 1 }]}>
          <Text style={styles.cancelButtonText}>Cancel Booking</Text>
        </Pressable>
      )}
    </View>
  );
}

async function getCustomerToken(): Promise<string> {
  const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
  return (await AsyncStorage.getItem("customer_session_token")) || "";
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  header: {
    backgroundColor: Colors.brand.navy,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 20,
    color: "#FFFFFF",
  },
  scrollContent: {
    flex: 1,
  },
  scrollInner: {
    padding: 20,
  },
  authIcon: {
    alignItems: "center",
    marginBottom: 16,
    marginTop: 20,
  },
  authTitle: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 24,
    color: Colors.light.text,
    textAlign: "center",
    marginBottom: 8,
  },
  authSubtitle: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 14,
    color: Colors.light.textSecondary,
    textAlign: "center",
    marginBottom: 24,
    lineHeight: 20,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FEF2F2",
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    fontFamily: "Montserrat_500Medium",
    fontSize: 13,
    color: "#DC2626",
    flex: 1,
  },
  inputLabel: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 13,
    color: Colors.light.text,
    marginBottom: 6,
    marginTop: 4,
  },
  input: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 15,
    backgroundColor: "#F3F4F6",
    borderRadius: 10,
    padding: 14,
    marginBottom: 14,
    color: Colors.light.text,
  },
  submitButton: {
    backgroundColor: Colors.brand.blue,
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginTop: 8,
  },
  submitButtonText: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 16,
    color: "#FFFFFF",
  },
  switchMode: {
    alignItems: "center",
    marginTop: 20,
    padding: 10,
  },
  switchModeText: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 14,
    color: Colors.light.textSecondary,
  },
  switchModeLink: {
    fontFamily: "Montserrat_600SemiBold",
    color: Colors.brand.blue,
  },
  profileCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  profileRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
  },
  avatarCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.brand.blue,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 22,
    color: "#FFFFFF",
  },
  profileName: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 18,
    color: Colors.light.text,
  },
  profileEmail: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 13,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  profilePhone: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 13,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  editButton: {
    padding: 8,
  },
  editActions: {
    flexDirection: "row",
    gap: 10,
  },
  saveButton: {
    backgroundColor: Colors.brand.blue,
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  saveButtonText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 14,
    color: "#FFFFFF",
  },
  cancelEditButton: {
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  cancelEditText: {
    fontFamily: "Montserrat_500Medium",
    fontSize: 14,
    color: Colors.light.textSecondary,
  },
  actionRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 24,
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.brand.blue,
    borderRadius: 12,
    padding: 14,
  },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#FEF2F2",
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  actionButtonText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 14,
    color: "#FFFFFF",
  },
  sectionTitle: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 18,
    color: Colors.light.text,
    marginBottom: 12,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 30,
    gap: 10,
  },
  emptyText: {
    fontFamily: "Montserrat_500Medium",
    fontSize: 14,
    color: Colors.light.textSecondary,
  },
  bookingCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  bookingCardCancelled: {
    opacity: 0.6,
  },
  bookingTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  bookingInfo: {
    flex: 1,
  },
  bookingTable: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 15,
    color: Colors.light.text,
  },
  bookingDate: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 13,
    color: Colors.light.textSecondary,
    marginTop: 4,
  },
  bookingDuration: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 13,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  statusBadge: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusConfirmed: {
    backgroundColor: "#DCFCE7",
  },
  statusCancelled: {
    backgroundColor: "#FEE2E2",
  },
  statusText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 12,
  },
  statusTextConfirmed: {
    color: "#16A34A",
  },
  statusTextCancelled: {
    color: "#DC2626",
  },
  cancelButton: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
    paddingTop: 12,
    alignItems: "center",
  },
  cancelButtonText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 13,
    color: Colors.brand.red,
  },
  consentRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginTop: 8,
    marginBottom: 4,
    paddingVertical: 8,
  },
  consentCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: "#D1D5DB",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  consentCheckboxChecked: {
    backgroundColor: Colors.brand.blue,
    borderColor: Colors.brand.blue,
  },
  consentText: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 12,
    color: Colors.light.textSecondary,
    flex: 1,
    lineHeight: 18,
  },
  consentLink: {
    color: Colors.brand.blue,
    fontFamily: "Montserrat_600SemiBold",
  },
  dangerZone: {
    marginTop: 32,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  dangerTitle: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 16,
    color: Colors.light.text,
    marginBottom: 12,
  },
  privacyLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: "#F0F7FF",
    borderRadius: 10,
    marginBottom: 12,
  },
  privacyLinkText: {
    fontFamily: "Montserrat_500Medium",
    fontSize: 14,
    color: Colors.brand.blue,
  },
  deleteAccountButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: "#FEF2F2",
    borderRadius: 10,
    marginBottom: 8,
  },
  deleteAccountText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 14,
    color: "#DC2626",
  },
  dangerNote: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 11,
    color: Colors.light.textSecondary,
    lineHeight: 16,
  },
});
