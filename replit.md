# The 147 - Venue App

## Overview
Mobile app for The 147 (www.the147.co.uk) - a snooker venue, bar, and restaurant. Built with Expo React Native + Express backend.

## Features
- **Home**: Hero branding, quick actions, offers banner, featured events, today's hours
- **Book a Table**: Native in-app booking flow (select table, date/time, contact details, GDPR consent, confirm)
- **Events**: Event listings with external TicketSource integration
- **Order**: Embedded WebView to OrderTab menu
- **About**: Venue info, facilities grid, opening hours, contact/social links, legal & privacy links
- **Staff Portal**: Username + PIN authenticated gateway to all admin tools (offers, notifications) with session management
- **Bookings Calendar**: Staff admin screen to view/manage bookings by date with week navigation, cancel/delete actions
- **Offers Management**: Admin interface to create/edit/delete promotional offers (protected by staff auth)
- **GDPR Compliance**: Consent banner on first launch, privacy policy screen, consent management with revoke option
- **Push Notifications**: Admin interface to compose and send push notifications (protected by staff auth)
- **Loyalty Rewards**: Square POS Loyalty integration - customers can look up points balance, enroll, and view available rewards

## Architecture
- Frontend: Expo Router with tab navigation (6 tabs: Home, Book, Order, Loyalty, Events, About)
- Backend: Express on port 5000 (landing page + API)
- Database: PostgreSQL for offers, push tokens, notification history, and bookings
- State: React Query for server state, AsyncStorage for consent preferences
- Font: Montserrat (Google Fonts)
- Colors: Brand blue (#0047AB), red (#DF3131), gold (#D4A843), dark navy (#0A1628)

## Project Structure
- `app/(tabs)/` - Tab screens (index, book, order, loyalty, events, about)
- `app/_layout.tsx` - Root layout with providers (QueryClient, Consent, StaffAuth, Notification, TabBar)
- `app/staff-portal.tsx` - Staff portal with PIN login gate and admin dashboard
- `app/admin-bookings.tsx` - Staff bookings calendar with week navigation (modal, auth-guarded)
- `app/admin-offers.tsx` - Admin offers management screen (modal, auth-guarded)
- `app/admin-notifications.tsx` - Push notification admin screen (modal, auth-guarded)
- `app/admin-banner.tsx` - Admin banner images management screen (modal, auth-guarded) - add/remove/reorder/toggle multiple banner images
- `app/contact.tsx` - Contact Us form screen (modal)
- `app/privacy-policy.tsx` - Privacy policy & UK GDPR info screen (modal)
- `components/ConsentBanner.tsx` - GDPR consent banner overlay
- `components/ErrorBoundary.tsx` - Error boundary component
- `contexts/ConsentContext.tsx` - Consent state management with AsyncStorage
- `contexts/StaffAuthContext.tsx` - Staff authentication state management with AsyncStorage
- `contexts/NotificationContext.tsx` - Push notification registration and handling
- `contexts/TabBarContext.tsx` - Tab bar visibility management
- `lib/data.ts` - Static data (events, table types, time slots, opening hours)
- `lib/query-client.ts` - React Query client configuration
- `constants/colors.ts` - Theme colors
- `shared/schema.ts` - Database schema (Drizzle ORM)
- `server/routes.ts` - API routes (offers CRUD, push tokens, notifications, bookings, loyalty)
- `server/square.ts` - Square POS API client (loyalty program, accounts, points, rewards)
- `server/storage.ts` - Database storage layer
- `server/templates/staff-dashboard.html` - Staff web dashboard for PC-based booking management

## API Endpoints
- `POST /api/staff/register` - Create staff account (requires master PIN, username, PIN, optional display name)
- `POST /api/staff/login` - Authenticate with username + PIN, returns session token
- `POST /api/staff/logout` - Invalidate session token
- `GET /api/staff/verify` - Verify session token validity (auth required)
- `GET /api/staff/users` - List all active staff users (auth required)
- `POST /api/staff/migrate-encryption` - Encrypt existing plaintext customer data (auth required)
- `GET /api/offers` - List all offers
- `POST /api/offers` - Create a new offer (auth required)
- `PUT /api/offers/:id` - Update an offer (auth required)
- `DELETE /api/offers/:id` - Delete an offer (auth required)
- `POST /api/push-tokens` - Register a device push token
- `GET /api/push-tokens` - List all registered push tokens (auth required)
- `DELETE /api/push-tokens/:token` - Remove a push token (auth required)
- `POST /api/notifications/send` - Send push notification to all devices (auth required)
- `GET /api/notifications/history` - Get notification send history (auth required)
- `POST /api/bookings` - Create a new table booking (public)
- `GET /api/bookings` - List all bookings, optionally filter by ?date=YYYY-MM-DD (auth required)
- `GET /api/bookings/availability` - Check slot availability for ?date=X&tableType=Y (public)
- `GET /api/bookings/:id` - Get a single booking (auth required)
- `PATCH /api/bookings/:id/status` - Update booking status (auth required)
- `PUT /api/bookings/:id` - Update a booking with conflict detection (auth required)
- `DELETE /api/bookings/:id` - Delete a booking (auth required)
- `GET /api/settings` - Get all site settings (public)
- `GET /api/settings/:key` - Get a single setting (public)
- `PUT /api/settings/:key` - Update a setting (auth required)
- `GET /api/banner-images` - List active banner images sorted by order (public)
- `GET /api/banner-images/all` - List all banner images including hidden (auth required)
- `POST /api/banner-images` - Add a new banner image (auth required)
- `PUT /api/banner-images/:id` - Update a banner image (auth required)
- `DELETE /api/banner-images/:id` - Delete a banner image (auth required)
- `POST /api/contact` - Submit a contact form message (public)
- `GET /api/contact` - List all contact messages (auth required)
- `PATCH /api/contact/:id/status` - Update contact message status (auth required)

## API Endpoints - Loyalty (Square POS)
- `GET /api/loyalty/program` - Get loyalty program details and reward tiers (public)
- `POST /api/loyalty/send-code` - Send OTP verification code to email address (requires email + phone) (public)
- `POST /api/loyalty/verify-code` - Verify OTP code with email + phone, returns loyalty session token (public)
- `GET /api/loyalty/session` - Check loyalty session validity (loyalty session required)
- `POST /api/loyalty/logout` - Invalidate loyalty session (loyalty session required)
- `POST /api/loyalty/lookup` - Look up loyalty account (loyalty session required)
- `POST /api/loyalty/enroll` - Enroll a new loyalty account (loyalty session required)
- `POST /api/loyalty/points/add` - Add points to an account (staff auth required)
- `POST /api/loyalty/points/adjust` - Adjust points with reason (staff auth required)
- `POST /api/loyalty/redeem` - Redeem a reward tier (staff auth required)

## Staff Web Dashboard
- Served at GET `/staff` on port 5000 (self-contained HTML, no external dependencies)
- Username + PIN login, then full booking management: view by date, create, edit, cancel, delete
- Optimized for desktop/PC use by staff
- Access URL: `{domain}/staff` (goes through Express backend on port 5000)

## GDPR & Data Protection
- Consent banner shown on first app launch with "Essential Only" and "Accept All" options
- Privacy policy accessible from consent banner and About page
- Consent preferences stored locally in AsyncStorage (never sent to server)
- Users can revoke consent at any time from the privacy policy screen
- Policy covers UK GDPR rights (Articles 15-21), ICO complaint info, third-party disclosures
- Platform-specific dialogs: window.confirm() on web, Alert.alert on native
- **Data Subject Rights API**: Export (Article 15), Erasure (Article 17) endpoints
- **Automated Retention**: 90-day anonymisation of old booking personal data
- **Staff GDPR Panel**: Dashboard tools for data lookup, export, erase, and retention cleanup

## Security
- **Customer data encryption**: AES-256-GCM encryption for PII (name, email, phone) with SHA-256 email hashing for searchable lookups
- **Staff authentication**: Individual username + PIN accounts with scrypt-hashed PINs (64-byte derived key), timing-safe verification
- **Staff registration**: Requires venue master PIN (STAFF_PIN env var) to create accounts
- Rate limiting on staff login: 5 attempts per 15-minute window per IP
- Secure HTTP headers: CSP, X-Frame-Options, X-Content-Type-Options, X-XSS-Protection
- Session tokens expire after 8 hours with cleanup endpoint, linked to staff user accounts
- XSS protection in staff dashboard via HTML entity escaping
- JSON body size limit: 100kb
- Encryption migration endpoint to encrypt existing plaintext data

## Technical Notes
- Query cache uses refetchQueries (not invalidateQueries) due to staleTime: Infinity config
- Delete confirmations use Platform.OS check for web vs native dialog handling
- WebView tabs (Order) auto-hide tab bar after 1.5s delay

## API Endpoints - GDPR
- `GET /api/gdpr/export?email=X` - Export all booking data for email (Article 15 right of access)
- `DELETE /api/gdpr/erase` - Delete all booking data for email (Article 17 right to erasure, auth required)
- `POST /api/gdpr/retention-cleanup` - Anonymise bookings older than 90 days, clear expired sessions (auth required)

## Recent Changes
- Feb 2026: Initial build with all tabs, booking flow, events/tickets, about page
- Feb 2026: Added dynamic offers management with admin interface and PostgreSQL backend
- Feb 2026: Added UK GDPR compliance - consent banner, privacy policy, consent management
- Feb 2026: Added push notifications - admin compose/send screen, device registration, notification history
- Feb 2026: Added staff portal with PIN authentication, session tokens, auth guards on all admin endpoints
- Feb 2026: Added native in-app booking system with table selection, date/time picker, GDPR consent, availability checking
- Feb 2026: Added staff bookings calendar with week navigation, day selection, booking management (cancel/delete)
- Feb 2026: Added staff web dashboard at /staff for PC-based booking management with PIN login, create/edit/delete bookings
- Feb 2026: Added PUT /api/bookings/:id endpoint for full booking editing with conflict detection
- Feb 2026: Added security hardening - rate limiting, timing-safe PIN, CSP headers, session expiry
- Feb 2026: Added GDPR data subject rights - export, erasure, retention cleanup APIs and staff dashboard tools
- Feb 2026: Updated privacy policy with booking data collection, 90-day retention, legal bases
- Feb 2026: Added AES-256-GCM encryption for customer PII (name, email, phone) with SHA-256 email hashing
- Feb 2026: Added staff user accounts with username + PIN authentication, scrypt-hashed PINs
- Feb 2026: Updated staff portal and web dashboard with username login and account registration
- Feb 2026: Added database-backed event management replacing TicketSource integration
- Feb 2026: Added "What's On" tab to Events page for weekly recurring events with day-of-week grouping
- Feb 2026: Events support two types: one-off (with specific date) and weekly (with day of week)
- Feb 2026: Added Square POS Loyalty integration - program info, account lookup/enroll, points management, reward redemption
- Feb 2026: Added Loyalty tab with phone-based account lookup, enrollment, points display, and reward tiers
- Feb 2026: Added OTP email verification for loyalty - 6-digit code sent via Resend email, 5-min expiry, 30-day session persistence
- Mar 2026: Replaced offers carousel on home page with banner images carousel - staff can add/remove/reorder/toggle banner images from admin portal
- Mar 2026: Fixed Order tab navigation - removed tab bar hiding/overlay that trapped users; added bottom padding for tab bar clearance
