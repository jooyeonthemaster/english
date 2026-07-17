import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..", "..", "..");
const read = (name) => readFileSync(path.join(HERE, name), "utf8");
const parse = (name) => JSON.parse(read(name));
const sha256 = (value) =>
  createHash("sha256").update(value).digest("hex");

const corpus = parse("corpus.json");
const oracle = parse("oracle.json");
const seal = parse("corpus.seal.json");
const results = parse("results.json");
const chronology = parse("chronology.json");
const manifest = parse("manifest.json");

assert.equal(sha256(read("corpus.json")), seal.sha256["corpus.json"]);
assert.equal(sha256(read("oracle.json")), seal.sha256["oracle.json"]);
assert.equal(
  sha256(readFileSync(path.join(HERE, "build-corpus.mjs"))),
  seal.sha256["build-corpus.mjs"],
);
assert.ok(corpus.caseCount >= 240, "minimum holdout size");
assert.equal(corpus.caseCount, corpus.cases.length);
assert.equal(oracle.caseCount, oracle.entries.length);
assert.equal(corpus.caseCount, oracle.caseCount);
assert.equal(
  oracle.classBalance.expectedValid,
  oracle.classBalance.expectedInvalid,
  "class balance",
);
assert.equal(
  new Set(corpus.cases.map((item) => item.caseId)).size,
  corpus.caseCount,
  "unique case ids",
);

const oracleById = new Map(oracle.entries.map((entry) => [entry.caseId, entry]));
const pairs = new Map();
for (const auditCase of corpus.cases) {
  assert.ok(oracleById.has(auditCase.caseId), "oracle coverage");
  const list = pairs.get(auditCase.pairId) ?? [];
  list.push(oracleById.get(auditCase.caseId));
  pairs.set(auditCase.pairId, list);
}
for (const [pairId, entries] of pairs) {
  assert.equal(entries.length, 2, "pair cardinality " + pairId);
  assert.deepEqual(
    entries.map((entry) => entry.expectedValid).sort(),
    [false, true],
    "pair balance " + pairId,
  );
}

assert.equal(results.sealedInputs.corpusSha256, seal.sha256["corpus.json"]);
assert.equal(results.sealedInputs.oracleSha256, seal.sha256["oracle.json"]);
assert.ok(
  chronology.steps.findIndex(
    (step) => step.name === "sealed-input-hashes-verified",
  ) <
    chronology.steps.findIndex(
      (step) => step.name === "production-validator-dynamically-imported",
    ),
  "seal verification precedes validator import",
);
assert.ok(Object.values(chronology.sealChecks).every(Boolean));

for (const [relativePath, expectedHash] of Object.entries(
  results.productionSourceSnapshot,
)) {
  assert.equal(
    sha256(readFileSync(path.join(REPO_ROOT, relativePath))),
    expectedHash,
    "production source drift: " + relativePath,
  );
}

const matrix = { tp: 0, tn: 0, fp: 0, fn: 0 };
for (const row of results.cases) {
  if (!row.expectedValid && !row.predictedValid) matrix.tp += 1;
  else if (row.expectedValid && row.predictedValid) matrix.tn += 1;
  else if (row.expectedValid && !row.predictedValid) matrix.fp += 1;
  else matrix.fn += 1;
}
for (const key of ["tp", "tn", "fp", "fn"]) {
  assert.equal(matrix[key], results.confusionMatrix.blocking[key]);
}

for (const [name, metadata] of Object.entries(manifest.files)) {
  const bytes = readFileSync(path.join(HERE, name));
  assert.equal(bytes.byteLength, metadata.bytes, "byte count " + name);
  assert.equal(sha256(bytes), metadata.sha256, "manifest hash " + name);
}
assert.equal(manifest.caseCount, corpus.caseCount);
assert.equal(manifest.verdict, results.verdict);
assert.equal(manifest.constraints.networkCalls, 0);
assert.equal(manifest.constraints.apiCalls, 0);
assert.equal(manifest.constraints.databaseCalls, 0);
assert.equal(manifest.constraints.generationCalls, 0);

const publicArtifactNames = [...Object.keys(manifest.files), "manifest.json"];
const publicText = publicArtifactNames
  .filter((name) => /\.(?:json|md|mjs|mts|txt)$/.test(name))
  .map((name) => read(name))
  .join("\n");
const secretPatterns = [
  /AIza[0-9A-Za-z_-]{20,}/,
  /\bsk-[0-9A-Za-z_-]{20,}/,
  /postgres(?:ql)?:\/\/[^\s"']+/i,
  /\b(?:GEMINI_API_KEY|DATABASE_URL)\s*=/,
];
for (const pattern of secretPatterns) {
  assert.equal(pattern.test(publicText), false, "secret-like material: " + pattern);
}
assert.equal(
  /"passageId"\s*:|"examPassageId"\s*:|"academyId"\s*:/i.test(publicText),
  false,
  "production identifier-shaped fields",
);

process.stdout.write(
  JSON.stringify({
    status: "verified",
    verdict: results.verdict,
    caseCount: corpus.caseCount,
    familyCount: corpus.familyCount,
    corpusSha256: seal.sha256["corpus.json"],
    oracleSha256: seal.sha256["oracle.json"],
    blocking: results.confusionMatrix.blocking,
    exactTarget: results.confusionMatrix.exactTarget,
  }) + "\n",
);
