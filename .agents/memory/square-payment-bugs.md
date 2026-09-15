---
name: Square payment system bugs
description: Root causes and fixes for "Payment Screen Issue" alert and loyalty reward issues in the payment flow
---

## Google Pay merchant registration

Treat `OR_BIBED_11` separately from bank declines and SCA failures.

**Why:** Google's troubleshooting identifies this code as incomplete merchant
registration; changing buyer verification does not resolve production approval.

**How to apply:** check Google Pay & Wallet Console production approval for the
actual Android app and Square gateway configuration. Keep card payment available;
do not claim a code-only change fixes merchant approval.

## Bug 1 — "Payment Screen Issue" alert (fontFamily in Square card style)

**Root cause**: `payments.card({ style: { input: { fontFamily: '-apple-system, BlinkMacSystemFont, ...' } } })` — Square SDK rejects comma-separated font stacks. Throws "Invalid style value for property fontFamily" → `card_attach_error` on both attempts 1 and 2 → `fatal()` → postMessage({type:"fatal"}) → native `handleSheetUnavailable` → Alert.

**Fix**: Remove `fontFamily` from the `input` key in the Square card style object (`squarePaymentSheetHtml.ts`). CSS `font-family` in `<style>` blocks and in `btn.style.cssText` (Google Pay button) is safe — Square SDK only validates its own style API object.

**Deploy**: Mobile code — requires `eas update --channel production` OTA push (must be run from user's terminal, not Replit bash; Metro bundling alone ~2 min).

**Why**: Confirmed from production deployment logs: `[payment-sheet-diag] card_attach_error { reason: "Invalid style value '-apple-system...' for property 'fontFamily'" }`.

## Bug 2 — Loyalty reward burned on card decline

**Root cause**: `redeemIssuedLoyaltyReward(loyaltyRewardId, orderId)` was called in the order *create* route (~line 7005 before fix). If the card was subsequently declined, the reward was permanently consumed and could not be reused.

**Fix**: 
1. Added `loyalty_reward_id` column to `app_orders` table (nullable text, DB migration applied)
2. Store `loyaltyRewardId` in `createAppOrder` at order-create time
3. Removed the `redeemIssuedLoyaltyReward` call from the create route
4. Added it to the pay route after `succeeded === true` (reads `order.loyaltyRewardId`)

**Deploy**: Server-side only — deployed.

## Bug 3 — Loyalty discount amount mismatch (earlier fix, deployed)

**Root cause**: Loyalty discount was never PUT onto the Square order before payment, causing Square to reject the payment (charged amount ≠ order total).

**Fix**: `updateOrderWithLoyaltyDiscount` function in `square.ts` PUTs a `FIXED_AMOUNT` discount with uid `LOYALTY-REWARD` to the Square order; returns Square's confirmed new total. `redeemIssuedLoyaltyReward` fixed to use `location_id` not `order_id`.

## Bug 4 — Free order (100% loyalty reward) never reaches Square KDS

**Root cause**: `POST /api/orders/:id/complete-free` — used when a loyalty reward covers the entire order total (e.g. £5 reward on a £4.80 Stella → £0.00 due) — marked the order paid in the app DB but never called any Square API. Square KDS never received the order because:
1. No `createCardPayment` was called (Square rejects amount=0 payments).
2. `payOrderWithCashTender` has a guard: bails on `amountPence <= 0`.
3. `redeemIssuedLoyaltyReward` was also missing from this path (reward not marked consumed).

**Fix**:
- `square.ts`: Added `completeSquareOrderAsFree(orderId)` — mirrors `cancelSquareOrder` pattern: GET current version, then PUT `state: "COMPLETED"`. Non-throwing.
- `routes.ts complete-free`: After marking paid in DB, now fires (non-blocking):
  1. `square.completeSquareOrderAsFree()` → Square KDS sees the order
  2. `square.redeemIssuedLoyaltyReward()` → reward properly consumed

**Why**: Square KDS only sees orders that have been paid (card/cash tender) or explicitly set to COMPLETED. Free orders skip both paths without this fix.

## Bug 6 — Google Pay still failing for some Android users (SCA + silent errors)

**Root cause (two-part)**:
1. Google Pay nonces were sent with `verificationToken: null` — no buyer verification (SCA/3DS) ever ran on the native Google Pay path, so UK banks requiring SCA declined those payments. The WebView card path does verifyBuyer; the native wallet path didn't.
2. All Google Pay failures/cancellations resolved to `null` silently — the button just returned to idle with no message, making failures look intermittent and unreportable.

**Fix**: `requestNonce` now returns a structured result (`ok`/`cancelled`/`failed`), runs `startBuyerVerificationFlow` on the nonce (uses a bare nonce only when the verification module is unavailable), and the sheet shows actionable failure messages + posts structured native error diagnostics to `/api/public/payment-sheet-diagnostics`. Native requests are bounded so a missing callback cannot leave checkout spinning forever.

**Deploy**: Mobile code — needs OTA push (`eas update --channel production`, user's terminal) AND users must be on a binary that includes the Square native module (runtime 2.8.7+); older installed binaries can never show Google Pay regardless of OTA.

## Payment flow summary (for quick reference)
1. Client: POST /api/orders/create → returns appOrderId, amountPence, squareOrderId
2a. amountPence > 0: Client opens SquarePaymentSheet WebView
    WebView: Square SDK card form → tokenize → verifyBuyer (SCA) → postMessage({type:"token"})
    Client: POST /api/orders/:id/pay → server calls Square /v2/payments
    Server: marks paid, redeems loyalty reward, accrues points
2b. amountPence = 0: Client calls POST /api/orders/:id/complete-free (no payment sheet)
    Server: marks paid, redeems loyalty reward, calls completeSquareOrderAsFree → KDS
3. Client: routes to /order-confirmation, polls GET /api/orders/:id/confirmation

## Bug 5 — Google Pay button missing / appearing late on Android

**Root cause**: `SquarePaymentSheet` is remounted on every payment open via `paySheetKey` increment. `useSquareGooglePay` was called INSIDE the sheet, so its async `canUseGooglePay()` check ran after the modal slide-in animation. Android users saw no Google Pay button (check hadn't resolved) or saw it flicker in late.

**Fix**: 
- Added `googlePayAvailable?: boolean` and `googlePayRequestNonce?` props to `SquarePaymentSheet`
- Moved `useSquareGooglePay` call to `order.tsx` (screen level) — initialises once when `squareConfig` loads
- Passes pre-computed `screenCanUseGooglePay` / `screenGooglePayRequestNonce` down to the sheet
- Sheet uses these props directly (no async delay); falls back to internal hook if props not provided

**Deploy**: Mobile code — requires `eas update --channel production` OTA push from user's terminal.
