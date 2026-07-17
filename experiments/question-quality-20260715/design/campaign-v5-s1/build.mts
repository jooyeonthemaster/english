import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as constantsModule from "@/app/api/ai/generate-questions-auto/_lib/constants";

const constants =
  (constantsModule as unknown as { default?: typeof constantsModule }).default ??
  constantsModule;
const { DIFF_DESCRIPTION } = constants;

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");

const SEED = "question-quality-s1-campaign-v5-20260715-v1";
const SCHOOL_TYPE = "고등학교";
const GRADE_INFO = "2학년";
const DIFFICULTIES = ["INTERMEDIATE", "KILLER"] as const;
const PLANS = ["STANDARD", "PREMIUM"] as const;
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

const EXPECTED_SEALS = {
  blankReconciliationManifest:
    "b3b9fefd73c4e33bae1909aeb783910d9601a170848f3629852ea1a21f94e27f",
  grammarReconciliationManifest:
    "ce735aed8eb7f9174e2df7b57ec8de2d0e1c8a110e697a6a62d36214de059af9",
  historyManifest:
    "8239f106e6164419c06e572a2e12065bf43baae32e80ccd37553529e2b403632",
  historyPublic:
    "ba997edd6ec0b24b1a350c2e42529a9c273193bc79c79f82a07b3e6364fa3c5c",
  snapshot:
    "53bf493d6392c462824dcddd2ecfdc5dfdc0810a4ab2829db5b9993b1799e92a",
  profileAuditManifest:
    "481031ce4fd6023682a6d986c5030ac171f9f4a7fd7c578944824b7a2527b60e",
  profileAuditResults:
    "a4e9477a3438ff0e405c996a42a28acae0fe30d42937cd7123a3ebdf0109e819",
} as const;

const PATHS = {
  blankDir: path.join(
    repoRoot,
    "experiments/question-quality-20260715/corpus/cross-type-blank-source-frame-v2",
  ),
  grammarDir: path.join(
    repoRoot,
    "experiments/question-quality-20260715/corpus/cross-type-grammar-source-frame-v2",
  ),
  historyDir: path.join(
    repoRoot,
    "experiments/question-quality-20260715/corpus/selected-source-history-v1",
  ),
  snapshot: path.join(
    repoRoot,
    "experiments/question-quality-20260715/corpus/v3/private/input-snapshot.json",
  ),
  profileAuditDir: path.join(
    repoRoot,
    "experiments/question-quality-20260715/reviews/prompt-profile-integration-audit-v2",
  ),
} as const;

const PUBLIC_SOURCE_PATHS = [
  [
    "blank_reconciliation_manifest",
    "experiments/question-quality-20260715/corpus/cross-type-blank-source-frame-v2/RECONCILIATION-MANIFEST.sha256",
  ],
  [
    "blank_reconciliation_summary",
    "experiments/question-quality-20260715/corpus/cross-type-blank-source-frame-v2/reviewer-reconciliation-summary.json",
  ],
  [
    "grammar_reconciliation_manifest",
    "experiments/question-quality-20260715/corpus/cross-type-grammar-source-frame-v2/RECONCILIATION-MANIFEST.sha256",
  ],
  [
    "grammar_reconciliation_summary",
    "experiments/question-quality-20260715/corpus/cross-type-grammar-source-frame-v2/reviewer-reconciliation-summary.json",
  ],
  [
    "history_manifest",
    "experiments/question-quality-20260715/corpus/selected-source-history-v1/runs/baseline-20260715-0745-MANIFEST.sha256",
  ],
  [
    "history_public",
    "experiments/question-quality-20260715/corpus/selected-source-history-v1/runs/baseline-20260715-0745-public.json",
  ],
  [
    "profile_design_manifest",
    "experiments/question-quality-20260715/design/prompt-profiles-v1/manifest.json",
  ],
  [
    "profile_integration_audit_manifest",
    "experiments/question-quality-20260715/reviews/prompt-profile-integration-audit-v2/MANIFEST.sha256",
  ],
  [
    "profile_integration_audit_results",
    "experiments/question-quality-20260715/reviews/prompt-profile-integration-audit-v2/results.json",
  ],
  [
    "production_fast_callsite",
    "src/app/api/workbench/ai-jobs/question-generation/fast/route.ts",
  ],
  ["production_trigger_callsite", "src/trigger/workbench-question-generation.ts"],
  [
    "difficulty_constants",
    "src/app/api/ai/generate-questions-auto/_lib/constants.ts",
  ],
  [
    "type_setting_dispatch",
    "src/lib/question-type-generation-settings/index.ts",
  ],
  [
    "type_setting_grammar",
    "src/lib/question-type-generation-settings/grammar.ts",
  ],
  [
    "type_setting_blank",
    "src/lib/question-type-generation-settings/blank-inference.ts",
  ],
  ["research_profiles", "src/lib/question-generation-research-profiles.ts"],
  ["production_atlas_entry", "src/lib/atlas-ai.ts"],
  [
    "production_assignment_fetch_boundary",
    "src/lib/atlas-production-assignment-fetch-boundary.ts",
  ],
  ["research_fetch_boundary", "src/lib/atlas-research-fetch-boundary.ts"],
  ["fetch_scope_coordinator", "src/lib/atlas-fetch-scope-coordinator.ts"],
  [
    "assignment_budget_runtime",
    "src/lib/question-generation-assignment-budget.ts",
  ],
  [
    "assignment_budget_policy",
    "src/lib/question-generation-assignment-budget-policy.ts",
  ],
  [
    "research_runtime",
    "src/lib/question-generation-research-runtime.ts",
  ],
  ["generation_llm_wire", "src/lib/question-generation-llm.ts"],
  [
    "production_generation_engine",
    "src/app/api/ai/generate-questions-auto/_lib/run-question-generation.ts",
  ],
  [
    "research_phase_runner",
    "experiments/question-quality-20260715/harness/question-generation-phase-c-runner.ts",
  ],
  [
    "research_callsite_adapter",
    "experiments/question-quality-20260715/harness/question-generation-callsite-adapter.ts",
  ],
  [
    "content_normalization_source",
    "experiments/question-quality-20260715/corpus/selector-core.ts",
  ],
] as const;

