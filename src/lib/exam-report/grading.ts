// ============================================================================
// 학생 시험 리포트 — 순수 채점 로직 (I/O·AI 무관 결정론 모듈)
//
// 계약: 여기의 모든 함수는 부수효과가 없어야 한다(순수). DB·네트워크·시간 의존 금지.
// 응답 기본값은 UNKNOWN — "미입력=정답" 같은 암묵 규칙 금지(만점 인플레이션 방지, types.ts).
// ============================================================================

import { normalizeChoiceToken } from "./schemas";
import type {
  ExamMap,
  ExamMapEntry,
  ResponseDataLevel,
  ResponseStatus,
  ScoreSummary,
  StudentResponse,
} from "./types";

const ESSAY_KINDS = new Set<ExamMapEntry["kind"]>(["SHORT", "ESSAY"]);
/** WITH_CHOICES 판정 임계 — WRONG MC 문항의 chosenChoice 입력률 (types.ts 계약) */
const CHOICE_COVERAGE_THRESHOLD = 0.7;

/** 소수 배점 합산의 부동소수점 잔여 제거용 2자리 반올림(점수 표시·저장 공통). */
export function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

/** 구조의 전 문항에 대해 number 매칭으로 정렬·보정한 응답 배열을 만든다.
 *  - 누락 문항 → UNKNOWN 기본 응답
 *  - 구조에 없는 응답 → 폐기
 *  결과는 항상 structure.questions 의 order 순서로 정렬된다. */
export function normalizeResponses(
  structure: ExamMap,
  responses: StudentResponse[] | null | undefined,
): StudentResponse[] {
  const byNumber = new Map<string, StudentResponse>();
  for (const r of responses ?? []) {
    if (r && typeof r.number === "string" && r.number.length > 0) {
      byNumber.set(r.number, r);
    }
  }
  const ordered = [...structure.questions].sort((a, b) => a.order - b.order);
  return ordered.map((q) => {
    const existing = byNumber.get(q.number);
    if (existing) return { ...existing, number: q.number };
    // 발명한 누락 문항은 "강사가 판정한 적 없음"이므로 reviewed:false 로 시작한다.
    // reviewed:true 프리필은 판독 병합(mergeReadIntoResponses)이 이 행을 강사 확정으로
    // 오인해 AI 판독 결과를 전량 폐기시키는 크리티컬 결함의 원인이었다. 전체 reviewed:true
    // 강제는 확정 시점(updateStudentGrading gradingConfirmed)에서만 일어난다.
    return {
      number: q.number,
      status: "UNKNOWN" as const,
      source: "MANUAL" as const,
      reviewed: false,
    };
  });
}

/** PARTIAL 응답의 earnedPoints 를 [0, 배점] 으로 클램프한 새 배열을 반환한다(순수).
 *  - 배점(points)이 있으면 [0, points], null 이면 0 이상만 강제.
 *  - PARTIAL 이 아니거나 earnedPoints 미기록이면 원본 유지.
 *  저장 직전(updateStudentGrading)에 적용해 만점 초과·음수 총점을 원천 차단한다. */
export function clampEarnedPoints(
  structure: ExamMap,
  responses: StudentResponse[],
): StudentResponse[] {
  const pointsByNumber = new Map(structure.questions.map((q) => [q.number, q.points]));
  return responses.map((r) => {
    if (r.status !== "PARTIAL" || r.earnedPoints == null) return r;
    const max = pointsByNumber.get(r.number) ?? null;
    const clamped = Math.max(0, max == null ? r.earnedPoints : Math.min(max, r.earnedPoints));
    return clamped === r.earnedPoints ? r : { ...r, earnedPoints: clamped };
  });
}

/** 선지 선택으로부터 정오 상태를 파생한다.
 *  correctAnswer 가 있으면 대조(CORRECT/WRONG), 없으면 UNKNOWN. */
export function deriveStatusFromChoice(
  question: ExamMapEntry,
  chosenChoice: string,
): ResponseStatus {
  const answer = question.correctAnswer;
  if (answer == null || answer === "") return "UNKNOWN";
  const chosenDigit = normalizeChoiceToken(chosenChoice);
  const answerDigit = normalizeChoiceToken(answer);
  if (chosenDigit != null && answerDigit != null) {
    return chosenDigit === answerDigit ? "CORRECT" : "WRONG";
  }
  // 선지 토큰으로 정규화되지 않는 값(단답·서술형 모범답안 등)은 원문 트림 비교로 폴백.
  return String(chosenChoice).trim() === String(answer).trim() ? "CORRECT" : "WRONG";
}

