#!/usr/bin/env bash
set -euo pipefail

echo "[pre-install] Setting up Android signing credentials..."

# Absolute path to the project root (same directory as this script)
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "[pre-install] Project root: $PROJECT_ROOT"

mkdir -p "$PROJECT_ROOT/credentials/android"

KEYSTORE_PATH="$PROJECT_ROOT/credentials/android/keystore.jks"

# Decode embedded keystore to absolute path
base64 -d > "$KEYSTORE_PATH" << 'KEYSTORE_EOF'
/u3+7QAAAAIAAAABAAAAAQAgMzZiNTE2Mzc2MWVjMmRjYzhjZmYwNWI5NGE4MjQ2MmYAAAGdeRnW
HgAABQEwggT9MA4GCisGAQQBKgIRAQEFAASCBOlS2NDDbEw71G5vH2u4cWpjuJltCwBaXHpoX8J/
vE/MlsjJ0HivwqbgAehmhuAcnsYFJwYoTMZ6s4bfzmHR3K6nFvoI/R3fXhU0Fl8yhcLVqjQFccsR
H70lJ2O6csgRDDuyg7UfTStYZWmZHQYj2hVASmNVEg1sUO86bWW/+VPkntL/Wx2DB1bmrf9gN7Xi
xzf53XKbhvgF/7YqmbkEekGi4W3OM0zdES6PHpLT9c7vFxh5jF6UoEGhsxRVW1Bmpyrh05S9pkFG
4wn3BU3nL44gRxRCX6gNSgxH6iK/M2ZWR49lDd9vJ6B1WmGVH3A/Hx7oL7SjMHehsF6FIqc8QFU
Iz7mte5V8fszrN6xKuj8fWt9lpr5zHBEIbRCbAU04a8k7CLDiFLE8Ze5aM9o7ykK4e00o2mquykB
ZZ+t+J+OU7N4JMOnro6r5LGD0RPZ3qdONaH4H0KZyXOitXFVGt95R4EC4NEBJnp5ELhFv13oJv2L
PO1y4S4vsISgpIdTyzHhh5dLCErmrHu1tjOGCL3Y5kVwTtNELOboBMVYWlWaY0arwrbPPWnj+l0K
AVelM+sfwCgZMgrrth4lv4b9RrkdrtV8z7Z6yP4juRowQktqe/z3C6TnxzAdMoUaGi/A+MsMTvOE9
mOlOf1G5OmCliRQoWwvUDk9QiQ12jqw8AnchpkYP8jAis0LG4jxRSooa9p38sj3O6UCGhCi89Sk6
jVVA3CJf6sIZ/ita0mD97XfWnSrEmJpSz6qPvx6n9wAZPE0vmC8bLAEEwqY+me+xrRlBzjKqTkE3
Levm5kw+cG+gksBeqHur0dMWnYlcnvH3B5d2SDOjp4iThfWRzq0vQIXC1KhfZDg0Y8usZCukN/YZ
6uyHigX3fLJL8+nUjJP/HWsNOXCD/zZCpinPLkhn0psX5OMd/1Hkv5fW8fl5hhqfHOOG+4K5Pdhd
SqnRbMApXPepk3X3Cf0FqbLYbcgDC8WzQqZ+11pkgiHLZLItP77mwK6xO5iQGjk33l/uhEJnoYlb
KKqzaNgmxpGOsSADNAHHeTbTWYr8MnRftwsuLyljxYE0B8QKUYRsZr3EIeQy7A8CqK8h50+hTk3D
SG24CmVvzn8T+S56kY50MSerwz6RYHTKSIGgUxjGaXal9tPZnwkMqY7VGQjsFRcVi9XegruTdr20
KkEscyQ6feqEFdIdRodv76QyBa5X2FJSkRJSzLRRBgo2V+Z4Ab07JKbqPcCOMvUianJQSPG4rjeR
dZO/GPZiSpAi+oZiKbAeM5uQSPA+ZsqBtTBe7OCkjwMjXPEguT5rYx6S7xHon8yW4svwIeR7NA69
xMKW/CZrohIY84n/1A5W2k9KSa191Q5kyyIgPvgjsJaAPidoiA+kDPPVA+od54wn4RkCDPsEyUx7
mPdxwhSNO0MdVx622P6i11ZULOGpGj6ZgFUuxulYM4cTgHGvYr/6f8Rc/z/cjS6QmcE0Vg/uAy6W
+Jzys3vedSr43+iE6rMm7hT8DIhOaU1lVFykzXaq6F4YNcXhwUlCLwtpWBpEXDAs6h7xwTXqMs7E
eqQry59kaopTq3zsG/412O2f+z5E05CpIO1Twz91d0avmey7WAt+8s9syUVIeDToHfQf7O/WJLUQ3
jx24fzGnrSaOayGsGBc4rppJTTudQvTd21lSoZkMkcAAAABAAVYLjUwOQAAAy4wggMqMIICEqADAg
ECAgkA2FLPqMDYrzQwDQYJKoZIhvcNAQELBQAwQjEJMAcGA1UEBhMAMQkwBwYDVQQIEwAxCTAHBgNV
BAcTADEJMAcGA1UEChMAMQkwBwYDVQQLEwAxCTAHBgNVBAMTADAgFw0yNjA0MTAyMDMzNDlaGA8y
MDUzMDgyNjIwMzM0OVowQjEJMAcGA1UEBhMAMQkwBwYDVQQIEwAxCTAHBgNVBAcTADEJMAcGA1UE
ChMAMQkwBwYDVQQLEwAxCTAHBgNVBAMTADCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEB
AOZxYKi2H19LDNX4artAMmT6OdB5n+XGTE+pkGEIlW6HuxyWkZf/iDcqli5X0UyHBLZPFApEyHfD
jTtGy182ghFf4AfyAsQy7Fv7kfxkqVz8U1eF7kzXEwEG6WX6f8DEafY23mCkF4HEA2+ch7Tmm/bG
cOBkXOzXOE0wgP2Qi6LXBWzK+xcJL8qtySs2ofY7BqOzdDMedpiI08zhwN8n54T6L7/Ny5ZetXGs
hhoB03pjejS7awWFkAFfZJCM4pwReoieHajtK+Cnyp7znIx5aOHgNKH3GAxpmFT31itPobvWZJEH
ciL0nVcnq3OGsUtqIipdkny+MawesFihZNggeikCAwEAAaMhMB8wHQYDVR0OBBYEFNmuv1e3fnKZ
lAJaBfUikL2108pUMA0GCSqGSIb3DQEBCwUAA4IBAQAQi/Y9l/k4YA6iqohYbTMtnH2m8aTMJm7d
oK1LCXpK2eOWka5N9es9SPQgFGjpOmfPCjVMldKTzdDS1L9UjWSOvUnDo7qyT7BF+Z3Y0CR0yr3j
At8y/KkSqYXxiIeJDLETbu+SzVvAtgvoKmjm1hSbv/Eda5qN99qCQmr3vyc8jpuZwg1rYKpnBiRx
nkGlOgS4pdwEaYgwN8WoF4142sV5SY4iHnr2rb5NsecY7yZnH7m153idX0NN9KcrxzzNgPyKQu48
NuUt/bjpzruzQJYT1Kolqk31dQM/YzkvGK6tXqnVVoZj0w27feIrE62VEpPvQljtdVqZgPvND07q
3xKuFODcyAhqyTO4810dSFkGiiC8kdI=
KEYSTORE_EOF

