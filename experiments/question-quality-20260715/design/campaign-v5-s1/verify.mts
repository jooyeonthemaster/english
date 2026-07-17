import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as constantsModule from "@/app/api/ai/generate-questions-auto/_lib/constants";

import { buildCampaignV5S1 } from "./build.mjs";

const constants =
  (constantsModule as unknown as { default?: typeof constantsModule }).default ??
  constantsModule;
const { DIFF_DESCRIPTION } = constants;

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const SEED = "question-quality-s1-campaign-v5-20260715-v1";
const TYPES = ["GRAMMAR_ERROR", "BLANK_INFERENCE"] as const;
const PLANS = ["STANDARD", "PREMIUM"] as const;
const DIFFICULTIES = ["INTERMEDIATE", "KILLER"] as const;
const GRAMMAR_PROFILES = [
  "G0_CURRENT_CONTROL",
  "G1_FINAL_CHECKLIST_ABLATION",
  "G2_POSITIVE_COMPACT",
  "G3_SITE_CERTIFICATE",
] as const;
const BLANK_PROFILES = [
  "B0_CURRENT_CONTROL",
  "B1_TYPE_SCOPED_TAIL",
  "B2_POSITIVE_COMPACT",
  "B3_OPTION_INTENT_LEDGER",
] as const;
const EXPECTED_MANIFEST_FILES = [
  "build.mts",
  "verify.mts",
  "tsconfig.json",
  "README.md",
  "campaign-v5-s1.json",
  "private/.gitignore",
] as const;
const EXPECTED_UPSTREAM_MANIFESTS = [
  {
    path: "experiments/question-quality-20260715/corpus/cross-type-blank-source-frame-v2/RECONCILIATION-MANIFEST.sha256",
    base: repoRoot,
    sha256: "b3b9fefd73c4e33bae1909aeb783910d9601a170848f3629852ea1a21f94e27f",
  },
  {
    path: "experiments/question-quality-20260715/corpus/cross-type-grammar-source-frame-v2/RECONCILIATION-MANIFEST.sha256",
    base: path.join(
      repoRoot,
      "experiments/question-quality-20260715/corpus/cross-type-grammar-source-frame-v2",
    ),
    sha256: "ce735aed8eb7f9174e2df7b57ec8de2d0e1c8a110e697a6a62d36214de059af9",
  },
  {
    path: "experiments/question-quality-20260715/corpus/selected-source-history-v1/runs/baseline-20260715-0745-MANIFEST.sha256",
    base: path.join(
      repoRoot,
      "experiments/question-quality-20260715/corpus/selected-source-history-v1",
    ),
    sha256: "8239f106e6164419c06e572a2e12065bf43baae32e80ccd37553529e2b403632",
  },
  {
    path: "experiments/question-quality-20260715/reviews/prompt-profile-integration-audit-v2/MANIFEST.sha256",
    base: path.join(
      repoRoot,
      "experiments/question-quality-20260715/reviews/prompt-profile-integration-audit-v2",
    ),
    sha256: "481031ce4fd6023682a6d986c5030ac171f9f4a7fd7c578944824b7a2527b60e",
  },
] as const;

type QuestionType = (typeof TYPES)[number];
type Plan = (typeof PLANS)[number];
type Difficulty = (typeof DIFFICULTIES)[number];

interface PrivatePassage {
  passageToken: string;
  questionType: QuestionType;
  frameId: string;
  contentHash: string;
  split: string;
  candidateId: string;
  sourceRecordId: string | null;
  documentKey: string;
  sourceDocumentId: string | null;
  passageContentExact: string;
  passageUtf8Bytes: number;
  passageUtf8Sha256: string;
  normalizedContentHashVerified: boolean;
  dualPassVerified: boolean;
  historyBaseline: {
    label: string;
    historyClean: boolean;
    questionCount: number;
    aiQuestionCount: number;
    workbenchJobCount: number;
  };
  campaignEligible: boolean;
}

