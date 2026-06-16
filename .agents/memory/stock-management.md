---
name: Stock management system
description: Stock take feature — deliveries, monthly counts, consumption report. Design decisions and gotchas.
---

## What was built
Full stock management system: delivery log, monthly counts, consumption report.

## DB tables
6 new tables: stock_categories, stock_items, stock_deliveries, stock_delivery_lines, stock_counts, stock_count_lines.
Required adding `numeric` to the drizzle-orm/pg-core import in schema.ts — it was missing.

## Auto-seeding
`ensureStockDefaults()` runs on the first call to GET /api/stock/categories or /api/stock/items. Seeds 5 categories and 42 items from Molson Coors invoices. Safe to call repeatedly (no-ops if categories already exist).

## Delivery backdating
Deliveries have `deliveredAt` (actual arrival, editable) and `createdAt` (system time). Report uses `deliveredAt` for the period maths — critical for mid-shift top-up accuracy.

## Consumption formula
consumed = opening (last submitted count before periodStart) + delivered (sum of deliveryLines where deliveredAt in period) - closing (first submitted count at/after periodEnd)

## Keg pint yields
Pre-loaded as standard (50L=88, 100L=176). Editable per item in Catalogue tab. User knows Coors 100L actually yields ~187 — they can adjust in the app.

## Router types
Expo Router auto-generates .expo/types/router.d.ts. New screens must be added manually to that file (3 places: hrefInputParams, hrefOutputParams, href union) until next EAS build regenerates it.

## Pre-existing API server typecheck errors
storage.ts has pre-existing errors (staffNotes, lastBirthdayEmailYear, prizeClaimCode, game column refs) from previous task merges — NOT caused by stock work. Server builds and runs fine despite these tsc errors.
