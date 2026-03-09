import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ConsentBanner } from "@/components/ConsentBanner";
import { TabBarProvider } from "@/contexts/TabBarContext";
import { ConsentProvider } from "@/contexts/ConsentContext";
import { NotificationProvider } from "@/contexts/NotificationContext";
import { StaffAuthProvider } from "@/contexts/StaffAuthContext";
import { CustomerAuthProvider } from "@/contexts/CustomerAuthContext";
import { queryClient } from "@/lib/query-client";
import {
  useFonts,
  Montserrat_400Regular,
  Montserrat_500Medium,
  Montserrat_600SemiBold,
  Montserrat_700Bold,
} from "@expo-google-fonts/montserrat";
import { Ionicons } from "@expo/vector-icons";

SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  return (
    <>
      <Stack screenOptions={{ headerBackTitle: "Back" }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="staff-portal" options={{ headerShown: false, presentation: "modal" }} />
        <Stack.Screen name="admin-bookings" options={{ headerShown: false, presentation: "modal" }} />
        <Stack.Screen name="admin-offers" options={{ headerShown: false, presentation: "modal" }} />
        <Stack.Screen name="privacy-policy" options={{ headerShown: false, presentation: "modal" }} />
        <Stack.Screen name="admin-notifications" options={{ headerShown: false, presentation: "modal" }} />
        <Stack.Screen name="contact" options={{ headerShown: false, presentation: "modal" }} />
        <Stack.Screen name="admin-banner" options={{ headerShown: false, presentation: "modal" }} />
        <Stack.Screen name="admin-events" options={{ headerShown: false, presentation: "modal" }} />
        <Stack.Screen name="admin-staff" options={{ headerShown: false, presentation: "modal" }} />
        <Stack.Screen name="account" options={{ headerShown: false, presentation: "modal" }} />
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
    ...Ionicons.font,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
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
                  <GestureHandlerRootView>
                    <KeyboardProvider>
                      <RootLayoutNav />
                    </KeyboardProvider>
                  </GestureHandlerRootView>
                </TabBarProvider>
              </NotificationProvider>
            </StaffAuthProvider>
          </CustomerAuthProvider>
        </ConsentProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
