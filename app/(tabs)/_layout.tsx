import { Tabs } from "expo-router";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { isLiquidGlassAvailable } from "expo-glass-effect";
import { BlurView } from "expo-blur";
import { Platform, StyleSheet, useColorScheme, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import Colors from "@/constants/colors";
import { useTabBar } from "@/contexts/TabBarContext";

function LiquidGlassTabLayout() {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index" icon={{ sfSymbol: "house.fill" }} title="Home" />
      <NativeTabs.Trigger name="book" icon={{ sfSymbol: "calendar" }} title="Book" />
      <NativeTabs.Trigger name="order" icon={{ sfSymbol: "fork.knife" }} title="Order" />
      <NativeTabs.Trigger name="loyalty" icon={{ sfSymbol: "star.fill" }} title="Loyalty" />
      <NativeTabs.Trigger name="events" icon={{ sfSymbol: "ticket.fill" }} title="Events" />
      <NativeTabs.Trigger name="about" icon={{ sfSymbol: "info.circle.fill" }} title="About" />
    </NativeTabs>
  );
}

function ClassicTabLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const isWeb = Platform.OS === "web";
  const isIOS = Platform.OS === "ios";
  const { tabBarVisible } = useTabBar();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.brand.blue,
        tabBarInactiveTintColor: isDark ? "#888" : "#9CA3AF",
        tabBarStyle: {
          position: "absolute" as const,
          backgroundColor: isIOS ? "transparent" : isDark ? "#0A1628" : "#FFFFFF",
          borderTopWidth: isWeb ? 1 : 0,
          borderTopColor: isDark ? "#1F2937" : "#E5E7EB",
          elevation: 0,
          ...(isWeb ? { height: 84 } : {}),
          display: tabBarVisible ? "flex" : "none",
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView
              intensity={100}
              tint={isDark ? "dark" : "light"}
              style={StyleSheet.absoluteFill}
            />
          ) : isWeb ? (
            <View
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: isDark ? "#0A1628" : "#FFFFFF" },
              ]}
            />
          ) : null,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="book"
        options={{
          title: "Book",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar" size={size} color={color} />
          ),
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
          title: "Loyalty",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="diamond" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="events"
        options={{
          title: "Events",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="ticket" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="about"
        options={{
          title: "About",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="information-circle" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

export default function TabLayout() {
  if (Platform.OS === "ios" && isLiquidGlassAvailable()) {
    return <LiquidGlassTabLayout />;
  }
  return <ClassicTabLayout />;
}
