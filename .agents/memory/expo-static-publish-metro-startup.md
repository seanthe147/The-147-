---
name: Expo static publish Metro startup
description: Diagnose startup timeouts in the mobile artifact's static publishing build.
---

The static publish build clears Metro's cache, starts Metro, and waits for its health endpoint before downloading iOS and Android bundles. In a cold deployment build, Metro can take longer than a short startup guard without emitting a source-code or dependency error. A completed local static build after increasing the guard confirmed this case.

**Why:** A publish failed before Metro reported readiness while the API build succeeded; the same Expo build later reached readiness and bundled both platforms when allowed more startup time.

**How to apply:** When logs end at a Metro startup timeout before any bundle begins, compare with a successful build and check the health-wait limit before changing app code. Treat the missing `libgtk-3.so.0` React Native DevTools message as non-fatal if Metro subsequently reports ready and completes its bundles.
