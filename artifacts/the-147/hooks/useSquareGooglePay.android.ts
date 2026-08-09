import { useEffect, useRef, useState, useCallback } from "react";

// Dynamic require with try/catch — TurboModuleRegistry.getEnforcing throws in
// Expo Go because the native SQIPGooglePay module is only available in a full
// EAS build. Catching here lets the app run normally in Expo Go (canUseGooglePay
// stays false) and enables Google Pay in production builds transparently.
let SQIPCore: any = null;
let SQIPGooglePay: any = null;
let SQIPCardEntry: any = null;
let SQIPBuyer: any = null;
let GooglePayEnvironment: Record<string, any> = {};
let GooglePayPriceStatus: Record<string, any> = {};

try {
  const sq = require("react-native-square-in-app-payments");
  SQIPCore = sq.SQIPCore ?? null;
  SQIPGooglePay = sq.SQIPGooglePay ?? null;
  SQIPCardEntry = sq.SQIPCardEntry ?? null;
  SQIPBuyer = sq.SQIPBuyer ?? null;
  GooglePayEnvironment = sq.GooglePayEnvironment ?? {};
  GooglePayPriceStatus = sq.GooglePayPriceStatus ?? {};
} catch {
  // Native module unavailable (Expo Go) — Google Pay will be disabled
}

export type GooglePayNonceResult =
  | { status: "ok"; nonce: string; verificationToken: string | null }
  | { status: "cancelled" }
  | { status: "failed"; message: string };

function errMessage(details: any): string {
  return (
    details?.message ||
    details?.debugMessage ||
    details?.code ||
    "Google Pay could not complete."
  );
}

export function useSquareGooglePay(opts: {
  applicationId: string | null;
  locationId: string | null;
  environment: "production" | "sandbox";
  buyerEmail?: string | null;
  buyerName?: string | null;
}): {
  canUseGooglePay: boolean;
  requestNonce: (p: { amountPence: number; currency: string }) => Promise<GooglePayNonceResult>;
} {
  const [canUseGooglePay, setCanUseGooglePay] = useState(false);
  const initialized = useRef(false);
  const locationIdRef = useRef<string | null>(null);
  locationIdRef.current = opts.locationId;
  const buyerRef = useRef<{ email?: string | null; name?: string | null }>({});
  buyerRef.current = { email: opts.buyerEmail, name: opts.buyerName };

  useEffect(() => {
    if (!SQIPCore || !SQIPGooglePay) return;
    if (!opts.applicationId || !opts.locationId) return;
    if (initialized.current) return;
    initialized.current = true;

    try {
      SQIPCore.setSquareApplicationId(opts.applicationId);
      const envType =
        opts.environment === "production"
          ? GooglePayEnvironment.EnvironmentProduction
          : GooglePayEnvironment.EnvironmentTest;
      SQIPGooglePay.initializeGooglePay(opts.locationId, envType);
      SQIPGooglePay.canUseGooglePay()
        .then((can: boolean) => setCanUseGooglePay(can))
        .catch(() => setCanUseGooglePay(false));
    } catch {
      setCanUseGooglePay(false);
    }
  }, [opts.applicationId, opts.locationId, opts.environment]);

  // Step 2 of the flow: run Square buyer verification (SCA/3DS) on the Google
  // Pay nonce. Without this, banks that require Strong Customer Authentication
  // (common in the UK) decline the payment — the reported "some Android users
  // still can't pay with Google Pay" failure mode. Falls back to the bare
  // nonce (previous behaviour) when the verification module is unavailable.
  const verifyBuyer = useCallback(
    (nonce: string, amountPence: number, currency: string): Promise<GooglePayNonceResult> => {
      const start =
        SQIPBuyer?.startBuyerVerificationFlow ?? SQIPCardEntry?.startBuyerVerificationFlow ?? null;
      const locationId = locationIdRef.current;
      if (!start || !locationId) {
        return Promise.resolve({ status: "ok", nonce, verificationToken: null });
      }
      return new Promise<GooglePayNonceResult>((resolve) => {
        let settled = false;
        const settle = (r: GooglePayNonceResult) => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            resolve(r);
          }
        };
        // Safety net: never leave the payment button spinning forever if the
        // native verification flow stalls.
        const timer = setTimeout(
          () =>
            settle({
              status: "failed",
              message: "Payment verification timed out. Please try card details instead.",
            }),
          90_000,
        );
        const rawName = (buyerRef.current.name || "").trim();
        const [givenName, ...rest] = rawName.split(/\s+/);
        const config: Record<string, unknown> = {
          squareLocationId: locationId,
          buyerAction: "Charge",
          amount: amountPence,
          currencyCode: currency,
          givenName: givenName || "Customer",
          familyName: rest.join(" ") || undefined,
          email: buyerRef.current.email || undefined,
          countryCode: "GB",
        };
        try {
          const maybePromise = start(
            nonce,
            config,
            (result: any) => {
              const token = result?.token ?? result?.verificationToken ?? null;
              const verifiedNonce = result?.nonce ?? nonce;
              settle({ status: "ok", nonce: verifiedNonce, verificationToken: token });
            },
            (details: any) => {
              settle({
                status: "failed",
                message: `Your bank could not verify this payment. ${errMessage(details)}`,
              });
            },
            () => settle({ status: "cancelled" }),
          );
          if (maybePromise && typeof maybePromise.catch === "function") {
            maybePromise.catch(() =>
              // Verification flow could not even start (e.g. older SDK) —
              // degrade to the bare nonce, matching previous behaviour.
              settle({ status: "ok", nonce, verificationToken: null }),
            );
          }
        } catch {
          settle({ status: "ok", nonce, verificationToken: null });
        }
      });
    },
    [],
  );

  const requestNonce = useCallback(
    async (params: { amountPence: number; currency: string }): Promise<GooglePayNonceResult> => {
      if (!SQIPGooglePay) {
        return { status: "failed", message: "Google Pay is not available on this device." };
      }
      const price = (params.amountPence / 100).toFixed(2);
      const nonceResult = await new Promise<GooglePayNonceResult>((resolve) => {
        try {
          SQIPGooglePay.requestGooglePayNonce(
            {
              price,
              currencyCode: params.currency,
              priceStatus: GooglePayPriceStatus.TotalPriceStatusFinal ?? 3,
            },
            (cardDetails: any) => {
              const nonce = cardDetails?.nonce ?? null;
              if (nonce) resolve({ status: "ok", nonce, verificationToken: null });
              else resolve({ status: "failed", message: "Google Pay returned no payment token." });
            },
            (errorDetails: any) => resolve({ status: "failed", message: errMessage(errorDetails) }),
            () => resolve({ status: "cancelled" }),
          ).catch((e: any) => resolve({ status: "failed", message: errMessage(e) }));
        } catch (e: any) {
          resolve({ status: "failed", message: errMessage(e) });
        }
      });
      if (nonceResult.status !== "ok") return nonceResult;
      return verifyBuyer(nonceResult.nonce, params.amountPence, params.currency);
    },
    [verifyBuyer],
  );

  return { canUseGooglePay, requestNonce };
}
