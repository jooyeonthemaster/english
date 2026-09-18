"use client";

// 유입 분석 — 추적 링크(/go/[slug]) 관리 + 링크별 클릭·유입·가입·매출 + UTM 빌더.
// 구조(견본 overview-view 동일): AnalyticsToolbar → useReport("links") → 상태 처리 → Section 카드.
//
// 상단 공용 필터는 세션·가입·매출에만 걸리고 클릭에는 안 걸린다(클릭 행에는 채널·기기가 없다).
// 필터가 켜져 있으면 그 사실을 표 위 배지로 말하고 클릭 열을 흐리게 한다 — 그러지 않으면
// 운영자가 「채널=SNS 인데 클릭 41·세션 0」을 보고 링크가 고장 났다고 오해한다.

import { useState } from "react";
import { Eye, Info, Plus } from "lucide-react";
import type { LinksReport, TrackedLinkRow } from "@/lib/analytics/reports/links";
import { fmtInt, fmtKrw } from "@/lib/analytics/format";
import { cn } from "@/lib/utils";
import { AnalyticsToolbar } from "../shared/analytics-toolbar";
import { FILTER_KEY_LABELS } from "../shared/filter-labels";
import { KpiCard } from "../shared/kpi-card";
import { ReportEmpty, ReportError, ReportSkeleton } from "../shared/report-states";
import { Section } from "../shared/section";
import { useAnalyticsParams } from "../shared/use-analytics-params";
import { useReport } from "../shared/use-report";
import { LinkFormDialog } from "./link-form-dialog";
import { LinksTable } from "./links-table";
import { UtmBuilder } from "./utm-builder";

export function LinksView() {
  const { sharedQuery, filters } = useAnalyticsParams();
  const { data, error, isLoading, isFetching } = useReport<LinksReport>("links");
  const [dialog, setDialog] = useState<{ open: boolean; link: TrackedLinkRow | null }>({ open: false, link: null });

  const links = data?.links ?? [];
  const canEdit = data?.canEdit ?? false;
  const activeCount = links.filter((l) => l.isActive).length;
  // `link` 필터는 이 화면에서 무시된다(행 강조만) — 배지에서도 뺀다.
  const appliedFilters = (Object.keys(filters) as Array<keyof typeof filters>).filter((k) => k !== "link");
  const filtered = appliedFilters.length > 0;
  const totals = links.reduce(
    (acc, l) => ({
      clicks: acc.clicks + l.periodClicks,
      sessions: acc.sessions + l.sessions,
      signups: acc.signups + l.signups,
      revenue: acc.revenue + l.revenue,
    }),
    { clicks: 0, sessions: 0, signups: 0, revenue: 0 },
  );

  return (
    <div className="space-y-5">
      <AnalyticsToolbar />

      <div className="flex flex-col gap-3 rounded-xl border border-blue-100 bg-blue-50/50 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-2.5">
          <Info className="mt-0.5 size-4 shrink-0 text-blue-500" aria-hidden />
          <p className="text-[12.5px] leading-relaxed text-gray-600">
            인스타그램·카카오톡·스레드 앱 안에서 링크를 누르면 유입 경로(referrer)가 지워져 <b className="text-gray-800">직접 방문</b>으로
            섞입니다. 올리는 곳마다 다른 <b className="text-gray-800">추적 링크</b>를 걸면 클릭 수와 그 뒤의 방문·가입·매출까지 정확히 잡힙니다.
          </p>
        </div>
        {canEdit ? (
          <button
            type="button"
            onClick={() => setDialog({ open: true, link: null })}
            disabled={!data}
            className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-4 text-[13px] font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60"
          >
            <Plus className="size-4" aria-hidden />
            추적 링크 만들기
          </button>
        ) : (
          data && (
            <span
              className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-[12.5px] font-semibold text-gray-500"
              title="링크 만들기·수정·삭제는 최고 관리자(SUPER_ADMIN)만 할 수 있습니다"
            >
              <Eye className="size-4" aria-hidden />
              보기 전용
            </span>
          )
        )}
      </div>

      {error && <ReportError message={error.message} />}
      {isLoading && !data && <ReportSkeleton rows={6} />}

      {data && (
        <div className={cn("space-y-5 transition-opacity", isFetching && "opacity-80")}>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <KpiCard
              label="기간 클릭"
              value={fmtInt(totals.clicks)}
              hint={filtered ? "봇·미리보기 제외 · 상단 필터 미적용" : "봇·미리보기 제외"}
            />
            <KpiCard label="링크 유입 방문" value={fmtInt(totals.sessions)} hint="세션 기준" />
            <KpiCard label="링크 유입 가입" value={`${fmtInt(totals.signups)}곳`} hint="최초 유입 기준" />
            <KpiCard label="링크 유입 매출" value={fmtKrw(totals.revenue)} hint="결제 완료 순매출" />
          </div>

          <Section
            title="추적 링크"
            description={`전체 ${fmtInt(links.length)}개 · 활성 ${fmtInt(activeCount)}개 · 기간 클릭·유입·가입·매출은 선택 기간 기준, 누적 클릭은 전체 기간 · 행을 누르면 일별 클릭`}
          >
            {links.length === 0 ? (
              <ReportEmpty message="아직 추적 링크가 없습니다 — 「추적 링크 만들기」로 인스타 프로필·카톡 공유용 링크를 만들어 보세요" />
            ) : (
              <div className="space-y-2">
                {filtered && (
                  <p className="flex flex-wrap items-center gap-1.5 rounded-lg border border-amber-100 bg-amber-50/70 px-3 py-2 text-[12px] leading-relaxed text-amber-800">
                    <span className="font-semibold">
                      필터({appliedFilters.map((k) => FILTER_KEY_LABELS[k]).join(" · ")})는 세션·가입·매출에만 적용됩니다
                    </span>
                    <span className="text-amber-700">· 클릭 수는 필터와 무관한 전체 값입니다(클릭 기록에는 채널·기기 정보가 없습니다)</span>
                  </p>
                )}
                <LinksTable
                  links={links}
                  shortBase={data.shortBase}
                  sharedQuery={sharedQuery}
                  highlightSlug={filters.link}
                  canEdit={canEdit}
                  clicksUnfiltered={filtered}
                  onEdit={(link) => setDialog({ open: true, link })}
                />
              </div>
            )}
          </Section>

          <Section
            title="UTM 직접 만들기"
            description="추적 링크 없이 아무 경로에 UTM 을 붙인 전체 주소 — 광고 관리자·외부 폼에 직접 넣을 때"
          >
            <UtmBuilder shortBase={data.shortBase} />
          </Section>

          {canEdit && (
            <LinkFormDialog
              open={dialog.open}
              link={dialog.link}
              shortBase={data.shortBase}
              onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
            />
          )}
        </div>
      )}
    </div>
  );
}
