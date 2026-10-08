# Android production update — 2026-10-09

**Status: BUILT, NOT PUBLISHED.** The fourth approved Android attempt produced a signed production app bundle. Its package, release identity, source commit, SDK, and store distribution were verified. The Google Play submission request failed credential-field validation before starting an upload; no submission ID was returned. Native device journeys remain untested.

## Intended release

- App: The 147, package `com.the147bradford.venue`.
- Version: `2.8.9`, Android version code `125`, runtime `2.8.9`, Expo SDK 57.
- Build: `production`, store distribution, Android App Bundle.
- Intended submission: Google Play `production`, release status `completed`, as requested by the owner. Automatic submission is disabled until the finished build is checked.

## First attempt and pnpm fix

- Build ID: `2ccf51ee-7639-4dcc-aaab-9f0a64e22903`.
- Verified GitHub source: `1f18ce43371d08be3da7c65aa2a3ae82af849524`.
- Result: `ERRORED`, `INSTALL_DEPENDENCIES`.
- The worker correctly selected Node `22.19.0` but defaulted to pnpm `8.7.5`. It ignored lockfile format `9.0` as incompatible and failed with `ERR_PNPM_NO_LOCKFILE` during `pnpm install --frozen-lockfile`. The lockfile was present; the package-manager version was wrong.
- Production now explicitly requests pnpm `10.26.1` in both `eas.json` and the embedded Replit build configuration, matching the locally verified package manager. The frozen-lockfile requirement remains enabled.
- Local checks pass after the fix: `pnpm install --frozen-lockfile --offline`, `check-expo-config`, and assertions that both production build routes select pnpm `10.26.1` with the unchanged Android release identity.
- Version code `125` can be retained because this attempt produced no bundle and uploaded nothing to Play.
- A replacement cloud attempt requires fresh owner approval. The pnpm fix is not proof of a successful native compile; other build phases remain unverified.

## Approved replacement result

- Build ID: `bc34fa83-0509-4a92-a14f-49e9e98e0849`.
- Verified GitHub source: `51bab0738fbff7ef2a5aa21aaca09805332812bf`.
- The worker selected Node `22.19.0` and pnpm `10.26.1`; dependency installation passed. Release metadata correctly identified version `2.8.9`, code `125`, and SDK `57.0.0`.
- Result: `ERRORED`, `PREBUILD`, `EAS_BUILD_MISSING_GOOGLE_SERVICES_JSON_ERROR`.
- `artifacts/the-147/google-services.json` exists locally and contains a client for the correct Android package, with no service-account or private-key material detected. Both the root and app Git ignore rules exclude it, so the GitHub checkout could not supply the declared `./google-services.json` input.
- The other declared image inputs exist locally. Before another paid attempt, verify the required inputs in the actual cloud-source checkout and run Android prebuild against those inputs.
- Preserve the existing file-privacy rule unless the owner explicitly approves including the Android client configuration in GitHub. Alternatively provision the file securely through Expo's production environment and keep it out of Git. Google Play service-account credentials must remain private in either case.
- At this point no bundle had been produced or uploaded; version code `125` remained unused by Play. The separately approved third attempt is recorded below.

## Private Firebase file delivery

The owner chose to keep the Android client file private in Expo. Both Git ignore rules remain unchanged.

- A dependency-free `eas-build-pre-install` hook prepares the declared Android file from the `GOOGLE_SERVICES_JSON` file variable before Expo prebuild.
- The hook checks the Android package and rejects service-account/private-key material without logging the file contents. iOS builds skip this Android-only requirement.
- Eleven preparation tests and the local native-input preflight pass. Public native assets and local config-plugin inputs must be tracked; the private Firebase input requires separate cloud provisioning.
- A clean export of the candidate Git source, initially without the ignored Firebase file, passed Android `expo prebuild --platform android --no-install --clean` after supplying the private file through the hook. The generated Firebase client matched the Android package, and generated Gradle metadata matched version `2.8.9` / code `125`. Temporary private files and generated native output were removed. This was not an APK/AAB compile or a cloud-variable verification.
- **Required owner setup:** open the project's [Expo environment variables](https://expo.dev/accounts/the-147/projects/the-147/environment-variables), add `GOOGLE_SERVICES_JSON`, select **production**, choose type **File** and visibility **Secret**, and upload the existing `artifacts/the-147/google-services.json` file. Do not upload a Google Play service-account key or paste file contents into chat.
- The owner confirmed the upload was done. The third attempt's `PRE_INSTALL_HOOK` log confirms: `Android Firebase configuration prepared from the private Expo file variable.` Android prebuild then succeeded. The file remains excluded from GitHub.
- This keeps the source file out of GitHub. Firebase client settings still become part of the compiled Android app by design.

