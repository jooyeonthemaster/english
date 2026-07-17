import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const results = JSON.parse(readFileSync(path.join(HERE, "results.json"), "utf8"));
const files = [
  "README.md",
  "audit.test.mjs",
  "build-corpus.mjs",
  "chronology.json",
  "corpus.json",
  "corpus.seal.json",
  "finalize-manifest.mjs",
  "oracle.json",
  "report.md",
  "results.json",
  "run-audit.mts",
  "tsconfig.json",
  "verify.mjs",
];

const sha256 = (value) =>
  createHash("sha256").update(value).digest("hex");

const manifest = {
  schemaVersion: 1,
  auditId: "deterministic-structural-reaudit-v11-fresh",
  finalizedOn: "2026-07-15",
  constraints: {
    networkCalls: 0,
    apiCalls: 0,
    databaseCalls: 0,
    generationCalls: 0,
    productionSourceModified: false,
    syntheticPublicDataOnly: true,
  },
  verdict: results.verdict,
  caseCount: results.corpusSummary.caseCount,
  familyCount: results.corpusSummary.familyCount,
  sealedInputs: results.sealedInputs,
  productionSourceSnapshot: results.productionSourceSnapshot,
  files: Object.fromEntries(
    files.map((name) => [
      name,
      {
        bytes: readFileSync(path.join(HERE, name)).byteLength,
        sha256: sha256(readFileSync(path.join(HERE, name))),
      },
    ]),
  ),
  commands: {
    buildAndSeal: "node build-corpus.mjs",
    evaluate: "npx tsx run-audit.mts",
    finalize: "node finalize-manifest.mjs",
    verify: "node verify.mjs",
    typecheck: "npx tsc -p tsconfig.json --noEmit",
    lint:
      "npx eslint build-corpus.mjs run-audit.mts finalize-manifest.mjs verify.mjs audit.test.mjs",
    test: "node --test audit.test.mjs",
  },
};

writeFileSync(
  path.join(HERE, "manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n",
  "utf8",
);
process.stdout.write(
  JSON.stringify({
    status: "manifest-finalized",
    verdict: manifest.verdict,
    fileCount: Object.keys(manifest.files).length,
  }) + "\n",
);
