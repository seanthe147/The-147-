---
name: Square member discount exclusions
description: How product exclusions differ between app-created orders and Square POS member pricing rules.
---

Membership discount exclusions must be maintained in two places: the app/server order builder and the live Square pricing rules used by POS customer groups. App code cannot prevent an order-level Square POS discount.

**Why:** Fosters and The 147 Lager continued receiving POS member discounts even though app-created orders excluded them. The live VIP, Gold, and Platinum pricing rules matched all products and had no exclusion product set. The 147 Lager had also been recreated in Square, making its stored parent item ID stale.

**How to apply:** When a product must stay at full price, verify its current live Square parent item ID, update the app exclusion, and confirm every relevant Square member pricing rule references a product set excluding that parent item. Re-check after Square catalog items are recreated.