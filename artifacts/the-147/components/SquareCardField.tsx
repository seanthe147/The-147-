import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, StyleSheet, ActivityIndicator, Platform, Text } from "react-native";
import { WebView, type WebView as WebViewType } from "react-native-webview";
import Colors from "@/constants/colors";
import { buildCardFieldHtml } from "@/components/squareCardFieldHtml";

export interface SquareCardFieldHandle {
  /** Trigger card.tokenize() inside the WebView. Native Pay button calls this. */
  tokenizeCard: () => void;
}

export interface SquareCardFieldProps {
  applicationId: string | null;
  locationId: string | null;
  environment: "production" | "sandbox";
  amountPence: number;
  currency?: string;
  buyerEmail?: string | null;
  intent?: "CHARGE" | "STORE";
  recurringDescription?: string | null;
  /** Card form has attached and is ready to tokenize */
  onReady?: () => void;
  /** Tokenize succeeded */
  onTokenized: (payload: { sourceId: string; verificationToken?: string | null }) => void;
  /** Recoverable error — show inline, keep form mounted so user can retry */
  onError?: (message: string) => void;
  /** Unrecoverable failure (SDK couldn't load or card form couldn't attach) */
  onUnavailable?: (reason: string) => void;
  /** Wallet button availability events */
  onWalletReady?: (method: "apple_pay" | "google_pay") => void;
  onWalletUnavailable?: (method: "apple_pay" | "google_pay", reason: string) => void;
}

type BridgeMessage =
  | { type: "ready" }
  | { type: "resize"; height: number }
  | { type: "wallet_ready"; method: "apple_pay" | "google_pay" }
  | { type: "wallet_unavailable"; method: "apple_pay" | "google_pay"; reason: string }
  | { type: "token"; token: string; verificationToken?: string | null }
  | { type: "error"; message: string }
  | { type: "fatal"; message: string }
  | ({ type: "diag"; phase: string } & Record<string, unknown>);

// Fire-and-forget POST of a WebView diagnostic event to the server. Centralised
// here (not inside the WebView) because srcDoc origin is "null" and CORS makes
// in-WebView fetches fragile.
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
      keepalive: true,
    }).catch(() => {});
  } catch {}
}

