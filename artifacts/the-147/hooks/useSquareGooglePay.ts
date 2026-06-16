export function useSquareGooglePay(_opts: {
  applicationId: string | null;
  locationId: string | null;
  environment: "production" | "sandbox";
}): {
  canUseGooglePay: boolean;
  requestNonce: (p: { amountPence: number; currency: string }) => Promise<string | null>;
} {
  return {
    canUseGooglePay: false,
    requestNonce: async () => null,
  };
}
