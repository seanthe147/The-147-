---
name: Expo build budget confirmation
description: Avoid reusing native-prompt preview tokens after switching to chat approval.
---

When native confirmation is unavailable, obtain a conversation-mode preview before asking the user to approve the build allowance. Keep both the limits and confirmation mode unchanged when confirming that preview.

**Why:** Preview tokens are bound to the confirmation mode. A native-prompt fallback returned a token, but changing to conversation mode after collecting approval invalidated it and required a second user confirmation.

**How to apply:** Use conversation mode only when the tool permits fallback or the user requests chat approval. If the tool rejects a mismatched preview and requires fresh approval, collect that approval before using its replacement token. Never treat a rejected confirmation as a created allowance or a started build.
