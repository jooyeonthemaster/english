"use client";

// ============================================================================
// 단어장 생성 스튜디오 — 탐색 테이블
//
// senses 모드: 뜻(sense) 단위 목록 — 정렬 가능한 밀도 테이블.
// shift 모드: 의미 이동 발굴 — A축/B축 지배 뜻의 교대를 나란히 보여준다.
//
// 상태는 전부 셸(wordbook-client)이 소유하고 여기는 표시+콜백만 한다.
// 좁은 화면에서 컬럼을 찌그러뜨리지 않기 위해 테이블에 min-width 를 걸고
// 바깥 스크롤 영역(overflow-auto)이 가로 스크롤을 흡수한다.
// ============================================================================

import { useEffect, useMemo, useRef } from "react";
import { ArrowDown, Check, MoveRight, Plus } from "lucide-react";
import {
  DiffDots,
  MiniBar,
  PosChip,
  TierChip,
  TrendChip,
  fmt,
  fmt1,
} from "./wordbook-ui";
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

/** th 공통 클래스 — 헤더 밀도·색의 단일 출처(정렬 버튼은 안쪽에서 색만 덮는다). */
const TH =
  "h-8 whitespace-nowrap px-2 text-left text-[11px] font-semibold text-slate-500";

// ── 정렬 헤더 ────────────────────────────────────────────────────────────────

function SortTh({
  k,
  label,
  sort,
  onSort,
  className = "",
}: {
  k: WordbookSort;
  label: string;
  sort: WordbookSort;
  onSort: (s: WordbookSort) => void;
  className?: string;
}) {
  const active = sort === k;
  return (
    <th
      className={`${TH} ${className}`}
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

// ── 담기 버튼 (양 모드 공용) ─────────────────────────────────────────────────

function BasketButton({
  active,
  title,
  onToggle,
}: {
  active: boolean;
  title: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        // 행 클릭(도시에 열기)과 겹치지 않도록 전파를 끊는다.
        e.stopPropagation();
        onToggle();
      }}
      title={title}
      aria-pressed={active}
      className={`flex size-6 items-center justify-center rounded-full transition-colors ${
        active
          ? "bg-blue-600 text-white"
          : "border border-slate-300 text-slate-400 hover:border-blue-400 hover:text-blue-600"
      }`}
    >
      {active ? <Check className="size-3.5" /> : <Plus className="size-3.5" />}
    </button>
  );
}

// ── 의미 이동 A/B 지배 뜻 셀 ─────────────────────────────────────────────────

