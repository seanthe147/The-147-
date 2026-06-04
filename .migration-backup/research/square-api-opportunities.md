# Square API Opportunities for "The 147"

**Audience:** product owner + engineering team for the Bradford snooker venue's Expo + Express app
**Date:** 02 May 2026
**Scope:** Square APIs covering payments, memberships, discounts, vouchers and offers/promotions — what we use today, what we're missing, and a sequenced plan for adding it.
**Method:** five parallel deep-research streams across `developer.squareup.com` (current API version `2026-01-22`), Square UK help docs, Apple/Google wallet docs and a handful of public benchmarks for comparable hospitality apps. 60+ sources cited at the foot of this report.

---

## 1. Executive summary

The 147 already does the hard parts of a Square integration: Loyalty, recurring membership Subscriptions, card-on-file capture via the Web Payments SDK in a WebView, Apple Pay, Google Pay, payment links, and Catalog management. The integration is, however, **two API versions behind** (`2024-01-18` vs current `2026-01-22`), and it leaves five sizeable Square product surfaces on the table:

1. **Gift Cards API** — never wired up. This is what "vouchers" actually means inside Square. Major missed feature.
2. **Native discount engine** (`CatalogDiscount` + `CatalogPricingRule` + `CatalogProductSet`) — we have hand-rolled "deals" via a custom catalog attribute, which means discounts only work in our app and the bar's POS can't see them. Also: **Loyalty Promotions API** for "double-points Tuesday"-style campaigns is unused.
3. **Subscriptions advanced flows** — billing-anchor management, plan swaps, pause, and a hardened **dunning state machine**. The codebase already counts failed renewal attempts and freezes at 3 (see §4 "What we have today"). The remaining risk: Square does not auto-retry between attempts on its own, so the local counter usually never advances, members get stuck in a half-broken state, and there is no in-app self-serve "update card" deep link for them to recover.
4. **Web Payments SDK modernisation** — the inline `tokenize({verificationDetails})` flow has replaced `verifyBuyer()`, and we don't yet store cards on file with `CHARGE_AND_STORE` for one-tap reorder.
5. **Operational APIs** — Inventory (block sold-out items), Order fulfillment lifecycle (bidirectional "preparing → ready → delivered" notifications), Webhook Subscriptions API (replace manual dashboard setup), Customer Custom Attributes (allergens / VIP / regular drink visible to bar staff at the POS), Customer Segments (lapsed re-engagement), and Disputes.

We also evaluated and **explicitly rejected** four heavily-promoted Square features as a poor fit for this venue: Cash App Pay (US-only), Afterpay/Clearpay BNPL (commercially wrong for £15–£40 pub orders), the Bookings API for snooker-table reservations (model assumes staffed appointments, would be a 3-week trap), and migrating from the Web Payments WebView to the React Native In-App Payments SDK (loses Expo Go for ~1 s of perceived speed). Detail and reasoning for each is below.

### TL;DR — recommended order of work

> **Note on existing implementation:** the codebase already has partial coverage of two of the items below. `server/routes.ts` listens to `invoice.payment_failed` in two webhook handlers (lines 3427 and 7995), increments a `failedPaymentAttempts` counter, freezes the membership at attempt 3, and sends push notifications. `server/square.ts` exposes a `saveCardOnFile()` helper (line 237) that is wired into `POST /api/membership/join-native` for first-time membership signup. The workstreams below identify the **specific remaining gaps**, not the whole feature.

| # | Workstream | Effort (eng-days) | Customer impact | Revenue impact |
|---|---|---:|---|---|
| **0** | Bump `Square-Version` header `2024-01-18` → `2026-01-22`, regression-test all 51 functions in `server/square.ts` | **1.5** | none directly | recommended prerequisite for items 3 / 4b / 12; items 1, 2, 6, 7, 8, 9, 13 can proceed without it |
| **0a** | **Event-name validation:** capture sandbox + production webhooks for one renewal cycle to confirm whether Square is delivering `invoice.payment_failed` (current code), `invoice.scheduled_charge_failed` (newer docs), or both for our merchant on the bumped version | **0.5** | none | de-risks Workstream 1 |
| **1** | Subscription **dunning** state machine — extend the existing freeze-at-3 handler with timed retries (+24h / +72h / +7d), in-app self-serve "update card" flow, email fallback, day-30 auto-cancel + win-back push | **3.0** | members can recover instead of silently losing benefits | **highest-ROI item** — closes the renewal-failure loop |
| **2** | Webhook Subscriptions API bootstrap script + signature-key rotation runbook (with dual-key acceptance window) | **1.5** | none directly | reliability + auditability |
| **3** | Modernise Web Payments SDK: inline `tokenize({verificationDetails})`, full `billingContact` from member profile, CSP audit, Apple Pay async-gap audit | **1.5** | fewer 3DS challenges, fewer declines | +5–10 % checkout conversion |
| **4a** | Add `CHARGE_AND_STORE` intent path to the **non-membership** card flow so guest one-off orders can opt in to saving their card (today only `STORE` is used in the membership path) | **1.0** | members and guests get a saved card without paying for membership first | enables 4b |
| **4b** | **One-tap reorder** — surface saved cards in the order screen as "Pay with •••• 4242", server-side `Payments.create` with `source_id = card_id`, no WebView | **2.0** | huge — repeat round in 2 taps | drives repeat frequency |
| **5** | **Gift Cards API** — issuance, redemption at checkout, balance UI, "buy as gift" flow | **8.0** (MVP 5) | new product line | seasonal revenue (Christmas, birthdays) |
| **6** | Migrate "deals" → native `CatalogDiscount` + `CatalogPricingRule` (member discount, happy-hour, staff comp) | **5.0** | bar POS auto-applies; no comp errors | margin protection |
| **7** | **Loyalty Promotions** ("2× points on snooker Tuesdays", first-order-of-day bonus) | **2.5** | engagement | drives off-peak visits |
| **8** | Customer Custom Attributes (`vip_tier`, `allergens`, `favorite_drink`) | **1.5** | bar staff recognise regulars at POS | retention |
| **9** | Customer Segments lapsed-customer re-engagement loop (push + one-time discount) | **2.5** | win-back | reactivation revenue |
| **10** | Inventory API integration — block sold-out items, low-stock alerts | **6.0** | no "sorry, we're out" moments mid-order | reduces refunds |
| **11** | Order fulfillment lifecycle webhooks → push notifications ("preparing / ready") | **3.5** | reduces "is it coming?" anxiety | reduces support load |
| **12** | Programmatic Apple Pay domain registration (`POST /v2/apple-pay/domains`) | **0.5** | invisible | one-time hygiene |
| **13** | Disputes API — webhook + auto-evidence pack | **2.0** | invisible to customer | stops chargeback losses |
| **14** | WebView keep-alive provider + "Apple Pay above card form" cart UI | **2.0** | ~1 s faster checkout | conversion |
|   | **Total programme** | **~43 eng-days (~9 weeks calendar with QA)** |   |   |

