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
- **Push Notifications:** Device token registration and admin-controlled notification sending.
- **GDPR:** Consent mechanisms, data export/erasure APIs, and automated data retention policies.
- **Image Uploads:** Supports `multipart/form-data` uploads for banner images with file type and size validation.

## External Dependencies
- **PostgreSQL:** Primary database for application data (offers, push tokens, bookings, user accounts).
- **TicketSource:** External integration for event listings (can be replaced by internal event management).
- **OrderTab:** Embedded WebView for displaying the venue's menu and ordering system.
- **Square POS Loyalty API:** Used for customer loyalty program management (account lookup, enrollment, points, rewards).
- **Resend:** Email service for sending OTP verification codes for loyalty program authentication and booking confirmation emails.
- **Google Fonts:** For the Montserrat typeface.

## QA & Pre-Launch Notes
- **Booking confirmation emails**: Sent automatically via Resend API when a booking is created. Email includes venue name, table details, date/time, duration, and booking reference (format: 147-XXXXX). Non-blocking — booking succeeds even if email fails.
- **Shadow deprecation fixes**: All `shadow*` style props replaced with `boxShadow` string format; `textShadow*` props replaced with `textShadow` string format across component files.
- **Package versions**: expo@~54.0.33, expo-glass-effect@~0.1.9, expo-router@~6.0.23.
- **pointerEvents deprecation**: Fixed via patch-package patches for `@react-navigation/elements@2.9.10` and `@react-navigation/bottom-tabs@7.15.5`. The patches move `pointerEvents` from View props to `style.pointerEvents`. Patches are in `patches/` directory and applied automatically via postinstall.
- **Metro watcher crash fix**: `metro.config.js` updated to exclude `.local/state/workflow-logs` from Metro's file watcher blockList, preventing ENOENT crashes when temporary workflow-log directories are created/deleted.
- **STAFF_PIN**: Environment variable required for staff master PIN login (POST /api/staff/login).