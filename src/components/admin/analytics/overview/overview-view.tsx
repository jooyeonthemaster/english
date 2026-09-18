"use client";

// 유입 분석 — 개요 (견본). 다른 리포트 화면은 이 파일의 구조를 따른다:
//   AnalyticsToolbar → useReport(<report>) → 상태 처리(ReportSkeleton/ReportError) → Section 카드 그리드.

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Radio, RefreshCw } from "lucide-react";
import type { OverviewReport } from "@/lib/analytics/reports/overview";
import { CHANNEL_COLORS, channelLabel, isChannel, sourceLabel } from "@/lib/analytics/channels";
import { fmtAgo, fmtDuration, fmtInt, fmtKrw, fmtPct } from "@/lib/analytics/format";
import { cn } from "@/lib/utils";
import { AnalyticsToolbar } from "../shared/analytics-toolbar";
import { BreakdownTable } from "../shared/breakdown-table";
import { KpiCard } from "../shared/kpi-card";
import { ReportError, ReportSkeleton } from "../shared/report-states";
import { Section } from "../shared/section";
import { TimeseriesChart } from "../shared/timeseries-chart";
import { useAnalyticsParams, withSharedQuery } from "../shared/use-analytics-params";
import { useReport } from "../shared/use-report";

type Metric = "visitors" | "sessions" | "pageviews";
const METRIC_LABELS: Record<Metric, string> = { visitors: "방문자", sessions: "방문", pageviews: "페이지뷰" };

