---
name: EAS OTA push from Replit
description: How to publish Expo OTA updates from Replit — runtime version gotcha, git lock workaround, binary channel config, and production server facts.
---

## Production binary facts (as of June 2026)

- The TestFlight binary (version 2.8.7) was built from the **old Mac monolithic repo** (`~/The-147`), NOT the Replit pnpm workspace.
- The binary connects to a **separate production API server** — NOT `the147bradford.replit.app`. Replit is the dev/staging environment.
- Changes to Replit's database (ordering overrides, settings) do NOT affect what the production binary sees.
- The new binary built from Replit (build number 68, June 2026) correctly wires the `production` EAS Update channel and `expo-channel-name` header — OTAs from Replit will work once this binary is installed.

## Runtime version — CRITICAL

The TestFlight binary version 2.8.7 uses `"runtimeVersion": {"policy": "nativeVersion"}` → runtime version = `"2.8.7"`.
Replit's `app.json` is now set to `"runtimeVersion": "2.8.7"` to match.

**Why:** OTA delivery requires exact `runtimeVersion` string match. Any mismatch = silent ignore, 0 downloads.

**How to apply:** After any new binary build, check build metadata for `Runtime Version` and update Replit's `app.json` to match.

## Channel wiring — now fixed

Old binary had no `expo-channel-name` in `updates.requestHeaders` — it never polled any channel.
Fixed in Replit's `app.json`:
```json
"updates": {
  "url": "https://u.expo.dev/3f31dfb1-b149-43ca-ab9a-91b6d7cb230a",
  "requestHeaders": { "expo-channel-name": "production" }
}
```
And in `eas.json`: each profile now has an explicit `"channel"` key.

## Running eas update from Replit (works)

Metro bundling takes ~25s (iOS-only). Git lock workaround:
```bash
cd /home/runner/workspace/artifacts/the-147
GIT_INDEX_FILE=/tmp/eas-git-index EXPO_TOKEN=$EXPO_TOKEN EAS_SKIP_AUTO_FINGERPRINT=1 \
  npx eas-cli update --channel production --platform ios --message "..." --non-interactive
```

## eas build from Replit — BLOCKED

`eas build` archives the git working tree and writes `.git/index.lock` — blocked by Replit's main agent protection. Must be run from the Mac terminal:
```bash
cd ~/The-147   # or wherever the repo with the fix lives
eas build --profile production --platform ios --non-interactive
```

## Ordering override (Replit DB only)

The `ordering_enabled` staff toggle only controls the venue-wide kill switch — it does NOT override the bar/kitchen schedule. To force-open outside scheduled hours, insert an `ordering_overrides` row in `site_settings`:
```json
[{"date": "YYYY-MM-DD", "closed": false, "startTime": "00:00", "endTime": "28:00"}]
```
**This only affects apps connected to Replit's server.** The production binary uses a different backend.

## Build number

The old Mac repo was on build number 67. Replit's `app.json` now uses `buildNumber: "68"` to supersede it. Do NOT use `autoIncrement: true` in eas.json — it starts from the local value (5) which Apple will reject.
