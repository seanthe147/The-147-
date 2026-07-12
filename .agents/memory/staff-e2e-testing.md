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

**Why:** cost two failed attempts (wrong column name, wrong field names) and a silent cleanup miss.
