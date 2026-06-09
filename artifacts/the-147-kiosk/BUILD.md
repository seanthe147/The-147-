# Building The 147 Kiosk for iPad

## What's already done

- **EAS project**: `@the-147/the-147-kiosk`
  — Project ID: `b35e28d2-6a2a-4cd2-bb07-f426fb4f31bd`
  — Dashboard: https://expo.dev/accounts/the-147/projects/the-147-kiosk
- **Bundle ID**: `com.the147bradford.kiosk`
- **Apple Team**: `94LW5H4828` (Cue Gardens Ltd) — in `eas.json`
- **Distribution Certificate**: already stored in EAS
  (serial `7FF7BB4E8DEB3793A4B6A49C092806BC`, same team as the main app)
- **Build profiles**: `development`, `preview`, `production` in `eas.json`
- **Pre-build validation**: every production build runs `node scripts/validate-env.js`
  via `prebuildCommand` in `eas.json` — fails fast if `EXPO_PUBLIC_API_BASE_URL` is missing

---

## One-time setup before your first production build

### 1. EAS CLI & login
```bash
npm install -g eas-cli
eas login    # log in as the-147 Expo account
```

### 2. Set the production API URL in EAS

The build bakes the API URL in at compile time.
Set it once in EAS for the `production` environment:

```bash
cd artifacts/the-147-kiosk
eas env:create \
  --name EXPO_PUBLIC_API_BASE_URL \
  --value "https://YOUR-DOMAIN/api" \
  --environment production
```

Replace `YOUR-DOMAIN` with your deployed domain
(e.g. `the-147.replit.app` or a custom domain like `api.the147.co.uk`).

Or set it via the EAS dashboard:
https://expo.dev/accounts/the-147/projects/the-147-kiosk/settings/environment-variables

### 3. Apple credentials — App Store provisioning profile

EAS holds the Distribution Certificate already. It still needs to create the
**App Store Provisioning Profile** for `com.the147bradford.kiosk`. Run this once:

```bash
cd artifacts/the-147-kiosk
eas credentials --platform ios
```

When prompted:
- **"Manage build credentials"**
- **"Distribution Certificate"** → choose the existing cert (serial `7FF7BB4E8DEB3793A4B6A49C092806BC`)
- **"Provisioning Profile"** → "Add a new provisioning profile" (EAS creates it automatically)

You'll be asked to authenticate with your Apple ID or an App Store Connect API key.

**Alternative — App Store Connect API key (no MFA prompt):**
```bash
EXPO_ASC_KEY_ID=<key-id> \
EXPO_ASC_ISSUER_ID=<issuer-id> \
EXPO_ASC_KEY_PATH=/path/to/AuthKey_<key-id>.p8 \
eas credentials --platform ios
```
Get the key from: https://appstoreconnect.apple.com/access/integrations/api

### 4. Create the App Store Connect record

Before the first submit, create the app entry in App Store Connect:
1. Go to https://appstoreconnect.apple.com → **My Apps → +** → New App
2. Platform: **iOS** · Bundle ID: `com.the147bradford.kiosk`
3. Name: **The 147 Kiosk** · SKU: `the147kiosk`
4. No screenshots needed yet — TestFlight doesn't require them

---

## Triggering a production build

```bash
cd artifacts/the-147-kiosk
pnpm run build:ios
```

This runs `eas build --platform ios --profile production --non-interactive`.  
EAS builds in the cloud — **no Mac required**. Takes ~15–20 minutes.

The pre-build script exits immediately with a clear error if
`EXPO_PUBLIC_API_BASE_URL` is missing, saving a wasted cloud build.

Build number increments automatically (`autoIncrement: true`).

---

## Submitting to TestFlight

Once the build is green on the EAS dashboard:

```bash
cd artifacts/the-147-kiosk
pnpm run submit:ios
```

This runs `eas submit --platform ios --latest`. After ~10 minutes the build
appears in TestFlight. Add internal testers (the venue iPad) from App Store Connect.

---

## Installing on the iPad

1. Install **TestFlight** from the App Store on the iPad
2. Accept the TestFlight invitation (email or redemption code)
3. Tap **Install** — "The 147 Kiosk" installs alongside other apps
4. Launch the app and set up Guided Access (see below)

---

## Guided Access — locking the iPad to the kiosk

1. **Settings → Accessibility → Guided Access** → Enable, set a passcode
2. Open **The 147 Kiosk**
3. Triple-click the side/home button → tap **Start**

The iPad is now locked to the app. Triple-click again + enter Guided Access
passcode to exit. (The in-app staff PIN is separate and only unlocks the staff menu.)

---

## OTA updates (no rebuild needed)

For JS-only changes (UI tweaks, menu logic, copy) push an update without a full rebuild:

```bash
cd artifacts/the-147-kiosk
pnpm run update:production -- "describe your change here"
```

The kiosk picks up the update on next cold start.  
Runtime version is pinned to `1.0.0` — native changes (new packages, `app.json`
changes) still require a full rebuild.

---

## Local development

The `Start Kiosk` Replit workflow runs the app in Expo dev mode — no build needed.
The API URL is set automatically from `$REPLIT_DEV_DOMAIN`.

```bash
# Manual equivalent:
cd artifacts/the-147-kiosk
EXPO_PUBLIC_API_BASE_URL=https://$REPLIT_DEV_DOMAIN/api npx expo start --localhost --port 19390
```

---

## EAS profiles at a glance

| Profile      | Distribution | Auto-increment | Pre-build check |
|--------------|-------------|----------------|-----------------|
| `development` | Internal   | No             | No              |
| `preview`     | Internal   | No             | No              |
| `production`  | App Store  | Yes            | Yes             |

---

## Environment variables reference

| Variable | Where | Description |
|---|---|---|
| `EXPO_PUBLIC_API_BASE_URL` | EAS Dashboard (production env) | HTTPS URL of the deployed API, e.g. `https://the-147.replit.app/api` |
| `EXPO_APPLE_ID` | EAS secret | Apple ID email for submissions |
| `EXPO_APPLE_APP_SPECIFIC_PASSWORD` | EAS secret | App-specific password for the Apple ID |
| `EXPO_TOKEN` | EAS secret | EAS authentication token |
