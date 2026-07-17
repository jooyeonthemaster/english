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

export const here = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(here, "../../../..");

export const CAMPAIGN_ID = "question-quality-20260715-s1-v6" as const;
export const SEED = "question-quality-s1-v6-original-remediation-seed-v1" as const;
export const SCHOOL_TYPE = "고등학교" as const;
export const GRADE_INFO = "2학년" as const;
export const DIFFICULTIES = ["INTERMEDIATE", "KILLER"] as const;
export const PLANS = ["STANDARD", "PREMIUM"] as const;
export const GRAMMAR_PROFILES = [
  "G0_CURRENT_CONTROL",
  "G1_FINAL_CHECKLIST_ABLATION",
  "G2_POSITIVE_COMPACT",
  "G3_SITE_CERTIFICATE",
] as const;
export const BLANK_PROFILES = [
  "B0_CURRENT_CONTROL",
  "B1_TYPE_SCOPED_TAIL",
  "B2_POSITIVE_COMPACT",
  "B3_OPTION_INTENT_LEDGER",
] as const;
export const MODELS = {
  STANDARD: "google/gemini-3.5-flash",
  PREMIUM: "google/gemini-3.1-pro-preview",
} as const;
export const PROVIDER_ROUTING = {
  order: ["google-vertex/global"],
  only: ["google-vertex/global"],
  allow_fallbacks: false,
  require_parameters: true,
  data_collection: "deny",
  zdr: true,
} as const;
export const REASONING_OFF = {
  enabled: false,
  effort: "none",
  exclude: true,
} as const;
export const DESIGN_CEILING_USD = 100 as const;
export const DESIGN_EXACT_WIRE_BODY_UTF8_BYTES_CEILING = 9_000_000 as const;
export const DESIGN_SERVER_TOKEN_OVERHEAD_PER_ASSIGNMENT = 4_096 as const;
export const DESIGN_SAFETY_MULTIPLIER = 1.1 as const;
/**
 * Design-only emergency stress rates from the sealed offline schema-v2 fixture.
 * They are never live pricing authority; fresh exact-tag proof remains mandatory.
 */
export const DESIGN_EMERGENCY_RATES_USD_PER_1M = {
  STANDARD: { input: 2.7, output: 16.2 },
  PREMIUM: { input: 7.2, output: 32.4 },
} as const;

const corpusDir = path.join(
  repoRoot,
  "experiments/question-quality-20260715/corpus/original-s1-v6",
);
const remediationDir = path.join(
  repoRoot,
  "experiments/question-quality-20260715/reviews/campaign-v6-original-corpus-remediation-v1",
);
const independentAuditDir = path.join(
  repoRoot,
  "experiments/question-quality-20260715/reviews/campaign-v6-s1-corpus-independent-v2-audit-v1",
);
const negativeProfileAuditDir = path.join(
  repoRoot,
  "experiments/question-quality-20260715/reviews/prompt-profile-negative-evidence-audit-v1",
);
export const paths = {
  corpusPrivate: path.join(corpusDir, "private/original-passages.private.json"),
  corpusPublic: path.join(corpusDir, "corpus-public.json"),
  corpusManifest: path.join(corpusDir, "MANIFEST.sha256"),
  remediationPublic: path.join(remediationDir, "remediation-public.json"),
  remediationManifest: path.join(remediationDir, "MANIFEST.sha256"),
  independentAuditPublic: path.join(independentAuditDir, "audit-public.json"),
  independentAuditManifest: path.join(independentAuditDir, "MANIFEST.sha256"),
  negativeProfileAuditResults: path.join(negativeProfileAuditDir, "results.json"),
  negativeProfileAuditFindings: path.join(negativeProfileAuditDir, "findings.json"),
  negativeProfileAuditSourceClosure: path.join(negativeProfileAuditDir, "source-closure.json"),
  negativeProfileAuditManifest: path.join(negativeProfileAuditDir, "MANIFEST.sha256"),
  privateQueue: path.join(here, "private/s1-queue-v6.json"),
  publicArtifact: path.join(here, "campaign-v6-s1.json"),
  manifest: path.join(here, "MANIFEST.sha256"),
} as const;

export const MANIFEST_FILES = [
  "README.md",
  "build.mts",
  "verify.mts",
  "tsconfig.json",
  "campaign-v6-s1.json",
  "private/.gitignore",
] as const;

