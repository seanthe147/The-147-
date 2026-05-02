# The 147 - Venue App

## Overview
The 147 app is a mobile application designed for a snooker venue, bar, and restaurant. Its primary purpose is to enhance customer engagement and streamline venue operations by offering features such as table booking, event viewing, food ordering, and loyalty rewards. It also includes a staff portal for managing various aspects of the business. The project aims to provide a modern digital experience, increase bookings, and foster repeat business.

## User Preferences
I want iterative development.
I prefer detailed explanations.

## System Architecture
The application employs a mobile-first approach with a React Native frontend built using Expo, leveraging Expo Router for navigation and React Query for state management. The backend is an Express.js server, providing RESTful API endpoints and serving static content. Data is persisted in PostgreSQL, while client-side authentication and consent states utilize `AsyncStorage`.

**Frontend:**
- **UI/UX:** Features a tab-based navigation with a brand-specific color scheme (brand blue, red, gold, dark navy) and Montserrat font.
- **Core Features:** Includes a native in-app booking system, event listings (integrated with external services or internal management), a loyalty program with Square POS integration and OTP verification, a staff portal for administrative tasks, customer accounts, and GDPR compliance features (consent banner, data export/erasure).

**Backend:**
- **API:** Provides RESTful endpoints for managing offers, push tokens, notifications, bookings, customer accounts, and loyalty programs.
- **Staff Web Dashboard:** An HTML application served by the Express backend for desktop-based staff management. Includes a global RBAC-aware search box in the topbar (`GET /api/staff/search?q=…`) that returns results across products, events, customers, bookings, memberships and staff users; each group is server-filtered so plain staff see only products and events while managers/owners see all six. Booking search is encryption-aware (id fast-path → emailHash fast-path → bounded in-memory decrypt-and-substring scan of the most recent 500 rows) because booking PII is encrypted at rest. Smoke test: `npx tsx scripts/test-global-search.ts`.
- **Staff Access Control Regression Test:** `scripts/test-staff-access-control.ts` locks down two High-severity findings — `POST /api/staff/register` must always create accounts in `pending` (the shared `STAFF_PIN` is an onboarding aid, not a credential), and the manager-only customer/booking endpoints must reject plain staff sessions with 403. Requires `STAFF_PIN` and a running backend on `PORT` (default 5000); fails closed if `STAFF_PIN` is missing. Run after any change to staff auth middleware or the routes under `/api/staff/*` and `/api/bookings/*`: `npx tsx scripts/test-staff-access-control.ts`.
- **Security:** Implements AES-256-GCM encryption for PII, scrypt-hashed PINs for staff, in-memory rate limiting, brute-force lockout, HTML escaping, Subresource Integrity (SRI), secure HTTP headers, and robust session management.

**Technical Implementations:**
- **State Management:** React Query for server state, `AsyncStorage` for local persistence.
- **Database Schema:** Defined using Drizzle ORM.
- **Push Notifications:** Utilizes Expo's push service for device token registration and admin-controlled notifications.
- **GDPR:** Comprehensive consent mechanisms, data management APIs, and retention policies.
- **Image Uploads:** Supports `multipart/form-data` uploads with validation for banner images and website hero backgrounds (compressed via `sharp`, stored as `data:` URLs in `site_settings`).
- **Website Editor (`/test-site`):** Owner-only editor in the staff dashboard lets the venue owner edit the public marketing pages without touching code. HTML files use `<!--WEB:slug:key-->default<!--/WEB-->` markers; `server/web-content.ts` substitutes them at request time from the `site_settings` KV table. Supported field types: `text` / `textarea` (inline body content, *word* renders as gold italic), `image` (CSS background fragment for hero backgrounds, marker safe inside `style=""`), `image_html` (renders a custom uploaded `<img class="custom-logo">` for the site logo), `image_url` (escaped URL for href/src attributes — also drives `<div class="rich-image" data-bg="…">` slots on snooker / dining / function-rooms / gift-cards), `attr_text` (escaped text safe inside `<title>` / `<meta content="">`), `color` (validated `#RGB` / `#RRGGBB` for theme `--blue` / `--gold` CSS variables), `nav` (JSON-encoded link list with rename / hide / reorder + automatic active-class for the current page), `bar` (announcement banner, empty hides the banner), `gallery` (JSON array of safe image URLs rendered as a responsive 3-col `.gallery-grid`; staff dashboard provides upload-add / remove / reorder controls; falls back to default placeholder when empty). The `site` pseudo-page applies across every marketing page (logo, theme colours, navigation, announcement bar, phone/email/address/hours, footer); per-page tabs cover meta title / description, hero text, the hero background image and per-section eyebrow / title / lead / body / image markers (8–15 markers per page covering the highest-value section copy). All eight pages (home, snooker, dining, events, function-rooms, gift-cards, contact, membership) share the same nav, footer and theme-colour markup. Home page also includes an "Inside The 147" gallery section.

