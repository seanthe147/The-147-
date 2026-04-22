import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Platform,
} from "react-native";
import { WebView, type WebView as WebViewType } from "react-native-webview";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

export interface SquarePaymentSheetProps {
  visible: boolean;
  onClose: () => void;
  onTokenized: (payload: { sourceId: string; verificationToken?: string | null }) => void;
  /** Called if the SDK fails to load/init so the caller can fall back to hosted checkout. */
  onUnavailable?: (reason: string) => void;
  applicationId: string | null;
  locationId: string | null;
  environment: "production" | "sandbox";
  amountPence: number;
  currency?: string; // defaults to GBP
  buyerEmail?: string | null;
  inProgress?: boolean; // parent is charging the token
  errorMessage?: string | null;
  /**
   * Square verifyBuyer intent. Defaults to "CHARGE" for one-off payments. Use
   * "STORE" when saving a card on file for recurring billing (memberships) so
   * SCA/3DS is performed up front and the verification token is forwarded.
   */
  intent?: "CHARGE" | "STORE";
  /**
   * Optional recurring billing description shown to the user when this card
   * will be saved for a subscription (e.g. memberships). Pass something like
   * "/month — renews automatically until you cancel" so the customer
   * understands they are authorising a recurring charge, not a one-off
   * payment. Also changes the pay-button text from "Pay £X" to "Start
   * Membership" so it's clear what they're agreeing to.
   */
  recurringDescription?: string | null;
}

type BridgeMessage =
  | { type: "token"; token: string; verificationToken?: string | null }
  | { type: "error"; message: string }
  | { type: "fatal"; message: string };

