// 수능완성 지문 분석 표시·라벨 유틸 — 순수 함수만(클라이언트/서버 공용).

import type { SwLinkStrength, SwRelationType } from "./types";

/** 연계 강도 → 배지 색. 주황/앰버 금지. */
export function strengthBadgeClass(s: SwLinkStrength): string {
  switch (s) {
    case "강":
      return "text-white bg-blue-600 border-blue-600";
    case "중":
      return "text-sky-700 bg-sky-50 border-sky-300";
    case "약":
    default:
      return "text-slate-500 bg-slate-50 border-slate-200";
  }
}

/** 연계 강도 → 설명(툴팁). */
export function strengthHint(s: SwLinkStrength): string {
  switch (s) {
    case "강":
      return "핵심 개념·제재가 실질적으로 겹쳐 함께 학습하면 곧바로 전이됩니다.";
    case "중":
      return "주제·논지 구조가 유사해 사고 방식을 옮겨 쓸 수 있습니다.";
    case "약":
    default:
      return "배경지식이나 출제 방식 차원에서 느슨하게 연결됩니다.";
  }
}

/** 연계 축 → 칩 색. */
export function relationChipClass(r: SwRelationType): string {
  switch (r) {
    case "주제":
      return "text-blue-700 bg-blue-50 ring-blue-200";
    case "제재":
      return "text-indigo-700 bg-indigo-50 ring-indigo-200";
    case "핵심개념":
      return "text-violet-700 bg-violet-50 ring-violet-200";
    case "논지구조":
      return "text-teal-700 bg-teal-50 ring-teal-200";
    case "배경지식":
      return "text-cyan-700 bg-cyan-50 ring-cyan-200";
    case "출제유형":
      return "text-emerald-700 bg-emerald-50 ring-emerald-200";
    case "관점대립":
      return "text-rose-700 bg-rose-50 ring-rose-200";
    default:
      return "text-slate-600 bg-slate-50 ring-slate-200";
  }
}

/** 연계 축 → 한 줄 설명. */
export function relationHint(r: SwRelationType): string {
  switch (r) {
    case "주제":
      return "두 지문이 같은 핵심 주장·결론을 다룹니다.";
    case "제재":
      return "다루는 소재·대상이 같거나 인접합니다.";
    case "핵심개념":
      return "동일한 학술 개념·용어가 양쪽 지문의 뼈대입니다.";
    case "논지구조":
      return "정의→분류→적용 같은 글의 전개 방식이 닮았습니다.";
    case "배경지식":
      return "같은 배경지식 영역을 전제로 읽어야 합니다.";
    case "출제유형":
      return "〈보기〉 적용 등 문항이 요구하는 사고가 같습니다.";
    case "관점대립":
      return "같은 문제를 두고 상반된 관점을 제시합니다.";
    default:
      return "";
  }
}

/** 세부영역 → 대분류(인문/사회/과학/기술/예술/주제통합/독서). */
export function subGenreRoot(sub: string | null | undefined): string {
  if (!sub) return "기타";
  const m = /^[^(（/·]+/.exec(sub);
  return (m ? m[0] : sub).trim();
}

/** 대분류 → 배지 색. */
export function subGenreBadgeClass(sub: string | null | undefined): string {
  switch (subGenreRoot(sub)) {
    case "인문":
      return "text-violet-700 bg-violet-50 border-violet-200";
    case "사회":
      return "text-blue-700 bg-blue-50 border-blue-200";
    case "과학":
      return "text-teal-700 bg-teal-50 border-teal-200";
    case "기술":
      return "text-indigo-700 bg-indigo-50 border-indigo-200";
    case "예술":
      return "text-rose-700 bg-rose-50 border-rose-200";
    case "주제통합":
      return "text-emerald-700 bg-emerald-50 border-emerald-200";
    case "독서":
      return "text-cyan-700 bg-cyan-50 border-cyan-200";
    default:
      return "text-slate-600 bg-slate-100 border-slate-200";
  }
}

/** 문항 범위 라벨 "[1~3]". */
export function qRangeLabel(qFrom: number, qTo: number): string {
  return qFrom === qTo ? `[${qFrom}]` : `[${qFrom}~${qTo}]`;
}
