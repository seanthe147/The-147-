---
name: Expo Launch Node runtime
description: Why The 147 declares its production Node runtime in both Replit Expo Launch and direct EAS build configuration.
---

Replit's Expo Launch iOS export may continue using its managed Node 20 runtime even when the app package and production EAS profiles request Node 22. Keep those declarations aligned, but do not assume they change the managed export step.

**Why:** Expo CLI resolved Undici 8, which requires Node 22 WebIDL APIs. Expo Launch repeatedly exported with Node 20.19.4 despite both Node 22 declarations and crashed before Metro started.

**How to apply:** Until Expo Launch upgrades its managed runtime, constrain Undici to the latest Node-20-compatible 7.x release through the workspace override and verify Expo CLI can load it under the exact Launch Node version. Remove this only after a Launch log confirms Node 22+ or Expo no longer resolves the incompatible dependency.