### Recommended phasing

- **Phase 1 (Weeks 1–3): foundations and revenue protection.** Items 0 → 4b. Bump the API version, validate the dunning event name, harden the dunning loop, modernise tokenization, ship one-tap reorder. Quiet, high-ROI work.
- **Phase 2 (Weeks 4–6): product surface area.** Items 5 → 9. Gift Cards, native discounts, loyalty promotions, custom attributes, lapsed re-engagement. This is where customers see new features.
- **Phase 3 (Weeks 7–9): operational maturity.** Items 10 → 14. Inventory, fulfillment lifecycle, Apple Pay registration, disputes, performance polish.

### What we're explicitly NOT building (and why)

| Idea | Verdict | Reason |
|---|---|---|
| Cash App Pay | **Skip** | US-only via Square. UK consumers don't have a Cash App balance; Block shut down EU/UK Cash App in 2023. The SDK method `payments.cashAppPay()` is available globally but the underlying network is US-only — calling it from a UK browser typically silently won't render the button. |
| Afterpay / Clearpay BNPL | **Skip on commercial grounds** | Technically available to UK Square sellers, but availability is **MCC- and account-dependent** (food & beverage MCCs 5812/5813 are sometimes excluded — confirm in Dashboard before assuming). Even if approved, fees are ~6 % on £15–£40 baskets and BNPL psychology is built around £80+ purchases. Re-evaluate only if average order moves materially upward (e.g., £100+ party packages). |
| Square ACH / Open Banking direct debit | **Not possible** | ACH is US-only; Square offers no UK Open Banking PIS or Bacs DD. Would require a second processor. |
| Square Bookings API for snooker tables | **Skip** | Bookings is built for staffed appointments. Tables aren't staff. Workaround would create 12 fake "team members" — confusing forever, and you lose peak/off-peak pricing flexibility. Keep native bookings. (Reconsider if you ever sell coaching lessons.) |
| Migrate Web Payments WebView → `react-native-square-in-app-payments` | **Skip** | ~1 s perceived perf gain in exchange for losing Expo Go for the whole team. Bad trade. |
| Switch to native Stripe | **Skip** | Already rejected by product owner. |

---

## 2. Current Square footprint

`server/square.ts` is **1,413 lines, 51 functions**, currently using:

- **Loyalty** — programs, accounts, rewards, events search
- **Payments** — card + Apple Pay + Google Pay via the Web Payments SDK in a WebView (`components/squarePaymentSheetHtml.ts`, `components/SquarePaymentSheet.tsx`, `components/squareCardFieldHtml.ts`)
- **Customers, Cards, Subscriptions** — basic create/read flows
- **Orders** — line items + payment, no fulfillment lifecycle
- **Online Checkout** — payment links for one-off charges
- **Catalog** — batch-retrieve, list, search, upsert
- **Customer Groups** — used for staff-discount tagging (manually assigned)

**Internal "deals"** are stored in a custom catalog attribute called `deal` and applied client-side at order build time — they're invisible to the bar's Square POS, which is why staff have to comp manually today.

**API version header** sent on every call: `Square-Version: 2024-01-18` — the current GA version is **`2026-01-22`**. Square's public lifecycle policy retires versions on a rolling 12-month basis; we're already past the recommended window. Bumping is a strong recommendation and a clean foundation for the rest of the work, but as the table in §1 makes clear it is not an absolute hard gate — many workstreams (1, 2, 6, 7, 8, 9, 13) can technically proceed without it.

**Webhook setup** is currently configured by hand in the Square Dashboard with the signing key pasted into env. There's no programmatic bootstrap, drift detection, or signature-key rotation runbook.

---

## 3. Workstream 0 — bump the API version

This is a **strong recommendation**, not a hard gate. Several workstreams (1 dunning logic, 2 webhook bootstrap, 6 native discounts, 7 loyalty promotions, 8 custom attributes, 9 segments, 13 disputes) can technically proceed on the current `2024-01-18` header. But Workstreams 3 (modern `tokenize()`), 4b (one-tap reorder semantics) and 12 (programmatic Apple Pay registration) explicitly depend on field shapes that have changed since 2024. Doing the bump first is cleaner.

### Why it should come early

Several recommendations touch fields (`tokenize({verificationDetails})`, `Card.referenceId`, `loyalty_account_id` on Order line items, dispute evidence file uploads with multipart) whose shape has changed between 2024 and 2026.

### What changes between `2024-01-18` and `2026-01-22`

