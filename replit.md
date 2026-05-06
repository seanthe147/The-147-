# The 147 - Venue App

## Run & Operate
_Populate as you build_

## Stack
- **Frontend:** React Native (Expo, Expo Router), React Query
- **Backend:** Express.js
- **Database:** PostgreSQL (Drizzle ORM)
- **Validation:** _Populate as you build_
- **Build Tool:** _Populate as you build_

## Where things live
- `shared/` - Shared types, utilities, and constants for frontend and backend.
- `server/` - Backend API, staff web dashboard, and webhook handlers.
- `app/` - React Native frontend application.
- `lib/query-client.ts` - TanStack Query `focusManager` bridging for React Native `AppState`.
- `hooks/useCustomerGreeting.ts` - Customer greeting logic.
- `shared/featureFlags.ts` - Typed feature flag definitions.
- `server/featureFlags.ts` - Server-side feature flag environment reader.
- `server/routes.ts` - API route definitions and webhook handlers.
- `db/schema.ts` - Database schema definition.

## Architecture decisions
- **Mobile-first approach:** React Native for broad platform reach and consistent UX.
- **Micro-frontend for staff:** Staff web dashboard as a separate HTML application for distinct functionality and security.
- **Feature Flag driven development:** New features are shipped behind environment flags, defaulting off in production, for controlled rollout and testing.
- **Throttled Square membership sync:** Customer membership status is synced from Square on every page request, but throttled to prevent abuse and maintain responsiveness.
- **Real-time staff updates:** Background polling for bookings and orders in the staff dashboard ensures staff see the latest information without manual refreshes.

## Product
- In-app booking for snooker tables.
- Event listings from TicketSource.
- Food and drink ordering via embedded WebView.
- Loyalty program integration with Square POS.
- Customer accounts with GDPR compliance.
- Staff portal for management and operations.
- Owner-only website editor for public marketing pages.
- Kiosk mode for guest orders and Square Open Ticket integration.
- Kitchen vs Bar specific ordering logic and availability.

## User preferences
I want iterative development.
I prefer detailed explanations.

## Gotchas
- The staff dashboard's bookings and orders pollers are torn down on logout/401 to prevent continued firing.
- Silent refreshes in staff dashboard guard against malformed API payloads and date-change races.
- Square Open Ticket integration: `ticket_name` is canonical for Square POS and capped at 30 characters.
- Square for Restaurants routes orders with `PICKUP` fulfillment to "Online Orders," which are hidden from "Open Orders" where staff look. Kiosk orders avoid `PICKUP` fulfillment.
- `computeScheduleStatus()` checks both today's window and "yesterday's overflow window" for schedules spanning midnight.

## Pointers
- [React Native Documentation](https://reactnative.dev/docs)
- [Expo Documentation](https://docs.expo.dev/)
- [React Query Documentation](https://tanstack.com/query/latest)
- [Express.js Documentation](https://expressjs.com/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Drizzle ORM Documentation](https://orm.drizzle.team/docs)
- [Square POS API Documentation](https://developer.squareup.com/docs/api)
- [Stripe Elements Documentation](https://stripe.com/docs/elements)