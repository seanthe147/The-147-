---
name: Expo web appearance override
description: Expo web compatibility constraint for programmatically applying an appearance preference.
---

Do not assume React Native's programmatic `Appearance` colour-scheme override is implemented on Expo web; guard native-only appearance overrides by platform and let web consume the resolved app palette without calling the native override.

**Why:** Expo web exposed the API shape but did not provide the callable override used by native, causing a runtime crash during browser theme testing.

**How to apply:** Whenever appearance selection changes native system chrome, keep the app's semantic palette cross-platform but invoke native `Appearance` overrides only on supported native platforms.