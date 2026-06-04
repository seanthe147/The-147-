# Building The 147 Kiosk for iPad

## EAS project is already registered
- **EAS Project ID**: `b35e28d2-6a2a-4cd2-bb07-f426fb4f31bd`
- **EAS project page**: https://expo.dev/accounts/the-147/projects/the-147-kiosk
- **Bundle ID**: `com.the147bradford.kiosk`

## One-time setup: link your Apple Distribution Certificate

You only need to do this the first time. From any machine with Expo CLI installed and your
Apple Developer credentials to hand, run:

```bash
cd artifacts/the-147-kiosk
EXPO_TOKEN=<your-expo-token> eas credentials --platform ios
```

Follow the prompts — EAS will create (or reuse an existing) Distribution Certificate and a
provisioning profile for `com.the147bradford.kiosk` and store them securely in EAS.

## Trigger a production build

Once credentials are set up, you can trigger a build from any machine (including this Replit):

```bash
pnpm --filter @workspace/the-147-kiosk exec eas build --platform ios --profile production
```

Or from inside the kiosk directory:

```bash
cd artifacts/the-147-kiosk
EXPO_TOKEN=<your-expo-token> eas build --platform ios --profile production
```

EAS builds in the cloud — no Mac required. The build takes ~15–20 minutes.

## Distribute to the venue iPad

### Option A — TestFlight (easiest)
1. Go to https://expo.dev/accounts/the-147/projects/the-147-kiosk
2. Download the IPA once the build is green
3. Upload to App Store Connect → TestFlight
4. Install on the venue iPad via TestFlight

### Option B — MDM / direct install (no App Store needed)
Build with the `preview` profile instead (uses `internal` distribution):

```bash
eas build --platform ios --profile preview
```

Then use Apple Configurator 2 or your MDM solution to sideload the IPA directly.

## eas.json profiles at a glance

| Profile | Distribution | Simulator | Auto-increment |
|---------|-------------|-----------|----------------|
| `development` | Internal | No | No |
| `preview` | Internal | No | No |
| `production` | App Store | No | Yes |
