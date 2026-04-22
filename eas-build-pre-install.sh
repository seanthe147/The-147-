#!/usr/bin/env bash
set -euo pipefail

echo "[pre-install] Setting up signing credentials from environment variables..."

# Absolute path to the project root (same directory as this script)
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "[pre-install] Project root: $PROJECT_ROOT"

# EAS_BUILD_PLATFORM is set by the EAS build environment to "android" or "ios".
# Fall back to "all" when running locally so all credential blocks execute.
PLATFORM="${EAS_BUILD_PLATFORM:-all}"
echo "[pre-install] Build platform: $PLATFORM"

# ---------------------------------------------------------------------------
# Android signing credentials
# Required env vars (Android and all-platform builds):
#   ANDROID_KEYSTORE_BASE64    - Base64-encoded production keystore.jks
#   ANDROID_KEYSTORE_PASSWORD  - Password for the keystore
#   ANDROID_KEY_ALIAS          - Key alias within the keystore
#   ANDROID_KEY_PASSWORD       - Password for the key
# ---------------------------------------------------------------------------
if [ "$PLATFORM" = "android" ] || [ "$PLATFORM" = "all" ]; then
  for var in ANDROID_KEYSTORE_BASE64 ANDROID_KEYSTORE_PASSWORD ANDROID_KEY_ALIAS ANDROID_KEY_PASSWORD; do
    if [ -z "${!var:-}" ]; then
      echo "[pre-install] ERROR: $var is not set (required for Android builds)." >&2
      exit 1
    fi
  done

  mkdir -p "$PROJECT_ROOT/credentials/android"
  KEYSTORE_PATH="$PROJECT_ROOT/credentials/android/keystore.jks"
  echo "$ANDROID_KEYSTORE_BASE64" | base64 -d > "$KEYSTORE_PATH"
  echo "[pre-install] Keystore written: $(wc -c < "$KEYSTORE_PATH") bytes at $KEYSTORE_PATH"
fi

# ---------------------------------------------------------------------------
# iOS credentials
# Required env vars (iOS and all-platform builds):
#   IOS_DIST_P12_BASE64        - Base64-encoded dist.p12 distribution certificate
#   IOS_DIST_P12_PASSWORD      - Password for the dist.p12 file
#   IOS_DIST_PROVISION_BASE64  - Base64-encoded dist.mobileprovision (customer app)
#   IOS_STAFF_PROVISION_BASE64 - Base64-encoded staff.mobileprovision (staff app)
#   ASC_KEY_P8_BASE64          - Base64-encoded App Store Connect API key (.p8)
#   ASC_KEY_ID                 - Key ID matching the .p8 file (e.g. URDY56X3U2)
# ---------------------------------------------------------------------------
if [ "$PLATFORM" = "ios" ] || [ "$PLATFORM" = "all" ]; then
  for var in IOS_DIST_P12_BASE64 IOS_DIST_P12_PASSWORD IOS_DIST_PROVISION_BASE64 IOS_STAFF_PROVISION_BASE64 ASC_KEY_P8_BASE64 ASC_KEY_ID; do
    if [ -z "${!var:-}" ]; then
      echo "[pre-install] ERROR: $var is not set (required for iOS builds)." >&2
      exit 1
    fi
  done

  mkdir -p "$PROJECT_ROOT/ios-creds"
  echo "$IOS_DIST_P12_BASE64" | base64 -d > "$PROJECT_ROOT/ios-creds/dist.p12"
  echo "$IOS_DIST_PROVISION_BASE64" | base64 -d > "$PROJECT_ROOT/ios-creds/dist.mobileprovision"
  echo "$IOS_STAFF_PROVISION_BASE64" | base64 -d > "$PROJECT_ROOT/ios-creds/staff.mobileprovision"
  echo "[pre-install] iOS credentials written to ios-creds/"

  ASC_KEY_PATH="$PROJECT_ROOT/ios-creds/AuthKey_${ASC_KEY_ID}.p8"
  echo "$ASC_KEY_P8_BASE64" | base64 -d > "$ASC_KEY_PATH"
  echo "[pre-install] ASC key written: $ASC_KEY_PATH"
