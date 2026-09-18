"use client";

// 유입 분석 — 페이지. 「어떤 페이지를 가장 많이 활용하는가」
//   AnalyticsToolbar → 동적 ID 묶기 토글 → 페이지 흐름 패널 → 인기 페이지 → 진입/종료 페이지 → 영역 비중.
// 리포트 전용 URL 파라미터: group=1(경로 묶기), flow=<경로>(흐름 패널). 탭 이동 시에는 유지하지 않는다.

import { useRef } from "react";
import type { EntryPageRow, ExitPageRow, PageRow, PagesReport } from "@/lib/analytics/reports/pages";
import { fmtDuration, fmtInt, fmtPct } from "@/lib/analytics/format";
import { pathGroup } from "@/lib/analytics/sanitize";
import { cn } from "@/lib/utils";
import { AnalyticsToolbar } from "../shared/analytics-toolbar";
import { BreakdownTable, type BreakdownColumn } from "../shared/breakdown-table";
import { ReportError, ReportSkeleton } from "../shared/report-states";
import { Section } from "../shared/section";
import { useAnalyticsParams } from "../shared/use-analytics-params";
import { useReport } from "../shared/use-report";
import { AreaShare } from "./area-share";
import { FlowPanel } from "./flow-panel";
import { FlowButton, PathLabel, isGroupPattern } from "./path-label";
import { NarrowProvider, useContainerNarrow } from "./use-narrow";

// 인기 페이지는 숫자 열이 6개라 좁은 판에서 경로 열이 71px(390px)·94px(768px)까지 짓눌려
// (같은 화면의 진입 표 151px·종료 표 215px 이 기준) 경로를 전혀 읽을 수 없다
// → 좁은 판에서는 방문자·스크롤 열을 접어 숫자 열을 3개로 줄인다.
const NARROW_HIDDEN_COLUMNS = new Set(["v", "sc"]);

