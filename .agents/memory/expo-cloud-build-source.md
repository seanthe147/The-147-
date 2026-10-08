---
name: Expo cloud build source
description: Source verification and approval boundaries for connected Expo cloud builds.
---

Before requesting a build through connected Expo tooling, verify the selected linked GitHub ref contains the audited release source and its intended native build profile. Do not assume GitHub `main` matches the Replit workspace.

**Why:** A cloud request resolved an older GitHub release without the audited scene support or supported Xcode image, even though the local workspace had both. The request had to be cancelled and produced no useful release evidence.

**How to apply:** Compare the remote ref's release identity, native configuration, and build profile before consuming an approved build allowance. Use an explicitly selected release/test ref for source synchronization. Keep automatic submission disabled for build-only approval; separately verify internal TestFlight distribution. Native device results remain required even after a successful cloud build.

A successful GitHub fetch does not prove that the saved credential can push. Prefer secure runtime credentials over tokens embedded in repository URLs.

**Why:** Reading the older remote source succeeded, but pushing was rejected because saved credentials were stale. A different existing project credential was valid. Read-only access and write authorization were separate checks.

**How to apply:** Verify the user-authorized write using an existing credential without displaying its value or storing it in a remote URL. Do not infer that all project credentials are invalid from one stale credential, and do not expose raw authenticated remote URLs while diagnosing failures.
