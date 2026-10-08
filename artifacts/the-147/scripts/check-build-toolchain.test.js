const assert = require("node:assert/strict");
const test = require("node:test");
const { checkBuildToolchain } = require("./check-build-toolchain");

function fixture() {
  const profile = {
    node: "22.19.0",
    pnpm: "10.26.1",
    environment: "production",
    ios: { image: "macos-tahoe-26.6-xcode-27.0" },
    android: {
      image: "ubuntu-26.04-jdk-17-ndk-r27b-sdk-57",
      buildType: "app-bundle",
    },
  };
  return {
    config: { extra: { easConfig: { build: { production: structuredClone(profile) } } } },
    eas: { build: { production: structuredClone(profile) } },
    packageJson: { devDependencies: { expo: "57.0.27" } },
    pnpmVersion: "10.26.1",
  };
}

test("aligned SDK 57 production toolchains pass", () => {
  assert.deepEqual(checkBuildToolchain(fixture()), []);
});

test("an omitted Android image cannot fall back to the cloud legacy default", () => {
  const f = fixture();
  delete f.eas.build.production.android.image;
  assert.ok(checkBuildToolchain(f).some((message) => message.includes("explicitly select android.image")));
});

test("the observed Java 11 image is rejected", () => {
  const f = fixture();
  f.eas.build.production.android.image = "ubuntu-22.04-jdk-11-ndk-r21e";
  assert.ok(checkBuildToolchain(f).some((message) => message.includes("JDK 17 or newer")));
});

test("an image for another SDK is rejected even with a suitable JDK", () => {
  const f = fixture();
  f.eas.build.production.android.image = "ubuntu-26.04-jdk-17-ndk-r27b-sdk-58";
  assert.ok(checkBuildToolchain(f).some((message) => message.includes("declared Expo SDK 57")));
});

test("embedded and separate production routes cannot select different runtimes", () => {
  const f = fixture();
  f.config.extra.easConfig.build.production.node = "20.19.4";
  assert.ok(checkBuildToolchain(f).some((message) => message.includes("disagree on node")));
});

test("pnpm cannot drift from the verified workspace toolchain", () => {
  const f = fixture();
  f.eas.build.production.pnpm = "8.7.5";
  assert.ok(checkBuildToolchain(f).some((message) => message.includes("verified local version")));
});

test("a missing embedded profile produces a clear preflight error", () => {
  const f = fixture();
  delete f.config.extra.easConfig.build.production;
  assert.ok(checkBuildToolchain(f).some((message) => message.includes("build profile is missing")));
});
