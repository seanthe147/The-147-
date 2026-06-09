---
name: Square payment system bugs
description: Root causes and fixes for "Payment Screen Issue" alert and loyalty reward issues in the payment flow
---

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

## Payment flow summary (for quick reference)
1. Client: POST /api/orders/create → returns appOrderId, amountPence, squareOrderId
2. Client: opens SquarePaymentSheet WebView with amountPence
3. WebView: Square SDK card form → tokenize → verifyBuyer (SCA) → postMessage({type:"token", sourceId, verificationToken})
4. Client: POST /api/orders/:id/pay → server calls Square /v2/payments
5. Server: marks app_orders.status = "paid", redeems loyalty reward (if any), accrues points
6. Client: routes to /order-confirmation, polls GET /api/orders/:id/confirmation
