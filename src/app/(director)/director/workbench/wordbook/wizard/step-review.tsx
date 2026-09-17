"use client";

// ============================================================================
// 스텝5 — 확인하고 만들기 + 성공 화면(2택: 학생에게 보내기 / 나중에 보내기)
//
// 생성 실행·버튼은 **셸 푸터** 소관(wizard-types ReviewStepProps) — 이 스텝은
// 이름 입력·요약 카드·단계 아코디언, 그리고 created 이후의 성공 화면만 담당한다.
// 표시 기간은 plan.schedule 을 믿지 않는다 — 셸이 daysPerWeek 를 플랜 키에서
// 빼므로(주5/7 토글은 재질의 없음) stale 할 수 있어, 순수 산식으로 재계산한다.
// 확정 스펙: docs/wordbook-wizard-spec.md §5·§7·§11(발송 통합)
// ============================================================================

import { useState, type ReactNode } from "react";
import { AlertTriangle, Archive, CalendarDays, Check, ChevronDown, ChevronRight, Loader2, Send, type LucideIcon } from "lucide-react";
import { findCurriculum } from "@/lib/vocab-drill/wordbook-curricula";
import { formatPlanPeriod, planTotalDays, studyDaysCadence, studyDaysShort, WORDBOOK_ORDER_SCHEMES, type WordbookUnitPlan } from "@/lib/vocab-drill/wordbook-plan-types";
import { fmt, posKo, PosChip, SectionTitle, TierChip } from "../wordbook-ui";
import { TILE_BASE, TILE_OFF, WIZARD_INPUT, type ReviewStepProps } from "./wizard-types";

const TIER_ORDER = ["basic", "core", "academic", "advanced"];

// ── 작은 부품 ────────────────────────────────────────────────────────────────

/** 조건 요약 칩 — 분류축이라 외곽선형(채움=평가축 규약, wordbook-ui). */
function CondChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-[18px] items-center rounded border border-slate-200 px-1.5 text-[10.5px] font-medium leading-none whitespace-nowrap tabular-nums text-slate-500">
      {children}
    </span>
  );
}

/** 요약 카드 우측의 큰 숫자. */
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <p className="text-[22px] font-bold leading-tight tabular-nums text-slate-800">{value}</p>
      <p className="mt-0.5 text-[10.5px] text-slate-400">{label}</p>
    </div>
  );
}

/** 요약 카드 좌측 행 — dt 60px 고정 폭으로 세로 정렬. */
function SummaryRow({ dt, children }: { dt: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <dt className="w-[60px] shrink-0 pt-px text-[10.5px] font-medium text-slate-400">{dt}</dt>
      <dd className="flex min-w-0 flex-wrap items-center gap-1 text-[12.5px] text-slate-700 break-keep">
        {children}
      </dd>
    </div>
  );
}

/** 입력 라벨 행 — 좌 라벨 + 우 글자수. */
function FieldHead({ htmlFor, count, children }: { htmlFor: string; count: string; children: ReactNode }) {
  return (
    <div className="mb-1 flex items-baseline justify-between">
      <label htmlFor={htmlFor} className="text-[11.5px] font-semibold text-slate-600">
        {children}
      </label>
      <span className="text-[10.5px] tabular-nums text-slate-400">{count}</span>
    </div>
  );
}

function SummarySkeleton() {
  return (
    <div className="animate-pulse p-4" aria-hidden>
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex-1 space-y-2.5">
          {["w-44", "w-56", "w-48"].map((w) => (
            <div key={w} className={`h-3.5 rounded bg-slate-100 ${w}`} />
          ))}
        </div>
        <div className="flex shrink-0 gap-8">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-12 w-14 rounded-lg bg-slate-100" />
          ))}
        </div>
      </div>
      <div className="mt-4 h-3 w-52 rounded bg-slate-100" />
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="animate-pulse divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3 px-3.5 py-3">
          <div className="h-3.5 w-14 rounded bg-slate-100" />
          <div className="h-3.5 w-12 rounded bg-slate-100" />
          <div className="h-3.5 flex-1 rounded bg-slate-50" />
        </div>
      ))}
    </div>
  );
}

