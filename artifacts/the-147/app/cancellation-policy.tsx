import React from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import Colors from "@/constants/colors";
import { useResponsive } from "@/hooks/useResponsive";

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionIcon}>
          <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={18} color={Colors.brand.blue} />
        </View>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function PolicyItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.policyItem}>
      <Text style={styles.policyLabel}>{label}</Text>
      <Text style={styles.policyValue}>{value}</Text>
    </View>
  );
}

export default function CancellationPolicyScreen() {
  const insets = useSafeAreaInsets();
  const { tabletPad } = useResponsive();
  const webTopInset = Platform.OS === "web" ? 67 : 0;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 12 + webTopInset }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="close" size={24} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Cancellation & Refunds</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom, 16) + (Platform.OS === "web" ? 34 : 0), marginHorizontal: tabletPad },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topBadge}>
          <Ionicons name="receipt-outline" size={18} color={Colors.brand.blue} />
          <Text style={styles.topBadgeText}>Cancellation & Refund Policy</Text>
        </View>

        <Text style={styles.lastUpdated}>Last Updated: April 2026</Text>

        <Section title="Table Bookings & Deposits" icon="game-controller-outline">
          <PolicyItem
            label="Dining deposit"
            value="£5.00 per guest, redeemed against your bill on the night."
          />
          <PolicyItem
            label="Dining cancellation — 24+ hours notice"
            value="Full deposit refund."
          />
          <PolicyItem
            label="Dining cancellation — less than 24 hours / no-show"
            value="Deposit is non-refundable."
          />
          <PolicyItem
            label="Game table cancellation — 2+ hours notice"
            value="Free to cancel, full refund of any deposit."
          />
          <PolicyItem
            label="Game table cancellation — less than 2 hours / no-show"
            value="Any deposit paid may be retained."
          />
          <PolicyItem
            label="Late arrival"
            value="Tables held for 15 minutes. After that, we may release the table and retain the deposit."
          />
        </Section>

        <Section title="Memberships" icon="card-outline">
          <PolicyItem
            label="Cancellation"
            value="Cancel any time from My Account in the app. No cancellation fee."
          />
          <PolicyItem
            label="When cancellation takes effect"
            value="At the end of the current billing period. You keep member benefits until then."
          />
          <PolicyItem
            label="Refund on current month's payment"
            value="Membership fees are non-refundable once a billing period has begun."
          />
          <PolicyItem
            label="Minimum contract"
            value="None — cancel whenever you like."
          />
          <PolicyItem
            label="Failed payment"
            value="Benefits suspended. We retry for up to 7 days before cancelling."
          />
          <PolicyItem
            label="Price changes"
            value="30 days' notice by email. You may cancel before the new price takes effect."
          />
        </Section>

        <Section title="Gift Cards" icon="gift-outline">
          <PolicyItem
            label="Validity"
            value="12 months from the date of purchase. Unused balance expires after this date."
          />
          <PolicyItem
            label="Where redeemable"
            value="In-venue against food, drink, table hire, and events sold directly by The 147. Not valid for membership fees or third-party services."
          />
          <PolicyItem
            label="Refunds"
            value="Non-refundable once purchased, except where required by law."
          />
          <PolicyItem
            label="Lost or stolen"
            value="We cannot replace gift cards that are lost or stolen. Treat them like cash."
          />
        </Section>

        <Section title="Event Tickets" icon="ticket-outline">
          <PolicyItem
            label="TicketSource events"
            value="Tickets are subject to TicketSource's own refund policy."
          />
          <PolicyItem
            label="Direct sales by The 147"
            value="Non-refundable unless the event is cancelled by us."
          />
          <PolicyItem
            label="Event cancelled by us"
            value="Full refund of the ticket price."
          />
        </Section>

        <Section title="Food & Drink Orders" icon="fast-food-outline">
          <PolicyItem
            label="Accepted kitchen orders"
            value="Generally cannot be cancelled or refunded once accepted by the kitchen."
          />
          <PolicyItem
            label="Errors or quality issues"
            value="Speak to a member of staff immediately — we will resolve it."
          />
        </Section>

        <View style={styles.contactCard}>
          <Text style={styles.contactTitle}>Questions about a refund?</Text>
          <Text style={styles.contactText}>
            Contact us through our website and we will do our best to help.
          </Text>
          <View style={styles.contactRow}>
            <Ionicons name="globe-outline" size={16} color={Colors.brand.blue} />
            <Text style={styles.contactLink}>www.the147.co.uk</Text>
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
    paddingBottom: 14,
    backgroundColor: Colors.light.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 18,
    color: Colors.light.text,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  topBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.brand.blue + "10",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    alignSelf: "flex-start",
    marginBottom: 12,
  },
  topBadgeText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 13,
    color: Colors.brand.blue,
  },
  lastUpdated: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 12,
    color: Colors.light.textSecondary,
    marginBottom: 24,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  sectionIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: Colors.brand.blue + "10",
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitle: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 16,
    color: Colors.light.text,
    flex: 1,
  },
  policyItem: {
    backgroundColor: Colors.light.surface,
    borderRadius: 10,
    padding: 12,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: Colors.light.border,
    gap: 4,
  },
  policyLabel: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 13,
    color: Colors.light.text,
  },
  policyValue: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 13,
    color: Colors.light.textSecondary,
    lineHeight: 19,
  },
  contactCard: {
    backgroundColor: Colors.brand.blue + "08",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.brand.blue + "20",
    marginTop: 4,
    marginBottom: 16,
    gap: 6,
  },
  contactTitle: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 14,
    color: Colors.light.text,
  },
  contactText: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 13,
    color: Colors.light.textSecondary,
  },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  contactLink: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 13,
    color: Colors.brand.blue,
  },
});
