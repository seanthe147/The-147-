#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const privateFields = new Set([
  "private_key",
  "private_key_id",
  "client_secret",
  "refresh_token",
  "privateKey",
  "clientSecret",
  "refreshToken",
]);

function containsPrivateMaterial(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    Object.entries(value).some(
      ([key, child]) => privateFields.has(key) || containsPrivateMaterial(child),
    )
  );
}

function prepareAndroidFirebase({
  appDir = path.resolve(__dirname, ".."),
  env = process.env,
  log = console.log,
} = {}) {
  if (env.EAS_BUILD_PLATFORM?.toLowerCase() === "ios") {
    return { skipped: true };
  }

  const config = JSON.parse(
    fs.readFileSync(path.join(appDir, "app.json"), "utf8"),
  ).expo;
  const destinationSetting = config.android?.googleServicesFile;
  if (!destinationSetting) return { skipped: true };

  const destination = path.resolve(appDir, destinationSetting);
  const relative = path.relative(appDir, destination);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Android Firebase output must remain inside the app directory.");
  }

  const source = env.GOOGLE_SERVICES_JSON
    ? path.resolve(appDir, env.GOOGLE_SERVICES_JSON)
    : destination;
  if (!fs.existsSync(source) || !fs.statSync(source).isFile()) {
    throw new Error(
      "Android Firebase configuration is unavailable. Upload google-services.json " +
        "as a Secret File variable named GOOGLE_SERVICES_JSON in the Expo production environment.",
    );
  }

  let firebase;
  try {
    firebase = JSON.parse(fs.readFileSync(source, "utf8"));
  } catch {
    throw new Error("Android Firebase configuration must be a valid JSON file.");
  }
  if (firebase?.type === "service_account" || containsPrivateMaterial(firebase)) {
    throw new Error(
      "Use the Android Firebase client configuration, not a private service-account key.",
    );
  }
  if (
    !config.android?.package ||
    !Array.isArray(firebase?.client) ||
    !firebase.client.some(
      (client) =>
        client?.client_info?.android_client_info?.package_name ===
        config.android.package,
    )
  ) {
    throw new Error(
      "Android Firebase configuration does not contain a client for this app's Android package.",
    );
  }

  if (source !== destination) {
    try {
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(source, destination);
      fs.chmodSync(destination, 0o600);
    } catch {
      throw new Error("Could not prepare the Android Firebase configuration file.");
    }
    log("Android Firebase configuration prepared from the private Expo file variable.");
  } else {
    log("Existing Android Firebase client configuration validated.");
  }
  return { destination, skipped: false };
}

module.exports = { prepareAndroidFirebase };

if (require.main === module) {
  try {
    prepareAndroidFirebase();
  } catch (error) {
    console.error(`Firebase build preparation failed: ${error.message}`);
    process.exitCode = 1;
  }
}
