// Behavioural tests for the payment sheet's SDK-load logic under simulated
// slow networks and CDN failures.
//
// Background (task #78):
//   Task #70 hardened the in-app Square payment sheet against the two
//   dominant production failure modes — stale CDN edge caches and slow
//   mobile signal — by adding a single retry on `<script>.onerror` and
//   bumping the per-phase timeout from 8s to 12s. The companion test,
//   tests/payment-sheet-html.test.ts, proves the inline script *parses*
//   and that the diagnostic phase strings are still present, but it does
//   not actually exercise the retry-or-timeout state machine.
//
//   That existing test does include one race-regression scenario (a stale
//   onerror firing AFTER a successful retry) but it is the only behavioural
//   case there. A regression that, say, accidentally removed the retry
//   branch but left the diag string in place would slip through.
//
// What this file does:
//   The inline <script> from buildPaymentSheetHtml is extracted and run
//   inside a Function with a hand-rolled fake window/document/timers.
//   Every script tag the inline script appends to <head> is captured so
//   we can drive its onload/onerror manually, and every setTimeout is
//   captured so we can flush it on demand. This lets us deterministically
//   simulate:
//     1. CDN responds first try            → success on first attempt
//     2. CDN errors first, retry succeeds  → success on retry
//     3. CDN hangs (timeout), retry succeeds → timeout-then-success
//     4. CDN errors twice                  → fatal fires
//
// Run with:
//   npx tsx tests/payment-sheet-network.test.ts

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
  const matches = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  if (matches.length === 0) {
    throw new Error("No <script>…</script> block found in payment-sheet HTML");
  }
  return matches[matches.length - 1][1];
}

// ── Fake-DOM harness ──────────────────────────────────────────────────────
// Same shape used by the race-regression test in payment-sheet-html.test.ts,
// kept self-contained here so this file can run independently in CI.

type FakeScript = {
  src: string;
  async: boolean;
  onload: (() => void) | null;
  onerror: (() => void) | null;
};
type Timer = {
  fn: () => void;
  delay: number;
  id: number;
  cancelled: boolean;
};

type Harness = {
  scripts: FakeScript[];
  timers: Timer[];
  postMessages: string[];
  fakeWindow: { ReactNativeWebView: { postMessage: (s: string) => void }; addEventListener: () => void; Square: unknown };
  diagPhases: () => string[];
  fatals: () => Array<{ type: string; message?: string }>;
};

function buildHarness(): Harness {
  const scripts: FakeScript[] = [];
  const timers: Timer[] = [];
  const postMessages: string[] = [];
  let nextTimerId = 1;

  const fakeElements = new Map<
    string,
    { textContent: string; style: Record<string, string>; addEventListener: () => void }
  >();
  const makeEl = () => ({
    textContent: "",
    style: {} as Record<string, string>,
    addEventListener: () => {},
  });
  for (const id of [
    "status",
    "loading",
    "amount-label",
    "amount-recurring",
    "recurring-notice",
    "card-container",
    "pay-card-btn",
    "recurring-fineprint",
    "apple-pay-button",
    "google-pay-button",
    "or-divider",
  ]) {
    fakeElements.set(id, makeEl());
  }

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

  const setTimeoutShim = (fn: () => void, delay: number) => {
    const t: Timer = { fn, delay, id: nextTimerId++, cancelled: false };
    timers.push(t);
    return t.id;
  };
  const clearTimeoutShim = (id: number) => {
    const t = timers.find((x) => x.id === id);
    if (t) t.cancelled = true;
  };

  const html = buildPaymentSheetHtml({
    applicationId: "sandbox-sq0idb-fakeAppId",
    locationId: "FAKELOCATION",
    environment: "sandbox",
    amountPence: 1234,
    currency: "GBP",
    intent: "CHARGE",
    buyerEmail: "buyer@example.com",
    recurringDescription: null,
  });
  const script = extractInlineScript(html);

  const runner = new Function(
    "window",
    "document",
    "navigator",
    "setTimeout",
    "clearTimeout",
    "Date",
    script,
  );
  runner(fakeWindow, fakeDocument, fakeNavigator, setTimeoutShim, clearTimeoutShim, Date);

  return {
    scripts,
    timers,
    postMessages,
    fakeWindow,
    diagPhases: () =>
      postMessages
        .map((s) => {
          try {
            return JSON.parse(s);
          } catch {
            return null;
          }
        })
        .filter((m) => m && m.type === "diag")
        .map((m) => m.phase),
    fatals: () =>
      postMessages
        .map((s) => {
          try {
            return JSON.parse(s);
          } catch {
            return null;
          }
        })
        .filter((m) => m && m.type === "fatal"),
  };
}