export function PagesView() {
  const { get, update, setFilter } = useAnalyticsParams();
  const grouped = get("group") === "1";
  const flow = get("flow");
  const { data, error, isLoading, isFetching } = useReport<PagesReport>("pages", {
    params: { group: grouped ? "1" : null, flow },
  });
  const flowRef = useRef<HTMLDivElement>(null);
  const [contentRef, isNarrow] = useContainerNarrow();

  const openFlow = (path: string) => {
    update({ flow: path });
    flowRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const toggleGroup = () => {
    const next = !grouped;
    // 흐름 선택은 새 모드에 맞춰 옮긴다(묶음 경로는 묶기 해제 시 실경로가 아니므로 닫는다)
    const nextFlow = flow ? (next ? pathGroup(flow) : isGroupPattern(flow) ? null : flow) : null;
    update({ group: next ? "1" : null, flow: nextFlow });
  };

  // 응답 기준 판정(placeholder 로 이전 응답이 보이는 동안에도 행 의미가 일관되게)
  const isPattern = (path: string) => !!data?.grouped && isGroupPattern(path);
  const groupedClick = <Row extends { path: string }>(key: "page" | "entry") =>
    data?.grouped ? (r: Row) => (isPattern(r.path) ? openFlow(r.path) : setFilter(key, r.path)) : undefined;
  const patternHint = data?.grouped ? " · :id 묶음 행은 클릭 시 흐름 보기" : "";

  const pageColumns: BreakdownColumn<PageRow>[] = [
    { key: "pv", label: "PV", render: (r) => fmtInt(r.pageviews) },
    { key: "v", label: "방문자", render: (r) => fmtInt(r.visitors) },
    { key: "eng", label: "평균 체류*", render: (r) => (r.avgEngagedMs === null ? "-" : fmtDuration(r.avgEngagedMs)) },
    { key: "sc", label: "스크롤", render: (r) => (r.avgScrollPct === null ? "-" : fmtPct(r.avgScrollPct)) },
    { key: "ex", label: "종료율", render: (r) => fmtPct(r.exitRate) },
    {
      key: "flow",
      label: "",
      render: (r) => <FlowButton path={r.path} active={flow === r.path} onClick={() => openFlow(r.path)} />,
    },
  ];
  const visiblePageColumns = isNarrow ? pageColumns.filter((c) => !NARROW_HIDDEN_COLUMNS.has(c.key)) : pageColumns;

  return (
    <NarrowProvider value={isNarrow}>
      <div ref={contentRef} className="space-y-5">
        <AnalyticsToolbar />

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-gray-100 bg-white px-4 py-3">
          <button
            type="button"
            role="switch"
            aria-checked={grouped}
            onClick={toggleGroup}
            className="inline-flex items-center gap-2 text-[13px] font-semibold text-gray-700"
          >
            <span className={cn("relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors", grouped ? "bg-blue-600" : "bg-gray-200")}>
              <span
                className={cn(
                  "absolute top-0.5 size-4 rounded-full bg-white shadow transition-transform",
                  grouped ? "translate-x-4" : "translate-x-0.5",
                )}
              />
            </span>
            동적 ID 묶기
          </button>
          <p className="min-w-0 text-[12px] text-gray-400">
            학원·시험·지문 ID 가 들어간 경로(예: <span className="font-mono">/exam/cm1a2b…</span>)를{" "}
            <span className="font-mono">/exam/:id</span> 로 합쳐 집계합니다{grouped ? " · 원본 경로 상위 3,000개 기준" : ""}
          </p>
        </div>

        {error && <ReportError message={error.message} />}
        {isLoading && !data && <ReportSkeleton rows={8} />}

        {data && (
          <div className={cn("space-y-5 transition-opacity", isFetching && "opacity-80")}>
            <div ref={flowRef} className="scroll-mt-20">
              <FlowPanel
                selected={flow}
                flow={data.flow}
                loading={isFetching}
                suggestions={data.pages.slice(0, 6).map((p) => p.path)}
                onSelect={openFlow}
                onClear={() => update({ flow: null })}
              />
            </div>

            <Section
              title="인기 페이지"
              description={`페이지뷰 순 · 행 클릭 = 이 페이지를 본 방문으로 필터 · 종료율 = 이 페이지를 본 방문 중 여기서 끝난 비율${patternHint}`}
            >
              <BreakdownTable<PageRow>
                rows={data.pages}
                rowKey={(r) => r.path}
                labelHeader="경로"
                label={(r) => <PathLabel path={r.path} title={r.title} />}
                barValue={(r) => r.pageviews}
                columns={visiblePageColumns}
                filterKey="page"
                filterValue={(r) => r.path}
                onRowClick={groupedClick<PageRow>("page")}
                emptyMessage="이 기간·필터에 페이지뷰가 없습니다"
              />
              <p className="mt-3 text-[11.5px] leading-relaxed text-gray-400">
                <span className="font-medium text-gray-500">* 평균 체류는 「체류가 측정된 페이지뷰」 기준</span>입니다 — 방문의 마지막
                페이지처럼 이탈 시 측정값(비콘)이 유실된 페이지뷰는 분모에서 빠지므로 실제보다 길게 보일 수 있습니다. 진입 페이지 표의
                「평균 체류」는 방문 단위(측정 실패 0 포함) 평균이라 정의가 다릅니다.
                {isNarrow ? " 좁은 화면에서는 방문자·스크롤 열을 접습니다(가로로 넓히면 보입니다)." : ""}
              </p>
            </Section>

            <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
              <Section
                title="진입 페이지"
                description={`방문이 시작된 페이지 · 행 클릭 = 진입 페이지 필터 · 가입 = 이 기간 가입 학원의 최초 유입 진입(내부 트래픽 토글 무관)${patternHint}`}
              >
                <BreakdownTable<EntryPageRow>
                  rows={data.entryPages}
                  rowKey={(r) => r.path}
                  labelHeader="진입 경로"
                  label={(r) => <PathLabel path={r.path} className="2xl:max-w-[260px]" />}
                  barValue={(r) => r.sessions}
                  columns={[
                    { key: "s", label: "방문", render: (r) => fmtInt(r.sessions) },
                    { key: "b", label: "이탈률", render: (r) => (r.bounceRate === null ? "-" : fmtPct(r.bounceRate)) },
                    { key: "eng", label: "평균 체류", render: (r) => (r.avgEngagedMs === null ? "-" : fmtDuration(r.avgEngagedMs)) },
                    {
                      key: "sg",
                      label: "가입",
                      render: (r) =>
                        r.signups > 0 ? <span className="font-semibold text-blue-600">{fmtInt(r.signups)}</span> : <span className="text-gray-300">0</span>,
                    },
                  ]}
                  filterKey="entry"
                  filterValue={(r) => r.path}
                  onRowClick={groupedClick<EntryPageRow>("entry")}
                  emptyMessage="이 기간·필터에 방문이 없습니다"
                />
                <p className="mt-3 text-[11.5px] leading-relaxed text-gray-400">
                  <span className="font-medium text-gray-500">가입은 이 기간에 가입한 학원의 「최초 유입」 방문</span>을 진입 경로별로 센
                  값입니다 — 첫 방문이 기간보다 앞서도 포함되고, 내부 트래픽 토글을 따르지 않아(항상 포함) 같은 행의 방문 수와 함께
                  움직이지 않습니다. 그래서 방문 0 인데 가입이 있는 행이 나올 수 있고, 그 행은 이탈률·평균 체류가 비어 있습니다.
                </p>
              </Section>

              <Section
                title="종료 페이지"
                description={`방문이 끝난 페이지 · 행 클릭 = 이 페이지를 본 방문으로 필터${patternHint}`}
              >
                <BreakdownTable<ExitPageRow>
                  rows={data.exitPages}
                  rowKey={(r) => r.path}
                  labelHeader="종료 경로"
                  label={(r) => <PathLabel path={r.path} className="2xl:max-w-[260px]" />}
                  barValue={(r) => r.exits}
                  columns={[
                    { key: "ex", label: "종료", render: (r) => fmtInt(r.exits) },
                    { key: "er", label: "종료율", render: (r) => fmtPct(r.exitRate) },
                    {
                      key: "flow",
                      label: "",
                      render: (r) => <FlowButton path={r.path} active={flow === r.path} onClick={() => openFlow(r.path)} />,
                    },
                  ]}
                  filterKey="page"
                  filterValue={(r) => r.path}
                  onRowClick={groupedClick<ExitPageRow>("page")}
                  emptyMessage="이 기간·필터에 종료 기록이 없습니다"
                />
              </Section>
            </div>

            <Section title="영역 비중" description="페이지뷰 기준 · 공개 페이지·로그인/가입·원장 앱 등 · 행 클릭 = 영역 필터">
              <AreaShare rows={data.areas} />
            </Section>
          </div>
        )}
      </div>
    </NarrowProvider>
  );
}
