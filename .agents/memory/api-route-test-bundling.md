---
name: API route test bundling
description: How to run source-level API route tests in this pnpm API artifact
---

Source-level tests that import the full API routes module must be bundled with esbuild before Node runs them. The source uses extensionless internal imports and production-oriented dynamic imports that Node's type-stripper cannot resolve directly.

**Why:** keeping the route test at the HTTP boundary is valuable, but directly executing the source test fails before the route runs; bundling workspace TypeScript sources preserves the real middleware and handler path.

**How to apply:** Build the test into a temporary directory inside the API artifact, bundle workspace sources while externalizing third-party runtime packages, run it with `node --test --test-force-exit`, and always remove the temporary directory afterward. The force-exit avoids lingering server-module resources after assertions pass.