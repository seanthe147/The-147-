import React, { useContext, useRef } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Platform,
  ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BottomTabBarHeightContext } from "@react-navigation/bottom-tabs";
import { LinearGradient } from "expo-linear-gradient";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import { useCustomerGreeting } from "@/hooks/useCustomerGreeting";
import { useResponsive } from "@/hooks/useResponsive";
import { ScratchCardGame } from "@/components/ScratchCardGame";

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
          <Text style={styles.nextRewardHeadline}>Ask staff to redeem your {highest.name}</Text>
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

function BirthdayBanner({
  birthday,
  terminology,
}: {
  birthday: { hasDob: boolean; active: boolean; bonusAwardedThisYear: boolean; bonusPoints: number; dayOfYear: string | null };
  terminology?: { one: string; other: string };
}) {
  const pointsLabel = terminology?.other || "points";
  if (!birthday.hasDob) {
    return (
      <View style={styles.birthdayBannerInfo}>
        <Ionicons name="gift-outline" size={18} color={Colors.brand.blue} />
        <Text style={styles.birthdayBannerInfoText}>
          Add your birthday in your account to unlock {birthday.bonusPoints} bonus {pointsLabel} on your special week.
        </Text>
      </View>
    );
  }
  if (birthday.active && !birthday.bonusAwardedThisYear) {
    return (
      <View style={styles.birthdayBannerActive}>
        <Ionicons name="gift" size={20} color="#7C2D12" />
        <Text style={styles.birthdayBannerActiveText}>
          🎂 Happy birthday week! Refresh to claim your {birthday.bonusPoints} bonus {pointsLabel}.
        </Text>
      </View>
    );
  }
  if (birthday.active && birthday.bonusAwardedThisYear) {
    return (
      <View style={styles.birthdayBannerClaimed}>
        <Ionicons name="checkmark-circle" size={18} color="#166534" />
        <Text style={styles.birthdayBannerClaimedText}>
          🎉 Birthday bonus of {birthday.bonusPoints} {pointsLabel} added — enjoy!
        </Text>
      </View>
    );
  }
  return null;
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
            <LinearGradient colors={["#FFF9E6", "#FFF3CC"]} style={styles.activeRewardInner}>
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
          <Text style={styles.tierPoints}>{tier.points} {pointsLabel}</Text>
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
        {canRedeem ? "Ask a member of staff to redeem this reward" : `${remaining} more ${pointsLabel} needed`}
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

  function describeEvent(event: LoyaltyEvent): { label: string; sub: string; icon: React.ComponentProps<typeof Ionicons>["name"]; color: string } {
    const tierName = (tierId?: string) =>
      tierId ? (program?.reward_tiers?.find((t) => t.id === tierId)?.name ?? "reward") : "reward";
    switch (event.type) {
      case "ACCUMULATE_POINTS":
        return { label: `Earned ${event.accumulate_points?.points ?? 0} points`, sub: "Points added to your account", icon: "arrow-up-circle", color: "#16A34A" };
      case "ADJUST_POINTS": {
        const pts = event.adjust_points?.points ?? 0;
        return { label: pts >= 0 ? `Points added (+${pts})` : `Points deducted (${pts})`, sub: event.adjust_points?.reason ?? "Manual adjustment", icon: pts >= 0 ? "add-circle" : "remove-circle", color: pts >= 0 ? "#16A34A" : "#DC2626" };
      }
      case "CREATE_REWARD":
        return { label: "Reward issued", sub: tierName(event.create_reward?.reward_tier_id), icon: "gift", color: Colors.brand.gold };
      case "REDEEM_REWARD":
        return { label: "Reward redeemed", sub: tierName(event.redeem_reward?.reward_tier_id), icon: "checkmark-circle", color: Colors.brand.blue };
      case "DELETE_REWARD":
        return { label: "Reward cancelled", sub: tierName(event.delete_reward?.reward_tier_id), icon: "close-circle", color: "#9CA3AF" };
      case "EXPIRE_POINTS":
        return { label: `Points expired (-${event.expire_points?.points ?? 0})`, sub: "Unused points have expired", icon: "time-outline", color: "#9CA3AF" };
      case "CREATE_ACCOUNT":
        return { label: "Joined The 147 Rewards", sub: "Welcome to our loyalty programme!", icon: "star", color: Colors.brand.gold };
      default:
        return { label: event.type.replace(/_/g, " ").toLowerCase(), sub: "", icon: "ellipse-outline", color: "#9CA3AF" };
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
        const dateStr = new Date(event.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
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

export default function RewardsScreen() {
  const insets = useSafeAreaInsets();
  const { tabletPad } = useResponsive();
  const isWeb = Platform.OS === "web";
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0;
  const queryClient = useQueryClient();

  const { isAuthenticated, customer, getCustomerToken } = useCustomerAuth();
  const { firstName } = useCustomerGreeting();

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

  const scrollViewRef = useRef<ScrollView>(null);

  return (
    <ScrollView
      ref={scrollViewRef}
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: (isWeb ? 67 : insets.top) + 16, paddingBottom: tabBarHeight + 20, paddingHorizontal: tabletPad },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <LinearGradient
        colors={[Colors.brand.dark, "#2D1800"]}
        style={styles.headerGradient}
      >
        <Ionicons name="gift" size={28} color={Colors.brand.gold} />
        <Text style={styles.headerTitle}>Rewards</Text>
        <Text style={styles.headerSubtitle}>
          {firstName
            ? `${firstName} — scratch cards, points & prizes`
            : "Scratch cards, points & prizes"}
        </Text>
      </LinearGradient>

      {!isAuthenticated ? (
        <View style={styles.statusCard}>
          <Ionicons name="person-circle-outline" size={48} color={Colors.brand.blue} />
          <Text style={styles.statusTitle}>Sign in to see your rewards</Text>
          <Text style={styles.statusText}>
            Create a free account or sign in to access your points balance, scratch today's card, and redeem prizes.
          </Text>
          <Pressable
            onPress={() => router.push("/account")}
            style={({ pressed }) => [styles.ctaButton, { opacity: pressed ? 0.85 : 1 }]}
          >
            <Ionicons name="person-circle-outline" size={18} color="#FFF" />
            <Text style={styles.ctaButtonText}>Sign In / Create Account</Text>
          </Pressable>
        </View>
      ) : meQuery.isLoading ? (
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
            style={({ pressed }) => [styles.ctaButton, { opacity: pressed ? 0.85 : 1, marginTop: 4 }]}
          >
            <Ionicons name="refresh" size={18} color="#FFF" />
            <Text style={styles.ctaButtonText}>Try again</Text>
          </Pressable>
        </View>
      ) : !meQuery.data?.configured ? (
        <View style={styles.statusCard}>
          <Ionicons name="alert-circle-outline" size={40} color={Colors.light.textSecondary} />
          <Text style={styles.statusTitle}>Coming Soon</Text>
          <Text style={styles.statusText}>Our rewards program is being set up. Check back soon!</Text>
        </View>
      ) : !meQuery.data?.hasPhone ? (
        <View style={styles.lookupCard}>
          <View style={styles.lockIconRow}>
            <Ionicons name="call-outline" size={28} color={Colors.brand.blue} />
          </View>
          <Text style={styles.sectionTitle}>Add your phone number</Text>
          <Text style={styles.lookupDescription}>
            We use the phone number on your profile to link you to The 147 Rewards. Add one to get started.
          </Text>
          <Pressable
            onPress={() => router.push("/account")}
            style={({ pressed }) => [styles.ctaButton, { opacity: pressed ? 0.85 : 1 }]}
          >
            <Ionicons name="person-circle-outline" size={18} color="#FFF" />
            <Text style={styles.ctaButtonText}>Update Profile</Text>
          </Pressable>
        </View>
      ) : !meQuery.data?.linked ? (
        <View style={styles.lookupCard}>
          <View style={styles.lockIconRow}>
            <Ionicons name="gift-outline" size={28} color={Colors.brand.gold} />
          </View>
          <Text style={styles.sectionTitle}>Join The 147 Rewards</Text>
          <Text style={styles.lookupDescription}>
            Earn points every time you spend at the venue and unlock exclusive rewards and scratch cards.
          </Text>
          <Pressable
            onPress={() => router.push("/(tabs)/loyalty")}
            style={({ pressed }) => [styles.enrollButton, { opacity: pressed ? 0.85 : 1 }]}
          >
            <Ionicons name="star" size={18} color="#FFF" />
            <Text style={styles.ctaButtonText}>Join via Membership Tab</Text>
          </Pressable>
        </View>
      ) : meQuery.data.account ? (
        <>
          {firstName ? (
            <Text style={styles.personalIntro}>Here's where you stand, {firstName}</Text>
          ) : null}

          <ScratchCardGame
            onScratchStart={() => scrollViewRef.current?.setNativeProps({ scrollEnabled: false })}
            onScratchEnd={() => scrollViewRef.current?.setNativeProps({ scrollEnabled: true })}
          />

          <PointsDisplay
            balance={meQuery.data.account.balance}
            terminology={meQuery.data.program?.terminology}
          />

          <NextRewardCard
            balance={meQuery.data.account.balance}
            rewardTiers={meQuery.data.program?.reward_tiers ?? []}
            terminology={meQuery.data.program?.terminology}
          />

          {meQuery.data.promo?.doublePointsToday && (
            <View style={styles.doublePointsBanner}>
              <Ionicons name="flash" size={18} color="#92400E" />
              <Text style={styles.doublePointsText}>
                🔥 Double points today on all visits!
              </Text>
            </View>
          )}

          {meQuery.data.birthday && (
            <BirthdayBanner
              birthday={meQuery.data.birthday}
              terminology={meQuery.data.program?.terminology}
            />
          )}

          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Ionicons name="trophy-outline" size={20} color={Colors.brand.gold} />
              <Text style={styles.statValue}>{meQuery.data.account.lifetime_points}</Text>
              <Text style={styles.statLabel}>
                Lifetime {meQuery.data.program?.terminology?.other ?? "Points"}
              </Text>
            </View>
            <View style={styles.statCard}>
              <Ionicons name="calendar-outline" size={20} color={Colors.brand.blue} />
              <Text style={styles.statValue}>
                {new Date(meQuery.data.account.enrolled_at).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}
              </Text>
              <Text style={styles.statLabel}>Member Since</Text>
            </View>
          </View>

          {meQuery.data.rewards && meQuery.data.rewards.length > 0 && (
            <ActiveRewardsSection
              rewards={meQuery.data.rewards}
              program={meQuery.data.program ?? null}
            />
          )}

          {meQuery.data.program?.reward_tiers && meQuery.data.program.reward_tiers.length > 0 && (
            <View style={styles.rewardsSection}>
              <View style={styles.sectionTitleRow}>
                <Ionicons name="ribbon" size={18} color={Colors.brand.gold} />
                <Text style={styles.sectionTitle}>All Reward Tiers</Text>
              </View>
              {meQuery.data.program.reward_tiers
                .slice()
                .sort((a, b) => a.points - b.points)
                .map((tier) => (
                  <RewardTierCard
                    key={tier.id}
                    tier={tier}
                    balance={meQuery.data!.account!.balance}
                    terminology={meQuery.data!.program?.terminology}
                  />
                ))}
            </View>
          )}

          {meQuery.data.events && meQuery.data.events.length > 0 && (
            <ActivityFeed
              events={meQuery.data.events.slice(0, 5)}
              program={meQuery.data.program ?? null}
            />
          )}

          <View style={styles.actionRow}>
            <Pressable
              onPress={() => meQuery.refetch()}
              disabled={meQuery.isFetching}
              style={({ pressed }) => [styles.refreshButton, { opacity: pressed ? 0.85 : 1 }]}
            >
              <Ionicons name="refresh" size={18} color={Colors.brand.blue} />
              <Text style={styles.refreshButtonText}>
                {meQuery.isFetching ? "Refreshing…" : "Refresh"}
              </Text>
            </Pressable>
          </View>

          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Ionicons name="information-circle-outline" size={18} color={Colors.light.textSecondary} />
              <Text style={styles.infoText}>
                Points are earned automatically when you pay at The 147. Show this screen at the till to redeem rewards.
              </Text>
            </View>
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  content: { paddingHorizontal: 0 },
  headerGradient: { marginHorizontal: 20, borderRadius: 16, padding: 24, alignItems: "center", gap: 8 },
  headerTitle: { fontSize: 22, fontWeight: "700", color: "#FFF", fontFamily: "Montserrat_700Bold" },
  headerSubtitle: { fontSize: 14, color: "rgba(255,255,255,0.7)", textAlign: "center", fontFamily: "Montserrat_400Regular" },
  personalIntro: { fontFamily: "Montserrat_500Medium", fontSize: 14, color: Colors.light.textSecondary, textAlign: "center", marginTop: 16, marginBottom: -4, paddingHorizontal: 20 },
  loadingWrap: { padding: 40, alignItems: "center", gap: 12 },
  loadingText: { fontSize: 14, color: Colors.light.textSecondary, fontFamily: "Montserrat_400Regular" },
  statusCard: { margin: 20, padding: 32, backgroundColor: Colors.light.surface, borderRadius: 16, alignItems: "center", gap: 12, elevation: 2 },
  statusTitle: { fontSize: 18, fontWeight: "700", color: Colors.light.text, fontFamily: "Montserrat_700Bold" },
  statusText: { fontSize: 14, color: Colors.light.textSecondary, textAlign: "center", lineHeight: 20, fontFamily: "Montserrat_400Regular" },
  lookupCard: { margin: 20, padding: 20, backgroundColor: Colors.light.surface, borderRadius: 16, elevation: 2 },
  lockIconRow: { alignItems: "center", marginBottom: 8 },
  lookupDescription: { fontSize: 14, color: Colors.light.textSecondary, marginBottom: 16, lineHeight: 20, fontFamily: "Montserrat_400Regular" },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: Colors.light.text, fontFamily: "Montserrat_700Bold" },
  ctaButton: { backgroundColor: Colors.brand.blue, borderRadius: 12, height: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 16 },
  ctaButtonText: { color: "#FFF", fontSize: 15, fontWeight: "600", fontFamily: "Montserrat_600SemiBold" },
  enrollButton: { backgroundColor: Colors.brand.gold, borderRadius: 12, height: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  pointsContainer: { marginHorizontal: 20, marginTop: 20 },
  pointsGradient: { borderRadius: 16, padding: 28, alignItems: "center", gap: 4 },
  pointsValue: { fontSize: 44, fontWeight: "800", color: "#FFF", fontFamily: "Montserrat_700Bold" },
  pointsLabel: { fontSize: 16, color: "rgba(255,255,255,0.85)", fontWeight: "600", textTransform: "uppercase", letterSpacing: 2, fontFamily: "Montserrat_600SemiBold" },
  nextRewardCard: { marginHorizontal: 20, marginTop: 12 },
  nextRewardGradient: { borderRadius: 16, padding: 20, gap: 10 },
  nextRewardTopRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  nextRewardEyebrow: { fontSize: 11, fontFamily: "Montserrat_600SemiBold", color: "rgba(255,255,255,0.85)", letterSpacing: 1.5, textTransform: "uppercase" },
  nextRewardHeadline: { fontSize: 20, fontFamily: "Montserrat_700Bold", color: "#FFF", lineHeight: 26 },
  nextRewardProgressBg: { height: 10, backgroundColor: "rgba(255,255,255,0.18)", borderRadius: 5, overflow: "hidden", marginTop: 4 },
  nextRewardProgressFill: { height: "100%", borderRadius: 5 },
  nextRewardFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  nextRewardSub: { fontSize: 12, fontFamily: "Montserrat_500Medium", color: "rgba(255,255,255,0.85)" },
  doublePointsBanner: { marginHorizontal: 20, marginTop: 12, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#FEF3C7", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: "#FCD34D" },
  doublePointsText: { flex: 1, fontFamily: "Montserrat_600SemiBold", fontSize: 13, color: "#92400E" },
  birthdayBannerInfo: { marginHorizontal: 20, marginTop: 12, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#EFF6FF", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: "#BFDBFE" },
  birthdayBannerInfoText: { flex: 1, fontFamily: "Montserrat_400Regular", fontSize: 12, color: Colors.brand.blue },
  birthdayBannerActive: { marginHorizontal: 20, marginTop: 12, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#FED7AA", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#FB923C" },
  birthdayBannerActiveText: { flex: 1, fontFamily: "Montserrat_600SemiBold", fontSize: 13, color: "#7C2D12" },
  birthdayBannerClaimed: { marginHorizontal: 20, marginTop: 12, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#DCFCE7", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: "#86EFAC" },
  birthdayBannerClaimedText: { flex: 1, fontFamily: "Montserrat_400Regular", fontSize: 12, color: "#166534" },
  statsRow: { flexDirection: "row", gap: 12, marginHorizontal: 20, marginTop: 12 },
  statCard: { flex: 1, backgroundColor: Colors.light.surface, borderRadius: 12, padding: 16, alignItems: "center", gap: 4, elevation: 1 },
  statValue: { fontSize: 16, fontWeight: "700", color: Colors.light.text, fontFamily: "Montserrat_700Bold" },
  statLabel: { fontSize: 11, color: Colors.light.textSecondary, textAlign: "center", fontFamily: "Montserrat_400Regular" },
  activeRewardsSection: { marginHorizontal: 20, marginTop: 20 },
  activeRewardsSubtitle: { fontSize: 13, color: Colors.light.textSecondary, marginBottom: 12, fontFamily: "Montserrat_400Regular", lineHeight: 18 },
  activeRewardCard: { borderRadius: 14, borderWidth: 2, borderColor: Colors.brand.gold, overflow: "hidden", marginBottom: 10, elevation: 3 },
  activeRewardInner: { flexDirection: "row", alignItems: "center", padding: 16, gap: 14 },
  activeRewardIconWrap: { width: 48, height: 48, borderRadius: 24, backgroundColor: "rgba(212,168,67,0.15)", alignItems: "center", justifyContent: "center" },
  activeRewardText: { flex: 1 },
  activeRewardName: { fontSize: 16, fontWeight: "700", color: Colors.light.text, fontFamily: "Montserrat_700Bold" },
  activeRewardDate: { fontSize: 12, color: Colors.light.textSecondary, marginTop: 2, fontFamily: "Montserrat_400Regular" },
  activeRewardBadge: { backgroundColor: Colors.brand.gold, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  activeRewardBadgeText: { color: "#FFF", fontSize: 11, fontWeight: "700", fontFamily: "Montserrat_700Bold", letterSpacing: 0.5 },
  showToStaffBanner: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: "#EFF6FF", borderTopWidth: 1, borderTopColor: "rgba(212,168,67,0.2)" },
  showToStaffText: { fontSize: 12, color: Colors.brand.blue, fontWeight: "600", fontFamily: "Montserrat_600SemiBold" },
  rewardsSection: { marginHorizontal: 20, marginTop: 20 },
  tierCard: { backgroundColor: Colors.light.surface, borderRadius: 14, padding: 16, marginBottom: 10, elevation: 1 },
  tierCardRedeemable: { borderWidth: 1.5, borderColor: Colors.brand.gold },
  tierHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 10 },
  tierInfo: { flex: 1 },
  tierName: { fontSize: 15, fontWeight: "600", color: Colors.light.text, fontFamily: "Montserrat_600SemiBold" },
  tierPoints: { fontSize: 12, color: Colors.light.textSecondary, fontFamily: "Montserrat_400Regular" },
  redeemBadge: { backgroundColor: Colors.brand.gold, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  redeemBadgeText: { color: "#FFF", fontSize: 12, fontWeight: "700", fontFamily: "Montserrat_700Bold" },
  progressBarBg: { height: 6, backgroundColor: "#E5E7EB", borderRadius: 3, overflow: "hidden" },
  progressBarFill: { height: "100%", backgroundColor: Colors.brand.gold, borderRadius: 3 },
  progressText: { fontSize: 12, color: Colors.light.textSecondary, marginTop: 6, fontFamily: "Montserrat_400Regular" },
  activitySection: { marginHorizontal: 20, marginTop: 20, backgroundColor: Colors.light.surface, borderRadius: 16, padding: 16, elevation: 1 },
  activityRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  activityRowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.light.border },
  activityIconWrap: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  activityText: { flex: 1 },
  activityLabel: { fontSize: 13, fontWeight: "600", color: Colors.light.text, fontFamily: "Montserrat_600SemiBold" },
  activitySub: { fontSize: 11, color: Colors.light.textSecondary, marginTop: 2, fontFamily: "Montserrat_400Regular" },
  activityDate: { fontSize: 11, color: Colors.light.textSecondary, fontFamily: "Montserrat_400Regular", textAlign: "right", flexShrink: 0 },
  actionRow: { flexDirection: "row", gap: 12, marginHorizontal: 20, marginTop: 16 },
  refreshButton: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 44, borderRadius: 12, backgroundColor: Colors.light.surface, borderWidth: 1, borderColor: Colors.brand.blue },
  refreshButtonText: { color: Colors.brand.blue, fontSize: 14, fontWeight: "600", fontFamily: "Montserrat_600SemiBold" },
  infoCard: { margin: 20, padding: 16, backgroundColor: Colors.light.surface, borderRadius: 12 },
  infoRow: { flexDirection: "row", gap: 10 },
  infoText: { fontSize: 12, color: Colors.light.textSecondary, flex: 1, lineHeight: 18, fontFamily: "Montserrat_400Regular" },
});
