"use client";

// ============================================================================
// 단어장 생성 스튜디오 — 보내기 스텝(SendStep)의 교재(시리즈) 전용 옵션
//
// basket-send 500줄 제한을 지키기 위한 분리 파일 — SendStep 이 조립한다.
// 상태(문항 수 모드·시작일)와 전송 핸들러는 SendStep 이 소유하고 여기는
// 표시만 맡는다(값의 주인 = payload 조립자 원칙).
// ⚠️ basket-send 를 import 하지 않는다 — basket-send 가 이 파일을 import
// 하므로 역방향이 생기면 순환이다. 필요한 스타일 원자(입력·칩 관용구)는
// 여기 사본으로 두되 원본과 문자 일치를 유지한다.
// 스펙: docs/wordbook-wizard-spec.md §11 (발송 통합 — 예약 개념 폐기).
// ============================================================================

import type { SendWordbookSeriesResult } from "@/actions/vocab-drill-admin/wordbook-wizard";
import type { WordbookPresetSeries } from "./wordbook-types";
import { studyDaysCadence, studyDaysLabel } from "@/lib/vocab-drill/wordbook-plan-types";

// basket-send INPUT 사본 — 문자 일치 유지(순환 import 회피).
const S_INPUT =
  "h-9 w-full rounded-md border border-slate-200 px-2.5 text-[12.5px] outline-none transition-colors focus:border-blue-400 disabled:opacity-40";

// basket-send chipCls 사본 — 문자 일치 유지(순환 import 회피).
function sChipCls(on: boolean) {
  return `flex h-7 items-center whitespace-nowrap rounded-full border px-2.5 text-[11px] font-medium transition-colors ${
    on
      ? "border-blue-300 bg-blue-50 text-blue-700"
      : "border-slate-200 text-slate-600 hover:bg-slate-50"
  }`;
}

// (일)~(토) 수제 배열 — date-fns 금지 규약.
const KO_DAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

/**
 * "YYYY-MM-DD" → "M.D(요일)" — new Date(y, m-1, d) 로컬 생성.
 * new Date("YYYY-MM-DD") 는 UTC 자정 파싱이라 KST 에서 요일이 밀릴 수 있다.
 */
export function formatKoMd(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return `${m}.${d}(${KO_DAYS[dt.getDay()]})`;
}

/**
 * 완료 화면 notice — 도크 관용구("{N}명에게 보냈습니다" + 아래 한 줄)에 맞춘 값.
 * firstOpen 은 서버 판정을 쓴다(주말 시작이면 1단계가 월요일로 밀릴 수 있다).
 */
export function seriesDoneNotice(d: SendWordbookSeriesResult): string {
  return d.firstOpen === "today"
    ? `1단계는 바로 시작 · 총 ${d.totalUnits}단계가 하루 하나씩 열려요.`
    : `${formatKoMd(d.firstOpen)}부터 1단계 시작 · 총 ${d.totalUnits}단계`;
}

/**
 * 교재 모드 전용 옵션 묶음(스펙 §11 ④~⑦) —
 * ④ 단계당 문항 수(자동 기본 + 직접 입력 5~100)
 * ⑤ 시작일(기본 오늘·min 오늘) + 주5일 캡션
 * ⑦ 제목·마감 대체 캡션 ⑥ 요약 문장(보내기 버튼 위)
 */
export function SeriesSendSection({
  series,
  today,
  autoCount,
  onAutoCountChange,
  countInput,
  onCountInputChange,
  startDate,
  onStartDateChange,
}: {
  series: WordbookPresetSeries;
  /** todayKstDate() — 부모가 계산해 내려준다(검증 기준과 동일 값 보장) */
  today: string;
  autoCount: boolean;
  onAutoCountChange: (auto: boolean) => void;
  countInput: string;
  onCountInputChange: (v: string) => void;
  startDate: string;
  onStartDateChange: (v: string) => void;
}) {
  const startPast = startDate < today;
  const cadence = studyDaysCadence(series.studyDays);
  const summary =
    startDate > today
      ? `${formatKoMd(startDate)}부터 1단계가 시작돼요 · 다음 단계는 ${cadence} 하나씩 자동으로 열려요 · 총 ${series.unitCount}단계`
      : `지금 보내면 1단계는 바로 시작되고, 다음 단계는 ${cadence} 하나씩 자동으로 열려요 · 총 ${series.unitCount}단계`;

  return (
    <>
      {/* ④ 단계당 문항 수 — 자동(단계 단어 수) 기본, 직접 입력은 5~100 */}
      <div>
        <span className="mb-1 block text-[10.5px] font-medium text-slate-500">단계당 문항 수</span>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => onAutoCountChange(true)}
            className={sChipCls(autoCount)}
            title="각 단계에 담긴 단어 수만큼 문제를 냅니다"
          >
            자동(단계 단어 수만큼)
          </button>
          <button type="button" onClick={() => onAutoCountChange(false)} className={sChipCls(!autoCount)}>
            직접 입력
          </button>
          {!autoCount && (
            <label className="block">
              <span className="sr-only">단계당 문항 수 (5~100)</span>
              {/* S_INPUT 에 h-7·w-20 을 겹치면 h-9·w-full 과 utility 순서 싸움이
                  난다(클래스 나열 순서는 우선순위가 아니다) — 전용 문자열로 명시 */}
              <input
                type="number"
                min={5}
                max={100}
                value={countInput}
                onChange={(e) => onCountInputChange(e.target.value)}
                className="h-7 w-20 rounded-md border border-slate-200 px-2 text-[12.5px] tabular-nums outline-none transition-colors focus:border-blue-400"
              />
            </label>
          )}
        </div>
      </div>

      {/* ⑤ 시작일 — 기본 오늘·min 오늘. 과거면 부모가 보내기 버튼을 잠근다 */}
      <label className="block min-w-0">
        <span className="mb-1 block text-[10.5px] font-medium text-slate-500">시작일</span>
        <input
          type="date"
          min={today}
          value={startDate}
          onChange={(e) => onStartDateChange(e.target.value)}
          className={`${S_INPUT} tabular-nums`}
        />
      </label>
      {series.studyDays.length < 7 && (
        <p className="break-keep text-[10.5px] text-slate-400">
          {studyDaysLabel(series.studyDays)} 교재예요 — 나머지 요일은 건너뛰고 열려요.
        </p>
      )}
      {startPast && (
        <p className="break-keep text-[10.5px] text-amber-600">시작일이 이미 지났어요 — 오늘부터 고를 수 있습니다.</p>
      )}

      {/* ⑦ 제목·마감 입력 대체 캡션 */}
      <p className="break-keep border-t border-slate-100 pt-2 text-[10.5px] text-slate-400">
        과제 제목은 단계별로 자동으로 붙어요 · 마감 없이 자기 속도로 따라잡을 수 있어요.
      </p>

      {/* ⑥ 요약 문장 — 보내기 버튼 바로 위 */}
      <p className="break-keep rounded bg-blue-50 px-2.5 py-2 text-[11px] font-medium tabular-nums text-blue-700">
        {summary}
      </p>
    </>
  );
}
