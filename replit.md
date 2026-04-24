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
- **Staff Web Dashboard:** An HTML application served by the Express backend for desktop-based staff management.
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