echo "[pre-install] Keystore written: $(wc -c < "$KEYSTORE_PATH") bytes at $KEYSTORE_PATH"

# --- Variant detection (customer vs staff) -------------------------------
# When EXPO_PUBLIC_APP_VARIANT=staff, we ship the staff App Store listing
# (bundle id com.the147bradford.staff). Both variants share the same iOS
# distribution certificate (.p12) — only the provisioning profile differs.
VARIANT="${EXPO_PUBLIC_APP_VARIANT:-customer}"
echo "[pre-install] App variant: $VARIANT"

if [ "$VARIANT" = "staff" ]; then
  IOS_PROFILE_PATH="$PROJECT_ROOT/ios-creds/staff.mobileprovision"
else
  IOS_PROFILE_PATH="$PROJECT_ROOT/ios-creds/dist.mobileprovision"
fi
echo "[pre-install] iOS provisioning profile: $IOS_PROFILE_PATH"

# Write credentials.json to absolute path, with absolute keystorePath inside
cat > "$PROJECT_ROOT/credentials.json" << CREDS_EOF
{
  "android": {
    "keystore": {
      "keystorePath": "$KEYSTORE_PATH",
      "keystorePassword": "9021d3e50104805696704789b37a3284",
      "keyAlias": "36b5163761ec2dcc8cff05b94a82462f",
      "keyPassword": "b2af160569b7bdaff4e070f0fa3bf603"
    }
  },
  "ios": {
    "provisioningProfilePath": "$IOS_PROFILE_PATH",
    "distributionCertificate": {
      "path": "$PROJECT_ROOT/ios-creds/dist.p12",
      "password": "ownCGrlMq1XbAIPZ1mj0hg=="
    }
  }
}
CREDS_EOF

echo "[pre-install] credentials.json written to $PROJECT_ROOT/credentials.json"
echo "[pre-install] Keystore path in credentials.json: $KEYSTORE_PATH"

# --- app.json rewrite for staff variant ----------------------------------
# Static app.json is required for Expo Launch; rewrite at build time to swap
# the bundle identifier, Android package and display name for the staff app.
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
