---
name: Expo native manifest verification
description: Expo config introspection does not materialize native config-plugin output; verify Android manifest changes with a local prebuild.
---

Expo's config introspection output is not sufficient for checking Android manifest modifications produced by config plugins. Use a temporary local `expo prebuild --platform android --no-install` and inspect the generated manifest, then remove generated native/build artifacts before finishing.

**Why:** Config-only introspection can report an empty Android mods section even when the generated native project correctly contains the plugin's manifest changes.

**How to apply:** Use this workflow when validating wallet flags, package-specific Google services configuration, permissions, or any other Android manifest requirement before a production build.