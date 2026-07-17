import { createHash } from "node:crypto";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const files = [
  "README.md",
  "REPORT.md",
  "build-corpus.mjs",
  "run-audit.mts",
  "audit.test.mjs",
  "verify.mjs",
  "finalize-manifest.mjs",
  "tsconfig.json",
  "corpus.json",
  "oracle.json",
  "seal.json",
  "results.json",
];

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const entries = Object.fromEntries(files.map((name) => {
  const path = join(here, name);
  return [name, { sha256: sha256(readFileSync(path)), bytes: statSync(path).size }];
}));
const seal = JSON.parse(readFileSync(join(here, "seal.json"), "utf8"));
const results = JSON.parse(readFileSync(join(here, "results.json"), "utf8"));
const manifest = {
  schemaVersion: 1,
  study: "deterministic-structural-reaudit-v12-blind",
  verdict: results.verdict,
  caseCount: seal.caseCount,
  familyCount: seal.familyCount,
  corpusSha256: seal.corpusSha256,
  oracleSha256: seal.oracleSha256,
  files: entries,
};
writeFileSync(join(here, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`MANIFEST files=${files.length} sha256=${sha256(readFileSync(join(here, "manifest.json")))}`);
