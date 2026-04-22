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
- **Image Uploads:** Supports `multipart/form-data` uploads with validation for banner images.
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