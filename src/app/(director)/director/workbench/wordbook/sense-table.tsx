"use client";

// ============================================================================
// 단어장 생성 스튜디오 — 탐색 테이블
//
// senses 모드: 뜻(sense) 단위 목록 — 정렬 가능한 밀도 테이블.
// shift 모드: 뜻이 달라진 단어 — 양쪽 시기·학년에서 주로 쓰인 뜻을 나란히.
//
// 상태는 전부 셸(wordbook-client)이 소유하고 여기는 표시+콜백만 한다.
// 담기 입력 3종: 단건 토글(onToggleBasket) · shift+클릭 범위·드래그 쓸어담기·
// 모두 담기(onApplyBasket — 멱등 적용. 상한 처리·알림은 셸 몫).
// 좁은 화면에서 컬럼을 찌그러뜨리지 않기 위해 테이블에 min-width 를 걸고
// 바깥 스크롤 영역(overflow-auto)이 가로 스크롤을 흡수한다.
// ============================================================================

import {
  useEffect,
  useMemo,
  useRef,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { ArrowDown } from "lucide-react";
import { DragSelect } from "@/components/ui/drag-select";
import { DiffDots, MiniBar, PosChip, TierChip, TrendChip, fmt, fmt1 } from "./wordbook-ui";
import { ShiftTable } from "./shift-table";
import { BasketButton, TH, senseItem, shiftItem } from "./table-bits";
import {
  WORDBOOK_SORT_LABELS,
  type WordbookBasketItem,
  type WordbookSenseRow,
  type WordbookShiftRow,
  type WordbookSort,
} from "./wordbook-types";

interface SenseTableProps {
  mode: "senses" | "shift";
  rows: WordbookSenseRow[];
  shiftRows: WordbookShiftRow[];
  shiftAxis: "era" | "grade";
  total: number;
  sort: WordbookSort;
  onSort: (s: WordbookSort) => void;
  loading: boolean;
  selectedLemmaId: string | null;
  onSelect: (lemmaId: string) => void;
  basketSenseIds: ReadonlySet<string>;
  onToggleBasket: (item: WordbookBasketItem) => void;
  /** 멱등 적용(on=담기/off=빼기) — 범위·쓸어담기·모두 담기 공용. 토글 아님 */
  onApplyBasket: (items: WordbookBasketItem[], on: boolean) => void;
  onLoadMore: () => void;
  hasMore: boolean;
  /** 비-append 질의마다 증가 — 스크롤을 원점으로 되돌리는 신호(셸 소유) */
  queryEpoch: number;
}

/** 모바일 정렬 select 노출 순서 — 계약 고정. md 이상은 헤더 클릭이 담당한다. */
const MOBILE_SORT_KEYS: readonly WordbookSort[] = [
  "per10k",
  "occurrences",
  "trapRate",
  "difficulty",
  "lemma",
  "sn",
  "mp",
  "hp",
];

// ── 정렬 헤더 ────────────────────────────────────────────────────────────────

function SortTh({
  k, label, sort, onSort, className = "", title,
}: {
  k: WordbookSort;
  label: string;
  sort: WordbookSort;
  onSort: (s: WordbookSort) => void;
  className?: string;
  /** 짧은 헤더(빈도·함정)를 풀어 쓰는 툴팁 */
  title?: string;
}) {
  const active = sort === k;
  return (
    <th
      className={`${TH} ${className}`}
      title={title}
      // lemma 만 오름차순(철자순)이지만 아이콘은 "정렬 중" 표시로 통일한다 —
      // 방향 화살표를 섞으면 나머지 DESC 컬럼과 시각 문법이 충돌한다.
      aria-sort={active ? (k === "lemma" ? "ascending" : "descending") : undefined}
    >
      <button
        type="button"
        onClick={() => onSort(k)}
        className={`inline-flex items-center gap-0.5 ${
          active ? "text-slate-900" : "text-slate-500 hover:text-slate-700"
        }`}
      >
        {label}
        {active ? <ArrowDown className="size-3" /> : null}
      </button>
    </th>
  );
}

// ── 본체 ─────────────────────────────────────────────────────────────────────

export function SenseTable({
  mode,
  rows,
  shiftRows,
  shiftAxis,
  total,
  sort,
  onSort,
  loading,
  selectedLemmaId,
  onSelect,
  basketSenseIds,
  onToggleBasket,
  onApplyBasket,
  onLoadMore,
  hasMore,
  queryEpoch,
}: SenseTableProps) {
  // MiniBar 기준값 — 현재 페이지 내 상대 비교(전역 최대는 롱테일이라 다 눌린다).
  const per10kMax = useMemo(
    () => rows.reduce((m, r) => Math.max(m, r.per10k ?? 0), 0),
    [rows],
  );

  // 질의가 바뀌면(비-append) 스크롤 원점 복귀 — 중간 지점에서 결과만 갈리면
  // 바뀐 것을 알아채기 어렵다(렌즈·정렬·필터 전환 공통).
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = 0;
      el.scrollLeft = 0;
    }
  }, [queryEpoch]);

  // ── 영역 드래그(마키) 담기 — 리포 정본 DragSelect(문제 관리와 동일 UX) ──────
  // 표 어디서든(+ 버튼·정렬 버튼 제외) 드래그하면 파란 사각형이 그려지고,
  // 걸친 행이 전부 담긴다. 텍스트 선택은 DragSelect 가 드래그 중 차단한다.
  // 마키는 **담기 전용**이다(비추가 드래그의 기본 선택 교체 의미를 그대로 쓰면
  // 이전에 담아 둔 장바구니가 통째로 지워진다) — 빼기는 + 클릭·담은 단어 패널.
  const itemById = useMemo(() => {
    const map = new Map<string, WordbookBasketItem>();
    if (mode === "senses") for (const r of rows) map.set(r.senseId, senseItem(r));
    else for (const r of shiftRows) map.set(r.bSenseId, shiftItem(r));
    return map;
  }, [mode, rows, shiftRows]);

  const marqueeValue = useMemo(() => new Set(basketSenseIds), [basketSenseIds]);

  // 마키 성능 규율은 DragSelect deferCommit 이 담당한다 — 드래그 중 리액트
  // 무접촉(인라인 틴트만), 릴리스에서 1회 커밋.
  // · 담기 드래그(빈 곳/미담김 행에서 시작): 최종 집합의 새 항목만 담는다
  //   (교체 의미로 쓰면 다른 렌즈에서 담아 둔 장바구니까지 지워진다).
  // · 해제 드래그(담긴 행에서 시작, meta.deferMode="remove"): next 는
  //   "남길 집합" — 빠진 id 가 해제 대상이다. 화면 밖(다른 렌즈) 항목은
  //   히트 자체가 안 되므로 next 에 그대로 남는다.
  const handleMarquee = (
    next: Set<string>,
    meta?: { deferMode: "add" | "remove" },
  ) => {
    if (meta?.deferMode === "remove") {
      const removals: WordbookBasketItem[] = [];
      for (const id of basketSenseIds) {
        if (next.has(id)) continue;
        const item = itemById.get(id);
        if (item) removals.push(item);
      }
      if (removals.length) onApplyBasket(removals, false);
      return;
    }
    const additions: WordbookBasketItem[] = [];
    for (const id of next) {
      if (basketSenseIds.has(id)) continue;
      const item = itemById.get(id);
      if (item) additions.push(item);
    }
    if (additions.length) onApplyBasket(additions, true);
  };

  /** shift+클릭 범위 앵커 — 마지막으로 담기 버튼을 클릭한 행 인덱스 */
  const anchorIndex = useRef<number | null>(null);
  useEffect(() => {
    // 질의·모드·축이 바뀌면 행 인덱스의 의미가 달라진다 — 범위 앵커 무효화
    anchorIndex.current = null;
  }, [mode, shiftAxis, queryEpoch]);

  /** 담기 버튼 클릭 — shift+클릭이면 앵커~현재 범위 전부 담기, 아니면 단건 토글 */
  const basketClick = (e: ReactMouseEvent, index: number, item: WordbookBasketItem) => {
    const anchor = anchorIndex.current;
    if (e.shiftKey && anchor !== null) {
      const lo = Math.min(anchor, index);
      const hi = Math.max(anchor, index);
      onApplyBasket(
        mode === "senses"
          ? rows.slice(lo, hi + 1).map(senseItem)
          : shiftRows.slice(lo, hi + 1).map(shiftItem),
        true,
      );
    } else {
      onToggleBasket(item);
    }
    anchorIndex.current = index;
  };

  // 행 클릭(도시에 열기) — 마키 직후의 합성 click 은 DragSelect 가 삼킨다.
  const rowClick = onSelect;

  /** 지금 목록에 보이는 단어 전부 담기 — shift 모드는 B축 뜻 전체 */
  const addAllVisible = () => {
    onApplyBasket(
      mode === "senses" ? rows.map(senseItem) : shiftRows.map(shiftItem),
      true,
    );
  };

  const addTitle = "단어장에 담습니다 · 표를 드래그하면 한꺼번에";
  const removeTitle = "단어장에서 뺍니다 · 담긴 행에서 드래그하면 한꺼번에 해제";

  return (
    <section className="flex min-w-0 flex-1 flex-col">
      {/* ── 툴바 ── */}
      <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-slate-200 px-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-[11.5px] text-slate-500">
            {mode === "senses" ? (
              <>단어 <span className="font-semibold tabular-nums text-slate-900">{fmt(total)}</span></>
            ) : (
              <>찾은 단어 <span className="font-semibold tabular-nums text-slate-900">{shiftRows.length}</span>개</>
            )}
          </span>
          {loading ? (
            <span
              className="size-3.5 shrink-0 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600"
              aria-label="불러오는 중"
            />
          ) : null}
          {mode === "shift" ? (
            <span className="hidden truncate text-[10.5px] text-slate-400 sm:inline">
              수집한 예문 기준 · 양쪽에 예문 4개 이상 · 주로 쓰인 뜻이 20% 이상일 때만 보여 줍니다
            </span>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {(mode === "senses" ? rows.length : shiftRows.length) > 0 ? (
            <button
              type="button"
              onClick={addAllVisible}
              title="지금 목록에 보이는 단어를 전부 단어장에 담습니다"
              className="hidden text-[11.5px] font-semibold text-blue-600 hover:text-blue-700 md:inline"
            >
              보이는 단어 모두 담기
            </button>
          ) : null}
          {/* 모바일에선 헤더 정렬 버튼이 가로 스크롤 밖으로 밀려 안 보인다 — select 로 대체 */}
          {mode === "senses" ? (
            <select
              value={sort}
              onChange={(e) => onSort(e.target.value as WordbookSort)}
              aria-label="정렬 기준"
              className="h-6 shrink-0 rounded border border-slate-200 bg-white px-1 text-[11px] text-slate-600 md:hidden"
            >
              {MOBILE_SORT_KEYS.map((k) => (
                <option key={k} value={k}>
                  {WORDBOOK_SORT_LABELS[k]}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      </div>

      {/* ── 스크롤 영역 — DragSelect 가 마키(영역 드래그 담기)를 그린다 ── */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
        <DragSelect
          value={marqueeValue}
          onChange={handleMarquee}
          deferCommit
          className="min-h-full"
        >
        {mode === "senses" ? (
          <>
            <table className="w-full min-w-[920px] border-collapse text-[12.5px]">
              <thead className="sticky top-0 z-10 bg-white shadow-[inset_0_-1px_0_theme(colors.slate.200)]">
                <tr>
                  <th className={`${TH} w-9`}>
                    <span className="sr-only">담기</span>
                  </th>
                  <SortTh k="lemma" label="단어" sort={sort} onSort={onSort} />
                  <th className={`${TH} w-14`}>품사</th>
                  <th className={TH}>대표 뜻</th>
                  <SortTh k="per10k" label="빈도" sort={sort} onSort={onSort} className="w-[112px]" title="기출 지문 1만 단어마다 몇 번 나왔는지" />
                  {/* 함정을 빈도 바로 옆에 — "얼마나 자주 × 얼마나 위험"이 덱 편성의
                      핵심 조합이라 첫 화면 폭 안에 같이 들어와야 한다(1680px 실측). */}
                  <SortTh k="trapRate" label="함정" sort={sort} onSort={onSort} className="w-12" title="학생이 뜻을 잘못 알기 쉬운 정도" />
                  <SortTh k="sn" label="수능" sort={sort} onSort={onSort} className="w-[52px]" />
                  <SortTh k="mp" label="모평" sort={sort} onSort={onSort} className="w-[52px]" />
                  <SortTh k="hp" label="학평" sort={sort} onSort={onSort} className="w-[52px]" />
                  <th className={`${TH} w-10`} title="주로 나온 학년">학년</th>
                  <th className={`${TH} w-12`}>수준</th>
                  <SortTh k="difficulty" label="난이도" sort={sort} onSort={onSort} className="w-14" />
                  <th className={`${TH} w-20`}>추세</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const inBasket = basketSenseIds.has(r.senseId);
                  const selected = selectedLemmaId === r.lemmaId;
                  return (
                    <tr
                      key={r.senseId}
                      data-drag-item-id={r.senseId}
                      onClick={() => rowClick(r.lemmaId)}
                      // 배경 우선순위: 도시에 선택 > 담김 > hover
                      className={`h-9 cursor-pointer border-b border-slate-100 ${
                        selected ? "bg-blue-50/70" : inBasket ? "bg-blue-50/40" : "hover:bg-slate-50"
                      }`}
                    >
                      <td className="pl-2 pr-1">
                        <BasketButton
                          active={inBasket}
                          title={inBasket ? removeTitle : addTitle}
                          onClick={(e) => basketClick(e, i, senseItem(r))}
                        />
                      </td>
                      <td className="whitespace-nowrap px-2 font-semibold text-slate-900">
                        {r.lemma}
                        {r.lemmaSenseCount > 1 ? (
                          <span className="ml-1 text-[10px] font-medium text-blue-500">
                            뜻{r.lemmaSenseCount}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-2">
                        <PosChip pos={r.pos} />
                      </td>
                      <td className="max-w-[240px] px-2">
                        <div className="truncate text-slate-600" title={r.senseKo}>
                          {/* allSenses 필터에선 비대표 뜻 행이 섞인다 — 몇 번째 뜻인지 표기 */}
                          {r.senseOrder > 0 ? (
                            <span className="mr-1 text-[10px] text-slate-400">
                              #{r.senseOrder + 1}
                            </span>
                          ) : null}
                          {r.senseKo}
                        </div>
                      </td>
                      <td className="px-2">
                        <div className="flex items-center justify-end gap-1.5">
                          <span className="w-10 shrink-0 text-right tabular-nums text-slate-700">
                            {fmt1(r.per10k)}
                          </span>
                          <MiniBar value={r.per10k ?? 0} max={per10kMax} />
                        </div>
                      </td>
                      <td className="px-2">
                        {r.trapCount > 0 ? (
                          <span
                            className={`tabular-nums ${
                              r.trapRate >= 0.5
                                ? "font-semibold text-rose-600"
                                : r.trapRate >= 0.25
                                  ? "text-amber-600"
                                  : "text-slate-500"
                            }`}
                            title={`함정 노트 ${r.trapCount}개`}
                          >
                            {Math.round(r.trapRate * 100)}%
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      {/* 시행처 3종은 구조가 같다 — key 는 컬럼 이름으로 고정 */}
                      {([["sn", r.sn], ["mp", r.mp], ["hp", r.hp]] as const).map(([k, v]) => (
                        <td
                          key={k}
                          className={`px-2 text-right tabular-nums ${v === 0 ? "text-slate-300" : "text-slate-600"}`}
                        >
                          {fmt(v)}
                        </td>
                      ))}
                      <td className="whitespace-nowrap px-2 text-slate-500">
                        {r.gradeTop ?? "—"}
                      </td>
                      <td className="px-2">
                        <TierChip tier={r.tier} />
                      </td>
                      <td className="px-2">
                        <DiffDots n={r.difficulty} />
                      </td>
                      <td className="px-2">
                        <TrendChip label={r.trendLabel} ratio={r.trendRatio} />
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && !loading ? (
                  <tr>
                    <td colSpan={13} className="py-20">
                      {/* sticky — 테이블 min-width 중앙이 아니라 보이는 영역 중앙에 */}
                      <div className="sticky left-0 max-w-[100vw] text-center">
                        <p className="text-[13px] font-medium text-slate-600">
                          조건에 맞는 단어가 없습니다
                        </p>
                        <p className="mt-1 text-[11px] text-slate-400">
                          조건을 넓혀 보세요
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
            {hasMore ? (
              <button
                type="button"
                onClick={onLoadMore}
                disabled={loading}
                className="sticky left-0 h-10 w-full text-[12px] tabular-nums text-slate-500 hover:bg-slate-50 disabled:cursor-default disabled:hover:bg-white"
              >
                {loading ? "불러오는 중…" : `더 보기 (${rows.length}/${fmt(total)})`}
              </button>
            ) : null}
          </>
        ) : (
          <ShiftTable
            shiftRows={shiftRows}
            shiftAxis={shiftAxis}
            loading={loading}
            selectedLemmaId={selectedLemmaId}
            basketSenseIds={basketSenseIds}
            addTitle={addTitle}
            removeTitle={removeTitle}
            onRowClick={rowClick}
            onBasketClick={basketClick}
          />
        )}
        </DragSelect>
      </div>
    </section>
  );
}
