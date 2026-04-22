// End-to-end-ish test for the "Confirm payments with Face ID" toggle.
//
// We can't easily mount the full RN component tree in Node, so instead we:
//   1. Stub `expo-secure-store`, `expo-local-authentication`, and
//      `react-native` (via a Node module-resolution hook registered below).
//   2. Drive the toggle through the same `setPaymentBiometricEnabled` call
//      that `app/account.tsx` invokes when the user flips the switch.
//   3. Run the same gate that `app/(tabs)/order.tsx#handleTokenized` uses
//      before charging (`shouldPromptForPaymentBiometric` →
//      `LocalAuthentication.authenticateAsync`) and assert whether the
//      biometric prompt was shown.
//
// Run with:
//   TSX_TSCONFIG_PATH=tsconfig.test.json npx tsx tests/payment-biometric.test.ts
//
// `tsconfig.test.json` adds path overrides that point `react-native`,
// `expo-secure-store`, and `expo-local-authentication` at the in-memory
// stubs in `tests/biometric-stubs/`. The `register()` call below also
// installs an ESM resolve hook for the same modules as a belt-and-braces
// safety net for any imports that bypass tsconfig path mapping.

import { register } from "node:module";
import { pathToFileURL } from "node:url";
import { resolve as pathResolve } from "node:path";

// Register the resolve hook BEFORE any dynamic imports below so that
// `react-native`, `expo-secure-store`, and `expo-local-authentication`
// resolve to in-memory stubs rather than the real Expo/RN packages
// (which can't run inside plain Node).
register(
  pathToFileURL(pathResolve(process.cwd(), "tests", "biometric-stubs", "resolve.mjs")).href,
  pathToFileURL(pathResolve(process.cwd(), "./")).href,
);

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.log(`  ✗ ${message}`);
    failed++;
  }
}

async function run() {
  // Dynamic imports so the resolve hook above is in effect when these
  // modules (and their transitive `react-native` / `expo-secure-store`
  // / `expo-local-authentication` imports) get resolved.
  const biometric = await import("../lib/biometric");
  const LocalAuthentication: any = await import("expo-local-authentication");
  const SecureStore: any = await import("expo-secure-store");

  const {
    isPaymentBiometricEnabled,
    setPaymentBiometricEnabled,
    shouldPromptForPaymentBiometric,
  } = biometric;

  const authSpy = LocalAuthentication.__spy;

  // Mirror of the gate used inside handleTokenized in app/(tabs)/order.tsx.
  // Returns true if the biometric prompt was actually shown.
  async function placeOrderAndMaybePrompt(): Promise<boolean> {
    if (await shouldPromptForPaymentBiometric()) {
      await LocalAuthentication.authenticateAsync({
        promptMessage: "Confirm payment of £10.00 with Face ID",
        fallbackLabel: "Use passcode",
        cancelLabel: "Cancel",
        disableDeviceFallback: false,
      });
      return true;
    }
    return false;
  }

  function resetAll() {
    SecureStore.__reset();
    LocalAuthentication.__reset();
  }

  console.log("Payment biometric toggle test");
  console.log("=============================\n");

  // ---------------------------------------------------------------------
  console.log("default (toggle untouched):");
  {
    resetAll();
    const enabled = await isPaymentBiometricEnabled();
    assert(enabled === true, "isPaymentBiometricEnabled() defaults to true");

    const promptShown = await placeOrderAndMaybePrompt();
    assert(promptShown === true, "Placing an order shows the biometric prompt");
    assert(
      authSpy.authenticateCalls === 1,
      `LocalAuthentication.authenticateAsync was called exactly once (got ${authSpy.authenticateCalls})`,
    );
    assert(
      typeof authSpy.lastPromptMessage === "string" &&
        authSpy.lastPromptMessage.includes("Face ID"),
      "Prompt message references the configured biometric kind",
    );
  }

  // ---------------------------------------------------------------------
  console.log("\ntoggle switched OFF in account screen:");
  {
    resetAll();
    // Same call the account screen makes when the user flips the switch.
    await setPaymentBiometricEnabled(false);

    const enabled = await isPaymentBiometricEnabled();
    assert(enabled === false, "isPaymentBiometricEnabled() reflects the OFF toggle");

    const gate = await shouldPromptForPaymentBiometric();
    assert(gate === false, "shouldPromptForPaymentBiometric() returns false when toggle is OFF");

    const promptShown = await placeOrderAndMaybePrompt();
    assert(promptShown === false, "Placing an order does NOT show the biometric prompt");
    assert(
      authSpy.authenticateCalls === 0,
      `LocalAuthentication.authenticateAsync was never called (got ${authSpy.authenticateCalls})`,
    );
  }

  // ---------------------------------------------------------------------
  console.log("\ntoggled OFF then back ON:");
  {
    resetAll();
    await setPaymentBiometricEnabled(false);
    await setPaymentBiometricEnabled(true);

    const enabled = await isPaymentBiometricEnabled();
    assert(enabled === true, "Toggling back on re-enables payment biometric");

    const promptShown = await placeOrderAndMaybePrompt();
    assert(promptShown === true, "Prompt is shown again after re-enabling");
    assert(
      authSpy.authenticateCalls === 1,
      "authenticateAsync is invoked exactly once after re-enabling",
    );
  }

  // ---------------------------------------------------------------------
  // Sanity: even with the toggle on, an unsupported device must not prompt.
  console.log("\ntoggle ON but device has no biometric hardware:");
  {
    resetAll();
    LocalAuthentication.__setHasHardware(false);

    const promptShown = await placeOrderAndMaybePrompt();
    assert(promptShown === false, "No prompt when device lacks biometric hardware");
    assert(
      authSpy.authenticateCalls === 0,
      "authenticateAsync not called when hardware is absent",
    );
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error("Test suite error:", err);
  process.exit(1);
});
