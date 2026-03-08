import React, { useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { apiRequest, queryClient } from "@/lib/query-client";
import { useStaffAuth } from "@/contexts/StaffAuthContext";

type StaffUser = {
  id: number;
  username: string;
  displayName: string | null;
  role: string;
  active: boolean;
  createdAt: string;
};

const ROLES = [
  { value: "staff", label: "Staff", icon: "shield-checkmark" as const, color: Colors.brand.green },
  { value: "manager", label: "Manager", icon: "shield" as const, color: "#7C3AED" },
  { value: "owner", label: "Owner", icon: "star" as const, color: Colors.brand.gold },
];

export default function AdminStaffScreen() {
  const insets = useSafeAreaInsets();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const { isAuthenticated, isLoading: authLoading, username: currentUsername, isOwner } = useStaffAuth();
  const [updatingUser, setUpdatingUser] = useState<string | null>(null);

  const { data: staffUsers, isLoading } = useQuery<StaffUser[]>({
    queryKey: ["/api/staff/users"],
  });

  if (authLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.brand.blue} />
      </View>
    );
  }

  if (!isAuthenticated || !isOwner) {
    router.replace("/staff-portal");
    return null;
  }

  const handleRoleChange = (user: StaffUser, newRole: string) => {
    if (user.username === currentUsername) {
      const msg = "You cannot change your own role";
      Platform.OS === "web" ? window.alert(msg) : Alert.alert("Error", msg);
      return;
    }

    const doUpdate = async () => {
      setUpdatingUser(user.username);
      try {
        await apiRequest("PATCH", "/api/staff/update-role", {
          username: user.username,
          role: newRole,
        });
        await queryClient.refetchQueries({ queryKey: ["/api/staff/users"] });
        const msg = `${user.displayName || user.username} is now ${newRole}`;
        Platform.OS === "web" ? window.alert(msg) : Alert.alert("Updated", msg);
      } catch (e: any) {
        const msg = e?.message || "Failed to update role";
        Platform.OS === "web" ? window.alert(msg) : Alert.alert("Error", msg);
      } finally {
        setUpdatingUser(null);
      }
    };

    const roleName = ROLES.find(r => r.value === newRole)?.label || newRole;
    if (Platform.OS === "web") {
      if (window.confirm(`Change ${user.displayName || user.username}'s role to ${roleName}?`)) doUpdate();
    } else {
      Alert.alert(
        "Change Role",
        `Change ${user.displayName || user.username}'s role to ${roleName}?`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Confirm", onPress: doUpdate },
        ]
      );
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={28} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Staff Accounts</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.section}>
          <Ionicons name="people" size={32} color="#F59E0B" />
          <Text style={styles.sectionTitle}>Manage Team</Text>
          <Text style={styles.sectionDesc}>
            View staff accounts and manage their permissions. Only owners can change roles.
          </Text>
        </View>

        {isLoading ? (
          <ActivityIndicator size="large" color={Colors.brand.blue} style={{ marginVertical: 40 }} />
        ) : !staffUsers || staffUsers.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="person-outline" size={48} color={Colors.light.border} />
            <Text style={styles.emptyText}>No staff accounts</Text>
          </View>
        ) : (
          staffUsers.map((user) => {
            const roleConfig = ROLES.find(r => r.value === user.role) || ROLES[0];
            const isSelf = user.username === currentUsername;
            const isUpdating = updatingUser === user.username;

            return (
              <View key={user.id} style={[styles.userCard, isSelf && styles.userCardSelf]}>
                <View style={styles.userHeader}>
                  <View style={[styles.userIconWrap, { backgroundColor: roleConfig.color + "15" }]}>
                    <Ionicons name={roleConfig.icon} size={22} color={roleConfig.color} />
                  </View>
                  <View style={styles.userInfo}>
                    <View style={styles.userNameRow}>
                      <Text style={styles.userName}>
                        {user.displayName || user.username}
                      </Text>
                      {isSelf && (
                        <View style={styles.youBadge}>
                          <Text style={styles.youBadgeText}>You</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.userUsername}>@{user.username}</Text>
                    <Text style={styles.userJoined}>
                      Joined {new Date(user.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    </Text>
                  </View>
                </View>

                <View style={styles.roleSection}>
                  <Text style={styles.roleLabel}>ROLE</Text>
                  <View style={styles.roleButtons}>
                    {ROLES.map((r) => {
                      const isActive = user.role === r.value;
                      return (
                        <Pressable
                          key={r.value}
                          onPress={() => !isSelf && !isActive && handleRoleChange(user, r.value)}
                          disabled={isSelf || isActive || isUpdating}
                          style={({ pressed }) => [
                            styles.roleButton,
                            isActive && { backgroundColor: r.color + "15", borderColor: r.color },
                            (isSelf && !isActive) && { opacity: 0.4 },
                            pressed && !isSelf && !isActive ? { opacity: 0.7 } : null,
                          ]}
                        >
                          {isUpdating && !isActive ? (
                            <ActivityIndicator size="small" color={r.color} />
                          ) : (
                            <Ionicons name={r.icon} size={14} color={isActive ? r.color : Colors.light.textSecondary} />
                          )}
                          <Text style={[styles.roleButtonText, isActive && { color: r.color }]}>
                            {r.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              </View>
            );
          })
        )}

        <View style={{ height: Platform.OS === "web" ? 50 : insets.bottom + 20 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.light.background,
  },
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
  },
  headerTitle: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 18,
    color: Colors.light.text,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  section: {
    alignItems: "center",
    marginBottom: 24,
    gap: 8,
  },
  sectionTitle: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 22,
    color: Colors.light.text,
    marginTop: 4,
  },
  sectionDesc: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 14,
    color: Colors.light.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 32,
    gap: 6,
  },
  emptyText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 15,
    color: Colors.light.textSecondary,
  },
  userCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  userCardSelf: {
    borderColor: Colors.brand.gold + "40",
    borderWidth: 2,
  },
  userHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 14,
  },
  userIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  userInfo: {
    flex: 1,
  },
  userNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  userName: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 16,
    color: Colors.light.text,
  },
  youBadge: {
    backgroundColor: Colors.brand.blue + "15",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  youBadgeText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 10,
    color: Colors.brand.blue,
  },
  userUsername: {
    fontFamily: "Montserrat_500Medium",
    fontSize: 13,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  userJoined: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 11,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  roleSection: {
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
    paddingTop: 12,
  },
  roleLabel: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 11,
    color: Colors.light.textSecondary,
    letterSpacing: 1,
    marginBottom: 8,
  },
  roleButtons: {
    flexDirection: "row",
    gap: 8,
  },
  roleButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
  },
  roleButtonText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 12,
    color: Colors.light.textSecondary,
  },
});
