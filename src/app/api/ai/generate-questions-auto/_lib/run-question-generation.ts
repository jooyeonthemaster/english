import { z } from "zod";

import {
  AI_QUESTION_SCHEMAS,
  getAiResponseSchema,
} from "@/lib/question-ai-schemas-mc";
import { GEMINI_QUESTION_EMPTY_RESULT_MAX_ATTEMPTS } from "@/lib/concurrency-config";
import { postProcessQuestion } from "@/lib/question-postprocess";
import { normalizePassageWhitespace } from "@/lib/question-postprocess/text-utils";
import {
  QUESTION_SCHEMAS,
  STRUCTURED_TYPE_PROMPTS,
} from "@/lib/question-schemas";
import type { QuestionGenerationPlan } from "@/lib/question-generation-plans";
import {
  buildQuestionTypeSettingsPrompt,
  getQuestionTypeGenerationTokenFloor,
  readQuestionTypeDifficultySetting,
  readQuestionTypeGenerationPlanSetting,
  readSummaryWritingBlankCountSetting,
  resolveQuestionTypeGenerationSettings,
  type QuestionTypeGenerationSettings,
} from "@/lib/question-type-generation-settings";
import {
  buildQuestionTargetCandidateBlock,
  getTypeQualityRubric,
  type QuestionQualityIssue,
  SHIP_FIRST_WARNING_CODES,
  validateQuestionQuality,
} from "@/lib/question-quality";
import {
  buildDiversityPromptBlock,
  shuffleQuestionOptionsForDiversity,
  type QuestionDiversityContext,
} from "@/lib/question-diversity";

import { DIFF_DESCRIPTION, TYPE_LABELS } from "./constants";
import { generateWithRetry } from "./generate-with-retry";
import { repairQuestionCandidate } from "./question-repair";
import { fallbackResponseSchema, type PlanResult } from "./schemas";
import {
  STRUCTURED_OUTPUT_INSTRUCTIONS,
  UNSTRUCTURED_OUTPUT_INSTRUCTIONS,
  buildGenerationPrompt,
} from "./prompts";
import { isNonRetryableQuestionGenerationProviderError } from "@/lib/question-generation-llm";

export interface RunGenerationInput {
  plan: PlanResult["plan"];
  schoolType: string;
  gradeInfo: string;
  passageContent: string;
  teacherIntentBlock: string;
  analysisContext: string;
  diffLabel: string;
  diffInstruction: string;
  generationPlan: QuestionGenerationPlan;
  customPrompt?: string;
  typeSettings?: QuestionTypeGenerationSettings;
  /**
   * 반복 생성 다양성 컨텍스트 (기사용 타깃 회피 + 정답 위치 스티어링 + 보기 셔플).
   * 미전달 시 기존 동작과 100% 동일 — 동형/커스텀/세트 등 다른 호출자는 무영향.
   */
  diversity?: QuestionDiversityContext;
  onModelUsage?: (event: QuestionGenerationUsageEvent) => void;
}

type QualityMode = "strict" | "relaxed";

type RejectionPhase = "model" | "postprocess" | "quality";

export interface QuestionGenerationUsageEvent {
  phase: "question_generation";
  subType: string;
  qualityMode: QualityMode;
  difficulty: string;
  generationPlan: QuestionGenerationPlan;
  usage?: unknown;
  provider: string;
  modelId: string;
  attempts: number;
  durationMs: number;
}

export interface QuestionGenerationRejectionIssue {
  phase: RejectionPhase;
  qualityMode: QualityMode;
  subType: string;
  message: string;
  codes?: string[];
  sample?: Record<string, unknown>;
}

export interface QuestionGenerationRejectionSummary {
  total: number;
  phaseCounts: Record<RejectionPhase, number>;
  topCodes: Array<{ code: string; count: number }>;
  lastIssue?: QuestionGenerationRejectionIssue;
  message: string;
}

interface RejectionRecorder {
  issues: QuestionGenerationRejectionIssue[];
}

