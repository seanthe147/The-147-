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
  // Square's card-entry iframe posts tokenisation requests to pci-connect.*
  // — a different host from the SDK CDN. Adding a preconnect hint here means
  // the TLS handshake completes in parallel with the SDK download instead of
  // being a serial cost the first time the customer hits Pay.
  const tokenizationOrigin =
    opts.environment === "production"
      ? "https://pci-connect.squareup.com"
      : "https://pci-connect.squareupsandbox.com";
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
    Resource hints — kick off DNS + TLS handshake to both Square origins as
    early as possible so the SDK download and the first tokenisation request
    are faster on slow venue Wi-Fi / mobile data. These hints are free on
    warm connections and never harmful — at worst the browser ignores them.
  -->
  <link rel="preconnect" href="${sdkSrc.replace(/\/v1\/square\.js$/, "")}" crossorigin />
  <link rel="preconnect" href="${tokenizationOrigin}" crossorigin />
  <link rel="preconnect" href="https://applepay.cdn-apple.com" crossorigin />
  <link rel="dns-prefetch" href="${sdkSrc.replace(/\/v1\/square\.js$/, "")}" />
  <link rel="dns-prefetch" href="${tokenizationOrigin}" />
  <link rel="preload" as="script" href="${sdkSrc}" crossorigin />
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
              // Including amount + currencyCode gives Square's 3DS engine the
              // transaction context for a frictionless risk assessment — fewer
              // customers see an explicit SCA challenge when saving their card.
              amount: AMOUNT,
              currencyCode: CURRENCY,
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
              diag("payment_tokenized", { method: label });
              verifyAndSend(result.token);
            } else if (result.status === "Cancel") {
              // User dismissed the payment sheet (e.g. closed Google Pay or
              // Apple Pay without completing it). Not an error — reset silently.
              diag("payment_cancelled", { method: label });
            } else {
              var first = (result.errors && result.errors[0]) || {};
              var code = first.code || "UNKNOWN";
              var category = first.category || "";
              // Map common Square error codes to plain-English messages so
              // customers know what to do without seeing raw API error codes.
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

        // ── Phase 2: initialise the card form ────────────────────────────
        var cardReady = false;
        var card = null;
        var cardAttachTimer = setTimeout(function () {
          if (cardReady) return;
          fatal("The card form did not load in time. Close this and try again.");
        }, PHASE_TIMEOUT_MS);

        diag("card_attach_start");
        // Pass card styling options so Square's hosted input fields match
        // the checkout screen's white card container and brand colours.
        // The container's own border is applied via CSS (#card-container),
        // so we set the inner input-container border to transparent to avoid
        // a double-border effect and only show focus/error borders.
        payments.card({
          style: {
            '.input-container': { borderColor: 'transparent' },
            '.input-container.is-focus': { borderColor: '#3B82F6' },
            '.input-container.is-error': { borderColor: '#DC2626' },
            '.message-text': { color: '#6B7280' },
            '.message-icon': { color: '#6B7280' },
            '.message-text.is-error': { color: '#DC2626' },
            '.message-icon.is-error': { color: '#DC2626' },
            input: {
              color: '#0A1628',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif',
              fontSize: '15px',
            },
            'input::placeholder': { color: '#9CA3AF' },
          },
        }).then(function (c) {
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
                diag("payment_started", { method: "apple_pay" });
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

        // ── Google Pay — custom button approach (no gp.attach) ───────────
        // Using a custom button and calling gp.tokenize() manually, exactly
        // like Apple Pay above. gp.attach() creates Square's button with its
        // own internal click handler, causing a tokenisation race on Android.
        try {
          var pr2 = paymentRequest();
          payments.googlePay(pr2).then(function (gp) {
            diag("google_pay_ready");
            try {
              var el = document.getElementById("google-pay-button");
              if (!el) return;
              el.innerHTML = "";
              el.style.display = "block";
              el.style.height = "50px";
              el.style.borderRadius = "12px";
              el.style.overflow = "hidden";
              // Custom Google Pay button styled to match official branding
              var btn = document.createElement("button");
              btn.type = "button";
              btn.setAttribute("aria-label", "Pay with Google Pay");
              btn.style.cssText = [
                "width:100%", "height:50px", "background:#000", "color:#fff",
                "border:0", "border-radius:12px", "font-size:15px", "font-weight:600",
                "cursor:pointer", "display:flex", "align-items:center",
                "justify-content:center", "gap:8px", "letter-spacing:0.01em",
                "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
                "box-sizing:border-box", "padding:0 16px",
              ].join(";");
              btn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg><span>Pay with Google Pay</span>';
              el.appendChild(btn);
              var divider = document.getElementById("or-divider");
              if (divider) divider.style.display = "block";
              btn.addEventListener("click", function () {
                diag("payment_started", { method: "google_pay" });
                tokenizeAndSend(gp, "Google Pay");
              });
              send({ type: "wallet_ready", method: "google_pay" });
              scheduleReport();
            } catch (e) {}
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
