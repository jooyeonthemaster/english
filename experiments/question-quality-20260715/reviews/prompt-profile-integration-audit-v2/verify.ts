import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import {
  BLANK_OPTION_LEDGER_DELTA,
  BLANK_POSITIVE_CORE_PROMPT,
  GRAMMAR_POSITIVE_CORE_PROMPT,
  GRAMMAR_SITE_CERTIFICATE_DELTA,
  QUESTION_GENERATION_RESEARCH_PROMPT_PROFILES,
  adaptQuestionGenerationResearchProfileCandidate,
  applyQuestionGenerationResearchPromptProfile,
  blankBlueprintSchema,
  buildQuestionGenerationResearchProfileResponseSchema,
  runWithQuestionGenerationResearchPromptProfile,
  type QuestionGenerationResearchPromptProfileId,
} from "@/lib/question-generation-research-profiles";
import {
  QUESTION_GENERATION_RESEARCH_SINGLE_DISPATCH_RETRY_POLICY,
  runWithQuestionGenerationResearchRuntime,
  type QuestionGenerationResearchOperation,
  type QuestionGenerationResearchRuntime,
  type QuestionGenerationResearchStage,
} from "@/lib/question-generation-research-runtime";
import {
  buildBlankOptionLedgerResponseSchema as buildDesignBlankSchema,
  buildGrammarSiteCertificateResponseSchema as buildDesignGrammarSchema,
} from "../../design/prompt-profiles-v1/schema-drafts";
import { EXACT_PROMPT_PROFILES as DESIGN_PROMPTS } from "../../design/prompt-profiles-v1/prompt-deltas";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../../../..");

const SOURCE_CLOSURE_PATHS = [
  "experiments/question-quality-20260715/design/prompt-profiles-v1/DESIGN.md",
  "experiments/question-quality-20260715/design/prompt-profiles-v1/MEASUREMENTS.md",
  "experiments/question-quality-20260715/design/prompt-profiles-v1/SOURCE-TRACE.md",
  "experiments/question-quality-20260715/design/prompt-profiles-v1/VERIFICATION.md",
  "experiments/question-quality-20260715/design/prompt-profiles-v1/expected-measurements.json",
  "experiments/question-quality-20260715/design/prompt-profiles-v1/manifest.json",
  "experiments/question-quality-20260715/design/prompt-profiles-v1/profile-spec.json",
  "experiments/question-quality-20260715/design/prompt-profiles-v1/prompt-deltas.ts",
  "experiments/question-quality-20260715/design/prompt-profiles-v1/rubric-v1.json",
  "experiments/question-quality-20260715/design/prompt-profiles-v1/schema-drafts.ts",
  "experiments/question-quality-20260715/design/prompt-profiles-v1/verify.ts",
  "src/lib/question-generation-research-profiles.ts",
  "src/lib/question-generation-research-runtime.ts",
  "src/lib/question-generation-research-schema.ts",
  "src/lib/atlas-ai.ts",
  "src/lib/atlas-research-fetch-boundary.ts",
  "src/lib/concurrency-config.ts",
  "src/lib/question-ai-schemas-mc.ts",
  "src/lib/question-generation-llm.ts",
  "src/lib/question-generation-prompt-contract.ts",
  "src/app/api/ai/generate-questions-auto/_lib/generate-with-retry.ts",
  "src/app/api/ai/generate-questions-auto/_lib/grammar-premium-ladder.ts",
  "src/app/api/ai/generate-questions-auto/_lib/grammar-solver-gate.ts",
  "src/app/api/ai/generate-questions-auto/_lib/prompts.ts",
  "src/app/api/ai/generate-questions-auto/_lib/question-repair.ts",
  "src/app/api/ai/generate-questions-auto/_lib/run-question-generation.ts",
  "experiments/question-quality-20260715/harness/atlas-controller.ts",
  "experiments/question-quality-20260715/harness/question-generation-callsite-adapter.ts",
  "experiments/question-quality-20260715/harness/question-generation-callsite-adapter.test.ts",
  "experiments/question-quality-20260715/harness/question-generation-phase-c-runner.ts",
  "experiments/question-quality-20260715/reviews/provider-callsite-phase-c/actual-entrypoint-campaign.test.ts",
  "experiments/question-quality-20260715/reviews/provider-callsite-phase-c/structured-cardinality-wire.test.ts",
  "tests/unit/atlas-research-fetch-boundary.test.ts",
  "tests/unit/question-generation-research-profile-response.test.ts",
  "tests/unit/question-generation-research-profile-wire.test.ts",
  "tests/unit/question-generation-research-profiles.test.ts",
  "tests/unit/question-generation-response-cardinality.test.ts",
  "tests/unit/question-generation-retry-envelope.test.ts",
  "eslint.config.mjs",
  "package-lock.json",
  "package.json",
  "tsconfig.json",
] as const;

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function jsonHash(value: unknown): string {
  return sha256(JSON.stringify(value));
}

