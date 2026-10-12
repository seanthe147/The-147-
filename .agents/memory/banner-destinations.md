---
name: Banner destination compatibility
description: Compatibility and scope decisions for customer banner links
---

Treat both historical Events destination spellings as compatible on reads, and normalize future writes rather than rewriting existing banner rows.

**Why:** The native and web staff editors historically saved different spellings; customers must not need staff to recreate banners, and older stored data must remain usable.

**How to apply:** Keep this compatibility when changing banner editors, API validation, or customer navigation. Events and Order destinations mean the whole tab, not an individual event or menu item. Same-tab taps must not add navigation history. External links retain the existing HTTP/HTTPS-only restriction.
