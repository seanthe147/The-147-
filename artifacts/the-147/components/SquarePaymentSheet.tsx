import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Image,
  Platform,
} from "react-native";
import { WebView, type WebView as WebViewType } from "react-native-webview";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useColors } from "@/hooks/useColors";
import { buildPaymentSheetHtml } from "@/components/squarePaymentSheetHtml";
import { getApiUrl } from "@/lib/query-client";
import { useSquareGooglePay, type GooglePayNonceResult } from "@/hooks/useSquareGooglePay";
import {
  GOOGLE_PAY_BUTTON_CLEAR_SPACE,
  GOOGLE_PAY_NATIVE_BUTTON_HEIGHT,
  getGooglePayNativeButtonColors,
} from "@/lib/google-pay-branding";
import {
  googlePayDiagnosticCode,
  normalizeGooglePayError,
} from "@/lib/google-pay-errors";

export interface SquarePaymentSheetProps {
  visible: boolean;
  onClose: () => void;
  onTokenized: (payload: { sourceId: string; verificationToken?: string | null; saveCard?: boolean }) => void;
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
   * Pre-computed Google Pay availability from a parent-level useSquareGooglePay
   * call. When provided, the sheet skips its own async canUseGooglePay() check
   * (which would otherwise run AFTER the modal slide-in animation, causing the
   * button to appear late or not at all on Android).
   */
  googlePayAvailable?: boolean;
  /**
   * Pre-computed requestNonce function from a parent-level useSquareGooglePay
   * call. Paired with googlePayAvailable — both must be provided together.
   */
  googlePayRequestNonce?: (p: { amountPence: number; currency: string }) => Promise<GooglePayNonceResult>;
  /**
   * Square verifyBuyer intent. Defaults to "CHARGE" for one-off payments. Use
   * "STORE" when saving a card on file for recurring billing (memberships) so
   * SCA/3DS is performed up front and the verification token is forwarded.
   * Use "CHARGE_AND_STORE" (paired with `showSaveCard: true`) to render an
   * opt-in checkbox during checkout — when ticked, the sheet runs SCA up
   * front so the server can both charge the card AND save it for one-tap
   * reorder. (FEATURE_SAVED_CARDS)
   */
  intent?: "CHARGE" | "STORE" | "CHARGE_AND_STORE";
  /**
   * Optional recurring billing description shown to the user when this card
   * will be saved for a subscription (e.g. memberships). Pass something like
   * "/month — renews automatically until you cancel" so the customer
   * understands they are authorising a recurring charge, not a one-off
   * payment. Also changes the pay-button text from "Pay £X" to "Start
   * Membership" so it's clear what they're agreeing to.
   */
  recurringDescription?: string | null;
  /**
   * When true (and intent is "CHARGE_AND_STORE") render an opt-in
   * "Save card for one-tap reorder" checkbox below the pay button. The
   * checkbox state is reported back to the host via `saveCard` on the
   * tokenized payload. Defaults to false.
   */
  showSaveCard?: boolean;
}

