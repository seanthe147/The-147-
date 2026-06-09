# Building The 147 Kiosk — iOS (TestFlight) & Android (APK)

Bundle IDs: `com.the147bradford.kiosk` (both platforms)  
EAS Project: `b35e28d2-6a2a-4cd2-bb07-f426fb4f31bd`  
Dashboard: https://expo.dev/accounts/the-147/projects/the-147-kiosk

---

## What's already configured

- EAS project registered, project ID in `app.json`
- iOS: bundle ID, Apple Team `94LW5H4828`, Distribution Certificate in EAS
- Android: package name, adaptive icon (dark navy + gold "147 KIOSK")
- All three build profiles: `development`, `preview`, `production`
- `production` pre-build check: fails fast if `EXPO_PUBLIC_API_BASE_URL` is missing
- `autoIncrement: true` — iOS build number and Android versionCode increment automatically

---

## One-time setup (do this before the first build)

### 1. EAS CLI & login
```bash
npm install -g eas-cli
eas login    # log in as the-147 Expo account
```

### 2. Set the production API URL in EAS

The API URL is baked into the app at build time. Set it once:

```bash
cd artifacts/the-147-kiosk
eas env:create \
  --name EXPO_PUBLIC_API_BASE_URL \
  --value "https://YOUR-DOMAIN/api" \
  --environment production
```

Replace `YOUR-DOMAIN` with the deployed API domain
(e.g. `the-147.replit.app` or `api.the147.co.uk`).

Or set it via the EAS dashboard under Environment Variables:
https://expo.dev/accounts/the-147/projects/the-147-kiosk/settings/environment-variables

---

## iOS — TestFlight

### Apple credentials (one-time)

EAS holds the Distribution Certificate. It needs to create the
**App Store Provisioning Profile** for `com.the147bradford.kiosk` once:

```bash
cd artifacts/the-147-kiosk
eas credentials --platform ios
```

Choose:
- "Manage build credentials" → "Distribution Certificate" → select existing (serial `7FF7BB4E8DEB3793A4B6A49C092806BC`)
- "Provisioning Profile" → "Add a new provisioning profile" (EAS creates it automatically)

**Alternative — App Store Connect API key (no MFA):**
```bash
EXPO_ASC_KEY_ID=<key-id> \
EXPO_ASC_ISSUER_ID=<issuer-id> \
EXPO_ASC_KEY_PATH=/path/to/AuthKey_<key-id>.p8 \
eas credentials --platform ios
```

### Create the App Store Connect record (one-time)

1. https://appstoreconnect.apple.com → **My Apps → +** → New App
2. Platform: **iOS** · Bundle ID: `com.the147bradford.kiosk`
3. Name: **The 147 Kiosk** · SKU: `the147kiosk`
4. No screenshots required for TestFlight internal testing

### Build & submit

```bash
cd artifacts/the-147-kiosk
pnpm run build:ios      # ~15–20 min cloud build
pnpm run submit:ios     # uploads latest build to TestFlight
```

### Install on iPad

1. Install **TestFlight** on the iPad from the App Store
2. Accept the invitation email or redemption code
3. Tap **Install** → open **The 147 Kiosk**

### Lock iPad to kiosk (Guided Access)

1. **Settings → Accessibility → Guided Access** → enable, set passcode
2. Open **The 147 Kiosk**
3. Triple-click side/home button → **Start**

Triple-click + passcode to exit. (The in-app staff PIN is separate.)

---

## Android — APK sideload

Android builds produce a standalone APK — no Google Play account needed.
You can sideload it directly onto any Android tablet.

### Build

```bash
cd artifacts/the-147-kiosk
pnpm run build:android    # ~10–15 min cloud build, produces an APK
```

EAS builds in the cloud — no Android toolchain needed locally.
The APK download link appears on the EAS dashboard when the build is green.

### Install on Android tablet

1. On the tablet: **Settings → Security** → enable **Install unknown apps**
   (exact path varies by Android version/manufacturer)
2. Download the APK from the EAS build page onto the tablet
   (or transfer via USB / Google Drive / email)
3. Tap the APK file → **Install**
4. Open **The 147 Kiosk**

### Lock Android tablet to kiosk (Screen Pinning)

Android has built-in screen pinning (no MDM required):

1. **Settings → Security → Screen Pinning** → enable
2. Open **The 147 Kiosk**
3. Open the recent apps view → tap the app icon at the top of the card → **Pin**

The tablet is locked to the app. To exit: hold Back + Recents simultaneously
and enter your PIN/pattern.

**For tighter lockdown** (no notification shade, no back button), use a
dedicated Android Kiosk app or MDM (e.g. Scalefusion, 42Gears, Knox).

---

## Build both platforms at once

```bash
cd artifacts/the-147-kiosk
pnpm run build:all    # builds iOS + Android in parallel on EAS
```

---

## OTA updates (no rebuild needed)

For JS-only changes push an update directly to running devices:

```bash
cd artifacts/the-147-kiosk
pnpm run update:production -- "describe your change here"
```

Devices receive it on next cold start. Runtime version is `1.0.0` — native
changes (new packages, `app.json` changes) still require a full rebuild.

---

## Local development

The **Start Kiosk** Replit workflow runs the app in Expo dev mode instantly.
The API URL is set automatically from `$REPLIT_DEV_DOMAIN`.

---

## EAS profiles at a glance

| Profile      | iOS distribution | Android output | Auto-increment | Pre-build check |
|--------------|-----------------|----------------|----------------|-----------------|
| `development` | Internal (IPA) | APK            | No             | No              |
| `preview`     | Internal (IPA) | APK            | No             | No              |
| `production`  | App Store       | APK            | Yes            | Yes             |

---

## Environment variables reference

| Variable | Where set | Description |
|---|---|---|
| `EXPO_PUBLIC_API_BASE_URL` | EAS Dashboard (production env) | HTTPS URL of the deployed API, e.g. `https://the-147.replit.app/api` |
| `EXPO_APPLE_ID` | EAS secret | Apple ID email for iOS submissions |
| `EXPO_APPLE_APP_SPECIFIC_PASSWORD` | EAS secret | App-specific password for the Apple ID |
| `EXPO_TOKEN` | EAS secret | EAS authentication token |