const RELAXED_BLOCKING_QUALITY_CODES = new Set([
  "option-count",
  "duplicate-option-label",
  "duplicate-option-text",
  "empty-option-text",
  "correct-answer-mismatch",
  "wrong-option-explanation-count",
  "mid-word-marker",
  "target-not-standalone",
  "punctuation-only-chunk",
  "scrambled-already-solved",
  "grammar-marker-count",
  "grammar-render-marker-count",
  "grammar-error-count",
  "grammar-correct-answer-labels",
  "grammar-missing-error-expression",
  "grammar-error-not-mutated",
  "grammar-error-pos-change",
  "grammar-decoy-point-diversity",
  "grammar-killer-thin-answer",
  // 절/문장 통째 밑줄(예: 프리미엄 실측 "these digital platforms create a trusting
  // environment" 7단어)은 정답성·가독성을 해치는 명백한 결함 — relaxed 폴백에서도
  // 출하 금지. ('wide'는 strict 전용이라 의도적으로 제외 — 완전 실패 방지.)
  "grammar-underline-too-long",
  // 복수정답 시비(규범 논쟁 자리 밑줄)는 relaxed 폴백에서도 출하 금지 —
  // 정답 무효급 결함이라 미생성이 잘못된 문항보다 낫다.
  "grammar-disputed-usage-target",
  // 정답 노출/타깃 부적격도 같은 이유로 relaxed에서 출하 금지
  // (2026-06-12 사용자 테스트에서 relaxed 누수 실측: 노출 5건·list-like 1건).
  "multi-blank-answer-visible",
  "blank-target-list-like",
  "vocab-option-word-mismatch",
  // 부분구 누설(빈칸 값 핵심부 잔존)·어휘 원단어 잔존도 정답 노출이라 차단
  // (2026-06-12 적대검수 추가 발견).
  "multi-blank-answer-partial-visible",
  "vocab-source-word-visible",
  // 마커 깨짐(인접 중복)·오배치(엉뚱한 동형 단어)도 정답 노출/해설 불일치라
  // relaxed에서도 차단 (2026-06-12 어법 KILLER 30개 중 실측 2건).
  "grammar-marker-adjacent-duplicate",
  "grammar-marker-context-mismatch",
  "grammar-surrounding-missing-marker",
  // 시제 단독변경(realizes↔realized)은 문맥상 두 시제 가능 = 정답 시비. 차단.
  "grammar-tense-only-error",
  // 네모 어법 — 세 슬롯 전부가 정답 키를 구성하므로 슬롯/조합 결함은 전부
  // 정답 무효급. relaxed 폴백에서도 출하 금지.
  "combo-slot-count",
  "combo-render-slot-count",
  "combo-slot-missing-candidate",
  "combo-slot-not-mutated",
  "combo-correct-not-in-source",
  "combo-option-value-mismatch",
  "combo-duplicate-option",
  "combo-answer-combo-mismatch",
  "combo-candidate-visible-elsewhere",
  "grammar-correction-underline-count",
  "grammar-correction-missing-underlined-segments",
  "grammar-correction-missing-passage-underline",
  "grammar-correction-underline-count-mismatch",
  "grammar-correction-error-count",
  "grammar-correction-missing-corrected-part",
  "grammar-correction-missing-source-text",
  "grammar-correction-missing-displayed-text",
  "grammar-correction-missing-error-part",
  "grammar-correction-not-mutated",
  "grammar-correction-correction-mismatch",
  "grammar-correction-answer-mismatch",
  "grammar-correction-corrected-part-not-in-source-text",
  "grammar-correction-error-part-not-in-displayed-text",
  "grammar-correction-displayed-not-mutated",
  "grammar-correction-underline-too-narrow",
  "grammar-correction-underlined-segment-short",
  "grammar-correction-displayed-text-not-rendered",
  "grammar-correction-source-text-not-source-backed",
  "grammar-correction-sentence-not-source-backed",
  "grammar-correction-debatable-infinitive",
  "grammar-correction-killer-thin-segment",
  "topic-option-language",
  // 정답 극성 토글(강제 설정 시에만 발생) — 발문/저장 극성이 강제값과 어긋나면
  // 정답 무효급이라 relaxed 폴백에서도 출하 금지. 미설정(기본) 경로엔 영향 없음.
  "content-match-direction-polarity",
  "content-match-type-mismatch",
  "gist-polarity-direction-mismatch",
  "gist-polarity-field-mismatch",
  "summary-mc-direction-frame",
  "summary-mc-missing-summary",
  "summary-mc-blank-marker-count",
  "summary-mc-summary-language",
  "summary-mc-missing-blank-answer",
  "summary-mc-answer-language",
  "summary-mc-awkward-collocation",
  "summary-mc-correct-answer-mismatch",
  "summary-mc-correct-pair-mismatch",
  "summary-mc-option-pair-shape",
  "summary-mc-option-language",
  "summary-mc-missing-half-correct-traps",
  // 요약문 영작(SUMMARY_WRITING) — 누수/구조 무효 게이트는 relaxed 폴백에서도
  // 출하 금지(정답 노출·placeholder 깨짐·비영어 정답은 미생성이 잘못 생성보다 낫다).
  // sw-distractor-semantic 은 warning 이라 여기 미포함.
  "sw-answer-not-in-summary",
  "sw-wordbank-no-answer-order",
  "sw-summary-blank-marker-count",
  "sw-modelanswer-present",
  "sw-answer-language",
  "implied-meaning-missing-expression",
  "implied-meaning-missing-underline",
  "implied-meaning-underline-count",
  "implied-meaning-option-language",
  "implied-meaning-option-not-english",
  "implied-meaning-single-word-target",
  "implied-meaning-target-too-short",
  "implied-meaning-target-not-in-passage",
  "implied-meaning-noncentral-target",
  "implied-meaning-rhetorical-question-target",
  "implied-meaning-missing-surface-meaning",
  "implied-meaning-thin-reasoning-gap",
  "implied-meaning-direct-answer-leak",
  "implied-meaning-thin-evidence-chain",
  "implied-meaning-absolute-giveaway-option",
  "irrelevant-sentence-count",
  "empty-irrelevant-sentence",
  "irrelevant-index-range",
  "irrelevant-index-edge",
  "irrelevant-answer-index-mismatch",
  "irrelevant-source-not-verbatim",
  "irrelevant-source-first-sentence",
  "irrelevant-source-order",
  "irrelevant-answer-from-source",
  "irrelevant-too-unrelated",
  "irrelevant-inserted-ungrammatical",
  "irrelevant-obvious-counterclaim-cue",
  "irrelevant-prescriptive-giveaway",
  "sentence-insert-missing-passage",
  "sentence-insert-gap-marker-count",
  "sentence-insert-omitted-source-not-backed",
  "sentence-insert-omitted-source-visible",
  "sentence-insert-given-leaks-in-passage",
  "sentence-order-missing-given",
  "sentence-order-given-too-long",
  "sentence-order-given-too-long-relative",
  "sentence-order-paragraph-count",
  "sentence-order-paragraph-labels",
  "sentence-order-paragraph-too-short",
  "sentence-order-paragraph-too-thin",
  "sentence-order-paragraph-imbalance",
  "sentence-order-option-permutation",
  "sentence-order-option-duplicates",
  "sentence-order-correct-option-shape",
  "sentence-order-unscrambled-answer",
  // These BLANK_INFERENCE paraphrase gates remain blocking even in the relaxed
  // fallback because shipping an untransformed or giveaway item is worse than
  // asking the generation loop to try again.
  "blank-missing-answer",
  "blank-paraphrase-answer-not-transformed",
  "blank-paraphrase-answer-too-verbatim",
  "blank-paraphrase-missing-answer-logic",
  "blank-paraphrase-option-source-copy",
  "blank-paraphrase-option-imbalance",
  "blank-paraphrase-correct-too-thin",
  "blank-paraphrase-difficulty-mismatch",
  "blank-paraphrase-killer-too-easy",
  "blank-paraphrase-killer-giveaway-distractors",
  "blank-paraphrase-verb-form-slot-mismatch",
  "blank-paraphrase-subject-slot-mismatch",
  "blank-paraphrase-clause-slot-mismatch",
  "blank-paraphrase-polarity-loss",
  "blank-paraphrase-target-trailing-function",
  "blank-paraphrase-target-too-wide",
  "blank-killer-target-too-easy",
  "blank-target-too-small",
  "blank-target-list-like",
  "blank-awkward-correct-option",
  "blank-awkward-option",
  "multi-blank-paraphrase-correct-source-exact",
  "negative-paraphrase-copula-slot-mismatch",
  "negative-paraphrase-stacked-prepositions",
  "negative-paraphrase-verb-slot-mismatch",
  "negative-paraphrase-modal-be-negated-complement",
  "negative-paraphrase-no-subject-double-negation",
  "double-negative-clause-missing-subject",
  "double-negative-because-phrase-slot",
]);

