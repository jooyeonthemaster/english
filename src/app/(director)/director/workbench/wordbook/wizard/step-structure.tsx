"use client";

// ============================================================================
// 스텝3 — 구성 방식 (단계 정렬·분류 체계 4종 + 단계 미리보기)
//
// 방식 문안은 WORDBOOK_ORDER_SCHEMES 정본 그대로(재창작 금지). 타일을 고르면
// patch({ order }) 만 한다 — 셸이 planKey 변화를 감지해 플랜을 자동 재계산하고,
// 재계산 중에도 이전 plan 을 유지하므로 여기서는 dim + 배지만 얹는다(빈 화면 금지).
// 계약: wizard-types.ts StepProps · 확정 스펙: docs/wordbook-wizard-spec.md §5·§7
// ============================================================================

import {
  AlertTriangle,
  Dices,
  Flame,
  Group,
  Layers,
  Loader2,
  MoreHorizontal,
  RotateCw,
  Shuffle,
  Sprout,
  type LucideIcon,
} from "lucide-react";
import {
  WORDBOOK_ORDER_SCHEMES,
  type WordbookOrderScheme,
  type WordbookUnitPlan,
} from "@/lib/vocab-drill/wordbook-plan-types";
import { tierKo } from "../wordbook-ui";
import { TILE_BASE, TILE_OFF, TILE_ON, WIZARD_BTN_GHOST, type StepProps } from "./wizard-types";

/** 방식별 장식 아이콘 — 의미 전달 보조일 뿐, 문안은 정본이 전부다 */
const ORDER_ICON: Record<WordbookOrderScheme, LucideIcon> = {
  "easy-first": Sprout,
  frequency: Flame,
  "tier-ladder": Layers,
  "mixed-pos": Shuffle,
  "pos-grouped": Group,
  random: Dices,
};

/**
 * 수준 세그먼트 바 색 — wordbook-ui 티어 규약(basic slate / core blue /
 * academic violet / advanced rose). 표기는 tierKo 로 한국어만 노출한다.
 */
const TIER_BAR: { key: string; color: string }[] = [
  { key: "basic", color: "bg-slate-300" },
  { key: "core", color: "bg-blue-500" },
  { key: "academic", color: "bg-violet-500" },
  { key: "advanced", color: "bg-rose-500" },
];

function TierSegBar({ counts }: { counts: Record<string, number> }) {
  // 규약 4수준 우선, 미지 키는 회색으로 뒤에 — 서버가 준 값만 그린다.
  const parts = [
    ...TIER_BAR,
    ...Object.keys(counts)
      .filter((k) => !TIER_BAR.some((t) => t.key === k))
      .map((k) => ({ key: k, color: "bg-slate-200" })),
  ].filter((p) => (counts[p.key] ?? 0) > 0);
  const total = parts.reduce((s, p) => s + (counts[p.key] ?? 0), 0);
  if (total === 0) {
    return <span className="h-[6px] min-w-0 flex-1 rounded-full bg-slate-100" />;
  }
  return (
    <span
      className="flex h-[6px] min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100"
      role="img"
      aria-label={parts.map((p) => `${tierKo(p.key)} ${counts[p.key]}개`).join(", ")}
    >
      {parts.map((p) => (
        <span
          key={p.key}
          className={`block h-full ${p.color}`}
          style={{ width: `${((counts[p.key] ?? 0) / total) * 100}%` }}
          title={`${tierKo(p.key)} ${counts[p.key]}개`}
        />
      ))}
    </span>
  );
}