const SOURCE_PATHS = [
  ["corpus_public", "experiments/question-quality-20260715/corpus/original-s1-v6/corpus-public.json"],
  ["corpus_private_exact", "experiments/question-quality-20260715/corpus/original-s1-v6/private/original-passages.private.json"],
  ["corpus_manifest", "experiments/question-quality-20260715/corpus/original-s1-v6/MANIFEST.sha256"],
  ["corpus_remediation_public", "experiments/question-quality-20260715/reviews/campaign-v6-original-corpus-remediation-v1/remediation-public.json"],
  ["corpus_remediation_manifest", "experiments/question-quality-20260715/reviews/campaign-v6-original-corpus-remediation-v1/MANIFEST.sha256"],
  ["corpus_independent_v2_audit_public", "experiments/question-quality-20260715/reviews/campaign-v6-s1-corpus-independent-v2-audit-v1/audit-public.json"],
  ["corpus_independent_v2_audit_manifest", "experiments/question-quality-20260715/reviews/campaign-v6-s1-corpus-independent-v2-audit-v1/MANIFEST.sha256"],
  ["profile_design", "experiments/question-quality-20260715/design/prompt-profiles-v1/manifest.json"],
  ["profile_historical_integration_baseline_results", "experiments/question-quality-20260715/reviews/prompt-profile-integration-audit-v2/results.json"],
  ["profile_historical_integration_baseline_manifest", "experiments/question-quality-20260715/reviews/prompt-profile-integration-audit-v2/MANIFEST.sha256"],
  ["profile_current_negative_evidence_results", "experiments/question-quality-20260715/reviews/prompt-profile-negative-evidence-audit-v1/results.json"],
  ["profile_current_negative_evidence_findings", "experiments/question-quality-20260715/reviews/prompt-profile-negative-evidence-audit-v1/findings.json"],
  ["profile_current_negative_evidence_report", "experiments/question-quality-20260715/reviews/prompt-profile-negative-evidence-audit-v1/AUDIT.md"],
  ["profile_current_negative_evidence_source_closure", "experiments/question-quality-20260715/reviews/prompt-profile-negative-evidence-audit-v1/source-closure.json"],
  ["profile_current_negative_evidence_manifest", "experiments/question-quality-20260715/reviews/prompt-profile-negative-evidence-audit-v1/MANIFEST.sha256"],
  ["difficulty_constants", "src/app/api/ai/generate-questions-auto/_lib/constants.ts"],
  ["production_engine", "src/app/api/ai/generate-questions-auto/_lib/run-question-generation.ts"],
  ["production_engine_constants", "src/app/api/ai/generate-questions-auto/_lib/run-question-generation-constants.ts"],
  ["production_engine_helpers", "src/app/api/ai/generate-questions-auto/_lib/run-question-generation-helpers.ts"],
  ["production_types", "src/app/api/ai/generate-questions-auto/_lib/run-question-generation-types.ts"],
  ["production_prompts", "src/app/api/ai/generate-questions-auto/_lib/prompts.ts"],
  ["production_schemas", "src/app/api/ai/generate-questions-auto/_lib/schemas.ts"],
  ["production_retry", "src/app/api/ai/generate-questions-auto/_lib/generate-with-retry.ts"],
  ["generation_wire", "src/lib/question-generation-llm.ts"],
  ["prompt_contract", "src/lib/question-generation-prompt-contract.ts"],
  ["research_profiles", "src/lib/question-generation-research-profiles.ts"],
  ["research_schema", "src/lib/question-generation-research-schema.ts"],
  ["research_runtime", "src/lib/question-generation-research-runtime.ts"],
  ["type_settings_dispatch", "src/lib/question-type-generation-settings/index.ts"],
  ["type_settings_grammar", "src/lib/question-type-generation-settings/grammar.ts"],
  ["type_settings_blank", "src/lib/question-type-generation-settings/blank-inference.ts"],
  ["quality_dispatcher", "src/lib/question-quality/dispatcher.ts"],
  ["quality_core", "src/lib/question-quality/core.ts"],
  ["grammar_quality_shared", "src/lib/question-quality/validators/grammar/shared.ts"],
  ["grammar_quality_combo", "src/lib/question-quality/validators/grammar/combo.ts"],
  ["grammar_quality_marked", "src/lib/question-quality/validators/grammar/marked.ts"],
  ["grammar_explanation_lint", "src/lib/question-quality/validators/grammar/explanation-lint.ts"],
  ["blank_quality_inference", "src/lib/question-quality/validators/blank/inference.ts"],
  ["blank_quality_distractor", "src/lib/question-quality/validators/blank/inference-distractor.ts"],
  ["blank_quality_shared", "src/lib/question-quality/validators/blank/shared.ts"],
  ["blank_quality_paraphrase", "src/lib/question-quality/validators/blank/paraphrase.ts"],
  ["blank_quality_seam", "src/lib/question-quality/validators/blank/seam.ts"],
  ["option_quality", "src/lib/question-quality/validators/options.ts"],
  ["atlas_entry", "src/lib/atlas-ai.ts"],
  ["assignment_budget", "src/lib/question-generation-assignment-budget.ts"],
  ["assignment_budget_policy", "src/lib/question-generation-assignment-budget-policy.ts"],
  ["production_assignment_boundary", "src/lib/atlas-production-assignment-fetch-boundary.ts"],
  ["research_fetch_boundary", "src/lib/atlas-research-fetch-boundary.ts"],
  ["fetch_scope_coordinator", "src/lib/atlas-fetch-scope-coordinator.ts"],
  ["durable_materializer", "experiments/question-quality-20260715/execution/campaign-v6-s1-durable-controller-v1/materialize.ts"],
  ["durable_runtime", "experiments/question-quality-20260715/execution/campaign-v6-s1-durable-controller-v1/runtime.ts"],
  ["durable_parser", "experiments/question-quality-20260715/execution/campaign-v6-s1-durable-controller-v1/openrouter-question-parser.ts"],
  ["durable_manifest", "experiments/question-quality-20260715/execution/campaign-v6-s1-durable-controller-v1/MANIFEST.sha256"],
  ["durable_shared_atlas_controller", "experiments/question-quality-20260715/harness/atlas-controller.ts"],
  ["durable_shared_ledger", "experiments/question-quality-20260715/harness/ledger.ts"],
] as const;

