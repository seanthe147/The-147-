import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { PenaltyShootoutGame } from "@/components/PenaltyShootoutGame";
import Colors from "@/constants/colors";

export default function WorldCupGameScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={["#052e16", "#0f3d22", "#0a1a10"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable
          onPress={() => {
            if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.back();
          }}
          style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.7 : 1 }]}
          hitSlop={12}
        >
          <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        <View style={styles.headerTitle}>
          <Text style={styles.headerLabel}>WORLD CUP 2026</Text>
          <Text style={styles.headerSub}>⚽ Penalty Challenge</Text>
        </View>
        {/* spacer to centre title */}
        <View style={styles.headerSpacer} />
      </View>

      {/* Game */}
      <View style={[styles.gameContainer, { paddingBottom: insets.bottom + 16 }]}>
        <PenaltyShootoutGame />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#052e16",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(74,222,128,0.12)",
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    minWidth: 60,
  },
  backText: {
    color: "#FFFFFF",
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 15,
  },
  headerTitle: {
    flex: 1,
    alignItems: "center",
  },
  headerLabel: {
    color: "#4ade80",
    fontFamily: "Montserrat_700Bold",
    fontSize: 10,
    letterSpacing: 1.5,
  },
  headerSub: {
    color: "#FFFFFF",
    fontFamily: "Montserrat_700Bold",
    fontSize: 16,
    letterSpacing: 0.5,
    marginTop: 1,
  },
  headerSpacer: {
    minWidth: 60,
  },
  gameContainer: {
    flex: 1,
    justifyContent: "center",
  },
});
