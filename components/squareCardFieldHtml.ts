// Minimal HTML for the in-app Square card field + wallet buttons.
//
// Unlike components/squarePaymentSheetHtml.ts (used for membership signup
// where we need a full self-contained sheet with amount card, recurring
// notice, etc.), this builder produces ONLY:
//   - the wallet container (Apple Pay + Google Pay buttons that Square
//     requires us to render inside the WebView for PCI/wallet API access)
//   - the Square hosted card-input iframe (#card-container)
//
// All chrome — amount card, order summary, error banner, processing
// overlay, trust footer, the Pay button itself — is rendered NATIVELY by
// app/checkout.tsx around the WebView. This file is loaded by
// components/SquareCardField.tsx.
//
// Bridge contract (postMessage from WebView -> RN parent):
//   { type: "ready" }                   - card form attached, safe to enable Pay
//   { type: "resize", height: number }  - parent should resize the WebView
//   { type: "wallet_ready", method }    - Apple/Google Pay button rendered
//   { type: "wallet_unavailable", method, reason } - swallowed in parent
//   { type: "token", token, verificationToken? } - tokenize succeeded
//   { type: "error", message, code?, category?, method? } - tokenize failed
//   { type: "fatal", message }          - SDK load / card attach unrecoverable
//   { type: "diag", phase, ...extra }   - forwarded to /api/public/payment-sheet-diagnostics
//
// Bridge contract (RN parent -> WebView via injectJavaScript):
//   window.__sheet.tokenizeCard()   - native Pay button was tapped; tokenize the card

export function buildCardFieldHtml(opts: {
  applicationId: string;
  locationId: string;
  environment: "production" | "sandbox";
  amountPence: number;
  currency: string;
  intent?: "CHARGE" | "STORE";
  buyerEmail?: string | null;
  /** Recurring description for STORE intent (memberships). Null for one-off CHARGE. */
  recurringDescription?: string | null;
}): string {
  const sdkSrc =
    opts.environment === "production"
      ? "https://web.squarecdn.com/v1/square.js"
      : "https://sandbox.web.squarecdn.com/v1/square.js";
  const amountStr = (opts.amountPence / 100).toFixed(2);
  // Same per-phase timeout as the legacy sheet — 12s tolerates poor mobile
  // signal at the venue while still preventing a truly hung WebView from
  // stranding the user. Single retry on top of this (see loadSdkOnce).
  const PHASE_TIMEOUT_MS = 12000;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <title>Card</title>
  <!--
    Apple's official Apple Pay button web component. Required by App Store
    Guideline 4.9 — using a custom black button with the  Pay wordmark
    is grounds for rejection. Loads silently on non-Apple devices.
  -->
  <script
    crossorigin="anonymous"
    src="https://applepay.cdn-apple.com/jsapi/v1.1.0/apple-pay-sdk.js"
  ></script>
  <style>
    * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    /* Transparent background — the React Native checkout screen paints the
       backdrop. Margin/padding are zeroed so the WebView height matches
       content exactly (see ResizeObserver below). */
    html, body { margin: 0; padding: 0; background: transparent; color: #0A1628; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; -webkit-font-smoothing: antialiased; }
    body { padding: 0 16px; }

    .wallets { display: flex; flex-direction: column; gap: 10px; }
    #apple-pay-button, #google-pay-button {
      display: none;
      height: 50px;
      border-radius: 12px;
      overflow: hidden;
    }

    /* "OR PAY BY CARD" divider — shown only when at least one wallet appears */
    .or {
      display: none;
      text-align: center;
      color: #9CA3AF;
      font-size: 11px;
      letter-spacing: 1.4px;
      font-weight: 600;
      margin: 18px 0 14px;
      position: relative;
    }
    .or::before, .or::after {
      content: "";
      position: absolute;
      top: 50%;
      width: calc(50% - 70px);
      height: 1px;
      background: #E5E7EB;
    }
    .or::before { left: 0; }
    .or::after  { right: 0; }

    #card-container {
      min-height: 90px;
      background: #fff;
      border: 1px solid #E5E7EB;
      border-radius: 12px;
      padding: 14px;
      box-shadow: 0 1px 3px rgba(10, 22, 40, 0.04);
    }

    #status {
      color: #B91C1C;
      font-size: 13px;
      margin-top: 10px;
      min-height: 18px;
      line-height: 1.4;
    }
    /* Force any visual gap below the last element so resize includes it */
    #spacer { height: 4px; }
  </style>