- **Page Builder (custom marketing pages):** The Website Editor's `📄 Pages` tab lets the owner add / edit / delete custom marketing pages without code. Pages persist in the `marketing_pages` table (slug PK, title, hero eyebrow / title / sub, hero background URL, body HTML, meta title / description, sort order, hidden flag) via `GET/POST/PUT/DELETE /api/staff/marketing-pages` (owner-only). Slugs are validated against `SLUG_RE` (lowercase alphanumeric + hyphens) and a `RESERVED_PAGE_SLUGS` allowlist that blocks collisions with built-in pages and asset paths. The route fallback in `server/index.ts` tries the static template first, then falls through to `storage.getMarketingPage(slug)` and renders via `renderCustomPage`, which wraps the saved body HTML in the standard nav / hero / footer shell so custom pages inherit all site-wide overrides (logo, colours, nav, announcement, footer). Body HTML is owner-trusted but passed through `sanitizeBodyHtml` for defense-in-depth: strips `<script>` / `<style>` / `<iframe>` / `<svg>` / `<object>` / `<embed>` / `<form>` and similar tags, removes `on*=` handlers, and neutralizes `javascript:` / `vbscript:` / `data:text/html` URLs in `href` / `src` / `srcset` / `action` / `formaction` / `background` / `poster` / `xlink:href` / `data` attrs (handles quoted, unquoted, mixed-case and HTML-entity-encoded variants).
- **App Variants:** The codebase supports building two distinct app variants (customer and staff) from a single source, gated by an `EXPO_PUBLIC_APP_VARIANT` environment flag for separate App Store listings, while maintaining a single backend and database.

## Mobile Signing Credentials (EAS Builds)

Production Android and iOS signing credentials are **never committed to the repository**. They are injected at build time via EAS secrets / CI environment variables and assembled by `eas-build-pre-install.sh`.

**Required environment variables for production builds:**

| Variable | Description |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | Base64-encoded production `keystore.jks` |
| `ANDROID_KEYSTORE_PASSWORD` | Password for the keystore |
| `ANDROID_KEY_ALIAS` | Key alias within the keystore |
| `ANDROID_KEY_PASSWORD` | Password for the key |
| `IOS_DIST_P12_BASE64` | Base64-encoded `dist.p12` distribution certificate |
| `IOS_DIST_P12_PASSWORD` | Password for `dist.p12` |
| `IOS_DIST_PROVISION_BASE64` | Base64-encoded customer `dist.mobileprovision` |
| `IOS_STAFF_PROVISION_BASE64` | Base64-encoded staff `staff.mobileprovision` |
| `ASC_KEY_P8_BASE64` | Base64-encoded App Store Connect API key (`.p8`) |
| `ASC_KEY_ID` | Key ID matching the `.p8` file (e.g. `URDY56X3U2`) |

The pre-install script decodes these variables, writes the files to disk inside the build VM, and generates `credentials.json` at build time. No credential files, passwords, or key material should ever be added to version control. See `credentials.json.example` for the expected shape.

## External Dependencies
- **PostgreSQL:** Main database for all application data.
- **TicketSource:** External service for event listings.
- **OrderTab:** Embedded WebView for menu display and ordering.
- **Square POS Loyalty API:** Manages the customer loyalty program.
- **Resend:** Email service for OTPs and booking confirmations.
- **Google Fonts:** Provides the Montserrat typeface.
- **Stripe:** Used for staff-initiated payments (phone/MOTO) with Stripe Elements, requiring `STRIPE_PUBLISHABLE_KEY` and `STRIPE_SECRET_KEY`.

## Payment Sheet Performance (Square WebView)

The customer-facing in-app payment sheet (`components/SquarePaymentSheet.tsx` + `components/squarePaymentSheetHtml.ts`) is a `react-native-webview` hosting Square's Web Payments SDK. Several speed optimisations sit on top of it; if you change the payment flow, preserve them:

