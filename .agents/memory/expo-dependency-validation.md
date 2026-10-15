---
name: Unattended Expo dependency checks
description: Why Expo dependency validation needs non-interactive CI mode.
---

Run Expo dependency checks with `CI=true` in unattended validation.

**Why:** `expo install --check` can ask “Fix dependencies?” when installed versions differ from Expo's recommendations. Without CI mode, the check waits indefinitely instead of reporting failure, preventing completion of unrelated work.

**How to apply:** Use non-interactive mode for automated checks and preserve the failing exit code. Do not silently fix dependencies or waive mismatches as part of unrelated tasks; package upgrades need their own scope and verification.

Permission to update Expo packages does not by itself authorise relaxing the package-release safety delay. When that delay blocks alignment, ask separately; use exact-version exceptions, not an Expo-wide wildcard.

**Why:** The owner approved version-specific exceptions after being told that recommended Expo patches were too recent for the safety delay. Both direct packages and required Expo dependencies can be affected.

**How to apply:** Inspect the required dependency graph and publication dates before retrying installation. Limit any approved exceptions to the exact blocked versions; keep the general safety delay and package security scanner enabled.