export const SquareCardField = React.forwardRef<SquareCardFieldHandle, SquareCardFieldProps>(
  function SquareCardField(props, ref) {
    const webRef = useRef<WebViewType | null>(null);
    const iframeRef = useRef<HTMLIFrameElement | null>(null);
    const [contentHeight, setContentHeight] = useState(220);
    const [ready, setReady] = useState(false);

    const html = useMemo(() => {
      if (!props.applicationId || !props.locationId) return null;
      return buildCardFieldHtml({
        applicationId: props.applicationId,
        locationId: props.locationId,
        environment: props.environment,
        amountPence: props.amountPence,
        currency: props.currency || "GBP",
        intent: props.intent || "CHARGE",
        buyerEmail: props.buyerEmail || null,
        recurringDescription: props.recurringDescription || null,
      });
      // Amount is baked into the HTML for the wallet payment request — so
      // any amount change forces a remount, which is correct behaviour.
    }, [props.applicationId, props.locationId, props.environment, props.amountPence, props.currency, props.intent, props.buyerEmail, props.recurringDescription]);

    React.useImperativeHandle(ref, () => ({
      tokenizeCard: () => {
        if (!ready) return;
        const js = "try { window.__sheet && window.__sheet.tokenizeCard(); } catch(e){}; true;";
        if (Platform.OS === "web") {
          try {
            iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ type: "tokenize_card" }), "*");
            // Web fallback: directly invoke since the iframe shares JS realm only via postMessage
            // We do both — the HTML doesn't currently listen for tokenize_card messages, so we also
            // try a direct eval through iframe (will throw silently if cross-origin, fine).
            (iframeRef.current?.contentWindow as any)?.__sheet?.tokenizeCard?.();
          } catch {}
        } else {
          webRef.current?.injectJavaScript(js);
        }
      },
    }), [ready]);

    function handleMessage(raw: unknown) {
      if (!raw || typeof raw !== "object") return;
      const msg = raw as Partial<BridgeMessage> & { type?: string };
      if (msg.type === "ready") {
        setReady(true);
        props.onReady?.();
      } else if (msg.type === "resize" && typeof (msg as { height?: unknown }).height === "number") {
        const h = (msg as Extract<BridgeMessage, { type: "resize" }>).height;
        // Clamp so a runaway measurement can't crash layout
        if (h > 100 && h < 2000) setContentHeight(h);
      } else if (msg.type === "wallet_ready" && (msg as any).method) {
        props.onWalletReady?.((msg as any).method);
      } else if (msg.type === "wallet_unavailable" && (msg as any).method) {
        props.onWalletUnavailable?.((msg as any).method, String((msg as any).reason || ""));
      } else if (msg.type === "token" && typeof (msg as { token?: unknown }).token === "string") {
        const m = msg as Extract<BridgeMessage, { type: "token" }>;
        props.onTokenized({ sourceId: m.token, verificationToken: m.verificationToken ?? null });
      } else if (msg.type === "error" && typeof (msg as { message?: unknown }).message === "string") {
        const m = msg as Extract<BridgeMessage, { type: "error" }>;
        props.onError?.(m.message);
      } else if (msg.type === "fatal" && typeof (msg as { message?: unknown }).message === "string") {
        const m = msg as Extract<BridgeMessage, { type: "fatal" }>;
        postDiagnostic({
          phase: "fatal",
          reason: m.message,
          platform: Platform.OS,
          environment: props.environment,
          baseUrl: typeof process !== "undefined" ? (process.env.EXPO_PUBLIC_DOMAIN || null) : null,
        });
        props.onUnavailable?.(m.message);
      } else if (msg.type === "diag" && typeof (msg as { phase?: unknown }).phase === "string") {
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

    // Web: receive postMessage from the iframe
    useEffect(() => {
      if (Platform.OS !== "web") return;
      function onMsg(e: MessageEvent) {
        if (typeof e.data !== "string") return;
        const expected = iframeRef.current?.contentWindow;
        if (!expected || e.source !== expected) return;
        try { handleMessage(JSON.parse(e.data)); } catch {}
      }
      window.addEventListener("message", onMsg);
      return () => window.removeEventListener("message", onMsg);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (!html) {
      return (
        <View style={styles.errorBox}>
          <Text style={styles.errorTitle}>Payments unavailable</Text>
          <Text style={styles.errorBody}>
            The payment system is not configured. Please try again later or order at the bar.
          </Text>
        </View>
      );
    }

    return (
      <View style={[styles.container, { height: contentHeight }]}>
        {!ready && (
          <View style={[styles.loadingOverlay, { pointerEvents: 'none' }]}>
            <ActivityIndicator color={Colors.brand.blue} />
            <Text style={styles.loadingText}>Loading secure card form…</Text>
          </View>
        )}
        {Platform.OS === "web" ? (
          <iframe
            ref={iframeRef}
            srcDoc={html}
            style={{ flex: 1, border: "none", width: "100%", height: "100%", background: "transparent" } as React.CSSProperties}
            title="Payment"
          />
        ) : (
          <WebView
            ref={webRef}
            originWhitelist={["*"]}
            source={{
              html,
              // Apple/Google Pay inside the WebView require the document
              // origin to match a domain registered with Square for wallet
              // payments. EXPO_PUBLIC_DOMAIN is set per build env (eas.json).
              baseUrl: `https://${process.env.EXPO_PUBLIC_DOMAIN || "the147bradford.replit.app"}/`,
            }}
            onMessage={(e) => {
              try { handleMessage(JSON.parse(e.nativeEvent.data)); } catch {}
            }}
            javaScriptEnabled
            domStorageEnabled
            // iOS WKWebView gates window.ApplePaySession behind this prop.
            // Without it, Square's applePay() rejects silently with
            // "unsupported on this device" even on a verified domain.
            {...({ applePayEnabled: true } as any)}
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            // Disable internal scrolling — parent screen scrolls instead.
            scrollEnabled={false}
            showsVerticalScrollIndicator={false}
            style={{ flex: 1, backgroundColor: "transparent" }}
            // Crucial for transparent backgrounds on iOS
            // (default background is opaque white).
            // @ts-ignore - prop exists on iOS native module
            opaque={false}
            // Avoid black flash on Android during initial load
            androidLayerType="hardware"
          />
        )}
      </View>
    );
  }
);

const styles = StyleSheet.create({
  container: {
    width: "100%",
    backgroundColor: "transparent",
    position: "relative" as const,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 10,
    zIndex: 1,
  },
  loadingText: { fontSize: 13, color: "#6B7280" },
  errorBox: { padding: 24, alignItems: "center" as const, gap: 10 },
  errorTitle: { fontSize: 16, fontWeight: "700" as const, color: "#0A1628" },
  errorBody: { fontSize: 14, color: "#6B7280", textAlign: "center" as const, lineHeight: 20 },
});
