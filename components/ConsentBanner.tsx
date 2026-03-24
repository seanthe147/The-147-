import React from "react";
import { StyleSheet, Text, View, Pressable, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useConsent } from "@/contexts/ConsentContext";
import Colors from "@/constants/colors";

export function ConsentBanner() {
  const { consent, isLoading, acceptEssentialOnly } = useConsent();
  const insets = useSafeAreaInsets();

  if (isLoading || consent.hasConsented !== null) return null;

  return (
    <View style={styles.overlay}>
      <View
        style={[
          styles.banner,
          { paddingBottom: Math.max(insets.bottom, 16) + (Platform.OS === "web" ? 34 : 0) },
        ]}
      >
        <View style={styles.iconRow}>
          <View style={styles.iconWrap}>
            <Ionicons name="shield-checkmark" size={22} color={Colors.brand.blue} />
          </View>
          <Text style={styles.heading}>Your Privacy</Text>
        </View>

        <Text style={styles.description}>
          We only collect the information you provide — such as your name, email
          and phone number — to manage your bookings and account. We do not
          track your activity, use cookies, or share your data with third
          parties. View our{" "}
          <Text
            style={styles.link}
            onPress={() => router.push("/privacy-policy")}
          >
            Privacy Policy
          </Text>{" "}
          for full details.
        </Text>

        <Pressable
          onPress={acceptEssentialOnly}
          style={({ pressed }) => [
            styles.button,
            styles.acceptButton,
            { opacity: pressed ? 0.8 : 1 },
          ]}
          testID="consent-accept-all"
        >
          <Text style={styles.acceptButtonText}>Accept & Continue</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
    zIndex: 9999,
  },
  banner: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 24,
    boxShadow: "0px -4px 12px rgba(0,0,0,0.15)",
    elevation: 8,
  },
  iconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.brand.blue + "12",
    alignItems: "center",
    justifyContent: "center",
  },
  heading: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 18,
    color: Colors.light.text,
  },
  description: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 13,
    color: Colors.light.textSecondary,
    lineHeight: 20,
    marginBottom: 20,
  },
  link: {
    color: Colors.brand.blue,
    fontFamily: "Montserrat_600SemiBold",
    textDecorationLine: "underline",
  },
  button: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  acceptButton: {
    backgroundColor: Colors.brand.blue,
  },
  acceptButtonText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 14,
    color: "#FFFFFF",
  },
});
