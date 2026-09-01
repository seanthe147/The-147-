# Contributing — Local Dev Setup (macOS)

This guide covers everything a Mac-based contributor needs to get from zero to a running local dev environment and trigger an EAS build.

---

## Prerequisites

Install these before cloning.

| Tool | Required version | Install |
|------|-----------------|---------|
| **Node.js** | 24.x | `brew install node@24` or [nodejs.org](https://nodejs.org) |
| **pnpm** | 10.x (`10.26+` recommended) | `npm install -g pnpm@10` |
| **EAS CLI** | ≥ 12.0.0 | `npm install -g eas-cli` |
| **Expo CLI** | bundled via `@expo/cli` in the workspace | no global install needed |

Verify after installing:

```bash
node --version   # v24.x.x
pnpm --version   # 10.x.x
eas --version    # ≥ 12.0.0
```

---

## Clone and install

```bash
git clone <repo-url>
cd the-147
pnpm install
```

> **Mac gotcha — `sharp` native build:** `pnpm install` may compile the `sharp` image-processing package from source. This requires Xcode Command Line Tools (`xcode-select --install`). If the install hangs or errors on `sharp`, run `xcode-select --install` and retry.

---

## Environment variables

Copy the example env file and fill in the required values:

```bash
cp .env.example .env   # if present, otherwise create .env manually
```

Minimum required:

```
DATABASE_URL=postgres://...   # Postgres connection string
```

Ask a team member for the database URL and any Square/Stripe API keys needed for local testing.

---

## Running the app locally

Start the API server and the Expo app in separate terminals:

**Terminal 1 — API server** (builds then starts, runs on port 8080):
```bash
pnpm --filter @workspace/api-server run dev
```

**Terminal 2 — Expo app** (Metro bundler):
```bash
pnpm --filter @workspace/the-147 run dev
```

Then open the Expo Go app on your phone and scan the QR code, or press `w` to open in the browser.

> **Mac gotcha — Metro port conflict:** Metro defaults to port 8081. If something else is on that port, pass `--port 8082` (or any free port) to the dev command.

---

## Database schema changes

After pulling new changes that include schema updates, push them to your local DB:

```bash
pnpm --filter @workspace/db run push
```

Use `push-force` only if you need to drop conflicting columns (destructive):

```bash
pnpm --filter @workspace/db run push-force
```

---

## Expo Doctor

Before opening a PR that touches `package.json` or native dependencies, run Expo Doctor to catch version mismatches:

```bash
cd artifacts/the-147
npx expo-doctor
```

Fix any warnings before submitting — mismatched native package versions are a common source of build failures.

---

## Store release runbook (owner's Mac only)

Binary builds and store submissions must be run from the owner's Mac terminal, not
from Replit. Start from a clean, up-to-date checkout and install dependencies:

```bash
git pull --ff-only
pnpm install --frozen-lockfile
eas login
cd artifacts/the-147
```

For Google Play submission, download the Play Console service-account JSON to
`artifacts/the-147/secrets/google-play-service-account.json`. The `secrets/`
directory is gitignored; never commit or paste this key. The service account must
have permission to release `com.the147bradford.venue`.

### Choose the correct version action

- **Normal store release:** changes the public app version, runtime version, iOS
  build number, and Android version code together. The default is the next patch:

  ```bash
  pnpm run version:bump -- release
  # Or choose an explicit version:
  pnpm run version:bump -- release 2.9.0
  ```

- **Rebuild the same release:** use when store upload/build credentials failed or
  a native rebuild is needed while keeping compatibility with the same OTA
  runtime. It increments only the two store build numbers:

  ```bash
  pnpm run version:bump -- build
  ```

- **OTA-only JS/assets update:** do not run either bump command. OTA updates must
  retain the installed binary's `version`/`runtimeVersion`.

Review and commit the changed `app.json`, then run the safety checks before every
binary build:

```bash
pnpm run prebuild:check
pnpm run check-expo-deps
pnpm run typecheck
git status --short
```

Resolve every reported casing conflict or junk/untracked path before continuing.
Always keep `runtimeVersion` equal to `version`; the scripts enforce this rule.
The pre-build check also runs the Pint/Half Order-menu regression fixture, so a
split product card or broken variation/modifier cart payload blocks the release.

### iOS App Store release

```bash
EAS_SKIP_AUTO_FINGERPRINT=1 eas build --platform ios --profile production
EAS_SKIP_AUTO_FINGERPRINT=1 eas submit --platform ios --profile production --latest
```

### Android Play Store release

The first Play Store upload for this package may need to be uploaded manually in
Play Console once. After that, the configured production submit profile publishes
the latest AAB to the production track:

```bash
EAS_SKIP_AUTO_FINGERPRINT=1 eas build --platform android --profile production
EAS_SKIP_AUTO_FINGERPRINT=1 eas submit --platform android --profile production --latest
```

### OTA-only update

Use this only for JavaScript and asset changes that do not add/change native
modules, permissions, plugins, entitlements, or native configuration. Those
changes require new store binaries instead.

```bash
# No version bump for an OTA-only update.
pnpm run prebuild:check
EAS_SKIP_AUTO_FINGERPRINT=1 eas update \
  --channel production \
  --message "describe the update"
```

The update is delivered only to installed binaries whose runtime version matches
the unchanged `runtimeVersion` in `app.json`.

---

## Typechecking

```bash
# Check all packages
pnpm run typecheck

# Check a specific package
pnpm --filter @workspace/the-147 run typecheck
pnpm --filter @workspace/api-server run typecheck
```