const MANIFEST_FILES = [
  "build.mts",
  "verify.mts",
  "tsconfig.json",
  "README.md",
  "campaign-v5-s1.json",
  "private/.gitignore",
] as const;

type QuestionType = "GRAMMAR_ERROR" | "BLANK_INFERENCE";
type Plan = (typeof PLANS)[number];
type Difficulty = (typeof DIFFICULTIES)[number];
type Profile =
  | (typeof GRAMMAR_PROFILES)[number]
  | (typeof BLANK_PROFILES)[number];

interface CampaignAssignmentCell {
  [key: string]: unknown;
  assignmentKey: string;
  orderRank: string;
  passageToken: unknown;
  questionType: QuestionType;
  profileId: Profile;
  plan: Plan;
  difficulty: Difficulty;
  modelId: string;
  admission: {
    [key: string]: unknown;
    perCallUsdCapCents: number;
  };
}

type CampaignAssignment = CampaignAssignmentCell & {
  queueOrdinal: number;
  assignmentId: string;
};

interface SnapshotCandidate {
  id: string;
  text: string;
  sourceRecordId: string | null;
  contentHash?: string;
  document: {
    documentKey: string;
    sourceId: string | null;
  };
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

interface SelectionRow {
  frameId: string;
  contentHash: string;
  split: string;
  topic: string;
  discourse: string;
  wordBand: string;
}

interface ReconciledRow {
  frameId: string;
  contentHash: string;
  disposition: string;
  selectedSplit: string | null;
  campaignEligible: boolean;
  rightsRecord?: string;
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
  matchedPassageCount: number;
}

const sha256 = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const fileSha256 = (filePath: string) => sha256(readFileSync(filePath));
const utf8Bytes = (value: string) => Buffer.byteLength(value, "utf8");
const stableJson = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

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

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function assertFileHash(filePath: string, expected: string, label: string): void {
  assert.equal(fileSha256(filePath), expected, `${label} seal changed`);
}

function assertManifestEntries(manifestPath: string, base: string): void {
  const lines = readFileSync(manifestPath, "utf8").trim().split(/\r?\n/gu);
  assert.ok(lines.length > 0, `${manifestPath} is empty`);
  for (const [index, line] of lines.entries()) {
    const match = /^([a-f0-9]{64})  (.+)$/u.exec(line);
    assert.ok(match, `${manifestPath} line ${index + 1} is malformed`);
    const resolved = path.resolve(base, match[2]);
    assert.ok(
      resolved.startsWith(`${repoRoot}${path.sep}`),
      `${manifestPath} path escaped repository`,
    );
    assert.equal(fileSha256(resolved), match[1], `${match[2]} changed`);
  }
}

function readAndVerifyInputs() {
  const blankManifest = path.join(PATHS.blankDir, "RECONCILIATION-MANIFEST.sha256");
  const grammarManifest = path.join(
    PATHS.grammarDir,
    "RECONCILIATION-MANIFEST.sha256",
  );
  const historyManifest = path.join(
    PATHS.historyDir,
    "runs/baseline-20260715-0745-MANIFEST.sha256",
  );
  const historyPublicPath = path.join(
    PATHS.historyDir,
    "runs/baseline-20260715-0745-public.json",
  );
  const profileManifest = path.join(PATHS.profileAuditDir, "MANIFEST.sha256");
  const profileResultsPath = path.join(PATHS.profileAuditDir, "results.json");

  assertFileHash(
    blankManifest,
    EXPECTED_SEALS.blankReconciliationManifest,
    "blank reconciliation manifest",
  );
  assertFileHash(
    grammarManifest,
    EXPECTED_SEALS.grammarReconciliationManifest,
    "grammar reconciliation manifest",
  );
  assertFileHash(historyManifest, EXPECTED_SEALS.historyManifest, "history manifest");
  assertFileHash(historyPublicPath, EXPECTED_SEALS.historyPublic, "history public");
  assertFileHash(PATHS.snapshot, EXPECTED_SEALS.snapshot, "v3 source snapshot");
  assertFileHash(
    profileManifest,
    EXPECTED_SEALS.profileAuditManifest,
    "profile audit manifest",
  );
  assertFileHash(
    profileResultsPath,
    EXPECTED_SEALS.profileAuditResults,
    "profile audit results",
  );

  assertManifestEntries(blankManifest, repoRoot);
  assertManifestEntries(grammarManifest, PATHS.grammarDir);
  assertManifestEntries(historyManifest, PATHS.historyDir);
  assertManifestEntries(profileManifest, PATHS.profileAuditDir);

  const profileResults = readJson<{
    verdict: string;
    campaignExecutionVerdict: string;
    sideEffects: Record<string, number>;
  }>(profileResultsPath);
  assert.equal(profileResults.verdict, "PASS_LOCAL_INTEGRATION");
  assert.equal(profileResults.campaignExecutionVerdict, "NO_GO");
  assert.equal(profileResults.sideEffects.externalApiCalls, 0);
  assert.equal(profileResults.sideEffects.networkCalls, 0);
  assert.equal(profileResults.sideEffects.candidatesConsumed, 0);

  return { historyPublicPath };
}

function privateSourcePassages(type: QuestionType) {
  const sourceDir = type === "GRAMMAR_ERROR" ? PATHS.grammarDir : PATHS.blankDir;
  const sourcePrivatePath = path.join(sourceDir, "private/source-frame-private.json");
  const sourcePublicPath = path.join(sourceDir, "source-frame-public.json");
  const reconciliationPath = path.join(
    sourceDir,
    "private/reconciliation-and-split-v2.json",
  );
  const sourcePrivate = readJson<{
    bindingHash: string;
    rows: SourcePrivateRow[];
  }>(sourcePrivatePath);
  const sourcePublic = readJson<{
    bindingHash: string;
    rows: Array<{ frameId: string; contentHash: string }>;
  }>(sourcePublicPath);
  const reconciliation = readJson<{
    sourceBindingHash: string;
    selection: { rows: SelectionRow[] };
    rows: ReconciledRow[];
  }>(reconciliationPath);
  assert.equal(sourcePrivate.bindingHash, sourcePublic.bindingHash);
  assert.equal(reconciliation.sourceBindingHash, sourcePublic.bindingHash);
  assert.equal(sourcePrivate.rows.length, sourcePublic.rows.length);
  for (const [index, row] of sourcePrivate.rows.entries()) {
    assert.equal(row.frameId, sourcePublic.rows[index].frameId);
    assert.equal(row.contentHash, sourcePublic.rows[index].contentHash);
  }
  return {
    sourcePrivatePath,
    reconciliationPath,
    sourcePrivate,
    reconciliation,
  };
}

function buildPassageTable(historyRows: HistoryRow[]) {
  const snapshot = readJson<{
    snapshotHash: string;
    candidates: SnapshotCandidate[];
  }>(PATHS.snapshot);
  assert.equal(
    snapshot.snapshotHash,
    "c21777c8dcab7f6b46ed15e429fcb7840607e90bcbdd7c02ec607a8db02beb13",
  );
  const candidateById = new Map(
    snapshot.candidates.map((candidate) => [candidate.id, candidate]),
  );
  assert.equal(candidateById.size, snapshot.candidates.length);
  const historyByKey = new Map(
    historyRows.map((row) => [
      `${row.focusType}|${row.frameId}|${row.contentHash}`,
      row,
    ]),
  );
  assert.equal(historyByKey.size, historyRows.length);

  const passageRows: Array<Record<string, unknown>> = [];
  const privateSeals: Record<string, Record<string, string>> = {};
  for (const type of ["GRAMMAR_ERROR", "BLANK_INFERENCE"] as const) {
    const source = privateSourcePassages(type);
    privateSeals[type] = {
      sourcePrivateSha256: fileSha256(source.sourcePrivatePath),
      reconciliationPrivateSha256: fileSha256(source.reconciliationPath),
    };
    const sourceByFrame = new Map(
      source.sourcePrivate.rows.map((row) => [row.frameId, row]),
    );
    const ledgerByFrame = new Map(
      source.reconciliation.rows.map((row) => [row.frameId, row]),
    );
    const development = source.reconciliation.selection.rows.filter(
      (row) => row.split === "development",
    );
    assert.equal(development.length, 6, `${type} development supply changed`);

    for (const [index, selected] of development.entries()) {
      const sourceRow = sourceByFrame.get(selected.frameId);
      assert.ok(sourceRow, `${type} selected source row is missing`);
      assert.equal(sourceRow.contentHash, selected.contentHash);
      const ledger = ledgerByFrame.get(selected.frameId);
      assert.ok(ledger, `${type} reconciliation ledger row is missing`);
      assert.equal(ledger.contentHash, selected.contentHash);
      assert.equal(
        ledger.disposition,
        type === "GRAMMAR_ERROR" ? "DUAL_PASS" : "FRAME_PASS_BOTH_LENSES",
      );
      assert.equal(ledger.selectedSplit, "development");
      assert.equal(ledger.campaignEligible, false);

      const candidate = candidateById.get(sourceRow.candidateId);
      assert.ok(candidate, `${type} snapshot candidate is missing`);
      assert.equal(candidate.sourceRecordId, sourceRow.sourceRecordId);
      assert.equal(candidate.document.documentKey, sourceRow.documentKey);
      assert.equal(
        candidate.document.sourceId,
        sourceRow.sourceId ?? sourceRow.sourceDocumentId ?? null,
      );
      if (sourceRow.passageText !== undefined) {
        assert.equal(sourceRow.passageText, candidate.text);
      }
      assert.equal(
        sha256(normalizeContent(candidate.text)),
        selected.contentHash,
        `${type} normalized passage hash changed`,
      );
      if (candidate.contentHash !== undefined) {
        assert.equal(candidate.contentHash, selected.contentHash);
      }

      const history = historyByKey.get(
        `${type}|${selected.frameId}|${selected.contentHash}`,
      );
      assert.ok(history, `${type} development history row is missing`);
      assert.equal(history.split, "development");
      assert.equal(history.historyClean, true);
      assert.equal(history.questionCount, 0);
      assert.equal(history.aiQuestionCount, 0);
      assert.equal(history.workbenchJobCount, 0);

      passageRows.push({
        passageToken: `${type === "GRAMMAR_ERROR" ? "G" : "B"}-DEV-${String(
          index + 1,
        ).padStart(2, "0")}`,
        questionType: type,
        frameId: selected.frameId,
        contentHash: selected.contentHash,
        split: "development",
        topic: selected.topic,
        discourse: selected.discourse,
        wordBand: selected.wordBand,
        candidateId: sourceRow.candidateId,
        sourceRecordId: sourceRow.sourceRecordId,
        documentKey: sourceRow.documentKey,
        sourceDocumentId:
          sourceRow.sourceId ?? sourceRow.sourceDocumentId ?? null,
        passageContentExact: candidate.text,
        passageUtf8Bytes: utf8Bytes(candidate.text),
        passageUtf8Sha256: sha256(Buffer.from(candidate.text, "utf8")),
        normalizedContentHashVerified: true,
        dualPassVerified: true,
        historyBaseline: {
          label: "baseline-20260715-0745",
          historyClean: history.historyClean,
          questionCount: history.questionCount,
          aiQuestionCount: history.aiQuestionCount,
          workbenchJobCount: history.workbenchJobCount,
          matchedPassageCount: history.matchedPassageCount,
        },
        campaignEligible: false,
      });
    }
  }
  assert.equal(passageRows.length, 12);
  assert.equal(
    new Set(passageRows.map((row) => row.contentHash)).size,
    12,
    "grammar and blank development passages must be content-disjoint",
  );
  return { passageRows, privateSeals };
}

function profileType(profile: Profile): QuestionType {
  return profile.startsWith("G") ? "GRAMMAR_ERROR" : "BLANK_INFERENCE";
}

function modelForPlan(plan: Plan): string {
  return plan === "STANDARD"
    ? "google/gemini-3.5-flash"
    : "google/gemini-3.1-pro-preview";
}

function outputCap(type: QuestionType): number {
  return type === "GRAMMAR_ERROR" ? 6_000 : 4_000;
}

function usdCapCents(type: QuestionType, plan: Plan): number {
  if (type === "GRAMMAR_ERROR") return plan === "STANDARD" ? 20 : 43;
  return plan === "STANDARD" ? 14 : 20;
}

function buildAssignments(
  passageRows: Array<Record<string, unknown>>,
): CampaignAssignment[] {
  const cells: CampaignAssignmentCell[] = [];
  for (const passage of passageRows) {
    const type = passage.questionType as QuestionType;
    const profiles = type === "GRAMMAR_ERROR" ? GRAMMAR_PROFILES : BLANK_PROFILES;
    for (const profileId of profiles) {
      for (const plan of PLANS) {
        if (profileId === "B1_TYPE_SCOPED_TAIL" && plan === "PREMIUM") continue;
        for (const difficulty of DIFFICULTIES) {
          assert.equal(profileType(profileId), type);
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
            modelId: modelForPlan(plan),
            request: {
              plan: [
                {
                  subType: type,
                  count: 1,
                  reason: "S1 v5 fixed profile-screen assignment",
                  targetPoints: [],
                },
              ],
              schoolType: SCHOOL_TYPE,
              gradeInfo: GRADE_INFO,
              passageContentRef: passage.passageToken,
              teacherIntentBlock: "",
              analysisContext: "",
              diffLabel: difficulty,
              diffInstruction: DIFF_DESCRIPTION[difficulty],
              generationPlan: plan,
              customPrompt: "",
            },
            wireContract: {
              providerRequireParameters: true,
              reasoning: { enabled: false, effort: "none", exclude: true },
              questionsMinItems: 1,
              questionsMaxItems: 1,
              maxOutputTokens: outputCap(type),
            },
            admission: {
              candidateOpportunityCap: 1,
              physicalFetchCap: 1,
              fullQuestionSemanticCap: 1,
              outerAttempts: 1,
              sdkRetries: 0,
              qualityMode: "strict",
              attemptIndex: 0,
              perCallUsdCapCents: usdCapCents(type, plan),
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
      String(left.orderRank).localeCompare(String(right.orderRank), "en") ||
      String(left.assignmentKey).localeCompare(String(right.assignmentKey), "en"),
  );
  return cells.map((cell, index): CampaignAssignment => ({
    queueOrdinal: index + 1,
    assignmentId: `S1V5-${String(index + 1).padStart(3, "0")}-${String(
      cell.orderRank,
    ).slice(0, 12)}`,
    ...cell,
  }));
}

function countBy<T extends string>(values: T[]): Record<T, number> {
  const counts = {} as Record<T, number>;
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) => left.localeCompare(right, "en")),
  ) as Record<T, number>;
}

function publicSourceClosure() {
  return PUBLIC_SOURCE_PATHS.map(([role, relativePath]) => {
    const filePath = path.join(repoRoot, relativePath);
    return {
      role,
      path: relativePath,
      bytes: readFileSync(filePath).byteLength,
      sha256: fileSha256(filePath),
    };
  });
}

export function buildCampaignV5S1() {
  const { historyPublicPath } = readAndVerifyInputs();
  const historyPublic = readJson<{
    status: string;
    selectedRows: number;
    historyCleanRows: number;
    exposedRows: number;
    byTypeAndSplit: Record<string, unknown>;
    safety: Record<string, unknown>;
  }>(historyPublicPath);
  const historyPrivatePath = path.join(
    PATHS.historyDir,
    "private/baseline-20260715-0745-private.json",
  );
  const historyPrivate = readJson<{ rows: HistoryRow[] }>(historyPrivatePath);
  assert.equal(historyPublic.status, "CURRENT_DATABASE_HISTORY_CLEAN_NOT_AUTHORIZED");
  assert.equal(historyPublic.selectedRows, 76);
  assert.equal(historyPublic.historyCleanRows, 76);
  assert.equal(historyPublic.exposedRows, 0);
  assert.equal(historyPrivate.rows.length, 76);
  assert.equal(historyPrivate.rows.filter((row) => row.historyClean).length, 76);
  assert.equal(
    historyPrivate.rows.filter(
      (row) =>
        row.questionCount > 0 ||
        row.aiQuestionCount > 0 ||
        row.workbenchJobCount > 0,
    ).length,
    0,
  );

  const { passageRows, privateSeals } = buildPassageTable(historyPrivate.rows);
  const assignments = buildAssignments(passageRows);
  assert.equal(assignments.length, 180);
  const grammarAssignments = assignments.filter(
    (row) => row.questionType === "GRAMMAR_ERROR",
  );
  const blankAssignments = assignments.filter(
    (row) => row.questionType === "BLANK_INFERENCE",
  );
  assert.equal(grammarAssignments.length, 96);
  assert.equal(blankAssignments.length, 84);
  assert.equal(
    assignments.filter(
      (row) =>
        row.profileId === "B1_TYPE_SCOPED_TAIL" && row.plan === "PREMIUM",
    ).length,
    0,
  );
  assert.deepEqual(countBy(assignments.map((row) => row.plan as Plan)), {
    PREMIUM: 84,
    STANDARD: 96,
  });
  assert.deepEqual(countBy(assignments.map((row) => row.difficulty as Difficulty)), {
    INTERMEDIATE: 90,
    KILLER: 90,
  });
  assert.equal(
    assignments.reduce(
      (sum, row) =>
        sum +
        ((row.admission as { perCallUsdCapCents: number }).perCallUsdCapCents ?? 0),
      0,
    ),
    4_416,
  );

  const sourceClosure = publicSourceClosure();
  const privateCore = {
    schemaVersion: "question-quality-s1-campaign-v5-private-queue-v1",
    status: "FROZEN_DESIGN_QUEUE_NOT_AUTHORIZED",
    confidentiality:
      "PRIVATE: exact passages, source identifiers, content digests, memberships and assignment order; never publish or add to git.",
    seed: SEED,
    upstreamPrivateSeals: {
      snapshotSha256: fileSha256(PATHS.snapshot),
      selectedSourceHistoryPrivateSha256: fileSha256(historyPrivatePath),
      ...privateSeals,
    },
    fixedRequestContext: {
      schoolType: SCHOOL_TYPE,
      gradeInfo: GRADE_INFO,
      difficulties: DIFFICULTIES,
      difficultyInstructions: Object.fromEntries(
        DIFFICULTIES.map((difficulty) => [difficulty, DIFF_DESCRIPTION[difficulty]]),
      ),
      teacherIntentBlock: "",
      analysisContext: "",
      customPrompt: "",
      targetPoints: [],
      typeSettings: "OMITTED",
      koPassageKind: "OMITTED",
    },
    passages: passageRows,
    assignments,
    noReplacementOrTopUp: true,
    campaignEligibleAssignments: 0,
    generationAuthorized: false,
    safety: {
      modelApiCalls: 0,
      networkCalls: 0,
      databaseCalls: 0,
      fullQuestionCandidatesGenerated: 0,
      globalApiCandidateCount: 0,
    },
  };
  const privateQueueSemanticSha256 = sha256(stableStringify(privateCore));
  const privateOutput = { ...privateCore, privateQueueSemanticSha256 };
  const privateBytes = stableJson(privateOutput);
  const privateQueueFileSha256 = sha256(Buffer.from(privateBytes, "utf8"));

  const profileCounts = countBy(assignments.map((row) => row.profileId as Profile));
  const modelCounts = countBy(assignments.map((row) => row.modelId as string));
  const publicOutput = {
    schemaVersion: "question-quality-s1-campaign-v5-public-v1",
    artifactId: "campaign-v5-s1",
    status: "DESIGN_COMPLETE_EXECUTION_BLOCKED",
    designDate: "2026-07-15",
    estimand:
      "Bounded matched single-shot prompt/schema mechanism screen; not production-topology parity and not an efficacy claim at six passage clusters.",
    upstream: {
      sourceClosureSha256: sha256(stableStringify(sourceClosure)),
      files: sourceClosure,
      profileIntegrationVerdict: "PASS_LOCAL_INTEGRATION",
      profileCampaignExecutionVerdict: "NO_GO",
      historyBaseline: {
        label: "baseline-20260715-0745",
        selectedRows: 76,
        historyCleanRows: 76,
        exposedRows: 0,
        exactDevelopmentRowsJoined: 12,
        publicArtifactSha256: fileSha256(historyPublicPath),
        publicManifestSha256: fileSha256(
          path.join(
            PATHS.historyDir,
            "runs/baseline-20260715-0745-MANIFEST.sha256",
          ),
        ),
      },
      sourceReconciliation: {
        grammar: {
          developmentDualPassRows: 6,
          publicManifestSha256: fileSha256(
            path.join(PATHS.grammarDir, "RECONCILIATION-MANIFEST.sha256"),
          ),
        },
        blank: {
          developmentDualPassRows: 6,
          publicManifestSha256: fileSha256(
            path.join(PATHS.blankDir, "RECONCILIATION-MANIFEST.sha256"),
          ),
        },
        selectedPassagesContentDisjoint: true,
        exactPassageBytesStoredOnlyInPrivateQueue: true,
      },
    },
    fixedWorkbenchInputContract: {
      derivation:
        "Current fast and Trigger callsites both pass Korean school/grade labels and DIFF_DESCRIPTION[diffLabel]. S1 fixes the exact wire-tested high-school/grade-2 values across every paired cell.",
      schoolType: SCHOOL_TYPE,
      gradeInfo: GRADE_INFO,
      difficulties: DIFFICULTIES,
      difficultyInstructionSource:
        "src/app/api/ai/generate-questions-auto/_lib/constants.ts::DIFF_DESCRIPTION",
      emptyTeacherIntentBlock: true,
      emptyAnalysisContext: true,
      emptyCustomPrompt: true,
      emptyTargetPoints: true,
      typeSettingsOmitted: true,
      koPassageKindOmitted: true,
    },
    queue: {
      seed: SEED,
      order: "Global ascending SHA-256(seed|order|type|private-frame|profile|plan|difficulty), then assignment key; frozen before outcomes.",
      privateQueueFile: "private/s1-queue-v5.json",
      privateQueueFileBytes: utf8Bytes(privateBytes),
      privateQueueFileSha256,
      privateQueueSemanticSha256,
      distinctDevelopmentPassages: 12,
      assignmentRows: 180,
      candidateOpportunities: 180,
      physicalFetchCap: 180,
      semanticFullQuestionCap: 180,
      candidateBudgetDebitRule:
        "A started assignment consumes its one global full-question opportunity whether it succeeds, times out, fails parsing, or is rejected.",
      replacementOrTopUpAllowed: false,
      retryReplayAllowed: false,
    },
    allocation: {
      byType: { GRAMMAR_ERROR: 96, BLANK_INFERENCE: 84 },
      grammarFormula:
        "4 profiles x 2 plans x 2 difficulties x 6 development passages = 96",
      blankFormula:
        "STANDARD 4 profiles x 2 difficulties x 6 = 48; PREMIUM B0/B2/B3 x 2 difficulties x 6 = 36; total 84",
      b1PremiumAssignments: 0,
      byPlan: { STANDARD: 96, PREMIUM: 84 },
      byDifficulty: { INTERMEDIATE: 90, KILLER: 90 },
      byProfile: profileCounts,
      byModel: modelCounts,
      pairing:
        "Each admitted type-specific development passage is crossed with every applicable frozen profile-plan-difficulty cell.",
    },
    wireAndTopology: {
      standardModel: "google/gemini-3.5-flash",
      premiumModel: "google/gemini-3.1-pro-preview",
      reasoning: { enabled: false, effort: "none", exclude: true },
      providerRequireParameters: true,
      questionCount: 1,
      questionSchemaMinItems: 1,
      questionSchemaMaxItems: 1,
      maxOutputTokens: { GRAMMAR_ERROR: 6_000, BLANK_INFERENCE: 4_000 },
      candidateOpportunitiesPerAssignment: 1,
      physicalFetchesPerAssignment: 1,
      outerAttemptsPerAssignment: 1,
      sdkRetriesPerAssignment: 0,
      childCandidateStages: 0,
      directResearchRunner:
        "experiments/question-quality-20260715/harness/question-generation-phase-c-runner.ts",
      productionParityClaim: false,
    },
    costReservation: {
      currency: "USD",
      frozenPerCallCaps: {
        GRAMMAR_ERROR_STANDARD: 0.2,
        GRAMMAR_ERROR_PREMIUM: 0.43,
        BLANK_INFERENCE_STANDARD: 0.14,
        BLANK_INFERENCE_PREMIUM: 0.2,
      },
      cellReservations: {
        GRAMMAR_ERROR_STANDARD: { calls: 48, usd: 9.6 },
        GRAMMAR_ERROR_PREMIUM: { calls: 48, usd: 20.64 },
        BLANK_INFERENCE_STANDARD: { calls: 48, usd: 6.72 },
        BLANK_INFERENCE_PREMIUM: { calls: 36, usd: 7.2 },
      },
      totalHardReservationUsd: 44.16,
      providerSideHardSpendCeilingRequired: true,
      priceSnapshotMaxAgeMinutesAtAdmission: 15,
      rule:
        "Any exact request whose fresh worst-case price exceeds its frozen per-call cap blocks the unopened registry; caps and sample size never auto-rescale.",
    },
    executionHolds: {
      sourceRights: "BLOCKED_PENDING_DOCUMENTED_PROVIDER_PROCESSING_RIGHTS",
      providerPrivacy:
        "BLOCKED_PENDING_CURRENT_ENDPOINT_RETENTION_PRIVACY_AND_PROVIDER_ALLOWLIST_ATTESTATION",
      limitedCredential:
        "BLOCKED_PENDING_SEPARATE_LIMITED_KEY_AND_PROVIDER_SIDE_HARD_SPEND_CAP_NOT_ABOVE_44_16_USD",
      freshPrice:
        "BLOCKED_PENDING_EXACT_ENDPOINT_PRICE_CAPTURE_WITHIN_15_MINUTES_OF_REGISTRY_ADMISSION",
      exactWireRegistry:
        "BLOCKED_PENDING_MATERIALIZED_180_ROW_CONTROLLER_REGISTRY_AND_EXACT_REQUEST_PREFLIGHT",
      independentAudit:
        "BLOCKED_PENDING_FRESH_INDEPENDENT_REVIEW_OF_V5_PRIVATE_BINDING_PUBLIC_PRIVACY_AND_ADMISSION_ARITHMETIC",
    },
    authorization: {
      campaignEligibleAssignments: 0,
      generationAuthorized: false,
      apiCandidateCount: 0,
      globalCandidateLimit: 1_000,
      thisDesignWouldReserveIfAuthorized: 180,
    },
    privacy: {
      publicContainsFrameIds: false,
      publicContainsRowContentHashes: false,
      publicContainsPassageText: false,
      publicContainsSourceIdentifiers: false,
      publicContainsPerRowSplitMembership: false,
      exactQueueGitIgnored: true,
      publicContainsOnlyAggregateCountsAndArtifactHashesForPrivateBinding: true,
    },
    safety: {
      modelApiCalls: 0,
      networkCalls: 0,
      databaseCalls: 0,
      secretAccesses: 0,
      fullQuestionCandidatesGenerated: 0,
      apiCandidateCount: 0,
      productionFilesEditedByBuilder: 0,
    },
  };
  const publicBytes = stableJson(publicOutput);
  return {
    privateOutput,
    privateBytes,
    publicOutput,
    publicBytes,
    privateQueueFileSha256,
  };
}

function writeManifest(): void {
  const lines = MANIFEST_FILES.map(
    (relativePath) => `${fileSha256(path.join(here, relativePath))}  ${relativePath}`,
  );
  writeFileSync(path.join(here, "MANIFEST.sha256"), `${lines.join("\n")}\n`, "utf8");
}

if (process.argv.includes("--write")) {
  const output = buildCampaignV5S1();
  mkdirSync(path.join(here, "private"), { recursive: true });
  writeFileSync(path.join(here, "private/s1-queue-v5.json"), output.privateBytes, "utf8");
  writeFileSync(path.join(here, "campaign-v5-s1.json"), output.publicBytes, "utf8");
  writeManifest();
  process.stdout.write(
    `${JSON.stringify(
      {
        verdict: "DESIGN_COMPLETE_EXECUTION_BLOCKED",
        passages: output.privateOutput.passages.length,
        assignments: output.privateOutput.assignments.length,
        candidateOpportunities: 180,
        physicalFetchCap: 180,
        totalHardReservationUsd: 44.16,
        privateQueueFileSha256: output.privateQueueFileSha256,
        campaignEligibleAssignments: 0,
        apiCandidateCount: 0,
      },
      null,
      2,
    )}\n`,
  );
}
