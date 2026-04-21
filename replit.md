# The 147 - Venue App — v2.6.3

## Overview
The 147 app is a mobile application for a snooker venue, bar, and restaurant, providing customers with features like table booking, event viewing, food ordering, and loyalty rewards. The app also includes a comprehensive staff portal for managing bookings, offers, notifications, and customer data. The business vision is to enhance customer engagement, streamline operations, and provide a modern digital experience for venue patrons, ultimately increasing bookings and repeat business.

## User Preferences
I want iterative development.
I prefer detailed explanations.

## System Architecture
The application features a mobile frontend built with Expo React Native, utilizing Expo Router for navigation and React Query for server state management. The backend is an Express.js server, handling API requests and serving static content. Data persistence is managed via PostgreSQL, and `AsyncStorage` is used for client-side consent and authentication states.

**Frontend:**
- **UI/UX:** Employs a tab-based navigation system with six main tabs (Home, Book, Order, Loyalty, Events, About). The design adheres to a brand-specific color scheme (brand blue, red, gold, dark navy) and uses the Montserrat font.
- **Core Features:**
    - **Booking System:** Native in-app booking flow with table selection, date/time pickers, and GDPR consent.
    - **Events:** Listings integrated with external services (e.g., TicketSource) or managed internally.
    - **Loyalty Program:** Integration with Square POS Loyalty for points lookup, enrollment, and reward redemption, secured with OTP verification via email.
    - **Staff Portal:** Authenticated gateway for administrators to manage offers, notifications, bookings, and customer data.
    - **Customer Accounts:** Users can register/login to manage their bookings and profile.
    - **GDPR Compliance:** Consent banner, privacy policy, and user rights management (export, erasure).

**Backend:**
- **API:** RESTful API endpoints for managing offers, push tokens, notifications, bookings, customer accounts, and loyalty programs.
- **Staff Web Dashboard:** A self-contained HTML application served by the Express backend for desktop-based staff management of bookings and customer messages.
- **Security:** AES-256-GCM encryption for Personally Identifiable Information (PII), scrypt-hashed PINs for staff authentication, in-memory rate limiting on public endpoints (bookings: 10/15min, contact: 5/15min, OTP: 10/15min), brute-force lockout on staff login (5 attempts → 15min block), HTML escaping for all user input in email templates, Subresource Integrity (SRI) on external scripts, comprehensive secure HTTP headers (CSP, HSTS, X-Frame-Options, nosniff, Referrer-Policy), and session management.

**Technical Implementations:**
- **State Management:** React Query for server-side data fetching and caching, `AsyncStorage` for local state persistence.
- **Database Schema:** Defined using Drizzle ORM.
- **Push Notifications:** Device token registration and admin-controlled notification sending via Expo's push service. Requires a proper EAS standalone build — push does NOT work in the Replit-wrapped Expo environment due to missing APNs credentials for `app.replit.the147`. See EAS Build Setup section below.
- **GDPR:** Consent mechanisms, data export/erasure APIs, and automated data retention policies.
- **Image Uploads:** Supports `multipart/form-data` uploads for banner images with file type and size validation.

## External Dependencies
- **PostgreSQL:** Primary database for application data (offers, push tokens, bookings, user accounts).
- **TicketSource:** External integration for event listings (can be replaced by internal event management).
- **OrderTab:** Embedded WebView for displaying the venue's menu and ordering system.
- **Square POS Loyalty API:** Used for customer loyalty program management (account lookup, enrollment, points, rewards).
- **Resend:** Email service for sending OTP verification codes for loyalty program authentication and booking confirmation emails.
- **Google Fonts:** For the Montserrat typeface.

## EAS Build Setup

### Current State (April 2026)
**Android credential strategy — multi-layer (belt-and-suspenders):**
Replit's Expo Launch build infrastructure uses an older/different version of `eas-cli` that consistently reads `credentialsSource: "local"` regardless of `eas.json`, and then looks for `credentials.json` in the project root. To handle this, three redundant layers are in place:

