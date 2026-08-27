import React, { useContext, useState, useCallback, useMemo } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BottomTabBarHeightContext } from "@react-navigation/bottom-tabs";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { useColors } from "@/hooks/useColors";
const baseColors = Colors;
import { getApiUrl } from "@/lib/query-client";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import { useCustomerGreeting } from "@/hooks/useCustomerGreeting";
import { useResponsive } from "@/hooks/useResponsive";
import { ScratchCardGame } from "@/components/ScratchCardGame";

const SHOW_SQUARE_REWARD_TIERS = false;

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

interface VenueRewardTierItem {
  id: number;
  name: string;
  description: string | null;
  category: string;
  pointsCost: number;
  active: boolean;
  sortOrder: number;
}

interface VenueRewardClaimItem {
  id: number;
  tierId: number;
  claimCode: string;
  status: string;
  pointsDeducted: number;
  expiresAt: string;
  createdAt: string;
  tierName?: string;
  tierCategory?: string;
}

interface VenueRewardsResponse {
  tiers: VenueRewardTierItem[];
  pendingClaims: VenueRewardClaimItem[];
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

interface GamePrizeClaim {
  id: number;
  customerId: number;
  customerName: string | null;
  prizeName: string;
  prizeType: string;
  playedAt: string;
  londonDate: string;
  prizeClaimCode: string | null;
  prizeClaimExpiresAt: string | null;
}

interface GameMyPrizesResponse {
  playedToday: boolean;
  plays: unknown[];
  pendingClaims: GamePrizeClaim[];
}

function categoryIcon(cat: string): React.ComponentProps<typeof Ionicons>["name"] {
  switch (cat) {
    case "food": return "restaurant-outline";
    case "drink": return "wine-outline";
    case "table": return "grid-outline";
    case "experience": return "star-outline";
    default: return "gift-outline";
  }
}

function formatExpiry(isoDate: string): string {
  const expiresAt = new Date(isoDate);
  const minutesLeft = Math.max(0, Math.round((expiresAt.getTime() - Date.now()) / 60000));
  const hoursLeft = Math.floor(minutesLeft / 60);
  const minsLeft = minutesLeft % 60;
  const daysLeft = Math.floor(hoursLeft / 24);
  if (daysLeft > 0) return `${daysLeft}d ${hoursLeft % 24}h left`;
  if (hoursLeft > 0) return `${hoursLeft}h ${minsLeft}m left`;
  return `${minutesLeft}m left`;
}

// ── Wallet ─────────────────────────────────────────────────────────────────────
// Shows all redeemable prizes/vouchers a customer can hand to staff right now.
// Excludes: loyalty_points (auto-applied, no code needed).

function VoucherCard({
  accentColor,
  typeLabel,
  icon,
  name,
  code,
  footer,
}: {
  accentColor: string;
  typeLabel: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  name: string;
  code?: string | null;
  footer: string;
}) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={[styles.voucherOuter, { borderColor: accentColor }]}>
      <View style={[styles.voucherAccent, { backgroundColor: accentColor }]} />
      <View style={styles.voucherInner}>
        <View style={styles.voucherTopRow}>
          <View style={[styles.voucherIconWrap, { backgroundColor: `${accentColor}22` }]}>
            <Ionicons name={icon} size={20} color={accentColor} />
          </View>
          <View style={styles.voucherMeta}>
            <Text style={[styles.voucherTypeLabel, { color: accentColor }]}>{typeLabel}</Text>
            <Text style={styles.voucherName} numberOfLines={2}>{name}</Text>
          </View>
        </View>
        {code ? (
          <View style={styles.voucherCodeWrap}>
            <View style={styles.voucherCodeDash} />
            <View style={[styles.voucherCodePill, { backgroundColor: accentColor }]}>
              <Text style={styles.voucherCodeText}>{code}</Text>
            </View>
            <View style={styles.voucherCodeDash} />
          </View>
        ) : null}
        <View style={styles.voucherFooterRow}>
          <Ionicons name="people-outline" size={13} color={colors.textSecondary} />
          <Text style={styles.voucherFooterText}>{footer}</Text>
        </View>
      </View>
    </View>
  );
}

