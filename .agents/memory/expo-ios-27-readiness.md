---
name: Expo iOS 27 readiness
description: Scene lifecycle settings and Expo Router migration checks for iOS 27-capable Expo builds.
---

For an Xcode 27/iOS 27 build, confirm the selected Expo SDK supports UIKit scenes and enable them through `expo-build-properties` when required. With SDK 57, set the iOS `enableSceneSupport` option and verify generated native output contains the scene manifest and app delegate; config introspection alone is not enough. Do not raise the minimum iOS version without separate compatibility evidence.

Expo Router SDK 56+ rejects application imports directly from `@react-navigation/*`; use the corresponding public `expo-router` entry point from the migration guide. Stack children must be individual, uniquely named screen entries: fragments can reach the router as Symbol children, and duplicate screen names fail at runtime.

For Liquid Glass, keep the current customer shell on JS `Tabs` and use `GlassView` for its surfaces. Its programmatic booking route and order CTA spacing depend on the existing tab route and height context; replacing the navigator requires a route/CTA migration, not only changing tab options.

**Why:** Expo Doctor and dependency-alignment checks can pass while a production JS export or route render still fails. A successful JS export also does not prove native compilation, installation, or iOS 27 behavior.

**How to apply:** During an Expo upgrade, run config/dependency checks, export the iOS bundle, render the route tree, and prebuild then inspect the generated scene configuration. Keep readiness unconfirmed until a supported native build is installed and the iOS 27 device flows pass.

**Why:** The current JS tab layout has app routes and checkout controls that are not drop-in `NativeTabs` triggers/accessories. A visual-only navigator swap could hide booking or let the tab bar cover the order CTA.

**How to apply:** Use `GlassView` for the supported system material while preserving JS navigation. Reconsider `NativeTabs` only alongside an explicit migration for the hidden booking route, order accessory, tab visibility, and safe-area behavior, followed by iOS device testing.

Use pnpm's `allowBuilds` map for explicit dependency install-script approvals. pnpm 11 removes the older `onlyBuiltDependencies` setting; keep the approved package list narrow instead of enabling all scripts.

**Why:** A remote iOS dependency install rejected `esbuild` despite the legacy allowlist, and pnpm 11 documents that the legacy setting is removed.

**How to apply:** When build logs show `ERR_PNPM_IGNORED_BUILDS`, check the pnpm version and the workspace's `allowBuilds` map before changing dependencies or bypassing install-script checks.
