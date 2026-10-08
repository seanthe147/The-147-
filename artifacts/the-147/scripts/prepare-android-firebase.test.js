const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { prepareAndroidFirebase } = require("./prepare-android-firebase");

const packageName = "com.example.fixture";
const client = {
  project_info: { project_number: "123" },
  client: [
    {
      client_info: { android_client_info: { package_name: packageName } },
      api_key: [{ current_key: "fixture-client-value-not-a-real-key" }],
    },
  ],
};

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "firebase-build-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const appDir = path.join(root, "app");
  fs.mkdirSync(appDir);
  fs.writeFileSync(
    path.join(appDir, "app.json"),
    JSON.stringify({
      expo: {
        android: {
          package: packageName,
          googleServicesFile: "./google-services.json",
        },
      },
    }),
  );
  const source = path.join(root, "private-file.json");
  fs.writeFileSync(source, JSON.stringify(client));
  const destination = path.join(appDir, "google-services.json");
  const messages = [];
  const options = {
    appDir,
    env: { EAS_BUILD_PLATFORM: "android", GOOGLE_SERVICES_JSON: source },
    log: (message) => messages.push(message),
  };
  return { appDir, source, destination, messages, options };
}

test("prepares the private Expo file before Android prebuild without logging its values", (t) => {
  const f = fixture(t);
  prepareAndroidFirebase(f.options);
  assert.deepEqual(JSON.parse(fs.readFileSync(f.destination)), client);
  assert.equal(fs.statSync(f.destination).mode & 0o777, 0o600);
  assert.equal(f.messages.length, 1);
  assert.ok(!f.messages.join("").includes("fixture-client-value"));
  assert.ok(!f.messages.join("").includes(f.source));
});

test("missing cloud file fails with an actionable variable name", (t) => {
  const f = fixture(t);
  assert.throws(
    () => prepareAndroidFirebase({ ...f.options, env: { EAS_BUILD_PLATFORM: "android" } }),
    /Secret File variable named GOOGLE_SERVICES_JSON/,
  );
  assert.ok(!fs.existsSync(f.destination));
});

test("an invalid configured source does not silently use an existing local file", (t) => {
  const f = fixture(t);
  fs.copyFileSync(f.source, f.destination);
  assert.throws(
    () =>
      prepareAndroidFirebase({
        ...f.options,
        env: { GOOGLE_SERVICES_JSON: path.join(f.appDir, "missing.json") },
      }),
    /configuration is unavailable/,
  );
});

test("valid existing local configuration remains unchanged", (t) => {
  const f = fixture(t);
  fs.copyFileSync(f.source, f.destination);
  prepareAndroidFirebase({ ...f.options, env: {} });
  assert.deepEqual(JSON.parse(fs.readFileSync(f.destination)), client);
});

test("iOS builds do not require the Android Firebase file", (t) => {
  const f = fixture(t);
  fs.rmSync(f.source);
  assert.deepEqual(
    prepareAndroidFirebase({ ...f.options, env: { EAS_BUILD_PLATFORM: "ios" } }),
    { skipped: true },
  );
  assert.ok(!fs.existsSync(f.destination));
});

test("wrong-package configuration is rejected before overwriting a file", (t) => {
  const f = fixture(t);
  fs.copyFileSync(f.source, f.destination);
  fs.writeFileSync(
    f.source,
    JSON.stringify({ client: [{ client_info: { android_client_info: { package_name: "wrong.app" } } }] }),
  );
  assert.throws(() => prepareAndroidFirebase(f.options), /does not contain a client/);
  assert.deepEqual(JSON.parse(fs.readFileSync(f.destination)), client);
});

test("service-account credentials cannot be copied into the Android app", (t) => {
  const f = fixture(t);
  fs.writeFileSync(f.source, JSON.stringify({ type: "service_account" }));
  assert.throws(() => prepareAndroidFirebase(f.options), /not a private service-account key/);
  assert.ok(!fs.existsSync(f.destination));
});

test("embedded private material is rejected even with a matching client", (t) => {
  const f = fixture(t);
  fs.writeFileSync(f.source, JSON.stringify({ ...client, nested: { private_key: "fixture-only" } }));
  assert.throws(() => prepareAndroidFirebase(f.options), /not a private service-account key/);
  assert.ok(!fs.existsSync(f.destination));
});

test("malformed JSON does not expose file contents through the error", (t) => {
  const f = fixture(t);
  fs.writeFileSync(f.source, "INVALID_PRIVATE_PAYLOAD");
  assert.throws(() => prepareAndroidFirebase(f.options), (error) => {
    assert.match(error.message, /valid JSON/);
    assert.ok(!error.message.includes("INVALID_PRIVATE_PAYLOAD"));
    return true;
  });
});

test("configuration cannot write outside the app directory", (t) => {
  const f = fixture(t);
  fs.writeFileSync(
    path.join(f.appDir, "app.json"),
    JSON.stringify({ expo: { android: { package: packageName, googleServicesFile: "../outside.json" } } }),
  );
  assert.throws(() => prepareAndroidFirebase(f.options), /inside the app directory/);
  assert.ok(!fs.existsSync(path.join(f.appDir, "../outside.json")));
});

test("JSON null fails with a configuration error instead of a runtime exception", (t) => {
  const f = fixture(t);
  fs.writeFileSync(f.source, "null");
  assert.throws(() => prepareAndroidFirebase(f.options), /does not contain a client/);
});
