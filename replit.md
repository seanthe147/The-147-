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
- **Staff Web Dashboard:** HTML application for staff management, featuring a global RBAC-aware search.
- **Security:** AES-256-GCM encryption for PII, scrypt-hashed PINs, rate limiting, brute-force lockout, HTML escaping, SRI, secure HTTP headers, and robust session management.

**Technical Implementations:**
- **State Management:** React Query for server state, AsyncStorage for local.
- **Database Schema:** Drizzle ORM.
- **Push Notifications:** Expo's push service.
- **GDPR:** Consent mechanisms, data management APIs, and retention policies.
- **Image Uploads:** `multipart/form-data` uploads with validation and compression.
- **Website Editor (`/test-site`):** Owner-only editor for public marketing pages, utilizing `<!--WEB:slug:key-->` markers for dynamic content substitution from `site_settings` KV table. Supports various field types (text, image, color, nav, gallery, etc.) and a "Page Builder" for creating custom marketing pages stored in `marketing_pages` table, rendered via `renderCustomPage` with HTML sanitization.
- **App Variants:** Supports separate customer and staff app variants from a single codebase using `EXPO_PUBLIC_APP_VARIANT`.
- **Feature Flags:** Sprint-test features ship behind env-flag gates, all defaulting OFF in prod. Defined in `shared/featureFlags.ts` (typed shape) and `server/featureFlags.ts` (env reader). Public flag state is exposed via `GET /api/feature-flags` and consumed client-side via `hooks/useFeatureFlags.ts`. Current flags:
  - `FEATURE_SAVED_CARDS` — single saved card per customer + one-tap "Pay with •••• ####" CTA in the cart. Adds `GET/DELETE /api/customers/me/saved-card`, `POST /api/orders/:id/pay-with-saved-card` (IDOR-protected via `customerEmailHash` ownership check), and a `saveCard` opt-in checkbox in the Square payment sheet (`CHARGE_AND_STORE` intent).
  - `FEATURE_ORDER_PREPARING_PUSH` — sends an Expo push when staff advances an order to `preparing`.
  - `FEATURE_DIETARY_FILTERS` — surfaces `dietaryTags[]` (V/VG/GF/DF/NF) on `/api/menu` items, renders badges on `ItemCard`, adds a chip filter row above the category grid (intersection semantics — items must include every selected tag), staff-only `PUT /api/staff/menu/items/:variationId/dietary-tags`, and `PATCH /api/customers/me/dietary-filters`.
  - `FEATURE_PERSONALISED_HOME` — adds a "For you" section above the home-tab quick actions, fed by `GET /api/customers/me/home-cards` (reorder-your-last-round + dietary-reminder cards). Query is gated on flag + auth so the section disappears for guests / when off.

## External Dependencies
- **PostgreSQL:** Main database.
- **TicketSource:** External event listings service.
- **OrderTab:** Embedded WebView for menu display and ordering.
- **Square POS Loyalty API:** Customer loyalty program management.
- **Resend:** Email service for OTPs and booking confirmations.
- **Google Fonts:** Montserrat typeface.
- **Stripe:** For staff-initiated payments (phone/MOTO) using Stripe Elements.