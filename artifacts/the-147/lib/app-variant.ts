export type AppVariant = "customer" | "staff" | "all";

const raw = (process.env.EXPO_PUBLIC_APP_VARIANT ?? "").toLowerCase();

export const APP_VARIANT: AppVariant =
  raw === "customer" ? "customer" : raw === "staff" ? "staff" : "all";

export const isCustomerVariant = APP_VARIANT === "customer";
export const isStaffVariant = APP_VARIANT === "staff";
export const isCombinedVariant = APP_VARIANT === "all";

// Customer routes are present in the customer build and the combined build,
// but hidden from the dedicated staff build.
export const showCustomerRoutes = isCustomerVariant || isCombinedVariant;

// IMPORTANT: Staff routes are intentionally kept visible inside the customer
// build until the dedicated staff app is approved and live on the App Store.
// Once the staff app ships, change this to:
//   export const showStaffRoutes = isStaffVariant || isCombinedVariant;
// to remove the staff portal from the customer download.
export const showStaffRoutes =
  isStaffVariant || isCustomerVariant || isCombinedVariant;
