import { build } from "esbuild";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";

const directory = await mkdtemp(path.join(process.cwd(), ".banner-schema-test-"));
try {
  const output = path.join(directory, "banner-schema.test.mjs");
  await build({
    entryPoints: [process.argv[2] ?? "src/banner-schema.test.ts"],
    bundle: true,
    format: "esm",
    platform: "node",
    outfile: output,
    external: ["drizzle-orm", "drizzle-zod", "zod"],
  });
  process.exitCode = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--test", output], { stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
} finally {
  await rm(directory, { recursive: true, force: true });
}
