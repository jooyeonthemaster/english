// 국어 기출 지문 표시·라벨 유틸 — 순수 함수만(클라이언트/서버 공용).

/** 출처 게시판 → 짧은 출제기관 라벨. */
export function koSourceLabel(board: string): string {
  switch (board) {
    case "대학수학능력시험":
      return "수능";
    case "수능모의평가":
      return "평가원";
    case "학력평가":
      return "교육청";
    default:
      return board;
  }
}

/** 문항번호 범위 → "1" 또는 "1-3". */
export function koQLabel(qFrom: number, qTo: number): string {
  return qFrom === qTo ? String(qFrom) : `${qFrom}-${qTo}`;
}

/**
 * 갈래 → 배지 색 클래스. 주황/앰버 금지 — 한색·바이올렛·에메랄드 계열만.
 */
export function galaeBadgeClass(galae: string): string {
  switch (galae) {
    case "독서":
      return "text-blue-700 bg-blue-50 border-blue-200";
    case "문학":
      return "text-violet-700 bg-violet-50 border-violet-200";
    case "화법":
      return "text-teal-700 bg-teal-50 border-teal-200";
    case "작문":
      return "text-cyan-700 bg-cyan-50 border-cyan-200";
    case "문법":
      return "text-indigo-700 bg-indigo-50 border-indigo-200";
    case "매체":
      return "text-emerald-700 bg-emerald-50 border-emerald-200";
    default:
      return "text-slate-700 bg-slate-100 border-slate-200";
  }
}

/** 난이도 → 배지 색. */
export function difficultyBadgeClass(d: string | null | undefined): string {
  switch (d) {
    case "상":
      return "text-rose-700 bg-rose-50 border-rose-200";
    case "중":
      return "text-sky-700 bg-sky-50 border-sky-200";
    case "하":
      return "text-emerald-700 bg-emerald-50 border-emerald-200";
    default:
      return "text-slate-600 bg-slate-100 border-slate-200";
  }
}

/** 학년 → 배지 색. */
export function koGradeBadgeClass(grade: string | undefined): string {
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
