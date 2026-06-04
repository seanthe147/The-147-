import { Stack } from "expo-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import { queryClient } from "@/lib/query-client";
import { CartProvider } from "@/contexts/CartContext";
import { KioskProvider } from "@/contexts/KioskContext";

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <KioskProvider>
            <CartProvider>
              <StatusBar style="light" hidden />
              <Stack screenOptions={{ headerShown: false, animation: "none" }} />
            </CartProvider>
          </KioskProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
