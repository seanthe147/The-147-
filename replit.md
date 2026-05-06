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
- `server/square.ts` - Square POS API wrapper (OAuth, terminal, web payments, subscriptions).
- `server/teya.ts` - Teya POSLink API wrapper (OAuth2 Auth Code, payment requests, SSE status stream, receipt printing).
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
- Square POS / Square for Restaurants apps filter the on-device **dine-in Open Tickets** list by the immutable OAuth `application_id` Square stamps on every order — `source.name` is settable but ignored by this filter. So API-created orders **cannot** be made to appear in the dine-in Open Tickets tab regardless of fulfillment shape or source spoof. The one tab that DOES surface outside-app orders on the till is **"Online Orders / Pickup"**, which keys on `PICKUP` fulfillment. Therefore: all kiosk + online-checkout orders use `PICKUP/PROPOSED` fulfillment + `source.name = "Point of Sale"` (for reporting consistency). Unpaid orders sit in the Pickup queue for staff to take payment; once paid (Teya success / Square Terminal / staff Mark Paid), `payOrderWithCashTender` attaches a `CASH` tender via `POST /v2/payments` which closes the Pickup ticket and routes the order to the **KDS** based on item categories.
- `computeScheduleStatus()` checks both today's window and "yesterday's overflow window" for schedules spanning midnight.
- Teya has NO webhooks — payment status arrives via Server-Sent Events on `GET /poslink/v2/payment-requests/{id}`. The kiosk-checkout route opens the SSE stream in the background; if the server restarts mid-payment the listener is lost (the order stays counter-pay until staff mark it paid). Acceptable for a scaffold; revisit if Teya pushes are heavily used.
- `active_kiosk_terminal` setting (`square` / `teya` / `none`) selects which vendor receives kiosk pushes. Defaults to `square` so behaviour is unchanged for existing venues.
- Teya OAuth requires `TEYA_CLIENT_ID` + `TEYA_CLIENT_SECRET` env vars. The redirect URI defaults to `<PUBLIC_APP_URL>/api/staff/teya/oauth/callback` and must match what's registered with Teya. Override via `TEYA_REDIRECT_URI` if needed.

## Pointers
- [React Native Documentation](https://reactnative.dev/docs)
- [Expo Documentation](https://docs.expo.dev/)
- [React Query Documentation](https://tanstack.com/query/latest)
- [Express.js Documentation](https://expressjs.com/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Drizzle ORM Documentation](https://orm.drizzle.team/docs)
- [Square POS API Documentation](https://developer.squareup.com/docs/api)
- [Stripe Elements Documentation](https://stripe.com/docs/elements)