interface PrivateAssignment {
  queueOrdinal: number;
  assignmentId: string;
  assignmentKey: string;
  orderRank: string;
  passageToken: string;
  questionType: QuestionType;
  profileId: string;
  plan: Plan;
  difficulty: Difficulty;
  modelId: string;
  request: {
    plan: Array<{
      subType: string;
      count: number;
      reason: string;
      targetPoints: string[];
    }>;
    schoolType: string;
    gradeInfo: string;
    passageContentRef: string;
    teacherIntentBlock: string;
    analysisContext: string;
    diffLabel: string;
    diffInstruction: string;
    generationPlan: string;
    customPrompt: string;
  };
  wireContract: {
    providerRequireParameters: boolean;
    reasoning: { enabled: boolean; effort: string; exclude: boolean };
    questionsMinItems: number;
    questionsMaxItems: number;
    maxOutputTokens: number;
  };
  admission: {
    candidateOpportunityCap: number;
    physicalFetchCap: number;
    fullQuestionSemanticCap: number;
    outerAttempts: number;
    sdkRetries: number;
    qualityMode: string;
    attemptIndex: number;
    perCallUsdCapCents: number;
    debitGlobalCandidateBudgetOnStartedOpportunity: number;
  };
  topology: Record<string, boolean | string>;
  replacementAllowed: boolean;
  topUpAllowed: boolean;
  generationAuthorized: boolean;
}

interface PrivateQueue {
  schemaVersion: string;
  status: string;
  seed: string;
  passages: PrivatePassage[];
  assignments: PrivateAssignment[];
  noReplacementOrTopUp: boolean;
  campaignEligibleAssignments: number;
  generationAuthorized: boolean;
  safety: Record<string, number>;
  privateQueueSemanticSha256: string;
  [key: string]: unknown;
}

interface SourcePrivateRow {
  frameId: string;
  contentHash: string;
  candidateId: string;
  sourceRecordId: string | null;
  documentKey: string;
  sourceId?: string | null;
  sourceDocumentId?: string | null;
  passageText?: string;
}

interface ReconciliationPrivate {
  selection: {
    rows: Array<{
      frameId: string;
      contentHash: string;
      split: string;
    }>;
  };
  rows: Array<{
    frameId: string;
    contentHash: string;
    disposition: string;
    selectedSplit: string | null;
    campaignEligible: boolean;
  }>;
}

interface HistoryRow {
  focusType: QuestionType;
  frameId: string;
  contentHash: string;
  split: string;
  historyClean: boolean;
  questionCount: number;
  aiQuestionCount: number;
  workbenchJobCount: number;
}

const sha256 = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const fileSha256 = (filePath: string) => sha256(readFileSync(filePath));
const readJson = <T,>(filePath: string): T =>
  JSON.parse(readFileSync(filePath, "utf8")) as T;

function stableStringify(value: unknown): string {
  const sort = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(sort);
    if (input && typeof input === "object") {
      return Object.fromEntries(
        Object.entries(input as Record<string, unknown>)
          .sort(([left], [right]) => left.localeCompare(right, "en"))
          .map(([key, child]) => [key, sort(child)]),
      );
    }
    return input;
  };
  return JSON.stringify(sort(value));
}

function normalizeContent(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/\r\n?/gu, "\n")
    .replace(/[\t\f\v ]+/gu, " ")
    .replace(/ *\n+ */gu, "\n")
    .replace(/\s+/gu, " ")
    .trim();
}

function verifyManifest(
  manifestPath: string,
  base: string,
  expectedHash?: string,
): string[] {
  if (expectedHash) assert.equal(fileSha256(manifestPath), expectedHash);
  const lines = readFileSync(manifestPath, "utf8").trim().split(/\r?\n/gu);
  return lines.map((line, index) => {
    const match = /^([a-f0-9]{64})  (.+)$/u.exec(line);
    assert.ok(match, `manifest line ${index + 1} malformed: ${manifestPath}`);
    const resolved = path.resolve(base, match[2]);
    assert.ok(
      resolved.startsWith(`${repoRoot}${path.sep}`),
      `manifest path escaped repository: ${match[2]}`,
    );
    assert.equal(fileSha256(resolved), match[1], `${match[2]} changed`);
    return match[2];
  });
}

function countBy(values: string[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const value of values) result[value] = (result[value] ?? 0) + 1;
  return Object.fromEntries(
    Object.entries(result).sort(([left], [right]) => left.localeCompare(right, "en")),
  );
}

function usdCap(type: QuestionType, plan: Plan): number {
  if (type === "GRAMMAR_ERROR") return plan === "STANDARD" ? 20 : 43;
  return plan === "STANDARD" ? 14 : 20;
}