/** 점수 요약을 계산한다. UNKNOWN 은 채점에서 제외.
 *  - totalScore = CORRECT 문항 배점 합 + PARTIAL earnedPoints 합
 *  - 채점된(비-UNKNOWN) 문항 중 배점 null 이 하나라도 있으면 totalScore/maxScore = null
 *    (부분 배점만으로 총점 왜곡 금지 — 카운트는 항상 계산)
 *  - maxScore = 전 문항 배점 존재 시 그 합 / 아니면 structure.totalPoints / 아니면 null */
export function computeScoreSummary(
  structure: ExamMap,
  responses: StudentResponse[] | null | undefined,
  extras?: { classAverage?: number | null; gradeBand?: string | null },
): ScoreSummary {
  const normalized = normalizeResponses(structure, responses);
  const pointsByNumber = new Map(structure.questions.map((q) => [q.number, q.points]));

  let correctCount = 0;
  let wrongCount = 0;
  let partialCount = 0;
  let unknownCount = 0;
  let scoreAcc = 0;
  let gradedHasNullPoints = false;

  for (const r of normalized) {
    const points = pointsByNumber.get(r.number) ?? null;
    switch (r.status) {
      case "CORRECT":
        correctCount += 1;
        if (points == null) gradedHasNullPoints = true;
        else scoreAcc += points;
        break;
      case "WRONG":
        wrongCount += 1;
        if (points == null) gradedHasNullPoints = true;
        break;
      case "PARTIAL":
        partialCount += 1;
        if (points == null) gradedHasNullPoints = true;
        // earnedPoints 를 [0, 배점] 으로 클램프 — 저장본에 만점 초과·음수가 섞여 있어도
        // 학부모 공유 총점이 오염되지 않게 한다(입력 검증을 뚫은 값 방어).
        else scoreAcc += Math.max(0, Math.min(points, r.earnedPoints ?? 0));
        break;
      default:
        unknownCount += 1;
    }
  }

  const allHavePoints =
    structure.questions.length > 0 && structure.questions.every((q) => q.points != null);

  let totalScore: number | null;
  let maxScore: number | null;
  if (gradedHasNullPoints) {
    totalScore = null;
    maxScore = null;
  } else {
    // 소수 배점(3.1 등) 합산의 부동소수점 잔여(6.300000000000001)가 화면·리포트에
    // 그대로 노출되지 않도록 소스에서 2자리 반올림한다(표시처가 아니라 계산처 단일 수리).
    totalScore = round2(scoreAcc);
    maxScore = allHavePoints
      ? round2(structure.questions.reduce((sum, q) => sum + (q.points ?? 0), 0))
      : structure.totalPoints ?? null;
  }

  return {
    totalScore,
    maxScore,
    correctCount,
    wrongCount,
    partialCount,
    unknownCount,
    classAverage: extras?.classAverage ?? null,
    gradeBand: extras?.gradeBand ?? null,
  };
}

/** 서술형(SHORT/ESSAY) 문항에 earnedPoints 가 기록된 응답이 하나라도 있는지. */
function hasEssayEarnedPoints(
  structure: ExamMap,
  responses: StudentResponse[],
): boolean {
  const kindByNumber = new Map(structure.questions.map((q) => [q.number, q.kind]));
  return responses.some(
    (r) =>
      ESSAY_KINDS.has(kindByNumber.get(r.number) ?? "MC") &&
      typeof r.earnedPoints === "number",
  );
}

/** 응답 정보 밀도 등급(리포트 프롬프트에 전달해 "없는 데이터 추정 금지"를 강제).
 *  - WRONG MC 문항 0개면 STATUS_ONLY (과대평가 금지)
 *  - WRONG MC 문항 중 chosenChoice 입력률 ≥ 70% → WITH_CHOICES
 *  - WITH_CHOICES 충족 + (classAverage 입력 또는 서술형 earnedPoints 존재) → RICH */
