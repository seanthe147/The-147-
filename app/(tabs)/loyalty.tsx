import React, { useState, useCallback, useEffect, useRef, useContext } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Platform,
  TextInput,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BottomTabBarHeightContext } from "@react-navigation/bottom-tabs";
import { LinearGradient } from "expo-linear-gradient";
import { useQuery, useMutation } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";

const API_BASE = process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}` : "";
const SESSION_KEY = "loyalty_session";

interface LoyaltyAccount {
  id: string;
  balance: number;
  lifetime_points: number;
  enrolled_at: string;
  phone: string;
}

interface RewardTier {
  id: string;
  name: string;
  points: number;
  definition: { discount_type?: string; percentage_discount?: string; fixed_discount_money?: { amount: number; currency: string } };
}

interface LoyaltyProgram {
  id: string;
  terminology: { one: string; other: string };
  reward_tiers: RewardTier[];
  accrual_rules: { accrual_type: string; points: number; spend_data?: { amount: number; currency: string } }[];
}

type AuthStep = "loading" | "phone" | "code" | "authenticated";

function PointsDisplay({ balance, terminology }: { balance: number; terminology?: { one: string; other: string } }) {
  const label = terminology ? (balance === 1 ? terminology.one : terminology.other) : "Points";
  return (
    <View style={styles.pointsContainer}>
      <LinearGradient
        colors={[Colors.brand.gold, "#B8860B"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.pointsGradient}
      >
        <Ionicons name="star" size={32} color="#FFF" />
        <Text style={styles.pointsValue}>{balance}</Text>
        <Text style={styles.pointsLabel}>{label}</Text>
      </LinearGradient>
    </View>
  );
}

function RewardTierCard({
  tier,
  balance,
  terminology,
}: {
  tier: RewardTier;
  balance: number;
  terminology?: { one: string; other: string };
}) {
  const canRedeem = balance >= tier.points;
  const progress = Math.min(balance / tier.points, 1);
  const pointsLabel = terminology ? terminology.other : "points";

  return (
    <View style={[styles.tierCard, canRedeem && styles.tierCardRedeemable]}>
      <View style={styles.tierHeader}>
        <Ionicons
          name={canRedeem ? "gift" : "gift-outline"}
          size={24}
          color={canRedeem ? Colors.brand.gold : Colors.light.textSecondary}
        />
        <View style={styles.tierInfo}>
          <Text style={styles.tierName}>{tier.name}</Text>
          <Text style={styles.tierPoints}>
            {tier.points} {pointsLabel}
          </Text>
        </View>
        {canRedeem && (
          <View style={styles.redeemBadge}>
            <Text style={styles.redeemBadgeText}>Ready!</Text>
          </View>
        )}
      </View>
      <View style={styles.progressBarBg}>
        <View style={[styles.progressBarFill, { width: `${progress * 100}%` }]} />
      </View>
      <Text style={styles.progressText}>
        {canRedeem ? "You have enough points!" : `${tier.points - balance} more ${pointsLabel} needed`}
      </Text>
    </View>
  );
}

function CodeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const inputRef = useRef<TextInput>(null);

  return (
    <Pressable onPress={() => inputRef.current?.focus()} style={styles.codeInputContainer}>
      <View style={styles.codeBoxRow}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <View key={i} style={[styles.codeBox, value.length === i && styles.codeBoxActive]}>
            <Text style={styles.codeDigit}>{value[i] || ""}</Text>
          </View>
        ))}
      </View>
      <TextInput
        ref={inputRef}
        style={styles.hiddenInput}
        value={value}
        onChangeText={(t) => onChange(t.replace(/\D/g, "").slice(0, 6))}
        keyboardType="number-pad"
        maxLength={6}
        autoFocus
        textContentType="oneTimeCode"
      />
    </Pressable>
  );
}

export default function LoyaltyScreen() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0;

  const [step, setStep] = useState<AuthStep>("loading");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [account, setAccount] = useState<LoyaltyAccount | null>(null);
  const [lookupDone, setLookupDone] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(SESSION_KEY);
        if (stored) {
          const { token, phone: storedPhone } = JSON.parse(stored);
          const res = await fetch(`${API_BASE}/api/loyalty/session`, {
            headers: { "x-loyalty-session": token },
          });
          const data = await res.json();
          if (data.valid) {
            setSessionToken(token);
            setPhone(storedPhone);
            setStep("authenticated");
            return;
          }
          await AsyncStorage.removeItem(SESSION_KEY);
        }
      } catch {}
      setStep("phone");
    })();
  }, []);

  const { data: programData, isLoading: programLoading } = useQuery({
    queryKey: ["loyalty-program"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/loyalty/program`);
      if (!res.ok) throw new Error("Failed to load loyalty program");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const sendCodeMutation = useMutation({
    mutationFn: async ({ emailAddr, phoneNumber }: { emailAddr: string; phoneNumber: string }) => {
      const res = await fetch(`${API_BASE}/api/loyalty/send-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailAddr, phone: phoneNumber }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to send code");
      return data;
    },
    onSuccess: () => {
      setError("");
      setCode("");
      setStep("code");
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (err: Error) => setError(err.message),
  });

  const verifyCodeMutation = useMutation({
    mutationFn: async ({ emailAddr, phoneNumber, otp }: { emailAddr: string; phoneNumber: string; otp: string }) => {
      const res = await fetch(`${API_BASE}/api/loyalty/verify-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailAddr, phone: phoneNumber, code: otp }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Verification failed");
      return data;
    },
    onSuccess: async (data) => {
      setSessionToken(data.sessionToken);
      await AsyncStorage.setItem(SESSION_KEY, JSON.stringify({ token: data.sessionToken, phone: phone.replace(/\s/g, "") }));
      setError("");
      setStep("authenticated");
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (err: Error) => setError(err.message),
  });

  const lookupMutation = useMutation({
    mutationFn: async (token: string) => {
      const res = await fetch(`${API_BASE}/api/loyalty/lookup`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-loyalty-session": token },
      });
      if (res.status === 401) {
        await AsyncStorage.removeItem(SESSION_KEY);
        setSessionToken(null);
        setStep("phone");
        throw new Error("Session expired. Please verify your phone number again.");
      }
      if (!res.ok) throw new Error("Failed to look up account");
      return res.json();
    },
    onSuccess: (data) => {
      setLookupDone(true);
      setAccount(data.found ? data.account : null);
    },
  });

  const enrollMutation = useMutation({
    mutationFn: async (token: string) => {
      const res = await fetch(`${API_BASE}/api/loyalty/enroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-loyalty-session": token },
      });
      if (res.status === 401) {
        await AsyncStorage.removeItem(SESSION_KEY);
        setSessionToken(null);
        setStep("phone");
        throw new Error("Session expired. Please verify your phone number again.");
      }
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || "Failed to enroll");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setAccount(data.account);
      setLookupDone(true);
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  useEffect(() => {
    if (step === "authenticated" && sessionToken && !lookupDone) {
      lookupMutation.mutate(sessionToken);
    }
  }, [step, sessionToken]);

  const handleSendCode = useCallback(() => {
    const emailTrimmed = email.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailTrimmed)) {
      const msg = "Please enter a valid email address";
      if (Platform.OS === "web") window.alert(msg);
      else Alert.alert("Invalid Email", msg);
      return;
    }
    const phoneCleaned = phone.replace(/\s/g, "");
    if (phoneCleaned.length < 10) {
      const msg = "Please enter a valid UK phone number";
      if (Platform.OS === "web") window.alert(msg);
      else Alert.alert("Invalid Number", msg);
      return;
    }
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setError("");
    sendCodeMutation.mutate({ emailAddr: emailTrimmed, phoneNumber: phoneCleaned });
  }, [email, phone]);

  const handleVerifyCode = useCallback(() => {
    if (code.length !== 6) return;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setError("");
    verifyCodeMutation.mutate({ emailAddr: email.trim(), phoneNumber: phone.replace(/\s/g, ""), otp: code });
  }, [email, phone, code]);

  const handleEnroll = useCallback(() => {
    if (!sessionToken) return;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    enrollMutation.mutate(sessionToken);
  }, [sessionToken]);

  const handleRefresh = useCallback(() => {
    if (sessionToken) {
      setLookupDone(false);
      lookupMutation.mutate(sessionToken);
    }
  }, [sessionToken]);

  const handleLogout = useCallback(async () => {
    if (sessionToken) {
      try {
        await fetch(`${API_BASE}/api/loyalty/logout`, {
          method: "POST",
          headers: { "x-loyalty-session": sessionToken },
        });
      } catch {}
    }
    await AsyncStorage.removeItem(SESSION_KEY);
    setSessionToken(null);
    setAccount(null);
    setLookupDone(false);
    setEmail("");
    setPhone("");
    setCode("");
    setError("");
    setStep("phone");
  }, [sessionToken]);

  const handleBackToPhone = useCallback(() => {
    setStep("phone");
    setCode("");
    setError("");
  }, []);

  const program: LoyaltyProgram | null = programData?.program || null;
  const programActive = programData?.active === true;
  const isLoading = sendCodeMutation.isPending || verifyCodeMutation.isPending || lookupMutation.isPending || enrollMutation.isPending;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.content,
          { paddingTop: (isWeb ? 67 : insets.top) + 16, paddingBottom: tabBarHeight + 20 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <LinearGradient
          colors={[Colors.brand.dark, Colors.brand.navy]}
          style={styles.headerGradient}
        >
          <Ionicons name="diamond" size={28} color={Colors.brand.gold} />
          <Text style={styles.headerTitle}>Loyalty Rewards</Text>
          <Text style={styles.headerSubtitle}>
            Earn points every time you visit The 147
          </Text>
        </LinearGradient>

        {(programLoading || step === "loading") ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={Colors.brand.blue} />
            <Text style={styles.loadingText}>Loading loyalty program...</Text>
          </View>
        ) : !programData?.configured ? (
          <View style={styles.statusCard}>
            <Ionicons name="alert-circle-outline" size={40} color={Colors.light.textSecondary} />
            <Text style={styles.statusTitle}>Coming Soon</Text>
            <Text style={styles.statusText}>
              Our loyalty rewards program is being set up. Check back soon!
            </Text>
          </View>
        ) : !programActive ? (
          <View style={styles.statusCard}>
            <Ionicons name="time-outline" size={40} color={Colors.brand.gold} />
            <Text style={styles.statusTitle}>Program Setup In Progress</Text>
            <Text style={styles.statusText}>
              Our loyalty rewards program is almost ready. We'll let you know when you can start earning points!
            </Text>
          </View>
        ) : step === "phone" ? (
          <>
            {program?.accrual_rules && program.accrual_rules.length > 0 && (
              <View style={styles.howItWorksCard}>
                <Text style={styles.sectionTitle}>How It Works</Text>
                {program.accrual_rules.map((rule, i) => (
                  <View key={i} style={styles.ruleRow}>
                    <Ionicons name="add-circle" size={20} color={Colors.brand.blue} />
                    <Text style={styles.ruleText}>
                      {rule.accrual_type === "SPEND"
                        ? `Earn ${rule.points} ${program.terminology?.other || "points"} for every £${((rule.spend_data?.amount || 100) / 100).toFixed(0)} spent`
                        : rule.accrual_type === "VISIT"
                        ? `Earn ${rule.points} ${program.terminology?.other || "points"} per visit`
                        : `Earn ${rule.points} ${program.terminology?.other || "points"}`}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            <View style={styles.lookupCard}>
              <View style={styles.lockIconRow}>
                <Ionicons name="shield-checkmark" size={24} color={Colors.brand.blue} />
              </View>
              <Text style={styles.sectionTitle}>Verify Your Identity</Text>
              <Text style={styles.lookupDescription}>
                Enter your details below. We'll email you a verification code to access your loyalty account.
              </Text>

              <View style={styles.inputRow}>
                <View style={styles.inputWrap}>
                  <Ionicons name="mail-outline" size={18} color={Colors.light.textSecondary} style={styles.inputIcon} />
                  <TextInput
                    style={styles.phoneInput}
                    placeholder="your@email.com"
                    placeholderTextColor={Colors.light.textSecondary}
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoComplete="email"
                    autoCapitalize="none"
                    maxLength={100}
                  />
                </View>
              </View>

              <View style={[styles.inputRow, { marginTop: 12 }]}>
                <View style={styles.inputWrap}>
                  <Ionicons name="call-outline" size={18} color={Colors.light.textSecondary} style={styles.inputIcon} />
                  <TextInput
                    style={styles.phoneInput}
                    placeholder="07xxx xxxxxx"
                    placeholderTextColor={Colors.light.textSecondary}
                    value={phone}
                    onChangeText={setPhone}
                    keyboardType="phone-pad"
                    autoComplete="tel"
                    maxLength={15}
                  />
                </View>
              </View>

              <Text style={styles.fieldHint}>
                Your phone number is used to find your loyalty account on our system.
              </Text>

              <Pressable
                onPress={handleSendCode}
                disabled={isLoading || !email.trim() || phone.replace(/\s/g, "").length < 10}
                style={({ pressed }) => [
                  styles.lookupButton,
                  (isLoading || !email.trim() || phone.replace(/\s/g, "").length < 10) && styles.buttonDisabled,
                  { opacity: pressed ? 0.85 : 1 },
                ]}
              >
                {sendCodeMutation.isPending ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <>
                    <Ionicons name="mail" size={18} color="#FFF" />
                    <Text style={styles.buttonText}>Send Verification Code</Text>
                  </>
                )}
              </Pressable>

              {error ? <Text style={styles.errorText}>{error}</Text> : null}
            </View>
          </>
        ) : step === "code" ? (
          <View style={styles.lookupCard}>
            <View style={styles.lockIconRow}>
              <Ionicons name="keypad" size={28} color={Colors.brand.blue} />
            </View>
            <Text style={styles.sectionTitle}>Enter Verification Code</Text>
            <Text style={styles.lookupDescription}>
              We've sent a 6-digit code to {email.trim()}. Check your inbox and enter it below.
            </Text>

            <CodeInput value={code} onChange={setCode} />

            <Pressable
              onPress={handleVerifyCode}
              disabled={isLoading || code.length !== 6}
              style={({ pressed }) => [
                styles.lookupButton,
                (isLoading || code.length !== 6) && styles.buttonDisabled,
                { opacity: pressed ? 0.85 : 1, marginTop: 16 },
              ]}
            >
              {verifyCodeMutation.isPending ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={18} color="#FFF" />
                  <Text style={styles.buttonText}>Verify</Text>
                </>
              )}
            </Pressable>

            <View style={styles.codeActions}>
              <Pressable onPress={handleBackToPhone} style={styles.linkButton}>
                <Ionicons name="arrow-back" size={16} color={Colors.brand.blue} />
                <Text style={styles.linkButtonText}>Change Details</Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  setError("");
                  sendCodeMutation.mutate({ emailAddr: email.trim(), phoneNumber: phone.replace(/\s/g, "") });
                }}
                disabled={sendCodeMutation.isPending}
                style={styles.linkButton}
              >
                <Ionicons name="refresh" size={16} color={Colors.brand.blue} />
                <Text style={styles.linkButtonText}>Resend Code</Text>
              </Pressable>
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}
          </View>
        ) : (
          <>
            {!account && !lookupDone ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator size="large" color={Colors.brand.blue} />
                <Text style={styles.loadingText}>Loading your account...</Text>
              </View>
            ) : !account && lookupDone ? (
              <View style={styles.lookupCard}>
                <View style={styles.lockIconRow}>
                  <Ionicons name="person-add" size={28} color={Colors.brand.gold} />
                </View>
                <Text style={styles.sectionTitle}>No Account Found</Text>
                <Text style={styles.lookupDescription}>
                  We couldn't find a loyalty account linked to your number. Would you like to sign up for rewards?
                </Text>

                <Pressable
                  onPress={handleEnroll}
                  disabled={isLoading}
                  style={({ pressed }) => [
                    styles.enrollButton,
                    isLoading && styles.buttonDisabled,
                    { opacity: pressed ? 0.85 : 1 },
                  ]}
                >
                  {enrollMutation.isPending ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <>
                      <Ionicons name="person-add" size={18} color="#FFF" />
                      <Text style={styles.buttonText}>Sign Up for Rewards</Text>
                    </>
                  )}
                </Pressable>

                {(lookupMutation.isError || enrollMutation.isError) && (
                  <Text style={styles.errorText}>
                    {(lookupMutation.error || enrollMutation.error)?.message || "Something went wrong."}
                  </Text>
                )}
              </View>
            ) : account ? (
              <>
                <PointsDisplay balance={account.balance} terminology={program?.terminology} />

                <View style={styles.statsRow}>
                  <View style={styles.statCard}>
                    <Ionicons name="trophy-outline" size={20} color={Colors.brand.gold} />
                    <Text style={styles.statValue}>{account.lifetime_points}</Text>
                    <Text style={styles.statLabel}>Lifetime {program?.terminology?.other || "Points"}</Text>
                  </View>
                  <View style={styles.statCard}>
                    <Ionicons name="calendar-outline" size={20} color={Colors.brand.blue} />
                    <Text style={styles.statValue}>
                      {new Date(account.enrolled_at).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}
                    </Text>
                    <Text style={styles.statLabel}>Member Since</Text>
                  </View>
                </View>

                {program?.reward_tiers && program.reward_tiers.length > 0 && (
                  <View style={styles.rewardsSection}>
                    <Text style={styles.sectionTitle}>Available Rewards</Text>
                    {program.reward_tiers
                      .sort((a, b) => a.points - b.points)
                      .map((tier) => (
                        <RewardTierCard
                          key={tier.id}
                          tier={tier}
                          balance={account.balance}
                          terminology={program?.terminology}
                        />
                      ))}
                  </View>
                )}

                <View style={styles.actionRow}>
                  <Pressable
                    onPress={handleRefresh}
                    disabled={isLoading}
                    style={({ pressed }) => [
                      styles.refreshButton,
                      { opacity: pressed ? 0.85 : 1 },
                    ]}
                  >
                    <Ionicons name="refresh" size={18} color={Colors.brand.blue} />
                    <Text style={styles.refreshButtonText}>Refresh</Text>
                  </Pressable>

                  <Pressable
                    onPress={handleLogout}
                    style={({ pressed }) => [
                      styles.logoutButton,
                      { opacity: pressed ? 0.85 : 1 },
                    ]}
                  >
                    <Ionicons name="log-out-outline" size={18} color={Colors.light.textSecondary} />
                    <Text style={styles.logoutButtonText}>Sign Out</Text>
                  </Pressable>
                </View>
              </>
            ) : null}

            <View style={styles.infoCard}>
              <View style={styles.infoRow}>
                <Ionicons name="information-circle-outline" size={18} color={Colors.light.textSecondary} />
                <Text style={styles.infoText}>
                  Points are earned automatically when you pay at The 147. Ask a member of staff if you need help with your loyalty account.
                </Text>
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  content: {
    paddingHorizontal: 0,
  },
  headerGradient: {
    marginHorizontal: 20,
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    gap: 8,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#FFF",
    fontFamily: "Montserrat_700Bold",
  },
  headerSubtitle: {
    fontSize: 14,
    color: "rgba(255,255,255,0.7)",
    textAlign: "center",
    fontFamily: "Montserrat_400Regular",
  },
  loadingWrap: {
    padding: 40,
    alignItems: "center",
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: Colors.light.textSecondary,
    fontFamily: "Montserrat_400Regular",
  },
  statusCard: {
    margin: 20,
    padding: 32,
    backgroundColor: Colors.light.surface,
    borderRadius: 16,
    alignItems: "center",
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  statusTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.light.text,
    fontFamily: "Montserrat_700Bold",
  },
  statusText: {
    fontSize: 14,
    color: Colors.light.textSecondary,
    textAlign: "center",
    lineHeight: 20,
    fontFamily: "Montserrat_400Regular",
  },
  howItWorksCard: {
    margin: 20,
    marginBottom: 0,
    padding: 20,
    backgroundColor: Colors.light.surface,
    borderRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.light.text,
    marginBottom: 12,
    fontFamily: "Montserrat_700Bold",
  },
  ruleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 6,
  },
  ruleText: {
    fontSize: 14,
    color: Colors.light.text,
    flex: 1,
    fontFamily: "Montserrat_400Regular",
  },
  lockIconRow: {
    alignItems: "center",
    marginBottom: 8,
  },
  lookupCard: {
    margin: 20,
    padding: 20,
    backgroundColor: Colors.light.surface,
    borderRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  lookupDescription: {
    fontSize: 14,
    color: Colors.light.textSecondary,
    marginBottom: 16,
    lineHeight: 20,
    fontFamily: "Montserrat_400Regular",
  },
  fieldHint: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    marginTop: 2,
    marginBottom: 8,
    fontFamily: "Montserrat_400Regular",
    lineHeight: 16,
  },
  inputRow: {
    marginBottom: 12,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.light.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.light.border,
    paddingHorizontal: 14,
  },
  inputIcon: {
    marginRight: 8,
  },
  phoneInput: {
    flex: 1,
    height: 48,
    fontSize: 16,
    color: Colors.light.text,
    fontFamily: "Montserrat_400Regular",
  },
  lookupButton: {
    backgroundColor: Colors.brand.blue,
    borderRadius: 12,
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  enrollButton: {
    backgroundColor: Colors.brand.gold,
    borderRadius: 12,
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: "#FFF",
    fontSize: 15,
    fontWeight: "600",
    fontFamily: "Montserrat_600SemiBold",
  },
  errorText: {
    color: Colors.brand.red,
    fontSize: 13,
    marginTop: 10,
    textAlign: "center",
    fontFamily: "Montserrat_400Regular",
  },
  codeInputContainer: {
    alignItems: "center",
  },
  codeBoxRow: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
  },
  codeBox: {
    width: 44,
    height: 52,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.background,
    alignItems: "center",
    justifyContent: "center",
  },
  codeBoxActive: {
    borderColor: Colors.brand.blue,
    borderWidth: 2,
  },
  codeDigit: {
    fontSize: 22,
    fontWeight: "700",
    color: Colors.light.text,
    fontFamily: "Montserrat_700Bold",
  },
  hiddenInput: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
  },
  codeActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 16,
  },
  linkButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    padding: 8,
  },
  linkButtonText: {
    color: Colors.brand.blue,
    fontSize: 13,
    fontWeight: "600",
    fontFamily: "Montserrat_600SemiBold",
  },
  pointsContainer: {
    marginHorizontal: 20,
    marginTop: 20,
  },
  pointsGradient: {
    borderRadius: 16,
    padding: 28,
    alignItems: "center",
    gap: 4,
  },
  pointsValue: {
    fontSize: 44,
    fontWeight: "800",
    color: "#FFF",
    fontFamily: "Montserrat_700Bold",
  },
  pointsLabel: {
    fontSize: 16,
    color: "rgba(255,255,255,0.85)",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 2,
    fontFamily: "Montserrat_600SemiBold",
  },
  statsRow: {
    flexDirection: "row",
    gap: 12,
    marginHorizontal: 20,
    marginTop: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    gap: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  statValue: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.light.text,
    fontFamily: "Montserrat_700Bold",
  },
  statLabel: {
    fontSize: 11,
    color: Colors.light.textSecondary,
    textAlign: "center",
    fontFamily: "Montserrat_400Regular",
  },
  rewardsSection: {
    margin: 20,
    marginBottom: 0,
  },
  tierCard: {
    backgroundColor: Colors.light.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  tierCardRedeemable: {
    borderWidth: 1.5,
    borderColor: Colors.brand.gold,
  },
  tierHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 10,
  },
  tierInfo: {
    flex: 1,
  },
  tierName: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.light.text,
    fontFamily: "Montserrat_600SemiBold",
  },
  tierPoints: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    fontFamily: "Montserrat_400Regular",
  },
  redeemBadge: {
    backgroundColor: Colors.brand.gold,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  redeemBadgeText: {
    color: "#FFF",
    fontSize: 12,
    fontWeight: "700",
    fontFamily: "Montserrat_700Bold",
  },
  progressBarBg: {
    height: 6,
    backgroundColor: Colors.light.surfaceElevated,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: Colors.brand.gold,
    borderRadius: 3,
  },
  progressText: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    marginTop: 6,
    fontFamily: "Montserrat_400Regular",
  },
  actionRow: {
    flexDirection: "row",
    gap: 12,
    marginHorizontal: 20,
    marginTop: 16,
  },
  refreshButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.light.surface,
    borderWidth: 1,
    borderColor: Colors.brand.blue,
  },
  refreshButtonText: {
    color: Colors.brand.blue,
    fontSize: 14,
    fontWeight: "600",
    fontFamily: "Montserrat_600SemiBold",
  },
  logoutButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.light.surface,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  logoutButtonText: {
    color: Colors.light.textSecondary,
    fontSize: 14,
    fontWeight: "500",
    fontFamily: "Montserrat_400Regular",
  },
  infoCard: {
    margin: 20,
    padding: 16,
    backgroundColor: Colors.light.surfaceElevated,
    borderRadius: 12,
  },
  infoRow: {
    flexDirection: "row",
    gap: 10,
  },
  infoText: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    flex: 1,
    lineHeight: 18,
    fontFamily: "Montserrat_400Regular",
  },
});
