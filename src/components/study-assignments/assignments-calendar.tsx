"use client";

// ============================================================================
// 과제 월 캘린더 — 순수 CSS grid 7열 (라이브러리 없음, 설계 §2 slate/blue)
//
// dueAt 이 있는 과제는 마감일 셀에 도트+제목 칩(kind 톤)으로, 마감 없는
// 과제는 시작일(availableFrom) 셀에 점선 칩("시작" 접두)으로 표시한다 —
// 서버 월 조회의 dueAt:null OR-암과 짝을 이루는 표시(전량 폐기 부정합 수리).
// 셀 클릭 = 그 날짜 과제로 목록 필터(토글). ◀▶ 월 이동은 부모
// (assignments-board-client)가 listStudyAssignments({month}) 재조회로
// 응답한다 — 이 컴포넌트는 표시·선택만 담당하는 프레젠테이션 계층.
// ============================================================================

import { ChevronLeft, ChevronRight } from "lucide-react";
import type { StudyAssignmentListRow, StudyKindTone } from "@/lib/study-assignments/types";
import { STUDY_KIND_META } from "@/lib/study-assignments/types";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

const KIND_CHIP_TONES: Record<StudyKindTone, string> = {
  blue: "bg-blue-50 text-blue-700",
  teal: "bg-teal-50 text-teal-700",
  slate: "bg-slate-100 text-slate-600",
  indigo: "bg-indigo-50 text-indigo-700",
  emerald: "bg-emerald-50 text-emerald-700",
};

const KIND_DOT_TONES: Record<StudyKindTone, string> = {
  blue: "bg-blue-500",
  teal: "bg-teal-500",
  slate: "bg-slate-400",
  indigo: "bg-indigo-500",
  emerald: "bg-emerald-500",
};

/** 시작일(마감 없음) 아웃라인 도트 — 채운 마감 도트와 시각 구분 */
const KIND_OUTLINE_DOT_TONES: Record<StudyKindTone, string> = {
  blue: "border-blue-500",
  teal: "border-teal-500",
  slate: "border-slate-400",
  indigo: "border-indigo-500",
  emerald: "border-emerald-500",
};

/** 시작일(마감 없음) 점선 칩 — kind 톤 보더+텍스트 */
const START_CHIP_TONES: Record<StudyKindTone, string> = {
  blue: "border-blue-300 text-blue-700",
  teal: "border-teal-300 text-teal-700",
  slate: "border-slate-300 text-slate-600",
  indigo: "border-indigo-300 text-indigo-700",
  emerald: "border-emerald-300 text-emerald-700",
};

/** 서울(UTC+9) 달력일 키 — "YYYY-MM-DD" */
export function seoulDateKey(date: string | Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(date));
}