function WalletSection({
  gameClaims,
  venueClaims,
  squareRewards,
  program,
}: {
  gameClaims: GamePrizeClaim[];
  venueClaims: VenueRewardClaimItem[];
  squareRewards: IssuedReward[];
  program: LoyaltyProgram | null;
}) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const totalCount = gameClaims.length + venueClaims.length + squareRewards.length;

  return (
    <View style={styles.walletSection}>
      <View style={styles.walletHeader}>
        <View style={styles.walletTitleRow}>
          <Ionicons name="wallet-outline" size={20} color={Colors.brand.gold} />
          <Text style={styles.walletTitle}>Your Wallet</Text>
        </View>
        {totalCount > 0 && (
          <View style={styles.walletBadge}>
            <Text style={styles.walletBadgeText}>{totalCount}</Text>
          </View>
        )}
      </View>

      {totalCount === 0 ? (
        <View style={styles.walletEmpty}>
          <Ionicons name="ticket-outline" size={32} color={colors.textSecondary} />
          <Text style={styles.walletEmptyTitle}>No active vouchers</Text>
          <Text style={styles.walletEmptyText}>Play the scratch card or spend points to earn prizes and vouchers.</Text>
        </View>
      ) : (
        <View style={styles.walletCards}>
          {gameClaims.map((claim) => {
            const expiryStr = claim.prizeClaimExpiresAt ? formatExpiry(claim.prizeClaimExpiresAt) : null;
            return (
              <VoucherCard
                key={`game-${claim.id}`}
                accentColor={Colors.brand.gold}
                typeLabel="🎰 GAME PRIZE"
                icon="trophy-outline"
                name={claim.prizeName}
                code={claim.prizeClaimCode}
                footer={expiryStr
                  ? `Show code to staff · ${expiryStr}`
                  : `Show code to staff · Won ${new Date(claim.playedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`}
              />
            );
          })}
          {venueClaims.map((claim) => (
            <VoucherCard
              key={`venue-${claim.id}`}
              accentColor="#7C3AED"
              typeLabel="🎟️ VENUE REWARD"
              icon={categoryIcon(claim.tierCategory ?? "other")}
              name={claim.tierName ?? "Venue Reward"}
              code={claim.claimCode}
              footer={`Show code to staff · ${formatExpiry(claim.expiresAt)}`}
            />
          ))}
          {squareRewards.map((reward) => {
            const tier = program?.reward_tiers?.find((t) => t.id === reward.reward_tier_id);
            const earned = new Date(reward.created_at).toLocaleDateString("en-GB", {
              day: "numeric", month: "short",
            });
            return (
              <VoucherCard
                key={`square-${reward.id}`}
                accentColor={Colors.brand.blue}
                typeLabel="⭐ LOYALTY REWARD"
                icon="gift-outline"
                name={tier?.name ?? "Loyalty Reward"}
                code={null}
                footer={`Show this screen to staff · Issued ${earned}`}
              />
            );
          })}
        </View>
      )}
    </View>
  );
}

function PointsDisplay({ balance, terminology }: { balance: number; terminology?: { one: string; other: string } }) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
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
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
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
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
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

