# The 147 - Venue App

## Overview
The 147 app is a mobile application for a snooker venue, bar, and restaurant. It aims to enhance customer engagement and streamline operations by offering features like table booking, event viewing, food ordering, and loyalty rewards. The project seeks to provide a modern digital experience, increase bookings, and foster repeat business.

## User Preferences
I want iterative development.
I prefer detailed explanations.

## System Architecture
The application uses a mobile-first approach with a React Native frontend (Expo, Expo Router, React Query) and an Express.js backend (RESTful APIs, static content). Data is stored in PostgreSQL, and client-side authentication uses AsyncStorage.

**Frontend:**
- **UI/UX:** Tab-based navigation, brand-specific color scheme (blue, red, gold, dark navy), and Montserrat font.
- **Core Features:** In-app booking, event listings, loyalty program (Square POS, OTP verification), staff portal, customer accounts, and GDPR compliance.

**Backend:**
- **API:** Manages offers, push notifications, bookings, customer accounts, and loyalty.
- **Staff Web Dashboard:** HTML application for staff management, featuring a global RBAC-aware search. Two background pollers keep the most time-sensitive panels live without manual refreshes: the Bookings page polls every 30s (`startBookingsPolling`/`silentRefreshBookings`) and surfaces newly arrived bookings via the existing "X new bookings arrived" toast + new-card flash; the Menu → Orders sub-tab polls every 10s (`startOrdersPolling`/`silentRefreshOrders`) so kitchen status changes — including KDS-sync `completed` flips and newly placed orders — appear in place. Both pollers are start/stopped from `navigateTo` and the matching sub-tab switcher, and both are torn down inside `showLogin()` so they can't keep firing after logout or a 401. Silent refreshes guard against malformed/non-2xx payloads (no `Array.isArray` → bail) and against date-change races on bookings (the `state.currentDate` captured at request time is re-checked before committing) so a transient API blip or a fast date-arrow tap never mislabels or blanks the table mid-shift. The dev-mode SPA catch-all in `server/index.ts` mirrors the production `serverPages` exclusion list so `/staff` (and the other server-rendered HTML pages) reach their handlers in dev instead of being proxied to Metro.
- **Security:** AES-256-GCM encryption for PII, scrypt-hashed PINs, rate limiting, brute-force lockout, HTML escaping, SRI, secure HTTP headers, and robust session management.