/** "YYYY-MM" 에 delta 개월 가감 */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function AssignmentsCalendar({
  month,
  rows,
  selectedDate,
  onSelectDate,
  onMonthChange,
  loading,
}: {
  /** 표시 중인 달 — "YYYY-MM" */
  month: string;
  /** 이 달 데이터(kind·status 필터 적용 후) — 마감 없는 과제는 시작일 셀에 점선 표시 */
  rows: StudyAssignmentListRow[];
  /** 선택된 날짜 필터 — "YYYY-MM-DD" | null */
  selectedDate: string | null;
  onSelectDate: (date: string | null) => void;
  onMonthChange: (month: string) => void;
  loading?: boolean;
}) {
  const [y, m] = month.split("-").map(Number);
  // 달력 수치 계산은 타임존 무관(순수 달력 산술) — UTC 고정으로 결정론화
  const firstWeekday = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const todayKey = seoulDateKey(new Date());

  const byDate = new Map<string, StudyAssignmentListRow[]>();
  // 마감 없는 과제는 시작일(availableFrom) 셀로 — dueAt 없음 = 전량 미표시였던
  // 데이터·표시 부정합(서버는 내려보내는데 캘린더가 폐기)의 수리.
  const startByDate = new Map<string, StudyAssignmentListRow[]>();
  for (const row of rows) {
    const map = row.dueAt ? byDate : startByDate;
    const key = seoulDateKey(row.dueAt ?? row.availableFrom);
    const list = map.get(key);
    if (list) list.push(row);
    else map.set(key, [row]);
  }

  // 인접월(전월 말·익월 초) 날짜는 slate-300 음영의 비대화형 셀로 채운다
  const prevMonthDays = new Date(Date.UTC(y, m - 1, 0)).getUTCDate();
  const trailingCount = (7 - ((firstWeekday + daysInMonth) % 7)) % 7;
  const cells: { day: number; inMonth: boolean }[] = [
    ...Array.from({ length: firstWeekday }, (_, i) => ({
      day: prevMonthDays - firstWeekday + 1 + i,
      inMonth: false,
    })),
    ...Array.from({ length: daysInMonth }, (_, i) => ({ day: i + 1, inMonth: true })),
    ...Array.from({ length: trailingCount }, (_, i) => ({ day: i + 1, inMonth: false })),
  ];

  return (
    // h-full — 보드 그리드가 좌우 컬럼 높이를 맞추므로(§6 섹션 높이 정합)
    // 날짜 셀이 남는 높이를 나눠 갖는다(auto-rows-fr).
    <div className="flex h-full min-w-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white">
      {/* 월 이동 헤더 */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2.5">
        <p className="text-[13.5px] font-bold tabular-nums text-slate-900">
          {y}년 {m}월
          {loading ? (
            <span className="ml-2 text-[11px] font-medium text-slate-400">불러오는 중…</span>
          ) : null}
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onMonthChange(shiftMonth(month, -1))}
            aria-label="이전 달"
            className="flex size-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
          >
            <ChevronLeft className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => onMonthChange(shiftMonth(month, 1))}
            aria-label="다음 달"
            className="flex size-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
          >
            <ChevronRight className="size-4" aria-hidden />
          </button>
        </div>
      </div>

      {/* 요일 헤더 */}
      <div className="grid grid-cols-7 border-b border-slate-100">
        {WEEKDAYS.map((w, i) => (
          <span
            key={w}
            className={cn(
              "py-1.5 text-center text-[11px] font-semibold",
              i === 0 ? "text-rose-400" : i === 6 ? "text-blue-400" : "text-slate-400",
            )}
          >
            {w}
          </span>
        ))}
      </div>

      {/* 날짜 셀 — @container: 칩/도트 스위치는 뷰포트가 아니라 그리드 실폭 기준 */}
      <div className="@container grid flex-1 auto-rows-fr grid-cols-7 gap-1 p-1.5">
        {cells.map(({ day, inMonth }, idx) => {
          if (!inMonth) {
            return (
              <div key={`pad-${idx}`} className="min-h-[56px] p-1 sm:min-h-[68px]" aria-hidden>
                <span className="flex size-5 items-center justify-center text-[11px] font-semibold tabular-nums text-slate-300">
                  {day}
                </span>
              </div>
            );
          }
          const key = `${month}-${String(day).padStart(2, "0")}`;
          const dayRows = byDate.get(key) ?? [];
          const startRows = startByDate.get(key) ?? [];
          const total = dayRows.length + startRows.length;
          const isToday = key === todayKey;
          const isSelected = key === selectedDate;
          // aria-label 이 있으면 서브트리(sr-only kind 라벨)는 접근성 이름에서 무시되므로
          // kind 정보를 aria-label 문자열에 직접 합쳐 스크린리더에 전달한다
          const kindNames = [...dayRows, ...startRows]
            .map((r) => STUDY_KIND_META[r.kind].label)
            .join(", ");
          const ariaLabel = [
            `${m}월 ${day}일`,
            dayRows.length > 0 ? `마감 과제 ${dayRows.length}건` : null,
            startRows.length > 0 ? `시작 과제 ${startRows.length}건` : null,
            kindNames || null,
          ]
            .filter(Boolean)
            .join(" · ");
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelectDate(isSelected ? null : key)}
              aria-pressed={isSelected}
              aria-label={ariaLabel}
              className={cn(
                "flex min-h-[56px] min-w-0 flex-col items-stretch gap-1 rounded-md border p-1 text-left transition-colors sm:min-h-[68px]",
                isSelected
                  ? "border-blue-600 bg-blue-50/40 shadow-sm"
                  : "border-transparent hover:border-slate-200 hover:bg-slate-50",
              )}
            >
              <span
                className={cn(
                  "flex size-5 items-center justify-center self-start rounded-full text-[11px] font-semibold tabular-nums",
                  isToday
                    ? "bg-blue-600 text-white"
                    : idx % 7 === 0
                      ? "text-rose-400"
                      : idx % 7 === 6
                        ? "text-blue-400"
                        : "text-slate-500",
                )}
              >
                {day}
              </span>

              {/* 좁은 컨테이너(셀 폭 부족): 도트만 — 마감=채움, 시작=아웃라인 */}
              {total > 0 ? (
                <span className="flex items-center gap-0.5 pl-0.5 @[560px]:hidden">
                  {dayRows.slice(0, 3).map((r) => (
                    <span
                      key={r.id}
                      className={cn(
                        "size-1.5 rounded-full",
                        KIND_DOT_TONES[STUDY_KIND_META[r.kind].tone],
                      )}
                      aria-hidden
                    />
                  ))}
                  {startRows.slice(0, Math.max(0, 3 - dayRows.length)).map((r) => (
                    <span
                      key={r.id}
                      className={cn(
                        "size-1.5 rounded-full border bg-white",
                        KIND_OUTLINE_DOT_TONES[STUDY_KIND_META[r.kind].tone],
                      )}
                      aria-hidden
                    />
                  ))}
                  {total > 3 ? (
                    <span className="text-[9px] font-semibold text-slate-400">
                      +{total - 3}
                    </span>
                  ) : null}
                </span>
              ) : null}

              {/* 넓은 컨테이너: 제목 칩(kind 톤) — 2건 이상은 첫 칩 + "+N건" 축약.
                  마감 칩 우선, 마감 없는 날은 시작(점선) 칩 1개 */}
              <span className="hidden min-w-0 flex-col gap-0.5 @[560px]:flex">
                {dayRows.slice(0, 1).map((r) => (
                  <span
                    key={r.id}
                    title={r.title}
                    className={cn(
                      "flex min-w-0 items-center gap-1 rounded px-1 py-0.5",
                      KIND_CHIP_TONES[STUDY_KIND_META[r.kind].tone],
                    )}
                  >
                    <span
                      className={cn(
                        "size-1 shrink-0 rounded-full",
                        KIND_DOT_TONES[STUDY_KIND_META[r.kind].tone],
                      )}
                      aria-hidden
                    />
                    <span className="truncate text-[10px] font-semibold leading-tight">
                      {r.title}
                    </span>
                  </span>
                ))}
                {dayRows.length === 0
                  ? startRows.slice(0, 1).map((r) => (
                      <span
                        key={r.id}
                        title={r.title}
                        className={cn(
                          "flex min-w-0 items-center gap-1 rounded border border-dashed px-1 py-0.5",
                          START_CHIP_TONES[STUDY_KIND_META[r.kind].tone],
                        )}
                      >
                        <span className="shrink-0 text-[9px] font-bold opacity-70">시작</span>
                        <span className="truncate text-[10px] font-semibold leading-tight">
                          {r.title}
                        </span>
                      </span>
                    ))
                  : null}
                {total > 1 ? (
                  <span
                    title={[...dayRows, ...startRows]
                      .slice(1)
                      .map((r) => r.title)
                      .join("\n")}
                    className="pl-1 text-[10px] font-semibold text-slate-400"
                  >
                    +{total - 1}건
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>

      {/* kind 색 범례 */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-100 px-3 py-2">
        {(Object.keys(STUDY_KIND_META) as (keyof typeof STUDY_KIND_META)[]).map((kind) => (
          <span key={kind} className="inline-flex items-center gap-1 text-[10.5px] text-slate-400">
            <span
              className={cn("size-1.5 rounded-full", KIND_DOT_TONES[STUDY_KIND_META[kind].tone])}
              aria-hidden
            />
            {STUDY_KIND_META[kind].label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1 text-[10.5px] text-slate-400">
          <span
            className="size-1.5 rounded-full border border-dashed border-slate-400 bg-white"
            aria-hidden
          />
          시작일(마감 없음)
        </span>
      </div>
    </div>
  );
}
