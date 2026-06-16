import { useEffect, useRef, useState, useCallback } from "react";
import {
  SQIPCore,
  SQIPGooglePay,
  GooglePayEnvironment,
  GooglePayPriceStatus,
} from "react-native-square-in-app-payments";

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
        .then((can) => setCanUseGooglePay(can))
        .catch(() => setCanUseGooglePay(false));
    } catch {
      setCanUseGooglePay(false);
    }
  }, [opts.applicationId, opts.locationId, opts.environment]);

  const requestNonce = useCallback(
    async (params: { amountPence: number; currency: string }): Promise<string | null> => {
      const price = (params.amountPence / 100).toFixed(2);
      return new Promise<string | null>((resolve) => {
        try {
          SQIPGooglePay.requestGooglePayNonce(
            {
              price,
              currencyCode: params.currency,
              priceStatus: GooglePayPriceStatus.TotalPriceStatusFinal,
            },
            (cardDetails) => resolve(cardDetails.nonce ?? null),
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
