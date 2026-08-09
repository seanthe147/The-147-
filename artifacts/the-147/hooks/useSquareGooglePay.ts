export type GooglePayNonceResult =
  | { status: "ok"; nonce: string; verificationToken: string | null }
  | { status: "cancelled" }
  | { status: "failed"; message: string };

export function useSquareGooglePay(_opts: {
  applicationId: string | null;
  locationId: string | null;
  environment: "production" | "sandbox";
  buyerEmail?: string | null;
  buyerName?: string | null;
}): {
  canUseGooglePay: boolean;
  requestNonce: (p: { amountPence: number; currency: string }) => Promise<GooglePayNonceResult>;
} {
  return {
    canUseGooglePay: false,
    requestNonce: async () => ({
      status: "failed",
      message: "Google Pay is not available on this platform.",
    }),
  };
}
