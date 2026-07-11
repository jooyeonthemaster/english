"use client";

import { useState } from "react";
import {
  Search,
  X,
  ChevronDown,
  Check,
  Loader2,
  BookOpenText,
  Download,
} from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Pagination } from "@/components/workbench/shared/pagination";
import {
  galaeBadgeClass,
  difficultyBadgeClass,
  koGradeBadgeClass,
  koSourceLabel,
} from "@/lib/korean-exam-passages/format";
import type { KoPassage } from "@/lib/korean-exam-passages/types";
import { Badge, DetailModal } from "./detail-modal";
import {
  useKoreanExamPassageLibrary,
  type KoreanExamPassageLibraryApi,
  type KoExamPick,
} from "./use-korean-exam-passage-library";

export interface KoreanExamPassageLibraryProps {
  /**
   * 선택한 지문을 호스트로 넘긴다(불러오기). 주면 picker 모드(선택 체크박스 + 하단
   * 담기 바)로 동작하고, 미지정이면 브라우즈 전용. false 반환 시 선택 유지(실패).
   */
  onPick?: (picks: KoExamPick[]) => boolean | void | Promise<boolean | void>;
  /** 담기 버튼 라벨. */
  pickLabel?: string;
  /** 호스트가 처리 중이면 true(버튼 비활성·스피너). */
  busy?: boolean;
  /** 모바일에서 하단 담기 바를 화면 맨 아래 고정. */
  mobileFixedFooter?: boolean;
}

/** 국어 기출 지문 라이브러리 — 다차원 필터 + 지문별 최대상세 분석 브라우저(+선택 picker). */
export function KoreanExamPassageLibrary({
  onPick,
  pickLabel = "내 지문함에 담기",
  busy = false,
  mobileFixedFooter = false,
}: KoreanExamPassageLibraryProps = {}) {
  const api = useKoreanExamPassageLibrary();
  const [detail, setDetail] = useState<KoPassage | null>(null);
  const [picking, setPicking] = useState(false);
  const pickable = Boolean(onPick);

  const handlePick = async () => {
    if (!onPick || api.selectedCount === 0 || picking || busy) return;
    setPicking(true);
    try {
      const picks = await api.collectSelectedPicks();
      if (picks.length === 0) return;
      const result = await onPick(picks);
      if (result !== false) api.clearSelection();
    } finally {
      setPicking(false);
    }
  };
  const working = picking || busy;

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-white">
      <FilterBar api={api} />
      <div className="flex items-center justify-between px-3 py-2 text-[12px] text-slate-500">
        <span>
          {api.loading ? (
            "불러오는 중…"
          ) : (
            <>
              <span className="font-bold text-blue-700">
                총 {api.total.toLocaleString()}개
              </span>{" "}
              지문
              {api.facets ? (
                <span className="text-slate-400">
                  {" "}
                  / 전체 {api.facets.total.toLocaleString()}
                </span>
              ) : null}
            </>
          )}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        {api.loading ? (
          <div className="grid grid-cols-1 gap-2.5 sm:[grid-template-columns:repeat(auto-fill,minmax(360px,1fr))]">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-[190px] animate-pulse rounded-xl border border-slate-200 bg-slate-50"
              />
            ))}
          </div>
        ) : api.error ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <p className="text-[13px] font-semibold text-slate-600">{api.error}</p>
          </div>
        ) : api.items.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2.5 px-6 text-center">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
              <BookOpenText className="size-6" />
            </span>
            <p className="text-[13px] font-semibold text-slate-600">
              조건에 맞는 지문이 없습니다
            </p>
            {api.activeFilterCount > 0 ? (
              <button
                type="button"
                onClick={api.clearFilters}
                className="text-[12px] font-semibold text-blue-600 hover:underline"
              >
                필터 초기화
              </button>
            ) : null}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-2.5 sm:[grid-template-columns:repeat(auto-fill,minmax(360px,1fr))]">
              {api.items.map((p) => (
                <PassageCard
                  key={p.id}
                  passage={p}
                  selectable={pickable}
                  selected={api.isSelected(p.id)}
                  onToggle={() => api.toggleSelect(p.id)}
                  onOpen={() => setDetail(p)}
                />
              ))}
            </div>
            <Pagination
              page={api.page}
              totalPages={api.totalPages}
              onGoToPage={api.setPage}
            />
          </>
        )}
      </div>

      {pickable ? (
        <div
          className={
            "shrink-0 border-t border-slate-200 bg-white px-3 py-2.5 shadow-[0_-3px_10px_rgba(15,23,42,0.05)]" +
            (mobileFixedFooter
              ? " max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-40"
              : "")
          }
        >
          {api.selectedCount > 0 ? (
            <div className="mb-1.5 flex items-center justify-between text-[12.5px] text-slate-600">
              <span>
                <span className="font-bold text-blue-700">
                  {api.selectedCount}개
                </span>{" "}
                선택됨
              </span>
              <button
                type="button"
                onClick={api.clearSelection}
                className="rounded px-1.5 py-0.5 text-[11.5px] font-semibold text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              >
                선택 해제
              </button>
            </div>
          ) : null}
          <button
            type="button"
            aria-disabled={working || api.selectedCount === 0}
            onClick={handlePick}
            className={
              "inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-md text-[13px] font-bold shadow-sm transition " +
              (working || api.selectedCount === 0
                ? "cursor-not-allowed bg-slate-200 text-slate-400 shadow-none"
                : "cursor-pointer bg-blue-600 text-white hover:bg-blue-700")
            }
          >
            {working ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Download className="size-4" />
            )}
            {working
              ? "담는 중…"
              : api.selectedCount > 0
                ? `${pickLabel} (${api.selectedCount})`
                : pickLabel}
          </button>
        </div>
      ) : null}

      {detail ? (
        <DetailModal
          passage={detail}
          fetchDetail={api.fetchDetail}
          onClose={() => setDetail(null)}
        />
      ) : null}
    </div>
  );
}

