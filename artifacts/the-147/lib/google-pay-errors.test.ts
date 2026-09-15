import test from "node:test";
import assert from "node:assert/strict";
import {
  googlePayCustomerMessage,
  googlePayDiagnosticCode,
  isGooglePayMerchantConfigurationError,
  normalizeGooglePayError,
} from "./google-pay-errors.ts";

test("preserves Square native error fields when the callback is an object", () => {
  const error = normalizeGooglePayError({
    message: "Failed to launch google pay",
    code: "USAGE_ERROR",
    debugCode: "OR_BIBED_11",
    debugMessage: "Merchant configuration rejected",
  });

  assert.equal(error.code, "USAGE_ERROR");
  assert.equal(error.debugCode, "OR_BIBED_11");
  assert.equal(googlePayDiagnosticCode(error), "OR_BIBED_11");
  assert.match(googlePayCustomerMessage(error), /No charge was made/);
  assert.match(googlePayCustomerMessage(error), /venue needs to complete Google Pay production registration/);
  assert.equal(isGooglePayMerchantConfigurationError(error), true);
});

test("unwraps JSON encoded native exceptions", () => {
  const error = normalizeGooglePayError(
    new Error(
      JSON.stringify({
        message: "Google Pay request failed",
        code: "USAGE_ERROR",
        debugCode: "OR_BIBED_11",
        debugMessage: "Request rejected",
      }),
    ),
  );

  assert.equal(error.debugCode, "OR_BIBED_11");
  assert.match(googlePayCustomerMessage(error), /OR_BIBED_11/);
});

test("replaces the Square bridge numeric Android resource message", () => {
  const error = normalizeGooglePayError({
    code: "USAGE_ERROR",
    message: "2131886391",
    debugCode: "rn_google_pay_result_error",
    debugMessage: "Failed to launch google pay",
  });

  assert.equal(error.message, "Failed to launch google pay");
  assert.match(googlePayCustomerMessage(error), /No charge was made/);
  assert.doesNotMatch(googlePayCustomerMessage(error), /2131886391/);
});

test("does not classify ordinary wallet errors as merchant registration failures", () => {
  const error = normalizeGooglePayError({
    code: "USAGE_ERROR",
    debugCode: "rn_google_pay_result_error",
    debugMessage: "Failed to launch google pay",
  });

  assert.equal(isGooglePayMerchantConfigurationError(error), false);
});

test("gives unavailable Google Pay a fallback message", () => {
  const error = normalizeGooglePayError("Google Pay was not initialized");
  assert.match(googlePayCustomerMessage(error), /not available/);
});