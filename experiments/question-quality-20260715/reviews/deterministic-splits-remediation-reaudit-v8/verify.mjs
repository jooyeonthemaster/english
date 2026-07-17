import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const fileSha = (filePath) => sha256(readFileSync(filePath));
const readJson = (name) =>
  JSON.parse(readFileSync(path.join(here, name), "utf8"));

const manifestPath = path.join(here, "MANIFEST.sha256");
assert.ok(existsSync(manifestPath), "MANIFEST.sha256 is missing");
const manifestLines = readFileSync(manifestPath, "utf8")
  .trim()
  .split(/\r?\n/)
  .filter(Boolean);
const manifestEntries = manifestLines.map((line) => {
  const match = line.match(/^([0-9a-f]{64})  ([^/\\][^\r\n]*)$/);
  assert.ok(match, `invalid manifest line: ${line}`);
  const relative = match[2];
  assert.equal(path.basename(relative), relative, `nested manifest path: ${relative}`);
  assert.notEqual(relative, "MANIFEST.sha256", "manifest must not self-list");
  const full = path.join(here, relative);
  assert.ok(existsSync(full), `missing manifested file: ${relative}`);
  assert.equal(fileSha(full), match[1], `hash drift: ${relative}`);
  return { path: relative, sha256: match[1] };
});
assert.equal(
  new Set(manifestEntries.map((entry) => entry.path)).size,
  manifestEntries.length,
  "duplicate manifest entry",
);

const corpus = readJson("cases.json");
const seal = readJson("blind-seal.json");
const results = readJson("results.json");
const caseResults = readJson("case-results.json");
const novelty = readJson("novelty.json");
const sourceHashes = readJson("source-hashes.json");

assert.equal(seal.phase, "PRE_INSPECTION");
assert.equal(fileSha(path.join(here, "cases.json")), seal.sha256["cases.json"]);
assert.equal(
  fileSha(path.join(here, "blind_corpus_author.py")),
  seal.sha256["blind_corpus_author.py"],
);
assert.equal(
  fileSha(path.join(here, "BLIND_PROTOCOL.md")),
  seal.sha256["BLIND_PROTOCOL.md"],
);

assert.equal(corpus.case_count, 256);
assert.equal(corpus.family_count, 8);
assert.equal(corpus.cases.length, 256);
assert.equal(new Set(corpus.cases.map((entry) => entry.id)).size, 256);
const familyCounts = new Map();
const pairs = new Map();
for (const entry of corpus.cases) {
  const counts = familyCounts.get(entry.family) ?? { normal: 0, defect: 0 };
  counts[entry.control] += 1;
  familyCounts.set(entry.family, counts);
  const pairKey = `${entry.family}\0${entry.pair_id}`;
  const controls = pairs.get(pairKey) ?? [];
  controls.push(entry.control);
  pairs.set(pairKey, controls);
}
assert.equal(familyCounts.size, 8);
for (const [family, counts] of familyCounts) {
  assert.deepEqual(counts, { normal: 16, defect: 16 }, family);
}
for (const [pair, controls] of pairs) {
  assert.deepEqual(controls.sort(), ["defect", "normal"], pair);
}

const roleNormals = corpus.cases.filter(
  (entry) =>
    entry.family === "blank_inference_semantic_role_preservation" &&
    entry.control === "normal",
);
assert.equal(roleNormals.length, 16);
for (const normal of roleNormals) {
  const defect = corpus.cases.find(
    (entry) =>
      entry.family === normal.family &&
      entry.pair_id === normal.pair_id &&
      entry.control === "defect",
  );
  assert.ok(defect, `missing role defect pair ${normal.pair_id}`);
  assert.equal(
    normal.input.correct_answer_text.split(/\s+/).length,
    defect.input.correct_answer_text.split(/\s+/).length,
    `role token mismatch ${normal.pair_id}`,
  );
}