/** 단계 카드 — sample 은 서버가 앞 6개만 준다(그 이상 그리지 않는다). */
function UnitCard({ unit }: { unit: WordbookUnitPlan }) {
  const sample = unit.sample.slice(0, 6);
  return (
    <div className="flex min-h-[140px] min-w-[186px] flex-1 flex-col rounded-xl border border-slate-200 bg-white p-3">
      <p className="text-[12px] font-bold tabular-nums text-slate-800">
        {unit.title} <span className="font-medium text-slate-300">·</span>{" "}
        {unit.count}
        <span className="font-medium text-slate-500">단어</span>
      </p>
      <div className="mt-2 grid flex-1 grid-cols-2 content-start gap-x-2 gap-y-1.5">
        {sample.map((s, i) => (
          <div key={i} className="min-w-0">
            <p className="truncate text-[11.5px] font-bold leading-tight text-slate-700">
              {s.lemma}
            </p>
            <p className="truncate text-[10.5px] leading-tight text-slate-400">
              {s.senseKo}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-2.5 flex items-center gap-2 border-t border-slate-100 pt-2">
        <TierSegBar counts={unit.tierCounts} />
        <span className="shrink-0 text-[10.5px] tabular-nums text-slate-600">
          {unit.avgDifficulty !== null ? (
            <>
              난이도 <span className="text-amber-500">★</span>
              {unit.avgDifficulty.toFixed(1)}
            </>
          ) : (
            "난이도 —"
          )}
        </span>
      </div>
    </div>
  );
}

export function StepStructure({ state, patch, plan, planLoading, requestPlan }: StepProps) {
  // 재계산 중에도 이전 plan 은 계속 보여준다 — dim + 배지(스펙 §5 지시).
  const reloading = planLoading && plan !== null;

  // 앞 3개 + 마지막 1개(사이 중략) — 4단계 이하면 전부 그대로.
  const units = plan?.units ?? [];
  const abbreviated = units.length > 4;
  const head = abbreviated ? units.slice(0, 3) : units;
  const tail = abbreviated ? units[units.length - 1] : null;
  const skipped = abbreviated ? units.length - 4 : 0;
  const shownUnits = tail ? [...head, tail] : head;
  const legendTiers = TIER_BAR.filter((t) =>
    shownUnits.some((u) => (u.tierCounts[t.key] ?? 0) > 0),
  );

  return (
    <div className="mx-auto max-w-[880px]">
      <p className="mb-4 text-[12.5px] leading-relaxed text-slate-500 break-keep">
        단어를 단계로 나눌 기준을 고르세요. 고르는 즉시 아래 미리보기가 다시
        계산돼요.
      </p>

      {/* ── 구성 방식 4종 (2×2 타일, 문안은 WORDBOOK_ORDER_SCHEMES 정본) ── */}
      <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
        {WORDBOOK_ORDER_SCHEMES.map((scheme) => {
          const on = state.order === scheme.key;
          const Icon = ORDER_ICON[scheme.key];
          return (
            <button
              key={scheme.key}
              type="button"
              onClick={() => patch({ order: scheme.key })}
              aria-pressed={on}
              className={`${TILE_BASE} ${on ? TILE_ON : TILE_OFF} flex min-h-[88px] items-center gap-3 p-4`}
            >
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                  on ? "bg-blue-100 text-blue-600" : "bg-slate-100 text-slate-500"
                }`}
              >
                <Icon size={18} />
              </span>
              <span className="min-w-0">
                <span className="block text-[14px] font-bold text-slate-800 break-keep">
                  {scheme.title}
                </span>
                <span className="mt-0.5 block text-[11.5px] leading-relaxed text-slate-500 break-keep">
                  {scheme.desc}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/* ── 구성 미리보기 ── */}
      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-[11px] font-bold tracking-wide text-slate-500">
            구성 미리보기
          </h3>
          {reloading && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-[10.5px] font-medium text-blue-600">
              <Loader2 size={12} className="animate-spin" />
              다시 계산 중…
            </span>
          )}
        </div>

        {plan ? (
          <div className={`transition-opacity ${reloading ? "opacity-45" : ""}`}>
            {/* 요약 줄 — 전부 서버 plan 실값 */}
            <p className="text-[15px] font-semibold text-slate-800 break-keep">
              총{" "}
              <b className="text-[17px] tabular-nums">
                {plan.totalPlanned.toLocaleString()}
              </b>
              단어 <span className="mx-1 font-normal text-slate-300">→</span>
              <b className="text-[17px] tabular-nums">{plan.units.length}</b>
              단계 <span className="mx-1 font-normal text-slate-300">×</span>
              하루{" "}
              <b className="text-[17px] tabular-nums">
                {plan.schedule.wordsPerDay}
              </b>
              단어
            </p>

            {plan.warnings.length > 0 && (
              <div className="mt-2.5 space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
                {plan.warnings.map((w, i) => (
                  <p
                    key={i}
                    className="flex items-start gap-1.5 text-[11.5px] leading-relaxed text-amber-700 break-keep"
                  >
                    <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                    {w}
                  </p>
                ))}
              </div>
            )}

            {/* 단계 스트립 — 앞 3개 + 중략 + 마지막 1개 */}
            {units.length > 0 && (
              <>
                <div className="mt-3 flex gap-2.5 overflow-x-auto pb-1">
                  {head.map((u) => (
                    <UnitCard key={u.index} unit={u} />
                  ))}
                  {abbreviated && (
                    <div className="flex w-[72px] shrink-0 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-1 text-center">
                      <MoreHorizontal size={15} className="text-slate-300" />
                      <span className="mt-1 text-[10.5px] font-medium text-slate-400">
                        중략
                      </span>
                      <span className="text-[10.5px] font-semibold tabular-nums text-slate-500">
                        {skipped}단계
                      </span>
                    </div>
                  )}
                  {tail && <UnitCard unit={tail} />}
                </div>
                {legendTiers.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                    {legendTiers.map((t) => (
                      <span
                        key={t.key}
                        className="inline-flex items-center gap-1 text-[10.5px] text-slate-500"
                      >
                        <span className={`size-1.5 rounded-full ${t.color}`} />
                        {tierKo(t.key)}
                      </span>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        ) : planLoading ? (
          /* 첫 계산 — 스켈레톤 3장 */
          <div>
            <div className="mb-3 h-6 w-64 animate-pulse rounded bg-slate-100" />
            <div className="flex gap-2.5">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-[140px] min-w-[186px] flex-1 animate-pulse rounded-xl border border-slate-100 bg-slate-100/70"
                />
              ))}
            </div>
          </div>
        ) : (
          /* 계산 실패 */
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-6 py-10 text-center">
            <p className="text-[12.5px] font-medium text-slate-500 break-keep">
              구성을 계산하지 못했어요
            </p>
            <button type="button" onClick={requestPlan} className={WIZARD_BTN_GHOST}>
              <RotateCw size={15} />
              다시 계산하기
            </button>
          </div>
        )}
      </div>

      <p className="mt-5 text-[10.5px] leading-relaxed text-slate-400 break-keep">
        단계 나누기 기준만 정하면 돼요. 하루에 몇 단어씩 볼지는 다음 단계에서
        정합니다.
      </p>
    </div>
  );
}
