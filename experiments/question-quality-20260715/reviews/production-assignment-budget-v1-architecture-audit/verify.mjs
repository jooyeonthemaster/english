import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../../../");
const manifest = JSON.parse(
  await readFile(resolve(here, "source-manifest.json"), "utf8"),
);

let failed = false;
for (const item of manifest.sources) {
  const bytes = await readFile(resolve(repo, item.path));
  const hash = createHash("sha256").update(bytes).digest("hex");
  const ok = hash === item.sha256 && bytes.byteLength === item.bytes;
  console.log(`${ok ? "PASS" : "FAIL"} ${item.path}`);
  if (!ok) {
    failed = true;
    console.log(`  expected ${item.sha256} / ${item.bytes}`);
    console.log(`  actual   ${hash} / ${bytes.byteLength}`);
  }
}

if (failed) process.exitCode = 1;
else console.log(`PASS ${manifest.sources.length} source hashes`);
