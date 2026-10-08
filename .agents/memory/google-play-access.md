---
name: Google Play publishing access
description: Distinguish connector routing failures, reviews permissions, and production release authorization.
---

As verified on 2026-10-08, this project's attached Google Play connector used `play.googleapis.com` as its base host, while Android Publisher is served at `androidpublisher.googleapis.com`. Relative Android Publisher requests returned HTML 404.

**Why:** OAuth connection succeeded, but the configured host did not serve the requested API. Reauthorizing credentials would not correct that routing failure. Expo's separate reviews check returned a JSON permission error instead.

**How to apply:** Recheck current connector setup and response type before relying on this observation. Do not interpret HTML 404 as invalid OAuth, route around the connector's host restrictions, or assume reviews access proves production-release authority. Use a supported Expo submission route or owner-managed Play Console upload when direct connector access is unavailable, and distinguish submission from confirmed publication.
