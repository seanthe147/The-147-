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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Right({ article, title, description }: { article: string; title: string; description: string }) {
  return (
    <View style={styles.rightCard}>
      <View style={styles.rightHeader}>
        <View style={styles.articleBadge}>
          <Text style={styles.articleText}>{article}</Text>
        </View>
        <Text style={styles.rightTitle}>{title}</Text>
      </View>
      <Text style={styles.rightDescription}>{description}</Text>
    </View>
  );
}

export default function GdprRightsScreen() {
  const insets = useSafeAreaInsets();
  const { tabletPad } = useResponsive();
  const webTopInset = Platform.OS === "web" ? 67 : 0;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 12 + webTopInset }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="close" size={24} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.headerTitle}>UK GDPR Rights</Text>
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
          <Text style={styles.topBadgeText}>UK GDPR — Data Protection Act 2018</Text>
        </View>

        <Text style={styles.intro}>
          Under the UK General Data Protection Regulation (UK GDPR) and the Data Protection
          Act 2018, you have the following rights regarding your personal data held by The 147.
        </Text>

        <Right
          article="Art. 15"
          title="Right of Access"
          description="You can request a copy of any personal data we hold about you, along with information about how and why we process it."
        />
        <Right
          article="Art. 16"
          title="Right to Rectification"
          description="If any personal data we hold about you is inaccurate or incomplete, you can ask us to correct or complete it."
        />
        <Right
          article="Art. 17"
          title="Right to Erasure"
          description="You can ask us to delete your personal data. You can exercise this right at any time from the My Account screen. Where we have a legal obligation to retain data, we will explain this."
        />
        <Right
          article="Art. 18"
          title="Right to Restrict Processing"
          description="You can ask us to limit how we use your data — for example, while you contest its accuracy or while we consider an objection you have raised."
        />
        <Right
          article="Art. 20"
          title="Right to Data Portability"
          description="Where we process your data based on consent or contract, you can request it in a structured, machine-readable format so you can transfer it to another organisation."
        />
        <Right
          article="Art. 21"
          title="Right to Object"
          description="You can object to processing based on our legitimate interests. We will stop unless we can demonstrate compelling grounds that override your rights."
        />
        <Right
          article="Art. 22"
          title="Rights Around Automated Decisions"
          description="You have the right not to be subject to decisions made solely by automated processing (including profiling) that have a legal or similarly significant effect on you."
        />
        <Right
          article="Art. 7"
          title="Right to Withdraw Consent"
          description="Where we rely on your consent to process data (such as for push notifications or marketing), you may withdraw it at any time. Withdrawal does not affect the lawfulness of processing before withdrawal."
        />

        <Section title="How to Exercise Your Rights">
          <Text style={styles.bodyText}>
            To submit a data request or exercise any of the rights above, please contact
            us through our website:
          </Text>
          <View style={styles.contactCard}>
            <Ionicons name="globe-outline" size={18} color={Colors.brand.blue} />
            <Text style={styles.contactText}>www.the147.co.uk</Text>
          </View>
          <Text style={styles.bodyText}>
            We will respond within one calendar month. In complex cases we may extend
            this by a further two months, in which case we will notify you.
          </Text>
        </Section>

        <Section title="Right to Complain">
          <Text style={styles.bodyText}>
            If you are unhappy with how we have handled your personal data, you have the
            right to lodge a complaint with the UK's data protection regulator:
          </Text>
          <View style={styles.icoCard}>
            <Text style={styles.icoName}>Information Commissioner's Office (ICO)</Text>
            <Text style={styles.icoDetail}>ico.org.uk</Text>
            <Text style={styles.icoDetail}>0303 123 1113</Text>
          </View>
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
    marginBottom: 16,
  },
  topBadgeText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 13,
    color: Colors.brand.blue,
  },
  intro: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 13,
    color: Colors.light.textSecondary,
    lineHeight: 20,
    marginBottom: 20,
  },
  rightCard: {
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.light.border,
    gap: 8,
  },
  rightHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  articleBadge: {
    backgroundColor: Colors.brand.blue + "15",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  articleText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 11,
    color: Colors.brand.blue,
  },
  rightTitle: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 14,
    color: Colors.light.text,
    flex: 1,
  },
  rightDescription: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 13,
    color: Colors.light.textSecondary,
    lineHeight: 19,
  },
  section: {
    marginTop: 24,
    marginBottom: 8,
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
    marginBottom: 10,
  },
  contactCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: Colors.brand.blue + "10",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
  },
  contactText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 14,
    color: Colors.brand.blue,
  },
  icoCard: {
    backgroundColor: Colors.light.surface,
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.light.border,
    gap: 4,
  },
  icoName: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 13,
    color: Colors.light.text,
  },
  icoDetail: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 13,
    color: Colors.light.textSecondary,
  },
});
