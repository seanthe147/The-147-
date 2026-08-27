---
name: Square menu category selection
description: How to interpret Square multi-category catalog assignments for the customer Order tab
---

Square items can be assigned to several category trees at once for reporting, POS, online ordering, and other Square surfaces. The first category in the API response is not reliably the category intended for the customer app.

**Why:** A hidden legacy draught item remained visible through its separate Beer assignment, while newly added food products were filed under a broad Specials category instead of their configured menu section.

**How to apply:** Prefer category IDs already configured by the app when selecting an item's display category. Apply app visibility rules across every assigned category, not only the selected display category. Also reject deleted or archived catalog objects and invalidate menu caches on Square catalog updates.