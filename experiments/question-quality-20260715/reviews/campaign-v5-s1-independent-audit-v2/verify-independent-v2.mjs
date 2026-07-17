import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const designDir = path.join(
  repoRoot,
  "experiments/question-quality-20260715/design/campaign-v5-s1",
);
const corpusRoot = path.join(
  repoRoot,
  "experiments/question-quality-20260715/corpus",
);

const EXPECTED_PREDECESSOR_SEMANTIC_SHA256 =
  "c120ebcc5aea5f83c1c9e97447c2913b0ebf76932e2a0cf91d2e10887a86225e";
const EXPECTED_PREDECESSOR_PRIVATE_FILE_SHA256 =
  "ba2e64ea9989d594147019c3cf88b066266bbeff11eefb74cb8299732af52583";
const EXPECTED_PUBLIC_ARTIFACT_SHA256 =
  "bfe0dff9d5ebfed1eea4f1622d4c7bbecbca2db7172f925a1fc07640d46f8747";
const EXPECTED_DESIGN_MANIFEST_SHA256 =
  "5187e43d2bd4f7ea42bbf1cf165d39aae2909ce10e861296f96045e9406f71dd";

const SEED = "question-quality-s1-campaign-v5-20260715-v1";
const DIFFICULTY_INSTRUCTIONS = Object.freeze({
  INTERMEDIATE: "중급 — 모의고사 중위권 수준, 추론 필요, 패러프레이징 포함",
  KILLER:
    "킬러 — 수능 1등급 컷 수준, 고난도 추론/함축 의미 파악, 복잡한 구문과 어휘, 매력적인 오답",
});
const TYPES = ["GRAMMAR_ERROR", "BLANK_INFERENCE"];
const PLANS = ["STANDARD", "PREMIUM"];
const DIFFICULTIES = ["INTERMEDIATE", "KILLER"];
const PROFILES = Object.freeze({
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
});

const CURRENT_SOURCE_PATHS = Object.freeze([
  "src/app/api/workbench/ai-jobs/question-generation/fast/route.ts",
  "src/trigger/workbench-question-generation.ts",
  "src/app/api/ai/generate-questions-auto/_lib/constants.ts",
  "src/app/api/ai/generate-questions-auto/_lib/run-question-generation.ts",
  "src/lib/atlas-ai.ts",
  "src/lib/atlas-fetch-scope-coordinator.ts",
  "src/lib/atlas-production-assignment-fetch-boundary.ts",
  "src/lib/atlas-research-fetch-boundary.ts",
  "src/lib/question-generation-assignment-budget-policy.ts",
  "src/lib/question-generation-assignment-budget.ts",
  "src/lib/question-generation-llm.ts",
  "src/lib/question-generation-research-profiles.ts",
  "src/lib/question-generation-research-runtime.ts",
  "src/lib/question-generation-research-schema.ts",
  "experiments/question-quality-20260715/harness/question-generation-phase-c-runner.ts",
  "experiments/question-quality-20260715/harness/question-generation-callsite-adapter.ts",
]);

const REQUIRED_PUBLIC_SOURCE_CLOSURE_PATHS = Object.freeze([
  "src/app/api/workbench/ai-jobs/question-generation/fast/route.ts",
  "src/trigger/workbench-question-generation.ts",
  "src/app/api/ai/generate-questions-auto/_lib/constants.ts",
  "src/app/api/ai/generate-questions-auto/_lib/run-question-generation.ts",
  "src/lib/atlas-ai.ts",
  "src/lib/atlas-fetch-scope-coordinator.ts",
  "src/lib/atlas-production-assignment-fetch-boundary.ts",
  "src/lib/atlas-research-fetch-boundary.ts",
  "src/lib/question-generation-llm.ts",
  "src/lib/question-generation-research-profiles.ts",
  "src/lib/question-generation-research-runtime.ts",
  "experiments/question-quality-20260715/harness/question-generation-phase-c-runner.ts",
  "experiments/question-quality-20260715/harness/question-generation-callsite-adapter.ts",
]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function fileSha256(filePath) {
  return sha256(readFileSync(filePath));
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right, "en"))
        .map(([key, child]) => [key, stableValue(child)]),
    );
  }
  return value;
}

function stableStringify(value) {
  return JSON.stringify(stableValue(value));
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

function countBy(values) {
  const counts = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) =>
      left.localeCompare(right, "en"),
    ),
  );
}

