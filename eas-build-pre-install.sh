#!/usr/bin/env bash
set -euo pipefail

echo "[pre-install] Checking Android credentials..."

if [ -z "${ANDROID_KEYSTORE_BASE64:-}" ]; then
  echo "[pre-install] ANDROID_KEYSTORE_BASE64 not set — skipping credential setup (using committed credentials.json)"
  exit 0
fi

echo "[pre-install] Reconstructing Android keystore and credentials.json from EAS secrets..."

mkdir -p credentials/android

echo "$ANDROID_KEYSTORE_BASE64" | base64 -d > credentials/android/keystore.jks

cat > credentials.json <<EOF
{
  "android": {
    "keystore": {
      "keystorePath": "credentials/android/keystore.jks",
      "keystorePassword": "${ANDROID_KEYSTORE_PASSWORD}",
      "keyAlias": "${ANDROID_KEY_ALIAS}",
      "keyPassword": "${ANDROID_KEY_PASSWORD}"
    }
  },
  "ios": {
    "provisioningProfilePath": "ios-creds/dist.mobileprovision",
    "distributionCertificate": {
      "path": "ios-creds/dist.p12",
      "password": "ownCGrlMq1XbAIPZ1mj0hg=="
    }
  }
}
EOF

echo "[pre-install] credentials.json written."
echo "[pre-install] Keystore size: $(wc -c < credentials/android/keystore.jks) bytes"
