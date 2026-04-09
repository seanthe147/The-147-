#!/bin/bash
set -e

echo "=== iOS Submit Script ==="

# Restore .p8 key from secret — uses EXPO_ASC_KEY_ID / EXPO_ASC_API_KEY_PATH from env
if [ -z "$ASC_KEY_P8" ]; then
  echo "ERROR: ASC_KEY_P8 secret is not set"
  exit 1
fi

node scripts/write-p8.js

KEY_ID="${EXPO_ASC_KEY_ID:-PRH75PPG5Z}"
P8_PATH="${EXPO_ASC_API_KEY_PATH:-/tmp/AuthKey_PRH75PPG5Z.p8}"

echo "Using Key ID: $KEY_ID"
echo "Using Key Path: $P8_PATH"
chmod 600 "$P8_PATH"

# Run EAS submit
# ascAppId 6760673771 = "THE 147" (confirmed via App Store Connect API)
# This is set in eas.json submit.production.ios.ascAppId
EAS_NO_VCS=1 \
EXPO_ASC_API_KEY_PATH="$P8_PATH" \
EXPO_ASC_KEY_ID="$KEY_ID" \
EXPO_ASC_ISSUER_ID="${EXPO_ASC_ISSUER_ID:-7cdddb46-b377-45c0-9cbe-e07c358d3cc5}" \
EXPO_APPLE_TEAM_TYPE="${EXPO_APPLE_TEAM_TYPE:-COMPANY_OR_ORGANIZATION}" \
EXPO_APPLE_TEAM_ID="${EXPO_APPLE_TEAM_ID:-94LW5H4828}" \
npx eas-cli submit \
  --platform ios \
  --profile production \
  --non-interactive \
  --latest

echo "=== Submit complete ==="
