import { useWindowDimensions } from "react-native";

export function useResponsive(maxContentWidth: number = 720) {
  const { width, height } = useWindowDimensions();
  const isTablet = Math.min(width, height) >= 700;
  const isLandscape = width > height;
  const tabletPad = isTablet ? Math.max(0, (width - maxContentWidth) / 2) : 0;
  return { isTablet, isLandscape, width, height, tabletPad };
}