type BridgeMessage =
  | { type: "token"; token: string; verificationToken?: string | null; saveCard?: boolean }
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
    // Use the same URL resolution as the rest of the app so diagnostics reach
    // the server in production builds where EXPO_PUBLIC_DOMAIN is not embedded
    // as a build-time env var. getApiUrl() reads EXPO_PUBLIC_DOMAIN at runtime
    // on native and uses window.location.origin on web.
    const base = getApiUrl().replace(/\/$/, "");
    const url = `${base}/api/public/payment-sheet-diagnostics`;
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
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors.scheme]);
  const nativeGooglePayColors = getGooglePayNativeButtonColors(colors.scheme);
  const nativeGooglePayAsset =
    colors.scheme === "dark"
      ? require("@/assets/google-pay/pay-button-white-pill-shape.png")
      : require("@/assets/google-pay/pay-button-dark-pill-shape.png");
  const insets = useSafeAreaInsets();
  const [internalError, setInternalError] = useState<string | null>(null);
  const [isGooglePayProcessing, setIsGooglePayProcessing] = useState(false);
  const webRef = useRef<WebViewType | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const googlePayRequestNumber = useRef(0);

  const hookResult = useSquareGooglePay({
    applicationId: props.applicationId,
    locationId: props.locationId,
    environment: props.environment,
  });

  // If the parent pre-computed Google Pay availability (order.tsx level), use
  // that directly — it was resolved before the modal animation started so the
  // button appears immediately. Fall back to the hook's own async result when
  // the pre-computed props are not provided (e.g. SquarePaymentSheet used
  // standalone outside the order flow).
  const canUseGooglePay =
    props.googlePayAvailable !== undefined
      ? props.googlePayAvailable
      : hookResult.canUseGooglePay;
  const requestNonce =
    props.googlePayRequestNonce !== undefined
      ? props.googlePayRequestNonce
      : hookResult.requestNonce;

  const handleGooglePay = useCallback(async () => {
    if (isGooglePayProcessing || props.inProgress) return;
    const requestId = `gpay-${++googlePayRequestNumber.current}`;
    const suffix = (value: string | null) => (value ? value.slice(-6) : null);
    postDiagnostic({
      phase: "google_pay_request_start",
      requestId,
      platform: Platform.OS,
      environment: props.environment,
      amountPence: props.amountPence,
      currency: props.currency || "GBP",
      priceStatus: 3,
      applicationIdSuffix: suffix(props.applicationId),
      locationIdSuffix: suffix(props.locationId),
      nativeModule: true,
    });
    setIsGooglePayProcessing(true);
    setInternalError(null);
    try {
      const result = await requestNonce({
        amountPence: props.amountPence,
        currency: props.currency || "GBP",
      });
      if (result.status === "ok") {
        props.onTokenized({ sourceId: result.nonce, verificationToken: result.verificationToken });
        postDiagnostic({
          phase: "google_pay_nonce_received",
          requestId,
          platform: Platform.OS,
          environment: props.environment,
          amountPence: props.amountPence,
          currency: props.currency || "GBP",
          verificationTokenReceived: !!result.verificationToken,
        });
      } else if (result.status === "failed") {
        // Surface the failure instead of silently returning to idle — the
        // user needs to know Google Pay didn't go through and that card
        // entry below still works.
        setInternalError(result.message);
        postDiagnostic({
          phase: "google_pay_error",
          requestId,
          reason: result.message,
          platform: Platform.OS,
          environment: props.environment,
          amountPence: props.amountPence,
          currency: props.currency || "GBP",
          errorCode: result.error.code,
          debugCode: result.error.debugCode,
          debugMessage: result.error.debugMessage,
          googlePayCode: googlePayDiagnosticCode(result.error),
        });
      } else {
        postDiagnostic({
          phase: "google_pay_cancelled",
          requestId,
          platform: Platform.OS,
          environment: props.environment,
          amountPence: props.amountPence,
          currency: props.currency || "GBP",
        });
      }
    } catch (e: any) {
      const error = normalizeGooglePayError(e);
      setInternalError(
        `${error.message} You can still pay by entering your card details below.`,
      );
      postDiagnostic({
        phase: "google_pay_error",
        requestId,
        reason: error.message,
        platform: Platform.OS,
        environment: props.environment,
        amountPence: props.amountPence,
        currency: props.currency || "GBP",
        errorCode: error.code,
        debugCode: error.debugCode,
        debugMessage: error.debugMessage,
        googlePayCode: googlePayDiagnosticCode(error),
      });
    } finally {
      setIsGooglePayProcessing(false);
    }
  }, [isGooglePayProcessing, props, requestNonce]);

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
      showSaveCard: !!props.showSaveCard,
      platform: Platform.OS,
      appearance: colors.scheme,
    });
  }, [props.applicationId, props.locationId, props.environment, props.amountPence, props.currency, props.intent, props.buyerEmail, props.recurringDescription, props.showSaveCard, colors.scheme]);

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
      props.onTokenized({
        sourceId: m.token,
        verificationToken: m.verificationToken ?? null,
        saveCard: !!m.saveCard,
      });
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
            <Ionicons name="close" size={22} color={colors.text} />
          </Pressable>
        </View>

        {canUseGooglePay && (
          <>
            <View style={styles.googlePaySection}>
              <Pressable
                onPress={handleGooglePay}
                disabled={isGooglePayProcessing || props.inProgress}
                testID="google-pay-button"
                accessibilityRole="button"
                accessibilityLabel="Google Pay"
                style={({ pressed }) => [
                  styles.googlePayButton,
                  { opacity: (pressed || isGooglePayProcessing || props.inProgress) ? 0.75 : 1 },
                ]}
              >
                {isGooglePayProcessing ? (
                  <ActivityIndicator color={nativeGooglePayColors.foregroundColor} size="small" />
                ) : (
                  <Image
                    source={nativeGooglePayAsset}
                    accessibilityLabel="Google Pay"
                    resizeMode="contain"
                    style={styles.googlePayAsset}
                  />
                )}
              </Pressable>
            </View>
            <View style={styles.orDivider}>
              <View style={styles.orLine} />
              <Text style={styles.orText}>OR ENTER CARD DETAILS</Text>
              <View style={styles.orLine} />
            </View>
          </>
        )}

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
            // Square SDK's card form iframe uses session cookies for
            // its internal communication channel. Without these flags
            // iOS WKWebView blocks the cross-origin cookies and the
            // attach() call silently fails.
            sharedCookiesEnabled={true}
            thirdPartyCookiesEnabled={true}
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
            // Intercept Android navigation requests before they leave the
            // WebView. When Google Pay's JS API can't open the native payment
            // sheet within the WebView (Payment Request API not available in
            // this context), Square's SDK falls back to an intent:// URL.
            // Without this handler Android WebView forwards that URL to
            // Chrome, which shows a confusing error page. Returning false
            // here cancels the navigation; Square's tokenize() promise then
            // rejects and our inline catch handler shows a friendly message
            // instead. All other URLs (3DS fingerprint iframes, Square CDN,
            // etc.) are allowed through.
            onShouldStartLoadWithRequest={(request) => {
              const url = request.url || "";
              if (
                url.startsWith("intent://") ||
                url.startsWith("googlepay://") ||
                url.startsWith("market://")
              ) {
                return false; // block — shows inline error instead of Chrome
              }
              return true;
            }}
            renderLoading={() => (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator color={Colors.brand.blue} />
              </View>
            )}
            style={{ flex: 1, backgroundColor: colors.background }}
          />
        )}

        {displayError ? (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle" size={18} color="#DC2626" />
            <Text style={styles.errorBannerText}>{displayError}</Text>
          </View>
        ) : null}

        {props.inProgress ? (
          <View style={[styles.processingOverlay, { pointerEvents: 'auto' }]}>
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

const createStyles = (colors: ReturnType<typeof useColors>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingHorizontal: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  headerLeft: { flexDirection: "row" as const, alignItems: "center" as const, gap: 8 },
  title: { fontSize: 17, fontWeight: "700" as const, color: colors.text },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceElevated,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  errorBox: { padding: 24, alignItems: "center" as const, gap: 10 },
  errorTitle: { fontSize: 16, fontWeight: "700" as const, color: colors.text },
  errorBody: { fontSize: 14, color: colors.textSecondary, textAlign: "center" as const, lineHeight: 20 },
  errorBanner: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    backgroundColor: "rgba(185,28,28,0.2)",
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.3)",
    paddingHorizontal: 14,
    paddingVertical: 10,
    margin: 12,
    borderRadius: 10,
  },
  errorBannerText: { color: "#F87171", fontSize: 13, flex: 1 },
  loadingOverlay: { ...StyleSheet.absoluteFill, alignItems: "center" as const, justifyContent: "center" as const, backgroundColor: colors.background },
  processingOverlay: { ...StyleSheet.absoluteFill, alignItems: "center" as const, justifyContent: "center" as const, backgroundColor: colors.overlay },
  processingCard: { padding: 22, borderRadius: 16, alignItems: "center" as const, gap: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, shadowColor: colors.cardShadow, shadowOpacity: 0.4, shadowRadius: 20, elevation: 8 },
  processingText: { fontSize: 14, color: colors.text, fontWeight: "600" as const },
  googlePaySection: {
    // Google requires at least 8 dp of clear space on every side of a
    // payment button. The horizontal 16 dp inset also keeps the button
    // aligned with the card form below it.
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: GOOGLE_PAY_BUTTON_CLEAR_SPACE,
  },
  googlePayButton: {
    height: GOOGLE_PAY_NATIVE_BUTTON_HEIGHT,
    borderRadius: 12,
    overflow: "hidden" as const,
    backgroundColor: "transparent",
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  googlePayAsset: {
    width: "100%",
    height: GOOGLE_PAY_NATIVE_BUTTON_HEIGHT,
  },
  orDivider: { flexDirection: "row" as const, alignItems: "center" as const, paddingHorizontal: 20, paddingVertical: 10, gap: 10 },
  orLine: { flex: 1, height: 1, backgroundColor: colors.border },
  orText: { fontSize: 10, fontWeight: "600" as const, color: colors.textSecondary, letterSpacing: 1.2 },
});
