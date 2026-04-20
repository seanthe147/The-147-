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
import { WebView } from "react-native-webview";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

export interface SquarePaymentSheetProps {
  visible: boolean;
  onClose: () => void;
  onTokenized: (payload: { sourceId: string; verificationToken?: string | null }) => void;
  applicationId: string | null;
  locationId: string | null;
  environment: "production" | "sandbox";
  amountPence: number;
  currency?: string; // defaults to GBP
  buyerEmail?: string | null;
  inProgress?: boolean; // parent is charging the token
  errorMessage?: string | null;
}

function formatPounds(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

function buildPaymentSheetHtml(opts: {
  applicationId: string;
  locationId: string;
  environment: "production" | "sandbox";
  amountPence: number;
  currency: string;
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
  <div class="total">Total <br/><b>£${amountStr}</b></div>

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
  </div>

  <div id="status"></div>

  <script src="${sdkSrc}"></script>
  <script>
    (function () {
      var APPLICATION_ID = ${JSON.stringify(opts.applicationId)};
      var LOCATION_ID = ${JSON.stringify(opts.locationId)};
      var AMOUNT = ${JSON.stringify(amountStr)};
      var CURRENCY = ${JSON.stringify(opts.currency)};

      function send(msg) {
        try {
          var s = JSON.stringify(msg);
          if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
            window.ReactNativeWebView.postMessage(s);
          } else if (window.parent && window.parent !== window) {
            // srcDoc iframe origin is "null"; restrict to the parent's origin only.
            window.parent.postMessage(s, window.location.origin || "*");
          }
        } catch (e) {}
      }

      function setStatus(t) { document.getElementById("status").textContent = t || ""; }
      function hideLoading() { var l = document.getElementById("loading"); if (l) l.style.display = "none"; }

      if (!window.Square) {
        hideLoading();
        setStatus("Could not load the payment library. Please try again.");
        send({ type: "error", message: "Square SDK failed to load" });
        return;
      }

      var payments;
      try {
        payments = window.Square.payments(APPLICATION_ID, LOCATION_ID);
      } catch (e) {
        hideLoading();
        setStatus("Payments are not configured: " + (e && e.message ? e.message : ""));
        send({ type: "error", message: "Square.payments init failed: " + (e && e.message) });
        return;
      }

      function paymentRequest() {
        return payments.paymentRequest({
          countryCode: "GB",
          currencyCode: CURRENCY,
          total: { amount: AMOUNT, label: "Total" },
        });
      }

      function tokenizeAndSend(paymentMethod) {
        return paymentMethod.tokenize().then(function (result) {
          if (result.status === "OK") {
            send({ type: "token", token: result.token });
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
        hideLoading();
        document.getElementById("pay-card-btn").addEventListener("click", function () {
          setStatus("");
          var btn = document.getElementById("pay-card-btn");
          btn.disabled = true;
          btn.textContent = "Processing…";
          tokenizeAndSend(card).finally(function () {
            btn.disabled = false;
            btn.textContent = "Pay £" + AMOUNT;
          });
        });
      }).catch(function (err) {
        hideLoading();
        setStatus("Could not load card form: " + (err && err.message ? err.message : ""));
        send({ type: "error", message: "Card init failed: " + (err && err.message) });
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
  const webRef = useRef<any>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const html = useMemo(() => {
    if (!props.applicationId || !props.locationId) return null;
    return buildPaymentSheetHtml({
      applicationId: props.applicationId,
      locationId: props.locationId,
      environment: props.environment,
      amountPence: props.amountPence,
      currency: props.currency || "GBP",
    });
  }, [props.applicationId, props.locationId, props.environment, props.amountPence, props.currency]);

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

  function handleMessage(msg: any) {
    if (!msg || typeof msg !== "object") return;
    if (msg.type === "token" && typeof msg.token === "string") {
      props.onTokenized({ sourceId: msg.token, verificationToken: msg.verificationToken ?? null });
    } else if (msg.type === "error" && typeof msg.message === "string") {
      setInternalError(msg.message);
    }
  }

  const displayError = props.errorMessage || internalError;

  return (
    <Modal
      visible={props.visible}
      animationType="slide"
      presentationStyle="pageSheet"
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
            style={{ flex: 1, border: "none", width: "100%", height: "100%" } as any}
            title="Payment"
          />
        ) : (
          <WebView
            ref={webRef}
            originWhitelist={["*"]}
            source={{ html, baseUrl: "https://the147.local/" }}
            onMessage={(e) => {
              try {
                handleMessage(JSON.parse(e.nativeEvent.data));
              } catch {}
            }}
            javaScriptEnabled
            domStorageEnabled
            startInLoadingState
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
