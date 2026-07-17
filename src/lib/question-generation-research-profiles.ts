import { AsyncLocalStorage } from "node:async_hooks";

import { z } from "zod";

import {
  aiBlankInferenceSchema,
  buildAiGrammarErrorSchema,
} from "@/lib/question-ai-schemas-mc";
import {
  buildResearchAwareQuestionResponseSchema,
} from "@/lib/question-generation-research-schema";
import { hasQuestionGenerationResearchRuntime } from "@/lib/question-generation-research-runtime";
import type { StandardQuestionContractScope } from "@/lib/question-generation-prompt-contract";

export const QUESTION_GENERATION_RESEARCH_PROMPT_PROFILES = {
  G0_CURRENT_CONTROL: "G0_CURRENT_CONTROL",
  G1_FINAL_CHECKLIST_ABLATION: "G1_FINAL_CHECKLIST_ABLATION",
  G2_POSITIVE_COMPACT: "G2_POSITIVE_COMPACT",
  G3_SITE_CERTIFICATE: "G3_SITE_CERTIFICATE",
  B0_CURRENT_CONTROL: "B0_CURRENT_CONTROL",
  B1_TYPE_SCOPED_TAIL: "B1_TYPE_SCOPED_TAIL",
  B2_POSITIVE_COMPACT: "B2_POSITIVE_COMPACT",
  B3_OPTION_INTENT_LEDGER: "B3_OPTION_INTENT_LEDGER",
} as const;

export type QuestionGenerationResearchPromptProfileId =
  (typeof QUESTION_GENERATION_RESEARCH_PROMPT_PROFILES)[keyof typeof QUESTION_GENERATION_RESEARCH_PROMPT_PROFILES];

export type QuestionGenerationResearchProfilePlan = "STANDARD" | "PREMIUM";

const PROFILE_IDS = new Set<string>(
  Object.values(QUESTION_GENERATION_RESEARCH_PROMPT_PROFILES),
);
const profileStorage = new AsyncLocalStorage<
  QuestionGenerationResearchPromptProfileId
>();

export function runWithQuestionGenerationResearchPromptProfile<T>(
  profileId: QuestionGenerationResearchPromptProfileId,
  fn: () => T | Promise<T>,
): Promise<T> {
  if (!PROFILE_IDS.has(profileId)) {
    return Promise.reject(
      new Error(`unknown question-generation research prompt profile: ${profileId}`),
    );
  }
  if (profileStorage.getStore()) {
    return Promise.reject(
      new Error("question-generation research prompt profile is already active"),
    );
  }
  return profileStorage.run(profileId, async () => fn());
}

export function getQuestionGenerationResearchPromptProfileId():
  | QuestionGenerationResearchPromptProfileId
  | undefined {
  const profileId = profileStorage.getStore();
  if (profileId && !hasQuestionGenerationResearchRuntime()) {
    throw new Error(
      "research prompt profile requires an active question-generation research runtime",
    );
  }
  return profileId;
}

export function isQuestionGenerationResearchSingleShotProfileActive(): boolean {
  return getQuestionGenerationResearchPromptProfileId() !== undefined;
}

/**
 * Research output ceilings; undefined preserves ordinary production exactly.
 * 26-07-16 상향(캠페인 I2, 연구노트 O150/O152): OpenRouter Gemini 는 reasoning
 * 토큰이 completion 예산을 공유하고 reasoning 비활성화가 provider 정책상 불가라,
 * 기존 4k/6k 봉인값은 B3 blueprint 등 구조화 봉투에서 절단 실패를 만든다.
 */
export function getQuestionGenerationResearchPromptProfileMaxOutputTokens():
  | 8_000
  | 10_000
  | undefined {
  const profileId = getQuestionGenerationResearchPromptProfileId();
  if (!profileId) return undefined;
  return profileType(profileId) === "GRAMMAR_ERROR" ? 10_000 : 8_000;
}

function profileType(
  profileId: QuestionGenerationResearchPromptProfileId,
): "GRAMMAR_ERROR" | "BLANK_INFERENCE" {
  return profileId.startsWith("G") ? "GRAMMAR_ERROR" : "BLANK_INFERENCE";
}

export function assertQuestionGenerationResearchProfileAssignment(
  profileId: QuestionGenerationResearchPromptProfileId,
  subType: string,
  plan: QuestionGenerationResearchProfilePlan,
): void {
  const expectedType = profileType(profileId);
  if (subType !== expectedType) {
    throw new Error(
      `research prompt profile ${profileId} requires ${expectedType}, got ${subType}`,
    );
  }
  if (
    profileId ===
      QUESTION_GENERATION_RESEARCH_PROMPT_PROFILES.B1_TYPE_SCOPED_TAIL &&
    plan === "PREMIUM"
  ) {
    throw new Error(
      "B1_TYPE_SCOPED_TAIL PREMIUM is byte-identical to B0 and is excluded before dispatch",
    );
  }
}

