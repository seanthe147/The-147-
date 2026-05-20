import React, { useState, useCallback, useEffect, useContext } from "react";
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
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BottomTabBarHeightContext } from "@react-navigation/bottom-tabs";
import { LinearGradient } from "expo-linear-gradient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import { useCustomerGreeting } from "@/hooks/useCustomerGreeting";
import { useResponsive } from "@/hooks/useResponsive";

const SESSION_KEY = "loyalty_session";
function loyaltyUrl(path: string): string {
  return new URL(path, getApiUrl()).toString();
}

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

interface LoyaltyEvent {
  id: string;
  type: string;
  created_at: string;
  accumulate_points?: { points: number };
  adjust_points?: { points: number; reason?: string };
  expire_points?: { points: number };
  create_reward?: { reward_tier_id: string };
  redeem_reward?: { reward_tier_id?: string };
  delete_reward?: { reward_tier_id?: string };
}

interface IssuedReward {
  id: string;
  reward_tier_id: string;
  status: string;
  created_at: string;
}

type AuthStep = "loading" | "phone" | "otp" | "authenticated";

interface MembershipPlan {
  id: number;
  name: string;
  tier: string;
  priceMonthly: number;
  priceAnnual?: number | null;
  color: string | null;
  hoursIncluded: number | null;
  snookerUnlimited: boolean | null;
  foodDrinkDiscount: number | null;
  priorityBooking: boolean | null;
  loyaltyMultiplier: number | null;
  guestPassesMonthly: number | null;
  active: boolean;
  // Server-rendered benefit chips. Lets staff change wording without an
  // app submission — the app just displays whatever the API returns.
  benefits?: string[] | null;
}

const PLAN_TIER_META: Record<string, { icon: string; tagline: string }> = {
  rack: { icon: "ellipse", tagline: "Casual players" },
  century: { icon: "trophy", tagline: "Most popular" },
  maximum: { icon: "diamond", tagline: "The full experience" },
};

function getPlanDisplayFeatures(plan: MembershipPlan): string[] {
  // Prefer the server-rendered benefit list so wording can be tweaked
  // server-side without an app rebuild. Falls back to a local computation
  // if the field isn't present (e.g. older server build).
  if (Array.isArray(plan.benefits) && plan.benefits.length > 0) {
    return plan.benefits;
  }
  const f: string[] = [];
  if (plan.snookerUnlimited) f.push("Unlimited snooker");
  else if (plan.hoursIncluded) f.push(`${plan.hoursIncluded} hrs snooker/month`);
  if (plan.foodDrinkDiscount) f.push(`${plan.foodDrinkDiscount}% food & drink discount`);
  if (plan.priorityBooking) f.push("Priority booking");
  if (plan.guestPassesMonthly && plan.guestPassesMonthly > 0) f.push(`${plan.guestPassesMonthly} guest pass/month`);
  if (plan.loyaltyMultiplier && plan.loyaltyMultiplier > 1) f.push(`${plan.loyaltyMultiplier}× loyalty points`);
  else f.push("Loyalty points");
  return f;
}

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

