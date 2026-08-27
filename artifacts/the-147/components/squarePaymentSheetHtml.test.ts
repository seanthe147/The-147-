import assert from "node:assert/strict";
import test from "node:test";

import { buildPaymentSheetHtml } from "./squarePaymentSheetHtml.ts";

const baseOptions = {
  applicationId: "test-application",
  locationId: "test-location",
  environment: "sandbox" as const,
  amountPence: 1250,
  currency: "GBP",
};

test("renders the payment form with light appearance tokens", () => {
  const html = buildPaymentSheetHtml({ ...baseOptions, appearance: "light" });

  assert.match(html, /--background: #F4F7FB/);
  assert.match(html, /--surface: #FFFFFF/);
  assert.match(html, /--text: #102033/);
  assert.match(html, /background: var\(--background\)/);
});

test("renders dark tokens by default and when explicitly selected", () => {
  const defaultHtml = buildPaymentSheetHtml(baseOptions);
  const darkHtml = buildPaymentSheetHtml({ ...baseOptions, appearance: "dark" });

  for (const html of [defaultHtml, darkHtml]) {
    assert.match(html, /--background: #0A1628/);
    assert.match(html, /--surface: #13233A/);
    assert.match(html, /--text: #FFFFFF/);
  }
});