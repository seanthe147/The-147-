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
import { buildPaymentSheetHtml } from "@/components/squarePaymentSheetHtml";

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
  | { type: "fatal"; message: string }
  | ({ type: "diag"; phase: string } & Record<string, unknown>);

// Fire-and-forget POST of a WebView diagnostic event to the server. Never
// throws and never blocks the sheet — the sheet must continue to work even
// if the diagnostics endpoint is offline. Centralised here (rather than in
// the WebView's own JS) because the WebView's srcDoc origin is "null" and
// CORS / wallet-domain rules make in-WebView fetches fragile, whereas the
// React Native runtime has clean network access.
function postDiagnostic(payload: Record<string, unknown>) {
  try {
    const base = (process.env.EXPO_PUBLIC_API_URL as string | undefined)
      || (process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}` : "");
    if (!base) return;
    const url = `${base.replace(/\/$/, "")}/api/public/payment-sheet-diagnostics`;
    void fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      // Best-effort — never make the user wait on this.
      keepalive: true,
    }).catch(() => {});
  } catch {}
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
      // Forward as a fatal-phase diagnostic too. The WebView itself also
      // emits an explicit diag("fatal", …) right before the fatal, but
      // this belt-and-braces ensures we still capture the failure at the
      // server even if the inline diag emit is lost (e.g. the WebView is
      // torn down between the two postMessage calls).
      postDiagnostic({
        phase: "fatal",
        reason: m.message,
        platform: Platform.OS,
        environment: props.environment,
        baseUrl: typeof process !== "undefined" ? (process.env.EXPO_PUBLIC_DOMAIN || null) : null,
      });
      setInternalError(m.message);
      props.onUnavailable?.(m.message);
    } else if (msg.type === "diag" && typeof (msg as { phase?: unknown }).phase === "string") {
      // Plain diagnostic phase marker — forward to the server's diagnostics
      // endpoint and otherwise ignore. Augment with platform + environment
      // (only known here in the React Native layer, not in the WebView JS).
      const m = msg as Extract<BridgeMessage, { type: "diag" }>;
      const { type: _type, ...rest } = m;
      postDiagnostic({
        ...rest,
        platform: Platform.OS,
        environment: props.environment,
        baseUrl: typeof process !== "undefined" ? (process.env.EXPO_PUBLIC_DOMAIN || null) : null,
      });
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
            // is fully verified. The prop isn't in react-native-webview's
            // public TS types but is accepted by the iOS native module.
            {...({ applePayEnabled: true } as any)}
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
