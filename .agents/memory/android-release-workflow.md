---
name: Android release workflow
description: The 147's existing Expo-to-Google-Play release process and source/version safeguards.
---

The user reports Android releases were built with Expo, downloaded, and uploaded to Google Play manually. The connected Expo MCP tools expose Android build operations even though Replit's built-in Expo Launch publishing is iOS-only.

**Why:** Treating built-in publishing limitations as a lack of access to existing Expo builds unnecessarily blocks this established release process.

**How to apply:** Check the connected Expo build list before requesting an uploaded bundle. Never submit an older artifact as the current release. Compare its version code with the intended new build, and verify the GitHub reference contains current workspace changes before requesting a remote build. Do not run EAS CLI commands or assume a workspace edit is already on GitHub.

Pin the remote package-manager version and SDK-compatible Android image explicitly; retain the Firebase secret-file preparation hook during release changes.

**Why:** A later release lost these settings and the cloud builder fell back to pnpm 8, Java 11 and an old NDK. It rejected the workspace lockfile before compilation, despite local checks passing.

**How to apply:** Compare remote build tools with the last successful build, not just local dependency versions. Do not weaken frozen-lockfile checks or commit Firebase private material to work around missing build configuration.
