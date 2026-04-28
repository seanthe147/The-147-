import React, { useEffect, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  TextInput,
  Switch,
  Platform,
  Alert,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/query-client";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import Colors from "@/constants/colors";

interface LoyaltyConfig {
  visitPoints: number;
  birthdayBonus: number;
  doublePointsToday: boolean;
}

export default function AdminLoyaltyScreen() {
  const insets = useSafeAreaInsets();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const { isAuthenticated, isManager, isLoading: authLoading } = useStaffAuth();

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || !isManager)) {
      router.replace("/staff-portal");
    }
  }, [authLoading, isAuthenticated, isManager]);

  const settingsQuery = useQuery<LoyaltyConfig>({
    queryKey: ["/api/staff/loyalty/settings"],
    refetchOnMount: "always",
  });

  // Local edit state. Mirrors the server values, but lets the user edit
  // numbers without immediately firing a request on every keystroke.
  const [visitPoints, setVisitPoints] = useState("");
  const [birthdayBonus, setBirthdayBonus] = useState("");
  const [doublePoints, setDoublePoints] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (settingsQuery.data && !hydrated) {
      setVisitPoints(String(settingsQuery.data.visitPoints));
      setBirthdayBonus(String(settingsQuery.data.birthdayBonus));
      setDoublePoints(settingsQuery.data.doublePointsToday);
      setHydrated(true);
    }
  }, [settingsQuery.data, hydrated]);

  const saveMutation = useMutation({
    mutationFn: async (payload: Partial<LoyaltyConfig>) => {
      const res = await apiRequest("PATCH", "/api/staff/loyalty/settings", payload);
      return res.json() as Promise<LoyaltyConfig>;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/staff/loyalty/settings"], data);
      setVisitPoints(String(data.visitPoints));
      setBirthdayBonus(String(data.birthdayBonus));
      setDoublePoints(data.doublePointsToday);
    },
    onError: (err: Error) => {
      const msg = err.message || "Failed to save settings";
      if (Platform.OS === "web") window.alert(msg);
      else Alert.alert("Error", msg);
    },
  });

  const handleSave = () => {
    const vp = Number(visitPoints);
    const bb = Number(birthdayBonus);
    if (!Number.isInteger(vp) || vp < 0 || vp > 1000) {
      const msg = "Visit points must be a whole number between 0 and 1000.";
      if (Platform.OS === "web") window.alert(msg);
      else Alert.alert("Invalid value", msg);
      return;
    }
    if (!Number.isInteger(bb) || bb < 0 || bb > 10000) {
      const msg = "Birthday bonus must be a whole number between 0 and 10000.";
      if (Platform.OS === "web") window.alert(msg);
      else Alert.alert("Invalid value", msg);
      return;
    }
    saveMutation.mutate({ visitPoints: vp, birthdayBonus: bb, doublePointsToday: doublePoints });
  };

  const toggleDoublePoints = (next: boolean) => {
    // Toggling double points should take effect immediately so staff can
    // flip it on/off during a busy shift without an extra Save tap.
    setDoublePoints(next);
    saveMutation.mutate({ doublePointsToday: next });
  };

  if (authLoading || !isAuthenticated || !isManager) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color={Colors.brand.gold} />
      </View>
    );
  }

  const isDirty =
    settingsQuery.data &&
    (Number(visitPoints) !== settingsQuery.data.visitPoints ||
      Number(birthdayBonus) !== settingsQuery.data.birthdayBonus);

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton} testID="back-button">
          <Ionicons name="chevron-back" size={24} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Loyalty Settings</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
      >
        {settingsQuery.isLoading ? (
          <ActivityIndicator color={Colors.brand.gold} style={{ marginTop: 40 }} />
        ) : settingsQuery.error ? (
          <View style={styles.card}>
            <Text style={styles.errorText}>Failed to load settings.</Text>
          </View>
        ) : (
          <>
            <View style={styles.card}>
              <View style={styles.fieldHeader}>
                <Ionicons name="trophy" size={18} color={Colors.brand.gold} />
                <Text style={styles.fieldTitle}>Visit Points</Text>
              </View>
              <Text style={styles.fieldDescription}>
                Points awarded when a booking is marked complete. Doubled when "Double Points Today" is on.
              </Text>
              <TextInput
                style={styles.input}
                value={visitPoints}
                onChangeText={setVisitPoints}
                placeholder="5"
                placeholderTextColor="#9CA3AF"
                keyboardType="number-pad"
                testID="input-visit-points"
              />
            </View>

            <View style={styles.card}>
              <View style={styles.fieldHeader}>
                <Ionicons name="gift" size={18} color="#EC4899" />
                <Text style={styles.fieldTitle}>Birthday Bonus</Text>
              </View>
              <Text style={styles.fieldDescription}>
                Bonus points credited automatically during a customer's birthday week (3 days before to 3 days after). Awarded once per year.
              </Text>
              <TextInput
                style={styles.input}
                value={birthdayBonus}
                onChangeText={setBirthdayBonus}
                placeholder="50"
                placeholderTextColor="#9CA3AF"
                keyboardType="number-pad"
                testID="input-birthday-bonus"
              />
            </View>

            <View style={styles.card}>
              <View style={styles.fieldHeader}>
                <Ionicons name="flash" size={18} color="#F59E0B" />
                <Text style={styles.fieldTitle}>Double Points Today</Text>
              </View>
              <Text style={styles.fieldDescription}>
                Temporarily double the visit points awarded for completed bookings. Remember to turn this off at the end of the day.
              </Text>
              <View style={styles.toggleRow}>
                <Text style={styles.toggleLabel}>{doublePoints ? "On" : "Off"}</Text>
                <Switch
                  value={doublePoints}
                  onValueChange={toggleDoublePoints}
                  disabled={saveMutation.isPending}
                  trackColor={{ false: "#D1D5DB", true: Colors.brand.gold }}
                  thumbColor={Platform.OS === "android" ? (doublePoints ? "#fff" : "#f4f3f4") : undefined}
                  testID="toggle-double-points"
                />
              </View>
            </View>

            <Pressable
              onPress={handleSave}
              disabled={!isDirty || saveMutation.isPending}
              style={({ pressed }) => [
                styles.saveButton,
                {
                  opacity: !isDirty || saveMutation.isPending ? 0.5 : pressed ? 0.85 : 1,
                },
              ]}
              testID="save-loyalty-settings"
            >
              <Text style={styles.saveButtonText}>
                {saveMutation.isPending ? "Saving..." : "Save Changes"}
              </Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  center: { alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  backButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: {
    flex: 1,
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 18,
    color: Colors.light.text,
    textAlign: "center",
  },
  scroll: { flex: 1 },
  content: { padding: 16, gap: 14 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    gap: 8,
  },
  fieldHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  fieldTitle: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 15,
    color: Colors.light.text,
  },
  fieldDescription: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 12,
    color: Colors.light.textSecondary,
    lineHeight: 17,
  },
  input: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: "Montserrat_500Medium",
    fontSize: 16,
    color: Colors.light.text,
    backgroundColor: "#F9FAFB",
    marginTop: 4,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  toggleLabel: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 14,
    color: Colors.light.text,
  },
  saveButton: {
    backgroundColor: Colors.brand.gold,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
  },
  saveButtonText: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 15,
    color: "#fff",
  },
  errorText: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 13,
    color: "#B91C1C",
  },
});
