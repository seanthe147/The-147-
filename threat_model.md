# Threat Model

## Project Overview

The 147 is a customer and staff platform for a snooker venue, bar, and restaurant. It combines an Expo/React Native client (`app/`, `components/`, `contexts/`, `lib/`) with an Express backend (`server/index.ts`, `server/routes.ts`) backed by PostgreSQL via Drizzle (`server/storage.ts`, `shared/schema.ts`). Production traffic terminates over TLS on the platform. The mockup sandbox and test-site previews are not treated as production unless a production code path reaches them.

## Assets

- **Customer accounts and sessions** — customer passwords, session tokens, email-verification tokens, password-reset tokens, and linked membership state. Compromise enables account takeover and abuse of bookings or membership benefits.
- **Staff accounts and privileged sessions** — staff PIN hashes, staff session tokens, role assignments, HR/admin actions, and any master-PIN-based access. Compromise enables broad operational access.
- **Payment and subscription flows** — Stripe payment intents, Square checkout links, deposit flows, membership subscriptions, customer payment metadata, and webhook authenticity. Abuse can redirect or misapply payments and expose customer payment context.
- **PII and HR data** — customer names, emails, phones, bookings, contact messages, staff onboarding data, payroll-related fields, incident records, leave data, and staff documents. Exposure affects privacy, compliance, and employee safety.
- **Application secrets and build credentials** — SMTP/Resend/Stripe/Square secrets, database credentials, mobile signing material, and app-store credentials. Exposure risks account compromise, fraudulent builds, or service abuse.

## Trust Boundaries

- **Client to API** — all mobile/web requests cross from an untrusted client into `server/routes.ts`. Server-side validation, authentication, and authorization must be authoritative.
- **Public to authenticated customer** — public routes such as bookings, account registration, password recovery, and membership landing pages must remain isolated from customer-only data and actions.
- **Authenticated staff to manager/owner** — staff, manager, and owner roles share one backend and must be separated server-side on every privileged route.
- **Server to PostgreSQL** — the server has broad database access. Query safety, row scoping, and secret handling in `server/storage.ts` are critical.
- **Server to third parties** — Stripe, Square, Expo push, SMTP/Resend, and TicketSource are external trust domains. Webhooks and callback URLs must be authenticated and constructed safely.
- **Production to dev-only content** — test-site templates, preview routes, local scripts, build artifacts, and mobile signing files exist in-repo but should not expand the production attack surface unless reachable from live routes.

## Scan Anchors

- **Production entry points:** `server/index.ts`, `server/routes.ts`, `server/storage.ts`, `server/stripe.ts`, `server/square.ts`, `shared/schema.ts`
- **Highest-risk areas:** auth/session handling, staff role checks, public booking and membership flows, payment redirect/callback logic, password recovery/email verification, PII/HR endpoints, secret-bearing config and credential files
- **Public surfaces:** `/api/bookings*`, customer auth/recovery routes, membership signup and migration routes, landing pages served by `server/index.ts`
- **Authenticated surfaces:** customer account APIs, staff/admin/HR/payment APIs, staff dashboard HTML
- **Usually dev-only / lower-priority:** `tests/`, `scripts/`, `dist/`, `server_dist/`, `static-build/`, `server/templates/test-site/`, preview/mockup routes unless production-reachable behavior depends on them

## Threat Categories

### Spoofing

Customer and staff identity is represented by bearer tokens stored and validated by the backend. All protected endpoints must validate session tokens server-side and derive privileges from server-side state, not client claims. Third-party callbacks from Square or similar providers must be verified cryptographically before they affect bookings or memberships.

### Tampering

Clients can submit bookings, contact requests, profile changes, membership actions, staff actions, and payment-related requests. The server must validate all user-controlled fields, compute security-sensitive decisions server-side, and prevent attackers from altering business state or payment flow parameters through crafted inputs or header manipulation.

### Information Disclosure

The system processes customer PII, HR records, payment metadata, session tokens, and build credentials. Sensitive data must not leak via logs, overly broad staff/customer responses, publicly served files, repository-tracked secrets, or unsafe callback/redirect construction that exposes tokens to third parties.

### Denial of Service

Public routes like login, registration, password recovery, bookings, and webhook handlers can be abused for resource exhaustion or email/push abuse. Sensitive endpoints must be rate-limited and expensive third-party or database-backed operations should not be triggerable without reasonable controls.

### Elevation of Privilege

The application contains customer, staff, manager, and owner capabilities in one backend. Every privileged endpoint must enforce role checks server-side and scope access to the correct user or staff member. Any bypass in session handling, document access, HR APIs, or payment/admin tooling could let lower-privilege users gain manager/owner capabilities or access other users’ data.

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