assert.equal(results.verdict, "BLOCK");
assert.deepEqual(results.totals, {
  total: 256,
  pass: 163,
  fail: 93,
  falsePositive: 0,
  falseNegative: 93,
});
assert.deepEqual(results.boundedPassFamilies, [
  "blank_explanation_option_analysis",
  "exact_transformed_answer_residue",
]);
assert.equal(results.blockedFamilies.length, 6);
assert.equal(results.apiCandidatesConsumed, 0);
assert.deepEqual(results.safety, {
  modelApiCalls: 0,
  networkCalls: 0,
  databaseReads: 0,
  databaseWrites: 0,
  secretReads: 0,
});
assert.equal(results.legacyTests.status, 0);
assert.equal(results.legacyTests.pass, 80);
assert.equal(results.legacyTests.fail, 0);
assert.equal(
  fileSha(path.join(here, "legacy-tests.log")),
  results.legacyTests.logSha256,
);

assert.equal(novelty.phase, "POST_SEAL");
assert.equal(novelty.verdict, "PASS");
assert.equal(novelty.semanticLiteralCount, 764);
assert.equal(novelty.priorFileCount, 116);
assert.equal(novelty.matchCount, 0);
assert.deepEqual(novelty.matches, []);
assert.deepEqual(results.novelty, {
  verdict: novelty.verdict,
  semanticLiteralCount: novelty.semanticLiteralCount,
  priorFileCount: novelty.priorFileCount,
  priorBytes: novelty.priorBytes,
  matchCount: novelty.matchCount,
  comparisonUniverseSha256: novelty.comparisonUniverseSha256,
});

assert.equal(caseResults.cases.length, 256);
const recomputed = {};
for (const [family] of familyCounts) {
  const rows = caseResults.cases.filter((entry) => entry.family === family);
  const fail = rows.filter((entry) => !entry.pass).length;
  const falsePositive = rows.filter(
    (entry) => !entry.expectedBlock && entry.observedBlock,
  ).length;
  const falseNegative = rows.filter(
    (entry) => entry.expectedBlock && !entry.observedBlock,
  ).length;
  recomputed[family] = { total: rows.length, fail, falsePositive, falseNegative };
}
for (const [family, counts] of Object.entries(recomputed)) {
  assert.equal(results.familyResults[family].total, counts.total, family);
  assert.equal(results.familyResults[family].fail, counts.fail, family);
  assert.equal(
    results.familyResults[family].falsePositive,
    counts.falsePositive,
    family,
  );
  assert.equal(
    results.familyResults[family].falseNegative,
    counts.falseNegative,
    family,
  );
}

assert.deepEqual(sourceHashes, {
  gitHead: results.provenance.gitHead,
  sourceAndTestSha256: results.provenance.sourceAndTestSha256,
});
for (const [relative, expected] of Object.entries(
  results.provenance.sourceAndTestSha256,
)) {
  assert.equal(fileSha(path.join(repoRoot, relative)), expected, relative);
}

const tsxCli = path.join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs");
const auditCheckText = execFileSync(
  process.execPath,
  [tsxCli, path.join(here, "audit.mts"), "--check"],
  {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, NODE_OPTIONS: "" },
    maxBuffer: 16 * 1024 * 1024,
  },
).trim();
const auditCheck = JSON.parse(auditCheckText);
assert.equal(auditCheck.check, "PASS");
assert.equal(auditCheck.verdict, "BLOCK");
assert.equal(auditCheck.cases, 256);
assert.equal(auditCheck.mismatches, 93);

process.stdout.write(
  `${JSON.stringify(
    {
      verification: "PASS",
      auditVerdict: results.verdict,
      payloadFiles: manifestEntries.length,
      manifestSha256: fileSha(manifestPath),
      sealedCasesSha256: seal.sha256["cases.json"],
      auditCheck,
      apiCandidatesConsumed: results.apiCandidatesConsumed,
    },
    null,
    2,
  )}\n`,
);

