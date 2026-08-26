---
name: pnpm ignored-audit behavior
description: How pnpm reports advisories that are explicitly ignored in workspace auditConfig
---

When every remaining advisory is listed in `auditConfig.ignoreCves`, `pnpm audit`
exits successfully and labels the findings as ignored. In pnpm 10.26, the JSON
form still exits non-zero and includes ignored findings in the metadata count,
even though its advisories object is empty.

**Why:** Treating the JSON command's exit code as the policy result incorrectly
fails an audit whose only findings are approved, scoped exceptions.

**How to apply:** Use plain `pnpm audit` as the policy gate. Use JSON output only
to inspect that every reported action resolves exclusively to the documented
exception IDs; do not use the JSON exit code alone as the pass/fail result.