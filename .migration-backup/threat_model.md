# Threat Model

## Project Overview

The 147 is a customer and staff platform for a snooker venue, bar, and restaurant. It combines an Expo/React Native client (`app/`, `components/`, `contexts/`, `lib/`) with an Express backend (`server/index.ts`, `server/routes.ts`) backed by PostgreSQL via Drizzle (`server/storage.ts`, `shared/schema.ts`). Production traffic terminates over TLS on the platform. The mockup sandbox is not treated as production, but the `/test-site/*` marketing pages are production-reachable because they are served by live Express routes.

## Assets

- **Customer accounts and sessions** — customer passwords, session tokens, email-verification tokens, password-reset tokens, and linked membership state. Compromise enables account takeover and abuse of bookings or membership benefits.
- **Staff accounts and privileged sessions** — staff PIN hashes, staff session tokens, role assignments, HR/admin actions, and any master-PIN-based access. Compromise enables broad operational access.
- **Payment and subscription flows** — Stripe payment intents, Square checkout links, deposit flows, membership subscriptions, customer payment metadata, and webhook authenticity. Abuse can redirect or misapply payments and expose customer payment context.
- **PII and HR data** — customer names, emails, phones, bookings, contact messages, staff onboarding data, payroll-related fields, incident records, leave data, and staff documents. Exposure affects privacy, compliance, and employee safety.
- **Application secrets and build credentials** — SMTP/Resend/Stripe/Square secrets, database credentials, mobile signing material, and app-store credentials. Exposure risks account compromise, fraudulent builds, or service abuse.

## Trust Boundaries

- **Client to API** — all mobile/web requests cross from an untrusted client into `server/routes.ts`. Server-side validation, authentication, and authorization must be authoritative.
- **Public to authenticated customer** — public routes such as bookings, account registration, password recovery, membership landing pages, and `/test-site/*` marketing pages must remain isolated from customer-only data and actions.
- **Authenticated staff to manager/owner** — staff, manager, and owner roles share one backend and must be separated server-side on every privileged route.
- **Server to PostgreSQL** — the server has broad database access. Query safety, row scoping, and secret handling in `server/storage.ts` are critical.
- **Server to third parties** — Stripe, Square, Expo push, SMTP/Resend, and TicketSource are external trust domains. Webhooks and callback URLs must be authenticated and constructed safely.
- **Production to dev-only content** — local scripts, build artifacts, and mobile signing files exist in-repo but should not expand the runtime attack surface unless reachable from live routes. The `/test-site/*` page renderer is not dev-only in this project.

## Scan Anchors

- **Production entry points:** `server/index.ts`, `server/routes.ts`, `server/storage.ts`, `server/stripe.ts`, `server/square.ts`, `server/web-content.ts`, `server/templates/staff-dashboard.html`, `shared/schema.ts`
- **Highest-risk areas:** auth/session handling, staff role checks, public booking and membership flows, payment redirect/callback logic, password recovery/email verification, staff/admin HTML sinks, public marketing page rendering, PII/HR endpoints, secret-bearing config and credential files
- **Public surfaces:** `/api/bookings*`, customer auth/recovery routes, membership signup and migration routes, landing pages served by `server/index.ts`, `/test-site/*`
- **Authenticated surfaces:** customer account APIs, staff/admin/HR/payment APIs, staff dashboard HTML
- **Usually dev-only / lower-priority:** `tests/`, `dist/`, `server_dist/`, `static-build/`, preview/mockup routes other than `/test-site/*`, and local helper scripts unless they expose live secrets or production control material

## Threat Categories

### Spoofing

Customer and staff identity is represented by bearer tokens stored and validated by the backend. All protected endpoints must validate session tokens server-side and derive privileges from server-side state, not client claims. Third-party callbacks from Square or similar providers must be verified cryptographically before they affect bookings or memberships.

### Tampering

Clients can submit bookings, contact requests, profile changes, membership actions, staff actions, payment-related requests, and owner-managed public content. The server must validate all user-controlled fields, compute security-sensitive decisions server-side, and prevent attackers from altering business state or payment flow parameters through crafted inputs or header manipulation.

### Information Disclosure

