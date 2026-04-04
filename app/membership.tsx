import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Colors from "@/constants/colors";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import { getApiUrl } from "@/lib/query-client";

const TOKEN_KEY = "customer_session_token";

interface MembershipPlan {
  id: number;
  name: string;
  tier: string;
  priceMonthly: number;
  description: string | null;
  color: string | null;
  hoursIncluded: number | null;
  hoursUnit: string | null;
  foodDrinkDiscount: number | null;
  priorityBooking: boolean | null;
  loyaltyMultiplier: number | null;
  guestPassesMonthly: number | null;
  sortOrder: number | null;
  active: boolean;
}

interface MembershipSubscription {
  id: number;
  planId: number;
  status: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  hoursUsedThisPeriod: number | null;
  guestPassesUsed: number | null;
  plan: MembershipPlan | null;
}

const PLAN_ICONS: Record<string, { name: keyof typeof Ionicons.glyphMap; tagline: string; popular?: boolean }> = {
  rack: { name: "ellipse", tagline: "Perfect for casual players" },
  century: { name: "trophy", tagline: "Most popular", popular: true },
  maximum: { name: "diamond", tagline: "The full experience" },
};

function getPlanMeta(tier: string) {
  return PLAN_ICONS[tier] ?? { name: "card" as const, tagline: "" };
}

function getPlanFeatures(plan: MembershipPlan): { icon: keyof typeof Ionicons.glyphMap; text: string }[] {
  const features: { icon: keyof typeof Ionicons.glyphMap; text: string }[] = [];
  if (plan.hoursIncluded) {
    features.push({ icon: "time-outline", text: `${plan.hoursIncluded} hours snooker per month` });
  } else {
    features.push({ icon: "infinite-outline", text: "Unlimited snooker" });
  }
  if (plan.foodDrinkDiscount) {
    features.push({ icon: "restaurant-outline", text: `${plan.foodDrinkDiscount}% food & drink discount` });
  }
  if (plan.priorityBooking) {
    features.push({ icon: "flash-outline", text: "Priority booking access" });
  }
  if (plan.guestPassesMonthly && plan.guestPassesMonthly > 0) {
    features.push({ icon: "people-outline", text: `${plan.guestPassesMonthly} guest pass per month` });
  }
  if (plan.loyaltyMultiplier && plan.loyaltyMultiplier > 1) {
    features.push({ icon: "star-outline", text: `${plan.loyaltyMultiplier}× loyalty points on every visit` });
  } else {
    features.push({ icon: "star-outline", text: "Member loyalty points" });
  }
  return features;
}

async function getToken(): Promise<string> {
  return (await AsyncStorage.getItem(TOKEN_KEY)) || "";
}

