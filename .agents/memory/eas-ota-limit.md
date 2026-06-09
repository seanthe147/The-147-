---
name: EAS OTA push from Replit
description: How to publish Expo OTA updates from Replit — runtime version gotcha, git lock workaround, and file delivery to Mac.
---

## Runtime version — CRITICAL

The installed binary was built from the old Mac monolithic repo (`~/The-147/`) which uses `"runtimeVersion": {"policy": "nativeVersion"}`. This computed to **`"2.8.3"`** at build time.

Replit's `app.json` had `"runtimeVersion": "2.8.7"` — every Replit OTA was silently ignored (runtime version mismatch). **Fixed:** Replit's `app.json` now has `"runtimeVersion": "2.8.3"`.

**Why:** OTA delivery requires an exact string match between the binary's embedded `runtimeVersion` and the published update's `runtimeVersion`. The EAS server silently returns nothing on mismatch — no error anywhere.

**How to apply:** After any EAS Build (new binary), check what `runtimeVersion` it compiled with and update Replit's `app.json` to match before publishing OTAs.

## Running eas update from Replit (now works)

Metro bundling takes ~25s (iOS-only) on Replit. The 120s bash limit is sufficient for `--platform ios`.

**Git lock workaround** — EAS CLI tries to write `.git/index.lock` after publishing, which Replit's main agent blocks. Redirect the lock file:

```bash
cd /home/runner/workspace/artifacts/the-147
GIT_INDEX_FILE=/tmp/eas-git-index EXPO_TOKEN=$EXPO_TOKEN npx eas-cli update \
  --channel production --platform ios \
  --message "..." --non-interactive
```

If bundles are already cached in `dist/` from a previous run, add `--skip-bundler --input-dir dist` to skip re-bundling and save ~25s (verify the dist hash is current first).

## Getting files to Mac when repos have diverged

Mac old repo (monolithic) and Replit monorepo have diverged — `git fetch` via the `subrepl-*` SSH remotes requires a password (SSH key not set up on Mac).

Fastest workaround: add a temporary GET endpoint to the API server, user curls it over HTTPS:
- Route in `artifacts/api-server/src/routes/routes.ts` inside `registerRoutes`
- `__dirname` in the compiled bundle resolves to `artifacts/api-server/dist/`
- Path to Expo app files: `path.join(__dirname, "../../the-147/components/...")`
- User curls `https://the147bradford.replit.app/api/tmp/<slug>` to download
- Remove the route after use and restart the API server