1. **`eas-build-pre-install.sh`** (primary fix) — runs before `build:internal` on the EAS worker. It reads four EAS project secrets (`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`) and reconstructs `credentials.json` + `credentials/android/keystore.jks` from scratch. Gracefully skips if secrets are not available.
2. **`credentials.json` committed to git** (direct fallback) — the file is tracked in git (not gitignored) and will be included in the build archive for any build that uses a recent commit.
3. **EAS remote credentials** (`credentialsSource: "remote"` in `eas.json`) — keystore stored on EAS servers (keystore ID `152c4249-c08f-4b5c-abc0-75d880af6baf`, alias `36b5163761ec2dcc8cff05b94a82462f`, JKS, linked as default for `com.the147bradford.venue`). Works when the build server has `EXPO_TOKEN` and reads our current `eas.json`.

**iOS** uses **local credentials** (`credentialsSource: "local"` in `eas.json`) to bypass EAS remote credential validation. This was required because the stored Apple API key (PRH75PPG5Z) in EAS was revoked, causing remote Apple authentication failures.

**Local credential files** (in `ios-creds/`, committed to git with gitignore exceptions):
- `ios-creds/dist.p12` — Distribution certificate (Team: 94LW5H4828, serial 7FF7BB4E8DEB3793A4B6A49C092806BC, valid 2027-03-17)
- `ios-creds/dist.mobileprovision` — Provisioning profile 4LGFPVG9S2 (AppStore, com.the147bradford.app, valid 2027-03-17)
- `credentials.json` — References above iOS credential files

**Apple API Key for submissions**: `BNL8D6UJKJ` (stored as `ASC_KEY_P8_NEW` secret, issuer `7cdddb46-b377-45c0-9cbe-e07c358d3cc5`)

### Running a new iOS build from Replit
Because of git lock file restrictions in the Replit main agent, EAS builds must be triggered via a temporary workflow:

1. Regenerate the credential files if needed (they may expire):
   ```javascript
   // Use the Apple API (key BNL8D6UJKJ) to download fresh profile content
   // Download profile 4LGFPVG9S2 from Apple API /v1/profiles/4LGFPVG9S2
   // Write P12 from EAS cert 81fdfff5 (certificateP12 + certificatePassword)
   ```

2. Create a temporary workflow in code_execution:
   ```javascript
   await configureWorkflow({
     name: "EAS iOS Build",
     command: "node -e \"require('fs').unlinkSync('/home/runner/workspace/.git/index.lock')\" 2>/dev/null; true && cd /home/runner/workspace && EXPO_TOKEN=$EXPO_TOKEN EAS_BUILD_NO_EXPO_GO_WARNING=true npx eas-cli build --platform ios --profile production --non-interactive --no-wait 2>&1 | tee /tmp/eas_workflow_build.txt; echo 'BUILD COMMAND DONE'",
     outputType: "console",
     autoStart: false
   });
   ```

3. Start the workflow using `restart_workflow({ name: "EAS iOS Build" })`

4. Wait ~90s, then read `/tmp/eas_workflow_build.txt` for the build URL

5. Remove the workflow after build is queued

### Submitting to App Store
After a successful build:
```bash
EXPO_TOKEN=$EXPO_TOKEN npx eas-cli submit --platform ios --profile production --non-interactive --latest
```
This uses the `BNL8D6UJKJ` ASC API key configured in `eas.json` submit section.

### EAS Project Details
- Project ID: `3f31dfb1-b149-43ca-ab9a-91b6d7cb230a`
- Account: `the-147`
- App Store app ID: `6760673771`
- Bundle ID: `com.the147bradford.app`
- Dashboard: https://expo.dev/accounts/the-147/projects/the-147

