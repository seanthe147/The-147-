---
name: Staff portal inactivity logout
description: Requested 15-minute idle logout for staff privacy.
---
Staff web portal sessions should sign out after 15 minutes without human interaction.

**Why:** the owner explicitly requested this privacy safeguard for unattended staff access. It is not a claim of complete GDPR compliance.

**How to apply:** distinguish actual activity from background polling, enforce expiry server-side, handle sleeping/background tabs and shared-browser tabs, and warn about unsaved work. Scope this to staff web sessions, not customer or native sessions without further authorization.

Require a fresh website login for pre-existing unscoped sessions rather than silently converting them to idle-limited sessions.

**Why:** native and web staff historically shared the same session store and login endpoint. Reclassifying old sessions could unexpectedly sign staff out of the native app.

**How to apply:** retain the explicit web/native distinction in future login changes. Ordinary verification requests must remain read-only, and only a genuine-activity request may extend an unexpired website session.
