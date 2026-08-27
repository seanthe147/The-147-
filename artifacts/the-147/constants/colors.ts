const BRAND_BLUE = "#0047AB";
const BRAND_RED = "#DF3131";
const BRAND_DARK = "#0A1628";
const BRAND_NAVY = "#132742";
const BRAND_GOLD = "#D4A843";

export interface AppPalette {
  scheme: "light" | "dark";
  text: string;
  textSecondary: string;
  background: string;
  surface: string;
  surfaceElevated: string;
  tint: string;
  accent: string;
  gold: string;
  tabIconDefault: string;
  tabIconSelected: string;
  border: string;
  cardShadow: string;
  overlay: string;
  input: string;
  glass: {
    card: string;
    cardBorder: string;
    cardBorderTop: string;
    elevated: string;
    elevatedBorder: string;
    shadow: string;
    redPill: string;
    redPillBorder: string;
    goldPill: string;
    goldPillBorder: string;
  };
}

export const darkPalette: AppPalette = {
  scheme: "dark" as const,
  text: "#FFFFFF",
  textSecondary: "rgba(255,255,255,0.62)",
  background: BRAND_DARK,
  surface: "#13233A",
  surfaceElevated: "#1A2E4A",
  tint: BRAND_GOLD,
  accent: BRAND_RED,
  gold: BRAND_GOLD,
  tabIconDefault: "rgba(255,255,255,0.52)",
  tabIconSelected: BRAND_GOLD,
  border: "rgba(255,255,255,0.14)",
  cardShadow: "rgba(0,0,0,0.4)",
  overlay: "rgba(3,10,22,0.82)",
  input: "#13233A",
  glass: {
    card: "rgba(255,255,255,0.06)",
    cardBorder: "rgba(255,255,255,0.1)",
    cardBorderTop: "rgba(255,255,255,0.15)",
    elevated: "rgba(255,255,255,0.1)",
    elevatedBorder: "rgba(255,255,255,0.15)",
    shadow: "rgba(0,0,0,0.4)",
    redPill: "rgba(255,59,48,0.12)",
    redPillBorder: "rgba(255,59,48,0.25)",
    goldPill: "rgba(212,168,67,0.15)",
    goldPillBorder: "rgba(212,168,67,0.3)",
  },
};

export const lightPalette: AppPalette = {
  scheme: "light",
  text: "#102033",
  textSecondary: "#526273",
  background: "#F4F7FB",
  surface: "#FFFFFF",
  surfaceElevated: "#EAF0F7",
  tint: BRAND_BLUE,
  accent: BRAND_RED,
  gold: "#8A681C",
  tabIconDefault: "#65758A",
  tabIconSelected: BRAND_BLUE,
  border: "rgba(16,32,51,0.14)",
  cardShadow: "rgba(15,35,60,0.16)",
  overlay: "rgba(16,32,51,0.48)",
  input: "#FFFFFF",
  glass: {
    card: "rgba(255,255,255,0.88)",
    cardBorder: "rgba(16,32,51,0.12)",
    cardBorderTop: "rgba(255,255,255,0.95)",
    elevated: "rgba(255,255,255,0.96)",
    elevatedBorder: "rgba(16,32,51,0.14)",
    shadow: "rgba(15,35,60,0.16)",
    redPill: "rgba(223,49,49,0.10)",
    redPillBorder: "rgba(223,49,49,0.24)",
    goldPill: "rgba(138,104,28,0.12)",
    goldPillBorder: "rgba(138,104,28,0.28)",
  },
};

export default {
  radius: {
    sm: 6,
    md: 12,
    lg: 16,
    xl: 24,
    full: 9999,
  },
  // Legacy static consumers stay dark until migrated to useColors().
  light: darkPalette,
  dark: darkPalette,
  brand: {
    blue: BRAND_BLUE,
    red: BRAND_RED,
    dark: BRAND_DARK,
    navy: BRAND_NAVY,
    gold: BRAND_GOLD,
    white: "#FFFFFF",
    green: "#1B5E20",
  },
  // Glass surface tokens for Deep Glass cards and panels
  glass: darkPalette.glass,
};