function ActiveRewardsSection({
  rewards,
  program,
}: {
  rewards: IssuedReward[];
  program: LoyaltyProgram | null;
}) {
  if (!rewards.length) return null;
  return (
    <View style={styles.activeRewardsSection}>
      <View style={styles.sectionTitleRow}>
        <Ionicons name="gift" size={18} color={Colors.brand.gold} />
        <Text style={styles.sectionTitle}>Your Active Rewards</Text>
      </View>
      <Text style={styles.activeRewardsSubtitle}>
        You have {rewards.length} reward{rewards.length !== 1 ? "s" : ""} ready to use — show this screen to a member of staff.
      </Text>
      {rewards.map((reward) => {
        const tier = program?.reward_tiers?.find((t) => t.id === reward.reward_tier_id);
        const earned = new Date(reward.created_at).toLocaleDateString("en-GB", {
          day: "numeric", month: "short", year: "numeric",
        });
        return (
          <View key={reward.id} style={styles.activeRewardCard}>
            <LinearGradient
              colors={["#FFF9E6", "#FFF3CC"]}
              style={styles.activeRewardInner}
            >
              <View style={styles.activeRewardIconWrap}>
                <Ionicons name="gift" size={28} color={Colors.brand.gold} />
              </View>
              <View style={styles.activeRewardText}>
                <Text style={styles.activeRewardName}>{tier?.name ?? "Reward"}</Text>
                <Text style={styles.activeRewardDate}>Issued {earned}</Text>
              </View>
              <View style={styles.activeRewardBadge}>
                <Text style={styles.activeRewardBadgeText}>READY</Text>
              </View>
            </LinearGradient>
            <View style={styles.showToStaffBanner}>
              <Ionicons name="people" size={14} color={Colors.brand.blue} />
              <Text style={styles.showToStaffText}>Show this to a member of staff to redeem</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function BirthdayBanner({
  birthday,
  terminology,
}: {
  birthday: {
    hasDob: boolean;
    active: boolean;
    bonusAwardedThisYear: boolean;
    bonusPoints: number;
    dayOfYear: string | null;
  };
  terminology?: { one: string; other: string };
}) {
  const pointsLabel = terminology?.other || "points";
  // Don't surface anything if no DOB and no bonus configured.
  if (!birthday.hasDob) {
    return (
      <View style={styles.birthdayBannerInfo} testID="birthday-banner-prompt">
        <Ionicons name="gift-outline" size={18} color={Colors.brand.blue} />
        <Text style={styles.birthdayBannerInfoText}>
          Add your birthday in your account to unlock {birthday.bonusPoints} bonus {pointsLabel} on your special week.
        </Text>
      </View>
    );
  }
  if (birthday.active && !birthday.bonusAwardedThisYear) {
    return (
      <View style={styles.birthdayBannerActive} testID="birthday-banner-active">
        <Ionicons name="gift" size={20} color="#7C2D12" />
        <Text style={styles.birthdayBannerActiveText}>
          🎂 Happy birthday week! Refresh to claim your {birthday.bonusPoints} bonus {pointsLabel}.
        </Text>
      </View>
    );
  }
  if (birthday.active && birthday.bonusAwardedThisYear) {
    return (
      <View style={styles.birthdayBannerClaimed} testID="birthday-banner-claimed">
        <Ionicons name="checkmark-circle" size={18} color="#166534" />
        <Text style={styles.birthdayBannerClaimedText}>
          🎉 Birthday bonus of {birthday.bonusPoints} {pointsLabel} added — enjoy!
        </Text>
      </View>
    );
  }
  return null;
}

function NextRewardCard({
  balance,
  rewardTiers,
  terminology,
}: {
  balance: number;
  rewardTiers: RewardTier[];
  terminology?: { one: string; other: string };
}) {
  if (!rewardTiers || rewardTiers.length === 0) return null;
  const sorted = [...rewardTiers].sort((a, b) => a.points - b.points);
  const next = sorted.find((t) => balance < t.points);
  const pointsLabel = terminology ? terminology.other : "points";

  // No "next" tier means the customer can already redeem the highest reward.
  if (!next) {
    const highest = sorted[sorted.length - 1];
    return (
      <View style={styles.nextRewardCard}>
        <LinearGradient
          colors={["#16A34A", "#15803D"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.nextRewardGradient}
        >
          <View style={styles.nextRewardTopRow}>
            <Ionicons name="sparkles" size={20} color="#FFF" />
            <Text style={styles.nextRewardEyebrow}>You've earned every reward!</Text>
          </View>
          <Text style={styles.nextRewardHeadline}>
            Ask staff to redeem your {highest.name}
          </Text>
          <View style={styles.nextRewardProgressBg}>
            <View style={[styles.nextRewardProgressFill, { width: "100%", backgroundColor: "rgba(255,255,255,0.95)" }]} />
          </View>
          <Text style={styles.nextRewardSub}>
            You have {balance} {pointsLabel} — every tier is unlocked.
          </Text>
        </LinearGradient>
      </View>
    );
  }

  const remaining = next.points - balance;
  const progress = Math.min(balance / next.points, 1);
  return (
    <View style={styles.nextRewardCard}>
      <LinearGradient
        colors={[Colors.brand.navy, Colors.brand.blue]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.nextRewardGradient}
      >
        <View style={styles.nextRewardTopRow}>
          <Ionicons name="trending-up" size={20} color={Colors.brand.gold} />
          <Text style={styles.nextRewardEyebrow}>Next reward</Text>
        </View>
        <Text style={styles.nextRewardHeadline}>
          {remaining} {pointsLabel} to {next.name}
        </Text>
        <View style={styles.nextRewardProgressBg}>
          <View
            style={[
              styles.nextRewardProgressFill,
              { width: `${Math.max(progress * 100, 4)}%`, backgroundColor: Colors.brand.gold },
            ]}
          />
        </View>
        <View style={styles.nextRewardFooter}>
          <Text style={styles.nextRewardSub}>{balance} of {next.points}</Text>
          <Text style={styles.nextRewardSub}>{Math.round(progress * 100)}%</Text>
        </View>
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
  const remaining = tier.points - balance;

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
        {canRedeem
          ? "Ask a member of staff to redeem this reward"
          : `${remaining} more ${pointsLabel} needed`}
      </Text>
    </View>
  );
}

function ActivityFeed({
  events,
  program,
}: {
  events: LoyaltyEvent[];
  program: LoyaltyProgram | null;
}) {
  if (!events.length) return null;

  function describeEvent(event: LoyaltyEvent): { label: string; sub: string; icon: React.ComponentProps<typeof Ionicons>["name"]; color: string; points?: number } {
    const tierName = (tierId?: string) =>
      tierId ? (program?.reward_tiers?.find((t) => t.id === tierId)?.name ?? "reward") : "reward";

    switch (event.type) {
      case "ACCUMULATE_POINTS":
        return {
          label: `Earned ${event.accumulate_points?.points ?? 0} points`,
          sub: "Points added to your account",
          icon: "arrow-up-circle",
          color: "#16A34A",
          points: event.accumulate_points?.points,
        };
      case "ADJUST_POINTS": {
        const pts = event.adjust_points?.points ?? 0;
        return {
          label: pts >= 0 ? `Points added (+${pts})` : `Points deducted (${pts})`,
          sub: event.adjust_points?.reason ?? "Manual adjustment",
          icon: pts >= 0 ? "add-circle" : "remove-circle",
          color: pts >= 0 ? "#16A34A" : "#DC2626",
          points: pts,
        };
      }
      case "CREATE_REWARD":
        return {
          label: `Reward issued`,
          sub: tierName(event.create_reward?.reward_tier_id),
          icon: "gift",
          color: Colors.brand.gold,
        };
      case "REDEEM_REWARD":
        return {
          label: `Reward redeemed`,
          sub: tierName(event.redeem_reward?.reward_tier_id),
          icon: "checkmark-circle",
          color: Colors.brand.blue,
        };
      case "DELETE_REWARD":
        return {
          label: `Reward cancelled`,
          sub: tierName(event.delete_reward?.reward_tier_id),
          icon: "close-circle",
          color: "#9CA3AF",
        };
      case "EXPIRE_POINTS":
        return {
          label: `Points expired (-${event.expire_points?.points ?? 0})`,
          sub: "Unused points have expired",
          icon: "time-outline",
          color: "#9CA3AF",
          points: -(event.expire_points?.points ?? 0),
        };
      case "CREATE_ACCOUNT":
        return {
          label: "Joined The 147 Rewards",
          sub: "Welcome to our loyalty programme!",
          icon: "star",
          color: Colors.brand.gold,
        };
      default:
        return {
          label: event.type.replace(/_/g, " ").toLowerCase(),
          sub: "",
          icon: "ellipse-outline",
          color: "#9CA3AF",
        };
    }
  }

  return (
    <View style={styles.activitySection}>
      <View style={styles.sectionTitleRow}>
        <Ionicons name="time" size={18} color={Colors.brand.blue} />
        <Text style={styles.sectionTitle}>Recent Activity</Text>
      </View>
      {events.map((event, idx) => {
        const info = describeEvent(event);
        const date = new Date(event.created_at);
        const dateStr = date.toLocaleDateString("en-GB", {
          day: "numeric", month: "short", year: "numeric",
        });
        return (
          <View key={event.id} style={[styles.activityRow, idx < events.length - 1 && styles.activityRowBorder]}>
            <View style={[styles.activityIconWrap, { backgroundColor: `${info.color}18` }]}>
              <Ionicons name={info.icon} size={20} color={info.color} />
            </View>
            <View style={styles.activityText}>
              <Text style={styles.activityLabel}>{info.label}</Text>
              {info.sub ? <Text style={styles.activitySub}>{info.sub}</Text> : null}
            </View>
            <Text style={styles.activityDate}>{dateStr}</Text>
          </View>
        );
      })}
    </View>
  );
}


interface LoyaltyMeResponse {
  configured: boolean;
  active: boolean;
  linked: boolean;
  hasPhone: boolean;
  canEnroll?: boolean;
  program?: LoyaltyProgram;
  account?: LoyaltyAccount | null;
  events?: LoyaltyEvent[];
  rewards?: IssuedReward[];
  birthday?: {
    hasDob: boolean;
    active: boolean;
    bonusAwardedThisYear: boolean;
    bonusPoints: number;
    dayOfYear: string | null;
  };
  promo?: {
    doublePointsToday: boolean;
    visitPoints: number;
  };
}

export default function LoyaltyScreen() {
  const insets = useSafeAreaInsets();
  const { tabletPad } = useResponsive();
  const isWeb = Platform.OS === "web";
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0;
  const queryClient = useQueryClient();

  const { isAuthenticated, customer, getCustomerToken } = useCustomerAuth();
  const { firstName } = useCustomerGreeting();

  const [step, setStep] = useState<AuthStep>("loading");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [account, setAccount] = useState<LoyaltyAccount | null>(null);
  const [lookupDone, setLookupDone] = useState(false);
  const [error, setError] = useState("");

  const { data: membershipPlans = [] } = useQuery<MembershipPlan[]>({
    queryKey: ["/api/membership/plans"],
  });

  // ── New authenticated path: pulls everything in one call using the
  // customer's main session, no phone+OTP needed.
  const meQuery = useQuery<LoyaltyMeResponse>({
    queryKey: ["/api/loyalty/me", customer?.id],
    queryFn: async () => {
      const token = getCustomerToken();
      if (!token) throw new Error("Not signed in");
      const res = await fetch(loyaltyUrl("/api/loyalty/me"), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load loyalty");
      return res.json();
    },
    enabled: isAuthenticated,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
  });

  const enrollMeMutation = useMutation({
    mutationFn: async () => {
      const token = getCustomerToken();
      if (!token) throw new Error("Not signed in");
      const res = await fetch(loyaltyUrl("/api/loyalty/me/enroll"), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Could not enrol");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/loyalty/me", customer?.id] });
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(SESSION_KEY);
        if (stored) {
          const { token, phone: storedPhone } = JSON.parse(stored);
          const res = await fetch(loyaltyUrl("/api/loyalty/session"), {
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
      const res = await fetch(loyaltyUrl("/api/loyalty/program"));
      if (!res.ok) throw new Error("Failed to load loyalty program");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const historyQuery = useQuery({
    queryKey: ["loyalty-history", sessionToken],
    queryFn: async () => {
      if (!sessionToken) return { events: [], rewards: [] };
      const res = await fetch(loyaltyUrl("/api/loyalty/history"), {
        headers: { "x-loyalty-session": sessionToken },
      });
      if (!res.ok) return { events: [], rewards: [] };
      return res.json() as Promise<{ events: LoyaltyEvent[]; rewards: IssuedReward[] }>;
    },
    enabled: step === "authenticated" && !!sessionToken && !!account,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: true,
  });

  const sendCodeMutation = useMutation({
    mutationFn: async ({ phoneNumber, emailAddress }: { phoneNumber: string; emailAddress: string }) => {
      const res = await fetch(loyaltyUrl("/api/loyalty/send-code"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phoneNumber, email: emailAddress }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to send verification code");
      return data;
    },
    onSuccess: () => {
      setError("");
      setOtpCode("");
      setStep("otp");
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (err: Error) => setError(err.message),
  });

  const verifyCodeMutation = useMutation({
    mutationFn: async ({ phoneNumber, emailAddress, code }: { phoneNumber: string; emailAddress: string; code: string }) => {
      const res = await fetch(loyaltyUrl("/api/loyalty/verify-code"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phoneNumber, email: emailAddress, code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Verification failed");
      return data;
    },
    onSuccess: async (data) => {
      const phoneCleaned = phone.replace(/\s/g, "");
      setSessionToken(data.sessionToken);
      await AsyncStorage.setItem(SESSION_KEY, JSON.stringify({ token: data.sessionToken, phone: phoneCleaned }));
      setError("");
      setStep("authenticated");
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (err: Error) => setError(err.message),
  });

  const lookupMutation = useMutation({
    mutationFn: async (token: string) => {
      const res = await fetch(loyaltyUrl("/api/loyalty/lookup"), {
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
      const res = await fetch(loyaltyUrl("/api/loyalty/enroll"), {
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
    const phoneCleaned = phone.replace(/\s/g, "");
    if (phoneCleaned.length < 10) {
      const msg = "Please enter a valid UK phone number";
      if (Platform.OS === "web") window.alert(msg);
      else Alert.alert("Invalid Number", msg);
      return;
    }
    const emailClean = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailClean)) {
      const msg = "Please enter a valid email address";
      if (Platform.OS === "web") window.alert(msg);
      else Alert.alert("Invalid Email", msg);
      return;
    }
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setError("");
    sendCodeMutation.mutate({ phoneNumber: phoneCleaned, emailAddress: emailClean });
  }, [phone, email]);

  const handleVerifyOtp = useCallback(() => {
    const phoneCleaned = phone.replace(/\s/g, "");
    const emailClean = email.trim().toLowerCase();
    const codeTrimmed = otpCode.trim();
    if (!codeTrimmed) {
      const msg = "Please enter the verification code";
      if (Platform.OS === "web") window.alert(msg);
      else Alert.alert("Code Required", msg);
      return;
    }
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setError("");
    verifyCodeMutation.mutate({ phoneNumber: phoneCleaned, emailAddress: emailClean, code: codeTrimmed });
  }, [phone, email, otpCode]);

  const handleEnroll = useCallback(() => {
    if (!sessionToken) return;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    enrollMutation.mutate(sessionToken);
  }, [sessionToken]);

  const handleRefresh = useCallback(() => {
    if (sessionToken) {
      setLookupDone(false);
      lookupMutation.mutate(sessionToken);
      historyQuery.refetch();
    }
  }, [sessionToken]);

  const handleLogout = useCallback(async () => {
    if (sessionToken) {
      try {
        await fetch(loyaltyUrl("/api/loyalty/logout"), {
          method: "POST",
          headers: { "x-loyalty-session": sessionToken },
        });
      } catch {}
    }
    await AsyncStorage.removeItem(SESSION_KEY);
    setSessionToken(null);
    setAccount(null);
    setLookupDone(false);
    setPhone("");
    setEmail("");
    setOtpCode("");
    setError("");
    setStep("phone");
  }, [sessionToken]);

  const program: LoyaltyProgram | null = programData?.program || null;
  const programActive = programData?.active === true;
  const isLoading = sendCodeMutation.isPending || verifyCodeMutation.isPending || lookupMutation.isPending || enrollMutation.isPending;
  const historyEvents: LoyaltyEvent[] = historyQuery.data?.events ?? [];
  const issuedRewards: IssuedReward[] = historyQuery.data?.rewards ?? [];

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.content,
          { paddingTop: (isWeb ? 67 : insets.top) + 16, paddingBottom: tabBarHeight + 20, paddingHorizontal: tabletPad },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <LinearGradient
          colors={[Colors.brand.dark, Colors.brand.navy]}
          style={styles.headerGradient}
        >
          <Ionicons name="diamond" size={28} color={Colors.brand.gold} />
          <Text style={styles.headerTitle}>Membership</Text>
          <Text style={styles.headerSubtitle}>
            {firstName
              ? `Welcome back, ${firstName} — earn points every time you visit`
              : "Earn points every time you visit The 147"}
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
        ) : isAuthenticated ? (
          // ── Phase 2: signed-in customers skip phone+OTP entirely ─────────
          meQuery.isLoading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="large" color={Colors.brand.blue} />
              <Text style={styles.loadingText}>Loading your rewards…</Text>
            </View>
          ) : meQuery.isError ? (
            <View style={styles.statusCard}>
              <Ionicons name="cloud-offline-outline" size={40} color={Colors.light.textSecondary} />
              <Text style={styles.statusTitle}>Couldn't load your rewards</Text>
              <Text style={styles.statusText}>
                {(meQuery.error as Error)?.message || "Please try again."}
              </Text>
              <Pressable
                onPress={() => meQuery.refetch()}
                style={({ pressed }) => [styles.refreshButton, { opacity: pressed ? 0.85 : 1, marginTop: 12 }]}
              >
                <Ionicons name="refresh" size={18} color={Colors.brand.blue} />
                <Text style={styles.refreshButtonText}>Try again</Text>
              </Pressable>
            </View>
          ) : !meQuery.data?.hasPhone ? (
            <View style={styles.lookupCard}>
              <View style={styles.lockIconRow}>
                <Ionicons name="call-outline" size={28} color={Colors.brand.blue} />
              </View>
              <Text style={styles.sectionTitle}>Add your phone number</Text>
              <Text style={styles.lookupDescription}>
                We use the phone number on your profile to link you to The 147 Rewards. Add one to your profile and we'll do the rest.
              </Text>
              <Pressable
                onPress={() => router.push("/account")}
                style={({ pressed }) => [styles.lookupButton, { opacity: pressed ? 0.85 : 1 }]}
              >
                <Ionicons name="person-circle-outline" size={18} color="#FFF" />
                <Text style={styles.buttonText}>Update Profile</Text>
              </Pressable>
            </View>
          ) : !meQuery.data?.linked ? (
            <>
              {meQuery.data?.program?.accrual_rules && meQuery.data.program.accrual_rules.length > 0 && (
                <View style={styles.howItWorksCard}>
                  <Text style={styles.sectionTitle}>How It Works</Text>
                  {meQuery.data.program.accrual_rules.map((rule, i) => (
                    <View key={i} style={styles.ruleRow}>
                      <Ionicons name="add-circle" size={20} color={Colors.brand.blue} />
                      <Text style={styles.ruleText}>
                        {rule.accrual_type === "SPEND"
                          ? `Earn ${rule.points} ${meQuery.data!.program?.terminology?.other || "points"} for every £${((rule.spend_data?.amount || 100) / 100).toFixed(0)} spent`
                          : rule.accrual_type === "VISIT"
                          ? `Earn ${rule.points} ${meQuery.data!.program?.terminology?.other || "points"} per visit`
                          : `Earn ${rule.points} ${meQuery.data!.program?.terminology?.other || "points"}`}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
              <View style={styles.lookupCard}>
                <View style={styles.lockIconRow}>
                  <Ionicons name="gift-outline" size={28} color={Colors.brand.gold} />
                </View>
                <Text style={styles.sectionTitle}>Join The 147 Rewards</Text>
                <Text style={styles.lookupDescription}>
                  Earn points every time you spend at the venue and unlock exclusive rewards. One tap to join — we'll use the phone number on your profile.
                </Text>
                <Pressable
                  onPress={() => enrollMeMutation.mutate()}
                  disabled={enrollMeMutation.isPending}
                  style={({ pressed }) => [
                    styles.enrollButton,
                    enrollMeMutation.isPending && styles.buttonDisabled,
                    { opacity: pressed ? 0.85 : 1 },
                  ]}
                >
                  {enrollMeMutation.isPending ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <>
                      <Ionicons name="star" size={18} color="#FFF" />
                      <Text style={styles.buttonText}>Join Now</Text>
                    </>
                  )}
                </Pressable>
                {enrollMeMutation.isError && (
                  <Text style={styles.errorText}>
                    {(enrollMeMutation.error as Error)?.message || "Could not enrol."}
                  </Text>
                )}
              </View>
            </>
          ) : meQuery.data.account ? (
            <>
              {firstName ? (
                <Text style={styles.personalIntro}>
                  Here's where you stand
                </Text>
              ) : null}
              <PointsDisplay
                balance={meQuery.data.account.balance}
                terminology={meQuery.data.program?.terminology}
              />
              <NextRewardCard
                balance={meQuery.data.account.balance}
                rewardTiers={meQuery.data.program?.reward_tiers ?? []}
                terminology={meQuery.data.program?.terminology}
              />
              <Pressable
                onPress={() => router.push("/(tabs)/rewards")}
                style={({ pressed }) => [
                  styles.enrollButton,
                  { marginHorizontal: 20, marginTop: 12, opacity: pressed ? 0.85 : 1 },
                ]}
              >
                <Ionicons name="gift" size={18} color="#FFF" />
                <Text style={styles.buttonText}>Rewards & Scratch Card</Text>
                <Ionicons name="chevron-forward" size={16} color="#FFF" />
              </Pressable>
              <View style={styles.infoCard}>
                <View style={styles.infoRow}>
                  <Ionicons name="information-circle-outline" size={18} color={Colors.light.textSecondary} />
                  <Text style={styles.infoText}>
                    Points are earned automatically when you pay at The 147. Visit the Rewards tab to scratch today's card and check your prizes.
                  </Text>
                </View>
              </View>
            </>
          ) : null
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
                <Ionicons name="phone-portrait-outline" size={28} color={Colors.brand.blue} />
              </View>
              <Text style={styles.sectionTitle}>Access Your Account</Text>
              <Text style={styles.lookupDescription}>
                Enter your phone number and email address. We'll send you a verification code to confirm it's you.
              </Text>

              <View style={styles.inputRow}>
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
                    returnKeyType="next"
                  />
                </View>
              </View>

              <View style={[styles.inputRow, { marginTop: 10 }]}>
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
                    returnKeyType="go"
                    onSubmitEditing={handleSendCode}
                  />
                </View>
              </View>

              <Text style={styles.fieldHint}>
                Your phone number must match the one registered on your loyalty account.
              </Text>

              <Pressable
                onPress={handleSendCode}
                disabled={isLoading || phone.replace(/\s/g, "").length < 10 || !email.trim()}
                style={({ pressed }) => [
                  styles.lookupButton,
                  (isLoading || phone.replace(/\s/g, "").length < 10 || !email.trim()) && styles.buttonDisabled,
                  { opacity: pressed ? 0.85 : 1 },
                ]}
              >
                {sendCodeMutation.isPending ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <>
                    <Ionicons name="send-outline" size={18} color="#FFF" />
                    <Text style={styles.buttonText}>Send Verification Code</Text>
                  </>
                )}
              </Pressable>

              {error ? <Text style={styles.errorText}>{error}</Text> : null}
            </View>
          </>
        ) : step === "otp" ? (
          <>
            <View style={styles.lookupCard}>
              <View style={styles.lockIconRow}>
                <Ionicons name="shield-checkmark-outline" size={28} color={Colors.brand.blue} />
              </View>
              <Text style={styles.sectionTitle}>Enter Verification Code</Text>
              <Text style={styles.lookupDescription}>
                We've sent a verification code to {email.trim().toLowerCase()}. Enter it below to access your account.
              </Text>

              <View style={styles.inputRow}>
                <View style={styles.inputWrap}>
                  <Ionicons name="key-outline" size={18} color={Colors.light.textSecondary} style={styles.inputIcon} />
                  <TextInput
                    style={styles.phoneInput}
                    placeholder="6-digit code"
                    placeholderTextColor={Colors.light.textSecondary}
                    value={otpCode}
                    onChangeText={setOtpCode}
                    keyboardType="number-pad"
                    maxLength={6}
                    returnKeyType="go"
                    onSubmitEditing={handleVerifyOtp}
                  />
                </View>
              </View>

              <Pressable
                onPress={handleVerifyOtp}
                disabled={verifyCodeMutation.isPending || otpCode.trim().length < 4}
                style={({ pressed }) => [
                  styles.lookupButton,
                  (verifyCodeMutation.isPending || otpCode.trim().length < 4) && styles.buttonDisabled,
                  { opacity: pressed ? 0.85 : 1 },
                ]}
              >
                {verifyCodeMutation.isPending ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle-outline" size={18} color="#FFF" />
                    <Text style={styles.buttonText}>Verify & Continue</Text>
                  </>
                )}
              </Pressable>

              <Pressable
                onPress={() => {
                  setStep("phone");
                  setOtpCode("");
                  setError("");
                }}
                style={({ pressed }) => [styles.logoutButton, { alignSelf: "center", marginTop: 8, opacity: pressed ? 0.7 : 1 }]}
              >
                <Ionicons name="arrow-back-outline" size={16} color={Colors.light.textSecondary} />
                <Text style={styles.logoutButtonText}>Change phone / email</Text>
              </Pressable>

              <Pressable
                onPress={() => sendCodeMutation.mutate({ phoneNumber: phone.replace(/\s/g, ""), emailAddress: email.trim().toLowerCase() })}
                disabled={sendCodeMutation.isPending}
                style={({ pressed }) => [styles.logoutButton, { alignSelf: "center", marginTop: 4, opacity: pressed ? 0.7 : 1 }]}
              >
                <Ionicons name="refresh-outline" size={16} color={Colors.light.textSecondary} />
                <Text style={styles.logoutButtonText}>Resend code</Text>
              </Pressable>

              {error ? <Text style={styles.errorText}>{error}</Text> : null}
            </View>
          </>
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
                <NextRewardCard
                  balance={account.balance}
                  rewardTiers={program?.reward_tiers ?? []}
                  terminology={program?.terminology}
                />

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

                {issuedRewards.length > 0 && (
                  <ActiveRewardsSection rewards={issuedRewards} program={program} />
                )}

                {program?.reward_tiers && program.reward_tiers.length > 0 && (
                  <View style={styles.rewardsSection}>
                    <View style={styles.sectionTitleRow}>
                      <Ionicons name="ribbon" size={18} color={Colors.brand.gold} />
                      <Text style={styles.sectionTitle}>Reward Tiers</Text>
                    </View>
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

                {historyEvents.length > 0 && (
                  <ActivityFeed events={historyEvents} program={program} />
                )}

                {historyQuery.isFetching && (
                  <View style={styles.historyLoadingRow}>
                    <ActivityIndicator size="small" color={Colors.brand.blue} />
                    <Text style={styles.historyLoadingText}>Loading activity…</Text>
                  </View>
                )}

                <View style={styles.actionRow}>
                  <Pressable
                    onPress={handleRefresh}
                    disabled={isLoading || historyQuery.isFetching}
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

        {/* ── Membership Section (always visible) ── */}
        <View style={styles.membershipSection}>
          <View style={styles.membershipDivider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerLabel}>MEMBERSHIP</Text>
            <View style={styles.dividerLine} />
          </View>

          <View style={styles.membershipHero}>
            <View style={styles.membershipHeroIcon}>
              <Ionicons name="card" size={24} color={Colors.brand.gold} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.membershipHeroTitle}>The 147 Membership</Text>
              <Text style={styles.membershipHeroSub}>Exclusive perks, priority booking & more</Text>
            </View>
          </View>

          {membershipPlans.map((plan, idx) => {
            const planColor = plan.color || Colors.brand.blue;
            const meta = PLAN_TIER_META[plan.tier] ?? { icon: "card", tagline: "" };
            const features = getPlanDisplayFeatures(plan);
            return (
              <Pressable
                key={plan.id}
                onPress={() => router.push("/membership")}
                style={[styles.membershipPlanCard, idx < membershipPlans.length - 1 && styles.membershipPlanCardBorder]}
              >
                <View style={[styles.planColorBar, { backgroundColor: planColor }]} />
                <View style={styles.planCardContent}>
                  <View style={styles.planCardTop}>
                    <View style={[styles.planBadge, { backgroundColor: planColor + "22" }]}>
                      <Ionicons name={meta.icon as any} size={16} color={planColor} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.planCardName}>{plan.name}</Text>
                      <Text style={styles.planCardTagline}>{meta.tagline}</Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={[styles.planCardPrice, { color: planColor }]}>£{(plan.priceMonthly / 100).toFixed(2)}</Text>
                      <Text style={styles.planCardPeriod}>/month</Text>
                    </View>
                  </View>
                  <View style={styles.planFeatureList}>
                    {features.map((f, i) => (
                      <View key={i} style={styles.planFeatureRow}>
                        <Ionicons name="checkmark-circle" size={13} color={planColor} />
                        <Text style={styles.planFeatureText}>{f}</Text>
                      </View>
                    ))}
                  </View>
                </View>
                <View style={styles.planChevron}>
                  <Ionicons name="chevron-forward" size={16} color={Colors.light.textSecondary} />
                </View>
              </Pressable>
            );
          })}

          <Pressable style={styles.membershipCtaBtn} onPress={() => router.push("/membership")}>
            <Ionicons name="card-outline" size={16} color="#fff" />
            <Text style={styles.membershipCtaBtnText}>View Plans & Join</Text>
            <Ionicons name="chevron-forward" size={16} color="#fff" />
          </Pressable>
        </View>

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
  personalIntro: {
    fontFamily: "Montserrat_500Medium",
    fontSize: 14,
    color: Colors.light.textSecondary,
    textAlign: "center",
    marginTop: 16,
    marginBottom: -4,
    paddingHorizontal: 20,
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
    boxShadow: "0px 2px 8px rgba(0,0,0,0.06)",
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
    boxShadow: "0px 2px 8px rgba(0,0,0,0.06)",
    elevation: 2,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.light.text,
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
    boxShadow: "0px 2px 8px rgba(0,0,0,0.06)",
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
  nextRewardCard: {
    marginHorizontal: 20,
    marginTop: 12,
  },
  doublePointsBanner: {
    marginHorizontal: 20,
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FEF3C7",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#FCD34D",
  },
  doublePointsText: {
    flex: 1,
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 13,
    color: "#92400E",
  },
  birthdayBannerInfo: {
    marginHorizontal: 20,
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#EFF6FF",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  birthdayBannerInfoText: {
    flex: 1,
    fontFamily: "Montserrat_400Regular",
    fontSize: 12,
    color: Colors.brand.blue,
  },
  birthdayBannerActive: {
    marginHorizontal: 20,
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FED7AA",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#FB923C",
  },
  birthdayBannerActiveText: {
    flex: 1,
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 13,
    color: "#7C2D12",
  },
  birthdayBannerClaimed: {
    marginHorizontal: 20,
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#DCFCE7",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#86EFAC",
  },
  birthdayBannerClaimedText: {
    flex: 1,
    fontFamily: "Montserrat_400Regular",
    fontSize: 12,
    color: "#166534",
  },
  nextRewardGradient: {
    borderRadius: 16,
    padding: 20,
    gap: 10,
  },
  nextRewardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  nextRewardEyebrow: {
    fontSize: 11,
    fontFamily: "Montserrat_600SemiBold",
    color: "rgba(255,255,255,0.85)",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  nextRewardHeadline: {
    fontSize: 20,
    fontFamily: "Montserrat_700Bold",
    color: "#FFF",
    lineHeight: 26,
  },
  nextRewardProgressBg: {
    height: 10,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: 5,
    overflow: "hidden",
    marginTop: 4,
  },
  nextRewardProgressFill: {
    height: "100%",
    borderRadius: 5,
  },
  nextRewardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  nextRewardSub: {
    fontSize: 12,
    fontFamily: "Montserrat_500Medium",
    color: "rgba(255,255,255,0.85)",
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
    boxShadow: "0px 1px 4px rgba(0,0,0,0.04)",
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
  activeRewardsSection: {
    marginHorizontal: 20,
    marginTop: 20,
  },
  activeRewardsSubtitle: {
    fontSize: 13,
    color: Colors.light.textSecondary,
    marginBottom: 12,
    fontFamily: "Montserrat_400Regular",
    lineHeight: 18,
  },
  activeRewardCard: {
    borderRadius: 14,
    borderWidth: 2,
    borderColor: Colors.brand.gold,
    overflow: "hidden",
    marginBottom: 10,
    boxShadow: "0px 2px 10px rgba(212,168,67,0.2)",
    elevation: 3,
  },
  activeRewardInner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 14,
  },
  activeRewardIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(212,168,67,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  activeRewardText: {
    flex: 1,
  },
  activeRewardName: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.light.text,
    fontFamily: "Montserrat_700Bold",
  },
  activeRewardDate: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    marginTop: 2,
    fontFamily: "Montserrat_400Regular",
  },
  activeRewardBadge: {
    backgroundColor: Colors.brand.gold,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  activeRewardBadgeText: {
    color: "#FFF",
    fontSize: 11,
    fontWeight: "700",
    fontFamily: "Montserrat_700Bold",
    letterSpacing: 0.5,
  },
  showToStaffBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#EFF6FF",
    borderTopWidth: 1,
    borderTopColor: "rgba(212,168,67,0.2)",
  },
  showToStaffText: {
    fontSize: 12,
    color: Colors.brand.blue,
    fontWeight: "600",
    fontFamily: "Montserrat_600SemiBold",
  },
  rewardsSection: {
    marginHorizontal: 20,
    marginTop: 20,
  },
  tierCard: {
    backgroundColor: Colors.light.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    boxShadow: "0px 1px 4px rgba(0,0,0,0.04)",
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
  activitySection: {
    marginHorizontal: 20,
    marginTop: 20,
    backgroundColor: Colors.light.surface,
    borderRadius: 16,
    padding: 16,
    boxShadow: "0px 1px 4px rgba(0,0,0,0.04)",
    elevation: 1,
  },
  activityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
  },
  activityRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  activityIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  activityText: {
    flex: 1,
  },
  activityLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.light.text,
    fontFamily: "Montserrat_600SemiBold",
  },
  activitySub: {
    fontSize: 11,
    color: Colors.light.textSecondary,
    marginTop: 2,
    fontFamily: "Montserrat_400Regular",
  },
  activityDate: {
    fontSize: 11,
    color: Colors.light.textSecondary,
    fontFamily: "Montserrat_400Regular",
    textAlign: "right",
    flexShrink: 0,
  },
  historyLoadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 12,
  },
  historyLoadingText: {
    fontSize: 12,
    color: Colors.light.textSecondary,
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

  /* ── Membership section ── */
  membershipSection: {
    marginTop: 8,
    paddingBottom: 4,
  },
  membershipDivider: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 20,
    marginBottom: 16,
    gap: 10,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.light.border,
  },
  dividerLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
    color: Colors.light.textSecondary,
    fontFamily: "Montserrat_700Bold",
  },
  membershipHero: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginHorizontal: 20,
    marginBottom: 14,
    backgroundColor: Colors.light.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  membershipHeroIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.brand.gold + "18",
    alignItems: "center",
    justifyContent: "center",
  },
  membershipHeroTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.light.text,
    fontFamily: "Montserrat_700Bold",
  },
  membershipHeroSub: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    fontFamily: "Montserrat_400Regular",
    marginTop: 2,
  },
  planChevron: {
    position: "absolute",
    right: 12,
    top: "50%",
    marginTop: -8,
  },
  membershipPlanCard: {
    marginHorizontal: 20,
    backgroundColor: Colors.light.surface,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.light.border,
    marginBottom: 10,
    position: "relative",
  },
  membershipPlanCardBorder: {
    // kept for potential future use — currently each card has its own margin
  },
  planColorBar: {
    height: 4,
    width: "100%",
  },
  planCardContent: {
    padding: 14,
  },
  planCardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  planBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  planCardName: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.light.text,
    fontFamily: "Montserrat_700Bold",
  },
  planCardTagline: {
    fontSize: 11,
    color: Colors.light.textSecondary,
    fontFamily: "Montserrat_400Regular",
    marginTop: 1,
  },
  planCardPrice: {
    fontSize: 18,
    fontWeight: "800",
    fontFamily: "Montserrat_700Bold",
  },
  planCardPeriod: {
    fontSize: 11,
    color: Colors.light.textSecondary,
    fontFamily: "Montserrat_400Regular",
    textAlign: "right",
  },
  planFeatureList: {
    gap: 5,
  },
  planFeatureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  planFeatureText: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    fontFamily: "Montserrat_400Regular",
    flex: 1,
  },
  membershipCtaBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginHorizontal: 20,
    marginTop: 4,
    paddingVertical: 14,
    backgroundColor: Colors.brand.blue,
    borderRadius: 12,
  },
  membershipCtaBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#fff",
    fontFamily: "Montserrat_700Bold",
  },
});
