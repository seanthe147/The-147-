---
name: Central membership billing
description: Business scope for shared app and Wix membership management through Square.
---

Membership billing must be one central system customers can access from The 147 app and the Wix website, with Square processing payments. Customers must be able to choose monthly or annual billing and upgrade plans. Selected plans require a 12-month minimum subscription term.

Staff customer accounts should provide linked booking and order history, membership types, and upgrade/downgrade management. Only managers or owners may downgrade Platinum memberships.

**Why:** the owner explicitly requested unified customer records and this Platinum-specific role restriction.

**How to apply:** enforce the restriction on the server as well as in staff controls. Do not infer permission to waive minimum terms, issue refunds, or offer VIP as a downgrade.

VIP members may opt into paid memberships, but customers must never be offered VIP as a downgrade destination.

**Why:** The owner explicitly requested one-way VIP upgrades. VIP remains invitation-only; a failed or abandoned payment must not remove existing VIP access.

**How to apply:** Collect consent for the new recurring payment and terms. Replace VIP access only after confirmed payment, atomically with activating the paid membership, and keep removal of the old Square group retryable. Do not weaken single-active-membership protections to support checkout.

Memberships must also cover purchases made directly through the Square till/POS and Square recurring subscriptions, alongside the newly built app/website system.

**Why:** The user explicitly confirmed that all three purchase routes are used; app/website checkout alone does not cover the business.

**How to apply:** Keep one customer membership across all three routes. Distinguish prepaid till purchases from authorised recurring billing, and never assume a till purchase authorises a new recurring subscription.

Square till/POS membership purchases grant 12 months prepaid without automatic renewal. The new app/website system must also support automatic renewal.

**Why:** The user explicitly confirmed the till duration and no-renewal rule, while requesting auto-renew capability in the new system.

**How to apply:** Keep the one-off till entitlement separate from a recurring-payment mandate. Any later opt-in must collect explicit customer authorisation and preserve existing prepaid access rather than double-charging for it.

An opt-in after a prepaid year starts its newly accepted recurring minimum term at the first future charge, not at the original till purchase. Withdrawing that mandate before its start must preserve the prepaid year and must not impose the unstarted recurring term.

**Why:** Authorising future payments does not replace time already purchased, and the new agreement must not be applied retroactively.

**How to apply:** Disclose the first charge and commitment dates before consent. Keep withdrawing future billing separate from ending paid access.

**Why:** The user reports Wix subscription payments no longer work for the business and wants shared membership management rather than separate app and website subscriptions.

**How to apply:** Extend the existing membership system instead of creating competing billing records. Confirm minimum-term plan eligibility, upgrade charging, renewal and migration rules before implementing financial behavior. Do not infer that monthly billing means cancel-anytime, or that a minimum term guarantees successful future card charges.

The Member tab is the membership entry point: existing members should manage their membership there, while signed-out customers and non-members should see every available membership and be able to start purchasing one. Loyalty enrolment must not be a prerequisite for browsing memberships. Keep rewards compact and secondary here; the separate Rewards tab is the full rewards experience.

**Why:** The user explicitly requested this after the old loyalty-first overview made the new billing controls difficult to find, then specifically asked to reduce the rewards section.

**How to apply:** Keep paid membership status separate from rewards enrolment. Check existing memberships before offering a new subscription, and require customer sign-in before purchase, not before showing available plans.

Staff plan/member management uses the existing manager/owner web dashboard, not the customer membership screen. Opening it from the native staff portal may require a separate browser sign-in; never transfer staff bearer tokens in URLs.

**Why:** One administrative surface avoids competing membership editors, and keeping tokens out of navigation URLs prevents leaks into browser history and logs.

**How to apply:** Preserve manager/owner access checks on the server. Keep Square/app/Wix billing protected from manual local status, plan and date overrides; notes and usage remain editable. Use the same renewal and minimum-term rules for staff and customer billing actions.

Advertised plan-price edits apply to new sales, not existing Square contracts or previously agreed pending changes.

**Why:** Existing members have already agreed their price and commitment; changing a public offer is not authorisation to change their contract.

**How to apply:** Preserve old rate identities for existing memberships and pending paid transitions. Require explicit customer authorisation before staff schedules a plan or billing-frequency change.

Complimentary/manual access must never automatically create Square billing. Staff share the central customer sign-up page for paid memberships without first creating a pending manual member record.

**Why:** A legacy staff flow could create a provider subscription before customer authorisation, even for complimentary access. A pending manual record can also block the central checkout's duplicate-membership protection.

**How to apply:** Keep complimentary classification separate from editable notes and exclude it from revenue estimates. Paid customers must select their billing frequency and accept the shared terms themselves; staff sign-up links contain no login tokens or customer details.

The user clarified on 2026-10-13 that Platinum is the new name for Black membership, not a separate tier. Maximum and Platinum also refer to the same membership. Only Platinum should be available from those two plans, at £6.99/month or £65/year. Platinum requires a 12-month minimum term. Upgrades take effect at renewal; monthly plans continue rolling after the minimum term; include controlled Wix migration.

**Why:** These are explicit business rules, not billing defaults. Minimum terms must not be imposed retroactively on memberships that did not accept them.

