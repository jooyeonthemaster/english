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
import { buildDiversityPromptBlock, shuffleQuestionOptionsForDiversity } from "@/lib/question-diversity";
import { DIFF_DESCRIPTION, TYPE_LABELS } from "./constants";
import { generateWithRetry } from "./generate-with-retry";
import { repairQuestionCandidate } from "./question-repair";
import { fallbackResponseSchema } from "./schemas";
import { buildGenerationPrompt, STRUCTURED_OUTPUT_INSTRUCTIONS, UNSTRUCTURED_OUTPUT_INSTRUCTIONS } from "./prompts";
import { isNonRetryableQuestionGenerationProviderError } from "@/lib/question-generation-llm";
import type { QualityMode, QuestionGenerationRejectionSummary, QuestionGenerationUsageEvent, RejectionRecorder, RunGenerationInput } from "./run-question-generation-types";
import { RELAXED_BLOCKING_QUALITY_CODES } from "./run-question-generation-constants";
import { buildCorrectiveRetryFeedback, buildRejectionSample, buildRejectionSummary, formatIssuesForLog, getLargestGrammarAnswerCount, getLargestGrammarMarkerCount, getLargestIrrelevantSlotCount, hasBlankParaphraseAnswerSetting, hasDoubleNegativeBlankSetting, hasSingleBlankInferenceSetting, isRecord, mergeCustomPromptWithTypeSettings, recordRejection, summarizeQualityIssues } from "./run-question-generation-helpers";

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

function shouldAttemptCandidateRepair(
  subType: string,
  issues: QuestionQualityIssue[],
): boolean {
  if (subType !== "GRAMMAR_ERROR") return true;
  const codes = issues.map((issue) => issue.code).filter(Boolean);
  if (codes.length === 0) return true;
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
            grammarMarkerCount,
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
        const effectiveGenerationMaxTokens = Math.min(
          generationMaxTokens,
          standardGrammarTokenCap,
        );
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
          //
          // KO 제외(KO-GEN-3): KO 는 finalize 안에서 정답 위치 셔플이 검증 "전"에
          // 무조건(비-identity) 적용되므로, blockingErrors 의 선지 라벨(①~⑤) 좌표는
          // 셔플 "후" 기준인데 repair 에 넘기는 draft(normalizedDraft)는 셔플 "전"
          // 좌표다 — LLM 이 엉뚱한 선지를 고치는 체계적 오도(LLM 1회 낭비)가 된다.
          // KO 는 strict 재시도 루프(교정 피드백 주입)가 자체 복구 경로라 skip 이
          // 부작용 최소안이다(영어 경로는 셔플 없음 — 기존 동작 그대로).
          if (
            !koMod &&
            effectiveGenerationPlan !== "PREMIUM" &&
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
  const STANDARD_GRAMMAR_KILLER_STRICT_ATTEMPT_CAP = 3;
  const attempts =
    inputWithUsage.generationPlan === "PREMIUM"
      ? Math.max(1, Math.min(rawAttempts, PREMIUM_STRICT_ATTEMPT_CAP, requestedMaxAttempts))
      : hasStandardGrammarKiller
        ? Math.max(
            1,
            Math.min(
              rawAttempts,
              STANDARD_GRAMMAR_KILLER_STRICT_ATTEMPT_CAP,
              requestedMaxAttempts,
            ),
          )
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
    return {
      questions: [],
      attempts: attempts + 1,
      relaxedFallback: false,
      rejectionSummary: buildRejectionSummary(rejectionRecorder),
      usageEvents,
    };
  }

  if (inputWithUsage.generationPlan === "PREMIUM") {
    console.warn(
      `[${logPrefix}] Strict premium generation exhausted after ${attempts} attempts; skipping relaxed fallback to preserve premium quality and latency.`,
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
