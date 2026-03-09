import React, { useContext, useState, useRef, useCallback } from "react";
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
import { BottomTabBarHeightContext } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

const MENU_URL = "https://www.the147order.co.uk/?location=11f07c84b040cae5b0923cecef6dbaf0&seat_select=true";

export default function OrderScreen() {
  const insets = useSafeAreaInsets();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0;
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const webviewRef = useRef<WebView>(null);

  const handleRetry = useCallback(() => {
    setHasError(false);
    setLoading(true);
    webviewRef.current?.reload();
  }, []);

  if (Platform.OS === "web") {
    return (
      <View style={styles.container}>
        <View style={{ height: webTopInset }} />
        <View style={styles.webHeader}>
          <Text style={styles.headerTitle}>Order</Text>
        </View>
        <View style={{ flex: 1, paddingBottom: tabBarHeight }}>
          <iframe
            src={MENU_URL}
            style={{
              flex: 1,
              border: "none",
              width: "100%",
              height: "100%",
            } as any}
            title="The 147 Order"
            loading="eager"
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.nativeHeader, { paddingTop: insets.top }]}>
        <Text style={styles.headerTitle}>Order</Text>
      </View>
      {loading && !hasError && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={Colors.brand.blue} />
          <Text style={styles.loadingText}>Loading menu...</Text>
        </View>
      )}
      {hasError && (
        <View style={styles.errorOverlay}>
          <Ionicons name="cloud-offline-outline" size={48} color={Colors.light.textSecondary} />
          <Text style={styles.errorTitle}>Unable to Load</Text>
          <Text style={styles.errorText}>
            Please check your internet connection and try again.
          </Text>
          <Pressable
            onPress={handleRetry}
            style={({ pressed }) => [styles.retryButton, { opacity: pressed ? 0.8 : 1 }]}
          >
            <Ionicons name="refresh" size={18} color="#FFFFFF" />
            <Text style={styles.retryButtonText}>Try Again</Text>
          </Pressable>
        </View>
      )}
      <WebView
        ref={webviewRef}
        source={{ uri: MENU_URL }}
        style={[
          styles.webview,
          { marginBottom: tabBarHeight },
          hasError && styles.hidden,
        ]}
        onLoadEnd={() => setLoading(false)}
        onError={() => { setHasError(true); setLoading(false); }}
        onHttpError={() => { setHasError(true); setLoading(false); }}
        startInLoadingState={false}
        javaScriptEnabled
        domStorageEnabled
        cacheEnabled
        cacheMode="LOAD_CACHE_ELSE_NETWORK"
        sharedCookiesEnabled
      />
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
  hidden: {
    height: 0,
    flex: 0,
    opacity: 0,
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
  errorOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
    gap: 12,
  },
  errorTitle: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 18,
    color: Colors.light.text,
    marginTop: 4,
  },
  errorText: {
    fontFamily: "Montserrat_400Regular",
    fontSize: 14,
    color: Colors.light.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.brand.blue,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 8,
  },
  retryButtonText: {
    fontFamily: "Montserrat_600SemiBold",
    fontSize: 14,
    color: "#FFFFFF",
  },
});