export const GRAMMAR_POSITIVE_CORE_PROMPT = `어법 판단 문항 1개를 만드세요.

## 목표
학생이 문장 구조를 끝까지 추적해야 풀 수 있지만, 정답은 현대 표준 영어와 학교 문법 어느 쪽에서도 이견이 없어야 합니다.

## 설계 순서
1. 원문에서 CORE-10 구조 지점(a~i, k)을 찾고, 원문 형태가 정문인 이유를 먼저 확정합니다.
2. 그중 하나만 정답 지점으로 고릅니다. 원문 어간을 유지한 최소 형태 변형 하나로 비문을 만들고, 가능한 가장 강한 대안 해석으로도 정문이 되지 않는지 확인합니다.
3. 나머지 네 지점은 원문 그대로 둡니다. 각각 실제 구조 판단이 필요한 서로 다른 문법 지점이어야 합니다.
4. 밑줄은 판단 토큰만 1~3단어로 잡고, surroundingText에는 판단에 필요한 전체 의존 구간을 원문 그대로 넣습니다.
5. 정답 해설은 표시된 오형, 구조 근거, 교정형, 가장 강한 반론이 배제되는 이유만 간결하게 설명합니다.

## 난이도
- BASIC: 한 문장 안의 명백한 구조 단서로 판정합니다.
- INTERMEDIATE: 수식어·절 경계를 건너 구조를 추적해야 판정합니다.
- KILLER: 둘 이상의 구조 단서를 결합해야 하며, 정답 지점과 미끼 지점 모두 표면 스캔으로 소거되지 않아야 합니다.

## 현재 스키마 필드 사용
- errorDesign에는 SITE | SOURCE | FRAME | RULE | MUTATION | COUNTERPARSE 순서의 짧은 인증 메모를 씁니다.
- markedExpressions의 유일한 isError=true 항목만 errorDesign의 MUTATION과 일치시킵니다.
- isError=false 항목은 expression과 errorExpression을 원문과 동일하게 둡니다.
- correctAnswer, options, wrongOptionExplanations, explanation, keyPoints를 같은 라벨·표현·pointCode로 동기화합니다.`;

export const GRAMMAR_SITE_CERTIFICATE_DELTA = `## 구조화 site certificate
문항 필드보다 siteCertificate를 먼저 완성합니다.
- certificationStatus가 CERTIFIED일 때만 정답 오류를 심습니다.
- sourceSentenceExact, sourceExpressionExact, surroundingTextExact는 원문 축자 인용입니다.
- pointCode는 CORE-10(a~i, k) 중 하나이며 frame과 governingRule은 실제 표면 구조를 설명합니다.
- mutation.correction은 sourceExpressionExact와 같고, mutation.displayedError만 의도적 오형입니다.
- strongestAlternativeParse를 실제로 시도하고 whyAlternativeFails에 그 해석도 성립하지 않는 통사 근거를 씁니다.
- markedExpressions에서 isError=true인 단 하나의 항목은 인증서의 sourceExpressionExact, displayedError, correction, pointCode, surroundingTextExact와 모두 일치해야 합니다. 특히 markedExpressions의 surroundingText 필드에는 인증서에 쓴 surroundingTextExact를 문자 하나까지 그대로 복사해 넣습니다(다른 창·다른 길이로 다시 쓰면 전체가 무효). expression=sourceExpressionExact, errorExpression=mutation.displayedError, correction=sourceExpressionExact 도 각각 축자 복사입니다.
- surroundingTextExact는 지문에서 정확히 한 번만 등장하는 구간을 골라야 하며, 그 안에 sourceExpressionExact가 정확히 한 번 포함되어야 합니다.
- 인증할 안전한 자리가 없으면 certificationStatus=NO_SAFE_SITE로 기록합니다. 연구 게이트는 이 응답을 실패 후보로 계상하고 출하하지 않습니다.
- NO_SAFE_SITE이면 siteCertificate 안에 certificationStatus와 비어 있지 않은 abstentionReason만 쓰고, 인증 바인딩과 완성 문항 필드는 모두 생략합니다. 자리를 꾸며 내거나 빈 껍데기 문항을 채우지 않습니다.`;

export const BLANK_POSITIVE_CORE_PROMPT = `빈칸 추론 문항 1개를 만드세요.

## 목표
모든 선지가 같은 문법 자리에 자연스럽게 들어가고 같은 소재권에서 경쟁하지만, 지문 논리를 끝까지 대조하면 정답 하나만 남아야 합니다.

## 설계 순서
1. 빈칸 문장의 담화 역할과 정답이 완성할 의미축을 먼저 정합니다.
2. 정답을 증명하는 원문 근거를 고릅니다. BASIC은 직접 재진술, INTERMEDIATE는 두 문장 연결, KILLER는 전체 논지가 수렴하는 둘 이상의 근거를 사용합니다.
3. 네 오답은 정답과 같은 품사·절 형식·극성·길이·문체로 씁니다. 각 오답은 본문 개념을 빌리되 관계, 범위, 주체, 원인, 태도 중 한 축만 어긋나게 합니다.
4. 각 오답마다 왜 매력적인지와 어느 근거가 결정적으로 배제하는지를 하나씩 대응시킵니다. 같은 이유로 탈락하는 오답은 다시 씁니다.
5. 모든 선지를 실제 prefix + option + suffix로 결합해 문법 seam을 확인한 뒤, 정답과 오답 해설을 작성합니다.

## 난이도
- BASIC: 근거가 보이되 무관한 선지로 난도를 낮추지 않습니다.
- INTERMEDIATE: 가까운 두 근거의 관계를 연결해야 합니다.
- KILLER: 정답은 압축된 추상 재진술이고, 오답은 강한 학생이 5~15초 고민할 한 축짜리 근접오류여야 합니다.

## 현재 스키마 필드 사용
- blankDesign에는 AXIS | EVIDENCE | SLOT | O1 | O2 | O3 | O4 순서의 짧은 설계 메모를 씁니다.
- originalExpression과 surroundingText는 원문 축자 인용이며, visible option의 모드는 blankAnswerMode 계약을 따릅니다.
- options, correctAnswer, wrongOptionExplanations, explanation은 동일한 근거·라벨·오류축을 공유합니다.`;

