---
name: Dependency remediation compatibility
description: Security update constraints for Expo tooling and version-based scanners
---

Prefer compatible-major security updates and exercise the tools, not just
TypeScript checks. Avoid open-ended minimum-version overrides for packages
whose major versions change module exports.

**Why:** An unbounded js-yaml override selected version 5, which removed the
default ESM export expected by Orval. Type checking passed but code generation
failed. Image-size changed its CommonJS export shape and removed synchronous
file-path input between majors; both need adapting in legacy Metro, while
the Buffer input API remains compatible.

**How to apply:** Include real OpenAPI generation and Metro asset processing
when updating these tools. Preserve the Node-20-compatible Undici line for
Expo Launch. For locally patched packages, a version-only vulnerability scan
can still flag the original version: report this explicitly, keep behavioral
regressions, and replace the backport with an upstream release when available.

Orval's inferred Zod major can differ from the consuming workspace package.
**Why:** A regenerated client selected Zod 4 APIs while the server schema package
still used Zod 3; generated fetch helpers also started requiring DOM iterables.
**How to apply:** Explicitly target the consumer's Zod major and run workspace
type checks after generation, not just before dependency updates.