export type QuestionType = "GRAMMAR_ERROR" | "BLANK_INFERENCE";
export type Plan = (typeof PLANS)[number];
export type Difficulty = (typeof DIFFICULTIES)[number];
export type Profile =
  | (typeof GRAMMAR_PROFILES)[number]
  | (typeof BLANK_PROFILES)[number];

interface CorpusRow {
  publicId: string;
  questionType: QuestionType;
  passageText: string;
  descriptors: Record<string, string>;
  suitability: Record<string, unknown>;
  rightsProvenance: {
    rowPublicId: string;
    campaignScopeId: string;
    origin: string;
    copiedOrAdapted: boolean;
    sourceCitation: null;
    thirdPartyPermissionClaimed: boolean;
    piiManuallyObserved: boolean;
    processingScopeStatus: string;
  };
}

interface PrivateCorpus {
  schemaVersion: string;
  artifactId: string;
  revisionId: string;
  campaignScopeId: string;
  authoringRecord: Record<string, unknown>;
  remediationRecord: Record<string, unknown>;
  externalModelProcessingScope: Record<string, unknown>;
  rows: CorpusRow[];
}

interface PublicCorpusRow {
  publicId: string;
  questionType: QuestionType;
  passageSha256: string;
  fullPrivateRowCommitmentSha256: string;
  rightsProvenanceCommitmentSha256: string;
  provenanceStatus: string;
  thirdPartyPermissionClaimed: boolean;
  piiStatus: string;
  processingScopeStatus: string;
}

interface PublicCorpus {
  schemaVersion: string;
  artifactId: string;
  revisionId: string;
  status: string;
  campaignScopeId: string;
  aggregate: Record<string, unknown>;
  rows: PublicCorpusRow[];
  admission: Record<string, unknown>;
}

export interface PrivatePassage {
  publicId: string;
  passageToken: string;
  questionType: QuestionType;
  passageContentExact: string;
  passageUtf8Bytes: number;
  passageUtf8Sha256: string;
  fullPrivateRowCommitmentSha256: string;
  descriptors: Record<string, string>;
  typeSpecificDesign: Record<string, unknown>;
  historicalDbRequirement: "NOT_APPLICABLE_NEW_ORIGINAL_SOURCE";
  rights: {
    /** Exact four-field hash consumed and recomputed by the durable materializer. */
    rightsRecordHash: string;
    /** Rich source/remediation provenance stays separately committed. */
    sourceRightsEvidenceHash: string;
    authorship: "CAMPAIGN_ORIGINAL";
    externalModelProcessingAuthorized: true;
    piiReview: "NO_PII_FOUND";
    passageUtf8Sha256: string;
    rightsProvenanceCommitmentSha256: string;
    campaignScopeId: typeof CAMPAIGN_ID;
  };
}

export interface PrivateAssignment {
  queueOrdinal: number;
  assignmentId: string;
  assignmentKey: string;
  orderRank: string;
  passageToken: string;
  questionType: QuestionType;
  profileId: Profile;
  plan: Plan;
  difficulty: Difficulty;
  modelId: string;
  request: {
    plan: Array<{ subType: QuestionType; count: 1; reason: string; targetPoints: [] }>;
    schoolType: typeof SCHOOL_TYPE;
    gradeInfo: typeof GRADE_INFO;
    passageContentRef: string;
    teacherIntentBlock: "";
    analysisContext: "";
    diffLabel: Difficulty;
    diffInstruction: string;
    generationPlan: Plan;
    customPrompt: "";
  };
  wireContract: {
    providerRouting: typeof PROVIDER_ROUTING;
    reasoning: typeof REASONING_OFF;
    questionsMinItems: 1;
    questionsMaxItems: 1;
    maxOutputTokens: number;
  };
  admission: {
    candidateOpportunityCap: 1;
    physicalFetchCap: 1;
    fullQuestionSemanticCap: 1;
    outerAttempts: 1;
    sdkRetries: 0;
    qualityMode: "strict";
    attemptIndex: 0;
    debitGlobalCandidateBudgetOnStartedOpportunity: 1;
    pricingAuthority: "FRESH_SCHEMA_V2_EXACT_TAG_PROOF_PLUS_DURABLE_CONTROLLER";
    pricingAttached: false;
  };
  topology: Record<string, boolean | string>;
  replacementAllowed: false;
  topUpAllowed: false;
  campaignEligible: false;
  generationAuthorized: false;
}

export interface PrivateQueue {
  schemaVersion: string;
  status: string;
  confidentiality: string;
  campaignId: typeof CAMPAIGN_ID;
  seed: typeof SEED;
  corpusBinding: Record<string, unknown>;
  fixedRequestContext: Record<string, unknown>;
  costAdmissionContract: Record<string, unknown>;
  passages: PrivatePassage[];
  assignments: PrivateAssignment[];
  noReplacementOrTopUp: true;
  campaignEligibleAssignments: 0;
  generationAuthorized: false;
  safety: Record<string, number>;
  privateQueueSemanticSha256: string;
}

export function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => left.localeCompare(right, "en"))
        .map(([key, child]) => [key, stableValue(child)]),
    );
  }
  return value;
}

export function stableJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

