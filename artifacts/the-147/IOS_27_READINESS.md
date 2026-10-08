# iOS 27 readiness audit

**Audit date:** 2026-10-05  
**Follow-up check:** 2026-10-08

**Status:** **Not confirmed.** The original configuration/dependency checks, generated iOS prebuild, and iOS JavaScript export passed. The follow-up configuration check passes, but dependency alignment now fails on six Expo patch versions. The original remote build failed during dependency installation before Xcode; a subsequent build request was cancelled because linked GitHub `main` contained older, unaudited source. No iOS 27 installation or device runtime test was possible in this Linux environment. Square has not confirmed WKWebView support in the available project records, and the Square account's registered payment-domain status and approved sandbox setup have not been verified.

## Compatibility inventory

| Area | Finding |
| --- | --- |
| Expo / React Native | Expo SDK 57.0.26, React Native 0.86.3, and React 19.2.3. Expo Doctor reports 21/21 checks passing; `expo install --check` passes. |
| iOS 27 lifecycle | Expo documents that iOS 27 SDK apps must use UIKit scenes. SDK 57.0.23+ supports this through `expo-build-properties`; this app uses SDK 57.0.26 with `ios.enableSceneSupport: true`. Generated `Info.plist` contains `UIApplicationSceneManifest` and `EXExpoAppSceneDelegate`. |
| Xcode image | The production profile selects `macos-tahoe-26.6-xcode-27.0`, a documented Xcode 27.0 image. Expo lists that image for SDK 58 and documents scene support as the way to use Xcode 27 while remaining on SDK 57. The attempted remote build stopped before starting the Xcode phase. |
| Minimum iOS | Generated Xcode settings use iOS 16.4. This is Expo SDK 56+ build-properties' documented minimum, not a hand-set iOS 27 bump. No explicit deployment-target override was added. |
| Identity and release state | The generated plist has bundle ID `com.the147bradford.app`, version `2.8.9`, and build `138`; `Expo.plist` keeps runtime version `2.8.9`. The Apple Pay merchant entitlement and privacy manifest are present. |
| Native modules | The SDK-aligned Expo modules include notifications, local authentication, secure storage, appearance/system UI, splash screen, and WebView. The app's Square card and wallet forms use `react-native-webview`; the installed `react-native-square-in-app-payments` package is used by the Android-only Google Pay hook and does not verify the iOS WebView payment path. |
| Liquid Glass surfaces | The tab bar and existing order, events, rewards, and membership headers use Apple's `GlassView` when available. Older iOS keeps the existing blur treatment; Reduce Transparency uses a solid surface. Backdrops are non-interactive or box-none, and the existing JS tab layout and cart spacing are preserved. A native-tab navigator swap would first require moving the hidden booking route and order CTA into supported native routes/accessories. |

### Square / Apple Pay risk

The customer checkout renders Square's Web Payments SDK inside `react-native-webview` and enables Apple Pay in the iOS WebView. Square's current Web Payments Apple Pay requirements name Safari and `SFSafariViewController` on iOS; they do not list `WKWebView`. This is an unresolved vendor-support question, not proof that the current flow is broken or a written Square rejection.

Square separately documents Apple Pay through its native iOS In-App Payments SDK and its React Native plugin. This is a vendor-documented alternative to investigate if Square says the Web Payments SDK is unsupported in WKWebView. It is not documented as a direct migration from this integration, and the available July 2026 iOS 27 release note is for Square's separate Mobile Payments SDK, not the In-App Payments SDK or this app's React Native wrapper. Confirm the approved route and its iOS 27 compatibility with Square before changing the checkout. No payment dependency or flow change has been made.

The app includes Apple's merchant entitlement and the API server has Apple's domain-association file, but neither proves that the configured staging/production domain is registered with Square for the corresponding Apple Pay environment. The Square Developer Console or an owner-authorized Square check is still required.

## Checks completed in this environment

