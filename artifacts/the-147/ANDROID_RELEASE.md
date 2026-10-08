# Android production update — 2026-10-08

**Status: NOT BUILT OR PUBLISHED.** Two approved cloud attempts failed before Android compilation. The initial dependency-installation mismatch was corrected; the replacement stopped at a missing Firebase client configuration during Android prebuild. No app bundle was generated and no Google Play submission was attempted.

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
- No third attempt is approved or started. Version code `125` remains unused by Play because neither attempt produced or uploaded a bundle.

## Publishing access

- Google Play OAuth was attached to the project.
- Expo's reviews check returned Google API `403 PERMISSION_DENIED`. Reviews access does not establish production-release permission.
- The direct connector's Android Publisher request returned HTML `404`: its configured base host is `play.googleapis.com`, not the Android Publisher service host `androidpublisher.googleapis.com`. This routing failure does not prove the OAuth credential is invalid.
- The service-account JSON path referenced by the submission profile is absent locally. Whether Expo already has suitable stored submission credentials is not yet confirmed.
- Once a valid store build finishes, check its package, release identity, source commit, and artifact before attempting production submission. If automatic submission cannot proceed, the owner can upload the finished AAB through Play Console. Do not report an update as published until release status is confirmed.
