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

## Supplier and reporting scope
The two main suppliers are LWC and Molson Coors. Financial reporting is stock gross profit, not a full business P&L with wages, rent and overheads.

**Why:** the owner explicitly identified both suppliers and selected stock gross-profit reporting. They also reported missing 50L alternatives where products currently show only 100L kegs.

**How to apply:** verify product codes, pack sizes and actual invoice costs against supplier invoices before changing the catalogue. Do not globally replace 100L kegs or overwrite historical count units; the same drink may arrive in different keg sizes.

Supplier price preference: “any non Molson coors products use LWC Priceing but any Molson Coors use Molson pricing”.

**Why:** this is the owner's explicit instruction when providing both supplier invoices; do not choose a cheaper supplier automatically.

**How to apply:** distinguish brewery-owned brands from third-party products sold by Molson Coors when resolving overlap. Free promotional lines and container-control lines are not normal replacement purchase costs.

The owner clarified this means **Molson brewery brands only**. Third-party products on both invoices must use LWC prices, not Molson wholesale prices.

**Why:** choosing the supplier with the most recent invoice or cheaper price would contradict the confirmed rule.

**How to apply:** do not substitute Molson third-party prices when an LWC price is missing. Mark the price unknown and request a relevant LWC invoice.

## Stock financial reporting decisions
Use ex-VAT stock gross profit, with periodic weighted-average valuation from the opening count's captured cost and actual delivery invoice totals. This is an operational estimate, not a full accounting P&L. Missing costs must remain unknown, not zero, and known-value subtotals need coverage.

**Why:** invoice pack splits produce fractional penny unit costs, and catalogue price changes must not rewrite submitted counts. Blank historical costs cannot safely be inferred from a newer invoice.

**How to apply:** keep fractional unit costs until monetary totals, snapshot catalogue cost when submitting counts, and flag unallocated refunds rather than invent a net-sales figure. Refunds are not automatic stock returns.

Alternate keg sizes belong to one stock identity with pack-to-count-unit conversion, not duplicate Square sales mappings.

**Why:** the same drink is purchased in 50L and 100L packs but sold through the same pint/half-pint variations; separate mapped stock items would duplicate deductions.

Existing production link collisions require explicit reconciliation; new duplicate-write safeguards are not proof that historical links are unique.

**Why:** the read-only live audit found conflicting assignments across duplicate records and across keg, bottled and alcohol-free products, with count/delivery history spread over different copies.

**How to apply:** audit both current link rows and legacy fallback assignments before cleanup. Preserve and reconcile historical quantities, clear obsolete ownership in both representations, and confirm measure sizes before enforcing uniqueness. Never simply delete the duplicate records.

Never automatically add together duplicate stock entries from the same count.

**Why:** they may be repeated entries for the same physical stock rather than separate stock holdings; summing could invent inventory. Preserve both until a manager confirms the correct quantity.

**How to apply:** block that consolidation, retain submitted values and notes, and require explicit reconciliation. Safe consolidation should archive the source identity with a permanent destination, not allow ordinary catalogue edits to revive it.

**How to apply:** preserve historical count units, add purchase packs, and never import uploaded invoice quantities as deliveries without an explicit delivery-entry action.

## Reconciliation boundaries and missing counts
Estimated live levels must not overwrite physical counts or write quantities back to Square.

**Why:** the owner requested five-minute sales-based estimates; these cannot account for unrecorded wastage, so they are not authoritative counts.

**How to apply:** label estimates and timestamps explicitly, preserve negative discrepancies, and withhold estimates when sales, conversions or mappings are missing.

Use the actual opening and closing stock snapshot times for both delivery totals and Square sales, even when those differ from the requested dates. Show the actual period to staff. Blank quantities mean unknown, never zero; incomplete snapshots cannot yield a meaningful consumption variance.

**Why:** comparing nearby count snapshots against a different sales/delivery interval produces false wastage. Staff may submit partial counts, so absence cannot safely mean zero.

**How to apply:** preserve explicit zero quantities, show missing quantities distinctly, and keep adjacent reconciliation periods non-overlapping.

## Automatic POS matching safety
Automatic suggestions must reserve existing mappings, including inactive products and legacy mappings, and allocate each Square item group only once across a proposed batch.

**Why:** native clients expand draught suggestions into pint/half-pint siblings; variation-only matching can propose overlapping links and trigger duplicate-ownership errors during partial batch saves.

**How to apply:** keep ownership checks at save time for concurrency, and prevent conflicting suggestions before presenting them. Existing links must be changed explicitly, not silently replaced by auto-match.

## Keg pint yields
Pre-loaded as standard (50L=88, 100L=176). Editable per item in Catalogue tab. User knows Coors 100L actually yields ~187 — they can adjust in the app.

## Consumption report unit conversions (purchase unit → selling/base unit)
The report reconciles against Square sales, so every figure (opening/delivered/closing/consumed/sold/variance) is expressed in the item's BASE unit and the route returns a `baseUnit` field.
- **Base unit:** kegs reconcile in **pints** (units × `servesPerUnit`); everything else stays in its own `countUnit`.
- **Cases:** bottles/cans are delivered by the case but stocked as singles. Delivery POST accepts `quantityCases` and stores `quantityUnits = cases × caseSize` server-side. Clients send `quantityCases` for items with a `caseSize`, `quantityUnits` otherwise. Server hardens stray combos (cases on a non-case item are treated as units; zero-qty lines filtered; empty → 400).
- **Half pints = a Square SIZE variation on the SAME product** (same `itemId`, different `variationId`), counting as **0.5 pint**. One stock item therefore maps to MULTIPLE Square variations.
**Why:** the old report linked one stock item to a single Square variation (factor 1), so it under-counted draught (ignored half-pint sales) and mixed cases with singles — variance was meaningless.
**How it works:** new `stock_item_pos_links` table (stockItemId FK, squareVariationId, squareVariationName, `soldUnitFactor` numeric default 1). Report `sold = Σ links(salesQty × factor)`. `PUT /api/staff/stock/items/:id/square-links` replaces the whole link set and mirrors the primary (factor==1) link back to the legacy `squareCatalogVariationId/Name` columns for back-compat; report falls back to those legacy columns when no link rows exist. `square.ts listCatalogVariations` exposes `itemId` so clients can group sibling sizes; both UIs auto-build pint+half links when a half-pint sibling is detected (name matches /half|½|1\/2/).

## Router types
Expo Router auto-generates .expo/types/router.d.ts. New screens must be added manually to that file (3 places: hrefInputParams, hrefOutputParams, href union) until next EAS build regenerates it.

## Staff portal inline handlers
The staff dashboard encloses functions in an IIFE; inline HTML event handlers need explicit window bindings. Syntax checks alone cannot detect missing renderer helpers or unexported handlers.

**Why:** stock rendering silently stalled on an undefined escaping helper, and an unexported draft-edit handler prevented reopening saved counts.

**How to apply:** cover new inline handlers and shared renderer dependencies with runtime or focused template tests, not just TypeScript checks.