// Stub `window.Square` so bootSquare() runs to a known marker. We treat
// the marker as "boot was attempted" — i.e. the script took the success
// path out of SDK-load and into bootSquare. The marker error itself
// produces a different, predictable fatal ("Payments are not configured")
// from inside bootSquare's catch block; that fatal is unrelated to the
// SDK-load state machine these tests cover.
function stubSquareForBoot(harness: Harness): { wasCalled: () => boolean } {
  let called = false;
  harness.fakeWindow.Square = {
    payments: () => {
      called = true;
      throw new Error("__test_marker_boot_attempted__");
    },
  };
  return { wasCalled: () => called };
}

function loadFatals(harness: Harness): Array<{ message?: string }> {
  return harness.fatals();
}

// Any fatal whose message indicates the SDK-load phase fataled. The
// message strings here are the literal user-facing strings from
// loadSdkOnce()'s onerror / timeout branches.
function sdkLoadFatals(harness: Harness): Array<{ message?: string }> {
  return loadFatals(harness).filter(
    (f) =>
      typeof f.message === "string" &&
      (f.message.includes("Could not load the secure payment library") ||
        f.message.includes("Could not reach the payment service") ||
        f.message.includes("Could not load the payment library")),
  );
}

// ── Scenarios ─────────────────────────────────────────────────────────────

function scenarioSuccessFirstAttempt() {
  console.log("\n[1] CDN responds on first attempt — success");
  const h = buildHarness();
  assert(h.scripts.length === 1, `one SDK script appended on init (got ${h.scripts.length})`);
  assert(h.timers.length === 1, `one phase-timeout scheduled on init (got ${h.timers.length})`);
  assert(
    !h.scripts[0].src.includes("retry="),
    `first attempt loads the canonical SDK URL with no retry= cache-buster`,
  );

  const boot = stubSquareForBoot(h);
  // Drive the success path: CDN responds.
  if (h.scripts[0].onload) h.scripts[0].onload();

  assert(boot.wasCalled(), `bootSquare runs after first-attempt onload`);
  assert(
    h.scripts.length === 1,
    `no retry script is appended on first-attempt success (got ${h.scripts.length})`,
  );
  assert(
    h.diagPhases().includes("sdk_loaded"),
    `emits sdk_loaded diag on success (got ${JSON.stringify(h.diagPhases())})`,
  );
  assert(
    !h.diagPhases().includes("sdk_load_error_retry") && !h.diagPhases().includes("sdk_load_timeout_retry"),
    `does NOT emit any retry diag on first-attempt success`,
  );
  assert(sdkLoadFatals(h).length === 0, `no SDK-load fatal is emitted on first-attempt success`);

  // The phase-timeout for attempt #1 must have been cleared so it can't
  // fire later and falsely retry / fatal.
  assert(
    h.timers[0].cancelled,
    `the first-attempt phase-timeout is cancelled after onload`,
  );
}

function scenarioSuccessOnRetryAfterError() {
  console.log("\n[2] CDN errors first, retry succeeds — success on retry");
  const h = buildHarness();
  assert(h.scripts.length === 1, `one SDK script appended on init (got ${h.scripts.length})`);

  // Simulate a CDN/network error on attempt #1.
  if (h.scripts[0].onerror) h.scripts[0].onerror();

  assert(
    h.scripts.length === 2,
    `retry script is appended after first-attempt onerror (got ${h.scripts.length})`,
  );
  assert(
    h.scripts[1].src.includes("?retry="),
    `retry script appends a cache-buster query string (got src=${h.scripts[1].src})`,
  );
  assert(
    h.diagPhases().includes("sdk_load_error_retry"),
    `emits sdk_load_error_retry diag (got ${JSON.stringify(h.diagPhases())})`,
  );

  const boot = stubSquareForBoot(h);
  // Retry CDN responds.
  if (h.scripts[1].onload) h.scripts[1].onload();

  assert(boot.wasCalled(), `bootSquare runs after retry onload`);
  assert(
    h.diagPhases().includes("sdk_loaded"),
    `emits sdk_loaded diag after retry success`,
  );
  assert(sdkLoadFatals(h).length === 0, `no SDK-load fatal is emitted when retry succeeds`);
}

