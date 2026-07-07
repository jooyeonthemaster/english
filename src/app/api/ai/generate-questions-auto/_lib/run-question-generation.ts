import { z } from "zod";
import { AI_QUESTION_SCHEMAS, getAiResponseSchema } from "@/lib/question-ai-schemas-mc";
import { GEMINI_QUESTION_EMPTY_RESULT_MAX_ATTEMPTS } from "@/lib/concurrency-config";
import { KO_PASSAGE_KIND_LABELS, type KoPassageKind } from "@/lib/korean/core/passage-meta";
import { shuffleKoMc5Options } from "@/lib/korean/core/shuffle";
import { buildKoGenerationPrompt } from "@/lib/korean/prompts/generation";
import { runKoSolverGate } from "@/lib/korean/quality/solver-gate";
import { getKoTypeModule, isKoQuestionType } from "@/lib/korean/registry";
import { readKoResolvedSettings } from "@/lib/korean/settings";
import { postProcessQuestion } from "@/lib/question-postprocess";
import { reorderChipsAwayFromAnswer, reshuffleTopicSentenceWritingChips } from "@/lib/topic-sentence-writing";
import { normalizePassageWhitespace } from "@/lib/question-postprocess/text-utils";
import { QUESTION_SCHEMAS, STRUCTURED_TYPE_PROMPTS } from "@/lib/question-schemas";
import { buildQuestionTypeSettingsPrompt, getQuestionTypeGenerationTokenFloor, readQuestionTypeDifficultySetting, readQuestionTypeGenerationPlanSetting, readSummaryWritingBlankCountSetting, readTopicSentenceWritingBlankCountSetting, resolveQuestionTypeGenerationSettings } from "@/lib/question-type-generation-settings";
import { buildQuestionTargetCandidateBlock, getTypeQualityRubric, type QuestionQualityIssue, validateQuestionQuality } from "@/lib/question-quality";
import { selectUsableGrammarCandidates } from "@/lib/question-quality/candidate-blocks/grammar";
import { buildDiversityPromptBlock, shuffleQuestionOptionsForDiversity } from "@/lib/question-diversity";
import { DIFF_DESCRIPTION, TYPE_LABELS } from "./constants";
import { generateWithRetry } from "./generate-with-retry";
import { repairQuestionCandidate } from "./question-repair";
import { fallbackResponseSchema } from "./schemas";
import { buildGenerationPrompt, STRUCTURED_OUTPUT_INSTRUCTIONS, UNSTRUCTURED_OUTPUT_INSTRUCTIONS } from "./prompts";
import { isNonRetryableQuestionGenerationProviderError } from "@/lib/question-generation-llm";
import type { QualityMode, QuestionGenerationRejectionSummary, QuestionGenerationUsageEvent, RejectionRecorder, RunGenerationInput } from "./run-question-generation-types";
import { RELAXED_BLOCKING_QUALITY_CODES, SALVAGE_RELAXABLE_CODES } from "./run-question-generation-constants";
import { admitSalvageCandidatesFromPool, buildCorrectiveRetryFeedback, buildRejectionSample, buildRejectionSummary, buildSalvageNotice, formatIssuesForLog, getLargestGrammarAnswerCount, getLargestGrammarMarkerCount, getLargestIrrelevantSlotCount, hasBlankParaphraseAnswerSetting, hasDoubleNegativeBlankSetting, hasSingleBlankInferenceSetting, isRecord, mergeCustomPromptWithTypeSettings, recordRejectedCandidate, recordRejection, summarizeQualityIssues, trimGrammarDecoySurplus } from "./run-question-generation-helpers";

export type {
  QuestionGenerationRejectionIssue,
  QuestionGenerationRejectionSummary,
  QuestionGenerationUsageEvent,
  RunGenerationInput,
} from "./run-question-generation-types";

const STANDARD_GRAMMAR_KILLER_RESCUE_CODES = new Set([
  "grammar-killer-thin-answer",
  "grammar-killer-generic-answer-point",
  "grammar-killer-answer-point-repeated",
  "grammar-killer-thin-relative-animacy",
  "grammar-killer-thin-concessive-as",
  "grammar-killer-thin-connector",
  "grammar-killer-thin-missing-aux",
  "grammar-shallow-participle-adjective-answer",
  "grammar-obvious-adjacent-sv-agreement",
  "grammar-obvious-local-agreement",
  "grammar-marker-too-dense",
  "grammar-explanation-too-long-hard",
]);

const GRAMMAR_DESIGN_ISSUES_NOT_WORTH_REPAIR = new Set([
  ...STANDARD_GRAMMAR_KILLER_RESCUE_CODES,
  "grammar-shallow-checklist-decoys",
  "grammar-weak-filler-decoys",
  "grammar-too-basic-decoys",
  "grammar-shallow-nearby-passive-decoy",
  "grammar-shallow-than-decoy",
  "grammar-shallow-depends-decoy",
  "grammar-obvious-modal-gerund",
  "grammar-obvious-modal-to-infinitive",
  "grammar-obvious-to-gerund-after-verb",
  "grammar-obvious-before-after-to-infinitive",
  "grammar-obvious-object-pronoun-subject",
  "grammar-obvious-local-pronoun-agreement",
  "grammar-obvious-intransitive-passive",
  "grammar-obvious-passive-to-gap-ing",
  "grammar-obvious-adverb-adjective",
  "grammar-obvious-what-noun-prefix",
  "grammar-semantic-who-what-answer",
  "grammar-semantic-how-why-answer",
]);

// GRAMMAR_ERROR STANDARD/PREMIUM 1차 프롬프트 말단에 붙이는 '출력 직전' 자기검증 체크리스트.
// 오늘 실측 최다 반려 코드(오류 미주입·정답표 desync·KILLER 인접 자명 자리·필러 미끼·
// 명사 뒤 what 비문 등)를 겨냥해, 생성기가 JSON 을 내보내기 직전에 스스로 교정하게 유도한다.
// 종결 명령 앞에 주입되며(프롬프트 빌더가 위치 보장), 값이 없으면 기존 프롬프트와 바이트 동일.
const GRAMMAR_ERROR_FINAL_CHECKLIST = `## 출력 직전 최종 자기검증 (하나라도 위반 시 해당 부분을 고치고 나서 JSON을 출력)
1. 정답 밑줄: 오류형(errorExpression)이 지문에 실제로 심어져 있고, correction 은 원문 그대로인가? (오류를 심지 않으면 무효)
2. 정답 포인트: pointCode 가 a~i,k(핵심 10) 중 하나이고, KILLER 라면 인접 주어-동사처럼 한눈에 보이는 자리가 아닌가?
3. 미끼 밑줄 전부: only/given/does/지시사 that 같은 장식 필러가 아니라 구조적으로 의미 있는 문법 자리인가?
4. KILLER: 어떤 미끼도 정답과 같은 pointCode 를 쓰지 않는가?
5. 모든 expression/correction 이 지문 원문에 한 글자도 다르지 않게 실재하는가? (잘린 표현·창작 표현 무효)
6. 명사 뒤에 what 을 넣는 변형을 정답으로 쓰지 않았는가? (한눈에 비문 = 반려됨)
7. keyPoints 3개가 각각 실제 밑줄 라벨로 시작하고 1번이 정답 라벨인가?`;

function isStandardGrammarKillerRequest(input: RunGenerationInput): boolean {
  if (input.generationPlan === "PREMIUM") return false;
  return input.plan.some(
    (item) =>
      item.subType === "GRAMMAR_ERROR" &&
      item.count > 0 &&
      readQuestionTypeDifficultySetting(
        input.typeSettings?.GRAMMAR_ERROR,
        input.diffLabel,
      ) === "KILLER",
  );
}

// 미끼(디코이)만 교체하면 해소되는 조합 위반 — 정답·설계는 무결하므로 전체
// 재생성(~40k tok) 대신 린 교정 호출(~4k)이 정확한 처방이다 (26-07-06 스윕:
// PREM-K 4/4런에서 answer-point-repeated 단독 반려가 전액 재생성을 유발).
const GRAMMAR_DECOY_ONLY_REPAIRABLE_CODES = new Set([
  "grammar-killer-answer-point-repeated",
  "grammar-decoy-point-monotony",
  "grammar-decoy-point-diversity",
]);

