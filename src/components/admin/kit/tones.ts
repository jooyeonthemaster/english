import type { Tone } from "@/lib/admin-labels/tone";

// Tailwind 는 동적 클래스명을 못 잡으므로 색조별 클래스를 표로 고정한다.

/** 뱃지·칩 배경+글자 */
export const TONE_SOFT: Record<Tone, string> = {
  gray: "bg-gray-100 text-gray-600",
  blue: "bg-blue-50 text-blue-700",
  sky: "bg-sky-50 text-sky-700",
  emerald: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-700",
  rose: "bg-rose-50 text-rose-700",
  violet: "bg-violet-50 text-violet-700",
  teal: "bg-teal-50 text-teal-700",
};

/** 통계 카드 아이콘 박스 */
export const TONE_ICON_BOX: Record<Tone, string> = {
  gray: "bg-gray-100 text-gray-600",
  blue: "bg-blue-50 text-blue-600",
  sky: "bg-sky-50 text-sky-600",
  emerald: "bg-emerald-50 text-emerald-600",
  amber: "bg-amber-50 text-amber-600",
  rose: "bg-rose-50 text-rose-600",
  violet: "bg-violet-50 text-violet-600",
  teal: "bg-teal-50 text-teal-600",
};

/** 강조 숫자 글자색(통계 값 등) */
export const TONE_TEXT: Record<Tone, string> = {
  gray: "text-gray-900",
  blue: "text-blue-600",
  sky: "text-sky-600",
  emerald: "text-emerald-600",
  amber: "text-amber-600",
  rose: "text-rose-600",
  violet: "text-violet-600",
  teal: "text-teal-600",
};

/** 점(dot) 표시 */
export const TONE_DOT: Record<Tone, string> = {
  gray: "bg-gray-400",
  blue: "bg-blue-500",
  sky: "bg-sky-500",
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  rose: "bg-rose-500",
  violet: "bg-violet-500",
  teal: "bg-teal-500",
};