function assertManifest(manifestPath, baseDir) {
  const lines = readFileSync(manifestPath, "utf8").trim().split(/\r?\n/gu);
  assert.ok(lines.length > 0, `${manifestPath} is empty`);
  const seen = new Set();
  for (const [index, line] of lines.entries()) {
    const match = /^([a-f0-9]{64})  (.+)$/u.exec(line);
    assert.ok(match, `${manifestPath}:${index + 1} is malformed`);
    assert.ok(!seen.has(match[2]), `${manifestPath} repeats ${match[2]}`);
    seen.add(match[2]);
    const resolved = path.resolve(baseDir, match[2]);
    assert.ok(
      resolved === repoRoot || resolved.startsWith(`${repoRoot}${path.sep}`),
      `${manifestPath} escapes repository: ${match[2]}`,
    );
    assert.equal(fileSha256(resolved), match[1], `${match[2]} manifest drift`);
  }
  return lines.length;
}

function typeCode(type) {
  return type === "GRAMMAR_ERROR" ? "G" : "B";
}

function modelFor(plan) {
  return plan === "STANDARD"
    ? "google/gemini-3.5-flash"
    : "google/gemini-3.1-pro-preview";
}

function tokenCap(type) {
  return type === "GRAMMAR_ERROR" ? 6_000 : 4_000;
}

function callCapCents(type, plan) {
  if (type === "GRAMMAR_ERROR") return plan === "STANDARD" ? 20 : 43;
  return plan === "STANDARD" ? 14 : 20;
}

function sourcePathsFor(type) {
  const name =
    type === "GRAMMAR_ERROR"
      ? "cross-type-grammar-source-frame-v2"
      : "cross-type-blank-source-frame-v2";
  const dir = path.join(corpusRoot, name);
  return {
    dir,
    sourcePrivate: path.join(dir, "private/source-frame-private.json"),
    sourcePublic: path.join(dir, "source-frame-public.json"),
    reconciliation: path.join(dir, "private/reconciliation-and-split-v2.json"),
  };
}

