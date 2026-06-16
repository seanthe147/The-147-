import { useEffect, useRef, useState, useCallback } from "react";

// Dynamic require with try/catch — TurboModuleRegistry.getEnforcing throws in
// Expo Go because the native SQIPGooglePay module is only available in a full
// EAS build. Catching here lets the app run normally in Expo Go (canUseGooglePay
// stays false) and enables Google Pay in production builds transparently.
let SQIPCore: any = null;
let SQIPGooglePay: any = null;
let GooglePayEnvironment: Record<string, any> = {};
let GooglePayPriceStatus: Record<string, any> = {};

try {
  const sq = require("react-native-square-in-app-payments");
  SQIPCore = sq.SQIPCore ?? null;
  SQIPGooglePay = sq.SQIPGooglePay ?? null;
  GooglePayEnvironment = sq.GooglePayEnvironment ?? {};
  GooglePayPriceStatus = sq.GooglePayPriceStatus ?? {};
} catch {
  // Native module unavailable (Expo Go) — Google Pay will be disabled
}

export function useSquareGooglePay(opts: {
  applicationId: string | null;
  locationId: string | null;
  environment: "production" | "sandbox";
}): {
  canUseGooglePay: boolean;
  requestNonce: (p: { amountPence: number; currency: string }) => Promise<string | null>;
} {
  const [canUseGooglePay, setCanUseGooglePay] = useState(false);
  const initialized = useRef(false);

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

  const requestNonce = useCallback(
    async (params: { amountPence: number; currency: string }): Promise<string | null> => {
      if (!SQIPGooglePay) return null;
      const price = (params.amountPence / 100).toFixed(2);
      return new Promise<string | null>((resolve) => {
        try {
          SQIPGooglePay.requestGooglePayNonce(
            {
              price,
              currencyCode: params.currency,
              priceStatus: GooglePayPriceStatus.TotalPriceStatusFinal ?? 3,
            },
            (cardDetails: any) => resolve(cardDetails.nonce ?? null),
            () => resolve(null),
            () => resolve(null),
          ).catch(() => resolve(null));
        } catch {
          resolve(null);
        }
      });
    },
    [],
  );

  return { canUseGooglePay, requestNonce };
}
