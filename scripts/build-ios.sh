#!/bin/bash
set -e

echo "=== iOS Build Script ==="

# Restore .p8 key from secret
if [ -z "$ASC_KEY_P8" ]; then
  echo "ERROR: ASC_KEY_P8 secret is not set"
  exit 1
fi

# Write properly formatted PEM file using Node.js
node scripts/write-p8.js
P8_PATH=/tmp/AuthKey_PRH75PPG5Z.p8
chmod 600 "$P8_PATH"

# Run EAS build
EAS_NO_VCS=1 \
EXPO_ASC_API_KEY_PATH="$P8_PATH" \
EXPO_ASC_KEY_ID=PRH75PPG5Z \
EXPO_ASC_ISSUER_ID=7cdddb46-b377-45c0-9cbe-e07c358d3cc5 \
EXPO_APPLE_TEAM_TYPE=COMPANY_OR_ORGANIZATION \
EXPO_APPLE_TEAM_ID=94LW5H4828 \
npx eas-cli build --platform ios --profile production --non-interactive

echo "=== Build submitted ==="
