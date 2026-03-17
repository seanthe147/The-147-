# The 147 - Venue App

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
- **Security:** AES-256-GCM encryption for Personally Identifiable Information (PII), scrypt-hashed PINs for staff authentication, rate limiting, secure HTTP headers, and session management.

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

## EAS Build Setup (Required for Push Notifications)

Push notifications require a native standalone build via EAS (Expo Application Services). The `eas.json` build profiles are already configured. Follow these steps from your own computer (any OS — EAS builds in the cloud):

### One-time setup
1. **Install EAS CLI**: `npm install -g eas-cli`
2. **Create a free Expo account** at https://expo.dev and login: `eas login`
3. **Link this project**: In the project directory run `eas init` — this will print a `projectId` UUID
4. **Add the projectId to app.json**: Replace `"YOUR_EAS_PROJECT_ID"` in the `extra.eas.projectId` field with the UUID from step 3

### Android push notifications (free — no Apple account needed)
5. **Create a Firebase project** at https://console.firebase.google.com
6. Add an Android app with package name `com.the147.app`
7. Download `google-services.json` and place it in the project root
8. Run: `eas build --platform android --profile preview` → generates a direct-install APK

### iOS push notifications (requires Apple Developer account, £99/year)
9. **Connect your Apple Developer account** to EAS: `eas credentials --platform ios`
10. EAS will automatically handle the APNs certificate
11. Run: `eas build --platform ios --profile preview` → generates a TestFlight build

### Distributing to club members
- **Android**: EAS gives a QR code / download link for the APK — members tap to install
- **iOS**: Upload to TestFlight and send members an invitation link

### After setup
Once members install the standalone build, their push tokens will use `com.the147.app` (with valid credentials) instead of Replit's bundle ID. Notifications will then deliver correctly.

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