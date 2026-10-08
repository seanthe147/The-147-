---
name: Expo cloud build source
description: Source verification and approval boundaries for connected Expo cloud builds.
---

Before requesting a build through connected Expo tooling, verify the selected linked GitHub ref contains the audited release source and its intended native build profile. Do not assume GitHub `main` matches the Replit workspace.

**Why:** A cloud request resolved an older GitHub release without the audited scene support or supported Xcode image, even though the local workspace had both. The request had to be cancelled and produced no useful release evidence.

**How to apply:** Compare the remote ref's release identity, native configuration, and build profile before consuming an approved build allowance. Use an explicitly selected release/test ref for source synchronization. Keep automatic submission disabled for build-only approval; separately verify internal TestFlight distribution. Native device results remain required even after a successful cloud build.
