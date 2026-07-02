// ============================================================================
// AI 문제 수정 — 오케스트레이터
// ============================================================================
// 생성 파이프라인(스키마·후처리·품질 게이트)을 그대로 재사용한 "제약 재생성":
//   1) 베이스라인에서 스키마 카운트 파생 → getAiResponseSchema(유형별 정확 스키마)
//   2) buildEditPrompt(유형 규칙서 + 베이스라인 + 지시 + 수정 계약)
//   3) runEditModel(선택 모델) → questions[0]
//   4) postProcessQuestion(지문 필드 재구성) → validateQuestionQuality(유형 게이트)
//   5) 품질 에러면 교정 피드백 주입 재시도(최대 maxAttempts). 마지막엔 경고 수락.
//   6) before/after 결정론 diff + 저장용 questionText 직렬화
// ============================================================================

import { z } from "zod";

import { AI_QUESTION_SCHEMAS, getAiResponseSchema } from "@/lib/question-ai-schemas-mc";
import { postProcessQuestion } from "@/lib/question-postprocess";
import { normalizePassageWhitespace } from "@/lib/question-postprocess/text-utils";
import { buildGeneratedQuestionText } from "@/lib/question-generation-persistence";
import { QUESTION_SCHEMAS } from "@/lib/question-schemas";
import {
  validateQuestionQuality,
  type QuestionQualityIssue,
} from "@/lib/question-quality";

import { TYPE_LABELS } from "@/app/api/ai/generate-questions-auto/_lib/constants";

import { buildEditPrompt } from "./build-edit-prompt";
import { computeEditChanges } from "./change-summary";
import { computeDetailedDiff } from "./detailed-diff";
import { deriveEditSchemaOptions } from "./derive-type-settings";
import {
  checkEditLengthIssues,
  hasBlockingError,
  isNoRealChange,
  isSchemaMismatchError,
  NO_CHANGE_EDIT_SUMMARY,
  SCHEMA_MISMATCH_USER_MESSAGE,
} from "./edit-guards";
import { runEditModel } from "./edit-llm";
import { editModelProvider, resolveEditModelId } from "./model-config";
import type { RunQuestionEditInput, RunQuestionEditResult } from "./types";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/** 품질 이슈 메시지에서 따옴표 구간(정답 인용 가능)을 가려 교정 피드백에 누설 방지.
 *  생성 경로(buildCorrectiveRetryFeedback)와 동일하게 따옴표 종류별 분기로 아포스트로피
 *  포함 인용("don't" 등)도 확실히 가린다. */
