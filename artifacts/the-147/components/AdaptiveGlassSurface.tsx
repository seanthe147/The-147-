import React, { useEffect, useState } from "react";
import {
  AccessibilityInfo,
  Platform,
  View,
  type ColorValue,
  type StyleProp,
  type ViewProps,
  type ViewStyle,
} from "react-native";
import { BlurView } from "expo-blur";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { useColors } from "@/hooks/useColors";

interface AdaptiveGlassSurfaceProps {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  fallbackStyle?: StyleProp<ViewStyle>;
  intensity?: number;
  fallbackColor?: ColorValue;
  pointerEvents?: ViewProps["pointerEvents"];
}

/**
 * Uses Apple's Liquid Glass where available, with the existing blur treatment
 * on older iOS releases and a solid surface when Reduce Transparency is on.
 */
export function AdaptiveGlassSurface({
  children,
  style,
  fallbackStyle,
  intensity = 55,
  fallbackColor,
  pointerEvents = "box-none",
}: AdaptiveGlassSurfaceProps) {
  const colors = useColors();
  const isIOS = Platform.OS === "ios";
  const liquidGlassAvailable = isIOS && isLiquidGlassAvailable();
  const [reduceTransparency, setReduceTransparency] = useState<boolean | null>(
    isIOS ? null : false,
  );

  useEffect(() => {
    if (!isIOS) return;

    let isMounted = true;
    let receivedSystemUpdate = false;
    const subscription = AccessibilityInfo.addEventListener(
      "reduceTransparencyChanged",
      (enabled) => {
        receivedSystemUpdate = true;
        setReduceTransparency(enabled);
      },
    );

    AccessibilityInfo.isReduceTransparencyEnabled()
      .then((enabled) => {
        if (isMounted && !receivedSystemUpdate) setReduceTransparency(enabled);
      })
      .catch(() => {
        // A solid surface is the accessible choice when the setting is unknown.
        if (isMounted && !receivedSystemUpdate) setReduceTransparency(true);
      });

    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, [isIOS]);

  const solidSurface = (
    <View
      style={[
        style,
        fallbackStyle,
        {
          backgroundColor: fallbackColor ?? colors.surface,
          pointerEvents,
        },
      ]}
    >
      {children}
    </View>
  );

  if (isIOS && reduceTransparency !== false) {
    return solidSurface;
  }

  if (liquidGlassAvailable && reduceTransparency === false) {
    return (
      <GlassView
        glassEffectStyle="regular"
        colorScheme={colors.scheme}
        isInteractive={false}
        style={[style, { pointerEvents }]}
      >
        {children}
      </GlassView>
    );
  }

  return (
    <BlurView
      intensity={intensity}
      tint={colors.scheme}
      style={[style, fallbackStyle, { pointerEvents }]}
    >
      {children}
    </BlurView>
  );
}