**Technical Implementations:**
- **State Management:** React Query for server state, AsyncStorage for local.
- **Database Schema:** Drizzle ORM.
- **Push Notifications:** Expo's push service.
- **GDPR:** Consent mechanisms, data management APIs, and retention policies.
- **Image Uploads:** `multipart/form-data` uploads with validation and compression.
- **Website Editor (`/test-site`):** Owner-only editor for public marketing pages, utilizing `<!--WEB:slug:key-->` markers for dynamic content substitution from `site_settings` KV table. Supports various field types (text, image, color, nav, gallery, etc.) and a "Page Builder" for creating custom marketing pages stored in `marketing_pages` table, rendered via `renderCustomPage` with HTML sanitization.
- **App Variants:** Supports separate customer and staff app variants from a single codebase using `EXPO_PUBLIC_APP_VARIANT`.
- **Membership Square auto-sync:** The customer membership page (`GET /api/membership/my-subscription`) now triggers `syncSquareMembershipForCustomer` on every request (throttled to once per 15 s per customer via an in-memory map in the `registerRoutes` closure; map is pruned of entries older than 60 s once it grows past 200 customers, so it can't grow unbounded). The throttle timestamp is set BEFORE the await so concurrent refetches for the same customer don't double-fire. To keep the page snappy, the sync is awaited only when the customer has no local subscription yet (the case where a Square-group membership might be hiding); existing members get fire-and-forget background sync and an immediate response. This means a customer added to a Square customer group (e.g. VIP) or signed up via Square POS sees their membership in the app the next time they open the page — they no longer have to log out and back in. Combined with `staleTime: 30s` + `refetchOnWindowFocus` + pull-to-refresh on the mobile screen, the page actively re-checks Square whenever the customer brings the app forward. `refetchOnWindowFocus` is wired up on iOS/Android by bridging React Native's `AppState` into TanStack Query's `focusManager` in `lib/query-client.ts` (otherwise that option is web-only). The discount path at checkout (`resolveMemberDiscountImpl`) was already triggering its own sync before charging, so once the local subscription is up-to-date the order discount auto-applies server-side via `buildSquareOrderBody`.
- **Personalised Greetings:** Signed-in customers see warm, time-aware greetings ("Good morning, Stuart" / "Welcome back, Stuart") across the home hero, loyalty header + body intro, book-a-table header, account header, order-confirmation title, and the membership page. All screens consume a single shared hook `hooks/useCustomerGreeting.ts` (returns `{ firstName, timeOfDay, greetingPart, greeting }` derived from `useCustomerAuth`) so wording stays consistent and guests see the original generic copy. The membership page goes deeper because members pay to be there: the ActiveMembership view shows a greeting line above the card and renders the customer's full name as the cardholder (small "MEMBER" label, big name, plan in plan-colour underneath — like a real club card), and the plan-picker hero swaps to "Hi {name} — find your plan" when a signed-in non-member opens it. Not behind a feature flag — it's a universal UX touch, not a sprint experiment.
- **Feature Flags:** Sprint-test features ship behind env-flag gates, all defaulting OFF in prod. Defined in `shared/featureFlags.ts` (typed shape) and `server/featureFlags.ts` (env reader). Public flag state is exposed via `GET /api/feature-flags` and consumed client-side via `hooks/useFeatureFlags.ts`. Current flags:
  - `FEATURE_SAVED_CARDS` — single saved card per customer + one-tap "Pay with •••• ####" CTA in the cart. Adds `GET/DELETE /api/customers/me/saved-card`, `POST /api/orders/:id/pay-with-saved-card` (IDOR-protected via `customerEmailHash` ownership check), and a `saveCard` opt-in checkbox in the Square payment sheet (`CHARGE_AND_STORE` intent).
  - `FEATURE_ORDER_PREPARING_PUSH` — sends an Expo push when staff advances an order to `preparing`.
  - `FEATURE_DIETARY_FILTERS` — surfaces `dietaryTags[]` (V/VG/GF/DF/NF) on `/api/menu` items, renders badges on `ItemCard`, adds a chip filter row above the category grid (intersection semantics — items must include every selected tag), staff-only `PUT /api/staff/menu/items/:variationId/dietary-tags`, and `PATCH /api/customers/me/dietary-filters`.
  - `FEATURE_PERSONALISED_HOME` — adds a "For you" section above the home-tab quick actions, fed by `GET /api/customers/me/home-cards` (reorder-your-last-round + dietary-reminder cards). Query is gated on flag + auth so the section disappears for guests / when off.
  - `FEATURE_KDS_SYNC` — mirrors Square KDS "Complete" taps into `app_orders` so the customer receipt and the staff portal both flip to a new `completed` terminal status without a second tap. Implemented as a new branch in the existing `POST /api/webhooks/square` handler that listens for `order.fulfillment.updated` events; only the `COMPLETED` fulfillment state is mapped (intermediate `RESERVED`/`PREPARED` states are intentionally ignored to avoid racing the staff portal's manual "Start preparing"/"Mark ready" workflow). Skips orders already in a terminal state, fires the same audit log entry + targeted push (`"Order complete 🎉"`) the staff advance route uses, and labels the action as `system:square-kds`. Requires subscribing the same Square webhook endpoint to `order.fulfillment.updated` in the Square Developer Dashboard — the existing signature key is reused.

## External Dependencies
- **PostgreSQL:** Main database.
- **TicketSource:** External event listings service.
- **OrderTab:** Embedded WebView for menu display and ordering.
- **Square POS Loyalty API:** Customer loyalty program management.
- **Resend:** Email service for OTPs and booking confirmations.
- **Google Fonts:** Montserrat typeface.
- **Stripe:** For staff-initiated payments (phone/MOTO) using Stripe Elements.