function shouldAttemptCandidateRepair(
  subType: string,
  issues: QuestionQualityIssue[],
): boolean {
  if (subType !== "GRAMMAR_ERROR") return true;
  const codes = issues.map((issue) => issue.code).filter(Boolean);
  if (codes.length === 0) return true;
  // 디코이 전용 위반만 있으면 설계 보존 교정이 가능 — NOT_WORTH_REPAIR 에
  // 앞서 허용한다 (rescue 코드셋 경유로 point-repeated 가 금지목록에 포함됨).
  if (codes.every((code) => GRAMMAR_DECOY_ONLY_REPAIRABLE_CODES.has(code))) {
    return true;
  }
  return !codes.every((code) => GRAMMAR_DESIGN_ISSUES_NOT_WORTH_REPAIR.has(code));
}

function shouldRunStandardGrammarKillerRescue(
  input: RunGenerationInput,
  rejectionRecorder: RejectionRecorder,
): boolean {
  if (input.plan.length !== 1 || input.plan[0]?.subType !== "GRAMMAR_ERROR") {
    return false;
  }
  if (!isStandardGrammarKillerRequest(input)) return false;

  const qualityIssues = rejectionRecorder.issues.filter(
    (issue) => issue.phase === "quality" && issue.subType === "GRAMMAR_ERROR",
  );
  if (qualityIssues.length === 0) return false;
  return qualityIssues.every(
    (issue) =>
      Array.isArray(issue.codes) &&
      issue.codes.length > 0 &&
      issue.codes.every((code) =>
        STANDARD_GRAMMAR_KILLER_RESCUE_CODES.has(code),
      ),
  );
}

