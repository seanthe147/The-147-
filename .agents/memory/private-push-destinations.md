---
name: Private push destination ownership
description: Security boundary for associating devices with order, contact, or other private notification payloads.
---

Public registration of an Expo push token, even when it returns a server-generated possession secret, is not device attestation. Never use that first-claim flow by itself to authorize private notification routing. Require an authenticated customer session and an existing token-to-account binding before attaching a token to an order, contact reply, or similarly sensitive payload.

**Why:** An unauthenticated caller who learns an unclaimed token can win a first-claim race. A random secret prevents later claims but cannot prove the first claimant controls the physical device.

**How to apply:** Public registration may support general broadcasts and establish a credential for authenticated account binding or self-revocation. Any flow carrying customer-specific data must resolve the destination through the authenticated account binding, and unregister must invalidate all later sends by checking the live registry.