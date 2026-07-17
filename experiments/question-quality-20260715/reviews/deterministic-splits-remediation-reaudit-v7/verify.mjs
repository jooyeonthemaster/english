import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const reviewsRoot = path.dirname(here);
const v6Dir = path.join(reviewsRoot, "deterministic-splits-remediation-reaudit-v6");
const auditPath = path.join(here, "audit.mts");
const resultsPath = path.join(here, "RESULTS.json");
const manifestPath = path.join(here, "MANIFEST.sha256");
const tsxCli = path.join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs");
const digest = (value) => createHash("sha256").update(value).digest("hex");
const hash = (filePath) => digest(readFileSync(filePath));

const results = JSON.parse(readFileSync(resultsPath, "utf8"));
assert.equal(results.schemaVersion, 1);
assert.equal(results.auditKind, "deterministic-splits-remediation-reaudit-v7");
assert.equal(results.verdict, "BLOCK");
assert.equal(results.summary.total, 1160);
assert.equal(results.summary.pass, 1069);
assert.equal(results.summary.fail, 91);
assert.equal(results.failureIndex.falseNegativeIds.length, 77);
assert.equal(results.failureIndex.falsePositiveIds.length, 14);
assert.equal(
  results.failureIndex.falseNegativeIds.length +
    results.failureIndex.falsePositiveIds.length,
  91,
);
assert.equal(
  digest(
    JSON.stringify([
      ...results.failureIndex.falseNegativeIds,
      ...results.failureIndex.falsePositiveIds,
    ]),
  ),
  results.failureIndex.allFailureIdsSha256,
);

assert.deepEqual(results.summary.v6CurrentSemanticReplay, {
  total: 904,
  pass: 904,
  fail: 0,
  verdict: "PASS",
  failedCaseIds: [],
});

assert.equal(results.summary.newHoldout.total, 256);
assert.equal(results.summary.newHoldout.pass, 165);
assert.equal(results.summary.newHoldout.fail, 91);
assert.equal(results.summary.newHoldout.minimumRequired, 224);
assert.equal(results.summary.newHoldout.blindCaseCount, 224);
assert.equal(results.summary.newHoldout.postBlindTargetedSupplementCount, 32);
assert.deepEqual(results.summary.newHoldout.controlBalance, {
  positive: 128,
  negative: 128,
});
assert.deepEqual(results.summary.newHoldout.families, {
  blank_explanation_step_numbering: {
    total: 32,
    pass: 16,
    fail: 16,
    expectedPositive: 16,
    expectedNegative: 16,
    observedPositive: 0,
    observedNegative: 32,
    falseNegative: 16,
    falsePositive: 0,
  },
  blank_paraphrase_residual_visibility: {
    total: 32,
    pass: 32,
    fail: 0,
    expectedPositive: 16,
    expectedNegative: 16,
    observedPositive: 16,
    observedNegative: 16,
    falseNegative: 0,
    falsePositive: 0,
  },
  grammar_keypoint_nonexistent_label: {
    total: 32,
    pass: 18,
    fail: 14,
    expectedPositive: 16,
    expectedNegative: 16,
    observedPositive: 2,
    observedNegative: 30,
    falseNegative: 14,
    falsePositive: 0,
  },
  grammar_terminology_accuracy: {
    total: 32,
    pass: 16,
    fail: 16,
    expectedPositive: 16,
    expectedNegative: 16,
    observedPositive: 0,
    observedNegative: 32,
    falseNegative: 16,
    falsePositive: 0,
  },
  sentence_order_paragraph_integrity: {
    total: 32,
    pass: 19,
    fail: 13,
    expectedPositive: 16,
    expectedNegative: 16,
    observedPositive: 3,
    observedNegative: 29,
    falseNegative: 13,
    falsePositive: 0,
  },
  summary_mc_direction_answer_object: {
    total: 96,
    pass: 64,
    fail: 32,
    expectedPositive: 48,
    expectedNegative: 48,
    observedPositive: 44,
    observedNegative: 52,
    falseNegative: 18,
    falsePositive: 14,
  },
});

assert.equal(results.summary.newHoldout.summaryDirection.positive, 48);
assert.equal(results.summary.newHoldout.summaryDirection.negative, 48);
assert.equal(results.summary.newHoldout.summaryDirection.hardNegativeCount, 35);
assert.deepEqual(
  results.summary.newHoldout.summaryDirection.requiredSourceVariantCounts,
  {
    본문상: 8,
    "지문으로 볼 때": 8,
    "글에 비추어": 8,
    "제시 근거상": 8,
  },
);
assert.deepEqual(results.summary.newHoldout.summaryDirection.markerStyleSummary, {
  explicit_AB: { positive: 32, negative: 32 },
  unlabeled_two_blanks: { positive: 16, negative: 16 },
});

const falseNegatives = results.failureIndex.falseNegativeIds;
const falsePositives = results.failureIndex.falsePositiveIds;
assert.equal(falseNegatives.length, 77);
assert.equal(falsePositives.length, 14);
assert.ok(
  falsePositives.every((id) => id.startsWith("v7-summary-targeted-neg-")),
);

