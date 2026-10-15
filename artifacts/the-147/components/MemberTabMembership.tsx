import React, { useMemo } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { getGetMembershipBillingQueryKey, useGetMembershipBilling } from "@workspace/api-client-react";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import { useColors } from "@/hooks/useColors";
import Colors from "@/constants/colors";
import { ManageMembership } from "@/app/membership";
import { getApiUrl } from "@/lib/query-client";

interface PublicPlan {
  id: number;
  name: string;
  priceMonthly: number;
  priceAnnual?: number | null;
  minimumTermMonths?: number;
  benefits?: string[];
  active: boolean;
  hideFromSignup?: boolean;
}

export function MemberTabMembership() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { isAuthenticated, isLoading: authLoading, customer, getCustomerToken } = useCustomerAuth();
  // This existing endpoint also links memberships already held in Square.
  // Run it before offering checkout, not only after someone opens the detail page.
  const existing = useQuery<{ id: number; status: string } | null>({
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
  const subscription = isAuthenticated ? billing.data?.subscription : null;
  const hasMembership = !!subscription && subscription.status !== "cancelled";
  const choose = (planId: number, billingFrequency: "monthly" | "annual") =>
    router.push({ pathname: "/membership", params: { planId: String(planId), billingFrequency } });
  const retry = (fn: () => unknown) => (
    <Pressable onPress={fn} style={styles.button} accessibilityRole="button">
      <Text style={styles.buttonText}>Try again</Text>
    </Pressable>
  );

  return (
    <View style={styles.section} testID="member-tab-membership">
      <Text style={styles.title}>{hasMembership ? "Your membership" : "Choose your membership"}</Text>
      {authLoading || (isAuthenticated && (existing.isPending || (existing.isSuccess && billing.isPending))) ? (
        <ActivityIndicator color={Colors.brand.blue} accessibilityLabel="Loading membership" />
      ) : isAuthenticated && (existing.isError || billing.isError) ? (
        <View style={styles.card}>
          <Text style={styles.body}>We couldn’t check your membership. Please retry before starting a new one.</Text>
          {retry(() => existing.isError ? existing.refetch() : billing.refetch())}
        </View>
      ) : hasMembership ? (
        <View testID="member-tab-management">
          <Text style={styles.body}>{subscription.planName} · {subscription.status.replace(/_/g, " ")}</Text>
          <ManageMembership key={customer?.id} />
          <Pressable style={styles.button} accessibilityRole="button" onPress={() => router.push("/membership")}>
            <Text style={styles.buttonText}>View membership card & benefits</Text>
          </Pressable>
        </View>
      ) : plans.isPending ? (
        <ActivityIndicator color={Colors.brand.blue} accessibilityLabel="Loading membership plans" />
      ) : plans.isError ? (
        <View style={styles.card}>
          <Text style={styles.body}>Membership plans couldn’t be loaded.</Text>
          {retry(() => plans.refetch())}
        </View>
      ) : (
        <View testID="member-tab-plans">
          <Text style={styles.body}>
            {isAuthenticated ? "Choose a plan and securely set up your membership with Square." : "Browse all available plans. Sign in or register to purchase securely with Square."}
          </Text>
          {(plans.data ?? []).filter(p => p.active !== false && !p.hideFromSignup).map(plan => (
            <View key={plan.id} style={styles.card} testID={`member-plan-${plan.id}`}>
              <Text style={styles.planName}>{plan.name}</Text>
              {(plan.benefits ?? []).map((benefit, index) => (
                <View style={styles.benefit} key={`${index}-${benefit}`}>
                  <Ionicons name="checkmark-circle" size={16} color={Colors.brand.gold} />
                  <Text style={[styles.body, { flex: 1 }]}>{benefit}</Text>
                </View>
              ))}
              {(plan.minimumTermMonths ?? 0) > 0 && (
                <Text style={styles.body}>{plan.minimumTermMonths}-month minimum term. Monthly billing continues monthly afterwards; annual billing renews each year.</Text>
              )}
              <Pressable testID={`join-monthly-${plan.id}`} accessibilityRole="button"
                onPress={() => choose(plan.id, "monthly")} style={styles.button}>
                <Text style={styles.buttonText}>Choose monthly · £{(plan.priceMonthly / 100).toFixed(2)}/month</Text>
              </Pressable>
              {plan.priceAnnual != null && (
                <Pressable testID={`join-annual-${plan.id}`} accessibilityRole="button"
                  onPress={() => choose(plan.id, "annual")} style={[styles.button, styles.secondaryButton]}>
                  <Text style={[styles.buttonText, { color: colors.text }]}>Choose annual · £{(plan.priceAnnual / 100).toFixed(2)}/year</Text>
                </Pressable>
              )}
            </View>
          ))}
          {!(plans.data ?? []).some(p => p.active !== false && !p.hideFromSignup) && (
            <Text style={styles.body}>There are no memberships available to purchase right now. Please contact the club.</Text>
          )}
        </View>
      )}
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    section: { marginHorizontal: 20, marginBottom: 24 },
    title: { color: colors.text, fontFamily: "Montserrat_700Bold", fontSize: 20, marginBottom: 12 },
    body: { color: colors.textSecondary, fontSize: 13, lineHeight: 20 },
    card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 18, padding: 16, marginTop: 14, gap: 10 },
    planName: { color: colors.text, fontFamily: "Montserrat_700Bold", fontSize: 18 },
    benefit: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
    button: { backgroundColor: Colors.brand.blue, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 12, alignItems: "center", marginTop: 12 },
    buttonText: { color: "#fff", fontFamily: "Montserrat_700Bold", fontSize: 14, textAlign: "center" },
    secondaryButton: { backgroundColor: colors.input, borderColor: colors.border, borderWidth: 1, marginTop: 0 },
  });
}
