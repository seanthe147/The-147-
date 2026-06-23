---
name: getSetting cache
description: getSetting/setSetting caching behaviour and Promise.all parallelisation
---

## Rule
`storage.getSetting()` now has a 30-second in-memory TTL cache (per key). `setSetting()` immediately invalidates that key's cache entry.

**Why:** Every `getSetting()` was a raw `SELECT` with no cache — sequential calls in hot routes (Teya status: 5 queries, geofence: 3 queries, kiosk checkout: 3 queries) were serial DB round-trips on every request.

**How to apply:**
- No special handling needed for new routes — cache is transparent.
- `setSetting()` invalidates the cache so updates propagate within 30 s at worst, instantly if called via the API.
- Do NOT add another cache layer on top — the storage-level cache already covers it.
- If a setting must be read instantly after a write in the same request, it's fine: the cache is invalidated by `setSetting()` before the read.