- `pnpm --filter @workspace/the-147 run check-expo-config` — passed.
- `pnpm --filter @workspace/the-147 run check-expo-deps` — passed.
- `cd artifacts/the-147 && pnpm dlx expo-doctor@latest` — 21/21 checks passed.
- `pnpm --filter @workspace/the-147 run typecheck` — passed.
- `pnpm --filter @workspace/the-147 exec expo prebuild --platform ios --clean --no-install` — passed; generated project settings and entitlements were inspected.
- After the Liquid Glass styling update, `pnpm --filter @workspace/the-147 exec expo export --platform ios --output-dir /tmp/the147-ios-export` passed; Metro bundled 2,277 modules and produced the Hermes JavaScript bundle. This does not compile or sign an iOS app.
- The equivalent `expo export --platform web` passed. The local Expo web server responds with HTTP 200 for `/` and `/membership`; the proxied nested `/membership` preview returned HTTP 502 while the root preview loaded. This is only a JavaScript/route-tree smoke check, not an iOS runtime test.
- Migrated the seven app imports of `BottomTabBarHeightContext` from `@react-navigation/bottom-tabs` to `expo-router/js-tabs`, as required by Expo Router SDK 56+. The root stack now passes screen arrays rather than fragments and has unique screen names; this fixes the route-mapper failures found during preview validation.
- Appearance and Square payment-sheet tests — 9 passed.
- Apple Pay/card-field branding tests — 8 passed.
- Google Pay error-handling regression tests — 5 passed.
- After the Liquid Glass styling update, Expo typecheck, config/dependency checks, and the appearance/payment-sheet tests passed. The web preview loaded the home route, but web preview cannot exercise native glass rendering or native hit testing.
- The attempted remote iOS build failed during `pnpm install --frozen-lockfile` with `ERR_PNPM_IGNORED_BUILDS` for `esbuild@0.28.1`, before Xcode. The workspace's legacy build-script allowlist has been migrated to pnpm's explicit `allowBuilds` map. No iOS binary was produced. Replit's documented mobile build route is Publishing; a direct EAS CLI build is not a supported Replit build path and was not retried.
- `pnpm install --frozen-lockfile --offline` — passed with the explicit `allowBuilds` map on the workspace's pnpm 10.26.1. This does not establish that a cloud production build or Xcode compilation succeeds.

The prebuild is not an Xcode compile and does not prove that CocoaPods, code signing, or the finished app binary works. This runner is Linux; `xcodebuild` and `xcrun` are unavailable, and the supported Replit Publishing flow could not be run from this workspace. No production iOS binary, TestFlight install, iOS 27 simulator, or iOS 27 device was available. Accordingly, launch/relaunch, sign-in, tabs, appearance, deep links, notification prompts and delivery, Face ID, permission prompts, and checkout remain untested on iOS 27.

## Verification attempt — 2026-10-08

The release is still blocked; this attempt did not produce native verification results.

| Evidence | Result |
| --- | --- |
| Local Expo configuration | `pnpm --filter @workspace/the-147 run check-expo-config` passes; scene support remains enabled. |
| Local dependency alignment | `CI=1 pnpm --filter @workspace/the-147 run check-expo-deps` exits 1. Expected patch ranges: `expo ~57.0.27`, `expo-updates ~57.0.25`, `expo-constants ~57.0.21`, `expo-linking ~57.0.12`, `expo-notifications ~57.0.22`, and `expo-router ~57.0.25`. The earlier passing result is historical, not a current release clearance. |
| Audited workspace target | Version `2.8.9`, build `138`; production iOS profile pins `macos-tahoe-26.6-xcode-27.0`, and scene support is enabled. |
| Requested cloud build | Connected Expo build request `21adb0e9-92dc-4621-aad0-956b72ec72a7`, profile `production`, Git ref `main`, base directory `artifacts/the-147`, with `autoSubmit: false`. Exactly one build allowance was approved. |
| Resolved GitHub source | Commit `0427a2534ccc0c1e8c384799533ebc2657453e26` contains version `2.8.7`, build `68`, without the Xcode 27 image pin or scene support. It is not the audited workspace release. |
| Build outcome | Confirmed `CANCELED`. No application archive was produced. No replacement build was requested. |
| Source synchronization decision | The owner chose to leave GitHub unchanged. No test branch was created or pushed; the connected GitHub build route remains blocked by the source mismatch. |
| Distribution | Not performed. Nothing was uploaded to TestFlight or submitted for public App Store review by this request. |
| Test device / iOS build | None available / not observed. This runner is Linux and has no `xcodebuild` or iOS device access. |
| Installed app build | None; a configured build number is not an installed or tested build. |
| Native journey results | **NOT RUN:** cold launch; background/resume; force-quit/relaunch; sign-in/out; every customer tab; system/app appearance; deep links; notification permission and staging delivery; Face ID success/cancel/fallback; applicable permission prompts. |

