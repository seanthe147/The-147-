/**
 * Google Pay button values shared by the WebView and native payment sheets.
 *
 * These values follow Google's payment-button guidance:
 * https://developers.google.com/pay/api/web/guides/brand-guidelines
 *
 * The Web Payments SDK renders the artwork and localized, approved button
 * caption when it is given these options. The native Square SDK only exposes
 * the wallet trigger, so the native sheet uses the complete, unmodified
 * Google-provided button assets bundled under assets/google-pay.
 */

export const GOOGLE_PAY_BUTTON_CLEAR_SPACE = 8;
export const GOOGLE_PAY_BUTTON_RADIUS = 12;
export const GOOGLE_PAY_NATIVE_BUTTON_HEIGHT = 52;
export const GOOGLE_PAY_WEB_BUTTON_HEIGHT = 50;

export type GooglePayAppearance = "light" | "dark";

export function getGooglePayWebButtonOptions(appearance: GooglePayAppearance) {
  return {
    // Google's light/white button is required on dark or colourful surfaces.
    buttonColor: appearance === "dark" ? "white" : "black",
    buttonSizeMode: "fill",
    // Square's long variant is the SDK-rendered, localized payment caption.
    buttonType: "long",
    buttonRadius: GOOGLE_PAY_BUTTON_RADIUS,
    buttonBorderType: "default_border",
  } as const;
}

export function getGooglePayNativeButtonColors(appearance: GooglePayAppearance) {
  const isDark = appearance === "dark";
  return {
    backgroundColor: isDark ? "#FFFFFF" : "#000000",
    foregroundColor: isDark ? "#000000" : "#FFFFFF",
    borderColor: "rgba(0,0,0,0.18)",
  } as const;
}