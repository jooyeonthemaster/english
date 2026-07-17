import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import {
  adaptBlankOptionLedgerCandidateForCurrentGates,
  adaptGrammarSiteCertificateCandidateForCurrentGates,
  adaptPremiumGrammarAnswerSiteCertificateForCurrentLadder,
  buildBlankOptionLedgerResponseSchema,
  buildGrammarSiteCertificateResponseSchema,
  buildPremiumGrammarAnswerStageSiteCertificateSchema,
  CORE_10_POINT_CODES,
} from "./schema-drafts";
import { EXACT_PROMPT_PROFILES } from "./prompt-deltas";
import { STRUCTURED_TYPE_PROMPTS } from "../../../../src/lib/question-schemas";
import { getAiResponseSchema } from "../../../../src/lib/question-ai-schemas-mc";
import {
  buildQuestionTargetCandidateBlock,
  getTypeQualityRubric,
} from "../../../../src/lib/question-quality";
import {
  buildQuestionTypeSettingsPrompt,
  resolveQuestionTypeGenerationSettings,
} from "../../../../src/lib/question-type-generation-settings";
import {
  buildGenerationPrompt,
  STRUCTURED_OUTPUT_INSTRUCTIONS,
} from "../../../../src/app/api/ai/generate-questions-auto/_lib/prompts";
import {
  buildGrammarPremiumAnswerPrompt,
  buildGrammarPremiumDecoyPrompt,
  grammarPremiumAnswerOnlySchema,
} from "../../../../src/app/api/ai/generate-questions-auto/_lib/grammar-premium-ladder";


const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../../../..");

const REPRESENTATIVE_PASSAGE = `People often assume that more information automatically improves judgment. Yet information helps only when a decision maker can distinguish evidence from noise. When every new signal receives equal attention, weak clues may crowd out the few facts that actually predict the outcome. Experts therefore do not merely collect more observations; they organize them according to a theory of what matters. This structure also makes revision possible. If a prediction fails, the expert can identify which assumption should change instead of abandoning the entire framework. Good judgment is thus not the passive accumulation of facts but the disciplined allocation of attention. The paradox is that a smaller, well-ordered body of evidence may support a better decision than a larger, unstructured one.`;