function ShareCell({
  senseKo,
  share,
  fill,
}: {
  senseKo: string;
  share: number;
  fill: string;
}) {
  const pct = Math.round(share * 100);
  return (
    <div>
      <div className="flex items-baseline gap-1.5">
        <span
          className="min-w-0 flex-1 truncate font-semibold text-slate-900"
          title={senseKo}
        >
          {senseKo}
        </span>
        <span className="shrink-0 text-[10.5px] tabular-nums text-slate-400">
          {pct}%
        </span>
      </div>
      {/* 점유율 바 — 숫자만으론 지배 강도가 안 읽혀서 얇은 바를 같이 둔다 */}
      <div className="mt-1 h-1 overflow-hidden rounded bg-slate-100">
        <div className={`h-full rounded ${fill}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
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

  const axisA = shiftAxis === "era" ? "초기 2003–2015" : "고1";
  const axisB = shiftAxis === "era" ? "후기 2016–2027" : "고3";

  return (
    <section className="flex min-w-0 flex-1 flex-col">
      {/* ── 툴바 ── */}
      <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-slate-200 px-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-[11.5px] text-slate-500">
            {mode === "senses" ? (
              <>단어 <span className="font-semibold tabular-nums text-slate-900">{fmt(total)}</span></>
            ) : (
              <>발굴 <span className="font-semibold tabular-nums text-slate-900">{shiftRows.length}</span>단어</>
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
              기출 예문 표본 · 양축 4개 이상 · 지배율 20% 이상
            </span>
          ) : null}
        </div>
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

      {/* ── 스크롤 영역 ── */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
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
                  <SortTh k="per10k" label="빈도" sort={sort} onSort={onSort} className="w-[112px]" />
                  {/* 함정을 빈도 바로 옆에 — "얼마나 자주 × 얼마나 위험"이 덱 편성의
                      핵심 조합이라 첫 화면 폭 안에 같이 들어와야 한다(1680px 실측). */}
                  <SortTh k="trapRate" label="함정" sort={sort} onSort={onSort} className="w-12" />
                  <SortTh k="sn" label="수능" sort={sort} onSort={onSort} className="w-[52px]" />
                  <SortTh k="mp" label="모평" sort={sort} onSort={onSort} className="w-[52px]" />
                  <SortTh k="hp" label="학평" sort={sort} onSort={onSort} className="w-[52px]" />
                  <th className={`${TH} w-10`}>학년</th>
                  <th className={`${TH} w-12`}>티어</th>
                  <SortTh k="difficulty" label="난이도" sort={sort} onSort={onSort} className="w-14" />
                  <th className={`${TH} w-20`}>추세</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const inBasket = basketSenseIds.has(r.senseId);
                  const selected = selectedLemmaId === r.lemmaId;
                  return (
                    <tr
                      key={r.senseId}
                      onClick={() => onSelect(r.lemmaId)}
                      className={`h-9 cursor-pointer border-b border-slate-100 ${
                        selected ? "bg-blue-50/70" : "hover:bg-slate-50"
                      }`}
                    >
                      <td className="pl-2 pr-1">
                        <BasketButton
                          active={inBasket}
                          title={inBasket ? "단어장에서 뺍니다" : "단어장에 담습니다"}
                          onToggle={() =>
                            onToggleBasket({
                              senseId: r.senseId,
                              lemmaId: r.lemmaId,
                              lemma: r.lemma,
                              pos: r.pos,
                              senseKo: r.senseKo,
                              tier: r.tier,
                              difficulty: r.difficulty,
                            })
                          }
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
                          필터를 넓혀 보세요
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
          <table className="w-full min-w-[860px] border-collapse text-[12.5px]">
            <thead className="sticky top-0 z-10 bg-white shadow-[inset_0_-1px_0_theme(colors.slate.200)]">
              <tr>
                <th className={`${TH} w-9`}>
                  <span className="sr-only">담기</span>
                </th>
                <th className={TH}>단어</th>
                <th className={`${TH} w-16`}>품사</th>
                <th className={TH}>{axisA} 지배 뜻</th>
                <th className={`${TH} w-8`} aria-hidden="true" />
                <th className={TH}>{axisB} 지배 뜻</th>
                <th className={`${TH} w-24`}>표본</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? // 발굴 질의는 전량 집계라 체감이 느리다 — 스켈레톤으로 자리를 지킨다
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="border-b border-slate-100">
                      <td className="py-2.5 pl-2">
                        <div className="size-6 animate-pulse rounded-full bg-slate-100" />
                      </td>
                      {(["w-16", "w-10", "w-32", "", "w-32", "ml-auto w-10"] as const).map((w, j) => (
                        <td key={j} className="px-2">
                          {w ? <div className={`h-3 animate-pulse rounded bg-slate-100 ${w}`} /> : null}
                        </td>
                      ))}
                    </tr>
                  ))
                : shiftRows.map((r) => {
                    const inBasket = basketSenseIds.has(r.bSenseId);
                    const selected = selectedLemmaId === r.lemmaId;
                    return (
                      <tr
                        key={r.lemmaId}
                        onClick={() => onSelect(r.lemmaId)}
                        className={`cursor-pointer border-b border-slate-100 ${
                          selected ? "bg-blue-50/70" : "hover:bg-slate-50"
                        }`}
                      >
                        <td className="py-2 pl-2 pr-1">
                          {/* 담는 대상은 B축(현재 지배 뜻) — 지금 시험에 나오는 뜻이 학습 가치다 */}
                          <BasketButton
                            active={inBasket}
                            title={
                              inBasket
                                ? "단어장에서 뺍니다"
                                : "현재 지배 뜻을 단어장에 담습니다"
                            }
                            onToggle={() =>
                              onToggleBasket({
                                senseId: r.bSenseId,
                                lemmaId: r.lemmaId,
                                lemma: r.lemma,
                                pos: r.pos,
                                senseKo: r.bSenseKo,
                                tier: r.bTier,
                                difficulty: r.bDifficulty,
                              })
                            }
                          />
                        </td>
                        <td className="whitespace-nowrap px-2 font-semibold text-slate-900">
                          {r.lemma}
                        </td>
                        <td className="px-2">
                          <PosChip pos={r.pos} />
                        </td>
                        <td className="max-w-[220px] px-2 py-2">
                          <ShareCell senseKo={r.aSenseKo} share={r.aShare} fill="bg-slate-400" />
                        </td>
                        <td className="px-1 text-center">
                          <MoveRight className="mx-auto size-3.5 text-slate-300" />
                        </td>
                        <td className="max-w-[220px] px-2 py-2">
                          <ShareCell senseKo={r.bSenseKo} share={r.bShare} fill="bg-blue-500" />
                        </td>
                        <td
                          className="px-2 text-right tabular-nums text-slate-500"
                          title={`A축 예문 ${r.aTotal} · B축 예문 ${r.bTotal}`}
                        >
                          {r.aTotal}·{r.bTotal}
                        </td>
                      </tr>
                    );
                  })}
              {!loading && shiftRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-20">
                    <div className="sticky left-0 max-w-[100vw] text-center">
                      <p className="text-[13px] font-medium text-slate-600">
                        발굴된 의미 이동이 없습니다
                      </p>
                    </div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