## QA & Pre-Launch Notes
- **Booking confirmation emails**: Sent automatically via Resend API when a booking is created. Email includes venue name, table details, date/time, duration, and booking reference (format: 147-XXXXX). Non-blocking — booking succeeds even if email fails.
- **Text shadow styles**: `textShadowColor/Offset/Radius` native props used for iOS/Android text shadows. These show a deprecation warning on web only — not relevant for Apple review.
- **Snooker availability fix**: `/api/bookings/availability` now returns consistent `{slots, totalTables}` shape for all table types (previously returned bare array for snooker, causing double-booking risk).
- **TypeScript**: `@types/pg` missing but non-breaking (tsx handles it at runtime). EAS builds use Babel, not tsc.
- **Package versions**: expo@~54.0.33, expo-glass-effect@~0.1.9, expo-router@~6.0.23.
- **pointerEvents deprecation**: Fixed via patch-package patches for `@react-navigation/elements@2.9.10` and `@react-navigation/bottom-tabs@7.15.5`. The patches move `pointerEvents` from View props to `style.pointerEvents`. Patches are in `patches/` directory and applied automatically via postinstall.
- **Metro watcher crash fix**: `metro.config.js` updated to exclude `.local/state/workflow-logs` from Metro's file watcher blockList, preventing ENOENT crashes when temporary workflow-log directories are created/deleted.
- **STAFF_PIN**: Environment variable required for staff master PIN login (POST /api/staff/login).
- **Apple compliance**: Account deletion at /account → Delete Account. Privacy policy at /privacy-policy and https://the147bradford.replit.app/privacy-policy. Push notification permission requested after 3s delay. GDPR consent banner on first launch. ITSAppUsesNonExemptEncryption=false set.
## Events & Payments (Staff Dashboard)
- New manager-only "Events & Payments" page in staff dashboard with two sub-tabs: **Sell Tickets** and **Take Payment**.
- **Sell Tickets**: Embeds the TicketSource Box Office page in an iframe. URL is read from `TICKETSOURCE_BOX_OFFICE_URL` env var (managers can paste a URL session-only via the in-page input until set as a server secret). Iframe uses `allow="payment *"` so card-entry inside the frame works. If TicketSource sends `X-Frame-Options: DENY`, the iframe won't render — fall back to "Open in new tab".
- **Take Payment**: Stripe Elements card form for staff phone/MOTO payments. Requires secrets `STRIPE_PUBLISHABLE_KEY` + `STRIPE_SECRET_KEY`. Page gracefully shows "Stripe not connected" message when missing.
- **Backend** (`server/stripe.ts`): Lazy `getStripeClient()` — only instantiates Stripe when keys present. `isStripeConfigured()` for guards.
- **Routes** (in `server/routes.ts`):
  - `GET /api/staff/payments/config` — returns `{stripeConfigured, publishableKey, boxOfficeUrl}` (auth required)
  - `POST /api/staff/payments/create-intent` — creates Stripe PaymentIntent + log row. Body: `{amountPence, description, customerName?, customerEmail?, customerPhone?, moto?}`. Sets `payment_method_options.card.moto=true` when phone payment ticked. Min £0.50 / max £100,000.
  - `POST /api/staff/payments/finalize` — updates payment log status (succeeded/failed) after Stripe.js confirmCardPayment resolves.
  - `GET /api/staff/payments/log` — last 100 transactions for the table view.
- **Schema**: `paymentLog` table (`shared/schema.ts`) — id, amountPence, currency (default gbp), description, customer fields, stripePaymentIntentId, status (pending/succeeded/failed), staff fields, failureMessage, createdAt. Migrated via `npm run db:push --force`.
- **MOTO note**: Stripe accounts need MOTO capability enabled to take card-not-present phone payments at standard rates. Without it, MOTO charges may be blocked or treated as e-commerce. Toggle in Stripe dashboard → Settings.
- **PCI**: Card numbers go directly from browser to Stripe via Stripe.js — never touch our server. Server only sees PaymentIntent IDs.

## Staff vs Customer App Split — Analysis & Recommendation (April 2026)