function reconstructPassages(privateQueue) {
  const snapshotPath = path.join(
    corpusRoot,
    "v3/private/input-snapshot.json",
  );
  const historyPrivatePath = path.join(
    corpusRoot,
    "selected-source-history-v1/private/baseline-20260715-0745-private.json",
  );
  const historyPublicPath = path.join(
    corpusRoot,
    "selected-source-history-v1/runs/baseline-20260715-0745-public.json",
  );
  const snapshot = readJson(snapshotPath);
  const historyPrivate = readJson(historyPrivatePath);
  const historyPublic = readJson(historyPublicPath);

  assert.equal(
    snapshot.snapshotHash,
    "c21777c8dcab7f6b46ed15e429fcb7840607e90bcbdd7c02ec607a8db02beb13",
  );
  assert.equal(
    fileSha256(snapshotPath),
    privateQueue.upstreamPrivateSeals.snapshotSha256,
  );
  assert.equal(
    fileSha256(historyPrivatePath),
    privateQueue.upstreamPrivateSeals.selectedSourceHistoryPrivateSha256,
  );
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

  const candidates = new Map(
    snapshot.candidates.map((candidate) => [candidate.id, candidate]),
  );
  assert.equal(candidates.size, snapshot.candidates.length);
  const history = new Map(
    historyPrivate.rows.map((row) => [
      `${row.focusType}|${row.frameId}|${row.contentHash}`,
      row,
    ]),
  );
  assert.equal(history.size, 76);

  const expectedPassages = [];
  for (const type of TYPES) {
    const paths = sourcePathsFor(type);
    const sourcePrivate = readJson(paths.sourcePrivate);
    const sourcePublic = readJson(paths.sourcePublic);
    const reconciliation = readJson(paths.reconciliation);
    assert.equal(sourcePrivate.bindingHash, sourcePublic.bindingHash);
    assert.equal(reconciliation.sourceBindingHash, sourcePublic.bindingHash);
    assert.equal(sourcePrivate.rows.length, sourcePublic.rows.length);
    sourcePrivate.rows.forEach((row, index) => {
      assert.equal(row.frameId, sourcePublic.rows[index].frameId);
      assert.equal(row.contentHash, sourcePublic.rows[index].contentHash);
    });
    assert.equal(
      fileSha256(paths.sourcePrivate),
      privateQueue.upstreamPrivateSeals[type].sourcePrivateSha256,
    );
    assert.equal(
      fileSha256(paths.reconciliation),
      privateQueue.upstreamPrivateSeals[type].reconciliationPrivateSha256,
    );

    const sourceByFrame = new Map(
      sourcePrivate.rows.map((row) => [row.frameId, row]),
    );
    const ledgerByFrame = new Map(
      reconciliation.rows.map((row) => [row.frameId, row]),
    );
    const development = reconciliation.selection.rows.filter(
      (row) => row.split === "development",
    );
    assert.equal(development.length, 6, `${type} development supply`);

    development.forEach((selected, index) => {
      const source = sourceByFrame.get(selected.frameId);
      const ledger = ledgerByFrame.get(selected.frameId);
      assert.ok(source, `${type} source row ${selected.frameId}`);
      assert.ok(ledger, `${type} ledger row ${selected.frameId}`);
      assert.equal(source.contentHash, selected.contentHash);
      assert.equal(ledger.contentHash, selected.contentHash);
      assert.equal(ledger.reviewerAVerdict, "PASS");
      assert.equal(ledger.reviewerBVerdict, "PASS");
      assert.equal(
        ledger.disposition,
        type === "GRAMMAR_ERROR" ? "DUAL_PASS" : "FRAME_PASS_BOTH_LENSES",
      );
      assert.equal(ledger.selectedSplit, "development");
      assert.equal(ledger.campaignEligible, false);

      const candidate = candidates.get(source.candidateId);
      assert.ok(candidate, `${type} snapshot candidate ${source.candidateId}`);
      assert.equal(candidate.sourceRecordId, source.sourceRecordId);
      assert.equal(candidate.document.documentKey, source.documentKey);
      assert.equal(
        candidate.document.sourceId,
        source.sourceId ?? source.sourceDocumentId ?? null,
      );
      if (source.passageText !== undefined) {
        assert.equal(source.passageText, candidate.text);
      }
      assert.equal(sha256(normalizeContent(candidate.text)), selected.contentHash);
      if (candidate.contentHash !== undefined) {
        assert.equal(candidate.contentHash, selected.contentHash);
      }

      const historyRow = history.get(
        `${type}|${selected.frameId}|${selected.contentHash}`,
      );
      assert.ok(historyRow, `${type} history row ${selected.frameId}`);
      assert.equal(historyRow.split, "development");
      assert.equal(historyRow.historyClean, true);
      assert.equal(historyRow.questionCount, 0);
      assert.equal(historyRow.aiQuestionCount, 0);
      assert.equal(historyRow.workbenchJobCount, 0);

      expectedPassages.push({
        passageToken: `${typeCode(type)}-DEV-${String(index + 1).padStart(2, "0")}`,
        questionType: type,
        frameId: selected.frameId,
        contentHash: selected.contentHash,
        split: "development",
        topic: selected.topic,
        discourse: selected.discourse,
        wordBand: selected.wordBand,
        candidateId: source.candidateId,
        sourceRecordId: source.sourceRecordId,
        documentKey: source.documentKey,
        sourceDocumentId: source.sourceId ?? source.sourceDocumentId ?? null,
        passageContentExact: candidate.text,
        passageUtf8Bytes: Buffer.byteLength(candidate.text, "utf8"),
        passageUtf8Sha256: sha256(Buffer.from(candidate.text, "utf8")),
        normalizedContentHashVerified: true,
        dualPassVerified: true,
        historyBaseline: {
          label: "baseline-20260715-0745",
          historyClean: historyRow.historyClean,
          questionCount: historyRow.questionCount,
          aiQuestionCount: historyRow.aiQuestionCount,
          workbenchJobCount: historyRow.workbenchJobCount,
          matchedPassageCount: historyRow.matchedPassageCount,
        },
        campaignEligible: false,
      });
    });
  }

  assert.equal(expectedPassages.length, 12);
  assert.equal(new Set(expectedPassages.map((row) => row.contentHash)).size, 12);
  assert.deepEqual(privateQueue.passages, expectedPassages);
  return { expectedPassages, historyPublic };
}

