import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

import {
  BLANK_OPTION_LEDGER_DELTA,
  GRAMMAR_SITE_CERTIFICATE_DELTA,
  QUESTION_GENERATION_RESEARCH_PROMPT_PROFILES,
  adaptQuestionGenerationResearchProfileCandidate,
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
import { analyzeBlankSeam } from "@/lib/question-quality/validators/blank/seam";

const ROOT = process.cwd();
const AUDIT_RELATIVE =
  "experiments/question-quality-20260715/reviews/prompt-profile-negative-evidence-audit-v1";
const AUDIT = path.join(ROOT, AUDIT_RELATIVE);

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function readJson<T = unknown>(relative: string): T {
  return JSON.parse(readFileSync(path.join(AUDIT, relative), "utf8")) as T;
}

interface MutableOption extends Record<string, unknown> {
  label: string;
  text: string;
}

interface MutableIntent extends Record<string, unknown> {
  label: string;
  proposedText: string;
}

interface B3AuditCandidate extends Record<string, unknown> {
  blankBlueprint: {
    target: Record<string, unknown> & { answerMeaningAxis: string };
    optionIntentLedger: {
      correctIntent: MutableIntent;
      distractorIntents: MutableIntent[];
    };
    seamAudit: Record<string, boolean>;
  };
  originalExpression: string;
  options: MutableOption[];
  correctAnswer: string;
}

interface AuditFixtures {
  g3: {
    passage: string;
    minimalAbstention: { questions: Array<Record<string, unknown>> };
    invalidAbstentions: Record<string, unknown>;
    certifiedCandidate: Record<string, unknown> & {
      siteCertificate: Record<string, unknown>;
    };
  };
  b3: {
    passage: string;
    baseCandidate: B3AuditCandidate;
    falseGrammarAttestationPatch: {
      optionLabel: string;
      optionText: string;
      expectedDeterministicCode: string;
    };
    falseSemanticAttestationPatch: {
      optionLabel: string;
      optionText: string;
      answerMeaningAxis: string;
      humanFinding: string;
    };
  };
}

interface G3ProviderJsonSchema {
  properties: {
    questions: {
      items: {
        required: string[];
        properties: {
          siteCertificate: { required: string[] };
        };
      };
    };
  };
}

class OfflineAuditRuntime implements QuestionGenerationResearchRuntime {
  readonly runtimeId = "prompt-profile-negative-evidence-offline-audit";
  readonly retryPolicy =
    QUESTION_GENERATION_RESEARCH_SINGLE_DISPATCH_RETRY_POLICY;
  readonly expectedQuestionsPerStructuredCall = 1;

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
  fn: () => T | Promise<T>,
): Promise<T> {
  return runWithQuestionGenerationResearchPromptProfile(profileId, () =>
    runWithQuestionGenerationResearchRuntime(new OfflineAuditRuntime(), fn),
  );
}

function replaceOptionText(
  candidate: B3AuditCandidate,
  label: string,
  optionText: string,
): void {
  const option = candidate.options.find(
    (entry: Record<string, unknown>) => entry.label === label,
  );
  assert.ok(option, `visible option ${label} missing`);
  option.text = optionText;
  const ledger = candidate.blankBlueprint.optionIntentLedger;
  const intent = [ledger.correctIntent, ...ledger.distractorIntents].find(
    (entry: Record<string, unknown>) => entry.label === label,
  );
  assert.ok(intent, `ledger option ${label} missing`);
  intent.proposedText = optionText;
}

async function main(): Promise<void> {
  const fixtures = readJson<AuditFixtures>("adversarial-fixtures.json");
  const preFix = readJson<{
    finding: { id: string };
    probe: {
      minimalNoSafeSiteParsed: boolean;
      minimalNoSafeSiteWithReasonParsed: boolean;
    };
  }>("PRE_FIX_EVIDENCE.json");
  const expected = readJson("results.json");

  assert.equal(
    preFix.finding.id,
    "G3_NO_SAFE_SITE_STRUCTURALLY_UNREACHABLE",
  );
  assert.equal(preFix.probe.minimalNoSafeSiteParsed, false);
  assert.equal(preFix.probe.minimalNoSafeSiteWithReasonParsed, false);

  const schema = await withProfile(
    QUESTION_GENERATION_RESEARCH_PROMPT_PROFILES.G3_SITE_CERTIFICATE,
    () =>
      buildQuestionGenerationResearchProfileResponseSchema(z.object({}), {
        subType: "GRAMMAR_ERROR",
        plan: "STANDARD",
        grammarMarkerCount: 5,
        grammarAnswerCount: 1,
      }),
  );
  const jsonSchema = z.toJSONSchema(schema) as unknown as G3ProviderJsonSchema;
  const itemSchema = jsonSchema.properties.questions.items;
  const certificateSchema = itemSchema.properties.siteCertificate;

  assert.deepEqual(itemSchema.required, ["siteCertificate"]);
  assert.deepEqual(certificateSchema.required, ["certificationStatus"]);
  assert.equal(JSON.stringify(jsonSchema).includes('"anyOf"'), false);
  assert.equal(JSON.stringify(jsonSchema).includes('"oneOf"'), false);
  assert.equal(
    schema.safeParse(fixtures.g3.minimalAbstention).success,
    true,
  );
  for (const [label, fixture] of Object.entries(
    fixtures.g3.invalidAbstentions,
  )) {
    assert.equal(
      schema.safeParse(fixture).success,
      false,
      `G3 invalid fixture must fail: ${label}`,
    );
  }

  const certifiedCandidate = fixtures.g3.certifiedCandidate;
  assert.equal(
    schema.safeParse({ questions: [certifiedCandidate] }).success,
    true,
  );
  const certifiedOuterKeys = [
    "direction",
    "markedExpressions",
    "correctAnswers",
    "correctAnswer",
    "options",
    "wrongOptionExplanations",
    "explanation",
    "keyPoints",
    "tags",
    "difficulty",
  ];
  for (const key of certifiedOuterKeys) {
    const candidate = structuredClone(certifiedCandidate);
    delete candidate[key];
    assert.equal(
      schema.safeParse({ questions: [candidate] }).success,
      false,
      `CERTIFIED must require outer field ${key}`,
    );
  }
  const certifiedBindingKeys = [
    "sourceSentenceExact",
    "sourceExpressionExact",
    "surroundingTextExact",
    "pointCode",
    "frame",
    "governingRule",
    "mutation",
    "strongestAlternativeParse",
    "whyAlternativeFails",
    "mutationOnlyCertifiedSite",
  ];
  for (const key of certifiedBindingKeys) {
    const candidate = structuredClone(certifiedCandidate);
    delete candidate.siteCertificate[key];
    assert.equal(
      schema.safeParse({ questions: [candidate] }).success,
      false,
      `CERTIFIED must require certificate binding ${key}`,
    );
  }

  const certifiedAdapted = await withProfile(
    QUESTION_GENERATION_RESEARCH_PROMPT_PROFILES.G3_SITE_CERTIFICATE,
    () =>
      adaptQuestionGenerationResearchProfileCandidate(
        certifiedCandidate,
        fixtures.g3.passage,
      ),
  );
  assert.equal(certifiedAdapted.ok, true);
  const abstentionCandidate = fixtures.g3.minimalAbstention.questions[0];
  const abstentionAdapted = await withProfile(
    QUESTION_GENERATION_RESEARCH_PROMPT_PROFILES.G3_SITE_CERTIFICATE,
    () =>
      adaptQuestionGenerationResearchProfileCandidate(
        abstentionCandidate,
        fixtures.g3.passage,
      ),
  );
  assert.equal(abstentionAdapted.ok, false);
  if (abstentionAdapted.ok) {
    assert.fail("minimal abstention must be rejected before finalization");
  }
  assert.match(abstentionAdapted.error, /abstained/);

  const baseB3 = fixtures.b3.baseCandidate;
  assert.equal(blankBlueprintSchema.safeParse(baseB3.blankBlueprint).success, true);

  const grammarFalse = structuredClone(baseB3);
  replaceOptionText(
    grammarFalse,
    fixtures.b3.falseGrammarAttestationPatch.optionLabel,
    fixtures.b3.falseGrammarAttestationPatch.optionText,
  );
  const grammarFalseAdapted = await withProfile(
    QUESTION_GENERATION_RESEARCH_PROMPT_PROFILES.B3_OPTION_INTENT_LEDGER,
    () =>
      adaptQuestionGenerationResearchProfileCandidate(
        grammarFalse,
        fixtures.b3.passage,
      ),
  );
  assert.equal(grammarFalseAdapted.ok, true);
  assert.deepEqual(grammarFalse.blankBlueprint.seamAudit, {
    allFiveGrammatical: true,
    noOptionRepeatsBoundaryMaterial: true,
    noPolarityOrLengthGiveaway: true,
  });
  const blankSurface = fixtures.b3.passage.replace(
    baseB3.originalExpression,
    "_____",
  );
  const grammarFindings = analyzeBlankSeam({
    passageWithBlank: blankSurface,
    correctAnswer: grammarFalse.correctAnswer,
    options: grammarFalse.options,
  });
  assert.ok(
    grammarFindings.some(
      (finding) =>
        finding.severity === "high" &&
        finding.code ===
          fixtures.b3.falseGrammarAttestationPatch.expectedDeterministicCode,
    ),
  );

  const semanticFalse = structuredClone(baseB3);
  replaceOptionText(
    semanticFalse,
    fixtures.b3.falseSemanticAttestationPatch.optionLabel,
    fixtures.b3.falseSemanticAttestationPatch.optionText,
  );
  semanticFalse.blankBlueprint.target.answerMeaningAxis =
    fixtures.b3.falseSemanticAttestationPatch.answerMeaningAxis;
  const semanticFalseAdapted = await withProfile(
    QUESTION_GENERATION_RESEARCH_PROMPT_PROFILES.B3_OPTION_INTENT_LEDGER,
    () =>
      adaptQuestionGenerationResearchProfileCandidate(
        semanticFalse,
        fixtures.b3.passage,
      ),
  );
  assert.equal(semanticFalseAdapted.ok, true);
  assert.deepEqual(
    analyzeBlankSeam({
      passageWithBlank: blankSurface,
      correctAnswer: semanticFalse.correctAnswer,
      options: semanticFalse.options,
    }),
    [],
  );
  assert.match(
    fixtures.b3.falseSemanticAttestationPatch.humanFinding,
    /reverses the passage/,
  );

  assert.match(GRAMMAR_SITE_CERTIFICATE_DELTA, /완성 문항 필드는 모두 생략/);
  assert.match(GRAMMAR_SITE_CERTIFICATE_DELTA, /꾸며 내거나 빈 껍데기/);
  assert.match(BLANK_OPTION_LEDGER_DELTA, /일부 고신뢰 경계 신호만/);
  assert.match(BLANK_OPTION_LEDGER_DELTA, /서버 인증이 아니며/);
  assert.match(BLANK_OPTION_LEDGER_DELTA, /독립 평가자가 판정/);

  const profileSource = readFileSync(
    path.join(ROOT, "src/lib/question-generation-research-profiles.ts"),
    "utf8",
  );
  const runSource = readFileSync(
    path.join(
      ROOT,
      "src/app/api/ai/generate-questions-auto/_lib/run-question-generation.ts",
    ),
    "utf8",
  );
  const blankPostprocessSource = readFileSync(
    path.join(ROOT, "src/lib/question-postprocess/processors/blank-inference.ts"),
    "utf8",
  );
  const blankQualitySource = readFileSync(
    path.join(ROOT, "src/lib/question-quality/validators/blank/inference.ts"),
    "utf8",
  );

  const b3AdapterStart = profileSource.indexOf(
    "function adaptBlankOptionLedgerCandidate",
  );
  const b3AdapterEnd = profileSource.indexOf(
    "export function adaptQuestionGenerationResearchProfileCandidate",
    b3AdapterStart,
  );
  assert.ok(b3AdapterStart >= 0 && b3AdapterEnd > b3AdapterStart);
  assert.doesNotMatch(
    profileSource.slice(b3AdapterStart, b3AdapterEnd),
    /seamAudit/,
  );
  assert.match(
    blankPostprocessSource,
    /const \{ blankDesign: _blankDesign, \.\.\.aiWithoutDesign \} = ai/,
  );
  assert.match(blankQualitySource, /analyzeBlankSeam\(\{/);
  assert.match(blankQualitySource, /finding\.severity !== "high"/);
  assert.match(blankQualitySource, /add\(\s*"error",\s*finding\.code/);

  const observationIndex = runSource.indexOf(
    "await observeQuestionGenerationResearchCandidates(generatedQuestions)",
  );
  const adapterIndex = runSource.indexOf(
    "adaptQuestionGenerationResearchProfileCandidate(q, passageContent)",
    observationIndex,
  );
  const finalizeIndex = runSource.indexOf(
    "finalizeCandidate(candidateForFinalize)",
    adapterIndex,
  );
  assert.ok(observationIndex >= 0);
  assert.ok(adapterIndex > observationIndex);
  assert.ok(finalizeIndex > adapterIndex);
  assert.match(
    runSource.slice(adapterIndex, finalizeIndex),
    /decideQuestionGenerationResearchCandidate\([\s\S]*?"parsed_rejected"/,
  );

  const computed = {
    schemaVersion: 1,
    verdict: "PASS_REMEDIATED_OFFLINE",
    g3: {
      providerJsonSchemaSha256: sha256(JSON.stringify(jsonSchema)),
      outerRequired: itemSchema.required,
      certificateRequired: certificateSchema.required,
      hasAnyOf: JSON.stringify(jsonSchema).includes('"anyOf"'),
      hasOneOf: JSON.stringify(jsonSchema).includes('"oneOf"'),
      minimalAbstentionParses: true,
      invalidAbstentionCount: Object.keys(fixtures.g3.invalidAbstentions).length,
      certifiedOuterFieldsExhaustivelyRequired: certifiedOuterKeys.length,
      certifiedBindingsExhaustivelyRequired: certifiedBindingKeys.length,
    },
    b3: {
      falseGrammarAttestationAdapterAccepted: grammarFalseAdapted.ok,
      deterministicFindingCodes: grammarFindings.map((finding) => finding.code),
      falseSemanticAttestationAdapterAccepted: semanticFalseAdapted.ok,
      semanticFixtureSeamFindings: 0,
      scope:
        "literal claims are not proof; high-confidence boundary rules are recomputed, full grammar and semantic validity remain independently adjudicated",
    },
    promptHashes: {
      g3DeltaSha256: sha256(GRAMMAR_SITE_CERTIFICATE_DELTA),
      b3DeltaSha256: sha256(BLANK_OPTION_LEDGER_DELTA),
    },
    sideEffects: {
      externalApiCalls: 0,
      networkCalls: 0,
      applicationDatabaseReads: 0,
      applicationDatabaseWrites: 0,
      candidatesConsumed: 0,
      secretsRead: 0,
    },
  };
  assert.deepEqual(computed, expected);

  const closure = readJson<{
    files: Array<{ path: string; bytes: number; sha256: string }>;
  }>("source-closure.json");
  for (const entry of closure.files) {
    const bytes = readFileSync(path.join(ROOT, entry.path));
    assert.equal(bytes.length, entry.bytes, `source-closure bytes: ${entry.path}`);
    assert.equal(sha256(bytes), entry.sha256, `source-closure sha256: ${entry.path}`);
  }

  const manifestLines = readFileSync(path.join(AUDIT, "MANIFEST.sha256"), "utf8")
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);
  for (const line of manifestLines) {
    const match = line.match(/^([a-f0-9]{64})  (.+)$/);
    assert.ok(match, `invalid manifest line: ${line}`);
    const [, expectedHash, relative] = match;
    assert.equal(
      sha256(readFileSync(path.join(AUDIT, relative))),
      expectedHash,
      `manifest sha256: ${relative}`,
    );
  }

  console.log(
    `PASS prompt-profile negative-evidence audit: ${
      certifiedOuterKeys.length + certifiedBindingKeys.length + 11
    } dynamic assertions groups, 0 API/network/DB/secret side effects`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
