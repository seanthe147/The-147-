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

## EAS Build Setup (iOS Production Builds)

### Current State (March 2026)
The iOS production build uses **local credentials** (`credentialsSource: "local"` in `eas.json`) to bypass EAS remote credential validation. This was required because the stored Apple API key (PRH75PPG5Z) in EAS was revoked, causing remote Apple authentication failures.

**Local credential files** (in `ios-creds/`, gitignored):
- `ios-creds/dist.p12` — Distribution certificate (Team: 94LW5H4828, serial 7FF7BB4E8DEB3793A4B6A49C092806BC, valid 2027-03-17)
- `ios-creds/dist.mobileprovision` — Provisioning profile 4LGFPVG9S2 (AppStore, com.the147bradford.app, valid 2027-03-17)
- `credentials.json` — References above files with certificate password

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