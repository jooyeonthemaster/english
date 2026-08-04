"use client";

// ============================================================================
// 단어장 생성 스튜디오 — 셸 (상태 소유·질의 오케스트레이션·워크스테이션 레이아웃)
//
// 화면 전체를 쓰는 3열 고정 워크스테이션(페이지 스크롤 없음 — 열별 독립 스크롤):
//   [렌즈·필터 레일 216px] [탐색 테이블 flex-1] [도시에 430px]
// 렌즈 클릭 = 필터·정렬 상태 통째 교체. 레일 수정 = 현 상태 위 부분 갱신.
// 의미 이동 렌즈는 테이블이 발굴 모드로 전환된다(필터 레일 비활성).
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookMarked, Search, ShoppingBasket, SlidersHorizontal } from "lucide-react";
import {
  getWordbookLemmaDossier,
  listWordbookSenses,
  listWordbookShift,
} from "@/actions/vocab-drill-admin/wordbook";
import { FilterRail } from "./filter-rail";
import { SenseTable } from "./sense-table";
import { LemmaDossier } from "./lemma-dossier";
import { BasketDock } from "./basket-dock";
import { DeploymentsPanel } from "./deployments-panel";
import { fmt } from "./wordbook-ui";
import {
  BASKET_MAX,
  DEFAULT_LENS,
  WORDBOOK_LENSES,
  type WordbookBasketItem,
  type WordbookFilter,
  type WordbookLemmaDossier as Dossier,
  type WordbookLens,
  type WordbookOverview,
  type WordbookSenseRow,
  type WordbookShiftRow,
  type WordbookSort,
} from "./wordbook-types";

interface WordbookClientProps {
  overview: WordbookOverview;
  initialRows: WordbookSenseRow[];
  initialTotal: number;
}

