"use client";

// ============================================================================
// 스텝4 — 학습 주기 (캘린더 중심 재설계, 2026-08-10 사용자 확정)
//
// "하루 양으로 / 기간으로" 탭 이분법을 폐기했다. 캘린더가 곧 인터페이스다:
//   · 하루 양을 바꾸면 → 캘린더의 끝나는 날이 즉시 이동(순수 계산, 왕복 0)
//   · 캘린더에서 날짜를 찍으면 → 그날까지 끝나도록 하루 양을 역산해 patch
//   · 시작일 이전을 찍으면 → 시작일이 옮겨진다 (보내기 화면의 초기 시작일로 전달)
// 산식은 wordbook-plan-types 순수 함수만 쓴다. 하루 양 변경만이 셸의
// 디바운스 플랜 재계산(400ms)을 유발한다 — 캘린더 채색 자체는 서버와 무관.
// 계약: wizard-types.ts StepProps · 스펙 §5 파생값 공식 · §7 스타일
// ============================================================================

import { useMemo, useState } from "react";
import { AlertTriangle, Minus, Plus } from "lucide-react";
import {
  clampWordsPerDay,
  formatPlanPeriod,
  nthStudyDate,
  PLAN_UNITS_MAX,
  planTotalDays,
  PLAN_WPD_MAX,
  PLAN_WPD_MIN,
  STUDY_DAY_LABELS,
  studyDaysShort,
  todayKstDate,
} from "@/lib/vocab-drill/wordbook-plan-types";

/** 요일 퀵 프리셋 — 학원 관례 4종 */
const DAY_QUICK_PRESETS: { label: string; days: number[] }[] = [
  { label: "평일", days: [1, 2, 3, 4, 5] },
  { label: "매일", days: [0, 1, 2, 3, 4, 5, 6] },
  { label: "월수금", days: [1, 3, 5] },
  { label: "화목토", days: [2, 4, 6] },
];
import {
  fmtKo,
  studyDaysBetween,
  WizardCalendar,
} from "./wizard-calendar";
import { WPD_PRESETS, type StepProps } from "./wizard-types";

/** 하루 양 직접 입력 — 타이핑 중 클램프 개입 없이 blur/Enter 에 커밋 */
function WordsPerDayInput({
  value,
  onCommit,
}: {
  value: number;
  onCommit: (n: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  const commit = () => {
    const n = clampWordsPerDay(Math.round(Number(draft)));
    setDraft(String(n));
    onCommit(n);
  };
  return (
    <input
      type="number"
      inputMode="numeric"
      min={PLAN_WPD_MIN}
      max={PLAN_WPD_MAX}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
      }}
      aria-label="하루 단어 수 직접 입력"
      // w-20 + 스피너 제거 — number 입력의 증감 화살표가 폭을 먹어 "100" 세 자리가
      // 잘렸다(실사용 스크린샷). 증감은 옆의 −/+ 버튼이 담당하므로 스피너는 불필요.
      className="h-9 w-20 rounded-lg border border-slate-200 bg-white px-2 text-center text-[13px] font-semibold tabular-nums text-slate-800 [appearance:textfield] focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
    />
  );
}

