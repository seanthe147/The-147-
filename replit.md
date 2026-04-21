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

## External Dependencies
- **PostgreSQL:** Main database for all application data.
- **TicketSource:** External service for event listings.
- **OrderTab:** Embedded WebView for menu display and ordering.
- **Square POS Loyalty API:** Manages the customer loyalty program.
- **Resend:** Email service for OTPs and booking confirmations.
- **Google Fonts:** Provides the Montserrat typeface.
- **Stripe:** Used for staff-initiated payments (phone/MOTO) with Stripe Elements, requiring `STRIPE_PUBLISHABLE_KEY` and `STRIPE_SECRET_KEY`.