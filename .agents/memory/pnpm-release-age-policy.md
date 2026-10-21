---
name: pnpm release-age exception precedence
description: Exact-version exceptions can be ignored when an earlier exception names the same package.
---

Keep one release-age exception per package. With pnpm 10.26, the first matching package rule wins; separate entries for older and newer exact versions do not merge.

**Why:** Adding a newer scoped Expo patch exemption below an existing older-version exemption still produced a release-age rejection, even though the effective configuration displayed both. Inspecting pnpm's policy evaluator confirmed first-match behavior.

**How to apply:** Replace the superseded exception, or combine still-required exact versions in one entry using `package@version1 || version2`. Do not disable the global minimum age or broaden an exception to all versions just to fix precedence. Inspect newly required transitive versions separately; a direct-package exemption does not exempt its dependencies.
