---
name: Expo Launch Node runtime
description: Why The 147 declares its production Node runtime in both Replit Expo Launch and direct EAS build configuration.
---

Replit's Expo Launch iOS workflow and direct EAS CLI builds do not necessarily read the same production profile. Keep the required Node runtime aligned in both configuration surfaces.

**Why:** Expo CLI resolved an Undici release requiring Node 22. Direct Android builds respected the EAS profile, while the Apple Expo Launch export still used Node 20 until its embedded production profile was pinned separately.

**How to apply:** When changing the production Node version or diagnosing an Expo export runtime mismatch, verify both publishing paths rather than assuming one profile controls both.