---
name: EAS OTA push from Replit
description: Why eas update cannot be run from inside Replit's bash tool
---

## Problem
`eas update --channel production` requires Metro to bundle both iOS and Android JS bundles before uploading. On this project (~2000 modules), Metro bundling alone takes ~2 minutes. The bash tool has a hard 120-second timeout.

## Result
The command times out mid-upload after bundling completes. The upload never finishes; no OTA is pushed.

## Workaround
OTA pushes must be run from the user's terminal (local machine) where there is no timeout:
```bash
cd artifacts/the-147
eas update --channel production --message "..."
```
After the push, the user must force-close and reopen the app to pick up the update immediately (otherwise it auto-downloads in the background on next launch).

**Why**: EAS OTA bundles are ~4MB compressed; upload + server processing adds another 30–60s on top of the 2-min bundle time.
