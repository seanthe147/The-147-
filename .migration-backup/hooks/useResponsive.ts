import { useWindowDimensions } from "react-native";

/**
 * Single source of truth for responsive layout decisions.
 *
 * `isTablet` uses the same 700pt smallest-dimension threshold the
 * kiosk components already adopted — captures every real iPad in
 * either orientation while keeping every iPhone in the phone bucket.
 *
 * `tabletPad` is extra horizontal padding to add to a top-level
 * scroll container so its content is constrained to roughly
 * `maxContentWidth` and stays centred on the screen. On phones it
 * returns 0 so the existing layout is unchanged.
 */
export function useResponsive(maxContentWidth: number = 720) {
  const { width, height } = useWindowDimensions();
  const isTablet = Math.min(width, height) >= 700;
  const isLandscape = width > height;
  const tabletPad = isTablet ? Math.max(0, (width - maxContentWidth) / 2) : 0;
  return { isTablet, isLandscape, width, height, tabletPad };
}