function VenueRewardsSection({
  tiers,
  pendingClaims,
  balance,
  onClaim,
  isClaiming,
}: {
  tiers: VenueRewardTierItem[];
  pendingClaims: VenueRewardClaimItem[];
  balance: number;
  onClaim: (tier: VenueRewardTierItem) => void;
  isClaiming: boolean;
}) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  if (tiers.length === 0) return null;

  return (
    <View style={styles.venueSection}>
      <View style={styles.sectionTitleRow}>
        <Ionicons name="storefront-outline" size={18} color="#7C3AED" />
        <Text style={styles.sectionTitle}>Venue Rewards</Text>
      </View>
      <Text style={styles.venueSubtitle}>
        Spend your points on venue experiences — drinks, food, table time, and more.
      </Text>
      {tiers.map((tier) => {
        const canClaim = balance >= tier.pointsCost;
        const alreadyPending = pendingClaims.some((c) => c.tierId === tier.id);
        return (
          <View key={tier.id} style={[styles.venueTierCard, canClaim && styles.venueTierCardReady]}>
            <View style={styles.venueTierIconWrap}>
              <Ionicons
                name={categoryIcon(tier.category)}
                size={26}
                color={canClaim ? "#7C3AED" : colors.textSecondary}
              />
            </View>
            <View style={styles.venueTierBody}>
              <Text style={styles.venueTierName}>{tier.name}</Text>
              {tier.description ? (
                <Text style={styles.venueTierDesc}>{tier.description}</Text>
              ) : null}
              <Text style={styles.venueTierPoints}>{tier.pointsCost} points</Text>
            </View>
            <Pressable
              onPress={() => onClaim(tier)}
              disabled={!canClaim || isClaiming || alreadyPending}
              style={({ pressed }) => [
                styles.venueClaimBtn,
                canClaim && !alreadyPending && styles.venueClaimBtnActive,
                (pressed && canClaim) && { opacity: 0.8 },
              ]}
            >
              <Text style={[styles.venueClaimBtnText, canClaim && !alreadyPending && styles.venueClaimBtnTextActive]}>
                {alreadyPending ? "Claimed" : canClaim ? "Claim" : `${tier.pointsCost - balance} more`}
              </Text>
            </Pressable>
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
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
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
          color={canRedeem ? Colors.brand.gold : colors.textSecondary}
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
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
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
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { tabletPad } = useResponsive();
  const isWeb = Platform.OS === "web";
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0;
  const queryClient = useQueryClient();

  const [scratchActive, setScratchActive] = useState(false);
  const onScratchStart = useCallback(() => setScratchActive(true), []);
  const onScratchEnd   = useCallback(() => setScratchActive(false), []);

  const { isAuthenticated, customer, getCustomerToken } = useCustomerAuth();
  const { firstName } = useCustomerGreeting();
  const [isClaiming, setIsClaiming] = useState(false);

  const venueRewardsQuery = useQuery<VenueRewardsResponse>({
    queryKey: ["/api/venue-rewards", customer?.id],
    queryFn: async () => {
      const token = getCustomerToken();
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(new URL("/api/venue-rewards", getApiUrl()).toString(), { headers });
      if (!res.ok) throw new Error("Failed to load venue rewards");
      return res.json();
    },
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
    enabled: isAuthenticated,
  });

  const gamePrizesQuery = useQuery<GameMyPrizesResponse>({
    queryKey: ["/api/game/my-prizes", customer?.id],
    queryFn: async () => {
      const token = getCustomerToken();
      if (!token) return { playedToday: false, plays: [], pendingClaims: [] };
      const res = await fetch(new URL("/api/game/my-prizes", getApiUrl()).toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return { playedToday: false, plays: [], pendingClaims: [] };
      return res.json();
    },
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
    enabled: isAuthenticated,
  });

  const handleVenueClaim = useCallback(async (tier: VenueRewardTierItem) => {
    if (isClaiming) return;
    const token = getCustomerToken();
    if (!token) return;
    setIsClaiming(true);
    try {
      const res = await fetch(new URL(`/api/venue-rewards/${tier.id}/claim`, getApiUrl()).toString(), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) {
        Alert.alert("Couldn't claim reward", data.message || "Please try again.");
        return;
      }
      await Promise.all([venueRewardsQuery.refetch(), meQuery.refetch()]);
      Alert.alert(
        "Reward claimed! 🎉",
        `Your claim code is: ${data.claim?.claimCode ?? ""}\n\nShow this to a member of staff. Valid for 7 days.`
      );
    } catch {
      Alert.alert("Error", "Something went wrong. Please try again.");
    } finally {
      setIsClaiming(false);
    }
  }, [isClaiming, getCustomerToken, venueRewardsQuery]);

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

  const handleRefresh = useCallback(() => {
    meQuery.refetch();
    venueRewardsQuery.refetch();
    gamePrizesQuery.refetch();
  }, [meQuery, venueRewardsQuery, gamePrizesQuery]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: (isWeb ? 67 : insets.top) + 16, paddingBottom: tabBarHeight + 20, paddingHorizontal: tabletPad },
      ]}
      keyboardShouldPersistTaps="handled"
      scrollEnabled={!scratchActive}
    >
      {Platform.OS === "ios" ? (
        <BlurView intensity={55} tint={colors.scheme} style={styles.headerGradient}>
          <Ionicons name="gift" size={28} color={Colors.brand.gold} />
          <Text style={styles.headerTitle}>Rewards</Text>
          <Text style={styles.headerSubtitle}>
            {firstName
              ? `${firstName} — scratch cards, points & prizes`
              : "Scratch cards, points & prizes"}
          </Text>
        </BlurView>
      ) : (
        <View style={[styles.headerGradient, { backgroundColor: colors.surface }]}>
          <Ionicons name="gift" size={28} color={Colors.brand.gold} />
          <Text style={styles.headerTitle}>Rewards</Text>
          <Text style={styles.headerSubtitle}>
            {firstName
              ? `${firstName} — scratch cards, points & prizes`
              : "Scratch cards, points & prizes"}
          </Text>
        </View>
      )}

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
          <Ionicons name="cloud-offline-outline" size={40} color={colors.textSecondary} />
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
          <Ionicons name="alert-circle-outline" size={40} color={colors.textSecondary} />
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

          {/* ── Wallet — active vouchers/prizes ─────────────────────────────── */}
          <WalletSection
            gameClaims={gamePrizesQuery.data?.pendingClaims ?? []}
            venueClaims={venueRewardsQuery.data?.pendingClaims ?? []}
            squareRewards={meQuery.data.rewards ?? []}
            program={meQuery.data.program ?? null}
          />

          <ScratchCardGame
            onScratchStart={onScratchStart}
            onScratchEnd={onScratchEnd}
          />

          <PointsDisplay
            balance={meQuery.data.account.balance}
            terminology={meQuery.data.program?.terminology}
          />

          {SHOW_SQUARE_REWARD_TIERS && (
            <NextRewardCard
              balance={meQuery.data.account.balance}
              rewardTiers={meQuery.data.program?.reward_tiers ?? []}
              terminology={meQuery.data.program?.terminology}
            />
          )}

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

          {venueRewardsQuery.data && (
            <VenueRewardsSection
              tiers={venueRewardsQuery.data.tiers}
              pendingClaims={venueRewardsQuery.data.pendingClaims}
              balance={meQuery.data.account.balance}
              onClaim={handleVenueClaim}
              isClaiming={isClaiming}
            />
          )}

          {SHOW_SQUARE_REWARD_TIERS && meQuery.data.program?.reward_tiers && meQuery.data.program.reward_tiers.length > 0 && (
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
              onPress={handleRefresh}
              disabled={meQuery.isFetching || venueRewardsQuery.isFetching || gamePrizesQuery.isFetching}
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
              <Ionicons name="information-circle-outline" size={18} color={colors.textSecondary} />
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

const createStyles = (palette: ReturnType<typeof useColors>) => {
  const Colors = { ...baseColors, light: palette };
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  content: { paddingHorizontal: 0 },
  headerGradient: { marginHorizontal: 20, borderRadius: 16, padding: 24, alignItems: "center", gap: 8, overflow: "hidden" as const },
  headerTitle: { fontSize: 22, fontWeight: "700", color: palette.text, fontFamily: "Montserrat_700Bold" },
  headerSubtitle: { fontSize: 14, color: palette.textSecondary, textAlign: "center", fontFamily: "Montserrat_400Regular" },
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
  doublePointsBanner: { marginHorizontal: 20, marginTop: 12, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(212,168,67,0.1)", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: "rgba(212,168,67,0.3)" },
  doublePointsText: { flex: 1, fontFamily: "Montserrat_600SemiBold", fontSize: 13, color: "#D4A843" },
  birthdayBannerInfo: { marginHorizontal: 20, marginTop: 12, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(59,130,246,0.1)", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: "rgba(59,130,246,0.25)" },
  birthdayBannerInfoText: { flex: 1, fontFamily: "Montserrat_400Regular", fontSize: 12, color: Colors.brand.blue },
  birthdayBannerActive: { marginHorizontal: 20, marginTop: 12, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(251,146,60,0.12)", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "rgba(251,146,60,0.3)" },
  birthdayBannerActiveText: { flex: 1, fontFamily: "Montserrat_600SemiBold", fontSize: 13, color: "#FB923C" },
  birthdayBannerClaimed: { marginHorizontal: 20, marginTop: 12, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(34,197,94,0.1)", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: "rgba(34,197,94,0.25)" },
  birthdayBannerClaimedText: { flex: 1, fontFamily: "Montserrat_400Regular", fontSize: 12, color: "#4ade80" },
  statsRow: { flexDirection: "row", gap: 12, marginHorizontal: 20, marginTop: 12 },
  statCard: { flex: 1, backgroundColor: Colors.light.surface, borderRadius: 12, padding: 16, alignItems: "center", gap: 4, elevation: 1 },
  statValue: { fontSize: 16, fontWeight: "700", color: Colors.light.text, fontFamily: "Montserrat_700Bold" },
  statLabel: { fontSize: 11, color: Colors.light.textSecondary, textAlign: "center", fontFamily: "Montserrat_400Regular" },
  rewardsSection: { marginHorizontal: 20, marginTop: 20 },
  tierCard: { backgroundColor: Colors.light.surface, borderRadius: 14, padding: 16, marginBottom: 10, elevation: 1 },
  tierCardRedeemable: { borderWidth: 1.5, borderColor: Colors.brand.gold },
  tierHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 10 },
  tierInfo: { flex: 1 },
  tierName: { fontSize: 15, fontWeight: "600", color: Colors.light.text, fontFamily: "Montserrat_600SemiBold" },
  tierPoints: { fontSize: 12, color: Colors.light.textSecondary, fontFamily: "Montserrat_400Regular" },
  redeemBadge: { backgroundColor: Colors.brand.gold, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  redeemBadgeText: { color: "#FFF", fontSize: 12, fontWeight: "700", fontFamily: "Montserrat_700Bold" },
  progressBarBg: { height: 6, backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 3, overflow: "hidden" },
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
  // ── Wallet ──────────────────────────────────────────────────────────────────
  walletSection: { marginHorizontal: 20, marginTop: 20 },
  walletHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  walletTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  walletTitle: { fontSize: 18, fontWeight: "700", color: Colors.light.text, fontFamily: "Montserrat_700Bold" },
  walletBadge: { backgroundColor: Colors.brand.gold, borderRadius: 12, minWidth: 24, height: 24, paddingHorizontal: 8, alignItems: "center", justifyContent: "center" },
  walletBadgeText: { color: "#FFF", fontSize: 13, fontWeight: "700", fontFamily: "Montserrat_700Bold" },
  walletEmpty: { backgroundColor: Colors.light.surface, borderRadius: 16, padding: 28, alignItems: "center", gap: 10, borderWidth: 1, borderColor: Colors.light.border, borderStyle: "dashed" },
  walletEmptyTitle: { fontSize: 15, fontWeight: "600", color: Colors.light.text, fontFamily: "Montserrat_600SemiBold" },
  walletEmptyText: { fontSize: 13, color: Colors.light.textSecondary, textAlign: "center", lineHeight: 18, fontFamily: "Montserrat_400Regular" },
  walletCards: { gap: 12 },
  // ── Voucher card ────────────────────────────────────────────────────────────
  voucherOuter: { flexDirection: "row", borderRadius: 16, borderWidth: 1.5, overflow: "hidden", backgroundColor: Colors.light.surface, elevation: 3 },
  voucherAccent: { width: 6 },
  voucherInner: { flex: 1, padding: 14, gap: 10 },
  voucherTopRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  voucherIconWrap: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  voucherMeta: { flex: 1 },
  voucherTypeLabel: { fontSize: 10, fontWeight: "700", fontFamily: "Montserrat_700Bold", letterSpacing: 1.2, textTransform: "uppercase" },
  voucherName: { fontSize: 16, fontWeight: "700", color: Colors.light.text, fontFamily: "Montserrat_700Bold", marginTop: 2, lineHeight: 20 },
  voucherCodeWrap: { flexDirection: "row", alignItems: "center", gap: 8 },
  voucherCodeDash: { flex: 1, height: 1, borderTopWidth: 1, borderTopColor: Colors.light.border, borderStyle: "dashed" },
  voucherCodePill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10 },
  voucherCodeText: { fontSize: 22, fontWeight: "800", color: "#FFF", fontFamily: "Montserrat_700Bold", letterSpacing: 4 },
  voucherFooterRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  voucherFooterText: { fontSize: 12, color: Colors.light.textSecondary, fontFamily: "Montserrat_400Regular" },
  // ── Venue Rewards (spend section) ───────────────────────────────────────────
  venueSection: { marginHorizontal: 20, marginTop: 20, gap: 0 },
  venueSubtitle: { fontSize: 13, color: Colors.light.textSecondary, marginBottom: 12, fontFamily: "Montserrat_400Regular", lineHeight: 18 },
  venueTierCard: { flexDirection: "row", alignItems: "center", backgroundColor: Colors.light.surface, borderRadius: 14, padding: 14, marginBottom: 10, gap: 12, elevation: 1 },
  venueTierCardReady: { borderWidth: 1.5, borderColor: "#7C3AED" },
  venueTierIconWrap: { width: 48, height: 48, borderRadius: 24, backgroundColor: "rgba(124,58,237,0.2)", alignItems: "center", justifyContent: "center" },
  venueTierBody: { flex: 1 },
  venueTierName: { fontSize: 15, fontWeight: "600", color: Colors.light.text, fontFamily: "Montserrat_600SemiBold" },
  venueTierDesc: { fontSize: 11, color: Colors.light.textSecondary, marginTop: 2, fontFamily: "Montserrat_400Regular", lineHeight: 15 },
  venueTierPoints: { fontSize: 12, color: "#7C3AED", fontFamily: "Montserrat_600SemiBold", marginTop: 4 },
  venueClaimBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.1)", minWidth: 60, alignItems: "center" },
  venueClaimBtnActive: { backgroundColor: "#7C3AED" },
  venueClaimBtnText: { fontSize: 13, fontWeight: "700", color: Colors.light.textSecondary, fontFamily: "Montserrat_700Bold" },
  venueClaimBtnTextActive: { color: "#FFF" },
  });
};