function buildStandardGrammarKillerRescueInput(
  input: RunGenerationInput,
): RunGenerationInput {
  const rawGrammarSettings = input.typeSettings?.GRAMMAR_ERROR;
  const grammarSettings = isRecord(rawGrammarSettings) ? rawGrammarSettings : {};
  return {
    ...input,
    typeSettings: {
      ...(input.typeSettings ?? {}),
      GRAMMAR_ERROR: {
        ...grammarSettings,
        difficulty: "INTERMEDIATE",
      },
    },
    customPrompt: [
      input.customPrompt,
      "STANDARD GRAMMAR_ERROR KILLER rescue: previous KILLER attempts found only shallow/local targets in this passage. Generate one strong INTERMEDIATE grammar item instead of failing. Keep every answer locally plausible, source-backed, and structurally meaningful; do not label the item as KILLER.",
    ]
      .filter(Boolean)
      .join("\n\n"),
  };
}
export async function runQuestionGeneration(
  {
    plan,
    schoolType,
    gradeInfo,
    passageContent: rawPassageContent,
    teacherIntentBlock,
    analysisContext,
    diffLabel,
    diffInstruction,
    generationPlan,
    customPrompt,
    typeSettings,
    diversity,
    koPassageKind,
    onModelUsage,
  }: RunGenerationInput,
  {
    qualityMode = "strict",
    rejectionRecorder,
    attemptIndex = 0,
    previousAttemptFeedback,
    deadlineAt,
  }: {
    qualityMode?: QualityMode;
    rejectionRecorder?: RejectionRecorder;
    /** 재시도 회차 (0-based) — 다양성 스티어링 위치가 재시도마다 바뀌게 한다. */
    attemptIndex?: number;
    /** 직전 시도의 거절 사유 — 다음 프롬프트에 교정 지시로 주입(맹목 재시도 방지). */
    previousAttemptFeedback?: string;
    /** 시간예산 데드라인(epoch ms) — provider 호출 abort 를 남은예산으로 좁힌다. */
    deadlineAt?: number;
  } = {},
): Promise<Record<string, unknown>[]> {
  // NBSP·빈줄 잔재가 모델 출력(원문 복사 스팬)과 게이트 문자열 비교, 저장본
  // 렌더링까지 전파되므로 엔진 입구에서 한 번 정규화한다.
  // 추가: 지문에 이미 들어있는 밑줄 런(`____` 빈칸·이중언어 워크시트 잔재)은 마커
  // (`__(A) ...__`) 카운트·렌더를 오염시킨다 — 긴/워크시트 지문 GRAMMAR 마커가
  // "5개 기대, 24개 렌더"로 결정론적 소진하던 실측 원인. 엔진 입구에서 제거해
  // 모델·후처리·게이트가 모두 깨끗한 지문을 보게 한다(전 마커 유형 공통).
  const passageContent = normalizePassageWhitespace(rawPassageContent)
    .replace(/_{2,}/g, " ")
    .replace(/[ \t]{2,}/g, " ");
  const generatedGroups = await Promise.all(
    plan.map(async (item) => {
      const { subType, count: typeCount, targetPoints } = item;
      if (typeCount <= 0) return [];
      const expectedTypeCount = Math.max(1, Math.floor(Number(typeCount) || 1));
      const rawTypeSettings = typeSettings?.[subType];
      const effectiveDiffLabel = readQuestionTypeDifficultySetting(
        rawTypeSettings,
        diffLabel,
      );
      const effectiveDiffInstruction =
        DIFF_DESCRIPTION[effectiveDiffLabel] || diffInstruction;
      const effectiveGenerationPlan = readQuestionTypeGenerationPlanSetting(
        rawTypeSettings,
        generationPlan,
      );

      console.log(
        `[AUTO-GEN] Step 2: Generating ${subType} x${typeCount} via ${effectiveGenerationPlan} plan (${effectiveDiffLabel})...`,
      );

      const typePrompt =
        STRUCTURED_TYPE_PROMPTS[subType] ||
        `${subType} 유형의 문제를 만드세요.`;
      const typeQualityRubric = getTypeQualityRubric(
        subType,
        effectiveDiffLabel,
      );

      const resolvedTypeSettings = resolveQuestionTypeGenerationSettings(
        subType,
        rawTypeSettings,
        // 전역 난이도 전달 — 유형별 오버라이드가 없을 때 SUMMARY_WRITING 프리셋·배점이
        // effectiveDiffLabel(모델 지시·question.difficulty)과 같은 난이도로 정렬되게 한다.
        effectiveDiffLabel,
      );
      const {
        effectiveTypeSettings,
        irrelevantSlotCount,
        grammarMarkerCount,
        grammarAnswerCount,
        grammarPointFocus,
        grammarCorrectionErrorCount,
        summaryCompleteMcBlankCount,
        summaryCompleteBlankCount,
        contentMatchOptionCount,
        contentMatchAnswerCount,
        contentMatchType,
        vocabChoiceMarkerCount,
        vocabChoiceAnswerCount,
        sentenceInsertSlotCount,
        antonymPairCount,
        blankInferenceBlankCount,
        blankInferenceDoubleNegative,
        blankInferenceParaphraseAnswer,
        blankInferenceGranularity,
        blankPointFocus,
        sentenceInsertPointFocus,
        irrelevantPointFocus,
        sentenceOrderPointFocus,
        genericOptionCount,
        genericAnswerCount,
        answerPolarity,
      } = resolvedTypeSettings;

      // ── 미끼 스페어 과잉생성 (26-07-06 1회호출 캠페인 Wave 3-lite) ──────────
      // KILLER 어법(단일 정답)은 생성 G = 검증 K + 1 로 미끼를 1개 더 받아,
      // 조합 위반(정답 pointCode 반복 등) 미끼를 trimGrammarDecoySurplus 가
      // 후처리 직전에 결정론 드랍한다 — "미끼 1개 불량 → 전체 재생성" 루프의
      // 0-콜 대체. 검증·결핍판정·반려샘플은 계속 K 기준이라 게이트 계약 불변.
      const grammarDecoySurplusActive =
        subType === "GRAMMAR_ERROR" &&
        effectiveDiffLabel === "KILLER" &&
        (grammarAnswerCount ?? 1) === 1;
      const generatedGrammarMarkerCount = grammarDecoySurplusActive
        ? Math.min(10, (grammarMarkerCount ?? 5) + 1)
        : grammarMarkerCount;
      const generationTypeSettings = grammarDecoySurplusActive
        ? {
            ...(isRecord(effectiveTypeSettings) ? effectiveTypeSettings : {}),
            markerCount: generatedGrammarMarkerCount,
          }
        : effectiveTypeSettings;

      const typeSettingsPrompt = buildQuestionTypeSettingsPrompt(
        subType,
        generationTypeSettings,
        // 동일 전역 난이도 — EXACT-direction 프롬프트가 resolve 결과(발문·배점)와 일치하도록.
        effectiveDiffLabel,
      );
      const diversitySignals = diversity?.bySubType?.[subType];
      // 재시도마다 다른 위치/후보 순서를 받도록 attempt 오프셋을 가산한다
      // (배치 간 간격은 variantCount 만큼 벌려 동일 배치 내 충돌 방지).
      // variantIndex 미지정(단건)은 그대로 두면 무작위 오프셋이 매 호출 적용된다.
      const effectiveVariantIndex =
        typeof diversity?.variantIndex === "number"
          ? diversity.variantIndex +
            attemptIndex * Math.max(1, Math.floor(diversity.variantCount ?? 1))
          : undefined;
      const diversityPromptBlock = diversity
        ? buildDiversityPromptBlock(subType, diversitySignals, effectiveVariantIndex, {
            sentenceInsertSlotCount,
            vocabChoiceMarkerCount,
            vocabChoiceAnswerCount,
            antonymPairCount,
            grammarMarkerCount: generatedGrammarMarkerCount,
            grammarAnswerCount,
          })
        : "";
      const mergedCustomPrompt = mergeCustomPromptWithTypeSettings(
        customPrompt,
        [typeSettingsPrompt, diversityPromptBlock].filter(Boolean).join("\n\n"),
      );
      const targetCandidateBlock = buildQuestionTargetCandidateBlock(
        subType,
        passageContent,
        {
          irrelevantSlotCount,
          grammarMarkerCount: generatedGrammarMarkerCount,
          grammarScarcityBaseCount: grammarMarkerCount,
          grammarAnswerCount,
          grammarCorrectionErrorCount,
          antonymPairCount,
          blankInferenceBlankCount,
          blankInferenceParaphraseAnswer,
          blankInferenceDoubleNegative,
          requestedDifficulty: effectiveDiffLabel,
          usedTargets: diversitySignals?.usedTargets,
          usedAnswerLabels: diversitySignals?.usedAnswerLabels,
          usedPointCodes: diversitySignals?.usedPointCodes,
          variantIndex: effectiveVariantIndex,
          diversityEnabled: !!diversity,
          // 어법류=grammarPointFocus, 빈칸=blankPointFocus, 문장삽입=
          // sentenceInsertPointFocus, 무관문장=irrelevantPointFocus, 글의순서=
          // sentenceOrderPointFocus — 리졸버가 subType별로만 세팅하므로 상호배타.
          pointFocus:
            grammarPointFocus ??
            blankPointFocus ??
            sentenceInsertPointFocus ??
            irrelevantPointFocus ??
            sentenceOrderPointFocus,
        },
      );
      // ── KO(국어) 유형 컨텍스트 — KO_ 게이트 전 지점이 공유한다 ─────────────
      // koMod: 레지스트리 모듈(셔플 exempt·솔버 게이트 판정), koResolved: examMode
      // 등 정규화 설정, koKind: 호출자가 전달한 지문 갈래. 영어 유형은 전부 null.
      const koMod = isKoQuestionType(subType) ? getKoTypeModule(subType) : null;
      const koResolved = koMod
        ? readKoResolvedSettings(subType, rawTypeSettings)
        : null;
      const koKind: KoPassageKind | null =
        koMod && koPassageKind && koPassageKind in KO_PASSAGE_KIND_LABELS
          ? (koPassageKind as KoPassageKind)
          : null;

      const hasAiSchema = !!AI_QUESTION_SCHEMAS[subType];
      const isStructured = hasAiSchema || !!QUESTION_SCHEMAS[subType];
      // SUMMARY_WRITING(요약문 영작)은 SUMMARY_COMPLETE 의 blankCount 경로를 미러한다.
      // 동적 빌더(buildSummaryWritingSchema)가 (A)~(C) 라벨 enum·blanks.length 를
      // blankCount(1~3)로 고정하도록 getAiResponseSchema 에 전달. PASSTHROUGH 라
      // 후처리 분기는 불필요(스키마 검증만으로 충분).
      const summaryWritingBlankCount =
        subType === "SUMMARY_WRITING"
          ? readSummaryWritingBlankCountSetting(rawTypeSettings)
          : undefined;
      // TOPIC_SENTENCE_WRITING(주제문 영작) cloze 모드도 blankCount(1~2) 동적 스키마를 미러.
      const topicSentenceWritingBlankCount =
        subType === "TOPIC_SENTENCE_WRITING"
          ? readTopicSentenceWritingBlankCountSetting(rawTypeSettings)
          : undefined;
      const responseSchema = hasAiSchema
        ? getAiResponseSchema(subType, {
            irrelevantSlotCount,
            grammarMarkerCount: generatedGrammarMarkerCount,
            grammarAnswerCount,
            grammarCorrectionErrorCount,
            summaryCompleteMcBlankCount,
            summaryCompleteBlankCount,
            summaryWritingBlankCount,
            topicSentenceWritingBlankCount,
            contentMatchOptionCount,
            contentMatchAnswerCount,
            vocabChoiceMarkerCount,
            vocabChoiceAnswerCount,
            sentenceInsertSlotCount,
            antonymPairCount,
            blankInferenceBlankCount,
            genericOptionCount,
            genericAnswerCount,
          })
        : isStructured
          ? z.object({ questions: z.array(QUESTION_SCHEMAS[subType]) })
          : fallbackResponseSchema;

      const structuredInstructions = isStructured
        ? STRUCTURED_OUTPUT_INSTRUCTIONS
        : UNSTRUCTURED_OUTPUT_INSTRUCTIONS;
      const perQuestionTokenFloor = getQuestionTypeGenerationTokenFloor(
        subType,
        resolvedTypeSettings,
      );

      try {
        // KO_ 게이트: 국어 유형은 buildKoGenerationPrompt(동일 {system?, prompt}
        // 반환형 — PREMIUM anthropic 캐시 경로 재사용)로 위임. 영어 빌더는 무접촉.
        const generationPromptInput = {
          schoolType,
          gradeInfo,
          passageContent,
          teacherIntentBlock,
          analysisContext,
          targetPoints,
          typePrompt,
          structuredInstructions,
          targetCandidateBlock,
          typeQualityRubric,
          typeCount,
          diffLabel: effectiveDiffLabel,
          diffInstruction: effectiveDiffInstruction,
          generationPlan: effectiveGenerationPlan,
          subType,
          finalChecklist:
            subType === "GRAMMAR_ERROR" ? GRAMMAR_ERROR_FINAL_CHECKLIST : undefined,
          customPrompt: previousAttemptFeedback
            ? [mergedCustomPrompt, previousAttemptFeedback]
                .filter(Boolean)
                .join("\n\n")
            : mergedCustomPrompt,
        };
        const { system: generationSystem, prompt: generationPrompt } = koMod
          ? buildKoGenerationPrompt({
              ...generationPromptInput,
              examMode: koResolved?.examMode,
              passageKindLabel: koKind
                ? KO_PASSAGE_KIND_LABELS[koKind]
                : undefined,
            })
          : buildGenerationPrompt(generationPromptInput);
        // KO-EN-REG-1: 무게이트 PREMIUM 바닥 절은 영어 PREMIUM 기본 floor(4_096)를
        // 올리는 무회귀 위반이라 제거(원식 환원). 단 KO+PREMIUM 은 16_384 바닥이
        // 필요하다 — 실측(26-07-03 PREMIUM 스윕 6/7 생성실패): sonnet-5 는 flash 보다
        // 장문이라 KO 봉투(자료·근거앵커 5개·오답해설 4개)가 8_192 에서 JSON 이
        // 중간에 잘려 AI_TypeValidationError 로 전멸한다. koMod 게이트라 영어 경로는
        // byte 불변.
        const generationMaxTokens = Math.min(
          20_000,
          Math.max(
            perQuestionTokenFloor,
            (Number(typeCount) || 1) * perQuestionTokenFloor,
            koMod && effectiveGenerationPlan === "PREMIUM" ? 16_384 : 0,
          ),
        );
        const standardGrammarTokenCap =
          subType === "GRAMMAR_ERROR" && effectiveGenerationPlan !== "PREMIUM"
            ? Math.min(
                20_000,
                Math.max(
                  effectiveDiffLabel === "KILLER" ? 12_000 : 8_192,
                  (Number(typeCount) || 1) *
                    (effectiveDiffLabel === "KILLER" ? 12_000 : 8_192),
                ),
              )
            : generationMaxTokens;
        // PREMIUM 어법: 20k 바닥은 폭주 생성이 180s abort 까지 달리게 한다
        // (실측 26-07-04 스윕: PREMIUM 타임아웃 3/8, 베이스라인도 동율 — 기존 지병).
        // 단일 어법 문항(마커≤10·오답해설≤9·errorDesign 포함)은 12k로 충분 —
        // 출력 상한으로 생성 시간 꼬리를 잘라 타임아웃 확률을 낮춘다.
        const premiumGrammarTokenCap =
          subType === "GRAMMAR_ERROR" && effectiveGenerationPlan === "PREMIUM"
            ? Math.min(
                20_000,
                Math.max(12_000, (Number(typeCount) || 1) * 12_000),
              )
            : generationMaxTokens;
        const effectiveGenerationMaxTokens = Math.min(
          generationMaxTokens,
          standardGrammarTokenCap,
          premiumGrammarTokenCap,
        );
        // Wave-3 TIMEOUT-RCA(26-07-05 실측): sonnet-5(OpenRouter) strict 구조화
        // 출력이 SUMMARY_WRITING/TOPIC_SENTENCE_WRITING 봉투(옵션·enum 필드 20여
        // 개)에서 스키마 기인으로 전멸한다 — 응답 없이 180s abort 되거나 masked
        // 400("Provider returned error"). A/B 프로브: 동일 미니 프롬프트가 trivial
        // 스키마 8s vs SW/TSW 봉투 90s abort. STANDARD(Gemini)는 정상이므로
        // PREMIUM 만 프롬프트 인라인 JSON 모드로 직행한다(zod 클라이언트 검증 +
        // 하류 품질게이트 재검증 — grammar-too-large 폴백과 동일 계약).
        const premiumForceJsonFallback =
          effectiveGenerationPlan === "PREMIUM" &&
          (subType === "SUMMARY_WRITING" ||
            subType === "TOPIC_SENTENCE_WRITING");
        const object = await generateWithRetry(
          responseSchema,
          generationPrompt,
          effectiveGenerationPlan,
          effectiveGenerationMaxTokens,
          undefined,
          (result) => {
            onModelUsage?.({
              phase: "question_generation",
              subType,
              qualityMode,
              difficulty: effectiveDiffLabel,
              generationPlan: effectiveGenerationPlan,
              usage: result.usage,
              provider: result.provider,
              modelId: result.modelId,
              attempts: result.attempts,
              durationMs: result.durationMs,
            });
          },
          {
            system: generationSystem,
            deadlineAt,
            forceJsonFallback: premiumForceJsonFallback,
          },
        );

        const generatedQuestionsAll =
          isRecord(object) && Array.isArray(object.questions)
            ? object.questions.filter(isRecord)
            : [];
        if (generatedQuestionsAll.length !== expectedTypeCount) {
          console.warn(
            `[AUTO-GEN] ${subType} returned ${generatedQuestionsAll.length}/${expectedTypeCount} questions; trimming to requested count.`,
          );
        }
        const generatedQuestions = generatedQuestionsAll.slice(0, expectedTypeCount);
        const qs: Record<string, unknown>[] = [];

        // 후보 1개를 정규화→후처리→매핑→셔플→품질검증까지 끝내 "확정"한다. SHIP-FIRST
        // repair(교정 재생성)에서 재검증에 그대로 재사용하기 위해 인라인 함수로 추출한다
        // (루프 스코프 변수 캡처). 동작은 추출 전과 동일.
        const finalizeCandidate = (
          rawQ: Record<string, unknown>,
        ):
          | {
              ok: true;
              finalQuestion: Record<string, unknown>;
              blockingErrors: QuestionQualityIssue[];
              allWarnings: QuestionQualityIssue[];
              hasRelaxedWarnings: boolean;
              normalizedDraft: Record<string, unknown>;
            }
          | { ok: false; error: string; normalizedDraft: Record<string, unknown> } => {
          // 과거에는 "BLANK_INFERENCE 의 typeSettings 프롬프트 존재 = 부정-부정"이었지만,
          // 언어/다중빈칸 블록이 생기면서 그 프록시가 깨졌다. resolved 플래그로만 판정한다.
          // KILLER 빈칸(비DN)은 교사 옵트인(paraphraseAnswer)과 무관하게 PARAPHRASE
          // 모드를 강제한다 — 과거에는 이 자리에서 SOURCE_EXACT 로 강제하고 후처리가
          // 정답 선지를 원문 verbatim 으로 재작성해, DIFFICULTY_RUBRIC 의 "정답은 원문
          // 복사가 아닌 추상 패러프레이즈" 지시와 정면 모순이었다(추론 없이 풀려 KILLER
          // 미성립). paraphraseAnswer 설정은 옵트인 true 만 존재(readBooleanSetting 이
          // true 외 값을 전부 false 로 접음)하므로 "명시적 false 존중" 분기는 불가능하고
          // 필요도 없다. BASIC/INTERMEDIATE 는 기존 동작 유지(옵트인 없으면 SOURCE_EXACT).
          // 26-07-06: 단일빈칸 한정(count===1)을 제거 — 다중빈칸 KILLER 도 강제.
          // 근거: 전수 실측에서 blankCount=2 KILLER 가 45~65 로 전 매트릭스 최저였고
          // 원인이 "정답 조합 verbatim-by-design"(베껴 즉답)이었다. 옵트인 경로
          // (paraphraseAnswer=true)가 이미 다중빈칸 PARAPHRASE 를 지원하므로 배관 동일.
          // 26-07-06(2차): INTERMEDIATE 로도 확장 — 다지문 스윕 실측에서 STANDARD
          // INT 빈칸의 fatal 7/8 이 전부 "정답=원문 verbatim 복사(후처리 강제)라
          // 본문 대조만으로 풀림 + 해설은 패러프레이즈 서사(내적 모순)"였다.
          // BASIC 은 SOURCE_EXACT 유지(기초 난이도 계약).
          const forceKillerBlankParaphrase =
            subType === "BLANK_INFERENCE" &&
            (effectiveDiffLabel === "KILLER" || effectiveDiffLabel === "INTERMEDIATE") &&
            !resolvedTypeSettings.blankInferenceDoubleNegative;
          const normalizedBeforeTrim: Record<string, unknown> =
            subType === "BLANK_INFERENCE" &&
            resolvedTypeSettings.blankInferenceDoubleNegative
              ? { ...rawQ, blankAnswerMode: "DOUBLE_NEGATIVE" }
              : subType === "BLANK_INFERENCE" &&
                  (resolvedTypeSettings.blankInferenceParaphraseAnswer ||
                    forceKillerBlankParaphrase)
                ? { ...rawQ, blankAnswerMode: "PARAPHRASE" }
                : subType === "BLANK_INFERENCE" &&
                    (resolvedTypeSettings.blankInferenceBlankCount ?? 1) === 1
                  ? { ...rawQ, blankAnswerMode: "SOURCE_EXACT" }
                  : rawQ;
          // 미끼 스페어 드랍(G→K) — 후처리·검증·repair 초안·반려 샘플이 전부
          // 같은 K-좌표계를 보도록 파이프라인 진입 전에 트림한다.
          const normalizedAiQuestion: Record<string, unknown> =
            grammarDecoySurplusActive
              ? trimGrammarDecoySurplus(normalizedBeforeTrim, {
                  finalMarkerCount: grammarMarkerCount ?? 5,
                  finalAnswerCount: grammarAnswerCount ?? 1,
                })
              : normalizedBeforeTrim;
          const ppResult = postProcessQuestion(
            subType,
            passageContent,
            normalizedAiQuestion,
          );
          if (!ppResult.success) {
            return {
              ok: false,
              error: ppResult.error || "Post-process failed",
              normalizedDraft: normalizedAiQuestion,
            };
          }
          if (ppResult.warnings.length > 0) {
            console.warn(
              `[AUTO-GEN] Post-process warnings for ${subType}: ${formatIssuesForLog(
                ppResult.warnings,
              )}`,
            );
          }

          const mapped: Record<string, unknown> = {
            ...(ppResult.data as Record<string, unknown>),
            _typeId: subType,
            _typeLabel: TYPE_LABELS[subType] || subType,
            _generationPlan: effectiveGenerationPlan,
            difficulty: effectiveDiffLabel,
          };

          // 배열 영작: scrambledWords 가 정답 어순(modelAnswer)대로 읽히면 왼→오 읽기로 풀려
          // 누수다. 기존 Math.random 1회 셔플 + 완전동일성 체크는 비결정적이고 "청크 근사정렬"
          // (예: 청크가 거의 정답 순서)을 못 막았다. TOPIC_SENTENCE_WRITING 과 동일한 결정론
          // 재배열(어간 부분수열로 어순 누수 판정 후 해시정렬→역순→회전, 멱등·칩불변)을 재사용한다.
          if (
            subType === "WORD_ORDER" &&
            Array.isArray(mapped.scrambledWords) &&
            mapped.scrambledWords.length > 1 &&
            typeof mapped.modelAnswer === "string"
          ) {
            mapped.scrambledWords = reorderChipsAwayFromAnswer(
              mapped.scrambledWords as string[],
              mapped.modelAnswer,
            );
          }

          // 주제문 영작: 보기/배열단어가 정답 어순 그대로면 누수(왼→오 읽기로 풀림). 모델
          // 셔플에만 의존하지 않고 결정론적으로 정답 어순에서 떼어 놓는다(게이트 검증 전 수행).
          if (subType === "TOPIC_SENTENCE_WRITING") {
            const reshuffled = reshuffleTopicSentenceWritingChips(mapped);
            mapped.scrambledWords = reshuffled.scrambledWords;
            mapped.wordBank = reshuffled.wordBank;
          }

          // KO(국어): ① 서버 주입 koContext — examMode·passageKind 를 LLM 에코가
          // 아니라 서버 진실로 저장하고, validateKoQuestion 이 검증 시 복원한다.
          // ② 정답 위치 결정론 셔플 — 선지-마커 1:1 유형(lockedOptionOrder)은 제외.
          // 둘 다 검증 "전"에 수행해 셔플 결과의 일관성까지 검증된다.
          if (koMod) {
            mapped.koContext = {
              examMode: koResolved?.examMode ?? "SUNEUNG",
              passageKind: koKind,
            };
            if (
              koMod.meta.answerFormat === "MC5" &&
              !koMod.meta.lockedOptionOrder
            ) {
              shuffleKoMc5Options(mapped);
            }
          }

          // 다양성 모드: 보기 배열형 유형의 보기 내용을 셔플해 정답 위치 편중을
          // 제거한다. 게이트 검증 전에 수행해 셔플 결과의 일관성까지 검증된다.
          // (KO 는 SHUFFLE_OPTION_TYPES 미등록이라 아래 호출은 무동작 통과.)
          const finalQuestion = diversity
            ? shuffleQuestionOptionsForDiversity(mapped, subType)
            : mapped;

          const qualityIssues = validateQuestionQuality({
            typeId: subType,
            question: finalQuestion,
            passage: passageContent,
            requestedDifficulty: effectiveDiffLabel,
            // 기사용 타깃 재사용 게이트는 첫 2회 시도에만 — 재시도 비용을 묶고,
            // 타깃 풀이 고갈된 지문은 이후 시도/relaxed 폴백에서 재사용을 허용.
            diversityUsedTargets:
              attemptIndex < 2 ? diversitySignals?.usedTargets : undefined,
            irrelevantSlotCount,
            grammarMarkerCount,
            grammarAnswerCount,
            grammarCorrectionErrorCount,
            stemLanguage: resolvedTypeSettings.stemLanguage,
            optionLanguage: resolvedTypeSettings.optionLanguage,
            vocabChoiceMarkerCount,
            vocabChoiceAnswerCount,
            sentenceInsertSlotCount,
            antonymPairCount,
            blankInferenceBlankCount,
            blankInferenceParaphraseAnswer,
            blankInferenceGranularity,
            genericOptionCount,
            genericAnswerCount,
            contentMatchType,
            answerPolarity,
          });
          const qualityErrors = qualityIssues.filter(
            (issue) => issue.severity === "error",
          );
          const qualityWarnings = qualityIssues.filter(
            (issue) => issue.severity === "warning",
          );
          // scarce = relaxed + 전 유형 "완성도(craft)" 게이트 추가 강등(정답
          // 유일성·누출·렌더 무결성은 유지) — never-fail 구제 사다리의 최후 모드.
          const isBlockingInMode = (issue: QuestionQualityIssue): boolean => {
            if (qualityMode === "strict") return true;
            if (!RELAXED_BLOCKING_QUALITY_CODES.has(issue.code)) return false;
            if (
              qualityMode === "scarce" &&
              SALVAGE_RELAXABLE_CODES.has(issue.code)
            ) {
              return false;
            }
            return true;
          };
          const blockingQualityErrors = qualityErrors.filter(isBlockingInMode);
          const relaxedQualityWarnings =
            qualityMode === "relaxed" || qualityMode === "scarce"
              ? qualityErrors
                  .filter((issue) => !isBlockingInMode(issue))
                  .map((issue) => ({ ...issue, severity: "warning" as const }))
              : [];
          return {
            ok: true,
            finalQuestion,
            blockingErrors: blockingQualityErrors,
            allWarnings: [...qualityWarnings, ...relaxedQualityWarnings],
            hasRelaxedWarnings: relaxedQualityWarnings.length > 0,
            normalizedDraft: normalizedAiQuestion,
          };
        };

        for (const q of generatedQuestions) {
          let fin = finalizeCandidate(q);
          if (!fin.ok) {
            console.warn(
              `[AUTO-GEN] Post-process failed for ${subType}: ${fin.error}`,
            );
            recordRejection(rejectionRecorder, {
              phase: "postprocess",
              qualityMode,
              subType,
              message: fin.error,
              sample: buildRejectionSample(subType, fin.normalizedDraft),
            });
            continue;
          }

          // SHIP-FIRST 부분 repair: A(차단) 결함이 적으면(<=3종) 문항 전체 재생성 전에
          // "이 초안에서 이 결함만 고쳐라"로 후보당 1회 교정 재생성을 시도한다. 데드라인
          // 안에서만. 성공 시 교체, 실패 시 원래 탈락 경로로 폴백(무회귀·happy-path 0영향).
          //
          // KO 제외(KO-GEN-3): KO 는 finalize 안에서 정답 위치 셔플이 검증 "전"에
          // 무조건(비-identity) 적용되므로, blockingErrors 의 선지 라벨(①~⑤) 좌표는
          // 셔플 "후" 기준인데 repair 에 넘기는 draft(normalizedDraft)는 셔플 "전"
          // 좌표다 — LLM 이 엉뚱한 선지를 고치는 체계적 오도(LLM 1회 낭비)가 된다.
          // KO 는 strict 재시도 루프(교정 피드백 주입)가 자체 복구 경로라 skip 이
          // 부작용 최소안이다(영어 경로는 셔플 없음 — 기존 동작 그대로).
          // PREMIUM 도 repair 대상 — reasoning-off 이후 호출당 ~13-30s 라 후보당
          // 1회 교정 재생성이 데드라인(270s) 안에 충분히 들어온다(26-07-06,
          // 프리미엄 생성 실패율 완화의 일부).
          if (
            !koMod &&
            fin.blockingErrors.length > 0 &&
            fin.blockingErrors.length <= 3 &&
            shouldAttemptCandidateRepair(subType, fin.blockingErrors) &&
            (!deadlineAt || Date.now() < deadlineAt)
          ) {
            const repaired = await repairQuestionCandidate({
              subType,
              draft: fin.normalizedDraft,
              blockingIssues: fin.blockingErrors,
              passageContent,
              responseSchema,
              generationPlan: effectiveGenerationPlan,
              perQuestionTokenFloor,
              deadlineAt,
              system: generationSystem,
              forceJsonFallback: premiumForceJsonFallback,
              onModelUsage: (result) => {
                onModelUsage?.({
                  phase: "question_generation",
                  subType,
                  qualityMode,
                  difficulty: effectiveDiffLabel,
                  generationPlan: effectiveGenerationPlan,
                  usage: result.usage,
                  provider: result.provider,
                  modelId: result.modelId,
                  attempts: result.attempts,
                  durationMs: result.durationMs,
                });
              },
            });
            if (repaired) {
              const repairedFin = finalizeCandidate(repaired);
              if (repairedFin.ok && repairedFin.blockingErrors.length === 0) {
                console.log(
                  `[AUTO-GEN] ${subType} candidate repaired (was: ${fin.blockingErrors
                    .map((issue) => issue.code)
                    .join(",")})`,
                );
                fin = repairedFin;
              }
            }
          }

          if (fin.blockingErrors.length > 0) {
            console.warn(
              `[AUTO-GEN] Quality errors for ${subType}: ${formatIssuesForLog(
                fin.blockingErrors,
              )}`,
            );
            recordRejection(rejectionRecorder, {
              phase: "quality",
              qualityMode,
              subType,
              message: summarizeQualityIssues(fin.blockingErrors),
              codes: fin.blockingErrors.map((issue) => issue.code),
              sample: buildRejectionSample(subType, fin.finalQuestion),
            });
            // never-fail 구제 사다리용 후보 보존 — craft 결함만 있는 후보는 모든
            // 재시도 소진 후 경고 부착으로 재승인될 수 있다(F급 혼입 후보는
            // admitSalvageCandidatesFromPool 이 걸러낸다).
            recordRejectedCandidate(rejectionRecorder, {
              subType,
              qualityMode,
              attemptIndex,
              question: fin.finalQuestion,
              blockingCodes: fin.blockingErrors.map((issue) => issue.code),
              blockingIssues: fin.blockingErrors,
              warnings: fin.allWarnings,
            });
            continue;
          }

          // KO 난도5 독립 솔버 게이트 — needsSolverGate 유형만(후보당 LLM 1회 비용),
          // strict 모드 전용(relaxed 폴백은 수율 보존을 위해 생략). 품질검증 통과
          // "후"에 태워 결정론 게이트를 이미 통과한 후보만 비용을 쓴다. 불일치 =
          // 후보 반려 → strict 재시도 유도(ko-solver-mismatch 는 RELAXED_BLOCKING).
          if (koMod?.meta.needsSolverGate) {
            if (qualityMode === "strict") {
              const solverIssue = await runKoSolverGate({
                question: fin.finalQuestion,
                passage: passageContent,
                mod: koMod,
                generationPlan: effectiveGenerationPlan,
                deadlineAt,
                onModelUsage: (result) => {
                  onModelUsage?.({
                    phase: "question_generation",
                    subType,
                    qualityMode,
                    difficulty: effectiveDiffLabel,
                    generationPlan: effectiveGenerationPlan,
                    usage: result.usage,
                    provider: result.provider,
                    modelId: result.modelId,
                    attempts: result.attempts,
                    durationMs: result.durationMs,
                  });
                },
              });
              if (solverIssue) {
                console.warn(
                  `[AUTO-GEN] KO solver gate rejected ${subType}: ${solverIssue.message}`,
                );
                recordRejection(rejectionRecorder, {
                  phase: "quality",
                  qualityMode,
                  subType,
                  message: solverIssue.message,
                  codes: [solverIssue.code],
                  sample: buildRejectionSample(subType, fin.finalQuestion),
                });
                continue;
              }
            }
            // 통과(또는 relaxed 생략) 후보는 검수 권장 배지 — HITL 라우팅.
            fin.finalQuestion._reviewRecommended = true;
          }

          // SHIP-FIRST: 취향/난이도 경고(강등된 B 코드 포함)도 검수 UI 가시성을 위해
          // strict 모드에서까지 항상 부착한다. 단 _qualityMode='relaxed'(저품질 신호)는
          // 실제 relaxed 폴백 경로에서만 — 취향 경고에 저품질 배지를 달지 않는다.
          if (fin.allWarnings.length > 0) {
            fin.finalQuestion._qualityWarnings = fin.allWarnings;
            console.warn(
              `[AUTO-GEN] Quality warnings for ${subType}: ${formatIssuesForLog(
                fin.allWarnings,
              )}`,
            );
          }
          if (fin.hasRelaxedWarnings) {
            fin.finalQuestion._qualityMode = "relaxed";
          }

          qs.push(fin.finalQuestion);
        }

        console.log(`[AUTO-GEN] ${subType} done: ${qs.length} questions`);
        return qs;
      } catch (err) {
        console.error(
          `[AUTO-GEN] Failed ${subType}:`,
          err instanceof Error ? err.message : err,
        );
        if (isNonRetryableQuestionGenerationProviderError(err)) {
          throw err;
        }
        recordRejection(rejectionRecorder, {
          phase: "model",
          qualityMode,
          subType,
          message: err instanceof Error ? err.message : String(err),
        });
        return [];
      }
    }),
  );

  return generatedGroups.flat();
}

