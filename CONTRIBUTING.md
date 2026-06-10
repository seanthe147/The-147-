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

## EAS builds (binary builds — must run from Mac terminal)

> **Important:** `eas build` archives the git working tree and writes to `.git/index.lock`. This is blocked inside the Replit agent environment. **Always trigger binary builds from your local Mac terminal.**

Log in first (one-time):
```bash
eas login
```

Available build profiles (defined in `artifacts/the-147/eas.json`):

| Profile | Purpose | Platforms |
|---------|---------|-----------|
| `development` | Dev client (internal distribution) | iOS (device), Android |
| `preview` | Internal test build (IPA / APK) | iOS, Android |
| `production` | App Store / Play Store release | iOS (AAB), Android |

Trigger a build from the `artifacts/the-147` directory:

```bash
cd artifacts/the-147

# Preview build for both platforms
EAS_SKIP_AUTO_FINGERPRINT=1 eas build --profile preview --platform all

# Production iOS only
EAS_SKIP_AUTO_FINGERPRINT=1 eas build --profile production --platform ios

# Production Android only
EAS_SKIP_AUTO_FINGERPRINT=1 eas build --profile production --platform android
```

> Always pass `EAS_SKIP_AUTO_FINGERPRINT=1` — this project uses a hardcoded `runtimeVersion` in `app.json` (required for OTA update targeting). Letting EAS compute a fingerprint will break OTA delivery to existing installs.

---

## OTA updates (publishing JS-only changes without a new binary)

OTA updates **can** be pushed from the Replit environment or from a Mac terminal:

```bash
cd artifacts/the-147

# Push to the production channel (iOS + Android)
GIT_INDEX_FILE=/tmp/eas-git-index EXPO_TOKEN=$EXPO_TOKEN EAS_SKIP_AUTO_FINGERPRINT=1 \
  npx eas-cli update --channel production --message "describe your change" --non-interactive
```

Or use the workspace scripts from the repo root:

```bash
pnpm --filter @workspace/the-147 run update:production "describe your change"
pnpm --filter @workspace/the-147 run update:preview "describe your change"
```

> The `runtimeVersion` in `app.json` must exactly match the installed binary's runtime version or the update will be silently ignored. After building a new binary, check the EAS build metadata for `Runtime Version` and update `app.json` before pushing OTAs.

---

## Typechecking

```bash
# Check all packages
pnpm run typecheck

# Check a specific package
pnpm --filter @workspace/the-147 run typecheck
pnpm --filter @workspace/api-server run typecheck
```
