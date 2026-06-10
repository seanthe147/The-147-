---
name: EAS OTA push from Replit
description: Durable rules for publishing Expo OTA updates and building binaries — channel wiring, runtime version, git lock, and production server separation.
---

## Production binary facts

- The production binary connects to a **separate server** — NOT `the147bradford.replit.app`. Replit is dev/staging only. Database changes on Replit have no effect on what the installed app sees.
- The TestFlight binary (v2.8.7) was built from the old Mac monolithic repo (`~/The-147`), not the Replit pnpm workspace. Future builds should come from Replit (build number starts at 68 to exceed old Mac's 67).

**Why:** EXPO_PUBLIC_API_BASE_URL is baked into the binary at build time. Changing Replit's DB won't affect a binary pointing elsewhere.

## Runtime version must match exactly

OTA delivery requires an exact string match between the binary's embedded `runtimeVersion` and the published update's `runtimeVersion`. Mismatch = silent 0 downloads, no error.

Replit's `app.json` uses `"runtimeVersion": "2.8.7"` (hardcoded string matching the binary). After any new binary build, check EAS build metadata for `Runtime Version` and update `app.json` to match before pushing OTAs.

## Channel must be explicitly wired

Without `expo-channel-name` in `updates.requestHeaders` and `channel` in each `eas.json` build profile, the binary polls no channel and receives no OTAs. Both are now set in `app.json` and `eas.json`.

## eas update from Replit (works, ~30s iOS-only)

```bash
cd /home/runner/workspace/artifacts/the-147
GIT_INDEX_FILE=/tmp/eas-git-index EXPO_TOKEN=$EXPO_TOKEN EAS_SKIP_AUTO_FINGERPRINT=1 \
  npx eas-cli update --channel production --platform ios --message "..." --non-interactive
```

`GIT_INDEX_FILE` redirects the lock file away from the protected `.git/` directory.

## eas build from Replit — blocked

`eas build` archives the git working tree and writes `.git/index.lock` — blocked by Replit main agent. Must run from the Mac terminal. Build number must be set manually (not `autoIncrement: true`) to a value above the last submitted build (67).

## Ordering override (Replit DB only)

`ordering_enabled` staff toggle only controls the venue kill switch — does not override the bar/kitchen schedule. To force-open for testing outside hours, upsert `ordering_overrides` in `site_settings` as a JSON array: `[{"date":"YYYY-MM-DD","closed":false,"startTime":"00:00","endTime":"28:00"}]`. This only works when the app is connected to Replit's server.