Before another metered build through connected Expo tooling, align the dependencies and verify that the selected linked GitHub ref contains the audited release code and the supported Xcode image. Source synchronization would require renewed owner approval; do not change GitHub under the current decision. A replacement cloud build requires a new approved allowance. A successful cloud build would still not satisfy the device-test requirements below.

## Owner-run TestFlight checklist

**Owner:** The mobile release owner, with the Square integration owner for payment testing.

1. The mobile release owner uses Replit's **Publish** flow to build the `production` iOS profile and upload it for internal TestFlight testing. Confirm the build log uses `macos-tahoe-26.6-xcode-27.0`. Do not submit the app for public App Store review.
2. Install on an iOS 27 device. Cold launch, background and resume, force-quit and relaunch. Sign in and out with a test account, then visit every customer tab.
3. Change both the iOS system appearance and the app's appearance setting (system, light, and dark). Confirm screen content, status bar, and native payment surfaces remain readable after switching and relaunching. Verify the tab, order, events, rewards, and membership glass surfaces; tap the tab and cart controls, then enable Reduce Transparency and confirm the solid fallback remains readable and all controls still work.
4. Open the app from its `the147://` deep links, including the relevant sign-in or account-return link, and confirm it lands on the intended screen.
5. With a test account, exercise Face ID success, cancellation, and fallback. On a fresh install, verify the notification permission prompt and allow/deny behavior. Verify remote notification delivery only against a staging/test setup; do not send real customer notifications. Test camera, photo-library, and location prompts only in the authorized staff test flow where those permissions are used.
6. Before testing, have the Square integration owner obtain Square's written answer on Web Payments SDK support in this WKWebView setup. If Square does not support it, confirm the vendor-approved native alternative and its iOS 27 compatibility before implementing that route. In Square's approved sandbox/test setup and a staging app/API environment, verify the configured payment domain is registered for the correct environment, then test card entry, Apple Pay tokenization, cancellation, and retry. Do not complete a live transaction. If the production profile cannot be pointed at a safe test environment, stop before checkout and have the release owner arrange one.
7. Record the device model, iOS 27 build, app build number, test account type, results, and any logs. Treat any crash, failed Apple Pay session, unexpected permission behavior, or notification failure as a blocker until its owner resolves it and repeats the affected test.

## References

- [Expo SDK 57 release notes: Xcode 27 and scene lifecycle](https://expo.dev/changelog/sdk-57)
- [Expo build-properties documentation](https://docs.expo.dev/versions/latest/sdk/build-properties/)
- [EAS Build server images](https://docs.expo.dev/build-reference/infrastructure/)
- [Square Web Payments Apple Pay requirements](https://developer.squareup.com/docs/web-payments/apple-pay)
- [Square In-App Payments SDK Apple Pay for iOS](https://developer.squareup.com/docs/in-app-payments-sdk/add-digital-wallets/apple-pay)
- [Square In-App Payments SDK React Native plugin](https://developer.squareup.com/docs/in-app-payments-sdk/react-native)
- [Square Mobile SDK changelog, July 27, 2026](https://developer.squareup.com/docs/changelog/mobile-logs/2026-07-27) — its iOS 27 note applies to Mobile Payments SDK 2.6.0, not In-App Payments SDK.
- [pnpm 11 build-script allowlist migration](https://pnpm.io/blog/releases/11.0)
- [Replit mobile app publishing](https://docs.replit.com/build/mobile-app)
- [Replit TestFlight beta testing](https://docs.replit.com/build/mobile-testflight)
