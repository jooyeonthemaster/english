// ============================================================================
// 시험 이력 요약(summarize) — 순수 모듈 정본 (v3 수리 N-18)
//
// 구 위치는 actions/students/exam-history.ts 내부 헬퍼("use server" 제약으로
// 비export)였고, 시험 탭(exam-tab.tsx)이 스코프 재계산용으로 동일 로직을 클라에
// 복제해 조용한 드리프트 벡터가 됐다. 여기로 추출해 서버 액션·클라 양측이
// 같은 구현을 import 한다. 계약: ±3%p 임계 · 최근 3회(확정분) 창 · 확정 2회
// 미만 trend null · 평균은 소수 1자리 반올림.
// ============================================================================

import type { TrendSitting } from "@/lib/exam-scoring/trend";

export type ExamHistoryTrendDirection = "UP" | "FLAT" | "DOWN";

export interface ExamHistorySummary {
  totalSittings: number;
  /** 점수 확정분 평균(소수 1자리) — 확정 0건이면 null */
  avgScorePct: number | null;
  /** 최근 3회(점수 확정분) 방향 — 확정 2회 미만이면 null(판단 불가) */
  trend: ExamHistoryTrendDirection | null;
  /** 가장 최근 확정 점수율 — 없으면 null */
  latestScorePct: number | null;
}

/** 추세 방향 판정 임계(±3%p) — 미세 등락은 "유지(FLAT)"로 흡수한다 */
const TREND_THRESHOLD_PCT = 3;

export function summarize(sittings: TrendSitting[]): ExamHistorySummary {
  const scored = sittings
    .map((s) => s.scorePct)
    .filter((pct): pct is number => pct != null);

  const avgScorePct =
    scored.length > 0
      ? Math.round((scored.reduce((sum, pct) => sum + pct, 0) / scored.length) * 10) / 10
      : null;

  // 최근 3회(확정분) 창에서 첫 회차 대비 마지막 회차의 변화량으로 방향 판정.
  const window = scored.slice(-3);
  let trend: ExamHistoryTrendDirection | null = null;
  if (window.length >= 2) {
    const delta = window[window.length - 1] - window[0];
    trend =
      delta >= TREND_THRESHOLD_PCT ? "UP" : delta <= -TREND_THRESHOLD_PCT ? "DOWN" : "FLAT";
  }

  return {
    totalSittings: sittings.length,
    avgScorePct,
    trend,
    latestScorePct: scored.length > 0 ? scored[scored.length - 1] : null,
  };
}
