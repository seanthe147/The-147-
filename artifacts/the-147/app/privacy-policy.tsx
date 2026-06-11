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
import { useConsent } from "@/contexts/ConsentContext";
import { POLICY_DATES } from "@workspace/db/policy-dates";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

import { useResponsive } from "@/hooks/useResponsive";

export default function PrivacyPolicyScreen() {
  const insets = useSafeAreaInsets();
  const { tabletPad } = useResponsive();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const { consent, revokeConsent } = useConsent();

  async function handleRevokeConsent() {
    if (Platform.OS === "web") {
      const confirmed = window.confirm(
        "This will reset your privacy preferences. You will be asked to consent again. Continue?"
      );
      if (confirmed) await revokeConsent();
    } else {
      const { Alert } = require("react-native");
      Alert.alert(
        "Reset Consent",
        "This will reset your privacy preferences. You will be asked to consent again.",
        [
          { text: "Cancel", style: "cancel" as const },
          { text: "Reset", style: "destructive" as const, onPress: () => revokeConsent() },
        ]
      );
    }
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 12 + webTopInset }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="close" size={24} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Privacy Policy</Text>
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
          <Ionicons name="shield-checkmark" size={18} color={Colors.brand.blue} />
          <Text style={styles.topBadgeText}>UK GDPR Compliant</Text>
        </View>

        <Text style={styles.lastUpdated}>Last Updated: {POLICY_DATES.privacyPolicy}</Text>

        <Section title="1. Who We Are">
          <Text style={styles.bodyText}>
            The 147 ("we", "us", "our") is the data controller for the personal
            data processed through this mobile application. We are a snooker venue,
            bar, and restaurant operating in the United Kingdom.
          </Text>
          <Text style={styles.bodyText}>
            For any data protection queries, please contact us at:{"\n"}
            Website: www.the147.co.uk
          </Text>
        </Section>

        <Section title="2. What Data We Collect">
          <Text style={styles.bodyText}>
            This app is designed with privacy in mind. We minimise the data we
            collect to only what is necessary:
          </Text>
          <View style={styles.bulletList}>
            <Text style={styles.bulletItem}>
              Device preferences: Your consent choices are stored locally on
              your device using AsyncStorage. This data never leaves your device.
            </Text>
            <Text style={styles.bulletItem}>
              Table bookings: When you book a table, we collect your name,
              email address, and phone number. This data is stored securely on
              our servers and is necessary to manage your reservation. Booking
              data is automatically anonymised after 12 months.
            </Text>
            <Text style={styles.bulletItem}>
              Push notifications: If you opt in, your device token is stored to
              send you venue updates. You can unsubscribe at any time.
            </Text>
            <Text style={styles.bulletItem}>
              Contact form messages: When you use the contact form, we collect
              your name, email address, optional phone number, subject, and
              message. This data is stored securely and used only to respond
              to your enquiry. Contact form data is retained for 12 months
              then automatically deleted.
            </Text>
            <Text style={styles.bulletItem}>
              Customer accounts: If you create an account, we store your name,
              email address, phone number (optional), and a securely hashed
              password. Your password is never stored in plain text. Account
              data is retained until you delete your account. You can delete
              your account and all associated data at any time from the
              My Account screen.
            </Text>
            <Text style={styles.bulletItem}>
              Food and drink ordering: Ordering is provided through OrderTab
              (ordertab.menu) embedded within the app. Their privacy policy
              applies to those transactions.
            </Text>
            <Text style={styles.bulletItem}>
              Event tickets: Ticket purchases are handled by TicketSource
              (ticketsource.com). Their privacy policy applies to those
              transactions.
            </Text>
          </View>
        </Section>

        <Section title="3. Legal Basis for Processing">
          <Text style={styles.bodyText}>
            Under UK GDPR (the UK General Data Protection Regulation and the
            Data Protection Act 2018), we process data on the following legal
            bases:
          </Text>
          <View style={styles.bulletList}>
            <Text style={styles.bulletItem}>
              Contract: Processing booking data (name, email, phone) and
              customer account data is necessary to fulfil your table
              reservation request and manage your account (Article 6(1)(b)).
            </Text>
            <Text style={styles.bulletItem}>
              Consent: When you submit the contact form, we process your data
              based on your explicit consent given via the checkbox (Article
              6(1)(a)). You may withdraw consent at any time.
            </Text>
            <Text style={styles.bulletItem}>
              Legitimate interests: Operating the app and providing you with
              venue information, offers, and event listings (Article 6(1)(f)).
            </Text>
            <Text style={styles.bulletItem}>
              Consent: For push notifications, optional analytics, or marketing
              data processing, we rely on your explicit consent which you can
              withdraw at any time (Article 6(1)(a)).
            </Text>
          </View>
        </Section>

        <Section title="4. Third-Party Services">
          <Text style={styles.bodyText}>
            This app integrates with the following third-party services. When
            you use these services, their respective privacy policies apply:
          </Text>
          <View style={styles.bulletList}>
            <Text style={styles.bulletItem}>
              The 147 Website (the147.co.uk) - for online table bookings
            </Text>
            <Text style={styles.bulletItem}>
              OrderTab (ordertab.menu) - for food and drink ordering
            </Text>
            <Text style={styles.bulletItem}>
              TicketSource (ticketsource.com) - for event ticket purchases
            </Text>
          </View>
          <Text style={styles.bodyText}>
            We recommend reviewing their privacy policies before submitting
            personal data through those services.
          </Text>
        </Section>

        <Section title="5. Your Rights Under UK GDPR">
          <Text style={styles.bodyText}>
            Under the UK GDPR, you have the following rights regarding your
            personal data:
          </Text>
          <View style={styles.bulletList}>
            <Text style={styles.bulletItem}>
              Right of access: You can request a copy of any personal data we
              hold about you (Article 15).
            </Text>
            <Text style={styles.bulletItem}>
              Right to rectification: You can ask us to correct any inaccurate
              data (Article 16).
            </Text>
            <Text style={styles.bulletItem}>
              Right to erasure: You can ask us to delete your personal data
              (Article 17).
            </Text>
            <Text style={styles.bulletItem}>
              Right to restrict processing: You can ask us to limit how we use
              your data (Article 18).
            </Text>
            <Text style={styles.bulletItem}>
              Right to data portability: You can request your data in a
              machine-readable format (Article 20).
            </Text>
            <Text style={styles.bulletItem}>
              Right to object: You can object to processing based on legitimate
              interests (Article 21).
            </Text>
            <Text style={styles.bulletItem}>
              Right to withdraw consent: Where processing is based on consent,
              you may withdraw it at any time without affecting the lawfulness of
              prior processing.
            </Text>
          </View>
          <Text style={styles.bodyText}>
            To exercise any of these rights, please contact us through our
            website at www.the147.co.uk.
          </Text>
        </Section>

        <Section title="6. Data Retention">
          <Text style={styles.bodyText}>
            Consent preferences are stored locally on your device and are
            retained until you reset them or uninstall the app.
          </Text>
          <Text style={styles.bodyText}>
            Booking data (name, email, phone number) is retained for 12 months
            after the booking date, after which it is automatically anonymised.
            This retention period allows us to manage your reservation and
            handle any follow-up queries.
          </Text>
          <Text style={styles.bodyText}>
            Contact form messages (name, email, phone, subject, message) are
            retained for 12 months after submission, after which they are
            automatically deleted. You can request earlier deletion by
            contacting us.
          </Text>
          <Text style={styles.bodyText}>
            Customer account data (name, email, phone, hashed password) is
            retained until you delete your account. You can delete your account
            and all associated data at any time from the My Account screen.
            Upon deletion, all personal data including booking history is
            permanently removed.
          </Text>
          <Text style={styles.bodyText}>
            Push notification device tokens are retained until you unsubscribe
            or uninstall the app.
          </Text>
          <Text style={styles.bodyText}>
            Data submitted through third-party services (orders, ticket
            purchases) is retained by those third parties in accordance with
            their own retention policies.
          </Text>
        </Section>

        <Section title="7. Data Security">
          <Text style={styles.bodyText}>
            We implement appropriate technical and organisational measures to
            protect your data, in line with Article 32 of the UK GDPR.
            This includes:
          </Text>
          <View style={styles.bulletList}>
            <Text style={styles.bulletItem}>
              Encrypted connections (HTTPS) for all data transfers
            </Text>
            <Text style={styles.bulletItem}>
              Field-level encryption (AES-256-GCM) for booking personal data
            </Text>
            <Text style={styles.bulletItem}>
              Secure password hashing (scrypt) for customer accounts — your
              password is never stored in readable form
            </Text>
            <Text style={styles.bulletItem}>
              Local-only storage of app preferences and consent choices
            </Text>
          </View>
        </Section>

        <Section title="8. Children's Privacy">
          <Text style={styles.bodyText}>
            This app is not directed at children under the age of 13. We do not
            knowingly collect personal data from children. If you believe a
            child has provided us with personal data, please contact us
            immediately.
          </Text>
        </Section>

        <Section title="9. Complaints">
          <Text style={styles.bodyText}>
            If you are unhappy with how we handle your personal data, you have
            the right to lodge a complaint with the Information Commissioner's
            Office (ICO), the UK's supervisory authority for data protection:
          </Text>
          <View style={styles.bulletList}>
            <Text style={styles.bulletItem}>Website: ico.org.uk</Text>
            <Text style={styles.bulletItem}>Telephone: 0303 123 1113</Text>
          </View>
        </Section>

        <Section title="10. Changes to This Policy">
          <Text style={styles.bodyText}>
            We may update this privacy policy from time to time. Any changes
            will be reflected in the "Last Updated" date at the top of this
            page. We encourage you to review this policy periodically.
          </Text>
        </Section>

        {consent.hasConsented !== null && (
          <View style={styles.consentStatus}>
            <View style={styles.consentStatusRow}>
              <Ionicons
                name="checkmark-circle"
                size={18}
                color={Colors.brand.green}
              />
              <Text style={styles.consentStatusText}>
                Consent given on{" "}
                {consent.consentDate
                  ? new Date(consent.consentDate).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })
                  : "Unknown"}
              </Text>
            </View>
            <Text style={styles.consentDetail}>
              Analytics: {consent.analyticsConsent ? "Allowed" : "Not allowed"}
              {"  |  "}
              Marketing: {consent.marketingConsent ? "Allowed" : "Not allowed"}
            </Text>
            <Pressable
              onPress={handleRevokeConsent}
              style={({ pressed }) => [
                styles.revokeButton,
                { opacity: pressed ? 0.8 : 1 },
              ]}
              testID="revoke-consent-button"
            >
              <Ionicons name="refresh" size={16} color={Colors.brand.red} />
              <Text style={styles.revokeButtonText}>
                Reset Privacy Preferences
              </Text>
            </Pressable>
          </View>
        )}
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
  sectionTitle: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 16,
    color: Colors.light.text,
    marginBottom: 10,
  },
  bodyText: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 13,
    color: Colors.light.textSecondary,
    lineHeight: 20,
    marginBottom: 8,
  },
  bulletList: {
    paddingLeft: 4,
    gap: 6,
    marginBottom: 8,
  },
  bulletItem: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 13,
    color: Colors.light.textSecondary,
    lineHeight: 20,
    paddingLeft: 12,
    borderLeftWidth: 2,
    borderLeftColor: Colors.brand.blue + "30",
  },
  consentStatus: {
    backgroundColor: Colors.light.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.light.border,
    marginBottom: 24,
    gap: 8,
  },
  consentStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  consentStatusText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 13,
    color: Colors.light.text,
  },
  consentDetail: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 12,
    color: Colors.light.textSecondary,
    paddingLeft: 26,
  },
  revokeButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: Colors.brand.red + "10",
    alignSelf: "flex-start",
    marginTop: 4,
  },
  revokeButtonText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 13,
    color: Colors.brand.red,
  },
});