function model(plan: Plan): string {
  return plan === "STANDARD"
    ? "google/gemini-3.5-flash"
    : "google/gemini-3.1-pro-preview";
}

function profiles(type: QuestionType): readonly string[] {
  return type === "GRAMMAR_ERROR" ? GRAMMAR_PROFILES : BLANK_PROFILES;
}

for (const manifest of EXPECTED_UPSTREAM_MANIFESTS) {
  verifyManifest(path.join(repoRoot, manifest.path), manifest.base, manifest.sha256);
}

const manifestFiles = verifyManifest(path.join(here, "MANIFEST.sha256"), here);
assert.deepEqual(manifestFiles, [...EXPECTED_MANIFEST_FILES]);

const privatePath = path.join(here, "private/s1-queue-v5.json");
const publicPath = path.join(here, "campaign-v5-s1.json");
const privateRaw = readFileSync(privatePath, "utf8");
const publicRaw = readFileSync(publicPath, "utf8");
const queue = JSON.parse(privateRaw) as PrivateQueue;
const publicArtifact = JSON.parse(publicRaw) as Record<string, unknown>;
const publicQueue = publicArtifact.queue as Record<string, unknown>;

assert.equal(queue.schemaVersion, "question-quality-s1-campaign-v5-private-queue-v1");
assert.equal(queue.status, "FROZEN_DESIGN_QUEUE_NOT_AUTHORIZED");
assert.equal(queue.seed, SEED);
assert.equal(queue.passages.length, 12);
assert.equal(queue.assignments.length, 180);
assert.equal(queue.noReplacementOrTopUp, true);
assert.equal(queue.campaignEligibleAssignments, 0);
assert.equal(queue.generationAuthorized, false);
assert.equal(queue.safety.modelApiCalls, 0);
assert.equal(queue.safety.networkCalls, 0);
assert.equal(queue.safety.databaseCalls, 0);
assert.equal(queue.safety.globalApiCandidateCount, 0);
assert.equal(publicQueue.privateQueueFileSha256, fileSha256(privatePath));
assert.equal(publicQueue.privateQueueFileBytes, Buffer.byteLength(privateRaw, "utf8"));

const {
  privateQueueSemanticSha256: _privateQueueSemanticSha256,
  ...semanticCore
} = queue;
void _privateQueueSemanticSha256;
assert.equal(queue.privateQueueSemanticSha256, sha256(stableStringify(semanticCore)));
assert.equal(publicQueue.privateQueueSemanticSha256, queue.privateQueueSemanticSha256);

const historyPrivate = readJson<{ rows: HistoryRow[] }>(
  path.join(
    repoRoot,
    "experiments/question-quality-20260715/corpus/selected-source-history-v1/private/baseline-20260715-0745-private.json",
  ),
);
const historyPublic = readJson<{
  selectedRows: number;
  historyCleanRows: number;
  exposedRows: number;
}>(
  path.join(
    repoRoot,
    "experiments/question-quality-20260715/corpus/selected-source-history-v1/runs/baseline-20260715-0745-public.json",
  ),
);
assert.equal(historyPublic.selectedRows, 76);
assert.equal(historyPublic.historyCleanRows, 76);
assert.equal(historyPublic.exposedRows, 0);
assert.equal(historyPrivate.rows.length, 76);
assert.equal(historyPrivate.rows.every((row) => row.historyClean), true);
assert.equal(
  historyPrivate.rows.every(
    (row) =>
      row.questionCount === 0 &&
      row.aiQuestionCount === 0 &&
      row.workbenchJobCount === 0,
  ),
  true,
);
const historyKeys = new Set(
  historyPrivate.rows.map(
    (row) => `${row.focusType}|${row.frameId}|${row.contentHash}|${row.split}`,
  ),
);

const snapshot = readJson<{
  candidates: Array<{
    id: string;
    text: string;
    sourceRecordId: string | null;
    document: { documentKey: string; sourceId: string | null };
  }>;
}>(
  path.join(
    repoRoot,
    "experiments/question-quality-20260715/corpus/v3/private/input-snapshot.json",
  ),
);
const candidates = new Map(snapshot.candidates.map((candidate) => [candidate.id, candidate]));
assert.equal(candidates.size, snapshot.candidates.length);

