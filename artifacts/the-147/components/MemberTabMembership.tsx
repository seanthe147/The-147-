import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { getGetMembershipBillingQueryKey, useGetMembershipBilling, useReactivateMembership } from "@workspace/api-client-react";
import type { MembershipReactivationOffer } from "@workspace/api-client-react";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import { useColors } from "@/hooks/useColors";
import { ManageMembership } from "@/app/membership";
import { getApiUrl, prefetchSquarePaymentSdk } from "@/lib/query-client";
import { SquarePaymentSheet } from "@/components/SquarePaymentSheet";
import {
  BENEFIT_ICON,
  apiErrorMessage,
  billingSummary,
  canonicalBenefits,
  fmtDate,
  hasManageableMembership,
  money,
  statusInfo,
  type BenefitSourcePlan,
  type Tone,
} from "@/lib/membershipDisplay";

interface PublicPlan extends BenefitSourcePlan {
  id: number;
  name: string;
  priceMonthly: number;
  priceAnnual?: number | null;
  minimumTermMonths?: number | null;
  benefits?: string[] | null;
  color?: string | null;
  active: boolean;
  hideFromSignup?: boolean;
  sortOrder?: number | null;
}

type Palette = ReturnType<typeof useColors>;

export function MemberTabMembership() {
  const colors = useColors();
  const s = useMemo(() => createStyles(colors), [colors]);
  const { isAuthenticated, isLoading: authLoading, customer, getCustomerToken } = useCustomerAuth();
  // Also links memberships already held in Square; must run before offering checkout.
  const existing = useQuery<{ id: number; status: string; currentPeriodEnd?: string | null; plan?: { name?: string } | null } | null>({
    queryKey: ["/api/membership/my-subscription", customer?.id],
    enabled: isAuthenticated,
    staleTime: 30_000,
    refetchOnMount: "always",
    queryFn: async () => {
      const token = getCustomerToken();
      if (!token) throw new Error("Sign in to check your membership.");
      const response = await fetch(new URL("/api/membership/my-subscription", getApiUrl()).toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Your existing membership could not be checked.");
      return response.json();
    },
  });
  const billing = useGetMembershipBilling({
    query: {
      queryKey: [...getGetMembershipBillingQueryKey(), customer?.id],
      enabled: isAuthenticated && existing.isSuccess,
      staleTime: 0,
      refetchInterval: 30_000,
      refetchOnMount: "always",
    },
  });
  const plans = useQuery<PublicPlan[]>({ queryKey: ["/api/membership/plans"] });

  const sub = isAuthenticated ? billing.data?.subscription ?? null : null;
  const manageable = hasManageableMembership(sub);
  // A live record from my-subscription without billing metadata must never fall through to signup.
  const existingLive = isAuthenticated && !!existing.data && hasManageableMembership({
    ...existing.data, renewalDate: existing.data.currentPeriodEnd,
  });
  const checking = authLoading || (isAuthenticated && (existing.isPending || (existing.isSuccess && billing.isPending)));
  const checkFailed = isAuthenticated && (existing.isError || billing.isError);

  const choose = (planId: number, billingFrequency: "monthly" | "annual") =>
    router.push({ pathname: "/membership", params: { planId: String(planId), billingFrequency } });

  const visiblePlans = (plans.data ?? [])
    .filter(p => p.active !== false && !p.hideFromSignup)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.priceMonthly - b.priceMonthly);

  const retryBtn = (fn: () => unknown, testID: string) => (
    <Pressable onPress={fn} style={s.primaryBtn} accessibilityRole="button" testID={testID}>
      <Ionicons name="refresh" size={16} color="#fff" />
      <Text style={s.primaryBtnText}>Try again</Text>
    </Pressable>
  );

  let body: React.ReactNode;
  if (checking) {
    body = (
      <View style={s.card} testID="member-tab-loading" accessibilityLabel="Loading membership">
        <View style={[s.skel, { width: "35%" }]} />
        <View style={[s.skel, { width: "75%", height: 20, marginTop: 12 }]} />
        <View style={[s.skel, { width: "60%", marginTop: 10 }]} />
      </View>
    );
  } else if (checkFailed) {
    body = (
      <View style={s.card} testID="member-tab-check-error">
        <Ionicons name="cloud-offline-outline" size={22} color={colors.textSecondary} />
        <Text style={s.cardTitle}>We couldn't check your membership</Text>
        <Text style={s.muted}>Please retry before starting a new one, so you are never billed twice.</Text>
        {retryBtn(() => (existing.isError ? existing.refetch() : billing.refetch()), "member-tab-retry")}
      </View>
    );
  } else if (billing.data?.reactivation?.available) {
    body = (
      <MembershipReactivationCard
        offer={billing.data.reactivation}
        email={customer?.email ?? null}
      />
    );
  } else if (manageable && sub) {
    const st = statusInfo(sub);
    const sum = billingSummary(sub);
    const held = sub.status === "frozen" || sub.status === "held";
    body = (
      <View testID="member-tab-management" style={{ gap: 12 }}>
        <View style={s.statusCard} testID="member-tab-status-card">
          <View style={s.statusTop}>
            <View style={{ flex: 1 }}>
              <Text style={s.eyebrow}>THE 147 MEMBER</Text>
              <Text style={s.planTitle} numberOfLines={1}>{sub.planName}</Text>
            </View>
            <StatusPill label={st.label} tone={st.tone} colors={colors} />
          </View>
          <View style={s.metaRow}>
            <View style={s.metaItem}>
              <Text style={s.metaLabel}>PAYMENT</Text>
              <Text style={s.metaValue}>{sum.method}</Text>
            </View>
            <View style={s.metaItem}>
              <Text style={s.metaLabel}>{sum.dateLabel.toUpperCase()}</Text>
              <Text style={s.metaValue}>{fmtDate(sum.date)}</Text>
            </View>
          </View>
          {held && (
            <View style={s.alert} testID="member-tab-held">
              <Ionicons name="warning-outline" size={16} color={colors.accent} />
              <Text style={[s.muted, { flex: 1 }]}>Benefits are paused after failed payments. Your membership is kept: update your card below or retry payment from your membership card.</Text>
            </View>
          )}
          {sub.status === "cancelled" && (
            <View style={s.alert}>
              <Ionicons name="information-circle-outline" size={16} color={colors.tint} />
              <Text style={[s.muted, { flex: 1 }]}>Cancelled, but you keep paid access until {fmtDate(sum.date)}.</Text>
            </View>
          )}
          <Pressable style={s.linkRow} accessibilityRole="button" testID="member-tab-open-card" onPress={() => router.push("/membership")}>
            <Ionicons name="card-outline" size={18} color={colors.tint} />
            <Text style={s.linkText}>Membership card & benefits</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.tint} />
          </Pressable>
        </View>
        <ManageMembership key={customer?.id} />
      </View>
    );
  } else if (existingLive) {
    body = (
      <View style={s.card} testID="member-tab-existing-no-billing">
        <Text style={s.cardTitle}>{existing.data?.plan?.name ?? "Your membership"}</Text>
        <Text style={s.muted}>
          We found a membership on your account ({existing.data?.status.replace(/_/g, " ")}). Billing management isn't available for it in the app yet, so please don't buy another plan; speak to the club for changes.
        </Text>
        <Pressable style={s.primaryBtn} accessibilityRole="button" testID="member-tab-existing-details" onPress={() => router.push("/membership")}>
          <Text style={s.primaryBtnText}>View membership details</Text>
        </Pressable>
      </View>
    );
  } else if (plans.isPending) {
    body = (
      <View style={{ gap: 12 }} testID="member-tab-plans-loading">
        {[0, 1].map(i => (
          <View key={i} style={s.card}>
            <View style={[s.skel, { width: "45%", height: 18 }]} />
            <View style={[s.skel, { width: "80%", marginTop: 12 }]} />
            <View style={[s.skel, { width: "65%", marginTop: 8 }]} />
          </View>
        ))}
      </View>
    );
  } else if (plans.isError) {
    body = (
      <View style={s.card} testID="member-tab-plans-error">
        <Text style={s.cardTitle}>Membership plans couldn't be loaded</Text>
        <Text style={s.muted}>Check your connection and try again.</Text>
        {retryBtn(() => plans.refetch(), "member-tab-plans-retry")}
      </View>
    );
  } else if (visiblePlans.length === 0) {
    body = (
      <View style={s.card} testID="member-tab-no-plans">
        <Ionicons name="pause-circle-outline" size={22} color={colors.textSecondary} />
        <Text style={s.cardTitle}>No memberships on sale right now</Text>
        <Text style={s.muted}>Please ask at the club about upcoming memberships.</Text>
      </View>
    );
  } else {
    body = (
      <View testID="member-tab-plans" style={{ gap: 14 }}>
        <Text style={s.muted}>
          {isAuthenticated
            ? "Pick a plan and how you'd like to pay. Payment is set up securely with Square."
            : "Every plan, with monthly and annual prices. You'll only need to sign in when you buy."}
        </Text>
        {visiblePlans.map(plan => {
          const benefits = canonicalBenefits(plan);
          const accent = plan.color || colors.tint;
          const saving = plan.priceAnnual != null ? plan.priceMonthly * 12 - plan.priceAnnual : 0;
          const term = plan.minimumTermMonths ?? 0;
          return (
            <View key={plan.id} style={s.planCard} testID={`member-plan-${plan.id}`}>
              <View style={[s.planStripe, { backgroundColor: accent }]} />
              <Text style={s.planTitle}>{plan.name}</Text>
              <Text style={s.termText} testID={`member-plan-term-${plan.id}`}>
                {term > 0 ? `${term}-month minimum term` : "No minimum term"}
              </Text>
              <View style={s.benefits}>
                {benefits.map((b, i) => (
                  <View style={s.benefit} key={`${i}-${b.text}`}>
                    <Ionicons name={b.key === "hours" && plan.snookerUnlimited ? "infinite-outline" : BENEFIT_ICON[b.key] ?? "checkmark-outline"} size={16} color={accent} />
                    <Text style={s.benefitText}>{b.text}</Text>
                  </View>
                ))}
              </View>
              <View style={s.priceRow}>
                <Pressable testID={`join-monthly-${plan.id}`} accessibilityRole="button"
                  accessibilityLabel={`Choose ${plan.name} monthly, ${money(plan.priceMonthly)} per month`}
                  onPress={() => choose(plan.id, "monthly")} style={s.priceBtn}>
                  <Text style={s.priceLabel}>MONTHLY</Text>
                  <Text style={s.priceValue}>{money(plan.priceMonthly)}<Text style={s.pricePer}>/mo</Text></Text>
                  <Text style={s.priceCta}>Choose</Text>
                </Pressable>
                {plan.priceAnnual != null && (
                  <Pressable testID={`join-annual-${plan.id}`} accessibilityRole="button"
                    accessibilityLabel={`Choose ${plan.name} annual, ${money(plan.priceAnnual)} per year`}
                    onPress={() => choose(plan.id, "annual")} style={[s.priceBtn, s.priceBtnStrong]}>
                    <Text style={[s.priceLabel, { color: "rgba(255,255,255,0.75)" }]}>ANNUAL</Text>
                    <Text style={[s.priceValue, { color: "#fff" }]}>{money(plan.priceAnnual)}<Text style={[s.pricePer, { color: "rgba(255,255,255,0.75)" }]}>/yr</Text></Text>
                    <Text style={[s.priceCta, { color: "#fff" }]}>{saving > 0 ? `Save ${money(saving)}` : "Choose"}</Text>
                  </Pressable>
                )}
              </View>
              <Text style={s.fine}>
                {term > 0
                  ? `Monthly continues rolling after the ${term}-month term; annual renews each year. Both auto-renew until cancelled.`
                  : "Renews automatically until you cancel; cancellation takes effect at your next renewal."}
              </Text>
            </View>
          );
        })}
      </View>
    );
  }

  return (
    <View style={s.section} testID="member-tab-membership">
      <Text style={s.title}>{manageable || existingLive || billing.data?.reactivation?.available ? "Your membership" : "Memberships"}</Text>
      {body}
    </View>
  );
}

