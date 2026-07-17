import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const reviewsRoot = path.dirname(here);
const auditPath = path.join(here, "audit.mts");
const resultsPath = path.join(here, "RESULTS.json");
const manifestPath = path.join(here, "MANIFEST.sha256");
const tsxCli = path.join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs");
const hash = (filePath) =>
  createHash("sha256").update(readFileSync(filePath)).digest("hex");

const results = JSON.parse(readFileSync(resultsPath, "utf8"));

assert.equal(results.schemaVersion, 1);
assert.equal(results.auditKind, "deterministic-splits-remediation-reaudit-v6");
assert.equal(results.verdict, "BLOCK");
assert.equal(results.summary.total, 904);
assert.equal(results.summary.pass, 894);
assert.equal(results.summary.fail, 10);

const expectedFailureIds = [
  "v6-summary-evidence-mixed-07",
  "v6-summary-evidence-mixed-08",
  "v6-summary-evidence-mixed-09",
  "v6-summary-evidence-mixed-10",
  "v6-summary-evidence-mixed-11",
  "v6-summary-evidence-mixed-12",
  "v6-summary-evidence-mixed-13",
  "v6-summary-evidence-mixed-14",
  "v6-summary-evidence-mixed-15",
  "v6-summary-evidence-mixed-16",
];
assert.deepEqual(results.summary.failedCaseIds, expectedFailureIds);
assert.deepEqual(results.summary.v5SemanticReplay, {
  total: 712,
  pass: 712,
  fail: 0,
  verdict: "PASS",
  failedCaseIds: [],
});

assert.equal(results.summary.newHoldout.total, 192);
assert.equal(results.summary.newHoldout.pass, 182);
assert.equal(results.summary.newHoldout.fail, 10);
assert.equal(results.summary.newHoldout.minimumRequired, 160);
assert.deepEqual(results.summary.newHoldout.controlBalance, {
  positive: 96,
  negative: 96,
});
assert.equal(results.summary.newHoldout.generatedFreshCfCount, 16);
assert.equal(results.summary.newHoldout.postV4CfPoolCount, 105);
assert.equal(results.summary.newHoldout.ambiguityExclusionCount, 12);

assert.deepEqual(results.summary.newHoldout.categories, {
  "summary-evidence-source-v6": {
    total: 32,
    pass: 22,
    fail: 10,
    expectedPositive: 16,
    expectedNegative: 16,
    observedPositive: 6,
    observedNegative: 26,
  },
  "blank-circled-role-v6": {
    total: 32,
    pass: 32,
    fail: 0,
    expectedPositive: 16,
    expectedNegative: 16,
    observedPositive: 16,
    observedNegative: 16,
  },
  "grammar-ghost-decoration-v6": {
    total: 32,
    pass: 32,
    fail: 0,
    expectedPositive: 16,
    expectedNegative: 16,
    observedPositive: 16,
    observedNegative: 16,
  },
  "grammar-terminology-v6": {
    total: 32,
    pass: 32,
    fail: 0,
    expectedPositive: 16,
    expectedNegative: 16,
    observedPositive: 16,
    observedNegative: 16,
  },
  "blank-residual-punctuation-v6": {
    total: 32,
    pass: 32,
    fail: 0,
    expectedPositive: 16,
    expectedNegative: 16,
    observedPositive: 16,
    observedNegative: 16,
  },
  "sentence-order-cf-v6": {
    total: 32,
    pass: 32,
    fail: 0,
    expectedPositive: 16,
    expectedNegative: 16,
    observedPositive: 16,
    observedNegative: 16,
  },
});

const expectedFailureInputs = [
  "요약문 빈칸 (A), (B)를 먼저 완성하시오. 별개 과제로 글의 내용을 근거로 옳지 않은 진술을 고르시오.",
  "요약문의 빈칸 (A)와 (B)에 단어를 넣으시오. 또한 본문 내용을 근거로 사실이 아닌 주장을 찾으시오.",
  "요약문 빈칸 (A), (B)를 완성하시오. 이와 독립적으로 글에서 뒷받침할 근거가 없는 주장을 고르시오.",
  "요약문의 빈자리 (A), (B)를 채우시오. 두 번째 과제로 본문이 뒷받침하지 않는 진술을 선택하시오.",
  "요약문 빈칸 (A)와 (B)를 완성하시오. 별도로 글의 증거로 정당화할 수 없는 주장을 찾으시오.",
  "요약문의 두 빈칸 (A), (B)를 채우시오. 추가로 본문에 제시된 증거가 지지하지 않는 진술을 고르시오.",
  "Complete summary blanks (A) and (B). As a separate task, choose the claim for which the passage provides no evidence.",
  "Fill (A) and (B) in the summary. Independently select the statement not supported by evidence in the text.",
  "Complete the summary at (A) and (B); then identify the assertion with no textual support in the source passage.",
  "Choose the pair for summary slots (A) and (B). Separately, select the claim that cannot be justified from the passage.",
];
assert.equal(results.failures.length, 10);
assert.deepEqual(
  results.failures.map((failure) => failure.id),
  expectedFailureIds,
);
assert.deepEqual(
  results.failures.map((failure) => failure.input),
  expectedFailureInputs,
);
for (const failure of results.failures) {
  assert.equal(failure.source, "v6-holdout");
  assert.equal(failure.category, "summary-evidence-source-v6");
  assert.equal(failure.expected, true);
  assert.equal(failure.observed, false);
  assert.equal(failure.displayInput, failure.input);
  assert.ok(failure.oracle.includes("second scored task"));
}

assert.equal(results.novelty.frozenV5ReplayCaseCount, 712);
assert.equal(results.novelty.newCaseCount, 192);
assert.equal(results.novelty.allIdsUseV6Namespace, true);
assert.equal(results.novelty.uniqueIdCount, 192);
assert.equal(results.novelty.uniqueInputCount, 192);
assert.deepEqual(results.novelty.priorAuditLiteralCollisionIds, []);
assert.equal(results.novelty.cfOverlapWithV5Count, 0);

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
  results.provenance.v5ReplayHarnessSha256,
  results.provenance.v5ReplayHarnessReportedSha256,
);
assert.equal(
  hash(
    path.join(
      repoRoot,
      "experiments/question-quality-20260715/reviews/deterministic-splits-remediation-reaudit-v5/audit.mts",
    ),
  ),
  results.provenance.v5ReplayHarnessSha256,
);

for (const [version, artifactHashes] of [
  ["v4", results.provenance.frozenV4ArtifactSha256],
  ["v5", results.provenance.frozenV5ArtifactSha256],
]) {
  const dir = path.join(
    reviewsRoot,
    `deterministic-splits-remediation-reaudit-${version}`,
  );
  for (const [name, expectedHash] of Object.entries(artifactHashes)) {
    assert.equal(hash(path.join(dir, name)), expectedHash, `frozen ${version} drift: ${name}`);
  }
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
      v5SemanticReplay: results.summary.v5SemanticReplay,
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
      frozenV4V5Hashes: "all matched",
      safety: results.safety,
    },
    null,
    2,
  )}\n`,
);