const expectedPassageKeys = new Set<string>();
for (const type of TYPES) {
  const sourceDir = path.join(
    repoRoot,
    `experiments/question-quality-20260715/corpus/cross-type-${
      type === "GRAMMAR_ERROR" ? "grammar" : "blank"
    }-source-frame-v2`,
  );
  const source = readJson<{ rows: SourcePrivateRow[] }>(
    path.join(sourceDir, "private/source-frame-private.json"),
  );
  const reconciliation = readJson<ReconciliationPrivate>(
    path.join(sourceDir, "private/reconciliation-and-split-v2.json"),
  );
  const sourceByFrame = new Map(source.rows.map((row) => [row.frameId, row]));
  const ledgerByFrame = new Map(
    reconciliation.rows.map((row) => [row.frameId, row]),
  );
  const selected = reconciliation.selection.rows.filter(
    (row) => row.split === "development",
  );
  assert.equal(selected.length, 6);
  for (const row of selected) {
    const sourceRow = sourceByFrame.get(row.frameId);
    const ledger = ledgerByFrame.get(row.frameId);
    assert.ok(sourceRow);
    assert.ok(ledger);
    assert.equal(sourceRow.contentHash, row.contentHash);
    assert.equal(ledger.contentHash, row.contentHash);
    assert.equal(
      ledger.disposition,
      type === "GRAMMAR_ERROR" ? "DUAL_PASS" : "FRAME_PASS_BOTH_LENSES",
    );
    assert.equal(ledger.selectedSplit, "development");
    assert.equal(ledger.campaignEligible, false);
    expectedPassageKeys.add(`${type}|${row.frameId}|${row.contentHash}`);
  }
}
assert.equal(expectedPassageKeys.size, 12);

assert.equal(new Set(queue.passages.map((row) => row.passageToken)).size, 12);
assert.equal(new Set(queue.passages.map((row) => row.frameId)).size, 12);
assert.equal(new Set(queue.passages.map((row) => row.contentHash)).size, 12);
for (const passage of queue.passages) {
  assert.ok(
    expectedPassageKeys.has(
      `${passage.questionType}|${passage.frameId}|${passage.contentHash}`,
    ),
  );
  const candidate = candidates.get(passage.candidateId);
  assert.ok(candidate);
  assert.equal(candidate.text, passage.passageContentExact);
  assert.equal(candidate.sourceRecordId, passage.sourceRecordId);
  assert.equal(candidate.document.documentKey, passage.documentKey);
  assert.equal(candidate.document.sourceId, passage.sourceDocumentId);
  assert.equal(Buffer.byteLength(passage.passageContentExact, "utf8"), passage.passageUtf8Bytes);
  assert.equal(
    sha256(Buffer.from(passage.passageContentExact, "utf8")),
    passage.passageUtf8Sha256,
  );
  assert.equal(sha256(normalizeContent(passage.passageContentExact)), passage.contentHash);
  assert.equal(passage.normalizedContentHashVerified, true);
  assert.equal(passage.dualPassVerified, true);
  assert.equal(passage.historyBaseline.historyClean, true);
  assert.equal(passage.historyBaseline.questionCount, 0);
  assert.equal(passage.historyBaseline.aiQuestionCount, 0);
  assert.equal(passage.historyBaseline.workbenchJobCount, 0);
  assert.equal(passage.campaignEligible, false);
  assert.ok(
    historyKeys.has(
      `${passage.questionType}|${passage.frameId}|${passage.contentHash}|development`,
    ),
  );
}

const passageByToken = new Map(queue.passages.map((row) => [row.passageToken, row]));
const expectedAssignmentKeys = new Set<string>();
for (const passage of queue.passages) {
  for (const profileId of profiles(passage.questionType)) {
    for (const plan of PLANS) {
      if (profileId === "B1_TYPE_SCOPED_TAIL" && plan === "PREMIUM") continue;
      for (const difficulty of DIFFICULTIES) {
        expectedAssignmentKeys.add(
          [
            passage.questionType,
            passage.frameId,
            profileId,
            plan,
            difficulty,
          ].join("|"),
        );
      }
    }
  }
}
assert.equal(expectedAssignmentKeys.size, 180);
assert.equal(new Set(queue.assignments.map((row) => row.assignmentKey)).size, 180);
assert.equal(new Set(queue.assignments.map((row) => row.assignmentId)).size, 180);

