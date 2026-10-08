---
name: Expo native touch layout
description: Native Expo hit-testing depends on the root gesture-handler container filling the screen
---

The root `GestureHandlerRootView` in a React Native Expo app should use `style={{ flex: 1 }}`. A missing full-screen style can leave descendants visibly rendered while native touch hit testing fails, including tab buttons.

**Why:** The customer tab bar showed correctly in preview but all native tab taps failed; the sibling kiosk app already used the full-screen gesture-root pattern, which identified the structural discrepancy.

**How to apply:** When diagnosing native-wide touch failures, check the root gesture-handler layout before changing individual buttons or navigation screens. Verify the current development bundle and the installed beta separately.

When replacing the default tab button for touch reliability, preserve its selection and accessibility semantics and account for padding on both the item wrapper and button. Use a short visible label with a full accessibility label when six tabs cannot fit on narrow screens.

**Why:** Successful route taps did not catch clipped tab labels; duplicate wrapper/button spacing and long labels made the new floating bar unreadable at a 390pt viewport.

**How to apply:** Verify route taps separately from narrow-screen layout. Keep decoration outside interactive containers, and confirm the label and icon both fit inside the allocated bar height before a native release.