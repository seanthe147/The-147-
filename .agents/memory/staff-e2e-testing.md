---
name: Staff-auth e2e testing recipe
description: How to curl-test staff-protected and booking endpoints in dev without a real login
---

Create a temporary staff session directly in Postgres, curl with Bearer token, then clean up.

- `staff_users` has `approval_status` (text, 'approved') — NOT an `approved` boolean column.
- Session insert: `INSERT INTO staff_sessions (token, staff_username, staff_user_id, expires_at, active) SELECT '<hex>', username, id, NOW() + interval '1 hour', true FROM staff_users WHERE active AND approval_status='approved' LIMIT 1;`
- Public booking POST uses `customerName` / `customerEmail` / `customerPhone` (not name/email/phone) plus date, startTime, duration, tableType, guestCount.
- **Cleanup gotcha:** booking PII is encrypted at rest (`enc:` prefix), so `DELETE FROM bookings WHERE customer_email='…'` matches nothing — delete test bookings by the `id` returned in the POST response.
- Always delete the temp `staff_sessions` row afterwards.

For browser-based (Playwright) tests that must log in through the UI, a DB session token is useless (the dashboard reads it from localStorage). Instead:
- Register a real account: `POST /api/staff/register` with `{masterPin: $STAFF_PIN, username, password, displayName}` — use the env var in bash without printing it.
- New accounts land as `approval_status='pending'` — approve via SQL (`UPDATE staff_users SET approval_status='approved', active=true`), and set `role='owner'` to unlock all dashboard pages (roles: staff/manager/owner).
- Hand the throwaway username/password to the testing subagent, then delete the `staff_users` row and its `staff_sessions` afterwards.

**Why:** cost two failed attempts (wrong column name, wrong field names) and a silent cleanup miss; the UI-login variant was needed for mobile-layout verification.
