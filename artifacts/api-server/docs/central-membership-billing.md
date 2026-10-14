# Shared Square membership billing

## Why this approach

Wix's native recurring-payment providers do not include Square. The shared system
therefore uses The 147's existing customer accounts, database and Square
subscriptions, not a second set of Wix Pricing Plan subscriptions.

The native app and the website portal use the same authenticated billing API.
Square stores payment credentials and processes recurring payments. Card details
are not transferred from Wix. No live subscription is migrated automatically.

Sources checked:
- https://support.wix.com/en/article/accepting-recurring-payments
- https://developer.squareup.com/docs/subscriptions-api/subscription-billing
- https://developer.squareup.com/docs/subscriptions-api/swap-plan-variations

## Billing rules

- Platinum is the new public name for the former Black membership, not a
  separate tier or an upgrade. A name change alone must not change charges,
  benefits or an accepted minimum term. Preserve historical Black identifiers.
- Platinum is the sole public offer from the former Maximum/Platinum pair:
  £6.99/month or £65/year. Maximum remains hidden, not disabled/deleted.
  Existing subscribers' Square charges are not changed automatically.
- Monthly and annual billing have distinct Square plan variations. A missing,
  wrong-cadence or wrong-price variation prevents checkout; it never silently
  charges monthly for an annual choice.
- New Platinum purchases have a 12-month minimum term with explicit consent.
  Old customers do not acquire a minimum term retroactively.
- Upgrades and billing-frequency changes use Square's renewal-date swap-plan
  operation. Benefits change after the corresponding successful payment, not
  when a customer schedules an upgrade.
- An accepted upgrade to Platinum starts its disclosed 12-month term at
  the effective renewal.
- A monthly/annual frequency change on the same plan preserves the existing
  accepted minimum-term dates; it does not start another 12-month commitment.
- After a monthly minimum term, billing continues monthly until cancelled.
  Cancellation stops billing at Square's confirmed date, not immediately.
- Annual memberships renew annually; cancellation stops the next renewal.
- An active, paid annual member may request that next renewal be stopped during
  the year; access still lasts through the paid 12-month term.
- Failed or missing webhook verification cannot grant paid membership benefits.
- Payment failures: email on the first failure, app push warning on the second,
  and freeze benefits with a suspension push on the third. Push requires a
  registered device. Notification delivery errors are logged without blocking
  suspension; these notices use the existing transactional SMTP service.

## Before going live

1. Run the read-only Square catalog check:
   `pnpm --filter @workspace/api-server run check:membership-catalog`.
   Configure missing monthly/annual variations through the existing owner plan
   setup. Do not change plan prices to silence a mismatch.
2. Enable `subscription.created`, `subscription.updated`, `invoice.payment_made`
   and `invoice.scheduled_charge_failed` on the existing Square webhook
   subscription at `/api/webhooks/square`. That authenticated endpoint now also
   uses the central membership processor. `/api/membership/webhook` remains
   supported for a dedicated configuration; its signing key must match that
   Square webhook subscription. Never assume the same signing key applies to
   two separately registered Square endpoints.
   Confirm subscription-created, subscription-updated, invoice-payment-made
   and failed-payment events are configured.
3. Confirm real card authorisation, first payment, renewal, plan swap,
   declined payment and cancellation in Square's sandbox. Mocked route/UI tests
   do not prove merchant/location eligibility or delivery of real webhooks.
4. Publish the backend and release the updated app together. Old app versions
   cannot sign up to Platinum without sending the new minimum-term consent.
5. Have the membership terms reviewed for applicable UK consumer/cancellation
   rights. Minimum terms do not guarantee successful collection of future card
   payments.

## Wix website

After publishing, link a Wix “Manage membership” button to:

`https://the147bradford.replit.app/widget/membership`

The published origin was verified through Replit's deployment information.
Customers sign in with their The 147 account; Wix account credentials are not
automatically connected. A normal link/new tab is the most reliable approach.
The existing portal also allows a Wix HTML iframe, but third-party browser
storage/privacy restrictions can prevent sessions being retained. Do not embed
Square's card page inside another site's iframe: open checkout as a top-level
page.

## Controlled Wix migration

1. Import/review membership records through the existing owner dashboard.
2. For each member, confirm legacy Wix recurring billing has actually stopped
   and enter the existing membership's paid-through date.
3. Send that member's private migration link. Square activation is blocked
   before staff review and until the paid-through date.
4. The member selects monthly/annual billing, accepts the disclosed terms, and
   authorises their own card with Square.
5. Only confirmed payment completes migration. Do not delete the old history,
   cancel live Wix payments, email all members or create charges as a test.

## Development verification

`pnpm --filter @workspace/api-server run test:membership-billing`

This checks billing policy and authenticated management routes. Provider calls
are intercepted, temporary records are removed, and no live charges occur.