export default function MembershipScreen() {
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isLoading: authLoading, customer } = useCustomerAuth();
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [joining, setJoining] = useState(false);
  const queryClient = useQueryClient();

  const { data: plans = [], isLoading: plansLoading } = useQuery<MembershipPlan[]>({
    queryKey: ["/api/membership/plans"],
  });

  const { data: subscription, isLoading: subLoading } = useQuery<MembershipSubscription | null>({
    queryKey: ["/api/membership/my-subscription"],
    enabled: isAuthenticated,
    queryFn: async () => {
      const token = await getToken();
      const url = new URL("/api/membership/my-subscription", getApiUrl());
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return null;
      return res.json();
    },
  });

  const joinMutation = useMutation({
    mutationFn: async (planId: number) => {
      const token = await getToken();
      const url = new URL("/api/membership/join", getApiUrl());
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ planId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to join");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/membership/my-subscription"] });
      setJoining(false);
      setSelectedPlanId(null);
    },
    onError: (err: Error) => {
      Alert.alert("Error", err.message);
    },
  });

  const selectedPlan = plans.find((p) => p.id === selectedPlanId) ?? null;

  const handleJoin = () => {
    if (!selectedPlanId || !selectedPlan) return;
    Alert.alert(
      "Confirm Membership",
      `Join the ${selectedPlan.name} plan for £${(selectedPlan.priceMonthly / 100).toFixed(2)}/month?\n\nA member of staff will finalise your billing details.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm",
          onPress: () => joinMutation.mutate(selectedPlanId),
        },
      ]
    );
  };

  const isLoading = authLoading || plansLoading || (isAuthenticated && subLoading);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0) }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={22} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Membership</Text>
        <View style={{ width: 38 }} />
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.brand.blue} />
        </View>
      ) : subscription ? (
        <ActiveMembership subscription={subscription} insets={insets} />
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 20) },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.hero}>
            <View style={styles.heroIcon}>
              <Ionicons name="card" size={32} color={Colors.brand.blue} />
            </View>
            <Text style={styles.heroTitle}>The 147 Membership</Text>
            <Text style={styles.heroSub}>
              Join our exclusive membership programme and make the most of every visit — discounts, priority booking, and more.
            </Text>
          </View>

          {plans.map((plan) => {
            const meta = getPlanMeta(plan.tier);
            const planColor = plan.color || Colors.brand.blue;
            const isSelected = selectedPlanId === plan.id;
            const features = getPlanFeatures(plan);
            return (
              <Pressable
                key={plan.id}
                onPress={() => setSelectedPlanId(isSelected ? null : plan.id)}
                style={[
                  styles.planCard,
                  meta.popular && styles.planCardPopular,
                  isSelected && { borderColor: planColor, borderWidth: 2 },
                ]}
              >
                {meta.popular && (
                  <View style={[styles.popularBadge, { backgroundColor: planColor }]}>
                    <Text style={styles.popularBadgeText}>Most Popular</Text>
                  </View>
                )}
                <View style={styles.planHeader}>
                  <View style={[styles.planIconWrap, { backgroundColor: planColor + "22" }]}>
                    <Ionicons name={meta.name} size={20} color={planColor} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.planName}>{plan.name}</Text>
                    <Text style={styles.planTagline}>{meta.tagline}</Text>
                  </View>
                  <View style={styles.priceBlock}>
                    <Text style={[styles.planPrice, { color: planColor }]}>
                      £{(plan.priceMonthly / 100).toFixed(2)}
                    </Text>
                    <Text style={styles.planPeriod}>/month</Text>
                  </View>
                </View>
                <View style={styles.featureList}>
                  {features.map((f, i) => (
                    <View key={i} style={styles.featureRow}>
                      <View style={[styles.featureDot, { backgroundColor: planColor + "33" }]}>
                        <Ionicons name={f.icon} size={12} color={planColor} />
                      </View>
                      <Text style={styles.featureText}>{f.text}</Text>
                    </View>
                  ))}
                </View>
                {isSelected && (
                  <View style={[styles.selectedCheck, { backgroundColor: planColor }]}>
                    <Ionicons name="checkmark" size={14} color="#fff" />
                  </View>
                )}
              </Pressable>
            );
          })}

          {isAuthenticated ? (
            selectedPlanId ? (
              <Pressable
                style={[styles.joinBtn, joinMutation.isPending && styles.joinBtnDisabled]}
                onPress={handleJoin}
                disabled={joinMutation.isPending}
              >
                {joinMutation.isPending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="card-outline" size={18} color="#fff" />
                    <Text style={styles.joinBtnText}>
                      Join {selectedPlan?.name} — £{selectedPlan ? (selectedPlan.priceMonthly / 100).toFixed(2) : ""}/mo
                    </Text>
                  </>
                )}
              </Pressable>
            ) : (
              <View style={styles.selectHint}>
                <Ionicons name="hand-left-outline" size={16} color={Colors.light.textSecondary} />
                <Text style={styles.selectHintText}>Select a plan above to get started</Text>
              </View>
            )
          ) : (
            <View style={styles.loginPrompt}>
              <Ionicons name="person-circle-outline" size={32} color={Colors.brand.blue} />
              <Text style={styles.loginPromptTitle}>Sign in to join</Text>
              <Text style={styles.loginPromptSub}>
                Create a free account or sign in to start your membership.
              </Text>
              <Pressable style={styles.loginBtn} onPress={() => router.push("/account")}>
                <Text style={styles.loginBtnText}>Sign In / Register</Text>
              </Pressable>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function ActiveMembership({
  subscription,
  insets,
}: {
  subscription: MembershipSubscription;
  insets: ReturnType<typeof useSafeAreaInsets>;
}) {
  const plan = subscription.plan;
  const planColor = plan?.color || Colors.brand.blue;
  const meta = plan ? getPlanMeta(plan.tier) : { name: "card" as const, tagline: "" };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  };

  const statusColor =
    subscription.status === "active"
      ? "#10B981"
      : subscription.status === "paused"
      ? "#F59E0B"
      : "#EF4444";
  const statusLabel =
    subscription.status === "active"
      ? "Active"
      : subscription.status === "paused"
      ? "Paused"
      : subscription.status === "pending"
      ? "Pending"
      : "Cancelled";

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 20) },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.memberCard, { borderColor: planColor + "60" }]}>
        <View style={[styles.memberCardAccent, { backgroundColor: planColor }]} />
        <View style={styles.memberCardContent}>
          <View style={styles.memberCardTop}>
            <View style={[styles.memberCardIcon, { backgroundColor: planColor + "22" }]}>
              <Ionicons name={meta.name} size={28} color={planColor} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.memberCardLabel}>THE 147 MEMBER</Text>
              <Text style={[styles.memberCardPlan, { color: planColor }]}>
                {plan?.name ?? "Membership"} Plan
              </Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: statusColor + "20" }]}>
              <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
              <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
            </View>
          </View>

          <View style={styles.memberCardDivider} />

          <View style={styles.memberCardStats}>
            <View style={styles.memberCardStat}>
              <Text style={styles.memberCardStatLabel}>Monthly fee</Text>
              <Text style={styles.memberCardStatValue}>
                £{plan ? (plan.priceMonthly / 100).toFixed(2) : "—"}
              </Text>
            </View>
            {plan?.hoursIncluded ? (
              <View style={styles.memberCardStat}>
                <Text style={styles.memberCardStatLabel}>Hours used</Text>
                <Text style={styles.memberCardStatValue}>
                  {subscription.hoursUsedThisPeriod ?? 0}/{plan.hoursIncluded}h
                </Text>
              </View>
            ) : null}
            {plan?.foodDrinkDiscount ? (
              <View style={styles.memberCardStat}>
                <Text style={styles.memberCardStatLabel}>F&D discount</Text>
                <Text style={styles.memberCardStatValue}>{plan.foodDrinkDiscount}%</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.memberCardDivider} />

          <View style={styles.memberCardDates}>
            <Ionicons name="calendar-outline" size={14} color={Colors.light.textSecondary} />
            <Text style={styles.memberCardDatesText}>
              Renews {formatDate(subscription.currentPeriodEnd)}
            </Text>
          </View>
        </View>
      </View>

      {plan && (
        <View style={styles.benefitsSection}>
          <Text style={styles.benefitsSectionTitle}>Your Benefits</Text>
          {getPlanFeatures(plan).map((f, i) => (
            <View key={i} style={styles.benefitRow}>
              <View style={[styles.benefitDot, { backgroundColor: planColor + "22" }]}>
                <Ionicons name={f.icon} size={14} color={planColor} />
              </View>
              <Text style={styles.benefitText}>{f.text}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.contactBox}>
        <Ionicons name="information-circle-outline" size={18} color={Colors.light.textSecondary} />
        <Text style={styles.contactText}>
          To make changes to your membership, please speak to a member of staff at the club or email{" "}
          <Text style={{ color: Colors.brand.blue }}>info@the147bradford.co.uk</Text>
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
    backgroundColor: Colors.light.background,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.light.surface,
  },
  headerTitle: { fontFamily: "Montserrat_700Bold", fontSize: 17, color: Colors.light.text },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 20, gap: 16 },
  hero: { alignItems: "center", paddingVertical: 8, marginBottom: 4 },
  heroIcon: {
    width: 64, height: 64, borderRadius: 20,
    backgroundColor: Colors.brand.blue + "15",
    alignItems: "center", justifyContent: "center", marginBottom: 16,
  },
  heroTitle: {
    fontFamily: "Montserrat_700Bold", fontSize: 24,
    color: Colors.light.text, textAlign: "center", marginBottom: 10,
  },
  heroSub: {
    fontFamily: "Montserrat_400Regular", fontSize: 14,
    color: Colors.light.textSecondary, textAlign: "center", lineHeight: 22,
  },
  planCard: {
    backgroundColor: Colors.light.surface, borderRadius: 16,
    padding: 18, borderWidth: 1.5, borderColor: Colors.light.border,
    position: "relative", overflow: "hidden",
  },
  planCardPopular: { borderColor: "#D4A843" },
  popularBadge: {
    position: "absolute", top: 14, right: 14,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12,
  },
  popularBadgeText: {
    fontFamily: "Montserrat_700Bold", fontSize: 10, color: "#fff", letterSpacing: 0.3,
  },
  planHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 },
  planIconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  planName: { fontFamily: "Montserrat_700Bold", fontSize: 18, color: Colors.light.text },
  planTagline: {
    fontFamily: "Montserrat_400Regular", fontSize: 12,
    color: Colors.light.textSecondary, marginTop: 2,
  },
  priceBlock: { alignItems: "flex-end" },
  planPrice: { fontFamily: "Montserrat_700Bold", fontSize: 22 },
  planPeriod: { fontFamily: "Montserrat_400Regular", fontSize: 11, color: Colors.light.textSecondary },
  featureList: { gap: 8 },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  featureDot: {
    width: 24, height: 24, borderRadius: 8,
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  featureText: {
    fontFamily: "Montserrat_400Regular", fontSize: 13, color: Colors.light.text, flex: 1,
  },
  selectedCheck: {
    position: "absolute", top: 14, left: 14,
    width: 22, height: 22, borderRadius: 11,
    alignItems: "center", justifyContent: "center",
  },
  joinBtn: {
    backgroundColor: Colors.brand.blue, borderRadius: 14,
    paddingVertical: 16, flexDirection: "row",
    alignItems: "center", justifyContent: "center", gap: 8,
  },
  joinBtnDisabled: { opacity: 0.6 },
  joinBtnText: {
    fontFamily: "Montserrat_700Bold", fontSize: 15, color: "#fff",
  },
  selectHint: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 8,
  },
  selectHintText: {
    fontFamily: "Montserrat_400Regular", fontSize: 13, color: Colors.light.textSecondary,
  },
  loginPrompt: {
    backgroundColor: Colors.light.surface, borderRadius: 16,
    padding: 24, alignItems: "center", borderWidth: 1, borderColor: Colors.light.border,
  },
  loginPromptTitle: {
    fontFamily: "Montserrat_700Bold", fontSize: 18, color: Colors.light.text,
    marginTop: 12, marginBottom: 8,
  },
  loginPromptSub: {
    fontFamily: "Montserrat_400Regular", fontSize: 13, color: Colors.light.textSecondary,
    textAlign: "center", lineHeight: 20, marginBottom: 16,
  },
  loginBtn: {
    backgroundColor: Colors.brand.blue, borderRadius: 12,
    paddingHorizontal: 28, paddingVertical: 13,
  },
  loginBtnText: { fontFamily: "Montserrat_700Bold", fontSize: 14, color: "#fff" },
  memberCard: {
    backgroundColor: Colors.light.surface, borderRadius: 20,
    borderWidth: 1.5, overflow: "hidden",
  },
  memberCardAccent: { height: 6 },
  memberCardContent: { padding: 20 },
  memberCardTop: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 16 },
  memberCardIcon: {
    width: 52, height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center",
  },
  memberCardLabel: {
    fontFamily: "Montserrat_600SemiBold", fontSize: 10,
    color: Colors.light.textSecondary, letterSpacing: 1.2,
  },
  memberCardPlan: { fontFamily: "Montserrat_700Bold", fontSize: 20, marginTop: 2 },
  statusBadge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontFamily: "Montserrat_600SemiBold", fontSize: 12 },
  memberCardDivider: {
    height: 1, backgroundColor: Colors.light.border, marginVertical: 14,
  },
  memberCardStats: { flexDirection: "row", gap: 20 },
  memberCardStat: {},
  memberCardStatLabel: {
    fontFamily: "Montserrat_400Regular", fontSize: 11, color: Colors.light.textSecondary, marginBottom: 2,
  },
  memberCardStatValue: { fontFamily: "Montserrat_700Bold", fontSize: 16, color: Colors.light.text },
  memberCardDates: { flexDirection: "row", alignItems: "center", gap: 6 },
  memberCardDatesText: {
    fontFamily: "Montserrat_400Regular", fontSize: 12, color: Colors.light.textSecondary,
  },
  benefitsSection: {
    backgroundColor: Colors.light.surface, borderRadius: 16,
    padding: 18, borderWidth: 1, borderColor: Colors.light.border, gap: 12,
  },
  benefitsSectionTitle: {
    fontFamily: "Montserrat_700Bold", fontSize: 15, color: Colors.light.text, marginBottom: 4,
  },
  benefitRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  benefitDot: {
    width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  benefitText: { fontFamily: "Montserrat_400Regular", fontSize: 14, color: Colors.light.text, flex: 1 },
  contactBox: {
    flexDirection: "row", gap: 10, alignItems: "flex-start",
    backgroundColor: Colors.light.surface, borderRadius: 12,
    padding: 14, borderWidth: 1, borderColor: Colors.light.border,
  },
  contactText: {
    fontFamily: "Montserrat_400Regular", fontSize: 12,
    color: Colors.light.textSecondary, flex: 1, lineHeight: 18,
  },
});