**How to apply:** Use Platinum as the public name for the former Black membership. A name change alone is not a plan upgrade, must not restart a minimum term, and must not change existing billing or benefits. Preserve Black as a historical identifier where needed; do not offer it as a separate tier. Hide Maximum from new signup rather than deleting it or disabling historical memberships. Require explicit consent to a new Platinum minimum term at signup or an actual upgrade. A newly accepted upgrade starts its disclosed 12-month term at the effective renewal. Verify old Wix billing has stopped and the existing paid-through date before replacement authorisation; never charge concurrently or claim cards transfer automatically.

Blue is £3.99 every 30 days. Pink is £2.99 every 30 days or £20 annually. The recurring monthly offers use Square's exact 30-day cadence; Platinum's existing £6.99 monthly and £65 annual terms stay unchanged.

**Why:** The owner explicitly kept both Pink payment options and specified a 30-day renewal interval; this is not the same as a calendar-month cadence.

**How to apply:** Keep Blue monthly-only and Pink monthly/annual. Verify the exact Square cadence as well as price before exposing a plan. Do not change Platinum or existing memberships when provisioning these offers.

The 10% rate benefit is for snooker hourly charges only: Blue monthly and Pink annual qualify; Pink monthly does not. It must not discount food, drinks, pool, or other categories.

**Why:** On 2026-11-02 the owner clarified that the new membership discounts must be snooker-only.

**How to apply:** Keep snooker-rate eligibility separate from `foodDrinkDiscount`; enforce it by membership tier, billing frequency, and active paid status, and scope any POS pricing rule only to confirmed snooker sale variations.

Changing only monthly/annual payment frequency on the same plan preserves its accepted minimum-term dates.

**Why:** A payment schedule change is not a newly accepted membership upgrade; extending the term silently would impose another commitment.

**How to apply:** Keep frequency changes separate from actual tier upgrades when reconciling paid renewals. Do not create a fresh minimum term just because payment cadence changed.

Keep the three-failure suspension policy: email on the first failed payment,
app push warning on the second, and retain the suspension notice on the third.

**Why:** On 2026-10-15 the user explicitly chose failure-count suspension rather than a 14-day unpaid grace period, with different notification channels for the first two failures.

**How to apply:** Use this sequence for membership payment failures across app and website subscribers. Do not introduce a time-based hold or send a first-failure push instead of the requested email.

Payment-card replacement must authorise a freshly tokenised card for storage and update the existing Square subscription only. It must not charge immediately, restart billing or minimum terms, or remove a scheduled renewal upgrade.

**Why:** The self-service scope explicitly requires card replacement without changing the customer's existing membership agreement. Checkout's legacy fallback to an unverified token is not acceptable for this flow.

**How to apply:** Require successful STORE buyer verification and explicit recurring-payment consent; keep card replacement available independently of pending plan changes. Verify failures with mocked or sandbox Square, never live charges.

Square-only paid customers can receive their Square benefits before registering in the app. Linking that payment identity to a private app account requires verified, exact email ownership; ambiguous duplicate Square customers must be resolved rather than creating another billing identity.

**Why:** Till customers do not necessarily have app accounts, but a similar email or an unverified registration must never inherit another customer's membership or card management.

**How to apply:** Separate Square entitlement from app identity. Do not fuzzy-match email ownership or silently create a new Square customer when lookup fails.

Held memberships lose paid benefits but keep billing and card-recovery access; they must not be treated as brand-new customers eligible for another subscription.

**Why:** The three-failure policy suspends benefits, not the customer's ability to recover the existing agreement. Hiding the record can cause duplicate billing.

**How to apply:** Distinguish management history from active discount eligibility.

Historical purchase dates must come from paid evidence, not the time an account was imported. Unknown dates remain unknown. Billing day boundaries use Europe/London.

**Why:** Importing a customer is not a purchase or renewal. UTC day boundaries can end access a day early during British summer time.

**How to apply:** Preserve original paid dates and chronological prepaid coverage; do not extend a paid year merely because an old receipt was imported later.

Square can expose monthly and annual products with the same Platinum Membership name.

**Why:** A monthly-priced till item must not accidentally grant the annual prepaid entitlement.

**How to apply:** Require explicit mapping of exact till variation IDs. Do not infer entitlement from a matching product name or map every variation of the product.

The owner confirmed on 2026-10-15 that the £65 Platinum till item grants 12 months prepaid. The £6.99 Platinum product is separate monthly billing and must not grant a prepaid year.

**Why:** The owner explicitly chose the annual till item after reviewing the two identically named Square products.

**How to apply:** Keep that distinction when changing till mappings, prices or renewal rules. Do not enable automatic renewal merely because the £65 item was purchased.

After paid access ends, a cancelled member may reactivate the same still-available plan and billing frequency for one calendar month. Reactivation creates a new Square subscription and begins charging immediately; after the window, the customer must buy a new membership.

**Why:** The owner explicitly chose the window to start after paid access ends and approved charging when the customer reactivates.

**How to apply:** Require fresh card verification and clear recurring-term consent. Keep the new membership pending until Square confirms payment; do not reverse the old cancellation or restore benefits just because the reactivation form was submitted.

Before paid access ends, a member may reverse a scheduled cancellation by removing only the pending Square cancellation. This is different from reactivation after expiry.

**Why:** A scheduled cancellation leaves the current subscription and paid term active; creating a new subscription or changing dates could duplicate billing or alter the accepted term.

**How to apply:** Keep the existing subscription, renewal schedule and commitment dates unchanged, take no immediate payment, and use the separate one-month reactivation flow only after paid access ends.
