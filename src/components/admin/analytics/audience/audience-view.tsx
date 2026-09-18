"use client";

// 유입 분석 — 방문자·시간대. "어떤 요일·시간·날짜에 방문이 몰리고, 누가(기기·지역) 오는가".
// 구조(견본 overview-view 와 동일): AnalyticsToolbar → useReport("audience") → 상태 처리 → Section 카드 그리드.

import type { AudienceReport } from "@/lib/analytics/reports/audience";
import { DOW_LABELS, fmtInt, fmtPct } from "@/lib/analytics/format";
import { cn } from "@/lib/utils";
import { AnalyticsToolbar } from "../shared/analytics-toolbar";
import { KpiCard } from "../shared/kpi-card";
import { ReportError, ReportSkeleton } from "../shared/report-states";
import { Section } from "../shared/section";
import { useReport } from "../shared/use-report";
import { dowTone, pctOf } from "./audience-utils";
import { GeoSections } from "./geo-sections";
import { HourlyChart } from "./hourly-chart";
import { VisitSplits } from "./split-bars";
import { TechSections } from "./tech-sections";
import { TopDaysTable } from "./top-days";
import { VisitCalendar } from "./visit-calendar";
import { VisitHeatmap, heatmapPeak } from "./visit-heatmap";

export function AudienceView() {
  const { data, error, isLoading, isFetching } = useReport<AudienceReport>("audience");

  return (
    <div className="space-y-5">
      <AnalyticsToolbar />

      {error && <ReportError message={error.message} />}
      {isLoading && !data && <ReportSkeleton rows={8} />}

      {data && (
        <div className={cn("space-y-5 transition-opacity", isFetching && "opacity-80")}>
          <Highlights data={data} />

          <Section title="요일 × 시간대 방문" description="KST · 진하기 = 방문(세션) 수 · 칸에 마우스를 올리면 수치">
            <VisitHeatmap heatmap={data.heatmap} />
          </Section>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Section title="최근 90일 방문 캘린더" description="일별 방문자 · 조회 기간과 무관하게 최근 90일(필터는 적용)">
              <VisitCalendar calendar={data.calendar} />
            </Section>
            <Section title="방문 많은 날 TOP 10" description="방문자 순 · 행 클릭 = 그 날짜만 보기">
              <TopDaysTable topDays={data.topDays} />
            </Section>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Section title="시간대별 방문" description="KST · 기간 합산 · 진한 막대가 가장 붐비는 시간">
              <HourlyChart hourly={data.hourly} />
            </Section>
            <Section title="방문 성격" description="신규/재방문 · 로그인/비로그인 비율(방문 기준)">
              <VisitSplits newVsReturning={data.newVsReturning} loggedIn={data.loggedIn} />
            </Section>
          </div>

          <TechSections data={data} />
          <GeoSections data={data} />

          <p className="text-[11.5px] text-gray-400">
            방문(세션) 시작 시각 기준 · 지역은 배포 환경(Vercel) 접속 위치 추정값이라 로컬·일부 망에서는 미상으로 집계됩니다.
          </p>
        </div>
      )}
    </div>
  );
}

function Highlights({ data }: { data: AudienceReport }) {
  const total = data.newVsReturning.newSessions + data.newVsReturning.returningSessions;
  const peak = heatmapPeak(data.heatmap);
  const bestDay = data.topDays[0] ?? null;
  const deviceSessions = (type: string) => data.devices.find((d) => d.deviceType === type)?.sessions ?? 0;
  const empty = total === 0;

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <KpiCard
        label="가장 붐비는 시간"
        value={peak ? `${DOW_LABELS[peak.dow]}요일 ${peak.hour}시` : "-"}
        hint={peak ? `${fmtInt(peak.sessions)}방문` : undefined}
      />
      <div className="rounded-xl border border-gray-100 bg-white p-4">
        <div className="text-[12px] font-medium text-gray-400">방문자 최다일</div>
        <div className="mt-2 text-[24px] font-bold leading-none tracking-tight text-gray-900 tabular-nums">
          {bestDay ? (
            <>
              {Number(bestDay.day.slice(5, 7))}/{Number(bestDay.day.slice(8, 10))}
              <span className={cn("ml-1 text-[15px] font-semibold", dowTone(bestDay.dow))}>{DOW_LABELS[bestDay.dow]}</span>
            </>
          ) : (
            "-"
          )}
        </div>
        <div className="mt-2 min-h-[18px] text-[11.5px] text-gray-400">
          {bestDay ? `방문자 ${fmtInt(bestDay.visitors)}명 · 방문 ${fmtInt(bestDay.sessions)}` : null}
        </div>
      </div>
      <KpiCard
        label="모바일 비중"
        value={empty ? "-" : fmtPct(pctOf(deviceSessions("mobile"), total))}
        hint={empty ? undefined : `데스크톱 ${fmtPct(pctOf(deviceSessions("desktop"), total))} · 태블릿 ${fmtPct(pctOf(deviceSessions("tablet"), total))}`}
      />
      <KpiCard
        label="재방문 비중"
        value={empty ? "-" : fmtPct(pctOf(data.newVsReturning.returningSessions, total))}
        hint={empty ? undefined : `로그인 방문 ${fmtPct(pctOf(data.loggedIn.loggedInSessions, total))}`}
      />
    </div>
  );
}
