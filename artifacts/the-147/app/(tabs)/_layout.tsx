import { Tabs, useRouter, usePathname } from "expo-router";
import { BlurView } from "expo-blur";
import { Platform, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect } from "react";
import { useColors } from "@/hooks/useColors";
import { useTabBar } from "@/contexts/TabBarContext";
import { useKiosk } from "@/contexts/KioskContext";

export default function TabLayout() {
  const isWeb = Platform.OS === "web";
  const isIOS = Platform.OS === "ios";
  const { tabBarVisible } = useTabBar();
  const { isKioskMode, resetIdle } = useKiosk();
  const router = useRouter();
  const pathname = usePathname();
  const colors = useColors();

  // In kiosk mode, force the user onto the order tab — block navigation to
  // any other tab via redirect. The tab bar itself is hidden below.
  useEffect(() => {
    if (!isKioskMode) return;
    if (pathname && !pathname.endsWith("/order") && !pathname.endsWith("/(tabs)")) {
      router.replace("/(tabs)/order");
    }
  }, [isKioskMode, pathname, router]);

  const showBar = tabBarVisible && !isKioskMode;

  return (
    <View
      style={{ flex: 1 }}
      onTouchStart={isKioskMode ? () => resetIdle() : undefined}
    >
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.tabIconSelected,
          tabBarInactiveTintColor: colors.tabIconDefault,
          tabBarStyle: {
            position: "absolute" as const,
            backgroundColor: "transparent",
            borderTopWidth: isWeb ? 1 : 0,
            borderTopColor: colors.border,
            elevation: 0,
              zIndex: 10,
            ...(isWeb ? { height: 84 } : {}),
            display: showBar ? "flex" : "none",
          },
          tabBarBackground: () =>
            isIOS ? (
              <BlurView
                intensity={80}
                tint={colors.scheme}
                style={[StyleSheet.absoluteFill, { backgroundColor: colors.glass.card }]}
                pointerEvents="none"
              />
            ) : isWeb ? (
              <View
                style={[
                  StyleSheet.absoluteFill,
                  {
                    backgroundColor: colors.surface,
                    borderTopWidth: 1,
                    borderTopColor: colors.border,
                  },
                ]}
                pointerEvents="none"
              />
            ) : (
              <View
                style={[
                  StyleSheet.absoluteFill,
                  {
                    backgroundColor: colors.surface,
                    borderTopWidth: StyleSheet.hairlineWidth,
                    borderTopColor: colors.border,
                  },
                ]}
                pointerEvents="none"
              />
            ),
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Home",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="home" size={size} color={color} />
            ),
            href: isKioskMode ? null : undefined,
          }}
        />
        <Tabs.Screen
          name="book"
          options={{ href: null }}
        />
        <Tabs.Screen
          name="rewards"
          options={{
            title: "Rewards",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="gift" size={size} color={color} />
            ),
            href: isKioskMode ? null : undefined,
          }}
        />
        <Tabs.Screen
          name="order"
          options={{
            title: "Order",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="restaurant" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="loyalty"
          options={{
            title: "Membership",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="diamond" size={size} color={color} />
            ),
            href: isKioskMode ? null : undefined,
          }}
        />
        <Tabs.Screen
          name="events"
          options={{
            title: "Events",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="ticket" size={size} color={color} />
            ),
            href: isKioskMode ? null : undefined,
          }}
        />
        <Tabs.Screen
          name="about"
          options={{
            title: "About",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="information-circle" size={size} color={color} />
            ),
            href: isKioskMode ? null : undefined,
          }}
        />
      </Tabs>
    </View>
  );
}
