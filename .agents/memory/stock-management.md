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
`ensureStockDefaults()` runs on the first call to GET /api/stock/categories or /api/stock/items. Seeds 6 categories and ~143 items from Molson Coors invoices. Safe to call repeatedly (no-ops on existing — categories keyed by name, items by supplierCode).

**Gotcha — "0 products load on stocktake":** seeding is guarded by an in-memory `_stockDefaultsSeeded` flag set per server process. If the stock data is wiped while the server is running (e.g. `db push-force`, manual delete), the flag stays `true` and the running process never re-seeds → stocktake shows 0 products. Stocktake reads `/api/stock/items` (DB table), NOT Square — so a healthy Square catalog does not help. Fix: restart the API server (resets the flag so the next manager GET re-seeds), or seed the table directly. The Square catalog (`listCatalogVariations`) is a separate concern and works independently.

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
