# Dependency security maintenance

Updated: 2026-10-23. Owner: The 147 project maintainers.
Review local patches and exceptions by 2026-11-23, or when their upstream packages release fixes.

## Updates

The dependency manifests and lockfile update Orval, Nodemailer, Multer,
Sharp, compression, Vite and affected transitive dependencies. The Vite 7,
xmldom 0.8 and Undici 7 lines are retained to preserve plugin, Expo and
Node 20 compatibility. Orval is development-only and requires Node >=22.18;
the workspace development runtime is Node 24. Expo notifications is aligned
with Expo's required 57.0.24 compatibility patch; the Expo SDK and app
release/runtime identifiers are unchanged.
The one-day minimum package release age remains enabled.

## image-size and Metro compatibility

image-size 2.0.4 replaces vulnerable 1.2.1, resolving CVE-2025-71329 and
CVE-2025-71330 rather than accepting them as build-time risks. Both legacy
Metro versions use a Buffer API, which still works, and a file-path API,
which 2.x removes. The two version-scoped pnpm patches change Metro's legacy
default import to the named `imageSize` export and read file bytes before
measuring file-backed assets. No parser is forked.

When updating Metro, remove a patch only when the new version already uses
the named export. Run `pnpm test:dependency-security` and an Expo web export.

## node-forge local backport

There is no published fixed node-forge version for GHSA-86w9-cpqp-85rv
(CVE-2026-85393). The version-scoped pnpm patch rejects extra elements in the
nested RSA PKCS#1 v1.5 DigestAlgorithm sequence, and rejects nonempty NULL
parameters. Valid signatures, including SHA-256 with absent NULL parameters,
remain supported. Regression tests use real RSA signatures over malformed
DigestInfo structures, not only source-text assertions.

The corresponding CVE is excluded from pnpm's version-based audit **only
because the installed package is patched**. The platform scanner can still
report node-forge 1.4.0 because it does not inspect patch contents; this is a
known version-based finding, not an upstream fix. Do not remove the patch
while retaining the audit exclusion. Replace both with an upstream update
once a fixed release is available.

## Withdrawn advisory

CVE-2026-93687 / GHSA-vfj7-8cjw-p6xm (braces) was explicitly withdrawn by
GitHub because it is not practically exploitable. It appeared in the initial
registry audit but no longer appears in the final audit. No exception is retained.
Source: https://github.com/advisories/GHSA-vfj7-8cjw-p6xm

## Checks

- `pnpm install --frozen-lockfile` verifies reproducibility and patch application.
- `pnpm audit` checks for actionable version-based advisories.
- `pnpm test:dependency-security` checks the RSA backport, Metro asset processing,
  malformed image termination, and offline email composition.
- `pnpm typecheck`, `pnpm validate:release`, Expo dependency checks and web
  export provide compatibility checks.
