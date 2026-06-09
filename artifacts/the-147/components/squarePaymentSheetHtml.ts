// Pure HTML builder for the in-app Square payment sheet.
//
// Extracted from components/SquarePaymentSheet.tsx so it has zero React Native
// dependencies and can be unit-tested in plain Node. The companion test
// (tests/payment-sheet-html.test.ts) builds the HTML for both CHARGE and
// STORE intents and runs `node --check` against the extracted inline script
// to catch template-literal escape bugs (e.g. the "spinner forever" regression
// where `\\s` collapsed to `s` and silently broke the entire script).

export function formatPounds(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

export function buildPaymentSheetHtml(opts: {
  applicationId: string;
  locationId: string;
  environment: "production" | "sandbox";
  amountPence: number;
  currency: string;
  /**
   * Square verifyBuyer intent.
   *   "CHARGE"           — one-off payment, no SCA challenge up front.
   *   "STORE"            — tokenize for future use (e.g. memberships).
   *                        SCA performed via verifyBuyer({ intent: "STORE" }).
   *   "CHARGE_AND_STORE" — pay this order AND save the card on file. Used by
   *                        FEATURE_SAVED_CARDS so the customer can opt-in via
   *                        a checkbox during checkout. SCA is performed with
   *                        intent "STORE" so the verification token can be
   *                        forwarded to Square's /v2/cards endpoint.
   */
  intent?: "CHARGE" | "STORE" | "CHARGE_AND_STORE";
  buyerEmail?: string | null;
  recurringDescription?: string | null;
  /**
   * When true (and intent is "CHARGE_AND_STORE"), render an opt-in checkbox
   * below the card form labelled "Save card for one-tap reorder". The
   * checkbox state is forwarded to the host as `saveCard` on the token
   * message. When false the host receives saveCard=false and behaves
   * exactly like a plain CHARGE.
   */
  showSaveCard?: boolean;
  /**
   * "android" suppresses Google Pay initialization — it cannot work inside
   * Android WebView (Payment Request API is unavailable; Square's SDK falls
   * back to intent:// which we block, causing a confusing error). Card
   * payments and Apple Pay (on iOS) are unaffected.
   */
  platform?: string;
}): string {
  const sdkSrc =
    opts.environment === "production"
      ? "https://web.squarecdn.com/v1/square.js"
      : "https://sandbox.web.squarecdn.com/v1/square.js";
  const amountStr = (opts.amountPence / 100).toFixed(2);
  // Per-phase timeout. Production logs from the diagnostic endpoint showed a
  // long tail of customers on slow mobile signal (3G / poor Wi-Fi at the
  // venue) where the original 8s budget tripped before the SDK had finished
  // downloading — pushing them onto the browser-fallback unnecessarily. We
  // still want a hard ceiling so a truly hung WebView doesn't strand the
  // user, but 12s is a much better fit for real-world mobile latencies and
  // the SDK load is now retried once before this timeout actually fatals.
  const PHASE_TIMEOUT_MS = 12000;
  // Bridge: postMessage works for both react-native-webview (window.ReactNativeWebView)
  // and the web fallback (parent window via window.parent.postMessage).
  // Square's tokenization endpoint — different host from the SDK CDN. Adding
  // a preconnect hint here means the TLS handshake to this origin completes
  // in parallel with the SDK download, instead of being a serial cost the
  // first time the customer hits Pay.
  const tokenizationOrigin =
    opts.environment === "production"
      ? "https://pci-connect.squareup.com"
      : "https://pci-connect.squareupsandbox.com";
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <title>Payment</title>
  <!--
    Resource hints — kick off DNS resolution, TLS handshake, and the SDK
    download as early as possible so the card form is interactive sooner.
    The browser cannot start fetching the SDK until our inline <script> at
    the bottom appends the tag, but a <link rel="preload"> here lets it
    speculatively start the network request during HTML parse, typically
    saving 100–300 ms of round-trip time on cold mobile connections.

    These hints are mostly free on warm connections and never harmful — at
    worst the browser ignores an unsupported keyword.
  -->
  <link rel="preconnect" href="${sdkSrc.replace(/\/v1\/square\.js$/, "")}" crossorigin />
  <link rel="preconnect" href="${tokenizationOrigin}" crossorigin />
  <link rel="preconnect" href="https://applepay.cdn-apple.com" crossorigin />
  <link rel="dns-prefetch" href="${sdkSrc.replace(/\/v1\/square\.js$/, "")}" />
  <link rel="dns-prefetch" href="${tokenizationOrigin}" />
  <link rel="preload" as="script" href="${sdkSrc}" crossorigin />
  <!--
    Apple's official Apple Pay button web component. Required by App Store
    Guideline 4.9 — using only the  Pay wordmark on a custom black button
    is grounds for rejection. This script defines the <apple-pay-button>
    custom element that we render below. Loads silently on non-Apple
    devices and does nothing harmful there (Square's applePay() init will
    no-op on unsupported platforms).
  -->
  <script
    crossorigin="anonymous"
    async
    src="https://applepay.cdn-apple.com/jsapi/v1.1.0/apple-pay-sdk.js"
  ></script>
  <style>
    * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    html, body { margin: 0; padding: 0; background: #0A1628; color: #FFFFFF; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; -webkit-font-smoothing: antialiased; }
    body { padding: 18px 16px 28px; min-height: 100vh; }

    .amount-card {
      background: linear-gradient(135deg, #132742 0%, #0047AB 100%);
      color: #fff;
      border-radius: 16px;
      padding: 18px 20px;
      box-shadow: 0 6px 24px rgba(0, 71, 171, 0.35);
      margin-bottom: 18px;
      border: 1px solid rgba(255,255,255,0.1);
    }
    .amount-card .label { font-size: 12px; opacity: 0.75; text-transform: uppercase; letter-spacing: 1.2px; margin-bottom: 4px; font-weight: 600; }
    .amount-card .value { font-size: 30px; font-weight: 800; letter-spacing: -0.5px; line-height: 1.1; }
    .amount-card .recurring { font-size: 13px; opacity: 0.85; margin-top: 4px; font-weight: 500; }

    #recurring-notice {
      display: none;
      background: rgba(180,83,9,0.18);
      border: 1px solid rgba(252,211,77,0.35);
      color: #FCD34D;
      font-size: 12.5px;
      line-height: 1.5;
      border-radius: 10px;
      padding: 11px 13px;
      margin-bottom: 16px;
      font-weight: 500;
    }

    .section-title { font-size: 11px; font-weight: 700; color: rgba(255,255,255,0.45); text-transform: uppercase; letter-spacing: 1.3px; margin-bottom: 10px; }

    .wallets { display: flex; flex-direction: column; gap: 10px; margin-bottom: 6px; }
    #apple-pay-button, #google-pay-button { display: none; height: 50px; border-radius: 12px; overflow: hidden; }

    .or { display: none; text-align: center; color: rgba(255,255,255,0.35); font-size: 11px; letter-spacing: 1.4px; font-weight: 600; margin: 18px 0 14px; position: relative; }
    .or::before, .or::after { content: ""; position: absolute; top: 50%; width: calc(50% - 60px); height: 1px; background: rgba(255,255,255,0.12); }
    .or::before { left: 0; }
    .or::after { right: 0; }

    .card-card {
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 14px;
      padding: 16px;
    }
    .card-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
    .card-header .label { font-size: 13px; font-weight: 700; color: rgba(255,255,255,0.9); }
    .brands { display: flex; gap: 6px; align-items: center; }
    .brand-pill { font-size: 9px; font-weight: 800; padding: 3px 7px; border-radius: 4px; color: #fff; letter-spacing: 0.4px; }
    .b-visa { background: #1A1F71; }
    .b-mc { background: linear-gradient(90deg, #EB001B 0%, #EB001B 50%, #F79E1B 50%, #F79E1B 100%); }
    .b-amex { background: #006FCF; }

    #card-container { min-height: 90px; }

    #pay-card-btn {
      width: 100%; margin-top: 14px; padding: 15px; border: none; border-radius: 12px;
      background: #0047AB; color: white; font-size: 16px; font-weight: 700; cursor: pointer;
      box-shadow: 0 4px 14px rgba(0, 71, 171, 0.45);
      transition: transform 0.1s, box-shadow 0.1s, opacity 0.15s;
    }
    #pay-card-btn:active { transform: translateY(1px); box-shadow: 0 2px 6px rgba(0, 71, 171, 0.3); }
    #pay-card-btn:disabled { opacity: 0.45; cursor: default; box-shadow: none; }

    #recurring-fineprint { display: none; font-size: 11.5px; color: rgba(255,255,255,0.45); line-height: 1.5; margin-top: 10px; text-align: center; }

    /* ── FEATURE_SAVED_CARDS opt-in checkbox ──
       Hidden by default; the inline script un-hides it when SHOW_SAVE_CARD
       is true and the card form has finished initialising. The checkbox
       sits BELOW the pay button so it never visually competes with the
       primary action — opt-in is intentional, not the default.
    */
    #save-card-row {
      display: none; align-items: flex-start; gap: 10px;
      margin-top: 14px; padding: 11px 12px;
      background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px;
      cursor: pointer; user-select: none; -webkit-user-select: none;
    }
    #save-card-row input[type="checkbox"] { width: 18px; height: 18px; margin: 1px 0 0 0; accent-color: #3B82F6; flex-shrink: 0; }
    #save-card-row .save-card-label { font-size: 13px; font-weight: 600; color: #FFFFFF; line-height: 1.35; }
    #save-card-row .save-card-sub { font-size: 11.5px; color: rgba(255,255,255,0.5); font-weight: 500; line-height: 1.4; margin-top: 2px; }

    #status { margin-top: 10px; font-size: 13px; color: #F87171; min-height: 16px; text-align: center; font-weight: 500; }

    #loading { display: flex; align-items: center; justify-content: center; gap: 10px; color: rgba(255,255,255,0.5); font-size: 13px; padding: 24px 0; }
    .spinner { width: 16px; height: 16px; border: 2px solid rgba(255,255,255,0.12); border-top-color: #3B82F6; border-radius: 50%; animation: spin 0.8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    #slow-warning { display: none; margin: 0 0 12px; padding: 12px 14px; background: rgba(180,83,9,0.18); border: 1px solid rgba(252,211,77,0.35); border-radius: 10px; font-size: 13px; color: #FCD34D; text-align: center; }
    #slow-retry-btn { display: inline-block; margin-top: 8px; padding: 7px 18px; background: #0047AB; color: #fff; font-size: 13px; font-weight: 700; border: none; border-radius: 8px; cursor: pointer; }

    .trust-footer {
      display: flex; align-items: center; justify-content: center; gap: 6px;
      margin-top: 18px; padding-top: 16px;
      border-top: 1px solid rgba(255,255,255,0.08);
      font-size: 11px; color: rgba(255,255,255,0.3); font-weight: 500;
    }
    .trust-footer .lock { display: inline-block; width: 10px; height: 10px; border: 1.5px solid rgba(255,255,255,0.3); border-radius: 2px; position: relative; }
    .trust-footer .lock::before { content: ""; position: absolute; top: -4px; left: 1.5px; width: 5px; height: 5px; border: 1.5px solid rgba(255,255,255,0.3); border-bottom: none; border-radius: 4px 4px 0 0; }
  </style>
</head>
<body>
  <div class="amount-card">
    <div class="label" id="amount-label">Total</div>
    <div class="value">£${amountStr}</div>
    <div class="recurring" id="amount-recurring" style="display:none"></div>
  </div>

  <div id="recurring-notice"></div>

  <div id="slow-warning">
    Taking longer than usual — tap below to try again.
    <br/><button id="slow-retry-btn" type="button">Retry</button>
  </div>

  <div id="loading"><div class="spinner"></div> Loading payment options…</div>

  <div class="wallets">
    <div id="apple-pay-button"></div>
    <div id="google-pay-button"></div>
  </div>

  <div class="or" id="or-divider">OR PAY BY CARD</div>

  <div id="card-section">
    <div class="card-card">
      <div class="card-header">
        <div class="label">Card details</div>
        <div class="brands">
          <span class="brand-pill b-visa">VISA</span>
          <span class="brand-pill b-mc">MC</span>
          <span class="brand-pill b-amex">AMEX</span>
        </div>
      </div>
      <div id="card-container"></div>
      <button id="pay-card-btn" type="button">Pay £${amountStr}</button>
      <div id="recurring-fineprint"></div>
      <label id="save-card-row" for="save-card-checkbox">
        <input id="save-card-checkbox" type="checkbox" />
        <div>
          <div class="save-card-label">Save card for one-tap reorder</div>
          <div class="save-card-sub">Stored securely with Square. You can remove it from your account at any time.</div>
        </div>
      </label>
    </div>
  </div>

  <div id="status"></div>

  <div class="trust-footer">
    <span class="lock"></span>
    <span>Secured by Square · 256-bit SSL encryption</span>
  </div>

  <script>
    // NOTE: this inline <script> deliberately runs BEFORE the Square SDK is
    // loaded. The SDK is injected programmatically further down so that:
    //   1. Our error/timeout handlers are registered before any network
    //      request begins (a blocking <script src="..."> tag would have
    //      stalled parsing of this entire block on a slow/blocked CDN, the
    //      exact failure mode that produced the "spinner forever" bug).
    //   2. Script-load failures surface via <script>.onerror, not via the
    //      window 'error' event (which does NOT bubble for resource loads
    //      unless useCapture is true — and even then is unreliable).
    (function () {
      var APPLICATION_ID = ${JSON.stringify(opts.applicationId)};
      var LOCATION_ID = ${JSON.stringify(opts.locationId)};
      var AMOUNT = ${JSON.stringify(amountStr)};
      var CURRENCY = ${JSON.stringify(opts.currency)};
      var INTENT = ${JSON.stringify(opts.intent || "CHARGE")};
      var BUYER_EMAIL = ${JSON.stringify(opts.buyerEmail || "")};
      var RECURRING_DESC = ${JSON.stringify(opts.recurringDescription || "")};
      var SHOW_SAVE_CARD = ${JSON.stringify(!!opts.showSaveCard)};
      var SDK_SRC = ${JSON.stringify(sdkSrc)};
      var PHASE_TIMEOUT_MS = ${PHASE_TIMEOUT_MS};
      var ENVIRONMENT = ${JSON.stringify(opts.environment)};
      // Google Pay cannot work inside Android WebView — the Payment Request
      // API is unavailable, so Square's SDK falls back to an intent:// URL
      // which we block in onShouldStartLoadWithRequest. Skip the init
      // entirely so the button never appears and no confusing error fires.
      var IS_ANDROID = ${JSON.stringify(opts.platform === "android")};
      var SHEET_OPENED_AT = Date.now();
      // Per-open session id so the server can group all diagnostic events
      // from one customer's attempt at the sheet (load → fail → retry).
      var SESSION_ID = (Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
      var IS_SUBSCRIPTION = INTENT === "STORE" && RECURRING_DESC.length > 0;
      var PAY_LABEL = IS_SUBSCRIPTION
        ? "Start Membership · £" + AMOUNT
        : "Pay £" + AMOUNT;

      var fatalSent = false;
      function send(msg) {
        try {
          var s = JSON.stringify(msg);
          if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
            window.ReactNativeWebView.postMessage(s);
          } else if (window.parent && window.parent !== window) {
            // srcDoc iframes have origin "null" so a specific targetOrigin
            // would silently drop the message. The parent listener verifies
            // e.source matches the expected iframe contentWindow, which is
            // the actual trust boundary here.
            window.parent.postMessage(s, "*");
          }
        } catch (e) {}
      }
      function fatal(message) {
        if (fatalSent) return;
        fatalSent = true;
        hideLoading();
        setStatus(message);
        // Always send a structured diag for fatals too — the parent native
        // bridge forwards both "diag" and "fatal" to the server endpoint, but
        // sending an explicit diag here means the phase ("fatal") is uniform
        // with all the other phase markers below in the production logs.
        diag("fatal", { reason: message });
        send({ type: "fatal", message: message });
      }

      // Emit a structured diagnostic event. The native bridge in
      // SquarePaymentSheet.tsx forwards these to the server endpoint
      // /api/public/payment-sheet-diagnostics so we can see in production
      // logs exactly which phase real customers are getting stuck on (SDK
      // load, card-form attach, wallet init) instead of only seeing that
      // they ended up on the browser fallback.
      function diag(phase, extra) {
        try {
          var payload = {
            type: "diag",
            phase: phase,
            sessionId: SESSION_ID,
            environment: ENVIRONMENT,
            sdkSrc: SDK_SRC,
            elapsedMs: Date.now() - SHEET_OPENED_AT,
            online: (typeof navigator !== "undefined" && typeof navigator.onLine === "boolean") ? navigator.onLine : null,
            userAgent: (typeof navigator !== "undefined" && navigator.userAgent) ? String(navigator.userAgent).slice(0, 240) : "",
          };
          if (extra && typeof extra === "object") {
            for (var k in extra) {
              if (Object.prototype.hasOwnProperty.call(extra, k)) {
                payload[k] = extra[k];
              }
            }
          }
          send(payload);
        } catch (e) { /* never let diagnostics break the sheet */ }
      }

      function setStatus(t) {
        var el = document.getElementById("status");
        if (el) el.textContent = t || "";
      }
      function hideLoading() {
        var l = document.getElementById("loading");
        if (l) l.style.display = "none";
      }

      // Capture any uncaught script error so we can surface it instead of
      // showing the user a forever-loading spinner.
      //
      // IMPORTANT: both handlers are gated on !sdkLoaded. Square's Web
      // Payments SDK fires unhandled promise rejections from its own
      // internals after it loads — Apple Pay domain validation, Google Pay
      // session checks, internal analytics — on platforms/networks where
      // those features aren't available. These rejections do NOT affect
      // card payment ability, but without the gate they would trigger
      // fatal() and kill the entire sheet. All critical post-load errors
      // are already caught by the try/catch and .catch() chains inside
      // bootSquare/tryCardInit, so silencing the global handlers once the
      // SDK has loaded is safe.
      window.addEventListener("error", function (e) {
        if (sdkLoaded) return; // post-load errors are caught inside bootSquare
        var msg = (e && (e.message || (e.error && e.error.message))) || "Unknown script error";
        fatal("Payment library error: " + msg);
      });
      window.addEventListener("unhandledrejection", function (e) {
        if (sdkLoaded) return; // Square SDK fires these from wallet/analytics internals
        var reason = e && e.reason;
        var msg = (reason && (reason.message || String(reason))) || "Unknown promise rejection";
        fatal("Payment library error: " + msg);
      });

      // Render the recurring-billing notice up front so the customer sees
      // it BEFORE entering any card details. Required for transparency on
      // membership / subscription sign-ups.
      if (IS_SUBSCRIPTION) {
        var labelEl = document.getElementById("amount-label");
        if (labelEl) labelEl.textContent = "Membership";
        var recurEl = document.getElementById("amount-recurring");
        if (recurEl) {
          recurEl.textContent = RECURRING_DESC;
          recurEl.style.display = "block";
        }
        var noticeEl = document.getElementById("recurring-notice");
        if (noticeEl) {
          // NOTE: every backslash here MUST be doubled. This whole script lives
          // inside a JS template literal in the parent .tsx, where \s would
          // collapse to a plain "s" and corrupt the regex (this was the root
          // cause of the "spinner forever" bug — the inline script silently
          // SyntaxError'd at parse time and no timeout ever fired).
          var freq = RECURRING_DESC.replace(/^\\s*\\/\\s*/, "per ").replace(/—.*$/, "").trim();
          noticeEl.textContent = "By continuing, you authorise The 147 to charge this card £" + AMOUNT + " " + freq + ", until you cancel your membership.";
          noticeEl.style.display = "block";
        }
      }

      // ── Phase 1: load the Square SDK from CDN ────────────────────────────
      // We never use a blocking <script src> tag for the SDK because that
      // makes a slow/blocked CDN hang the whole document parser silently.
      //
      // Production diagnostics (see /api/public/payment-sheet-diagnostics in
      // server/routes.ts) showed two recurring failure modes here:
      //   1. The first script request stalled or 0-byte'd from a stale
      //      CDN/edge cache, never firing onload OR onerror until the phase
      //      timeout tripped. Retrying the load with a cache-busting query
      //      string forces a fresh edge fetch and recovers the customer
      //      without bouncing them to the browser fallback.
      //   2. Customers on poor mobile signal genuinely needed more than 8s
      //      to download the SDK at all — addressed by raising
      //      PHASE_TIMEOUT_MS above. The retry is independent of (and
      //      compounding with) that change.
      diag("sdk_load_start");
      var sdkLoaded = false;
      var sdkRetryCount = 0;
      // Identity of the in-flight SDK load attempt. Each call to
      // loadSdkOnce bumps this and the callbacks for that attempt close
      // over the value at creation time. A stale callback (e.g. attempt
      // #1's onerror firing AFTER attempt #2 has been started or has
      // already succeeded) compares its captured attempt id against this
      // counter and bails out — without this guard a late onerror from
      // the first script tag could call fatal() and kill a sheet that's
      // already working from the retry. (Found in code review of #70.)
      var currentAttemptId = 0;
      var sdkLoadTimer = null;

      function loadSdkOnce(srcUrl) {
        currentAttemptId += 1;
        var myAttemptId = currentAttemptId;
        if (sdkLoadTimer) {
          clearTimeout(sdkLoadTimer);
          sdkLoadTimer = null;
        }
        sdkLoadTimer = setTimeout(function () {
          // Ignore the timer if this attempt has been superseded, the SDK
          // has already loaded, or we've already fataled.
          if (myAttemptId !== currentAttemptId || sdkLoaded || fatalSent) return;
          if (sdkRetryCount === 0) {
            // First-attempt timeout: try once more before fataling.
            diag("sdk_load_timeout_retry", { retryCount: sdkRetryCount, attemptId: myAttemptId });
            sdkRetryCount = 1;
            loadSdkOnce(SDK_SRC + "?retry=" + Date.now());
          } else {
            fatal("Could not reach the payment service (timed out loading the secure payment library). Close this and try again, or use browser checkout.");
          }
        }, PHASE_TIMEOUT_MS);

        var s = document.createElement("script");
        s.src = srcUrl;
        s.async = true;
        // Match the <link rel="preload" crossorigin> hint in <head> — without
        // an explicit crossOrigin on the injected <script>, the browser treats
        // the preload and the script as different cache keys and re-fetches
        // the SDK, defeating the preload optimisation.
        s.crossOrigin = "anonymous";
        s.onload = function () {
          // Drop late onload from a superseded attempt or after we've
          // already booted/fataled.
          if (myAttemptId !== currentAttemptId || sdkLoaded || fatalSent) return;
          sdkLoaded = true;
          clearTimeout(sdkLoadTimer);
          sdkLoadTimer = null;
          diag("sdk_loaded", { retryCount: sdkRetryCount, attemptId: myAttemptId });
          bootSquare();
        };
        s.onerror = function () {
          // Drop late onerror from a superseded attempt — without this,
          // a delayed failure from attempt #1 could call fatal() AFTER
          // attempt #2 (the retry) has already succeeded, killing a
          // working sheet. Also skip if we've already loaded or fataled.
          if (myAttemptId !== currentAttemptId || sdkLoaded || fatalSent) return;
          clearTimeout(sdkLoadTimer);
          sdkLoadTimer = null;
          if (sdkRetryCount === 0) {
            // First-attempt error: retry once with a cache-buster.
            diag("sdk_load_error_retry", { retryCount: sdkRetryCount, attemptId: myAttemptId });
            sdkRetryCount = 1;
            loadSdkOnce(SDK_SRC + "?retry=" + Date.now());
          } else {
            fatal("Could not load the secure payment library (network error or blocked CDN). Close this and try again, or use browser checkout.");
          }
        };
        document.head.appendChild(s);
      }

      loadSdkOnce(SDK_SRC);

      function bootSquare() {
      if (!window.Square) {
        fatal("Could not load the payment library. Please try again.");
        return;
      }

      var payments;
      try {
        payments = window.Square.payments(APPLICATION_ID, LOCATION_ID);
      } catch (e) {
        fatal("Payments are not configured: " + (e && e.message ? e.message : "unknown error"));
        return;
      }

      function paymentRequest() {
        // Apple Pay's PassKit can reject tokenize with INVALID_CARD_DATA when
        // the total label contains non-ASCII characters (e.g. middle dot ·)
        // or runs over ~32 chars. Keep the label short, ASCII-only.
        //
        // App Store Guideline 4.9 (Apple Pay) requires the MERCHANT NAME to
        // appear on the payment sheet. The total.label is what Apple Pay
        // shows next to the amount, so it must lead with our merchant name
        // "The 147 Bradford" — both for one-off purchases and subscriptions.
        // Previously the subscription branch said "The 147 Membership
        // (monthly)" with no merchant identifier, which was the basis for
        // App Store rejection of v2.6.5.
        var totalLabel;
        if (IS_SUBSCRIPTION) {
          var isAnnual = /year/i.test(RECURRING_DESC);
          totalLabel = isAnnual
            ? "The 147 Bradford (yearly)"
            : "The 147 Bradford (monthly)";
        } else {
          totalLabel = "The 147 Bradford";
        }
        var req = {
          countryCode: "GB",
          currencyCode: CURRENCY,
          total: {
            amount: AMOUNT,
            label: totalLabel,
          },
        };
        return payments.paymentRequest(req);
      }

      function verifyAndSend(token) {
        // FEATURE_SAVED_CARDS: read the opt-in checkbox state at tokenize
        // time. Only meaningful for INTENT === "CHARGE_AND_STORE" — for
        // every other intent the saveCard flag is forwarded as false and
        // the server ignores it.
        var saveCardChecked = false;
        if (SHOW_SAVE_CARD) {
          var cb = document.getElementById("save-card-checkbox");
          saveCardChecked = !!(cb && cb.checked);
        }
        // Always run verifyBuyer regardless of intent.
        //
        // UK PSD2 / SCA rules require 3DS verification for most
        // card-not-present transactions. Previously we skipped verifyBuyer
        // for plain CHARGE payments on the assumption that Square would
        // "challenge later if needed" — but Square cannot initiate a 3DS
        // challenge AFTER the payment token has been submitted.  The result
        // was CARD_DECLINED_VERIFICATION_REQUIRED being returned from
        // /api/orders/:id/pay for any bank that mandates SCA, leaving the
        // customer unable to pay.
        //
        // Calling verifyBuyer with intent "CHARGE" lets Square perform a
        // frictionless risk assessment first. If the bank requires a
        // challenge (rare for low-risk in-person-venue amounts) the 3DS
        // sheet opens inside the WebView and the customer completes it
        // before we even send the token to our server.  If the bank says
        // no challenge is needed, Square returns a verification token
        // (or null for cards that truly skip SCA) and we pass it along.
        //
        // For STORE / CHARGE_AND_STORE-with-save the intent must be "STORE"
        // (Square requires this for future-use / recurring authorisations).
        var scaIntent = (INTENT === "STORE" || (INTENT === "CHARGE_AND_STORE" && saveCardChecked))
          ? "STORE"
          : "CHARGE";
        try {
          var verifyDetails = {
            intent: scaIntent,
            // Providing amount + currencyCode lets Square's 3DS engine run a
            // frictionless risk assessment, reducing how often customers see
            // an explicit challenge for low-value in-venue transactions.
            amount: AMOUNT,
            currencyCode: CURRENCY,
            customerInitiated: true,
            sellerKeyedIn: false,
            billingContact: BUYER_EMAIL ? { email: BUYER_EMAIL } : {},
          };
          payments.verifyBuyer(token, verifyDetails).then(function (vr) {
            send({ type: "token", token: token, verificationToken: vr && vr.token ? vr.token : null, saveCard: saveCardChecked });
          }).catch(function (err) {
            // verifyBuyer can reject for two benign reasons:
            //  1. "SCA not required" / "no challenge" — card is exempt
            //  2. A transient SDK error (e.g. network blip during the
            //     3DS fingerprint iframe load)
            // In both cases we forward the token without a verificationToken.
            // The server will attempt the payment; it succeeds for exempt
            // cards and may fail with CARD_DECLINED_VERIFICATION_REQUIRED
            // for cards that genuinely need SCA — in which case the customer
            // sees a clear error and can retry or use web checkout.
            send({ type: "token", token: token, verificationToken: null, saveCard: saveCardChecked });
          });
        } catch (e) {
          send({ type: "token", token: token, verificationToken: null, saveCard: saveCardChecked });
        }
      }

      function tokenizeAndSend(paymentMethod, methodLabel) {
        var label = methodLabel || "Card";
        return paymentMethod.tokenize().then(function (result) {
          if (result.status === "OK") {
            // End-to-end success marker — the card token has been issued by
            // Square. The native bridge will then POST it to /api/orders/:id/pay.
            // Pairs with payment_started so we can compute success rate.
            diag("payment_tokenized", { method: label });
            verifyAndSend(result.token);
          } else if (result.status === "Cancel") {
            // User dismissed the payment sheet (e.g. closed the Google Pay or
            // Apple Pay overlay without completing the payment). This is not
            // an error — just reset the button state silently so they can
            // try again without a confusing "Payment failed" message.
            diag("payment_cancelled", { method: label });
          } else {
            // Build a diagnostic message including Square's error code and
            // category so staff can pinpoint why tokens are rejected
            // (e.g. INVALID_CARD_DATA from an unverified Apple Pay domain).
            var first = (result.errors && result.errors[0]) || {};
            var code = first.code || "UNKNOWN";
            var category = first.category || "";
            // Map the most common Square error codes to plain-English messages
            // so customers understand what to do without seeing raw API codes.
            var friendlyMessages = {
              INVALID_CARD_DATA: "Check your card details and try again.",
              CVV_FAILURE: "Incorrect security code (CVV) — please check and try again.",
              EXPIRY_FAILURE: "Incorrect expiry date — please check and try again.",
              CARD_DECLINED: "Your card was declined. Please try a different card.",
              CARD_DECLINED_VERIFICATION_REQUIRED: "Your bank requires additional verification. Please try again or use a different card.",
              INSUFFICIENT_FUNDS: "Insufficient funds on this card.",
              CARD_VELOCITY_EXCEEDED: "Too many attempts — please wait a moment and try again.",
              TRANSACTION_LIMIT_EXCEEDED: "Transaction limit exceeded. Please try a different card.",
              CARDHOLDER_INSUFFICIENT_PERMISSIONS: "This card type is not accepted here.",
            };
            var friendly = friendlyMessages[code];
            var rawDetail = first.detail || first.message || "Payment failed";
            var msg = friendly
              ? label + ": " + friendly
              : label + ": " + rawDetail + " [" + code + (category ? " · " + category : "") + "]";
            setStatus(msg);
            send({ type: "error", message: msg, code: code, category: category, method: label });
          }
        }).catch(function (err) {
          var msg = label + ": " + ((err && err.message) || "Tokenization failed");
          setStatus(msg);
          send({ type: "error", message: msg, method: label });
        });
      }

      // ── Phase 2: initialise the card form ────────────────────────────────
      // Independent timeout so that a hung payments.card() / .attach() (the
      // other documented cause of the spinner-forever bug, seen on some
      // WKWebView builds) can't strand the user. Wallet init is fired in
      // parallel and is fully isolated — it can NEVER block the card form
      // from appearing.
      var cardReady = false;
      var cardAttachTimer = setTimeout(function () {
        if (cardReady) return;
        fatal("The card form did not load in time. Close this and try again, or use browser checkout.");
      }, PHASE_TIMEOUT_MS);

      // Show a gentle "taking longer than usual" warning after 6 s so the
      // user isn't stuck staring at a spinner — they get an inline retry
      // button rather than having to wait for the full 12 s fatal timeout.
      var slowWarningShown = false;
      var slowWarningTimer = setTimeout(function () {
        if (cardReady || fatalSent) return;
        slowWarningShown = true;
        var w = document.getElementById("slow-warning");
        if (w) w.style.display = "block";
        diag("slow_warning_shown");
      }, 6000);

      // Retry button: abandon the hanging attempt and re-run tryCardInit.
      // fatalSent is intentionally NOT reset here so that a second hang
      // (which increments attempt to 2 and calls fatal()) still terminates.
      var slowBtn = document.getElementById("slow-retry-btn");
      if (slowBtn) {
        slowBtn.addEventListener("click", function () {
          var w = document.getElementById("slow-warning");
          if (w) w.style.display = "none";
          slowWarningShown = false;
          diag("slow_retry_tapped");
          tryCardInit(1);
        });
      }

      diag("card_attach_start");
      var card;

      // Attempt to initialise the card form. On iOS WKWebView the first
      // attach() call sometimes fails with a transient error (observed in
      // production as card_attach_error immediately after apple_pay_ready).
      // A single retry after 400 ms recovers in most cases.  If the second
      // attempt also fails we call fatal() so the user is offered the
      // browser fallback rather than being left on an infinite spinner.
      function tryCardInit(attempt) {
        attempt = attempt || 1;

      // Pass card styling options so the Square-hosted input fields match
      // the payment sheet's dark theme as closely as possible.
      // NOTE: Square's card element renders inside a cross-origin iframe so
      // we cannot change the iframe's background colour — it will always be
      // white. Input text must remain dark (#0A1628) for legibility on that
      // white background. We can still apply brand-matched border colours
      // and error/focus states.
      // CardClassSelectors reference:
      //   https://developer.squareup.com/reference/sdks/web/payments/objects/CardClassSelectors
      diag("card_obj_start", { attempt: attempt });
      payments.card({
        style: {
          '.input-container': { borderColor: '#D1D5DB', borderRadius: '10px' },
          '.input-container.is-focus': { borderColor: '#3B82F6' },
          '.input-container.is-error': { borderColor: '#EF4444' },
          '.message-text': { color: '#6B7280' },
          '.message-icon': { color: '#6B7280' },
          '.message-text.is-error': { color: '#DC2626' },
          '.message-icon.is-error': { color: '#DC2626' },
          input: {
            color: '#0A1628',
            fontSize: '15px',
          },
          'input::placeholder': { color: '#9CA3AF' },
        },
      }).then(function (c) {
        card = c;
        diag("card_obj_ready", { attempt: attempt });
        return c.attach("#card-container");
      }).then(function () {
        cardReady = true;
        clearTimeout(cardAttachTimer);
        clearTimeout(slowWarningTimer);
        var w = document.getElementById("slow-warning");
        if (w) w.style.display = "none";
        diag("card_attached");
        if (fatalSent) return; // already gave up
        var payBtn = document.getElementById("pay-card-btn");
        payBtn.textContent = PAY_LABEL;
        if (IS_SUBSCRIPTION) {
          var fp = document.getElementById("recurring-fineprint");
          if (fp) {
            fp.textContent = "You can cancel anytime from your account.";
            fp.style.display = "block";
          }
        }
        hideLoading();
        // FEATURE_SAVED_CARDS: reveal the save-card checkbox now that the
        // card form is interactive. Hidden by default in CSS so it never
        // flashes during loading — appears only when the host has opted
        // into showing it (authenticated customer, no card already saved).
        if (SHOW_SAVE_CARD) {
          var saveRow = document.getElementById("save-card-row");
          if (saveRow) saveRow.style.display = "flex";
        }
        // The card form is now visible and interactive — this is the
        // customer-perceived "ready to pay" moment. Diagnostic phase used
        // server-side to chart end-to-end TTI (sheet open → interactive)
        // separately from the technical SDK / card-attach milestones.
        diag("paint_complete");
        payBtn.addEventListener("click", function () {
          setStatus("");
          payBtn.disabled = true;
          payBtn.textContent = "Processing…";
          diag("payment_started", { method: "card" });
          tokenizeAndSend(card, "Card").finally(function () {
            payBtn.disabled = false;
            payBtn.textContent = PAY_LABEL;
          });
        });
        // Wallet buttons initialised HERE — after the card form is safely
        // attached and interactive. On iOS WKWebView, calling
        // payments.applePay() in parallel with card.attach() caused the
        // card form to lose an internal Square SDK race and throw
        // card_attach_error on every attempt. Sequencing eliminates this:
        // Apple Pay and Google Pay buttons appear slightly later (~1-2 s)
        // but the card form is always reliable.
        initWallets();
      }).catch(function (err) {
        var reason = (err && err.message) ? String(err.message).slice(0, 200) : "unknown";
        diag("card_attach_error", { reason: reason, attempt: attempt });
        if (fatalSent || cardReady) return;
        if (attempt < 2) {
          // One retry after 400 ms. On iOS WKWebView this recovers from
          // a transient race where the Apple Pay button custom element
          // finishes rendering just as Square tries to inject its card
          // iframes, briefly leaving #card-container in a zero-size state.
          setTimeout(function () {
            if (fatalSent || cardReady) return;
            tryCardInit(attempt + 1);
          }, 400);
        } else {
          clearTimeout(cardAttachTimer);
          fatal("Could not load card form: " + (err && err.message ? err.message : "unknown error"));
        }
      });
      } // end tryCardInit

      tryCardInit();

      // initWallets() is called from inside tryCardInit's success handler
      // (after the card form is confirmed attached) — NOT here in parallel.
      // Defined as a named function so tryCardInit can call it regardless of
      // source-order (function declarations are hoisted within this IIFE).
      function initWallets() {

      // Apple Pay (iOS Safari/WebKit only, requires verified domain).
      // Fully isolated — any failure here MUST NOT affect the card form.
      //
      // IMPORTANT (App Store Guideline 4.9): we MUST render the official
      // Apple-approved Pay button, NOT a custom black button containing the
      //  Pay wordmark. We render the button via Apple Pay JS's
      // ApplePayButton custom element (apple-pay-button-with-text). Square's
      // Web Payments SDK does not provide an attach() helper for Apple Pay
      // (unlike googlePay.attach), so we inject Apple's official element and
      // wire its click to Square's tokenize flow.
      try {
        var pr = paymentRequest();
        payments.applePay(pr).then(function (ap) {
          diag("apple_pay_ready");
          try {
            var el = document.getElementById("apple-pay-button");
            if (!el) return;
            // Reset any previously-applied custom styling and inject the
            // official Apple element. The script that defines the custom
            // element is loaded from Apple's CDN (added in <head>).
            el.innerHTML = "";
            el.removeAttribute("style");
            el.style.display = "block";
            el.style.height = "50px";
            el.style.borderRadius = "12px";
            el.style.overflow = "hidden";
            var btn = document.createElement("apple-pay-button");
            btn.setAttribute("buttonstyle", "black");
            // Use the semantically correct button type so the Apple Pay sheet
            // shows the right action label:
            //   "Subscribe with  Pay" — for membership/recurring billing
            //   "Buy with  Pay"       — for one-off orders
            // Apple's guidelines provide type="subscribe" exactly for this case.
            // Using "buy" on a subscription screen is technically non-compliant.
            btn.setAttribute("type", IS_SUBSCRIPTION ? "subscribe" : "buy");
            btn.setAttribute("locale", "en-GB");
            btn.style.setProperty("--apple-pay-button-width", "100%");
            btn.style.setProperty("--apple-pay-button-height", "50px");
            btn.style.setProperty("--apple-pay-button-border-radius", "12px");
            btn.style.display = "block";
            btn.style.width = "100%";
            btn.style.height = "50px";
            el.appendChild(btn);
            var divider = document.getElementById("or-divider");
            if (divider) divider.style.display = "block";
            btn.addEventListener("click", function () {
              diag("payment_started", { method: "apple_pay" });
              tokenizeAndSend(ap, "Apple Pay");
            });
          } catch (e) { /* swallow — card form must still work */ }
        }).catch(function (err) {
          // Most often "unsupported on this device" (Android, web non-Safari,
          // or domain not registered). Captured for diagnostics so we can
          // tell the difference between "no Apple Pay because Android" and
          // "Apple Pay broken on iOS because domain mismatch".
          diag("apple_pay_unavailable", { reason: (err && err.message) ? String(err.message).slice(0, 200) : "unknown" });
        });
      } catch (e) {
        diag("apple_pay_throw", { reason: (e && e.message) ? String(e.message).slice(0, 200) : "unknown" });
      }

      // Google Pay — custom button approach (no gp.attach).
      // gp.attach() creates Square's button with its own internal click
      // handler. Our additional click listener on the container caused a
      // tokenisation race on Android (both handlers fired simultaneously).
      // Using a custom button + single gp.tokenize() call (same pattern as
      // Apple Pay above) eliminates the race completely.
      //
      // Skipped entirely on Android: Payment Request API is unavailable in
      // Android WebView, so Square falls back to an intent:// URL that we
      // block, causing a confusing error. IS_ANDROID is set from Platform.OS
      // at build time in SquarePaymentSheet.tsx.
      if (!IS_ANDROID) {
      try {
        var pr2 = paymentRequest();
        payments.googlePay(pr2).then(function (gp) {
          diag("google_pay_ready");
          try {
            var el = document.getElementById("google-pay-button");
            if (!el) return;
            el.innerHTML = "";
            el.style.display = "block";
            // Build a custom Google Pay button that fills the container div.
            // The container already has height:50px and border-radius:12px
            // from CSS, so the button just needs to fill it.
            var btn = document.createElement("button");
            btn.type = "button";
            btn.setAttribute("aria-label", "Pay with Google Pay");
            btn.style.cssText = [
              "width:100%", "height:50px", "background:#000", "color:#fff",
              "border:0", "border-radius:12px", "font-size:15px", "font-weight:600",
              "cursor:pointer", "display:flex", "align-items:center",
              "justify-content:center", "gap:8px", "letter-spacing:0.01em",
              "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
              "box-sizing:border-box", "padding:0 16px", "-webkit-tap-highlight-color:transparent",
            ].join(";");
            // Google "G" mark SVG (official colours, no text — cleaner on small buttons)
            btn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg><span>Pay with Google Pay</span>';
            el.appendChild(btn);
            var divider = document.getElementById("or-divider");
            if (divider) divider.style.display = "block";
            btn.addEventListener("click", function () {
              diag("payment_started", { method: "google_pay" });
              tokenizeAndSend(gp, "Google Pay");
            });
          } catch (e) { /* swallow — card form must still work */ }
        }).catch(function (err) {
          diag("google_pay_unavailable", { reason: (err && err.message) ? String(err.message).slice(0, 200) : "unknown" });
        });
      } catch (e) {
        diag("google_pay_throw", { reason: (e && e.message) ? String(e.message).slice(0, 200) : "unknown" });
      }
      } // end if (!IS_ANDROID)
      } // end initWallets

      } // end bootSquare
    })();
  </script>
</body>
</html>`;
}