fi

# ---------------------------------------------------------------------------
# Variant detection (customer vs staff)
# ---------------------------------------------------------------------------
VARIANT="${EXPO_PUBLIC_APP_VARIANT:-customer}"
echo "[pre-install] App variant: $VARIANT"

if [ "$VARIANT" = "staff" ]; then
  IOS_PROFILE_PATH="${PROJECT_ROOT}/ios-creds/staff.mobileprovision"
else
  IOS_PROFILE_PATH="${PROJECT_ROOT}/ios-creds/dist.mobileprovision"
fi
echo "[pre-install] iOS provisioning profile: $IOS_PROFILE_PATH"

# ---------------------------------------------------------------------------
# Write credentials.json using values from environment variables only.
# Include only the blocks relevant to the current platform.
# ---------------------------------------------------------------------------
KEYSTORE_PATH="${KEYSTORE_PATH:-$PROJECT_ROOT/credentials/android/keystore.jks}"

if [ "$PLATFORM" = "android" ]; then
  cat > "$PROJECT_ROOT/credentials.json" << CREDS_EOF
{
  "android": {
    "keystore": {
      "keystorePath": "$KEYSTORE_PATH",
      "keystorePassword": "$ANDROID_KEYSTORE_PASSWORD",
      "keyAlias": "$ANDROID_KEY_ALIAS",
      "keyPassword": "$ANDROID_KEY_PASSWORD"
    }
  }
}
CREDS_EOF

elif [ "$PLATFORM" = "ios" ]; then
  cat > "$PROJECT_ROOT/credentials.json" << CREDS_EOF
{
  "ios": {
    "provisioningProfilePath": "$IOS_PROFILE_PATH",
    "distributionCertificate": {
      "path": "$PROJECT_ROOT/ios-creds/dist.p12",
      "password": "$IOS_DIST_P12_PASSWORD"
    }
  }
}
CREDS_EOF

else
  cat > "$PROJECT_ROOT/credentials.json" << CREDS_EOF
{
  "android": {
    "keystore": {
      "keystorePath": "$KEYSTORE_PATH",
      "keystorePassword": "$ANDROID_KEYSTORE_PASSWORD",
      "keyAlias": "$ANDROID_KEY_ALIAS",
      "keyPassword": "$ANDROID_KEY_PASSWORD"
    }
  },
  "ios": {
    "provisioningProfilePath": "$IOS_PROFILE_PATH",
    "distributionCertificate": {
      "path": "$PROJECT_ROOT/ios-creds/dist.p12",
      "password": "$IOS_DIST_P12_PASSWORD"
    }
  }
}
CREDS_EOF
fi

echo "[pre-install] credentials.json written (values sourced from environment)"

# ---------------------------------------------------------------------------
# app.json rewrite for staff variant
# ---------------------------------------------------------------------------
if [ "$VARIANT" = "staff" ]; then
  APP_JSON="$PROJECT_ROOT/app.json"
  echo "[pre-install] Rewriting app.json for staff variant..."
  node -e "
    const fs = require('fs');
    const p = '$APP_JSON';
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    j.expo.name = 'The 147 Staff';
    j.expo.slug = 'the-147-staff';
    j.expo.scheme = 'the147staff';
    j.expo.ios = j.expo.ios || {};
    j.expo.ios.bundleIdentifier = 'com.the147bradford.staff';
    j.expo.android = j.expo.android || {};
    j.expo.android.package = 'com.the147bradford.staff';
    fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
    console.log('[pre-install] app.json rewritten: ' + j.expo.ios.bundleIdentifier);
  "
fi

echo "[pre-install] Done."
