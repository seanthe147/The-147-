---
name: Playwright in Nix test runners
description: Runtime requirements for launching Playwright Chromium from Node test scripts in this workspace
---

Browser binaries launched by Playwright may not inherit the Nix library search paths that are available to the Node process. A browser test runner should pass the relevant Nix library directories through `LD_LIBRARY_PATH`, including graphics and audio libraries when Chromium reports missing shared objects.

**Why:** the browser package and downloaded Chromium can both be present while the child process still fails before opening a page because dynamic libraries are not discoverable.

**How to apply:** derive library directories from `NIX_LDFLAGS` and the active Nix store entries rather than hardcoding store hashes, and keep the browser test dependency scoped to the artifact that owns the test.