function scenarioTimeoutThenSuccess() {
  console.log("\n[3] CDN hangs (phase-timeout), retry succeeds — timeout-then-success");
  const h = buildHarness();
  assert(h.scripts.length === 1, `one SDK script appended on init (got ${h.scripts.length})`);
  assert(h.timers.length === 1, `one phase-timeout scheduled on init (got ${h.timers.length})`);
  assert(
    h.timers[0].delay === 12000,
    `phase-timeout uses the 12s budget set in task #70 (got ${h.timers[0].delay}ms)`,
  );

  // Simulate the CDN hanging: the script tag never fires onload OR
  // onerror, the phase-timeout fires instead.
  h.timers[0].fn();

  assert(
    h.scripts.length === 2,
    `retry script is appended after phase-timeout (got ${h.scripts.length})`,
  );
  assert(
    h.scripts[1].src.includes("?retry="),
    `retry script appends a cache-buster query string after timeout`,
  );
  assert(
    h.diagPhases().includes("sdk_load_timeout_retry"),
    `emits sdk_load_timeout_retry diag (got ${JSON.stringify(h.diagPhases())})`,
  );
  assert(
    sdkLoadFatals(h).length === 0,
    `no fatal is emitted on the first phase-timeout (the retry must run first)`,
  );

  const boot = stubSquareForBoot(h);
  if (h.scripts[1].onload) h.scripts[1].onload();

  assert(boot.wasCalled(), `bootSquare runs after retry onload`);
  assert(
    h.diagPhases().includes("sdk_loaded"),
    `emits sdk_loaded diag after timeout-then-retry success`,
  );
  assert(sdkLoadFatals(h).length === 0, `still no SDK-load fatal after retry succeeds`);
}

function scenarioDoubleFailureFatal() {
  console.log("\n[4] CDN errors twice — fatal fires");
  const h = buildHarness();
  assert(h.scripts.length === 1, `one SDK script appended on init (got ${h.scripts.length})`);

  // Attempt #1: error.
  if (h.scripts[0].onerror) h.scripts[0].onerror();
  assert(h.scripts.length === 2, `retry script appended after first error`);
  assert(sdkLoadFatals(h).length === 0, `no fatal yet after only one failure`);

  // Attempt #2 (the retry): error too.
  if (h.scripts[1].onerror) h.scripts[1].onerror();

  const fatals = sdkLoadFatals(h);
  assert(fatals.length === 1, `exactly one SDK-load fatal after the second error (got ${fatals.length})`);
  assert(
    !!fatals[0].message && fatals[0].message.includes("Could not load the secure payment library"),
    `fatal message identifies the SDK-load failure (got ${JSON.stringify(fatals[0].message)})`,
  );
  assert(
    h.diagPhases().includes("fatal"),
    `emits structured fatal diag alongside the user-facing fatal`,
  );

  // No retry-of-retry: after the second failure we must NOT keep
  // appending more script tags.
  assert(
    h.scripts.length === 2,
    `does NOT append a third script tag (no retry-of-retry; got ${h.scripts.length})`,
  );

  // A late onload from either dead attempt must be a no-op once we've
  // fataled — guards the inverse of the race covered by the existing
  // race-regression test.
  const fatalsBefore = loadFatals(h).length;
  if (h.scripts[0].onload) h.scripts[0].onload();
  if (h.scripts[1].onload) h.scripts[1].onload();
  assert(
    loadFatals(h).length === fatalsBefore,
    `late onload from dead attempts after fatal does not change fatal count`,
  );
}

function scenarioDoubleTimeoutFatal() {
  console.log("\n[5] CDN hangs twice (timeout, retry timeout) — fatal fires");
  const h = buildHarness();

  // Attempt #1 hangs → phase-timeout fires → retry kicks in.
  h.timers[0].fn();
  assert(h.scripts.length === 2, `retry script appended after first phase-timeout`);
  assert(sdkLoadFatals(h).length === 0, `no fatal yet after only one timeout`);

  // The retry attempt should have scheduled its own phase-timeout. Find
  // the first not-yet-cancelled timer (the retry's).
  const retryTimer = h.timers.find((t) => !t.cancelled && t.id !== h.timers[0].id);
  assert(!!retryTimer, `retry attempt schedules its own phase-timeout`);
  if (!retryTimer) return;

  // Attempt #2 hangs too → fatal must fire.
  retryTimer.fn();
  const fatals = sdkLoadFatals(h);
  assert(fatals.length === 1, `exactly one SDK-load fatal after the second timeout (got ${fatals.length})`);
  assert(
    !!fatals[0].message && fatals[0].message.includes("Could not reach the payment service"),
    `fatal message identifies the timeout-flavoured failure (got ${JSON.stringify(fatals[0].message)})`,
  );
}

function run() {
  console.log("Payment sheet — SDK load behaviour under slow networks / CDN failures");
  console.log("=====================================================================");
  scenarioSuccessFirstAttempt();
  scenarioSuccessOnRetryAfterError();
  scenarioTimeoutThenSuccess();
  scenarioDoubleFailureFatal();
  scenarioDoubleTimeoutFatal();
  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run();
