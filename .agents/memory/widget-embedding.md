---
name: Customer widget embedding
description: Payment handoff and host integration constraints for Wix customer widgets
---
Use explicit customer-click checkout links, with a visible fallback. Do not use
the return value of `window.open(..., 'noopener')` to decide whether to navigate
the Wix parent: a null result can also mean a successfully opened isolated tab.

**Why:** Delayed popup attempts lose browser user activation, and forcing parent
navigation can destroy the member's page-scoped session.

**How to apply:** Keep payment pending until the server confirms it. Test embeds
with synthetic providers, distinguish these tests from published Wix validation,
and do not introduce automatic iframe resizing without demonstrated host support.