function differingJsonPaths(left: unknown, right: unknown, prefix = "$" ): string[] {
  if (Object.is(left, right)) return [];
  if (
    left === null ||
    right === null ||
    typeof left !== "object" ||
    typeof right !== "object" ||
    Array.isArray(left) !== Array.isArray(right)
  ) {
    return [prefix];
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    const paths: string[] = [];
    const length = Math.max(left.length, right.length);
    for (let index = 0; index < length; index += 1) {
      paths.push(...differingJsonPaths(left[index], right[index], `${prefix}[${index}]`));
    }
    return paths;
  }
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const keys = new Set([...Object.keys(leftRecord), ...Object.keys(rightRecord)]);
  return [...keys].flatMap((key) =>
    differingJsonPaths(leftRecord[key], rightRecord[key], `${prefix}.${key}`),
  );
}

class ProbeRuntime implements QuestionGenerationResearchRuntime {
  readonly runtimeId: string;
  readonly retryPolicy = QUESTION_GENERATION_RESEARCH_SINGLE_DISPATCH_RETRY_POLICY;

  constructor(readonly expectedQuestionsPerStructuredCall: number) {
    this.runtimeId = `prompt-profile-audit-${expectedQuestionsPerStructuredCall}`;
  }

  async runAssignment<T>(fn: () => T | Promise<T>): Promise<T> {
    return fn();
  }

  async runOperation<T>(
    _operation: Readonly<QuestionGenerationResearchOperation>,
    fn: () => T | Promise<T>,
  ): Promise<T> {
    return fn();
  }

  async runStage<T>(
    _stage: Readonly<QuestionGenerationResearchStage>,
    fn: () => T | Promise<T>,
  ): Promise<T> {
    return fn();
  }

  async observeCandidateValues(): Promise<void> {}

  async decideCandidateValue(): Promise<void> {}
}

function withProfile<T>(
  profileId: QuestionGenerationResearchPromptProfileId,
  count: number,
  fn: () => T | Promise<T>,
): Promise<T> {
  return runWithQuestionGenerationResearchPromptProfile(profileId, () =>
    runWithQuestionGenerationResearchRuntime(new ProbeRuntime(count), fn),
  );
}

const PROD_PROMPTS = {
  G2_POSITIVE_COMPACT: GRAMMAR_POSITIVE_CORE_PROMPT,
  G3_SITE_CERTIFICATE: `${GRAMMAR_POSITIVE_CORE_PROMPT}\n\n${GRAMMAR_SITE_CERTIFICATE_DELTA}`,
  B2_POSITIVE_COMPACT: BLANK_POSITIVE_CORE_PROMPT,
  B3_OPTION_INTENT_LEDGER: `${BLANK_POSITIVE_CORE_PROMPT}\n\n${BLANK_OPTION_LEDGER_DELTA}`,
} as const;

function removeQuestionBounds(schema: unknown): unknown {
  const clone = structuredClone(schema) as unknown as {
    properties: { questions: Record<string, unknown> };
  };
  delete clone.properties.questions.minItems;
  delete clone.properties.questions.maxItems;
  return clone;
}

