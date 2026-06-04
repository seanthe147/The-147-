#!/bin/bash
set -e

echo "=== iOS Build Script ==="

if [ -z "$ASC_KEY_P8" ]; then
  echo "WARNING: ASC_KEY_P8 secret is not set"
fi

# Write the p8 key from the secret to the expected path
node scripts/write-p8.js

# Run EAS build using local credentials (credentials.json)
# credentialsSource: local means eas uses ios-creds/dist.p12 + dist.mobileprovision
# NOTE: EXPO_APPLE_APP_SPECIFIC_PASSWORD is cleared — API key auth only
# NOTE: EXPO_ASC_KEY_ID is not passed — build uses local creds, not API key
EAS_NO_VCS=1 \
EXPO_APPLE_APP_SPECIFIC_PASSWORD="" \
EXPO_APPLE_TEAM_TYPE="${EXPO_APPLE_TEAM_TYPE:-COMPANY_OR_ORGANIZATION}" \
EXPO_APPLE_TEAM_ID="${EXPO_APPLE_TEAM_ID:-94LW5H4828}" \
npx eas-cli build --platform ios --profile production --non-interactive

echo "=== Build submitted ==="
