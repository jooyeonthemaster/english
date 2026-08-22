"use client";

// ============================================================================
// 학습 캘린더 — 스텝4의 중심 표면
//
// 학습일마다 "그날 외울 단어 수"를 칠해 보여 주고, 날짜를 누르면:
//   시작일 이전/당일 클릭 → 시작일 이동
//   시작일 이후 클릭     → 그날을 "끝나는 날"로 → 하루 양을 역산해 patch
// 하루 양·주당 일수가 바뀌면 채색이 즉시 다시 계산된다(양방향).
//
// 최적화 계약: 날짜→학습일 매핑은 학습일 수 K(≤60) 만큼만 계산해 Map 으로
// 메모이즈하고, 달 그리드는 보는 달이 바뀔 때만 재구성한다. 서버 왕복 0 —
// 여기서 일어나는 모든 반응은 순수 계산이다(하루 양 변경만 셸의 디바운스
// 플랜 재계산을 유발한다).
// ============================================================================

import { memo, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const DOW_LABEL = ["일", "월", "화", "수", "목", "금", "토"] as const;

// ── 날짜 유틸 (전부 "YYYY-MM-DD" 문자열 + UTC 정오 기준 — 시간대 안전) ───────

function parse(ymd: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return new Date(NaN);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
}
function fmt(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
export function fmtKo(ymd: string): string {
  const d = parse(ymd);
  if (Number.isNaN(d.getTime())) return ymd;
  return `${d.getUTCMonth() + 1}.${d.getUTCDate()}(${DOW_LABEL[d.getUTCDay()]})`;
}
function isStudyDow(dow: number, studyDays: number[]): boolean {
  return studyDays.includes(dow);
}

/** [start..end] 구간의 학습일 수 — 캘린더에서 끝날을 찍었을 때의 역산 재료 */
export function studyDaysBetween(
  start: string,
  end: string,
  studyDays: number[],
): number {
  const s = parse(start);
  const e = parse(end);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e < s) return 0;
  let n = 0;
  const cur = new Date(s);
  for (let guard = 0; guard < 1200 && cur <= e; guard += 1) {
    if (isStudyDow(cur.getUTCDay(), studyDays)) n += 1;
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return n;
}

// ── 학습일 매핑 ──────────────────────────────────────────────────────────────

export interface StudyDayInfo {
  /** 1-base 학습일 순번 = 단계 번호 */
  index: number;
  /** 그날 외울 단어 수(마지막 날만 잔여분) */
  words: number;
}

/**
 * 시작일부터 totalDays 개 학습일의 날짜 매핑 — O(K) 1회.
 * key = "YYYY-MM-DD", 마지막 학습일의 단어 수는 잔여분으로 계산한다.
 */
export function buildStudyDayMap(
  startDate: string,
  totalDays: number,
  studyDays: number[],
  wordsPerDay: number,
  totalPlanned: number,
): Map<string, StudyDayInfo> {
  const map = new Map<string, StudyDayInfo>();
  const s = parse(startDate);
  if (Number.isNaN(s.getTime()) || totalDays < 1) return map;
  const lastWords = Math.max(1, totalPlanned - (totalDays - 1) * wordsPerDay);
  const cur = new Date(s);
  let idx = 0;
  for (let guard = 0; guard < 1200 && idx < totalDays; guard += 1) {
    if (isStudyDow(cur.getUTCDay(), studyDays)) {
      idx += 1;
      map.set(fmt(cur), {
        index: idx,
        words: idx === totalDays ? lastWords : wordsPerDay,
      });
    }
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return map;
}

// ── 캘린더 본체 ──────────────────────────────────────────────────────────────

export interface WizardCalendarProps {
  startDate: string;
  /** 파생 끝나는 날("YYYY-MM-DD") — 점프 칩·강조에 쓴다 */
  endDate: string;
  totalDays: number;
  studyDays: number[];
  wordsPerDay: number;
  totalPlanned: number;
  todayYmd: string;
  /** 날짜 클릭 — 시작일 이전/당일이면 시작일 이동, 이후면 끝날 지정 */
  onPickDate: (ymd: string) => void;
  /**
   * 상호작용 피드백 — 클릭이 그대로 반영되지 못했을 때의 사유("하루 100단어가
   * 최대예요…" 등). 캘린더 **안**에 띄운다 — 왼쪽 요약에만 두면 클릭한 손
   * 옆에서는 아무 일도 없는 것처럼 보인다(실사용 피드백 2026-08-10).
   */
  notice?: string | null;
}

interface CellData {
  ymd: string;
  day: number;
  inMonth: boolean;
  dow: number;
}

function monthGrid(year: number, month0: number): CellData[] {
  const first = new Date(Date.UTC(year, month0, 1, 12));
  const startOffset = first.getUTCDay();
  const cells: CellData[] = [];
  const cur = new Date(first);
  cur.setUTCDate(cur.getUTCDate() - startOffset);
  // 6주 고정 그리드 — 달마다 높이가 출렁이지 않는다(레이아웃 안정).
  for (let i = 0; i < 42; i += 1) {
    cells.push({
      ymd: fmt(cur),
      day: cur.getUTCDate(),
      inMonth: cur.getUTCMonth() === month0,
      dow: cur.getUTCDay(),
    });
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return cells;
}

export const WizardCalendar = memo(function WizardCalendar({
  startDate,
  endDate,
  totalDays,
  studyDays,
  wordsPerDay,
  totalPlanned,
  todayYmd,
  onPickDate,
  notice,
}: WizardCalendarProps) {
  // 보는 달 — 시작일이 속한 달에서 출발, 이후엔 사용자가 자유 항해.
  const [view, setView] = useState(() => {
    const d = parse(startDate);
    return Number.isNaN(d.getTime())
      ? { y: Number(todayYmd.slice(0, 4)), m: Number(todayYmd.slice(5, 7)) - 1 }
      : { y: d.getUTCFullYear(), m: d.getUTCMonth() };
  });

  const studyMap = useMemo(
    () =>
      buildStudyDayMap(startDate, totalDays, studyDays, wordsPerDay, totalPlanned),
    [startDate, totalDays, studyDays, wordsPerDay, totalPlanned],
  );
  const cells = useMemo(() => monthGrid(view.y, view.m), [view]);

  const jump = (ymd: string) => {
    const d = parse(ymd);
    if (!Number.isNaN(d.getTime())) setView({ y: d.getUTCFullYear(), m: d.getUTCMonth() });
  };
  const nav = (delta: number) => {
    setView((v) => {
      const d = new Date(Date.UTC(v.y, v.m + delta, 1, 12));
      return { y: d.getUTCFullYear(), m: d.getUTCMonth() };
    });
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      {/* 헤더 — 달 이동 + 점프 칩 */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => nav(-1)}
            aria-label="이전 달"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="min-w-[110px] text-center text-[14px] font-bold tabular-nums text-slate-800">
            {view.y}년 {view.m + 1}월
          </span>
          <button
            type="button"
            onClick={() => nav(1)}
            aria-label="다음 달"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100"
          >
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => jump(startDate)}
            className="h-7 rounded-full border border-blue-200 bg-blue-50 px-2.5 text-[11px] font-medium text-blue-700 transition hover:bg-blue-100"
          >
            시작 {fmtKo(startDate)}
          </button>
          <button
            type="button"
            onClick={() => jump(endDate)}
            className="h-7 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 text-[11px] font-medium text-emerald-700 transition hover:bg-emerald-100"
          >
            끝 {fmtKo(endDate)}
          </button>
        </div>
      </div>

      {/* 상호작용 피드백 — 클릭이 스냅·거절된 사유를 클릭한 자리 옆에서 말한다 */}
      {notice ? (
        <p
          aria-live="polite"
          className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11.5px] font-medium leading-relaxed text-amber-700 break-keep"
        >
          {notice}
        </p>
      ) : null}

      {/* 요일 헤더 */}
      <div className="grid grid-cols-7 gap-1">
        {DOW_LABEL.map((d, i) => (
          <div
            key={d}
            className={`pb-1 text-center text-[11px] font-semibold ${
              i === 0 ? "text-rose-400" : i === 6 ? "text-blue-400" : "text-slate-400"
            }`}
          >
            {d}
          </div>
        ))}
      </div>

      {/* 날짜 그리드 — 셀은 시원하게(h-14), 내용은 숫자+단어 수만(잘림 없음) */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((c) => {
          const info = studyMap.get(c.ymd);
          const isStart = c.ymd === startDate;
          const isEnd = c.ymd === endDate && totalDays > 1;
          const isToday = c.ymd === todayYmd;
          const restDay = !isStudyDow(c.dow, studyDays);
          let cls =
            "relative flex h-14 flex-col items-center justify-center rounded-xl border text-[13px] tabular-nums transition ";
          if (!c.inMonth) {
            cls += "border-transparent text-slate-200 ";
          } else if (isStart) {
            cls += "border-blue-600 bg-blue-600 text-white shadow-sm ";
          } else if (isEnd) {
            cls += "border-emerald-500 bg-emerald-500 text-white shadow-sm ";
          } else if (info) {
            cls +=
              "cursor-pointer border-blue-100 bg-blue-50/70 text-slate-700 hover:border-blue-300 hover:bg-blue-100 ";
          } else if (restDay) {
            cls += "border-transparent bg-slate-50 text-slate-300 ";
          } else {
            cls +=
              "cursor-pointer border-transparent text-slate-500 hover:border-slate-200 hover:bg-slate-50 ";
          }
          return (
            <button
              key={c.ymd}
              type="button"
              onClick={() => c.inMonth && onPickDate(c.ymd)}
              disabled={!c.inMonth}
              aria-label={
                info
                  ? `${fmtKo(c.ymd)} — ${info.index}일차, ${info.words}단어`
                  : fmtKo(c.ymd)
              }
              className={cls}
            >
              <span className={`text-[13px] font-semibold leading-none ${isToday && !isStart && !isEnd ? "text-blue-600" : ""}`}>
                {c.day}
              </span>
              {info ? (
                <span
                  className={`mt-1 text-[10.5px] font-medium leading-none ${
                    isStart || isEnd ? "text-white/85" : "text-blue-600/80"
                  }`}
                >
                  {info.words}개
                </span>
              ) : (
                c.inMonth && restDay && (
                  <span className="mt-1 text-[10.5px] leading-none text-slate-300">쉼</span>
                )
              )}
              {isToday && !isStart && !isEnd && (
                <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-blue-500" aria-hidden />
              )}
            </button>
          );
        })}
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-slate-400 break-keep">
        날짜를 누르면 <b className="text-emerald-600">끝나는 날</b>이 그날로 맞춰지고
        하루 양이 자동으로 다시 계산돼요. 시작일보다 앞선 날짜를 누르면{" "}
        <b className="text-blue-600">시작일</b>이 옮겨져요.
      </p>
    </div>
  );
});
