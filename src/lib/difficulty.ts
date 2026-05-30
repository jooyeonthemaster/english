// ─── Question difficulty (난이도) — single source of truth ──────────────
//
// Unified palette across every surface that shows a 기본/중급/킬러 badge
// (generation panel, generation results, 문제관리, exam papers, admin, …):
//   기본  BASIC        → 파랑 (blue)
//   중급  INTERMEDIATE → 노랑 (amber)
//   킬러  KILLER       → 빨강 (red)
//
// Prefer importing from here instead of re-declaring difficulty colors.

export type QuestionDifficulty = "BASIC" | "INTERMEDIATE" | "KILLER";

export const QUESTION_DIFFICULTY_LABELS: Record<string, string> = {
  BASIC: "기본",
  INTERMEDIATE: "중급",
  KILLER: "킬러",
};

/** Outline badge style — light fill + text + border. Use for chips/pills. */
export const QUESTION_DIFFICULTY_BADGE: Record<string, string> = {
  BASIC: "bg-blue-50 text-blue-700 border-blue-200",
  INTERMEDIATE: "bg-amber-50 text-amber-700 border-amber-200",
  KILLER: "bg-red-50 text-red-700 border-red-200",
};

/** Solid-ish style — slightly stronger fill, no border. */
export const QUESTION_DIFFICULTY_SOLID: Record<string, string> = {
  BASIC: "bg-blue-100 text-blue-700",
  INTERMEDIATE: "bg-amber-100 text-amber-700",
  KILLER: "bg-red-100 text-red-700",
};

export function getQuestionDifficultyLabel(value?: string | null): string {
  if (!value) return "";
  return QUESTION_DIFFICULTY_LABELS[value] ?? value;
}

/** Outline badge className for a difficulty value (falls back to neutral). */
export function getQuestionDifficultyBadge(value?: string | null): string {
  if (!value) return "bg-slate-50 text-slate-500 border-slate-200";
  return (
    QUESTION_DIFFICULTY_BADGE[value] ??
    "bg-slate-50 text-slate-500 border-slate-200"
  );
}
