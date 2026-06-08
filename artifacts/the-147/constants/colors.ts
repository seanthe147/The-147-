const BRAND_BLUE = "#0047AB";
const BRAND_RED = "#DF3131";
const BRAND_DARK = "#0A1628";
const BRAND_NAVY = "#132742";
const BRAND_GOLD = "#D4A843";

export default {
  radius: {
    sm: 6,
    md: 12,
    lg: 16,
    xl: 24,
    full: 9999,
  },
  // Deep Glass dark theme — app is permanently locked to dark mode.
  // Every Colors.light.* reference across all screens inherits these values.
  light: {
    text: "#FFFFFF",
    textSecondary: "rgba(255,255,255,0.5)",
    background: BRAND_DARK,
    surface: "rgba(255,255,255,0.07)",
    surfaceElevated: "rgba(255,255,255,0.12)",
    tint: BRAND_GOLD,
    accent: BRAND_RED,
    gold: BRAND_GOLD,
    tabIconDefault: "rgba(255,255,255,0.4)",
    tabIconSelected: BRAND_GOLD,
    border: "rgba(255,255,255,0.1)",
    cardShadow: "rgba(0,0,0,0.4)",
  },
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
