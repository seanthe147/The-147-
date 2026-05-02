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
  Linking,
  TextInput,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Colors from "@/constants/colors";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import { getApiUrl, prefetchSquarePaymentSdk } from "@/lib/query-client";
import { SquarePaymentSheet } from "@/components/SquarePaymentSheet";
import { getPlanBenefits, type BenefitKey } from "@shared/membership-benefits";

const TOKEN_KEY = "customer_session_token";

interface MembershipPlan {
  id: number;
  name: string;
  tier: string;
  priceMonthly: number;
  priceAnnual: number | null;
  description: string | null;
  color: string | null;
  hoursIncluded: number | null;
  hoursUnit: string | null;
  snookerUnlimited: boolean | null;
  foodDrinkDiscount: number | null;
  priorityBooking: boolean | null;
  loyaltyMultiplier: number | null;
  guestPassesMonthly: number | null;
  sortOrder: number | null;
  active: boolean;
  // Server-computed benefit lines. The API renders these so any future
  // wording change is server-side only — no app submission required.
  benefits?: string[] | null;
  benefitsDetailed?: { key: BenefitKey; text: string }[] | null;
}

type BillingFrequency = "monthly" | "annual";

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

const BENEFIT_ICONS: Record<BenefitKey, keyof typeof Ionicons.glyphMap> = {
  hours: "time-outline",
  discount: "restaurant-outline",
  priority: "flash-outline",
  guests: "people-outline",
  loyalty: "star-outline",
  app: "phone-portrait-outline",
};

function getPlanFeatures(plan: MembershipPlan): { icon: keyof typeof Ionicons.glyphMap; text: string }[] {
  // Prefer the server-rendered list so wording stays in lockstep with the
  // staff dashboard / web without needing an app rebuild. Falls back to
  // the local computation if an older server build hasn't shipped the
  // field yet.
  const detailed = Array.isArray(plan.benefitsDetailed) && plan.benefitsDetailed.length > 0
    ? plan.benefitsDetailed
    : getPlanBenefits(plan);
  return detailed.map((b) => ({
    icon: b.key === "hours" && plan.snookerUnlimited ? "infinite-outline" : BENEFIT_ICONS[b.key],
    text: b.text,
  }));
}

async function getToken(): Promise<string> {
  return (await AsyncStorage.getItem(TOKEN_KEY)) || "";
}

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