export const BLANK_OPTION_LEDGER_DELTA = `## 구조화 option-intent ledger
문항 필드보다 blankBlueprint를 먼저 완성합니다.
- target.answerMeaningAxis에는 정답이 보존해야 할 명제·관계·범위·극성을 한 문장으로 씁니다.
- target.evidenceAnchors는 원문 축자 인용이며, target.slotContract는 빈칸 좌우 경계와 모든 선지가 맞춰야 할 문법 형식을 고정합니다.
- optionIntentLedger.correctIntent는 정확히 1개, distractorIntents는 정확히 4개를 포함합니다. 다섯 라벨은 중복 없이 1~5를 한 번씩 사용하며, 각 proposedText는 뒤의 같은 라벨 option.text와 문자 그대로 같아야 합니다.
- 각 distractor는 본문에서 빌린 개념, 단 하나의 주된 오류축, 정답과의 오류거리, 결정적 배제 근거, 정답과 동시에 참일 수 없는 이유를 기록합니다.
- KILLER distractor는 semanticOverlap=HIGH이고 distortionCount=ONE이어야 합니다. 표면 극성이나 길이만으로 소거되는 intent는 다시 설계합니다.
- 각 proposedText를 prefix + proposedText + suffix로 결합해 seam이 모두 자연스러운지 직접 확인합니다. 연구 게이트는 실제 결합에서 수일치·관사·중복 접속사/전치사/문장부호 등 일부 고신뢰 경계 신호만 다시 계산합니다. seamAudit=true는 전면 문법성이나 의미 타당성의 서버 인증이 아니며, 나머지는 독립 평가자가 판정합니다.

## blankBlueprint 필드 값 규격 (정확히 이 문자열만 유효 — 대소문자·철자 변형 금지)
- correctIntent.status="CORRECT", correctIntent.meaningRelation="EQUIVALENT_SYNTHESIS"
- distractorIntents[].status="DISTRACTOR", errorDistance.distortionCount="ONE", errorDistance.semanticOverlap∈{HIGH, MEDIUM}, errorDistance.eliminationDepth∈{ONE_LOCAL_CLUE, TWO_LINKED_CLUES, WHOLE_PASSAGE_SYNTHESIS}
- distractorIntents[].intent∈{CAUSE_EFFECT_REVERSAL, AGENT_TARGET_SWAP, SCOPE_NARROWING, SCOPE_BROADENING, HALF_TRUE_FALSE_RELATION, STANCE_SHIFT, TIMING_OR_CONDITION_SHIFT}
- label은 "1"~"5" 문자열, evidenceAnchors[].id·evidenceIds∈{E1, E2, E3}
- target.discourseRole∈{TOPIC_CLAIM, CONCLUSION, CAUSAL_RESULT, CONTRAST_TURN, RESTATEMENT}
- slotContract.syntacticCategory∈{NOUN_PHRASE, VERB_PHRASE, FINITE_CLAUSE, NONFINITE_CLAUSE, ADJECTIVE_PHRASE, ADVERBIAL_PHRASE, PREPOSITIONAL_COMPLEMENT}, polarity∈{POSITIVE, NEGATIVE, PRIVATIVE, MIXED}, scope∈{LOCAL_CLAIM, RELATION, PARAGRAPH_THESIS, WHOLE_PASSAGE_THESIS}, register∈{PLAIN, ACADEMIC, ABSTRACT_ACADEMIC}
- seamAudit 세 필드(allFiveGrammatical, noOptionRepeatsBoundaryMaterial, noPolarityOrLengthGiveaway)는 반드시 true — 실제로 확인한 뒤에만 제출합니다.`;

const EXACT_PROMPT_PROFILES = {
  G2_POSITIVE_COMPACT: GRAMMAR_POSITIVE_CORE_PROMPT,
  G3_SITE_CERTIFICATE: `${GRAMMAR_POSITIVE_CORE_PROMPT}\n\n${GRAMMAR_SITE_CERTIFICATE_DELTA}`,
  B2_POSITIVE_COMPACT: BLANK_POSITIVE_CORE_PROMPT,
  B3_OPTION_INTENT_LEDGER: `${BLANK_POSITIVE_CORE_PROMPT}\n\n${BLANK_OPTION_LEDGER_DELTA}`,
} as const;

