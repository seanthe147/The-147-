import React, { useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  Platform,
  ActivityIndicator,
} from "react-native";
import { WebView } from "react-native-webview";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";

const MENU_URL = "https://ordertab.menu/the147";

export default function MenuScreen() {
  const insets = useSafeAreaInsets();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const [loading, setLoading] = useState(true);

  if (Platform.OS === "web") {
    return (
      <View style={styles.container}>
        <View style={{ height: webTopInset }} />
        <View style={styles.webHeader}>
          <Text style={styles.headerTitle}>Order & Menu</Text>
        </View>
        <iframe
          src={MENU_URL}
          style={{
            flex: 1,
            border: "none",
            width: "100%",
            height: "100%",
          } as any}
          title="The 147 Menu"
        />
        <View style={{ height: 84 }} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.nativeHeader, { paddingTop: insets.top }]}>
        <Text style={styles.headerTitle}>Order & Menu</Text>
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
});