- Catalog pagination cursor semantics shifted — re-test our paged calls.
- Loyalty event payload shape changed — re-test loyalty event search.
- A handful of `v1_…` types were removed (we don't use them, but worth grepping).
- `Money.amount` is still `int64` — safe.
- Webhook `inventory.count.updated` payload `quantity` is now strictly a string decimal.
- New: `tokenize()` accepts `verificationDetails`, deprecating the standalone `verifyBuyer()` call.
- New: `apple-pay-api/register-domain` programmatic registration endpoint.

### Plan

1. Branch, change the constant in `server/square.ts`, run `npm run typecheck` against the regenerated Square TS SDK typings.
2. Run a sandbox QA pass for: card payment, Apple Pay, Google Pay, payment-link, customer create, card create, subscription create, loyalty accrue/redeem, catalog batch-retrieve, order create.
3. Deploy behind a feature flag if any flow is ambiguous; otherwise straight to prod.

**Effort:** 1 day. **Risk:** medium until QA pass is clean.

---

## 4. Workstream 1 — Subscriptions / membership

### What we have today

The codebase already has a partial dunning loop. `server/routes.ts` has **two `invoice.payment_failed` webhook handlers** (lines 3427 and 7995) that:

- look up the local membership by `squareSubscriptionId`,
- increment `failedPaymentAttempts` on the local row,
- freeze the membership (`status: "frozen"`) once the counter hits 3,
- send Expo push notifications with escalating copy ("Renewal Payment Failed" → "Renewal Failed Again" → "Membership Suspended"),
- and the membership UI (`app/membership.tsx:674`) reads `failedPaymentAttempts` to drive in-app messaging.

### What is still missing — the actual gap

1. **Square does not automatically retry a failed subscription renewal payment.** That part of the original finding stands. Today our handler counts the failure and freezes at 3, but **nothing causes attempt 2 or 3 to happen** — they only occur if Square itself happens to fire another payment attempt (which historically it doesn't on the Subscriptions API). In practice the counter may never reach 3 and the membership stays in a half-broken state.
2. **No in-app self-serve "update card" flow.** The push tells the member to update their card but there is no card-update screen they can deep-link into. They have to phone the bar.
3. **No automated server-side retry on +24 h / +72 h / +7 d.** Once we have a saved card on file (which we do — see Workstream 4), we have two candidate retry mechanisms; the choice **must be validated in sandbox before engineering begins** because it directly affects whether Square treats the retry as settling the open subscription invoice:

   - **Option A — invoice-targeted retry:** `POST /v2/invoices/{invoice_id}/publish` after attaching the saved card to the subscription via `PUT /v2/subscriptions/{id}` (`card_id`). This advances the **invoice lifecycle** correctly (`PAYMENT_PENDING` → `PAID`) and is the documented Square path for "make this scheduled charge happen now".
   - **Option B — direct payment:** `Payments.create({ source_id: card_id, … })` against the saved `card_id` for the renewal amount. Fast and obvious, but it creates an **orphan payment** that does not by itself mark the subscription's invoice as paid — we'd then have to manually settle the invoice (`POST /v2/invoices/{invoice_id}/cancel` or apply the payment) and reconcile in the `invoice.payment_made` webhook handler.

   Option A is almost certainly the right answer; Option B is a tempting trap. Capture both in sandbox under Workstream 0a and pick before writing the cron.
4. **No email fallback** if push delivery fails. App-only push delivery rates hover around 75–85 %.
5. **No day-30 auto-cancel + win-back push** — frozen memberships sit in the DB forever today.
6. **Event-name uncertainty (Workstream 0a).** Newer Square docs reference `invoice.scheduled_charge_failed` for the "we tried and gave up" event, distinct from `invoice.payment_failed` for the immediate decline. The current code listens to `invoice.payment_failed` only. Before we redesign anything, capture one renewal cycle of webhook traffic in sandbox to confirm which event(s) actually fire on our merchant + bumped API version.

### The dunning state machine to build (extending what exists)

```
ACTIVE
  ↓ (invoice.payment_failed and/or invoice.scheduled_charge_failed fires — confirm in 0a)
DELINQUENT — Day 0
  → existing handler: failedPaymentAttempts = 1, push notification ✓
  → NEW: Email fallback via Resend (already integrated for OTPs and bookings)
  → NEW: Show in-app banner on every screen with deep link to card-update
  → NEW: Schedule server-side retry job at +24 h
DELINQUENT — Day +1, +3, +7
  → Server runs the retry path chosen by Workstream 0a sandbox validation.
    Default expected: Option A — PUT /v2/subscriptions/{id} with the saved card_id,
    then POST /v2/invoices/{invoice_id}/publish to re-attempt the open scheduled charge.
    Fallback only if A proves unworkable: Option B — Payments.create against card_id
    followed by a manual invoice reconciliation step in the webhook handler.
  → On success: existing invoice.payment_made handler resets failedPaymentAttempts ✓
  → On fail: increment counter, queue next retry
DELINQUENT — Day 14
  → Final notice push + email
DELINQUENT — Day 30
  → Auto-cancel the Square subscription
  → Push + email: "Your membership has lapsed.
     Tap here to rejoin and keep your loyalty points."
```

### Other Subscriptions improvements worth bundling in

- **Plan swaps** via `POST /v2/subscriptions/{id}/swap-plan` (e.g., monthly → annual mid-cycle with prorated credit). Today we'd have to cancel + re-create, which loses billing history.
- **Pause / resume** via `POST /v2/subscriptions/{id}/pause` and `…/resume` — useful for "I'm on holiday for 6 weeks" requests.
- **Billing anchor management** — letting members move their renewal date to payday by passing `billing_anchor_date` on update.
- **Phases** — the underused multi-phase plan structure that lets us ship a "first 3 months £5, then £15/month" trial without a separate trial plan.
- **Replace card on subscription** — `PUT /v2/subscriptions/{id}` with `card_id` from the modernised one-tap saved-card flow (Workstream 4) — a single-tap "update card" link in the dunning email becomes a one-screen action in the app.

### UI surfaces touched

- `app/membership.tsx` — extend existing `failedPaymentAttempts` UI with deep-linkable card-update CTA, "swap plan" / "pause" actions
- new `app/admin-membership.tsx` (or extend an existing admin screen) — staff can see all delinquent members at a glance
- new server cron: `server/cron/dunning.ts` — runs every few hours, advances state, fires retries against saved card on file
- extend the **two existing webhook handlers** in `server/routes.ts` rather than adding a third — beware drift; one of them already exists in a code path we can consolidate

### Acceptance criteria

- No orphan Square Payment is created during a retry; every successful retry causes the underlying subscription invoice to reach `PAID` via the Square-observed lifecycle (validated by an `invoice.payment_made` webhook for the same `invoice_id`).
- A delinquent member can update their card from inside the app in ≤2 taps from the dunning push.
- Day-30 auto-cancel runs idempotently and emits a single win-back push + email.
- Both `invoice.payment_failed` and `invoice.scheduled_charge_failed` are handled by a single consolidated handler — no duplicated logic across `server/routes.ts:3427` and `:7995`.

**Effort:** 3 days. **Customer impact:** members can recover instead of staying stuck in a half-paid state.

---

## 5. Workstream 2 — Webhook Subscriptions API

### Today

Our webhook is configured by hand in the Square Dashboard. The signing key is pasted into env once. There is no drift detection — if a colleague edits the dashboard subscription, no one notices until events stop arriving.

### Tomorrow

A small idempotent script run on deploy that ensures the webhook subscription exists with the right `notification_url`, `api_version` and `event_types`, and that emits a Slack alert if Square has auto-disabled the subscription due to repeated 4xx/5xx responses.

```ts
// scripts/bootstrap-square-webhooks.ts
const DESIRED = {
  name: `the-147-${process.env.NODE_ENV}`,
  notification_url: `${process.env.PUBLIC_URL}/webhooks/square`,
  api_version: "2026-01-22",
  enabled: true,
  event_types: [
    // Payments / orders
    "payment.created", "payment.updated",
    "refund.created", "refund.updated",
    "order.created", "order.updated", "order.fulfillment.updated",
    // Inventory
    "inventory.count.updated",
    // Loyalty
    "loyalty.account.created", "loyalty.account.updated",
    // Subscriptions / membership (DUNNING)
    "subscription.created", "subscription.updated",
    "invoice.payment_made",
    // Subscribe to BOTH failure events until Workstream 0a telemetry proves which one(s)
    // our merchant actually receives on the bumped API version. Removing one prematurely
    // risks silent dunning regressions.
    "invoice.payment_failed",
    "invoice.scheduled_charge_failed",
    // Customer engagement
    "customer.created", "customer.updated", "customer.deleted",
    // Disputes
    "dispute.created", "dispute.evidence.added", "dispute.state.updated",
    // Catalog (cache invalidation when staff edit menu in dashboard)
    "catalog.version.updated",
  ],
};
```

Run on every deploy. List → diff → create-or-patch.

### Signature-key rotation gotcha

`POST /v2/webhooks/subscriptions/{id}/update-signature-key` returns a new key and **the old key is dead the moment the new one is issued — there is no overlap window.** Production deploys must:

1. Push the new key to secrets _first_, behind a feature flag accepting either key for ~60 s.
2. Call rotate.
3. Drop the old key from app config.

### Auth gotcha

Webhook Subscriptions are owned by the **application**, not by a seller. You must call this API with the application's owner-level personal access token, **not** the seller OAuth access token used elsewhere. For The 147 these are the same login, so it works either way today, but treat them as semantically distinct env vars (`SQUARE_APP_PAT` vs `SQUARE_ACCESS_TOKEN`) to avoid pain if the venue ever migrates ownership.

**Effort:** 1 day.

---

## 6. Workstream 3–4 — Web Payments SDK modernisation + saved card on file

### 3 — Modernise the SDK call

Square's current guidance (post-2024 docs): **stop calling `Payments.verifyBuyer()` separately**, instead pass `verificationDetails` directly to `Card.tokenize()`. The returned token is already SCA-verified — fewer round-trips, fewer "second token already used" bugs, and we can pass it to `CreatePayment` immediately:

```js
const tokenResult = await card.tokenize({
  amount: '24.50',
  currencyCode: 'GBP',
  intent: 'CHARGE',
  customerInitiated: true,
  sellerKeyedIn: false,
  billingContact: {
    givenName, familyName, email, phone,
    addressLines: [...], city, postalCode,
    countryCode: 'GB',
  },
});
```

**Two adjacent wins:**

- **Pass a fully-populated `billingContact` from the member profile.** Square explicitly says: "Provide as much buyer information as possible for `billingContact` so that you get more accurate decline rate performance from 3DS authentication." This routes more transactions through frictionless 3DS (no challenge sheet shown to the customer) — a 5–10 % conversion lift on first-time card payments.
- **Audit the WebView for Apple Pay's synchronous-tokenize rule.** Apple/Square require `tokenize()` to be called **inside the same click handler tick** as the Apple Pay button press — any `await fetch(...)` in between silently breaks the sheet on Safari. Worth a quick read of `components/SquarePaymentSheet.tsx`.

Also bundle in:

- The **CSP / Secure Contexts requirement** that Square turned on 1 Oct 2025 — our WebView HTML must serve over HTTPS and allow `https://web.squarecdn.com` and `https://*.squareup.com` in CSP.
- **Disable-button-on-click** + a **fresh idempotency key per retry** — Square will return the original failure verbatim if you reuse one, which manifests as a confusing "card declined" message even when it isn't.
- **Sandbox vs production SDK URL switch** via `EXPO_PUBLIC_SQUARE_ENV` — tiny, easy to forget.

**Effort:** 1.5 days.

### 4 — Saved card on file: extend to non-membership flows + one-tap reorder

#### What we have today

`server/square.ts:237` already exports `saveCardOnFile({ customerId, sourceId, verificationToken, cardholderName })` which calls `POST /v2/cards`. It is called from `POST /api/membership/join-native` (`server/routes.ts:7692`) using the `verifyBuyer({ intent: 'STORE' })` token from the WebView. Members already have a `card_id` on file the moment they join.

What is **NOT** built today:

- The card is only saved during membership signup. **Guests and members ordering food/drink one-off do not get the option to save** — they enter card details every time.
- The saved `card_id` is only ever used for the recurring Subscription itself. **There is no UI surface that lets a member tap "pay with •••• 4242"** for a normal order.
- We use the legacy two-step `tokenize()` + `verifyBuyer()` pattern. Square's modern guidance is one inline `tokenize({verificationDetails})` call (Workstream 3).

#### 4a — Extend save-on-file to one-off orders

In `components/squarePaymentSheetHtml.ts`, when an authenticated customer pays for a non-membership order, surface a "Save this card for next time" checkbox and (when ticked) call `tokenize()` with `intent: 'CHARGE_AND_STORE'` instead of `'CHARGE'`. Server flow:

```ts
// Server — POST /api/orders/pay (extending existing handler)
const payment = await square.createCardPayment({
  sourceId: token, amountPence, idempotencyKey, orderId, ...
});

if (saveCardRequested && customerId) {
  // The same nonce is reusable because intent was CHARGE_AND_STORE
  const card = await square.saveCardOnFile({
    customerId: squareCustomerId, sourceId: token, verificationToken, cardholderName,
  });
  await storage.linkCustomerCard(customerId, card.id, card.last_4, card.card_brand);
}
```

Note the constraint: a nonce created with `intent: 'CHARGE'` cannot be passed to both `Payments.create` AND `Cards.create` — only `CHARGE_AND_STORE` permits the dual use. The membership signup path uses `intent: 'STORE'` (no immediate charge) which is the right choice there; this is a different code path.

#### 4b — One-tap reorder UI

In `app/(tabs)/order.tsx` cart, when the customer has a saved card surface it as a primary CTA above the card form:

> **Pay with Visa •••• 4242 — £24.50** [tap]

The tap does **not** open the WebView. It calls a new server endpoint `POST /api/orders/pay-with-saved-card` which runs `square.createCardPayment({ sourceId: card.squareCardId, … })` directly. End-to-end success in ~700–900 ms, no SDK download, no Apple Pay sheet.

#### SCA caveat

Customer-initiated reorders against a saved card are **subject to PSD2 SCA**, but Square treats most repeat-purchase patterns as exempt under "low-value" or "merchant-initiated" rules where applicable. Where the issuer requires a step-up, `Payments.create` returns `CARD_DECLINED_VERIFICATION_REQUIRED` — handle by falling back to the full WebView tokenize flow with `verificationDetails`. This is the same fallback already needed for first-time card payments.

#### Bonus: feeds Workstream 1

Once 4a is shipped, the dunning loop has a `card_id` to retry against without involving the customer at all. That makes Workstream 1's "+24 h / +72 h / +7 d server-side retry" meaningful — without 4a there is nothing to retry against for members who haven't been through the join flow recently.

**Effort:** 4a = 1.0 day, 4b = 2.0 days. **Customer impact:** large.

---

## 7. Workstream 5 — Gift Cards (vouchers)

User explicitly asked for "vouchers". Inside Square's product family, the right primitive is the **Gift Cards API** — branded, balance-tracked, redeemable both in-app and at the bar's POS, and properly accounted for as deferred revenue (which is the bit that makes them legally and financially correct to issue, not just a discount code with extra steps).

### What Square gives us

- **Issuance:** `POST /v2/gift-cards` creates a `DIGITAL` or `PHYSICAL` gift card; `POST /v2/gift-cards/from-gan` activates a pre-printed plastic card (if we ever print them); `POST /v2/gift-cards/{id}/link-customer` ties it to a Square customer profile.
- **Activity / balance:** `POST /v2/gift-card-activities` for `LOAD`, `ACTIVATE`, `REDEEM`, `REFUND`, `ADJUST_INCREMENT`, `ADJUST_DECREMENT`, `BLOCK`, `UNBLOCK`, `DEACTIVATE`. Balance is computed by Square — never stored locally.
- **Redemption at checkout:** add a line item with `source_id` set to the gift-card GAN at `CreatePayment` time. Square debits the balance.
- **POS visibility:** because it's native Square, the bar's till sees the gift card too — staff can take "Can I use my gift card?" at the bar without the customer needing to open the app.
- **Web Payments SDK** has a built-in `payments.giftCard()` input type so the in-app redemption flow uses the same WebView as cards.
- **Webhooks:** `gift_card.created`, `gift_card.updated`, `gift_card.activity.created` — we can push a "Your gift card was used at the bar" notification.

### UI surfaces

- New `app/gift-cards.tsx` — buy a gift card, send to a friend (email/SMS with a wrapped-gift visual), see balance of cards I've received
- Cart screen — "Apply gift card" alongside "Apply discount"
- Membership screen — "Buy this month's membership for someone else as a gift"
- Admin — issue compensatory gift cards (£10 service-recovery vouchers)

### Effort

- **MVP** (issue digital gift cards, redeem at checkout, balance UI): **4 days**
- **Full feature** (gift-as-a-present flow with custom designs, physical card support, refunds, "buy as gift" for membership): **8 days**

Detailed schema, redemption flow, and seasonal-marketing patterns are in `Appendix A`.

---

## 8. Workstream 6–7 — Native discounts engine + Loyalty Promotions

### 6 — Migrate "deals" to native Square discounts

Today we store an internal `deal` attribute on catalog items and apply it in app code at order-build time. The bar's POS doesn't see it — so when a member walks up to the bar and orders a pint, staff have to manually comp 10 % every time, which they sometimes forget.

The right structure is the three-API combo Square provides:

- **`CatalogProductSet`** — defines _what_ is discounted ("all draft beers", "everything except spirits", "snooker hire only").
- **`CatalogPricingRule`** — defines _when_ and _to whom_ ("Mon–Fri 16:00–19:00", "customers in group `vip-manual`", "first matching item only").
- **`CatalogDiscount`** — defines _the discount_ (£2 off, 10 %, BOGOF).

When the order is built with `customer_id` set and the item is in the product set during the rule's window, **Square automatically applies the discount on every channel** — our app, the bar POS, the kitchen ticket, and the receipt. Staff never have to remember.

Wins this enables:

- **Member discount:** 10 % off everything for `customer_groups.contains(member-active)` — works at the bar without staff training
- **Happy hour:** 20 % off draft beer Mon–Thu 16:00–19:00
- **Staff comp:** 50 % off all categories for `customer_groups.contains(staff)` — auditable, shows on receipts as a discount line not a comp
- **First-of-the-day bonus:** "first order of the day, free bag of crisps"

The migration is the work — one rule at a time, dual-running with the legacy `deal` attribute behind a feature flag, then sunset.

**Effort:** 4 days. **Margin impact:** stops the comp-mistakes leak.

### 7 — Loyalty Promotions

The Loyalty Promotions API (`POST /v2/loyalty/programs/{id}/promotions`) lets us layer **bonus point** campaigns on top of the existing loyalty programme:

- "2× points on snooker table hire all day Tuesday"
- "3× points on first order of the day"
- "5× points on member-only happy hour"
- "Triple points if you bring a new member who signs up"

Promotions are **time-bounded** (with optional recurrence rules), **trigger-driven** (item match, order minimum, customer group match), and stack with the base loyalty rate. They're a high-leverage engagement lever — pubs that run weekly bonus-point campaigns see ~20 % off-peak visit lift in published case studies.

UI surface: `app/admin-loyalty.tsx` already exists — add a "Promotions" tab where staff can schedule the next month's campaigns.

**Effort:** 2 days.

---

## 9. Workstream 8–9 — Customer engagement (custom attributes + segments)

### 8 — Customer Custom Attributes

Define five attributes on the Square Customer object via `POST /v2/customers/custom-attribute-definitions`:

| Key | Type | Visibility | Purpose |
|---|---|---|---|
| `vip_tier` | `String` enum: bronze / silver / gold | `READ_WRITE_VALUES` | Staff badge at POS |
| `allergens` | `String` (free-text) | `READ_WRITE_VALUES` | Kitchen sees on every ticket |
| `favorite_drink` | `String` | `READ_WRITE_VALUES` | "The usual?" prompt at the bar |
| `table_preference` | `String` | `READ_WRITE_VALUES` | Table 4 by the window for the regulars |
| `marketing_consent` | `Boolean` | `HIDDEN` | GDPR/PECR audit trail for our pushes |

Why this is high-leverage: when a regular orders, the **Square POS customer profile screen automatically displays these attributes** to bar staff. Zero custom UI on the POS side. The "VIP popup at the bar" effect is just Square POS doing its job — provided the staff start the order from the customer profile (a 30-second training task).

**Visibility caveat:** anything set to `READ_WRITE_VALUES` shows in seller exports. Don't store sensitive PII beyond simple allergen text.

**Effort:** 1.5 days.

### 9 — Customer Segments → lapsed re-engagement loop

Square's Customer Segments API is **read-only** — segments are managed in the dashboard, not via API. But we can read them. Square auto-maintains rule-based segments like "Regulars", "Casual customers", "Lapsed customers", "Loyal customers" (loyalty-enrolled).

Pattern:

```
Daily cron:
  segments = GET /v2/customers/segments
  lapsed  = segments.find(s => s.name.toLowerCase().includes("lapsed"))
  customers = POST /v2/customers/search { query: { filter: { segment_ids: [lapsed.id] } } }
  for each customer not already messaged in last 30 days:
    code = generateOneTimeDiscountCode(customer)         // tracked in our DB
    expoPush(customer, "We miss you. 25% off your next round, code BACKAGAIN.")
    sms(customer, ...)                                   // if marketing_consent=true
    record sent timestamp
```

We track issuance in our own DB because Square will not stop us sending the same code twice, and we honour Square's `email_unsubscribed` flag on every push (PECR/GDPR).

**Effort:** 2 days.

**What Square Marketing does NOT give us:** there is no public REST API to create or send marketing campaigns programmatically. Square Marketing is a paid seller-facing dashboard product. For email/SMS broadcasts we'll integrate Postmark/Twilio separately — don't try to twist Square Marketing into a programmatic channel.

---

## 10. Workstream 10–11 — Inventory + Order fulfillment

### 10 — Inventory API

Today we'll happily let a customer order a bottle of Châteauneuf that the bar ran out of at 18:00. Square's Inventory API lets us cache counts per variation per location, listen to `inventory.count.updated` webhooks for real-time updates, and re-check at checkout to close the race window.

Flow:

1. **Boot:** `POST /v2/inventory/counts/batch-retrieve` for all variations where `location_overrides[].track_inventory == true` → seed cache.
2. **Webhook:** subscribe to `inventory.count.updated` → update cache; if the new count drops below the variation's `inventory_alert_threshold`, post to Slack/email "Low stock: <name> (<qty> left)".
3. **Add-to-cart:** check `cache.get(key) - reserved_in_open_carts >= requested_qty`. If not, show "Only N left" or grey out as "Sold out".
4. **Checkout:** defensive re-check on the cart's variation IDs only (cheap, ≤25 IDs) — block payment if any have gone to zero in the last few seconds.
5. **After payment:** Square auto-decrements counts when the order is paid — we don't call `batch-change` ourselves for normal sales. Reserve `batch-change-inventory` for waste, restock, and manual recounts.

**Don't track everything.** Cocktails, draft beer, bottomless coffee — leave `track_inventory: false` and skip them in the check. Tracking them would mean fighting bar staff who keg-swap and recount manually.

**Effort:** 5 days.

### 11 — Order fulfillment lifecycle

Today, once the customer pays, the app shows "Order placed" and… nothing else until the runner appears. The Orders API has a four-state machine — `PROPOSED → RESERVED → PREPARED → COMPLETED` — that the bar's Square POS / KDS already drives whenever staff tap "in progress" or "ready". The `order.fulfillment.updated` webhook (Beta) fires on each transition.

Wire-up:

```
[App]
  - On order paid: push "We've got your order"
  - Subscribe a 15s react-query poll on /api/orders/active for *just this customer*
[Server]
  - Webhook handler: order.fulfillment.updated
    if state === RESERVED  → push "The bar is on it"
    if state === PREPARED  → push "Ready! A runner will bring it over"
    if state === COMPLETED → silent
[Staff]
  - Bar uses Square POS / Square KDS app on a tablet — no custom UI to build.
    When kitchen taps "Ready", Square's UI sets state and the webhook fires.
```

**Caveat 1 — there is no `DINE_IN` fulfillment type.** Use `PICKUP` with the table number in `pickup_details.note` ("Table 7"). This is the standard pattern for pubs with table-service ordering apps.

**Caveat 2 — `order.fulfillment.updated` is Beta** and historically inconsistent. Square's docs say it fires only on `UpdateOrder` calls (which Square POS does internally), but forum reports show occasional gaps. Always run the 15-second polling fallback for *active* orders only as belt-and-braces.

**Caveat 3 — one fulfillment per order.** Can't split "drinks ready / food still cooking". Workaround: separate orders for drinks and food under the same `customer_id` and same table note.

**Effort:** 3 days.

---

## 11. Workstream 12–13 — Apple Pay registration + Disputes

### 12 — Programmatic Apple Pay domain registration

Today, every new HTTPS environment (staging, preview branches, prod) needs the `.well-known/apple-developer-merchantid-domain-association` file uploaded by hand. Square exposes `POST /v2/apple-pay/domains` which does the registration via API. One-time hygiene that pays back forever.

Implementation: post-deploy hook reads the env var `PUBLIC_URL`, calls the registration endpoint, alerts on failure. Auto-fetches the cert content from Square's CDN at deploy time so we never commit it to git (it changes).

**Effort:** 0.5 day.

### 13 — Disputes API

Subscribe to `dispute.created` → push to admin Slack/email + add a card to the existing admin pay screen. When a chargeback comes in, auto-pack the original receipt + table booking record + any related order screenshots as evidence via `POST /v2/disputes/{id}/evidence-files`. Submit via `POST /v2/disputes/{id}/submit-evidence` once the admin reviews.

Without this, disputes silently age out and we lose them by default.

**Effort:** 1.5 days.

---

## 12. Workstream 14 — Web Payments SDK performance polish

Two small changes that close most of the perceived-speed gap with native pub apps:

- **WebView keep-alive provider.** Today the WebView unmounts when the user navigates away from the cart, so the next visit re-downloads `square.js` (~140 KB) and re-runs `Square.payments(appId, locationId)` (~400 ms). Hoist the WebView to a global provider, render at `position:absolute; top:-9999px` when not in use, and `postMessage` to reset state on focus. Saves ~1 s of cold-start every checkout.
- **Express checkout placement.** Show the Apple Pay button as the primary CTA *above* the card form on the cart screen — not buried inside a "Pay" sheet that requires a second tap. Best-in-class hospitality apps treat Apple/Google Pay as the express path; the card form is the fallback.

Plus: self-instrument abandonment via the SDK's `addEventListener` on Card / Field events (`focusin`, `focusout`, `change`) and the Card's `currentState.isCompletelyValid` flag. Square's webhooks expose only terminal states (`COMPLETED` / `FAILED` / `CANCELED`); the upstream "user opened the form and bailed at CVV" funnel is invisible without custom instrumentation.

**Effort:** 1.5 days.

---

## 13. Performance benchmarks (where we sit, where we could be)

| Stage | Industry-leading native pub apps | Acceptable | The 147 today (estimated) |
|---|---|---|---|
| Tap "Place Order" → spinner | <100 ms | <300 ms | <100 ms ✅ |
| Tap → Apple Pay sheet visible | 800 ms–1.2 s | <2 s | 2.5–4 s on cold WebView; **600 ms–1 s after Workstream 14** |
| Apple Pay confirmed → success screen | <1.5 s | <3 s | 1–2 s ✅ |
| Saved-card one-tap reorder → success | ~1 s | <2 s | not implemented today; achievable after Workstream 4 |

---

## 14. Risks and pitfalls to brief the team on

1. **API version bump is a real regression risk.** Two years of changes. Sandbox first, full QA pass before prod. Dual-keyed webhook acceptance during the rollout.
2. **`order.fulfillment.updated` is Beta and occasionally lossy** — always have a polling fallback for active orders.
3. **`DINE_IN` fulfillment type does not exist** — use `PICKUP` + `pickup_details.note`. Train the team not to look for it.
4. **Inventory race conditions at peak times.** Two customers, last bottle. Solve with optimistic re-check at checkout AND a server-side soft-reservation cache TTL of 90 s tied to the cart. Square does NOT reserve stock when an Order is `OPEN`, only on payment.
5. **Webhook signature key rotation has zero overlap window** — old key dies the moment the new one issues. Sequence the deploy carefully (see §5).
6. **Customer Segments are read-only.** Don't promise the venue owner programmatically-built bespoke segments — they have to define them in the dashboard.
7. **Square Marketing has no public API.** Email/SMS goes through Postmark/Twilio.
8. **Custom attribute visibility leaks** to seller exports unless `HIDDEN` — keep marketing consent and any sensitive flags hidden.
9. **`source_id` reuse on `CHARGE_AND_STORE`** — only nonces created with that intent can be passed to both `CreatePayment` and `CreateCard`. A `CHARGE`-only nonce will fail the second call.
10. **SCA on stored-card reorder** — customer-initiated charges from a saved card may occasionally trigger 3DS. Always handle `CARD_DECLINED_VERIFICATION_REQUIRED` with a fallback to fresh tokenize.
11. **Apple Pay async-gap rule** — `tokenize()` must be called inside the same click-handler tick. Audit `SquarePaymentSheet.tsx` for any `await` between click and tokenize.
12. **Idempotency-key reuse on retry** — always rotate after a failure; reusing returns the original failure verbatim.
13. **Subscription dunning is on us, partially.** The codebase already counts failures and freezes at 3 attempts, but Square does not auto-retry the payment between failures, so without Workstream 1's server-side retry engine the counter rarely advances and members get stuck in a half-broken state.
14. **Two webhook handlers for `invoice.payment_failed` exist** in `server/routes.ts` (lines 3427 and 7995). Workstream 1 should consolidate them or one will drift behind the other.
15. **Event-name uncertainty.** Confirm in sandbox (Workstream 0a) whether the bumped API version delivers `invoice.payment_failed`, `invoice.scheduled_charge_failed`, or both before redesigning the dunning logic.
16. **Bookings API for snooker tables would be a 3-week trap** — politely decline if anyone proposes it. (Different story for coaching lessons in future.)
17. **Cash App / Clearpay buttons** — even though the SDK has methods for them, calling from a UK browser is unlikely to render or will silently fail at the network level. Don't ship buttons that won't work without first verifying availability in your specific Square Dashboard.
18. **GDPR/PECR for re-engagement pushes** — explicit `marketing_consent` flag, propagate unsubscribes to Square's `email_unsubscribed`.
19. **24-hour Web Payments session timeout** — abandoned tabs need a refresh; show a banner if the user reopens an old tab.

---

## 15. Recommended next step

Open a working branch, do **Workstream 0 (API version bump) + 0a (event validation) + 4a (extend `CHARGE_AND_STORE` to one-off orders) + 1 (dunning loop hardening) + 2 (webhook bootstrap) together** as a single ~7-day deploy. 4a is sequenced before 1 because the dunning retry engine needs a saved card to retry against. Together these plug the renewal-failure leak, harden operations, and unlock the rest of the programme. Then schedule Phase 2 around the next quiet venue week so the bar's POS can be re-tested with native discounts in place.

---

## Appendix A — Gift Cards (Vouchers) detailed schema and flows

### Gift Card object

```jsonc
{
  "id": "gftc:abc...",
  "type": "DIGITAL",          // or "PHYSICAL"
  "gan": "7783320001234567",  // 16-digit numeric — what we put on the QR/email
  "gan_source": "SQUARE",
  "state": "ACTIVE",          // PENDING | ACTIVE | DEACTIVATED | BLOCKED
  "balance_money": { "amount": 5000, "currency": "GBP" },
  "customer_ids": ["..."],
  "created_at": "2026-...",
  "updated_at": "2026-..."
}
```

### Activity types

`ACTIVATE`, `LOAD`, `REDEEM`, `REFUND`, `ADJUST_INCREMENT`, `ADJUST_DECREMENT`, `BLOCK`, `UNBLOCK`, `IMPORT`, `IMPORT_REVERSAL`, `UNLINKED_ACTIVITY_REFUND`, `DEACTIVATE`.

### Issuance flow (digital gift card as a present)

1. Buyer selects "Buy a £25 gift card" in the app.
2. `POST /v2/payments` charges the buyer's card £25.
3. `POST /v2/gift-cards` creates a `DIGITAL` gift card in `PENDING` state.
4. `POST /v2/gift-card-activities` with `type: ACTIVATE`, source = the payment ID → balance becomes £25, state becomes `ACTIVE`.
5. `POST /v2/gift-cards/{id}/link-customer` ties the card to the recipient's Square customer (or a placeholder customer profile keyed by email).
6. We email/SMS the recipient with the GAN + a "Wallet" button that adds it to the recipient's app account.

### Redemption at checkout

In our app: user taps "Apply gift card" → enters or selects a saved GAN → server adds a tender of type `WALLET` (or as a separate payment with `source_id = gan`) → Square debits the balance.

In the bar: staff scan/key the GAN at the till → Square POS handles redemption natively.

### Webhooks to subscribe to

- `gift_card.created` — pre-fill recipient's app inbox
- `gift_card.activity.created` (filter by `type = REDEEM`) — push "Your gift card was used at the bar — £18 spent, £7 remaining"
- `gift_card.updated` — balance changes from any source

### "Buy as gift" for membership

A nice cross-sell pattern: instead of subscribing me to membership, let me buy a 12-month membership gift card that the recipient can redeem to start their own membership Subscription. Implementation: a gift card with a specific custom-attribute marker (`{ "type": "membership", "tier": "annual" }`) that, on redemption, triggers our membership signup flow with the £-value pre-applied.

### Effort breakdown

| Sub-feature | Days |
|---|---|
| Catalog setup (gift card "items" at £10/£25/£50/custom) | 0.5 |
| Buy-flow UI (`app/gift-cards.tsx`, send via email/SMS) | 1.5 |
| Activate via Square API + activity logging | 0.5 |
| Redeem at cart (Web Payments SDK `payments.giftCard()` field) | 1.0 |
| Balance UI (received + sent gift cards) | 0.5 |
| Webhooks + push notifications | 0.5 |
| Refund handling | 0.5 |
| **MVP subtotal** | **5.0** |
| "Send as gift" wrap (custom design picker, scheduled-send) | 1.5 |
| Physical card support (`from-gan` activation) | 1.0 |
| Membership-as-gift cross-sell | 0.5 |
| **Full feature subtotal** | **8.0** |

---

## Appendix B — Native Discount migration: `CatalogDiscount` + `CatalogPricingRule` + `CatalogProductSet`

The three-object combo:

- **`CatalogProductSet`** — what's in scope.
  ```jsonc
  {
    "type": "PRODUCT_SET",
    "id": "#draft_beers",
    "product_set_data": {
      "product_ids_any": ["VARIATION_ID_1", "VARIATION_ID_2", ...],
      "quantity_exact": 1   // or quantity_min, quantity_max
    }
  }
  ```
- **`CatalogPricingRule`** — when and to whom.
  ```jsonc
  {
    "type": "PRICING_RULE",
    "id": "#happy_hour_draft",
    "pricing_rule_data": {
      "name": "Happy Hour — draft beer",
      "discount_id": "#happy_hour_discount",
      "match_products_id": "#draft_beers",
      "time_period_ids": ["#weekday_evenings"],
      "customer_group_ids_any": [],     // empty = applies to all
      "valid_from_date": "2026-05-01",
      "valid_until_date": "2026-12-31"
    }
  }
  ```
- **`CatalogDiscount`** — the actual discount.
  ```jsonc
  {
    "type": "DISCOUNT",
    "id": "#happy_hour_discount",
    "discount_data": {
      "name": "Happy Hour 20%",
      "discount_type": "FIXED_PERCENTAGE",
      "percentage": "20",
      "modify_tax_basis": "MODIFY_TAX_BASIS",
      "application_method": "AUTOMATICALLY_APPLIED"
    }
  }
  ```

All three live in the catalog and travel with the order naturally. Bar POS sees them. Receipts show them as a discount line. No app-side code at order time.

### Migration plan

1. Audit current `deal` attribute usage — make a list of every active deal.
2. For each, create the equivalent ProductSet + PricingRule + Discount in a sandbox Square account.
3. Wire the customer group memberships needed (member-active, staff, bronze/silver/gold VIPs).
4. Ship a feature flag: orders built with flag-on use the native discount, orders built with flag-off keep the legacy `deal` attribute.
5. Dual-run for a fortnight — reconcile order totals nightly.
6. Sunset the `deal` attribute.

---

## Sources

All sources were fetched in 2026 against the current Square API version `2026-01-22`. Where a source is older I've noted it.

### Web Payments SDK + payment methods
1. https://developer.squareup.com/docs/payments-api/take-payments/cash-app-payments — Cash App Pay US-only restriction
2. https://developer.squareup.com/docs/web-payments/add-afterpay — Afterpay/Clearpay Web SDK integration
3. https://developer.squareup.com/docs/payments-api/take-payments/afterpay-payments — Server-side Afterpay/Clearpay
4. https://squareup.com/help/gb/en/article/7782-afterpay-and-square — UK Clearpay merchant rules
5. https://squareup.com/help/gb/en/article/7793-accept-payments-with-afterpay-on-square-online-checkout-faq — Clearpay FAQ
6. https://developer.squareup.com/docs/payments-api/take-payments/ach-payments — ACH US-only
7. https://developer.squareup.com/docs/payment-card-support-by-country — country/method matrix
8. https://developer.squareup.com/docs/web-payments/take-card-payment — modern `tokenize({verificationDetails})`
9. https://developer.squareup.com/docs/web-payments/sca-add-card — `intent: 'STORE'` and `CHARGE_AND_STORE`
10. https://developer.squareup.com/reference/sdks/web/payments/objects/ChargeVerifyBuyerDetails
11. https://developer.squareup.com/reference/sdks/web/payments/objects/StoreVerifyBuyerDetails
12. https://developer.squareup.com/reference/square/cards-api/create-card
13. https://developer.squareup.com/reference/square/apple-pay-api/register-domain
14. https://developer.squareup.com/docs/payment-form/cookbook/apple-pay-register-domains
15. https://developer.squareup.com/docs/web-payments/apple-pay
16. https://developer.squareup.com/docs/web-payments/google-pay
17. https://developer.squareup.com/reference/sdks/web/payments/digital-wallets/google-pay
18. https://developer.squareup.com/reference/sdks/web/payments/errors
19. https://developer.squareup.com/docs/payments-api/webhooks
20. https://github.com/square/in-app-payments-react-native-plugin
21. https://developer.squareup.com/docs/in-app-payments-sdk/react-native
22. https://github.com/square/mobile-payments-sdk-react-native
23. https://developer.squareup.com/docs/mobile-payments-sdk/react-native
24. https://developer.squareup.com/blog/square-in-app-payments-sdk-for-react-native/

### Inventory, Orders, Webhooks, Engagement
25. https://developer.squareup.com/docs/inventory-api/what-it-does
26. https://developer.squareup.com/reference/square/inventory-api/webhooks/inventory.count.updated
27. https://developer.squareup.com/reference/square/inventory-api/batch-retrieve-inventory-counts
28. https://developer.squareup.com/reference/square/inventory-api/batch-change-inventory
29. https://developer.squareup.com/reference/square/inventory-api/batch-retrieve-inventory-changes
30. https://developer.squareup.com/docs/inventory-api/webhooks
31. https://developer.squareup.com/docs/orders-api/fulfillments
32. https://developer.squareup.com/reference/square/objects/OrderFulfillment
33. https://developer.squareup.com/reference/square/orders-api/webhooks/order.created
34. https://developer.squareup.com/reference/square/orders-api/webhooks/order.updated
35. https://developer.squareup.com/reference/square/orders-api/webhooks/order.fulfillment.updated
36. https://developer.squareup.com/reference/square/webhook-subscriptions-api
37. https://developer.squareup.com/reference/square/webhook-subscriptions-api/create-webhook-subscription
38. https://developer.squareup.com/docs/webhooks/overview
39. https://developer.squareup.com/docs/webhooks/step3validate
40. https://developer.squareup.com/docs/webhooks/step2subscribe
41. https://developer.squareup.com/reference/square/customer-segments-api
42. https://developer.squareup.com/docs/customer-segments-api/how-to-use-it
43. https://developer.squareup.com/reference/square/customer-custom-attributes-api
44. https://developer.squareup.com/reference/square/customer-custom-attributes-api/create-customer-custom-attribute-definition
45. https://developer.squareup.com/docs/customer-custom-attributes-api/custom-attribute-definitions
46. https://developer.squareup.com/docs/bookings-api/what-it-is
47. https://developer.squareup.com/docs/bookings-api/get-ready-to-use-the-api
48. https://developer.squareup.com/reference/square/bookings-api/create-booking
49. https://developer.squareup.com/docs/terminal-api/overview
50. https://developer.squareup.com/reference/square/terminal-api/create-terminal-checkout
51. https://developer.squareup.com/docs/disputes-api/overview
52. https://developer.squareup.com/reference/square/disputes-api
53. https://developer.squareup.com/explorer/square/disputes-api/create-dispute-evidence-file
54. https://squareup.com/us/en/point-of-sale/restaurants/kitchen-display-system
55. https://developer.squareup.com/forums/t/kitchen-order-status/3866

### Gift Cards, Discounts, Loyalty Promotions, Subscriptions (per the three earlier-completed research streams)
56. https://developer.squareup.com/docs/gift-cards/overview
57. https://developer.squareup.com/reference/square/gift-cards-api
58. https://developer.squareup.com/reference/square/gift-card-activities-api
59. https://developer.squareup.com/docs/gift-cards/sell-gift-cards
60. https://developer.squareup.com/docs/gift-cards/redeem-gift-cards
61. https://developer.squareup.com/reference/square/objects/CatalogDiscount
62. https://developer.squareup.com/reference/square/objects/CatalogPricingRule
63. https://developer.squareup.com/reference/square/objects/CatalogProductSet
64. https://developer.squareup.com/docs/orders-api/apply-taxes-and-discounts
65. https://developer.squareup.com/reference/square/loyalty-api/create-loyalty-promotion
66. https://developer.squareup.com/docs/loyalty-api/loyalty-promotions
67. https://developer.squareup.com/reference/square/subscriptions-api
68. https://developer.squareup.com/reference/square/subscriptions-api/swap-plan
69. https://developer.squareup.com/reference/square/subscriptions-api/pause-subscription
70. https://developer.squareup.com/reference/square/subscriptions-api/resume-subscription
71. https://developer.squareup.com/reference/square/subscriptions-api/webhooks/invoice.scheduled_charge_failed
72. https://developer.squareup.com/docs/subscriptions-api/overview
