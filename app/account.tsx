import React, { useState, useCallback, useMemo } from "react";
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
  Modal,
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

const BOOKING_HOURS = [
  "10:00", "10:30", "11:00", "11:30", "12:00", "12:30",
  "13:00", "13:30", "14:00", "14:30", "15:00", "15:30",
  "16:00", "16:30", "17:00", "17:30", "18:00", "18:30",
  "19:00", "19:30", "20:00", "20:30", "21:00", "21:30",
  "22:00", "22:30", "23:00",
];
const ALL_DURATION_OPTIONS = [1, 2, 3, 4];
const STANDARD_DURATION_OPTIONS = [1, 2, 3];

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function parseDateLocal(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function getWeekDays(weekOffset: number) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay() + 1 + weekOffset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    return {
      date: localDateStr(d),
      label: d.toLocaleDateString("en-GB", { weekday: "short" }),
      dayNum: String(d.getDate()),
    };
  });
}

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

interface AppOrderItem {
  name: string;
  quantity: number;
  price: number;
  variationName?: string;
}

interface AppOrder {
  id: number;
  tableNote: string | null;
  itemsJson: string;
  totalPence: number;
  status: string;
  createdAt: string;
  discountLabel?: string | null;
}

export default function AccountScreen() {
  const insets = useSafeAreaInsets();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const { isAuthenticated, isLoading: authLoading, customer, login, register, logout, updateProfile, deleteAccount, resendVerificationEmail } = useCustomerAuth();

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
        <LoggedInView customer={customer} logout={logout} updateProfile={updateProfile} deleteAccount={deleteAccount} resendVerificationEmail={resendVerificationEmail} />
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

function LoggedInView({ customer, logout, updateProfile, deleteAccount, resendVerificationEmail }: {
  customer: { id: number; name: string; email: string; phone: string | null; emailVerified?: boolean };
  logout: () => Promise<void>;
  updateProfile: (data: { name?: string; phone?: string }) => Promise<{ success: boolean; error?: string }>;
  deleteAccount: () => Promise<{ success: boolean; error?: string }>;
  resendVerificationEmail: () => Promise<{ success: boolean; error?: string }>;
}) {
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent">("idle");
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const handleResend = async () => {
    setResendState("sending");
    setResendMessage(null);
    const result = await resendVerificationEmail();
    if (result.success) {
      setResendState("sent");
      setResendMessage("Verification email sent — check your inbox.");
      // Re-enable the button after the server cooldown so users can resend again if needed.
      setTimeout(() => setResendState("idle"), 60_000);
    } else {
      setResendState("idle");
      setResendMessage(result.error || "Could not send verification email");
    }
  };
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

  const ordersQuery = useQuery<AppOrder[]>({
    queryKey: ["/api/customers/orders"],
    queryFn: async () => {
      const baseUrl = getApiUrl();
      const url = new URL("/api/customers/orders", baseUrl);
      const token = await getCustomerToken();
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load orders");
      return res.json();
    },
  });

  const [reschedulingBooking, setReschedulingBooking] = useState<CustomerBooking | null>(null);

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

  const rescheduleMutation = useMutation({
    mutationFn: async ({ bookingId, date, startTime, duration }: { bookingId: number; date: string; startTime: string; duration: number }) => {
      const baseUrl = getApiUrl();
      const url = new URL(`/api/customers/bookings/${bookingId}/reschedule`, baseUrl);
      const token = await getCustomerToken();
      const res = await fetch(url.toString(), {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ date, startTime, duration }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Reschedule failed");
      }
      return res.json();
    },
    onSuccess: () => {
      setReschedulingBooking(null);
      queryClient.invalidateQueries({ queryKey: ["/api/customers/bookings"] });
      if (Platform.OS === "web") window.alert("Booking rescheduled! A confirmation email is on its way.");
      else Alert.alert("Rescheduled", "Your booking has been updated. A confirmation email is on its way.");
    },
    onError: (err: Error) => {
      const msg = err.message || "Failed to reschedule booking";
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
    <>
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

      {customer.emailVerified === false && (
        <View style={styles.verifyBanner} testID="verify-email-banner">
          <View style={styles.verifyBannerHeader}>
            <Ionicons name="mail-unread-outline" size={20} color="#92400E" />
            <Text style={styles.verifyBannerTitle}>Confirm your email</Text>
          </View>
          <Text style={styles.verifyBannerText}>
            We sent a link to {customer.email}. Click it so you can recover your bookings if you ever lose access. Bookings still work without it.
          </Text>
          {resendMessage ? (
            <Text style={[styles.verifyBannerText, { color: resendState === "sent" ? "#166534" : "#B91C1C", marginTop: 6 }]}>
              {resendMessage}
            </Text>
          ) : null}
          <Pressable
            onPress={handleResend}
            disabled={resendState !== "idle"}
            style={({ pressed }) => [styles.verifyBannerButton, { opacity: pressed || resendState !== "idle" ? 0.7 : 1 }]}
            testID="resend-verification"
          >
            <Text style={styles.verifyBannerButtonText}>
              {resendState === "sending" ? "Sending…" : resendState === "sent" ? "Email Sent" : "Resend Email"}
            </Text>
          </Pressable>
        </View>
      )}

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
          <BookingCard key={booking.id} booking={booking} onCancel={() => handleCancelBooking(booking.id)} onReschedule={() => setReschedulingBooking(booking)} showCancel />
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

      {(() => {
        const allOrders = ordersQuery.data ?? [];
        const activeOrders = allOrders.filter((o) => o.status === "pending");
        const pastOrders = allOrders.filter((o) => o.status !== "pending");
        return (
          <>
            {activeOrders.length > 0 && (
              <>
                <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Active Orders</Text>
                {activeOrders.map((order) => <OrderCard key={order.id} order={order} active />)}
              </>
            )}
            <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Order History</Text>
            {ordersQuery.isLoading ? (
              <ActivityIndicator color={Colors.brand.blue} style={{ marginTop: 20 }} />
            ) : ordersQuery.error ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>Could not load orders</Text>
              </View>
            ) : pastOrders.length === 0 && activeOrders.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="bag-outline" size={40} color="#9CA3AF" />
                <Text style={styles.emptyText}>No orders yet</Text>
                <Text style={[styles.emptyText, { fontSize: 13, marginTop: 4 }]}>Orders placed from the app appear here</Text>
              </View>
            ) : pastOrders.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>No past orders</Text>
              </View>
            ) : (
              pastOrders.map((order) => <OrderCard key={order.id} order={order} />)
            )}
          </>
        );
      })()}

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
    {reschedulingBooking && (
      <RescheduleModal
        booking={reschedulingBooking}
        onClose={() => setReschedulingBooking(null)}
        onConfirm={(date, startTime, duration) => {
          rescheduleMutation.mutate({ bookingId: reschedulingBooking.id, date, startTime, duration });
        }}
        loading={rescheduleMutation.isPending}
      />
    )}
    </>
  );
}

