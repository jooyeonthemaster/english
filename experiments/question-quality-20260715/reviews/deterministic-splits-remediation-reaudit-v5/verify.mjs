import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const auditPath = path.join(here, "audit.mts");
const resultsPath = path.join(here, "RESULTS.json");
const manifestPath = path.join(here, "MANIFEST.sha256");
const tsxCli = path.join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs");
const hash = (filePath) =>
  createHash("sha256").update(readFileSync(filePath)).digest("hex");

const results = JSON.parse(readFileSync(resultsPath, "utf8"));

assert.equal(results.schemaVersion, 1);
assert.equal(results.auditKind, "deterministic-splits-remediation-reaudit-v5");
assert.equal(results.verdict, "BLOCK");
assert.equal(results.summary.total, 712);
assert.equal(results.summary.pass, 711);
assert.equal(results.summary.fail, 1);
assert.deepEqual(results.summary.failedCaseIds, ["v5-summary-mixed-13"]);

assert.deepEqual(results.summary.v4SemanticReplay, {
  total: 520,
  pass: 520,
  fail: 0,
  verdict: "PASS",
  failedCaseIds: [],
});
assert.equal(results.summary.newHoldout.total, 192);
assert.equal(results.summary.newHoldout.pass, 191);
assert.equal(results.summary.newHoldout.fail, 1);
assert.equal(results.summary.newHoldout.minimumRequired, 160);
assert.deepEqual(results.summary.newHoldout.controlBalance, {
  positive: 96,
  negative: 96,
});
assert.equal(results.summary.newHoldout.generatedPostV4CfCount, 16);
assert.equal(results.summary.newHoldout.postV4CfPoolCount, 105);
assert.equal(results.summary.newHoldout.ambiguityExclusionCount, 12);

assert.deepEqual(results.summary.newHoldout.categories, {
  "summary-mixed-task-v5": {
    total: 32,
    pass: 31,
    fail: 1,
    expectedPositive: 16,
    expectedNegative: 16,
    observedPositive: 15,
    observedNegative: 17,
  },
  "blank-circled-role-v5": {
    total: 32,
    pass: 32,
    fail: 0,
    expectedPositive: 16,
    expectedNegative: 16,
    observedPositive: 16,
    observedNegative: 16,
  },
  "grammar-ghost-decoration-v5": {
    total: 32,
    pass: 32,
    fail: 0,
    expectedPositive: 16,
    expectedNegative: 16,
    observedPositive: 16,
    observedNegative: 16,
  },
  "grammar-terminology-v5": {
    total: 32,
    pass: 32,
    fail: 0,
    expectedPositive: 16,
    expectedNegative: 16,
    observedPositive: 16,
    observedNegative: 16,
  },
  "blank-residual-punctuation-v5": {
    total: 32,
    pass: 32,
    fail: 0,
    expectedPositive: 16,
    expectedNegative: 16,
    observedPositive: 16,
    observedNegative: 16,
  },
  "sentence-order-cf-v5": {
    total: 32,
    pass: 32,
    fail: 0,
    expectedPositive: 16,
    expectedNegative: 16,
    observedPositive: 16,
    observedNegative: 16,
  },
});

assert.equal(results.failures.length, 1);
assert.deepEqual(results.failures[0], {
  source: "v5-holdout",
  id: "v5-summary-mixed-13",
  category: "summary-mixed-task-v5",
  expected: true,
  observed: false,
  input:
    "요약문의 두 자리 (A), (B)를 채우시오. 그와 별개로, 글의 내용에 근거하지 않은 주장을 고르시오.",
  displayInput:
    "요약문의 두 자리 (A), (B)를 채우시오. 그와 별개로, 글의 내용에 근거하지 않은 주장을 고르시오.",
  oracle:
    "The direction explicitly assigns a second response object outside summary slots (A)/(B); the mismatch fatal is mandatory.",
});