export interface QuestionGenerationResearchPromptSurface {
  typePrompt: string;
  typeQualityRubric: string;
  targetCandidateBlock: string;
  finalChecklist?: string;
  customPrompt?: string;
  standardContractScope?: StandardQuestionContractScope;
}

export function applyQuestionGenerationResearchPromptProfile(
  surface: QuestionGenerationResearchPromptSurface,
  context: {
    subType: string;
    plan: QuestionGenerationResearchProfilePlan;
  },
): QuestionGenerationResearchPromptSurface {
  const profileId = getQuestionGenerationResearchPromptProfileId();
  if (!profileId) return surface;
  assertQuestionGenerationResearchProfileAssignment(
    profileId,
    context.subType,
    context.plan,
  );

  if (
    profileId ===
    QUESTION_GENERATION_RESEARCH_PROMPT_PROFILES.G1_FINAL_CHECKLIST_ABLATION
  ) {
    return { ...surface, finalChecklist: "" };
  }
  if (
    profileId ===
    QUESTION_GENERATION_RESEARCH_PROMPT_PROFILES.B1_TYPE_SCOPED_TAIL
  ) {
    return { ...surface, standardContractScope: "force_type_scoped" };
  }
  if (
    profileId === QUESTION_GENERATION_RESEARCH_PROMPT_PROFILES.G2_POSITIVE_COMPACT ||
    profileId === QUESTION_GENERATION_RESEARCH_PROMPT_PROFILES.G3_SITE_CERTIFICATE
  ) {
    return {
      ...surface,
      typePrompt: EXACT_PROMPT_PROFILES[profileId],
      typeQualityRubric: "",
      targetCandidateBlock: "",
      finalChecklist: "",
      customPrompt: "",
    };
  }
  if (
    profileId === QUESTION_GENERATION_RESEARCH_PROMPT_PROFILES.B2_POSITIVE_COMPACT ||
    profileId === QUESTION_GENERATION_RESEARCH_PROMPT_PROFILES.B3_OPTION_INTENT_LEDGER
  ) {
    return {
      ...surface,
      typePrompt: EXACT_PROMPT_PROFILES[profileId],
      typeQualityRubric: "",
      targetCandidateBlock: "",
      customPrompt: "",
      standardContractScope: "force_type_scoped",
    };
  }
  return surface;
}

export const CORE_10_POINT_CODES = [
  "a",
  "b",
  "c",
  "d",
  "e",
  "f",
  "g",
  "h",
  "i",
  "k",
] as const;

const grammarMutationClassSchema = z.enum([
  "FINITE_NONFINITE",
  "RELATIVE_OR_NOMINAL_CLAUSE",
  "PARTICIPLE_VOICE",
  "SUBJECT_VERB_AGREEMENT",
  "FINITE_VOICE",
  "ADJECTIVE_ADVERB_FUNCTION",
  "PRONOUN_AGREEMENT_OR_CASE",
  "OBJECT_COMPLEMENT_FORM",
  "PARALLEL_FORM",
  "INFINITIVE_GERUND_COMPLEMENT",
]);

const grammarMutationSchema = z.object({
  sourceForm: z.string().describe("Must equal sourceExpressionExact."),
  displayedError: z.string().describe("The only intentionally wrong surface form."),
  correction: z.string().describe("Must equal sourceExpressionExact."),
  mutationClass: grammarMutationClassSchema,
});

/** Full certificate required only for a candidate that claims CERTIFIED. */
export const grammarCertifiedSiteCertificateSchema = z.object({
  certificationStatus: z.literal("CERTIFIED"),
  sourceSentenceExact: z.string().describe("Exact source sentence containing the site."),
  sourceExpressionExact: z
    .string()
    .describe("Exact minimal source expression at the certified site."),
  surroundingTextExact: z
    .string()
    .describe("Exact source dependency window sufficient to judge the site."),
  pointCode: z.enum(CORE_10_POINT_CODES),
  frame: z
    .string()
    .describe("Short school-grammar name for the actual structure, not a profile code."),
  governingRule: z
    .string()
    .describe("One sentence identifying governor/dependent and the decisive syntactic rule."),
  mutation: grammarMutationSchema,
  strongestAlternativeParse: z
    .string()
    .describe("The strongest plausible parse that could make the displayed form acceptable."),
  whyAlternativeFails: z
    .string()
    .describe("Concrete syntactic reason that the strongest alternative parse is unavailable here."),
  mutationOnlyCertifiedSite: z.literal(true),
});

const GRAMMAR_CERTIFICATE_BINDING_KEYS = [
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
] as const;

/**
 * Provider-friendly single-object surface. Optional certificate bindings avoid
 * an anyOf/oneOf dependency while the server-side conditional refinement below
 * restores the full CERTIFIED contract and permits a genuinely minimal
 * NO_SAFE_SITE abstention.
 */
