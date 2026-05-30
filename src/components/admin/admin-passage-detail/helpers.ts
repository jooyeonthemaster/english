// Shared helpers and label/color constants for admin passage detail UI.

export function parseJSON<T>(str: unknown, fallback: T): T {
  if (!str) return fallback;
  if (typeof str !== "string") return fallback;
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

export const DIFFICULTY_LABELS: Record<string, string> = {
  BASIC: "기본",
  INTERMEDIATE: "중급",
  KILLER: "킬러",
  basic: "기본",
  intermediate: "중급",
  advanced: "고급",
};

export const DIFFICULTY_COLORS: Record<string, string> = {
  BASIC: "bg-blue-50 text-blue-700 border-blue-200",
  INTERMEDIATE: "bg-amber-50 text-amber-700 border-amber-200",
  KILLER: "bg-red-50 text-red-700 border-red-200",
  basic: "bg-blue-50 text-blue-700 border-blue-200",
  intermediate: "bg-amber-50 text-amber-700 border-amber-200",
  advanced: "bg-red-50 text-red-700 border-red-200",
};

export const NOTE_TYPE_LABELS: Record<string, string> = {
  EMPHASIS: "강조",
  GRAMMAR: "문법",
  VOCAB: "어휘",
  TIP: "팁",
};
