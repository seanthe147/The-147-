import { Tabs, useRouter, usePathname } from "expo-router";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect } from "react";
import { useColors } from "@/hooks/useColors";
import { useTabBar } from "@/contexts/TabBarContext";
import { useKiosk } from "@/contexts/KioskContext";
import { AdaptiveGlassSurface } from "@/components/AdaptiveGlassSurface";

export default function TabLayout() {
  const isWeb = Platform.OS === "web";
  const isIOS = Platform.OS === "ios";
  const { tabBarVisible } = useTabBar();
  const { isKioskMode, resetIdle } = useKiosk();
  const router = useRouter();
  const pathname = usePathname();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const barHeight = isWeb ? 84 : 68 + Math.max(insets.bottom, 10);

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
          tabBarLabelStyle: {
            fontSize: 10,
            fontWeight: "700" as const,
            letterSpacing: 0.1,
            marginTop: 2,
          },
          tabBarLabel: ({ children, color }) => (
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
              maxFontSizeMultiplier={1.2}
              style={{ color, fontSize: 10, fontWeight: "700", marginTop: 2 }}
            >
              {children}
            </Text>
          ),
          tabBarItemStyle: { minHeight: 48 },
          tabBarHideOnKeyboard: true,
          tabBarButton: (props) => (
            <Pressable
              testID={props.testID}
              accessible
              accessibilityRole="tab"
              accessibilityLabel={props["aria-label"] ?? props.accessibilityLargeContentTitle}
              accessibilityState={{ selected: props["aria-selected"] === true }}
              onPress={props.onPress}
              onLongPress={props.onLongPress ?? undefined}
              hitSlop={4}
              style={({ pressed }) => [
                props.style,
                { minHeight: 48, opacity: pressed ? 0.6 : 1 },
              ]}
            >
              {props.children}
            </Pressable>
          ),
          tabBarStyle: {
            position: "absolute" as const,
            backgroundColor: "transparent",
            borderTopWidth: 0,
            elevation: 0,
            zIndex: 10,
            height: barHeight,
            paddingTop: 6,
            paddingBottom: isWeb ? 20 : Math.max(insets.bottom, 10) + 2,
            paddingHorizontal: 16,
            display: showBar ? "flex" : "none",
          },
          tabBarBackground: () => (
            <View
              pointerEvents="none"
              style={[StyleSheet.absoluteFill, { paddingHorizontal: 12, paddingTop: 2, paddingBottom: isWeb ? 14 : Math.max(insets.bottom - 4, 8) }]}
            >
              {isIOS ? (
                <AdaptiveGlassSurface
                  intensity={80}
                  fallbackColor={colors.surface}
                  style={styles.pill}
                  fallbackStyle={{ backgroundColor: colors.glass.card }}
                  pointerEvents="none"
                />
              ) : (
                <View style={[styles.pill, { backgroundColor: colors.surface }]} />
              )}
              <View
                pointerEvents="none"
                style={[styles.pill, styles.rim, { borderColor: colors.border, position: "absolute", left: 12, right: 12, top: 2, bottom: isWeb ? 14 : Math.max(insets.bottom - 4, 8) }]}
              />
            </View>
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
            tabBarLabel: "Member",
            tabBarAccessibilityLabel: "Membership",
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

const styles = StyleSheet.create({
  pill: { flex: 1, borderRadius: 32, overflow: "hidden" },
  rim: { borderWidth: StyleSheet.hairlineWidth, backgroundColor: "transparent" },
});
