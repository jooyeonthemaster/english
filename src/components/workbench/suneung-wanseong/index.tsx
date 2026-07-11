"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Check, ChevronDown, Link2, Search, X } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { difficultyBadgeClass } from "@/lib/korean-exam-passages/format";
import {
  qRangeLabel,
  relationHint,
  subGenreBadgeClass,
} from "@/lib/suneung-wanseong/format";
import type { SwPassage, SwRelationType } from "@/lib/suneung-wanseong/types";
import { DetailPanel } from "./detail-panel";
import { ExamPassageModal } from "./exam-passage-modal";
import { useSuneungWanseong, type SuneungWanseongApi } from "./use-suneung-wanseong";

const MOBILE_QUERY = "(max-width: 1023px)";

function subscribeMobileLayout(onChange: () => void) {
  const media = window.matchMedia(MOBILE_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function getMobileLayoutSnapshot() {
  return window.matchMedia(MOBILE_QUERY).matches;
}

function useMobileLayout() {
  return useSyncExternalStore(subscribeMobileLayout, getMobileLayoutSnapshot, () => false);
}

/**
 * 2027 수능완성 독서 지문 분석 — 좌: 지문 목록(필터), 우: 상세(지문·분석·문항·연계 기출).
 * 기준은 언제나 수능완성 지문이고, 기출은 그 지문에 딸린 연계 자료로 배치한다.
 */
export function SuneungWanseongLibrary() {
  const api = useSuneungWanseong();
  const { selectedId, select } = api;
  const [examId, setExamId] = useState<string | null>(null);
  const mobileDetailRef = useRef<HTMLDivElement>(null);
  const mobileBackRef = useRef<HTMLButtonElement>(null);
  const mobileOriginRef = useRef<HTMLElement | null>(null);
  const isMobile = useMobileLayout();
  const mobileDetailOpen = Boolean(selectedId && isMobile);

  useEffect(() => {
    if (mobileDetailOpen && !mobileOriginRef.current) {
      mobileOriginRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      mobileBackRef.current?.focus();
    } else if (!mobileDetailOpen && !examId && mobileOriginRef.current) {
      mobileOriginRef.current.focus();
      mobileOriginRef.current = null;
    }
  }, [examId, mobileDetailOpen]);

  useEffect(() => {
    if (!mobileDetailOpen || examId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        select(null);
        return;
      }
      if (event.key === "Tab" && mobileDetailRef.current) {
        trapFocus(mobileDetailRef.current, event);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [examId, mobileDetailOpen, select]);

  useEffect(
    () => () => {
      mobileOriginRef.current?.focus();
    },
    [],
  );

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden bg-white">
      {/* 좌: 목록 */}
      <aside className="flex w-full min-w-0 shrink-0 flex-col border-r border-slate-100 lg:w-[380px] xl:w-[420px]">
        <FilterBar api={api} />
        <div className="flex min-w-0 items-center justify-between gap-2 px-3 py-2 text-[12px] text-slate-500">
          <span className="min-w-0" aria-live="polite">
            {api.loading ? (
              "불러오는 중…"
            ) : (
              <>
                <span className="font-bold text-blue-700">
                  {api.total}세트
                </span>{" "}
                검색됨
                {api.facets ? (
                  <span className="text-slate-400">
                    {" "}
                    / 전체 {api.facets.total}세트 ·{" "}
                    {totalTextsWithFallback(api)}본문 · 연계 {api.facets.totalLinks}건
                  </span>
                ) : null}
              </>
            )}
          </span>
          {api.activeFilterCount > 0 ? (
            <button
              type="button"
              onClick={api.clearFilters}
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11.5px] font-semibold text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            >
              <X className="size-3" /> 초기화
            </button>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-4">
          {api.loading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="h-[104px] animate-pulse rounded-xl border border-slate-200 bg-slate-50"
                />
              ))}
            </div>
          ) : api.error ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <p role="alert" className="text-[13px] font-semibold text-slate-600">
                {api.error}
              </p>
              <button
                type="button"
                onClick={api.retryList}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                다시 시도
              </button>
            </div>
          ) : api.items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <span className="flex size-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                <Link2 className="size-5" />
              </span>
              <p className="text-[13px] font-semibold text-slate-600">
                조건에 맞는 지문이 없습니다
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {groupByRound(api.items).map(([round, list]) => (
                <li key={round}>
                  <p className="sticky top-0 z-10 bg-white/95 px-1 py-1.5 text-[11px] font-bold text-slate-400 backdrop-blur">
                    실전 모의고사 {round}회
                  </p>
                  <ul className="space-y-2">
                    {list.map((p) => (
                      <PassageRow
                        key={p.id}
                        passage={p}
                        active={api.effectiveId === p.id}
                        onSelect={() => api.select(p.id)}
                      />
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      {/* 우: 상세 */}
      <section className="hidden min-w-0 flex-1 lg:block">
        {!api.effectiveId ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-[13px] font-semibold text-slate-500">
            {api.loading
              ? "수능완성 지문 목록을 불러오는 중입니다."
              : api.error
                ? "목록을 불러오지 못했습니다. 왼쪽에서 다시 시도해 주세요."
                : "현재 검색 조건에 맞는 수능완성 지문이 없습니다."}
          </div>
        ) : (
          <DetailPanel
            detail={api.detail}
            loading={api.detailLoading}
            error={api.detailError}
            onRetry={api.retryDetail}
            onOpenExam={setExamId}
          />
        )}
      </section>

      {/* 모바일: 선택 시 전체화면 상세 */}
      {mobileDetailOpen ? (
        <div
          ref={mobileDetailRef}
          role="dialog"
          aria-modal="true"
          aria-label="수능완성 지문 상세"
          className="fixed inset-0 z-40 flex flex-col bg-white"
        >
          <button
            ref={mobileBackRef}
            type="button"
            onClick={() => api.select(null)}
            aria-label="수능완성 지문 목록으로 돌아가기"
            className="flex shrink-0 items-center gap-1 border-b border-slate-100 px-4 py-2.5 text-[12.5px] font-semibold text-slate-500"
          >
            <X className="size-4" /> 목록으로
          </button>
          <div className="min-h-0 flex-1">
            <DetailPanel
              detail={api.detail}
              loading={api.detailLoading}
              error={api.detailError}
              onRetry={api.retryDetail}
              onOpenExam={setExamId}
            />
          </div>
        </div>
      ) : null}

      {examId ? (
        <ExamPassageModal
          key={examId}
          examId={examId}
          fetchExam={api.fetchExam}
          onClose={() => setExamId(null)}
        />
      ) : null}
    </div>
  );
}

function trapFocus(container: HTMLElement, event: KeyboardEvent) {
  const focusable = Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute("hidden") && element.offsetParent !== null);
  if (focusable.length === 0) {
    event.preventDefault();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function groupByRound(items: SwPassage[]): [number, SwPassage[]][] {
  const m = new Map<number, SwPassage[]>();
  for (const p of items) {
    const arr = m.get(p.roundNo);
    if (arr) arr.push(p);
    else m.set(p.roundNo, [p]);
  }
  return Array.from(m.entries()).sort((a, b) => a[0] - b[0]);
}

function totalTextsWithFallback(api: SuneungWanseongApi): number {
  if (api.facets?.totalTexts !== undefined) return api.facets.totalTexts;
  if (api.facets && api.total === api.facets.total) {
    return api.items.reduce(
      (sum, passage) =>
        sum +
        (passage.isPaired
          ? Math.max(passage.parts?.length ?? 0, 2)
          : Math.max(passage.parts?.length ?? 0, 1)),
      0,
    );
  }
  return api.facets?.total ?? api.total;
}

function PassageRow({
  passage: p,
  active,
  onSelect,
}: {
  passage: SwPassage;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? "true" : undefined}
        aria-label={`${p.roundLabel} ${qRangeLabel(p.qFrom, p.qTo)} ${p.analysis["핵심주제"]}`}
        className={
          "flex w-full flex-col gap-1.5 rounded-xl border p-3 text-left transition " +
          (active
            ? "border-blue-500 bg-blue-50/40 ring-1 ring-blue-500"
            : "border-slate-200 bg-white hover:border-blue-300 hover:shadow-sm")
        }
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11.5px] font-bold tabular-nums text-slate-400">
            {qRangeLabel(p.qFrom, p.qTo)}
          </span>
          {p.subGenre ? (
            <span
              className={
                "inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-bold " +
                subGenreBadgeClass(p.subGenre)
              }
            >
              {p.subGenre}
            </span>
          ) : null}
          {p.difficulty ? (
            <span
              className={
                "inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-bold " +
                difficultyBadgeClass(p.difficulty)
              }
            >
              {p.difficulty}
            </span>
          ) : null}
          {p.isPaired ? (
            <span className="inline-flex items-center rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
              (가)(나) · {Math.max(p.parts.length, 2)}본문
            </span>
          ) : null}
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-slate-900 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-white">
            <Link2 className="size-2.5" />
            {p.linkCount}
          </span>
        </div>
        <p className="line-clamp-2 text-[12.5px] font-semibold leading-snug text-slate-800">
          {p.analysis["핵심주제"]}
        </p>
        <div className="flex flex-wrap gap-1">
          {p.analysis["핵심키워드"].slice(0, 4).map((k) => (
            <span
              key={k}
              className="rounded bg-blue-50/70 px-1.5 py-0.5 text-[10px] font-medium text-blue-600"
            >
              {k}
            </span>
          ))}
        </div>
      </button>
    </li>
  );
}

// ── 필터 바 ──────────────────────────────────────────────
function FilterBar({ api }: { api: SuneungWanseongApi }) {
  const f = api.facets;
  return (
    <div className="shrink-0 space-y-2 border-b border-slate-100 px-3 py-2.5">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
        <input
          value={api.searchInput}
          onChange={(e) => api.setSearchInput(e.target.value)}
          aria-label="수능완성 지문과 연계 근거 검색"
          placeholder="주제·개념·연결 근거 검색 (예: 인지 편향, 열역학)"
          className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-8 text-[12.5px] text-slate-700 placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/10"
        />
        {api.searchInput ? (
          <button
            type="button"
            onClick={() => api.setSearchInput("")}
            aria-label="검색어 지우기"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:bg-slate-100"
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <FilterMenu
          label="회차"
          options={(f?.rounds ?? []).map((r) => ({
            value: r,
            label: `${r}회`,
            count: f?.counts.round[String(r)],
          }))}
          selected={api.filters.rounds}
          onToggle={(v) => api.toggle("rounds", v)}
        />
        <FilterMenu
          label="세부영역"
          options={(f?.subGenres ?? []).map((s) => ({
            value: s,
            label: s,
            count: f?.counts.subGenre[s],
          }))}
          selected={api.filters.subGenres}
          onToggle={(v) => api.toggle("subGenres", v)}
        />
        <FilterMenu
          label="난이도"
          options={(f?.difficulties ?? []).map((d) => ({
            value: d,
            label: d,
            count: f?.counts.difficulty[d],
          }))}
          selected={api.filters.difficulties}
          onToggle={(v) => api.toggle("difficulties", v)}
        />
        <FilterMenu
          label="연계 축"
          options={(f?.relationTypes ?? []).map((r) => ({
            value: r,
            label: r,
            hint: relationHint(r),
            count: f?.counts.relationType[r],
          }))}
          selected={api.filters.relationTypes}
          onToggle={(v) => api.toggle("relationTypes", v as SwRelationType)}
        />
        <FilterMenu
          label="키워드"
          searchable
          options={(f?.topKeywords ?? []).map((k) => ({
            value: k.kw,
            label: k.kw,
            count: k.count,
          }))}
          selected={api.filters.keywords}
          onToggle={(v) => api.toggle("keywords", v)}
        />
      </div>
    </div>
  );
}

type Opt<T> = { value: T; label: string; count?: number; hint?: string };

function FilterMenu<T extends string | number>({
  label,
  options,
  selected,
  onToggle,
  searchable = false,
}: {
  label: string;
  options: Opt<T>[];
  selected: Set<T>;
  onToggle: (v: T) => void;
  searchable?: boolean;
}) {
  const [kw, setKw] = useState("");
  const count = selected.size;
  const active = count > 0;
  const shown =
    searchable && kw
      ? options.filter((o) => o.label.toLowerCase().includes(kw.toLowerCase()))
      : options;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${label} 필터 열기${active ? `, ${count}개 선택됨` : ""}`}
          className={
            "inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border px-2.5 text-[12px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 " +
            (active
              ? "border-blue-600 bg-blue-50 text-blue-700 shadow-sm"
              : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50")
          }
        >
          {label}
          {active ? (
            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-bold text-white">
              {count}
            </span>
          ) : null}
          <ChevronDown className="size-3.5 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-1.5">
        {searchable ? (
          <input
            value={kw}
            onChange={(e) => setKw(e.target.value)}
            placeholder="키워드 검색"
            className="mb-1.5 h-7 w-full rounded-md border border-slate-200 bg-slate-50 px-2 text-[11.5px] focus:outline-none"
          />
        ) : null}
        <div className="max-h-72 overflow-y-auto">
          {shown.map((o) => {
            const on = selected.has(o.value);
            return (
              <button
                key={String(o.value)}
                type="button"
                title={o.hint}
                onClick={() => onToggle(o.value)}
                aria-pressed={on}
                className={
                  "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-[12px] font-medium transition " +
                  (on ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50")
                }
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <span
                    className={
                      "flex size-4 shrink-0 items-center justify-center rounded border " +
                      (on
                        ? "border-blue-600 bg-blue-600 text-white"
                        : "border-slate-300 text-transparent")
                    }
                  >
                    <Check className="size-3" strokeWidth={3} />
                  </span>
                  <span className="truncate">{o.label}</span>
                </span>
                {typeof o.count === "number" ? (
                  <span className="shrink-0 text-[10.5px] tabular-nums text-slate-400">
                    {o.count}
                  </span>
                ) : null}
              </button>
            );
          })}
          {shown.length === 0 ? (
            <p className="px-2 py-3 text-center text-[11.5px] text-slate-400">
              결과 없음
            </p>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
