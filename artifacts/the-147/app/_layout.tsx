import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { InteractionManager, LogBox } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ConsentBanner } from "@/components/ConsentBanner";
import { TabBarProvider } from "@/contexts/TabBarContext";
import { CartProvider } from "@/contexts/CartContext";
import { KioskProvider } from "@/contexts/KioskContext";
import { KioskAttractOverlay } from "@/components/KioskAttractOverlay";
import { ConsentProvider } from "@/contexts/ConsentContext";
import { NotificationProvider } from "@/contexts/NotificationContext";
import { StaffAuthProvider } from "@/contexts/StaffAuthContext";
import { CustomerAuthProvider } from "@/contexts/CustomerAuthContext";
import { AppearanceProvider, useAppearance } from "@/contexts/AppearanceContext";
import { queryClient, prefetchAppData } from "@/lib/query-client";
import { isStaffVariant, showCustomerRoutes, showStaffRoutes } from "@/lib/app-variant";
import {
  useFonts,
  Montserrat_400Regular,
  Montserrat_500Medium,
  Montserrat_600SemiBold,
  Montserrat_700Bold,
} from "@expo-google-fonts/montserrat";
import { Ionicons } from "@expo/vector-icons";

LogBox.ignoreLogs([
  '"shadow*" style props are deprecated',
  '"textShadow*" style props are deprecated',
  'props.pointerEvents is deprecated',
  'useNativeDriver',
  'Font registration was unsuccessful',
  "Registering 'ionicons' font failed",
  'Image: style.resizeMode is deprecated',
  'Layout children must be of type Screen',
]);

SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  const { colors, resolvedAppearance } = useAppearance();

  return (
    <>
      <StatusBar style={resolvedAppearance === "dark" ? "light" : "dark"} backgroundColor={colors.background} />
      <Stack
        screenOptions={{ headerBackTitle: "Back", contentStyle: { backgroundColor: colors.background } }}
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
            <Stack.Screen name="admin-tabs" options={{ headerShown: false, presentation: "modal" }} />
            <Stack.Screen name="admin-tables-live" options={{ headerShown: false, presentation: "modal" }} />
            <Stack.Screen name="admin-game" options={{ headerShown: false, presentation: "modal" }} />
            <Stack.Screen name="admin-stock" options={{ headerShown: false, presentation: "modal" }} />
            <Stack.Screen name="admin-availability" options={{ headerShown: false, presentation: "modal" }} />
            <Stack.Screen name="admin-events-payments" options={{ headerShown: false, presentation: "modal" }} />
            <Stack.Screen name="admin-loyalty" options={{ headerShown: false, presentation: "modal" }} />
            <Stack.Screen name="admin-marketing" options={{ headerShown: false, presentation: "modal" }} />
            <Stack.Screen name="admin-notices" options={{ headerShown: false, presentation: "modal" }} />
            <Stack.Screen name="admin-rota" options={{ headerShown: false, presentation: "modal" }} />
            <Stack.Screen name="admin-pay" options={{ headerShown: false, presentation: "modal" }} />
            <Stack.Screen name="admin-staff-docs" options={{ headerShown: false, presentation: "modal" }} />
            <Stack.Screen name="staff-hr" options={{ headerShown: false, presentation: "modal" }} />
          </>
        )}
        <Stack.Screen name="staff-onboarding" options={{ headerShown: false, presentation: "modal" }} />
        <Stack.Screen name="privacy-policy" options={{ headerShown: false, presentation: "modal" }} />
        <Stack.Screen name="gdpr-rights" options={{ headerShown: false, presentation: "modal" }} />
        <Stack.Screen name="cookie-policy" options={{ headerShown: false, presentation: "modal" }} />
        <Stack.Screen name="cancellation-policy" options={{ headerShown: false, presentation: "modal" }} />
        <Stack.Screen name="contact" options={{ headerShown: false, presentation: "modal" }} />
        {showCustomerRoutes && (
          <>
            <Stack.Screen name="account" options={{ headerShown: false, presentation: "modal" }} />
            <Stack.Screen name="membership" options={{ headerShown: false, presentation: "modal" }} />
            <Stack.Screen name="booking" options={{ headerShown: false, presentation: "modal" }} />
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
    // Pre-register Ionicons here so the font is guaranteed loaded before
    // any icon renders — prevents the CTFontManagerError 104 race condition
    // that shows blank squares on first open in Expo Go.
    ...Ionicons.font,
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
        <AppearanceProvider>
          <ConsentProvider>
            <CustomerAuthProvider>
              <StaffAuthProvider>
                <NotificationProvider>
                  <TabBarProvider>
                    <CartProvider>
                      <KioskProvider>
                        <GestureHandlerRootView style={{ flex: 1 }}>
                          <KeyboardProvider>
                            <RootLayoutNav />
                            <KioskAttractOverlay />
                          </KeyboardProvider>
                        </GestureHandlerRootView>
                      </KioskProvider>
                    </CartProvider>
                  </TabBarProvider>
                </NotificationProvider>
              </StaffAuthProvider>
            </CustomerAuthProvider>
          </ConsentProvider>
        </AppearanceProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
