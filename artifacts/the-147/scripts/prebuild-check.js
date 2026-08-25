#!/usr/bin/env node

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const appDir = path.resolve(__dirname, "..");
const repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  cwd: appDir,
  encoding: "utf8",
}).trim();
const appRelative = path.relative(repoRoot, appDir).replaceAll(path.sep, "/");
const errors = [];

function git(args) {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

const archiveFiles = git([
  "ls-files",
  "--cached",
  "--others",
  "--exclude-standard",
  "-z",
  "--",
  appRelative,
])
  .split("\0")
  .filter(Boolean);

const byLowercase = new Map();
for (const file of archiveFiles) {
  const key = file.toLocaleLowerCase("en-US");
  const previous = byLowercase.get(key);
  if (previous && previous !== file) {
    errors.push(`filename casing conflict: "${previous}" and "${file}"`);
  } else {
    byLowercase.set(key, file);
  }
}

const untracked = git([
  "ls-files",
  "--others",
  "--exclude-standard",
  "-z",
  "--",
  appRelative,
])
  .split("\0")
  .filter(Boolean);

const junkPattern =
  /(^|\/)(\.local|node_modules|dist|coverage|tmp|temp|\.cache|\.expo|attached_assets)(\/|$)|(^|\/)(\.DS_Store|Thumbs\.db)$|(~|\.bak|\.orig|\.swp|\.tmp)$/i;
for (const file of untracked) {
  if (junkPattern.test(file)) {
    errors.push(`untracked junk path would enter the EAS archive: "${file}"`);
  }
}

const config = JSON.parse(
  fs.readFileSync(path.join(appDir, "app.json"), "utf8"),
).expo;
if (!/^\d+\.\d+\.\d+$/.test(config.version)) {
  errors.push(`app version "${config.version}" must use semantic x.y.z format`);
}
if (config.runtimeVersion !== config.version) {
  errors.push(
    `runtimeVersion "${config.runtimeVersion}" must match version "${config.version}"`,
  );
}
if (!/^\d+$/.test(String(config.ios?.buildNumber))) {
  errors.push("ios.buildNumber must be an integer string");
}
if (!Number.isSafeInteger(config.android?.versionCode)) {
  errors.push("android.versionCode must be an integer");
}

if (errors.length) {
  console.error("Pre-build check failed:");
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log(
  `Pre-build check passed (${archiveFiles.length} archive files, ${untracked.length} untracked).`,
);
console.log(
  `Version ${config.version}; iOS build ${config.ios.buildNumber}; Android build ${config.android.versionCode}.`,
);