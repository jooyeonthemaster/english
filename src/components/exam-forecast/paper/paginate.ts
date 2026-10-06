// 단·쪽 배치(순수 함수) — 기출 조판 규칙을 그대로 옮긴다.
//
// 기출 관찰(형식 렌즈 pageMap·columnLoadRule):
//   · 단마다 문항 블록 대개 2개. 위 블록은 단 꼭대기, 아래 블록은 단 바닥, 남는 공간은 블록 사이.
//   · 지문은 단 경계에서 쪼개지 않는다. 문항이 통째로 안 들어가면 「발문+지문」은 이 단 바닥에,
//     「선지」만 다음 단 꼭대기로 넘긴다(기출 7·19·26번).
//   · 논술형은 문항당 한 단, 다음 빈 단부터. 마지막 쪽 우단 바닥에 「확인 사항」 상자.
//   · 「발문+지문 / 선지」 쪼개기는 같은 쪽 안(좌단→우단) 또는 펼침면(짝수 쪽 우단 → 홀수 쪽 좌단, 기출 7번 2→3쪽)만.
//     홀수 쪽 우단에서 넘기면 같은 장의 뒷면이라 종이를 뒤집어 대조해야 한다 — 기출에 한 번도 없다.
//
// 좌표(mm): 테두리 y 12.9~287.0. 단 본문은 첫 줄 중심이 윗변 아래 6.9mm → 꼭대기 17.3, 바닥 283.8.

export const COL_TOP = 17.3;
export const COL_BOTTOM = 283.8;
/** 1쪽: 머리 가로줄(43.9) 아래 — 좌단은 유의사항·문항 수 상자부터, 우단은 본문부터 */
export const COL_TOP_FIRST = 45.7;
export const MIN_GAP = 7.6;
/** 꽉 찬 단은 줄 간격을 줄여 한 문항을 더 넣는다 — 기출 실측 88~98%(21번 88%, 9번 94%) */
export const MAX_SQUEEZE = 1.12;
/** 우단 끝에서 다음 쪽으로 선지만 넘기는 것은 통째로 넘기면 우단이 이만큼 넘게 빌 때만 */
export const SPLIT_FREE = 0.35;

export interface MeasuredItem {
  key: string;
  /** 발문·(묶음 지시문)·상자·지문 높이(mm) */
  head: number;
  /** 선지·답란 높이(mm, 위 여백 포함). 없으면 0 */
  tail: number;
  essay: boolean;
}

export type PartKind = "all" | "head" | "tail" | "check";

export interface ColumnPlan {
  top: number;
  height: number;
  blocks: { key: string; part: PartKind }[];
  /** between = 첫 블록 꼭대기·끝 블록 바닥(남는 공간은 사이) · start = 위에서부터 · end = 바닥(확인 사항만 있는 단) */
  justify: "between" | "start" | "end";
  used: number;
  /** 1쪽 좌단: 유의사항·문항 수 상자를 첫 블록 위에 붙인다 */
  lead: boolean;
  /** 줄 간격 배율(1 = 5.07mm). 넘친 만큼 줄인다 */
  scale: number;
}

export interface PagePlan {
  no: number;
  left: ColumnPlan;
  right: ColumnPlan;
}

export interface PaginateOptions {
  /** 1쪽 좌단 맨 위 고정 블록(유의사항+문항 수 상자) 높이. 머리가 없으면 null */
  leadHeight: number | null;
  /** exam = 논술형은 새 쪽·단마다 하나 / inline = 선택형처럼 이어서 */
  essayMode: "exam" | "inline";
  /** 확인 사항 상자 높이. 0 이면 넣지 않는다 */
  checkHeight: number;
  /** 줄 간격 압축 한도(기본 MAX_SQUEEZE) */
  maxSqueeze?: number;
  /** 짝수 쪽 우단 → 다음 쪽(펼침면) 쪼개기 조건(기본 SPLIT_FREE) */
  splitFree?: number;
  /** 홀수 쪽 우단 → 다음 쪽(같은 장 뒷면) 쪼개기 조건. 기본은 쪼개지 않음 */
  flipSplitFree?: number;
}

/** 목표 쪽수를 넘을 때만 단계적으로 푼다 — 압축 상한 1.16 은 실측 보정 하한 86%(1/0.86≈1.163)를 넘지 않게.
 *  뒷면 쪼개기는 압축으로도 안 될 때의 마지막 수단. 이미 맞는 시험지는 그대로 */
const FIT_LEVELS: { maxSqueeze: number; splitFree: number; flipSplitFree?: number }[] = [
  { maxSqueeze: 1.15, splitFree: 0.25 },
  { maxSqueeze: 1.16, splitFree: 0.15 },
  { maxSqueeze: 1.16, splitFree: 0.15, flipSplitFree: SPLIT_FREE },
  { maxSqueeze: 1.16, splitFree: 0.15, flipSplitFree: 0.15 },
];

export function paginateFit(items: MeasuredItem[], opts: PaginateOptions, targetPages?: number): PagePlan[] {
  const base = paginate(items, opts);
  if (!targetPages || base.length <= targetPages) return base;
  for (const lv of FIT_LEVELS) {
    const p = paginate(items, { ...opts, ...lv });
    if (p.length <= targetPages) return p;
  }
  return base;
}