- **HTML resource hints:** the WebView's `<head>` includes `<link rel="preconnect">` + `<link rel="dns-prefetch">` for the Square SDK CDN (prod and sandbox), the Square tokenization endpoint (`pci-connect.squareup.com` / `pci-connect.squareupsandbox.com`), and Apple Pay's CDN, plus a `<link rel="preload" as="script" crossorigin>` for the SDK itself. The injected SDK `<script>` MUST set `s.crossOrigin = "anonymous"` for the preload to be reused — without this the browser refetches and the optimisation is wasted.
- **DNS warm-up:** `prefetchSquarePaymentSdk()` in `lib/query-client.ts` fires HEAD requests to both prod + sandbox Square CDNs and the Apple Pay CDN to warm the OS-level DNS / TLS caches. Called from the cart open effect in `app/(tabs)/order.tsx` and from the membership "Continue to Payment" branch in `app/membership.tsx`. Throttled to once per 5 minutes via `_squareWarmedAt`. Failures are silently swallowed (CORS rejections on web are expected and harmless).
- **Square config prefetch:** `/api/public/square-config` is a tier-1 prefetch in `prefetchAppData()` (not tier-2) so the cart's gating useQuery is never blocking on the Pay tap.
- **Backend parallelisation:** `buildSquareOrderBody` in `server/square.ts` runs the catalog batch-retrieve chunks AND `getSquareDeals()` in a single `Promise.all`, instead of catalog-then-deals serially. Saves ~150–400 ms per checkout.
- **Diagnostics funnel:** the WebView emits `sdk_loading` → `sdk_loaded` → `card_attached` → `paint_complete` → `payment_started` (with `method: "card" | "apple_pay" | "google_pay"`) → `payment_tokenized` → token POST. All are POSTed fire-and-forget to `/api/public/payment-sheet-diagnostics` from the React Native bridge in `SquarePaymentSheet.tsx`. The endpoint is rate-limited per IP and only logs (no DB writes). Search production logs for `[payment-sheet-diag]` to chart funnel drop-off, and use `paint_complete` ↔ `payment_tokenized` to compute end-to-end success rate by method.

## Square API Roadmap

A full audit of Square's API surface vs. our current 1,413-line `server/square.ts` integration is in **`research/square-api-opportunities.md`** (May 2026). Top-line findings — read the report before opening any Square-related ticket:

- **`Square-Version` header is two years stale** (`2024-01-18` vs current `2026-01-22`). Strong recommendation to bump early; not a hard gate — many workstreams can proceed without it.
- **Subscription dunning is partially built — needs hardening.** `server/routes.ts` already listens to `invoice.payment_failed` (in two handlers, lines 3427 and 7995), increments `failedPaymentAttempts`, freezes at attempt 3, and sends Expo push notifications. **The gap:** Square doesn't auto-retry between attempts, so the counter usually never advances; there's no in-app "update card" deep link, no email fallback, no day-30 auto-cancel. Build a server-side retry engine (+24h/+72h/+7d) that hits the existing saved card. **Before redesigning, capture one renewal cycle of webhook traffic in sandbox** to confirm whether the bumped API version delivers `invoice.payment_failed`, `invoice.scheduled_charge_failed`, or both for our merchant.
- **Vouchers = Gift Cards API**, currently unused. Issuance + redemption + balance UI + "buy as gift" flow. ~5–8 days.
- **Native discounts unused.** Today's "deals" use a custom catalog attribute the bar POS can't see; migrate to `CatalogDiscount` + `CatalogPricingRule` + `CatalogProductSet` so member discounts and happy hour auto-apply at the bar without staff action.
- **Loyalty Promotions API** unused — bonus-points campaigns ("2× points Tuesday") drive off-peak visits.
- **Saved card on file is partially built.** `server/square.ts:237` `saveCardOnFile()` is wired into `POST /api/membership/join-native` (uses `intent: 'STORE'`). The gaps: (a) extend the non-membership card flow with `intent: 'CHARGE_AND_STORE'` so guests/members can save a card during a normal order, (b) add a "Pay with •••• 4242" one-tap reorder UI in the cart that calls a new server endpoint with `source_id = card_id` and skips the WebView entirely. 4a also unlocks the dunning retry engine (4a feeds 1).
- **Webhook Subscriptions API** lets us bootstrap webhooks programmatically instead of via the dashboard, with drift detection on every deploy. Note: signature-key rotation has zero overlap window — sequence the deploy with a brief dual-key acceptance flag.
- **Customer Custom Attributes** (`vip_tier`, `allergens`, `favorite_drink`) display automatically on the Square POS customer profile screen — zero custom UI to surface "the usual?" to bar staff.
- **Inventory + Order fulfillment lifecycle** wire the bar's KDS state back to push notifications ("preparing → ready"). Note: there is no `DINE_IN` fulfillment type — use `PICKUP` with table number in `pickup_details.note`.
- **Explicitly NOT building:** Cash App Pay (US-only network), Afterpay/Clearpay BNPL (commercially wrong for £15–£40 pub orders, also MCC-dependent), migrating snooker bookings to Square Bookings API (designed for staffed appointments, not table resources), switching from Web Payments WebView to `react-native-square-in-app-payments` (loses Expo Go for ~1s gain).

Recommended phasing: Phase 1 (foundations + revenue protection) Workstreams 0–4b = ~10 days; Phase 2 (product surface) Workstreams 5–9 = ~19.5 days; Phase 3 (operational maturity) Workstreams 10–14 = ~14 days. Total programme ~43 eng-days.