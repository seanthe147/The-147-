/**
 * Apple Pay button values shared by the two Square WebView payment flows.
 *
 * The artwork and localized label are rendered by Apple's official
 * `apple-pay-button` web component. These values only select the approved
 * Apple-rendered treatment; no Apple Pay logo or label is composed by us.
 *
 * Apple references:
 * https://developer.apple.com/documentation/applepayontheweb/displaying-apple-pay-buttons-using-css
 * https://developer.apple.com/documentation/applepayontheweb/styling-the-apple-pay-button-using-css
 */

export const APPLE_PAY_BUTTON_CLEAR_SPACE = 8;
export const APPLE_PAY_BUTTON_HEIGHT = 50;
export const APPLE_PAY_BUTTON_MIN_WIDTH = 140;

export type ApplePayAppearance = "light" | "dark";
export type ApplePayIntent = "CHARGE" | "STORE" | "CHARGE_AND_STORE";

export function getApplePayButtonOptions(
  appearance: ApplePayAppearance,
  intent: ApplePayIntent,
) {
  return {
    // Apple provides a white button for dark/colourful surfaces and a black
    // button for light surfaces. The component supplies the approved logo.
    buttonStyle: appearance === "dark" ? "white" : "black",
    // Match the action to the checkout flow. Apple provides these localized
    // labels and artwork in the official component.
    type: intent === "STORE" ? "subscribe" : "buy",
    locale: "en-GB",
  } as const;
}