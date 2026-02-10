import React, { useState, useEffect, useCallback } from "react";
import {
  StyleSheet,
  View,
  Text,
  Platform,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { WebView } from "react-native-webview";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useIsFocused } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import Animated, { useAnimatedStyle, withTiming, withDelay } from "react-native-reanimated";
import Colors from "@/constants/colors";
import { useTabBar } from "@/contexts/TabBarContext";

const MENU_URL = "https://ordertab.menu/the147";
const AUTO_HIDE_DELAY = 1500;

export default function OrderScreen() {
  const insets = useSafeAreaInsets();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const [loading, setLoading] = useState(true);
  const { tabBarVisible, setTabBarVisible } = useTabBar();
  const isFocused = useIsFocused();

  useEffect(() => {
    if (isFocused) {
      const timer = setTimeout(() => {
        setTabBarVisible(false);
      }, AUTO_HIDE_DELAY);
      return () => clearTimeout(timer);
    } else {
      setTabBarVisible(true);
    }
  }, [isFocused, setTabBarVisible]);

  useEffect(() => {
    return () => {
      setTabBarVisible(true);
    };
  }, [setTabBarVisible]);

  const toggleTabBar = useCallback(() => {
    setTabBarVisible(!tabBarVisible);
  }, [tabBarVisible, setTabBarVisible]);

  const fabStyle = useAnimatedStyle(() => ({
    opacity: withDelay(
      tabBarVisible ? 0 : 300,
      withTiming(tabBarVisible ? 0 : 1, { duration: 200 })
    ),
    transform: [
      {
        scale: withDelay(
          tabBarVisible ? 0 : 300,
          withTiming(tabBarVisible ? 0.5 : 1, { duration: 200 })
        ),
      },
    ],
  }));

  if (Platform.OS === "web") {
    return (
      <View style={styles.container}>
        <View style={{ height: webTopInset }} />
        <View style={styles.webHeader}>
          <Text style={styles.headerTitle}>Order</Text>
        </View>
        <iframe
          src={MENU_URL}
          style={{
            flex: 1,
            border: "none",
            width: "100%",
            height: "100%",
          } as any}
          title="The 147 Order"
        />
        {!tabBarVisible && (
          <Animated.View
            style={[
              styles.fab,
              { bottom: 20 },
              fabStyle,
            ]}
          >
            <Pressable
              onPress={toggleTabBar}
              style={({ pressed }) => [
                styles.fabButton,
                { opacity: pressed ? 0.8 : 1 },
              ]}
            >
              <Ionicons name="menu" size={22} color="#FFFFFF" />
            </Pressable>
          </Animated.View>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.nativeHeader, { paddingTop: insets.top }]}>
        <Text style={styles.headerTitle}>Order</Text>
      </View>
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={Colors.brand.blue} />
          <Text style={styles.loadingText}>Loading menu...</Text>
        </View>
      )}
      <WebView
        source={{ uri: MENU_URL }}
        style={styles.webview}
        onLoadEnd={() => setLoading(false)}
        startInLoadingState={false}
        javaScriptEnabled
        domStorageEnabled
        scalesPageToFit
      />
      {!tabBarVisible && (
        <Animated.View
          style={[
            styles.fab,
            { bottom: insets.bottom + 16 },
            fabStyle,
          ]}
        >
          <Pressable
            onPress={toggleTabBar}
            style={({ pressed }) => [
              styles.fabButton,
              { opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <Ionicons name="menu" size={22} color="#FFFFFF" />
          </Pressable>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  nativeHeader: {
    backgroundColor: Colors.brand.navy,
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  webHeader: {
    backgroundColor: Colors.brand.navy,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  headerTitle: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 22,
    color: "#FFFFFF",
  },
  webview: {
    flex: 1,
  },
  loadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.light.background,
  },
  loadingText: {
    fontFamily: "Montserrat_500Medium",
    fontSize: 14,
    color: Colors.light.textSecondary,
    marginTop: 12,
  },
  fab: {
    position: "absolute",
    right: 20,
    zIndex: 100,
  },
  fabButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.brand.navy,
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0px 4px 12px rgba(0,0,0,0.25)",
  },
});
