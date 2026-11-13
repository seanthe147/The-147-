# Wix customer widgets

Use the API application's published HTTPS origin (not a development preview address):

- Booking iframe and standalone: `ORIGIN/widget/booking`
- Compact membership iframe: `ORIGIN/widget/membership`
- Full standalone membership page: `ORIGIN/membership`

In Wix, add an **Embed a site** element with the relevant URL. Set width to
100% of the available column. Suggested starting heights are 800px for booking
and 900px for membership; allow vertical scrolling. At phone widths use at least
320px of content width and avoid surrounding padding that reduces this further.
Membership comparison and management can be longer than one screen; do not clip
the iframe or disable its scrolling. Its dialogs scroll within the iframe.

Place a normal link outside each embed: “Open booking in a new tab” or
“Open membership in a new tab”, pointing to the standalone route above. This
remains usable when browser extensions or Wix restrictions prevent embedding.
Checkout links must allow user-initiated new tabs/popups. If using custom sandbox
attributes, permit scripts, forms, same-origin requests and
`allow-popups allow-popups-to-escape-sandbox`; verify the actual Wix output rather
than assuming these settings are applied. Do not embed Square checkout itself.

No auto-resize/postMessage integration is installed: host support has not been
demonstrated. No credentials or customer information are sent to a parent window.
The widgets call their own serving origin; no new CORS allowance is needed.

## Payment and privacy expectations

Opening checkout or returning from it is **not** proof of payment. Deposit screens
stay pending until the club receives server/provider confirmation; no “I've paid”
control can mark a booking paid. Membership uses explicit checkout links, not
delayed popups or top-window redirects. If a checkout request times out, refresh
membership management before attempting to start another payment.

Membership sessions live only within the document. Leaving/closing the page,
removing the iframe, or restoring a departed page signs the member out. Switching
tabs for Square or email verification does not. Native login is unchanged.

## Verification and evidence

Before changes, real widget routes were exercised at 375px and 1280px,
standalone and in simulated iframes. Confirmed: the date strip contained 182
controls; a mocked 503 availability response still rendered 12 available times;
reset retained the disabled confirmation button.

Baseline PNGs are in the ignored `generated-artifacts/widgets/before-*.png`
directory. After screenshots and the membership preview are alongside them.
Generated screenshots are deliberately excluded from Git and deployment.

Run from `artifacts/api-server`:

```sh
node widget-browser-test.mjs
node membership-browser-test.mjs
node run-membership-page-check.mjs
pnpm run test:booking-tables
pnpm run test:membership-billing
pnpm run typecheck
```

The browser runner uses the real development route and intercepts API calls with
synthetic responses. It never creates live bookings or sends payments. It checks
repeat bookings, back-navigation selection restoration, failed availability,
retained contact details and horizontal overflow at phone and desktop widths in
standalone and iframe contexts. Billing tests use an isolated database and mocked
Square requests.

The membership browser script also tests a cross-origin sandbox without popup
permission: checkout cannot open, the page remains pending, and the copyable
fallback remains visible. Out-of-order availability and seven-guest deposit
pending checks are included in the booking runner. Interactive browser checks
also released delayed billing/join responses after sign-out and confirmed they
could not repopulate account or checkout content.

These checks are **simulated iframe testing, not validation on published Wix**.
Nothing has been published or changed in Wix. After merging and releasing, verify
the real Wix page on iOS Safari, Android Chrome and desktop: scrolling, focus,
keyboard visibility, explicit Square new-tab handoff, fallback links and departure
logout. Use test/sandbox transactions only with separate approval.

## Completion dependency check

The required workspace validation initially failed because Expo's SDK 57
compatibility list required newer patch releases. With approval to continue,
the five reported direct packages were aligned (Expo 57.0.33, constants
57.0.24, linking 57.0.14, router 57.0.31 and updates 57.0.28).
Exact-version release-age exceptions were used for required fresh patches and
their dependencies; the global 24-hour package delay remains enabled.

A separate clean workspace passed frozen installation with pnpm 10.26.1,
shared-library compilation, mobile typechecking, and both iOS and Android
JavaScript exports under Node 20.19.4. The export reported the expected missing
ignored Google services file; that credential was not copied into the isolated
test. This was not a native binary build, physical-device check or publication.