export function paginate(items: MeasuredItem[], opts: PaginateOptions): PagePlan[] {
  const cols: ColumnPlan[] = [];
  const hasHead = opts.leadHeight != null;

  const newCol = (): ColumnPlan => {
    const idx = cols.length;
    const top = hasHead && idx < 2 ? COL_TOP_FIRST : COL_TOP;
    const lead = hasHead && idx === 0 && Boolean(opts.leadHeight);
    const col: ColumnPlan = { top, height: COL_BOTTOM - top, blocks: [], justify: "start", used: lead ? (opts.leadHeight ?? 0) : 0, lead, scale: 1 };
    cols.push(col);
    return col;
  };
  const add = (col: ColumnPlan, key: string, part: PartKind, h: number) => {
    const gap = col.blocks.length ? MIN_GAP : 0;
    col.blocks.push({ key, part });
    col.used += gap + h;
  };
  const need = (col: ColumnPlan, h: number) => col.used + (col.blocks.length ? MIN_GAP : 0) + h;
  const room = (col: ColumnPlan, h: number) => need(col, h) <= col.height + 0.5;
  /** 줄 간격을 줄이면 들어가는가 */
  const maxSqueeze = opts.maxSqueeze ?? MAX_SQUEEZE;
  const splitFree = opts.splitFree ?? SPLIT_FREE;
  const flipSplitFree = opts.flipSplitFree ?? Infinity;
  const squeeze = (col: ColumnPlan, h: number) => need(col, h) <= col.height * maxSqueeze;

  let cur = newCol();
  const flowItems = opts.essayMode === "exam" ? items.filter((i) => !i.essay) : items;
  const essays = opts.essayMode === "exam" ? items.filter((i) => i.essay) : [];

  for (const it of flowItems) {
    const total = it.head + it.tail;
    if (room(cur, total) || ((cur.blocks.length > 0 || cur.lead) && squeeze(cur, total))) {
      add(cur, it.key, "all", total);
      continue;
    }
    // 통째로는 안 들어간다 — 발문+지문이 들어가면 선지만 넘긴다.
    // 단, 넘기는 곳이 다음 쪽(지금 우단)이면 양면 인쇄에서 종이를 뒤집어 대조해야 하므로 통째로 다음 쪽에 둔다
    // (회차 감수 major 4건). 그러면 우단이 절반 가까이 비는 경우만 예외로 쪼갠다.
    const rightCol = cols.length % 2 === 0;
    const free = cur.height - cur.used;
    // 지금 쪽 번호 = cols.length / 2 (우단일 때). 짝수 쪽이면 다음 쪽과 펼침면, 홀수 쪽이면 같은 장 뒷면
    const evenPage = (cols.length / 2) % 2 === 0;
    const splitOk = !rightCol || free > cur.height * (evenPage ? splitFree : flipSplitFree);
    if (splitOk && it.tail > 0 && (room(cur, it.head) || squeeze(cur, it.head)) && (cur.blocks.length > 0 || cur.lead)) {
      add(cur, it.key, "head", it.head);
      cur = newCol();
      add(cur, it.key, "tail", it.tail);
      continue;
    }
    cur = newCol();
    if (total <= cur.height + 0.5 || it.tail === 0) {
      add(cur, it.key, "all", total);
    } else if (it.head <= cur.height + 0.5) {
      add(cur, it.key, "head", it.head);
      cur = newCol();
      add(cur, it.key, "tail", it.tail);
    } else {
      add(cur, it.key, "all", total);
    }
  }

  // 선택형 단: 블록 2개 이상이면 꼭대기·바닥 정렬. 마지막 단은 80% 넘게 찼을 때만.
  const lastFlow = cols.length - 1;
  cols.forEach((c, i) => {
    const n = c.blocks.length;
    if (n < 2) return;
    if (i < lastFlow || c.used >= c.height * 0.8) c.justify = "between";
  });

  if (essays.length) {
    // 논술형은 문항당 한 단, 다음 빈 단 꼭대기부터(27번이 좌단에서 끝나면 같은 쪽 우단) — 새 쪽 강제는 우단을 통째로 비우고 11쪽을 만든다
    for (const e of essays) {
      const c = newCol();
      add(c, e.key, "all", e.head + e.tail);
    }
  }

  if (opts.checkHeight > 0) {
    // 마지막 쪽 우단 바닥
    let last = cols[cols.length - 1];
    if (cols.length % 2 === 1) last = newCol();
    // 우단에 논술형이 있으면 그 아래에 — 자리가 모자라면 줄 간격 압축까지 쓰고, 그래도 안 되면 새 쪽
    if (!room(last, opts.checkHeight) && !squeeze(last, opts.checkHeight)) {
      newCol();
      last = newCol();
    }
    last.blocks.push({ key: "__check", part: "check" });
    last.used += opts.checkHeight;
    last.justify = last.blocks.length === 1 ? "end" : "between";
  }

  if (cols.length % 2 === 1) newCol();
  for (const c of cols) if (c.used > c.height) c.scale = Math.max(0.86, (c.height - 1.5) / c.used);
  const pages: PagePlan[] = [];
  for (let i = 0; i < cols.length; i += 2) pages.push({ no: i / 2 + 1, left: cols[i], right: cols[i + 1] });
  return pages;
}
