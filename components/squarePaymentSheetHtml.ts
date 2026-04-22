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
  intent?: "CHARGE" | "STORE";
  buyerEmail?: string | null;
  recurringDescription?: string | null;
}): string {
  const sdkSrc =
    opts.environment === "production"
      ? "https://web.squarecdn.com/v1/square.js"
      : "https://sandbox.web.squarecdn.com/v1/square.js";
  const amountStr = (opts.amountPence / 100).toFixed(2);
  // Per-phase timeout. Kept aggressive (8s) so customers stuck on a flaky
  // network or behind a CDN block are told quickly and can fall back to the
  // hosted checkout instead of staring at a spinner.
  const PHASE_TIMEOUT_MS = 8000;
  // Bridge: postMessage works for both react-native-webview (window.ReactNativeWebView)
  // and the web fallback (parent window via window.parent.postMessage).
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <title>Payment</title>
  <style>
    * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    html, body { margin: 0; padding: 0; background: #F7F8FA; color: #0A1628; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; -webkit-font-smoothing: antialiased; }
    body { padding: 18px 16px 28px; min-height: 100vh; }

    .amount-card {
      background: linear-gradient(135deg, #0A1628 0%, #0047AB 100%);
      color: #fff;
      border-radius: 16px;
      padding: 18px 20px;
      box-shadow: 0 6px 18px rgba(10, 22, 40, 0.18);
      margin-bottom: 18px;
    }
    .amount-card .label { font-size: 12px; opacity: 0.75; text-transform: uppercase; letter-spacing: 1.2px; margin-bottom: 4px; font-weight: 600; }
    .amount-card .value { font-size: 30px; font-weight: 800; letter-spacing: -0.5px; line-height: 1.1; }
    .amount-card .recurring { font-size: 13px; opacity: 0.85; margin-top: 4px; font-weight: 500; }

    #recurring-notice {
      display: none;
      background: #FEF3C7;
      border: 1px solid #FCD34D;
      color: #78350F;
      font-size: 12.5px;
      line-height: 1.5;
      border-radius: 10px;
      padding: 11px 13px;
      margin-bottom: 16px;
      font-weight: 500;
    }

    .section-title { font-size: 11px; font-weight: 700; color: #6B7280; text-transform: uppercase; letter-spacing: 1.3px; margin-bottom: 10px; }

    .wallets { display: flex; flex-direction: column; gap: 10px; margin-bottom: 6px; }
    #apple-pay-button, #google-pay-button { display: none; height: 50px; border-radius: 12px; overflow: hidden; }

    .or { display: none; text-align: center; color: #9CA3AF; font-size: 11px; letter-spacing: 1.4px; font-weight: 600; margin: 18px 0 14px; position: relative; }
    .or::before, .or::after { content: ""; position: absolute; top: 50%; width: calc(50% - 60px); height: 1px; background: #E5E7EB; }
    .or::before { left: 0; }
    .or::after { right: 0; }

    .card-card {
      background: #fff;
      border: 1px solid #E5E7EB;
      border-radius: 14px;
      padding: 16px;
      box-shadow: 0 2px 6px rgba(10, 22, 40, 0.04);
    }
    .card-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
    .card-header .label { font-size: 13px; font-weight: 700; color: #0A1628; }
    .brands { display: flex; gap: 6px; align-items: center; }
    .brand-pill { font-size: 9px; font-weight: 800; padding: 3px 7px; border-radius: 4px; color: #fff; letter-spacing: 0.4px; }
    .b-visa { background: #1A1F71; }
    .b-mc { background: linear-gradient(90deg, #EB001B 0%, #EB001B 50%, #F79E1B 50%, #F79E1B 100%); }
    .b-amex { background: #006FCF; }

    #card-container { min-height: 90px; }

    #pay-card-btn {
      width: 100%; margin-top: 14px; padding: 15px; border: none; border-radius: 12px;
      background: #0047AB; color: white; font-size: 16px; font-weight: 700; cursor: pointer;
      box-shadow: 0 4px 12px rgba(0, 71, 171, 0.28);
      transition: transform 0.1s, box-shadow 0.1s, opacity 0.15s;
    }
    #pay-card-btn:active { transform: translateY(1px); box-shadow: 0 2px 6px rgba(0, 71, 171, 0.22); }
    #pay-card-btn:disabled { opacity: 0.55; cursor: default; box-shadow: none; }

    #recurring-fineprint { display: none; font-size: 11.5px; color: #6B7280; line-height: 1.5; margin-top: 10px; text-align: center; }

    #status { margin-top: 10px; font-size: 13px; color: #DC2626; min-height: 16px; text-align: center; font-weight: 500; }

    #loading { display: flex; align-items: center; justify-content: center; gap: 10px; color: #6B7280; font-size: 13px; padding: 24px 0; }
    .spinner { width: 16px; height: 16px; border: 2px solid #E5E7EB; border-top-color: #0047AB; border-radius: 50%; animation: spin 0.8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }

    .trust-footer {
      display: flex; align-items: center; justify-content: center; gap: 6px;
      margin-top: 18px; padding-top: 16px;
      border-top: 1px solid #E5E7EB;
      font-size: 11px; color: #9CA3AF; font-weight: 500;
    }
    .trust-footer .lock { display: inline-block; width: 10px; height: 10px; border: 1.5px solid #9CA3AF; border-radius: 2px; position: relative; }
    .trust-footer .lock::before { content: ""; position: absolute; top: -4px; left: 1.5px; width: 5px; height: 5px; border: 1.5px solid #9CA3AF; border-bottom: none; border-radius: 4px 4px 0 0; }
  </style>
</head>
<body>
  <div class="amount-card">
    <div class="label" id="amount-label">Total</div>
    <div class="value">£${amountStr}</div>
    <div class="recurring" id="amount-recurring" style="display:none"></div>
  </div>

  <div id="recurring-notice"></div>

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
      var SDK_SRC = ${JSON.stringify(sdkSrc)};
      var PHASE_TIMEOUT_MS = ${PHASE_TIMEOUT_MS};
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
        send({ type: "fatal", message: message });
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
      window.addEventListener("error", function (e) {
        var msg = (e && (e.message || (e.error && e.error.message))) || "Unknown script error";
        fatal("Payment library error: " + msg);
      });
      window.addEventListener("unhandledrejection", function (e) {
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
      var sdkLoaded = false;
      var sdkLoadTimer = setTimeout(function () {
        if (sdkLoaded) return;
        fatal("Could not reach the payment service (timed out loading the secure payment library). Close this and try again, or use browser checkout.");
      }, PHASE_TIMEOUT_MS);

      var s = document.createElement("script");
      s.src = SDK_SRC;
      s.async = true;
      s.onload = function () {
        sdkLoaded = true;
        clearTimeout(sdkLoadTimer);
        bootSquare();
      };
      s.onerror = function () {
        clearTimeout(sdkLoadTimer);
        fatal("Could not load the secure payment library (network error or blocked CDN). Close this and try again, or use browser checkout.");
      };
      document.head.appendChild(s);

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
        var req = {
          countryCode: "GB",
          currencyCode: CURRENCY,
          total: {
            amount: AMOUNT,
            label: IS_SUBSCRIPTION ? "The 147 Membership" : "The 147 Bradford",
          },
        };
        // For recurring billing, attach the Apple Pay JS recurringPaymentRequest
        // so Apple's own sheet clearly tells the customer "this is a
        // subscription that will renew automatically until cancelled".
        // Required by Apple Pay guidelines for subscriptions and prevents
        // confused-customer chargebacks.
        if (IS_SUBSCRIPTION) {
          var isAnnual = /year/i.test(RECURRING_DESC);
          req.total.amount = AMOUNT; // first/initial billed amount
          req.recurringPaymentRequest = {
            paymentDescription: "The 147 Bradford Membership",
            regularBilling: {
              amount: AMOUNT,
              label: isAnnual ? "Annual membership" : "Monthly membership",
              recurringPaymentIntervalUnit: isAnnual ? "year" : "month",
              recurringPaymentIntervalCount: 1,
            },
            managementURL: "https://the147bradford.replit.app/",
          };
        }
        return payments.paymentRequest(req);
      }

      function verifyAndSend(token) {
        // For STORE intent (saving a card on file for recurring billing) we
        // run verifyBuyer up front so SCA/3DS challenges happen here. For
        // CHARGE intent we currently skip verifyBuyer and let the server
        // attempt the payment without 3DS — preserving existing behaviour.
        if (INTENT !== "STORE") {
          send({ type: "token", token: token });
          return;
        }
        try {
          var verifyDetails = {
            intent: "STORE",
            customerInitiated: true,
            sellerKeyedIn: false,
            billingContact: BUYER_EMAIL ? { email: BUYER_EMAIL } : {},
          };
          payments.verifyBuyer(token, verifyDetails).then(function (vr) {
            send({ type: "token", token: token, verificationToken: vr && vr.token ? vr.token : null });
          }).catch(function (err) {
            // Some cards do not require SCA — Square returns an error in that
            // case. Forward the token without a verificationToken so the
            // server can still try to save the card.
            var msg = (err && err.message) || "";
            if (/not\\s+required|no\\s+challenge|UNSUPPORTED/i.test(msg)) {
              send({ type: "token", token: token, verificationToken: null });
            } else {
              setStatus(msg || "Card verification failed");
              send({ type: "error", message: msg || "Card verification failed" });
            }
          });
        } catch (e) {
          send({ type: "token", token: token, verificationToken: null });
        }
      }

      function tokenizeAndSend(paymentMethod) {
        return paymentMethod.tokenize().then(function (result) {
          if (result.status === "OK") {
            verifyAndSend(result.token);
          } else {
            var msg = (result.errors && result.errors[0] && result.errors[0].message) || "Payment failed";
            setStatus(msg);
            send({ type: "error", message: msg });
          }
        }).catch(function (err) {
          var msg = (err && err.message) || "Tokenization failed";
          setStatus(msg);
          send({ type: "error", message: msg });
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

      var card;
      payments.card().then(function (c) {
        card = c;
        return c.attach("#card-container");
      }).then(function () {
        cardReady = true;
        clearTimeout(cardAttachTimer);
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
        payBtn.addEventListener("click", function () {
          setStatus("");
          payBtn.disabled = true;
          payBtn.textContent = "Processing…";
          tokenizeAndSend(card).finally(function () {
            payBtn.disabled = false;
            payBtn.textContent = PAY_LABEL;
          });
        });
      }).catch(function (err) {
        clearTimeout(cardAttachTimer);
        fatal("Could not load card form: " + (err && err.message ? err.message : "unknown error"));
      });

      // Apple Pay (iOS Safari/WebKit only, requires verified domain).
      // Fully isolated — any failure here MUST NOT affect the card form.
      try {
        var pr = paymentRequest();
        payments.applePay(pr).then(function (ap) {
          try {
            var el = document.getElementById("apple-pay-button");
            if (!el) return;
            el.style.display = "block";
            el.style.background = "#000";
            el.style.color = "#fff";
            el.style.textAlign = "center";
            el.style.lineHeight = "48px";
            el.style.fontWeight = "600";
            el.textContent = " Apple Pay";
            var divider = document.getElementById("or-divider");
            if (divider) divider.style.display = "block";
            el.addEventListener("click", function () {
              tokenizeAndSend(ap);
            });
          } catch (e) { /* swallow — card form must still work */ }
        }).catch(function () { /* unsupported on this device */ });
      } catch (e) { /* swallow — card form must still work */ }

      // Google Pay — same isolation rule as Apple Pay above.
      try {
        var pr2 = paymentRequest();
        payments.googlePay(pr2).then(function (gp) {
          return gp.attach("#google-pay-button", { buttonColor: "black", buttonType: "long" }).then(function () {
            try {
              var el = document.getElementById("google-pay-button");
              if (!el) return;
              el.style.display = "block";
              var divider = document.getElementById("or-divider");
              if (divider) divider.style.display = "block";
              el.addEventListener("click", function () {
                tokenizeAndSend(gp);
              });
            } catch (e) { /* swallow */ }
          });
        }).catch(function () { /* unsupported */ });
      } catch (e) { /* swallow */ }
      } // end bootSquare
    })();
  </script>
</body>
</html>`;
}