function BookingCard({ booking, onCancel, onReschedule, showCancel }: { booking: CustomerBooking; onCancel?: () => void; onReschedule?: () => void; showCancel: boolean }) {
  const tableData = TABLE_TYPES.find((t) => t.id === booking.tableType);
  const tableName = tableData?.name || booking.tableType;
  const [dy, dm, dd] = booking.date.split("-").map(Number);
  const date = new Date(dy, dm - 1, dd);
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
        <View style={styles.bookingActions}>
          {onReschedule && (
            <Pressable onPress={onReschedule} style={({ pressed }) => [styles.rescheduleButton, { opacity: pressed ? 0.7 : 1 }]}>
              <Ionicons name="calendar-outline" size={14} color={Colors.brand.blue} style={{ marginRight: 4 }} />
              <Text style={styles.rescheduleButtonText}>Reschedule</Text>
            </Pressable>
          )}
          <Pressable onPress={onCancel} style={({ pressed }) => [styles.cancelButton, { opacity: pressed ? 0.7 : 1, flex: 1 }]}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function OrderCard({ order, active }: { order: AppOrder; active?: boolean }) {
  const date = new Date(order.createdAt);
  const dateStr = date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const timeStr = date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const total = `£${(order.totalPence / 100).toFixed(2)}`;
  let items: AppOrderItem[] = [];
  try { items = JSON.parse(order.itemsJson); } catch {}

  const statusConfig: Record<string, { label: string; bg: string; text: string }> = {
    pending:   { label: "Awaiting Payment", bg: "#FEF3C7", text: "#92400E" },
    paid:      { label: "Paid",             bg: "#D1FAE5", text: "#065F46" },
    cancelled: { label: "Cancelled",        bg: "#FEE2E2", text: "#991B1B" },
    refunded:  { label: "Refunded",         bg: "#FEF3C7", text: "#92400E" },
  };
  const sc = statusConfig[order.status] ?? statusConfig.pending;

  return (
    <View style={[styles.bookingCard, active && styles.activeOrderCard]}>
      {active && (
        <View style={styles.activeOrderBanner}>
          <Ionicons name="time-outline" size={13} color="#92400E" style={{ marginRight: 5 }} />
          <Text style={styles.activeOrderBannerText}>Order pending — complete payment to confirm</Text>
        </View>
      )}
      <View style={styles.bookingTop}>
        <View style={styles.bookingInfo}>
          <Text style={styles.bookingTable}>{order.tableNote || "No table"}</Text>
          <Text style={styles.bookingDate}>{dateStr} at {timeStr}</Text>
          {items.length > 0 && (
            <View style={{ marginTop: 6, gap: 2 }}>
              {items.map((item, idx) => (
                <Text key={idx} style={styles.orderItemRow} numberOfLines={1}>
                  {item.quantity}× {item.name}
                  {item.variationName ? ` (${item.variationName})` : ""}
                </Text>
              ))}
            </View>
          )}
        </View>
        <View style={{ alignItems: "flex-end", gap: 6 }}>
          <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
            <Text style={[styles.statusText, { color: sc.text }]}>{sc.label}</Text>
          </View>
          <Text style={{ fontWeight: "700" as const, fontSize: 15, color: Colors.light.text }}>{total}</Text>
        </View>
      </View>
      {order.discountLabel && (
        <View style={styles.orderDiscountRow}>
          <Ionicons name="pricetag-outline" size={12} color="#065F46" style={{ marginRight: 4 }} />
          <Text style={styles.orderDiscountText}>{order.discountLabel}</Text>
        </View>
      )}
    </View>
  );
}

function RescheduleModal({ booking, onClose, onConfirm, loading }: {
  booking: CustomerBooking;
  onClose: () => void;
  onConfirm: (date: string, startTime: string, duration: number) => void;
  loading: boolean;
}) {
  const insets = useSafeAreaInsets();
  const [weekOffset, setWeekOffset] = useState(0);
  const today = localDateStr(new Date());
  const [selectedDate, setSelectedDate] = useState(booking.date >= today ? booking.date : today);
  const [duration, setDuration] = useState(booking.duration);
  const [selectedTime, setSelectedTime] = useState<string | null>(booking.startTime);

  const isDining = booking.tableType === "dining";
  const isSnooker = booking.tableType === "snooker";
  const tableNumber = booking.tableNumber ?? undefined;
  const needsTableNumber = (booking.tableType === "snooker" || booking.tableType === "pool") && tableNumber;

  const availabilityQs = needsTableNumber
    ? `?date=${selectedDate}&tableType=${booking.tableType}&tableNumber=${tableNumber}&excludeId=${booking.id}`
    : `?date=${selectedDate}&tableType=${booking.tableType}&excludeId=${booking.id}`;

  const availabilityQuery = useQuery<{ slots: Array<{ startTime: string; duration: number }>; totalTables: number }>({
    queryKey: ["/api/bookings/availability/reschedule", availabilityQs],
    queryFn: async () => {
      const baseUrl = getApiUrl();
      const url = new URL(`/api/bookings/availability${availabilityQs}`, baseUrl);
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error("Failed to load availability");
      return res.json();
    },
    enabled: !!selectedDate,
  });

  const bookedSlots = availabilityQuery.data?.slots ?? [];
  const totalTables = availabilityQuery.data?.totalTables ?? 1;

  const days = useMemo(() => getWeekDays(weekOffset), [weekOffset]);

  const isSlotBooked = (time: string, dur: number) => {
    const reqStart = parseInt(time.replace(":", ""));
    const reqEnd = reqStart + dur * 100;
    if (isDining) {
      let count = 0;
      for (const slot of bookedSlots) {
        const s = parseInt(slot.startTime.replace(":", ""));
        const e = s + slot.duration * 100;
        if (reqStart < e && reqEnd > s) count++;
      }
      return count >= totalTables;
    }
    for (const slot of bookedSlots) {
      const s = parseInt(slot.startTime.replace(":", ""));
      const e = s + slot.duration * 100;
      if (reqStart < e && reqEnd > s) return true;
    }
    return false;
  };

  const tableData = TABLE_TYPES.find((t) => t.id === booking.tableType);
  const tableName = tableData?.name || booking.tableType;
  const tableNum = booking.tableNumber ? ` #${booking.tableNumber}` : "";
  const durations = isSnooker ? ALL_DURATION_OPTIONS : STANDARD_DURATION_OPTIONS;

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: Colors.light.background }}>
        <View style={[rStyles.header, { paddingTop: insets.top + (Platform.OS === "web" ? 20 : 0) }]}>
          <Pressable onPress={onClose} style={rStyles.closeBtn}>
            <Ionicons name="close" size={22} color="#fff" />
          </Pressable>
          <Text style={rStyles.headerTitle}>Reschedule</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}>
          <View style={rStyles.currentCard}>
            <Text style={rStyles.currentLabel}>Current booking</Text>
            <Text style={rStyles.currentDetail}>{tableName}{tableNum} · {booking.startTime} · {booking.duration}hr{booking.duration > 1 ? "s" : ""}</Text>
          </View>

          <Text style={rStyles.sectionLabel}>Select new date</Text>
          <View style={rStyles.weekNav}>
            <Pressable onPress={() => setWeekOffset(Math.max(0, weekOffset - 1))} style={rStyles.weekBtn} disabled={weekOffset === 0}>
              <Ionicons name="chevron-back" size={18} color={weekOffset === 0 ? "#CBD5E1" : Colors.brand.blue} />
            </Pressable>
            <Text style={rStyles.weekLabel}>
              {days[0].label} {days[0].dayNum} – {days[6].label} {days[6].dayNum}
            </Text>
            <Pressable onPress={() => setWeekOffset(Math.min(26, weekOffset + 1))} style={rStyles.weekBtn}>
              <Ionicons name="chevron-forward" size={18} color={Colors.brand.blue} />
            </Pressable>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
            {days.map((day) => {
              const isPast = day.date < today;
              const isSelected = day.date === selectedDate;
              return (
                <Pressable
                  key={day.date}
                  disabled={isPast}
                  onPress={() => { setSelectedDate(day.date); setSelectedTime(null); }}
                  style={[rStyles.dayChip, isSelected && rStyles.dayChipSelected, isPast && rStyles.dayChipDisabled]}
                >
                  <Text style={[rStyles.dayLabel, isSelected && rStyles.dayLabelSelected, isPast && rStyles.dayTextDisabled]}>{day.label}</Text>
                  <Text style={[rStyles.dayNum, isSelected && rStyles.dayNumSelected, isPast && rStyles.dayTextDisabled]}>{day.dayNum}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <Text style={rStyles.sectionLabel}>Duration</Text>
          <View style={rStyles.chipRow}>
            {durations.map((d) => (
              <Pressable
                key={d}
                onPress={() => { setDuration(d); setSelectedTime(null); }}
                style={[rStyles.chip, duration === d && rStyles.chipSelected]}
              >
                <Text style={[rStyles.chipText, duration === d && rStyles.chipTextSelected]}>{d}hr{d > 1 ? "s" : ""}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={rStyles.sectionLabel}>Select time</Text>
          {availabilityQuery.isLoading ? (
            <ActivityIndicator color={Colors.brand.blue} style={{ marginVertical: 16 }} />
          ) : (
            <View style={rStyles.timeGrid}>
              {BOOKING_HOURS.filter((time) => {
                const [h, m] = time.split(":").map(Number);
                const mins = h * 60 + m;
                if (isDining) {
                  const end = mins + duration * 60;
                  if (mins < 720 || end > 1200) return false;
                }
                if (selectedDate === today) {
                  const now = new Date();
                  return mins > now.getHours() * 60 + now.getMinutes() + 60;
                }
                return !isDining || (h * 60 + m + duration * 60 <= 24 * 60);
              }).map((time) => {
                const booked = isSlotBooked(time, duration);
                const isSelected = selectedTime === time;
                const [tH, tM] = time.split(":").map(Number);
                const tooLate = !isDining && tH * 60 + tM + duration * 60 > 24 * 60;
                const disabled = booked || tooLate;
                return (
                  <Pressable
                    key={time}
                    onPress={() => { if (!disabled) setSelectedTime(time); }}
                    disabled={disabled}
                    style={[rStyles.timeChip, isSelected && rStyles.timeChipSelected, disabled && rStyles.timeChipDisabled]}
                  >
                    <Text style={[rStyles.timeText, isSelected && rStyles.timeTextSelected, disabled && rStyles.timeTextDisabled]}>{time}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          <Pressable
            onPress={() => { if (selectedTime) onConfirm(selectedDate, selectedTime, duration); }}
            disabled={!selectedTime || loading}
            style={({ pressed }) => [rStyles.confirmBtn, (!selectedTime || loading) && { opacity: 0.5 }, pressed && { opacity: 0.8 }]}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={rStyles.confirmBtnText}>
                {selectedTime ? `Confirm — ${selectedTime} · ${duration}hr${duration > 1 ? "s" : ""}` : "Pick a time to confirm"}
              </Text>
            )}
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

const rStyles = StyleSheet.create({
  header: { backgroundColor: Colors.brand.navy, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 14 },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 17, fontWeight: "700" as const, color: "#fff" },
  currentCard: { backgroundColor: "#EFF6FF", borderRadius: 10, padding: 14, marginBottom: 24, borderLeftWidth: 3, borderLeftColor: Colors.brand.blue },
  currentLabel: { fontSize: 11, fontWeight: "600" as const, color: "#6B7280", textTransform: "uppercase" as const, letterSpacing: 0.5, marginBottom: 4 },
  currentDetail: { fontSize: 14, fontWeight: "600" as const, color: Colors.brand.navy },
  sectionLabel: { fontSize: 13, fontWeight: "700" as const, color: "#374151", marginBottom: 12, textTransform: "uppercase" as const, letterSpacing: 0.5 },
  weekNav: { flexDirection: "row" as const, alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  weekBtn: { padding: 6 },
  weekLabel: { fontSize: 13, fontWeight: "600" as const, color: "#374151" },
  dayChip: { width: 48, alignItems: "center", paddingVertical: 10, marginRight: 8, borderRadius: 10, backgroundColor: "#F1F5F9", borderWidth: 1.5, borderColor: "transparent" },
  dayChipSelected: { backgroundColor: Colors.brand.blue, borderColor: Colors.brand.blue },
  dayChipDisabled: { opacity: 0.35 },
  dayLabel: { fontSize: 11, fontWeight: "600" as const, color: "#64748B" },
  dayLabelSelected: { color: "#fff" },
  dayNum: { fontSize: 16, fontWeight: "800" as const, color: "#1E293B", marginTop: 2 },
  dayNumSelected: { color: "#fff" },
  dayTextDisabled: { color: "#94A3B8" },
  chipRow: { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: 8, marginBottom: 24 },
  chip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, backgroundColor: "#F1F5F9", borderWidth: 1.5, borderColor: "transparent" },
  chipSelected: { backgroundColor: Colors.brand.blue, borderColor: Colors.brand.blue },
  chipText: { fontSize: 13, fontWeight: "600" as const, color: "#374151" },
  chipTextSelected: { color: "#fff" },
  timeGrid: { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: 8, marginBottom: 28 },
  timeChip: { width: 72, paddingVertical: 10, alignItems: "center", borderRadius: 8, backgroundColor: "#F1F5F9", borderWidth: 1.5, borderColor: "transparent" },
  timeChipSelected: { backgroundColor: Colors.brand.blue, borderColor: Colors.brand.blue },
  timeChipDisabled: { opacity: 0.35 },
  timeText: { fontSize: 13, fontWeight: "600" as const, color: "#374151" },
  timeTextSelected: { color: "#fff" },
  timeTextDisabled: { color: "#94A3B8" },
  confirmBtn: { backgroundColor: Colors.brand.navy, borderRadius: 12, paddingVertical: 16, alignItems: "center" as const },
  confirmBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" as const },
});

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
  verifyBanner: {
    backgroundColor: "#FFFBEB",
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#FCD34D",
    padding: 14,
    marginBottom: 16,
  },
  verifyBannerHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  verifyBannerTitle: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 14,
    color: "#92400E",
  },
  verifyBannerText: {
    fontFamily: "Montserrat_500Medium",
    fontSize: 13,
    color: "#92400E",
    lineHeight: 18,
  },
  verifyBannerButton: {
    marginTop: 10,
    alignSelf: "flex-start",
    backgroundColor: "#92400E",
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 16,
  },
  verifyBannerButtonText: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 13,
    color: "#FFFFFF",
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
  bookingActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
    paddingTop: 12,
  },
  rescheduleButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: Colors.brand.blue,
  },
  rescheduleButtonText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 13,
    color: Colors.brand.blue,
  },
  cancelButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#FEF2F2",
  },
  cancelButtonText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 13,
    color: Colors.brand.red,
  },
  activeOrderCard: {
    borderLeftWidth: 3,
    borderLeftColor: "#D97706",
    backgroundColor: "#FFFBEB",
  },
  activeOrderBanner: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    backgroundColor: "#FEF3C7",
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  activeOrderBannerText: {
    fontSize: 12,
    fontFamily: "Montserrat_600SemiBold",
    color: "#92400E",
    flex: 1,
  },
  orderItemRow: {
    fontSize: 12,
    fontFamily: "Montserrat_400Regular",
    color: "#6B7280",
  },
  orderDiscountRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  orderDiscountText: {
    fontSize: 12,
    fontFamily: "Montserrat_600SemiBold",
    color: "#065F46",
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