export const grammarSiteCertificateSchema = z.object({
  certificationStatus: z
    .enum(["CERTIFIED", "NO_SAFE_SITE"])
    .describe("CERTIFIED only when the proposed mutation is unambiguously ungrammatical."),
  abstentionReason: z
    .string()
    .describe("Required only for NO_SAFE_SITE; explain why no unambiguous mutation exists.")
    .optional(),
  sourceSentenceExact:
    grammarCertifiedSiteCertificateSchema.shape.sourceSentenceExact.optional(),
  sourceExpressionExact:
    grammarCertifiedSiteCertificateSchema.shape.sourceExpressionExact.optional(),
  surroundingTextExact:
    grammarCertifiedSiteCertificateSchema.shape.surroundingTextExact.optional(),
  pointCode: grammarCertifiedSiteCertificateSchema.shape.pointCode.optional(),
  frame: grammarCertifiedSiteCertificateSchema.shape.frame.optional(),
  governingRule:
    grammarCertifiedSiteCertificateSchema.shape.governingRule.optional(),
  mutation: grammarMutationSchema.optional(),
  strongestAlternativeParse:
    grammarCertifiedSiteCertificateSchema.shape.strongestAlternativeParse.optional(),
  whyAlternativeFails:
    grammarCertifiedSiteCertificateSchema.shape.whyAlternativeFails.optional(),
  mutationOnlyCertifiedSite:
    grammarCertifiedSiteCertificateSchema.shape.mutationOnlyCertifiedSite.optional(),
});

function addConditionalParseIssues(
  context: z.RefinementCtx,
  prefix: PropertyKey[],
  parsed: z.ZodSafeParseResult<unknown>,
): void {
  if (parsed.success) return;
  for (const issue of parsed.error.issues) {
    context.addIssue({
      code: "custom",
      path: [...prefix, ...issue.path],
      message: issue.message,
    });
  }
}

function grammarQuestionWithSiteCertificate(
  markerCount: number,
  answerCount: number,
) {
  const base = buildAiGrammarErrorSchema(markerCount, answerCount);
  const { direction, errorDesign: _errorDesign, ...tail } = base.shape;
  void _errorDesign;
  const certifiedQuestionSchema = z.object({
    direction,
    siteCertificate: grammarCertifiedSiteCertificateSchema,
    ...tail,
  });
  const providerQuestionSchema = certifiedQuestionSchema.partial().extend({
    siteCertificate: grammarSiteCertificateSchema,
  });
  const questionFieldKeys = Object.keys(certifiedQuestionSchema.shape).filter(
    (key) => key !== "siteCertificate",
  );

  return providerQuestionSchema.superRefine((candidate, context) => {
    const certificate = candidate.siteCertificate;
    if (certificate.certificationStatus === "NO_SAFE_SITE") {
      if (!certificate.abstentionReason?.trim()) {
        context.addIssue({
          code: "custom",
          path: ["siteCertificate", "abstentionReason"],
          message: "NO_SAFE_SITE requires a non-blank abstentionReason.",
        });
      }
      for (const key of GRAMMAR_CERTIFICATE_BINDING_KEYS) {
        if (certificate[key] !== undefined) {
          context.addIssue({
            code: "custom",
            path: ["siteCertificate", key],
            message: `NO_SAFE_SITE must omit ${key}; do not fabricate certificate bindings.`,
          });
        }
      }
      for (const key of questionFieldKeys) {
        if (candidate[key as keyof typeof candidate] !== undefined) {
          context.addIssue({
            code: "custom",
            path: [key],
            message: `NO_SAFE_SITE must omit ${key}; do not fabricate a completed question.`,
          });
        }
      }
      return;
    }

    if (certificate.abstentionReason !== undefined) {
      context.addIssue({
        code: "custom",
        path: ["siteCertificate", "abstentionReason"],
        message: "CERTIFIED must omit abstentionReason.",
      });
    }
    addConditionalParseIssues(
      context,
      [],
      certifiedQuestionSchema.safeParse(candidate),
    );
  });
}

const blankEvidenceAnchorSchema = z.object({
  id: z.enum(["E1", "E2", "E3"]),
  exactQuote: z.string().describe("Exact passage quote."),
  contribution: z.string().describe("How this evidence constrains the answer meaning axis."),
});

const blankSlotContractSchema = z.object({
  prefixExact: z.string().describe("Exact text immediately before the blank in its sentence."),
  suffixExact: z.string().describe("Exact text immediately after the blank in its sentence."),
  syntacticCategory: z.enum([
    "NOUN_PHRASE",
    "VERB_PHRASE",
    "FINITE_CLAUSE",
    "NONFINITE_CLAUSE",
    "ADJECTIVE_PHRASE",
    "ADVERBIAL_PHRASE",
    "PREPOSITIONAL_COMPLEMENT",
  ]),
  polarity: z.enum(["POSITIVE", "NEGATIVE", "PRIVATIVE", "MIXED"]),
  scope: z.enum([
    "LOCAL_CLAIM",
    "RELATION",
    "PARAGRAPH_THESIS",
    "WHOLE_PASSAGE_THESIS",
  ]),
  register: z.enum(["PLAIN", "ACADEMIC", "ABSTRACT_ACADEMIC"]),
});