function reconstructAssignments(privateQueue, passages) {
  const cells = [];
  for (const passage of passages) {
    const type = passage.questionType;
    for (const profileId of PROFILES[type]) {
      for (const plan of PLANS) {
        if (profileId === "B1_TYPE_SCOPED_TAIL" && plan === "PREMIUM") continue;
        for (const difficulty of DIFFICULTIES) {
          const assignmentKey = [
            type,
            passage.frameId,
            profileId,
            plan,
            difficulty,
          ].join("|");
          const orderRank = sha256(`${SEED}|order|${assignmentKey}`);
          cells.push({
            assignmentKey,
            orderRank,
            passageToken: passage.passageToken,
            questionType: type,
            profileId,
            plan,
            difficulty,
            modelId: modelFor(plan),
            request: {
              plan: [
                {
                  subType: type,
                  count: 1,
                  reason: "S1 v5 fixed profile-screen assignment",
                  targetPoints: [],
                },
              ],
              schoolType: "고등학교",
              gradeInfo: "2학년",
              passageContentRef: passage.passageToken,
              teacherIntentBlock: "",
              analysisContext: "",
              diffLabel: difficulty,
              diffInstruction: DIFFICULTY_INSTRUCTIONS[difficulty],
              generationPlan: plan,
              customPrompt: "",
            },
            wireContract: {
              providerRequireParameters: true,
              reasoning: { enabled: false, effort: "none", exclude: true },
              questionsMinItems: 1,
              questionsMaxItems: 1,
              maxOutputTokens: tokenCap(type),
            },
            admission: {
              candidateOpportunityCap: 1,
              physicalFetchCap: 1,
              fullQuestionSemanticCap: 1,
              outerAttempts: 1,
              sdkRetries: 0,
              qualityMode: "strict",
              attemptIndex: 0,
              perCallUsdCapCents: callCapCents(type, plan),
              debitGlobalCandidateBudgetOnStartedOpportunity: 1,
            },
            topology: {
              runner: "runPhaseCQuestionGenerationAssignment",
              directSingleShotMechanismScreen: true,
              triggerTaskUsed: false,
              ladderUsed: false,
              repairUsed: false,
              solverUsed: false,
              fallbackUsed: false,
              salvageUsed: false,
            },
            replacementAllowed: false,
            topUpAllowed: false,
            generationAuthorized: false,
          });
        }
      }
    }
  }
  cells.sort(
    (left, right) =>
      left.orderRank.localeCompare(right.orderRank, "en") ||
      left.assignmentKey.localeCompare(right.assignmentKey, "en"),
  );
  const expected = cells.map((cell, index) => ({
    queueOrdinal: index + 1,
    assignmentId: `S1V5-${String(index + 1).padStart(3, "0")}-${cell.orderRank.slice(0, 12)}`,
    ...cell,
  }));
  assert.deepEqual(privateQueue.assignments, expected);
  assert.equal(new Set(expected.map((row) => row.assignmentKey)).size, 180);
  assert.equal(new Set(expected.map((row) => row.assignmentId)).size, 180);
  assert.equal(new Set(expected.map((row) => row.orderRank)).size, 180);
  return expected;
}

function assertSourceClosure(publicArtifact) {
  const files = publicArtifact.upstream.files;
  assert.ok(Array.isArray(files) && files.length > 0);
  assert.equal(new Set(files.map((entry) => entry.role)).size, files.length);
  assert.equal(new Set(files.map((entry) => entry.path)).size, files.length);
  for (const entry of files) {
    const filePath = path.join(repoRoot, entry.path);
    assert.equal(statSync(filePath).size, entry.bytes, `${entry.path} byte drift`);
    assert.equal(fileSha256(filePath), entry.sha256, `${entry.path} hash drift`);
  }
  assert.equal(
    sha256(stableStringify(files)),
    publicArtifact.upstream.sourceClosureSha256,
  );
  const closurePaths = new Set(files.map((entry) => entry.path));
  for (const required of REQUIRED_PUBLIC_SOURCE_CLOSURE_PATHS) {
    assert.ok(closurePaths.has(required), `source closure omits ${required}`);
  }
}

