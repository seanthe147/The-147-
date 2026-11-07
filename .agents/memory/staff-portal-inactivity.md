---
name: Staff portal inactivity logout
description: Requested 15-minute idle logout for staff privacy.
---
Staff web portal sessions should sign out after 15 minutes without human interaction.

**Why:** the owner explicitly requested this privacy safeguard for unattended staff access. It is not a claim of complete GDPR compliance.

**How to apply:** distinguish actual activity from background polling, enforce expiry server-side, handle sleeping/background tabs and shared-browser tabs, and warn about unsaved work. Scope this to staff web sessions, not customer or native sessions without further authorization.
