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

  // The diagnostic emitter and SDK retry path are central to investigating
  // real-world payment-sheet failures (task #70). Guard them with cheap
  // string-presence checks so a future refactor that silently drops the
  // diagnostics is caught here rather than in production.
  assert(
    script.includes('"sdk_load_start"') && script.includes('"sdk_loaded"'),
    `[${label}] emits sdk_load_start and sdk_loaded diagnostics`,
  );
  assert(
    script.includes('"sdk_load_error_retry"') && script.includes('"sdk_load_timeout_retry"'),
    `[${label}] retries SDK load once on error/timeout before fataling`,
  );
  assert(
    script.includes('"card_attach_start"') && script.includes('"card_attached"'),
    `[${label}] emits card-attach phase diagnostics`,
  );
  assert(
    script.includes('"apple_pay_unavailable"') && script.includes('"google_pay_unavailable"'),
    `[${label}] reports wallet unavailability for diagnostics`,
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

  // ── SDK retry race regression ────────────────────────────────────────────
  // Reproduces the exact race the code-reviewer flagged on task #70: the
  // first <script> tag's stale onerror could fire AFTER the retry attempt
  // had already started or succeeded, calling fatal() and killing a sheet
  // that was actually working. We extract the inline script and run it
  // inside a fake DOM/window where:
  //   - the FIRST script tag's onerror is fired late (after retry)
  //   - the SECOND script tag's onload fires normally
  // Then we assert that no fatal/postMessage("fatal") was emitted, and that
  // the SDK did boot. (We do NOT exercise the full Square boot path — we
  // stop the script before bootSquare() runs by stubbing window.Square so
  // that payments() throws a known marker, which we treat as "boot was
  // attempted".)
  console.log("\nSDK retry race regression");
  console.log("=========================\n");
  runSdkRetryRaceTest();

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

function runSdkRetryRaceTest() {
  const html = buildPaymentSheetHtml({
    applicationId: "sandbox-sq0idb-fakeAppId",
    locationId: "FAKELOCATION",
    environment: "sandbox",
    amountPence: 999,
    currency: "GBP",
    intent: "STORE",
    buyerEmail: "buyer@example.com",
    recurringDescription: "/ month — £9.99 per month",
  });
  const script = extractInlineScript(html);

  // Build a tiny fake DOM/window. We capture every script tag the inline
  // script appends to head so we can drive their onload/onerror manually.
  // Timers are also captured so we can flush them on demand.
  type FakeScript = {
    src: string;
    async: boolean;
    onload: (() => void) | null;
    onerror: (() => void) | null;
  };
  type Timer = { fn: () => void; delay: number; id: number; cancelled: boolean };

  const scripts: FakeScript[] = [];
  const timers: Timer[] = [];
  let nextTimerId = 1;

  const fakeElements = new Map<string, { textContent: string; style: Record<string, string>; addEventListener: () => void }>();
  function makeEl() {
    return { textContent: "", style: {} as Record<string, string>, addEventListener: () => {} };
  }
  for (const id of ["status", "loading", "amount-label", "amount-recurring", "recurring-notice", "card-container", "pay-card-btn", "recurring-fineprint", "apple-pay-button", "google-pay-button", "or-divider"]) {
    fakeElements.set(id, makeEl());
  }

  const postMessages: string[] = [];

  const fakeWindow = {
    ReactNativeWebView: { postMessage: (s: string) => postMessages.push(s) },
    addEventListener: () => {},
    Square: undefined as unknown,
  };
  const fakeDocument = {
    getElementById: (id: string) => fakeElements.get(id) ?? null,
    createElement: (_tag: string) => {
      const el: FakeScript = { src: "", async: false, onload: null, onerror: null };
      return el;
    },
    head: {
      appendChild: (el: unknown) => {
        scripts.push(el as FakeScript);
      },
    },
  };
  const fakeNavigator = { onLine: true, userAgent: "test-runner" };

  // Fake setTimeout/clearTimeout so we control timing deterministically.
  const setTimeoutShim = (fn: () => void, delay: number) => {
    const t: Timer = { fn, delay, id: nextTimerId++, cancelled: false };
    timers.push(t);
    return t.id;
  };
  const clearTimeoutShim = (id: number) => {
    const t = timers.find((x) => x.id === id);
    if (t) t.cancelled = true;
  };

  // Run the inline script inside a Function so it sees ONLY our fakes.
  // Wrap to pretend window/document/navigator/setTimeout are globals.
  try {
    // The inline script is itself wrapped in an IIFE; we evaluate it as-is.
    const runner = new Function(
      "window", "document", "navigator", "setTimeout", "clearTimeout", "Date",
      // The inline script also references `JSON` etc. — those are real
      // globals on Function's scope chain, so we don't need to inject.
      script,
    );
    // Provide our fakes. We don't catch — a syntax error here is a real
    // regression and the surrounding test already runs node --check.
    runner(fakeWindow, fakeDocument, fakeNavigator, setTimeoutShim, clearTimeoutShim, Date);
  } catch (e) {
    assert(false, `inline script threw at startup: ${(e as Error).message}`);
    return;
  }

  // After init: exactly one script tag (the SDK loader) should have been
  // appended, and one timer scheduled.
  assert(scripts.length === 1, `after init, exactly 1 SDK <script> appended (got ${scripts.length})`);
  assert(timers.length === 1, `after init, exactly 1 timer scheduled (got ${timers.length})`);

  // Simulate: first attempt times out → retry kicks in.
  const firstTimer = timers[0];
  firstTimer.fn();

  assert(scripts.length === 2, `after first-attempt timeout, retry script appended (got ${scripts.length})`);
  assert(scripts[1].src.includes("retry="), `retry script uses cache-buster query string`);

  // Stub Square so bootSquare runs. We make payments() throw a distinctive
  // marker so we can detect that boot was attempted (= the script took the
  // retry-success path, not the fatal path). The marker error WILL produce
  // its own fatal from inside bootSquare's catch block — that's expected
  // and unrelated to the race we're testing. We snapshot the fatal count
  // BEFORE simulating the stale onerror, then assert the stale onerror
  // doesn't ADD a new fatal on top.
  let bootAttempted = false;
  fakeWindow.Square = {
    payments: () => {
      bootAttempted = true;
      throw new Error("__test_marker_boot_attempted__");
    },
  };

  function countFatals(): number {
    return postMessages
      .map((s) => { try { return JSON.parse(s); } catch { return null; } })
      .filter((m) => m && m.type === "fatal").length;
  }

  // Simulate: retry succeeds. This may emit a fatal of its own from the
  // stubbed payments() throw — that's the test stub, not the race.
  const retryScript = scripts[1];
  if (retryScript.onload) retryScript.onload();

  assert(bootAttempted, `bootSquare ran after retry succeeded`);
  const fatalsBeforeStaleError = countFatals();

  // CRITICAL: now simulate the stale first-attempt onerror firing LATE.
  // Before the fix, this added a NEW fatal("Could not load the secure
  // payment library …") because sdkRetryCount === 1 — killing a sheet
  // that had just successfully booted from the retry.
  const firstScript = scripts[0];
  if (firstScript.onerror) firstScript.onerror();

  const fatalsAfterStaleError = countFatals();
  assert(
    fatalsAfterStaleError === fatalsBeforeStaleError,
    `stale first-attempt onerror after retry-success does NOT emit a new fatal (had ${fatalsBeforeStaleError}, now ${fatalsAfterStaleError})`,
  );

  // Belt-and-braces: also verify the diagnostic phase markers we expect to
  // see for this scenario were emitted in order.
  const diagPhases = postMessages
    .map((s) => {
      try { return JSON.parse(s); } catch { return null; }
    })
    .filter((m) => m && m.type === "diag")
    .map((m) => m.phase);
  assert(
    diagPhases.includes("sdk_load_start") && diagPhases.includes("sdk_load_timeout_retry") && diagPhases.includes("sdk_loaded"),
    `diag phases include sdk_load_start, sdk_load_timeout_retry, and sdk_loaded (got ${JSON.stringify(diagPhases)})`,
  );
}

run();
