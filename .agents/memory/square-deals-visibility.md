---
name: Square deals visibility / activation
description: How the app decides which Square catalog discounts ("deals") show, and how deactivation works
---

# Square deals visibility (getSquareDeals)

`getSquareDeals()` in `artifacts/api-server/src/square.ts` reads discounts LIVE from
Square's catalog (`/v2/catalog/search` DISCOUNT + PRICING_RULE + PRODUCT_SET),
served via `/api/deals`. There is a 60s in-memory `dealsCache`; the client adds its
own ~60s staleTime, so worst-case propagation is ~2 min.

## Square has no active/inactive flag on a DISCOUNT
A Square DISCOUNT object only has name/type/amount/application_method. There is NO
enabled/disabled boolean. What makes a discount "live" is its PRICING_RULE schedule
(`valid_from_date` / `valid_until_date`).

**Rule:** a deal is shown on the app only if the current Europe/London date and
time falls inside at least one pricing rule's `[valid_from, valid_until)` window
(missing bound = open-ended). Use `valid_from_local_time` and
`valid_until_local_time` when present. The end boundary is exclusive.
Discounts with NO pricing rule at all, or with a rule that has no date/time
boundary, are not customer-facing app offers. They may still exist in Square
for manual staff use, but the app has no reliable expiry signal and must not
advertise or auto-apply them.

**Why:** Square POS stopped a weekend deal at its Monday end time, while the app
continued showing it because it treated `valid_until_date` as inclusive and
ignored `valid_until_local_time`. Matching Square's local timestamp prevents the
app and POS disagreeing around a cutover.

**How to apply:** if asked "deal won't disappear / won't deactivate", first check
the pricing rule's date and local-time boundaries, then allow for the app/server
cache. Deleted discounts are excluded via `include_deleted_objects:false` and
the `is_deleted` check.

## Diagnostic
A throwaway node script using `SQUARE_ACCESS_TOKEN` + `SQUARE_ENVIRONMENT` against
`/v2/catalog/search` (object_types DISCOUNT then PRICING_RULE) dumps raw objects to
see the real schedule/state — fastest way to confirm what Square actually holds.
