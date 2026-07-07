// ============================================================================
// 학생 시험 리포트 — 숫자 표시 포맷 (전 표시 지점 의무 사용)
//
// 계산은 grading.ts round2 가 단일 수리처지만, round2 도입 전 저장된 레거시 문서와
// 강사 수기 입력값(classAverage 등)은 89.6999… 같은 부동소수점 잔여를 그대로 들고
// 있다 — 표시층에서 한 번 더 확정해 "어떤 문서든 깨끗한 숫자"를 보장한다.
// 하드코딩 toFixed 금지: 후행 0(89.70)을 남기지 않는다.
// ============================================================================

/** round2 + 후행 0 제거. null/undefined/NaN/Infinity → "—". */
export function formatReportNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  // round2 와 동일 수식(표시층 재적용) — 89.6999… → 89.7, 6.300000000000001 → 6.3
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  // Number → string 변환이 후행 0 을 자동 제거한다(89.7, 90).
  return String(rounded);
}

/** 점수 텍스트 — max 있으면 "89.7 / 100", 없으면 "89.7점". 점수 부재 시 "—". */
export function formatScoreText(
  score: number | null | undefined,
  max?: number | null,
): string {
  const s = formatReportNumber(score);
  if (max == null) return s === "—" ? "—" : `${s}점`;
  return `${s} / ${formatReportNumber(max)}`;
}

/** 백분율 텍스트 — "89.7%". 값 부재 시 "—". */
export function formatPercentText(value: number | null | undefined): string {
  const s = formatReportNumber(value);
  return s === "—" ? "—" : `${s}%`;
}
