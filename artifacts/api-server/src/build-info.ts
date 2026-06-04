/**
 * Post-deploy verification that the live site is actually serving the
 * freshly-built web bundle (and that this deploy actually re-ran the export).
 *
 * The deploy build runs:
 *   npx expo export -p web --output-dir static-build && npm run server:build
 *
 * Then this server starts. Risks we want to catch:
 *   1. The Expo export silently failed / was skipped, so static-build/* is
 *      stale from a previous deploy.
 *   2. The Express static handler is pointing at the wrong directory.
 *   3. A CDN / proxy in front is serving a cached older HTML.
 *
 * How it works (two independent checks):
 *
 *   A. **Freshness check** (catches risk #1)
 *      Compare the mtime of `static-build/index.html` (rewritten by every
 *      `expo export`) against `server_dist/index.js` (rewritten by every
 *      `npm run server:build`). The deploy build runs both back-to-back,
 *      so they should be ~seconds apart. If index.html is meaningfully
 *      OLDER than server_dist/index.js, the export step was skipped/failed
 *      this deploy → loud failure banner.
 *
 *   B. **Serve-what's-on-disk check** (catches risks #2 and #3)
 *      ensureBuildInfo() fingerprints static-build/index.html and exposes
 *      the fingerprint via /api/build-info plus a <meta name="build-id">
 *      tag injected into index.html. After listen(), runDeployVerification()
 *      fetches both back via HTTP (locally and via the public domain) and
 *      compares to the on-disk fingerprint. Mismatch → loud failure banner.
 *
 * Hashing is canonical: we strip the meta tag before hashing, so the hash
 * doesn't churn just because we mutate the HTML to inject the meta tag.
 *
 * The fingerprint itself is built from the Expo entry script filename
 * (which already contains a content hash Expo computes at export time —
 * an immutable build-time signal) plus the canonical sha256 of index.html.
 */
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

export interface BuildInfo {
  buildId: string;
  builtAt: string;
  indexHash: string;
  entryScript: string;
  exportedAt: string;
  serverBuiltAt: string | null;
  gitSha: string | null;
  freshness: "fresh" | "stale" | "unknown";
}

const STATIC_DIR = path.resolve(process.cwd(), "static-build");
const INDEX_HTML = path.join(STATIC_DIR, "index.html");
const BUILD_INFO_FILE = path.join(STATIC_DIR, "build-info.json");
const SERVER_DIST_INDEX = path.resolve(process.cwd(), "server_dist", "index.js");

// If index.html is more than this many ms older than server_dist/index.js,
// we treat the export as having been skipped this deploy.
const FRESHNESS_TOLERANCE_MS = 5 * 60 * 1000; // 5 minutes — generous

let cached: BuildInfo | null = null;
let freshnessFailureMsg: string | null = null;