**Current state (single codebase, role-gated):**
- One Expo app + one Express backend serve both audiences:
  - **Customers**: `app/(tabs)/*` — book, order, gift cards, membership, account.
  - **Staff**: `app/staff*` — staff dashboard, kitchen view, manager tools, EPOS, etc.
- Auth is split server-side (`/api/customers/*` vs `/api/staff/*`) with separate tokens & DB tables, but the *binary* shipped to phones is one and the same.
- Public website (`server/templates/*` and `server/templates/test-site/*`) is served by the same Express process and shares the customer APIs (register / login / bookings / orders / membership / contact / interest).
- Cross-platform single account: web modal (`membership-page.html`), mobile app (`CustomerAuthContext.tsx` → `app/account.tsx`) and the bookings widget all hit the **same** `/api/customers/register` + `/api/customers/login` endpoints with the same 6+ char password rule and Bearer token scheme. A customer who signs up on the website can immediately sign in on the mobile app with the same credentials, see the same bookings/orders/membership, and vice versa. ✅ Verified during Task #2.

**Recommendation: Keep one codebase, but split the *published apps* into two App Store listings.**

Reasons:
1. **Reviewer & user clarity.** App Store review repeatedly flags "internal staff tools" inside a consumer app — confusing for reviewers and for customers who'd see "Kitchen Display" in their tab bar. Two listings (one consumer, one "The 147 Staff") solves this without forking the code.
2. **Code reuse stays high.** ~80% of the code (auth, networking, theming, design system, API layer, payments) is shared. Splitting bundles ≠ splitting repos. Use a single Expo project with two `app.json` build profiles + an `EXPO_PUBLIC_APP_VARIANT=staff|customer` env flag that swaps the root layout (which set of tabs/screens to register).
3. **Smaller customer download.** Customers don't need staff screens, and vice versa. Tree-shaking via the variant flag yields smaller bundles and faster cold-start.
4. **Permissions hygiene.** Staff app can request POS/printer/biometric/notification permissions that would scare a consumer install. Customer app stays lean.
5. **Independent release cadence.** Pushing a hot-fix to the kitchen view doesn't force a re-review of the consumer app, and vice versa.
6. **Single backend, single DB.** Server stays untouched — staff and customer endpoints already isolated. Web (customers) and both mobile apps continue to share `/api/customers/*` so the cross-platform single-account guarantee is preserved.

**What NOT to do:** A full repo split would double maintenance of theming, the API client, the design system and the icon/font pipeline, with no real upside given how much is shared.

**Practical next steps when this is ready to do:**
- Add `app.config`-style variants (or two `eas.json` profiles) for `customer` (bundle id `com.the147.app`) and `staff` (`com.the147.staff`).
- Gate route registration in `app/_layout.tsx` on `process.env.EXPO_PUBLIC_APP_VARIANT`.
- Ship the staff variant to internal TestFlight only; ship the customer variant publicly.
- Web (`/membership`, `/test-site/*`, `/booking-widget`) remains customer-only — no change needed.

## Public-Website Forms Audit & Cross-Platform Parity (Task #2, April 2026)

### Forms audited and their status after this task