export async function runQuestionGenerationWithEmptyRetry(
  input: RunGenerationInput,
  {
    maxAttempts = GEMINI_QUESTION_EMPTY_RESULT_MAX_ATTEMPTS,
    logPrefix = "AUTO-GEN",
    deadlineAt,
  }: {
    maxAttempts?: number;
    logPrefix?: string;
    /**
     * 절대 시각(epoch ms). 이 시각이 지나면 새 시도를 시작하지 않고 조기 종료한다.
     * 느린 PREMIUM(Claude)이 다수 재시도로 Vercel 120s/trigger 600s 한도를 넘겨
     * 함수가 강제종료→잡 고아→환불 누락되는 것을 막는다. 미전달 시 기존 동작과 동일.
     */
    deadlineAt?: number;
  } = {},
): Promise<{
  questions: Record<string, unknown>[];
  attempts: number;
  relaxedFallback: boolean;
  rejectionSummary: QuestionGenerationRejectionSummary;
  usageEvents: QuestionGenerationUsageEvent[];
}> {
  const usageEvents: QuestionGenerationUsageEvent[] = [];
  const inputWithUsage: RunGenerationInput = {
    ...input,
    onModelUsage: (event) => {
      usageEvents.push(event);
      input.onModelUsage?.(event);
    },
  };
  const rejectionRecorder: RejectionRecorder = { issues: [] };
  const hasNegativeParaphraseBlank = hasDoubleNegativeBlankSetting(inputWithUsage);
  const hasBlankParaphraseAnswer = hasBlankParaphraseAnswerSetting(inputWithUsage);
  const hasSingleBlankInference = hasSingleBlankInferenceSetting(inputWithUsage);
  const hasKillerSingleBlankInference =
    hasSingleBlankInference &&
    inputWithUsage.plan.some(
      (item) =>
        item.subType === "BLANK_INFERENCE" &&
        item.count > 0 &&
        readQuestionTypeDifficultySetting(
          inputWithUsage.typeSettings?.BLANK_INFERENCE,
          inputWithUsage.diffLabel,
        ) === "KILLER",
    );
  const hasSummaryCompleteMc = inputWithUsage.plan.some(
    (item) => item.subType === "SUMMARY_COMPLETE_MC" && item.count > 0,
  );
  // 요약문 영작(서술형, PASSTHROUGH)은 객관식 SUMMARY_COMPLETE_MC 만큼 정합 제약이
  // 빡빡하지 않으므로 재시도 상한을 기본(4)에서 한 단계만(5) 올린다 — 누수/엔트로피
  // 게이트(sw-*)가 strict 재시도에서 교정될 기회를 약간 더 준다.
  const hasSummaryWriting = inputWithUsage.plan.some(
    (item) => item.subType === "SUMMARY_WRITING" && item.count > 0,
  );
  const hasGrammarError = inputWithUsage.plan.some(
    (item) => item.subType === "GRAMMAR_ERROR" && item.count > 0,
  );
  const hasStandardGrammarKiller = isStandardGrammarKillerRequest(inputWithUsage);
  const requestedCount = inputWithUsage.plan.reduce(
    (sum, item) => sum + Math.max(0, Math.floor(Number(item.count) || 0)),
    0,
  );
  const largestIrrelevantSlotCount = getLargestIrrelevantSlotCount(inputWithUsage);
  const largestGrammarMarkerCount = getLargestGrammarMarkerCount(inputWithUsage);
  const largestGrammarAnswerCount = getLargestGrammarAnswerCount(inputWithUsage);
  // 네모 어법은 세 슬롯 전부 정합을 요구해 수율이 낮다 — 확장 유형과 동일하게 6회.
  const hasGrammarChoiceCombo = inputWithUsage.plan.some(
    (item) => item.subType === "GRAMMAR_CHOICE_COMBO" && item.count > 0,
  );
  const requestedMaxAttempts = Math.floor(maxAttempts);
  const hasExtendedRetryType =
    hasSummaryCompleteMc ||
    hasGrammarChoiceCombo ||
    largestIrrelevantSlotCount > 5 ||
    largestGrammarMarkerCount > 5 ||
    largestGrammarAnswerCount > 1;
  const rawAttempts = hasKillerSingleBlankInference
    ? Math.max(10, requestedMaxAttempts)
    : hasNegativeParaphraseBlank || hasBlankParaphraseAnswer || hasExtendedRetryType
      ? Math.max(6, requestedMaxAttempts)
      : hasSummaryWriting
        ? Math.max(5, requestedMaxAttempts)
        : Math.max(4, requestedMaxAttempts);
  // PREMIUM(Claude)은 1회 호출이 실측 ~25~35s(긴 지문은 더)로 느려 strict 다회 재시도가
  // 누적되면 시간 벽을 넘긴다. 데드라인(fast 270s/trigger 540s)이 실제 한계라 상한은
  // 그 안에서 교정 재시도(buildCorrectiveRetryFeedback)+relaxed 폴백이 충분히 돌도록
  // 5로 둔다(5×~33s≈165s + relaxed, 270s 예산 내). 성공은 평균 1.22회라 정상 케이스는
  // 영향 없고, 긴/어려운 지문에서 품질 게이트(list-like·too-easy) 통과 기회를 늘린다.
  // STANDARD(Gemini ~9s)는 기존 상한을 유지한다.
  const PREMIUM_STRICT_ATTEMPT_CAP = 5;
  // 26-07-06 2차: 3→4 — gemini 호출 ~10s 라 저비용이고, STANDARD KILLER 어법의
  // 구제 의존율 3/4(다지문 실측)을 strict 재시도 1회 추가로 낮춘다(지정 설계와 병행).
  const STANDARD_GRAMMAR_KILLER_STRICT_ATTEMPT_CAP = 4;
  const attempts =
    inputWithUsage.generationPlan === "PREMIUM"
      ? Math.max(1, Math.min(rawAttempts, PREMIUM_STRICT_ATTEMPT_CAP, requestedMaxAttempts))
      : hasStandardGrammarKiller
        ? // 26-07-06 2차: requestedMaxAttempts(기본 2)를 min 에서 제거 — 다른
          // STANDARD 유형은 rawAttempts(≥4)를 그대로 받는데 어법 KILLER 만 2회로
          // 조여져 구제 의존율 3/4 의 한 원인이었다. gemini ~10s 라 4회도 저비용.
          Math.max(1, Math.min(rawAttempts, STANDARD_GRAMMAR_KILLER_STRICT_ATTEMPT_CAP))
      : rawAttempts;

  // 실패 반환 직전 전용 — 어법 결핍 지문(금지 표면이 후보 대부분과 겹치는 퇴화
  // 케이스, 실측: glass 지문 금지 31개 vs 정제 후보 1개)이면 마지막 거절 사유로
  // 마커를 남겨, UI 가 "다시 생성하세요" 대신 "지문 부적합"을 안내하게 한다
  // (workbench-generation-errors 의 grammar-scarce-passage 매핑 짝). 레스큐/repair
  // 판정 이후 실패 경로에서만 호출되므로 그 결정들에는 영향이 없다.
  const getGrammarScarceInfo = (): {
    scarce: boolean;
    usableCount: number;
    codeCount: number;
  } => {
    if (!hasGrammarError) return { scarce: false, usableCount: 0, codeCount: 0 };
    try {
      const { candidates: usableSites } = selectUsableGrammarCandidates(
        inputWithUsage.passageContent,
        inputWithUsage.diffLabel,
      );
      const usableSiteCodes = new Set(usableSites.map((site) => site.code));
      const requestedMarkerCount = Math.max(5, largestGrammarMarkerCount);
      return {
        scarce:
          usableSites.length < requestedMarkerCount + 2 ||
          usableSiteCodes.size < 3,
        usableCount: usableSites.length,
        codeCount: usableSiteCodes.size,
      };
    } catch {
      return { scarce: false, usableCount: 0, codeCount: 0 };
    }
  };

  const recordGrammarScarcePassageMarker = () => {
    if (!hasGrammarError) return;
    const hasGrammarQualityRejection = rejectionRecorder.issues.some(
      (issue) => issue.phase === "quality" && issue.subType === "GRAMMAR_ERROR",
    );
    if (!hasGrammarQualityRejection) return;
    const info = getGrammarScarceInfo();
    if (!info.scarce) return;
    recordRejection(rejectionRecorder, {
      phase: "quality",
      qualityMode: "strict",
      subType: "GRAMMAR_ERROR",
      message: `grammar-scarce-passage: this passage offers only ${info.usableCount} clean grammar sites across ${info.codeCount} point codes after forbidden-surface filtering; it is a poor fit for grammar-judgment items`,
      codes: ["grammar-scarce-passage"],
    });
  };

  // 결핍 지문 최선 생성(유저 결정 26-07-04: "못 만듭니다"로 끝내지 말고 만들어
  // 주되 품질이 제한적인 이유를 알린다). 기존 사다리(strict→rescue/relaxed)가
  // 전부 실패한 뒤에만, 어법 단독 요청 + 결핍 지문일 때 1회 실행한다 —
  // 취향 게이트(GRAMMAR_SCARCE_RELAXABLE_CODES)를 경고로 강등한 scarce 모드로
  // 생성하고, 출하물에 사유 notice·검수권장을 부착한다. 정답 유일성·무결성
  // 게이트는 그대로라 "틀린 문항"은 여전히 출하되지 않는다.
  const runGrammarScarceBestEffort = async (): Promise<
    Record<string, unknown>[] | null
  > => {
    if (!hasGrammarError) return null;
    if (
      inputWithUsage.plan.length !== 1 ||
      inputWithUsage.plan[0]?.subType !== "GRAMMAR_ERROR"
    ) {
      return null;
    }
    if (deadlineAt && Date.now() >= deadlineAt) return null;
    const info = getGrammarScarceInfo();
    if (!info.scarce) return null;
    console.warn(
      `[${logPrefix}] Scarce grammar passage (${info.usableCount} usable sites / ${info.codeCount} codes); running best-effort scarce pass with taste gates downgraded.`,
    );
    const scarceFeedback = [
      pendingFeedback,
      "Scarce-passage best effort: this passage lacks clean grammar sites. Build the most defensible item possible — the answer must still be a single unambiguous error with verbatim source backing, but decoy variety and trap depth may be simpler than usual. Do not fabricate disputed or broken-looking mutations to fill slots.",
    ]
      .filter(Boolean)
      .join("\n\n");
    const bestEffort = await runQuestionGeneration(inputWithUsage, {
      qualityMode: "scarce",
      rejectionRecorder,
      attemptIndex: attempts + 1,
      previousAttemptFeedback: scarceFeedback,
      deadlineAt,
    });
    if (bestEffort.length === 0) return null;
    const notice = `이 지문에는 어법 문제로 낼 만한 깨끗한 문법 구조가 부족해(정제 후 사용 가능 자리 ${info.usableCount}개) 일부 품질 기준을 완화하고 생성했습니다. 밑줄 구성이 단순하거나 함정 매력도가 낮을 수 있으니 검수 후 사용을 권장합니다.`;
    for (const question of bestEffort) {
      question._qualityMode = "relaxed";
      question._reviewRecommended = true;
      question._scarcePassage = true;
      question._generationNotice = notice;
    }
    return bestEffort;
  };

  // ── never-fail 구제 사다리 (26-07-06 유저 결정: "생성 실패"는 최악의 결과) ──
  // ① 거절 후보 풀 재승인(LLM 0회·즉시): strict/relaxed 에서 craft(완성도) 게이트
  //    에만 걸려 탈락한 후보가 있으면 그 게이트를 경고로 강등하고 notice 를 붙여
  //    출하한다. F급(정답 무효·누출·렌더 파손) 결함 후보는 절대 재승인되지 않는다.
  // ② 풀이 비면 scarce(구제) 모드 LLM 1회 — 전 유형 craft 게이트 강등 생성.
  // ③ 그래도 없으면 정직한 실패(모델 전면 장애·지문 부적합만 남는다).
  const admitFromPool = (): Record<string, unknown>[] | null => {
    const admitted = admitSalvageCandidatesFromPool(rejectionRecorder, {
      needed: Math.max(1, requestedCount),
    });
    if (admitted.length === 0) return null;
    console.warn(
      `[${logPrefix}] Never-fail salvage: admitting ${admitted.length} craft-flagged candidate(s) from the rejection pool with review notice.`,
    );
    return admitted;
  };

  const runUniversalSalvage = async (): Promise<
    Record<string, unknown>[] | null
  > => {
    const pooled = admitFromPool();
    if (pooled) return pooled;
    if (deadlineAt && Date.now() >= deadlineAt) return null;
    console.warn(
      `[${logPrefix}] Never-fail salvage: rejection pool empty; running one salvage-mode generation pass.`,
    );
    const salvageFeedback = [
      pendingFeedback,
      "Salvage pass: previous attempts were rejected by craft-quality gates. Produce the most defensible item possible. The answer must remain single, unambiguous, and source-backed; craft polish (decoy attractiveness, trap depth, explanation length) may be simpler than usual. Never fabricate disputed or broken-looking constructions.",
    ]
      .filter(Boolean)
      .join("\n\n");
    const salvage = await runQuestionGeneration(inputWithUsage, {
      qualityMode: "scarce",
      rejectionRecorder,
      attemptIndex: attempts + 2,
      previousAttemptFeedback: salvageFeedback,
      deadlineAt,
    });
    if (salvage.length === 0) {
      // salvage 시도의 탈락 후보도 풀에 쌓였을 수 있다 — 한 번 더 재승인 시도.
      return admitFromPool();
    }
    for (const question of salvage) {
      question._qualityMode = "relaxed";
      question._reviewRecommended = true;
      const warningCodes = Array.isArray(question._qualityWarnings)
        ? (question._qualityWarnings as Array<{ code?: unknown }>)
            .map((issue) => (typeof issue?.code === "string" ? issue.code : ""))
            .filter(Boolean)
        : [];
      question._generationNotice = buildSalvageNotice(warningCodes);
    }
    return salvage;
  };

  let pendingFeedback: string | undefined;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    // 시간 예산 가드: 1회는 반드시 시도하되(크레딧 차감됨), 이후 시도는 남은
    // 시간이 없으면 시작하지 않는다 — 함수 강제종료로 잡이 고아가 되어 환불이
    // 누락되는 것을 막고, 호출자의 catch 에서 정상 실패+환불로 흐르게 한다.
    if (deadlineAt && attempt > 1 && Date.now() >= deadlineAt) {
      console.warn(
        `[${logPrefix}] Time budget reached before attempt ${attempt}/${attempts}; stopping strict retries early.`,
      );
      break;
    }
    const issueCountBeforeAttempt = rejectionRecorder.issues.length;
    const questions = await runQuestionGeneration(inputWithUsage, {
      rejectionRecorder,
      attemptIndex: attempt - 1,
      previousAttemptFeedback: pendingFeedback,
      deadlineAt,
    });
    const shouldRequireFullRequestedCount =
      hasNegativeParaphraseBlank || hasBlankParaphraseAnswer || hasGrammarError;
    const hasEnoughQuestions = shouldRequireFullRequestedCount
      ? questions.length >= requestedCount
      : questions.length > 0;
    if (hasEnoughQuestions) {
      return {
        questions,
        attempts: attempt,
        relaxedFallback: false,
        rejectionSummary: buildRejectionSummary(rejectionRecorder),
        usageEvents,
      };
    }
    // 이번 시도에서 새로 기록된 거절 사유를 다음 시도 프롬프트에 교정 지시로
    // 주입한다 (맹목 재시도 → 교정 재생성).
    pendingFeedback = buildCorrectiveRetryFeedback(
      rejectionRecorder.issues.slice(issueCountBeforeAttempt),
      { cumulativeIssues: rejectionRecorder.issues },
    );
    if (attempt === attempts) {
      break;
    }
    console.warn(
      `[${logPrefix}] Generation result did not pass quality/count gate (${questions.length}/${requestedCount}); retrying (${attempt + 1}/${attempts})`,
    );
  }

  if (deadlineAt && Date.now() >= deadlineAt) {
    // 시간 예산 소진 — LLM 재시도는 불가하지만 풀 재승인은 무비용이라 항상 시도.
    const pooledAtDeadline = admitFromPool();
    if (pooledAtDeadline) {
      return {
        questions: pooledAtDeadline,
        attempts,
        relaxedFallback: true,
        rejectionSummary: buildRejectionSummary(rejectionRecorder),
        usageEvents,
      };
    }
    console.warn(
      `[${logPrefix}] Time budget reached; skipping relaxed fallback, returning empty (caller refunds).`,
    );
    recordGrammarScarcePassageMarker();
    return {
      questions: [],
      attempts,
      relaxedFallback: false,
      rejectionSummary: buildRejectionSummary(rejectionRecorder),
      usageEvents,
    };
  }

  if (shouldRunStandardGrammarKillerRescue(inputWithUsage, rejectionRecorder)) {
    console.warn(
      `[${logPrefix}] STANDARD GRAMMAR_ERROR KILLER attempts only found shallow/local targets; running INTERMEDIATE rescue instead of failing.`,
    );
    const rescueInput = buildStandardGrammarKillerRescueInput(inputWithUsage);
    const rescueFeedback = [
      pendingFeedback,
      "Rescue requirement: do not repeat the rejected KILLER-local answer pattern. Produce a strong INTERMEDIATE item with five meaningful grammar marks and exactly one clear, source-backed wrong expression.",
    ]
      .filter(Boolean)
      .join("\n\n");
    const rescueQuestions = await runQuestionGeneration(rescueInput, {
      qualityMode: "strict",
      rejectionRecorder,
      attemptIndex: attempts,
      previousAttemptFeedback: rescueFeedback,
      deadlineAt,
    });
    if (rescueQuestions.length > 0) {
      for (const question of rescueQuestions) {
        question._requestedDifficulty = "KILLER";
        question._difficultyDowngraded = true;
        question._reviewRecommended = true;
        question._qualityMode = question._qualityMode ?? "rescue";
      }
      return {
        questions: rescueQuestions,
        attempts: attempts + 1,
        relaxedFallback: true,
        rejectionSummary: buildRejectionSummary(rejectionRecorder),
        usageEvents,
      };
    }
    console.warn(
      `[${logPrefix}] STANDARD GRAMMAR_ERROR KILLER rescue also failed; skipping relaxed KILLER fallback to avoid extra shallow retries.`,
    );
    const killerBestEffort =
      (await runGrammarScarceBestEffort()) ?? (await runUniversalSalvage());
    if (killerBestEffort) {
      for (const question of killerBestEffort) {
        question._requestedDifficulty = "KILLER";
        question._difficultyDowngraded = true;
      }
      return {
        questions: killerBestEffort,
        attempts: attempts + 2,
        relaxedFallback: true,
        rejectionSummary: buildRejectionSummary(rejectionRecorder),
        usageEvents,
      };
    }
    recordGrammarScarcePassageMarker();
    return {
      questions: [],
      attempts: attempts + 1,
      relaxedFallback: false,
      rejectionSummary: buildRejectionSummary(rejectionRecorder),
      usageEvents,
    };
  }

  if (inputWithUsage.generationPlan === "PREMIUM") {
    // 프리미엄은 relaxed LLM 폴백 대신 구제 사다리로 직행 — 풀 재승인(0비용)이
    // 먼저라 대부분 추가 지연 없이 출하되고, 풀이 비었을 때만 salvage 1회를 쓴다.
    console.warn(
      `[${logPrefix}] Strict premium generation exhausted after ${attempts} attempts; entering never-fail salvage ladder.`,
    );
    const premiumBestEffort =
      (await runGrammarScarceBestEffort()) ?? (await runUniversalSalvage());
    if (premiumBestEffort) {
      return {
        questions: premiumBestEffort,
        attempts: attempts + 1,
        relaxedFallback: true,
        rejectionSummary: buildRejectionSummary(rejectionRecorder),
        usageEvents,
      };
    }
    recordGrammarScarcePassageMarker();
    return {
      questions: [],
      attempts,
      relaxedFallback: false,
      rejectionSummary: buildRejectionSummary(rejectionRecorder),
      usageEvents,
    };
  }

  console.warn(
    `[${logPrefix}] Strict quality generation exhausted after ${attempts} attempts; running relaxed quality fallback.`,
  );
  const relaxedQuestions = await runQuestionGeneration(inputWithUsage, {
    qualityMode: "relaxed",
    rejectionRecorder,
    attemptIndex: attempts,
    previousAttemptFeedback: pendingFeedback,
    deadlineAt,
  });
  if (relaxedQuestions.length === 0) {
    const relaxedBestEffort =
      (await runGrammarScarceBestEffort()) ?? (await runUniversalSalvage());
    if (relaxedBestEffort) {
      return {
        questions: relaxedBestEffort,
        attempts: attempts + 2,
        relaxedFallback: true,
        rejectionSummary: buildRejectionSummary(rejectionRecorder),
        usageEvents,
      };
    }
    recordGrammarScarcePassageMarker();
  }
  return {
    questions: relaxedQuestions,
    attempts: attempts + 1,
    relaxedFallback: true,
    rejectionSummary: buildRejectionSummary(rejectionRecorder),
    usageEvents,
  };
}
