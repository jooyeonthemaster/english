import type { ExtractionMode } from "@/lib/extraction/modes";

/**
 * Formats a millisecond duration as `m분 s초` (Korean).
 * Falls back to a bare dash when both start/end timestamps aren't available.
 */
export function formatElapsed(
  startIso: string | null,
  endIso: string | null,
): string {
  if (!startIso || !endIso) return "—";
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return "—";
  const totalSec = Math.max(1, Math.round((end - start) / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m === 0) return `${s}초`;
  return `${m}분 ${String(s).padStart(2, "0")}초`;
}

/**
 * Builds a mode-specific summary sentence like
 *   "지문 4개 · 문제 18개 저장 완료"
 * used right beneath the title in the hero area.
 *
 * When the server kept rows to preserve teacher edits (`skippedPassages`/
 * `skippedQuestions` > 0), append a ` · 유지 N개 (기존 편집 보존)` suffix so
 * the teacher understands why the counts don't match the review screen.
 */
export function buildSummaryCounts(args: {
  mode: ExtractionMode | null;
  savedPassages: number;
  savedQuestions: number;
  bundleCount: number;
  skippedPassages: number;
  skippedQuestions: number;
}): string {
  const {
    mode,
    savedPassages,
    savedQuestions,
    bundleCount,
    skippedPassages,
    skippedQuestions,
  } = args;

  const skippedTotal = skippedPassages + skippedQuestions;
  const keptSuffix =
    skippedTotal > 0 ? ` · 유지 ${skippedTotal}개 (기존 편집 보존)` : "";

  if (mode === "QUESTION_SET") {
    return `지문 ${savedPassages}개 · 문제 ${savedQuestions}개 저장 완료${keptSuffix}`;
  }
  if (mode === "FULL_EXAM") {
    return `시험지 1개 · 지문 ${savedPassages}개 · 문제 ${savedQuestions}개 · 번들 ${bundleCount}개 저장 완료${keptSuffix}`;
  }
  // PASSAGE_ONLY / EXPLANATION / unknown → passage-centric summary
  return `지문 ${savedPassages}개 저장 완료${keptSuffix}`;
}
