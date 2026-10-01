// qgen-lab 인벤토리 도구 — jev 동시성 세마포어, 지문 축자·유일 구간 확장, 밑줄 간격(인접 게이트) 검사, 미끼 greedy 선택.
// 순수 함수(세마포어 제외). inventory.ts·플래너 3종(ja·jf·jh)이 공유한다.
import { findUniqueSpan } from "./index";

// ── 동시성 ──────────────────────────────────────────────────────────────────────────────

/** 동시 실행 ≤n 세마포어. 해제 시 대기자에게 자리를 직접 넘겨(active 를 내렸다 올리지 않음) 순간 초과가 없다. */
export function limiter(n: number): <T>(fn: () => Promise<T>) => Promise<T> {
  const cap = Math.max(1, Math.floor(n));
  let active = 0;
  const queue: (() => void)[] = [];
  const release = () => {
    const next = queue.shift();
    if (next) next();
    else active--;
  };
  return async <T>(fn: () => Promise<T>): Promise<T> => {
    if (active < cap) active++;
    else await new Promise<void>((r) => queue.push(r));
    try {
      return await fn();
    } finally {
      release();
    }
  };
}

export const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
export const r3 = (x: number) => Math.round(x * 1000) / 1000;

// ── 단어 토큰·유일 구간 ─────────────────────────────────────────────────────────────────

export interface Range {
  start: number;
  end: number;
}

const WORD_RE = /[A-Za-z0-9]+(?:['’][A-Za-z0-9]+)*/g;

/** text[from, to) 안의 단어 토큰 오프셋(구두점 제외). */
export function wordTokens(text: string, from: number, to: number): Range[] {
  const out: Range[] = [];
  const re = new RegExp(WORD_RE.source, "g");
  re.lastIndex = from;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) && m.index < to) {
    const end = m.index + m[0].length;
    if (end > to) break;
    out.push({ start: m.index, end });
  }
  return out;
}

export const countWords = (s: string) => (s.match(new RegExp(WORD_RE.source, "g")) || []).length;

export interface UniqueSpan extends Range {
  text: string;
  words: number;
}

/**
 * 자리 [start,end) 를 감싸는 지문 축자·유일 구간(findUniqueSpan 기준 — 부분문자열 의미라 "is" 는 "this" 에서도 찾힌다).
 * 같은 문장 안에서 단어를 오른쪽 먼저 붙여 가며(길이 짧은 순) 처음 유일해지는 창을 돌려준다. 없으면 null.
 * minWords 가 자리 단어 수보다 크면 그만큼 문맥을 강제로 붙인다(교사 포인트 2~4단어 구). accept 가 있으면 그것도 통과하는 창만.
 */
export function uniqueSpanAround(
  passage: string,
  site: Range,
  sentence: Range,
  o: { minWords?: number; maxWords?: number; accept?: (text: string) => boolean } = {},
): UniqueSpan | null {
  const toks = wordTokens(passage, sentence.start, sentence.end);
  const i = toks.findIndex((t) => t.end > site.start);
  if (i < 0 || toks[i].start >= site.end) return null;
  let j = i;
  while (j + 1 < toks.length && toks[j + 1].start < site.end) j++;
  const coreLen = j - i + 1;
  const minW = Math.max(o.minWords ?? 1, coreLen);
  const maxW = Math.max(o.maxWords ?? 8, minW);
  for (let n = minW; n <= maxW; n++) {
    const extra = n - coreLen;
    for (let l = 0; l <= extra; l++) {
      const r = extra - l;
      if (i - l < 0 || j + r >= toks.length) continue;
      const start = Math.min(toks[i - l].start, site.start);
      const end = Math.max(toks[j + r].end, site.end);
      const text = passage.slice(start, end);
      const loc = findUniqueSpan(passage, text);
      if (loc && loc.start === start && (!o.accept || o.accept(text))) return { text, start, end, words: n };
    }
  }
  return null;
}

/** 자리 표면이 자기 문장 안에 단어경계로 2번 이상 나오는가(블록의 "<core>" 만으로는 위치가 모호). */
export function coreAmbiguousInSentence(passage: string, site: Range, sentence: Range): boolean {
  const core = passage.slice(site.start, site.end).toLowerCase();
  const sent = passage.slice(sentence.start, sentence.end).toLowerCase();
  const esc = core.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return (sent.match(new RegExp(`(?<![A-Za-z0-9'’])${esc}(?![A-Za-z0-9'’])`, "g")) || []).length > 1;
}

// ── 밑줄 간격 ───────────────────────────────────────────────────────────────────────────

export interface PlacedSite extends Range {
  sentenceIdx: number;
}

export const overlaps = (a: Range, b: Range) => a.start < b.end && b.start < a.end;

/** 두 자리 사이 단어 수(겹치면 -1). */
export function wordsBetween(passage: string, a: Range, b: Range): number {
  if (overlaps(a, b)) return -1;
  const [x, y] = a.start <= b.start ? [a, b] : [b, a];
  return countWords(passage.slice(x.end, y.start));
}

/** gateMdQuestion 인접 규칙 대비 — 같은 문장이면 사이 ≥3단어, 다른 문장이면 겹치지만 않으면 된다. */
export function spacedOk(passage: string, a: PlacedSite, b: PlacedSite, minGap = 3): boolean {
  if (overlaps(a, b)) return false;
  return a.sentenceIdx !== b.sentenceIdx || wordsBetween(passage, a, b) >= minGap;
}

// ── 미끼 greedy ─────────────────────────────────────────────────────────────────────────

export interface PickOptions {
  n: number;
  /** 1차 통과에서 피할 문장(정답 후보 문장). 2차 통과에서 풀린다(strictAvoid 면 끝까지). */
  avoidSentences?: Set<number>;
  strictAvoid?: boolean;
  perSentence: number;
  /** 코드 다양성 — 1차는 perCode, 2차는 perCodeRelaxed(없으면 perCode). */
  perCode: number;
  perCodeRelaxed?: number;
  /** 이미 확정된 자리(정답 등) — 겹침·인접 금지 대상. */
  fixed?: PlacedSite[];
}

/** 점수순 풀에서 문장 분산·코드 다양·간격을 지키며 n개를 고른다(풀 순서 = 우선순위). */
export function pickSpread<T>(
  passage: string,
  pool: T[],
  place: (x: T) => PlacedSite,
  code: (x: T) => string,
  o: PickOptions,
): T[] {
  const chosen: T[] = [];
  const fixed = o.fixed ?? [];
  const passes: { avoid: boolean; perCode: number }[] = [
    { avoid: true, perCode: o.perCode },
    { avoid: !!o.strictAvoid, perCode: o.perCode },
    { avoid: !!o.strictAvoid, perCode: o.perCodeRelaxed ?? o.perCode },
  ];
  for (const pass of passes) {
    for (const x of pool) {
      if (chosen.length >= o.n) return chosen;
      if (chosen.includes(x)) continue;
      const p = place(x);
      if (pass.avoid && o.avoidSentences?.has(p.sentenceIdx)) continue;
      if (chosen.filter((y) => place(y).sentenceIdx === p.sentenceIdx).length >= o.perSentence) continue;
      if (chosen.filter((y) => code(y) === code(x)).length >= pass.perCode) continue;
      if (![...fixed, ...chosen.map(place)].every((q) => spacedOk(passage, p, q))) continue;
      chosen.push(x);
    }
  }
  return chosen;
}
