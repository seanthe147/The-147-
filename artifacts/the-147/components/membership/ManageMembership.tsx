import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getGetMembershipBillingQueryKey,
  useCancelMembershipBilling,
  useChangeMembershipPlan,
  useGetMembershipBilling,
  useReplaceMembershipCard,
  useUndoScheduledMembershipCancellation,
  useManageVipUpgradeCheckout,
} from "@workspace/api-client-react";
import type { MembershipActionResult, MembershipBillingPlan } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import { getApiUrl, prefetchSquarePaymentSdk } from "@/lib/query-client";
import { SquarePaymentSheet } from "@/components/SquarePaymentSheet";
import {
  addMonthsIso,
  apiErrorMessage,
  billingSummary,
  fmtDate as fmt,
  money,
  isUpgradeOffer,
} from "@/lib/membershipDisplay";

type Freq = "monthly" | "annual";
type Palette = ReturnType<typeof useColors>;

async function getCustomerTokenAsync() {
  return (await AsyncStorage.getItem("customer_session_token")) || "";
}

function Checkbox({ checked, onToggle, children, testID, colors }: { checked: boolean; onToggle: () => void; children: React.ReactNode; testID?: string; colors: Palette }) {
  return (
    <Pressable onPress={onToggle} accessibilityRole="checkbox" accessibilityState={{ checked }} testID={testID}
      style={{ flexDirection: "row", gap: 10, marginTop: 12, alignItems: "flex-start" }}>
      <Ionicons name={checked ? "checkbox" : "square-outline"} size={22} color={colors.tint} />
      <Text style={{ flex: 1, fontSize: 13, lineHeight: 19, color: colors.textSecondary, fontFamily: "Montserrat_400Regular" }}>{children}</Text>
    </Pressable>
  );
}