The system processes customer PII, HR records, payment metadata, session tokens, and build credentials. Sensitive data must not leak via logs, overly broad staff/customer responses, publicly served files, repository-tracked secrets, or unsafe callback/redirect construction that exposes tokens to third parties.

### Denial of Service

Public routes like login, registration, password recovery, bookings, webhook handlers, and public marketing routes can be abused for resource exhaustion or email/push abuse. Sensitive endpoints must be rate-limited and expensive third-party or database-backed operations should not be triggerable without reasonable controls.

### Elevation of Privilege

The application contains customer, staff, manager, and owner capabilities in one backend. Every privileged endpoint must enforce role checks server-side and scope access to the correct user or staff member. Any bypass in session handling, document access, HR APIs, payment/admin tooling, or staff-dashboard rendering could let lower-privilege users gain manager/owner capabilities or access other users’ data.

### Repudiation

Staff approvals, password resets, order actions, HR events, and payment handling are sensitive operational actions. These flows should preserve accurate audit trails tied to the acting user and timestamp so abusive or mistaken actions can be investigated.

## 2026-05-04 Scan Refresh

### Production assumptions carried forward

- `NODE_ENV` is assumed to be `production` in deployed environments.
- Replit-managed TLS is assumed for client-to-server traffic.
- Mockup sandbox and preview/test-site content remain out of scope unless a live production route depends on them.

### Controls confirmed during this scan

- Staff credential reset routes that previously allowed manager-driven impersonation are now owner-only and revoke target sessions.
- Square webhook processing fails closed when the signing key is missing and verifies the raw request body before mutating state.
- Public origin construction for email/payment links no longer trusts the request `Host` header and prefers configured deployment origins.
- HR onboarding fields and staff documents are stored in the database with encryption for sensitive fields rather than being exposed through `/uploads`.

### Current recurring risk patterns

- **Do not reintroduce raw `X-Forwarded-For` parsing** on public routes. Use trusted-proxy-aware `req.ip` consistently anywhere abuse limits depend on client IPs.
- **Membership entitlements must track verified billing state**, not just successful subscription creation or browser return flows. New memberships should remain pending until a verified provider event confirms the first payment.
- **`mustChangePassword` must be enforced server-side** for all staff sessions and reauthentication paths. Client-only gating is insufficient because bearer tokens can call authenticated APIs directly.
- **Manager-controlled outbound/public URLs must be scheme-validated** before storage or rendering. Only safe navigation schemes such as `https:` should be accepted for public banner/content links.
- **Refunds, cancel-and-refund flows, and other direct payment reversals must not be exposed to plain `staff` roles.** Financially destructive order actions should require manager/owner authorization in addition to staff authentication.

## 2026-05-17 Scan Refresh

### Production assumptions carried forward

- `NODE_ENV` is assumed to be `production` in deployed environments.
- Replit-managed TLS is assumed for client-to-server traffic.
- Mockup sandbox remains out of scope unless a live production route depends on it.
- `/test-site/*` is production-reachable in this project and must be treated as an in-scope public surface.

### Controls confirmed during this scan

- Customer password-reset and email-verification tokens are random, stored as SHA-256 hashes, and password reset invalidates all customer sessions after use.
- Membership and booking payment-return routes no longer trust browser redirects to grant paid state; verified Square webhook processing remains the entitlement authority.
- Public upload serving under `/uploads` did not expose the HR document store in the current production code path; staff documents remain stored in the database.

### Current recurring risk patterns

- **Do not let unverified email addresses claim identity-linked accounts.** If bookings, memberships, or third-party entitlements are keyed by email, the app must require mailbox verification before login or before granting access to that email's data.
- **Any ad-hoc or inline staff-session checks must preserve all middleware-enforced restrictions.** Re-implementing a subset of `staffAuth` logic risks bypassing controls such as forced password changes.
- **Privileged HTML UIs must escape stored data before writing to `innerHTML` or HTML attributes.** Manager-controlled content in staff dashboards can otherwise become stored XSS that steals higher-privilege staff tokens.
- **Custom HTML sanitizers must normalize named entities as well as numeric ones before scheme checks.** Blocking `javascript:` only after partial decoding leaves entity-based bypasses in public pages.
- **Repository-tracked mobile signing and app-store credentials are production secrets.** App Store Connect private keys, signing keys, and similar release credentials must be removed from version control and rotated if ever committed.