async function collectDynamicEvidence() {
  const base = z.object({ questions: z.array(z.object({ value: z.string() })) });
  const productionGrammarSchema = await withProfile(
    QUESTION_GENERATION_RESEARCH_PROMPT_PROFILES.G3_SITE_CERTIFICATE,
    1,
    () =>
      buildQuestionGenerationResearchProfileResponseSchema(base, {
        subType: "GRAMMAR_ERROR",
        plan: "STANDARD",
        grammarMarkerCount: 6,
        grammarAnswerCount: 1,
      }),
  );
  const productionBlankSchema = await withProfile(
    QUESTION_GENERATION_RESEARCH_PROMPT_PROFILES.B3_OPTION_INTENT_LEDGER,
    1,
    () =>
      buildQuestionGenerationResearchProfileResponseSchema(base, {
        subType: "BLANK_INFERENCE",
        plan: "STANDARD",
        blankInferenceBlankCount: 1,
      }),
  );
  const prodGrammarJson = z.toJSONSchema(productionGrammarSchema);
  const prodBlankJson = z.toJSONSchema(productionBlankSchema);
  const designGrammarSchema = buildDesignGrammarSchema(6, 1);
  const designBlankSchema = buildDesignBlankSchema();
  const frozenGrammarExactOneJson = z.toJSONSchema(
    z.object({ questions: designGrammarSchema.shape.questions.length(1) }),
  );
  const frozenBlankExactOneJson = z.toJSONSchema(
    z.object({ questions: designBlankSchema.shape.questions.length(1) }),
  );
  const grammarPassage = "The signal that reaches the receiver remains stable.";
  const grammarCertificate = {
    certificationStatus: "CERTIFIED",
    sourceSentenceExact: grammarPassage,
    sourceExpressionExact: "reaches",
    surroundingTextExact: grammarPassage,
    pointCode: "d",
    frame: "subject-verb agreement",
    governingRule: "The singular subject signal licenses reaches.",
    mutation: {
      sourceForm: "reaches",
      displayedError: "reach",
      correction: "reaches",
      mutationClass: "SUBJECT_VERB_AGREEMENT",
    },
    strongestAlternativeParse: "Treat signal as plural.",
    whyAlternativeFails: "Signal is morphologically singular.",
    mutationOnlyCertifiedSite: true,
  };
  const grammarCandidateWithUnboundNonAnswer = {
    siteCertificate: grammarCertificate,
    markedExpressions: [
      {
        label: "(A)",
        expression: "reaches",
        errorExpression: "reach",
        correction: "reaches",
        surroundingText: grammarPassage,
        pointCode: "d",
        isError: true,
      },
      {
        label: "(B)",
        expression: "fabricated",
        errorExpression: "fabricated",
        surroundingText: "not present in the admitted passage",
        pointCode: "a",
        isError: false,
      },
    ],
  };
  const unboundNonAnswerResult = await withProfile(
    QUESTION_GENERATION_RESEARCH_PROMPT_PROFILES.G3_SITE_CERTIFICATE,
    1,
    () =>
      adaptQuestionGenerationResearchProfileCandidate(
        grammarCandidateWithUnboundNonAnswer,
        grammarPassage,
      ),
  );

  const blankPassage = "Readers connect evidence carefully.";
  const blankOptions = [
    "connect evidence",
    "ignore evidence",
    "reverse evidence",
    "narrow evidence",
    "invent evidence",
  ].map((text, index) => ({ label: String(index + 1), text }));
  const duplicatedDistractor = (label: string) => ({
    label,
    status: "DISTRACTOR" as const,
    proposedText: blankOptions[Number(label) - 1].text,
    intent: "STANCE_SHIFT" as const,
    borrowedPassageConcept: "evidence",
    errorDistance: {
      semanticOverlap: "HIGH" as const,
      distortionCount: "ONE" as const,
      eliminationDepth: "TWO_LINKED_CLUES" as const,
    },
    decisiveExclusion: { evidenceIds: ["E1"], reason: "wrong relation" },
    mutuallyExclusiveWithAnswer: "It changes the answer relation.",
    sameSlotProof: "base-form verb phrase",
  });
  const duplicateIntentBlueprint = {
    target: {
      originalExpressionExact: "connect evidence",
      surroundingTextExact: blankPassage,
      discourseRole: "TOPIC_CLAIM" as const,
      answerMeaningAxis: "Readers should connect evidence.",
      evidenceAnchors: [
        { id: "E1" as const, exactQuote: blankPassage, contribution: "states the relation" },
      ],
      slotContract: {
        prefixExact: "Readers ",
        suffixExact: " carefully.",
        syntacticCategory: "VERB_PHRASE" as const,
        polarity: "POSITIVE" as const,
        scope: "LOCAL_CLAIM" as const,
        register: "PLAIN" as const,
      },
    },
    optionIntentLedger: {
      correctIntent: {
        label: "1" as const,
        status: "CORRECT" as const,
        proposedText: blankOptions[0].text,
        meaningRelation: "EQUIVALENT_SYNTHESIS" as const,
        evidenceIds: ["E1" as const],
        sameSlotProof: "base-form verb phrase",
      },
      distractorIntents: ["2", "3", "4", "5"].map(duplicatedDistractor),
    },
    seamAudit: {
      allFiveGrammatical: true as const,
      noOptionRepeatsBoundaryMaterial: true as const,
      noPolarityOrLengthGiveaway: true as const,
    },
  };
  const duplicateBlueprintSchemaAccepted =
    blankBlueprintSchema.safeParse(duplicateIntentBlueprint).success;
  const duplicateIntentAdapterResult = await withProfile(
    QUESTION_GENERATION_RESEARCH_PROMPT_PROFILES.B3_OPTION_INTENT_LEDGER,
    1,
    () =>
      adaptQuestionGenerationResearchProfileCandidate(
        {
          blankBlueprint: duplicateIntentBlueprint,
          originalExpression: "connect evidence",
          surroundingText: blankPassage,
          options: blankOptions,
          correctAnswer: "1",
        },
        blankPassage,
      ),
  );

  const ordinarySurface = Object.freeze({
    typePrompt: "current",
    typeQualityRubric: "rubric",
    targetCandidateBlock: "candidates",
  });
  const ordinarySchema = z.object({ questions: z.array(z.string()) });

  return {
    profileIds: Object.values(QUESTION_GENERATION_RESEARCH_PROMPT_PROFILES),
    prompts: Object.fromEntries(
      Object.entries(PROD_PROMPTS).map(([id, value]) => [
        id,
        {
          chars: value.length,
          sha256: sha256(value),
          frozenEqual: value === DESIGN_PROMPTS[id as keyof typeof DESIGN_PROMPTS],
        },
      ]),
    ),
    schemas: {
      grammar: {
        productionV1ComparableSha256: jsonHash(removeQuestionBounds(prodGrammarJson)),
        frozenV1Sha256: jsonHash(z.toJSONSchema(designGrammarSchema)),
        productionExactOneSha256: jsonHash(prodGrammarJson),
        frozenV1PlusExactOneSha256: jsonHash(frozenGrammarExactOneJson),
        exactEqual:
          JSON.stringify(prodGrammarJson) === JSON.stringify(frozenGrammarExactOneJson),
        differingPaths: differingJsonPaths(prodGrammarJson, frozenGrammarExactOneJson),
      },
      blank: {
        productionV1ComparableSha256: jsonHash(removeQuestionBounds(prodBlankJson)),
        frozenV1Sha256: jsonHash(z.toJSONSchema(designBlankSchema)),
        productionExactOneSha256: jsonHash(prodBlankJson),
        frozenV1PlusExactOneSha256: jsonHash(frozenBlankExactOneJson),
        exactEqual:
          JSON.stringify(prodBlankJson) === JSON.stringify(frozenBlankExactOneJson),
        differingPaths: differingJsonPaths(prodBlankJson, frozenBlankExactOneJson),
      },
    },
    adversarial: {
      engineEntryHasCountOneAndDriftGuard: /profileItem\.count !== 1[\s\S]{0,400}qualityMode !== "strict"[\s\S]{0,300}attemptIndex !== 0/u.test(
        readFileSync(
          path.join(
            ROOT,
            "src/app/api/ai/generate-questions-auto/_lib/run-question-generation.ts",
          ),
          "utf8",
        ),
      ),
      g3AdapterAcceptedUnboundNonAnswerMarker: unboundNonAnswerResult.ok,
      b3BlueprintSchemaAcceptedDuplicateDistractorMechanisms:
        duplicateBlueprintSchemaAccepted,
      b3AdapterAcceptedDuplicateDistractorMechanisms:
        duplicateIntentAdapterResult.ok,
    },
    ordinaryIdentity: {
      promptSurface:
        applyQuestionGenerationResearchPromptProfile(ordinarySurface, {
          subType: "GRAMMAR_ERROR",
          plan: "STANDARD",
        }) === ordinarySurface,
      schema:
        buildQuestionGenerationResearchProfileResponseSchema(ordinarySchema, {
          subType: "GRAMMAR_ERROR",
          plan: "STANDARD",
        }) === ordinarySchema,
    },
  };
}

