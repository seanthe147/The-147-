import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  GOOGLE_PAY_BUTTON_CLEAR_SPACE,
  GOOGLE_PAY_NATIVE_BUTTON_HEIGHT,
  getGooglePayNativeButtonColors,
} from "./google-pay-branding.ts";

const nativePaymentSheetSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../components/SquarePaymentSheet.tsx"),
  "utf8",
);

test("uses Google's light native button on the dark payment sheet", () => {
  const colors = getGooglePayNativeButtonColors("dark");

  assert.equal(GOOGLE_PAY_BUTTON_CLEAR_SPACE, 8);
  assert.equal(GOOGLE_PAY_NATIVE_BUTTON_HEIGHT, 52);
  assert.equal(colors.backgroundColor, "#FFFFFF");
  assert.equal(colors.foregroundColor, "#000000");
  assert.equal(nativePaymentSheetSource.includes("getGooglePayNativeButtonColors"), true);
  assert.equal(nativePaymentSheetSource.includes('testID="google-pay-button"'), true);
  assert.equal(nativePaymentSheetSource.includes("pay-button-white-pill-shape.png"), true);
  assert.equal(nativePaymentSheetSource.includes("pay-button-dark-pill-shape.png"), true);
  assert.equal(nativePaymentSheetSource.includes("GooglePayMark"), false);
  assert.equal(nativePaymentSheetSource.includes("<Svg"), false);
  assert.equal(nativePaymentSheetSource.includes("<Text style={styles.googlePayText}"), false);
});

test("keeps the native button treatment contrasting in light appearance", () => {
  const colors = getGooglePayNativeButtonColors("light");

  assert.equal(colors.backgroundColor, "#000000");
  assert.equal(colors.foregroundColor, "#FFFFFF");
});