const SOURCE_PINS: Record<string, string> = {
  "src/lib/question-prompts-mc.ts":
    "56b736e9f5fa639146d30c811589182099708eba06d0f9e3b4338c0a098e0206",
  "src/lib/question-generation-prompt-contract.ts":
    "5fcf0144529af8b5cc72616c25fd45535d5920098acc5434e7c7ec428e9cd354",
  "src/lib/question-ai-schemas-mc.ts":
    "bb921628a894646addd851e1ac97f30c0d65ac657826e7413bc41a25abbc52ac",
  "src/app/api/ai/generate-questions-auto/_lib/prompts.ts":
    "7d6f0d25e2933f122323dda29d3f65bacb03dafc62444f4cff72088e8422bf59",
  "src/app/api/ai/generate-questions-auto/_lib/run-question-generation.ts":
    "b13d1b161286d12ce44eb23ff8f4e594421676109bf8c348abea0c9393ebd4a5",
  "src/app/api/ai/generate-questions-auto/_lib/grammar-premium-ladder.ts":
    "40141d5ecf0c713f1d706cbedf434f2a7eef86d44fa3ddd22142ddba3f3c22a3",
  "src/app/api/ai/generate-questions-auto/_lib/question-repair.ts":
    "811702366ba41f36310d2a80963ad35076c37ed4a695f1eac3b69d4dbc4729dc",
  "src/app/api/ai/generate-questions-auto/_lib/run-question-generation-constants.ts":
    "a672875d20315667b7a662737930f63c76328136656bbb635c014d5f1ed24bff",
  "src/app/api/ai/generate-questions-auto/_lib/run-question-generation-helpers.ts":
    "bda4f9f2c10a7284a74424b16799024ff07e3956cc5357292b4ce9416cc549d4",
  "src/app/api/ai/generate-questions-auto/_lib/grammar-solver-gate.ts":
    "be7a80c1e4e9833f5b05352c532375534b5a1f19102b12f6fea89b9f5310da88",
  "src/lib/korean/quality/solver-gate.ts":
    "0684d70bceeb33de90f56f5cd055aac3327274c5a6e39d188c1597d197e3b499",
  "src/lib/question-generation-research-runtime.ts":
    "bf087a05daf3b13c03fa48dfe2962872c13c3f5aeb9022941fccb06d8381aff6",
  "experiments/question-quality-20260715/offline/out/prompt-constraint-census.json":
    "a5c9ca9d8f2d68bf5afcab97cfad042099e3a2644e3d692d78890e80ef356831",
  "experiments/question-quality-20260715/pricing/openrouter-pricing-snapshot.json":
    "4b8c0cf36d3bca226e6ce824fa566ef96e496c384cb37256a987247332cc73e3",
};

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function readJson<T>(relative: string): T {
  return JSON.parse(fs.readFileSync(path.join(HERE, relative), "utf8")) as T;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function extractGrammarFinalChecklist(): string {
  const source = fs.readFileSync(
    path.join(
      ROOT,
      "src/app/api/ai/generate-questions-auto/_lib/run-question-generation.ts",
    ),
    "utf8",
  );
  const match = source.match(
    /const GRAMMAR_ERROR_FINAL_CHECKLIST = `([\s\S]*?)`;/,
  );
  assert(match, "Unable to extract GRAMMAR_ERROR_FINAL_CHECKLIST from pinned source");
  return match[1];
}

type Plan = "STANDARD" | "PREMIUM";
type ProfileId =
  | "G0_CURRENT_CONTROL"
  | "G1_FINAL_CHECKLIST_ABLATION"
  | "G2_POSITIVE_COMPACT"
  | "G3_SITE_CERTIFICATE"
  | "B0_CURRENT_CONTROL"
  | "B1_TYPE_SCOPED_TAIL"
  | "B2_POSITIVE_COMPACT"
  | "B3_OPTION_INTENT_LEDGER";

interface SurfaceMeasurement {
  profileId: ProfileId;
  type: "GRAMMAR_ERROR" | "BLANK_INFERENCE";
  plan: Plan;
  promptChars: number;
  systemChars: number;
  schemaChars: number;
  totalChars: number;
  calibratedInputTokens: number;
  sensitivityInputTokens: { low: number; high: number };
  expectedCompletionTokens: number;
  expectedUsdUnder200k: number;
  conservativeAnyTierUsd: number;
}

const CALIBRATION_CHARS_PER_TOKEN = 2.2696;
const TOKEN_SENSITIVITY = { minCharsPerToken: 1.8, maxCharsPerToken: 3.0 };

function modelRates(plan: Plan) {
  if (plan === "STANDARD") {
    return {
      inputUnder200k: 0.0000027,
      outputUnder200k: 0.0000162,
      inputAnyTier: 0.0000027,
      outputAnyTier: 0.0000162,
    };
  }
  return {
    inputUnder200k: 0.0000036,
    outputUnder200k: 0.0000216,
    inputAnyTier: 0.0000072,
    outputAnyTier: 0.0000324,
  };
}

function resolvedFor(type: "GRAMMAR_ERROR" | "BLANK_INFERENCE") {
  return resolveQuestionTypeGenerationSettings(type, {}, "KILLER") as unknown as Record<
    string,
    unknown
  >;
}

function schemaOptions(resolved: Record<string, unknown>, grammarMarkerCount?: number) {
  return {
    irrelevantSlotCount: resolved.irrelevantSlotCount as number | undefined,
    grammarMarkerCount:
      grammarMarkerCount ?? (resolved.grammarMarkerCount as number | undefined),
    grammarAnswerCount: resolved.grammarAnswerCount as number | undefined,
    grammarCorrectionErrorCount: resolved.grammarCorrectionErrorCount as number | undefined,
    summaryCompleteMcBlankCount: resolved.summaryCompleteMcBlankCount as number | undefined,
    summaryCompleteBlankCount: resolved.summaryCompleteBlankCount as number | undefined,
    summaryWritingBlankCount: resolved.summaryWritingBlankCount as number | undefined,
    topicSentenceWritingBlankCount: resolved.topicSentenceWritingBlankCount as number | undefined,
    contentMatchOptionCount: resolved.contentMatchOptionCount as number | undefined,
    contentMatchAnswerCount: resolved.contentMatchAnswerCount as number | undefined,
    vocabChoiceMarkerCount: resolved.vocabChoiceMarkerCount as number | undefined,
    vocabChoiceAnswerCount: resolved.vocabChoiceAnswerCount as number | undefined,
    sentenceInsertSlotCount: resolved.sentenceInsertSlotCount as number | undefined,
    antonymPairCount: resolved.antonymPairCount as number | undefined,
    blankInferenceBlankCount: resolved.blankInferenceBlankCount as number | undefined,
    genericOptionCount: resolved.genericOptionCount as number | undefined,
    genericAnswerCount: resolved.genericAnswerCount as number | undefined,
  };
}

function candidateOptions(
  resolved: Record<string, unknown>,
  grammarMarkerCount?: number,
  grammarScarcityBaseCount?: number,
) {
  return {
    irrelevantSlotCount: resolved.irrelevantSlotCount as number | undefined,
    grammarMarkerCount:
      grammarMarkerCount ?? (resolved.grammarMarkerCount as number | undefined),
    grammarScarcityBaseCount,
    grammarAnswerCount: resolved.grammarAnswerCount as number | undefined,
    grammarCorrectionErrorCount: resolved.grammarCorrectionErrorCount as number | undefined,
    antonymPairCount: resolved.antonymPairCount as number | undefined,
    blankInferenceBlankCount: resolved.blankInferenceBlankCount as number | undefined,
    blankInferenceParaphraseAnswer:
      resolved.blankInferenceParaphraseAnswer as boolean | undefined,
    blankInferenceDoubleNegative:
      resolved.blankInferenceDoubleNegative as boolean | undefined,
    requestedDifficulty: "KILLER",
    variantIndex: 0,
    diversityEnabled: false,
    pointFocus: (resolved.grammarPointFocus ?? resolved.blankPointFocus) as
      | boolean
      | undefined,
  };
}

function measureSurface(profileId: ProfileId, plan: Plan): SurfaceMeasurement {
  const type = profileId.startsWith("G") ? "GRAMMAR_ERROR" : "BLANK_INFERENCE";
  const resolved = resolvedFor(type);
  const finalMarkerCount = Number(resolved.grammarMarkerCount ?? 5);
  const generatedGrammarMarkerCount =
    type === "GRAMMAR_ERROR" ? Math.min(10, finalMarkerCount + 1) : undefined;

  let typePrompt = STRUCTURED_TYPE_PROMPTS[type] ?? "";
  let typeQualityRubric = getTypeQualityRubric(type, "KILLER");
  let targetCandidateBlock = buildQuestionTargetCandidateBlock(
    type,
    REPRESENTATIVE_PASSAGE,
    candidateOptions(
      resolved,
      generatedGrammarMarkerCount,
      type === "GRAMMAR_ERROR" ? finalMarkerCount : undefined,
    ),
  );
  let finalChecklist = type === "GRAMMAR_ERROR" ? extractGrammarFinalChecklist() : "";
  let standardContractScope: "production_legacy" | "force_type_scoped" =
    "production_legacy";

  const effectiveTypeSettings =
    type === "GRAMMAR_ERROR"
      ? {
          ...((resolved.effectiveTypeSettings as Record<string, unknown>) ?? {}),
          markerCount: generatedGrammarMarkerCount,
        }
      : ((resolved.effectiveTypeSettings as Record<string, unknown>) ?? {});
  let customPrompt = buildQuestionTypeSettingsPrompt(
    type,
    effectiveTypeSettings,
    "KILLER",
  );

  if (profileId === "G1_FINAL_CHECKLIST_ABLATION") {
    finalChecklist = "";
  }
  if (profileId === "B1_TYPE_SCOPED_TAIL") {
    standardContractScope = "force_type_scoped";
  }
  if (profileId === "G2_POSITIVE_COMPACT" || profileId === "G3_SITE_CERTIFICATE") {
    typePrompt = EXACT_PROMPT_PROFILES[
      profileId === "G2_POSITIVE_COMPACT"
        ? "G2_POSITIVE_COMPACT"
        : "G3_SITE_CERTIFICATE"
    ];
    typeQualityRubric = "";
    targetCandidateBlock = "";
    finalChecklist = "";
    customPrompt = "";
  }
  if (profileId === "B2_POSITIVE_COMPACT" || profileId === "B3_OPTION_INTENT_LEDGER") {
    typePrompt = EXACT_PROMPT_PROFILES[
      profileId === "B2_POSITIVE_COMPACT"
        ? "B2_POSITIVE_COMPACT"
        : "B3_OPTION_INTENT_LEDGER"
    ];
    typeQualityRubric = "";
    targetCandidateBlock = "";
    customPrompt = "";
    standardContractScope = "force_type_scoped";
  }

  const currentSchema = getAiResponseSchema(
    type,
    schemaOptions(resolved, generatedGrammarMarkerCount),
  );
  const schema =
    profileId === "G3_SITE_CERTIFICATE"
      ? buildGrammarSiteCertificateResponseSchema(
          generatedGrammarMarkerCount,
          Number(resolved.grammarAnswerCount ?? 1),
        )
      : profileId === "B3_OPTION_INTENT_LEDGER"
        ? buildBlankOptionLedgerResponseSchema()
        : currentSchema;
  const schemaText = JSON.stringify(z.toJSONSchema(schema));

  const built = buildGenerationPrompt({
    schoolType: "high school",
    gradeInfo: "grade 2",
    passageContent: REPRESENTATIVE_PASSAGE,
    teacherIntentBlock: "",
    analysisContext: "",
    targetPoints: [],
    typePrompt,
    structuredInstructions: STRUCTURED_OUTPUT_INSTRUCTIONS,
    targetCandidateBlock,
    typeQualityRubric,
    typeCount: 1,
    diffLabel: "KILLER",
    diffInstruction: "top-tier exam item requiring precise passage evidence",
    generationPlan: plan,
    subType: type,
    standardContractScope,
    finalChecklist,
    customPrompt,
  });

  const systemChars = built.system?.length ?? 0;
  const promptChars = built.prompt.length;
  const schemaChars = schemaText.length;
  const totalChars = systemChars + promptChars + schemaChars;
  const calibratedInputTokens = Math.ceil(totalChars / CALIBRATION_CHARS_PER_TOKEN);
  const sensitivityInputTokens = {
    low: Math.ceil(totalChars / TOKEN_SENSITIVITY.maxCharsPerToken),
    high: Math.ceil(totalChars / TOKEN_SENSITIVITY.minCharsPerToken),
  };
  const expectedCompletionTokens = type === "GRAMMAR_ERROR" ? 4000 : 2500;
  const rates = modelRates(plan);
  const expectedUsdUnder200k =
    calibratedInputTokens * rates.inputUnder200k +
    expectedCompletionTokens * rates.outputUnder200k;
  const conservativeAnyTierUsd =
    sensitivityInputTokens.high * rates.inputAnyTier +
    expectedCompletionTokens * rates.outputAnyTier;

  return {
    profileId,
    type,
    plan,
    promptChars,
    systemChars,
    schemaChars,
    totalChars,
    calibratedInputTokens,
    sensitivityInputTokens,
    expectedCompletionTokens,
    expectedUsdUnder200k: Number(expectedUsdUnder200k.toFixed(6)),
    conservativeAnyTierUsd: Number(conservativeAnyTierUsd.toFixed(6)),
  };
}

function measurePremiumGrammarLadderFixture() {
  const ctx = {
    passageContent: REPRESENTATIVE_PASSAGE,
    difficulty: "KILLER",
    difficultyInstruction: "top-tier exam item requiring precise passage evidence",
  };
  const answerFixture = {
    direction: "다음 글의 밑줄 친 부분 중, 어법상 틀린 것은?",
    answerDesign: "fixture",
    answer: {
      expression: "receives",
      errorExpression: "receive",
      correction: "receives",
      surroundingText: "When every new signal receives equal attention, weak clues may crowd out the few facts",
      pointCode: "d" as const,
    },
    explanation: "fixture",
  };
  const answerPrompt = buildGrammarPremiumAnswerPrompt(ctx, null);
  const decoyPrompt = buildGrammarPremiumDecoyPrompt(ctx, answerFixture, null);
  const currentAnswerSchemaChars = JSON.stringify(
    z.toJSONSchema(grammarPremiumAnswerOnlySchema),
  ).length;
  const certificateAnswerSchemaChars = JSON.stringify(
    z.toJSONSchema(buildPremiumGrammarAnswerStageSiteCertificateSchema()),
  ).length;
  const fullSchemaChars = JSON.stringify(
    z.toJSONSchema(getAiResponseSchema("GRAMMAR_ERROR", {
      grammarMarkerCount: 5,
      grammarAnswerCount: 1,
    })),
  ).length;
  return {
    qualification:
      "Representative prompt/schema fixture only; add-decoys embeds model-produced answer-stage bytes, so this is not an exact token forecast for a future candidate.",
    answerPromptChars: answerPrompt.length,
    currentAnswerSchemaChars,
    certificateAnswerSchemaChars,
    certificateSchemaDeltaChars:
      certificateAnswerSchemaChars - currentAnswerSchemaChars,
    decoyPromptChars: decoyPrompt.length,
    fullSchemaChars,
  };
}

function verifyManifest() {
  const manifest = readJson<{
    schemaVersion: number;
    files: Array<{ path: string; sha256: string; bytes: number }>;
  }>("manifest.json");
  assert(manifest.schemaVersion === 1, "manifest schemaVersion mismatch");
  const actualFiles = fs
    .readdirSync(HERE, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name !== "manifest.json")
    .map((entry) => entry.name)
    .sort();
  const listedFiles = manifest.files.map((row) => row.path).sort();
  assert(
    JSON.stringify(listedFiles) === JSON.stringify(actualFiles),
    `manifest file set mismatch: listed=${listedFiles.join(",")} actual=${actualFiles.join(",")}`,
  );
  for (const row of manifest.files) {
    assert(!path.isAbsolute(row.path), `manifest path must be relative: ${row.path}`);
    const absolute = path.join(HERE, row.path);
    const content = fs.readFileSync(absolute);
    assert(content.length === row.bytes, `manifest byte mismatch: ${row.path}`);
    assert(sha256(content) === row.sha256, `manifest hash mismatch: ${row.path}`);
  }
}

function main() {
  const sourceTraceText = fs.readFileSync(path.join(HERE, "SOURCE-TRACE.md"), "utf8");
  for (const [relative, expected] of Object.entries(SOURCE_PINS)) {
    const actual = sha256(fs.readFileSync(path.join(ROOT, relative)));
    assert(actual === expected, `source pin drift: ${relative} ${actual} != ${expected}`);
    assert(
      sourceTraceText.includes(`\`${relative}\``) && sourceTraceText.includes(`\`${expected}\``),
      `SOURCE-TRACE.md is missing exact source pin: ${relative}`,
    );
  }

  const spec = readJson<any>("profile-spec.json");
  const rubric = readJson<any>("rubric-v1.json");
  const designText = fs.readFileSync(path.join(HERE, "DESIGN.md"), "utf8");
  assert(spec.execution.externalModelCalls === 0, "externalModelCalls must be zero");
  assert(spec.execution.fullQuestionCandidatesUsed === 0, "candidate usage must be zero");
  assert(
    spec.execution.productionFilesEditedByThisArtifact === 0,
    "production edit count must be zero",
  );
  assert(spec.execution.productionDefaultChanged === false, "production default changed");
  assert(spec.execution.authorization === "DESIGN_ONLY_NO_GO", "authorization must remain NO_GO");
  assert(
    spec.productionDefaults.standardModel === "google/gemini-3.5-flash" &&
      spec.productionDefaults.premiumQuestionModel ===
        "google/gemini-3.1-pro-preview" &&
      spec.productionDefaults.premiumGrammarLadderModel ===
        "google/gemini-3.1-pro-preview" &&
      spec.productionDefaults.geminiThinking.enabled === false &&
      spec.productionDefaults.geminiThinking.effort === "none" &&
      spec.productionDefaults.geminiThinking.exclude === true,
    "model/thinking-off attestation drifted",
  );
  assert(
    spec.pricing.snapshotSha256 ===
      SOURCE_PINS[
        "experiments/question-quality-20260715/pricing/openrouter-pricing-snapshot.json"
      ] && spec.pricing.staleForExecution === true,
    "pricing snapshot pin/staleness drifted",
  );
  assert(spec.profiles.length === 8, "expected exactly eight profiles");
  for (const type of ["GRAMMAR_ERROR", "BLANK_INFERENCE"]) {
    const rows = spec.profiles.filter((row: any) => row.type === type);
    assert(rows.length === 4, `${type} must have four profiles`);
    assert(
      new Set(rows.map((row: any) => row.level)).size === 4,
      `${type} levels must be CONTROL/MINIMAL/INTERMEDIATE/STRUCTURED`,
    );
  }
  assert(
    spec.profiles.every((row: any) => row.productionParity === false),
    "No profile may claim production parity",
  );
  assert(
    spec.budgetCompatibility.singleShotScreenCandidates.GRAMMAR_ERROR ===
      4 * 2 * 2 * 6,
    "grammar single-shot screen arithmetic mismatch",
  );
  assert(
    spec.budgetCompatibility.singleShotScreenCandidates.BLANK_INFERENCE ===
      4 * 2 * 6 + 3 * 2 * 6,
    "blank single-shot screen arithmetic mismatch",
  );
  assert(
    spec.budgetCompatibility.singleShotScreenCandidates.total === 180,
    "single-shot total must be 180",
  );
  assert(
    spec.budgetCompatibility.holdoutTargetAssignments.GRAMMAR_ERROR === 240 &&
      spec.budgetCompatibility.holdoutTargetAssignments.BLANK_INFERENCE === 240 &&
      spec.budgetCompatibility.holdoutTargetAssignments.total === 480 &&
      spec.budgetCompatibility.holdoutTargetAssignments.candidateSlotsGuaranteed === false,
    "holdout assignments must not be represented as guaranteed candidate slots",
  );
  const b1 = spec.profiles.find((row: any) => row.id === "B1_TYPE_SCOPED_TAIL");
  assert(
    b1.screenCallPolicy.includes("PREMIUM_EXCLUDED_AS_DUPLICATE_B0"),
    "B1 PREMIUM duplicate call was not excluded",
  );
  assert(spec.randomization.noReplacement.includes("no skip"), "no-replacement rule missing");
  assert(spec.selectionAndStopping.noEarlyEfficacyStop === true, "efficacy peeking allowed");
  assert(
    spec.selectionAndStopping.maxScreenArmsPerType === 4 &&
      spec.selectionAndStopping.maxChallengerArmsAdvancedPerType === 1,
    "arm count/advancement cap drifted",
  );
  assert(spec.holdout.disjoint === true, "holdout must be disjoint");
  assert(
    spec.selectionAndStopping.holdoutValidityNoninferiority
      .marginAbsolutePercentagePoints === -5,
    "fatal-free noninferiority margin must be -5 percentage points",
  );
  assert(
    spec.selectionAndStopping.holdoutEconomicGate.costPerABRatioMargin === 1.25 &&
      spec.selectionAndStopping.holdoutEconomicGate.rule.includes("strictly <1.25"),
    "economic noninferiority margin/rule drifted",
  );
  assert(
    spec.primaryFamily.familywiseAlpha === 0.05 &&
      spec.primaryFamily.holmTests.length === 6 &&
      spec.primaryFamily.holmRule.includes("all six p-values"),
    "six-test Holm family is not frozen",
  );
  assert(
    JSON.stringify(spec.primaryFamily.testIds) ===
      JSON.stringify([
        "G_FATAL_NI",
        "B_FATAL_NI",
        "G_AB_SUP",
        "B_AB_SUP",
        "G_COST_NI",
        "B_COST_NI",
      ]),
    "profile-spec primary test IDs/order drifted",
  );
  assert(
    spec.primaryFamily.clusterAlgorithm.includes("seed 20260715") &&
      spec.primaryFamily.clusterAlgorithm.includes("100000 replicates"),
    "cluster bootstrap seed/count are not frozen",
  );
  assert(
    spec.selectionAndStopping.screenSelection.efficacyDataUse.includes(
      "cannot rank arms",
    ) &&
      JSON.stringify(
        spec.selectionAndStopping.screenSelection.fixedPriorityByType.GRAMMAR_ERROR,
      ) ===
        JSON.stringify([
          "G3_SITE_CERTIFICATE",
          "G2_POSITIVE_COMPACT",
          "G1_FINAL_CHECKLIST_ABLATION",
        ]) &&
      JSON.stringify(
        spec.selectionAndStopping.screenSelection.fixedPriorityByType.BLANK_INFERENCE,
      ) ===
        JSON.stringify([
          "B3_OPTION_INTENT_LEDGER",
          "B2_POSITIVE_COMPACT",
          "B1_TYPE_SCOPED_TAIL",
        ]),
    "screen must use fixed priority rather than n=6 efficacy ranking",
  );
  assert(
    spec.selectionAndStopping.screenSelection.eligibility.includes("10/12") &&
      spec.selectionAndStopping.screenSelection.eligibility.includes("2/24") &&
      spec.selectionAndStopping.screenSelection.eligibility.includes(
        "every parse failure counted as a mismatch",
      ),
    "screen discrete denominators are not frozen",
  );

  const s1 = spec.experimentalStrata.find(
    (row: any) => row.id === "S1_MATCHED_SINGLE_SHOT_SCREEN",
  );
  const s2 = spec.experimentalStrata.find(
    (row: any) => row.id === "S2_FROZEN_HOLDOUT_CONFIRMATION",
  );
  assert(s1 && s2, "S1/S2 strata missing");
  assert(
    s1.candidateBudgetByType.GRAMMAR_ERROR === 96 &&
      s1.candidateBudgetByType.BLANK_INFERENCE === 84,
    "S1 per-type budgets drifted",
  );
  assert(
    s1.sealedMaxOutputTokens.GRAMMAR_ERROR === 6000 &&
      s1.sealedMaxOutputTokens.BLANK_INFERENCE === 4000,
    "S1 max output caps drifted",
  );
  assert(
    s1.frozenPerCallUsdCaps.GRAMMAR_ERROR_STANDARD === 0.2 &&
      s1.frozenPerCallUsdCaps.GRAMMAR_ERROR_PREMIUM === 0.43 &&
      s1.frozenPerCallUsdCaps.BLANK_INFERENCE_STANDARD === 0.14 &&
      s1.frozenPerCallUsdCaps.BLANK_INFERENCE_PREMIUM === 0.2,
    "S1 numeric USD caps drifted",
  );
  const premiumTopology = JSON.stringify(s2.grammarPremiumTopology).toLowerCase();
  for (const required of [
    "answer-only",
    "add-decoys",
    "hard regeneration",
    "targeted repair",
    "grammar solver",
    "legacy fallback",
    "salvage",
    "defined only for g3",
  ]) {
    assert(
      premiumTopology.includes(required),
      `S2 PREMIUM grammar topology missing: ${required}`,
    );
  }
  assert(
    premiumTopology.includes("g0 premium general-path single-shot is not the s2 control"),
    "S2 incorrectly permits a one-shot Pro grammar control",
  );
  assert(
    s2.otherTopologyMappings.blankStandardAndPremium.includes(
      "B1 is a STANDARD-only diagnostic",
    ) &&
      s2.otherTopologyMappings.blankStandardAndPremium.includes(
        "cannot open the frozen holdout",
      ),
    "B1 no-op sham was not excluded from two-plan S2",
  );
  assert(
      s2.candidateAndUsdAdmission.currentStatus ===
      "BLOCKED_PENDING_FRESH_CALLGRAPH" &&
      s2.candidateAndUsdAdmission.sourceTopologyEnvelopeStatus ===
        "SOURCE_UNPINNED_BLOCK" &&
      s2.candidateAndUsdAdmission.provisionalUniversalPhysicalFetchCeiling === 675 &&
      s2.candidateAndUsdAdmission.provisionalUniversalCandidateSlotCeiling === 675 &&
      s2.candidateAndUsdAdmission.provisionalUniversalAssignmentUsdCaps.STANDARD ===
        248 &&
      s2.candidateAndUsdAdmission.provisionalUniversalAssignmentUsdCaps.PREMIUM ===
        574 &&
      s2.candidateAndUsdAdmission.provisionalPremiumGrammarPhysicalFetchCeiling ===
        378 &&
      s2.candidateAndUsdAdmission.provisionalPremiumGrammarCandidateSlotCeiling ===
        378 &&
      s2.candidateAndUsdAdmission.provisionalPremiumGrammarAssignmentUsdCap === 322,
    "S2 pessimistic no-execution ceilings drifted",
  );
  assert(
    s2.candidateAndUsdAdmission.fullQueueRule.includes("All 240 assignments/type") &&
      s2.candidateAndUsdAdmission.fullQueueRule.includes(
        "Partial sequential admission is not a confirmatory substitute",
      ),
    "S2 whole-queue admission is not frozen",
  );
  assert(
    spec.nonFocusCoverage.types === 23 &&
      spec.nonFocusCoverage.symbolicSingleShotRowsPerType === 12 &&
      spec.nonFocusCoverage.interpretation.includes(
        "Coverage smoke and defect discovery only",
      ),
    "nonfocus rows are being overinterpreted",
  );
  assert(
    spec.executionHolds.providerJsonSchemaCompatibility === "UNTESTED_NO_GO" &&
      spec.executionHolds.profileAdapterCompatibility === "UNTESTED_NO_GO" &&
      spec.executionHolds.exactWireFixtures === "MISSING_NO_GO" &&
      spec.executionHolds.rule.includes("exact provider transform") &&
      spec.executionHolds.rule.includes("no silent schema simplification"),
    "provider/adapter exact-wire NO_GO was weakened",
  );

  const proposedText = JSON.stringify(spec.profiles).toLowerCase();
  for (const banned of ["w3-flash-ladder", "w5-flash-guard", "flash premium ladder"]) {
    assert(!proposedText.includes(banned), `rejected strategy reintroduced: ${banned}`);
  }

  assert(rubric.schemaVersion === 1, "rubric schemaVersion mismatch");
  assert(
    JSON.stringify(rubric.frozenFor) ===
      JSON.stringify(["GRAMMAR_ERROR", "BLANK_INFERENCE"]),
    "rubric focus types drifted",
  );
  for (const status of [
    "PARSE_FAILURE",
    "TIMEOUT",
    "NO_SAFE_SITE",
    "PROVIDER_FAILURE",
    "POSTPROCESS_REJECTION",
    "VALIDATOR_REJECTION",
    "BUDGET_NOT_ADMITTED",
    "RATER_UNRESOLVED",
    "ORCHESTRATION_ERROR",
  ]) {
    assert(
      rubric.itemStatus.forcedFailureStatuses.includes(status),
      `rubric forced-failure status missing: ${status}`,
    );
  }
  assert(
    rubric.itemStatus.forcedFailureRule.includes("fatalFree=0") &&
      rubric.itemStatus.forcedFailureRule.includes("grade=F") &&
      rubric.itemStatus.forcedFailureRule.includes("aOrB=0") &&
      rubric.itemStatus.protocolRule.includes("invalidates confirmatory success"),
    "rubric missing/timeout/protocol handling drifted",
  );
  assert(
    rubric.validity.commonRequired.length === 6 &&
      rubric.validity.grammarRequired.length === 6 &&
      rubric.validity.blankRequired.length === 6 &&
      rubric.validity.fatalFamilies.length === 11,
    "rubric validity fields/families drifted",
  );
  assert(
    rubric.readiness.required.length === 6 &&
      rubric.grammarCraft.requiredFields.length === 6 &&
      rubric.blankCraft.requiredFields.length === 7 &&
      rubric.grammarCraft.perDecoyCardinality === 4 &&
      rubric.blankCraft.perOptionCardinality === 5 &&
      rubric.blankCraft.perDistractorCardinality === 4 &&
      rubric.elegance.required.length === 4 &&
      rubric.beautifulKiller.required.length === 4,
    "rubric readiness/craft/beauty field set drifted",
  );
  assert(
    rubric.gradeDerivation.F.includes("fatalFree=0") &&
      rubric.gradeDerivation.A.includes("every elegance field PASS") &&
      rubric.gradeDerivation.aOrB.includes("A or B") &&
      !rubric.blindRaterRecord.requiredFields.includes("grade") &&
      rubric.blindRaterRecord.adjudication.includes(
        "Grade and A/B are derived only after field adjudication",
      ),
    "rubric grade derivation drifted",
  );
  assert(
    rubric.lockedPrimaryFamily.familywiseAlpha === 0.05 &&
      rubric.lockedPrimaryFamily.tests.length === 6 &&
      rubric.lockedPrimaryFamily.tests.every(
        (row: any) => row.direction === "one-sided",
      ) &&
      rubric.lockedPrimaryFamily.intervalAlgorithm.includes("seed 20260715") &&
      rubric.lockedPrimaryFamily.intervalAlgorithm.includes("100000 replicates") &&
      rubric.lockedPrimaryFamily.successRule.includes("Holm adjustment"),
    "rubric primary family/statistical algorithm drifted",
  );
  assert(
    JSON.stringify(rubric.lockedPrimaryFamily.tests.map((row: any) => row.id)) ===
      JSON.stringify(spec.primaryFamily.testIds) &&
      JSON.stringify(rubric.lockedPrimaryFamily.typePromotionGateIds) ===
        JSON.stringify(spec.primaryFamily.typePromotionGateIds) &&
      rubric.lockedPrimaryFamily.pValueAlgorithm ===
        spec.primaryFamily.pValueAlgorithm,
    "rubric/profile-spec six-test IDs, promotion gates, or p-value algorithm differ byte-for-byte",
  );
  assert(
    designText.includes(spec.primaryFamily.testIds.join(", ")) &&
      designText.includes("G_FATAL_NI/G_AB_SUP/G_COST_NI") &&
      designText.includes("all three `B_*` gates") &&
      designText.includes("SOURCE_UNPINNED_BLOCK"),
    "DESIGN.md does not state the exact primary IDs/type gates/source block",
  );
  assert(
    rubric.primaryDerivations.costRatio.includes("either arm has zero A/B") &&
      rubric.primaryDerivations.costRatio.includes("economic gate fails"),
    "rubric zero-A/B economic failure rule missing",
  );

  assert(
    Object.keys(EXACT_PROMPT_PROFILES).length === 4,
    "expected four exact replacement prompt blocks",
  );
  assert(
    new Set(CORE_10_POINT_CODES).size === 10 &&
      !CORE_10_POINT_CODES.includes("j" as never) &&
      !CORE_10_POINT_CODES.includes("l" as never) &&
      !CORE_10_POINT_CODES.includes("m" as never),
    "CORE-10 point-code set is not a-i,k",
  );

  const grammarSchemaJson = z.toJSONSchema(buildGrammarSiteCertificateResponseSchema(6, 1)) as any;
  const grammarQuestionProps = grammarSchemaJson.properties.questions.items.properties;
  assert(grammarQuestionProps.siteCertificate, "siteCertificate missing");
  assert(!grammarQuestionProps.errorDesign, "errorDesign must be replaced in structured schema");
  assert(
    Object.keys(grammarQuestionProps).indexOf("siteCertificate") <
      Object.keys(grammarQuestionProps).indexOf("markedExpressions"),
    "siteCertificate must precede markedExpressions",
  );

  const blankSchemaJson = z.toJSONSchema(buildBlankOptionLedgerResponseSchema()) as any;
  const blankQuestionProps = blankSchemaJson.properties.questions.items.properties;
  assert(blankQuestionProps.blankBlueprint, "blankBlueprint missing");
  assert(!blankQuestionProps.blankDesign, "blankDesign must be replaced in structured schema");
  assert(
    Object.keys(blankQuestionProps).indexOf("blankBlueprint") <
      Object.keys(blankQuestionProps).indexOf("options"),
    "blankBlueprint must precede options",
  );
  const ledgerProps =
    blankQuestionProps.blankBlueprint.properties.optionIntentLedger.properties;
  assert(ledgerProps.correctIntent, "blank ledger must structurally require one correct intent");
  assert(
    ledgerProps.distractorIntents.minItems === 4 &&
      ledgerProps.distractorIntents.maxItems === 4,
    "blank ledger must structurally require exactly four distractor intents",
  );

  const adapterCertificateFixture = {
    certificationStatus: "NO_SAFE_SITE",
    sourceSentenceExact: "",
  };
  const adaptedGrammar = adaptGrammarSiteCertificateCandidateForCurrentGates({
    direction: "fixture",
    siteCertificate: adapterCertificateFixture,
    markedExpressions: [],
  } as never) as Record<string, unknown>;
  const adaptedBlank = adaptBlankOptionLedgerCandidateForCurrentGates({
    direction: "fixture",
    blankBlueprint: { fixture: true },
    options: [],
  } as never) as Record<string, unknown>;
  const adaptedPremium = adaptPremiumGrammarAnswerSiteCertificateForCurrentLadder({
    direction: "fixture",
    siteCertificate: adapterCertificateFixture,
    answer: {},
    explanation: "fixture",
  } as never) as Record<string, unknown>;
  assert(
    !Object.hasOwn(adaptedGrammar, "siteCertificate") &&
      adaptedGrammar.errorDesign === JSON.stringify(adapterCertificateFixture) &&
      !Object.hasOwn(adaptedBlank, "blankBlueprint") &&
      adaptedBlank.blankDesign === JSON.stringify({ fixture: true }) &&
      !Object.hasOwn(adaptedPremium, "siteCertificate") &&
      adaptedPremium.answerDesign === JSON.stringify(adapterCertificateFixture),
    "research adapters do not restore the current internal planning-field names",
  );

  const profileIds = spec.profiles.map((row: any) => row.id) as ProfileId[];
  const measurements = profileIds.flatMap((profileId) =>
    (["STANDARD", "PREMIUM"] as const).map((plan) => measureSurface(profileId, plan)),
  );
  const ladderFixture = measurePremiumGrammarLadderFixture();

  assert(
    extractGrammarFinalChecklist().length === 512,
    "grammar final-checklist payload must be exactly 512 characters",
  );
  for (const plan of ["STANDARD", "PREMIUM"] as const) {
    const control = measurements.find(
      (row) => row.profileId === "G0_CURRENT_CONTROL" && row.plan === plan,
    );
    const ablation = measurements.find(
      (row) => row.profileId === "G1_FINAL_CHECKLIST_ABLATION" && row.plan === plan,
    );
    assert(control && ablation, `missing G0/G1 measurement for ${plan}`);
    assert(
      control.totalChars - ablation.totalChars === 514,
      `grammar checklist rendered-surface delta must be 514 for ${plan}`,
    );
  }
  const b0Premium = measurements.find(
    (row) => row.profileId === "B0_CURRENT_CONTROL" && row.plan === "PREMIUM",
  );
  const b1Premium = measurements.find(
    (row) => row.profileId === "B1_TYPE_SCOPED_TAIL" && row.plan === "PREMIUM",
  );
  assert(
    b0Premium && b1Premium &&
      b0Premium.promptChars === b1Premium.promptChars &&
      b0Premium.systemChars === b1Premium.systemChars &&
      b0Premium.schemaChars === b1Premium.schemaChars &&
      b0Premium.totalChars === b1Premium.totalChars,
    "B1 PREMIUM must be an exact static no-op relative to B0",
  );

  for (const row of measurements) {
    const rates = modelRates(row.plan);
    const maxOutputTokens =
      row.type === "GRAMMAR_ERROR"
        ? s1.sealedMaxOutputTokens.GRAMMAR_ERROR
        : s1.sealedMaxOutputTokens.BLANK_INFERENCE;
    const hardCost =
      row.sensitivityInputTokens.high * rates.inputAnyTier +
      maxOutputTokens * rates.outputAnyTier;
    const capKey = `${row.type}_${row.plan}`;
    const cap = s1.frozenPerCallUsdCaps[capKey];
    assert(typeof cap === "number", `missing S1 cap ${capKey}`);
    assert(
      hardCost <= cap,
      `${row.profileId}/${row.plan} hard sensitivity cost ${hardCost} exceeds ${capKey} cap ${cap}`,
    );
  }

  if (process.argv.includes("--emit-measurements")) {
    const snapshot = {
      schemaVersion: 1,
      qualification:
        "Zero-call character/token/cost planning measurements on the frozen representative passage. Expected costs are scenarios, not admission caps.",
      representativePassageSha256: sha256(REPRESENTATIVE_PASSAGE),
      promptChars: Object.fromEntries(
        Object.entries(EXACT_PROMPT_PROFILES).map(([id, text]) => [id, text.length]),
      ),
      promptSha256: Object.fromEntries(
        Object.entries(EXACT_PROMPT_PROFILES).map(([id, value]) => [id, sha256(value)]),
      ),
      schemaChars: {
        G3_SITE_CERTIFICATE_6_1: JSON.stringify(
          z.toJSONSchema(buildGrammarSiteCertificateResponseSchema(6, 1)),
        ).length,
        B3_OPTION_INTENT_LEDGER: JSON.stringify(
          z.toJSONSchema(buildBlankOptionLedgerResponseSchema()),
        ).length,
        PREMIUM_GRAMMAR_ANSWER_SITE_CERTIFICATE: JSON.stringify(
          z.toJSONSchema(buildPremiumGrammarAnswerStageSiteCertificateSchema()),
        ).length,
      },
      schemaSha256: {
        G3_SITE_CERTIFICATE_6_1: sha256(
          JSON.stringify(
            z.toJSONSchema(buildGrammarSiteCertificateResponseSchema(6, 1)),
          ),
        ),
        B3_OPTION_INTENT_LEDGER: sha256(
          JSON.stringify(z.toJSONSchema(buildBlankOptionLedgerResponseSchema())),
        ),
        PREMIUM_GRAMMAR_ANSWER_SITE_CERTIFICATE: sha256(
          JSON.stringify(
            z.toJSONSchema(buildPremiumGrammarAnswerStageSiteCertificateSchema()),
          ),
        ),
      },
      surfaces: measurements,
      premiumGrammarLadderFixture: ladderFixture,
    };
    process.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);
    return;
  }

  const expected = readJson<{
    representativePassageSha256: string;
    promptChars: Record<string, number>;
    promptSha256: Record<string, string>;
    schemaChars: Record<string, number>;
    schemaSha256: Record<string, string>;
    surfaces: SurfaceMeasurement[];
    premiumGrammarLadderFixture: ReturnType<typeof measurePremiumGrammarLadderFixture>;
  }>("expected-measurements.json");
  assert(
    expected.representativePassageSha256 === sha256(REPRESENTATIVE_PASSAGE),
    "representative passage hash mismatch",
  );
  for (const [id, value] of Object.entries(EXACT_PROMPT_PROFILES)) {
    assert(expected.promptChars[id] === value.length, `prompt char mismatch: ${id}`);
    assert(expected.promptSha256[id] === sha256(value), `prompt hash mismatch: ${id}`);
  }
  assert(
    expected.schemaChars.G3_SITE_CERTIFICATE_6_1 ===
      JSON.stringify(z.toJSONSchema(buildGrammarSiteCertificateResponseSchema(6, 1))).length,
    "G3 schema char mismatch",
  );
  assert(
    expected.schemaChars.B3_OPTION_INTENT_LEDGER ===
      JSON.stringify(z.toJSONSchema(buildBlankOptionLedgerResponseSchema())).length,
    "B3 schema char mismatch",
  );
  assert(
    expected.schemaSha256.G3_SITE_CERTIFICATE_6_1 ===
      sha256(
        JSON.stringify(z.toJSONSchema(buildGrammarSiteCertificateResponseSchema(6, 1))),
      ) &&
      expected.schemaSha256.B3_OPTION_INTENT_LEDGER ===
        sha256(JSON.stringify(z.toJSONSchema(buildBlankOptionLedgerResponseSchema()))) &&
      expected.schemaSha256.PREMIUM_GRAMMAR_ANSWER_SITE_CERTIFICATE ===
        sha256(
          JSON.stringify(
            z.toJSONSchema(buildPremiumGrammarAnswerStageSiteCertificateSchema()),
          ),
        ),
    "structured schema hash mismatch",
  );
  assert(
    JSON.stringify(measurements) === JSON.stringify(expected.surfaces),
    "surface measurements drifted",
  );
  assert(
    JSON.stringify(ladderFixture) === JSON.stringify(expected.premiumGrammarLadderFixture),
    "premium ladder fixture drifted",
  );

  verifyManifest();

  const output = {
    verdict: "PASS_DESIGN_INVARIANTS_ONLY_EXECUTION_NO_GO",
    externalModelCalls: 0,
    productionFilesEdited: 0,
    profiles: spec.profiles.length,
    singleShotScreenCandidates:
      spec.budgetCompatibility.singleShotScreenCandidates.total,
    holdoutTargetAssignments:
      spec.budgetCompatibility.holdoutTargetAssignments.total,
    holdoutCandidateSlotsGuaranteed:
      spec.budgetCompatibility.holdoutTargetAssignments.candidateSlotsGuaranteed,
    s2SourceTopologyEnvelopeStatus:
      s2.candidateAndUsdAdmission.sourceTopologyEnvelopeStatus,
    rubric: rubric.rubricId,
    primaryFamilyTests: rubric.lockedPrimaryFamily.tests.length,
    exactPromptChars: Object.fromEntries(
      Object.entries(EXACT_PROMPT_PROFILES).map(([id, text]) => [id, text.length]),
    ),
    exactPromptSha256: expected.promptSha256,
    structuredSchemaChars: expected.schemaChars,
    structuredSchemaSha256: expected.schemaSha256,
    surfaces: measurements,
    premiumGrammarLadderFixture: ladderFixture,
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

main();
