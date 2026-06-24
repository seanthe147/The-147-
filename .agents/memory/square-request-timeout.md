---
name: squareRequest timeout
description: squareRequest had no timeout — any slow Square API call hung indefinitely
---

## Rule
`squareRequest` in `square.ts` now has a 15-second `AbortController` timeout on every fetch. Times out with `SquareError("Square API request timed out (15 s)", "TIMEOUT", 504)`.

**Why:** Without a timeout, slow/stalled Square API responses caused the entire staff portal's "Import from POS" and "Auto-link" panels to hang permanently (spinner never resolved). Affected all Square calls — loyalty, catalog, orders, etc.

**How to apply:**
- No action needed — the timeout is inside `squareRequest` and covers every Square call automatically.
- If a feature needs a longer timeout (e.g. bulk catalog imports), pass a custom signal or increase the 15s value locally.
