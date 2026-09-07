---
name: Native analytics provider
description: Privacy and platform decision for native funnel analytics
---

Native iOS and Android funnel events use PostHog Cloud's EU capture endpoint with an anonymous install identifier; web events continue using Replit-hosted Umami.

**Why:** Replit-hosted analytics does not receive native Expo events, while an HTTP capture path avoids adding another native SDK and keeps the mobile data limited to non-PII funnel properties.

**How to apply:** Keep native and web delivery mutually exclusive in the shared wrapper. Supply the public PostHog project key through the mobile build environment, and do not add customer identity, contact details, payment details, or order IDs to event properties.
