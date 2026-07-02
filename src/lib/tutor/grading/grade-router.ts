// ============================================================================
// Grade Router — rule(동기) / AI(Gemini, 6초 동기 시도→degraded) 단일 진입점 (스펙 §4.1)
// submitTutorActivityAction이 gradeTutorActivity 대신 이 async 라우터를 호출한다.
// ============================================================================

import {
  TutorActivityPayloadSchema,
  normalizeForCompare,
  type TutorActivityPayload,
} from "@/lib/tutor/activity-payload-schema";
import { gradeRule, type TutorGradeResult } from "@/lib/tutor/grading/grade-rule";
import { aiGradeText, type AiGradeResult } from "@/lib/tutor/grading/ai-grade";
import { AI_GRADE_TIMEOUT_MS } from "@/lib/tutor/grading/grade-config";

export interface TutorGradeOutcome extends TutorGradeResult {
  aiGrade?: AiGradeResult & { model: string; latencyMs: number };
  aiModel?: string;
  degraded?: boolean; // AI 지연/실패로 임시 처리(캐시 제외, 재시도 시 재채점)
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(null);
      }
    }, ms);
    promise
      .then((value) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(value);
        }
      })
      .catch(() => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(null);
        }
      });
  });
}

// 원문 복붙 판별: 학생 답이 화면의 원문/오류문장과 동일하면 0점 게이트.
function isCopiedFromSource(payload: Extract<TutorActivityPayload, { form: "TEXT" }>, submitted: string): boolean {
  const norm = normalizeForCompare(submitted);
  if (!norm) return false;
  if (payload.variant === "transform" || payload.variant === "conditional") {
    return norm === normalizeForCompare(payload.prompt);
  }
  if (payload.variant === "correct") {
    const source = payload.sentenceWithError ?? payload.prompt;
    return norm === normalizeForCompare(source);
  }
  return false; // translate: 한국어 답이라 영어 원문 복붙 불가
}

function aiToOutcome(payload: TutorActivityPayload, scoreMax: number, ai: AiGradeResult & { model: string; latencyMs: number }): TutorGradeOutcome {
  const scoreEarned = ai.copiedFromSource ? 0 : Math.round((ai.scorePct / 100) * scoreMax);
  return {
    isCorrect: ai.verdict === "correct" && !ai.copiedFromSource,
    scoreEarned: Math.max(0, Math.min(scoreMax, scoreEarned)),
    scoreMax,
    explanation: ai.feedbackKo,
    ruleResolved: true,
    aiGrade: ai,
    aiModel: ai.model,
  };
}

function unsupportedOutcome(scoreMax: number): TutorGradeOutcome {
  // 스트레이 v1/구버전 payload 안전 폴백(재생성 필요). 학생을 강제 오답 처리하지 않음.
  return {
    isCorrect: false,
    scoreEarned: 0,
    scoreMax,
    explanation: "이 활동은 형식이 오래되어 다시 생성이 필요해요. 선생님께 알려 주세요.",
    ruleResolved: false,
    degraded: true,
  };
}

export interface GradeRouterInput {
  payload: unknown; // TutorActivity.payload (v2)
  maxScore: number;
  response: unknown;
  /** 원가 기록 귀속용 학원 ID(제출 학생의 세션에서 전달). */
  academyId?: string | null;
}

export async function gradeActivityResponse(input: GradeRouterInput): Promise<TutorGradeOutcome> {
  const scoreMax = Math.max(1, Math.round(input.maxScore));
  const parsed = TutorActivityPayloadSchema.safeParse(input.payload);
  if (!parsed.success) return unsupportedOutcome(scoreMax);
  const payload = parsed.data;

  const ruleResult = gradeRule(payload, input.response, scoreMax);
  if (ruleResult.ruleResolved || !ruleResult.needsAi) {
    return ruleResult;
  }

  // 여기 도달 = TEXT(ai/hybrid)에서 rule 미확정 → AI 채점.
  const responseRecord = input.response && typeof input.response === "object" ? (input.response as Record<string, unknown>) : {};
  const submitted = String(responseRecord.answer ?? responseRecord.text ?? responseRecord.value ?? input.response ?? "");

  if (payload.form === "TEXT" && isCopiedFromSource(payload, submitted)) {
    return {
      isCorrect: false,
      scoreEarned: 0,
      scoreMax,
      explanation: "화면의 원문을 그대로 옮겨 적었어요. 조건에 맞게 직접 바꾸어 써 보세요.",
      ruleResolved: true,
    };
  }

  if (payload.form !== "TEXT") return unsupportedOutcome(scoreMax);

  const ai = await withTimeout(
    aiGradeText({
      variant: payload.variant,
      studentAnswer: submitted,
      instruction: payload.instruction ?? payload.prompt,
      sourceText: payload.variant === "correct" ? (payload.sentenceWithError ?? payload.prompt) : payload.prompt,
      modelAnswer: payload.modelAnswer,
      conditions: payload.conditions,
      transformType: payload.transformType,
      rubric: payload.rubric,
      academyId: input.academyId,
    }),
    AI_GRADE_TIMEOUT_MS,
  );

  if (!ai) {
    return {
      isCorrect: false,
      scoreEarned: 0,
      scoreMax,
      explanation: "AI 채점이 잠시 지연되고 있어요. '다시 풀기'로 한 번 더 제출하면 채점됩니다.",
      ruleResolved: false,
      degraded: true,
    };
  }

  return aiToOutcome(payload, scoreMax, ai);
}
