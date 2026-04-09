#!/bin/bash
set -e

echo "=== iOS Submit Script ==="

# Restore .p8 key from secret (used only for reference; submission uses eas.json ASC key config)
if [ -z "$ASC_KEY_P8" ]; then
  echo "WARNING: ASC_KEY_P8 secret is not set (not required for submission using local key file)"
fi

# NOTE: Submission uses URDY56X3U2 key from ios-creds/AuthKey_URDY56X3U2.p8 as configured
# in eas.json submit.production.ios — do NOT override with EXPO_ASC_KEY_ID env vars
# because EXPO_ASC_KEY_ID=PRH75PPG5Z in the environment points to an invalid/revoked key.

# Run EAS submit — reads ascApiKeyId/ascApiKeyPath from eas.json (URDY56X3U2)
# ascAppId 6760673771 = "THE 147" in App Store Connect
# EXPO_APPLE_APP_SPECIFIC_PASSWORD is cleared — we use API key auth, not Apple ID auth
EAS_NO_VCS=1 \
EXPO_APPLE_APP_SPECIFIC_PASSWORD="" \
EXPO_APPLE_TEAM_TYPE="${EXPO_APPLE_TEAM_TYPE:-COMPANY_OR_ORGANIZATION}" \
EXPO_APPLE_TEAM_ID="${EXPO_APPLE_TEAM_ID:-94LW5H4828}" \
npx eas-cli submit \
  --platform ios \
  --profile production \
  --non-interactive \
  --latest

echo "=== Submit complete ==="
