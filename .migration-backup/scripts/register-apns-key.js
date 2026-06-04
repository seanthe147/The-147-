#!/usr/bin/env node
/**
 * Registers the APNs push notification key with Expo's push service.
 * 
 * Requires:
 *   APNS_KEY_P8  - content of the .p8 file from Apple Developer Portal
 *   EXPO_TOKEN   - Expo access token (already set)
 * 
 * Key details (pre-filled):
 *   Key ID:     7NDZ2RF6BJ
 *   Team ID:    94LW5H4828 (Cue Gardens Ltd)
 *   Account ID: 549ddfda-6860-486c-9c03-f9073727a339 (@the-147)
 *   Team EAS ID: d28ff9b8-274f-4c89-a4b3-41877cda0fcc
 */

const https = require("https");

const EXPO_TOKEN = process.env.EXPO_TOKEN;
const APNS_KEY_P8_RAW = process.env.APNS_KEY_P8;

if (!EXPO_TOKEN) {
  console.error("ERROR: EXPO_TOKEN is not set");
  process.exit(1);
}

if (!APNS_KEY_P8_RAW) {
  console.error("ERROR: APNS_KEY_P8 is not set");
  console.error("Please add the content of your APNs .p8 file as the APNS_KEY_P8 secret in Replit");
  process.exit(1);
}

// Normalize the key — secrets sometimes strip newlines
function normalizeP8(raw) {
  const cleaned = raw.replace(/\\n/g, "\n").trim();
  if (cleaned.includes("-----BEGIN PRIVATE KEY-----")) return cleaned;
  // Try to reconstruct PEM format if newlines were stripped
  const body = cleaned
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s+/g, "");
  const lines = body.match(/.{1,64}/g).join("\n");
  return `-----BEGIN PRIVATE KEY-----\n${lines}\n-----END PRIVATE KEY-----`;
}

const keyP8 = normalizeP8(APNS_KEY_P8_RAW);

console.log("APNs key loaded, first line:", keyP8.split("\n")[0]);
console.log("Key length:", keyP8.length, "characters");

const KEY_IDENTIFIER = "7NDZ2RF6BJ";
const ACCOUNT_ID = "549ddfda-6860-486c-9c03-f9073727a339";
const APPLE_TEAM_EAS_ID = "d28ff9b8-274f-4c89-a4b3-41877cda0fcc";

function gql(query, variables) {
  const body = JSON.stringify({ query, variables });
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "api.expo.dev",
        path: "/graphql",
        method: "POST",
        headers: {
          Authorization: "Bearer " + EXPO_TOKEN,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(d));
          } catch (e) {
            reject(new Error("Failed to parse response: " + d.slice(0, 200)));
          }
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function run() {
  console.log("\n=== Registering APNs Push Key with Expo ===\n");
  console.log("Account:    @the-147 (" + ACCOUNT_ID + ")");
  console.log("Apple Team: 94LW5H4828 (Cue Gardens Ltd)");
  console.log("Key ID:     " + KEY_IDENTIFIER);

  // Step 1: Check if a push key already exists for this account
  console.log("\nChecking for existing push keys...");
  const checkResult = await gql(`{
    appleTeam {
      byAppleTeamIdentifier(accountId: "${ACCOUNT_ID}", identifier: "94LW5H4828") {
        id
        appleTeamIdentifier
        applePushKeys {
          id
          keyIdentifier
          updatedAt
        }
      }
    }
  }`);

  const team = checkResult.data?.appleTeam?.byAppleTeamIdentifier;
  const existingKeys = team?.applePushKeys || [];
  console.log("Existing push keys:", existingKeys.length);
  existingKeys.forEach((k) =>
    console.log("  -", k.keyIdentifier, "(EAS ID:", k.id + ")")
  );

  // Step 2: Create the new push key
  console.log("\nCreating APNs push key in EAS...");
  const mutation = `
    mutation CreateApplePushKey($accountId: ID!, $input: ApplePushKeyInput!) {
      applePushKey {
        createApplePushKey(accountId: $accountId, applePushKeyInput: $input) {
          id
          keyIdentifier
          updatedAt
        }
      }
    }
  `;

  const variables = {
    accountId: ACCOUNT_ID,
    input: {
      keyP8: keyP8,
      keyIdentifier: KEY_IDENTIFIER,
      appleTeamId: APPLE_TEAM_EAS_ID,
    },
  };

  const result = await gql(mutation, variables);

  if (result.errors) {
    console.error("\nERROR creating push key:");
    result.errors.forEach((e) => console.error(" -", e.message));
    process.exit(1);
  }

  const created = result.data?.applePushKey?.createApplePushKey;
  if (created) {
    console.log("\n✅ APNs push key registered successfully!");
    console.log("   EAS ID:     ", created.id);
    console.log("   Key ID:     ", created.keyIdentifier);
    console.log("   Updated:    ", created.updatedAt);
    console.log(
      "\nPush notifications should now work. Try sending a test from the staff dashboard."
    );
  } else {
    console.error("\nUnexpected response:", JSON.stringify(result, null, 2));
    process.exit(1);
  }

  // Step 3: Now link the push key to the app credentials
  console.log("\nLinking push key to app credentials...");
  const linkQuery = `{
    appleAppIdentifier {
      byBundleIdentifier(accountId: "${ACCOUNT_ID}", bundleIdentifier: "com.the147bradford.app") {
        id
        bundleIdentifier
        iosAppCredentials {
          id
          pushKey { id keyIdentifier }
        }
      }
    }
  }`;

  const appResult = await gql(linkQuery);
  const appId = appResult.data?.appleAppIdentifier?.byBundleIdentifier;
  if (appId) {
    console.log("App identifier found:", appId.bundleIdentifier, "(ID:", appId.id + ")");
    const creds = appId.iosAppCredentials;
    if (creds?.length) {
      creds.forEach((c) =>
        console.log(
          "  Credentials ID:",
          c.id,
          "| Push key:",
          c.pushKey?.keyIdentifier || "none"
        )
      );
    }
  } else {
    if (appResult.errors) {
      appResult.errors.forEach((e) => console.error(" -", e.message));
    }
  }
}

run().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
