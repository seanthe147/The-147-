---
name: The 147 workspace structure
description: Non-obvious decisions made when porting The 147 from a monolithic repo into the pnpm workspace
---

# The 147 — Workspace Migration Decisions

## Metro resolution for @workspace/db

The Expo client can only import schema types (no pg/drizzle). Metro's `extraNodeModules` in `metro.config.js` maps `@workspace/db` → `lib/db/src/` directly. The Expo app always imports from `@workspace/db/schema`, never from `@workspace/db` (which would pull in the pg pool at import time).

**Why:** `lib/db/src/index.ts` creates a pg connection pool on import. React Native doesn't have `pg`, so the client must bypass the barrel export.

**How to apply:** Any new client-side code that needs DB types must import from `@workspace/db/schema`. Any new server-side code can import from `@workspace/db`.

## Routes subdirectory import convention

`artifacts/api-server/src/routes/routes.ts` lives one level deeper than sibling server files. All local imports inside routes.ts use `../` prefix (e.g. `from "../storage"`, `from "../featureFlags"`).

**Why:** The file was placed in a `routes/` subdir for organisation; a bulk sed fixed all relative imports.

## Sentry removed (not stubbed)

All Sentry imports were removed from `index.ts` and `app.ts`. The `@sentry/node` package remains in `package.json` but is unused.

**Why:** `@sentry/node` pulls in `@opentelemetry/instrumentation` as a peer dep that isn't installed, causing a hard startup crash. Re-enable if `SENTRY_DSN` env var is set and the peer deps are installed.

## FeatureFlags inlined on the server

The original `shared/featureFlags.ts` was copied to `artifacts/api-server/src/featureFlags.ts` with no changes. The Expo client has its own copy at `artifacts/the-147/lib/featureFlags.ts`.

**Why:** Shared libs (`lib/*`) must be composite TS packages; a tiny standalone type file doesn't warrant a new lib package.

## Non-API path routing in artifact.toml

The API server's `artifact.toml` must explicitly list every non-`/api` path that the Express server serves so the reverse proxy routes them correctly. Otherwise those paths fall through to the Expo artifact and return 404.

Paths exposed: `/api`, `/terms`, `/staff-privacy-notice`, `/widget`, `/uploads`, `/migrate`, `/verify-email`, `/reset-password`, `/delete-account`, `/staff`, `/kiosk`.

`/privacy-policy` is intentionally NOT in the api-server paths — the Expo app has an in-app screen at that route, and all in-app navigation uses `router.push("/privacy-policy")` (client-side, never hits the proxy).

**Why:** Reverse proxy only routes paths explicitly listed in `[[services]] paths`. Omitted backend paths silently fall through to the Expo app and serve wrong content.

**How to apply:** Any time a new non-`/api` Express route is added that should be accessible from outside the app (email links, embeds, web pages), add the path to the api-server's `artifact.toml` paths array using `verifyAndReplaceArtifactToml`.

## API URL construction

- **Web:** `window.location.origin` — routes through the Replit reverse proxy to `/api` on port 8080
- **Mobile:** `EXPO_PUBLIC_DOMAIN` env var set in the dev workflow command to `$REPLIT_DEV_DOMAIN`

## Template path resolution

`artifacts/api-server/src/index.ts` uses `path.join(__dirname, "..", "src", "templates", ...)` where `__dirname` is the esbuild dist/ directory (set via esbuild banner). Templates are in `src/templates/`, one level up from `dist/`.
