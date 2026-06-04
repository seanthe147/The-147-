# The 147 Bradford

A venue management and customer app for The 147 Bradford snooker club — covering table bookings, food ordering, memberships, staff HR, and loyalty.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080, serves `/api/*`)
- `pnpm --filter @workspace/the-147 run dev` — run the Expo mobile/web app
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/db run push-force` — force-push schema (drops conflicts)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 with esbuild bundle (`artifacts/api-server`)
- DB: PostgreSQL + Drizzle ORM (`lib/db`)
- Mobile/Web: Expo + expo-router (`artifacts/the-147`)
- Payments: Square (primary) + Stripe (fallback)
- Push notifications: Expo Push API

## Where things live

- `lib/db/src/schema/schema.ts` — single source of truth for DB schema
- `lib/db/src/schema/membership-benefits.ts` — membership plan benefits
- `artifacts/api-server/src/routes/routes.ts` — all API routes (14k+ lines, `registerRoutes(app)`)
- `artifacts/api-server/src/storage.ts` — DB access layer (`DatabaseStorage` class)
- `artifacts/api-server/src/index.ts` — server startup, scheduled tasks
- `artifacts/the-147/app/` — Expo Router screen files
- `artifacts/the-147/lib/query-client.ts` — API client and React Query setup

## Architecture decisions

- `registerRoutes(app)` adds all routes directly to the Express app (not a Router) — returns httpServer via `createServer(app)`
- `routes/routes.ts` lives in a `routes/` subdirectory; all its local imports use `../` prefix to reach sibling server files
- Metro resolves `@workspace/db` to `lib/db/src/` via `extraNodeModules` in `metro.config.js` — the Expo client uses `@workspace/db/schema` (not the root which includes pg/drizzle)
- Shared types (schema, validators) live in `lib/db/src/schema/` and are imported by both server and client; `FeatureFlags` type is inlined into `artifacts/api-server/src/featureFlags.ts` for server use
- Sentry is stubbed out (code removed to avoid `@opentelemetry` peer dep issues); add back if `SENTRY_DSN` is configured and `@opentelemetry/*` packages installed

## Product

Venue app for The 147 Bradford snooker club. Customers can book snooker/pool/dining tables, order food & drinks, view menus and events, manage memberships (Square recurring billing), and accumulate loyalty points. Staff get a full management portal: rota, HR docs, bookings, POS sync, live table status, and Square KDS integration.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- `pnpm --filter @workspace/api-server run dev` runs `pnpm run build && pnpm run start` — both steps happen together
- Route files in `artifacts/api-server/src/routes/` use `../` for imports to parent `src/` (not `./`)
- `lib/db/src/index.ts` creates a pg pool at import time — Expo client must import `@workspace/db/schema` not `@workspace/db`
- Templates/HTML files are in `artifacts/api-server/src/templates/` and resolved at runtime via `path.join(__dirname, "../src/templates", ...)`
- `uploads/` directory is created at workspace root (`process.cwd()/uploads`) on first startup
- DB schema push: `pnpm --filter @workspace/db run push` from workspace root

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
