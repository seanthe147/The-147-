const fs = require("node:fs");
const path = require("node:path");

function containsPrivateMaterial(value) {
  const keys = ["private_key", "private_key_id", "client_secret", "refresh_token", "privateKey", "clientSecret", "refreshToken"];
  return value !== null && typeof value === "object" &&
    Object.entries(value).some(([key, child]) => keys.includes(key) || containsPrivateMaterial(child));
}

function prepareAndroidFirebase({ appDir = path.resolve(__dirname, ".."), env = process.env } = {}) {
  if (env.EAS_BUILD_PLATFORM?.toLowerCase() === "ios") return;
  const config = JSON.parse(fs.readFileSync(path.join(appDir, "app.json"), "utf8")).expo;
  if (!config.android?.googleServicesFile) return;
  const destination = path.resolve(appDir, config.android.googleServicesFile);
  const relative = path.relative(appDir, destination);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Firebase output must stay inside the app.");
  const source = env.GOOGLE_SERVICES_JSON ? path.resolve(appDir, env.GOOGLE_SERVICES_JSON) : destination;
  if (!fs.existsSync(source)) throw new Error("Missing Android Firebase client configuration. Configure the Expo GOOGLE_SERVICES_JSON secret file.");
  let firebase;
  try { firebase = JSON.parse(fs.readFileSync(source, "utf8")); }
  catch { throw new Error("Invalid Android Firebase client JSON."); }
  if (firebase.type === "service_account" || containsPrivateMaterial(firebase)) throw new Error("Use Firebase client configuration, not a service account key.");
  if (!config.android.package || !firebase.client?.some(client =>
    client.client_info?.android_client_info?.package_name === config.android.package))
    throw new Error("Firebase client does not match the Android package.");
  if (source !== destination) {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
    fs.chmodSync(destination, 0o600);
  }
}
module.exports = { prepareAndroidFirebase };
if (require.main === module) {
  try { prepareAndroidFirebase(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
