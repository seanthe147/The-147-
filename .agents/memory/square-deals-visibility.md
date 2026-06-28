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

**Rule:** a deal is shown on the app only if today falls inside at least one of its
pricing rules' `[valid_from, valid_until]` windows (missing bound = open-ended).
Discounts with NO pricing rule at all are always-on (manual discounts).

**Why:** lets staff deactivate a promo without deleting it — set the schedule end
date to the past (or start date to the future) to hide it; extend/clear dates to
reactivate. Deleting the discount entirely is no longer required.

**How to apply:** if asked "deal won't disappear / won't deactivate", first check
the discount's pricing-rule date window covers today (that's why it still shows),
not the cache. Deleted discounts are excluded via `include_deleted_objects:false` +
`is_deleted` check.

## Diagnostic
A throwaway node script using `SQUARE_ACCESS_TOKEN` + `SQUARE_ENVIRONMENT` against
`/v2/catalog/search` (object_types DISCOUNT then PRICING_RULE) dumps raw objects to
see the real schedule/state — fastest way to confirm what Square actually holds.