// ── 필터 바 ──────────────────────────────────────────────
function FilterBar({ api }: { api: KoreanExamPassageLibraryApi }) {
  const f = api.facets;
  return (
    <div className="shrink-0 space-y-2 border-b border-slate-100 bg-white px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <FilterMenu
          label="출처"
          options={(f?.boards ?? []).map((b) => ({
            value: b,
            label: koSourceLabel(b),
            count: f?.counts.board[b],
          }))}
          selected={api.filters.boards}
          onToggle={(v) => api.toggle("boards", v)}
        />
        <FilterMenu
          label="학년"
          options={(f?.grades ?? []).map((g) => ({
            value: g,
            label: g,
            count: f?.counts.grade[g],
          }))}
          selected={api.filters.grades}
          onToggle={(v) => api.toggle("grades", v)}
        />
        <FilterMenu
          label="갈래"
          options={(f?.galaes ?? []).map((g) => ({
            value: g,
            label: g,
            count: f?.counts.galae[g],
          }))}
          selected={api.filters.galaes}
          onToggle={(v) => api.toggle("galaes", v)}
        />
        <FilterMenu
          label="세부영역"
          searchable
          options={(f?.subGenres ?? []).map((g) => ({
            value: g,
            label: g,
            count: f?.counts.subGenre[g],
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
          label="연도"
          variant="grid"
          options={(f?.years ?? []).map((y) => ({ value: y, label: String(y) }))}
          selected={api.filters.years}
          onToggle={(v) => api.toggle("years", v)}
        />
        <FilterMenu
          label="회차"
          options={(f?.sihengs ?? []).map((s) => ({
            value: s,
            label: s,
            count: f?.counts.siheng[s],
          }))}
          selected={api.filters.sihengs}
          onToggle={(v) => api.toggle("sihengs", v)}
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

        <div className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            value={api.searchInput}
            onChange={(e) => api.setSearchInput(e.target.value)}
            placeholder="지문·주제·제재·키워드 검색 (예: 고전소설, 열역학, 자아)"
            className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-8 text-[12.5px] text-slate-700 placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/10"
          />
          {api.searchInput ? (
            <button
              type="button"
              onClick={() => api.setSearchInput("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:bg-slate-100"
              aria-label="검색어 지우기"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>
        {api.activeFilterCount > 0 ? (
          <button
            type="button"
            onClick={api.clearFilters}
            className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[12px] font-semibold text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="size-3.5" /> 초기화
          </button>
        ) : null}
      </div>
    </div>
  );
}

type Opt<T> = { value: T; label: string; count?: number };

function FilterMenu<T extends string | number>({
  label,
  options,
  selected,
  onToggle,
  variant = "list",
  searchable = false,
}: {
  label: string;
  options: Opt<T>[];
  selected: Set<T>;
  onToggle: (v: T) => void;
  variant?: "list" | "grid";
  searchable?: boolean;
}) {
  const [kw, setKw] = useState("");
  const count = selected.size;
  const active = count > 0;
  const shown = searchable && kw
    ? options.filter((o) => o.label.toLowerCase().includes(kw.toLowerCase()))
    : options;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
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
      <PopoverContent
        align="start"
        className={variant === "grid" ? "w-[264px] p-2.5" : "w-64 p-1.5"}
      >
        {searchable ? (
          <input
            value={kw}
            onChange={(e) => setKw(e.target.value)}
            placeholder={`${label} 검색`}
            className="mb-1.5 h-7 w-full rounded-md border border-slate-200 bg-slate-50 px-2 text-[11.5px] focus:outline-none"
          />
        ) : null}
        {variant === "grid" ? (
          <div className="grid grid-cols-4 gap-1">
            {shown.map((o) => {
              const on = selected.has(o.value);
              return (
                <button
                  key={String(o.value)}
                  type="button"
                  onClick={() => onToggle(o.value)}
                  className={
                    "h-7 rounded-md border text-[11.5px] font-semibold transition " +
                    (on
                      ? "border-blue-600 bg-blue-50 text-blue-700"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50")
                  }
                >
                  {o.label}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="max-h-72 overflow-y-auto">
            {shown.map((o) => {
              const on = selected.has(o.value);
              return (
                <button
                  key={String(o.value)}
                  type="button"
                  onClick={() => onToggle(o.value)}
                  className={
                    "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-[12px] font-medium transition " +
                    (on ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50")
                  }
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span
                      className={
                        "flex size-4 shrink-0 items-center justify-center rounded border " +
                        (on ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 text-transparent")
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
        )}
      </PopoverContent>
    </Popover>
  );
}

// ── 카드 ─────────────────────────────────────────────────
function PassageCard({
  passage: p,
  selectable = false,
  selected = false,
  onToggle,
  onOpen,
}: {
  passage: KoPassage;
  selectable?: boolean;
  selected?: boolean;
  onToggle?: () => void;
  onOpen: () => void;
}) {
  const a = p.analysis;
  return (
    <div
      data-ko-exam-card
      role={selectable ? "button" : undefined}
      onClick={selectable ? onToggle : onOpen}
      className={
        "flex cursor-pointer flex-col gap-2 rounded-xl border bg-white p-3 text-left transition hover:shadow-sm " +
        (selectable && selected
          ? "border-blue-500 ring-1 ring-blue-500"
          : "border-slate-200 hover:border-blue-300")
      }
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {selectable ? (
          <span
            className={
              "flex size-4 shrink-0 items-center justify-center rounded border " +
              (selected
                ? "border-blue-600 bg-blue-600 text-white"
                : "border-slate-300 text-transparent")
            }
          >
            <Check className="size-3" strokeWidth={3} />
          </span>
        ) : null}
        <Badge className={galaeBadgeClass(p.galae)}>{p.galae}</Badge>
        {p.subGenre ? (
          <Badge className="text-slate-600 bg-slate-100 border-slate-200">
            {p.subGenre}
          </Badge>
        ) : null}
        {p.difficulty ? (
          <Badge className={difficultyBadgeClass(p.difficulty)}>
            {p.difficulty}
          </Badge>
        ) : null}
        <Badge className={koGradeBadgeClass(p.grade)}>{p.grade}</Badge>
        <span className="ml-auto text-[10.5px] font-medium text-slate-400">
          {koSourceLabel(p.board)} · {p.year} {p.siheng}
        </span>
      </div>
      {a ? (
        <p className="line-clamp-2 text-[12.5px] font-semibold text-slate-800">
          {a["핵심주제"]}
        </p>
      ) : null}
      <p className="line-clamp-2 text-[11.5px] leading-relaxed text-slate-500">
        {p.passageText.slice(0, 160)}
      </p>
      {a ? (
        <div className="flex flex-wrap items-center gap-1">
          {(a["핵심키워드"] ?? []).slice(0, 5).map((k) => (
            <span
              key={k}
              className="rounded bg-blue-50/70 px-1.5 py-0.5 text-[10px] font-medium text-blue-600"
            >
              {k}
            </span>
          ))}
          {selectable ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpen();
              }}
              className="ml-auto rounded px-1.5 py-0.5 text-[10.5px] font-semibold text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            >
              상세
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// Badge·DetailModal(지문 상세: 원문+분석+문제)은 ./detail-modal 로 분리 —
// 문학 출제 트렌드 대시보드(korean-lit-trends)와 공유한다.
