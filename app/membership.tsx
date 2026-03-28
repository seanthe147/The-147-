import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import Colors from "@/constants/colors";

const PLANS = [
  {
    id: "rack",
    name: "Rack",
    price: 19.99,
    color: Colors.brand.blue,
    icon: "ellipse" as const,
    tagline: "Perfect for casual players",
    features: [
      { icon: "time-outline", text: "4 hours snooker per month" },
      { icon: "restaurant-outline", text: "5% food & drink discount" },
      { icon: "star-outline", text: "Member loyalty points" },
    ],
  },
  {
    id: "century",
    name: "Century",
    price: 34.99,
    color: "#D4A843",
    icon: "trophy" as const,
    tagline: "Most popular",
    popular: true,
    features: [
      { icon: "time-outline", text: "8 hours snooker per month" },
      { icon: "restaurant-outline", text: "10% food & drink discount" },
      { icon: "flash-outline", text: "Priority booking access" },
      { icon: "star-outline", text: "Member loyalty points" },
    ],
  },
  {
    id: "maximum",
    name: "Maximum",
    price: 54.99,
    color: "#10B981",
    icon: "diamond" as const,
    tagline: "The full experience",
    features: [
      { icon: "infinite-outline", text: "Unlimited snooker" },
      { icon: "restaurant-outline", text: "15% food & drink discount" },
      { icon: "flash-outline", text: "Priority booking access" },
      { icon: "people-outline", text: "1 guest pass per month" },
      { icon: "star-outline", text: "2× loyalty points on every visit" },
    ],
  },
];

export default function MembershipScreen() {
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0) }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={22} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Membership</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 20) },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Ionicons name="card" size={32} color={Colors.brand.blue} />
          </View>
          <Text style={styles.heroTitle}>The 147 Membership</Text>
          <Text style={styles.heroSub}>
            Join our exclusive membership programme and make the most of every visit — discounts, priority booking, and more.
          </Text>
          <View style={styles.comingSoonBadge}>
            <Ionicons name="time-outline" size={13} color="#92680a" />
            <Text style={styles.comingSoonText}>Launching soon — register your interest below</Text>
          </View>
        </View>

        {/* Plans */}
        {PLANS.map((plan) => (
          <Pressable
            key={plan.id}
            onPress={() => setSelected(plan.id === selected ? null : plan.id)}
            style={[
              styles.planCard,
              plan.popular && styles.planCardPopular,
              selected === plan.id && { borderColor: plan.color, borderWidth: 2 },
            ]}
          >
            {plan.popular && (
              <View style={[styles.popularBadge, { backgroundColor: plan.color }]}>
                <Text style={styles.popularBadgeText}>Most Popular</Text>
              </View>
            )}

            <View style={styles.planHeader}>
              <View style={[styles.planIconWrap, { backgroundColor: plan.color + "22" }]}>
                <Ionicons name={plan.icon} size={20} color={plan.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.planName}>{plan.name}</Text>
                <Text style={styles.planTagline}>{plan.tagline}</Text>
              </View>
              <View style={styles.priceBlock}>
                <Text style={[styles.planPrice, { color: plan.color }]}>
                  £{plan.price.toFixed(2)}
                </Text>
                <Text style={styles.planPeriod}>/month</Text>
              </View>
            </View>

            <View style={styles.featureList}>
              {plan.features.map((f, i) => (
                <View key={i} style={styles.featureRow}>
                  <View style={[styles.featureDot, { backgroundColor: plan.color + "33" }]}>
                    <Ionicons name={f.icon as any} size={12} color={plan.color} />
                  </View>
                  <Text style={styles.featureText}>{f.text}</Text>
                </View>
              ))}
            </View>
          </Pressable>
        ))}

        {/* CTA — coming soon */}
        <View style={styles.ctaBox}>
          <Ionicons name="notifications-outline" size={28} color={Colors.brand.blue} />
          <Text style={styles.ctaTitle}>Be the first to know</Text>
          <Text style={styles.ctaSub}>
            We're putting the finishing touches on our membership programme. Visit us at the club or speak to a member of staff to register your interest.
          </Text>
          <View style={styles.ctaDivider} />
          <View style={styles.ctaDetail}>
            <Ionicons name="location-outline" size={14} color={Colors.light.textSecondary} />
            <Text style={styles.ctaDetailText}>The 147 Snooker Club, Bradford</Text>
          </View>
          <View style={styles.ctaDetail}>
            <Ionicons name="mail-outline" size={14} color={Colors.light.textSecondary} />
            <Text style={styles.ctaDetailText}>info@the147bradford.co.uk</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
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
  headerTitle: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 17,
    color: Colors.light.text,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 20,
    gap: 16,
  },
  hero: {
    alignItems: "center",
    paddingVertical: 8,
    marginBottom: 4,
  },
  heroIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: Colors.brand.blue + "15",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  heroTitle: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 24,
    color: Colors.light.text,
    textAlign: "center",
    marginBottom: 10,
  },
  heroSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.light.textSecondary,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 14,
  },
  comingSoonBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  comingSoonText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: "#92680a",
  },
  planCard: {
    backgroundColor: Colors.light.surface,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1.5,
    borderColor: Colors.light.border,
    position: "relative",
    overflow: "hidden",
  },
  planCardPopular: {
    borderColor: "#D4A843",
  },
  popularBadge: {
    position: "absolute",
    top: 14,
    right: 14,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  popularBadgeText: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 10,
    color: "#fff",
    letterSpacing: 0.3,
  },
  planHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 14,
  },
  planIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  planName: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 18,
    color: Colors.light.text,
  },
  planTagline: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  priceBlock: {
    alignItems: "flex-end",
  },
  planPrice: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 22,
  },
  planPeriod: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.light.textSecondary,
  },
  featureList: {
    gap: 8,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  featureDot: {
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  featureText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.light.text,
    flex: 1,
  },
  ctaBox: {
    backgroundColor: Colors.light.surface,
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.light.border,
    marginTop: 4,
  },
  ctaTitle: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 18,
    color: Colors.light.text,
    marginTop: 12,
    marginBottom: 8,
  },
  ctaSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.light.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  ctaDivider: {
    height: 1,
    backgroundColor: Colors.light.border,
    alignSelf: "stretch",
    marginVertical: 16,
  },
  ctaDetail: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  ctaDetailText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.light.textSecondary,
  },
});
