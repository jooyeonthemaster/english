import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const files = [
  "README.md",
  "audit.json",
  "finalize-manifest.mjs",
  "run-audit.mts",
  "tsconfig.json",
  "verify.mjs",
].sort((a, b) => a.localeCompare(b));

const entries = Object.fromEntries(
  files.map((name) => {
    const bytes = readFileSync(join(here, name));
    return [
      name,
      {
        sha256: createHash("sha256").update(bytes).digest("hex"),
        bytes: bytes.byteLength,
      },
    ];
  }),
);
const aggregatePayload = files
  .map((name) => `${name}\0${entries[name].sha256}\0${entries[name].bytes}\n`)
  .join("");
const manifest = {
  schemaVersion: 1,
  study: "deterministic-structural-v12-remediation-independent-v1",
  finalizedDate: "2026-07-15",
  files: entries,
  aggregateSha256: createHash("sha256").update(aggregatePayload).digest("hex"),
};
writeFileSync(join(here, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ aggregateSha256: manifest.aggregateSha256, files: files.length }));