export function WordbookClient({
  overview,
  initialRows,
  initialTotal,
}: WordbookClientProps) {
  // ── 탐색 상태 ──────────────────────────────────────────────────────────────
  const [lens, setLens] = useState<WordbookLens>(DEFAULT_LENS.key);
  const [filter, setFilter] = useState<WordbookFilter>(DEFAULT_LENS.filter);
  const [sort, setSort] = useState<WordbookSort>(DEFAULT_LENS.sort);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<WordbookSenseRow[]>(initialRows);
  const [total, setTotal] = useState(initialTotal);
  const [loading, setLoading] = useState(false);
  const [shiftRows, setShiftRows] = useState<WordbookShiftRow[]>([]);
  const [shiftLoading, setShiftLoading] = useState(false);

  // ── 도시에·바스켓 상태 ─────────────────────────────────────────────────────
  const [selectedLemmaId, setSelectedLemmaId] = useState<string | null>(null);
  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [dossierLoading, setDossierLoading] = useState(false);
  const [dossierMobileOpen, setDossierMobileOpen] = useState(false);
  const [basket, setBasket] = useState<WordbookBasketItem[]>([]);
  const [basketOpen, setBasketOpen] = useState(false);
  const [railMobileOpen, setRailMobileOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  /** 상단 뷰 — 단어 찾기(탐색 워크스테이션) / 보낸 단어장(단어장·배포 관리) */
  const [view, setView] = useState<"explore" | "manage">("explore");
  /** 「보낸 단어장」에서 [학생에게 보내기] → 바스켓을 전송 단계로 직행시키는 프리셋 */
  const [presetDeck, setPresetDeck] = useState<{
    id: string;
    title: string;
    senseCount: number;
  } | null>(null);

  const lensDef = useMemo(
    () => WORDBOOK_LENSES.find((l) => l.key === lens) ?? DEFAULT_LENS,
    [lens],
  );
  const shiftAxis = lensDef.shiftAxis ?? null;

  // ── 경합·스테일 가드(적대검수 2026-08-04) ──────────────────────────────────
  // reqSeq: senses 질의 / shiftSeq: 의미 이동 / dossierSeq: 도시에 — 각각 독립
  // 카운터다(공유하면 병행 질의가 서로의 가드를 무효화한다). filter/sort/q 는
  // ref 로 미러링해 디바운스 타이머가 스테일 클로저를 읽지 않게 한다.
  const reqSeq = useRef(0);
  const shiftSeq = useRef(0);
  const dossierSeq = useRef(0);
  const filterRef = useRef(filter);
  const sortRef = useRef(sort);
  const qRef = useRef(q);
  const qTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFiredQ = useRef(""); // 값 변화 기준 스킵 — StrictMode 이중 실행 안전
  /** 비-append 질의마다 증가 — 테이블이 스크롤을 원점으로 되돌리는 신호 */
  const [queryEpoch, setQueryEpoch] = useState(0);

  const fetchPage = useCallback(
    async (
      f: WordbookFilter,
      s: WordbookSort,
      offset: number,
      append: boolean,
    ) => {
      const seq = ++reqSeq.current;
      setLoading(true);
      if (!append) setQueryEpoch((e) => e + 1);
      try {
        const page = await listWordbookSenses({
          filter: f,
          sort: s,
          offset,
        });
        if (seq !== reqSeq.current) return;
        setRows((prev) => (append ? [...prev, ...page.rows] : page.rows));
        setTotal(page.total);
      } catch {
        if (seq === reqSeq.current) setNotice("목록을 불러오지 못했습니다.");
      } finally {
        if (seq === reqSeq.current) setLoading(false);
      }
    },
    [],
  );

  /** 대기 중 q 디바운스 취소 — 이후의 명시 질의(runQuery)가 최신 q 를 포함한다. */
  const cancelQTimer = useCallback(() => {
    if (qTimer.current) {
      clearTimeout(qTimer.current);
      qTimer.current = null;
    }
    lastFiredQ.current = qRef.current;
  }, []);

  const runQuery = useCallback(
    (f: WordbookFilter, s: WordbookSort) => {
      void fetchPage({ ...f, q: qRef.current || undefined }, s, 0, false);
    },
    [fetchPage],
  );

  // 검색어 디바운스 — 타이머 콜백은 ref 만 읽는다(칩 클릭이 250ms 안에 끼어도
  // 스테일 filter 로 최신 결과를 덮지 않는다). 같은 값 재실행은 스킵.
  useEffect(() => {
    qRef.current = q;
    if (lastFiredQ.current === q || shiftAxis) return;
    if (qTimer.current) clearTimeout(qTimer.current);
    qTimer.current = setTimeout(() => {
      lastFiredQ.current = qRef.current;
      void fetchPage(
        { ...filterRef.current, q: qRef.current || undefined },
        sortRef.current,
        0,
        false,
      );
    }, 250);
    return () => {
      if (qTimer.current) clearTimeout(qTimer.current);
    };
  }, [q, shiftAxis, fetchPage]);

  const handleLens = useCallback(
    (key: WordbookLens) => {
      cancelQTimer();
      const def = WORDBOOK_LENSES.find((l) => l.key === key) ?? DEFAULT_LENS;
      setLens(key);
      setFilter(def.filter);
      setSort(def.sort);
      filterRef.current = def.filter;
      sortRef.current = def.sort;
      setRailMobileOpen(false);
      if (def.shiftAxis) {
        const seq = ++shiftSeq.current;
        setShiftLoading(true);
        // senses 질의도 병행 — total 을 새 filter({})와 동기화해 바스켓 카드 B 가
        // 직전 렌즈 총계를 "현재 조건"으로 오표시하지 않게 한다.
        runQuery(def.filter, def.sort);
        listWordbookShift(def.shiftAxis)
          .then((rows) => {
            if (seq === shiftSeq.current) setShiftRows(rows);
          })
          .catch(() => {
            if (seq === shiftSeq.current)
              setNotice("의미 이동 데이터를 불러오지 못했습니다.");
          })
          .finally(() => {
            if (seq === shiftSeq.current) setShiftLoading(false);
          });
      } else {
        runQuery(def.filter, def.sort);
      }
    },
    [cancelQTimer, runQuery],
  );

  const handleFilter = useCallback(
    (patch: Partial<WordbookFilter>) => {
      cancelQTimer();
      const next = { ...filterRef.current, ...patch };
      setFilter(next);
      filterRef.current = next;
      runQuery(next, sortRef.current);
    },
    [cancelQTimer, runQuery],
  );

  const handleSort = useCallback(
    (s: WordbookSort) => {
      cancelQTimer();
      setSort(s);
      sortRef.current = s;
      runQuery(filterRef.current, s);
    },
    [cancelQTimer, runQuery],
  );

  const handleLoadMore = useCallback(() => {
    void fetchPage(
      { ...filterRef.current, q: qRef.current || undefined },
      sortRef.current,
      rows.length,
      true,
    );
  }, [fetchPage, rows.length]);

  // ── 도시에 ─────────────────────────────────────────────────────────────────
  const openDossier = useCallback((lemmaId: string) => {
    const seq = ++dossierSeq.current;
    setSelectedLemmaId(lemmaId);
    // 모바일 오버레이 플래그는 lg 미만에서만 — 데스크톱 클릭이 플래그를 세워두면
    // 창을 줄이는 순간 요청한 적 없는 전면 오버레이가 튀어나온다.
    if (
      typeof window !== "undefined" &&
      !window.matchMedia("(min-width: 1024px)").matches
    ) {
      setDossierMobileOpen(true);
    }
    setDossierLoading(true);
    getWordbookLemmaDossier(lemmaId)
      .then((d) => {
        if (seq === dossierSeq.current) setDossier(d);
      })
      .catch(() => {
        if (seq === dossierSeq.current)
          setNotice("단어 상세를 불러오지 못했습니다.");
      })
      .finally(() => {
        if (seq === dossierSeq.current) setDossierLoading(false);
      });
  }, []);

  // ── 바스켓 ─────────────────────────────────────────────────────────────────
  const basketSenseIds = useMemo(
    () => new Set(basket.map((b) => b.senseId)),
    [basket],
  );
  const toggleBasket = useCallback((item: WordbookBasketItem) => {
    setBasket((prev) => {
      if (prev.some((b) => b.senseId === item.senseId)) {
        return prev.filter((b) => b.senseId !== item.senseId);
      }
      if (prev.length >= BASKET_MAX) {
        setNotice(`한 단어장에 담을 수 있는 최대치는 ${BASKET_MAX}개입니다.`);
        return prev;
      }
      return [...prev, item];
    });
  }, []);

  /** 드래그 쓸어담기·범위 담기 — 멱등 적용(on=담기 / off=빼기). 토글이 아니다. */
  const applyBasket = useCallback(
    (items: WordbookBasketItem[], on: boolean) => {
      setBasket((prev) => {
        if (!on) {
          const drop = new Set(items.map((i) => i.senseId));
          return prev.filter((b) => !drop.has(b.senseId));
        }
        const have = new Set(prev.map((b) => b.senseId));
        const add = items.filter((i) => !have.has(i.senseId));
        if (!add.length) return prev;
        const room = BASKET_MAX - prev.length;
        if (room <= 0) {
          setNotice(`한 단어장에 담을 수 있는 최대치는 ${BASKET_MAX}개입니다.`);
          return prev;
        }
        if (add.length > room) {
          setNotice(
            `${BASKET_MAX}개까지만 담을 수 있어 ${room}개만 담았습니다.`,
          );
        }
        return [...prev, ...add.slice(0, room)];
      });
    },
    [],
  );

  /** 「보낸 단어장」 → 저장된 단어장을 곧장 전송 단계로 */
  const handleSendDeck = useCallback(
    (deck: { id: string; title: string; senseCount: number }) => {
      setPresetDeck(deck);
      setBasketOpen(true);
    },
    [],
  );

  // 알림 자동 소거
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 3200);
    return () => clearTimeout(t);
  }, [notice]);

  const currentFilter = useMemo(
    () => ({ ...filter, q: q || undefined }),
    [filter, q],
  );

  return (
    // phone-landscape(md+ 폭·낮은 높이)에선 셸 헤더 56px 가 부활한다 — 재차감
    <div className="-m-4 flex h-[calc(100dvh-56px)] min-w-0 flex-col overflow-hidden bg-white text-slate-800 md:-m-6 md:h-dvh phone-landscape:h-[calc(100dvh-56px)]!">
      {/* ── 상단바 ── */}
      {/* pr-12: 우상단 매뉴얼 퀵액세스 플로팅 위젯(전역)과 담은 단어 버튼 겹침 방지 */}
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-slate-200 pl-3 pr-16">
        <div className="flex min-w-0 items-center gap-2">
          <BookMarked className="size-[18px] shrink-0 text-blue-600" />
          <h1 className="shrink-0 text-[14px] font-bold tracking-tight">
            단어장 생성
          </h1>
          {/* 뷰 전환 — 단어 찾기 / 만든 단어장·보낸 기록 */}
          <div className="ml-1 flex shrink-0 overflow-hidden rounded-md border border-slate-200">
            {(
              [
                ["explore", "단어 찾기"],
                ["manage", "보낸 단어장"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setView(key)}
                className={`h-7 px-2.5 text-[11.5px] font-semibold transition-colors ${
                  view === key
                    ? "bg-slate-900 text-white"
                    : "bg-white text-slate-500 hover:bg-slate-50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="hidden min-w-0 items-center gap-2 text-[11px] tabular-nums text-slate-400 xl:flex">
          <span className="h-3 w-px bg-slate-200" />
          <span title="기출 지문에서 추린 단어 수">단어 {fmt(overview.lemmaCount)}</span>
          <span>·</span>
          <span>뜻 {fmt(overview.senseCount)}</span>
          <span>·</span>
          <span>기출 예문 {fmt(overview.exampleCount)}</span>
          <span>·</span>
          <span>지문 {fmt(overview.docs)}</span>
          <span>·</span>
          <span>
            {overview.yearMin}–{overview.yearMax}
          </span>
        </div>
        {/* min-w-0 + 검색만 수축 — 390px 폭에서 우측 그룹이 타이틀을 덮거나
            담은 단어 버튼이 화면 밖으로 잘리지 않게 한다 */}
        <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-1.5 sm:flex-none">
          {view === "explore" ? (
            <label className="relative min-w-0 flex-1 sm:flex-none">
              <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="단어 검색 (영어로 입력)"
                disabled={!!shiftAxis}
                className="h-8 w-full min-w-0 rounded-md border border-slate-200 bg-slate-50 pl-7 pr-2 text-[12px] outline-none transition-colors focus:border-blue-400 focus:bg-white disabled:opacity-40 sm:w-56 md:w-64"
              />
            </label>
          ) : null}
          {view === "explore" ? (
            <button
              type="button"
              onClick={() => setRailMobileOpen(true)}
              className="flex h-8 shrink-0 items-center gap-1 rounded-md border border-slate-200 px-2 text-[12px] font-medium text-slate-600 hover:bg-slate-50 md:hidden"
            >
              <SlidersHorizontal className="size-3.5" />
              조건
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setBasketOpen(true)}
            className={`flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-[12px] font-semibold transition-colors ${
              basket.length
                ? "bg-blue-600 text-white hover:bg-blue-700"
                : "border border-slate-200 text-slate-500 hover:bg-slate-50"
            }`}
          >
            <ShoppingBasket className="size-3.5" />
            담은 단어
            <span className="tabular-nums">{basket.length}</span>
          </button>
        </div>
      </header>

      {/* ── 본문 — 단어 찾기(3열 워크스테이션) / 보낸 단어장(관리 패널) ── */}
      {view === "manage" ? (
        <DeploymentsPanel onSendDeck={handleSendDeck} />
      ) : (
        <div className="flex min-h-0 min-w-0 flex-1">
          <FilterRail
            lens={lens}
            onLens={handleLens}
            filter={filter}
            onFilter={handleFilter}
            disabled={!!shiftAxis}
            mobileOpen={railMobileOpen}
            onMobileClose={() => setRailMobileOpen(false)}
          />
          <SenseTable
            mode={shiftAxis ? "shift" : "senses"}
            rows={rows}
            shiftRows={shiftRows}
            shiftAxis={shiftAxis ?? "era"}
            total={total}
            sort={sort}
            onSort={handleSort}
            loading={shiftAxis ? shiftLoading : loading}
            selectedLemmaId={selectedLemmaId}
            onSelect={openDossier}
            basketSenseIds={basketSenseIds}
            onToggleBasket={toggleBasket}
            onApplyBasket={applyBasket}
            onLoadMore={handleLoadMore}
            hasMore={!shiftAxis && rows.length < total}
            queryEpoch={queryEpoch}
          />
          <LemmaDossier
            dossier={dossier}
            loading={dossierLoading}
            overview={overview}
            basketSenseIds={basketSenseIds}
            onToggleBasket={toggleBasket}
            onNavigateLemma={openDossier}
            mobileOpen={dossierMobileOpen}
            onClose={() => setDossierMobileOpen(false)}
          />
        </div>
      )}

      <BasketDock
        items={basket}
        onRemove={(senseId: string) =>
          setBasket((prev) => prev.filter((b) => b.senseId !== senseId))
        }
        onClear={() => setBasket([])}
        open={basketOpen}
        onOpenChange={setBasketOpen}
        currentFilter={currentFilter}
        currentTotal={total}
        presetDeck={presetDeck}
        onPresetConsumed={() => setPresetDeck(null)}
      />

      {notice ? (
        <div className="pointer-events-none fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-slate-900 px-3.5 py-2 text-[12px] font-medium text-white shadow-lg">
          {notice}
        </div>
      ) : null}
    </div>
  );
}
