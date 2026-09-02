import { build } from "esbuild";
import { spawn } from "node:child_process";
import { readdirSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";

const tempDir = await mkdtemp(path.join(process.cwd(), ".staff-fixtures-test-"));
const output = path.join(tempDir, "staff-fixtures-route.test.js");
const nixLibraryDirs = [
  ...(process.env.NIX_LDFLAGS?.match(/(?:^|\s)-L(\S+)/g) ?? []).map((flag) => flag.trim().slice(2)),
  ...readdirSync("/nix/store", { withFileTypes: true })
    .filter((entry) => /-(?:mesa|mesa-libgbm|alsa-lib)-/.test(entry.name))
    .map((entry) => path.join("/nix/store", entry.name, "lib")),
].join(":");
const testEnv = {
  ...process.env,
  ...(nixLibraryDirs
    ? { LD_LIBRARY_PATH: [nixLibraryDirs, process.env.LD_LIBRARY_PATH].filter(Boolean).join(":") }
    : {}),
};

try {
  await build({
    entryPoints: ["src/staff-fixtures-route.test.ts"],
    bundle: true,
    format: "esm",
    platform: "node",
    outdir: tempDir,
    sourcemap: "inline",
    external: [
      "express",
      "compression",
      "cookie-parser",
      "cors",
      "multer",
      "sharp",
      "nodemailer",
      "pg",
      "drizzle-orm",
      "drizzle-zod",
      "zod",
      "jsonwebtoken",
      "stripe",
      "ws",
      "@sentry/node",
      "pino",
      "pino-pretty",
      "thread-stream",
      "playwright",
    ],
  });

  const exitCode = await new Promise((resolveCode, rejectCode) => {
    const child = spawn(process.execPath, ["--test", "--test-force-exit", output], {
      stdio: "inherit",
      env: { ...testEnv, NODE_ENV: "production" },
    });
    child.once("error", rejectCode);
    child.once("exit", (code, signal) => {
      resolveCode(code ?? (signal ? 1 : 0));
    });
  });
  process.exitCode = exitCode;
} finally {
  await rm(tempDir, { recursive: true, force: true });
}