const blankCorrectIntentSchema = z.object({
  label: z.enum(["1", "2", "3", "4", "5"]),
  status: z.literal("CORRECT"),
  proposedText: z.string(),
  meaningRelation: z.literal("EQUIVALENT_SYNTHESIS"),
  evidenceIds: z.array(z.enum(["E1", "E2", "E3"])).min(1).max(3),
  sameSlotProof: z.string().describe("Why the proposed text satisfies the shared slot contract."),
});

const blankDistractorIntentSchema = z.object({
  label: z.enum(["1", "2", "3", "4", "5"]),
  status: z.literal("DISTRACTOR"),
  proposedText: z.string(),
  intent: z.enum([
    "CAUSE_EFFECT_REVERSAL",
    "AGENT_TARGET_SWAP",
    "SCOPE_NARROWING",
    "SCOPE_BROADENING",
    "HALF_TRUE_FALSE_RELATION",
    "STANCE_SHIFT",
    "TIMING_OR_CONDITION_SHIFT",
  ]),
  borrowedPassageConcept: z.string(),
  errorDistance: z.object({
    semanticOverlap: z.enum(["HIGH", "MEDIUM"]),
    distortionCount: z.literal("ONE"),
    eliminationDepth: z.enum([
      "ONE_LOCAL_CLUE",
      "TWO_LINKED_CLUES",
      "WHOLE_PASSAGE_SYNTHESIS",
    ]),
  }),
  decisiveExclusion: z.object({
    evidenceIds: z.array(z.enum(["E1", "E2", "E3"])).min(1).max(3),
    reason: z.string(),
  }),
  mutuallyExclusiveWithAnswer: z
    .string()
    .describe("Why this intent and the answer cannot both satisfy the blank's claim."),
  sameSlotProof: z.string().describe("Why the proposed text satisfies the shared slot contract."),
});

export const blankBlueprintSchema = z.object({
  target: z.object({
    originalExpressionExact: z.string(),
    surroundingTextExact: z.string(),
    discourseRole: z.enum([
      "TOPIC_CLAIM",
      "CONCLUSION",
      "CAUSAL_RESULT",
      "CONTRAST_TURN",
      "RESTATEMENT",
    ]),
    answerMeaningAxis: z
      .string()
      .describe("One proposition preserving relation, scope, stance and polarity."),
    evidenceAnchors: z.array(blankEvidenceAnchorSchema).min(1).max(3),
    slotContract: blankSlotContractSchema,
  }),
  optionIntentLedger: z.object({
    correctIntent: blankCorrectIntentSchema,
    distractorIntents: z.array(blankDistractorIntentSchema).length(4),
  }),
  seamAudit: z.object({
    allFiveGrammatical: z.literal(true),
    noOptionRepeatsBoundaryMaterial: z.literal(true),
    noPolarityOrLengthGiveaway: z.literal(true),
  }),
});

const blankOptionLedgerQuestionSchema = (() => {
  const { direction, blankDesign: _blankDesign, ...tail } =
    aiBlankInferenceSchema.shape;
  void _blankDesign;
  return z.object({
    direction,
    blankBlueprint: blankBlueprintSchema,
    ...tail,
  });
})();

export function buildQuestionGenerationResearchProfileResponseSchema(
  baseResponseSchema: z.ZodType,
  context: {
    subType: string;
    plan: QuestionGenerationResearchProfilePlan;
    grammarMarkerCount?: number;
    grammarAnswerCount?: number;
    blankInferenceBlankCount?: number;
  },
): z.ZodType {
  const profileId = getQuestionGenerationResearchPromptProfileId();
  if (!profileId) return baseResponseSchema;
  assertQuestionGenerationResearchProfileAssignment(
    profileId,
    context.subType,
    context.plan,
  );

  if (
    profileId === QUESTION_GENERATION_RESEARCH_PROMPT_PROFILES.G3_SITE_CERTIFICATE
  ) {
    return buildResearchAwareQuestionResponseSchema(
      grammarQuestionWithSiteCertificate(
        context.grammarMarkerCount ?? 5,
        context.grammarAnswerCount ?? 1,
      ),
    );
  }
  if (
    profileId ===
    QUESTION_GENERATION_RESEARCH_PROMPT_PROFILES.B3_OPTION_INTENT_LEDGER
  ) {
    if ((context.blankInferenceBlankCount ?? 1) !== 1) {
      throw new Error(
        "B3_OPTION_INTENT_LEDGER supports exactly one blank in the frozen screen",
      );
    }
    return buildResearchAwareQuestionResponseSchema(
      blankOptionLedgerQuestionSchema,
    );
  }
  return baseResponseSchema;
}

export type QuestionGenerationResearchCandidateAdaptResult =
  | { ok: true; question: Record<string, unknown> }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function exactText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isNonBlank(value: string): boolean {
  return value.trim().length > 0;
}

function countExactOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let offset = 0;
  while (offset <= haystack.length - needle.length) {
    const found = haystack.indexOf(needle, offset);
    if (found < 0) break;
    count += 1;
    offset = found + needle.length;
  }
  return count;
}

function fail(error: string): QuestionGenerationResearchCandidateAdaptResult {
  return { ok: false, error };
}

function adaptGrammarSiteCertificateCandidate(
  candidate: Record<string, unknown>,
  passage: string,
): QuestionGenerationResearchCandidateAdaptResult {
  const certificate = candidate.siteCertificate;
  if (!isRecord(certificate)) return fail("G3 siteCertificate is missing");
  if (certificate.certificationStatus === "NO_SAFE_SITE") {
    return fail("G3 siteCertificate abstained because no safe error site was found");
  }
  if (certificate.certificationStatus !== "CERTIFIED") {
    return fail("G3 siteCertificate has an invalid certification status");
  }
  const sourceSentence = exactText(certificate.sourceSentenceExact);
  const sourceExpression = exactText(certificate.sourceExpressionExact);
  const surroundingText = exactText(certificate.surroundingTextExact);
  if (
    !isNonBlank(sourceSentence) ||
    !isNonBlank(sourceExpression) ||
    !isNonBlank(surroundingText) ||
    !passage.includes(sourceSentence) ||
    !passage.includes(surroundingText) ||
    !sourceSentence.includes(sourceExpression) ||
    !surroundingText.includes(sourceExpression) ||
    (!sourceSentence.includes(surroundingText) &&
      !surroundingText.includes(sourceSentence)) ||
    countExactOccurrences(passage, surroundingText) !== 1 ||
    countExactOccurrences(surroundingText, sourceExpression) !== 1
  ) {
    return fail("G3 certificate source spans are not exact passage bindings");
  }
  const mutation = certificate.mutation;
  if (!isRecord(mutation)) return fail("G3 certificate mutation is missing");
  const displayedError = exactText(mutation.displayedError);
  if (
    exactText(mutation.sourceForm) !== sourceExpression ||
    exactText(mutation.correction) !== sourceExpression ||
    !isNonBlank(displayedError) ||
    displayedError === sourceExpression
  ) {
    return fail("G3 certificate mutation does not preserve the source form");
  }
  const markedExpressions = Array.isArray(candidate.markedExpressions)
    ? candidate.markedExpressions.filter(isRecord)
    : [];
  const errors = markedExpressions.filter((marked) => marked.isError === true);
  if (errors.length !== 1) {
    return fail("G3 certificate requires exactly one marked error");
  }
  const markedError = errors[0];
  if (
    exactText(markedError.expression) !== sourceExpression ||
    exactText(markedError.errorExpression) !== displayedError ||
    exactText(markedError.correction) !== sourceExpression ||
    exactText(markedError.surroundingText) !== surroundingText ||
    text(markedError.pointCode) !== text(certificate.pointCode)
  ) {
    return fail("G3 certificate does not bind to the marked error fields");
  }
  const markerLabels = new Set<string>();
  for (const marked of markedExpressions) {
    const label = text(marked.label);
    if (!label || markerLabels.has(label)) {
      return fail("G3 marked-expression labels are missing or duplicated");
    }
    markerLabels.add(label);
    if (marked.isError === true) continue;
    const expression = exactText(marked.expression);
    const errorExpression = exactText(marked.errorExpression);
    const markerWindow = exactText(marked.surroundingText);
    const correction = exactText(marked.correction);
    if (
      marked.isError !== false ||
      !isNonBlank(expression) ||
      errorExpression !== expression ||
      (isNonBlank(correction) && correction !== expression) ||
      !isNonBlank(markerWindow) ||
      countExactOccurrences(passage, markerWindow) !== 1 ||
      countExactOccurrences(markerWindow, expression) !== 1
    ) {
      return fail("G3 non-answer marker is not an exact unique source binding");
    }
  }
  const { siteCertificate: _siteCertificate, ...rest } = candidate;
  void _siteCertificate;
  return {
    ok: true,
    question: { ...rest, errorDesign: JSON.stringify(certificate) },
  };
}