function MembershipReactivationCard({
  offer,
  email,
}: {
  offer: MembershipReactivationOffer;
  email: string | null;
}) {
  const colors = useColors();
  const s = useMemo(() => createStyles(colors), [colors]);
  const [accepted, setAccepted] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [sheetKey, setSheetKey] = useState(0);
  const queryClient = useQueryClient();
  const { data: config } = useQuery<{
    configured: boolean;
    applicationId: string | null;
    locationId: string | null;
    environment: "sandbox" | "production";
  }>({ queryKey: ["/api/public/square-config"] });
  const reactivate = useReactivateMembership({
    mutation: {
      onSuccess: result => {
        setSheetOpen(false);
        setAccepted(false);
        setError(null);
        setSuccess(result.message);
        queryClient.invalidateQueries({ queryKey: ["/api/membership/my-subscription"] });
        queryClient.invalidateQueries({ queryKey: getGetMembershipBillingQueryKey() });
      },
      onError: err => {
        setSuccess(null);
        setError(apiErrorMessage(err, "Could not reactivate your membership. Please refresh and try again."));
        setSheetKey(value => value + 1);
        queryClient.invalidateQueries({ queryKey: getGetMembershipBillingQueryKey() });
      },
    },
  });

  return (
    <View style={s.card} testID="member-tab-reactivation">
      <View style={s.reactivationHead}>
        <View style={s.reactivationIcon}>
          <Ionicons name="refresh" size={20} color={colors.tint} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.cardTitle}>Reactivate {offer.planName}</Text>
          <Text style={s.muted}>Your previous paid access ended {fmtDate(offer.paidThroughDate)}.</Text>
        </View>
      </View>
      <Text style={s.reactivationPrice}>
        {money(offer.pricePence)}<Text style={s.muted}>/{offer.frequency === "annual" ? "year" : "month"}</Text>
      </Text>
      <Text style={s.muted}>
        Reactivate by {fmtDate(offer.deadline, true)}. Your first payment starts today when you confirm. After this date, choose a current plan as a new membership.
      </Text>
      {offer.minimumTermMonths > 0 && (
        <Text style={s.reactivationTerm}>{offer.minimumTermMonths}-month minimum term starts today.</Text>
      )}
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: accepted }}
        onPress={() => setAccepted(value => !value)}
        style={s.reactivationConsent}
        testID="reactivation-terms"
      >
        <Ionicons name={accepted ? "checkbox" : "square-outline"} size={22} color={colors.tint} />
        <Text style={s.muted}>
          I authorise recurring {offer.frequency} payments of {money(offer.pricePence)} for {offer.planName}, starting today, and agree to the membership terms.
          {offer.minimumTermMonths > 0 ? ` I accept the ${offer.minimumTermMonths}-month minimum term.` : ""}
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        disabled={!accepted || !config?.configured || reactivate.isPending}
        onPress={() => {
          setError(null);
          setSuccess(null);
          setSheetKey(value => value + 1);
          setSheetOpen(true);
          prefetchSquarePaymentSdk();
        }}
        style={[s.primaryBtn, (!accepted || !config?.configured || reactivate.isPending) && s.disabled]}
        testID="reactivate-membership"
      >
        {reactivate.isPending
          ? <Text style={s.primaryBtnText}>Submitting…</Text>
          : <Text style={s.primaryBtnText}>Reactivate and pay {money(offer.pricePence)}</Text>}
      </Pressable>
      {config && !config.configured && <Text style={s.muted}>Secure membership payments are unavailable right now.</Text>}
      {error && !sheetOpen && <Text style={s.reactivationError} testID="reactivation-message">{error}</Text>}
      {success && !sheetOpen && <Text style={s.reactivationSuccess} testID="reactivation-success">{success}</Text>}
      <SquarePaymentSheet
        key={sheetKey}
        visible={sheetOpen}
        applicationId={config?.applicationId ?? null}
        locationId={config?.locationId ?? null}
        environment={config?.environment ?? "sandbox"}
        amountPence={offer.pricePence}
        currency="GBP"
        intent="STORE"
        recurringDescription={`Reactivate ${offer.planName} with ${offer.frequency} recurring payments starting today.`}
        buyerEmail={email}
        inProgress={reactivate.isPending}
        errorMessage={error}
        onClose={() => { if (!reactivate.isPending) setSheetOpen(false); }}
        onUnavailable={message => { setSheetOpen(false); setError(message); }}
        onTokenized={({ sourceId, verificationToken }) => {
          if (!verificationToken) {
            setError("Please complete card authorisation before continuing.");
            return;
          }
          setError(null);
          reactivate.mutate({
            data: {
              planId: offer.planId,
              billingFrequency: offer.frequency,
              termsAccepted: accepted,
              ...(offer.minimumTermMonths > 0 ? { minimumTermAccepted: accepted } : {}),
              sourceId,
              verificationToken,
            },
          });
        }}
      />
    </View>
  );
}

