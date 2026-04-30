import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { InteractionManager } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ConsentBanner } from "@/components/ConsentBanner";
import { TabBarProvider } from "@/contexts/TabBarContext";
import { CartProvider } from "@/contexts/CartContext";
import { ConsentProvider } from "@/contexts/ConsentContext";
import { NotificationProvider } from "@/contexts/NotificationContext";
import { StaffAuthProvider } from "@/contexts/StaffAuthContext";
import { CustomerAuthProvider } from "@/contexts/CustomerAuthContext";
import { queryClient, prefetchAppData } from "@/lib/query-client";
import { isStaffVariant, showCustomerRoutes, showStaffRoutes } from "@/lib/app-variant";
import {
  useFonts,
  Montserrat_400Regular,
  Montserrat_500Medium,
  Montserrat_600SemiBold,
  Montserrat_700Bold,
} from "@expo-google-fonts/montserrat";

SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  return (
    <>
      <Stack
        screenOptions={{ headerBackTitle: "Back" }}
        initialRouteName={isStaffVariant ? "staff-hr" : "(tabs)"}
      >
        {showCustomerRoutes && (
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        )}
        {showStaffRoutes && (
          <Stack.Screen
            name="staff-portal"
            options={{
              headerShown: false,
              presentation: isStaffVariant ? "card" : "modal",
            }}
          />
        )}
        {showStaffRoutes && (
          <>
            <Stack.Screen
              name="staff-hr"
              options={{
                headerShown: false,
                presentation: isStaffVariant ? "card" : "modal",
              }}
            />
            <Stack.Screen name="admin-bookings" options={{ headerShown: false, presentation: "modal" }} />
            <Stack.Screen name="admin-offers" options={{ headerShown: false, presentation: "modal" }} />
            <Stack.Screen name="admin-notifications" options={{ headerShown: false, presentation: "modal" }} />
            <Stack.Screen name="admin-banner" options={{ headerShown: false, presentation: "modal" }} />
            <Stack.Screen name="admin-events" options={{ headerShown: false, presentation: "modal" }} />
            <Stack.Screen name="admin-staff" options={{ headerShown: false, presentation: "modal" }} />
            <Stack.Screen name="admin-customers" options={{ headerShown: false, presentation: "modal" }} />
          </>
        )}
        <Stack.Screen name="privacy-policy" options={{ headerShown: false, presentation: "modal" }} />
        <Stack.Screen name="contact" options={{ headerShown: false, presentation: "modal" }} />
        {showCustomerRoutes && (
          <>
            <Stack.Screen name="account" options={{ headerShown: false, presentation: "modal" }} />
            <Stack.Screen name="membership" options={{ headerShown: false, presentation: "modal" }} />
            <Stack.Screen name="order-confirmation" options={{ headerShown: false, presentation: "modal", gestureEnabled: false }} />
          </>
        )}
      </Stack>
      <ConsentBanner />
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Montserrat_400Regular,
    Montserrat_500Medium,
    Montserrat_600SemiBold,
    Montserrat_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
      InteractionManager.runAfterInteractions(() => {
        prefetchAppData();
      });
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ConsentProvider>
          <CustomerAuthProvider>
            <StaffAuthProvider>
              <NotificationProvider>
                <TabBarProvider>
                  <CartProvider>
                    <GestureHandlerRootView>
                      <KeyboardProvider>
                        <RootLayoutNav />
                      </KeyboardProvider>
                    </GestureHandlerRootView>
                  </CartProvider>
                </TabBarProvider>
              </NotificationProvider>
            </StaffAuthProvider>
          </CustomerAuthProvider>
        </ConsentProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
