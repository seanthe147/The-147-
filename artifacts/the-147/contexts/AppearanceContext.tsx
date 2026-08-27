import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Appearance, Platform, useColorScheme } from "react-native";

import { darkPalette, lightPalette, type AppPalette } from "@/constants/colors";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import {
  isAppearancePreference,
  resolveAppearance,
  type AppearancePreference,
  type ResolvedAppearance,
} from "@/lib/appearance";

export type { AppearancePreference, ResolvedAppearance } from "@/lib/appearance";

const APPEARANCE_KEY = "@the147_appearance";

interface AppearanceContextValue {
  preference: AppearancePreference;
  resolvedAppearance: ResolvedAppearance;
  colors: AppPalette;
  themesEnabled: boolean;
  isLoading: boolean;
  setPreference: (preference: AppearancePreference) => Promise<void>;
}

const defaultValue: AppearanceContextValue = {
  preference: "system",
  resolvedAppearance: "dark",
  colors: darkPalette,
  themesEnabled: false,
  isLoading: true,
  setPreference: async () => {},
};

const AppearanceContext = createContext<AppearanceContextValue>(defaultValue);

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const { flags, isReady } = useFeatureFlags();
  const [preference, setPreferenceState] = useState<AppearancePreference>("system");
  const [isLoading, setIsLoading] = useState(true);
  const themesEnabled = isReady && flags.appearanceThemes;

  useEffect(() => {
    AsyncStorage.getItem(APPEARANCE_KEY)
      .then((stored) => {
        if (isAppearancePreference(stored)) {
          setPreferenceState(stored);
        }
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  const setPreference = useCallback(async (next: AppearancePreference) => {
    setPreferenceState(next);
    try {
      await AsyncStorage.setItem(APPEARANCE_KEY, next);
    } catch {}
  }, []);

  const resolvedAppearance = resolveAppearance(
    preference,
    systemScheme,
    themesEnabled,
  );

  useEffect(() => {
    if (Platform.OS === "web" || typeof Appearance.setColorScheme !== "function") {
      return;
    }
    Appearance.setColorScheme(themesEnabled && preference === "system" ? null : resolvedAppearance);
  }, [themesEnabled, preference, resolvedAppearance]);

  const value = useMemo<AppearanceContextValue>(() => ({
    preference,
    resolvedAppearance,
    colors: resolvedAppearance === "light" ? lightPalette : darkPalette,
    themesEnabled,
    isLoading,
    setPreference,
  }), [preference, resolvedAppearance, themesEnabled, isLoading, setPreference]);

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

export function useAppearance() {
  return useContext(AppearanceContext);
}