// ── 단계 아코디언 행 ─────────────────────────────────────────────────────────

function UnitRow({ unit, open, onToggle }: { unit: WordbookUnitPlan; open: boolean; onToggle: () => void }) {
  const preview = unit.sample.slice(0, 3).map((s) => s.lemma).join(", ");
  const tierEntries = Object.entries(unit.tierCounts)
    .filter(([, n]) => n > 0)
    .sort((a, b) => {
      const ia = TIER_ORDER.indexOf(a[0]);
      const ib = TIER_ORDER.indexOf(b[0]);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });

  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition hover:bg-slate-50"
      >
        <span className="w-[64px] shrink-0 text-[12.5px] font-semibold tabular-nums text-slate-700">
          {unit.title}
        </span>
        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] font-medium tabular-nums text-slate-500">
          {unit.count}단어
        </span>
        <span className="min-w-0 flex-1 truncate text-[11.5px] text-slate-400">
          {preview}
          {unit.sample.length > 3 ? " …" : ""}
        </span>
        <ChevronDown
          size={14}
          className={`shrink-0 text-slate-300 transition-transform duration-300 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {/* 접기/펼치기 — grid-rows 0fr↔1fr 보간(리포 관용구) */}
      <div className={`grid transition-[grid-template-rows] duration-300 ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div className="min-h-0 overflow-hidden">
          <div className="border-t border-slate-100 bg-slate-50/60 px-3.5 py-3">
            <ul className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
              {unit.sample.map((s, i) => (
                <li key={`${s.lemma}-${i}`} className="flex min-w-0 items-center gap-1.5">
                  <PosChip pos={s.pos} />
                  <span className="shrink-0 text-[12px] font-semibold text-slate-700">{s.lemma}</span>
                  <span className="min-w-0 truncate text-[11.5px] text-slate-500 break-keep">{s.senseKo}</span>
                </li>
              ))}
            </ul>
            {tierEntries.length > 0 && (
              <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-200/60 pt-2">
                <span className="text-[10.5px] font-medium text-slate-400">수준 구성</span>
                {tierEntries.map(([tier, n]) => (
                  <span key={tier} className="inline-flex items-center gap-1">
                    <TierChip tier={tier} />
                    <span className="text-[11px] tabular-nums text-slate-500">{n}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

// ── 스텝5 본체 ───────────────────────────────────────────────────────────────

export function StepReview({
  state,
  patch,
  plan,
  planLoading,
  liveTotal,
  creating,
  created,
  createError,
  basketMode,
  onSendToStudents,
  onGotoManage,
}: ReviewStepProps) {
  const [openUnit, setOpenUnit] = useState<number | null>(null);

  // ── 성공 화면 — created 가 차면 스텝이 통째로 전환된다 ────────────────────
  if (created) {
    // 리듬 문구는 요일 집합 정본에서 — "매일"/"평일마다"/"월·수·금마다"(스펙 §11).
    const cadence = studyDaysCadence(state.studyDays);
    const actions: { key: string; icon: LucideIcon; title: string; desc: string; onClick: () => void; primary?: boolean }[] = [
      { key: "send", icon: Send, primary: true, title: "학생에게 보내기", desc: `보내면 1단계는 바로 시작되고, 다음 단계는 ${cadence} 하나씩 자동으로 열려요.`, onClick: onSendToStudents },
      { key: "later", icon: Archive, title: "나중에 보내기", desc: "보낸 단어장 탭에 저장해 뒀어요.", onClick: onGotoManage },
    ];

    return (
      <div className="mx-auto flex max-w-[560px] flex-col items-center pt-4 sm:pt-10">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-100">
          <Check size={30} strokeWidth={3} />
        </span>
        <h3 className="mt-4 text-center text-[17px] font-bold text-slate-800 break-keep">
          「{state.title.trim()}」 완성!
        </h3>
        <p className="mt-1 text-center text-[12.5px] tabular-nums text-slate-500 break-keep">
          단어 {fmt(created.totalWords)}개 · {created.deckIds.length}단계 교재가 만들어졌어요.
        </p>

        <p className="mt-7 mb-2 w-full text-[11.5px] font-semibold text-slate-500">이제 어떻게 할까요?</p>
        <div className="flex w-full flex-col gap-2.5">
          {actions.map(({ key, icon: Icon, title, desc, onClick, primary }) => (
            <button
              key={key}
              type="button"
              onClick={onClick}
              className={`${TILE_BASE} flex min-h-[72px] w-full items-center gap-3.5 p-4 ${primary ? "border-blue-600 bg-blue-600 hover:bg-blue-700" : TILE_OFF}`}
            >
              <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${primary ? "bg-white/15 text-white" : "bg-slate-100 text-slate-500"}`}>
                <Icon size={19} />
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block text-[14px] font-bold break-keep ${primary ? "text-white" : "text-slate-800"}`}>{title}</span>
                <span className={`mt-0.5 block text-[11.5px] break-keep ${primary ? "text-blue-100" : "text-slate-500"}`}>{desc}</span>
              </span>
              <ChevronRight size={16} className={`shrink-0 ${primary ? "text-blue-200" : "text-slate-300"}`} />
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── 확인 화면 파생값 — 스펙 §5 공식(plan 없을 때만 근사) ──────────────────
  const totalPlanned = plan ? plan.totalPlanned : Math.min(state.size, liveTotal ?? state.size);
  const unitCount = plan ? plan.units.length : planTotalDays(totalPlanned, state.wordsPerDay);

  const preset = findCurriculum(state.curriculum);
  const curriculumLabel = preset ? preset.title : basketMode ? "담은 단어로 만들기" : "직접 설계";
  const orderTitle = WORDBOOK_ORDER_SCHEMES.find((s) => s.key === state.order)?.title ?? "";
  const srcCount = state.sourceSenseIds?.length ?? 0;

  // 조건 요약 칩 — 상태값·서버가 준 값만 표기(임의 수치 창작 금지)
  const b = state.base;
  const tierChips = b.tiers ?? [];
  const condChips: string[] = [];
  if (b.grades?.length) condChips.push(b.grades.join("·"));
  if (b.difficulties?.length) condChips.push(`난이도 ${[...b.difficulties].sort((x, y) => x - y).join("·")}`);
  if (b.posList?.length) condChips.push(b.posList.map(posKo).join("·"));
  if (b.trendLabels?.length) condChips.push(b.trendLabels.join("·"));
  if (typeof b.minTrapRate === "number" && b.minTrapRate > 0) condChips.push(`함정률 ${Math.round(b.minTrapRate * 100)}% 이상`);
  if (b.excludePhrase) condChips.push("숙어·구 제외");
  if (b.excludeStopwords) condChips.push("기능어 제외");
  if (b.passage) condChips.push("기출 범위 지정");

  return (
    <div className="relative mx-auto max-w-[880px]" aria-busy={creating}>
      <p className="mb-4 text-[12.5px] leading-relaxed text-slate-500 break-keep">
        마지막 단계예요. 이름을 지어 주고 구성을 확인한 뒤, 하단의{" "}
        <b className="text-slate-600">「단어장 만들기」</b> 버튼을 누르면 단계 덱이 한 번에 만들어져요.
      </p>

      {/* 1. 이름 짓기 */}
      <div className="space-y-2.5">
        <div>
          <FieldHead htmlFor="wb-review-title" count={`${state.title.length}/80`}>
            단어장 이름 <span className="text-rose-500">*</span>
          </FieldHead>
          <input
            id="wb-review-title"
            value={state.title}
            maxLength={80}
            onChange={(e) => patch({ title: e.target.value })}
            placeholder="예: 고1 여름방학 기초 완성"
            className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-[15px] font-semibold text-slate-800 placeholder:font-normal placeholder:text-slate-300 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        </div>
        <div>
          <FieldHead htmlFor="wb-review-subtitle" count={`${state.subtitle.length}/120`}>
            한 줄 소개 <span className="font-normal text-slate-400">(선택)</span>
          </FieldHead>
          <input
            id="wb-review-subtitle"
            value={state.subtitle}
            maxLength={120}
            onChange={(e) => patch({ subtitle: e.target.value })}
            placeholder="학생에게 보일 짧은 설명이에요"
            className={WIZARD_INPUT}
          />
        </div>
      </div>

      {createError && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-[12px] font-medium text-rose-700 break-keep">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          {createError}
        </div>
      )}

      {/* 2. 요약 카드 */}
      <section className="mt-4 rounded-xl border border-slate-200 bg-white">
        {planLoading ? (
          <SummarySkeleton />
        ) : (
          <>
            <div className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between">
              <dl className="min-w-0 flex-1 space-y-2">
                <SummaryRow dt="커리큘럼">
                  <span className="font-semibold">{curriculumLabel}</span>
                </SummaryRow>
                <SummaryRow dt="구성 방식">
                  <span className="font-medium">{orderTitle}</span>
                </SummaryRow>
                <SummaryRow dt="조건">
                  {basketMode ? (
                    <CondChip>담은 단어 {fmt(srcCount)}개로 구성</CondChip>
                  ) : tierChips.length + condChips.length > 0 ? (
                    <>
                      {tierChips.map((t) => (
                        <TierChip key={t} tier={t} />
                      ))}
                      {condChips.map((c) => (
                        <CondChip key={c}>{c}</CondChip>
                      ))}
                    </>
                  ) : (
                    <span className="text-[11.5px] text-slate-400">조건 없음</span>
                  )}
                </SummaryRow>
              </dl>
              <div className="flex shrink-0 items-center justify-around gap-6 border-slate-100 md:justify-end md:gap-8 md:border-l md:pl-6">
                <Stat label="총 단어" value={fmt(totalPlanned)} />
                <Stat label="단계" value={fmt(unitCount)} />
                <Stat label="하루" value={fmt(state.wordsPerDay)} />
              </div>
            </div>
            <div className="flex items-center gap-1.5 border-t border-slate-100 px-4 py-2.5 text-[11.5px] font-medium text-slate-600">
              <CalendarDays size={13} className="shrink-0 text-slate-400" />
              <span className="tabular-nums break-keep">
                {formatPlanPeriod(unitCount, state.studyDays)} · {studyDaysShort(state.studyDays)}
              </span>
            </div>
          </>
        )}
      </section>

      {plan && plan.warnings.length > 0 && (
        <div className="mt-2.5 space-y-1.5">
          {plan.warnings.map((w) => (
            <div
              key={w}
              className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[11.5px] font-medium text-amber-700 break-keep"
            >
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              {w}
            </div>
          ))}
        </div>
      )}

      {/* 3. 단계 전체 아코디언 */}
      <section className="mt-5">
        <SectionTitle hint={plan ? "행을 누르면 단어 표본이 보여요" : undefined}>
          단계 구성
        </SectionTitle>
        {planLoading ? (
          <ListSkeleton />
        ) : plan && plan.units.length > 0 ? (
          <ul className="max-h-[340px] divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200 bg-white">
            {plan.units.map((u) => (
              <UnitRow
                key={u.index}
                unit={u}
                open={openUnit === u.index}
                onToggle={() => setOpenUnit((cur) => (cur === u.index ? null : u.index))}
              />
            ))}
          </ul>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-[12px] text-slate-400 break-keep">
            {plan
              ? "이 조건으로는 단계를 만들 수 없어요. 이전 단계에서 조건을 넓혀 주세요."
              : "단계 구성을 아직 계산하지 못했어요. 이전 단계로 돌아갔다 오면 다시 계산돼요."}
          </div>
        )}
      </section>

      {/* 생성 중 — 전체 dim + 중앙 스피너 */}
      {creating && (
        <div className="absolute -inset-2 z-10 flex flex-col items-center justify-center gap-3 rounded-2xl bg-white/75 backdrop-blur-[1px]">
          <Loader2 className="animate-spin text-blue-600" size={28} />
          <p className="text-[13px] font-semibold text-slate-600 break-keep">단계 덱을 만드는 중…</p>
        </div>
      )}
    </div>
  );
}