| Surface | Endpoint | Required consent | Status |
|---|---|---|---|
| Membership join modal — `server/templates/membership-page.html` | `POST /api/customers/register` then `POST /api/membership/join` | `privacyConsent: true` | **FIXED** — added Privacy Policy + Terms & Conditions tickbox; CTA disabled until ticked; reset on each open. |
| Booking widget — `server/templates/booking-widget.html` | `POST /api/bookings` | `gdprConsent: true` | **OK** — already sends `gdprConsent: true`. |
| Test-site contact — `server/templates/test-site/contact.html` | `POST /api/contact` | `gdprConsent: true` | **FIXED** — was UI-only (`onsubmit` just reset). Wired to API with consent tickbox + error/success states. |
| Test-site membership — `server/templates/test-site/membership.html`, `membership-join.html` | `POST /api/membership/join` (auth required) | Bearer token + `privacyConsent` on register | **FIXED** — Join buttons no longer POST unauthenticated (which silently failed). They redirect to `/membership` where the proper register/sign-in + Square checkout flow lives. |
| Order page — `server/templates/test-site/order.html` | `POST /api/orders/*` (cart-only flows) | n/a | **OK** — no PII collection step in this surface. |
| Book page — `server/templates/test-site/book.html` | embeds the `booking-widget` iframe | inherited | **OK** — inherits the widget's consent UI. |
| Gift cards — `server/templates/test-site/gift-cards.html` | n/a (placeholder `href="#"` buttons, not wired to API) | n/a | **NO FIX NEEDED** — no live form to leak through. Flagged as future work. |
| Login — `panelLogin` in `membership-page.html` and `app/account.tsx` | `POST /api/customers/login` | none required by API | **OK**. |
| Test-site footer "Terms" links | n/a | n/a | **FLAGGED** — `href="#"` placeholders. There is no Terms page; only `/privacy-policy` exists. Membership consent text now links both labels to `/privacy-policy` as a fallback. Adding a real `/terms` page is a follow-up. |

### Cross-platform single-account parity (web ↔ mobile app) — VERIFIED

Both surfaces hit the **same** customer endpoints with the same contract:

- **Register**: `POST /api/customers/register`
  - Web modal (`membership-page.html` → `doRegister()`): sends `{ name, email, phone, password, privacyConsent: true }` ✅
  - Mobile app (`contexts/CustomerAuthContext.tsx` → `register()`): sends the same shape with `privacyConsent: true` ✅
  - Server validates `privacyConsent === true` (`server/routes.ts` ~L4122-4128) — 400 with "You must agree to the Privacy Policy" otherwise. Verified live via curl: with consent → 201; without → 400.

- **Login**: `POST /api/customers/login`
  - Same email/password (6+ chars), same Bearer token returned, same 30-day session.

- **Bookings / Orders / Membership**: all `/api/customers/me/*` endpoints accept the same Bearer token; both surfaces query the same DB tables (`customers`, `customer_bookings`, `customer_orders`, `customer_memberships`).

- **Live verification (curl against local backend, April 20 2026)**:
  - `POST /api/customers/register` with `privacyConsent: true` → 201 + token returned ✅
  - Same endpoint without consent → 400 + correct error message ✅
  - Server log confirms requests routed correctly through the API layer.

**Conclusion**: a customer registering on the website can immediately sign in on the mobile app (and vice versa), see the same bookings, orders and active membership. No data divergence between platforms.

### Out of scope (proposed as follow-ups)
- Email-verification step after signup (typo recovery).
- Real Terms of Service page (`/terms`) and footer link cleanup.
- Splitting staff tools into a separate App Store listing (see "Staff vs Customer App Split" section above).

## Staff/Customer Build Variants (Task #4, April 2026)

Infrastructure to ship the same codebase as **two App Store listings**: one for customers, one for staff. Single backend, single DB — only the *binary* differs.

- **Variant flag**: `EXPO_PUBLIC_APP_VARIANT` env var (`customer` | `staff` | unset = combined). Read in `lib/app-variant.ts` which exports `isStaffVariant`, `showCustomerRoutes`, `showStaffRoutes`.
- **Route gating** (`app/_layout.tsx`):
  - Customer variant → registers `(tabs)`, `account`, `membership`, plus all staff routes (see note below).
  - Staff variant → registers staff-only screens (`staff-portal`, `staff-hr`, `admin-*`); `(tabs)`, `account`, `membership` are not registered. Initial route is `staff-hr` (clock in/out) which redirects to `/staff-portal` for login if unauth.
  - Combined (no flag) → registers everything (legacy / dev behavior).