export function ManageMembership({
  onUpgradeVip,
  vipUpgradeMode = false,
}: {
  onUpgradeVip?: () => void;
  vipUpgradeMode?: boolean;
}) {
  const colors = useColors();
  const s = useMemo(() => createStyles(colors), [colors]);
  const queryClient = useQueryClient();
  const { customer: billingCustomer } = useCustomerAuth();
  const [planId, setPlanId] = useState<number | null>(null);
  const [freq, setFreq] = useState<Freq>("monthly");
  const [accepted, setAccepted] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmAbandonUpgrade, setConfirmAbandonUpgrade] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [cardOpen, setCardOpen] = useState(false);
  const [cardConsent, setCardConsent] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);
  const [cardSheetKey, setCardSheetKey] = useState(0);
  const [arFreq, setArFreq] = useState<Freq | null>(null);
  const [arAccepted, setArAccepted] = useState(false);
  const [arOpen, setArOpen] = useState(false);
  const [arError, setArError] = useState<string | null>(null);
  const [arSheetKey, setArSheetKey] = useState(0);
  const [arConfirmCancel, setArConfirmCancel] = useState(false);

  const { data: config } = useQuery<{
    configured: boolean; applicationId: string | null; locationId: string | null; environment: "sandbox" | "production";
  }>({ queryKey: ["/api/public/square-config"] });

  const { data, isLoading, isError, error, refetch, isRefetching } = useGetMembershipBilling({
    query: { queryKey: [...getGetMembershipBillingQueryKey(), billingCustomer?.id], refetchInterval: 30000, staleTime: 0 },
  });
  const offerSignature = JSON.stringify(data?.plans ?? []);
  useEffect(() => {
    setAccepted(false);
    setArAccepted(false);
    setConfirmCancel(false);
  }, [billingCustomer?.id, data?.subscription?.id, data?.subscription?.renewalDate,
    data?.subscription?.pendingDate, data?.subscription?.cancellationDate, offerSignature,
    data?.subscription?.currentTier, data?.subscription?.currentMonthlyPence]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetMembershipBillingQueryKey() });
    queryClient.invalidateQueries({ queryKey: ["/api/membership/my-subscription"] });
  };
  const onDone = (r: MembershipActionResult) => {
    setNotice(r.message + (r.effectiveDate ? ` (effective ${fmt(r.effectiveDate)})` : ""));
    setPlanId(null);
    setAccepted(false);
    setConfirmCancel(false);
    invalidate();
  };
  const change = useChangeMembershipPlan({ mutation: { onSuccess: onDone } });
  const upgradeCheckout = useManageVipUpgradeCheckout({ mutation: {
    onSuccess: async (result) => {
      setConfirmAbandonUpgrade(false);
      setNotice(result.message);
      invalidate();
      if (result.checkoutUrl) {
        try { await Linking.openURL(result.checkoutUrl); }
        catch { setNotice("Could not open Square. Tap Resume checkout to try again."); }
      }
    },
    onError: (e) => { setNotice(apiErrorMessage(e, "Could not verify checkout. Please refresh.")); invalidate(); },
  } });
  const cancel = useCancelMembershipBilling({ mutation: { onSuccess: onDone } });
  const undoCancellation = useUndoScheduledMembershipCancellation({ mutation: { onSuccess: onDone } });
  const replaceCard = useReplaceMembershipCard({ mutation: {
    onSuccess: (result) => { setCardOpen(false); setCardConsent(false); setCardError(null); onDone(result); },
    onError: (e) => {
      setCardError(apiErrorMessage(e, "Card replacement could not be confirmed. Refresh billing before retrying."));
      setCardSheetKey(v => v + 1); // fresh nonce + fresh SCA on retry
      queryClient.invalidateQueries({ queryKey: getGetMembershipBillingQueryKey() });
    },
  } });
  const enableAutoRenew = useMutation({
    mutationFn: async (body: Record<string, unknown>): Promise<MembershipActionResult> => {
      const token = await getCustomerTokenAsync();
      const res = await fetch(new URL("/api/membership/enable-auto-renew", getApiUrl()).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.message || "Automatic billing could not be confirmed. Refresh before retrying.");
      return d as MembershipActionResult;
    },
    onSuccess: (r) => {
      setArOpen(false); setArFreq(null); setArAccepted(false); setArError(null);
      setNotice(r.message + (r.effectiveDate ? ` First charge ${fmt(r.effectiveDate)}.` : ""));
      invalidate();
    },
    onError: (e: Error) => {
      setArError(e.message);
      setArSheetKey(v => v + 1);
      queryClient.invalidateQueries({ queryKey: getGetMembershipBillingQueryKey() });
    },
  });

  if (isLoading) {
    return (
      <View style={s.panel} testID="manage-membership-loading">
        <View style={[s.skel, { width: "40%" }]} />
        <View style={[s.skel, { width: "85%", marginTop: 12 }]} />
        <View style={[s.skel, { width: "70%", marginTop: 8 }]} />
      </View>
    );
  }
  if (isError || !data) {
    return (
      <View style={s.panel} testID="manage-membership-error">
        <Text style={s.h}>Manage membership</Text>
        <Text style={s.muted}>{apiErrorMessage(error, "Billing details could not be loaded.")} Your membership is unaffected; please retry before making any changes.</Text>
        <Pressable onPress={() => refetch()} style={s.ghostBtn} accessibilityRole="button" testID="manage-membership-retry">
          {isRefetching ? <ActivityIndicator color={colors.tint} size="small" /> : <Text style={s.ghostBtnText}>Try again</Text>}
        </Pressable>
      </View>
    );
  }
  const sub = data.subscription;
  if (!sub) {
    return (
      <View style={s.panel} testID="manage-membership-unavailable">
        <Text style={s.h}>Manage membership</Text>
        <Text style={s.muted}>We found your membership but its billing details are not available in the app yet. Please speak to the club before buying another plan.</Text>
      </View>
    );
  }

  const current = data.plans.find(p => p.id === sub.planId);
  const isPrepaid = sub.source === "square_pos";
  const isHeld = sub.status === "frozen" || sub.status === "held";
  const arStart = sub.autoRenewStartDate ?? sub.prepaidUntilDate ?? null;
  const priceOf = (p: MembershipBillingPlan, f: Freq) => (f === "annual" ? p.annualPence : p.monthlyPence);
  const currentMonthly = current?.monthlyPence ?? sub.currentMonthlyPence;
  const currentTier = sub.currentTier;

  const upgrades: { plan: MembershipBillingPlan; f: Freq }[] = [];
  const frequencySwitch: { plan: MembershipBillingPlan; f: Freq }[] = [];
  data.plans.forEach(p => {
    (["monthly", "annual"] as const).forEach(f => {
      const price = priceOf(p, f);
      if (price == null) return;
      if (p.id === sub.planId) { if (f !== sub.frequency) frequencySwitch.push({ plan: p, f }); return; }
      if (isUpgradeOffer(currentMonthly, currentTier, p.monthlyPence, p.tier)) {
        upgrades.push({ plan: p, f });
      }
    });
  });
  const all = [...frequencySwitch, ...upgrades];
  const chosen = all.find(o => o.plan.id === planId && o.f === freq) ?? null;
  const hasPending = !!sub.pendingPlanName || !!sub.cancellationDate;
  const summary = billingSummary(sub);
  const canSelfChange = !isPrepaid && !sub.migrationNeedsReview && sub.managedInSquare && !hasPending && sub.status === "active";

  const row = (label: string, value: string, testID?: string) => (
    <View style={s.row} testID={testID}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={s.rowValue}>{value}</Text>
    </View>
  );

  const optionCard = (o: { plan: MembershipBillingPlan; f: Freq }) => {
    const on = chosen?.plan.id === o.plan.id && chosen.f === o.f;
    const same = o.plan.id === sub.planId;
    return (
      <Pressable key={`${o.plan.id}-${o.f}`} testID={`change-option-${o.plan.id}-${o.f}`}
        accessibilityRole="radio" accessibilityState={{ selected: on }}
        onPress={() => { setPlanId(o.plan.id); setFreq(o.f); setAccepted(false); change.reset(); }}
        style={[s.option, on && s.optionOn]}>
        <View style={{ flex: 1 }}>
          <Text style={s.optionTitle}>{same ? `Switch to ${o.f} payments` : `${o.plan.name}, ${o.f}`}</Text>
          <Text style={s.muted}>
            {same
              ? "Same plan and benefits. Your existing minimum-term dates stay unchanged."
              : o.plan.minimumTermMonths > 0 ? `${o.plan.minimumTermMonths}-month minimum term starting on the change date.` : "No minimum term."}
          </Text>
        </View>
        <Text style={s.optionPrice}>{money(priceOf(o.plan, o.f))}<Text style={s.muted}>/{o.f === "annual" ? "yr" : "mo"}</Text></Text>
      </Pressable>
    );
  };

  return (
    <View testID="manage-membership" style={{ gap: 12 }}>
      {/* Agreement summary */}
      <View style={s.panel}>
        <Text style={s.eyebrow}>YOUR AGREEMENT</Text>
        {row("Plan", sub.planName)}
        {row("Payment", summary.method, "manage-billing-method")}
        {row(summary.dateLabel, fmt(summary.date), "manage-billing-date")}
        {isPrepaid && row("Purchased", sub.firstPaidAt ? fmt(sub.firstPaidAt) : "Unknown")}
        {isPrepaid && sub.lastPaidAt && sub.lastPaidAt !== sub.firstPaidAt ? row("Last renewed", fmt(sub.lastPaidAt)) : null}
        {sub.commitmentEndDate ? row("Minimum term ends", fmt(sub.commitmentEndDate)) : null}
        {sub.pendingPlanName ? (
          <View style={s.callout} testID="manage-pending-change">
            <Ionicons name="time-outline" size={16} color={colors.tint} />
            <Text style={[s.muted, { flex: 1 }]}>Scheduled: {sub.pendingPlanName} from {fmt(sub.pendingDate)}. Your current plan continues until then.</Text>
          </View>
        ) : null}
        {sub.cancellationDate ? (
          <View style={s.callout} testID="manage-cancellation-scheduled">
            <Ionicons name="information-circle-outline" size={16} color={colors.accent} />
            <View style={{ flex: 1 }}>
              <Text style={s.muted}>Membership is scheduled to end {fmt(sub.cancellationDate)}. Your paid access and benefits continue until then.</Text>
              {sub.cancellationReversible ? (
                <>
                  <Text style={[s.muted, { marginTop: 6 }]}>Keep it active and your normal recurring payments continue at the usual renewal. Nothing is charged today.</Text>
                  <Pressable testID="undo-membership-cancellation" accessibilityRole="button"
                    disabled={undoCancellation.isPending}
                    onPress={() => undoCancellation.mutate({ data: { confirmed: true } })}
                    style={[s.primaryBtn, undoCancellation.isPending && s.disabled]}>
                    {undoCancellation.isPending
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <Text style={s.primaryBtnText}>Keep membership</Text>}
                  </Pressable>
                </>
              ) : (
                <Text style={[s.muted, { marginTop: 6 }]}>This cancellation can no longer be changed in the app. Contact the club if you need help.</Text>
              )}
              {undoCancellation.error && <Text style={s.err}>{apiErrorMessage(undoCancellation.error, "Could not keep the membership. Refresh and try again.")}</Text>}
            </View>
          </View>
        ) : null}
        <Text style={[s.muted, { marginTop: 8, fontSize: 12 }]}>Prices shown below are current prices for new choices. Your existing agreement keeps the price you signed up at.</Text>
        {notice && <Text style={s.notice} testID="manage-notice">{notice}</Text>}
      </View>

      {/* Payment card */}
      {sub.cardReplacementAllowed ? (
        <View style={s.panel} testID="manage-card-section">
          <View style={s.sectionHead}>
            <Ionicons name="card-outline" size={18} color={colors.tint} />
            <Text style={s.h}>{isHeld ? "Update card to recover membership" : "Payment card"}</Text>
          </View>
          <Text style={s.body}>
            {sub.paymentCard?.last4
              ? `${sub.paymentCard.brand ?? "Card"} ending ${sub.paymentCard.last4}, expires ${sub.paymentCard.expiryMonth ?? "?"}/${sub.paymentCard.expiryYear ?? "?"}`
              : "No payment card on file."}
          </Text>
          <Text style={[s.muted, { marginTop: 6 }]}>Replacing your card does not change your renewal date, minimum term or scheduled change. No payment is taken now.</Text>
          <Checkbox colors={colors} checked={cardConsent} onToggle={() => setCardConsent(v => !v)} testID="replace-card-consent">
            I authorise this replacement card for my existing recurring membership payments.
          </Checkbox>
          <Pressable testID="replace-membership-card" accessibilityRole="button"
            disabled={!cardConsent || !config?.configured || replaceCard.isPending}
            onPress={() => { setCardError(null); setCardSheetKey(v => v + 1); setCardOpen(true); prefetchSquarePaymentSdk(); }}
            style={[s.primaryBtn, !(cardConsent && config?.configured && !replaceCard.isPending) && s.disabled]}>
            {replaceCard.isPending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.primaryBtnText}>Replace payment card</Text>}
          </Pressable>
          {!config?.configured && <Text style={s.muted}>Secure card setup is unavailable right now. Please try again later.</Text>}
          {cardError && !cardOpen && <Text style={s.err}>{cardError}</Text>}
          <SquarePaymentSheet key={cardSheetKey} visible={cardOpen}
            applicationId={config?.applicationId ?? null} locationId={config?.locationId ?? null}
            environment={config?.environment ?? "sandbox"} amountPence={0} currency="GBP"
            intent="STORE" replaceMembershipCard recurringDescription="For your existing recurring membership. No payment taken now."
            buyerEmail={billingCustomer?.email ?? null} inProgress={replaceCard.isPending} errorMessage={cardError}
            onClose={() => { if (!replaceCard.isPending) setCardOpen(false); }}
            onUnavailable={(message) => { setCardOpen(false); setCardError(message); }}
            onTokenized={({ sourceId, verificationToken }) => {
              if (!verificationToken) { setCardError("Please complete card authorisation before retrying."); return; }
              setCardError(null);
              replaceCard.mutate({ data: { sourceId, verificationToken, authorised: cardConsent } });
            }} />
        </View>
      ) : !isPrepaid && sub.status !== "cancelled" ? (
        <View style={s.panel} testID="manage-card-unavailable">
          <View style={s.sectionHead}>
            <Ionicons name="card-outline" size={18} color={colors.textSecondary} />
            <Text style={s.h}>Payment card</Text>
          </View>
          <Text style={s.muted}>Card changes for this membership are handled by the club. Please speak to staff.</Text>
        </View>
      ) : null}

      {/* Prepaid: optional automatic billing */}
      {isPrepaid && (
        <View style={s.panel} testID="prepaid-auto-renew">
          <View style={s.sectionHead}>
            <Ionicons name="repeat-outline" size={18} color={colors.tint} />
            <Text style={s.h}>Automatic renewal</Text>
          </View>
          {sub.autoRenewScheduled ? (
            <>
              <Text style={s.muted}>Automatic {sub.frequency} billing is scheduled. Nothing is charged before {fmt(sub.autoRenewStartDate)}.</Text>
              {!sub.cancellationDate && (arConfirmCancel ? (
                <>
                  <Text style={[s.muted, { marginTop: 8 }]}>Automatic billing will not start. Your prepaid access continues until {fmt(sub.prepaidUntilDate)}.</Text>
                  <View style={s.btnRow}>
                    <Pressable onPress={() => setArConfirmCancel(false)} style={[s.ghostBtn, { flex: 1 }]}><Text style={s.ghostBtnText}>Keep</Text></Pressable>
                    <Pressable testID="cancel-auto-renew-confirm" disabled={cancel.isPending}
                      onPress={() => cancel.mutate({ data: { confirmed: true } }, { onSuccess: () => setArConfirmCancel(false) })}
                      style={[s.dangerBtn, { flex: 1 }, cancel.isPending && s.disabled]}>
                      {cancel.isPending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.primaryBtnText}>Stop auto-renew</Text>}
                    </Pressable>
                  </View>
                </>
              ) : (
                <Pressable testID="cancel-auto-renew" onPress={() => setArConfirmCancel(true)} style={s.ghostBtn} accessibilityRole="button">
                  <Text style={[s.ghostBtnText, { color: colors.accent }]}>Cancel automatic billing</Text>
                </Pressable>
              ))}
              {cancel.error && <Text style={s.err}>{apiErrorMessage(cancel.error, "Could not cancel.")}</Text>}
            </>
          ) : !sub.autoRenewEligible || !current || !arStart ? (
            <Text style={s.muted}>Bought at the club till: 12 months prepaid with no future charges. Automatic renewal is not available online for this membership; please speak to staff.</Text>
          ) : (
            <>
              <Text style={s.muted}>
                Bought at the club till: prepaid with no future charges unless you choose otherwise. Keep {current.name} going after {fmt(arStart)}. No charge today. Any minimum term starts at the first billing date, not your till purchase.
              </Text>
              {(["monthly", "annual"] as const).map(f => {
                const price = priceOf(current, f);
                if (price == null) return null;
                const on = arFreq === f;
                return (
                  <Pressable key={f} testID={`auto-renew-${f}`} accessibilityRole="radio" accessibilityState={{ selected: on }}
                    onPress={() => { setArFreq(f); setArAccepted(false); setArError(null); }} style={[s.option, on && s.optionOn]}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.optionTitle}>{f === "annual" ? "Annual" : "Monthly"}</Text>
                      <Text style={s.muted}>
                        First charge {fmt(arStart)}, covering to {fmt(addMonthsIso(arStart, f === "annual" ? 12 : 1))}.
                        {current.minimumTermMonths > 0
                          ? ` ${current.minimumTermMonths}-month minimum term from ${fmt(arStart)} (ends ${fmt(addMonthsIso(arStart, current.minimumTermMonths))}).`
                          : " No minimum term."}
                      </Text>
                    </View>
                    <Text style={s.optionPrice}>{money(price)}<Text style={s.muted}>/{f === "annual" ? "yr" : "mo"}</Text></Text>
                  </Pressable>
                );
              })}
              {arFreq && (
                <>
                  <Checkbox colors={colors} checked={arAccepted} onToggle={() => setArAccepted(v => !v)} testID="auto-renew-terms">
                    I agree to the Terms & Conditions and authorise The 147 to charge my card {money(priceOf(current, arFreq) ?? 0)} {arFreq === "annual" ? "every year" : "every month"} from {fmt(arStart)} until I cancel.
                    {current.minimumTermMonths > 0 ? ` I accept a ${current.minimumTermMonths}-month minimum term starting ${fmt(arStart)}.` : ""} Nothing is charged today.
                  </Checkbox>
                  <Pressable testID="auto-renew-setup-card" accessibilityRole="button"
                    disabled={!arAccepted || !config?.configured || enableAutoRenew.isPending}
                    onPress={() => { setArError(null); setArSheetKey(v => v + 1); setArOpen(true); prefetchSquarePaymentSdk(); }}
                    style={[s.primaryBtn, !(arAccepted && config?.configured && !enableAutoRenew.isPending) && s.disabled]}>
                    {enableAutoRenew.isPending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.primaryBtnText}>Set up card (no charge today)</Text>}
                  </Pressable>
                  {!config?.configured && <Text style={s.muted}>Secure card setup is unavailable right now. Please try again later.</Text>}
                </>
              )}
              {arError && !arOpen && <Text style={s.err}>{arError}</Text>}
              <SquarePaymentSheet key={`ar-${arSheetKey}`} visible={arOpen}
                applicationId={config?.applicationId ?? null} locationId={config?.locationId ?? null}
                environment={config?.environment ?? "sandbox"} amountPence={0} currency="GBP"
                intent="STORE" replaceMembershipCard prepaidAutoRenew googlePayAvailable={false}
                recurringDescription={`Automatic billing from ${fmt(arStart)}. No payment taken now.`}
                buyerEmail={billingCustomer?.email ?? null} inProgress={enableAutoRenew.isPending} errorMessage={arError}
                onClose={() => { if (!enableAutoRenew.isPending) setArOpen(false); }}
                onUnavailable={(message) => { setArOpen(false); setArError(message); }}
                onTokenized={({ sourceId, verificationToken }) => {
                  if (!verificationToken) { setArError("Please complete card authorisation before retrying."); return; }
                  if (!arFreq || !arAccepted) return;
                  setArError(null);
                  const body: Record<string, unknown> = { billingFrequency: arFreq, termsAccepted: true, sourceId, verificationToken };
                  if (current.minimumTermMonths > 0) body.minimumTermAccepted = true;
                  enableAutoRenew.mutate(body);
                }} />
            </>
          )}
        </View>
      )}

      {/* Plan & payment frequency */}
      {!isPrepaid && (
        <View style={s.panel} testID="manage-change-section">
          <View style={s.sectionHead}>
            <Ionicons name="trending-up-outline" size={18} color={colors.tint} />
            <Text style={s.h}>Upgrade or payment frequency</Text>
          </View>
          {sub.migrationNeedsReview ? (
            <Text style={s.muted}>Your move from the old website billing is being checked by the club. Changes will be available once the club confirms your previous payments have stopped.</Text>
          ) : data?.pendingUpgrade ? (
            <View testID="pending-vip-upgrade">
              <Text style={s.muted}>Your upgrade to {data.pendingUpgrade.planName} is unfinished. VIP benefits remain active until Square confirms payment.</Text>
              {data.pendingUpgrade.canManage ? <>
                <Pressable style={s.primaryBtn} disabled={upgradeCheckout.isPending}
                  onPress={() => upgradeCheckout.mutate({ data: { attemptId: data.pendingUpgrade!.id, action: "resume" } })}>
                  <Text style={s.primaryBtnText}>Resume checkout</Text>
                </Pressable>
                <Pressable disabled={upgradeCheckout.isPending} onPress={() => setConfirmAbandonUpgrade(!confirmAbandonUpgrade)}>
                  <Text style={s.muted}>{confirmAbandonUpgrade ? "Keep checkout" : "Abandon unpaid upgrade"}</Text>
                </Pressable>
                {confirmAbandonUpgrade && <>
                  <Text style={s.muted}>Close this unpaid checkout? Your VIP membership stays unchanged. Square must confirm it is safe before another upgrade is allowed.</Text>
                  <Pressable disabled={upgradeCheckout.isPending} onPress={() => upgradeCheckout.mutate({
                    data: { attemptId: data.pendingUpgrade!.id, action: "abandon" },
                  })}><Text style={s.muted}>Confirm abandon upgrade</Text></Pressable>
                </>}
                {upgradeCheckout.isPending && <ActivityIndicator color={colors.tint} />}
              </> : <Text style={s.muted}>Payment may already be processing, or the checkout needs review. Refresh membership or contact the club. Do not start a second payment.</Text>}
            </View>
          ) : !sub.managedInSquare && sub.currentTier === "vip" ? (
            <>
              <Text style={s.muted}>
                Choose a paid membership to upgrade. VIP stays active until Square confirms the first payment; VIP cannot be selected again as a customer plan.
              </Text>
              {vipUpgradeMode ? (
                <Text style={s.muted} testID="vip-upgrade-options-hint">
                  Select your paid plan above. Your first payment is due now.
                </Text>
              ) : (
                <Pressable
                  onPress={onUpgradeVip}
                  disabled={!onUpgradeVip}
                  style={s.primaryBtn}
                  accessibilityRole="button"
                  testID="vip-upgrade-button"
                >
                  <Text style={s.primaryBtnText}>View paid membership options</Text>
                </Pressable>
              )}
            </>
          ) : !sub.managedInSquare ? (
            <Text style={s.muted}>This membership is managed by the club. Please speak to staff to make changes.</Text>
          ) : sub.status === "cancelled" ? (
            <Text style={s.muted}>This membership has been cancelled. You keep access until {fmt(summary.date)}. Speak to the club if you would like to continue.</Text>
          ) : sub.status !== "active" ? (
            <Text style={s.muted} testID="manage-change-needs-active">Plan changes are available when your membership is active. Resolve any pending or failed payment first; card recovery remains available above.</Text>
          ) : hasPending ? (
            <Text style={s.muted} testID="manage-change-blocked-pending">A change is already scheduled (see above). Contact the club if you need to alter it.</Text>
          ) : all.length === 0 ? (
            <Text style={s.muted} testID="manage-no-options">{currentMonthly == null
              ? "We cannot confirm suitable plan changes from your current membership details. Please speak to the club."
              : "No higher plan or alternative payment frequency is currently available for your membership."}</Text>
          ) : (
            <>
              <Text style={s.muted}>Changes take effect at your next renewal on {fmt(sub.renewalDate)}. Nothing is charged today.</Text>
              {frequencySwitch.length > 0 && <Text style={s.groupLabel}>PAYMENT FREQUENCY</Text>}
              {frequencySwitch.map(optionCard)}
              <Text style={s.groupLabel}>UPGRADE</Text>
              {upgrades.length === 0 ? <Text style={s.muted}>No higher plan is available right now.</Text> : upgrades.map(optionCard)}
              {chosen && (
                <>
                  <Checkbox colors={colors} checked={accepted} onToggle={() => setAccepted(v => !v)} testID="change-terms">
                    I agree to the{" "}
                    <Text style={{ color: colors.tint, textDecorationLine: "underline" }} onPress={() => Linking.openURL(`${getApiUrl().replace(/\/$/, "")}/terms`)}>Terms & Conditions</Text>
                    {" "}and to switching to {chosen.plan.name} ({chosen.f}, {money(priceOf(chosen.plan, chosen.f))}) from {fmt(sub.renewalDate)}
                    {chosen.plan.id !== sub.planId && chosen.plan.minimumTermMonths > 0
                      ? `, including a new ${chosen.plan.minimumTermMonths}-month minimum term from that date.`
                      : chosen.plan.id === sub.planId ? ". My existing minimum-term dates stay unchanged." : "."}
                  </Checkbox>
                  <Pressable testID="schedule-change" accessibilityRole="button" disabled={!accepted || change.isPending}
                    onPress={() => change.mutate({ data: { planId: chosen.plan.id, billingFrequency: chosen.f, termsAccepted: true } })}
                    style={[s.primaryBtn, (!accepted || change.isPending) && s.disabled]}>
                    {change.isPending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.primaryBtnText}>Schedule change</Text>}
                  </Pressable>
                </>
              )}
              {change.error && <Text style={s.err}>{apiErrorMessage(change.error, "Could not schedule the change.")}</Text>}
            </>
          )}
        </View>
      )}

      {/* Cancellation */}
      {canSelfChange && (
        <View style={s.panel} testID="manage-cancel-section">
          <View style={s.sectionHead}>
            <Ionicons name="exit-outline" size={18} color={colors.textSecondary} />
            <Text style={s.h}>Cancel membership</Text>
          </View>
          {sub.cancellationAllowed ? (
            confirmCancel ? (
              <>
                <Text style={s.muted}>Your membership will stop at {fmt(sub.renewalDate)}. Benefits continue until then and no further payments are taken.</Text>
                <View style={s.btnRow}>
                  <Pressable onPress={() => setConfirmCancel(false)} style={[s.ghostBtn, { flex: 1 }]} accessibilityRole="button"><Text style={s.ghostBtnText}>Keep membership</Text></Pressable>
                  <Pressable testID="cancel-membership-confirm" disabled={cancel.isPending} onPress={() => cancel.mutate({ data: { confirmed: true } })}
                    style={[s.dangerBtn, { flex: 1 }, cancel.isPending && s.disabled]} accessibilityRole="button">
                    {cancel.isPending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.primaryBtnText}>Confirm cancel</Text>}
                  </Pressable>
                </View>
              </>
            ) : (
              <Pressable testID="cancel-membership" onPress={() => { setConfirmCancel(true); cancel.reset(); }} style={s.ghostBtn} accessibilityRole="button">
                <Text style={[s.ghostBtnText, { color: colors.accent }]}>Cancel at next renewal</Text>
              </Pressable>
            )
          ) : (
            <Text style={s.muted} testID="cancel-not-allowed">
              {sub.commitmentEndDate ? `Cancellation opens after your minimum term ends on ${fmt(sub.commitmentEndDate)}.` : "Cancellation is not available online for this membership. Please speak to the club."}
            </Text>
          )}
          {cancel.error && <Text style={s.err}>{apiErrorMessage(cancel.error, "Could not cancel.")}</Text>}
        </View>
      )}
    </View>
  );
}