export default function MembershipScreen() {
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isLoading: authLoading, customer } = useCustomerAuth();
  const { isAuthenticated: isStaffLoggedIn } = useStaffAuth();
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [joining, setJoining] = useState(false);
  const [billingFrequency, setBillingFrequency] = useState<BillingFrequency>("monthly");
  const [startDate, setStartDate] = useState<string>(todayString());
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [paymentSheetVisible, setPaymentSheetVisible] = useState(false);
  const [paymentSheetAmount, setPaymentSheetAmount] = useState(0);
  const [paymentSheetError, setPaymentSheetError] = useState<string | null>(null);
  const [paymentSheetBusy, setPaymentSheetBusy] = useState(false);
  const queryClient = useQueryClient();

  const { data: squareConfig } = useQuery<{
    applicationId: string | null;
    locationId: string | null;
    environment: "production" | "sandbox";
    configured: boolean;
  } | null>({
    queryKey: ["/api/public/square-config"],
    staleTime: 60 * 60 * 1000,
  });

  const useNativeSheet =
    Platform.OS !== "web" && !!squareConfig?.configured && !!squareConfig?.applicationId && !!squareConfig?.locationId;

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

  // Hosted-checkout fallback (web, or native when in-app sheet is unavailable)
  const joinMutation = useMutation({
    mutationFn: async ({ planId, frequency, chosenStartDate, accepted }: { planId: number; frequency: BillingFrequency; chosenStartDate?: string; accepted: boolean }) => {
      const token = await getToken();
      const url = new URL("/api/membership/join", getApiUrl());
      const body: Record<string, unknown> = { planId, billingFrequency: frequency, termsAccepted: accepted };
      if (chosenStartDate && chosenStartDate !== todayString()) body.startDate = chosenStartDate;
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to join");
      return data;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/membership/my-subscription"] });
      setJoining(false);
      setPaymentSheetBusy(false);
      // The server only ever returns a checkoutUrl for a real RECURRING
      // subscription checkout — it refuses to silently downgrade to a
      // one-time payment link for a membership signup. So if we have a
      // checkoutUrl here, it's safe to open in the browser.
      if (data?.checkoutUrl) {
        setPaymentSheetVisible(false);
        setSelectedPlanId(null);
        setTermsAccepted(false);
        Alert.alert(
          "Open secure payment page",
          "We'll open Square in your browser to set up your recurring membership payment.",
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Continue",
              onPress: () => {
                Linking.openURL(data.checkoutUrl).catch(() => {
                  Alert.alert("Payment", "Could not open the payment page. Please try again.");
                });
              },
            },
          ],
        );
      } else {
        // Free / staff-managed activation — no checkout needed.
        setPaymentSheetVisible(false);
        setSelectedPlanId(null);
        setTermsAccepted(false);
      }
    },
    onError: (err: Error) => {
      setPaymentSheetBusy(false);
      // If the in-app sheet is currently visible (i.e. we're in the
      // "sheet unavailable, try hosted recurring checkout" fallback),
      // surface the error inside the sheet so the customer can retry or
      // close — never auto-launch any browser URL on failure.
      if (paymentSheetVisible) {
        setPaymentSheetError(err.message);
      } else {
        Alert.alert("Error", err.message);
      }
    },
  });

  // Native in-app card sheet flow
  const joinNativeMutation = useMutation({
    mutationFn: async ({ sourceId, verificationToken }: { sourceId: string; verificationToken?: string | null }) => {
      if (!selectedPlanId) throw new Error("No plan selected");
      const token = await getToken();
      const url = new URL("/api/membership/join-native", getApiUrl());
      const body: Record<string, unknown> = {
        planId: selectedPlanId,
        billingFrequency,
        termsAccepted,
        sourceId,
        verificationToken: verificationToken ?? null,
      };
      if (isStaffLoggedIn && startDate !== todayString()) body.startDate = startDate;
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to create membership");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/membership/my-subscription"] });
      setPaymentSheetVisible(false);
      setPaymentSheetBusy(false);
      setPaymentSheetError(null);
      setSelectedPlanId(null);
      setTermsAccepted(false);
      Alert.alert("Welcome to The 147", "Your membership is active. Enjoy!", [{ text: "OK" }]);
    },
    onError: (err: Error) => {
      setPaymentSheetBusy(false);
      setPaymentSheetError(err.message);
    },
  });

  const selectedPlan = plans.find((p) => p.id === selectedPlanId) ?? null;

  // When switching to annual, only show plans that have an annual price set
  const visiblePlans = billingFrequency === "annual"
    ? plans.filter((p) => p.priceAnnual != null)
    : plans;
  const hasAnyAnnualPlan = plans.some((p) => p.priceAnnual != null);

  const getDisplayPrice = (plan: MembershipPlan) =>
    billingFrequency === "annual" && plan.priceAnnual != null
      ? plan.priceAnnual
      : plan.priceMonthly;

  const getPriceSaving = (plan: MembershipPlan) => {
    if (!plan.priceAnnual) return null;
    const annualIfMonthly = plan.priceMonthly * 12;
    const saving = annualIfMonthly - plan.priceAnnual;
    return saving > 0 ? saving : null;
  };

  const handleJoin = () => {
    if (!selectedPlanId || !selectedPlan) return;
    if (!termsAccepted) {
      Alert.alert("Terms required", "Please tick the box to confirm you agree to the Terms & Conditions before joining.");
      return;
    }
    const isAnnual = billingFrequency === "annual";
    const price = isAnnual && selectedPlan.priceAnnual != null
      ? selectedPlan.priceAnnual
      : selectedPlan.priceMonthly;
    const periodLabel = isAnnual ? "per year" : "per month";
    const saving = getPriceSaving(selectedPlan);
    const savingNote = isAnnual && saving ? `\n\nYou save £${(saving / 100).toFixed(2)} compared to paying monthly.` : "";
    const today = todayString();
    const isFuture = isStaffLoggedIn && startDate > today;
    const startNote = isFuture
      ? `\n\nMembership starts ${new Date(startDate + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}. First payment on that date.`
      : "";
    const continueCopy = useNativeSheet
      ? "Enter your card details to complete sign-up — your card will be charged automatically each billing period."
      : "You'll be taken to a secure payment page to complete your sign-up.";
    // Customer is one tap away from confirming and opening the in-app
    // payment sheet — warm Square's CDN now (DNS + TLS at the OS level)
    // so the sheet's first byte arrives sooner.
    if (useNativeSheet) prefetchSquarePaymentSdk();
    Alert.alert(
      "Confirm Membership",
      `Join the ${selectedPlan.name} plan for £${(price / 100).toFixed(2)} ${periodLabel}?${savingNote}${startNote}\n\n${continueCopy}`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Continue to Payment",
          onPress: () => {
            if (useNativeSheet) {
              setPaymentSheetAmount(price);
              setPaymentSheetError(null);
              setPaymentSheetBusy(false);
              setPaymentSheetVisible(true);
            } else {
              joinMutation.mutate({ planId: selectedPlanId, frequency: billingFrequency, chosenStartDate: isStaffLoggedIn ? startDate : undefined, accepted: termsAccepted });
            }
          },
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

          {hasAnyAnnualPlan && (
            <View style={styles.billingToggle}>
              <Pressable
                style={[styles.billingOption, billingFrequency === "monthly" && styles.billingOptionActive]}
                onPress={() => { setBillingFrequency("monthly"); setSelectedPlanId(null); }}
              >
                <Text style={[styles.billingOptionText, billingFrequency === "monthly" && styles.billingOptionTextActive]}>
                  Monthly
                </Text>
              </Pressable>
              <Pressable
                style={[styles.billingOption, billingFrequency === "annual" && styles.billingOptionActive]}
                onPress={() => { setBillingFrequency("annual"); setSelectedPlanId(null); }}
              >
                <Text style={[styles.billingOptionText, billingFrequency === "annual" && styles.billingOptionTextActive]}>
                  Annual
                </Text>
                <View style={styles.saveBadge}>
                  <Text style={styles.saveBadgeText}>Save more</Text>
                </View>
              </Pressable>
            </View>
          )}

          {visiblePlans.map((plan) => {
            const meta = getPlanMeta(plan.tier);
            const planColor = plan.color || Colors.brand.blue;
            const isSelected = selectedPlanId === plan.id;
            const features = getPlanFeatures(plan);
            const displayPrice = getDisplayPrice(plan);
            const saving = getPriceSaving(plan);
            return (
              <Pressable
                key={plan.id}
                onPress={() => {
                  setSelectedPlanId(isSelected ? null : plan.id);
                  setTermsAccepted(false);
                }}
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
                {billingFrequency === "annual" && saving != null && (
                  <View style={[styles.annualSavingBadge, { backgroundColor: "#16A34A" }]}>
                    <Text style={styles.annualSavingText}>Save £{(saving / 100).toFixed(0)}/yr</Text>
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
                      £{(displayPrice / 100).toFixed(2)}
                    </Text>
                    <Text style={styles.planPeriod}>/{billingFrequency === "annual" ? "year" : "month"}</Text>
                    {billingFrequency === "annual" && (
                      <Text style={styles.planPriceMonthly}>
                        £{(displayPrice / 100 / 12).toFixed(2)}/mo
                      </Text>
                    )}
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

          {isAuthenticated && isStaffLoggedIn && selectedPlanId && (
            <View style={styles.staffStartDate}>
              <View style={styles.staffStartDateHeader}>
                <Ionicons name="shield-checkmark" size={14} color="#7C3AED" />
                <Text style={styles.staffStartDateLabel}>STAFF — SET START DATE</Text>
              </View>
              <View style={styles.staffDateRow}>
                <Pressable
                  style={[styles.staffDateBtn, startDate === todayString() && styles.staffDateBtnActive]}
                  onPress={() => setStartDate(todayString())}
                >
                  <Text style={[styles.staffDateBtnText, startDate === todayString() && styles.staffDateBtnTextActive]}>Today</Text>
                </Pressable>
                <TextInput
                  style={styles.staffDateInput}
                  value={startDate}
                  onChangeText={(v) => {
                    if (/^\d{0,4}-?\d{0,2}-?\d{0,2}$/.test(v)) setStartDate(v);
                  }}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={Colors.light.textSecondary}
                  keyboardType="numbers-and-punctuation"
                  maxLength={10}
                />
              </View>
              {startDate > todayString() ? (
                <View style={styles.staffDateHint}>
                  <Ionicons name="time-outline" size={13} color="#7C3AED" />
                  <Text style={styles.staffDateHintText}>
                    Starts {new Date(startDate + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" })} — first payment on that date
                  </Text>
                </View>
              ) : (
                <View style={styles.staffDateHint}>
                  <Ionicons name="flash-outline" size={13} color="#10B981" />
                  <Text style={[styles.staffDateHintText, { color: "#10B981" }]}>Starts immediately — payment taken today</Text>
                </View>
              )}
            </View>
          )}

          {isAuthenticated ? (
            selectedPlanId ? (
              <>
                <Pressable
                  style={styles.termsCheckRow}
                  onPress={() => setTermsAccepted((v) => !v)}
                  testID="membership-terms-checkbox"
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: termsAccepted }}
                >
                  <View style={[styles.termsCheckbox, termsAccepted && styles.termsCheckboxChecked]}>
                    {termsAccepted && <Ionicons name="checkmark" size={14} color="#fff" />}
                  </View>
                  <Text style={styles.termsCheckLabel}>
                    I have read and agree to the{" "}
                    <Text
                      style={styles.legalLink}
                      onPress={() => Linking.openURL(`${getApiUrl().replace(/\/$/, "")}/terms`)}
                    >
                      Terms & Conditions
                    </Text>
                    , including the membership deposit, recurring billing, and gift card terms.
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.joinBtn, (joinMutation.isPending || !termsAccepted) && styles.joinBtnDisabled]}
                  onPress={handleJoin}
                  disabled={joinMutation.isPending || !termsAccepted}
                  testID="membership-join-button"
                >
                  {joinMutation.isPending ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="card-outline" size={18} color="#fff" />
                      <Text style={styles.joinBtnText}>
                        {(() => {
                          if (!selectedPlan) return "";
                          const isAnnual = billingFrequency === "annual";
                          const price = isAnnual && selectedPlan.priceAnnual != null
                            ? selectedPlan.priceAnnual
                            : selectedPlan.priceMonthly;
                          const period = isAnnual ? "/yr" : "/mo";
                          return `Join ${selectedPlan.name} — £${(price / 100).toFixed(2)}${period}`;
                        })()}
                      </Text>
                    </>
                  )}
                </Pressable>
                <Text style={styles.legalNote} testID="membership-terms-note">
                  By joining, you agree to our{" "}
                  <Text
                    style={styles.legalLink}
                    onPress={() => Linking.openURL(`${getApiUrl().replace(/\/$/, "")}/terms`)}
                  >
                    Terms & Conditions
                  </Text>
                  {" "}covering memberships, deposits, and gift cards, and our{" "}
                  <Text
                    style={styles.legalLink}
                    onPress={() => router.push("/privacy-policy")}
                  >
                    Privacy Policy
                  </Text>
                  .
                </Text>
              </>
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

      {useNativeSheet && (
        <SquarePaymentSheet
          visible={paymentSheetVisible}
          onClose={() => {
            if (!paymentSheetBusy) setPaymentSheetVisible(false);
          }}
          onTokenized={({ sourceId, verificationToken }) => {
            setPaymentSheetBusy(true);
            setPaymentSheetError(null);
            joinNativeMutation.mutate({ sourceId, verificationToken });
          }}
          onUnavailable={(reason) => {
            // The in-app sheet failed to initialise. We must NOT auto-launch
            // any browser URL here — for a membership signup we only ever
            // want to open a real RECURRING subscription checkout, never a
            // one-time payment link. Ask the server for a recurring checkout
            // URL first; only prompt to open the browser if we get one back.
            // If the server can't produce a recurring checkout, the error is
            // surfaced inside the sheet (see joinMutation.onError) so the
            // customer can retry or close — they're never silently sent to
            // a one-time payment page.
            if (!selectedPlanId) {
              setPaymentSheetVisible(false);
              return;
            }
            setPaymentSheetError(reason);
            setPaymentSheetBusy(true);
            joinMutation.mutate({
              planId: selectedPlanId,
              frequency: billingFrequency,
              chosenStartDate: isStaffLoggedIn ? startDate : undefined,
              accepted: termsAccepted,
            });
          }}
          applicationId={squareConfig?.applicationId ?? null}
          locationId={squareConfig?.locationId ?? null}
          environment={squareConfig?.environment ?? "sandbox"}
          amountPence={paymentSheetAmount}
          buyerEmail={customer?.email ?? null}
          inProgress={paymentSheetBusy}
          errorMessage={paymentSheetError}
          intent="STORE"
          recurringDescription={billingFrequency === "annual" ? "/year — renews automatically" : "/month — renews automatically"}
        />
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

  const retryMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      const url = new URL("/api/membership/retry-payment", getApiUrl());
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to generate payment link");
      return data as { checkoutUrl: string };
    },
    onSuccess: (data) => {
      if (data.checkoutUrl) {
        Linking.openURL(data.checkoutUrl).catch(() => {
          Alert.alert("Payment", "Could not open payment page. Please try again.");
        });
      }
    },
    onError: (err: Error) => Alert.alert("Error", err.message),
  });

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  };

  const isFrozen = subscription.status === "frozen";
  const isPending = subscription.status === "pending";
  const failedAttempts = (subscription as any).failedPaymentAttempts ?? 0;

  const statusColor =
    subscription.status === "active"
      ? "#10B981"
      : subscription.status === "paused"
      ? "#F59E0B"
      : subscription.status === "frozen"
      ? "#EF4444"
      : "#F59E0B";
  const statusLabel =
    subscription.status === "active"
      ? "Active"
      : subscription.status === "paused"
      ? "Paused"
      : subscription.status === "pending"
      ? "Payment Pending"
      : subscription.status === "frozen"
      ? "Suspended"
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

      {isFrozen && (
        <View style={styles.paymentBanner}>
          <View style={styles.paymentBannerIconWrap}>
            <Ionicons name="warning" size={22} color="#EF4444" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.paymentBannerTitle}>Benefits Suspended</Text>
            <Text style={styles.paymentBannerBody}>
              Your membership was suspended after 3 failed payments. Retry now to restore access.
            </Text>
          </View>
          <Pressable
            style={[styles.retryBtn, retryMutation.isPending && { opacity: 0.6 }]}
            onPress={() => retryMutation.mutate()}
            disabled={retryMutation.isPending}
          >
            {retryMutation.isPending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.retryBtnText}>Retry</Text>
            )}
          </Pressable>
        </View>
      )}

      {isPending && !isFrozen && (
        <View style={[styles.paymentBanner, { borderColor: "#F59E0B44", backgroundColor: "#FFFBEB" }]}>
          <View style={[styles.paymentBannerIconWrap, { backgroundColor: "#FEF3C7" }]}>
            <Ionicons name="time-outline" size={22} color="#D97706" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.paymentBannerTitle, { color: "#92400E" }]}>Payment Pending</Text>
            <Text style={[styles.paymentBannerBody, { color: "#92400E" }]}>
              Complete your payment to activate your membership benefits.
            </Text>
          </View>
          <Pressable
            style={[styles.retryBtn, { backgroundColor: "#D97706" }, retryMutation.isPending && { opacity: 0.6 }]}
            onPress={() => retryMutation.mutate()}
            disabled={retryMutation.isPending}
          >
            {retryMutation.isPending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.retryBtnText}>Pay Now</Text>
            )}
          </Pressable>
        </View>
      )}

      {!isFrozen && !isPending && failedAttempts > 0 && (
        <View style={[styles.paymentBanner, { borderColor: "#F59E0B44", backgroundColor: "#FFFBEB" }]}>
          <Ionicons name="alert-circle-outline" size={20} color="#D97706" />
          <Text style={[styles.paymentBannerBody, { color: "#92400E", marginLeft: 8, flex: 1 }]}>
            {failedAttempts === 1
              ? "A payment recently failed. Ensure your card details are up to date."
              : `${failedAttempts}/3 payments have failed. One more failure will suspend your benefits.`}
          </Text>
        </View>
      )}

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
  planCardPopular: { borderColor: "#D4A843", paddingTop: 36 },
  popularBadge: {
    position: "absolute", top: 0, right: 14,
    paddingHorizontal: 10, paddingVertical: 4,
    borderBottomLeftRadius: 10, borderBottomRightRadius: 10,
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
  planPriceMonthly: { fontFamily: "Montserrat_400Regular", fontSize: 10, color: Colors.light.textSecondary, marginTop: 1 },
  billingToggle: {
    flexDirection: "row", backgroundColor: "#F1F5F9",
    borderRadius: 12, padding: 4, marginBottom: 16,
  },
  billingOption: {
    flex: 1, paddingVertical: 8, paddingHorizontal: 12,
    borderRadius: 9, alignItems: "center", flexDirection: "row",
    justifyContent: "center", gap: 6,
  },
  billingOptionActive: { backgroundColor: "#fff", shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  billingOptionText: { fontFamily: "Montserrat_600SemiBold", fontSize: 14, color: Colors.light.textSecondary },
  billingOptionTextActive: { color: Colors.light.text },
  saveBadge: { backgroundColor: "#16A34A", borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
  saveBadgeText: { fontFamily: "Montserrat_700Bold", fontSize: 9, color: "#fff" },
  annualSavingBadge: {
    position: "absolute", top: 0, left: 14,
    paddingHorizontal: 10, paddingVertical: 4,
    borderBottomLeftRadius: 10, borderBottomRightRadius: 10,
  },
  annualSavingText: { fontFamily: "Montserrat_700Bold", fontSize: 10, color: "#fff" },
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
  legalNote: {
    fontFamily: "Montserrat_400Regular", fontSize: 12, color: Colors.light.textSecondary,
    textAlign: "center", lineHeight: 18, marginTop: 10, paddingHorizontal: 8,
  },
  termsCheckRow: {
    flexDirection: "row", alignItems: "flex-start", gap: 10,
    paddingVertical: 12, paddingHorizontal: 4, marginBottom: 4,
  },
  termsCheckbox: {
    width: 22, height: 22, borderRadius: 6,
    borderWidth: 2, borderColor: Colors.light.border,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "#fff", marginTop: 1,
  },
  termsCheckboxChecked: {
    backgroundColor: Colors.brand.blue, borderColor: Colors.brand.blue,
  },
  termsCheckLabel: {
    flex: 1, fontFamily: "Montserrat_400Regular",
    fontSize: 13, color: Colors.light.text, lineHeight: 19,
  },
  legalLink: {
    fontFamily: "Montserrat_600SemiBold", color: Colors.brand.blue, textDecorationLine: "underline",
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
  paymentBanner: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: "#FEF2F2", borderRadius: 14,
    borderWidth: 1, borderColor: "#FCA5A544",
    padding: 14,
  },
  paymentBannerIconWrap: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: "#FEE2E2",
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  paymentBannerTitle: {
    fontFamily: "Montserrat_700Bold", fontSize: 13, color: "#991B1B", marginBottom: 2,
  },
  paymentBannerBody: {
    fontFamily: "Montserrat_400Regular", fontSize: 12, color: "#991B1B", lineHeight: 17,
  },
  retryBtn: {
    backgroundColor: "#EF4444", borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 8,
    alignItems: "center", justifyContent: "center", flexShrink: 0,
    minWidth: 64,
  },
  retryBtnText: { fontFamily: "Montserrat_700Bold", fontSize: 12, color: "#fff" },
  staffStartDate: {
    backgroundColor: "#F5F3FF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#7C3AED33",
    padding: 14,
    marginBottom: 12,
  },
  staffStartDateHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
  },
  staffStartDateLabel: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 11,
    color: "#7C3AED",
    letterSpacing: 0.8,
  },
  staffDateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  staffDateBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#7C3AED33",
    backgroundColor: "#fff",
  },
  staffDateBtnActive: {
    backgroundColor: "#7C3AED",
    borderColor: "#7C3AED",
  },
  staffDateBtnText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 13,
    color: "#7C3AED",
  },
  staffDateBtnTextActive: {
    color: "#fff",
  },
  staffDateInput: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#7C3AED33",
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: "Montserrat_500Medium",
    fontSize: 14,
    color: Colors.light.text,
  },
  staffDateHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 8,
  },
  staffDateHintText: {
    fontFamily: "Montserrat_500Medium",
    fontSize: 12,
    color: "#7C3AED",
    flex: 1,
  },
});