export function StepSchedule({ state, patch, plan, liveTotal }: StepProps) {
  const today = useMemo(() => todayKstDate(), []);
  // 스펙 §5 파생값 공식 — 전 스텝 공통.
  const totalPlanned =
    plan?.totalPlanned ?? Math.min(state.size, liveTotal ?? state.size);
  const totalDays = planTotalDays(totalPlanned, state.wordsPerDay);
  const overUnits = totalDays > PLAN_UNITS_MAX;
  /**
   * 이 교재에서 실제로 허용되는 하루 최소량 — 단계 상한(PLAN_UNITS_MAX)의
   * 역수다. 2,000단어면 ceil(2000/120)=17. 캘린더·스테퍼·프리셋·직접 입력이
   * 전부 이 값 아래로 못 내려가게 해서 "눌러도 적용 안 되는" 무효 상태를
   * 원천 차단한다(2026-08-10 실사용 피드백).
   */
  const effMinWpd = Math.max(
    PLAN_WPD_MIN,
    Math.ceil(Math.max(1, totalPlanned) / PLAN_UNITS_MAX),
  );
  const clampEff = (v: number) =>
    Math.max(effMinWpd, clampWordsPerDay(v));

  // 시작일 방어 — 과거로 남아 있으면(어제 열어 둔 위저드) 오늘로 끌어올린다.
  const startDate = state.startDate >= today ? state.startDate : today;
  const endDate = useMemo(
    () => nthStudyDate(startDate, totalDays, state.studyDays),
    [startDate, totalDays, state.studyDays],
  );

  /** 캘린더 클릭 — 앞이면 시작일 이동, 뒤면 그날을 끝으로 하루 양 역산 */
  const [snapNote, setSnapNote] = useState<string | null>(null);
  const pickDate = (ymd: string) => {
    if (ymd <= startDate) {
      // 시작일 이동(과거는 오늘로) — 하루 양 유지, 끝나는 날만 따라 움직인다.
      const next = ymd < today ? today : ymd;
      setSnapNote(ymd < today ? "지난 날짜는 고를 수 없어 오늘부터 시작해요." : null);
      patch({ startDate: next });
      return;
    }
    // 쉬는 요일을 찍었으면 그 사실부터 말한다 — 계산은 가장 가까운 학습일 기준.
    const clickedDow = Number(
      new Date(`${ymd}T12:00:00Z`).getUTCDay(),
    );
    const restPrefix = !state.studyDays.includes(clickedDow)
      ? `${STUDY_DAY_LABELS[clickedDow]}요일은 쉬는 날이에요 — 가까운 학습일 기준으로 맞췄어요. `
      : "";
    const days = Math.max(1, studyDaysBetween(startDate, ymd, state.studyDays));
    const ideal = Math.ceil(totalPlanned / days);
    const clamped = clampEff(ideal);
    patch({ wordsPerDay: clamped });
    if (clamped !== ideal) {
      const realEnd = nthStudyDate(
        startDate,
        planTotalDays(totalPlanned, clamped),
        state.studyDays,
      );
      setSnapNote(
        restPrefix +
          (ideal > PLAN_WPD_MAX
            ? `그날까지 끝내려면 하루 ${ideal.toLocaleString()}개를 외워야 해요 — 최대는 ${PLAN_WPD_MAX}개라, 가장 빨라도 ${fmtKo(realEnd)}에 끝나요.`
            : `${totalPlanned.toLocaleString()}단어 교재는 최대 ${PLAN_UNITS_MAX}단계(하루 ${effMinWpd}개)까지예요 — 가장 길게는 ${fmtKo(realEnd)}까지 갈 수 있어요.`),
      );
    } else {
      setSnapNote(restPrefix || null);
    }
  };

  /** 요일 토글 — 마지막 하나는 못 뺀다(학습일 0일 교재는 성립 불가) */
  const toggleDay = (dow: number) => {
    const cur = state.studyDays;
    if (cur.includes(dow)) {
      if (cur.length <= 1) {
        setSnapNote("적어도 하루는 학습해야 해요.");
        return;
      }
      patch({ studyDays: cur.filter((d) => d !== dow) });
    } else {
      patch({ studyDays: [...cur, dow].sort((a, b) => a - b) });
    }
  };

  return (
    <div className="mx-auto max-w-[920px]">
      <p className="mb-4 text-[12.5px] leading-relaxed text-slate-500 break-keep">
        캘린더에서 <b className="text-emerald-600">끝내고 싶은 날</b>을 누르면 하루
        양이 자동으로 계산돼요. 하루 양을 직접 바꾸면 캘린더가 따라 움직입니다.
      </p>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        {/* ── 좌: 컨트롤 + 요약 ── */}
        <div className="space-y-4">
          <section>
            <h3 className="mb-2 text-[13.5px] font-bold text-slate-800">
              하루에 몇 단어씩?
            </h3>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => patch({ wordsPerDay: clampEff(state.wordsPerDay - 5) })}
                disabled={state.wordsPerDay <= effMinWpd}
                aria-label="하루 양 5 줄이기"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-50 disabled:opacity-35"
              >
                <Minus size={15} />
              </button>
              <WordsPerDayInput
                key={state.wordsPerDay}
                value={state.wordsPerDay}
                onCommit={(n) => patch({ wordsPerDay: clampEff(n) })}
              />
              <button
                type="button"
                onClick={() => patch({ wordsPerDay: clampEff(state.wordsPerDay + 5) })}
                disabled={state.wordsPerDay >= PLAN_WPD_MAX}
                aria-label="하루 양 5 늘리기"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-50 disabled:opacity-35"
              >
                <Plus size={15} />
              </button>
              <span className="text-[11.5px] text-slate-400">개씩</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {WPD_PRESETS.map((n) => {
                const below = n < effMinWpd;
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => patch({ wordsPerDay: n })}
                    disabled={below}
                    aria-pressed={state.wordsPerDay === n}
                    title={
                      below
                        ? `${totalPlanned.toLocaleString()}단어 교재는 하루 ${effMinWpd}개가 최소예요(최대 ${PLAN_UNITS_MAX}단계)`
                        : undefined
                    }
                    className={`h-8 rounded-lg border px-3 text-[12px] font-semibold tabular-nums transition ${
                      state.wordsPerDay === n
                        ? "border-blue-600 bg-blue-50/60 text-blue-700 ring-1 ring-blue-100"
                        : below
                          ? "cursor-not-allowed border-slate-100 text-slate-300"
                          : "border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    {n}
                  </button>
                );
              })}
            </div>
            {effMinWpd > PLAN_WPD_MIN && (
              <p className="mt-1.5 text-[10.5px] tabular-nums text-slate-400 break-keep">
                이 교재({totalPlanned.toLocaleString()}단어)는 최대 {PLAN_UNITS_MAX}
                단계까지 나눌 수 있어 하루 {effMinWpd}개가 최소예요.
              </p>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-[13.5px] font-bold text-slate-800">
              무슨 요일에 할까요?
            </h3>
            {/* 요일 7칩 — 학원 리듬(월수금·화목토)을 그대로. 최소 1일은 남긴다 */}
            <div className="grid grid-cols-7 gap-1">
              {STUDY_DAY_LABELS.map((label, dow) => {
                const on = state.studyDays.includes(dow);
                return (
                  <button
                    key={dow}
                    type="button"
                    onClick={() => toggleDay(dow)}
                    aria-pressed={on}
                    aria-label={`${label}요일 ${on ? "빼기" : "넣기"}`}
                    className={`flex h-11 items-center justify-center rounded-lg border text-[13px] font-bold transition ${
                      on
                        ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                        : dow === 0
                          ? "border-slate-200 bg-white text-rose-300 hover:border-slate-300 hover:bg-slate-50"
                          : "border-slate-200 bg-white text-slate-400 hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {DAY_QUICK_PRESETS.map((q) => {
                const on =
                  state.studyDays.length === q.days.length &&
                  state.studyDays.every((d, i) => d === q.days[i]);
                return (
                  <button
                    key={q.label}
                    type="button"
                    onClick={() => patch({ studyDays: [...q.days] })}
                    aria-pressed={on}
                    className={`h-8 rounded-lg border px-3 text-[12px] font-medium transition ${
                      on
                        ? "border-blue-600 bg-blue-50/60 text-blue-700 ring-1 ring-blue-100"
                        : "border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    {q.label}
                  </button>
                );
              })}
            </div>
          </section>

          {/* 요약 — 계산 결과를 문장으로 확정 */}
          <section
            className={`rounded-xl border p-4 ${
              overUnits
                ? "border-rose-200 bg-rose-50"
                : "border-emerald-200 bg-emerald-50"
            }`}
          >
            <p className="text-[10.5px] font-medium tabular-nums text-emerald-700/70">
              총 {totalPlanned.toLocaleString()}단어 기준
            </p>
            <p className="mt-1 text-[17px] font-bold tabular-nums text-slate-800 break-keep">
              하루 {state.wordsPerDay}단어 × 학습일 {totalDays}일
            </p>
            <p className="mt-0.5 text-[12px] tabular-nums text-emerald-700 break-keep">
              {formatPlanPeriod(totalDays, state.studyDays)} · {studyDaysShort(state.studyDays)}
            </p>
            <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] font-medium tabular-nums break-keep">
              <span className="rounded-md bg-blue-600 px-1.5 py-0.5 text-white">
                시작 {fmtKo(startDate)}
              </span>
              <span className="text-slate-400">→</span>
              <span className="rounded-md bg-emerald-500 px-1.5 py-0.5 text-white">
                끝 {fmtKo(endDate)}
              </span>
            </p>
            {overUnits && (
              <p className="mt-2 flex items-start gap-1.5 text-[11.5px] text-rose-600 break-keep">
                <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                교재는 최대 {PLAN_UNITS_MAX}단계까지 나눌 수 있어요 — 하루{" "}
                {effMinWpd}개 이상으로 잡으면 풀려요.
              </p>
            )}
            {/* 클릭 피드백은 캘린더 카드 안(notice)으로 옮겼다 — 클릭한 손 옆에서
                이유가 보여야 한다(실사용 피드백). 여기는 상한 백스톱만 남긴다. */}
            <p className="mt-2 border-t border-emerald-100 pt-2 text-[10.5px] leading-relaxed text-emerald-700/70 break-keep">
              학생에게 보내면 이 리듬대로 매 학습일 자동으로 열려요. 시작일은
              보낼 때 바꿀 수 있어요.
            </p>
          </section>
        </div>

        {/* ── 우: 캘린더 ── */}
        <WizardCalendar
          startDate={startDate}
          endDate={endDate}
          totalDays={totalDays}
          studyDays={state.studyDays}
          wordsPerDay={state.wordsPerDay}
          totalPlanned={totalPlanned}
          todayYmd={today}
          onPickDate={pickDate}
          notice={snapNote}
        />
      </div>
    </div>
  );
}
