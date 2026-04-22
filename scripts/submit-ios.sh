#!/bin/bash
set -e

echo "=== iOS Submit Script ==="

# Restore the App Store Connect .p8 key from secrets before submission.
# Required env vars:
#   ASC_KEY_P8_BASE64 - Base64-encoded content of the AuthKey_<KEY_ID>.p8 file
#   ASC_KEY_ID        - The key ID (e.g. URDY56X3U2)
if [ -z "${ASC_KEY_P8_BASE64:-}" ]; then
  echo "ERROR: ASC_KEY_P8_BASE64 secret is not set." >&2
  exit 1
fi
if [ -z "${ASC_KEY_ID:-}" ]; then
  echo "ERROR: ASC_KEY_ID is not set." >&2
  exit 1
fi

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mkdir -p "$PROJECT_ROOT/ios-creds"
ASC_KEY_PATH="$PROJECT_ROOT/ios-creds/AuthKey_${ASC_KEY_ID}.p8"
echo "$ASC_KEY_P8_BASE64" | base64 -d > "$ASC_KEY_PATH"
echo "ASC key written: $ASC_KEY_PATH"

# Update eas.json at runtime to use the generated key path
# (eas.json must not contain a hardcoded path to a committed file)
node -e "
  const fs = require('fs');
  const p = '$PROJECT_ROOT/eas.json';
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  const keyPath = '$ASC_KEY_PATH';
  const keyId = process.env.ASC_KEY_ID;
  ['production', 'production-staff'].forEach(profile => {
    if (j.submit && j.submit[profile] && j.submit[profile].ios) {
      j.submit[profile].ios.ascApiKeyId = keyId;
      j.submit[profile].ios.ascApiKeyPath = keyPath;
    }
  });
  fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
  console.log('eas.json updated with ASC key path');
"

# Run EAS submit — reads ascApiKeyId/ascApiKeyPath from eas.json
# ascAppId 6760673771 = "THE 147" in App Store Connect
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
