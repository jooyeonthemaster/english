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
// 폭 전략: **가로 스크롤을 만들지 않는다.** table-fixed 로 지정폭 합계만 지키고
// 남는 폭은 단어·대표 뜻이 나눠 가진다(넘치면 말줄임 + title). 그래도 안 들어가는
// 좁은 구간에서는 COL_HIDE 가 값이 낮은 컬럼부터 접는다.
// ============================================================================

import {
  useEffect,
  useMemo,
  useRef,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { DragSelect } from "@/components/ui/drag-select";
import { DiffDots, MiniBar, PosChip, TierChip, TrendChip, fmt, fmt1 } from "./wordbook-ui";
import { ShiftTable } from "./shift-table";
import { COLUMN_FILTERS, HeaderTh } from "./column-menu";
import { BasketButton, TH, senseItem, shiftItem } from "./table-bits";
import { Pagination } from "./pagination";
import {
  WORDBOOK_SORT_LABELS,
  type WordbookBasketItem,
  type WordbookFilter,
  type WordbookSenseRow,
  type WordbookShiftRow,
  type WordbookSort,
  type WordbookSortDir,
} from "./wordbook-types";

interface SenseTableProps {
  mode: "senses" | "shift";
  rows: WordbookSenseRow[];
  shiftRows: WordbookShiftRow[];
  shiftAxis: "era" | "grade";
  total: number;
  sort: WordbookSort;
  sortDir: WordbookSortDir;
  onSort: (s: WordbookSort) => void;
  /** 헤더 깔때기 메뉴가 레일과 같은 필터를 패치한다(상태 단일 소스) */
  filter: WordbookFilter;
  onFilter: (patch: Partial<WordbookFilter>) => void;
  loading: boolean;
  selectedLemmaId: string | null;
  onSelect: (lemmaId: string) => void;
  basketSenseIds: ReadonlySet<string>;
  onToggleBasket: (item: WordbookBasketItem) => void;
  /** 멱등 적용(on=담기/off=빼기) — 범위·쓸어담기·모두 담기 공용. 토글 아님 */
  onApplyBasket: (items: WordbookBasketItem[], on: boolean) => void;
  /** 페이지네이션 — 1-base. 상태는 셸이 소유하고 여기는 표시+콜백만. */
  page: number;
  pageSize: number;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
  /** 비-append 질의마다 증가 — 스크롤을 원점으로 되돌리는 신호(셸 소유) */
  queryEpoch: number;
}

// ── 컬럼 접힘 우선순위 ───────────────────────────────────────────────────────
//
// 표 고정폭 합계(760px, 범위 렌즈는 832px)에 단어·대표 뜻 가변폭이 얹히면
// 가운데 열이 좁을 때 가로 스크롤이 난다. 강제 최소 너비로 버티면 컬럼이
// 화면 밖으로 잘려 "추세가 안 보이는데 스크롤을 해야 나오는" 상태가 된다.
//
// 그래서 **컨테이너 쿼리로 값이 낮은 컬럼부터 접는다.** 뷰포트가 아니라
// 컨테이너 기준이라 좌우 패널을 접거나 넓히면 그 즉시 컬럼이 돌아온다.
// 접는 순서 근거(덱 편성 관점):
//   1) 모평·학평 — 시행처 3종 중 수능만 남겨도 "본시험 비중" 신호는 유지된다
//   2) 학년      — 좌측 조건에 같은 축 필터가 있다
//   3) 추세      — 렌즈(「요즘 뜨는 단어」)로 대체 가능하다
//   4) 수능      — 마지막 단계. 여기까지 오면 "단어·뜻·빈도·함정·수준·난이도"
//                  라는 덱 편성 최소 축만 남는다(그 아래로는 접지 않는다)
// ⚠️ th 와 td 가 **반드시 같은 상수**를 써야 한다. 하나만 접히면 그 행부터
//    모든 컬럼이 한 칸씩 밀린다.
// ⚠️ 임계값은 **정적 문자열이어야 한다** — Tailwind 는 소스에 그대로 적힌
//    클래스만 생성한다. `@max-[${n}px]` 같은 조립은 스타일이 안 나온다.
//    그래서 「이 범위」 컬럼(+72px)이 붙는 범위 렌즈용을 한 벌 더 적어 둔다.
type ColHide = { mpHp: string; grade: string; trend: string; sn: string; trap: string; diff: string };

const COL_HIDE_BASE: ColHide = {
  mpHp: "@max-[1120px]:hidden",
  grade: "@max-[1000px]:hidden",
  trend: "@max-[920px]:hidden",
  sn: "@max-[880px]:hidden",
  trap: "@max-[560px]:hidden",
  diff: "@max-[520px]:hidden",
};

/** 범위 렌즈 — 「이 범위」 72px 만큼 모든 임계값을 올린다. */
const COL_HIDE_SCOPED: ColHide = {
  mpHp: "@max-[1192px]:hidden",
  grade: "@max-[1072px]:hidden",
  trend: "@max-[992px]:hidden",
  sn: "@max-[952px]:hidden",
  trap: "@max-[632px]:hidden",
  diff: "@max-[592px]:hidden",
};

/** 모바일 정렬 select 노출 순서 — 계약 고정. md 이상은 헤더 클릭이 담당한다. */
const MOBILE_SORT_KEYS: readonly WordbookSort[] = [
  "per10k",
  "occurrences",
  "trapRate",
  "difficulty",
  "lemma",
  "senseKo",
  "pos",
  "gradeTop",
  "tier",
  "trend",
  "sn",
  "mp",
  "hp",
];

// ── 본체 ─────────────────────────────────────────────────────────────────────

export function SenseTable({
  mode,
  rows,
  shiftRows,
  shiftAxis,
  total,
  sort,
  sortDir,
  onSort,
  filter,
  onFilter,
  loading,
  selectedLemmaId,
  onSelect,
  basketSenseIds,
  onToggleBasket,
  onApplyBasket,
  page,
  pageSize,
  onPage,
  onPageSize,
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

  /** 기출 범위 활성 여부 — 「이 범위」 컬럼의 표시 조건. 행의 scopeHits 로
   *  판정하지 않는다(질의 중 빈 rows 에서 컬럼이 깜빡인다). */
  const scoped = !!filter.passage;
  /** 접힘 임계값 — 「이 범위」 유무로 한 벌을 고른다(위 두 상수는 정적). */
  const COL_HIDE = scoped ? COL_HIDE_SCOPED : COL_HIDE_BASE;
  const BOARD_COL_HIDE: Record<"sn" | "mp" | "hp", string> = {
    sn: COL_HIDE.sn,
    mp: COL_HIDE.mpHp,
    hp: COL_HIDE.mpHp,
  };

  const addTitle = "단어장에 담습니다 · 표를 드래그하면 한꺼번에";
  const removeTitle = "단어장에서 뺍니다 · 담긴 행에서 드래그하면 한꺼번에 해제";

  return (
    // ★ min-h-0 필수 — 이 섹션은 **열(column) 플렉스의 자식**이다(부모가 범위 바와
    //   표를 세로로 쌓는다). flex 자식의 기본 min-height 는 auto 라, 이게 없으면
    //   섹션이 부모 높이를 넘겨 자라고 아래 overflow-auto 가 잡을 높이를 잃는다
    //   → 표 내부 스크롤이 통째로 죽는다(2026-08-08 실제 회귀).
    <section className="flex min-h-0 min-w-0 flex-1 flex-col">
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
      {/* @container — 컬럼 접힘 판정 기준. 뷰포트가 아니라 **이 열의 실제 폭**이라
          좌우 패널을 접으면 그 즉시 컬럼이 되돌아온다(COL_HIDE 주석 참조). */}
      <div ref={scrollRef} className="@container min-h-0 flex-1 overflow-auto">
        <DragSelect
          value={marqueeValue}
          onChange={handleMarquee}
          deferCommit
          className="min-h-full"
        >
        {mode === "senses" ? (
          <>
            {/* table-fixed — 가로 스크롤을 **구조적으로** 막는다.
                auto 레이아웃에서는 셀 내용(긴 표제어·긴 뜻)이 열 너비를 밀어올려
                아무리 컬럼을 접어도 넘침이 남는다(실측: 1366px 에서 9컬럼만
                남겨도 259px 초과). fixed 로 두면 지정폭 합계만 지키고 나머지는
                남는 폭을 나눠 가지므로, 내용이 길면 말줄임될 뿐 넘치지 않는다.
                COL_HIDE 는 "지정폭 합계마저 안 들어가는" 더 좁은 구간의 안전망. */}
            <table className={`w-full table-fixed border-collapse text-[12.5px] min-w-[480px]`}>
              {/* 전 컬럼 정렬(재클릭 = 방향 반전) + 깔때기 필터(레일과 같은 상태).
                  z-20 — 마키 사각형(z-50)보다는 아래, 행 위 sticky 로만. */}
              <thead className="sticky top-0 z-10 bg-white shadow-[inset_0_-1px_0_theme(colors.slate.200)]">
                <tr>
                  <th className={`${TH} w-9`}>
                    <span className="sr-only">담기</span>
                  </th>
                  {/* 단어·대표 뜻만 가변 — 남는 폭을 이 둘이 나눠 갖는다(table-fixed).
                      길면 말줄임되고, 전체 문자열은 title 로 확인할 수 있다. */}
                  <HeaderTh label="단어" sortKey="lemma" sort={sort} sortDir={sortDir} onSort={onSort} filter={filter} onFilter={onFilter} />
                  <HeaderTh label="품사" sortKey="pos" className="w-[68px]" sort={sort} sortDir={sortDir} onSort={onSort} filterSpec={COLUMN_FILTERS.pos} filter={filter} onFilter={onFilter} />
                  <HeaderTh label="대표 뜻" sortKey="senseKo" sort={sort} sortDir={sortDir} onSort={onSort} filter={filter} onFilter={onFilter} />
                  {/* 기출 범위가 걸렸을 때만 — 범위 밖에서는 의미 없는 수치다(전부 null) */}
                  {scoped ? (
                    <HeaderTh label="이 범위" sortKey="scopeHits" className="w-[72px]" hint="고른 기출 범위에서 이 단어가 나온 지문 수" sort={sort} sortDir={sortDir} onSort={onSort} filter={filter} onFilter={onFilter} />
                  ) : null}
                  {/* 함정을 빈도 바로 옆에 — "얼마나 자주 × 얼마나 위험"이 덱 편성의
                      핵심 조합이라 첫 화면 폭 안에 같이 들어와야 한다(1680px 실측). */}
                  <HeaderTh label="빈도" sortKey="per10k" className="w-[104px]" hint="기출 지문 1만 단어마다 몇 번 나왔는지" sort={sort} sortDir={sortDir} onSort={onSort} filter={filter} onFilter={onFilter} />
                  <HeaderTh label="함정" sortKey="trapRate" className={`w-14 ${COL_HIDE.trap}`} hint="학생이 뜻을 잘못 알기 쉬운 정도" sort={sort} sortDir={sortDir} onSort={onSort} filterSpec={COLUMN_FILTERS.trap} filter={filter} onFilter={onFilter} />
                  <HeaderTh label="수능" sortKey="sn" className={`w-[56px] ${BOARD_COL_HIDE.sn}`} sort={sort} sortDir={sortDir} onSort={onSort} filterSpec={COLUMN_FILTERS.sn} filter={filter} onFilter={onFilter} />
                  <HeaderTh label="모평" sortKey="mp" className={`w-[56px] ${COL_HIDE.mpHp}`} sort={sort} sortDir={sortDir} onSort={onSort} filterSpec={COLUMN_FILTERS.mp} filter={filter} onFilter={onFilter} />
                  <HeaderTh label="학평" sortKey="hp" className={`w-[56px] ${COL_HIDE.mpHp}`} sort={sort} sortDir={sortDir} onSort={onSort} filterSpec={COLUMN_FILTERS.hp} filter={filter} onFilter={onFilter} />
                  <HeaderTh label="학년" sortKey="gradeTop" className={`w-14 ${COL_HIDE.grade}`} hint="주로 나온 학년" sort={sort} sortDir={sortDir} onSort={onSort} filterSpec={COLUMN_FILTERS.grade} filter={filter} onFilter={onFilter} />
                  <HeaderTh label="수준" sortKey="tier" className="w-14" sort={sort} sortDir={sortDir} onSort={onSort} filterSpec={COLUMN_FILTERS.tier} filter={filter} onFilter={onFilter} />
                  <HeaderTh label="난이도" sortKey="difficulty" className={`w-[68px] ${COL_HIDE.diff}`} sort={sort} sortDir={sortDir} onSort={onSort} filterSpec={COLUMN_FILTERS.difficulty} filter={filter} onFilter={onFilter} />
                  <HeaderTh label="추세" sortKey="trend" className={`w-[84px] ${COL_HIDE.trend}`} hint="예전 시험 대비 요즘 시험에서 얼마나 잦아졌는지" sort={sort} sortDir={sortDir} onSort={onSort} filterSpec={COLUMN_FILTERS.trend} filter={filter} onFilter={onFilter} />
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
                      {/* table-fixed 라 폭이 고정 — 긴 표제어(take ownership of)는
                          잘리므로 전체 문자열을 title 로 남긴다. */}
                      <td className="truncate px-2 font-semibold text-slate-900" title={r.lemma}>
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
                      <td className="px-2">
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
                      {scoped ? (
                        <td className="px-2 text-right tabular-nums">
                          {r.scopeHits ? (
                            <span
                              className="font-semibold text-blue-700"
                              title={`고른 범위에서 지문 ${fmt(r.scopeHits)}개에 나왔습니다`}
                            >
                              {fmt(r.scopeHits)}
                            </span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                      ) : null}
                      <td className="px-2">
                        <div className="flex items-center justify-end gap-1.5">
                          <span className="w-10 shrink-0 text-right tabular-nums text-slate-700">
                            {fmt1(r.per10k)}
                          </span>
                          <MiniBar value={r.per10k ?? 0} max={per10kMax} />
                        </div>
                      </td>
                      <td className={`px-2 ${COL_HIDE.trap}`}>
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
                      {/* 시행처 3종은 구조가 같다 — key 는 컬럼 이름으로 고정.
                          접힘 클래스는 헤더와 같은 BOARD_COL_HIDE 에서 가져온다. */}
                      {([["sn", r.sn], ["mp", r.mp], ["hp", r.hp]] as const).map(([k, v]) => (
                        <td
                          key={k}
                          className={`px-2 text-right tabular-nums ${BOARD_COL_HIDE[k]} ${v === 0 ? "text-slate-300" : "text-slate-600"}`}
                        >
                          {fmt(v)}
                        </td>
                      ))}
                      <td className={`whitespace-nowrap px-2 text-slate-500 ${COL_HIDE.grade}`}>
                        {r.gradeTop ?? "—"}
                      </td>
                      <td className="px-2">
                        <TierChip tier={r.tier} />
                      </td>
                      <td className={`px-2 ${COL_HIDE.diff}`}>
                        <DiffDots n={r.difficulty} />
                      </td>
                      <td className={`px-2 ${COL_HIDE.trend}`}>
                        <TrendChip label={r.trendLabel} ratio={r.trendRatio} />
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && !loading ? (
                  <tr>
                    {/* colSpan 은 접힘과 무관하게 최대 컬럼 수로 둔다 — 숨은 칸도
                        테이블 열 수에는 남아 있어 모자라면 빈 칸이 생긴다. */}
                    <td colSpan={scoped ? 14 : 13} className="py-20">
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
      {/* 페이지네이션은 스크롤 영역 **밖**이다 — 표를 끝까지 내려도 항상 보인다.
          의미 이동(shift) 모드는 발굴 결과 고정 목록이라 페이지가 없다. */}
      {mode === "senses" ? (
        <Pagination
          page={page}
          pageSize={pageSize}
          total={total}
          rowCount={rows.length}
          loading={loading}
          onPage={onPage}
          onPageSize={onPageSize}
        />
      ) : null}
    </section>
  );
}
