import { build } from "esbuild";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";

const temp = await mkdtemp(path.join(process.cwd(), ".membership-catalog-check-"));
try {
  const output = path.join(temp, "catalog.mjs");
  await build({
    entryPoints: ["src/validate-membership-catalog.ts"], outfile: output,
    bundle: true, platform: "node", format: "esm",
    external: ["pg", "drizzle-orm", "drizzle-zod", "zod"],
  });
  process.exitCode = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [output], { stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", code => resolve(code ?? 1));
  });
} finally {
  await rm(temp, { recursive: true, force: true });
}