export function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function fileSha256(filePath: string): string {
  return sha256(readFileSync(filePath));
}

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function verifyManifest(manifestPath: string, base: string): void {
  const lines = readFileSync(manifestPath, "utf8").trim().split(/\r?\n/u);
  assert(lines.length > 0, `${manifestPath}: empty manifest`);
  for (const [index, line] of lines.entries()) {
    const match = /^([a-f0-9]{64})  (.+)$/u.exec(line);
    assert(match, `${manifestPath}:${index + 1}: malformed manifest line`);
    const resolved = path.resolve(base, match[2]);
    assert(resolved.startsWith(`${repoRoot}${path.sep}`), "manifest path escaped repository");
    assert.equal(fileSha256(resolved), match[1], `${match[2]} changed after seal`);
  }
}

function countBy(values: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) => left.localeCompare(right, "en")),
  );
}

function validateRemediationClosure(
  remediation: Record<string, unknown>,
  sourceHashes: { private: string; public: string; manifest: string },
): void {
  assert.equal(
    remediation.schemaVersion,
    "campaign-v6-original-corpus-remediation-public-v1",
  );
  assert.equal(
    remediation.verdict,
    "PASS_REMEDIATED_CORPUS_QUALITY_AND_STRUCTURE_GATES_NOT_EXTERNAL_DISPATCH_AUTHORIZATION",
  );
  const remediationBytes = stableJson(remediation);
  for (const [label, digest] of Object.entries(sourceHashes)) {
    assert(
      remediationBytes.includes(digest),
      `remediation evidence does not bind remediated ${label} hash`,
    );
  }
}

function validateIndependentV2AuditClosure(
  audit: Record<string, unknown>,
  sourceHashes: { private: string; public: string; manifest: string },
  remediationHashes: { public: string; manifest: string },
): void {
  assert.equal(
    audit.schemaVersion,
    "question-quality-s1-v6-corpus-independent-v2-audit-public-v1",
  );
  assert.equal(
    audit.verdict,
    "PASS_INDEPENDENT_V2_CORPUS_AUDIT_NOT_EXTERNAL_DISPATCH_AUTHORIZATION",
  );
  const auditBytes = stableJson(audit);
  for (const [label, digest] of Object.entries({ ...sourceHashes, ...remediationHashes })) {
    assert(auditBytes.includes(digest), `independent v2 audit does not bind ${label} hash`);
  }
  const manual = audit.manualReview as Record<string, unknown>;
  assert.equal(manual.exactPassages, 12);
  assert.equal(manual.grammarBindingsReviewed, 30);
  assert.equal(manual.grammarBindingsPassed, 30);
  assert.equal(manual.blankRowsReviewed, 6);
  assert.equal(manual.blankAnswerUniquenessPass, 6);
  const overlap = audit.originalityAndLeakage as Record<string, unknown>;
  assert.equal(overlap.independentRepositoryHitFiles, 0);
  assert.equal(overlap.independentRepositoryHitFileRowPairs, 0);
}

function profilesFor(type: QuestionType): readonly Profile[] {
  return type === "GRAMMAR_ERROR" ? GRAMMAR_PROFILES : BLANK_PROFILES;
}

function modelFor(plan: Plan): string {
  return MODELS[plan];
}

function outputCap(type: QuestionType): number {
  return type === "GRAMMAR_ERROR" ? 6_000 : 4_000;
}

function buildPassages(
  corpus: PrivateCorpus,
  publicCorpus: PublicCorpus,
): PrivatePassage[] {
  const publicById = new Map(publicCorpus.rows.map((row) => [row.publicId, row]));
  return corpus.rows.map((row) => {
    const publicRow = publicById.get(row.publicId);
    assert(publicRow, `${row.publicId}: missing public commitment row`);
    assert.equal(publicRow.questionType, row.questionType);
    assert.equal(row.rightsProvenance.rowPublicId, row.publicId);
    assert.equal(row.rightsProvenance.campaignScopeId, CAMPAIGN_ID);
    assert.equal(row.rightsProvenance.origin, "NEW_ORIGINAL_COMPOSITION_FOR_THIS_USER_REQUEST");
    assert.equal(row.rightsProvenance.copiedOrAdapted, false);
    assert.equal(row.rightsProvenance.sourceCitation, null);
    assert.equal(row.rightsProvenance.thirdPartyPermissionClaimed, false);
    assert.equal(row.rightsProvenance.piiManuallyObserved, false);
    assert.equal(
      row.rightsProvenance.processingScopeStatus,
      "PERMITTED_BY_REQUESTING_USER_FOR_S1_V6_ONLY",
    );
    const passageUtf8Sha256 = sha256(Buffer.from(row.passageText, "utf8"));
    const fullCommitment = sha256(stableJson(row));
    const rightsCommitment = sha256(stableJson(row.rightsProvenance));
    assert.equal(publicRow.passageSha256, passageUtf8Sha256);
    assert.equal(publicRow.fullPrivateRowCommitmentSha256, fullCommitment);
    assert.equal(publicRow.rightsProvenanceCommitmentSha256, rightsCommitment);
    assert.equal(publicRow.thirdPartyPermissionClaimed, false);
    assert.equal(publicRow.piiStatus, "MANUAL_ATTESTATION_FALSE_AND_MACHINE_PATTERN_SCAN_CLEAR");
    assert.equal(publicRow.processingScopeStatus, "PERMITTED_BY_REQUESTING_USER_FOR_S1_V6_ONLY");
    const sourceRightsEvidence = {
      campaignId: CAMPAIGN_ID,
      corpusArtifactId: corpus.artifactId,
      corpusRevisionId: corpus.revisionId,
      rowPublicId: row.publicId,
      authorship: "CAMPAIGN_ORIGINAL",
      externalModelProcessingAuthorized: true,
      piiReview: "NO_PII_FOUND",
      passageUtf8Sha256,
      rightsProvenanceCommitmentSha256: rightsCommitment,
      historicalDbRequirement: "NOT_APPLICABLE_NEW_ORIGINAL_SOURCE",
    } as const;
    const materializerRightsRecord = {
      authorship: "CAMPAIGN_ORIGINAL",
      externalModelProcessingAuthorized: true,
      piiReview: "NO_PII_FOUND",
      passageUtf8Sha256,
    } as const;
    return {
      publicId: row.publicId,
      passageToken: `p-${sha256(`${SEED}|passage|${row.publicId}|${passageUtf8Sha256}`).slice(0, 32)}`,
      questionType: row.questionType,
      passageContentExact: row.passageText,
      passageUtf8Bytes: Buffer.byteLength(row.passageText, "utf8"),
      passageUtf8Sha256,
      fullPrivateRowCommitmentSha256: fullCommitment,
      descriptors: row.descriptors,
      typeSpecificDesign: row.suitability,
      historicalDbRequirement: "NOT_APPLICABLE_NEW_ORIGINAL_SOURCE",
      rights: {
        rightsRecordHash: sha256(stableJson(materializerRightsRecord)),
        sourceRightsEvidenceHash: sha256(stableJson(sourceRightsEvidence)),
        authorship: "CAMPAIGN_ORIGINAL",
        externalModelProcessingAuthorized: true,
        piiReview: "NO_PII_FOUND",
        passageUtf8Sha256,
        rightsProvenanceCommitmentSha256: rightsCommitment,
        campaignScopeId: CAMPAIGN_ID,
      },
    };
  });
}

