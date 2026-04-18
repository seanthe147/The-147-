# PCI DSS Compliance Note — The 147 Bradford

**Last reviewed:** April 2026
**Scope:** Stripe card payments taken via the staff portal (Events & Payments → Take Payment)
**Self-Assessment Tier:** **SAQ A** (lowest scope — merchant outsources all cardholder data handling to a validated third party)

---

## 1. Why we qualify for SAQ A

SAQ A applies to merchants who:

- Accept card-not-present transactions only (e-commerce / MOTO);
- Outsource **all** cardholder data functions to a PCI DSS validated third-party service provider; and
- Do not electronically store, process, or transmit any cardholder data on their own systems.

We meet all three:

| Requirement | How we meet it |
|---|---|
| All card data handled by validated third party | Stripe (Level 1 PCI DSS Service Provider) |
| Card fields rendered by Stripe, not us | We use **Stripe Elements** (`@stripe/stripe-js` Card Element). The PAN, expiry, and CVC are typed into a Stripe-hosted iframe — they never enter our DOM, our JavaScript, our network, or our servers. |
| No card data stored | Our `payment_log` table stores only: amount, currency, description, customer name/email/phone (encrypted), Stripe Payment Intent ID, status. **No PAN, no CVV, no expiry, no cardholder authentication data ever.** |
| Receipts show only masked data | Receipt emails display brand + last 4 digits only (`Visa •••• 4242`). |

---

## 2. Technical controls in place

### 2.1 Card data isolation
- Stripe Elements iframe is the only place card details are typed.
- CSP `frame-src` restricted to `https://js.stripe.com` and `https://hooks.stripe.com`.
- CSP `script-src` restricted to `'self'` + `https://js.stripe.com` + `https://m.stripe.network`.
- `'unsafe-inline'` and `'unsafe-eval'` are present in `script-src` because the Expo / React Native Web runtime requires them. **Compensating control:** card data is isolated inside the Stripe iframe under a different origin, so any XSS in our application cannot read the PAN.

### 2.2 Transport security
- HTTPS enforced site-wide.
- HSTS header set to `max-age=31536000` (1 year) in production.
- Frame-ancestors locked to `'none'` on staff/admin routes (clickjacking protection).

### 2.3 Authentication and authorisation
- Payment endpoints (`/api/staff/payments/*`) require **both** `staffAuth` (logged-in staff) and `managerAuth` (manager or owner role).
- Regular staff cannot take card payments.
- Staff PINs are hashed with `scrypt` + per-user salt.

### 2.4 Server-side verification
- Final payment status is fetched directly from Stripe via `paymentIntents.retrieve()`. Client-supplied status is ignored — the server never trusts the browser to declare success.

### 2.5 Idempotency
- Stripe Payment Intent creation uses an idempotency key bucketed by `staff + amount + description` per 60-second window. Network retries cannot create duplicate intents.

### 2.6 PII protection at rest
- Customer name, email, and phone in `payment_log` are encrypted with **AES-256-GCM** (per-row IV, auth-tagged) using `ENCRYPTION_KEY` derived via SHA-256.
- This is for GDPR — PCI DSS itself does not require non-cardholder PII to be encrypted, but we apply the same standard as the rest of the codebase.

### 2.7 Logging hygiene
- Request bodies are logged with `pin`, `password`, `token`, `customerName`, `customerEmail`, `customerPhone` automatically redacted.
- Stripe API errors log only `{ type, code, statusCode, requestId }` — never the full error object, which can echo customer details.
- No card data appears in any log because the server never receives any.

### 2.8 Webhook integrity
- Square membership webhooks verify HMAC signatures with `SQUARE_WEBHOOK_SIGNATURE_KEY`.
- Stripe payments are confirmed via direct server-to-Stripe `retrieve()` call rather than webhooks, so webhook signature verification is not currently in the payment path. (If a Stripe webhook is added later, it must verify with `STRIPE_WEBHOOK_SECRET` using `stripe.webhooks.constructEvent()`.)

---

## 3. Annual responsibilities

To stay compliant, complete each of these every 12 months (or sooner if anything changes):

1. **Self-Assessment Questionnaire A (SAQ A)** — download from the PCI Security Standards Council site, answer ~22 yes/no questions, sign the Attestation of Compliance.
2. **Confirm Stripe AOC is current** — log into the Stripe Dashboard → Compliance, download their latest Attestation of Compliance, keep on file.
3. **Review user access** — confirm only current managers/owners have payment-taking permissions in the staff portal; remove any leavers.
4. **Rotate `ENCRYPTION_KEY`** if there is reason to suspect compromise (rare — only if a developer with access leaves under contentious circumstances or a key was inadvertently exposed).
5. **Re-read this document** and update it if the payment flow changes.

---

## 4. What would change our scope

The following changes would expand our PCI scope beyond SAQ A and require a more detailed assessment (SAQ A-EP or SAQ D). **Do not do any of these without re-evaluating compliance:**

- Building a custom card form (input fields rendered by our app instead of Stripe Elements).
- Storing, even temporarily, the full PAN, CVV, magnetic stripe data, or PIN block.
- Routing card data through our server before sending to Stripe.
- Accepting card-present transactions with our own terminals (would shift to SAQ B/C/P2PE depending on hardware).

---

## 5. Incident response

If a card-data breach is suspected:

1. Immediately rotate `STRIPE_SECRET_KEY` from the Stripe dashboard.
2. Rotate `ENCRYPTION_KEY` and re-encrypt the `payment_log` PII columns.
3. Notify Stripe via the Dashboard support channel within 24 hours.
4. Notify the ICO within 72 hours if customer personal data is involved (UK GDPR Art. 33).
5. Preserve server logs from at least 90 days prior for investigation.

---

## 6. Key files (for the next developer)

- `app/admin-events-payments.tsx` — Stripe Elements card form (SAQ A boundary)
- `server/routes.ts` (~line 1125) — payment endpoints, idempotency, sanitised error logging
- `server/stripe.ts` — Stripe client factory
- `server/encryption.ts` — AES-256-GCM helpers
- `server/storage.ts` (~line 98) — `decryptPaymentLog` + encryption-at-rest for PII
- `server/index.ts` (~line 85) — CSP and HSTS headers
- `shared/schema.ts` — `paymentLog` table definition