const META_TAG_RE = /\s*<meta\s+name=["']build-id["'][^>]*\/?>\s*/i;

function canonicalize(html: string): string {
  // Strip our injected meta tag (and any surrounding whitespace) so re-injecting
  // it later doesn't change the hash. Also strip leading whitespace before <meta>
  // we add ourselves.
  return html.replace(META_TAG_RE, "");
}

function fingerprintCanonical(html: string): {
  indexHash: string;
  entryScript: string | null;
} {
  const canonical = canonicalize(html);
  const indexHash = crypto.createHash("sha256").update(canonical).digest("hex").slice(0, 16);
  const entryMatch = canonical.match(/\/_expo\/static\/js\/web\/entry-[a-f0-9]+\.js/);
  return { indexHash, entryScript: entryMatch ? entryMatch[0] : null };
}

function safeMtimeMs(p: string): number | null {
  try {
    return fs.statSync(p).mtimeMs;
  } catch {
    return null;
  }
}

/**
 * Check whether static-build/index.html was actually refreshed during this
 * deploy by comparing its mtime to server_dist/index.js (which is refreshed
 * by every `npm run server:build` in the deploy build chain).
 *
 * Returns "fresh" if both timestamps exist and index.html is not meaningfully
 * older than the server bundle; "stale" if index.html is older by more than
 * FRESHNESS_TOLERANCE_MS; "unknown" if we can't tell (e.g. server_dist/index.js
 * is missing — typical in dev where esbuild hasn't run).
 */
function checkFreshness(): {
  state: "fresh" | "stale" | "unknown";
  exportedAt: number | null;
  serverBuiltAt: number | null;
  message: string | null;
} {
  const exportedAt = safeMtimeMs(INDEX_HTML);
  const serverBuiltAt = safeMtimeMs(SERVER_DIST_INDEX);
  if (exportedAt == null || serverBuiltAt == null) {
    return { state: "unknown", exportedAt, serverBuiltAt, message: null };
  }
  const ageDelta = serverBuiltAt - exportedAt;
  if (ageDelta > FRESHNESS_TOLERANCE_MS) {
    const minutes = Math.round(ageDelta / 60000);
    return {
      state: "stale",
      exportedAt,
      serverBuiltAt,
      message:
        `static-build/index.html is ${minutes}m older than server_dist/index.js — ` +
        `the deploy built the server but did not refresh the web export. ` +
        `static-build/* is stale from a previous deploy.`,
    };
  }
  return { state: "fresh", exportedAt, serverBuiltAt, message: null };
}

/**
 * Read static-build/index.html, fingerprint its canonical content, ensure the
 * meta tag is present, and (re)write static-build/build-info.json. Idempotent
 * — running multiple times produces the same buildId for unchanged content.
 *
 * Returns null when there's no static-build/index.html — typical in dev where
 * Metro serves the web bundle dynamically and there's nothing to verify.
 */
export function ensureBuildInfo(): BuildInfo | null {
  freshnessFailureMsg = null;

  if (!fs.existsSync(INDEX_HTML)) {
    freshnessFailureMsg =
      `static-build/index.html is missing — the web export did not produce any ` +
      `output for this deploy. The site cannot serve the freshly-built bundle.`;
    cached = null;
    return null;
  }

  const html = fs.readFileSync(INDEX_HTML, "utf-8");
  const { indexHash, entryScript } = fingerprintCanonical(html);

  if (!entryScript) {
    freshnessFailureMsg =
      `static-build/index.html does not contain an Expo entry script — ` +
      `the web export looks broken or incomplete.`;
    cached = null;
    return null;
  }

  const freshness = checkFreshness();
  if (freshness.state === "stale" && freshness.message) {
    freshnessFailureMsg = freshness.message;
  }

  const exportedAtIso =
    freshness.exportedAt != null ? new Date(freshness.exportedAt).toISOString() : "unknown";
  const serverBuiltAtIso =
    freshness.serverBuiltAt != null ? new Date(freshness.serverBuiltAt).toISOString() : null;

  // buildId is derived deterministically from the immutable build-time signals:
  // the Expo entry script filename hash + the canonical index.html hash + the
  // export mtime. Re-running ensureBuildInfo on unchanged content always
  // produces the same buildId.
  const idSource = `${entryScript}|${indexHash}|${exportedAtIso}`;
  const buildId = crypto.createHash("sha256").update(idSource).digest("hex").slice(0, 16);

  const buildInfo: BuildInfo = {
    buildId,
    builtAt: exportedAtIso,
    indexHash,
    entryScript,
    exportedAt: exportedAtIso,
    serverBuiltAt: serverBuiltAtIso,
    gitSha: process.env.REPL_COMMIT_SHA || process.env.GIT_COMMIT || null,
    freshness: freshness.state,
  };

  // Only rewrite build-info.json if it actually changed (avoids needless mtime churn).
  let needsWrite = true;
  if (fs.existsSync(BUILD_INFO_FILE)) {
    try {
      const existing = JSON.parse(fs.readFileSync(BUILD_INFO_FILE, "utf-8")) as BuildInfo;
      if (existing.buildId === buildInfo.buildId && existing.freshness === buildInfo.freshness) {
        needsWrite = false;
      }
    } catch {
      // fall through
    }
  }
  if (needsWrite) {
    fs.writeFileSync(BUILD_INFO_FILE, JSON.stringify(buildInfo, null, 2) + "\n");
  }

  // Inject (or refresh) the meta tag in index.html so SPA fallback exposes the build-id.
  const metaTag = `<meta name="build-id" content="${buildInfo.buildId}" data-built-at="${buildInfo.builtAt}" />`;
  const stripped = html.replace(META_TAG_RE, "");
  const nextHtml = stripped.replace(/<head>/i, `<head>\n    ${metaTag}`);
  if (nextHtml !== html) {
    try {
      // Preserve the original mtime so our freshness check stays accurate.
      const origMtime =
        freshness.exportedAt != null ? new Date(freshness.exportedAt) : null;
      fs.writeFileSync(INDEX_HTML, nextHtml);
      if (origMtime) {
        try {
          fs.utimesSync(INDEX_HTML, origMtime, origMtime);
        } catch {
          // best-effort
        }
      }
    } catch (err) {
      console.error(
        `[deploy-verify] WARNING: could not write meta tag into index.html (${(err as Error).message}). ` +
        `/api/build-info will still work; only the SPA-HTML cross-check will be skipped.`,
      );
    }
  }

  cached = buildInfo;
  console.log(
    `[deploy-verify] Build fingerprint: id=${buildInfo.buildId} ` +
    `entry=${buildInfo.entryScript} exportedAt=${buildInfo.builtAt} freshness=${buildInfo.freshness}`,
  );
  return buildInfo;
}

export function getBuildInfo(): BuildInfo | null {
  return cached;
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "cache-control": "no-cache" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

function loudBanner(title: string, lines: string[]): void {
  const banner = "=".repeat(64);
  console.error(`\n${banner}`);
  console.error(`[deploy-verify] ✗ ${title}`);
  for (const l of lines) console.error(`[deploy-verify]   - ${l}`);
  console.error(
    `[deploy-verify] The live site may be serving an outdated website. ` +
    `Re-run the deploy or investigate the build pipeline before customers notice.`,
  );
  console.error(`${banner}\n`);
}

/**
 * Cross-check the live site is serving the same build-id we have on disk,
 * AND that the disk was actually refreshed during this deploy.
 *
 * `localBaseUrl` (e.g. http://127.0.0.1:5000) verifies the in-process server.
 * `publicBaseUrl` optionally also verifies through any CDN/proxy.
 */
export async function runDeployVerification(opts: {
  localBaseUrl: string;
  publicBaseUrl?: string | null;
}): Promise<boolean> {
  const info = cached;

  // Freshness failure trumps everything — the bundle on disk is from a
  // previous deploy, so even if "live matches local disk" the customer is
  // seeing yesterday's website.
  if (freshnessFailureMsg) {
    loudBanner("DEPLOY DID NOT SHIP A FRESH WEBSITE", [freshnessFailureMsg]);
    return false;
  }

  if (!info) {
    console.log(`[deploy-verify] Skipped — no build fingerprint available.`);
    return true;
  }

  const targets: Array<{ label: string; url: string }> = [
    { label: "local", url: opts.localBaseUrl },
  ];
  if (opts.publicBaseUrl && opts.publicBaseUrl !== opts.localBaseUrl) {
    targets.push({ label: "public", url: opts.publicBaseUrl });
  }

  // Both local and public failures count as deploy verification failures.
  // To absorb LB warm-up jitter on the public domain, we retry public-domain
  // checks a few times before giving up. Local checks have no such jitter.
  let allOk = true;
  const failures: string[] = [];

  const recordFail = (msg: string) => {
    allOk = false;
    failures.push(msg);
  };

  for (const target of targets) {
    const maxAttempts = target.label === "public" ? 4 : 1;
    const attemptDelayMs = 5000;
    const targetFailures: string[] = await runChecksForTarget(target, info, maxAttempts, attemptDelayMs);
    for (const f of targetFailures) recordFail(f);
  }

  if (allOk) {
    console.log(
      `[deploy-verify] ✓ Live site is serving build ${info.buildId} ` +
      `(verified via ${targets.map((t) => t.label).join(" + ")}).`,
    );
    return true;
  }

  loudBanner(`DEPLOY VERIFICATION FAILED (expected buildId=${info.buildId})`, failures);
  return false;
}

async function runChecksForTarget(
  target: { label: string; url: string },
  info: BuildInfo,
  maxAttempts: number,
  attemptDelayMs: number,
): Promise<string[]> {
  let attempt = 0;
  let lastFailures: string[] = [];
  while (attempt < maxAttempts) {
    attempt++;
    lastFailures = [];
    await runOneCheckPass(target, info, lastFailures);
    if (lastFailures.length === 0) return [];
    if (attempt < maxAttempts) {
      console.warn(
        `[deploy-verify] [${target.label}] check attempt ${attempt}/${maxAttempts} ` +
        `had ${lastFailures.length} failure(s); retrying in ${attemptDelayMs}ms…`,
      );
      await new Promise((r) => setTimeout(r, attemptDelayMs));
    }
  }
  return lastFailures;
}

async function runOneCheckPass(
  target: { label: string; url: string },
  info: BuildInfo,
  failures: string[],
): Promise<void> {
  const recordFail = (msg: string) => failures.push(msg);

  try {
    const apiText = await fetchText(`${target.url}/api/build-info`);
    const remote = JSON.parse(apiText) as BuildInfo;
    if (remote.buildId !== info.buildId) {
      recordFail(
        `[${target.label}] /api/build-info served buildId=${remote.buildId}, expected ${info.buildId}`,
      );
    }
  } catch (err) {
    recordFail(`[${target.label}] /api/build-info fetch failed: ${(err as Error).message}`);
  }

  // Hit an unused SPA path so the production catch-all serves
  // static-build/index.html (rather than the landing page template at "/").
  try {
    const html = await fetchText(`${target.url}/__deploy_verify__`);
    const meta = html.match(/<meta\s+name=["']build-id["']\s+content=["']([^"']+)["']/i);
    if (!meta) {
      recordFail(
        `[${target.label}] SPA fallback HTML has no <meta name="build-id"> tag — the ` +
        `static handler is probably serving a stale index.html (or the wrong file).`,
      );
    } else if (meta[1] !== info.buildId) {
      recordFail(
        `[${target.label}] SPA fallback meta build-id=${meta[1]}, expected ${info.buildId} — stale bundle being served.`,
      );
    }
  } catch (err) {
    recordFail(`[${target.label}] SPA fallback fetch failed: ${(err as Error).message}`);
  }

  // Confirm the actual JS bundle referenced by the fresh index.html is reachable.
  // Catches cases where index.html is fresh but the entry-<hash>.js wasn't copied.
  try {
    const res = await fetch(`${target.url}${info.entryScript}`, {
      method: "HEAD",
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      recordFail(
        `[${target.label}] entry bundle ${info.entryScript} returned HTTP ${res.status} — ` +
        `the freshly-built JS bundle is not being served.`,
      );
    }
  } catch (err) {
    recordFail(`[${target.label}] entry bundle fetch failed: ${(err as Error).message}`);
  }
}

/** Best-effort public base URL for cross-checking through any CDN/proxy. */
export function detectPublicBaseUrl(): string | null {
  const candidates = [
    process.env.REPLIT_DEPLOYMENT_DOMAIN,
    process.env.REPLIT_DOMAINS && process.env.REPLIT_DOMAINS.split(",")[0].trim(),
  ].filter(Boolean) as string[];
  if (!candidates.length) return null;
  const host = candidates[0].replace(/^https?:\/\//, "").replace(/\/$/, "");
  return `https://${host}`;
}
