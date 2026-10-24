const assert = require("node:assert/strict");
const { createRequire } = require("node:module");
const path = require("node:path");
const { test } = require("node:test");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");

const root = path.resolve(__dirname, "..");
const mobileRequire = createRequire(path.join(root, "artifacts/the-147/package.json"));
const cliRequire = createRequire(mobileRequire.resolve("@expo/cli/package.json"));
const forge = cliRequire("node-forge");
const keys = forge.pki.rsa.generateKeyPair({ bits: 1024, e: 65537 });

function digestInfo(hash, parameters = true) {
  const { asn1 } = forge;
  const algorithm = [
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OID, false,
      asn1.oidToDer(forge.oids.sha256).getBytes()),
  ];
  if (parameters) {
    algorithm.push(asn1.create(asn1.Class.UNIVERSAL, asn1.Type.NULL, false, ""));
  }
  return asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, algorithm),
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OCTETSTRING, false, hash),
  ]);
}

function signStructure(info) {
  return forge.pki.rsa.encrypt(forge.asn1.toDer(info).getBytes(), keys.privateKey, 0x01);
}

test("node-forge accepts valid SHA-256 signatures with and without NULL parameters", () => {
  const digest = forge.md.sha256.create().update("security regression").digest().getBytes();
  for (const parameters of [true, false]) {
    assert.equal(keys.publicKey.verify(digest, signStructure(digestInfo(digest, parameters))), true);
  }
  const md = forge.md.sha256.create().update("normal signing");
  const signature = keys.privateKey.sign(md);
  assert.equal(keys.publicKey.verify(md.digest().getBytes(), signature), true);
  assert.equal(keys.publicKey.verify(forge.md.sha256.create().update("tampered").digest().getBytes(),
    signature), false);
});

test("node-forge rejects extra nested DigestAlgorithm elements (CVE-2026-85393)", () => {
  const digest = forge.md.sha256.create().update("nested garbage").digest().getBytes();
  const info = digestInfo(digest);
  info.value[0].value.push(forge.asn1.create(
    forge.asn1.Class.UNIVERSAL, forge.asn1.Type.OCTETSTRING, false, "garbage"));
  assert.throws(() => keys.publicKey.verify(digest, signStructure(info)), /DigestInfo/);
});

test("node-forge rejects nonempty NULL algorithm parameters", () => {
  const digest = forge.md.sha256.create().update("invalid NULL").digest().getBytes();
  const info = digestInfo(digest);
  info.value[0].value[1].value = "garbage";
  assert.throws(() => keys.publicKey.verify(digest, signStructure(info)), /DigestInfo/);
});

// Check every active Metro version in pnpm's installation lockfile, not stale
// package directories left behind by previous installs.
const lock = fs.readFileSync(path.join(root, "node_modules/.pnpm/lock.yaml"), "utf8");
const metroVersions = [...new Set([...lock.matchAll(/^  metro@(0\.\d+\.\d+)(?:\(|:)/gm)]
  .map((match) => match[1]))];
assert.ok(metroVersions.length > 0, "Expected at least one installed Metro version");

for (const version of metroVersions) {
  test(`Metro ${version} reads PNG/SVG assets with the patched image-size API`, async () => {
    const legacyMetro = version.startsWith("0.83.");
    const activePatch = lock.match(new RegExp(`  metro@${version.replaceAll(".", "\\.")}:\\n    hash: ([a-f0-9]+)`));
    if (legacyMetro) assert.ok(activePatch, `Expected patched Metro ${version}`);
    const packageDir = activePatch
      ? `metro@${version}_patch_hash=${activePatch[1]}`
      : `metro@${version}`;
    const metroDir = path.join(root, "node_modules/.pnpm", packageDir, "node_modules/metro");
    const metroRequire = createRequire(path.join(metroDir, "package.json"));
    if (legacyMetro) {
      const imagePackage = path.resolve(metroDir, "../image-size/package.json");
      assert.equal(JSON.parse(fs.readFileSync(imagePackage, "utf8")).version, "2.0.4");
    }
    const { getAssetSize, getAssetData } = metroRequire("./src/Assets.js");
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
      "base64");
    assert.deepEqual(getAssetSize("png", png, "pixel.png"), { width: 1, height: 1 });
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="16"/>');
    assert.deepEqual(getAssetSize("svg", svg, "icon.svg"), { width: 32, height: 16 });
    assert.throws(() => getAssetSize("png", Buffer.alloc(0), "empty.png"), /empty/);
    const assetDir = fs.mkdtempSync(path.join(os.tmpdir(), "metro-security-"));
    try {
      const assetPath = path.join(assetDir, "pixel.png");
      fs.writeFileSync(assetPath, png);
      const assetData = await getAssetData(assetPath, "", [], "web", "/assets");
      assert.equal(assetData.width, 1);
      assert.equal(assetData.height, 1);
      assert.deepEqual(assetData.files, [assetPath]);
    } finally {
      fs.rmSync(assetDir, { recursive: true, force: true });
    }

    if (!legacyMetro) return; // Modern Metro has its own image reader.

    // Run malformed inputs in a child process so a parser regression fails
    // with a timeout instead of hanging the test runner forever.
    const result = spawnSync(process.execPath, ["-e", `
      const { imageSize } = require(${JSON.stringify(metroRequire.resolve("image-size"))});
      const icns = Buffer.alloc(16);
      icns.write("icns"); icns.writeUInt32BE(16, 4); icns.write("ic07", 8);
      const heif = Buffer.alloc(32);
      heif.writeUInt32BE(24, 0); heif.write("ftyp", 4); heif.write("heic", 8);
      heif.write("heic", 16); heif.write("mif1", 20); heif.write("meta", 28);
      const jxl = Buffer.from([0,0,0,12,74,88,76,32,13,10,135,10,0,0,0,0,106,120,108,99]);
      for (const input of [icns, heif, jxl]) {
        try { imageSize(input); } catch (error) {
          if (!(error instanceof Error)) throw error;
        }
      }
    `], { timeout: 5000, encoding: "utf8" });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
  });
}

test("nodemailer composes an email without external credentials or network access", async () => {
  const apiRequire = createRequire(path.join(root, "artifacts/api-server/package.json"));
  const transport = apiRequire("nodemailer").createTransport({ streamTransport: true, buffer: true });
  const result = await transport.sendMail({
    from: "sender@example.com", to: "recipient@example.com",
    subject: "Security upgrade smoke test", text: "Test message",
  });
  assert.match(result.message.toString(), /Subject: Security upgrade smoke test/);
  assert.match(result.message.toString(), /Test message/);
});
