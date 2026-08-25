const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const scriptPath = path.resolve(__dirname, "bump-version.js");

function validConfig() {
  return {
    expo: {
      version: "2.8.7",
      runtimeVersion: "2.8.7",
      ios: { buildNumber: "68" },
      android: { versionCode: 122 },
    },
  };
}

function run(args, config = validConfig()) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "the147-version-"));
  const configPath = path.join(directory, "app.json");
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    encoding: "utf8",
    env: { ...process.env, APP_CONFIG_PATH: configPath },
  });
  const updated = JSON.parse(fs.readFileSync(configPath, "utf8"));
  fs.rmSync(directory, { recursive: true, force: true });
  return { ...result, updated };
}

test("documented release command form updates all versions", () => {
  const result = run(["--", "release", "3.0.0"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.updated.expo.version, "3.0.0");
  assert.equal(result.updated.expo.runtimeVersion, "3.0.0");
  assert.equal(result.updated.expo.ios.buildNumber, "69");
  assert.equal(result.updated.expo.android.versionCode, 123);
});

test("documented build command increments store builds only", () => {
  const result = run(["--", "build"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.updated.expo.version, "2.8.7");
  assert.equal(result.updated.expo.runtimeVersion, "2.8.7");
  assert.equal(result.updated.expo.ios.buildNumber, "69");
  assert.equal(result.updated.expo.android.versionCode, 123);
});

test("release rejects equal and regressive versions", () => {
  for (const version of ["2.8.7", "2.8.6", "1.0.0"]) {
    const result = run(["--", "release", version]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /must be greater than current version/);
    assert.deepEqual(result.updated, validConfig());
  }
});

test("malformed config fails without changing the file", () => {
  const malformed = validConfig();
  malformed.expo.runtimeVersion = "2.8.6";
  const result = run(["--", "build"], malformed);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /runtimeVersion .* must match version/);
  assert.deepEqual(result.updated, malformed);
});