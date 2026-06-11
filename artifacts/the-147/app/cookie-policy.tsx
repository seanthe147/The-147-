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
import { useConsent } from "@/contexts/ConsentContext";
import { POLICY_DATES } from "@workspace/db/policy-dates";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function StorageItem({ icon, label, description }: { icon: keyof typeof Ionicons.glyphMap; label: string; description: string }) {
  return (
    <View style={styles.storageItem}>
      <View style={styles.storageIcon}>
        <Ionicons name={icon} size={18} color={Colors.brand.blue} />
      </View>
      <View style={styles.storageText}>
        <Text style={styles.storageLabel}>{label}</Text>
        <Text style={styles.storageDescription}>{description}</Text>
      </View>
    </View>
  );
}

export default function CookiePolicyScreen() {
  const insets = useSafeAreaInsets();
  const { tabletPad } = useResponsive();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const { revokeConsent } = useConsent();
  const { logout } = useCustomerAuth();

  async function doClear() {
    await Promise.all([revokeConsent(), logout()]);
  }

  function handleClearLocalData() {
    if (Platform.OS === "web") {
      const confirmed = window.confirm(
        "This will sign you out and clear all consent preferences and local app data. You will be asked to consent again next time you open the app. Continue?"
      );
      if (confirmed) doClear();
    } else {
      const { Alert } = require("react-native");
      Alert.alert(
        "Clear Local Data",
        "This will sign you out and clear all consent preferences and local app data. You will be asked to consent again on next launch.",
        [
          { text: "Cancel", style: "cancel" as const },
          { text: "Clear Data", style: "destructive" as const, onPress: doClear },
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
        <Text style={styles.headerTitle}>Cookie & Storage Policy</Text>
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
          <Ionicons name="phone-portrait-outline" size={18} color={Colors.brand.blue} />
          <Text style={styles.topBadgeText}>Device Storage Only — No Tracking Cookies</Text>
        </View>

        <Text style={styles.lastUpdated}>Last Updated: {POLICY_DATES.cookiePolicy}</Text>

        <Section title="No Web Cookies">
          <Text style={styles.bodyText}>
            This is a native mobile app. We do not use web browser cookies or any
            third-party tracking cookies. There are no advertising trackers, no
            cross-site tracking, and no analytics cookies.
          </Text>
        </Section>

        <Section title="What We Store on Your Device">
          <Text style={styles.bodyText}>
            The app stores a small amount of data locally on your device using
            AsyncStorage (React Native's local storage). This data stays on your
            device and is never sold or shared with third parties.
          </Text>

          <StorageItem
            icon="shield-checkmark-outline"
            label="Consent Preferences"
            description="Your privacy consent choices (analytics: yes/no, marketing: yes/no) and the date you gave consent. Stored so you are not asked every time you open the app."
          />
          <StorageItem
            icon="key-outline"
            label="Session Token"
            description="If you sign in to your account, an authentication token is stored securely so you stay logged in between sessions. Cleared when you sign out."
          />
          <StorageItem
            icon="trophy-outline"
            label="Loyalty Points Cache"
            description="Your current loyalty points balance is cached locally to display instantly without a network request. Refreshed automatically when you open the app."
          />
        </Section>

        <Section title="What We Do Not Store">
          <Text style={styles.bodyText}>
            We do not store payment card details, passwords (your password is never
            stored on-device), or any sensitive personal data in local storage.
            Booking and account data is held on our secure servers only.
          </Text>
        </Section>

        <Section title="Third-Party Content">
          <Text style={styles.bodyText}>
            Some screens embed third-party services (OrderTab for food ordering,
            TicketSource for event tickets). These load inside an in-app browser
            and may use their own cookies subject to their own privacy policies.
          </Text>
        </Section>

        <Section title="Clear Your Local Data">
          <Text style={styles.bodyText}>
            You can clear all locally stored data at any time. This will sign you out,
            reset your privacy consent preferences, and clear any cached data on this
            device. The app will ask for consent again on next launch. Your account
            and booking data on our servers is unaffected.
          </Text>
          <Pressable
            onPress={handleClearLocalData}
            style={({ pressed }) => [styles.clearButton, { opacity: pressed ? 0.8 : 1 }]}
          >
            <Ionicons name="trash-outline" size={16} color={Colors.brand.red} />
            <Text style={styles.clearButtonText}>Clear Local App Data</Text>
          </Pressable>
          <Text style={styles.clearNote}>
            Clearing local data signs you out automatically. To sign out without clearing
            consent preferences, use the Sign Out option in My Account.
          </Text>
        </Section>
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
  storageItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  storageIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.brand.blue + "10",
    alignItems: "center",
    justifyContent: "center",
  },
  storageText: {
    flex: 1,
    gap: 4,
  },
  storageLabel: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 14,
    color: Colors.light.text,
  },
  storageDescription: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 13,
    color: Colors.light.textSecondary,
    lineHeight: 19,
  },
  clearButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.brand.red + "10",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignSelf: "flex-start",
    marginBottom: 10,
  },
  clearButtonText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 14,
    color: Colors.brand.red,
  },
  clearNote: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 12,
    color: Colors.light.textSecondary,
    lineHeight: 18,
    fontStyle: "italic",
  },
});
