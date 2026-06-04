#!/usr/bin/env node
/**
 * Verifies that a deployed site is serving the freshly-built web bundle.
 *
 * Usage:
 *   node scripts/verify-deploy.js                           # uses REPLIT_DEPLOYMENT_DOMAIN / etc
 *   node scripts/verify-deploy.js https://the147bradford.replit.app
 *
 * Exits 0 if the live site's build-id matches static-build/build-info.json,
 * non-zero (with a loud message) otherwise.
 */
const fs = require("fs");
const path = require("path");

const BUILD_INFO_PATH = path.resolve(process.cwd(), "static-build", "build-info.json");

function pickUrl() {
  const fromArg = process.argv[2];
  if (fromArg) return fromArg.replace(/\/$/, "");
  const candidates = [
    process.env.REPLIT_DEPLOYMENT_DOMAIN,
    process.env.REPLIT_DOMAINS && process.env.REPLIT_DOMAINS.split(",")[0].trim(),
    process.env.REPLIT_DEV_DOMAIN,
    process.env.EXPO_PUBLIC_DOMAIN,
  ].filter(Boolean);
  if (!candidates.length) return null;
  const host = candidates[0].replace(/^https?:\/\//, "").replace(/\/$/, "");
  return `https://${host}`;
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { "cache-control": "no-cache" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.text();
}

async function main() {
  if (!fs.existsSync(BUILD_INFO_PATH)) {
    console.error(`[verify-deploy] No static-build/build-info.json found — run the build first.`);
    process.exit(2);
  }
  const local = JSON.parse(fs.readFileSync(BUILD_INFO_PATH, "utf-8"));
  const baseUrl = pickUrl();
  if (!baseUrl) {
    console.error(`[verify-deploy] No URL available. Pass one as an argument.`);
    process.exit(2);
  }

  console.log(`[verify-deploy] Local build-id:  ${local.buildId}`);
  console.log(`[verify-deploy] Checking:        ${baseUrl}`);

  const failures = [];

  try {
    const apiText = await fetchText(`${baseUrl}/api/build-info`);
    const remote = JSON.parse(apiText);
    if (remote.buildId !== local.buildId) {
      failures.push(
        `/api/build-info reports buildId="${remote.buildId}" but local build is "${local.buildId}"`,
      );
    } else {
      console.log(`[verify-deploy] /api/build-info OK (${remote.buildId})`);
    }
  } catch (err) {
    failures.push(`Could not fetch /api/build-info: ${err.message}`);
  }

  // Hit an unused SPA path — production catch-all serves static-build/index.html.
  try {
    const html = await fetchText(`${baseUrl}/__deploy_verify__`);
    const meta = html.match(/<meta\s+name=["']build-id["']\s+content=["']([^"']+)["']/i);
    if (!meta) {
      failures.push(
        `SPA fallback HTML has no <meta name="build-id"> tag — the server is probably ` +
        `serving an old index.html (or the wrong file).`,
      );
    } else if (meta[1] !== local.buildId) {
      failures.push(
        `SPA fallback meta build-id="${meta[1]}" but local build is "${local.buildId}" — ` +
        `live site is serving a stale bundle.`,
      );
    } else {
      console.log(`[verify-deploy] SPA fallback meta tag OK (${meta[1]})`);
    }
  } catch (err) {
    failures.push(`Could not fetch SPA fallback: ${err.message}`);
  }

  // Confirm the JS bundle referenced by the fresh index.html is reachable.
  if (local.entryScript) {
    try {
      const res = await fetch(`${baseUrl}${local.entryScript}`, {
        method: "HEAD",
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        failures.push(`entry bundle ${local.entryScript} returned HTTP ${res.status}`);
      } else {
        console.log(`[verify-deploy] entry bundle reachable (${local.entryScript})`);
      }
    } catch (err) {
      failures.push(`entry bundle fetch failed: ${err.message}`);
    }
  }

  if (failures.length) {
    console.error(`\n========================================`);
    console.error(`[verify-deploy] DEPLOY VERIFICATION FAILED`);
    console.error(`========================================`);
    for (const f of failures) console.error(`  ✗ ${f}`);
    console.error(`========================================\n`);
    process.exit(1);
  }

  console.log(`\n[verify-deploy] ✓ Live site is serving the freshly-built bundle.`);
}

main().catch((err) => {
  console.error(`[verify-deploy] unexpected error: ${err.stack || err.message}`);
  process.exit(1);
});