function scrubForFeedback(text: string): string {
  return text
    .replace(/[“”"][^“”"]*[“”"]|‘[^’]*’|'[^']*'/g, "[…]")
    .replace(/\s+/g, " ")
    .slice(0, 400);
}

/** 유형별 "구조를 정의하는 배열"의 길이 — 베이스라인과 일치해야 한다(구조 카운트 고정).
 *  null = 카운트 개념이 없는 유형(검사 생략). */
function structuralCount(subType: string, q: Record<string, unknown>): number | null {
  const len = (v: unknown) => (Array.isArray(v) ? v.length : null);
  // 빈칸 개수 = 문자열 안의 _____ (밑줄 3개 이상) 런 수. 스키마/Zod 로 못 막는 단답형
  // (FILL_BLANK_KEY) 의 빈칸 인플레이션을 결정론으로 잠근다. _____ 가 없으면 null →
  // 가드 자체 생략(현행 동작 유지=무회귀).
  const blankRuns = (v: unknown) =>
    typeof v === "string" ? (v.match(/_{3,}/g)?.length ?? null) : null;
  switch (subType) {
    case "GRAMMAR_ERROR":
    case "VOCAB_CHOICE":
    case "ANTONYM":
      return len(q.markedExpressions) ?? len(q.markedWords);
    case "GRAMMAR_CHOICE_COMBO":
      return len(q.slots);
    case "GRAMMAR_CORRECTION":
      return len(q.underlinedSegments);
    case "SUMMARY_WRITING":
    case "SUMMARY_COMPLETE":
    case "SUMMARY_COMPLETE_MC":
      return len(q.blanks);
    case "TOPIC_SENTENCE_WRITING":
      // cloze 모드는 빈칸 수, scrambled 모드는 제시어 수가 구조 카운트.
      // 둘 다 없으면 0(개념상 구조 없음) — deriveEditSchemaOptions 와 정확히 일치.
      return len(q.blanks) ?? len(q.scrambledWords) ?? 0;
    case "SENTENCE_INSERT":
    case "IRRELEVANT":
    case "CONTENT_MATCH":
      return len(q.options);
    case "FILL_BLANK_KEY":
      // 단답형 빈칸 개수 = sentenceWithBlank 의 _____ 런 수(스키마에 blanks 배열 없음).
      return blankRuns(q.sentenceWithBlank);
    case "BLANK_INFERENCE":
      // 다중빈칸(후처리 분기 기준 blanks.length>=2)은 blanks 수, 단일빈칸은 개념상 1.
      return Array.isArray(q.blanks) && q.blanks.length >= 2 ? q.blanks.length : 1;
    default:
      return null;
  }
}

function buildCorrectiveFeedback(issues: QuestionQualityIssue[]): string {
  const lines = issues
    .slice(0, 6)
    .map((i) => `- (${i.code}) ${scrubForFeedback(i.message)}`);
  return `다음 품질 문제를 교정하세요(스키마·표시 규칙·정합성 준수):\n${lines.join("\n")}`;
}

export async function runQuestionEdit(
  input: RunQuestionEditInput,
): Promise<RunQuestionEditResult> {
  const {
    subType,
    baseline,
    instruction,
    targets,
    schoolType,
    gradeInfo,
    generationPlan,
    deadlineAt,
  } = input;
  const modelId = resolveEditModelId(input.modelId);
  const provider = editModelProvider(modelId);
  const maxAttempts = Math.max(1, input.maxAttempts ?? 2);
  const passageContent = normalizePassageWhitespace(input.passageContent || "");
  const difficulty =
    typeof baseline.difficulty === "string" ? baseline.difficulty : "INTERMEDIATE";
  const baselineCount = structuralCount(subType, baseline);

  // 베이스라인이 강제로 정해진 설계 신호(극성·언어·표시모드·패러프레이즈)를 품질게이트에
  // 그대로 전달해, 수정본이 원래 설계 제약을 깨는데도 기본 가정으로 통과하는 것을 막는다
  // (생성 호출부와 동형). 없으면 undefined → 게이트가 알아서 생략.
  const lang = (v: unknown): "ko" | "en" | undefined =>
    v === "ko" || v === "en" ? v : undefined;
  const qualitySignals = {
    contentMatchType:
      baseline.matchType === "일치" || baseline.matchType === "불일치"
        ? (baseline.matchType as "일치" | "불일치")
        : undefined,
    answerPolarity:
      baseline.answerPolarity === "POSITIVE" || baseline.answerPolarity === "NEGATIVE"
        ? (baseline.answerPolarity as "POSITIVE" | "NEGATIVE")
        : undefined,
    stemLanguage: lang(baseline.stemLanguage),
    optionLanguage: lang(baseline.optionLanguage),
    blankInferenceParaphraseAnswer:
      baseline.blankAnswerMode === "PARAPHRASE" ? true : undefined,
  };

  const baseResult = (extra: Partial<RunQuestionEditResult>): RunQuestionEditResult => ({
    ok: false,
    before: baseline,
    changes: [],
    detailedChanges: [],
    qualityWarnings: [],
    acceptedWithWarnings: false,
    meta: { modelId, provider, attempts: 0, durationMs: 0 },
    ...extra,
  });

  // 스키마: 베이스라인 구조에 맞춘 유형별 정확 스키마(없으면 구조 스키마 폴백).
  // + editSummary(교사용 변경 서술)를 같은 호출로 받도록 래퍼를 확장한다(질문 스키마 불변).
  const schemaOptions = deriveEditSchemaOptions(subType, baseline);
  let responseSchema: z.ZodType<{ questions: unknown[]; editSummary?: string }>;
  try {
    let baseSchema: z.ZodTypeAny;
    if (AI_QUESTION_SCHEMAS[subType]) {
      baseSchema = getAiResponseSchema(subType, schemaOptions);
    } else if (QUESTION_SCHEMAS[subType]) {
      baseSchema = z.object({ questions: z.array(QUESTION_SCHEMAS[subType]) });
    } else {
      throw new Error(`지원하지 않는 유형입니다: ${subType}`);
    }
    responseSchema = (baseSchema as unknown as z.ZodObject<z.ZodRawShape>).extend({
      editSummary: z.string().optional(),
    }) as unknown as z.ZodType<{ questions: unknown[]; editSummary?: string }>;
  } catch (err) {
    return baseResult({
      error: err instanceof Error ? err.message : `스키마 구성 실패: ${subType}`,
    });
  }

  let previousFeedback: string | undefined;
  let lastPostProcessed: Record<string, unknown> | null = null;
  let lastEditSummary: string | undefined;
  let lastWarnings: QuestionQualityIssue[] = [];
  let lastErrors: QuestionQualityIssue[] = [];
  let totalAttempts = 0;
  let durationMs = 0;
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { system, prompt } = buildEditPrompt({
      subType,
      schoolType,
      gradeInfo,
      passageContent,
      baseline,
      instruction,
      targets,
      difficulty,
      generationPlan,
      previousFeedback,
    });

    let modelObject: { questions?: unknown[]; editSummary?: string };
    try {
      const res = await runEditModel<{ questions?: unknown[]; editSummary?: string }>({
        schema: responseSchema,
        // google 경로는 system 미사용 → system 을 prompt 앞에 붙인다.
        prompt: provider === "google" && system ? `${system}\n\n${prompt}` : prompt,
        system: provider === "anthropic" ? system : undefined,
        modelId,
        maxTokens: 8192,
        deadlineAt,
      });
      modelObject = res.object;
      if (typeof modelObject.editSummary === "string" && modelObject.editSummary.trim()) {
        lastEditSummary = modelObject.editSummary.trim();
      }
      totalAttempts += res.attempts;
      durationMs += res.durationMs;
      inputTokens = res.inputTokens ?? inputTokens;
      outputTokens = res.outputTokens ?? outputTokens;
    } catch (err) {
      // provider 호출 자체 실패 — 비재시도 에러는 즉시 전파(호출자 환불).
      // 스키마 미스매치(선지/밑줄/빈칸 개수·유형 변경 등 구조 위반)는 원시 영어 메시지
      // ("No object generated: response did not match schema") 대신 한국어 안내로 변환한다(M6).
      const raw = err instanceof Error ? err.message : String(err);
      return baseResult({
        error: isSchemaMismatchError(raw) ? SCHEMA_MISMATCH_USER_MESSAGE : `모델 호출 실패: ${raw}`,
        meta: { modelId, provider, attempts: totalAttempts, durationMs },
      });
    }

    const rawQuestion =
      Array.isArray(modelObject.questions) && isRecord(modelObject.questions[0])
        ? (modelObject.questions[0] as Record<string, unknown>)
        : null;
    if (!rawQuestion) {
      previousFeedback = "questions 배열에 수정본 1개를 반드시 담아야 합니다.";
      continue;
    }

    // 모델이 모드 신호를 빠뜨리면 베이스라인 모드를 유지해 출제 의도가 조용히 회귀하는
    // 것을 막는다(BLANK_INFERENCE 정답모드 · VOCAB_CHOICE 동의어변형 모드).
    let normalized = rawQuestion;
    if (subType === "BLANK_INFERENCE" && !normalized.blankAnswerMode && baseline.blankAnswerMode) {
      normalized = { ...normalized, blankAnswerMode: baseline.blankAnswerMode };
    }
    if (subType === "VOCAB_CHOICE" && !normalized.vocabDisplayMode && baseline.vocabDisplayMode) {
      normalized = { ...normalized, vocabDisplayMode: baseline.vocabDisplayMode };
    }

    const pp = postProcessQuestion(subType, passageContent, normalized);
    if (!pp.success) {
      previousFeedback = `후처리 실패: ${scrubForFeedback(pp.error || "지문 정합 실패")}. 표시/밑줄/빈칸 표현을 원문과 정확히 일치시키세요.`;
      continue;
    }

    const finalQuestion: Record<string, unknown> = {
      ...(pp.data as Record<string, unknown>),
      _typeId: subType,
      _typeLabel: TYPE_LABELS[subType] || subType,
      _generationPlan: baseline._generationPlan ?? generationPlan,
      difficulty:
        typeof (pp.data as Record<string, unknown>).difficulty === "string"
          ? (pp.data as Record<string, unknown>).difficulty
          : difficulty,
    };
    // 태그는 베이스라인 유지(생성플랜 태그 보존은 저장 액션에서 재병합).
    if (baseline.tags !== undefined && finalQuestion.tags === undefined) {
      finalQuestion.tags = baseline.tags;
    }

    // 구조 카운트 고정: 수정본의 표시/밑줄/선지/빈칸 수가 원본과 다르면(스키마로 못 막는
    // GRAMMAR_CORRECTION·1빈칸 SUMMARY_WRITING 포함) 재시도. 경고-수락으로도 통과시키지
    // 않는다(아래 fallback 은 lastPostProcessed 만 수락하므로 여기서 continue 하면 제외).
    if (baselineCount != null) {
      const afterCount = structuralCount(subType, finalQuestion);
      if (afterCount != null && afterCount !== baselineCount) {
        previousFeedback = `구조를 유지하세요: 표시/밑줄/선지/빈칸 개수는 원본과 동일한 ${baselineCount}개여야 합니다(현재 ${afterCount}개). 개수를 바꾸지 말고 내용만 수정하세요.`;
        continue;
      }
    }

    const issues = validateQuestionQuality({
      typeId: subType,
      question: finalQuestion,
      passage: passageContent,
      requestedDifficulty: difficulty,
      ...schemaOptions,
      ...qualitySignals,
    });
    // 편집 전용 길이 가드(M1 선지 폭증 → error 재시도 · M2 정답-길이 식별 → warning).
    // 베이스라인 상대값이라 생성 게이트와 무관하며 정상 길이 편집은 통과한다.
    const lengthIssues = checkEditLengthIssues(subType, baseline, finalQuestion);
    const allIssues = [...issues, ...lengthIssues];
    const errors = allIssues.filter((i) => i.severity === "error");
    const warnings = allIssues.filter((i) => i.severity === "warning");

    lastPostProcessed = finalQuestion;
    lastWarnings = warnings;
    lastErrors = errors;

    if (errors.length === 0) {
      return finalize(finalQuestion, warnings, false);
    }

    // 품질 에러 → 교정 피드백 주입 후 재시도.
    previousFeedback = buildCorrectiveFeedback(errors);
  }

  // 모든 시도 소진 — 후처리는 성공했지만 품질 에러가 남은 경우.
  // 무결성 치명(정답 소실/무효/누설/유형변형, BLOCKING_EDIT_CODES) error 가 남았으면
  // "경고와 함께 수락"으로 조용히 출시하지 않고 하드 실패시킨다(결함품 출시보다 환불·
  // 재시도 유도가 안전). 그 외(난이도·취향·길이 등 "쓸 수는 있는" 결함)는 종전대로 경고
  // 수락 → 97.8% 정상 수율 보존(정상경로는 errors.length===0 으로 폴백을 애초에 안 탐).
  if (lastPostProcessed && !hasBlockingError(lastErrors)) {
    return finalize(
      lastPostProcessed,
      [...lastWarnings, ...lastErrors.map((e) => ({ ...e, severity: "warning" as const }))],
      true,
    );
  }
  if (lastPostProcessed && hasBlockingError(lastErrors)) {
    return baseResult({
      error:
        "정답이 학생에게 노출되거나 정답 표시가 누락되는 등 안전하게 출시할 수 없는 수정본입니다. 지시를 더 구체적으로 입력해 다시 시도해 주세요.",
      meta: { modelId, provider, attempts: totalAttempts, durationMs, inputTokens, outputTokens },
    });
  }

  return baseResult({
    error: "수정본 생성에 실패했습니다. 지시를 더 구체적으로 입력해 다시 시도해 주세요.",
    meta: { modelId, provider, attempts: totalAttempts, durationMs, inputTokens, outputTokens },
  });

  function finalize(
    after: Record<string, unknown>,
    warnings: QuestionQualityIssue[],
    acceptedWithWarnings: boolean,
  ): RunQuestionEditResult {
    let questionText = "";
    try {
      questionText = buildGeneratedQuestionText(after);
    } catch {
      questionText = "";
    }
    const changes = computeEditChanges(baseline, after);
    const detailedChanges = computeDetailedDiff(baseline, after);
    // editSummary 환각 억제(M4): 결정론 diff 가 완전히 비었으면(=실제로 아무것도 안
    // 바뀜) 모델의 "전면 정밀화/지문 두 배 확장" 같은 단언을 신뢰하지 않고 사실(변경
    // 없음)로 대체한다. diff 가 비지 않은 일반 케이스는 모델 서술을 그대로 둔다(과교정 회피).
    const editSummary = isNoRealChange(detailedChanges, changes)
      ? NO_CHANGE_EDIT_SUMMARY
      : lastEditSummary;
    return {
      ok: true,
      before: baseline,
      after,
      changes,
      detailedChanges,
      questionText,
      editSummary,
      qualityWarnings: warnings,
      acceptedWithWarnings,
      meta: {
        modelId,
        provider,
        attempts: totalAttempts,
        durationMs,
        inputTokens,
        outputTokens,
      },
    };
  }
}
