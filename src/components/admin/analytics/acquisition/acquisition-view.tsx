"use client";

// 유입 분석 — 유입 경로. "어디에서, 어떤 SNS 에서 들어와 가입·결제했나"
//   AnalyticsToolbar → 귀속 모델 토글 → KPI → 채널 구성(스택 바 + 누적 추이) → 채널 표 → 소스 표 → 상세 유입 탭

import { Info } from "lucide-react";
import type { AcquisitionReport } from "@/lib/analytics/reports/acquisition";
import type { AttributionModel } from "@/lib/analytics/attribution";
import { channelLabel, sourceLabel } from "@/lib/analytics/channels";
import { fmtInt, fmtKrw, fmtPct } from "@/lib/analytics/format";
import { cn } from "@/lib/utils";
import { AnalyticsToolbar } from "../shared/analytics-toolbar";
import { BreakdownTable } from "../shared/breakdown-table";
import { KpiCard } from "../shared/kpi-card";
import { ReportError, ReportSkeleton } from "../shared/report-states";
import { Section } from "../shared/section";
import { useAnalyticsParams } from "../shared/use-analytics-params";
import { useReport } from "../shared/use-report";
import {
  ChannelName,
  bounceCell,
  conversionCell,
  countCell,
  durationCell,
  krwCell,
  ratio,
  SIGNUP_RATIO_LABEL,
  SIGNUP_RATIO_NOTE,
} from "./acquisition-bits";
import { ChannelSeriesChart } from "./channel-series-chart";
import { ChannelShare } from "./channel-share";
import { AcquisitionDetailTabs } from "./detail-tabs";

const MODEL_OPTIONS: Array<{ key: AttributionModel; label: string; hint: string }> = [
  { key: "first", label: "최초 유입", hint: "학원이 처음 방문했을 때의 경로로 가입·매출을 셉니다" },
  { key: "last", label: "가입 직전 유입", hint: "가입 전 마지막 방문(직접 방문 제외 우선)의 경로로 가입·매출을 셉니다" },
];

