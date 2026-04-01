import React, { useContext, useState, useRef, useCallback, useEffect } from "react";
import {
  StyleSheet,
  View,
  Text,
  Platform,
  Pressable,
  Animated,
  Linking,
} from "react-native";
import { WebView } from "react-native-webview";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BottomTabBarHeightContext } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

const MENU_URL =
  "https://www.the147order.co.uk/?location=11f07c84b040cae5b0923cecef6dbaf0&seat_select=true";

const CATEGORIES = [
  { icon: "beer-outline" as const, label: "Drinks" },
  { icon: "pizza-outline" as const, label: "Food" },
  { icon: "cafe-outline" as const, label: "Hot Drinks" },
  { icon: "ice-cream-outline" as const, label: "Snacks" },
];

export default function OrderScreen() {
  const insets = useSafeAreaInsets();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0;
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const webviewRef = useRef<WebView>(null);

  const animateProgress = useCallback(
    (toValue: number) => {
      Animated.timing(progressAnim, {
        toValue,
        duration: 300,
        useNativeDriver: false,
      }).start();
    },
    [progressAnim]
  );

  const handleLoadEnd = useCallback(() => {
    animateProgress(1);
    setLoadProgress(1);
    setTimeout(() => {
      setLoading(false);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 350,
        useNativeDriver: true,
      }).start();
    }, 200);
  }, [fadeAnim, animateProgress]);

  const handleLoadProgress = useCallback(
    ({ nativeEvent }: { nativeEvent: { progress: number } }) => {
      animateProgress(nativeEvent.progress);
      setLoadProgress(nativeEvent.progress);
    },
    [animateProgress]
  );

  const handleError = useCallback(
    ({ nativeEvent }: { nativeEvent: { url?: string; code?: number } }) => {
      // Only show our error screen for network-level failures on the initial URL.
      // HTTP errors (404, 500) from within the ordering site are handled by the
      // site itself — triggering our screen for every sub-page error is wrong.
      const url = nativeEvent?.url ?? "";
      const isMainUrl = url === "" || url.startsWith("https://www.the147order.co.uk");
      if (isMainUrl) {
        setHasError(true);
        setLoading(false);
      }
    },
    []
  );

  const handleRetry = useCallback(() => {
    setHasError(false);
    setLoading(true);
    fadeAnim.setValue(0);
    progressAnim.setValue(0);
    webviewRef.current?.reload();
  }, [fadeAnim, progressAnim]);

  const handleReload = useCallback(() => {
    setLoading(true);
    fadeAnim.setValue(0);
    progressAnim.setValue(0);
    webviewRef.current?.reload();
  }, [fadeAnim, progressAnim]);

  if (Platform.OS === "web") {
    return (
      <View style={styles.container}>
        <View style={{ height: webTopInset }} />
        <View style={styles.webHeader}>
          <View>
            <Text style={styles.headerTitle}>Order</Text>
            <Text style={styles.headerSubtitle}>Food & Drink</Text>
          </View>
        </View>
        <View style={{ flex: 1, paddingBottom: tabBarHeight }}>
          <iframe
            src={MENU_URL}
            style={{
              flex: 1,
              border: "none",
              width: "100%",
              height: "100%",
            } as React.CSSProperties}
            title="The 147 Order"
            loading="eager"
          />
        </View>
      </View>
    );
  }

  const headerHeight = insets.top + 56;

  return (
    <View style={styles.container}>
      <View style={[styles.nativeHeader, { paddingTop: insets.top }]}>
        <View style={styles.headerContent}>
          <View>
            <Text style={styles.headerTitle}>Order</Text>
            <Text style={styles.headerSubtitle}>Food & Drink</Text>
          </View>
          {!loading && !hasError && (
            <Pressable
              onPress={handleReload}
              hitSlop={12}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            >
              <Ionicons name="refresh" size={22} color="rgba(255,255,255,0.8)" />
            </Pressable>
          )}
        </View>

        {loading && !hasError && (
          <Animated.View
            style={[
              styles.progressBar,
              {
                width: progressAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: ["0%", "100%"],
                }),
              },
            ]}
          />
        )}
      </View>

      {loading && !hasError && (
        <View style={[styles.loadingPlaceholder, { paddingBottom: tabBarHeight }]}>
          <View style={styles.placeholderHero}>
            <View style={styles.placeholderIconRing}>
              <Ionicons name="restaurant" size={32} color={Colors.brand.blue} />
            </View>
            <Text style={styles.placeholderTitle}>Loading Menu</Text>
            <Text style={styles.placeholderSubtitle}>
              Your table ordering system is getting ready
            </Text>
          </View>

          <View style={styles.categoryRow}>
            {CATEGORIES.map((cat) => (
              <View key={cat.label} style={styles.categoryCard}>
                <View style={styles.categoryIconBox}>
                  <Ionicons name={cat.icon} size={24} color={Colors.brand.blue} />
                </View>
                <Text style={styles.categoryLabel}>{cat.label}</Text>
              </View>
            ))}
          </View>

          <View style={styles.infoRow}>
            <Ionicons name="qr-code-outline" size={16} color={Colors.light.textSecondary} />
            <Text style={styles.infoText}>Scan QR at your table or order directly here</Text>
          </View>
        </View>
      )}

      {hasError && (
        <View style={[styles.errorOverlay, { paddingBottom: tabBarHeight }]}>
          <View style={styles.errorIconRing}>
            <Ionicons name="cloud-offline-outline" size={32} color={Colors.light.textSecondary} />
          </View>
          <Text style={styles.errorTitle}>Unable to Load Menu</Text>
          <Text style={styles.errorText}>
            Please check your internet connection and try again.
          </Text>
          <View style={styles.errorActions}>
            <Pressable
              onPress={handleRetry}
              style={({ pressed }) => [styles.retryButton, { opacity: pressed ? 0.8 : 1 }]}
            >
              <Ionicons name="refresh" size={16} color="#FFFFFF" />
              <Text style={styles.retryButtonText}>Try Again</Text>
            </Pressable>
            <Pressable
              onPress={() => Linking.openURL(MENU_URL)}
              style={({ pressed }) => [styles.openButton, { opacity: pressed ? 0.8 : 1 }]}
            >
              <Ionicons name="open-outline" size={16} color={Colors.brand.blue} />
              <Text style={styles.openButtonText}>Open in Browser</Text>
            </Pressable>
          </View>
        </View>
      )}

      <Animated.View
        style={[
          styles.webviewWrapper,
          {
            marginTop: headerHeight,
            marginBottom: tabBarHeight,
            opacity: fadeAnim,
            pointerEvents: loading ? "none" : "auto",
          },
        ]}
      >
        <WebView
          ref={webviewRef}
          source={{ uri: MENU_URL }}
          style={styles.webview}
          onLoadEnd={handleLoadEnd}
          onLoadProgress={handleLoadProgress}
          onError={handleError}
          startInLoadingState={false}
          javaScriptEnabled
          domStorageEnabled
          cacheEnabled
          cacheMode="LOAD_DEFAULT"
          sharedCookiesEnabled
          allowsLinkPreview
          allowsBackForwardNavigationGestures
          renderToHardwareTextureAndroid
          setSupportMultipleWindows={false}
          mediaPlaybackRequiresUserAction={false}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  nativeHeader: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    backgroundColor: Colors.brand.navy,
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  headerContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 46,
  },
  webHeader: {
    backgroundColor: Colors.brand.navy,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  headerTitle: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 20,
    color: "#FFFFFF",
    lineHeight: 24,
  },
  headerSubtitle: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 12,
    color: "rgba(255,255,255,0.6)",
    marginTop: 1,
  },
  progressBar: {
    height: 3,
    backgroundColor: Colors.brand.blue,
    borderRadius: 2,
    marginBottom: 2,
    alignSelf: "flex-start",
  },
  webviewWrapper: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  webview: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  loadingPlaceholder: {
    flex: 1,
    paddingTop: 24,
    paddingHorizontal: 20,
  },
  placeholderHero: {
    alignItems: "center",
    paddingVertical: 32,
  },
  placeholderIconRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(59,130,246,0.1)",
    borderWidth: 1.5,
    borderColor: "rgba(59,130,246,0.25)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  placeholderTitle: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 20,
    color: Colors.light.text,
    marginBottom: 6,
  },
  placeholderSubtitle: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 13,
    color: Colors.light.textSecondary,
    textAlign: "center",
    lineHeight: 18,
    maxWidth: 240,
  },
  categoryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 8,
  },
  categoryCard: {
    flex: 1,
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    gap: 8,
  },
  categoryIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(59,130,246,0.08)",
    justifyContent: "center",
    alignItems: "center",
  },
  categoryLabel: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 11,
    color: Colors.light.text,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 24,
    justifyContent: "center",
  },
  infoText: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 12,
    color: Colors.light.textSecondary,
    textAlign: "center",
  },
  errorOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
    gap: 12,
  },
  errorIconRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 4,
  },
  errorTitle: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 18,
    color: Colors.light.text,
  },
  errorText: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 14,
    color: Colors.light.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  errorActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.brand.blue,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 12,
  },
  retryButtonText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 14,
    color: "#FFFFFF",
  },
  openButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1.5,
    borderColor: Colors.brand.blue,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 12,
  },
  openButtonText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 14,
    color: Colors.brand.blue,
  },
});