- **Important — staff still visible in customer build for now**: `lib/app-variant.ts` deliberately keeps `showStaffRoutes = true` even in the customer variant until the dedicated staff app is approved and live on the App Store. The `app/(tabs)/about.tsx` Staff Portal link is also gated on `showStaffRoutes`. Once the staff app is live, change the single line in `lib/app-variant.ts` (commented in the file) to remove staff from customer downloads.
- **Build profiles** (`eas.json`):
  - `production` / `preview` / `production-android` — customer variant (`EXPO_PUBLIC_APP_VARIANT=customer`), bundle id `com.the147bradford.app`, public App Store distribution.
  - `production-staff` / `preview-staff` — staff variant (`EXPO_PUBLIC_APP_VARIANT=staff`), `distribution: internal` (TestFlight internal only). Submit profile `production-staff` defined; `ascAppId` left blank — fill in once the staff App Store record is created.
- **Bundle id swap** (`eas-build-pre-install.sh`): static `app.json` (required for Expo Launch). When `EXPO_PUBLIC_APP_VARIANT=staff`, the pre-install script rewrites `app.json` on the EAS worker to use:
  - `name: "The 147 Staff"`, `slug: "the-147-staff"`, `scheme: "the147staff"`
  - `ios.bundleIdentifier: "com.the147bradford.staff"`
  - `android.package: "com.the147bradford.staff"`
- **Backend / web / DB**: untouched. Both variants hit the same `/api/customers/*` and `/api/staff/*` endpoints. Cross-platform single-account guarantee preserved.

### Staff App Store listing & signing — status (Task #11, April 2026)

Provisioned via App Store Connect API using key `URDY56X3U2`:

- **Bundle ID** `com.the147bradford.staff` (record id `U7HC8688XM`, Team `94LW5H4828`) — created.
- **iOS App Store provisioning profile** `the147 Staff AppStore` (id `5KBD9KPHJU`, valid until 2027-03-17) — created and saved to `ios-creds/staff.mobileprovision` (committed via the existing `!ios-creds/*.mobileprovision` gitignore exception).
- **iOS distribution certificate** — reuses the existing `ios-creds/dist.p12` (cert id `9955JYGA8A`, "iOS Distribution: Cue Gardens Ltd", valid 2027-03-17). The same cert can sign multiple bundle ids on the same Apple team, so no new `.p12` is needed.
- **`eas-build-pre-install.sh`** — now variant-aware. When `EXPO_PUBLIC_APP_VARIANT=staff`, `credentials.json` is written with `provisioningProfilePath` pointing at `ios-creds/staff.mobileprovision`; otherwise it points at the customer `dist.mobileprovision`. Both variants share the same `dist.p12`.
- **`eas.json` → `submit.production-staff.ios.ascAppId`** — placeholder `REPLACE_WITH_STAFF_ASC_APP_ID`. Must be filled in once the App Store Connect app record is created (see manual step below).

#### Remaining manual step (cannot be done via API)
The App Store Connect REST API does **not** allow programmatic creation of new app records. A human must create the staff app once in App Store Connect:

1. Sign in to App Store Connect → My Apps → `+` → New App.
2. Platform: iOS. Bundle ID: select `com.the147bradford.staff` (already registered). Name: `The 147 Staff`. Primary Language: English (UK). SKU: `the147staff001` (or any unique string). User Access: Full Access.
3. Copy the new app's numeric Apple ID (visible under App Information → General Information → "Apple ID") and replace `REPLACE_WITH_STAFF_ASC_APP_ID` in `eas.json` → `submit.production-staff.ios.ascAppId`.
4. Trigger the first staff build: `eas build --profile production-staff --platform ios` then `eas submit --profile production-staff --platform ios --latest`. The build will pick up `staff.mobileprovision` automatically thanks to the variant-aware pre-install script.
5. Once the staff app is approved and live on TestFlight/the Store, flip `showStaffRoutes` in `lib/app-variant.ts` so the customer build no longer ships staff screens, and bump the customer app version.