function assertStaticWireSources() {
  const read = (relativePath) =>
    readFileSync(path.join(repoRoot, relativePath), "utf8");
  const fast = read(
    "src/app/api/workbench/ai-jobs/question-generation/fast/route.ts",
  );
  const trigger = read("src/trigger/workbench-question-generation.ts");
  for (const [label, source] of [
    ["fast", fast],
    ["trigger", trigger],
  ]) {
    assert.match(source, /runWithQuestionGenerationAssignmentBudget/u, label);
    assert.match(source, /runQuestionGenerationWithEmptyRetry/u, label);
    assert.match(source, /DIFF_DESCRIPTION\[diffLabel\]/u, label);
    assert.ok(
      (source.includes('"중학교"') && source.includes('"고등학교"')) ||
        (source.includes('"\\uc911\\ud559\\uad50"') &&
          source.includes('"\\uace0\\ub4f1\\ud559\\uad50"')),
      `${label} school label mapping drift`,
    );
    assert.ok(
      /`\$\{[^}]+\}학년`/u.test(source) ||
        /`\$\{[^}]+\}\\ud559\\ub144`/u.test(source),
      `${label} grade label mapping drift`,
    );
  }
  assert.match(fast, /route:\s*"FAST"/u);
  assert.match(trigger, /route:\s*"TRIGGER"/u);

  const constants = read(
    "src/app/api/ai/generate-questions-auto/_lib/constants.ts",
  );
  for (const value of Object.values(DIFFICULTY_INSTRUCTIONS)) {
    assert.ok(constants.includes(value), `difficulty instruction drift: ${value}`);
  }

  const atlas = read("src/lib/atlas-ai.ts");
  assert.match(
    atlas,
    /fetch:\s*atlasProductionAssignmentFetch/u,
  );
  assert.match(atlas, /enabled:\s*false[\s\S]*effort:\s*"none"[\s\S]*exclude:\s*true/u);
  assert.match(atlas, /require_parameters:\s*true/u);
  assert.match(atlas, /"google\/gemini-3\.1-pro-preview"/u);

  const productionBoundary = read(
    "src/lib/atlas-production-assignment-fetch-boundary.ts",
  );
  assert.match(
    productionBoundary,
    /createAtlasProductionAssignmentFetchDispatcher\(atlasResearchFetch\)/u,
  );
  assert.match(productionBoundary, /if \(!internal\) return delegate\(input, init\)/u);

  const runtime = read("src/lib/question-generation-research-runtime.ts");
  for (const contract of [
    /applicationMaxRetries:\s*0/u,
    /sdkMaxRetries:\s*0/u,
    /outerMaxAttempts:\s*1/u,
    /ladderParseMaxRetries:\s*0/u,
    /allowStructuredRepair:\s*false/u,
  ]) {
    assert.match(runtime, contract);
  }

  const profiles = read("src/lib/question-generation-research-profiles.ts");
  assert.match(profiles, /GRAMMAR_ERROR"\s*\?\s*6_000\s*:\s*4_000/u);
  assert.match(profiles, /B1_TYPE_SCOPED_TAIL PREMIUM is byte-identical to B0/u);

  const llm = read("src/lib/question-generation-llm.ts");
  assert.match(llm, /maxRetries:\s*effectiveSdkMaxRetries/u);
  assert.match(llm, /maxOutputTokens:\s*maxTokens/u);

  const runner = read(
    "experiments/question-quality-20260715/harness/question-generation-phase-c-runner.ts",
  );
  assert.match(runner, /runQuestionGeneration\(generationWithUsage/u);
  assert.match(runner, /qualityMode:\s*"strict"/u);
  assert.match(runner, /attemptIndex:\s*0/u);
  assert.match(runner, /attempts:\s*1/u);
}

function assertPrivacy(publicRaw, privateQueue) {
  const sensitive = new Set();
  for (const passage of privateQueue.passages) {
    for (const key of [
      "frameId",
      "contentHash",
      "candidateId",
      "sourceRecordId",
      "documentKey",
      "sourceDocumentId",
      "passageContentExact",
      "passageUtf8Sha256",
      "passageToken",
    ]) {
      const value = passage[key];
      if (typeof value === "string" && value.length >= 8) sensitive.add(value);
    }
  }
  for (const assignment of privateQueue.assignments) {
    for (const key of ["assignmentId", "assignmentKey", "orderRank"]) {
      const value = assignment[key];
      if (typeof value === "string" && value.length >= 8) sensitive.add(value);
    }
  }
  const leaks = [...sensitive].filter((value) => publicRaw.includes(value));
  assert.deepEqual(leaks, [], "public artifact contains private row values");
  assert.doesNotMatch(publicRaw, /AIza[0-9A-Za-z_-]{20,}/u);
  assert.doesNotMatch(publicRaw, /sk-[0-9A-Za-z_-]{20,}/u);
  assert.doesNotMatch(publicRaw, /Bearer\s+[0-9A-Za-z._-]{12,}/iu);

  const privateRelative = path.relative(
    repoRoot,
    path.join(designDir, "private/s1-queue-v5.json"),
  );
  const ignored = spawnSync(
    "git",
    ["check-ignore", "-q", privateRelative],
    { cwd: repoRoot, encoding: "utf8" },
  );
  assert.equal(ignored.status, 0, "private queue is not git-ignored");
  const tracked = spawnSync(
    "git",
    ["ls-files", "--error-unmatch", privateRelative],
    { cwd: repoRoot, encoding: "utf8" },
  );
  assert.notEqual(tracked.status, 0, "private queue is git-tracked");
}

function currentSourceHashes() {
  return Object.fromEntries(
    CURRENT_SOURCE_PATHS.map((relativePath) => [
      relativePath,
      fileSha256(path.join(repoRoot, relativePath)),
    ]),
  );
}

function buildObservedResult() {
  const publicPath = path.join(designDir, "campaign-v5-s1.json");
  const privatePath = path.join(designDir, "private/s1-queue-v5.json");
  const manifestPath = path.join(designDir, "MANIFEST.sha256");
  const publicRaw = readFileSync(publicPath, "utf8");
  const privateRaw = readFileSync(privatePath, "utf8");
  const publicArtifact = JSON.parse(publicRaw);
  const privateQueue = JSON.parse(privateRaw);

  assert.equal(fileSha256(publicPath), EXPECTED_PUBLIC_ARTIFACT_SHA256);
  assert.equal(fileSha256(manifestPath), EXPECTED_DESIGN_MANIFEST_SHA256);
  assert.equal(
    fileSha256(privatePath),
    EXPECTED_PREDECESSOR_PRIVATE_FILE_SHA256,
  );
  assertManifest(manifestPath, designDir);

  const privateCore = { ...privateQueue };
  delete privateCore.privateQueueSemanticSha256;
  const recomputedSemantic = sha256(stableStringify(privateCore));
  assert.equal(recomputedSemantic, privateQueue.privateQueueSemanticSha256);
  assert.equal(recomputedSemantic, EXPECTED_PREDECESSOR_SEMANTIC_SHA256);
  assert.equal(publicArtifact.queue.privateQueueSemanticSha256, recomputedSemantic);
  assert.equal(
    publicArtifact.queue.privateQueueFileSha256,
    fileSha256(privatePath),
  );
  assert.equal(
    publicArtifact.queue.privateQueueFileBytes,
    Buffer.byteLength(privateRaw, "utf8"),
  );

  const { expectedPassages, historyPublic } = reconstructPassages(privateQueue);
  const assignments = reconstructAssignments(privateQueue, expectedPassages);
  assertSourceClosure(publicArtifact);
  assertStaticWireSources();
  assertPrivacy(publicRaw, privateQueue);

  assert.equal(privateQueue.schemaVersion, "question-quality-s1-campaign-v5-private-queue-v1");
  assert.equal(privateQueue.status, "FROZEN_DESIGN_QUEUE_NOT_AUTHORIZED");
  assert.equal(privateQueue.seed, SEED);
  assert.equal(privateQueue.noReplacementOrTopUp, true);
  assert.equal(privateQueue.campaignEligibleAssignments, 0);
  assert.equal(privateQueue.generationAuthorized, false);
  assert.equal(privateQueue.safety.modelApiCalls, 0);
  assert.equal(privateQueue.safety.networkCalls, 0);
  assert.equal(privateQueue.safety.databaseCalls, 0);
  assert.equal(privateQueue.safety.fullQuestionCandidatesGenerated, 0);
  assert.equal(privateQueue.safety.globalApiCandidateCount, 0);
  assert.equal(assignments.filter((row) => row.generationAuthorized).length, 0);

  assert.equal(publicArtifact.status, "DESIGN_COMPLETE_EXECUTION_BLOCKED");
  assert.equal(publicArtifact.queue.assignmentRows, 180);
  assert.equal(publicArtifact.queue.candidateOpportunities, 180);
  assert.equal(publicArtifact.queue.physicalFetchCap, 180);
  assert.equal(publicArtifact.queue.semanticFullQuestionCap, 180);
  assert.equal(publicArtifact.queue.replacementOrTopUpAllowed, false);
  assert.equal(publicArtifact.queue.retryReplayAllowed, false);
  assert.equal(publicArtifact.authorization.campaignEligibleAssignments, 0);
  assert.equal(publicArtifact.authorization.generationAuthorized, false);
  assert.equal(publicArtifact.authorization.apiCandidateCount, 0);
  assert.equal(publicArtifact.authorization.globalCandidateLimit, 1_000);
  assert.equal(publicArtifact.safety.modelApiCalls, 0);
  assert.equal(publicArtifact.safety.networkCalls, 0);
  assert.equal(publicArtifact.safety.databaseCalls, 0);
  assert.equal(publicArtifact.safety.secretAccesses, 0);
  assert.equal(publicArtifact.safety.fullQuestionCandidatesGenerated, 0);
  assert.equal(publicArtifact.safety.apiCandidateCount, 0);

  const allocation = {
    grammar: assignments.filter((row) => row.questionType === "GRAMMAR_ERROR").length,
    blank: assignments.filter((row) => row.questionType === "BLANK_INFERENCE").length,
    standard: assignments.filter((row) => row.plan === "STANDARD").length,
    premium: assignments.filter((row) => row.plan === "PREMIUM").length,
    intermediate: assignments.filter((row) => row.difficulty === "INTERMEDIATE").length,
    killer: assignments.filter((row) => row.difficulty === "KILLER").length,
    b1Premium: assignments.filter(
      (row) => row.profileId === "B1_TYPE_SCOPED_TAIL" && row.plan === "PREMIUM",
    ).length,
  };
  assert.deepEqual(allocation, {
    grammar: 96,
    blank: 84,
    standard: 96,
    premium: 84,
    intermediate: 90,
    killer: 90,
    b1Premium: 0,
  });
  assert.deepEqual(publicArtifact.allocation.byType, {
    GRAMMAR_ERROR: 96,
    BLANK_INFERENCE: 84,
  });
  assert.deepEqual(publicArtifact.allocation.byPlan, {
    STANDARD: 96,
    PREMIUM: 84,
  });
  assert.deepEqual(publicArtifact.allocation.byDifficulty, {
    INTERMEDIATE: 90,
    KILLER: 90,
  });
  assert.deepEqual(
    publicArtifact.allocation.byProfile,
    countBy(assignments.map((row) => row.profileId)),
  );
  assert.deepEqual(
    publicArtifact.allocation.byModel,
    countBy(assignments.map((row) => row.modelId)),
  );

  const cell = (type, plan) =>
    assignments.filter((row) => row.questionType === type && row.plan === plan);
  const costCells = {
    grammarStandard: cell("GRAMMAR_ERROR", "STANDARD"),
    grammarPremium: cell("GRAMMAR_ERROR", "PREMIUM"),
    blankStandard: cell("BLANK_INFERENCE", "STANDARD"),
    blankPremium: cell("BLANK_INFERENCE", "PREMIUM"),
  };
  const reservation = Object.fromEntries(
    Object.entries(costCells).map(([key, rows]) => [
      key,
      {
        calls: rows.length,
        capUsd: rows[0].admission.perCallUsdCapCents / 100,
        reservedUsd:
          rows.reduce(
            (sum, row) => sum + row.admission.perCallUsdCapCents,
            0,
          ) / 100,
      },
    ]),
  );
  const totalHardReservationUsd =
    assignments.reduce(
      (sum, row) => sum + row.admission.perCallUsdCapCents,
      0,
    ) / 100;
  assert.equal(totalHardReservationUsd, 44.16);
  assert.equal(publicArtifact.costReservation.totalHardReservationUsd, 44.16);
  assert.equal(publicArtifact.costReservation.priceSnapshotMaxAgeMinutesAtAdmission, 15);

  const executionHolds = publicArtifact.executionHolds;
  assert.match(executionHolds.sourceRights, /^BLOCKED_/u);
  assert.match(executionHolds.providerPrivacy, /^BLOCKED_/u);
  assert.match(executionHolds.limitedCredential, /^BLOCKED_/u);
  assert.match(executionHolds.freshPrice, /^BLOCKED_/u);
  assert.match(executionHolds.exactWireRegistry, /^BLOCKED_/u);

  return {
    schemaVersion: "campaign-v5-s1-independent-audit-v2",
    verdict: "PASS_DESIGN_INTEGRITY_EXECUTION_REMAINS_BLOCKED",
    scope:
      "Offline independent reconstruction of the rebuilt S1 queue and current call/wire source closure; no efficacy or production-topology claim",
    passages: expectedPassages.length,
    historyBinding: {
      selectedRows: historyPublic.selectedRows,
      historyCleanRows: historyPublic.historyCleanRows,
      exposedRows: historyPublic.exposedRows,
      exactDevelopmentRowsJoined: expectedPassages.length,
      grammarDevelopmentRows: expectedPassages.filter(
        (row) => row.questionType === "GRAMMAR_ERROR",
      ).length,
      blankDevelopmentRows: expectedPassages.filter(
        (row) => row.questionType === "BLANK_INFERENCE",
      ).length,
    },
    assignments: assignments.length,
    allocation,
    wire: {
      staticSourceContractPassed: true,
      exactWireRegistryMaterialized: false,
      standardModel: "google/gemini-3.5-flash",
      premiumModel: "google/gemini-3.1-pro-preview",
      reasoningEnabled: false,
      reasoningEffort: "none",
      reasoningExcluded: true,
      providerRequireParameters: true,
      questionsPerAssignment: 1,
      grammarMaxOutputTokens: 6_000,
      blankMaxOutputTokens: 4_000,
      candidateOpportunities: 180,
      physicalFetchCap: 180,
      sdkRetriesPerAssignment: 0,
      outerAttemptsPerAssignment: 1,
    },
    reservation: { ...reservation, totalHardReservationUsd },
    semanticDrift: {
      predecessorPrivateQueueFileSha256:
        EXPECTED_PREDECESSOR_PRIVATE_FILE_SHA256,
      currentPrivateQueueFileSha256: fileSha256(privatePath),
      fileBytesUnchanged: true,
      predecessorSemanticSha256: EXPECTED_PREDECESSOR_SEMANTIC_SHA256,
      currentSemanticSha256: recomputedSemantic,
      semanticQueueUnchanged: true,
      semanticQueueUnaffectedBySourceClosureRepair: true,
    },
    hashes: {
      publicArtifactSha256: fileSha256(publicPath),
      designManifestSha256: fileSha256(manifestPath),
      sourceClosureSha256: publicArtifact.upstream.sourceClosureSha256,
      currentSourceHashes: currentSourceHashes(),
    },
    privacy: {
      privateQueueGitIgnored: true,
      privateQueueGitTracked: false,
      publicPrivateValueLeaks: 0,
      credentialLeaks: 0,
    },
    authorization: {
      campaignEligibleAssignments: 0,
      generationAuthorized: false,
      apiCandidateCount: 0,
      globalCandidateLimit: 1_000,
      independentAuditHoldSatisfiedByThisArtifact: true,
      remainingExternalHolds: 5,
    },
    remainingExternalHolds: [
      "documented source-processing rights",
      "current provider privacy/retention and allow-list attestation",
      "separate limited credential with provider-side hard ceiling <= 44.16 USD",
      "exact endpoint price snapshot no older than 15 minutes at admission",
      "materialized 180-row exact-wire controller registry and preflight",
    ],
    safety: {
      modelApiCalls: 0,
      networkCalls: 0,
      databaseCalls: 0,
      secretAccesses: 0,
      fullQuestionCandidatesGenerated: 0,
      apiCandidateCount: 0,
      productionFilesEdited: 0,
      privateQueueSemanticEdits: 0,
    },
  };
}

const observed = buildObservedResult();
if (process.argv.includes("--print-observed")) {
  process.stdout.write(`${JSON.stringify(observed, null, 2)}\n`);
} else {
  const resultPath = path.join(here, "audit-result.json");
  const expected = readJson(resultPath);
  assert.deepEqual(observed, expected);

  assertManifest(path.join(here, "MANIFEST.sha256"), here);
  process.stdout.write(
    `${JSON.stringify(
      {
        verdict: observed.verdict,
        passages: observed.passages,
        assignments: observed.assignments,
        semanticQueueUnchanged: observed.semanticDrift.semanticQueueUnchanged,
        remainingExternalHolds: observed.authorization.remainingExternalHolds,
        apiCandidateCount: observed.authorization.apiCandidateCount,
      },
      null,
      2,
    )}\n`,
  );
}
