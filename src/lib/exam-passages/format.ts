// 기출 지문 표시·라벨 유틸 — 순수 함수만(클라이언트/서버 공용, 코퍼스 미import).

import type { ExamPassage, ExamPassagePick } from "./types";

/** 시험 회차 → 사람이 읽는 라벨. */
export function examLabel(exam: string): string {
  switch (exam) {
    case "수능":
      return "수능";
    case "6월":
      return "6월 모평";
    case "9월":
      return "9월 모평";
    case "예비":
      return "예비시행";
    default:
      return exam;
  }
}

/** 시험 회차 → 짧은 칩 라벨(카드 배지용). */
export function examShortLabel(exam: string): string {
  switch (exam) {
    case "수능":
      return "수능";
    case "6월":
      return "6월";
    case "9월":
      return "9월";
    case "예비":
      return "예비";
    default:
      return exam;
  }
}

/** 문항번호 배열 → "31" 또는 "41-42". */
export function qLabel(qNumbers: number[]): string {
  if (!qNumbers || qNumbers.length === 0) return "";
  if (qNumbers.length === 1) return String(qNumbers[0]);
  const sorted = [...qNumbers].sort((a, b) => a - b);
  return `${sorted[0]}-${sorted[sorted.length - 1]}`;
}

/** 복원 종류 → 한국어 라벨. */
export function reconLabel(kind: string): string {
  switch (kind) {
    case "blank":
      return "빈칸 복원";
    case "order":
      return "순서 복원";
    case "insertion":
      return "삽입 복원";
    case "irrelevant":
      return "무관문장 제거";
    case "grammar_error":
      return "어법(교정형)";
    case "vocab_error":
      return "어휘(원문)";
    case "none":
    default:
      return "원문 그대로";
  }
}

/** 복원 종류 → true면 본문이 정답 기반으로 재구성됨(원문 그대로가 아님). */
export function isReconstructed(kind: string): boolean {
  return kind !== "none" && kind !== "vocab_error";
}

/**
 * 지문 제목 — "2024학년도 수능 영어 31번 · 빈칸추론".
 * 내 지문함/입력 스택에 등록될 때 쓰는 사람이 읽는 제목.
 */
export function formatExamTitle(p: {
  year: number;
  exam: string;
  qNumbers: number[];
  type: string;
  form?: string;
  grade?: string;
  board?: string;
}): string {
  const q = qLabel(p.qNumbers);
  const formTag = p.form ? ` ${p.form}형` : "";
  const qPart = q ? ` ${q}번` : "";
  // 장문 유형은 type 자체가 "장문(41-42)" 처럼 범위를 품어 q번과 중복되므로 괄호 범위 제거.
  const typeText = p.type.replace(/\s*\([^)]*\)\s*$/, "");
  // 교육청 학평은 학년이 핵심이라 앞에 붙인다(수능·모평은 고3 자명 → 생략).
  const gradeTag = p.board === "학력평가" && p.grade ? `${p.grade} ` : "";
  return `${p.year}학년도 ${gradeTag}${examLabel(p.exam)}${formTag} 영어${qPart} · ${typeText}`;
}

/** ExamPassage → 호스트가 받는 pick(제목 부여 + 본문). */
export function toExamPick(p: ExamPassage): ExamPassagePick {
  return {
    id: p.id,
    title: formatExamTitle(p),
    content: p.text ?? "",
    year: p.year,
    exam: p.exam,
    type: p.type,
    typeGroup: p.typeGroup,
    reconstructionKind: p.reconstructionKind,
  };
}

/**
 * 묶음 유형 → 배지 색 클래스(text/bg/border).
 * 피드백 규칙 준수: 주황/앰버 절대 금지. 청·슬레이트·바이올렛·에메랄드 계열만.
 */
export function typeBadgeClass(typeGroup: string): string {
  switch (typeGroup) {
    case "빈칸추론":
      return "text-blue-700 bg-blue-50 border-blue-200";
    case "글의순서":
      return "text-indigo-700 bg-indigo-50 border-indigo-200";
    case "문장삽입":
      return "text-violet-700 bg-violet-50 border-violet-200";
    case "무관한문장":
      return "text-rose-700 bg-rose-50 border-rose-200";
    case "어법":
      return "text-fuchsia-700 bg-fuchsia-50 border-fuchsia-200";
    case "어휘":
      return "text-cyan-700 bg-cyan-50 border-cyan-200";
    case "요약문":
      return "text-teal-700 bg-teal-50 border-teal-200";
    case "장문":
      return "text-sky-700 bg-sky-50 border-sky-200";
    case "내용일치":
      return "text-emerald-700 bg-emerald-50 border-emerald-200";
    default:
      // 주장/요지/주제/제목/함축의미/지칭 등 일반 독해.
      return "text-slate-700 bg-slate-100 border-slate-200";
  }
}

/** 학년 → 카드 배지 색(주황/앰버 금지, 한색 계열). */
export function gradeBadgeClass(grade: string | undefined): string {
  switch (grade) {
    case "고1":
      return "text-emerald-700 bg-emerald-50 border-emerald-200";
    case "고2":
      return "text-sky-700 bg-sky-50 border-sky-200";
    case "고3":
    default:
      return "text-slate-700 bg-slate-100 border-slate-200";
  }
}

/** 시대(era) → 짧은 한국어. */
export function eraLabel(era: string): string {
  switch (era) {
    case "modern":
      return "2015 개정~";
    case "ab2014":
      return "2014 A/B형";
    case "foreign_pdf":
      return "구 외국어영역";
    case "foreign_old":
      return "구 외국어영역(초기)";
    default:
      return era;
  }
}