function StatusPill({ label, tone, colors }: { label: string; tone: Tone; colors: Palette }) {
  const c = tone === "good" ? "#15803D" : tone === "warn" ? "#B7791F" : tone === "bad" ? colors.accent : colors.textSecondary;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: c + "1F" }} testID="member-status-pill">
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: c }} />
      <Text style={{ color: c, fontFamily: "Montserrat_700Bold", fontSize: 12 }}>{label}</Text>
    </View>
  );
}

function createStyles(c: Palette) {
  return StyleSheet.create({
    section: { marginHorizontal: 20, marginBottom: 20 },
    title: { color: c.text, fontFamily: "Montserrat_700Bold", fontSize: 20, marginBottom: 12 },
    muted: { color: c.textSecondary, fontFamily: "Montserrat_400Regular", fontSize: 13, lineHeight: 19 },
    card: { backgroundColor: c.surface, borderColor: c.border, borderWidth: 1, borderRadius: 18, padding: 16, gap: 8 },
    cardTitle: { color: c.text, fontFamily: "Montserrat_700Bold", fontSize: 16 },
    skel: { height: 12, borderRadius: 6, backgroundColor: c.surfaceElevated },
    statusCard: { backgroundColor: c.surface, borderColor: c.glass.goldPillBorder, borderWidth: 1, borderRadius: 20, padding: 18, gap: 14 },
    statusTop: { flexDirection: "row", alignItems: "center", gap: 10 },
    eyebrow: { fontFamily: "Montserrat_700Bold", fontSize: 11, letterSpacing: 1.6, color: c.gold },
    planTitle: { color: c.text, fontFamily: "Montserrat_700Bold", fontSize: 22, marginTop: 2 },
    metaRow: { flexDirection: "row", gap: 12 },
    metaItem: { flex: 1, backgroundColor: c.surfaceElevated, borderRadius: 12, padding: 10, gap: 3 },
    metaLabel: { fontFamily: "Montserrat_700Bold", fontSize: 10, letterSpacing: 1, color: c.textSecondary },
    metaValue: { fontFamily: "Montserrat_600SemiBold", fontSize: 13, color: c.text },
    alert: { flexDirection: "row", gap: 8, alignItems: "flex-start", padding: 10, borderRadius: 12, backgroundColor: c.glass.redPill },
    linkRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 4 },
    linkText: { flex: 1, color: c.tint, fontFamily: "Montserrat_700Bold", fontSize: 14 },
    planCard: { backgroundColor: c.surface, borderColor: c.border, borderWidth: 1, borderRadius: 20, padding: 18, paddingTop: 22, overflow: "hidden" },
    planStripe: { position: "absolute", top: 0, left: 0, right: 0, height: 4 },
    termText: { fontFamily: "Montserrat_600SemiBold", fontSize: 12, color: c.gold, marginTop: 4 },
    benefits: { gap: 8, marginTop: 14 },
    benefit: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
    benefitText: { flex: 1, color: c.text, fontFamily: "Montserrat_500Medium", fontSize: 14, lineHeight: 20 },
    priceRow: { flexDirection: "row", gap: 10, marginTop: 16 },
    priceBtn: { flex: 1, borderRadius: 14, borderWidth: 1, borderColor: c.border, backgroundColor: c.background, padding: 12, gap: 2, minHeight: 88 },
    priceBtnStrong: { backgroundColor: "#0047AB", borderColor: "#0047AB" },
    priceLabel: { fontFamily: "Montserrat_700Bold", fontSize: 10, letterSpacing: 1.2, color: c.textSecondary },
    priceValue: { fontFamily: "Montserrat_700Bold", fontSize: 20, color: c.text },
    pricePer: { fontFamily: "Montserrat_500Medium", fontSize: 12, color: c.textSecondary },
    priceCta: { fontFamily: "Montserrat_700Bold", fontSize: 12, color: c.tint, marginTop: 4 },
    fine: { marginTop: 12, color: c.textSecondary, fontFamily: "Montserrat_400Regular", fontSize: 12, lineHeight: 17 },
    primaryBtn: { flexDirection: "row", gap: 8, backgroundColor: "#0047AB", borderRadius: 12, minHeight: 46, paddingHorizontal: 14, alignItems: "center", justifyContent: "center", marginTop: 6 },
    primaryBtnText: { color: "#fff", fontFamily: "Montserrat_700Bold", fontSize: 14 },
    disabled: { opacity: 0.48 },
    reactivationHead: { flexDirection: "row", alignItems: "center", gap: 12 },
    reactivationIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: c.surfaceElevated },
    reactivationPrice: { color: c.text, fontFamily: "Montserrat_700Bold", fontSize: 24, marginTop: 4 },
    reactivationTerm: { color: c.gold, fontFamily: "Montserrat_700Bold", fontSize: 13 },
    reactivationConsent: { flexDirection: "row", gap: 10, alignItems: "flex-start", marginTop: 6 },
    reactivationError: { color: c.accent, fontFamily: "Montserrat_600SemiBold", fontSize: 13, lineHeight: 19, marginTop: 6 },
    reactivationSuccess: { color: c.tint, fontFamily: "Montserrat_600SemiBold", fontSize: 13, lineHeight: 19, marginTop: 6 },
  });
}