function adaptBlankOptionLedgerCandidate(
  candidate: Record<string, unknown>,
  passage: string,
): QuestionGenerationResearchCandidateAdaptResult {
  const blueprint = candidate.blankBlueprint;
  if (!isRecord(blueprint) || !isRecord(blueprint.target)) {
    return fail("B3 blankBlueprint target is missing");
  }
  const target = blueprint.target;
  const originalExpression = exactText(candidate.originalExpression);
  const surroundingText = exactText(candidate.surroundingText);
  if (
    exactText(target.originalExpressionExact) !== originalExpression ||
    exactText(target.surroundingTextExact) !== surroundingText ||
    !isNonBlank(originalExpression) ||
    !isNonBlank(surroundingText) ||
    !passage.includes(originalExpression) ||
    !passage.includes(surroundingText) ||
    !surroundingText.includes(originalExpression) ||
    countExactOccurrences(passage, surroundingText) !== 1 ||
    countExactOccurrences(surroundingText, originalExpression) !== 1
  ) {
    return fail("B3 target does not bind exactly to the passage blank span");
  }
  const evidenceAnchors = Array.isArray(target.evidenceAnchors)
    ? target.evidenceAnchors.filter(isRecord)
    : [];
  const evidenceIds = new Set<string>();
  const evidenceQuotes = new Set<string>();
  for (const anchor of evidenceAnchors) {
    const id = text(anchor.id);
    const quote = exactText(anchor.exactQuote);
    if (
      !id ||
      evidenceIds.has(id) ||
      !isNonBlank(quote) ||
      evidenceQuotes.has(quote) ||
      !passage.includes(quote)
    ) {
      return fail("B3 evidence anchors are not unique exact passage bindings");
    }
    evidenceIds.add(id);
    evidenceQuotes.add(quote);
  }
  if (evidenceIds.size === 0) return fail("B3 evidence anchors are empty");
  const slotContract = target.slotContract;
  if (!isRecord(slotContract)) return fail("B3 slot contract is missing");
  const prefix = exactText(slotContract.prefixExact);
  const suffix = exactText(slotContract.suffixExact);
  const reconstructedTarget = `${prefix}${originalExpression}${suffix}`;
  if (
    !surroundingText.includes(reconstructedTarget) ||
    countExactOccurrences(surroundingText, reconstructedTarget) !== 1
  ) {
    return fail("B3 slot boundaries do not bind around the original expression");
  }

  const options = Array.isArray(candidate.options)
    ? candidate.options.filter(isRecord)
    : [];
  if (options.length !== 5) return fail("B3 requires five visible options");
  const optionTextByLabel = new Map<string, string>();
  for (const option of options) {
    const label = text(option.label);
    const optionText = exactText(option.text);
    if (!label || !isNonBlank(optionText) || optionTextByLabel.has(label)) {
      return fail("B3 visible option labels/text are incomplete or duplicated");
    }
    optionTextByLabel.set(label, optionText);
  }
  if (!isRecord(blueprint.optionIntentLedger)) {
    return fail("B3 option-intent ledger is missing");
  }
  const correctIntent = blueprint.optionIntentLedger.correctIntent;
  const distractorIntents = Array.isArray(
    blueprint.optionIntentLedger.distractorIntents,
  )
    ? blueprint.optionIntentLedger.distractorIntents.filter(isRecord)
    : [];
  if (!isRecord(correctIntent) || distractorIntents.length !== 4) {
    return fail("B3 option-intent ledger cardinality is invalid");
  }
  const intents = [correctIntent, ...distractorIntents];
  const intentLabels = new Set<string>();
  for (const intent of intents) {
    const label = text(intent.label);
    if (
      !label ||
      intentLabels.has(label) ||
      optionTextByLabel.get(label) !== exactText(intent.proposedText)
    ) {
      return fail("B3 option intent does not bind to one visible option");
    }
    intentLabels.add(label);
  }
  const distractorMechanisms = new Set(
    distractorIntents.map((intent) => text(intent.intent)),
  );
  if (
    distractorMechanisms.has("") ||
    distractorMechanisms.size !== distractorIntents.length
  ) {
    return fail("B3 distractor intents must use four distinct primary mechanisms");
  }
  const referencedEvidenceIds = [
    ...(Array.isArray(correctIntent.evidenceIds)
      ? correctIntent.evidenceIds
      : []),
    ...distractorIntents.flatMap((intent) => {
      const decisiveExclusion = intent.decisiveExclusion;
      return isRecord(decisiveExclusion) &&
        Array.isArray(decisiveExclusion.evidenceIds)
        ? decisiveExclusion.evidenceIds
        : [];
    }),
  ];
  if (
    referencedEvidenceIds.some(
      (id) => !evidenceIds.has(text(id)),
    )
  ) {
    return fail("B3 option intent references an unbound evidence anchor");
  }
  if (
    [...optionTextByLabel.keys()].some((label) => !intentLabels.has(label)) ||
    text(correctIntent.label) !== text(candidate.correctAnswer)
  ) {
    return fail("B3 intent labels or correct intent do not match the answer key");
  }
  const { blankBlueprint: _blankBlueprint, ...rest } = candidate;
  void _blankBlueprint;
  return {
    ok: true,
    question: { ...rest, blankDesign: JSON.stringify(blueprint) },
  };
}

export function adaptQuestionGenerationResearchProfileCandidate(
  candidate: Record<string, unknown>,
  passage: string,
): QuestionGenerationResearchCandidateAdaptResult {
  const profileId = getQuestionGenerationResearchPromptProfileId();
  if (!profileId) return { ok: true, question: candidate };
  if (
    profileId === QUESTION_GENERATION_RESEARCH_PROMPT_PROFILES.G3_SITE_CERTIFICATE
  ) {
    return adaptGrammarSiteCertificateCandidate(candidate, passage);
  }
  if (
    profileId ===
    QUESTION_GENERATION_RESEARCH_PROMPT_PROFILES.B3_OPTION_INTENT_LEDGER
  ) {
    return adaptBlankOptionLedgerCandidate(candidate, passage);
  }
  return { ok: true, question: candidate };
}
