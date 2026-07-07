"use client";

// ============================================================================
// 프로모션 모니터링 패널 — 프로모션/번들 공유 링크의 사용자 활동을 집계해
// 보여준다. 원가분석(원가 분석) 페이지처럼 일별/월별/기간선택으로 기간을
// 바꿔가며 볼 수 있고, 선택 기간의 요약(카드/표)과 추이(막대)를 함께 표시한다.
//   · 방문(VIEW) = 랜딩 도달, 혜택받기(CLAIM) = CTA 클릭.
//   · 학원/회원 식별은 로그인한 원장만, 익명 방문은 총계에만 반영.
// ============================================================================

import { useState, useTransition } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import {
  Activity,
  Building2,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Eye,
  MousePointerClick,
  User,
  Users,
} from "lucide-react";
import type {
  PromoMonitoringPayload,
  PromoMonitoringSelection,
} from "@/actions/admin/credit-promotion-monitoring";
import { getPromotionMonitoring } from "@/actions/admin/credit-promotion-monitoring";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

function fmt(n: number): string {
  return n.toLocaleString("ko-KR");
}

function timeAgo(iso: string | null): string {
  if (!iso) return "-";
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}일 전`;
  return new Date(iso).toLocaleDateString("ko-KR", {
    month: "short",
    day: "numeric",
  });
}

// ---------------------------------------------------------------------------
// 기간 컨트롤 — 원가분석 CostPeriodControls 와 동일한 UX(일별/월별/기간선택 +
// 달력 팝오버). URL 대신 onChange 콜백으로 상위(패널)에 선택을 전달한다.
// ---------------------------------------------------------------------------

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function PromoPeriodControls({
  selection,
  pending,
  onChange,
}: {
  selection: PromoMonitoringSelection;
  pending: boolean;
  onChange: (next: PromoMonitoringSelection) => void;
}) {
  const [rangeOpen, setRangeOpen] = useState(false);
  const isRange = Boolean(selection.start && selection.end);
  const activeTab: "daily" | "monthly" | "range" = isRange
    ? "range"
    : selection.mode;

  const tabClass = (active: boolean) =>
    cn(
      "inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-[12px] font-semibold transition-colors disabled:opacity-50",
      active
        ? "bg-slate-900 text-white"
        : "text-gray-500 hover:bg-gray-100 hover:text-gray-900",
    );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Popover open={rangeOpen} onOpenChange={setRangeOpen}>
        <div className="inline-flex h-9 w-fit items-center rounded-lg border border-gray-200 bg-white p-1">
          <button
            type="button"
            disabled={pending}
            className={tabClass(activeTab === "daily")}
            onClick={() =>
              onChange({ ...selection, mode: "daily", start: null, end: null })
            }
          >
            <CalendarDays className="size-3.5" />
            일별
          </button>
          <button
            type="button"
            disabled={pending}
            className={tabClass(activeTab === "monthly")}
            onClick={() =>
              onChange({
                ...selection,
                mode: "monthly",
                start: null,
                end: null,
              })
            }
          >
            <CalendarRange className="size-3.5" />
            월별
          </button>
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={pending}
              className={tabClass(activeTab === "range")}
            >
              <CalendarClock className="size-3.5" />
              기간선택
            </button>
          </PopoverTrigger>
        </div>

        {activeTab === "range" && (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              onChange({ ...selection, start: null, end: null })
            }
            className="inline-flex h-9 items-center justify-center rounded-md px-2 text-[12px] font-semibold text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-700 disabled:opacity-50"
          >
            초기화
          </button>
        )}

        <PopoverContent align="end" className="w-auto p-3">
          <RangeCalendar
            mode={selection.mode}
            initialStart={selection.start}
            initialEnd={selection.end}
            onApply={(start, end) => {
              setRangeOpen(false);
              onChange({ ...selection, start, end });
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

function RangeCalendar({
  mode,
  initialStart,
  initialEnd,
  onApply,
}: {
  mode: "daily" | "monthly";
  initialStart: string | null;
  initialEnd: string | null;
  onApply: (start: string, end: string) => void;
}) {
  const parsedStart = initialStart ? parseISO(initialStart) : null;
  const parsedEnd = initialEnd ? parseISO(initialEnd) : null;

  const [viewMonth, setViewMonth] = useState<Date>(
    startOfMonth(parsedStart ?? new Date()),
  );
  const [start, setStart] = useState<Date | null>(parsedStart);
  const [end, setEnd] = useState<Date | null>(parsedEnd);

  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(viewMonth)),
    end: endOfWeek(endOfMonth(viewMonth)),
  });

  function handleDayClick(day: Date) {
    if (!start || (start && end)) {
      setStart(day);
      setEnd(null);
      return;
    }
    if (day < start) {
      setEnd(start);
      setStart(day);
    } else {
      setEnd(day);
    }
  }

  function inRange(day: Date) {
    if (!start || !end) return false;
    return day > start && day < end;
  }

  const canApply = Boolean(start);

  return (
    <div className="w-[268px]">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          aria-label="이전 달"
          onClick={() => setViewMonth((m) => subMonths(m, 1))}
          className="inline-flex size-7 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900"
        >
          <ChevronLeft className="size-4" />
        </button>
        <span className="text-[13px] font-semibold text-gray-800">
          {format(viewMonth, "yyyy년 M월")}
        </span>
        <button
          type="button"
          aria-label="다음 달"
          onClick={() => setViewMonth((m) => addMonths(m, 1))}
          className="inline-flex size-7 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {WEEKDAYS.map((w) => (
          <div
            key={w}
            className="flex h-7 items-center justify-center text-[11px] font-medium text-gray-400"
          >
            {w}
          </div>
        ))}
        {days.map((day) => {
          const isStart = start && isSameDay(day, start);
          const isEnd = end && isSameDay(day, end);
          const isEndpoint = isStart || isEnd;
          const isCurrentMonth = isSameMonth(day, viewMonth);
          const isToday = isSameDay(day, new Date());
          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => handleDayClick(day)}
              className={cn(
                "flex h-8 items-center justify-center rounded-md text-[12px] tabular-nums transition-colors",
                !isCurrentMonth && "text-gray-300",
                isCurrentMonth &&
                  !isEndpoint &&
                  "text-gray-700 hover:bg-gray-100",
                inRange(day) && "bg-slate-100 text-slate-700",
                isEndpoint &&
                  "bg-slate-900 font-semibold text-white hover:bg-slate-800",
                isToday && !isEndpoint && "ring-1 ring-inset ring-slate-300",
              )}
            >
              {format(day, "d")}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3">
        <span className="text-[12px] tabular-nums text-gray-500">
          {start ? format(start, "yyyy.MM.dd") : "시작일"}
          {" ~ "}
          {end
            ? format(end, "yyyy.MM.dd")
            : start
              ? format(start, "yyyy.MM.dd")
              : "종료일"}
        </span>
        <button
          type="button"
          disabled={!canApply}
          onClick={() => {
            if (!start) return;
            onApply(
              format(start, "yyyy-MM-dd"),
              format(end ?? start, "yyyy-MM-dd"),
            );
          }}
          className={cn(
            "inline-flex h-8 items-center justify-center rounded-md px-3 text-[12px] font-semibold transition-colors",
            canApply
              ? "bg-slate-900 text-white hover:bg-slate-800"
              : "cursor-not-allowed bg-gray-200 text-gray-400",
          )}
        >
          적용
        </button>
      </div>
      <p className="mt-1 text-[11px] text-gray-400">
        {mode === "monthly" ? "월별" : "일별"} 집계로 기간 활동을 표시합니다.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 추이 막대 차트 — 버킷별 방문(파랑)/혜택받기(초록) 스택 막대.
// ---------------------------------------------------------------------------

function TrendChart({
  series,
  mode,
}: {
  series: PromoMonitoringPayload["series"];
  mode: "daily" | "monthly";
}) {
  const max = Math.max(1, ...series.map((s) => s.views + s.claims));
  // 라벨 과밀 방지: 버킷이 많으면 일부만 표기.
  const labelEvery = series.length > 16 ? Math.ceil(series.length / 8) : 1;

  return (
    <div className="px-5 py-4">
      <div className="mb-2 flex items-center gap-3 text-[11px] text-gray-500">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block size-2.5 rounded-sm bg-blue-500" />
          방문
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block size-2.5 rounded-sm bg-emerald-500" />
          혜택받기
        </span>
      </div>
      <div className="overflow-x-auto">
        <div
          className="flex min-w-full items-end gap-1"
          style={{ height: 140 }}
        >
          {series.map((s, i) => {
            const total = s.views + s.claims;
            const totalH = (total / max) * 120;
            const viewH = total > 0 ? (s.views / total) * totalH : 0;
            const claimH = totalH - viewH;
            return (
              <div
                key={s.key}
                className="flex min-w-[10px] flex-1 flex-col items-center gap-1"
                title={`${s.label} · 방문 ${fmt(s.views)} · 혜택받기 ${fmt(s.claims)}`}
              >
                <div
                  className="flex w-full max-w-[26px] flex-col-reverse overflow-hidden rounded-t"
                  style={{ height: Math.max(2, totalH) }}
                >
                  <div
                    className="w-full bg-blue-500"
                    style={{ height: viewH }}
                  />
                  <div
                    className="w-full bg-emerald-500"
                    style={{ height: claimH }}
                  />
                </div>
                <span className="h-3 text-[9px] tabular-nums text-gray-400">
                  {i % labelEvery === 0 ? s.label : ""}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function SummaryCard({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: typeof Eye;
  label: string;
  value: string;
  sub?: string;
  tone: "blue" | "emerald" | "violet" | "amber";
}) {
  const tones = {
    blue: "text-blue-600 bg-blue-50",
    emerald: "text-emerald-600 bg-emerald-50",
    violet: "text-violet-600 bg-violet-50",
    amber: "text-amber-600 bg-amber-50",
  } as const;
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "inline-flex size-7 items-center justify-center rounded-lg",
            tones[tone],
          )}
        >
          <Icon className="size-4" strokeWidth={2} />
        </span>
        <span className="text-[12px] font-medium text-gray-500">{label}</span>
      </div>
      <div className="mt-2.5 text-[24px] font-bold tabular-nums text-gray-900">
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[11.5px] text-gray-400">{sub}</div>}
    </div>
  );
}

function KindBadge({ kind }: { kind: string }) {
  const isClaim = kind === "CLAIM";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold",
        isClaim ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700",
      )}
    >
      {isClaim ? (
        <MousePointerClick className="size-2.5" strokeWidth={2.4} />
      ) : (
        <Eye className="size-2.5" strokeWidth={2.4} />
      )}
      {isClaim ? "혜택받기" : "방문"}
    </span>
  );
}

function SectionCard({
  title,
  desc,
  icon: Icon,
  children,
}: {
  title: string;
  desc?: string;
  icon: typeof Eye;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-5 py-3.5">
        <h3 className="flex items-center gap-1.5 text-[14px] font-semibold text-gray-900">
          <Icon className="size-4 text-gray-400" strokeWidth={2} />
          {title}
        </h3>
        {desc && <p className="mt-0.5 text-[11.5px] text-gray-400">{desc}</p>}
      </div>
      {children}
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <div className="px-5 py-10 text-center text-[12.5px] text-gray-400">
      {text}
    </div>
  );
}

export function PromoMonitoringPanel({
  initial,
}: {
  initial: PromoMonitoringPayload;
}) {
  const [data, setData] = useState(initial);
  const [selection, setSelection] = useState<PromoMonitoringSelection>(
    initial.selection,
  );
  const [pending, startTransition] = useTransition();

  function apply(next: PromoMonitoringSelection) {
    setSelection(next);
    startTransition(async () => {
      try {
        const payload = await getPromotionMonitoring(next.mode, {
          date: next.date,
          month: next.month,
          startDate: next.start ?? undefined,
          endDate: next.end ?? undefined,
        });
        setData(payload);
      } catch {
        /* 실패는 조용히 — 기존 데이터 유지 */
      }
    });
  }

  const t = data.totals;

  return (
    <div className="space-y-5">
      {/* 기간 헤더 + 컨트롤 */}
      <div className="flex flex-col gap-3 rounded-xl border border-gray-100 bg-white px-5 py-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <p className="text-[12px] font-medium text-gray-400">집계 기간</p>
          <p
            className={cn(
              "truncate text-[18px] font-bold text-gray-900 transition-opacity",
              pending && "opacity-50",
            )}
          >
            {data.summaryLabel}
          </p>
        </div>
        <PromoPeriodControls
          selection={selection}
          pending={pending}
          onChange={apply}
        />
      </div>

      {/* 전체 요약 */}
      <div
        className={cn(
          "grid grid-cols-2 gap-3 transition-opacity lg:grid-cols-4",
          pending && "opacity-50",
        )}
      >
        <SummaryCard
          icon={Eye}
          label="총 링크 방문"
          value={fmt(t.views)}
          sub={`식별 ${fmt(t.identifiedViews)} · 익명 ${fmt(t.anonViews)}`}
          tone="blue"
        />
        <SummaryCard
          icon={MousePointerClick}
          label="혜택받기 클릭"
          value={fmt(t.claims)}
          sub="랜딩에서 CTA 누른 수"
          tone="emerald"
        />
        <SummaryCard
          icon={Users}
          label="순 방문자"
          value={fmt(t.uniqueVisitors)}
          sub="로그인+익명(근사)"
          tone="violet"
        />
        <SummaryCard
          icon={Building2}
          label="방문 학원"
          value={fmt(t.uniqueAcademies)}
          sub="링크를 눌러본 학원 수"
          tone="amber"
        />
      </div>

      {/* 추이 차트 */}
      <SectionCard
        title="기간 추이"
        desc={`${data.mode === "monthly" ? "월별" : "일별"} 방문·혜택받기 클릭 (${data.rangeLabel})`}
        icon={Activity}
      >
        <TrendChart series={data.series} mode={data.mode} />
      </SectionCard>

      {!data.hasEvents && (
        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/60 px-5 py-8 text-center text-[13px] text-gray-400">
          선택한 기간({data.summaryLabel})에 기록된 링크 활동이 없습니다.
          프로모션·번들 링크를 공유하면 방문/혜택받기 클릭이 여기 집계됩니다.
        </div>
      )}

      {/* 프로모션·번들별 */}
      <SectionCard
        title="프로모션·번들별 현황"
        desc="공유 링크마다 방문(VIEW)과 혜택받기(CLAIM) 클릭 수"
        icon={Activity}
      >
        {data.perPromotion.length === 0 && data.perBundle.length === 0 ? (
          <EmptyRow text="이 기간에 집계된 프로모션·번들 활동이 없습니다." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left">
              <thead>
                <tr className="border-b border-gray-50 bg-gray-50/60 text-[11px] font-semibold text-gray-400">
                  <th className="px-5 py-2.5">대상</th>
                  <th className="px-4 py-2.5 text-right">방문</th>
                  <th className="px-4 py-2.5 text-right">혜택받기</th>
                  <th className="px-4 py-2.5 text-right">방문 학원</th>
                  <th className="px-4 py-2.5 text-right">최근</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data.perPromotion.map((p) => (
                  <tr key={`promo-${p.promotionId}`}>
                    <td className="px-5 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[12.5px] font-semibold text-gray-800">
                          {p.name}
                        </span>
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500">
                          프로모션
                        </span>
                      </div>
                      {p.productName && (
                        <div className="text-[11px] text-gray-400">
                          {p.productName}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right text-[12.5px] font-semibold tabular-nums text-blue-600">
                      {fmt(p.views)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-[12.5px] font-semibold tabular-nums text-emerald-600">
                      {fmt(p.claims)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-[12.5px] tabular-nums text-gray-600">
                      {fmt(p.uniqueAcademies)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-[11.5px] text-gray-400">
                      {timeAgo(p.lastEventAt)}
                    </td>
                  </tr>
                ))}
                {data.perBundle.map((b) => (
                  <tr key={`bundle-${b.bundleId}`}>
                    <td className="px-5 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[12.5px] font-semibold text-gray-800">
                          {b.name}
                        </span>
                        <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-500">
                          번들
                        </span>
                      </div>
                      {b.slug && (
                        <div className="text-[11px] text-gray-400">
                          /b/{b.slug}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right text-[12.5px] font-semibold tabular-nums text-blue-600">
                      {fmt(b.views)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-[12.5px] font-semibold tabular-nums text-emerald-600">
                      {fmt(b.claims)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-[12.5px] tabular-nums text-gray-600">
                      {fmt(b.uniqueAcademies)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-[11.5px] text-gray-400">
                      {timeAgo(b.lastEventAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* 학원별 / 회원별 나란히 */}
      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard
          title="학원별 클릭"
          desc="로그인한 원장이 링크를 눌러본 학원"
          icon={Building2}
        >
          {data.perAcademy.length === 0 ? (
            <EmptyRow text="이 기간에 로그인 상태로 링크를 눌러본 학원이 없습니다." />
          ) : (
            <div className="max-h-[420px] overflow-y-auto">
              <table className="w-full text-left">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-gray-50 bg-gray-50/60 text-[11px] font-semibold text-gray-400">
                    <th className="px-5 py-2.5">학원</th>
                    <th className="px-3 py-2.5 text-right">방문</th>
                    <th className="px-3 py-2.5 text-right">혜택</th>
                    <th className="px-4 py-2.5 text-right">최근</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.perAcademy.map((a) => (
                    <tr key={a.academyId}>
                      <td className="px-5 py-2.5">
                        <div className="text-[12.5px] font-semibold text-gray-800">
                          {a.academyName}
                        </div>
                        <div className="text-[11px] text-gray-400">
                          방문 회원 {fmt(a.members)}명
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right text-[12.5px] font-semibold tabular-nums text-blue-600">
                        {fmt(a.views)}
                      </td>
                      <td className="px-3 py-2.5 text-right text-[12.5px] font-semibold tabular-nums text-emerald-600">
                        {fmt(a.claims)}
                      </td>
                      <td className="px-4 py-2.5 text-right text-[11.5px] text-gray-400">
                        {timeAgo(a.lastEventAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="회원별 클릭"
          desc="누가 링크를 눌러봤는지(로그인한 원장)"
          icon={User}
        >
          {data.perMember.length === 0 ? (
            <EmptyRow text="이 기간에 로그인 상태로 링크를 눌러본 회원이 없습니다." />
          ) : (
            <div className="max-h-[420px] overflow-y-auto">
              <table className="w-full text-left">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-gray-50 bg-gray-50/60 text-[11px] font-semibold text-gray-400">
                    <th className="px-5 py-2.5">회원</th>
                    <th className="px-3 py-2.5 text-right">방문</th>
                    <th className="px-3 py-2.5 text-right">혜택</th>
                    <th className="px-4 py-2.5 text-right">최근</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.perMember.map((m) => (
                    <tr key={m.staffId}>
                      <td className="px-5 py-2.5">
                        <div className="text-[12.5px] font-semibold text-gray-800">
                          {m.name}
                        </div>
                        <div className="text-[11px] text-gray-400">
                          {m.academyName}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right text-[12.5px] font-semibold tabular-nums text-blue-600">
                        {fmt(m.views)}
                      </td>
                      <td className="px-3 py-2.5 text-right text-[12.5px] font-semibold tabular-nums text-emerald-600">
                        {fmt(m.claims)}
                      </td>
                      <td className="px-4 py-2.5 text-right text-[11.5px] text-gray-400">
                        {timeAgo(m.lastEventAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </div>

      {/* 최근 활동 */}
      <SectionCard
        title="최근 활동"
        desc="선택 기간의 가장 최근 링크 방문·혜택받기 클릭"
        icon={Activity}
      >
        {data.recent.length === 0 ? (
          <EmptyRow text="이 기간에 최근 활동이 없습니다." />
        ) : (
          <ul className="divide-y divide-gray-50">
            {data.recent.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-3 px-5 py-2.5"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <KindBadge kind={r.kind} />
                  <span className="truncate text-[12.5px] font-medium text-gray-800">
                    {r.label}
                  </span>
                  <span className="truncate text-[11.5px] text-gray-400">
                    {r.who}
                  </span>
                </div>
                <span className="shrink-0 text-[11.5px] tabular-nums text-gray-400">
                  {timeAgo(r.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