function buildAssignments(passages: PrivatePassage[]): PrivateAssignment[] {
  const cells: Omit<PrivateAssignment, "queueOrdinal" | "assignmentId">[] = [];
  for (const passage of passages) {
    for (const profileId of profilesFor(passage.questionType)) {
      for (const plan of PLANS) {
        if (profileId === "B1_TYPE_SCOPED_TAIL" && plan === "PREMIUM") continue;
        for (const difficulty of DIFFICULTIES) {
          const assignmentKey = [
            "S1V6",
            passage.questionType,
            passage.publicId,
            profileId,
            plan,
            difficulty,
          ].join(":");
          const orderRank = sha256(`${SEED}|order|${assignmentKey}`);
          cells.push({
            assignmentKey,
            orderRank,
            passageToken: passage.passageToken,
            questionType: passage.questionType,
            profileId,
            plan,
            difficulty,
            modelId: modelFor(plan),
            request: {
              plan: [{
                subType: passage.questionType,
                count: 1,
                reason: "S1 v6 immutable prompt-profile mechanism-screen assignment",
                targetPoints: [],
              }],
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
              providerRouting: PROVIDER_ROUTING,
              reasoning: REASONING_OFF,
              questionsMinItems: 1,
              questionsMaxItems: 1,
              maxOutputTokens: outputCap(passage.questionType),
            },
            admission: {
              candidateOpportunityCap: 1,
              physicalFetchCap: 1,
              fullQuestionSemanticCap: 1,
              outerAttempts: 1,
              sdkRetries: 0,
              qualityMode: "strict",
              attemptIndex: 0,
              debitGlobalCandidateBudgetOnStartedOpportunity: 1,
              pricingAuthority: "FRESH_SCHEMA_V2_EXACT_TAG_PROOF_PLUS_DURABLE_CONTROLLER",
              pricingAttached: false,
            },
            topology: {
              runner: "runQuestionGeneration.productionCore",
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
            campaignEligible: false,
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
  return cells.map((cell, index) => ({
    queueOrdinal: index + 1,
    assignmentId: `S1V6-${String(index + 1).padStart(3, "0")}-${cell.orderRank.slice(0, 12)}`,
    ...cell,
  }));
}

function sourceClosure() {
  return SOURCE_PATHS.map(([role, relativePath]) => {
    const filePath = path.join(repoRoot, relativePath);
    return {
      role,
      path: relativePath,
      bytes: readFileSync(filePath).byteLength,
      sha256: fileSha256(filePath),
    };
  });
}

export function buildCampaignV6S1() {
  verifyManifest(paths.corpusManifest, corpusDir);
  verifyManifest(paths.remediationManifest, remediationDir);
  verifyManifest(paths.independentAuditManifest, independentAuditDir);
  verifyManifest(paths.negativeProfileAuditManifest, negativeProfileAuditDir);
  const corpus = readJson<PrivateCorpus>(paths.corpusPrivate);
  const publicCorpus = readJson<PublicCorpus>(paths.corpusPublic);
  const remediation = readJson<Record<string, unknown>>(paths.remediationPublic);
  const audit = readJson<Record<string, unknown>>(paths.independentAuditPublic);
  const negativeProfileAudit = readJson<Record<string, unknown>>(
    paths.negativeProfileAuditResults,
  );
  assert.equal(negativeProfileAudit.schemaVersion, 1);
  assert.equal(negativeProfileAudit.verdict, "PASS_REMEDIATED_OFFLINE");
  const negativeProfileSideEffects = negativeProfileAudit.sideEffects as Record<
    string,
    unknown
  >;
  assert.deepEqual(negativeProfileSideEffects, {
    externalApiCalls: 0,
    networkCalls: 0,
    applicationDatabaseReads: 0,
    applicationDatabaseWrites: 0,
    candidatesConsumed: 0,
    secretsRead: 0,
  });
  assert.equal(corpus.schemaVersion, "question-quality-original-s1-v6-private-v2");
  assert.equal(publicCorpus.schemaVersion, "question-quality-original-s1-v6-public-v2");
  assert.equal(corpus.artifactId, "original-s1-v6");
  assert.equal(publicCorpus.artifactId, corpus.artifactId);
  assert.equal(corpus.revisionId, "original-s1-v6-remediation-v1");
  assert.equal(publicCorpus.revisionId, corpus.revisionId);
  assert.equal(corpus.campaignScopeId, CAMPAIGN_ID);
  assert.equal(publicCorpus.campaignScopeId, CAMPAIGN_ID);
  assert.equal(publicCorpus.status, "SEALED_ORIGINAL_CORPUS_NOT_DISPATCH_AUTHORIZATION");
  assert.equal(publicCorpus.admission.generationAuthorized, false);
  assert.equal(publicCorpus.admission.corpusRightsAndScopeRecord, "PASS_FOR_S1_V6_SCOPED_PROCESSING");
  assert.equal(corpus.rows.length, 12);
  assert.equal(publicCorpus.rows.length, 12);
  const corpusHashes = {
    private: fileSha256(paths.corpusPrivate),
    public: fileSha256(paths.corpusPublic),
    manifest: fileSha256(paths.corpusManifest),
  };
  const remediationHashes = {
    public: fileSha256(paths.remediationPublic),
    manifest: fileSha256(paths.remediationManifest),
  };
  validateRemediationClosure(remediation, corpusHashes);
  validateIndependentV2AuditClosure(audit, corpusHashes, remediationHashes);

  const passages = buildPassages(corpus, publicCorpus);
  const assignments = buildAssignments(passages);
  assert.equal(passages.length, 12);
  assert.equal(new Set(passages.map((row) => row.passageToken)).size, 12);
  assert.equal(new Set(passages.map((row) => row.passageUtf8Sha256)).size, 12);
  assert.equal(assignments.length, 180);
  assert.equal(new Set(assignments.map((row) => row.assignmentKey)).size, 180);
  assert.equal(new Set(assignments.map((row) => row.assignmentId)).size, 180);
  assert.deepEqual(countBy(assignments.map((row) => row.questionType)), {
    BLANK_INFERENCE: 84,
    GRAMMAR_ERROR: 96,
  });
  assert.deepEqual(countBy(assignments.map((row) => row.plan)), {
    PREMIUM: 84,
    STANDARD: 96,
  });
  assert.deepEqual(countBy(assignments.map((row) => row.difficulty)), {
    INTERMEDIATE: 90,
    KILLER: 90,
  });
  assert.equal(
    assignments.filter(
      (row) => row.profileId === "B1_TYPE_SCOPED_TAIL" && row.plan === "PREMIUM",
    ).length,
    0,
  );

  const totalOutputTokens = assignments.reduce(
    (sum, row) => sum + row.wireContract.maxOutputTokens,
    0,
  );
  assert.equal(totalOutputTokens, 912_000);
  const outputTokensByPlan = Object.fromEntries(
    PLANS.map((plan) => [
      plan,
      assignments
        .filter((row) => row.plan === plan)
        .reduce((sum, row) => sum + row.wireContract.maxOutputTokens, 0),
    ]),
  ) as Record<Plan, number>;
  assert.deepEqual(outputTokensByPlan, { STANDARD: 480_000, PREMIUM: 432_000 });
  const assignmentRowsByPlan = countBy(assignments.map((row) => row.plan));
  const designStressMaximumUsd = Math.ceil(
    DESIGN_SAFETY_MULTIPLIER *
      (
        assignmentRowsByPlan.STANDARD * DESIGN_SERVER_TOKEN_OVERHEAD_PER_ASSIGNMENT *
          DESIGN_EMERGENCY_RATES_USD_PER_1M.STANDARD.input +
        (DESIGN_EXACT_WIRE_BODY_UTF8_BYTES_CEILING +
          assignmentRowsByPlan.PREMIUM * DESIGN_SERVER_TOKEN_OVERHEAD_PER_ASSIGNMENT) *
          DESIGN_EMERGENCY_RATES_USD_PER_1M.PREMIUM.input +
        outputTokensByPlan.STANDARD * DESIGN_EMERGENCY_RATES_USD_PER_1M.STANDARD.output +
        outputTokensByPlan.PREMIUM * DESIGN_EMERGENCY_RATES_USD_PER_1M.PREMIUM.output
      ) /
      1_000_000 *
      1e9,
  ) / 1e9;
  assert.equal(designStressMaximumUsd, 99.1229184);
  assert(designStressMaximumUsd <= DESIGN_CEILING_USD);
  const sourceFiles = sourceClosure();
  const queueCore = {
    schemaVersion: "question-quality-s1-campaign-v6-private-queue-v1",
    status: "IMMUTABLE_QUEUE_EXECUTION_BLOCKED",
    confidentiality:
      "PRIVATE_GIT_IGNORED: exact text, row commitments, rights records, assignment membership and deterministic order.",
    campaignId: CAMPAIGN_ID,
    seed: SEED,
    corpusBinding: {
      artifactId: corpus.artifactId,
      revisionId: corpus.revisionId,
      privateArtifactSha256: corpusHashes.private,
      publicArtifactSha256: corpusHashes.public,
      manifestSha256: corpusHashes.manifest,
      remediationPublicSha256: remediationHashes.public,
      remediationManifestSha256: remediationHashes.manifest,
      remediationVerdict: String(remediation.verdict),
      independentV2AuditPublicSha256: fileSha256(paths.independentAuditPublic),
      independentV2AuditManifestSha256: fileSha256(paths.independentAuditManifest),
      independentAuditVerdict: String(audit.verdict),
      rowLevelOriginalAuthorshipBound: true,
      rowLevelPiiReviewBound: true,
      rowLevelProcessingScopeBound: true,
      historicalDbRequirement: "NOT_APPLICABLE_NEW_ORIGINAL_SOURCE",
    },
    fixedRequestContext: {
      schoolType: SCHOOL_TYPE,
      gradeInfo: GRADE_INFO,
      difficulties: DIFFICULTIES,
      difficultyInstructions: Object.fromEntries(
        DIFFICULTIES.map((difficulty) => [difficulty, DIFF_DESCRIPTION[difficulty]]),
      ),
      profiles: { grammar: GRAMMAR_PROFILES, blank: BLANK_PROFILES },
      models: MODELS,
      providerRouting: PROVIDER_ROUTING,
      reasoning: REASONING_OFF,
      candidateOutputsPerCompletion: 1,
      completionCount: 1,
    },
    costAdmissionContract: {
      status: "UNPRICED_EXECUTION_BLOCKED",
      staleV5FlatPerCallCapsAcceptedAsExecutionAuthority: false,
      executionPricingAuthority:
        "Fresh schema-v2 exact google-vertex/global tag proof, <=15 minutes old, plus all-active-endpoint emergency ceiling materialized by campaign-v6-s1-durable-controller-v1.",
      designCeilingIsExecutionAuthorization: false,
      designCeilingUsd: DESIGN_CEILING_USD,
      planningArithmetic: {
        grammarOutputTokens: 96 * 6_000,
        blankOutputTokens: 84 * 4_000,
        outputTokensByPlan,
        totalOutputTokens,
        exactWireBodyUtf8BytesCeiling: DESIGN_EXACT_WIRE_BODY_UTF8_BYTES_CEILING,
        utf8ByteAsInputTokenStressFactor: 1,
        serverTokenOverheadUpperBoundPerAssignment:
          DESIGN_SERVER_TOKEN_OVERHEAD_PER_ASSIGNMENT,
        emergencyRatesUsdPer1M: DESIGN_EMERGENCY_RATES_USD_PER_1M,
        bodyByteAllocationStress:
          "All exact-wire body bytes are charged at the higher Premium emergency input rate; per-plan server overhead and output are charged at their own model rates.",
        safetyMultiplier: DESIGN_SAFETY_MULTIPLIER,
        computedMaximumUsdAtDesignByteCeiling: designStressMaximumUsd,
        designHeadroomUsd: DESIGN_CEILING_USD - designStressMaximumUsd,
        formula:
          "1.1 * ((96*4096*2.7 + (9000000+84*4096)*7.2 + 480000*16.2 + 432000*32.4) / 1000000)",
        ratesAreLiveExecutionAuthority: false,
      },
      liveAdmissionRequirements: {
        freshPriceSchemaVersion: 2,
        exactRouteTag: "google-vertex/global",
        maximumPriceAgeMinutes: 15,
        finalDurableControllerCampaignMaxCostMustNotExceedDesignCeilingUsd:
          DESIGN_CEILING_USD,
        exactWireTotalBytesMustNotExceedDesignCeilingBytes:
          DESIGN_EXACT_WIRE_BODY_UTF8_BYTES_CEILING,
        providerHardLimitMustEqualDurableControllerCap: true,
        missingOrHigherPriceProofAction: "BLOCK_AND_REQUIRE_EXPLICIT_DESIGN_AMENDMENT",
      },
    },
    passages,
    assignments,
    noReplacementOrTopUp: true,
    campaignEligibleAssignments: 0,
    generationAuthorized: false,
    safety: {
      modelApiCalls: 0,
      providerCalls: 0,
      networkCalls: 0,
      databaseCalls: 0,
      secretReads: 0,
      apiCandidatesConsumed: 0,
    },
  } as const;
  const privateQueue: PrivateQueue = {
    ...queueCore,
    privateQueueSemanticSha256: sha256(stableJson(queueCore)),
  };
  const privateBytes = `${JSON.stringify(privateQueue, null, 2)}\n`;

  const publicCore = {
    schemaVersion: "question-quality-s1-campaign-v6-public-v1",
    status: "IMMUTABLE_DESIGN_EXECUTION_BLOCKED",
    campaignId: CAMPAIGN_ID,
    design: {
      immutableSeedSha256: sha256(SEED),
      assignmentRows: 180,
      sourcePassages: 12,
      candidateOpportunityCap: 180,
      physicalFetchCap: 180,
      fullQuestionSemanticCap: 180,
      completionCountPerAssignment: 1,
      candidateOutputsPerCompletion: 1,
      outerAttemptsPerAssignment: 1,
      sdkRetriesPerAssignment: 0,
      replacementAllowed: false,
      topUpAllowed: false,
    },
    allocation: {
      grammar: {
        formula: "4 profiles x 2 plans x 2 difficulties x 6 passages",
        assignments: 96,
      },
      blankStandard: {
        formula: "4 profiles x 2 difficulties x 6 passages",
        assignments: 48,
      },
      blankPremium: {
        formula: "3 profiles (B0/B2/B3) x 2 difficulties x 6 passages",
        assignments: 36,
      },
      b1PremiumAssignments: 0,
      byType: countBy(assignments.map((row) => row.questionType)),
      byPlan: countBy(assignments.map((row) => row.plan)),
      byDifficulty: countBy(assignments.map((row) => row.difficulty)),
      byProfile: countBy(assignments.map((row) => row.profileId)),
      byModel: countBy(assignments.map((row) => row.modelId)),
    },
    frozenRuntime: {
      models: MODELS,
      profiles: { grammar: GRAMMAR_PROFILES, blank: BLANK_PROFILES },
      providerRouting: PROVIDER_ROUTING,
      reasoning: REASONING_OFF,
      difficultyDescriptionSource:
        "src/app/api/ai/generate-questions-auto/_lib/constants.ts:DIFF_DESCRIPTION",
      promptAndGateClosureSha256: sha256(stableJson(sourceFiles)),
      directProductionCoreSingleShot: true,
      profileEvidence: {
        historicalIntegrationAuditRole: "HISTORICAL_BASELINE_ONLY",
        currentNegativeEvidenceAuditVerdict: String(negativeProfileAudit.verdict),
        currentNegativeEvidenceResultsSha256:
          fileSha256(paths.negativeProfileAuditResults),
        currentNegativeEvidenceFindingsSha256:
          fileSha256(paths.negativeProfileAuditFindings),
        currentNegativeEvidenceSourceClosureSha256:
          fileSha256(paths.negativeProfileAuditSourceClosure),
        currentNegativeEvidenceManifestSha256:
          fileSha256(paths.negativeProfileAuditManifest),
        liveQualityImprovementClaimed: false,
      },
    },
    corpusClosure: {
      artifactId: corpus.artifactId,
      revisionId: corpus.revisionId,
      corpusPrivateArtifactSha256: corpusHashes.private,
      corpusPublicArtifactSha256: corpusHashes.public,
      corpusManifestSha256: corpusHashes.manifest,
      remediationPublicSha256: remediationHashes.public,
      remediationManifestSha256: remediationHashes.manifest,
      finalRemediationVerdict: String(remediation.verdict),
      independentV2AuditPublicSha256: fileSha256(paths.independentAuditPublic),
      independentV2AuditManifestSha256: fileSha256(paths.independentAuditManifest),
      finalIndependentAuditVerdict: String(audit.verdict),
      rowLevelRightsPiiAndScopeBoundPrivately: true,
      historicalDbRequirement: "NOT_APPLICABLE_NEW_ORIGINAL_SOURCE",
    },
    sourceClosure: {
      sha256: sha256(stableJson(sourceFiles)),
      files: sourceFiles,
    },
    privateQueue: {
      fileSha256: sha256(privateBytes),
      semanticSha256: privateQueue.privateQueueSemanticSha256,
      utf8Bytes: Buffer.byteLength(privateBytes, "utf8"),
      publicRowMembershipExposed: false,
    },
    costAdmission: queueCore.costAdmissionContract,
    authorization: {
      status: "BLOCKED",
      campaignEligibleAssignments: 0,
      generationAuthorized: false,
      apiCandidatesConsumed: 0,
      executionPricingAttached: false,
      exactWirePreflightAttached: false,
      durableControllerMaterialized: false,
      remainingHolds: [
        "offline exact-wire production-core replay",
        "fresh schema-v2 exact-tag price proof",
        "durable controller materialization under the design ceiling",
        "dedicated zero-usage limited credential and matching provider hard limit",
        "fresh independent pre-dispatch audit and explicit authorization",
      ],
    },
    safety: {
      externalNetworkCalls: 0,
      providerCalls: 0,
      modelCalls: 0,
      databaseCalls: 0,
      secretReads: 0,
      apiCandidatesConsumed: 0,
    },
  } as const;
  const publicArtifact = {
    ...publicCore,
    publicArtifactSemanticSha256: sha256(stableJson(publicCore)),
  };
  const publicBytes = `${JSON.stringify(publicArtifact, null, 2)}\n`;
  return { privateQueue, publicArtifact, privateBytes, publicBytes };
}

function writeManifest(): void {
  const lines = MANIFEST_FILES.map((relativePath) =>
    `${fileSha256(path.join(here, relativePath))}  ${relativePath.replaceAll("\\", "/")}`,
  );
  writeFileSync(paths.manifest, `${lines.join("\n")}\n`, "utf8");
}

async function main(): Promise<void> {
  const output = buildCampaignV6S1();
  if (process.argv.includes("--write")) {
    mkdirSync(path.dirname(paths.privateQueue), { recursive: true });
    writeFileSync(paths.privateQueue, output.privateBytes, "utf8");
    writeFileSync(paths.publicArtifact, output.publicBytes, "utf8");
    writeManifest();
  }
  process.stdout.write(`${JSON.stringify({
    status: output.publicArtifact.status,
    assignments: output.privateQueue.assignments.length,
    privateQueueSemanticSha256: output.privateQueue.privateQueueSemanticSha256,
    publicArtifactSemanticSha256: output.publicArtifact.publicArtifactSemanticSha256,
    apiCandidatesConsumed: 0,
  }, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
