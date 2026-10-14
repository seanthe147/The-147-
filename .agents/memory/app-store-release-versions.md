---
name: App Store release versions
description: Apple closed-release rejection and the distinction between release version and build number.
---

When Apple rejects an upload because a previously approved release version is closed, increase the public release version, not only the iOS build number. Keep the explicitly versioned Expo runtime aligned for a new binary release.

**Why:** Expo Launch successfully compiled the app but Apple rejected its submission with errors 90186 and 90062. This is a release-version rejection, not a native compilation or credential failure.

**How to apply:** Inspect the actual failed Launch logs before editing. Choose a higher release version and an iOS build number above the submitted build reported there; Launch's submitted number can exceed the local configuration. Preserve bundle identifiers. Verify resolved Expo configuration and ask the user to retry from Publish; do not run manual build/submission commands.