</head>
<body>
  <div class="wallets">
    <div id="apple-pay-button"></div>
    <div id="google-pay-button"></div>
  </div>

  <div class="or" id="or-divider">OR PAY BY CARD</div>

  <div id="card-container"></div>

  <div id="status"></div>
  <div id="spacer"></div>

  <script>
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
      var ENVIRONMENT = ${JSON.stringify(opts.environment)};
      var SHEET_OPENED_AT = Date.now();
      var SESSION_ID = (Date.now().toString(36) + Math.random().toString(36).slice(2, 8));

      var fatalSent = false;
      function send(msg) {
        try {
          var s = JSON.stringify(msg);
          if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
            window.ReactNativeWebView.postMessage(s);
          } else if (window.parent && window.parent !== window) {
            // srcDoc iframes have origin "null" so a specific targetOrigin
            // would silently drop the message. The parent listener verifies
            // e.source matches the expected iframe contentWindow.
            window.parent.postMessage(s, "*");
          }
        } catch (e) {}
      }

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
        } catch (e) {}
      }

      function setStatus(t) {
        var el = document.getElementById("status");
        if (el) el.textContent = t || "";
      }

      function fatal(message) {
        if (fatalSent) return;
        fatalSent = true;
        setStatus(message);
        diag("fatal", { reason: message });
        send({ type: "fatal", message: message });
      }

      // ── Resize reporting ────────────────────────────────────────────────
      // Parent uses this to size the WebView so there's no double-scroll
      // and no wasted whitespace. Throttled with rAF.
      var lastReportedHeight = 0;
      function reportHeight() {
        try {
          var h = Math.ceil(document.documentElement.scrollHeight || document.body.scrollHeight || 0);
          if (h && Math.abs(h - lastReportedHeight) >= 2) {
            lastReportedHeight = h;
            send({ type: "resize", height: h });
          }
        } catch (e) {}
      }
      var rafScheduled = false;
      function scheduleReport() {
        if (rafScheduled) return;
        rafScheduled = true;
        (window.requestAnimationFrame || function (cb) { setTimeout(cb, 16); })(function () {
          rafScheduled = false;
          reportHeight();
        });
      }
      // Re-measure on any DOM mutation, window resize, or font load — the
      // Square card iframe grows when the user focuses it (validation
      // hints, error rows) and the wallet buttons appear asynchronously.
      try {
        if (typeof MutationObserver !== "undefined") {
          new MutationObserver(scheduleReport).observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
        }
      } catch (e) {}
      try {
        if (typeof ResizeObserver !== "undefined") {
          new ResizeObserver(scheduleReport).observe(document.body);
        }
      } catch (e) {}
      window.addEventListener("resize", scheduleReport);
      // First measurement once layout settles
      setTimeout(scheduleReport, 50);

      // Capture uncaught script errors so they surface as fatals instead
      // of leaving the parent's "loading…" skeleton up forever.
      window.addEventListener("error", function (e) {
        var msg = (e && (e.message || (e.error && e.error.message))) || "Unknown script error";
        fatal("Payment library error: " + msg);
      });
      window.addEventListener("unhandledrejection", function (e) {
        var reason = e && e.reason;
        var msg = (reason && (reason.message || String(reason))) || "Unknown promise rejection";
        fatal("Payment library error: " + msg);
      });

      // ── Phase 1: load the Square SDK from CDN ──────────────────────────
      // Identical retry/timeout logic to the legacy sheet — proven in
      // production against slow CDN edge caches and 3G mobile signal.
      diag("sdk_load_start");
      var sdkLoaded = false;
      var sdkRetryCount = 0;
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
          if (myAttemptId !== currentAttemptId || sdkLoaded || fatalSent) return;
          if (sdkRetryCount === 0) {
            diag("sdk_load_timeout_retry", { retryCount: sdkRetryCount, attemptId: myAttemptId });
            sdkRetryCount = 1;
            loadSdkOnce(SDK_SRC + "?retry=" + Date.now());
          } else {
            fatal("Could not reach the payment service. Check your connection and try again.");
          }
        }, PHASE_TIMEOUT_MS);

        var s = document.createElement("script");
        s.src = srcUrl;
        s.async = true;
        s.onload = function () {
          if (myAttemptId !== currentAttemptId || sdkLoaded || fatalSent) return;
          sdkLoaded = true;
          clearTimeout(sdkLoadTimer);
          sdkLoadTimer = null;
          diag("sdk_loaded", { retryCount: sdkRetryCount, attemptId: myAttemptId });
          bootSquare();
        };
        s.onerror = function () {
          if (myAttemptId !== currentAttemptId || sdkLoaded || fatalSent) return;
          clearTimeout(sdkLoadTimer);
          sdkLoadTimer = null;
          if (sdkRetryCount === 0) {
            diag("sdk_load_error_retry", { retryCount: sdkRetryCount, attemptId: myAttemptId });
            sdkRetryCount = 1;
            loadSdkOnce(SDK_SRC + "?retry=" + Date.now());
          } else {
            fatal("Could not load the secure payment library. Check your connection and try again.");
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
          // Apple Pay's PassKit rejects tokenize with INVALID_CARD_DATA when
          // the total label has non-ASCII characters or runs over ~32 chars.
          // App Store Guideline 4.9 also requires the merchant name on the
          // sheet — must lead with "The 147 Bradford".
          var totalLabel;
          if (INTENT === "STORE" && RECURRING_DESC && RECURRING_DESC.length > 0) {
            var isAnnual = /year/i.test(RECURRING_DESC);
            totalLabel = isAnnual ? "The 147 Bradford (yearly)" : "The 147 Bradford (monthly)";
          } else {
            totalLabel = "The 147 Bradford";
          }
          return payments.paymentRequest({
            countryCode: "GB",
            currencyCode: CURRENCY,
            total: { amount: AMOUNT, label: totalLabel },
          });
        }

        function verifyAndSend(token) {
          // STORE intent runs verifyBuyer up front for SCA/3DS challenges.
          // CHARGE intent (orders) skips this — preserves existing behaviour.
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
              var msg = (err && err.message) || "";
              // Some cards do not require SCA — Square returns an error.
              // Forward without a verificationToken so the server can try.
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

        function tokenizeAndSend(paymentMethod, methodLabel) {
          var label = methodLabel || "Card";
          return paymentMethod.tokenize().then(function (result) {
            if (result.status === "OK") {
              verifyAndSend(result.token);
            } else {
              var first = (result.errors && result.errors[0]) || {};
              var code = first.code || "UNKNOWN";
              var category = first.category || "";
              var detail = first.detail || first.message || "Payment failed";
              var msg = label + ": " + detail + " [" + code + (category ? " · " + category : "") + "]";
              setStatus(msg);
              send({ type: "error", message: msg, code: code, category: category, method: label });
            }
          }).catch(function (err) {
            var msg = label + ": " + ((err && err.message) || "Tokenization failed");
            setStatus(msg);
            send({ type: "error", message: msg, method: label });
          });
        }

        // ── Phase 2: initialise the card form ────────────────────────────
        var cardReady = false;
        var card = null;
        var cardAttachTimer = setTimeout(function () {
          if (cardReady) return;
          fatal("The card form did not load in time. Close this and try again.");
        }, PHASE_TIMEOUT_MS);

        diag("card_attach_start");
        payments.card().then(function (c) {
          card = c;
          return c.attach("#card-container");
        }).then(function () {
          cardReady = true;
          clearTimeout(cardAttachTimer);
          diag("card_attached");
          if (fatalSent) return;
          send({ type: "ready" });
          scheduleReport();
        }).catch(function (err) {
          clearTimeout(cardAttachTimer);
          diag("card_attach_error", { reason: (err && err.message) ? String(err.message).slice(0, 200) : "unknown" });
          fatal("Could not load card form: " + (err && err.message ? err.message : "unknown error"));
        });

        // Expose a tokenize entry point for the native Pay button. The
        // native button calls this via injectJavaScript — keeps the
        // button's look-and-feel consistent with the rest of the app
        // while the actual SDK call still happens inside the WebView (a
        // hard PCI requirement).
        window.__sheet = {
          tokenizeCard: function () {
            if (!cardReady || !card) {
              setStatus("Please wait for the card form to load…");
              return;
            }
            setStatus("");
            tokenizeAndSend(card, "Card");
          },
        };

        // ── Apple Pay (iOS Safari/WKWebView only, requires verified domain).
        // Fully isolated — failure here MUST NOT affect the card form.
        try {
          var pr = paymentRequest();
          payments.applePay(pr).then(function (ap) {
            diag("apple_pay_ready");
            try {
              var el = document.getElementById("apple-pay-button");
              if (!el) return;
              el.innerHTML = "";
              el.removeAttribute("style");
              el.style.display = "block";
              el.style.height = "50px";
              el.style.borderRadius = "12px";
              el.style.overflow = "hidden";
              var btn = document.createElement("apple-pay-button");
              btn.setAttribute("buttonstyle", "black");
              btn.setAttribute("type", "buy");
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
                tokenizeAndSend(ap, "Apple Pay");
              });
              send({ type: "wallet_ready", method: "apple_pay" });
              scheduleReport();
            } catch (e) {}
          }).catch(function (err) {
            var reason = (err && err.message) ? String(err.message).slice(0, 200) : "unknown";
            diag("apple_pay_unavailable", { reason: reason });
            send({ type: "wallet_unavailable", method: "apple_pay", reason: reason });
          });
        } catch (e) {
          diag("apple_pay_throw", { reason: (e && e.message) ? String(e.message).slice(0, 200) : "unknown" });
        }

        // ── Google Pay — same isolation rule. ─────────────────────────────
        try {
          var pr2 = paymentRequest();
          payments.googlePay(pr2).then(function (gp) {
            return gp.attach("#google-pay-button", { buttonColor: "black", buttonType: "long" }).then(function () {
              diag("google_pay_ready");
              try {
                var el = document.getElementById("google-pay-button");
                if (!el) return;
                el.style.display = "block";
                var divider = document.getElementById("or-divider");
                if (divider) divider.style.display = "block";
                el.addEventListener("click", function () {
                  tokenizeAndSend(gp, "Google Pay");
                });
                send({ type: "wallet_ready", method: "google_pay" });
                scheduleReport();
              } catch (e) {}
            });
          }).catch(function (err) {
            var reason = (err && err.message) ? String(err.message).slice(0, 200) : "unknown";
            diag("google_pay_unavailable", { reason: reason });
            send({ type: "wallet_unavailable", method: "google_pay", reason: reason });
          });
        } catch (e) {
          diag("google_pay_throw", { reason: (e && e.message) ? String(e.message).slice(0, 200) : "unknown" });
        }
      } // end bootSquare
    })();
  </script>
</body>
</html>`;
}
