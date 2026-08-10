"use client";

// 탐색 테이블 컬럼 헤더 — 정렬 토글 + 깔때기 필터 메뉴.
//
// 필터는 왼쪽 레일과 **같은 WordbookFilter 를 패치**한다(상태 단일 소스 —
// 헤더에서 고르면 레일 칩도 같이 켜진다). 팝오버는 스크롤 컨테이너에 잘리지
// 않게 뷰포트 기준(fixed) 포털로 그리고, 바깥 클릭·Esc·스크롤에 닫는다.

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowDown, ArrowUp, ListFilter } from "lucide-react";
import { VOCAB_POS_LABELS, VOCAB_TIER_LABELS } from "@/lib/vocab-drill/display";
import { TH } from "./table-bits";
import type {
  WordbookBoard,
  WordbookFilter,
  WordbookSort,
  WordbookSortDir,
} from "./wordbook-types";

// ── 필터 명세 ────────────────────────────────────────────────────────────────

export interface ColumnFilterSpec {
  title: string;
  /** multi = 체크 여러 개(빈 배열 → 해제) / single = 라디오(전체 항목 포함) */
  mode: "multi" | "single";
  options: { value: string; label: string }[];
  read: (f: WordbookFilter) => string[];
  write: (values: string[]) => Partial<WordbookFilter>;
}

const TREND_VALUES = [
  "급증", "증가", "안정", "감소", "급감", "신규 등장", "중간기만 등장", "미등장",
];

/** 시행처 단일 필드(board)를 세 컬럼이 나눠 쓴다 — 하나를 고르면 나머지는 풀린다. */
function boardSpec(board: WordbookBoard): ColumnFilterSpec {
  return {
    title: board,
    mode: "single",
    options: [{ value: board, label: `${board}에 나온 단어만` }],
    read: (f) => (f.board === board ? [board] : []),
    write: (v) => ({ board: v.length ? board : undefined }),
  };
}

/** 컬럼별 필터 정본 — 값·의미는 레일과 동일한 WordbookFilter 키에 맵된다. */
export const COLUMN_FILTERS = {
  pos: {
    title: "품사",
    mode: "multi",
    options: Object.entries(VOCAB_POS_LABELS).map(([value, label]) => ({ value, label })),
    read: (f) => f.posList ?? [],
    write: (v) => ({ posList: v.length ? v : undefined }),
  },
  tier: {
    title: "수준",
    mode: "multi",
    options: Object.entries(VOCAB_TIER_LABELS).map(([value, label]) => ({ value, label })),
    read: (f) => f.tiers ?? [],
    write: (v) => ({ tiers: v.length ? v : undefined }),
  },
  grade: {
    title: "주로 나온 학년",
    mode: "multi",
    options: ["고1", "고2", "고3"].map((g) => ({ value: g, label: g })),
    read: (f) => f.grades ?? [],
    write: (v) => ({ grades: v.length ? v : undefined }),
  },
  difficulty: {
    title: "난이도",
    mode: "multi",
    options: [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: `난이도 ${n}` })),
    read: (f) => (f.difficulties ?? []).map(String),
    write: (v) => ({ difficulties: v.length ? v.map(Number) : undefined }),
  },
  trend: {
    title: "추세",
    mode: "multi",
    options: TREND_VALUES.map((t) => ({ value: t, label: t })),
    read: (f) => f.trendLabels ?? [],
    write: (v) => ({ trendLabels: v.length ? v : undefined }),
  },
  trap: {
    title: "헷갈림 정도",
    mode: "single",
    options: [
      { value: "0.01", label: "함정 있는 단어만" },
      { value: "0.25", label: "25% 이상" },
      { value: "0.5", label: "50% 이상" },
    ],
    read: (f) => (f.minTrapRate !== undefined ? [String(f.minTrapRate)] : []),
    write: (v) => ({ minTrapRate: v.length ? Number(v[0]) : undefined }),
  },
  sn: boardSpec("수능"),
  mp: boardSpec("모평"),
  hp: boardSpec("학평"),
} satisfies Record<string, ColumnFilterSpec>;

// ── 헤더 셀 ──────────────────────────────────────────────────────────────────

interface HeaderThProps {
  label: string;
  className?: string;
  /** 짧은 헤더를 풀어 쓰는 툴팁 */
  hint?: string;
  /** 지정 시 라벨 클릭 = 정렬(재클릭 방향 반전) */
  sortKey?: WordbookSort;
  sort: WordbookSort;
  sortDir: WordbookSortDir;
  onSort: (s: WordbookSort) => void;
  /** 지정 시 깔때기 필터 메뉴 노출 */
  filterSpec?: ColumnFilterSpec;
  filter: WordbookFilter;
  onFilter: (patch: Partial<WordbookFilter>) => void;
}