function verifySourceClosure(): void {
  const closure = JSON.parse(
    readFileSync(path.join(HERE, "source-closure.json"), "utf8"),
  ) as {
    files: Array<{ path: string; bytes: number; sha256: string }>;
  };
  assert.ok(closure.files.length > 0, "source closure is empty");
  for (const entry of closure.files) {
    const absolute = path.join(ROOT, entry.path);
    const bytes = readFileSync(absolute);
    assert.equal(bytes.length, entry.bytes, `source byte drift: ${entry.path}`);
    assert.equal(sha256(bytes), entry.sha256, `source hash drift: ${entry.path}`);
  }
}

function emitSourceClosure(): void {
  const files = SOURCE_CLOSURE_PATHS.map((relative) => {
    const bytes = readFileSync(path.join(ROOT, relative));
    return {
      path: relative,
      role: relative.includes("/design/")
        ? "frozen_design"
        : relative.startsWith("src/")
          ? "production_integration"
          : relative.includes("/harness/")
            ? "research_harness"
            : relative.includes(".test.") || relative.startsWith("tests/")
              ? "verification_test"
              : "toolchain",
      bytes: bytes.length,
      sha256: sha256(bytes),
    };
  });
  process.stdout.write(
    `${JSON.stringify({ schemaVersion: 1, hashAlgorithm: "sha256", files }, null, 2)}\n`,
  );
}

