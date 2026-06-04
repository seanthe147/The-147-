# Building The 147 Kiosk for iPad

## What's already done
- **EAS project registered**: `@the-147/the-147-kiosk`
  - Project ID: `b35e28d2-6a2a-4cd2-bb07-f426fb4f31bd`
  - Project page: https://expo.dev/accounts/the-147/projects/the-147-kiosk
- **Bundle ID**: `com.the147bradford.kiosk`
- **Apple Team**: `94LW5H4828` (Cue Gardens Ltd) — already in eas.json
- **Distribution Certificate**: already stored in EAS
  (serial `7FF7BB4E8DEB3793A4B6A49C092806BC`, same team as the main app)
- **Build profiles**: `eas.json` has `development`, `preview`, and `production`

## What still needs doing (one time only)

EAS needs to create an **App Store provisioning profile** for
`com.the147bradford.kiosk` in your Apple Developer account. This requires
Apple Developer credentials and must be done from a terminal that can run
EAS CLI.

### Option A — via EAS interactive setup (recommended)
```bash
cd artifacts/the-147-kiosk
EXPO_TOKEN=<your-expo-token> eas credentials --platform ios
```
When prompted, choose:
- **"Manage build credentials"**
- **"Distribution Certificate"** → choose the existing one
  (serial `7FF7BB4E8DEB3793A4B6A49C092806BC`)
- **"Provisioning Profile"** → "Add a new provisioning profile"
  (EAS will create it automatically using your Apple credentials)

You'll be asked to log in with your Apple ID or provide an
App Store Connect API key (Key ID + Issuer ID + .p8 file).

### Option B — via App Store Connect API key (fastest, no MFA needed)
If you have an App Store Connect API key for team `94LW5H4828`:
```bash
cd artifacts/the-147-kiosk
EXPO_TOKEN=<expo-token> \
EXPO_ASC_KEY_ID=<your-key-id> \
EXPO_ASC_ISSUER_ID=<your-issuer-id> \
EXPO_ASC_KEY_PATH=/path/to/AuthKey_<key-id>.p8 \
eas build --platform ios --profile production --non-interactive
```
Find the Key ID and Issuer ID at:
https://appstoreconnect.apple.com/access/integrations/api

## Trigger a production build (after credentials are set up)
```bash
cd artifacts/the-147-kiosk
EXPO_TOKEN=<expo-token> eas build --platform ios --profile production --non-interactive
```
Or from the workspace root:
```bash
pnpm --filter @workspace/the-147-kiosk exec eas build --platform ios --profile production
```
EAS builds in the cloud — no Mac required. Takes ~15–20 minutes.

## Distribute to the venue iPad

### Via TestFlight (easiest)
1. Go to https://expo.dev/accounts/the-147/projects/the-147-kiosk
2. Download the IPA once the build is green
3. Upload to App Store Connect → TestFlight → install on venue iPad

### Via MDM / Apple Configurator 2 (no App Store needed)
Use the `preview` profile instead (internal distribution):
```bash
eas build --platform ios --profile preview
```
Then sideload the IPA directly via Apple Configurator 2 or your MDM.

## EAS profiles at a glance
| Profile      | Distribution | Simulator | Auto-increment |
|-------------|-------------|-----------|----------------|
| `development` | Internal  | No        | No             |
| `preview`     | Internal  | No        | No             |
| `production`  | App Store | No        | Yes            |