export function OverviewView() {
  const { sharedQuery, filters, update } = useAnalyticsParams();
  // 폴링 없음(§10 은 실시간 탭에만 주기 갱신을 둔다) — 개요는 수동 새로고침 버튼으로.
  const { data, error, isLoading, isFetching, refetch } = useReport<OverviewReport>("overview");
  const [metric, setMetric] = useState<Metric>("visitors");
  const filtered = Object.keys(filters).length > 0;

  return (
    <div className="space-y-5">
      <AnalyticsToolbar />

      {error && <ReportError message={error.message} />}
      {isLoading && !data && <ReportSkeleton rows={8} />}

      {data && (
        <div className={cn("space-y-5 transition-opacity", isFetching && "opacity-80")}>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-5">
            <Link
              href={withSharedQuery("/admin/analytics/realtime", sharedQuery)}
              prefetch={false}
              className="col-span-2 flex flex-col justify-between rounded-xl border border-emerald-100 bg-emerald-50/60 p-4 transition-colors hover:bg-emerald-50 md:col-span-1"
            >
              <div className="flex items-center gap-1.5 text-[12px] font-semibold text-emerald-700">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
                </span>
                지금 접속 중
              </div>
              <div className="mt-2 text-[28px] font-bold leading-none text-emerald-700 tabular-nums">
                {fmtInt(data.activeNow)}
                <span className="ml-1 text-[14px] font-semibold">명</span>
              </div>
              <div className="mt-2 inline-flex items-center gap-1 text-[11.5px] text-emerald-700/70">
                <Radio className="size-3" aria-hidden /> 최근 5분 · 실시간 보기
              </div>
            </Link>
            <KpiCard label="방문자" value={fmtInt(data.current.visitors)} current={data.current.visitors} previous={data.previous.visitors} />
            <KpiCard label="방문(세션)" value={fmtInt(data.current.sessions)} current={data.current.sessions} previous={data.previous.sessions} />
            <KpiCard label="페이지뷰" value={fmtInt(data.current.pageviews)} current={data.current.pageviews} previous={data.previous.pageviews} />
            <KpiCard
              label="이탈률"
              value={fmtPct(data.current.bounceRate)}
              current={data.current.bounceRate}
              previous={data.previous.bounceRate}
              lowerIsBetter
              formatValue={fmtPct}
              hint="1페이지·10초 미만"
            />
            <KpiCard
              label="평균 체류"
              value={fmtDuration(data.current.avgEngagedMs)}
              current={data.current.avgEngagedMs}
              previous={data.previous.avgEngagedMs}
              formatValue={fmtDuration}
            />
            <KpiCard
              label="세션당 페이지"
              value={String(data.current.pagesPerSession)}
              current={data.current.pagesPerSession}
              previous={data.previous.pagesPerSession}
            />
            <KpiCard
              label="신규 방문 비율"
              value={fmtPct(data.current.newVisitorRate)}
              current={data.current.newVisitorRate}
              previous={data.previous.newVisitorRate}
              formatValue={fmtPct}
            />
            {/* 이 두 장은 기간 전체를 세고 채널·기기 같은 필터를 타지 않는다(overview.ts signupsTotal·revenueTotal).
                필터가 걸린 동안 나머지 카드만 줄어들면 같은 기준으로 읽히므로 칩으로 못 박는다. */}
            <KpiCard
              label="가입 학원"
              value={`${fmtInt(data.current.signupsTotal)}곳`}
              current={data.current.signupsTotal}
              previous={data.previous.signupsTotal}
              badgeSuffix={filtered ? <FilterFreeChip /> : null}
              hint={
                filtered
                  ? `필터 적용 안 됨 · 추적분 ${fmtInt(data.current.signupsTracked)}곳`
                  : `유입 추적 ${fmtInt(data.current.signupsTracked)}곳`
              }
            />
            <KpiCard
              label="결제 매출(완료)"
              value={fmtKrw(data.current.revenueTotal)}
              current={data.current.revenueTotal}
              previous={data.previous.revenueTotal}
              formatValue={fmtKrw}
              badgeSuffix={filtered ? <FilterFreeChip /> : null}
              hint={
                filtered
                  ? `필터 적용 안 됨 · 추적분 ${fmtKrw(data.current.revenueTracked)}`
                  : `추적 가입분 ${fmtKrw(data.current.revenueTracked)}`
              }
            />
          </div>

          <Section
            title="방문 추이"
            description={`${data.granularity === "hour" ? "시간별" : "일별"} · 점선은 직전 동일 기간`}
            right={
              <div className="inline-flex rounded-lg border border-gray-100 p-0.5">
                {(Object.keys(METRIC_LABELS) as Metric[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMetric(m)}
                    className={cn(
                      "h-7 rounded-md px-2.5 text-[12px] font-semibold",
                      metric === m ? "bg-gray-900 text-white" : "text-gray-500 hover:text-gray-900",
                    )}
                  >
                    {METRIC_LABELS[m]}
                  </button>
                ))}
              </div>
            }
          >
            <TimeseriesChart
              metricLabel={METRIC_LABELS[metric]}
              data={data.series.map((p) => ({
                key: p.key,
                current: p[metric],
                previous: metric === "visitors" ? p.prevVisitors : metric === "sessions" ? p.prevSessions : p.prevPageviews,
              }))}
            />
          </Section>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Section title="유입 채널" description="방문 기준 상위" right={<MoreLink href="/admin/analytics/acquisition" q={sharedQuery} />}>
              <BreakdownTable
                rows={data.topChannels}
                rowKey={(r) => r.channel}
                labelHeader="채널"
                label={(r) => (
                  <span className="inline-flex items-center gap-2">
                    <span
                      className="size-2 rounded-full"
                      style={{ background: isChannel(r.channel) ? CHANNEL_COLORS[r.channel] : "#94a3b8" }}
                      aria-hidden
                    />
                    {channelLabel(r.channel)}
                  </span>
                )}
                labelText={(r) => channelLabel(r.channel)}
                barValue={(r) => r.sessions}
                columns={[
                  { key: "v", label: "방문자", render: (r) => fmtInt(r.visitors), csvValue: (r) => r.visitors },
                  { key: "s", label: "방문", render: (r) => fmtInt(r.sessions), csvValue: (r) => r.sessions },
                ]}
                filterKey="channel"
                filterValue={(r) => r.channel}
              />
            </Section>
            <Section title="유입 소스" description="SNS·검색엔진·사이트" right={<MoreLink href="/admin/analytics/acquisition" q={sharedQuery} />}>
              {/* 같은 소스라도 자연·광고를 나눠 센다 — 유입경로 탭의 sources 와 같은 (소스, 채널) 쌍. */}
              <BreakdownTable
                rows={data.topSources}
                rowKey={(r) => `${r.source}|${r.channel}`}
                labelHeader="소스"
                label={(r) => sourceLabel(r.source)}
                labelText={(r) => sourceLabel(r.source)}
                barValue={(r) => r.sessions}
                columns={[
                  {
                    key: "c",
                    label: "채널",
                    align: "left",
                    render: (r) => <span className="text-gray-400">{channelLabel(r.channel)}</span>,
                    csvValue: (r) => channelLabel(r.channel),
                  },
                  { key: "s", label: "방문", render: (r) => fmtInt(r.sessions), csvValue: (r) => r.sessions },
                ]}
                onRowClick={(r) => update({ source: r.source, channel: r.channel })}
              />
            </Section>
            <Section title="인기 페이지" description="페이지뷰 기준" right={<MoreLink href="/admin/analytics/pages" q={sharedQuery} />}>
              <BreakdownTable
                rows={data.topPages}
                rowKey={(r) => r.path}
                labelHeader="경로"
                label={(r) => <span className="font-mono text-[12px]">{r.path}</span>}
                barValue={(r) => r.pageviews}
                columns={[
                  { key: "pv", label: "PV", render: (r) => fmtInt(r.pageviews), csvValue: (r) => r.pageviews },
                  { key: "v", label: "방문자", render: (r) => fmtInt(r.visitors), csvValue: (r) => r.visitors },
                ]}
                filterKey="page"
                filterValue={(r) => r.path}
              />
            </Section>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[11.5px] text-gray-400">
              수집기 상태 · 최근 24시간 이벤트 {fmtInt(data.collector.events24h)}건 · 마지막 수집{" "}
              {data.collector.lastEventAt ? fmtAgo(data.collector.lastEventAt) : "없음"}
            </p>
            <button
              type="button"
              onClick={() => void refetch()}
              disabled={isFetching}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-100 px-2 py-1 text-[11.5px] font-semibold text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-900 disabled:opacity-50"
            >
              <RefreshCw className={cn("size-3", isFetching && "animate-spin")} aria-hidden />
              새로고침
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** 필터를 타지 않는 KPI 에 붙는 칩 — 자구는 전환·가입 탭(conversion-funnel)과 맞춘다. */
function FilterFreeChip() {
  return (
    <span
      className="inline-flex items-center rounded-full bg-amber-50 px-1.5 py-px text-[10.5px] font-semibold text-amber-700"
      title="기간 전체 · 필터 무관 — 채널·기기 같은 필터를 적용하지 않고 기간 안의 전체를 셉니다."
    >
      필터 무관
    </span>
  );
}

function MoreLink({ href, q }: { href: string; q: string }) {
  return (
    <Link
      href={withSharedQuery(href, q)}
      prefetch={false}
      className="inline-flex items-center gap-0.5 text-[12px] font-semibold text-blue-600 hover:underline"
    >
      자세히 <ArrowRight className="size-3" aria-hidden />
    </Link>
  );
}