assert.equal(results.novelty.frozenV4CaseCount, 520);
assert.equal(results.novelty.newCaseCount, 192);
assert.equal(results.novelty.allIdsUseV5Namespace, true);
assert.equal(results.novelty.uniqueIdCount, 192);
assert.equal(results.novelty.uniqueInputCount, 192);
assert.equal(results.oraclePolicy.ambiguityExclusions.length, 12);
assert.equal(
  new Set(results.oraclePolicy.ambiguityExclusions.map((item) => item.id)).size,
  12,
);
assert.ok(
  results.oraclePolicy.ambiguityExclusions.every(
    (item) => item.family && item.candidate && item.reason.length >= 40,
  ),
);

for (const [name, count] of Object.entries(results.safety)) {
  assert.equal(count, 0, `${name} must remain zero`);
}

assert.equal(hash(auditPath), results.provenance.auditScriptSha256);
assert.equal(
  results.provenance.v4ReplayHarnessSha256,
  results.provenance.v4ReplayHarnessReportedSha256,
);
assert.equal(
  hash(
    path.join(
      repoRoot,
      "experiments/question-quality-20260715/reviews/deterministic-splits-remediation-reaudit-v4/audit.mts",
    ),
  ),
  results.provenance.v4ReplayHarnessSha256,
);

const v4Dir = path.join(
  repoRoot,
  "experiments/question-quality-20260715/reviews/deterministic-splits-remediation-reaudit-v4",
);
for (const [name, expectedHash] of Object.entries(
  results.provenance.frozenV4ArtifactSha256,
)) {
  assert.equal(hash(path.join(v4Dir, name)), expectedHash, `frozen v4 drift: ${name}`);
}

for (const [relativePath, expectedHash] of Object.entries(
  results.provenance.auditedSourceAndTestSha256,
)) {
  assert.equal(
    hash(path.join(repoRoot, relativePath)),
    expectedHash,
    `audited source/test drift: ${relativePath}`,
  );
}

const replay = JSON.parse(
  execFileSync(process.execPath, [tsxCli, auditPath], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, NODE_OPTIONS: "" },
  }),
);
assert.deepEqual(replay, results, "semantic replay must exactly match frozen RESULTS.json");

const manifestEntries = readFileSync(manifestPath, "utf8")
  .trim()
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => {
    const match = line.match(/^([0-9a-f]{64})  (.+)$/);
    assert.ok(match, `invalid manifest line: ${line}`);
    return { expectedHash: match[1], relativePath: match[2] };
  });
assert.equal(manifestEntries.length, 4);
assert.deepEqual(
  manifestEntries.map((entry) => entry.relativePath).sort(),
  ["AUDIT.md", "RESULTS.json", "audit.mts", "verify.mjs"].sort(),
);
for (const entry of manifestEntries) {
  assert.equal(
    hash(path.join(here, entry.relativePath)),
    entry.expectedHash,
    `artifact drift: ${entry.relativePath}`,
  );
}

process.stdout.write(
  `${JSON.stringify(
    {
      ok: true,
      immutableVerdict: results.verdict,
      total: results.summary.total,
      pass: results.summary.pass,
      fail: results.summary.fail,
      v4SemanticReplay: results.summary.v4SemanticReplay,
      newHoldout: {
        total: results.summary.newHoldout.total,
        pass: results.summary.newHoldout.pass,
        fail: results.summary.newHoldout.fail,
        positiveControls: results.summary.newHoldout.controlBalance.positive,
        negativeControls: results.summary.newHoldout.controlBalance.negative,
      },
      failedCaseIds: results.summary.failedCaseIds,
      artifactManifestEntries: manifestEntries.length,
      artifactManifestSha256: hash(manifestPath),
      semanticReplay: "exact JSON replay passed",
      sourceAndTestHashes: "all matched",
      frozenV4Hashes: "all matched",
      safety: results.safety,
    },
    null,
    2,
  )}\n`,
);