let totalCents = 0;
let previousRank = "";
for (const [index, assignment] of queue.assignments.entries()) {
  const passage = passageByToken.get(assignment.passageToken);
  assert.ok(passage);
  assert.ok(expectedAssignmentKeys.has(assignment.assignmentKey));
  assert.equal(assignment.queueOrdinal, index + 1);
  assert.equal(
    assignment.orderRank,
    sha256(`${SEED}|order|${assignment.assignmentKey}`),
  );
  assert.equal(
    assignment.assignmentId,
    `S1V5-${String(index + 1).padStart(3, "0")}-${assignment.orderRank.slice(0, 12)}`,
  );
  assert.ok(
    assignment.orderRank > previousRank ||
      (assignment.orderRank === previousRank && index > 0),
    "queue is not ascending by deterministic rank",
  );
  previousRank = assignment.orderRank;
  assert.equal(assignment.questionType, passage.questionType);
  assert.equal(assignment.modelId, model(assignment.plan));
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
    DIFF_DESCRIPTION[assignment.difficulty],
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
    assignment.questionType === "GRAMMAR_ERROR" ? 6_000 : 4_000,
  );
  assert.equal(assignment.admission.candidateOpportunityCap, 1);
  assert.equal(assignment.admission.physicalFetchCap, 1);
  assert.equal(assignment.admission.fullQuestionSemanticCap, 1);
  assert.equal(assignment.admission.outerAttempts, 1);
  assert.equal(assignment.admission.sdkRetries, 0);
  assert.equal(assignment.admission.qualityMode, "strict");
  assert.equal(assignment.admission.attemptIndex, 0);
  assert.equal(
    assignment.admission.perCallUsdCapCents,
    usdCap(assignment.questionType, assignment.plan),
  );
  assert.equal(assignment.admission.debitGlobalCandidateBudgetOnStartedOpportunity, 1);
  assert.equal(assignment.topology.runner, "runPhaseCQuestionGenerationAssignment");
  assert.equal(assignment.topology.directSingleShotMechanismScreen, true);
  for (const forbidden of [
    "triggerTaskUsed",
    "ladderUsed",
    "repairUsed",
    "solverUsed",
    "fallbackUsed",
    "salvageUsed",
  ]) {
    assert.equal(assignment.topology[forbidden], false);
  }
  assert.equal(assignment.replacementAllowed, false);
  assert.equal(assignment.topUpAllowed, false);
  assert.equal(assignment.generationAuthorized, false);
  totalCents += assignment.admission.perCallUsdCapCents;
}
assert.equal(totalCents, 4_416);
assert.deepEqual(countBy(queue.assignments.map((row) => row.questionType)), {
  BLANK_INFERENCE: 84,
  GRAMMAR_ERROR: 96,
});
assert.deepEqual(countBy(queue.assignments.map((row) => row.plan)), {
  PREMIUM: 84,
  STANDARD: 96,
});
assert.deepEqual(countBy(queue.assignments.map((row) => row.difficulty)), {
  INTERMEDIATE: 90,
  KILLER: 90,
});
assert.equal(
  queue.assignments.filter(
    (row) => row.profileId === "B1_TYPE_SCOPED_TAIL" && row.plan === "PREMIUM",
  ).length,
  0,
);

const fastSource = readFileSync(
  path.join(
    repoRoot,
    "src/app/api/workbench/ai-jobs/question-generation/fast/route.ts",
  ),
  "utf8",
).replace(/\s+/gu, " ");
const triggerSource = readFileSync(
  path.join(repoRoot, "src/trigger/workbench-question-generation.ts"),
  "utf8",
).replace(/\s+/gu, " ");
assert.ok(
  fastSource.includes(
    'passage.school?.type === "MIDDLE" ? "\\uc911\\ud559\\uad50" : "\\uace0\\ub4f1\\ud559\\uad50"',
  ),
);
assert.ok(
  fastSource.includes(
    'passage.grade ? `${passage.grade}\\ud559\\ub144` : ""',
  ),
);
assert.ok(fastSource.includes("const diffLabel = effectiveDifficulty"));
assert.ok(fastSource.includes("DIFF_DESCRIPTION[diffLabel] || DIFF_DESCRIPTION.INTERMEDIATE"));
assert.match(
  triggerSource,
  /job\.passage\.school\?\.type === "MIDDLE" \? "중학교" : "고등학교"/u,
);
assert.ok(
  triggerSource.includes('job.passage.grade ? `${job.passage.grade}학년` : ""'),
);
assert.ok(triggerSource.includes("const diffLabel = effectiveDifficulty"));
assert.ok(
  triggerSource.includes("DIFF_DESCRIPTION[diffLabel] || DIFF_DESCRIPTION.INTERMEDIATE"),
);

