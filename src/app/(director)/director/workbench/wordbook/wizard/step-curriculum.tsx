"use client";

// ============================================================================
// 스텝1 — 커리큘럼 고르기 (견본 스텝: 다른 스텝은 이 파일의 밀도·관용구를 따른다)
//
// 추천 커리큘럼 8종 + 직접 설계 + (담은 단어 있으면) 담은 단어로.
// 카드를 고르면 스텝 2~4 의 기본값이 프리셋으로 채워진다 — 스텝은 건너뛰지
// 않는다(수정 기회를 항상 준다, 스펙 §1).
// ============================================================================

import { ShoppingBasket, SlidersHorizontal } from "lucide-react";
import {
  WORDBOOK_CURRICULA,
  type CurriculumAccent,
  type WordbookCurriculum,
} from "@/lib/vocab-drill/wordbook-curricula";
import {
  formatPlanPeriod,
  planTotalDays,
  studyDaysShort,
} from "@/lib/vocab-drill/wordbook-plan-types";
import {
  CURRICULUM_BASKET,
  CURRICULUM_CUSTOM,
  TILE_BASE,
  TILE_OFF,
  TILE_ON,
  type CurriculumStepProps,
} from "./wizard-types";

/** 채움=평가축 규약(wordbook-ui)과 충돌하지 않게 — 카드 악센트는 좌측 바+아이콘만 */
const ACCENT: Record<CurriculumAccent, { bar: string; chip: string }> = {
  blue: { bar: "bg-blue-500", chip: "bg-blue-50 text-blue-700" },
  emerald: { bar: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700" },
  amber: { bar: "bg-amber-500", chip: "bg-amber-50 text-amber-700" },
  purple: { bar: "bg-purple-500", chip: "bg-purple-50 text-purple-700" },
  rose: { bar: "bg-rose-500", chip: "bg-rose-50 text-rose-700" },
  slate: { bar: "bg-slate-400", chip: "bg-slate-100 text-slate-600" },
};

function periodLabel(c: WordbookCurriculum): string {
  return formatPlanPeriod(planTotalDays(c.size, c.wordsPerDay), c.studyDays);
}

/** 직접 설계·담은 단어 전환 시 프리셋 조건이 잔류하지 않게 하는 초기 기본값
 *  (검수 적발: trap-400 을 골랐다 직접 설계로 바꾸면 minTrapRate 가 남았다). */
const FRESH_DEFAULTS = {
  base: {
    allSenses: false as const,
    excludeStopwords: true,
    excludePhrase: true,
  },
  size: 600,
  order: "easy-first" as const,
  wordsPerDay: 20,
  studyDays: [1, 2, 3, 4, 5],
};

export function StepCurriculum({
  state,
  patch,
  basketCount,
  basketSenseIds,
}: CurriculumStepProps) {
  /** 사용자가 손수 지은 제목은 보존한다 — 비었거나 프리셋 제목 그대로일 때만 자동 갱신 */
  const isAutoTitle =
    !state.title.trim() ||
    WORDBOOK_CURRICULA.some((x) => x.title === state.title);

  const pickPreset = (c: WordbookCurriculum) => {
    patch({
      curriculum: c.key,
      sourceSenseIds: null,
      base: { ...c.base },
      size: c.size,
      order: c.order,
      wordsPerDay: c.wordsPerDay,
      studyDays: [...c.studyDays],
      ...(isAutoTitle ? { title: c.title } : {}),
    });
  };

  return (
    <div className="mx-auto max-w-[880px]">
      <p className="mb-4 text-[12.5px] leading-relaxed text-slate-500 break-keep">
        25개년 기출 <b className="tabular-nums">4,537개 지문</b>을 분석해 뽑은
        추천 구성이에요. 골라도 다음 단계에서 얼마든지 조정할 수 있어요.
      </p>

      {/* 추천 커리큘럼 갤러리 */}
      <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
        {WORDBOOK_CURRICULA.map((c) => {
          const on = state.curriculum === c.key;
          const a = ACCENT[c.accent];
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => pickPreset(c)}
              aria-pressed={on}
              className={`${TILE_BASE} ${on ? TILE_ON : TILE_OFF} relative flex min-h-[104px] gap-3 p-4 pl-5`}
            >
              <span
                className={`absolute left-0 top-3 bottom-3 w-1 rounded-r ${a.bar}`}
                aria-hidden
              />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[14.5px] font-bold text-slate-800 break-keep">
                    {c.title}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10.5px] font-medium ${a.chip}`}
                  >
                    {c.audience}
                  </span>
                </span>
                <span className="mt-1 block text-[11.5px] leading-relaxed text-slate-500 break-keep">
                  {c.tagline}
                </span>
                <span className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] font-medium text-slate-600">
                  <span className="tabular-nums">{c.size.toLocaleString()}단어</span>
                  <span className="tabular-nums">하루 {c.wordsPerDay}개</span>
                  <span className="tabular-nums">
                    {studyDaysShort(c.studyDays)} · {periodLabel(c)}
                  </span>
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/* 직접 설계 · 담은 단어로 */}
      <div className="mt-4 grid grid-cols-1 gap-2.5 md:grid-cols-2">
        <button
          type="button"
          onClick={() =>
            patch({
              curriculum: CURRICULUM_CUSTOM,
              sourceSenseIds: null,
              ...FRESH_DEFAULTS,
              ...(isAutoTitle ? { title: "" } : {}),
            })
          }
          aria-pressed={state.curriculum === CURRICULUM_CUSTOM}
          className={`${TILE_BASE} ${
            state.curriculum === CURRICULUM_CUSTOM ? TILE_ON : TILE_OFF
          } flex min-h-[88px] items-center gap-3 border-dashed p-4`}
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
            <SlidersHorizontal size={18} />
          </span>
          <span className="min-w-0">
            <span className="block text-[14px] font-bold text-slate-800">
              내가 직접 설계할게요
            </span>
            <span className="mt-0.5 block text-[11.5px] text-slate-500 break-keep">
              학년·수준·난이도·품사까지 조건을 직접 고릅니다.
            </span>
          </span>
        </button>
        {basketCount > 0 && (
          <button
            type="button"
            onClick={() =>
              patch({
                curriculum: CURRICULUM_BASKET,
                sourceSenseIds: [...basketSenseIds],
                ...FRESH_DEFAULTS,
                size: basketCount,
                ...(isAutoTitle ? { title: "" } : {}),
              })
            }
            aria-pressed={state.curriculum === CURRICULUM_BASKET}
            className={`${TILE_BASE} ${
              state.curriculum === CURRICULUM_BASKET ? TILE_ON : TILE_OFF
            } flex min-h-[88px] items-center gap-3 border-dashed p-4`}
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
              <ShoppingBasket size={18} />
            </span>
            <span className="min-w-0">
              <span className="block text-[14px] font-bold text-slate-800">
                담아 둔 단어 {basketCount.toLocaleString()}개로 만들게요
              </span>
              <span className="mt-0.5 block text-[11.5px] text-slate-500 break-keep">
                탐색 화면에서 직접 고른 단어를 그대로 교재로 엮습니다.
              </span>
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
