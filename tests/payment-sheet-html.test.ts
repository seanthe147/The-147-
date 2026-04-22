// Guards against the "spinner forever" class of regressions in the in-app
// payment sheet.
//
// The original bug: a regex literal inside the inline <script> in
// buildPaymentSheetHtml lived inside a JS template literal, so an author
// wrote `\s` where they needed `\\s`. The backslash collapsed at template
// expansion time, the script SyntaxError'd at parse time in the WebView,
// and no error/timeout handler ever ran — the user just saw a spinner.
//
// This test:
//   1. Builds the payment-sheet HTML for both CHARGE and STORE intents
//      (covering the recurring-billing branch where the bug originally lived).
//   2. Extracts the inline <script>…</script> body from the HTML.
//   3. Writes it to a temp file and runs `node --check` on it. `node --check`
//      parses the file as a script and exits non-zero on any SyntaxError —
//      including the silent template-literal escape mistake above.
//
// Run with:
//   npx tsx tests/payment-sheet-html.test.ts

import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildPaymentSheetHtml } from "../components/squarePaymentSheetHtml";

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

function extractInlineScript(html: string): string {
  // Match the LAST <script>…</script> in the document — buildPaymentSheetHtml
  // emits exactly one inline script block, but using a non-greedy capture
  // keeps this resilient if a future edit adds more <script> tags above it
  // (e.g. for analytics).
  const matches = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  if (matches.length === 0) {
    throw new Error("No <script>…</script> block found in payment-sheet HTML");
  }
  // Use the last block, which is the one that actually drives the sheet.
  return matches[matches.length - 1][1];
}

function checkInlineScriptParses(label: string, html: string) {
  const script = extractInlineScript(html);

  // Sanity check: the script should be substantive. A near-empty script
  // would mean the extraction grabbed the wrong block or the builder
  // regressed to outputting nothing.
  assert(
    script.length > 500,
    `[${label}] inline script is non-trivial (got ${script.length} chars)`,
  );

  const dir = mkdtempSync(join(tmpdir(), "payment-sheet-script-"));
  const file = join(dir, "inline.js");
  try {
    writeFileSync(file, script, "utf8");
    const result = spawnSync(process.execPath, ["--check", file], {
      encoding: "utf8",
    });
    if (result.status !== 0) {
      console.log(`    --- node --check stderr ---`);
      console.log(result.stderr.trim());
      console.log(`    ---`);
    }
    assert(
      result.status === 0,
      `[${label}] inline script parses without SyntaxError (node --check)`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function run() {
  console.log("Payment sheet HTML — inline script syntax check");
  console.log("================================================\n");

  // Intent: CHARGE (one-off purchase, the order/checkout flow). Does NOT
  // exercise the recurring-billing branch, but still parses the same
  // surrounding script.
  const chargeHtml = buildPaymentSheetHtml({
    applicationId: "sandbox-sq0idb-fakeAppId",
    locationId: "FAKELOCATION",
    environment: "sandbox",
    amountPence: 1234,
    currency: "GBP",
    intent: "CHARGE",
    buyerEmail: "buyer@example.com",
    recurringDescription: null,
  });
  checkInlineScriptParses("CHARGE / one-off", chargeHtml);

  // Intent: STORE (save card on file for a subscription). Exercises the
  // IS_SUBSCRIPTION branch where the recurring-notice regex lives — the
  // exact code path of the original "spinner forever" bug.
  const storeMonthlyHtml = buildPaymentSheetHtml({
    applicationId: "sandbox-sq0idb-fakeAppId",
    locationId: "FAKELOCATION",
    environment: "sandbox",
    amountPence: 999,
    currency: "GBP",
    intent: "STORE",
    buyerEmail: "buyer@example.com",
    recurringDescription: "/ month — £9.99 per month",
  });
  checkInlineScriptParses("STORE / monthly subscription", storeMonthlyHtml);

  // STORE with an annual description — also takes the recurring branch and
  // goes through the same regex/replace chain with different input.
  const storeAnnualHtml = buildPaymentSheetHtml({
    applicationId: "sandbox-sq0idb-fakeAppId",
    locationId: "FAKELOCATION",
    environment: "production",
    amountPence: 9900,
    currency: "GBP",
    intent: "STORE",
    buyerEmail: null,
    recurringDescription: "/ year — £99 per year",
  });
  checkInlineScriptParses("STORE / annual subscription", storeAnnualHtml);

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

run();