assert.equal(
  results.noveltyAndBlinding.blindHoldoutSha256,
  "d74721aafa909a641bd69de236ef1c7dcbc921b327e363ecbf93b65bbe921fdd",
);
assert.equal(
  hash(path.join(here, "blind-holdout-cases.mjs")),
  results.noveltyAndBlinding.blindHoldoutSha256,
);
assert.equal(
  hash(path.join(here, "BLIND-SEAL.json")),
  results.noveltyAndBlinding.blindSealSha256,
);
assert.equal(
  hash(path.join(here, "targeted-summary-answer-object-cases.mjs")),
  results.noveltyAndBlinding.targetedSupplementSha256,
);
assert.equal(results.noveltyAndBlinding.blindedCaseCount, 224);
assert.equal(results.noveltyAndBlinding.transparentlyPostBlindTargetedCaseCount, 32);
assert.deepEqual(results.noveltyAndBlinding.priorAuditLiteralCollisionIds, []);
assert.equal(results.noveltyAndBlinding.uniqueIdCount, 256);
assert.equal(results.noveltyAndBlinding.uniquePrimaryInputCount, 256);

for (const [name, count] of Object.entries(results.safety)) {
  assert.equal(count, 0, `${name} must remain zero`);
}

assert.equal(hash(auditPath), results.provenance.auditScriptSha256);
assert.equal(results.provenance.frozenV6.immutableVerdict, "BLOCK");
assert.equal(results.provenance.frozenV6.immutableSummary.total, 904);
assert.equal(results.provenance.frozenV6.immutableSummary.pass, 894);
assert.equal(results.provenance.frozenV6.immutableSummary.fail, 10);
const frozenV6Results = JSON.parse(
  readFileSync(path.join(v6Dir, "RESULTS.json"), "utf8"),
);
assert.equal(
  digest(JSON.stringify(frozenV6Results.summary.failedCaseIds)),
  results.provenance.frozenV6.immutableSummary.failedCaseIdsSha256,
);
assert.equal(
  hash(path.join(v6Dir, "MANIFEST.sha256")),
  results.provenance.frozenV6.manifestSha256,
);
for (const entry of results.provenance.frozenV6.manifestEntries) {
  assert.equal(
    hash(path.join(v6Dir, entry.relativePath)),
    entry.expectedHash,
    `frozen v6 drift: ${entry.relativePath}`,
  );
}
for (const [relativePath, provenance] of Object.entries(
  results.provenance.frozenV6.sourceAndTestProvenance,
)) {
  assert.equal(
    hash(path.join(repoRoot, relativePath)),
    provenance.currentSha256,
    `current audited source/test drift: ${relativePath}`,
  );
}

const changedSinceV6 = Object.entries(
  results.provenance.frozenV6.sourceAndTestProvenance,
)
  .filter(([, provenance]) => !provenance.matchesFrozen)
  .map(([relativePath]) => relativePath);
assert.deepEqual(changedSinceV6, [
  "src/lib/question-quality/validators/summary/mc.ts",
  "tests/unit/summary-mc-direction-split.test.mjs",
]);

const replay = JSON.parse(
  execFileSync(process.execPath, [tsxCli, auditPath], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, NODE_OPTIONS: "" },
  }),
);
assert.deepEqual(replay, results, "v7 semantic replay must exactly match RESULTS.json");

const manifestEntries = readFileSync(manifestPath, "utf8")
  .trim()
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => {
    const match = line.match(/^([0-9a-f]{64})  (.+)$/);
    assert.ok(match, `invalid manifest line: ${line}`);
    return { expectedHash: match[1], relativePath: match[2] };
  });
const expectedManifestNames = [
  "AUDIT.md",
  "BLIND-SEAL.json",
  "RESULTS.json",
  "audit.mts",
  "blind-holdout-cases.mjs",
  "targeted-summary-answer-object-cases.mjs",
  "verify.mjs",
];
assert.deepEqual(
  manifestEntries.map((entry) => entry.relativePath).sort(),
  expectedManifestNames.sort(),
);
for (const entry of manifestEntries) {
  assert.equal(
    hash(path.join(here, entry.relativePath)),
    entry.expectedHash,
    `v7 artifact drift: ${entry.relativePath}`,
  );
}

for (const relativePath of [...expectedManifestNames, "MANIFEST.sha256"]) {
  const absolutePath = path.join(here, relativePath);
  const escaped = absolutePath.replaceAll("'", "''");
  const isReadOnly = execFileSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `(Get-Item -LiteralPath '${escaped}').IsReadOnly`,
    ],
    { encoding: "utf8" },
  ).trim();
  assert.equal(isReadOnly, "True", `${relativePath} is not ReadOnly`);
}

process.stdout.write(
  `${JSON.stringify(
    {
      ok: true,
      immutableVerdict: results.verdict,
      total: results.summary.total,
      pass: results.summary.pass,
      fail: results.summary.fail,
      v6CurrentSemanticReplay: results.summary.v6CurrentSemanticReplay,
      newHoldout: {
        total: results.summary.newHoldout.total,
        pass: results.summary.newHoldout.pass,
        fail: results.summary.newHoldout.fail,
        falseNegative: falseNegatives.length,
        falsePositive: falsePositives.length,
      },
      artifactManifestEntries: manifestEntries.length,
      artifactManifestSha256: hash(manifestPath),
      semanticReplay: "exact JSON replay passed",
      sourceAndTestHashes: "all current hashes matched",
      readOnly: "all v7 artifacts",
      safety: results.safety,
    },
    null,
    2,
  )}\n`,
);