const allocation = publicArtifact.allocation as Record<string, unknown>;
const authorization = publicArtifact.authorization as Record<string, unknown>;
const cost = publicArtifact.costReservation as Record<string, unknown>;
assert.deepEqual(allocation.byType, { GRAMMAR_ERROR: 96, BLANK_INFERENCE: 84 });
assert.deepEqual(allocation.byPlan, { STANDARD: 96, PREMIUM: 84 });
assert.deepEqual(allocation.byDifficulty, { INTERMEDIATE: 90, KILLER: 90 });
assert.equal(allocation.b1PremiumAssignments, 0);
assert.equal(publicQueue.assignmentRows, 180);
assert.equal(publicQueue.candidateOpportunities, 180);
assert.equal(publicQueue.physicalFetchCap, 180);
assert.equal(publicQueue.replacementOrTopUpAllowed, false);
assert.equal(cost.totalHardReservationUsd, 44.16);
assert.equal(cost.providerSideHardSpendCeilingRequired, true);
assert.equal(cost.priceSnapshotMaxAgeMinutesAtAdmission, 15);
assert.equal(authorization.campaignEligibleAssignments, 0);
assert.equal(authorization.generationAuthorized, false);
assert.equal(authorization.apiCandidateCount, 0);
assert.equal(authorization.globalCandidateLimit, 1_000);

const publicRelease = [
  publicRaw,
  readFileSync(path.join(here, "README.md"), "utf8"),
  readFileSync(path.join(here, "MANIFEST.sha256"), "utf8"),
].join("\n");
for (const passage of queue.passages) {
  assert.ok(!publicRelease.includes(passage.frameId), "public release leaks frame ID");
  assert.ok(!publicRelease.includes(passage.contentHash), "public release leaks row digest");
  assert.ok(!publicRelease.includes(passage.candidateId), "public release leaks candidate ID");
  if (passage.sourceRecordId) {
    assert.ok(
      !publicRelease.includes(passage.sourceRecordId),
      "public release leaks source record ID",
    );
  }
  assert.ok(!publicRelease.includes(passage.documentKey), "public release leaks document key");
  if (passage.sourceDocumentId) {
    assert.ok(
      !publicRelease.includes(passage.sourceDocumentId),
      "public release leaks source document ID",
    );
  }
  assert.ok(
    !publicRelease.includes(passage.passageContentExact),
    "public release leaks passage text",
  );
  assert.ok(
    !publicRelease.includes(passage.passageUtf8Sha256),
    "public release leaks per-passage byte digest",
  );
}
assert.ok(!readFileSync(path.join(here, "MANIFEST.sha256"), "utf8").includes("s1-queue-v5.json"));

const reproduced = buildCampaignV5S1();
assert.equal(reproduced.privateBytes, privateRaw, "builder no longer reproduces private queue");
assert.equal(reproduced.publicBytes, publicRaw, "builder no longer reproduces public artifact");

process.stdout.write(
  `${JSON.stringify(
    {
      verdict: "VERIFIED_DESIGN_COMPLETE_EXECUTION_BLOCKED",
      passages: queue.passages.length,
      assignments: queue.assignments.length,
      allocation: {
        grammar: 96,
        blank: 84,
        standard: 96,
        premium: 84,
        intermediate: 90,
        killer: 90,
      },
      b1PremiumAssignments: 0,
      physicalFetchCap: 180,
      candidateOpportunities: 180,
      totalHardReservationUsd: totalCents / 100,
      historyClean: "76/76",
      privateQueueFileSha256: fileSha256(privatePath),
      publicArtifactSha256: fileSha256(publicPath),
      publicManifestSha256: fileSha256(path.join(here, "MANIFEST.sha256")),
      campaignEligibleAssignments: 0,
      apiCandidateCount: 0,
    },
    null,
    2,
  )}\n`,
);