function verifyManifest(): void {
  const rows = readFileSync(path.join(HERE, "MANIFEST.sha256"), "utf8")
    .trim()
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^([0-9a-f]{64})  (.+)$/u);
      assert.ok(match, `invalid manifest row: ${line}`);
      return { sha256: match[1], file: match[2] };
    });
  const actualFiles = readdirSync(HERE)
    .filter((name) => name !== "MANIFEST.sha256" && statSync(path.join(HERE, name)).isFile())
    .sort();
  assert.deepEqual(
    rows.map((row) => row.file).sort(),
    actualFiles,
    "manifest file set drift",
  );
  for (const row of rows) {
    assert.equal(
      sha256(readFileSync(path.join(HERE, row.file))),
      row.sha256,
      `manifest hash drift: ${row.file}`,
    );
  }
}

function verifyPreFixEvidence(): void {
  const seal = readFileSync(path.join(HERE, "PRE_FIX_SEAL.sha256"), "utf8").trim();
  const match = seal.match(/^([0-9a-f]{64})  PRE_FIX_EVIDENCE\.json$/u);
  assert.ok(match, "invalid PRE_FIX evidence seal");
  assert.equal(
    sha256(readFileSync(path.join(HERE, "PRE_FIX_EVIDENCE.json"))),
    match[1],
    "PRE_FIX evidence drift",
  );
  const evidence = JSON.parse(
    readFileSync(path.join(HERE, "PRE_FIX_EVIDENCE.json"), "utf8"),
  ) as { verdict: string; blockingDefects: unknown[] };
  assert.equal(evidence.verdict, "BLOCK");
  assert.equal(evidence.blockingDefects.length, 4);
}

