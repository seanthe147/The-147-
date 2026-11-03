---
name: Fixture provider rate limits
description: Public sports feed throttling and safe refresh behaviour
---
Keep fixture refreshes paced and single-flight, and preserve failed-source snapshots with a visible stale warning rather than presenting partial data as complete.

**Why:** production TheSportsDB requests returned HTTP 429 during simultaneous 25-request refresh batches even with one serving instance. Being below a nominal minute quota does not establish that bursts are safe.

**How to apply:** respect Retry-After without blocking staff HTTP requests. Successful empty responses must replace old source snapshots; failures must not. Process-local coordination does not protect against multiple instances, and snapshots do not survive restarts.
