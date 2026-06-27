/**
 * passage-card-grid 순수 헬퍼.
 * 분석 글로우 키 생성 · 카드 타임스탬프 포맷 · 분석 갱신시각(ms).
 * 컴포넌트 스코프 캡처 0 (전부 인자만으로 동작).
 */

import { type PassageItem } from "./generate-page-types";

export function analysisGlowKey(passage: PassageItem): string | null {
  const analysis = passage.analysis as
    | { id?: string | null; updatedAt?: string | Date | null }
    | null
    | undefined;
  if (!analysis) return null;
  const updated =
    analysis.updatedAt instanceof Date
      ? analysis.updatedAt.toISOString()
      : analysis.updatedAt
        ? String(analysis.updatedAt)
        : "";
  return `${passage.id}:${analysis.id ?? "analysis"}:${updated}`;
}

/** 연월일시분 — 카드 타임스탬프용. 잘못된 값이면 null. */
export function formatMinuteTimestamp(
  value?: string | Date | null,
): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

export function analysisUpdatedAtMs(passage: PassageItem): number | null {
  const updatedAt = (passage.analysis as { updatedAt?: string | Date } | null)
    ?.updatedAt;
  if (!updatedAt) return null;
  const ms =
    updatedAt instanceof Date ? updatedAt.getTime() : Date.parse(updatedAt);
  return Number.isNaN(ms) ? null : ms;
}
