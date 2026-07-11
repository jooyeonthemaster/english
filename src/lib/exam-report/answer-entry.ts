// ============================================================================
// 학생 시험 리포트 — 답안 링크(/a/[token]) 답안지 조립·제출 병합 (순수 모듈)
//
// 계약: 이 모듈의 모든 함수는 부수효과가 없어야 한다(순수). DB·네트워크·시간 의존 금지.
// 보안 1순위: buildAnswerSheet 산출물에는 correctAnswer/answerConfidence 를
// 필드 자체로 만들지 않는다(화이트리스트 방식 — 학생 공개면 정답 누출 원천 차단).
// 최고 불변식: reviewed:true(강사 확정) 행은 applyAnswerSubmission 이 절대 건드리지 않는다.
// ============================================================================

import { deriveStatusFromChoice, normalizeResponses } from "./grading";
import type { ExamMap, ExamQuestionKind, StudentResponse } from "./types";

/** 학생 공개용 답안지 문항 1개 — 정답 계열 필드는 타입 차원에서 존재하지 않는다. */
export interface AnswerSheetQuestion {
  number: string;
  order: number;
  kind: ExamQuestionKind;
  points: number | null;
  typeLabel: string;
  brief: string;
}

/** 학생 제출 항목 1개 — MC 는 choice("1".."5"), 서답형은 text 를 사용한다. */
export interface AnswerSheetEntryInput {
  number: string;
  choice?: string;
  text?: string;
}

/** MC 유효 선지 토큰 — 라우트 zod 와 동일 규칙(방어적 이중 검증). */
const CHOICE_RE = /^[1-5]$/;
/** 서답형 학생 답 원문 길이 캡(저장본 비대 방지). */
const STUDENT_ANSWER_MAX_LEN = 500;

/** examMap↔responses 조인 키 — 공백 제거(계약 §1.6, route-helpers.numberKey 와 동일 규칙).
 *  라우트 _lib 를 lib 계층에서 import 하지 않기 위해 로컬로 정의한다. */
function numberKey(value: string): string {
  return value.replace(/\s+/g, "");
}

/**
 * examMap → 학생 공개용 답안지 구조. order 오름차순.
 * correctAnswer/answerConfidence 는 구조적으로 제거된다(필드 화이트리스트 —
 * 스프레드/omit 방식은 새 정답 필드 추가 시 누출되므로 금지).
 */
export function buildAnswerSheet(examMap: ExamMap): AnswerSheetQuestion[] {
  return [...examMap.questions]
    .sort((a, b) => a.order - b.order)
    .map((q) => ({
      number: q.number,
      order: q.order,
      kind: q.kind,
      points: q.points,
      typeLabel: q.typeLabel,
      brief: q.brief,
    }));
}

/**
 * 학생 제출을 기존 응답에 병합한다 — normalizeResponses(examMap, existing) 베이스.
 * - reviewed:true(강사 확정) 행은 절대 불변 → skippedReviewed 에 number 수집.
 * - MC: choice 가 "1".."5" 면 chosenChoice 설정. examMap correctAnswer 있으면
 *   deriveStatusFromChoice 로 status 파생, 없으면 UNKNOWN. 기존 aiRead/note 보존.
 * - SHORT/ESSAY: text(trim, 500자 캡) → studentAnswer. status 는 UNKNOWN(강사 판정 재료 —
 *   자동채점 금지). status 를 UNKNOWN 으로 리셋하므로 earnedPoints 도 함께 초기화한다
 *   (새 제출이 이전 부분점수를 무효화 — 확정 행은 위 불변식으로 이미 보호됨).
 * - choice/text 둘 다 빈 entry, examMap 에 없는 number 는 스킵(행 불변).
 * - 적용 행은 { source:"MANUAL", reviewed:false } — 정오표에서 '학생 제출' 하이라이트 재료.
 * - missing: 전 문항 기입 강제(유저 결정 2) 재료 — 이번 제출에 유형별 유효 entry
 *   (MC="1".."5", 서답형=비공백 text)가 없는 문항 번호를 order 순으로 수집한다.
 *   reviewed 스킵 행도 유효 entry 였다면 기입으로 인정(학생이 채울 수 없는 값이 아님).
 *   라우트는 missing 이 비어있지 않으면 저장 없이 400 으로 거절한다(클라 우회 방지).
 */
export function applyAnswerSubmission(opts: {
  examMap: ExamMap;
  existing: StudentResponse[] | null;
  entries: AnswerSheetEntryInput[];
}): {
  responses: StudentResponse[];
  applied: number;
  skippedReviewed: string[];
  missing: string[];
} {
  const { examMap, existing, entries } = opts;

  const base = normalizeResponses(examMap, existing);
  const questionByKey = new Map(examMap.questions.map((q) => [numberKey(q.number), q]));
  const indexByKey = new Map(base.map((r, i) => [numberKey(r.number), i] as const));

  const responses = [...base];
  const skippedReviewed: string[] = [];
  /** 유형별 형식을 충족한 entry 가 커버한 문항 키 — missing 산출 재료. */
  const coveredKeys = new Set<string>();
  let applied = 0;

  for (const entry of entries) {
    const key = numberKey(String(entry?.number ?? ""));
    if (key.length === 0) continue;
    const question = questionByKey.get(key);
    const idx = indexByKey.get(key);
    // examMap 에 없는 번호는 스킵(발명 금지).
    if (!question || idx == null) continue;

    const choice = typeof entry.choice === "string" ? entry.choice.trim() : "";
    const text = typeof entry.text === "string" ? entry.text.trim() : "";
    const isMc = question.kind === "MC";
    // 빈 entry 는 스킵 — 기존 행을 건드리지 않는다(미입력=미제출, 삭제 의미 아님).
    if (isMc ? !CHOICE_RE.test(choice) : text.length === 0) continue;
    // 형식 유효 entry — reviewed 스킵 여부와 무관하게 '기입됨'으로 인정한다.
    coveredKeys.add(key);

    const prior = responses[idx];
    // 최고 불변식: 강사 확정 행은 학생 제출로 절대 덮지 않는다.
    if (prior.reviewed) {
      if (!skippedReviewed.includes(question.number)) skippedReviewed.push(question.number);
      continue;
    }

    // 보존 필드(강사 메모·AI 판독 원자료)만 승계 — status/점수 계열은 새로 구성.
    const preserved: Pick<StudentResponse, "note" | "aiRead"> = {};
    if (prior.note != null) preserved.note = prior.note;
    if (prior.aiRead != null) preserved.aiRead = prior.aiRead;

    if (isMc) {
      responses[idx] = {
        number: question.number,
        status: question.correctAnswer ? deriveStatusFromChoice(question, choice) : "UNKNOWN",
        chosenChoice: choice,
        ...preserved,
        source: "MANUAL",
        reviewed: false,
      };
    } else {
      responses[idx] = {
        number: question.number,
        status: "UNKNOWN",
        studentAnswer: text.slice(0, STUDENT_ANSWER_MAX_LEN),
        ...preserved,
        source: "MANUAL",
        reviewed: false,
      };
    }
    applied += 1;
  }

  // 전 문항 기입 검증 — 유효 entry 가 커버하지 않은 문항을 order 순으로 수집.
  const missing = [...examMap.questions]
    .sort((a, b) => a.order - b.order)
    .filter((q) => !coveredKeys.has(numberKey(q.number)))
    .map((q) => q.number);

  return { responses, applied, skippedReviewed, missing };
}
