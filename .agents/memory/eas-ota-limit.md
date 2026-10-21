---
name: EAS OTA push from Replit
description: Runtime compatibility and publishing constraints for installed Expo apps.
---

## Follow the current publishing skill

Use Expo Launch for iOS store publishing. Do not run or suggest EAS CLI commands, including update commands. Older notes recommending manual EAS commands are superseded by the Expo skill.

**Why:** Current platform instructions explicitly prohibit that publishing route. Historical successful commands are not authorization to reuse it.

**How to apply:** Read the Expo skill for publishing requests and consult official Replit documentation for platform capabilities. Do not imply a website/backend republish sends mobile code to installed apps.

## Establish actual native compatibility before OTA

Matching runtime strings are necessary but not sufficient: the installed binary must also contain the native modules and compatible Expo/React Native versions required by the bundle. Do not change runtime strings merely to force an update onto an older binary.

**Why:** A manually maintained runtime string can remain unchanged across native dependency changes. Marketing version and build number alone do not prove OTA compatibility.

**How to apply:** Obtain the installed build's metadata or native manifest; compare native dependencies, runtime, update project and channel against the release source. Verify the release API destination separately. If build evidence is unavailable, report that limitation rather than certify an OTA.

## Build-history sources can differ

The configured project's EAS build list and Expo Launch session lookup may not expose the installed TestFlight build.

**Why:** The connected EAS history did not contain the user-reported newer TestFlight build, while the Launch lookup returned no session. Neither establishes that the user's installed build does not exist.

**How to apply:** Ask for the actual Expo build link or build metadata when the installed build is missing; do not substitute the latest visible historical build or claim a publish succeeded.