function formatPounds(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

function buildPaymentSheetHtml(opts: {
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

  <div id="card-section" style="display:none">
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

  <script src="${sdkSrc}"></script>
  <script>
    (function () {
      var APPLICATION_ID = ${JSON.stringify(opts.applicationId)};
      var LOCATION_ID = ${JSON.stringify(opts.locationId)};
      var AMOUNT = ${JSON.stringify(amountStr)};
      var CURRENCY = ${JSON.stringify(opts.currency)};
      var INTENT = ${JSON.stringify(opts.intent || "CHARGE")};
      var BUYER_EMAIL = ${JSON.stringify(opts.buyerEmail || "")};
      var RECURRING_DESC = ${JSON.stringify(opts.recurringDescription || "")};
      var IS_SUBSCRIPTION = INTENT === "STORE" && RECURRING_DESC.length > 0;
      var PAY_LABEL = IS_SUBSCRIPTION
        ? "Start Membership · £" + AMOUNT
        : "Pay £" + AMOUNT;

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

      function setStatus(t) { document.getElementById("status").textContent = t || ""; }
      function hideLoading() { var l = document.getElementById("loading"); if (l) l.style.display = "none"; }

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
          var freq = RECURRING_DESC.replace(/^\s*\/\s*/, "per ").replace(/—.*$/, "").trim();
          noticeEl.textContent = "By continuing, you authorise The 147 to charge this card £" + AMOUNT + " " + freq + ", until you cancel your membership.";
          noticeEl.style.display = "block";
        }
      }

      if (!window.Square) {
        hideLoading();
        setStatus("Could not load the payment library. Please try again.");
        send({ type: "fatal", message: "Square SDK failed to load" });
        return;
      }

      var payments;
      try {
        payments = window.Square.payments(APPLICATION_ID, LOCATION_ID);
      } catch (e) {
        hideLoading();
        setStatus("Payments are not configured: " + (e && e.message ? e.message : ""));
        send({ type: "fatal", message: "Square.payments init failed: " + (e && e.message) });
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
            if (/not\s+required|no\s+challenge|UNSUPPORTED/i.test(msg)) {
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

      // Card form
      var card;
      payments.card().then(function (c) {
        card = c;
        return c.attach("#card-container");
      }).then(function () {
        document.getElementById("card-section").style.display = "block";
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
        hideLoading();
        setStatus("Could not load card form: " + (err && err.message ? err.message : ""));
        send({ type: "fatal", message: "Card init failed: " + (err && err.message) });
      });

      // Apple Pay (iOS Safari/WebKit only, requires verified domain)
      try {
        var pr = paymentRequest();
        payments.applePay(pr).then(function (ap) {
          var el = document.getElementById("apple-pay-button");
          el.style.display = "block";
          el.style.background = "#000";
          el.style.color = "#fff";
          el.style.textAlign = "center";
          el.style.lineHeight = "48px";
          el.style.fontWeight = "600";
          el.textContent = " Apple Pay";
          document.getElementById("or-divider").style.display = "block";
          el.addEventListener("click", function () {
            tokenizeAndSend(ap);
          });
        }).catch(function () { /* unsupported on this device */ });
      } catch (e) {}

      // Google Pay
      try {
        var pr2 = paymentRequest();
        payments.googlePay(pr2).then(function (gp) {
          return gp.attach("#google-pay-button", { buttonColor: "black", buttonType: "long" }).then(function () {
            var el = document.getElementById("google-pay-button");
            el.style.display = "block";
            document.getElementById("or-divider").style.display = "block";
            el.addEventListener("click", function () {
              tokenizeAndSend(gp);
            });
          });
        }).catch(function () { /* unsupported */ });
      } catch (e) {}
    })();
  </script>
</body>
</html>`;
}

export function SquarePaymentSheet(props: SquarePaymentSheetProps) {
  const insets = useSafeAreaInsets();
  const [internalError, setInternalError] = useState<string | null>(null);
  const webRef = useRef<WebViewType | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const html = useMemo(() => {
    if (!props.applicationId || !props.locationId) return null;
    return buildPaymentSheetHtml({
      applicationId: props.applicationId,
      locationId: props.locationId,
      environment: props.environment,
      amountPence: props.amountPence,
      currency: props.currency || "GBP",
      intent: props.intent || "CHARGE",
      buyerEmail: props.buyerEmail || null,
      recurringDescription: props.recurringDescription || null,
    });
  }, [props.applicationId, props.locationId, props.environment, props.amountPence, props.currency, props.intent, props.buyerEmail, props.recurringDescription]);

  // Reset error when the sheet is reopened
  useEffect(() => {
    if (props.visible) setInternalError(null);
  }, [props.visible]);

  // Web: receive postMessage from the iframe
  useEffect(() => {
    if (Platform.OS !== "web" || !props.visible) return;
    function onMsg(e: MessageEvent) {
      // Only accept strings sent from our exact iframe element. srcDoc iframes
      // have origin "null" so we cannot match origin alone — match the source.
      if (typeof e.data !== "string") return;
      const expectedSource = iframeRef.current?.contentWindow;
      if (!expectedSource || e.source !== expectedSource) return;
      try {
        const msg = JSON.parse(e.data);
        handleMessage(msg);
      } catch {}
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.visible, props.onTokenized]);

  function handleMessage(raw: unknown) {
    if (!raw || typeof raw !== "object") return;
    const msg = raw as Partial<BridgeMessage> & { type?: string };
    if (msg.type === "token" && typeof (msg as { token?: unknown }).token === "string") {
      const m = msg as Extract<BridgeMessage, { type: "token" }>;
      props.onTokenized({ sourceId: m.token, verificationToken: m.verificationToken ?? null });
    } else if (msg.type === "error" && typeof (msg as { message?: unknown }).message === "string") {
      setInternalError((msg as Extract<BridgeMessage, { type: "error" }>).message);
    } else if (msg.type === "fatal" && typeof (msg as { message?: unknown }).message === "string") {
      const m = msg as Extract<BridgeMessage, { type: "fatal" }>;
      setInternalError(m.message);
      props.onUnavailable?.(m.message);
    }
  }

  const displayError = props.errorMessage || internalError;
  const iframeStyle: React.CSSProperties = {
    flex: 1,
    border: "none",
    width: "100%",
    height: "100%",
  };

  return (
    <Modal
      visible={props.visible}
      animationType="slide"
      // IMPORTANT: must NOT be "pageSheet". The order screen is itself a
      // pageSheet modal, and iOS silently refuses to present a second
      // pageSheet on top of an existing one — the result is that the user
      // taps Place Order, the order gets created on the server, but no
      // payment UI ever appears. fullScreen stacks correctly.
      presentationStyle="fullScreen"
      onRequestClose={props.onClose}
      transparent={false}
    >
      <View style={[styles.container, { paddingBottom: insets.bottom }]}>
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <View style={styles.headerLeft}>
            <Ionicons name="lock-closed" size={16} color={Colors.brand.blue} />
            <Text style={styles.title}>Secure Payment</Text>
          </View>
          <Pressable
            onPress={props.onClose}
            hitSlop={12}
            disabled={props.inProgress}
            style={({ pressed }) => [
              styles.closeBtn,
              { opacity: pressed || props.inProgress ? 0.5 : 1 },
            ]}
          >
            <Ionicons name="close" size={22} color={Colors.light.text} />
          </Pressable>
        </View>

        {!html ? (
          <View style={styles.errorBox}>
            <Ionicons name="warning-outline" size={28} color="#DC2626" />
            <Text style={styles.errorTitle}>Payments unavailable</Text>
            <Text style={styles.errorBody}>The payment system is not configured. Please try again later or order at the bar.</Text>
          </View>
        ) : Platform.OS === "web" ? (
          <iframe
            ref={iframeRef}
            srcDoc={html}
            style={iframeStyle}
            title="Payment"
          />
        ) : (
          <WebView
            ref={webRef}
            originWhitelist={["*"]}
            source={{
              html,
              // Apple Pay / Google Pay inside the WebView require the document
              // origin to match a domain that's been registered with Square
              // for wallet payments. EXPO_PUBLIC_DOMAIN is set per build env
              // (see eas.json) and points at the production server that
              // hosts /.well-known/apple-developer-merchantid-domain-association.
              baseUrl: `https://${process.env.EXPO_PUBLIC_DOMAIN || "the147bradford.replit.app"}/`,
            }}
            onMessage={(e) => {
              try {
                handleMessage(JSON.parse(e.nativeEvent.data));
              } catch {}
            }}
            javaScriptEnabled
            domStorageEnabled
            startInLoadingState
            // iOS WKWebView disables Apple Pay JS APIs (window.ApplePaySession)
            // by default. Without this prop, Square's payments.applePay()
            // promise rejects silently with "unsupported on this device" and
            // the button never appears, even when Square's domain registration
            // is fully verified.
            applePayEnabled
            // Allow the wallet sheets to appear over the WebView without being
            // clipped by inline media playback constraints.
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            renderLoading={() => (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator color={Colors.brand.blue} />
              </View>
            )}
            style={{ flex: 1, backgroundColor: "#fff" }}
          />
        )}

        {displayError ? (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle" size={18} color="#DC2626" />
            <Text style={styles.errorBannerText}>{displayError}</Text>
          </View>
        ) : null}

        {props.inProgress ? (
          <View style={styles.processingOverlay} pointerEvents="auto">
            <View style={styles.processingCard}>
              <ActivityIndicator color={Colors.brand.blue} size="large" />
              <Text style={styles.processingText}>Authorising your payment…</Text>
            </View>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  header: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingHorizontal: 18,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
    backgroundColor: "#fff",
  },
  headerLeft: { flexDirection: "row" as const, alignItems: "center" as const, gap: 8 },
  title: { fontSize: 17, fontWeight: "700" as const, color: Colors.light.text },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F3F4F6",
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  errorBox: { padding: 24, alignItems: "center" as const, gap: 10 },
  errorTitle: { fontSize: 16, fontWeight: "700" as const, color: "#0A1628" },
  errorBody: { fontSize: 14, color: "#6B7280", textAlign: "center" as const, lineHeight: 20 },
  errorBanner: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    backgroundColor: "#FEE2E2",
    paddingHorizontal: 14,
    paddingVertical: 10,
    margin: 12,
    borderRadius: 10,
  },
  errorBannerText: { color: "#991B1B", fontSize: 13, flex: 1 },
  loadingOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center" as const, justifyContent: "center" as const, backgroundColor: "#fff" },
  processingOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center" as const, justifyContent: "center" as const, backgroundColor: "rgba(255,255,255,0.85)" },
  processingCard: { padding: 22, borderRadius: 16, alignItems: "center" as const, gap: 10, backgroundColor: "#fff", shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 12, elevation: 4 },
  processingText: { fontSize: 14, color: "#374151", fontWeight: "600" as const },
});
