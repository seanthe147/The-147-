#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const appJsonPath = process.env.APP_CONFIG_PATH
  ? path.resolve(process.env.APP_CONFIG_PATH)
  : path.resolve(__dirname, "..", "app.json");
const args = process.argv.slice(2);
if (args[0] === "--") args.shift();
const [mode, requestedVersion, ...extraArgs] = args;

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function nextPatch(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) fail(`current version "${version}" is not semantic x.y.z`);
  return `${match[1]}.${match[2]}.${Number(match[3]) + 1}`;
}

function validateVersion(version) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    fail(`version "${version}" must use semantic x.y.z format`);
  }
}

function compareVersions(left, right) {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) {
      return leftParts[index] - rightParts[index];
    }
  }
  return 0;
}

if (!["release", "build"].includes(mode)) {
  fail(
    "usage: pnpm run version:bump -- release [x.y.z] | pnpm run version:bump -- build",
  );
}

if (extraArgs.length) fail(`unexpected argument "${extraArgs[0]}"`);

if (mode === "build" && requestedVersion) {
  fail("the build mode keeps version/runtimeVersion unchanged; do not pass a version");
}

const config = JSON.parse(fs.readFileSync(appJsonPath, "utf8"));
const expo = config.expo;
if (!expo?.ios || !expo?.android) fail("app.json is missing Expo platform config");

const before = {
  version: expo.version,
  runtimeVersion: expo.runtimeVersion,
  buildNumber: expo.ios.buildNumber,
  versionCode: expo.android.versionCode,
};

const buildNumber = Number(before.buildNumber);
const versionCode = Number(before.versionCode);
if (!Number.isSafeInteger(buildNumber) || buildNumber < 0) {
  fail(`iOS buildNumber "${before.buildNumber}" is not a non-negative integer`);
}
if (!Number.isSafeInteger(versionCode) || versionCode < 0) {
  fail(`Android versionCode "${before.versionCode}" is not a non-negative integer`);
}
if (before.runtimeVersion !== before.version) {
  fail(
    `runtimeVersion (${before.runtimeVersion}) must match version (${before.version}) before bumping`,
  );
}

const version =
  mode === "release" ? requestedVersion || nextPatch(before.version) : before.version;
validateVersion(version);
if (mode === "release" && compareVersions(version, before.version) <= 0) {
  fail(
    `release version ${version} must be greater than current version ${before.version}`,
  );
}

expo.version = version;
expo.runtimeVersion = version;
expo.ios.buildNumber = String(buildNumber + 1);
expo.android.versionCode = versionCode + 1;

fs.writeFileSync(appJsonPath, `${JSON.stringify(config, null, 2)}\n`);

console.log(mode === "release" ? "Full binary release bump:" : "OTA-compatible binary rebuild:");
console.log(`  version:             ${before.version} -> ${expo.version}`);
console.log(`  runtimeVersion:      ${before.runtimeVersion} -> ${expo.runtimeVersion}`);
console.log(`  iOS buildNumber:     ${before.buildNumber} -> ${expo.ios.buildNumber}`);
console.log(`  Android versionCode: ${before.versionCode} -> ${expo.android.versionCode}`);
if (mode === "build") {
  console.log("  Existing binaries and this rebuild remain on the same OTA runtime.");
}