// ============================================================================
// Tutor Rule Grading — form별 결정적 채점 (근본원인 2 해결)
// ----------------------------------------------------------------------------
// 기존 isTextCorrect(8자 부분문자열 OR 토큰 55% 겹침)를 폐기하고, form별로
// 인덱스/시퀀스/정규화 완전일치로 채점한다. React/서버 의존성이 없는 순수 함수라
// 학생 플레이어·디렉터 에뮬레이터가 동일 채점을 재현한다. (스펙 §4.2)
// AI 채점이 필요한 TEXT(ai/hybrid)는 needsAi=true로 표시하고 router가 처리한다.
// ============================================================================

import {
  normalizeForCompare,
  type TutorActivityPayload,
} from "@/lib/tutor/activity-payload-schema";

export interface TutorGradeResult {
  isCorrect: boolean;
  scoreEarned: number;
  scoreMax: number;
  explanation: string;
  /** TEXT ai/hybrid에서 rule로 확정 못해 AI 채점이 필요함을 router에 알린다. */
  needsAi?: boolean;
  /** rule 단계에서 정/오답이 확정되었는지(부분점수 포함). */
  ruleResolved: boolean;
}

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function explanationOf(payload: TutorActivityPayload, fallback: string): string {
  const explicit = (payload as { explanation?: unknown }).explanation;
  return typeof explicit === "string" && explicit.trim() ? explicit : fallback;
}

function result(
  payload: TutorActivityPayload,
  scoreMax: number,
  isCorrect: boolean,
  scoreEarned: number,
  fallback: string,
): TutorGradeResult {
  return {
    isCorrect,
    scoreEarned: Math.max(0, Math.min(scoreMax, Math.round(scoreEarned))),
    scoreMax,
    explanation: explanationOf(payload, fallback),
    ruleResolved: true,
  };
}

// ── CHOICE ───────────────────────────────────────────────────────────────────
function gradeChoice(payload: Extract<TutorActivityPayload, { form: "CHOICE" }>, response: unknown, scoreMax: number) {
  const record = asRecord(response);
  const selected = Number(record.selectedIndex ?? record.index ?? response);
  const isCorrect = Number.isInteger(selected) && selected === payload.correctIndex;
  return result(payload, scoreMax, isCorrect, isCorrect ? scoreMax : 0, "선택한 답과 지문 근거를 다시 연결해 보세요.");
}

// ── CHIP (순서 시퀀스 — 어순/순서가 정답의 본질) ──────────────────────────────
function gradeChip(payload: Extract<TutorActivityPayload, { form: "CHIP" }>, response: unknown, scoreMax: number) {
  const record = asRecord(response);
  const submitted = Array.isArray(record.order)
    ? record.order.map(Number)
    : Array.isArray(response)
      ? (response as unknown[]).map(Number)
      : [];
  const expected = payload.correctOrder;
  const lengthOk = submitted.length === expected.length;
  const matchCount = expected.filter((id, index) => submitted[index] === id).length;
  const isCorrect = lengthOk && matchCount === expected.length;
  // 부분점수: 위치 정확도. 아무 순서나 눌러도 통과하던 회귀를 차단한다.
  const scoreEarned = isCorrect ? scoreMax : Math.floor((matchCount / expected.length) * scoreMax * 0.5);
  return result(payload, scoreMax, isCorrect, scoreEarned, "원문 어순/논리 흐름 순서를 다시 확인해 보세요.");
}

// ── MATCH ──────────────────────────────────────────────────────────────────────
function gradeMatch(payload: Extract<TutorActivityPayload, { form: "MATCH" }>, response: unknown, scoreMax: number) {
  const record = asRecord(response);
  const submitted = asRecord(record.matches ?? record.pairs);
  const total = payload.pairs.length;
  const correctCount = payload.pairs.filter(
    (pair) => normalizeForCompare(String(submitted[pair.left] ?? "")) === normalizeForCompare(pair.right),
  ).length;
  const isCorrect = correctCount === total;
  return result(
    payload,
    scoreMax,
    isCorrect,
    (correctCount / total) * scoreMax,
    `총 ${total}개 중 ${correctCount}개를 정확히 연결했어요.`,
  );
}

// ── SPAN (원문 토큰 구간 탭) — 인덱스 정확 비교 ───────────────────────────────
function gradeSpan(payload: Extract<TutorActivityPayload, { form: "SPAN" }>, response: unknown, scoreMax: number) {
  const record = asRecord(response);
  const span = Array.isArray(record.span) ? record.span.map(Number) : [];
  const [start, end] = payload.correctSpan;
  const isCorrect = span.length === 2 && span[0] === start && span[1] === end;
  return result(payload, scoreMax, isCorrect, isCorrect ? scoreMax : 0, "어법 오류가 있는 정확한 구간을 다시 짚어 보세요.");
}

// ── TEXT ─────────────────────────────────────────────────────────────────────
function acceptedSet(payload: Extract<TutorActivityPayload, { form: "TEXT" }>): string[] {
  const candidates = [...(payload.acceptedAnswers ?? []), payload.modelAnswer].filter(
    (value): value is string => typeof value === "string" && value.trim().length > 0,
  );
  return candidates.map(normalizeForCompare).filter(Boolean);
}

function textExactMatch(submittedRaw: string, payload: Extract<TutorActivityPayload, { form: "TEXT" }>): boolean {
  const submitted = normalizeForCompare(submittedRaw);
  if (!submitted) return false;
  return acceptedSet(payload).includes(submitted);
}

function gradeText(
  payload: Extract<TutorActivityPayload, { form: "TEXT" }>,
  response: unknown,
  scoreMax: number,
): TutorGradeResult {
  const record = asRecord(response);
  const submitted = String(record.answer ?? record.text ?? record.value ?? response ?? "");

  if (payload.gradeMode === "rule_exact") {
    const isCorrect = textExactMatch(submitted, payload);
    return result(payload, scoreMax, isCorrect, isCorrect ? scoreMax : 0, "철자/표현을 원문과 정확히 맞춰 보세요.");
  }

  // hybrid: rule 완전일치면 즉시 정답 확정, 아니면 AI 채점으로 위임.
  if (payload.gradeMode === "hybrid" && textExactMatch(submitted, payload)) {
    return result(payload, scoreMax, true, scoreMax, explanationOf(payload, "정답입니다."));
  }

  // ai / hybrid(미확정): AI 채점 필요. router가 Gemini로 처리.
  return {
    isCorrect: false,
    scoreEarned: 0,
    scoreMax,
    explanation: explanationOf(payload, "AI 채점이 필요한 서술형 답안입니다."),
    needsAi: true,
    ruleResolved: false,
  };
}

// ── 디스패처 ─────────────────────────────────────────────────────────────────
export function gradeRule(payload: TutorActivityPayload, response: unknown, rawScoreMax: number): TutorGradeResult {
  const scoreMax = Math.max(1, Math.round(rawScoreMax));
  switch (payload.form) {
    case "CHOICE":
      return gradeChoice(payload, response, scoreMax);
    case "CHIP":
      return gradeChip(payload, response, scoreMax);
    case "MATCH":
      return gradeMatch(payload, response, scoreMax);
    case "SPAN":
      return gradeSpan(payload, response, scoreMax);
    case "TEXT":
      return gradeText(payload, response, scoreMax);
    default: {
      const _exhaustive: never = payload;
      return {
        isCorrect: false,
        scoreEarned: 0,
        scoreMax,
        explanation: "채점 기준을 확인할 수 없는 활동입니다.",
        ruleResolved: false,
      };
    }
  }
}
