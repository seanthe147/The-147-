---
name: Marketing email dark mode
description: Email-client compatibility guidance for The 147's dark branded marketing messages.
---

Dark branded emails must explicitly declare `color-scheme: dark` and use solid, sufficiently bright text colors instead of relying on translucent white text.

**Why:** Gmail on iPhone inverted the light text in a dark marketing template into nearly black text while leaving the dark panel background in place, making delivered emails unreadable.

**How to apply:** Keep the dark-scheme metadata and explicit fallback colors in every campaign and automation template. Validate a real test send in Gmail iOS dark mode after changing email styling.