## Third attempt and Android compiler image

- Build ID: `9dda3efe-7ab1-44be-ba3a-f5887dcc4b3e`.
- Approved limit: one additional Android build; that allowance has been used.
- Verified GitHub source: `66b47aa48f1e2504c0f9831528c5d5f9e8846002`.
- Cloud metadata: SDK `57.0.0`, version `2.8.9`, code `125`, store distribution.
- Dependencies and Android prebuild passed. The private file hook worked.
- The cloud worker selected `ubuntu-22.04-jdk-11-ndk-r21e` with Java 11 despite the SDK 57 app metadata.
- Result: `ERRORED`, `RUN_GRADLEW`, `EAS_BUILD_UNKNOWN_GRADLE_ERROR`. The specific error was: `Gradle requires JVM 17 or later to run. Your build is currently configured to use JVM 11.`
- Production now explicitly requests the documented SDK 57 image `ubuntu-26.04-jdk-17-ndk-r27b-sdk-57` in both build routes. Expo's current infrastructure documentation lists Java 17 and NDK 27.1 for this image. Node `22.19.0` and pnpm `10.26.1` remain explicitly selected.
- Native-input preflight now requires explicit Android/iOS images, an SDK-matched Android image with JDK 17+, aligned runtime selections across both routes, the production environment, an Android App Bundle, and pnpm matching the verified local toolchain.
- After the image-selection fix, all seven toolchain guard tests, the native-input preflight, and `check-expo-config` pass. Both Android image declarations and the unchanged release identity are verified locally.
- At this point, a fourth attempt still required separate approval and confirmation of the requested image in cloud logs. The owner subsequently approved exactly one attempt, recorded below.
- The first three attempts produced no AAB or Play upload.

## Fourth attempt: finished native bundle

- Build ID: `93c6e6c8-21b9-4b5f-bcaf-3ef52d6bb71c`.
- Verified GitHub source: `3e08a2085c9d4d2747499f8da8e0b3069df58a2c`.
- Result: `FINISHED`, with an application archive available. Finished at `2026-10-08T23:21:35.826Z` (9 October, 00:21 BST).
- Cloud logs confirm the requested `ubuntu-26.04-jdk-17-ndk-r27b-sdk-57` image and `JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64`. Private Firebase preparation and Android prebuild passed.
- Gradle completed the release bundle and signing tasks. Final metadata matches Android, store distribution, SDK `57.0.0`, version `2.8.9`, and code `125`. The cloud app configuration also matches package `com.the147bradford.venue` and the intended version/code.
- The approved allowance was used once. No additional build or automatic retry was started.
- This verifies a native Android compile and signed bundle, not cold launch, authentication, payments, notifications, biometrics, or other physical-device journeys. It does not complete the separate iOS 27 verification.

## Production submission blocker

- The owner-requested production submission was attempted using the finished bundle above.
- The submission tool returned: `GraphQL error: contains a conflict between exclusive peers [googleServiceAccountKeyId, googleServiceAccountKeyJson]`.
- This is submission request validation, not a Java/build failure or confirmation that Google Play rejected the app. No submission ID was returned and publication is not confirmed.
- The tool exposes no credential-selection parameter to resolve those competing fields. Do not repeat the same request unchanged, rebuild the app, or change Firebase client configuration to address this error.
- The existing signed AAB can be reused. A documented alternative is to download it from the [finished Expo build](https://expo.dev/accounts/the-147/projects/the-147/builds/93c6e6c8-21b9-4b5f-bcaf-3ef52d6bb71c) and upload it to the existing app's production release in [Google Play Console](https://play.google.com/console/). Review/processing and any publishing controls still apply.

## Publishing access

- Google Play OAuth was attached to the project.
- Expo's reviews check returned Google API `403 PERMISSION_DENIED`. Reviews access does not establish production-release permission.
- The direct connector's Android Publisher request returned HTML `404`: its configured base host is `play.googleapis.com`, not the Android Publisher service host `androidpublisher.googleapis.com`. This routing failure does not prove the OAuth credential is invalid.
- The service-account JSON path referenced by the submission profile is absent locally. Whether Expo already has suitable stored submission credentials is not yet confirmed.
- The finished bundle's release identity and source were checked before the submission attempt. The callback credential-format failure, the connector's host failure, and reviews permissions are separate issues; none proves successful publication. Do not report the update as published until its production release status is confirmed.