export function HeaderTh({
  label,
  className = "",
  hint,
  sortKey,
  sort,
  sortDir,
  onSort,
  filterSpec,
  filter,
  onFilter,
}: HeaderThProps) {
  const sortActive = sortKey !== undefined && sort === sortKey;
  const selected = filterSpec ? filterSpec.read(filter) : [];
  const filterActive = selected.length > 0;

  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const openMenu = useCallback(() => {
    const r = triggerRef.current?.getBoundingClientRect();
    if (!r) return;
    // 오른쪽 끝 컬럼은 화면 밖으로 밀리지 않게 좌측으로 보정한다.
    setPos({
      top: r.bottom + 4,
      left: Math.max(8, Math.min(r.left - 8, window.innerWidth - 208)),
    });
    setOpen(true);
  }, []);

  // 바깥 클릭·Esc·스크롤에 닫기 — 팝오버는 fixed 라 스크롤을 따라가지 못한다.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onScroll = () => setOpen(false);
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  const toggleValue = (v: string) => {
    if (!filterSpec) return;
    if (filterSpec.mode === "single") {
      const next = selected[0] === v ? [] : [v];
      onFilter(filterSpec.write(next));
      setOpen(false);
      return;
    }
    const next = selected.includes(v)
      ? selected.filter((x) => x !== v)
      : [...selected, v];
    onFilter(filterSpec.write(next));
  };

  return (
    <th
      className={`${TH} ${className}`}
      title={hint}
      aria-sort={
        sortActive ? (sortDir === "asc" ? "ascending" : "descending") : undefined
      }
    >
      <span className="inline-flex items-center gap-0.5">
        {sortKey !== undefined ? (
          <button
            type="button"
            onClick={() => onSort(sortKey)}
            title={sortActive ? "다시 누르면 순서가 뒤집힙니다" : "이 항목으로 줄 세웁니다"}
            className={`inline-flex items-center gap-0.5 ${
              sortActive ? "text-slate-900" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {label}
            {sortActive ? (
              sortDir === "asc" ? (
                <ArrowUp className="size-3" />
              ) : (
                <ArrowDown className="size-3" />
              )
            ) : null}
          </button>
        ) : (
          <span>{label}</span>
        )}
        {filterSpec ? (
          <button
            ref={triggerRef}
            type="button"
            aria-label={`${filterSpec.title} 조건`}
            title={`${filterSpec.title}으로 거릅니다`}
            onClick={() => (open ? setOpen(false) : openMenu())}
            className={`rounded p-0.5 ${
              filterActive
                ? "text-blue-600"
                : "text-slate-300 hover:text-slate-500"
            }`}
          >
            <ListFilter className="size-3" />
          </button>
        ) : null}
      </span>

      {open && pos && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={panelRef}
              role="menu"
              className="fixed z-[70] w-[200px] rounded-lg border border-slate-200 bg-white py-1 shadow-xl"
              style={{ top: pos.top, left: pos.left }}
            >
              <div className="flex items-center justify-between px-2.5 py-1">
                <span className="text-[10.5px] font-bold text-slate-400">
                  {filterSpec!.title}
                </span>
                {filterActive ? (
                  <button
                    type="button"
                    onClick={() => {
                      onFilter(filterSpec!.write([]));
                      setOpen(false);
                    }}
                    className="text-[10.5px] font-medium text-slate-400 hover:text-rose-600"
                  >
                    지우기
                  </button>
                ) : null}
              </div>
              {filterSpec!.mode === "single" ? (
                <button
                  type="button"
                  onClick={() => {
                    onFilter(filterSpec!.write([]));
                    setOpen(false);
                  }}
                  className={`flex h-7 w-full items-center px-2.5 text-left text-[11.5px] ${
                    selected.length === 0
                      ? "font-semibold text-blue-600"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  전체 보기
                </button>
              ) : null}
              {filterSpec!.options.map((o) => {
                const on = selected.includes(o.value);
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => toggleValue(o.value)}
                    className={`flex h-7 w-full items-center gap-1.5 px-2.5 text-left text-[11.5px] ${
                      on ? "font-semibold text-blue-600" : "text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {filterSpec!.mode === "multi" ? (
                      <span
                        className={`flex size-3 items-center justify-center rounded-sm border ${
                          on ? "border-blue-600 bg-blue-600" : "border-slate-300"
                        }`}
                      >
                        {on ? <span className="size-1.5 rounded-[1px] bg-white" /> : null}
                      </span>
                    ) : null}
                    <span className="truncate">{o.label}</span>
                  </button>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </th>
  );
}
