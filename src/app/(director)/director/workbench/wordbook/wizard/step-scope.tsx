"use client";

// ============================================================================
// 스텝2 — 범위와 수준 (몇 단어를, 어떤 수준으로)
//
// 모든 조건 변경은 patch({ base }) 로만 반영한다 — 라이브 카운트 질의는 셸이
// 300ms 디바운스로 소유(wizard-types.ts 계약)하므로 여기서는 표시만 한다.
// 담은 단어 모드(sourceSenseIds !== null)면 화면 전체를 잠금 카드로 대체한다.
//
// 함정 준수(스펙 §8): base.allSenses 는 항상 boolean 유지(§8-1) · 배열 토글이
// 비면 키 자체를 제거(계약 위생) · grades 는 "단어가 주로 나온 학년"이지
// 시험 친 학년이 아니다(§8-3 — 문구로 명시) · 화면 수치는 clamp 정본
// (PLAN_SIZE_MIN/MAX)과 서버가 준 liveTotal 만 쓴다.
// ============================================================================

import { useState } from "react";
// prettier-ignore
import { Check, ChevronDown, PencilLine, ShoppingBasket } from "lucide-react";
// prettier-ignore
import { clampPlanSize, PLAN_SIZE_MAX, PLAN_SIZE_MIN, type WordbookPlanBase } from "@/lib/vocab-drill/wordbook-plan-types";
import { fmt, posKo, tierKo } from "../wordbook-ui";
import { LiveCountBar } from "./wizard-live-count";
// prettier-ignore
import { SIZE_PRESETS, TILE_BASE, TILE_OFF, TILE_ON, WIZARD_INPUT, type StepProps } from "./wizard-types";

// ── 선택지 정본 ──────────────────────────────────────────────────────────────
// 라벨은 wordbook-ui 의 tierKo/posKo(=display.ts 정본)로만 그린다. 도트 색은
// 스튜디오 색 규약(wordbook-ui 머리주석: basic slate / core blue /
// academic violet / advanced rose) 그대로 — 재정의 아님.

const TIER_OPTIONS: { key: string; dot: string }[] = [
  { key: "basic", dot: "bg-slate-400" },
  { key: "core", dot: "bg-blue-500" },
  { key: "academic", dot: "bg-violet-500" },
  { key: "advanced", dot: "bg-rose-500" },
];

// prettier-ignore
const POS_KEYS = ["noun", "verb", "adjective", "adverb", "preposition", "conjunction", "idiom", "phrasal_verb", "collocation"] as const;

/** 추세 선택지 — filter-rail.tsx TREND_OPTIONS(적재기 trendLabel 8종) 그대로. */
// prettier-ignore
const TREND_OPTIONS = ["급증", "증가", "안정", "감소", "급감", "신규 등장", "중간기만 등장", "미등장"] as const;

const GRADE_OPTIONS = ["고1", "고2", "고3"] as const;

type BaseArrayKey = "grades" | "tiers" | "posList" | "trendLabels";

/** base 복제 + allSenses boolean 보증(§8-1 — undefined 금지). */
function cloneBase(base: WordbookPlanBase): WordbookPlanBase {
  return { ...base, allSenses: base.allSenses ?? false };
}

// ── 로컬 부품 ────────────────────────────────────────────────────────────────

function SectionHead({ title, note }: { title: string; note?: string }) {
  return (
    <div className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <h3 className="text-[13.5px] font-bold text-slate-800 break-keep">{title}</h3>
      {note ? <span className="text-[11.5px] text-slate-400 break-keep">{note}</span> : null}
    </div>
  );
}

/** 고급 조건용 필 토글 — 타일보다 작게, 칩보다 크게(누르기 편한 h-8). */
function PillToggle({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`inline-flex h-8 items-center rounded-lg border px-3 text-[12px] font-medium whitespace-nowrap transition ${
        on
          ? "border-blue-600 bg-blue-50/60 text-blue-700 ring-1 ring-blue-100"
          : "border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
      }`}
    >
      {children}
    </button>
  );
}

