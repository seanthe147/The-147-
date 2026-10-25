import { useWindowDimensions } from "react-native";

/**
 * Single source of truth for responsive layout decisions.
 *
 * Layout mode follows the current window dimensions rather than the
 * device model. A foldable can therefore move from the compact layout
 * to the expanded layout as its usable display area grows.
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
