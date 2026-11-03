---
name: Membership website privacy
description: Website session lifetime requested by the owner
---
Membership website customers must sign in again after closing or navigating away from the page. Switching tabs must not sign them out. This request concerns the website, not native app login persistence.

**Why:** the owner raised shared-device exposure from returning to an already signed-in membership page and explicitly chose logout on leaving rather than on tab switching.

**How to apply:** do not restore persistent website login without renewed approval. Protect browser back restoration and late asynchronous responses after logout; do not treat focus loss during payment authentication as navigation.