function SwitchRow({
  checked,
  onToggle,
  label,
  desc,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={checked}
      className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition hover:bg-slate-50"
    >
      <span
        className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded border transition ${
          checked ? "border-blue-600 bg-blue-600" : "border-slate-300 bg-white"
        }`}
      >
        {checked ? <Check size={12} strokeWidth={3} className="text-white" /> : null}
      </span>
      <span className="min-w-0">
        <span className="block text-[12.5px] font-medium text-slate-700 break-keep">{label}</span>
        <span className="block text-[10.5px] text-slate-400 break-keep">{desc}</span>
      </span>
    </button>
  );
}

// ── 본체 ─────────────────────────────────────────────────────────────────────

export function StepScope({ state, patch, liveTotal, liveTotalLoading }: StepProps) {
  const isPresetSize = (SIZE_PRESETS as readonly number[]).includes(state.size);
  const [customOpen, setCustomOpen] = useState(!isPresetSize);
  const [sizeDraft, setSizeDraft] = useState(String(state.size));
  const [advOpen, setAdvOpen] = useState(false);

  // ── 담은 단어 모드 — 조건 선택 전체를 잠금 카드로 대체(스펙 §1) ──────────
  if (state.sourceSenseIds !== null) {
    return (
      <div className="mx-auto flex h-full max-w-[880px] items-center justify-center">
        <div className="flex w-full flex-col items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50/60 px-6 py-12 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-600">
            <ShoppingBasket size={26} />
          </span>
          <p className="text-[17px] font-bold text-slate-800 break-keep">
            탐색에서 담은 단어{" "}
            <span className="tabular-nums text-amber-700">
              {fmt(state.sourceSenseIds.length)}
            </span>
            개를 그대로 사용합니다.
          </p>
          <p className="max-w-[420px] text-[12.5px] leading-relaxed text-slate-500 break-keep">
            조건 선택은 건너뛰어도 돼요. 「다음」을 눌러 단계 구성으로 넘어가세요.
          </p>
        </div>
      </div>
    );
  }

  const base = state.base;

  const toggleArr = (key: BaseArrayKey, v: string) => {
    const cur = base[key] ?? [];
    const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
    const nb = cloneBase(base);
    if (next.length) nb[key] = next;
    else delete nb[key]; // 빈 배열은 키 자체를 제거(계약 위생)
    patch({ base: nb });
  };

  const toggleDifficulty = (d: number) => {
    const cur = base.difficulties ?? [];
    const next = cur.includes(d)
      ? cur.filter((x) => x !== d)
      : [...cur, d].sort((a, b) => a - b);
    const nb = cloneBase(base);
    if (next.length) nb.difficulties = next;
    else delete nb.difficulties;
    patch({ base: nb });
  };

  const toggleFlag = (key: "excludeStopwords" | "excludePhrase") => {
    const nb = cloneBase(base);
    if (nb[key]) delete nb[key];
    else nb[key] = true;
    patch({ base: nb });
  };

  const pickSize = (n: number) => {
    setCustomOpen(false);
    setSizeDraft(String(n));
    patch({ size: n });
  };

  const onSizeInput = (raw: string) => {
    const digits = raw.replace(/[^\d]/g, "");
    setSizeDraft(digits);
    if (digits) patch({ size: clampPlanSize(Number(digits)) });
  };

  const levelEmpty = !base.tiers?.length && !base.difficulties?.length;
  const advActive =
    (base.posList?.length ? 1 : 0) +
    (base.trendLabels?.length ? 1 : 0) +
    (base.excludeStopwords ? 1 : 0) +
    (base.excludePhrase ? 1 : 0) +
    (typeof base.minTrapRate === "number" && base.minTrapRate > 0 ? 1 : 0);

  return (
    <div className="mx-auto max-w-[880px]">
      <p className="mb-5 text-[12.5px] leading-relaxed text-slate-500 break-keep">
        교재에 담을 단어의 양과 수준을 정해요. 조건을 바꿀 때마다 아래 막대에서
        맞는 단어 수를 바로 세어 드려요.
      </p>

      {/* ── 단어 수 ── */}
      <section className="mb-6">
        <SectionHead
          title="몇 단어로 만들까요?"
          note={`${PLAN_SIZE_MIN}~${fmt(PLAN_SIZE_MAX)}개 사이`}
        />
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {SIZE_PRESETS.map((n) => {
            const on = !customOpen && state.size === n;
            return (
              <button
                key={n}
                type="button"
                onClick={() => pickSize(n)}
                aria-pressed={on}
                className={`${TILE_BASE} ${on ? TILE_ON : TILE_OFF} flex h-14 flex-col items-center justify-center`}
              >
                <span className={`text-[15px] font-bold tabular-nums ${on ? "text-blue-700" : "text-slate-700"}`}>
                  {n.toLocaleString()}
                </span>
                <span className="text-[10.5px] text-slate-400">단어</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => {
              setSizeDraft(String(state.size));
              setCustomOpen(true);
            }}
            aria-pressed={customOpen}
            className={`${TILE_BASE} ${customOpen ? TILE_ON : TILE_OFF} flex h-14 flex-col items-center justify-center gap-0.5`}
          >
            <PencilLine size={15} className={customOpen ? "text-blue-600" : "text-slate-400"} />
            <span className={`text-[11.5px] font-semibold ${customOpen ? "text-blue-700" : "text-slate-600"}`}>
              직접 입력
            </span>
          </button>
        </div>
        {customOpen ? (
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <input
              type="text"
              inputMode="numeric"
              value={sizeDraft}
              onChange={(e) => onSizeInput(e.target.value)}
              onBlur={() => setSizeDraft(String(state.size))}
              aria-label="단어 수 직접 입력"
              className={`${WIZARD_INPUT} w-32 text-right tabular-nums`}
            />
            <span className="text-[12.5px] text-slate-500">단어</span>
            <span className="text-[11px] text-slate-400 break-keep">
              {PLAN_SIZE_MIN}~{fmt(PLAN_SIZE_MAX)}개 사이로 자동으로 맞춰져요
            </span>
          </div>
        ) : null}
      </section>

      {/* ── 수준·난이도 ── */}
      <section className="mb-6">
        <SectionHead
          title="어떤 수준으로?"
          note={
            levelEmpty
              ? "아무것도 고르지 않으면 전체 수준에서 뽑아요"
              : "여러 개를 함께 고를 수 있어요"
          }
        />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {TIER_OPTIONS.map(({ key, dot }) => {
            const on = !!base.tiers?.includes(key);
            return (
              <button
                key={key}
                type="button"
                onClick={() => toggleArr("tiers", key)}
                aria-pressed={on}
                className={`${TILE_BASE} ${on ? TILE_ON : TILE_OFF} flex h-14 items-center justify-center gap-2`}
              >
                <span className={`size-2 rounded-full ${dot}`} aria-hidden />
                <span className={`text-[13.5px] font-bold ${on ? "text-blue-700" : "text-slate-700"}`}>
                  {tierKo(key)}
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-3">
          <p className="mb-1.5 text-[11.5px] font-medium text-slate-500">
            난이도로 더 좁히기{" "}
            <span className="font-normal text-slate-400">1 쉬움 · 5 어려움</span>
          </p>
          <div className="flex gap-1.5">
            {[1, 2, 3, 4, 5].map((d) => {
              const on = !!base.difficulties?.includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => toggleDifficulty(d)}
                  aria-pressed={on}
                  className={`${TILE_BASE} ${on ? TILE_ON : TILE_OFF} flex h-10 w-12 items-center justify-center text-[13px] font-semibold tabular-nums ${on ? "text-blue-700" : "text-slate-600"}`}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── 학년 ── */}
      <section className="mb-6">
        <SectionHead
          title="학년"
          note="단어가 주로 나온 학년 기준 · 고르지 않으면 전 학년"
        />
        <div className="grid grid-cols-3 gap-2 sm:max-w-[420px]">
          {GRADE_OPTIONS.map((g) => {
            const on = !!base.grades?.includes(g);
            return (
              <button
                key={g}
                type="button"
                onClick={() => toggleArr("grades", g)}
                aria-pressed={on}
                className={`${TILE_BASE} ${on ? TILE_ON : TILE_OFF} flex h-12 items-center justify-center text-[13.5px] font-bold ${on ? "text-blue-700" : "text-slate-700"}`}
              >
                {g}
              </button>
            );
          })}
        </div>
      </section>

      {/* ── 고급 조건 (접이식, 기본 접힘 — 0fr↔1fr 그리드 보간) ── */}
      <section className="rounded-xl border border-slate-200">
        <button
          type="button"
          onClick={() => setAdvOpen((o) => !o)}
          aria-expanded={advOpen}
          className="flex h-12 w-full items-center justify-between rounded-xl px-4 transition hover:bg-slate-50"
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="text-[13px] font-bold text-slate-700">고급 조건</span>
            {advActive > 0 ? (
              <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-blue-600 px-1 text-[10.5px] font-bold tabular-nums text-white">
                {advActive}
              </span>
            ) : null}
            <span className="truncate text-[11px] text-slate-400">
              품사 · 추세 · 제외 조건
            </span>
          </span>
          <ChevronDown
            size={16}
            className={`shrink-0 text-slate-400 transition-transform duration-300 ${advOpen ? "rotate-180" : ""}`}
          />
        </button>
        <div
          className={`grid transition-[grid-template-rows] duration-300 ease-out ${
            advOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
          }`}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="space-y-4 border-t border-slate-100 px-4 py-4">
              <div>
                <p className="mb-1.5 text-[11.5px] font-medium text-slate-500">품사</p>
                <div className="flex flex-wrap gap-1.5">
                  {POS_KEYS.map((pos) => (
                    <PillToggle
                      key={pos}
                      on={!!base.posList?.includes(pos)}
                      onClick={() => toggleArr("posList", pos)}
                    >
                      {posKo(pos)}
                    </PillToggle>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-[11.5px] font-medium text-slate-500">추세</p>
                <div className="flex flex-wrap gap-1.5">
                  {TREND_OPTIONS.map((t) => (
                    <PillToggle
                      key={t}
                      on={!!base.trendLabels?.includes(t)}
                      onClick={() => toggleArr("trendLabels", t)}
                    >
                      {t}
                    </PillToggle>
                  ))}
                </div>
              </div>
              <div>
                <SwitchRow
                  checked={!!base.excludeStopwords}
                  onToggle={() => toggleFlag("excludeStopwords")}
                  label="기본 단어(기능어) 빼기"
                  desc="the·of 같은 기능어를 뺍니다"
                />
                <SwitchRow
                  checked={!!base.excludePhrase}
                  onToggle={() => toggleFlag("excludePhrase")}
                  label="숙어·구 빼기"
                  desc="숙어·구동사·연어를 뺍니다"
                />
              </div>
              {typeof base.minTrapRate === "number" && base.minTrapRate > 0 ? (
                <p className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-500 break-keep">
                  이 프리셋에는 함정률{" "}
                  <b className="tabular-nums">{Math.round(base.minTrapRate * 100)}%</b>{" "}
                  이상 조건이 함께 적용돼 있어요.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {/* ── 하단 고정 라이브 카운트 바 (스크롤 컨테이너 기준 sticky) ── */}
      <div className="sticky bottom-0 z-10 mt-6 drop-shadow-[0_-6px_16px_rgba(15,23,42,0.08)]">
        <LiveCountBar loading={liveTotalLoading} total={liveTotal} size={state.size} />
      </div>
    </div>
  );
}
