# The 147 - Venue App

## Overview
Mobile app for The 147 (www.the147.co.uk) - a snooker venue, bar, and restaurant. Built with Expo React Native + Express backend.

## Features
- **Home**: Hero branding, quick actions, offers banner, featured events, today's hours
- **Book a Table**: Native in-app booking flow (select table, date/time, contact details, GDPR consent, confirm)
- **Events**: Event listings with external TicketSource integration
- **Order**: Embedded WebView to OrderTab menu
- **About**: Venue info, facilities grid, opening hours, contact/social links, legal & privacy links
- **Staff Portal**: PIN-authenticated gateway to all admin tools (offers, notifications) with session management
- **Bookings Calendar**: Staff admin screen to view/manage bookings by date with week navigation, cancel/delete actions
- **Offers Management**: Admin interface to create/edit/delete promotional offers (protected by staff auth)
- **GDPR Compliance**: Consent banner on first launch, privacy policy screen, consent management with revoke option
- **Push Notifications**: Admin interface to compose and send push notifications (protected by staff auth)

## Architecture
- Frontend: Expo Router with tab navigation (5 tabs: Home, Book, Events, Order, About)
- Backend: Express on port 5000 (landing page + API)
- Database: PostgreSQL for offers, push tokens, notification history, and bookings
- State: React Query for server state, AsyncStorage for consent preferences
- Font: Montserrat (Google Fonts)
- Colors: Brand blue (#0047AB), red (#DF3131), gold (#D4A843), dark navy (#0A1628)

## Project Structure
- `app/(tabs)/` - Tab screens (index, book, events, order, about)
- `app/_layout.tsx` - Root layout with providers (QueryClient, Consent, StaffAuth, Notification, TabBar)
- `app/staff-portal.tsx` - Staff portal with PIN login gate and admin dashboard
- `app/admin-bookings.tsx` - Staff bookings calendar with week navigation (modal, auth-guarded)
- `app/admin-offers.tsx` - Admin offers management screen (modal, auth-guarded)
- `app/admin-notifications.tsx` - Push notification admin screen (modal, auth-guarded)
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
- `server/routes.ts` - API routes (offers CRUD, push tokens, notifications, bookings)
- `server/storage.ts` - Database storage layer
- `server/templates/staff-dashboard.html` - Staff web dashboard for PC-based booking management

## API Endpoints
- `POST /api/staff/login` - Authenticate with staff PIN, returns session token
- `POST /api/staff/logout` - Invalidate session token
- `GET /api/staff/verify` - Verify session token validity (auth required)
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

## Staff Web Dashboard
- Served at GET `/staff` on port 5000 (self-contained HTML, no external dependencies)
- PIN login, then full booking management: view by date, create, edit, cancel, delete
- Optimized for desktop/PC use by staff
- Access URL: `{domain}/staff` (goes through Express backend on port 5000)

## GDPR & Data Protection
- Consent banner shown on first app launch with "Essential Only" and "Accept All" options
- Privacy policy accessible from consent banner and About page
- Consent preferences stored locally in AsyncStorage (never sent to server)
- Users can revoke consent at any time from the privacy policy screen
- Policy covers UK GDPR rights (Articles 15-21), ICO complaint info, third-party disclosures
- Platform-specific dialogs: window.confirm() on web, Alert.alert on native

## Technical Notes
- Query cache uses refetchQueries (not invalidateQueries) due to staleTime: Infinity config
- Delete confirmations use Platform.OS check for web vs native dialog handling
- WebView tabs (Order) auto-hide tab bar after 1.5s delay

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