export function AcquisitionView() {
  const { get, update } = useAnalyticsParams();
  const model: AttributionModel = get("model") === "last" ? "last" : "first";
  const { data, error, isLoading, isFetching } = useReport<AcquisitionReport>("acquisition", {
    params: { model: model === "first" ? null : model },
  });
  const modelOption = MODEL_OPTIONS.find((m) => m.key === model) ?? MODEL_OPTIONS[0];
  const modelLabel = modelOption.label;
  // 추적 커버리지 — 기간 내 가입 전체 대비 유입 경로가 연결된 학원(§13 D8)
  const coveragePct = data ? ratio(data.totals.signups, data.totals.signupsTotal) : null;
  const untracked = data ? Math.max(0, data.totals.signupsTotal - data.totals.signups) : 0;

  return (
    <div className="space-y-5">
      <AnalyticsToolbar />

      <div className="flex flex-col gap-3 rounded-xl border border-gray-100 bg-white px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12px] font-semibold text-gray-500">가입·매출 귀속</span>
          <div className="inline-flex rounded-lg border border-gray-100 p-0.5" role="group" aria-label="귀속 모델">
            {MODEL_OPTIONS.map((m) => (
              <button
                key={m.key}
                type="button"
                aria-pressed={model === m.key}
                onClick={() => update({ model: m.key === "first" ? null : m.key })}
                className={cn(
                  "h-7 rounded-md px-2.5 text-[12px] font-semibold",
                  model === m.key ? "bg-blue-600 text-white" : "text-gray-500 hover:text-gray-900",
                )}
                title={m.hint}
              >
                {m.label}
              </button>
            ))}
          </div>
          <span className="text-[11.5px] text-gray-400">{modelOption.hint}</span>
        </div>
        <p className="flex items-start gap-1.5 text-[11.5px] leading-relaxed text-gray-500 lg:max-w-[520px]">
          <Info className="mt-0.5 size-3.5 shrink-0 text-blue-500" aria-hidden />
          <span>
            인스타·카톡 인앱 브라우저는 referrer 를 지우는 경우가 많아 UA 로 보정합니다 — 정확한 SNS 캠페인 측정은 &apos;추적
            링크&apos; 탭에서 링크를 만들어 쓰세요.
          </span>
        </p>
      </div>

      {error && <ReportError message={error.message} />}
      {isLoading && !data && <ReportSkeleton rows={8} />}

      {data && (
        <div className={cn("space-y-5 transition-opacity", isFetching && "opacity-80")}>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <KpiCard label="방문(세션)" value={fmtInt(data.totals.sessions)} />
            <KpiCard label="방문자" value={fmtInt(data.totals.visitors)} />
            <KpiCard
              label="유입 추적 가입"
              value={`${fmtInt(data.totals.signups)}곳`}
              hint={`기간 내 가입 ${fmtInt(data.totals.signupsTotal)}곳 중 ${coveragePct === null ? "-" : fmtPct(coveragePct)} · ${modelLabel} 기준`}
            />
            <KpiCard label="귀속 매출" value={fmtKrw(data.totals.revenue)} hint="추적된 가입 학원의 기간 내 충전 순매출(환불 차감)" />
          </div>

          <p className="rounded-lg bg-gray-50 px-3 py-2.5 text-[12px] leading-relaxed text-gray-500">
            기간 내 가입 <b className="font-semibold text-gray-700 tabular-nums">{fmtInt(data.totals.signupsTotal)}곳</b> 중{" "}
            <b className="font-semibold text-gray-700 tabular-nums">{fmtInt(data.totals.signups)}곳</b>
            {coveragePct === null ? "" : `(${fmtPct(coveragePct)})`}만 유입 경로가 연결됐고, 나머지{" "}
            <b className="font-semibold text-gray-700 tabular-nums">{fmtInt(untracked)}곳</b>은 추적 시작 전 가입(또는 관리자 승인
            가입)이라 경로를 알 수 없습니다 — 아래 채널 분포를 전체 가입 분포로 읽지 마세요. 가입·매출은 선택한 귀속 모델의 세션
            기준이며 <b className="font-semibold text-gray-700">내부 트래픽 토글과 무관</b>합니다(방문 지표만 토글을 따릅니다).
          </p>

          <Section title="유입 채널 구성" description="막대·범례를 누르면 그 채널로 필터 · 아래는 채널별 방문 추이(누적)">
            <div className="space-y-5">
              <ChannelShare channels={data.channels} />
              {data.totals.sessions > 0 && (
                <ChannelSeriesChart
                  data={data.channelSeries}
                  channels={data.channels.filter((c) => c.sessions > 0).map((c) => c.channel)}
                />
              )}
            </div>
          </Section>

          <Section
            title="채널"
            description={`방문 지표는 기간 내 방문 · 가입·매출은 기간 내 가입 학원을 ${modelLabel} 채널에 귀속 · 행을 누르면 필터. ${SIGNUP_RATIO_NOTE}`}
          >
            <BreakdownTable
              rows={data.channels}
              rowKey={(r) => r.channel}
              labelHeader="채널"
              label={(r) => <ChannelName channel={r.channel} />}
              barValue={(r) => r.sessions}
              initialLimit={12}
              columns={[
                { key: "v", label: "방문자", render: (r) => countCell(r.visitors) },
                { key: "s", label: "방문", render: (r) => countCell(r.sessions) },
                { key: "b", label: "이탈률", render: (r) => bounceCell(r.bounceRate, r.sessions) },
                { key: "d", label: "평균 체류", render: (r) => durationCell(r.avgEngagedMs, r.sessions) },
                { key: "su", label: "가입", render: (r) => countCell(r.signups) },
                { key: "cr", label: SIGNUP_RATIO_LABEL, render: (r) => conversionCell(r.signups, r.visitors) },
                { key: "rev", label: "매출", render: (r) => krwCell(r.revenue) },
              ]}
              filterKey="channel"
              filterValue={(r) => r.channel}
            />
          </Section>

          <Section
            title="소스"
            description={`SNS·검색엔진·사이트별 · 같은 소스도 채널(자연/광고)이 다르면 따로 셉니다 · 행을 누르면 필터. ${SIGNUP_RATIO_NOTE}`}
          >
            <BreakdownTable
              rows={data.sources}
              rowKey={(r) => `${r.source}|${r.channel}`}
              labelHeader="소스"
              label={(r) => (r.source === "(none)" ? <span className="text-gray-400">(없음)</span> : sourceLabel(r.source))}
              barValue={(r) => r.sessions}
              columns={[
                {
                  key: "c",
                  label: "채널",
                  align: "left",
                  render: (r) => <span className="text-gray-400">{channelLabel(r.channel)}</span>,
                },
                { key: "v", label: "방문자", render: (r) => countCell(r.visitors) },
                { key: "s", label: "방문", render: (r) => countCell(r.sessions) },
                { key: "b", label: "이탈률", render: (r) => bounceCell(r.bounceRate, r.sessions) },
                { key: "d", label: "평균 체류", render: (r) => durationCell(r.avgEngagedMs, r.sessions) },
                { key: "su", label: "가입", render: (r) => countCell(r.signups) },
                { key: "cr", label: SIGNUP_RATIO_LABEL, render: (r) => conversionCell(r.signups, r.visitors) },
                { key: "rev", label: "매출", render: (r) => krwCell(r.revenue) },
              ]}
              onRowClick={(r) => update({ source: r.source, channel: r.channel })}
            />
          </Section>

          <AcquisitionDetailTabs data={data} />
        </div>
      )}
    </div>
  );
}
