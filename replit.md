# The 147 - Venue App

## Overview
Mobile app for The 147 (www.the147.co.uk) - a snooker venue, bar, and restaurant. Built with Expo React Native + Express backend.

## Features
- **Home**: Hero branding, quick actions, offers banner, featured events, today's hours
- **Book a Table**: Embedded WebView to the147.co.uk booking system
- **Events**: Event listings with external TicketSource integration
- **Order**: Embedded WebView to OrderTab menu
- **About**: Venue info, facilities grid, opening hours, contact/social links, legal & privacy links
- **Offers Management**: Admin interface to create/edit/delete promotional offers (accessible from About page)
- **GDPR Compliance**: Consent banner on first launch, privacy policy screen, consent management with revoke option

## Architecture
- Frontend: Expo Router with tab navigation (5 tabs: Home, Book, Events, Order, About)
- Backend: Express on port 5000 (landing page + API)
- Database: PostgreSQL for offers data
- State: React Query for server state, AsyncStorage for consent preferences
- Font: Montserrat (Google Fonts)
- Colors: Brand blue (#0047AB), red (#DF3131), gold (#D4A843), dark navy (#0A1628)

## Project Structure
- `app/(tabs)/` - Tab screens (index, book, events, order, about)
- `app/_layout.tsx` - Root layout with providers (QueryClient, Consent, TabBar)
- `app/admin-offers.tsx` - Admin offers management screen (modal)
- `app/privacy-policy.tsx` - Privacy policy & UK GDPR info screen (modal)
- `components/ConsentBanner.tsx` - GDPR consent banner overlay
- `components/ErrorBoundary.tsx` - Error boundary component
- `contexts/ConsentContext.tsx` - Consent state management with AsyncStorage
- `contexts/TabBarContext.tsx` - Tab bar visibility management
- `lib/data.ts` - Static data (events, table types, time slots, opening hours)
- `lib/query-client.ts` - React Query client configuration
- `constants/colors.ts` - Theme colors
- `shared/schema.ts` - Database schema (Drizzle ORM)
- `server/routes.ts` - API routes (offers CRUD)
- `server/storage.ts` - Database storage layer

## API Endpoints
- `GET /api/offers` - List all offers
- `POST /api/offers` - Create a new offer
- `PUT /api/offers/:id` - Update an offer
- `DELETE /api/offers/:id` - Delete an offer

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
- WebView tabs (Book, Order) auto-hide tab bar after 1.5s delay

## Recent Changes
- Feb 2026: Initial build with all tabs, booking flow, events/tickets, about page
- Feb 2026: Added dynamic offers management with admin interface and PostgreSQL backend
- Feb 2026: Added UK GDPR compliance - consent banner, privacy policy, consent management
