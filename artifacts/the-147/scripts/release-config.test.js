const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { prepareAndroidFirebase } = require("./prepare-android-firebase");

test("production uses the current package manager and SDK 57 Android image", () => {
  const build = require("../eas.json").build.production;
  assert.equal(build.pnpm, "10.26.1");
  assert.equal(build.android.image, "ubuntu-26.04-jdk-17-ndk-r27b-sdk-57");
  assert.equal(require("../package.json").scripts["eas-build-pre-install"], "node scripts/prepare-android-firebase.js");
  const app = require("../app.json").expo;
  assert.equal(app.runtimeVersion, app.version);
  assert.equal(app.extra.easConfig.build.production.pnpm, build.pnpm);
});

test("Firebase hook copies only matching client files and skips iOS", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "firebase-hook-"));
  try {
    fs.writeFileSync(path.join(dir, "app.json"), JSON.stringify({ expo: { android: { package: "test.app", googleServicesFile: "./google-services.json" } } }));
    const source = path.join(dir, "input.json");
    const env = { EAS_BUILD_PLATFORM: "android", GOOGLE_SERVICES_JSON: source };
    assert.throws(() => prepareAndroidFirebase({ appDir: dir, env }), /Missing/);
    fs.writeFileSync(source, JSON.stringify({ client: [{ client_info: { android_client_info: { package_name: "test.app" } } }] }));
    prepareAndroidFirebase({ appDir: dir, env });
    assert.ok(fs.existsSync(path.join(dir, "google-services.json")));
    fs.writeFileSync(source, JSON.stringify({ type: "service_account" }));
    assert.throws(() => prepareAndroidFirebase({ appDir: dir, env }), /service account/);
    fs.writeFileSync(source, JSON.stringify({ client: [] }));
    assert.throws(() => prepareAndroidFirebase({ appDir: dir, env }), /does not match/);
    prepareAndroidFirebase({ appDir: dir, env: { EAS_BUILD_PLATFORM: "ios" } });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