// SHIP-FIRST: B(취향/난이도) 코드는 question-quality 에서 warning 으로 강등되어 절대
// error 로 이 필터에 도달하지 않는다. 단일 진실원(SHIP_FIRST_WARNING_CODES)에서 차감해
// 두 목록의 동기화를 보장하고 위 리터럴의 중복 항목(blank-target-list-like)도 제거한다.
// 남는 것 = A(차단 유지) + C(사전 fast-fail) 코드뿐.
for (const code of SHIP_FIRST_WARNING_CODES) {
  RELAXED_BLOCKING_QUALITY_CODES.delete(code);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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
        blankPointFocus,
        sentenceInsertPointFocus,
        irrelevantPointFocus,
        sentenceOrderPointFocus,
        genericOptionCount,
        genericAnswerCount,
        answerPolarity,
      } = resolvedTypeSettings;

      const typeSettingsPrompt = buildQuestionTypeSettingsPrompt(
        subType,
        effectiveTypeSettings,
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
            grammarMarkerCount,
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
          grammarMarkerCount,
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
      const responseSchema = hasAiSchema
        ? getAiResponseSchema(subType, {
            irrelevantSlotCount,
            grammarMarkerCount,
            grammarAnswerCount,
            grammarCorrectionErrorCount,
            summaryCompleteMcBlankCount,
            summaryCompleteBlankCount,
            summaryWritingBlankCount,
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
        const { system: generationSystem, prompt: generationPrompt } =
          buildGenerationPrompt({
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
            customPrompt: previousAttemptFeedback
              ? [mergedCustomPrompt, previousAttemptFeedback]
                  .filter(Boolean)
                  .join("\n\n")
              : mergedCustomPrompt,
          });
        const object = await generateWithRetry(
          responseSchema,
          generationPrompt,
          effectiveGenerationPlan,
          Math.min(20_000, Math.max(perQuestionTokenFloor, (Number(typeCount) || 1) * perQuestionTokenFloor)),
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
          { system: generationSystem, deadlineAt },
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
          // KILLER 단일 빈칸(비DN)은 PARAPHRASE 모드를 강제한다(정답이 원문 verbatim이면
          // 추론 없이 풀려 KILLER 미성립).
          const normalizedAiQuestion: Record<string, unknown> =
            subType === "BLANK_INFERENCE" &&
            resolvedTypeSettings.blankInferenceDoubleNegative
              ? { ...rawQ, blankAnswerMode: "DOUBLE_NEGATIVE" }
              : subType === "BLANK_INFERENCE" &&
                  resolvedTypeSettings.blankInferenceParaphraseAnswer
                ? { ...rawQ, blankAnswerMode: "PARAPHRASE" }
                : subType === "BLANK_INFERENCE" &&
                    (resolvedTypeSettings.blankInferenceBlankCount ?? 1) === 1
                  ? { ...rawQ, blankAnswerMode: "SOURCE_EXACT" }
                  : rawQ;
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

          if (
            subType === "WORD_ORDER" &&
            Array.isArray(mapped.scrambledWords) &&
            mapped.scrambledWords.length > 1
          ) {
            const arr = [...mapped.scrambledWords];
            for (let i = arr.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [arr[i], arr[j]] = [arr[j], arr[i]];
            }
            if (arr.join("|") === mapped.scrambledWords.join("|")) {
              [arr[0], arr[arr.length - 1]] = [arr[arr.length - 1], arr[0]];
            }
            mapped.scrambledWords = arr;
          }

          // 다양성 모드: 보기 배열형 유형의 보기 내용을 셔플해 정답 위치 편중을
          // 제거한다. 게이트 검증 전에 수행해 셔플 결과의 일관성까지 검증된다.
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
          const blockingQualityErrors =
            qualityMode === "relaxed"
              ? qualityErrors.filter((issue) =>
                  RELAXED_BLOCKING_QUALITY_CODES.has(issue.code),
                )
              : qualityErrors;
          const relaxedQualityWarnings =
            qualityMode === "relaxed"
              ? qualityErrors
                  .filter((issue) => !RELAXED_BLOCKING_QUALITY_CODES.has(issue.code))
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
          if (
            fin.blockingErrors.length > 0 &&
            fin.blockingErrors.length <= 3 &&
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
            continue;
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

function mergeCustomPromptWithTypeSettings(
  customPrompt: string | undefined,
  typeSettingsPrompt: string,
): string | undefined {
  const parts = [customPrompt?.trim(), typeSettingsPrompt.trim()].filter(Boolean);
  return parts.length ? parts.join("\n\n") : undefined;
}

function formatIssuesForLog(issues: unknown): string {
  try {
    return JSON.stringify(issues);
  } catch {
    return String(issues);
  }
}

function recordRejection(
  recorder: RejectionRecorder | undefined,
  issue: QuestionGenerationRejectionIssue,
) {
  if (!recorder) return;
  recorder.issues.push({
    ...issue,
    message: issue.message.slice(0, 800),
  });
}

function summarizeQualityIssues(issues: QuestionQualityIssue[]): string {
  return issues
    .map((issue) => `${issue.code}: ${issue.message}`)
    .join(" | ")
    .slice(0, 800);
}

function buildRejectionSample(
  subType: string,
  question: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (subType === "GRAMMAR_ERROR") {
    const markedExpressions = Array.isArray(question.markedExpressions)
      ? question.markedExpressions
          .filter(isRecord)
          .map((item) => ({
            label: item.label,
            expression: item.expression,
            isError: item.isError,
            errorExpression: item.errorExpression,
          }))
      : [];
    const passageWithMarkers =
      typeof question.passageWithMarkers === "string"
        ? question.passageWithMarkers
        : "";

    return {
      markedCount: markedExpressions.length,
      renderedMarkerCount: (passageWithMarkers.match(/__[^_]+__/g) ?? []).length,
      markedExpressions,
      passageWithMarkersPreview: passageWithMarkers.slice(0, 300),
    };
  }

  if (subType === "GRAMMAR_CHOICE_COMBO") {
    const slots = Array.isArray(question.slots)
      ? question.slots
          .filter(isRecord)
          .map((item) => ({
            label: item.label,
            correctExpression: item.correctExpression,
            wrongExpression: item.wrongExpression,
            pointCode: item.pointCode,
          }))
      : [];
    const passageWithMarkers =
      typeof question.passageWithMarkers === "string"
        ? question.passageWithMarkers
        : "";

    return {
      slotCount: slots.length,
      renderedSlotCount: (passageWithMarkers.match(/\([A-C]\)\s*\[[^\[\]]*\/[^\[\]]*\]/g) ?? []).length,
      slots,
      correctAnswer: question.correctAnswer,
      passageWithMarkersPreview: passageWithMarkers.slice(0, 300),
    };
  }

  if (subType !== "IRRELEVANT") return undefined;
  const sentences = Array.isArray(question.sentences)
    ? question.sentences.filter((sentence): sentence is string => typeof sentence === "string")
    : [];
  const irrelevantIndex = Number(question.irrelevantIndex);
  const insertedSentence =
    Number.isInteger(irrelevantIndex) && irrelevantIndex >= 0
      ? sentences[irrelevantIndex]
      : undefined;

  return {
    sentenceCount: sentences.length,
    irrelevantIndex: Number.isInteger(irrelevantIndex) ? irrelevantIndex : null,
    correctAnswer: question.correctAnswer,
    insertedSentence: insertedSentence?.slice(0, 180),
    firstSentence: sentences[0]?.slice(0, 180),
    lastSentence: sentences[sentences.length - 1]?.slice(0, 180),
  };
}

function buildRejectionSummary(
  recorder: RejectionRecorder,
): QuestionGenerationRejectionSummary {
  const phaseCounts: Record<RejectionPhase, number> = {
    model: 0,
    postprocess: 0,
    quality: 0,
  };
  const codeCounts = new Map<string, number>();

  for (const issue of recorder.issues) {
    phaseCounts[issue.phase] += 1;
    for (const code of issue.codes ?? []) {
      codeCounts.set(code, (codeCounts.get(code) ?? 0) + 1);
    }
  }

  const topCodes = [...codeCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([code, count]) => ({ code, count }));
  const lastIssue = recorder.issues.at(-1);
  const topCodeText = topCodes
    .map(({ code, count }) => `${code} x${count}`)
    .join(", ");
  const message = [
    `Rejected candidates: ${recorder.issues.length}`,
    topCodeText ? `Top codes: ${topCodeText}` : "",
    lastIssue ? `Last: ${lastIssue.phase}/${lastIssue.subType} - ${lastIssue.message}` : "",
  ].filter(Boolean).join(" | ");

  return {
    total: recorder.issues.length,
    phaseCounts,
    topCodes,
    lastIssue,
    message,
  };
}

/**
 * 직전 시도에서 새로 기록된 거절 사유를 다음 프롬프트에 주입할 짧은 한국어
 * 교정 지시 블록으로 만든다. 같은 실수를 반복하는 "맹목 재시도"를 구체적 사유를
 * 본 "교정 재생성"으로 바꿔 수율을 올리고 재시도 횟수를 줄인다.
 */
function buildCorrectiveRetryFeedback(
  issues: QuestionGenerationRejectionIssue[],
): string | undefined {
  if (issues.length === 0) return undefined;
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const issue of issues) {
    const key =
      issue.codes && issue.codes.length > 0
        ? issue.codes.join(",")
        : issue.message;
    if (seen.has(key)) continue;
    seen.add(key);
    // 따옴표 안 내용(정답·표현 파생 텍스트)은 다음 프롬프트로의 누설 경로가 될 수
    // 있어 …로 가린다. 게이트 이름·구조적 사유는 보존돼 교정 신호로는 충분하다.
    const detail = issue.message
      .replace(/[“”"][^“”"]*[“”"]|'[^']*'/g, "…")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 200);
    if (detail) lines.push(`- ${detail}`);
    if (lines.length >= 4) break;
  }
  if (lines.length === 0) return undefined;
  return [
    "## 직전 생성 실패 — 아래 사유를 반드시 교정해서 다시 출제",
    ...lines,
    "위와 동일한 실수를 반복하지 마세요. 형식·정답 개수·밑줄/표현의 원문 일치·오답 선지의 매력도(지문 어휘에 기반한 그럴듯한 near-miss, 정답과 길이·문체가 비슷할 것)를 모두 충족하는 새 문항을 생성하세요.",
  ].join("\n");
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
  const attempts =
    inputWithUsage.generationPlan === "PREMIUM"
      ? Math.max(1, Math.min(rawAttempts, PREMIUM_STRICT_ATTEMPT_CAP))
      : rawAttempts;

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
      hasNegativeParaphraseBlank || hasBlankParaphraseAnswer;
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
    );
    if (attempt === attempts) {
      break;
    }
    console.warn(
      `[${logPrefix}] Generation result did not pass quality/count gate (${questions.length}/${requestedCount}); retrying (${attempt + 1}/${attempts})`,
    );
  }

  if (deadlineAt && Date.now() >= deadlineAt) {
    console.warn(
      `[${logPrefix}] Time budget reached; skipping relaxed fallback, returning empty (caller refunds).`,
    );
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
  return {
    questions: relaxedQuestions,
    attempts: attempts + 1,
    relaxedFallback: true,
    rejectionSummary: buildRejectionSummary(rejectionRecorder),
    usageEvents,
  };
}

function hasDoubleNegativeBlankSetting(input: RunGenerationInput): boolean {
  if (!input.plan.some((item) => item.subType === "BLANK_INFERENCE" && item.count > 0)) {
    return false;
  }

  const blankSettings = input.typeSettings?.BLANK_INFERENCE;
  return (
    typeof blankSettings === "object" &&
    blankSettings !== null &&
    "doubleNegative" in blankSettings &&
    (blankSettings as { doubleNegative?: unknown }).doubleNegative === true
  );
}

function hasBlankParaphraseAnswerSetting(input: RunGenerationInput): boolean {
  if (!input.plan.some((item) => item.subType === "BLANK_INFERENCE" && item.count > 0)) {
    return false;
  }

  const resolved = resolveQuestionTypeGenerationSettings(
    "BLANK_INFERENCE",
    input.typeSettings?.BLANK_INFERENCE,
  );
  return (
    resolved.blankInferenceParaphraseAnswer === true &&
    resolved.blankInferenceDoubleNegative !== true &&
    (resolved.blankInferenceBlankCount ?? 1) === 1
  );
}

function hasSingleBlankInferenceSetting(input: RunGenerationInput): boolean {
  if (!input.plan.some((item) => item.subType === "BLANK_INFERENCE" && item.count > 0)) {
    return false;
  }

  const resolved = resolveQuestionTypeGenerationSettings(
    "BLANK_INFERENCE",
    input.typeSettings?.BLANK_INFERENCE,
  );
  return (resolved.blankInferenceBlankCount ?? 1) === 1;
}

function getLargestIrrelevantSlotCount(input: RunGenerationInput): number {
  let maxSlotCount = 0;
  for (const item of input.plan) {
    if (item.subType !== "IRRELEVANT" || item.count <= 0) continue;
    const resolved = resolveQuestionTypeGenerationSettings(
      item.subType,
      input.typeSettings?.[item.subType],
    );
    maxSlotCount = Math.max(
      maxSlotCount,
      resolved.irrelevantSlotCount ?? 0,
    );
  }
  return maxSlotCount;
}

function getLargestGrammarMarkerCount(input: RunGenerationInput): number {
  let maxMarkerCount = 0;
  for (const item of input.plan) {
    if (item.subType !== "GRAMMAR_ERROR" || item.count <= 0) continue;
    const resolved = resolveQuestionTypeGenerationSettings(
      item.subType,
      input.typeSettings?.[item.subType],
    );
    maxMarkerCount = Math.max(
      maxMarkerCount,
      resolved.grammarMarkerCount ?? 0,
    );
  }
  return maxMarkerCount;
}

function getLargestGrammarAnswerCount(input: RunGenerationInput): number {
  let maxAnswerCount = 0;
  for (const item of input.plan) {
    if (item.subType !== "GRAMMAR_ERROR" || item.count <= 0) continue;
    const resolved = resolveQuestionTypeGenerationSettings(
      item.subType,
      input.typeSettings?.[item.subType],
    );
    maxAnswerCount = Math.max(
      maxAnswerCount,
      resolved.grammarAnswerCount ?? 0,
    );
  }
  return maxAnswerCount;
}