function createStyles(c: Palette) {
  return StyleSheet.create({
    panel: { backgroundColor: c.surface, borderColor: c.border, borderWidth: 1, borderRadius: 18, padding: 16 },
    skel: { height: 12, borderRadius: 6, backgroundColor: c.surfaceElevated },
    eyebrow: { fontFamily: "Montserrat_700Bold", fontSize: 11, letterSpacing: 1.4, color: c.gold, marginBottom: 6 },
    groupLabel: { fontFamily: "Montserrat_700Bold", fontSize: 11, letterSpacing: 1.2, color: c.textSecondary, marginTop: 14, marginBottom: 2 },
    sectionHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
    h: { fontFamily: "Montserrat_700Bold", fontSize: 15, color: c.text },
    body: { fontFamily: "Montserrat_600SemiBold", fontSize: 14, color: c.text },
    muted: { fontFamily: "Montserrat_400Regular", fontSize: 13, lineHeight: 19, color: c.textSecondary },
    row: { flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 7, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border },
    rowLabel: { fontFamily: "Montserrat_400Regular", fontSize: 13, color: c.textSecondary },
    rowValue: { fontFamily: "Montserrat_600SemiBold", fontSize: 13, color: c.text, flexShrink: 1, textAlign: "right" },
    callout: { flexDirection: "row", gap: 8, alignItems: "flex-start", marginTop: 10, padding: 10, borderRadius: 12, backgroundColor: c.surfaceElevated },
    notice: { marginTop: 10, fontFamily: "Montserrat_600SemiBold", fontSize: 13, color: c.tint },
    option: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 8, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: c.border, backgroundColor: c.background },
    optionOn: { borderWidth: 2, borderColor: c.tint },
    optionTitle: { fontFamily: "Montserrat_700Bold", fontSize: 14, color: c.text, marginBottom: 2 },
    optionPrice: { fontFamily: "Montserrat_700Bold", fontSize: 15, color: c.text },
    primaryBtn: { marginTop: 12, minHeight: 46, borderRadius: 12, backgroundColor: "#0047AB", alignItems: "center", justifyContent: "center", paddingHorizontal: 14 },
    dangerBtn: { marginTop: 12, minHeight: 46, borderRadius: 12, backgroundColor: "#C62828", alignItems: "center", justifyContent: "center", paddingHorizontal: 14 },
    primaryBtnText: { color: "#fff", fontFamily: "Montserrat_700Bold", fontSize: 14, textAlign: "center" },
    ghostBtn: { marginTop: 12, minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center", paddingHorizontal: 14 },
    ghostBtnText: { color: c.tint, fontFamily: "Montserrat_700Bold", fontSize: 14 },
    btnRow: { flexDirection: "row", gap: 10 },
    disabled: { opacity: 0.45 },
    err: { marginTop: 8, fontFamily: "Montserrat_500Medium", fontSize: 13, color: c.accent },
  });
}
