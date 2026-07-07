// ============================================================================
// 학생 시험 리포트 v3 — 정오표(verdict) 공용(순수) 헬퍼·계약
//
// 순수 모듈(부수효과·JSX 없음). verdict-board / use-verdict-state /
// report-step 이 공유하는 불변 업데이트·표시 상수를 모은다. 채점 판정 자체는
// grading.ts(spine)의 순수함수(computeScoreSummary 등)를 신뢰해 사용한다.
// v2 의 OMR/시험지뷰/자동채점 도메인은 폐기됐다(read 프리필 + 강사 확정으로 대체).
// ============================================================================

import { deriveStatusFromChoice } from "@/lib/exam-report/grading";
import type {
  ExamMap,
  ExamMapEntry,
  ResponseStatus,
  StudentResponse,
} from "@/lib/exam-report/types";

// ── 상태 표시 상수 ──────────────────────────────────────────────────────────

export interface StatusStyle {
  label: string;
  /** 버튼/셀 기호 */
  symbol: string;
  text: string;
  bg: string;
  ring: string;
  dot: string;
  /** 선택된(active) 버튼 솔리드 배경 */
  solid: string;
}

/** 정답 emerald · 오답 rose · 부분 blue · 미상 slate-300 (주황/앰버 금지). */
export const STATUS_STYLE: Record<ResponseStatus, StatusStyle> = {
  CORRECT: {
    label: "정답",
    symbol: "○",
    text: "text-emerald-600",
    bg: "bg-emerald-50",
    ring: "ring-emerald-500",
    dot: "bg-emerald-500",
    solid: "bg-emerald-600 text-white",
  },
  WRONG: {
    label: "오답",
    symbol: "✕",
    text: "text-rose-600",
    bg: "bg-rose-50",
    ring: "ring-rose-500",
    dot: "bg-rose-500",
    solid: "bg-rose-500 text-white",
  },
  PARTIAL: {
    label: "부분",
    symbol: "△",
    text: "text-blue-700",
    bg: "bg-blue-50",
    ring: "ring-blue-500",
    dot: "bg-blue-500",
    solid: "bg-blue-600 text-white",
  },
  UNKNOWN: {
    label: "미상",
    symbol: "·",
    text: "text-slate-400",
    bg: "bg-white",
    ring: "ring-slate-300",
    dot: "bg-slate-300",
    solid: "bg-slate-400 text-white",
  },
};

/** 정오 토글 노출 순서(정답→오답→부분→미상). */
export const VERDICT_ORDER: ResponseStatus[] = ["CORRECT", "WRONG", "PARTIAL", "UNKNOWN"];

export const KIND_LABEL: Record<ExamMapEntry["kind"], string> = {
  MC: "객관식",
  SHORT: "단답형",
  ESSAY: "서술형",
};

/** 원형숫자 라벨(①~⑳). 범위를 넘으면 (n) 폴백. */
export function circledOrdinal(index0: number): string {
  const CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";
  return index0 >= 0 && index0 < CIRCLED.length ? CIRCLED[index0] : `(${index0 + 1})`;
}

/** MC 선지 토큰("1".."5")을 원형숫자로. 파싱 실패 시 원문 그대로. */
export function choiceToCircled(value: string | null | undefined): string {
  if (value == null || value === "") return "";
  const n = Number(String(value).trim());
  if (Number.isInteger(n) && n >= 1 && n <= 20) return circledOrdinal(n - 1);
  return String(value);
}

// ── 구조·응답 조작(불변) ────────────────────────────────────────────────────

export function orderedQuestions(structure: ExamMap): ExamMapEntry[] {
  return [...structure.questions].sort((a, b) => a.order - b.order);
}

/** 문항 번호 정규화 키(공백 제거) — 행 id·점프·매핑 드리프트("서답형 4"/"서답형4") 방지. */
export function numberKey(value: string): string {
  return value.replace(/\s+/g, "");
}

export function questionByNumber(structure: ExamMap): Map<string, ExamMapEntry> {
  return new Map(structure.questions.map((q) => [q.number, q]));
}

/** number 로 하나만 교체(불변). 없는 number 는 무시. */
function patch(
  responses: StudentResponse[],
  number: string,
  next: (prev: StudentResponse) => StudentResponse,
): StudentResponse[] {
  return responses.map((r) => (r.number === number ? next(r) : r));
}

/** 정오 토글 직접 입력 — 강사 확정이므로 MANUAL·reviewed. aiRead/chosenChoice 는 보존. */
export function markStatus(
  responses: StudentResponse[],
  number: string,
  status: ResponseStatus,
): StudentResponse[] {
  return patch(responses, number, (prev) => ({
    ...prev,
    status,
    earnedPoints: status === "PARTIAL" ? prev.earnedPoints : undefined,
    source: "MANUAL",
    reviewed: true,
  }));
}

