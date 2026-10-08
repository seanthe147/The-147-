---
name: Expo Launch Node runtime
description: Why The 147 declares its production Node runtime in both Replit Expo Launch and direct EAS build configuration.
---

Replit's Expo Launch iOS export may continue using its managed Node 20 runtime even when the app package and production EAS profiles request Node 22. Keep those declarations aligned, but do not assume they change the managed export step.

**Why:** Expo CLI resolved Undici 8, which requires Node 22 WebIDL APIs. Expo Launch repeatedly exported with Node 20.19.4 despite both Node 22 declarations and crashed before Metro started.

**How to apply:** Until Expo Launch upgrades its managed runtime, constrain Undici to the latest Node-20-compatible 7.x release through the workspace override and verify Expo CLI can load it under the exact Launch Node version. Remove this only after a Launch log confirms Node 22+ or Expo no longer resolves the incompatible dependency.

Check native build-image selections across the embedded Replit build configuration and the separate cloud-build profile as well as Node versions.

**Why:** A supported Xcode image was pinned for one build route but absent from the other. Correct local configuration for one tool is not evidence that another tool will select the same native compiler.

**How to apply:** When preparing a native release, keep the intended image and runtime selections consistent across build routes and confirm the actual compiler image in the completed build log.

Explicitly select the package-manager version used to verify the workspace lockfile; selecting Node alone does not select a compatible pnpm.

**Why:** A cloud worker honored the production Node version but defaulted to pnpm 8, which rejected the newer workspace lockfile before native compilation. Local dependency checks and a successful local frozen install did not detect the remote tool-version mismatch.

**How to apply:** Keep package-manager selections aligned across production build routes and the verified local toolchain. Preserve frozen-lockfile installation rather than regenerating dependencies in the cloud, and confirm the actual tool versions in build logs.

Explicitly pin the SDK-matched Android builder image rather than relying on the connected build service's default.

**Why:** The service reported the correct current app SDK but selected a legacy Android image with Java 11. Dependency installation and prebuild succeeded, yet Gradle could not start because it required Java 17 or newer. Node and pnpm overrides do not upgrade the builder's Java/NDK toolchain.

**How to apply:** Select a supported, SDK-matched Android image from Expo's current infrastructure documentation in both production build routes. Check the actual image and Java version in cloud logs; SDK metadata, JavaScript export, and local prebuild alone do not verify the native compiler environment.