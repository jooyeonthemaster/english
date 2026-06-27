// Split from question-quality.ts — shared helpers in core.ts, public API via index.ts barrel.
import { normalizeDiversityComparable } from "@/lib/question-diversity";
import { QuestionQualitySeverity, normalizeText } from "../core";



// ---------------------------------------------------------------------------
// 다양성 보조: 후보 목록 필터링/로테이션 (반복 생성 시 타깃 수렴 방지)
// ---------------------------------------------------------------------------

export interface CandidateDiversityOptions {
  usedTargets?: string[];
  usedAnswerLabels?: string[];
  usedPointCodes?: string[];
  variantIndex?: number;
  diversityEnabled?: boolean;
  /** 핵심 집중 모드 — 어법 정답 포인트를 고빈출 톱셋(1000제 상위 6)으로 좁힘. */
  pointFocus?: boolean;
}



/** variantIndex 만큼 배열을 회전시켜 병렬 배치의 각 호출이 다른 후보를 먼저 보게 한다. */
export function rotateByVariantIndex<T>(items: T[], variantIndex?: number): T[] {
  if (
    items.length < 2 ||
    typeof variantIndex !== "number" ||
    !Number.isFinite(variantIndex)
  ) {
    return items;
  }
  const offset = Math.max(0, Math.floor(variantIndex)) % items.length;
  if (offset === 0) return items;
  return [...items.slice(offset), ...items.slice(0, offset)];
}



/**
 * 기사용 타깃과 겹치는 후보를 제외한다. 전부 걸러지면 원본을 그대로 반환해
 * 후보 고갈로 생성 자체가 약해지는 것을 막는다 (소프트 강등 — exhausted 로 표시).
 */
export function filterUsedCandidates<T>(
  items: T[],
  usedTargets: string[] | undefined,
  candidateText: (item: T) => string,
): { items: T[]; exhausted: boolean } {
  if (!usedTargets?.length || items.length === 0) {
    return { items, exhausted: false };
  }
  // 문장부호를 무시하는 다양성 정규화 사용 — "common – rare" 같은 쌍 표기와
  // 후보 텍스트("common rare")가 안전하게 비교된다.
  const usedNorms = usedTargets
    .map((target) => normalizeDiversityComparable(target))
    .filter(Boolean);
  if (!usedNorms.length) return { items, exhausted: false };
  const filtered = items.filter((item) => {
    const norm = normalizeDiversityComparable(candidateText(item));
    if (!norm) return true;
    // 공백 패딩으로 토큰 경계를 강제 — 짧은 used 스팬("art")이 무관 후보
    // ("started")를 부분 문자열로 과잉 제외하지 않게 한다.
    const paddedNorm = ` ${norm} `;
    return !usedNorms.some((used) => {
      if (used === norm) return true;
      const paddedUsed = ` ${used} `;
      return paddedUsed.includes(paddedNorm) || paddedNorm.includes(paddedUsed);
    });
  });
  return filtered.length > 0
    ? { items: filtered, exhausted: false }
    : { items, exhausted: true };
}



/**
 * 다양성: 생성물이 기사용 타깃 스팬을 그대로 재사용했는지 검사.
 * diversityUsedTargets 미전달 호출자는 no-op. RELAXED_BLOCKING 미포함 코드라
 * strict 재시도 동안만 다른 타깃을 찾도록 압력을 주고, 타깃 풀이 고갈된
 * 지문에서는 relaxed 폴백이 재사용을 허용한다 (생성 실패로 끝나지 않음).
 */
export function validateDiversityTargetReuse(
  question: Record<string, unknown>,
  typeId: string,
  usedTargets: string[] | undefined,
  add: (severity: QuestionQualitySeverity, code: string, message: string) => void,
) {
  if (!usedTargets?.length) return;
  const targetText =
    typeId === "BLANK_INFERENCE"
      ? normalizeText(question.originalExpression)
      : typeId === "IMPLIED_MEANING"
        ? normalizeText(question.underlinedExpression)
        : "";
  if (!targetText) return;
  const norm = normalizeDiversityComparable(targetText);
  if (!norm) return;
  const reused = usedTargets.some((used) => {
    const usedNorm = normalizeDiversityComparable(used);
    if (!usedNorm) return false;
    return usedNorm === norm || usedNorm.includes(norm) || norm.includes(usedNorm);
  });
  if (reused) {
    add(
      "error",
      "diversity-duplicate-target",
      `Target "${targetText.slice(0, 60)}" duplicates a previously used target for this passage; choose a different span.`,
    );
  }
}



export function buildSurroundingWindow(passage: string, index: number, length: number): string {
  const targetLength = 70;
  let start = Math.max(0, index - Math.floor((targetLength - length) / 2));
  let end = Math.min(passage.length, start + targetLength);

  if (end - start < targetLength) {
    start = Math.max(0, end - targetLength);
  }

  while (start > 0 && /\S/.test(passage[start - 1] ?? "") && /\S/.test(passage[start] ?? "")) {
    start++;
  }
  while (end < passage.length && /\S/.test(passage[end - 1] ?? "") && /\S/.test(passage[end] ?? "")) {
    end--;
  }

  const window = passage.slice(start, end).replace(/\s+/g, " ").trim();
  return window.length >= 35 ? window : passage.slice(Math.max(0, index - 20), Math.min(passage.length, index + length + 20)).trim();
}