function verifyTestEvidence(): void {
  const evidence = JSON.parse(
    readFileSync(path.join(HERE, "test-results.json"), "utf8"),
  ) as {
    focused: { tests: number; passed: number; failed: number; exitCode: number };
    typecheck: { exitCode: number };
    eslint: { exitCode: number };
    coverageAssertions: Record<string, boolean | number>;
    sideEffects: Record<string, number>;
  };
  assert.equal(evidence.focused.tests, 70);
  assert.equal(evidence.focused.passed, 70);
  assert.equal(evidence.focused.failed, 0);
  assert.equal(evidence.focused.exitCode, 0);
  assert.equal(evidence.typecheck.exitCode, 0);
  assert.equal(evidence.eslint.exitCode, 0);
  assert.deepEqual(evidence.coverageAssertions, {
    applicableProfilePlanWireCells: 15,
    allCellsExactlyOnePhysicalFetch: true,
    modelIdsExact: true,
    reasoningExplicitlyOff: true,
    providerRequireParameters: true,
    exactQuestionCardinality: true,
    outputTokenCapsExact: true,
    noRepairSolverOrLadderChild: true,
    b1PremiumPredispatchExclusion: true,
    engineInputDriftPredispatchRejection: true,
    rawCandidateDecisionIdentity: true,
    acceptedAndRejectedFullResponsePaths: true,
    ordinaryNoProfileIdentity: true,
  });
  assert.deepEqual(evidence.sideEffects, {
    externalApiCalls: 0,
    networkCalls: 0,
    applicationDatabaseReads: 0,
    applicationDatabaseWrites: 0,
    mockProviderResponses: 4,
    campaignCandidatesConsumed: 0,
  });
}

function verifyFindings(): void {
  const findings = JSON.parse(
    readFileSync(path.join(HERE, "findings.json"), "utf8"),
  ) as {
    localIntegrationVerdict: string;
    campaignExecutionVerdict: string;
    resolvedPreFixFindingIds: string[];
    openCampaignHoldIds: string[];
  };
  assert.equal(findings.localIntegrationVerdict, "PASS");
  assert.equal(findings.campaignExecutionVerdict, "NO_GO");
  assert.deepEqual(findings.resolvedPreFixFindingIds, [
    "SCHEMA_G3_FROZEN_V1_BYTE_DRIFT",
    "SCHEMA_B3_FROZEN_V1_BYTE_DRIFT",
    "G3_NONANSWER_MARKER_BINDING_NOT_FAIL_CLOSED",
    "B3_DISTRACTOR_MECHANISM_UNIQUENESS_NOT_FAIL_CLOSED",
  ]);
  assert.ok(findings.openCampaignHoldIds.length > 0);
}

async function main(): Promise<void> {
  if (process.argv.includes("--emit-source-closure")) {
    emitSourceClosure();
    return;
  }
  const dynamic = await collectDynamicEvidence();
  if (process.argv.includes("--probe")) {
    process.stdout.write(`${JSON.stringify(dynamic, null, 2)}\n`);
    return;
  }
  verifySourceClosure();
  const results = JSON.parse(readFileSync(path.join(HERE, "results.json"), "utf8")) as {
    verdict: string;
    campaignExecutionVerdict: string;
    dynamicEvidence: unknown;
    sideEffects: Record<string, number>;
  };
  assert.equal(results.verdict, "PASS_LOCAL_INTEGRATION");
  assert.equal(results.campaignExecutionVerdict, "NO_GO");
  assert.deepEqual(dynamic, results.dynamicEvidence, "dynamic audit evidence drift");
  assert.equal(dynamic.profileIds.length, 8);
  assert.ok(Object.values(dynamic.prompts).every((entry) => entry.frozenEqual));
  assert.equal(dynamic.schemas.grammar.exactEqual, true);
  assert.deepEqual(dynamic.schemas.grammar.differingPaths, []);
  assert.equal(dynamic.schemas.blank.exactEqual, true);
  assert.deepEqual(dynamic.schemas.blank.differingPaths, []);
  assert.equal(dynamic.adversarial.engineEntryHasCountOneAndDriftGuard, true);
  assert.equal(dynamic.adversarial.g3AdapterAcceptedUnboundNonAnswerMarker, false);
  assert.equal(
    dynamic.adversarial.b3AdapterAcceptedDuplicateDistractorMechanisms,
    false,
  );
  assert.deepEqual(dynamic.ordinaryIdentity, { promptSurface: true, schema: true });
  assert.deepEqual(results.sideEffects, {
    externalApiCalls: 0,
    networkCalls: 0,
    applicationDatabaseReads: 0,
    applicationDatabaseWrites: 0,
    secretsInspectedOrLogged: 0,
    candidatesConsumed: 0,
  });
  verifyPreFixEvidence();
  verifyTestEvidence();
  verifyFindings();
  verifyManifest();
  process.stdout.write(
    `${JSON.stringify({ verdict: results.verdict, verified: true, dynamic }, null, 2)}\n`,
  );
}

void main();
