"use client";

// 시험 탭 — 점수율 추이 카드 (v3 대개편 A-1, v3 design §D1-3 시험 와이어 [D] 1행 좌)
//
// 구 exam-history-parts/score-trend-chart.tsx 의 recharts LineChart 로직 이식.
// 변경분:
//  - 카드 셸을 kit AnalyticsCard 로(R2 — 고정 높이 + 내부 채움).
//  - 토스 팔레트 hex 전량 제거 → 디자인 시스템 CSS 변수 재바인딩
//    (globals.css @theme 변수 우선 + Tailwind 토큰 hex 폴백 — blue-600 계열).
//  - 점 클릭 → onSelectSitting(refId): 셸이 리프트한 하이라이트 상태로 응시
//    테이블 행을 강조한다(§D1-3 와이어 「점 클릭 → 응시 행 하이라이트」).
// connectNulls 유지 — 점수율 미확정(null) 회차는 점을 찍지 않는다(0점 왜곡 금지).

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { LineChart as LineChartIcon } from "lucide-react";
import type { TrendSitting } from "@/lib/exam-scoring/trend";
import { EXAM_SCOPE_LABELS } from "@/lib/wording/director-glossary";
import { AnalyticsCard, CardEmpty } from "../analytics/kit";

/** 토스 hex 재바인딩 — 디자인 시스템 변수 우선, Tailwind 토큰 hex 폴백(변수 미방출 방어) */
const CHART_COLORS = {
  /** blue-600 계열 단일 라인 */
  line: "var(--color-yshin-blue-hover, #2563EB)",
  grid: "var(--color-gray-100, #F3F4F6)",
  tick: "var(--color-gray-400, #9CA3AF)",
} as const;

interface ChartPoint {
  /** 응시 테이블 행 하이라이트 연동 키(TrendSitting.refId) */
  refId: string;
  label: string;
  scorePct: number | null;
  title: string;
  date: string;
  sourceLabel: string;
}

function toPoints(sittings: TrendSitting[]): ChartPoint[] {
  return sittings.map((sitting, i) => ({
    refId: sitting.refId,
    label: `${i + 1}회`,
    scorePct: sitting.scorePct,
    title: sitting.title,
    date: sitting.date.slice(0, 10),
    sourceLabel:
      sitting.source === "INTERNAL"
        ? EXAM_SCOPE_LABELS.INTERNAL
        : `${EXAM_SCOPE_LABELS.EXTERNAL}${sitting.examTypeLabel ? ` · ${sitting.examTypeLabel}` : ""}`,
  }));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- recharts Tooltip content 관용(구 차트·admin 차트 동형)
function ScoreTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload as ChartPoint | undefined;
  if (!point) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-lg">
      <p className="text-[12px] font-semibold text-slate-900">
        {label} · {point.title}
      </p>
      <p className="mt-0.5 text-[11px] text-slate-400">
        {point.date} · {point.sourceLabel}
      </p>
      <p className="mt-1 text-[12px] text-slate-600">
        점수율{" "}
        <span className="font-semibold text-blue-600">
          {point.scorePct == null ? "미확정" : `${point.scorePct}%`}
        </span>
      </p>
    </div>
  );
}

export function ScoreTrendCard({
  sittings,
  onSelectSitting,
  className,
}: {
  /** 스코프 필터 적용 후 시계열(날짜 오름차순) — 회차 번호는 이 배열 순서 */
  sittings: TrendSitting[];
  /** 점 클릭 → 응시 테이블 행 하이라이트(셸 리프트 상태) */
  onSelectSitting: (refId: string) => void;
  className?: string;
}) {
  const points = toPoints(sittings);
  const hasScore = points.some((p) => p.scorePct != null);
  const interval = Math.max(0, Math.floor(points.length / 12) - 1);

  // 차트 클릭 → 근접 점의 refId 회수(recharts activePayload) — 점/근처 클릭 모두 흡수
  const handleChartClick = (state: unknown) => {
    const point = (state as { activePayload?: { payload?: ChartPoint }[] } | null)
      ?.activePayload?.[0]?.payload;
    if (point?.refId) onSelectSitting(point.refId);
  };

  return (
    <AnalyticsCard
      className={className}
      icon={<LineChartIcon className="size-4 text-blue-600" aria-hidden />}
      title="점수율 추이"
      aside={
        <span className="text-[11.5px] text-slate-400">
          점을 누르면 아래 응시 기록에서 해당 회차를 강조합니다
        </span>
      }
    >
      {!hasScore ? (
        <CardEmpty text="점수율이 확정된 응시가 아직 없습니다." />
      ) : (
        <div className="h-full min-h-[260px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={points}
              margin={{ top: 12, right: 12, left: -8, bottom: 0 }}
              onClick={handleChartClick}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART_COLORS.grid} />
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: CHART_COLORS.tick }}
                interval={interval}
                dy={8}
              />
              <YAxis
                domain={[0, 100]}
                ticks={[0, 25, 50, 75, 100]}
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: CHART_COLORS.tick }}
                width={40}
                tickFormatter={(v: number) => `${v}%`}
              />
              <Tooltip
                // eslint-disable-next-line @typescript-eslint/no-explicit-any -- recharts content 타입 관용
                content={ScoreTooltip as any}
                cursor={{ stroke: CHART_COLORS.line, strokeOpacity: 0.2 }}
              />
              <Line
                type="monotone"
                dataKey="scorePct"
                name="점수율"
                stroke={CHART_COLORS.line}
                strokeWidth={2.5}
                connectNulls
                dot={{ fill: CHART_COLORS.line, stroke: "#fff", strokeWidth: 1.5, r: 3.5 }}
                activeDot={{
                  fill: CHART_COLORS.line,
                  stroke: "#fff",
                  strokeWidth: 2,
                  r: 5.5,
                  cursor: "pointer",
                }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </AnalyticsCard>
  );
}
