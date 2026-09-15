import assert from "node:assert/strict";
import test from "node:test";

import { buildCardFieldHtml } from "./squareCardFieldHtml.ts";
import { GOOGLE_PAY_WEB_BUTTON_HEIGHT } from "../lib/google-pay-branding.ts";
import {
  APPLE_PAY_BUTTON_HEIGHT,
  APPLE_PAY_BUTTON_MIN_WIDTH,
} from "../lib/apple-pay-branding.ts";

const baseOptions = {
  applicationId: "test-application",
  locationId: "test-location",
  environment: "sandbox" as const,
  amountPence: 1250,
  currency: "GBP",
};

test("uses the official light Google Pay button in the dark card field", () => {
  const html = buildCardFieldHtml(baseOptions);

  assert.match(html, /gp\.attach\("#google-pay-button", \{"buttonColor":"white"/);
  assert.match(html, /padding: 8px 0/);
  assert.match(html, new RegExp(`height: ${GOOGLE_PAY_WEB_BUTTON_HEIGHT}px`));
  assert.doesNotMatch(html, /background:#000/);
  assert.doesNotMatch(html, new RegExp(["Pay", "with", "Google", "Pay"].join("\\s+")));
});

test("uses Apple's official button and switches contrast for the host surface", () => {
  const darkHtml = buildCardFieldHtml(baseOptions);
  const lightHtml = buildCardFieldHtml({ ...baseOptions, appearance: "light", intent: "STORE" });

  assert.match(darkHtml, /setAttribute\("buttonstyle", "white"\)/);
  assert.match(darkHtml, /setAttribute\("type", "buy"\)/);
  assert.match(lightHtml, /setAttribute\("buttonstyle", "black"\)/);
  assert.match(lightHtml, /setAttribute\("type", "subscribe"\)/);
  assert.match(darkHtml, /applepay\.cdn-apple\.com\/jsapi\/v1\.1\.0\/apple-pay-sdk\.js/);
  assert.match(darkHtml, new RegExp(`height: ${APPLE_PAY_BUTTON_HEIGHT}px`));
  assert.match(darkHtml, new RegExp(`min-width: ${APPLE_PAY_BUTTON_MIN_WIDTH}px`));
  assert.match(darkHtml, /padding: 8px 0/);
  assert.doesNotMatch(darkHtml, /innerHTML\s*=\s*['"`].*Apple Pay/);
});