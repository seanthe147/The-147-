import { build } from "esbuild";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";

const temp = await mkdtemp(path.join(process.cwd(), ".membership-billing-test-"));
try {
  const output = path.join(temp, "membership-billing.test.mjs");
  await build({
    entryPoints: ["src/membership-billing.test.ts"], outfile: output,
    bundle: true, platform: "node", format: "esm",
    external: ["express", "pg", "drizzle-orm", "drizzle-zod", "zod"],
  });
  process.exitCode = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--test", "--test-force-exit", output], {
      stdio: "inherit", env: process.env,
    });
    child.once("error", reject);
    child.once("exit", code => resolve(code ?? 1));
  });
} finally {
  await rm(temp, { recursive: true, force: true });
}
