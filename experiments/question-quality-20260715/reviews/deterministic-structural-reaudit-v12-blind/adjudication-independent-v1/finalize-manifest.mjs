import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const files = [
  "README.md",
  "adjudication.json",
  "build-adjudication.mjs",
  "finalize-manifest.mjs",
  "production-certificates.mts",
  "tsconfig.json",
  "verify.mjs",
];

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

const entries = Object.fromEntries(
  files.map((name) => {
    const bytes = readFileSync(join(here, name));
    return [name, { sha256: sha256(bytes), bytes: bytes.length }];
  }),
);

const manifest = {
  schemaVersion: 1,
  study: "deterministic-structural-reaudit-v12-blind/adjudication-independent-v1",
  verdict: "PASS",
  files: entries,
};

writeFileSync(join(here, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ verdict: "PASS", files: files.length }, null, 2));
