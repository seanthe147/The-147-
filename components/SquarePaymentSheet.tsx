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
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #ffffff; color: #0A1628; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; }
    body { padding: 20px 18px 28px; min-height: 100vh; }
    .total { font-size: 14px; color: #6B7280; margin-bottom: 4px; }
    .total b { color: #0A1628; font-size: 22px; font-weight: 700; }
    .wallets { display: flex; flex-direction: column; gap: 10px; margin: 14px 0; }
    #apple-pay-button { display: none; height: 48px; border-radius: 10px; }
    #google-pay-button { display: none; height: 48px; border-radius: 10px; }
    .or { text-align: center; color: #9CA3AF; font-size: 12px; letter-spacing: 1px; margin: 14px 0 8px; }
    .label { font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 8px; }
    #card-container { min-height: 90px; }
    #pay-card-btn {
      width: 100%; margin-top: 14px; padding: 14px; border: none; border-radius: 12px;
      background: #0047AB; color: white; font-size: 16px; font-weight: 700; cursor: pointer;
    }
    #pay-card-btn:disabled { opacity: 0.6; cursor: default; }
    #status { margin-top: 10px; font-size: 13px; color: #DC2626; min-height: 16px; }
    #loading { display: flex; align-items: center; gap: 8px; color: #6B7280; font-size: 13px; padding: 16px 0; }
    .spinner { width: 14px; height: 14px; border: 2px solid #E5E7EB; border-top-color: #0047AB; border-radius: 50%; animation: spin 0.8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="total" id="total-line">Total <br/><b>£${amountStr}</b></div>
  <div id="recurring-notice" style="display:none;background:#FEF3C7;border:1px solid #FCD34D;color:#78350F;font-size:12px;line-height:1.5;border-radius:8px;padding:10px 12px;margin:10px 0 4px;font-weight:500"></div>

  <div id="loading"><div class="spinner"></div> Loading payment options…</div>

  <div class="wallets">
    <div id="apple-pay-button"></div>
    <div id="google-pay-button"></div>
  </div>

  <div class="or" id="or-divider" style="display:none">OR PAY BY CARD</div>

  <div id="card-section" style="display:none">
    <div class="label">Card details</div>
    <div id="card-container"></div>
    <button id="pay-card-btn" type="button">Pay £${amountStr}</button>
    <div id="recurring-fineprint" style="display:none;font-size:11px;color:#6B7280;line-height:1.5;margin-top:8px;text-align:center"></div>
  </div>

  <div id="status"></div>

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
        var totalEl = document.getElementById("total-line");
        if (totalEl) totalEl.innerHTML = "Membership <br/><b>£" + AMOUNT + "</b>" + RECURRING_DESC;
        var noticeEl = document.getElementById("recurring-notice");
        if (noticeEl) {
          noticeEl.textContent = "By continuing, you authorise The 147 to charge this card £" + AMOUNT + " " + RECURRING_DESC.replace(/^\s*\/\s*/, "per ").replace(/—.*$/, "").trim() + ", until you cancel your membership.";
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
        return payments.paymentRequest({
          countryCode: "GB",
          currencyCode: CURRENCY,
          total: { amount: AMOUNT, label: "Total" },
        });
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
        <View style={styles.header}>
          <Text style={styles.title}>Secure Payment</Text>
          <Pressable onPress={props.onClose} hitSlop={12} disabled={props.inProgress} style={({ pressed }) => ({ opacity: pressed || props.inProgress ? 0.5 : 1 })}>
            <Ionicons name="close" size={24} color={Colors.light.text} />
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
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  title: { fontSize: 17, fontWeight: "700" as const, color: Colors.light.text },
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