/** △ 부분점수 입력 — status PARTIAL 로 고정하고 earnedPoints 갱신. */
export function markPartial(
  responses: StudentResponse[],
  number: string,
  earnedPoints: number | null,
): StudentResponse[] {
  return patch(responses, number, (prev) => ({
    ...prev,
    status: "PARTIAL",
    earnedPoints: earnedPoints == null ? undefined : earnedPoints,
    source: "MANUAL",
    reviewed: true,
  }));
}

/** 미상으로 리셋(점수 제거). aiRead 판독 원자료·학생 제출 답 원문은 참고용으로 보존. */
export function resetResponse(
  responses: StudentResponse[],
  number: string,
): StudentResponse[] {
  return patch(responses, number, (prev) => ({
    number: prev.number,
    status: "UNKNOWN",
    aiRead: prev.aiRead,
    chosenChoice: prev.chosenChoice,
    studentAnswer: prev.studentAnswer,
    source: "MANUAL",
    reviewed: true,
  }));
}

/** MC 선지 직접 입력(강사) — chosenChoice 설정 + 정답 대조로 정오 자동 파생.
 *  examMap 에 correctAnswer 가 아직 없으면 UNKNOWN 유지(deriveStatusFromChoice 계약).
 *  강사 입력이므로 MANUAL·reviewed:true — 학생 링크 제출분(reviewed:false)과의
 *  구분이 정오표 '학생 제출' 뱃지의 근거다. */
export function markChoice(
  responses: StudentResponse[],
  structure: ExamMap,
  number: string,
  choice: string,
): StudentResponse[] {
  const question = structure.questions.find((q) => q.number === number);
  return patch(responses, number, (prev) => {
    const status = question ? deriveStatusFromChoice(question, choice) : prev.status;
    return {
      ...prev,
      chosenChoice: choice,
      status,
      // 파생 status 는 PARTIAL 이 될 수 없으므로 부분점수는 항상 정리한다.
      earnedPoints: status === "PARTIAL" ? prev.earnedPoints : undefined,
      source: "MANUAL",
      reviewed: true,
    };
  });
}

/** 여러 번호를 특정 status 로 일괄. */
export function markMany(
  responses: StudentResponse[],
  numbers: Iterable<string>,
  status: ResponseStatus,
): StudentResponse[] {
  const set = new Set(numbers);
  return responses.map((r) =>
    set.has(r.number)
      ? {
          ...r,
          status,
          earnedPoints: status === "PARTIAL" ? r.earnedPoints : undefined,
          source: "MANUAL" as const,
          reviewed: true,
        }
      : r,
  );
}

// ── 파생 지표 ───────────────────────────────────────────────────────────────

/** AI 판독 미확정(source AUTO && !reviewed) 여부 — '미확정' 카운트의 소스오브트루스. */
export function isAutoUnreviewed(r: StudentResponse): boolean {
  return r.source === "AUTO" && !r.reviewed;
}

export function unknownCountOf(responses: StudentResponse[]): number {
  return responses.filter((r) => r.status === "UNKNOWN").length;
}

export function autoUnreviewedCountOf(responses: StudentResponse[]): number {
  return responses.filter(isAutoUnreviewed).length;
}

/** 학생 답안 링크(/a) 제출분 — MANUAL·미검수인데 실제 답 데이터가 있는 행.
 *  normalizeResponses 의 발명행(MANUAL·미검수·데이터 없음)과 구분된다.
 *  정오표에서 파랑 하이라이트 + '학생 제출' 뱃지로 강사 확인을 유도하는 근거. */
export function isStudentSubmitted(r: StudentResponse): boolean {
  return (
    r.source === "MANUAL" &&
    !r.reviewed &&
    ((r.chosenChoice != null && r.chosenChoice !== "") ||
      (r.studentAnswer != null && r.studentAnswer !== ""))
  );
}

export function studentSubmittedCountOf(responses: StudentResponse[]): number {
  return responses.filter(isStudentSubmitted).length;
}

/** WRONG MC 문항의 chosenChoice 입력 진행률(dataLevel 인디케이터용). */
export function choiceCoverage(
  structure: ExamMap,
  responses: StudentResponse[],
): { entered: number; total: number } {
  const kind = new Map(structure.questions.map((q) => [q.number, q.kind]));
  const wrongMc = responses.filter(
    (r) => r.status === "WRONG" && kind.get(r.number) === "MC",
  );
  const entered = wrongMc.filter(
    (r) => r.chosenChoice != null && r.chosenChoice !== "",
  ).length;
  return { entered, total: wrongMc.length };
}

// ── 라우팅 프리픽스(/director|/teacher 유지) ────────────────────────────────

export function examReportBasePrefix(pathname: string): string {
  const idx = pathname.indexOf("/workbench/exam-report");
  return idx >= 0 ? pathname.slice(0, idx) : "/director";
}
