"use client";

// 유입 분석 — 실시간. 기간 선택 없음(최근 5분 신호 기준), 공용 필터·내부 트래픽 토글은 적용.
// 10초 폴링 — 탭이 숨겨지면 react-query 가 멈춘다(I5).

import { useEffect, useRef, useState } from "react";
import { PauseCircle, RefreshCw } from "lucide-react";
import type { RealtimeReport } from "@/lib/analytics/reports/realtime";
import { channelLabel, sourceLabel } from "@/lib/analytics/channels";
import { fmtInt, fmtTime } from "@/lib/analytics/format";
import { cn } from "@/lib/utils";
import { AnalyticsToolbar } from "../shared/analytics-toolbar";
import { BreakdownTable } from "../shared/breakdown-table";
import { ReportError, ReportSkeleton } from "../shared/report-states";
import { Section } from "../shared/section";
import { useAnalyticsParams } from "../shared/use-analytics-params";
import { useReport } from "../shared/use-report";
import { ActiveNowCard } from "./active-now-card";
import { ActiveSessionsTable } from "./active-sessions-table";
import { PerMinuteChart } from "./per-minute-chart";
import { RecentEventsFeed } from "./recent-events-feed";

const REFRESH_MS = 10_000;

/** 탭이 숨겨졌는지 — 숨김 동안에는 폴링이 멈추므로 화면이 「지금」이라고 말하면 안 된다(I5). */
function useDocumentHidden(): boolean {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const sync = () => setHidden(document.visibilityState === "hidden");
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);
  return hidden;
}

export function RealtimeView() {
  const { update } = useAnalyticsParams();
  const hidden = useDocumentHidden();
  const { data, error, isLoading, isFetching, dataUpdatedAt, refetch } = useReport<RealtimeReport>("realtime", {
    refetchInterval: REFRESH_MS,
  });

  // 탭으로 돌아오면 바로 한 번 갱신한다 — 이 리포의 QueryClient 는 refetchOnWindowFocus:false 라
  // (src/providers/query-provider.tsx) 그냥 두면 다음 폴링 틱까지 최대 10초 동안 옛 숫자를 「지금」이라고 말한다.
  // 전이 판정이라 StrictMode 이중 실행에도 한 번만 돈다.
  const prevHidden = useRef(hidden);
  useEffect(() => {
    if (prevHidden.current === hidden) return;
    prevHidden.current = hidden;
    if (!hidden) void refetch();
  }, [hidden, refetch]);

  const nowMs = data ? Date.parse(data.serverTime) : 0;
  const pvTotal = data ? data.perMinute.reduce((sum, p) => sum + p.pageviews, 0) : 0;

  return (
    <div className="space-y-5">
      <AnalyticsToolbar hidePeriod />

      <p
        className={cn(
          "flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px]",
          hidden ? "font-medium text-amber-600" : "text-gray-400",
        )}
      >
        {hidden ? (
          <>
            <PauseCircle className="size-3.5" aria-hidden />
            <span>탭이 숨겨져 갱신 정지</span>
            {dataUpdatedAt > 0 && <span className="tabular-nums">· 마지막 갱신 {fmtTime(new Date(dataUpdatedAt))}</span>}
            <span className="font-normal text-amber-600/80">· 아래 숫자는 그때의 값입니다(탭으로 돌아오면 즉시 갱신)</span>
          </>
        ) : (
          <>
            <RefreshCw className={cn("size-3.5", isFetching && "animate-spin text-blue-500")} aria-hidden />
            <span>10초마다 갱신 · 최근 5분 신호 기준</span>
            {dataUpdatedAt > 0 && <span className="tabular-nums">· 마지막 갱신 {fmtTime(new Date(dataUpdatedAt))}</span>}
            <span>· 기간 선택은 적용되지 않습니다</span>
          </>
        )}
      </p>

      {error && <ReportError message={error.message} />}
      {isLoading && !data && <ReportSkeleton rows={8} />}

      {data && (
        <div className={cn("space-y-5 transition-opacity", hidden && "opacity-50")}>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <ActiveNowCard data={data} />
            <Section
              title="분당 페이지뷰"
              description={`최근 30분 · KST · 합계 ${fmtInt(pvTotal)}회`}
              className="lg:col-span-2"
            >
              <PerMinuteChart data={data.perMinute} />
            </Section>
          </div>

          <Section
            title="활성 세션"
            description={`최근 5분 안에 활동한 방문 · 최신순 최대 50개${data.activeNow > data.activeSessions.length ? ` (전체 ${fmtInt(data.activeNow)}개 중)` : ""}`}
            bodyClassName="px-5 py-3"
          >
            <ActiveSessionsTable rows={data.activeSessions} nowMs={nowMs} />
          </Section>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Section title="지금 보는 페이지" description="활성 세션이 지금 머무는 경로 · 세션 수 기준">
              <BreakdownTable
                rows={data.topPagesNow}
                rowKey={(r) => r.path}
                labelHeader="경로"
                label={(r) => <span className="font-mono text-[12px]">{r.path}</span>}
                barValue={(r) => r.sessions}
                columns={[{ key: "s", label: "세션", render: (r) => fmtInt(r.sessions) }]}
                filterKey="page"
                filterValue={(r) => r.path}
                emptyMessage="지금 접속 중인 방문자가 없습니다"
              />
            </Section>
            <Section title="지금 유입 소스" description="활성 세션의 유입 소스">
              <BreakdownTable
                rows={data.topSourcesNow}
                rowKey={(r) => `${r.source}|${r.channel}`}
                labelHeader="소스"
                label={(r) => sourceLabel(r.source === "(none)" ? null : r.source)}
                barValue={(r) => r.sessions}
                columns={[
                  { key: "c", label: "채널", align: "left", render: (r) => <span className="text-gray-400">{channelLabel(r.channel)}</span> },
                  { key: "s", label: "세션", render: (r) => fmtInt(r.sessions) },
                ]}
                onRowClick={(r) => update({ source: r.source, channel: r.channel })}
                emptyMessage="지금 유입 중인 소스가 없습니다"
              />
            </Section>
          </div>

          <Section title="최근 이벤트" description="최근 30분 · 페이지뷰·클릭·전환 · 최신순 최대 40건">
            <RecentEventsFeed events={data.recentEvents} nowMs={nowMs} />
          </Section>
        </div>
      )}
    </div>
  );
}