export function computeDataLevel(
  structure: ExamMap,
  responses: StudentResponse[] | null | undefined,
  extras?: { classAverage?: number | null; hasEssayPoints?: boolean },
): ResponseDataLevel {
  const normalized = normalizeResponses(structure, responses);
  const kindByNumber = new Map(structure.questions.map((q) => [q.number, q.kind]));

  const wrongMc = normalized.filter(
    (r) => r.status === "WRONG" && kindByNumber.get(r.number) === "MC",
  );
  if (wrongMc.length === 0) return "STATUS_ONLY";

  const withChoice = wrongMc.filter(
    (r) => r.chosenChoice != null && r.chosenChoice !== "",
  ).length;
  if (withChoice / wrongMc.length < CHOICE_COVERAGE_THRESHOLD) return "STATUS_ONLY";

  const hasEssayPoints =
    typeof extras?.hasEssayPoints === "boolean"
      ? extras.hasEssayPoints
      : hasEssayEarnedPoints(structure, normalized);
  const hasClassAverage = extras?.classAverage != null;
  if (hasClassAverage || hasEssayPoints) return "RICH";
  return "WITH_CHOICES";
}

/**
 * E2 답안 판독 프리필(read)을 기존 응답(existing)에 병합한다 — 순수 함수.
 * 기준 집합은 read(examMap 전 문항에서 파생한 신선한 판독). 각 문항에 대해:
 * - 기존 응답이 강사 확정(reviewed:true)이면 그 응답을 보존한다(재판독으로 덮지 않음).
 * - 그 외(미확정·없음)면 새 판독 결과로 프리필한다.
 * "미판독=정답" 같은 암묵 승격 금지 — read 는 이미 미판독을 UNKNOWN 으로 담고 있다. */
export function mergeReadIntoResponses(
  existing: StudentResponse[] | null | undefined,
  read: StudentResponse[],
): StudentResponse[] {
  const existingByNumber = new Map<string, StudentResponse>();
  for (const r of existing ?? []) {
    if (r && typeof r.number === "string" && r.number.length > 0) {
      existingByNumber.set(r.number, r);
    }
  }
  return read.map((fresh) => {
    const prior = existingByNumber.get(fresh.number);
    if (prior && prior.reviewed) return prior;
    return fresh;
  });
}

/** examMap↔responses 조인 키 — 공백 제거(계약 §1.6, answer-entry.numberKey 와 동일 규칙). */
function numberKey(value: string): string {
  return value.replace(/\s+/g, "");
}

/**
 * 판독 병합 결과(merged)에 이전 응답(prior)의 studentAnswer 원문을 승계한다 — 순수.
 * 결함 시나리오: 학생이 답안 링크로 서답형 답 원문(studentAnswer)을 제출(reviewed:false
 * MANUAL)한 뒤 E2 판독이 돌면, mergeReadIntoResponses 가 미확정 행을 AUTO 판독행으로
 * 통째 교체하는데 판독행은 studentAnswer 필드를 만들지 않아 학생이 타이핑한 답 원문이
 * DB에서 소실됐다. 계약 W7-3: studentAnswer(학생 입력)와 aiRead.writtenAnswer(판독)는
 * 나란히 대조 표기돼야 하므로 두 데이터는 공존해야 한다.
 * 규칙: merged 행에 studentAnswer 가 없고(prior 동번호 행에는 있으면) 승계.
 *       merged 가 이미 가지면 유지. 그 외 필드는 전부 불변. mergeReadIntoResponses
 *       자체는 기존 테스트 고정 시그니처라 건드리지 않고 후처리로 조합한다. */
export function carryStudentAnswers(
  prior: StudentResponse[] | null | undefined,
  merged: StudentResponse[],
): StudentResponse[] {
  const priorByKey = new Map<string, StudentResponse>();
  for (const r of prior ?? []) {
    if (r && typeof r.number === "string" && r.number.length > 0) {
      priorByKey.set(numberKey(r.number), r);
    }
  }
  if (priorByKey.size === 0) return merged;
  return merged.map((r) => {
    if (r.studentAnswer != null && r.studentAnswer !== "") return r;
    const p = priorByKey.get(numberKey(r.number));
    if (p?.studentAnswer == null || p.studentAnswer === "") return r;
    return { ...r, studentAnswer: p.studentAnswer };
  });
}
