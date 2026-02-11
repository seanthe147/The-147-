import React from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Platform,
  Linking,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import Colors from "@/constants/colors";
import { OPENING_HOURS } from "@/lib/data";

function InfoSection({
  icon,
  title,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.infoSection}>
      <View style={styles.infoHeader}>
        <View style={styles.infoIconWrap}>
          <Ionicons name={icon} size={20} color={Colors.brand.blue} />
        </View>
        <Text style={styles.infoTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function FacilityItem({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }) {
  return (
    <View style={styles.facilityItem}>
      <Ionicons name={icon} size={20} color={Colors.brand.blue} />
      <Text style={styles.facilityLabel}>{label}</Text>
    </View>
  );
}

export default function AboutScreen() {
  const insets = useSafeAreaInsets();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const today = new Date().getDay();
  const dayIndex = today === 0 ? 6 : today - 1;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.scrollContent,
        { paddingTop: insets.top + webTopInset },
      ]}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
    >
      <LinearGradient
        colors={[Colors.brand.dark, Colors.brand.navy]}
        style={styles.heroSection}
      >
        <View style={[styles.heroInner, { paddingTop: insets.top + 24 + webTopInset }]}>
          <Text style={styles.heroLogoText}>The 147</Text>
          <Text style={styles.heroTagline}>
            Your premier destination for snooker, pool, dining and entertainment
          </Text>
        </View>
      </LinearGradient>

      <View style={styles.body}>
        <InfoSection icon="information-circle" title="About The 147">
          <Text style={styles.bodyText}>
            The 147 is more than just a snooker club. We're a modern venue that combines
            the best of cue sports with quality dining, a fully stocked bar, and regular
            entertainment. Whether you're a seasoned player or picking up a cue for the
            first time, you'll feel right at home.
          </Text>
          <Text style={styles.bodyText}>
            Our venue features professional-grade snooker and pool tables, a restaurant
            serving fresh food throughout the day, and a bar with a wide selection of
            drinks. We host regular tournaments, live music, and social events for the
            whole community.
          </Text>
        </InfoSection>

        <InfoSection icon="grid" title="Our Facilities">
          <View style={styles.facilitiesGrid}>
            <FacilityItem icon="ellipse" label="Full-Size Snooker Tables" />
            <FacilityItem icon="ellipse-outline" label="Pool Tables" />
            <FacilityItem icon="restaurant" label="Restaurant & Kitchen" />
            <FacilityItem icon="beer" label="Fully Licensed Bar" />
            <FacilityItem icon="tv" label="Live Sports Screens" />
            <FacilityItem icon="star" label="VIP Lounge Area" />
            <FacilityItem icon="musical-notes" label="Live Music Events" />
            <FacilityItem icon="trophy" label="Weekly Tournaments" />
            <FacilityItem icon="wifi" label="Free Wi-Fi" />
            <FacilityItem icon="car" label="On-Site Parking" />
          </View>
        </InfoSection>

        <InfoSection icon="time" title="Opening Hours">
          <View style={styles.hoursContainer}>
            {OPENING_HOURS.map((item, index) => (
              <View
                key={item.day}
                style={[
                  styles.hoursRow,
                  index === dayIndex && styles.hoursRowToday,
                ]}
              >
                <Text style={[styles.hoursDay, index === dayIndex && styles.hoursTodayText]}>
                  {item.day}
                </Text>
                <Text style={[styles.hoursTime, index === dayIndex && styles.hoursTodayText]}>
                  {item.hours}
                </Text>
                {index === dayIndex && (
                  <View style={styles.todayBadge}>
                    <Text style={styles.todayBadgeText}>Today</Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        </InfoSection>

        <InfoSection icon="call" title="Contact & Location">
          <View style={styles.contactList}>
            <Pressable
              onPress={() => Linking.openURL("https://www.the147.co.uk")}
              style={({ pressed }) => [styles.contactItem, { opacity: pressed ? 0.7 : 1 }]}
            >
              <Ionicons name="globe-outline" size={18} color={Colors.brand.blue} />
              <Text style={styles.contactText}>www.the147.co.uk</Text>
              <Ionicons name="open-outline" size={14} color={Colors.light.textSecondary} />
            </Pressable>

            <View style={styles.contactItem}>
              <Ionicons name="location-outline" size={18} color={Colors.brand.blue} />
              <Text style={styles.contactText}>The 147 Venue</Text>
            </View>
          </View>
        </InfoSection>

        <Pressable
          onPress={() => router.push("/admin-offers")}
          style={({ pressed }) => [
            styles.adminButton,
            { opacity: pressed ? 0.8 : 1 },
          ]}
          testID="manage-offers-button"
        >
          <Ionicons name="settings-outline" size={20} color={Colors.brand.blue} />
          <Text style={styles.adminButtonText}>Manage Offers</Text>
          <Ionicons name="chevron-forward" size={18} color={Colors.light.textSecondary} />
        </Pressable>

        <View style={styles.socialRow}>
          <Pressable style={styles.socialBtn}>
            <Ionicons name="logo-facebook" size={22} color={Colors.brand.blue} />
          </Pressable>
          <Pressable style={styles.socialBtn}>
            <Ionicons name="logo-instagram" size={22} color={Colors.brand.blue} />
          </Pressable>
          <Pressable style={styles.socialBtn}>
            <Ionicons name="logo-twitter" size={22} color={Colors.brand.blue} />
          </Pressable>
        </View>

        <Text style={styles.footerText}>
          The 147  /  Venue  /  Snooker  /  Bar  /  Restaurant
        </Text>

        <View style={{ height: Platform.OS === "web" ? 34 : 100 }} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  scrollContent: {
    paddingTop: 0,
  },
  heroSection: {
    width: "100%",
  },
  heroInner: {
    alignItems: "center",
    paddingHorizontal: 24,
    paddingBottom: 32,
  },
  heroLogoText: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 38,
    color: "#FFFFFF",
    letterSpacing: 1,
    marginBottom: 12,
  },
  heroTagline: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 14,
    color: "rgba(255,255,255,0.7)",
    textAlign: "center",
    lineHeight: 22,
  },
  body: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  infoSection: {
    marginBottom: 28,
  },
  infoHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
  },
  infoIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.brand.blue + "12",
    alignItems: "center",
    justifyContent: "center",
  },
  infoTitle: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 18,
    color: Colors.light.text,
  },
  bodyText: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 14,
    color: Colors.light.textSecondary,
    lineHeight: 22,
    marginBottom: 12,
  },
  facilitiesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  facilityItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.light.surface,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.light.border,
    width: "48%" as any,
    flexGrow: 1,
    flexBasis: "46%" as any,
  },
  facilityLabel: {
    fontFamily: "Montserrat_500Medium",
    fontSize: 12,
    color: Colors.light.text,
    flex: 1,
  },
  hoursContainer: {
    backgroundColor: Colors.light.surface,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  hoursRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  hoursRowToday: {
    backgroundColor: Colors.brand.blue + "0A",
  },
  hoursDay: {
    fontFamily: "Montserrat_500Medium",
    fontSize: 14,
    color: Colors.light.text,
    flex: 1,
  },
  hoursTime: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 14,
    color: Colors.light.textSecondary,
  },
  hoursTodayText: {
    fontFamily: "Montserrat_600SemiBold",
    color: Colors.brand.blue,
  },
  todayBadge: {
    marginLeft: 8,
    backgroundColor: Colors.brand.blue,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  todayBadgeText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 10,
    color: "#FFFFFF",
  },
  contactList: {
    gap: 12,
  },
  contactItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Colors.light.surface,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  contactText: {
    fontFamily: "Montserrat_500Medium",
    fontSize: 14,
    color: Colors.light.text,
    flex: 1,
  },
  socialRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 16,
    marginTop: 8,
    marginBottom: 24,
  },
  socialBtn: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: Colors.brand.blue + "10",
    alignItems: "center",
    justifyContent: "center",
  },
  adminButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Colors.light.surface,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.light.border,
    marginBottom: 24,
  },
  adminButtonText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 15,
    color: Colors.light.text,
    flex: 1,
  },
  footerText: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 12,
    color: Colors.light.textSecondary,
    textAlign: "center",
    letterSpacing: 1,
    marginBottom: 8,
  },
});
