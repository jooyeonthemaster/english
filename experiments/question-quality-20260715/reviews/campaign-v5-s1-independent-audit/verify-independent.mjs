import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const designDir = path.join(
  repoRoot,
  "experiments/question-quality-20260715/design/campaign-v5-s1",
);
const rel = (value) => path.join(repoRoot, value);
const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const fileSha256 = (file) => sha256(readFileSync(file));

function stableStringify(value) {
  const sort = (input) => {
    if (Array.isArray(input)) return input.map(sort);
    if (input && typeof input === "object") {
      return Object.fromEntries(
        Object.entries(input)
          .sort(([left], [right]) => left.localeCompare(right, "en"))
          .map(([key, child]) => [key, sort(child)]),
      );
    }
    return input;
  };
  return JSON.stringify(sort(value));
}

function normalizeContent(text) {
  return text
    .normalize("NFKC")
    .replace(/\r\n?/gu, "\n")
    .replace(/[\t\f\v ]+/gu, " ")
    .replace(/ *\n+ */gu, "\n")
    .replace(/\s+/gu, " ")
    .trim();
}

function countBy(rows, selector) {
  const output = {};
  for (const row of rows) {
    const key = selector(row);
    output[key] = (output[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(output).sort(([a], [b]) => a.localeCompare(b)));
}

function assertCounts(actual, expected, label) {
  assert.deepEqual(
    countBy(actual, (row) => row),
    Object.fromEntries(Object.entries(expected).sort(([a], [b]) => a.localeCompare(b))),
    label,
  );
}

function verifyManifest(manifestPath, baseDir) {
  const lines = readFileSync(manifestPath, "utf8").trim().split(/\r?\n/u);
  const files = [];
  for (const line of lines) {
    const match = /^([0-9a-f]{64})  (.+)$/u.exec(line);
    assert.ok(match, `malformed manifest line: ${line}`);
    const [, expected, relativePath] = match;
    assert.ok(!path.isAbsolute(relativePath) && !relativePath.includes(".."));
    assert.equal(fileSha256(path.join(baseDir, relativePath)), expected);
    files.push(relativePath.replaceAll("\\", "/"));
  }
  assert.equal(new Set(files).size, files.length, "duplicate manifest entry");
  return files;
}

const privatePath = path.join(designDir, "private/s1-queue-v5.json");
const publicPath = path.join(designDir, "campaign-v5-s1.json");
const privateRaw = readFileSync(privatePath, "utf8");
const publicRaw = readFileSync(publicPath, "utf8");
const queue = JSON.parse(privateRaw);
const published = JSON.parse(publicRaw);

const manifestFiles = verifyManifest(path.join(designDir, "MANIFEST.sha256"), designDir);
assert.deepEqual(manifestFiles, [
  "build.mts",
  "verify.mts",
  "tsconfig.json",
  "README.md",
  "campaign-v5-s1.json",
  "private/.gitignore",
]);
assert.ok(!manifestFiles.some((file) => file.endsWith("s1-queue-v5.json")));

// Independently bind every published upstream file to current bytes.
for (const item of published.upstream.files) {
  const target = rel(item.path);
  assert.equal(Buffer.byteLength(readFileSync(target)), item.bytes, `byte drift: ${item.role}`);
  assert.equal(fileSha256(target), item.sha256, `hash drift: ${item.role}`);
}
assert.equal(
  published.upstream.sourceClosureSha256,
  sha256(stableStringify(published.upstream.files)),
);

assert.equal(queue.schemaVersion, "question-quality-s1-campaign-v5-private-queue-v1");
assert.equal(queue.status, "FROZEN_DESIGN_QUEUE_NOT_AUTHORIZED");
assert.equal(queue.seed, "question-quality-s1-campaign-v5-20260715-v1");
assert.equal(queue.noReplacementOrTopUp, true);
assert.equal(queue.campaignEligibleAssignments, 0);
assert.equal(queue.generationAuthorized, false);
assert.deepEqual(queue.safety, {
  modelApiCalls: 0,
  networkCalls: 0,
  databaseCalls: 0,
  fullQuestionCandidatesGenerated: 0,
  globalApiCandidateCount: 0,
});
assert.equal(queue.passages.length, 12);
assert.equal(queue.assignments.length, 180);

const semanticCore = { ...queue };
delete semanticCore.privateQueueSemanticSha256;
assert.equal(queue.privateQueueSemanticSha256, sha256(stableStringify(semanticCore)));
assert.equal(published.queue.privateQueueSemanticSha256, queue.privateQueueSemanticSha256);
assert.equal(published.queue.privateQueueFileSha256, fileSha256(privatePath));
assert.equal(published.queue.privateQueueFileBytes, Buffer.byteLength(privateRaw, "utf8"));

const snapshotPath = rel(
  "experiments/question-quality-20260715/corpus/v3/private/input-snapshot.json",
);
const historyPrivatePath = rel(
  "experiments/question-quality-20260715/corpus/selected-source-history-v1/private/baseline-20260715-0745-private.json",
);
const historyPublicPath = rel(
  "experiments/question-quality-20260715/corpus/selected-source-history-v1/runs/baseline-20260715-0745-public.json",
);
assert.equal(fileSha256(snapshotPath), queue.upstreamPrivateSeals.snapshotSha256);
assert.equal(
  fileSha256(historyPrivatePath),
  queue.upstreamPrivateSeals.selectedSourceHistoryPrivateSha256,
);

const historyPrivate = readJson(historyPrivatePath);
const historyPublic = readJson(historyPublicPath);
assert.equal(historyPublic.selectedRows, 76);
assert.equal(historyPublic.historyCleanRows, 76);
assert.equal(historyPublic.exposedRows, 0);
assert.equal(historyPrivate.rows.length, 76);
assert.equal(
  historyPrivate.rows.filter(
    (row) =>
      row.historyClean &&
      row.questionCount === 0 &&
      row.aiQuestionCount === 0 &&
      row.workbenchJobCount === 0,
  ).length,
  76,
);
const historyByKey = new Map(
  historyPrivate.rows.map((row) => [
    `${row.focusType}|${row.frameId}|${row.contentHash}|${row.split}`,
    row,
  ]),
);
assert.equal(historyByKey.size, 76);

const snapshot = readJson(snapshotPath);
const candidateById = new Map(snapshot.candidates.map((row) => [row.id, row]));
assert.equal(candidateById.size, snapshot.candidates.length);

const expectedPassages = new Map();
for (const [questionType, stem] of [
  ["GRAMMAR_ERROR", "grammar"],
  ["BLANK_INFERENCE", "blank"],
]) {
  const corpusDir = rel(
    `experiments/question-quality-20260715/corpus/cross-type-${stem}-source-frame-v2`,
  );
  const sourcePath = path.join(corpusDir, "private/source-frame-private.json");
  const reconciliationPath = path.join(
    corpusDir,
    "private/reconciliation-and-split-v2.json",
  );
  const seal = queue.upstreamPrivateSeals[questionType];
  assert.equal(fileSha256(sourcePath), seal.sourcePrivateSha256);
  assert.equal(fileSha256(reconciliationPath), seal.reconciliationPrivateSha256);
  const source = readJson(sourcePath);
  const reconciliation = readJson(reconciliationPath);
  const sourceByFrame = new Map(source.rows.map((row) => [row.frameId, row]));
  const ledgerByFrame = new Map(reconciliation.rows.map((row) => [row.frameId, row]));
  const selected = reconciliation.selection.rows.filter((row) => row.split === "development");
  assert.equal(selected.length, 6, `${questionType} development count`);
  for (const selection of selected) {
    const sourceRow = sourceByFrame.get(selection.frameId);
    const ledger = ledgerByFrame.get(selection.frameId);
    assert.ok(sourceRow && ledger);
    assert.equal(sourceRow.contentHash, selection.contentHash);
    assert.equal(ledger.contentHash, selection.contentHash);
    assert.equal(ledger.selectedSplit, "development");
    assert.equal(ledger.campaignEligible, false);
    assert.equal(
      ledger.disposition,
      questionType === "GRAMMAR_ERROR" ? "DUAL_PASS" : "FRAME_PASS_BOTH_LENSES",
    );
    const key = `${questionType}|${selection.frameId}|${selection.contentHash}`;
    expectedPassages.set(key, { questionType, selection, sourceRow });
  }
}
assert.equal(expectedPassages.size, 12);

assert.equal(new Set(queue.passages.map((row) => row.passageToken)).size, 12);
assert.equal(new Set(queue.passages.map((row) => row.frameId)).size, 12);
assert.equal(new Set(queue.passages.map((row) => row.contentHash)).size, 12);
for (const passage of queue.passages) {
  const key = `${passage.questionType}|${passage.frameId}|${passage.contentHash}`;
  const expected = expectedPassages.get(key);
  assert.ok(expected, "queue passage is outside the sealed dual-pass development set");
  assert.equal(passage.split, "development");
  assert.equal(passage.topic, expected.selection.topic);
  assert.equal(passage.discourse, expected.selection.discourse);
  assert.equal(passage.wordBand, expected.selection.wordBand);
  assert.equal(passage.candidateId, expected.sourceRow.candidateId);
  assert.equal(passage.sourceRecordId, expected.sourceRow.sourceRecordId);
  assert.equal(passage.documentKey, expected.sourceRow.documentKey);
  assert.equal(
    passage.sourceDocumentId,
    expected.sourceRow.sourceDocumentId ?? expected.sourceRow.sourceId ?? null,
  );
  const candidate = candidateById.get(passage.candidateId);
  assert.ok(candidate);
  assert.equal(candidate.text, passage.passageContentExact);
  assert.equal(candidate.sourceRecordId, passage.sourceRecordId);
  assert.equal(candidate.document.documentKey, passage.documentKey);
  assert.equal(candidate.document.sourceId, passage.sourceDocumentId);
  assert.equal(Buffer.byteLength(passage.passageContentExact, "utf8"), passage.passageUtf8Bytes);
  assert.equal(sha256(Buffer.from(passage.passageContentExact, "utf8")), passage.passageUtf8Sha256);
  assert.equal(sha256(normalizeContent(passage.passageContentExact)), passage.contentHash);
  assert.equal(passage.normalizedContentHashVerified, true);
  assert.equal(passage.dualPassVerified, true);
  assert.equal(passage.campaignEligible, false);
  const history = historyByKey.get(`${key}|development`);
  assert.ok(history);
  assert.equal(history.historyClean, true);
  for (const field of [
    "questionCount",
    "aiQuestionCount",
    "workbenchJobCount",
    "matchedPassageCount",
  ]) {
    assert.equal(passage.historyBaseline[field], history[field]);
  }
}

const profiles = {
  GRAMMAR_ERROR: [
    "G0_CURRENT_CONTROL",
    "G1_FINAL_CHECKLIST_ABLATION",
    "G2_POSITIVE_COMPACT",
    "G3_SITE_CERTIFICATE",
  ],
  BLANK_INFERENCE: [
    "B0_CURRENT_CONTROL",
    "B1_TYPE_SCOPED_TAIL",
    "B2_POSITIVE_COMPACT",
    "B3_OPTION_INTENT_LEDGER",
  ],
};
const plans = ["STANDARD", "PREMIUM"];
const difficulties = ["INTERMEDIATE", "KILLER"];
const expectedKeys = new Set();
for (const passage of queue.passages) {
  for (const profileId of profiles[passage.questionType]) {
    for (const plan of plans) {
      if (profileId === "B1_TYPE_SCOPED_TAIL" && plan === "PREMIUM") continue;
      for (const difficulty of difficulties) {
        expectedKeys.add(
          [passage.questionType, passage.frameId, profileId, plan, difficulty].join("|"),
        );
      }
    }
  }
}
assert.equal(expectedKeys.size, 180);
assert.equal(new Set(queue.assignments.map((row) => row.assignmentKey)).size, 180);
assert.equal(new Set(queue.assignments.map((row) => row.assignmentId)).size, 180);

const passageByToken = new Map(queue.passages.map((row) => [row.passageToken, row]));
const sortedAssignments = [...queue.assignments].sort(
  (a, b) => a.orderRank.localeCompare(b.orderRank, "en") || a.assignmentKey.localeCompare(b.assignmentKey, "en"),
);
assert.deepEqual(queue.assignments, sortedAssignments, "queue order drift");
let totalCents = 0;
const cellCaps = {
  GRAMMAR_ERROR_STANDARD: 20,
  GRAMMAR_ERROR_PREMIUM: 43,
  BLANK_INFERENCE_STANDARD: 14,
  BLANK_INFERENCE_PREMIUM: 20,
};
for (const [index, assignment] of queue.assignments.entries()) {
  const passage = passageByToken.get(assignment.passageToken);
  assert.ok(passage);
  const expectedKey = [
    assignment.questionType,
    passage.frameId,
    assignment.profileId,
    assignment.plan,
    assignment.difficulty,
  ].join("|");
  assert.equal(assignment.assignmentKey, expectedKey);
  assert.ok(expectedKeys.has(expectedKey));
  assert.equal(assignment.queueOrdinal, index + 1);
  assert.equal(
    assignment.orderRank,
    sha256(`${queue.seed}|order|${assignment.assignmentKey}`),
  );
  assert.equal(
    assignment.assignmentId,
    `S1V5-${String(index + 1).padStart(3, "0")}-${assignment.orderRank.slice(0, 12)}`,
  );
  assert.equal(assignment.questionType, passage.questionType);
  assert.equal(
    assignment.modelId,
    assignment.plan === "STANDARD"
      ? "google/gemini-3.5-flash"
      : "google/gemini-3.1-pro-preview",
  );
  assert.deepEqual(assignment.request.plan, [
    {
      subType: assignment.questionType,
      count: 1,
      reason: "S1 v5 fixed profile-screen assignment",
      targetPoints: [],
    },
  ]);
  assert.equal(assignment.request.schoolType, "고등학교");
  assert.equal(assignment.request.gradeInfo, "2학년");
  assert.equal(assignment.request.passageContentRef, assignment.passageToken);
  assert.equal(assignment.request.teacherIntentBlock, "");
  assert.equal(assignment.request.analysisContext, "");
  assert.equal(assignment.request.customPrompt, "");
  assert.equal(assignment.request.diffLabel, assignment.difficulty);
  assert.equal(
    assignment.request.diffInstruction,
    queue.fixedRequestContext.difficultyInstructions[assignment.difficulty],
  );
  assert.equal(assignment.request.generationPlan, assignment.plan);
  assert.equal(assignment.wireContract.providerRequireParameters, true);
  assert.deepEqual(assignment.wireContract.reasoning, {
    enabled: false,
    effort: "none",
    exclude: true,
  });
  assert.equal(assignment.wireContract.questionsMinItems, 1);
  assert.equal(assignment.wireContract.questionsMaxItems, 1);
  assert.equal(
    assignment.wireContract.maxOutputTokens,
    assignment.questionType === "GRAMMAR_ERROR" ? 6000 : 4000,
  );
  assert.deepEqual(
    {
      candidateOpportunityCap: assignment.admission.candidateOpportunityCap,
      physicalFetchCap: assignment.admission.physicalFetchCap,
      fullQuestionSemanticCap: assignment.admission.fullQuestionSemanticCap,
      outerAttempts: assignment.admission.outerAttempts,
      sdkRetries: assignment.admission.sdkRetries,
      attemptIndex: assignment.admission.attemptIndex,
      debit: assignment.admission.debitGlobalCandidateBudgetOnStartedOpportunity,
    },
    {
      candidateOpportunityCap: 1,
      physicalFetchCap: 1,
      fullQuestionSemanticCap: 1,
      outerAttempts: 1,
      sdkRetries: 0,
      attemptIndex: 0,
      debit: 1,
    },
  );
  assert.equal(assignment.admission.qualityMode, "strict");
  const cell = `${assignment.questionType}_${assignment.plan}`;
  assert.equal(assignment.admission.perCallUsdCapCents, cellCaps[cell]);
  assert.equal(assignment.topology.runner, "runPhaseCQuestionGenerationAssignment");
  assert.equal(assignment.topology.directSingleShotMechanismScreen, true);
  for (const field of [
    "triggerTaskUsed",
    "ladderUsed",
    "repairUsed",
    "solverUsed",
    "fallbackUsed",
    "salvageUsed",
  ]) assert.equal(assignment.topology[field], false);
  assert.equal(assignment.replacementAllowed, false);
  assert.equal(assignment.topUpAllowed, false);
  assert.equal(assignment.generationAuthorized, false);
  totalCents += assignment.admission.perCallUsdCapCents;
}

assertCounts(queue.assignments.map((row) => row.questionType), {
  GRAMMAR_ERROR: 96,
  BLANK_INFERENCE: 84,
}, "type allocation");
assertCounts(queue.assignments.map((row) => row.plan), { STANDARD: 96, PREMIUM: 84 }, "plan allocation");
assertCounts(queue.assignments.map((row) => row.difficulty), { INTERMEDIATE: 90, KILLER: 90 }, "difficulty allocation");
assertCounts(queue.assignments.map((row) => row.modelId), {
  "google/gemini-3.5-flash": 96,
  "google/gemini-3.1-pro-preview": 84,
}, "model allocation");
assertCounts(queue.assignments.map((row) => row.profileId), {
  B0_CURRENT_CONTROL: 24,
  B1_TYPE_SCOPED_TAIL: 12,
  B2_POSITIVE_COMPACT: 24,
  B3_OPTION_INTENT_LEDGER: 24,
  G0_CURRENT_CONTROL: 24,
  G1_FINAL_CHECKLIST_ABLATION: 24,
  G2_POSITIVE_COMPACT: 24,
  G3_SITE_CERTIFICATE: 24,
}, "profile allocation");
assertCounts(queue.assignments.map((row) => `${row.questionType}_${row.plan}`), {
  GRAMMAR_ERROR_STANDARD: 48,
  GRAMMAR_ERROR_PREMIUM: 48,
  BLANK_INFERENCE_STANDARD: 48,
  BLANK_INFERENCE_PREMIUM: 36,
}, "cost-cell allocation");
assert.equal(
  queue.assignments.filter(
    (row) => row.profileId === "B1_TYPE_SCOPED_TAIL" && row.plan === "PREMIUM",
  ).length,
  0,
);
assert.equal(totalCents, 4416);
for (const passage of queue.passages) {
  const expected = passage.questionType === "GRAMMAR_ERROR" ? 16 : 14;
  assert.equal(
    queue.assignments.filter((row) => row.passageToken === passage.passageToken).length,
    expected,
  );
}

assert.equal(published.status, "DESIGN_COMPLETE_EXECUTION_BLOCKED");
assert.deepEqual(published.allocation.byType, { GRAMMAR_ERROR: 96, BLANK_INFERENCE: 84 });
assert.deepEqual(published.allocation.byPlan, { STANDARD: 96, PREMIUM: 84 });
assert.deepEqual(published.allocation.byDifficulty, { INTERMEDIATE: 90, KILLER: 90 });
assert.equal(published.allocation.b1PremiumAssignments, 0);
assert.equal(published.queue.assignmentRows, 180);
assert.equal(published.queue.candidateOpportunities, 180);
assert.equal(published.queue.physicalFetchCap, 180);
assert.equal(published.queue.semanticFullQuestionCap, 180);
assert.equal(published.queue.replacementOrTopUpAllowed, false);
assert.equal(published.queue.retryReplayAllowed, false);
assert.deepEqual(published.wireAndTopology.reasoning, {
  enabled: false,
  effort: "none",
  exclude: true,
});
assert.equal(published.wireAndTopology.providerRequireParameters, true);
assert.equal(published.wireAndTopology.questionCount, 1);
assert.equal(published.wireAndTopology.questionSchemaMinItems, 1);
assert.equal(published.wireAndTopology.questionSchemaMaxItems, 1);
assert.deepEqual(published.wireAndTopology.maxOutputTokens, {
  GRAMMAR_ERROR: 6000,
  BLANK_INFERENCE: 4000,
});
assert.equal(published.wireAndTopology.physicalFetchesPerAssignment, 1);
assert.equal(published.wireAndTopology.outerAttemptsPerAssignment, 1);
assert.equal(published.wireAndTopology.sdkRetriesPerAssignment, 0);
assert.equal(published.wireAndTopology.productionParityClaim, false);

const expectedCellReservations = {
  GRAMMAR_ERROR_STANDARD: { calls: 48, usd: 9.6 },
  GRAMMAR_ERROR_PREMIUM: { calls: 48, usd: 20.64 },
  BLANK_INFERENCE_STANDARD: { calls: 48, usd: 6.72 },
  BLANK_INFERENCE_PREMIUM: { calls: 36, usd: 7.2 },
};
assert.deepEqual(published.costReservation.cellReservations, expectedCellReservations);
assert.equal(published.costReservation.totalHardReservationUsd, 44.16);
assert.equal(published.costReservation.providerSideHardSpendCeilingRequired, true);
assert.equal(published.costReservation.priceSnapshotMaxAgeMinutesAtAdmission, 15);
assert.equal(published.authorization.campaignEligibleAssignments, 0);
assert.equal(published.authorization.generationAuthorized, false);
assert.equal(published.authorization.apiCandidateCount, 0);
assert.equal(published.authorization.globalCandidateLimit, 1000);
assert.equal(published.authorization.thisDesignWouldReserveIfAuthorized, 180);
assert.equal(published.safety.modelApiCalls, 0);
assert.equal(published.safety.networkCalls, 0);
assert.equal(published.safety.databaseCalls, 0);
assert.equal(published.safety.secretAccesses, 0);

const holdKeys = Object.keys(published.executionHolds).sort();
assert.deepEqual(holdKeys, [
  "exactWireRegistry",
  "freshPrice",
  "independentAudit",
  "limitedCredential",
  "providerPrivacy",
  "sourceRights",
]);
for (const value of Object.values(published.executionHolds)) {
  assert.match(value, /^BLOCKED_/u);
}

// Public/private boundary: the exact queue must be ignored and untracked.
assert.equal(readFileSync(path.join(designDir, "private/.gitignore"), "utf8"), "*.json\n");
const ignored = spawnSync(
  "git",
  ["check-ignore", "--quiet", "experiments/question-quality-20260715/design/campaign-v5-s1/private/s1-queue-v5.json"],
  { cwd: repoRoot },
);
assert.equal(ignored.status, 0, "private queue is not git-ignored");
const tracked = spawnSync(
  "git",
  ["ls-files", "--error-unmatch", "experiments/question-quality-20260715/design/campaign-v5-s1/private/s1-queue-v5.json"],
  { cwd: repoRoot },
);
assert.notEqual(tracked.status, 0, "private queue is tracked by git");

const releaseFiles = [...manifestFiles.map((file) => path.join(designDir, file)), path.join(designDir, "MANIFEST.sha256")];
const publicRelease = releaseFiles.map((file) => readFileSync(file, "utf8")).join("\n");
const sensitiveValues = new Set();
for (const passage of queue.passages) {
  for (const field of [
    "passageToken",
    "frameId",
    "contentHash",
    "candidateId",
    "sourceRecordId",
    "documentKey",
    "sourceDocumentId",
    "passageContentExact",
    "passageUtf8Sha256",
  ]) {
    if (typeof passage[field] === "string" && passage[field].length >= 8) {
      sensitiveValues.add(passage[field]);
    }
  }
}
for (const assignment of queue.assignments) {
  for (const field of ["assignmentId", "assignmentKey", "orderRank"]) {
    sensitiveValues.add(assignment[field]);
  }
}
for (const value of sensitiveValues) {
  assert.ok(!publicRelease.includes(value), "public artifact leaks a private row value");
}
for (const secretPattern of [
  /AIza[0-9A-Za-z_-]{20,}/u,
  /sk-or-v1-[0-9A-Za-z_-]{20,}/u,
  /(?:OPENROUTER|GEMINI)_API_KEY\s*[:=]\s*["']?[^\s"']{12,}/u,
  /Authorization\s*:\s*Bearer\s+[0-9A-Za-z._-]{12,}/iu,
]) {
  assert.doesNotMatch(publicRelease, secretPattern, "public artifact leaks a credential");
}
assert.ok(!Object.hasOwn(published, "passages"));
assert.ok(!Object.hasOwn(published, "assignments"));

const result = {
  verdict: "PASS_DESIGN_INTEGRITY_EXECUTION_REMAINS_BLOCKED",
  passages: 12,
  historyBinding: "76/76 clean; exact 12/12 development rows joined",
  assignments: 180,
  allocation: {
    grammar: 96,
    blank: 84,
    standard: 96,
    premium: 84,
    intermediate: 90,
    killer: 90,
    b1Premium: 0,
  },
  physicalFetchCap: 180,
  candidateOpportunities: 180,
  totalHardReservationUsd: 44.16,
  privateQueueFileSha256: fileSha256(privatePath),
  privateQueueSemanticSha256: queue.privateQueueSemanticSha256,
  publicArtifactSha256: fileSha256(publicPath),
  designManifestSha256: fileSha256(path.join(designDir, "MANIFEST.sha256")),
  publicPrivateValueLeaks: 0,
  credentialLeaks: 0,
  campaignEligibleAssignments: 0,
  generationAuthorized: false,
  apiCandidateCount: 0,
  auditEvidenceHoldSatisfied: true,
  remainingNonAuditHolds: 5,
};
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
