// 구제 문항 모형(RESCUE-SPEC §4.2 최소판 — crit 용) — 원문 오프셋 밑줄 모형 · 파싱 문항 → 모형 · 표시 문맥 · 번호 지문.
// 정렬(alignTo)·표시(displayOf)·번호 지문(numberedOf)은 LAB/rescue/replay/lib/common.mjs 의 축자 이식이다.
import type { MdGrammarQuestion } from "@/lib/md-qgen/parser";
import type { DispContext, DispMark } from "./lint-decoy";
import { makeView, wordRange, type SyntaxView } from "./lint-syntax";

export const NUMS = ["①", "②", "③", "④", "⑤"] as const;
export const LABELS = "ABCDE";

export interface ItemMark {
  /** 원문 오프셋 [start, end) — 원문 표현 = passage.slice(start, end). */
  start: number;
  end: number;
  /** 화면 표시형(정답은 오형). */
  shown: string;
  /** 어법상 옳은 원형(원문 표현). */
  original: string;
  /** 포인트 코드 a~m. */
  code: string;
  role: "answer" | "decoy";
  /** 오답 분석(미끼) — 인용 제외 본문. 정답은 null(해설은 ItemModel.answerAnalysis). */
  analysis: string | null;
  /** 출처("draft" | "menu:M2" | "menu:A1"). */
  from: string;
}

export interface ItemModel {
  passage: string;
  /** 원문 등장순. */
  marks: ItemMark[];
  fix: string;
  answerAnalysis: string;
}

export interface DisplayMark extends ItemMark, DispMark {}

export interface ItemDisplay extends DispContext {
  text: string;
  view: SyntaxView;
  /** 원문 등장순, 표시 좌표 부여. */
  marks: DisplayMark[];
  /** 원문 오프셋 → 표시 오프셋. */
  toD(off: number): number;
}

const MARK_RE = /\[\[([A-J])\s*:\s*((?:(?!\]\]).)*?)\s*\]\]/g;
const NC = (ch: string) => (/[‘’ʼ]/.test(ch) ? "'" : /[“”]/.test(ch) ? '"' : /[–—]/.test(ch) ? "-" : ch);

/** 복원문 R → 원문 T 문자 대응(따옴표·대시·공백·말줄임 관용). 실패 시 null. 반환 map[i]=j (길이 R.length+1). */
export function alignTo(R: string, T: string): number[] | null {
  const map = new Array<number>(R.length + 1);
  let i = 0;
  let j = 0;
  while (i < R.length || j < T.length) {
    const ri = R[i];
    const tj = T[j];
    if (i < R.length && /\s/.test(ri)) {
      map[i++] = j;
      continue;
    }
    if (j < T.length && /\s/.test(tj)) {
      j++;
      continue;
    }
    if (i >= R.length || j >= T.length) return null;
    if (NC(ri) === NC(tj)) {
      map[i++] = j++;
      continue;
    }
    if (ri === "…" && T.slice(j, j + 3) === "...") {
      map[i++] = j;
      j += 3;
      continue;
    }
    if (R.slice(i, i + 3) === "..." && tj === "…") {
      map[i] = map[i + 1] = map[i + 2] = j;
      i += 3;
      j++;
      continue;
    }
    return null;
  }
  map[R.length] = T.length;
  return map;
}

/** markedPassage([[A:..]]) + 라벨별 원형 → 원문 오프셋 밑줄(실패 시 null). */
export function parseMarked(
  markedPassage: string,
  text: string,
  originalOf: (label: string) => string | undefined,
): { label: string; shown: string; original: string; start: number; end: number }[] | null {
  let R = "";
  let last = 0;
  const spans: { label: string; shown: string; rs: number; re: number }[] = [];
  let m: RegExpExecArray | null;
  MARK_RE.lastIndex = 0;
  while ((m = MARK_RE.exec(markedPassage))) {
    R += markedPassage.slice(last, m.index);
    const label = m[1];
    const shown = m[2].trim();
    const original = originalOf(label) ?? shown;
    spans.push({ label, shown, rs: R.length, re: R.length + original.length });
    R += original;
    last = m.index + m[0].length;
  }
  R += markedPassage.slice(last);
  const map = alignTo(R, text);
  if (!map) return null;
  return spans.map((s) => {
    const start = map[s.rs];
    const end = s.re > s.rs ? map[s.re - 1] + 1 : start;
    return { label: s.label, shown: s.shown, original: text.slice(start, end), start, end };
  });
}

/** 게이트 통과 파싱 문항(인용 절단 후 — wrong[].text·explanation 이 분석 본문) → 원문 오프셋 모형. 정렬 실패 시 null. */
export function fromParsed(q: MdGrammarQuestion, passage: string): ItemModel | null {
  if (!q.markedPassage) return null;
  const byLabel = new Map(q.marks.map((mk) => [mk.label.replace(/[()]/g, ""), mk]));
  const spans = parseMarked(q.markedPassage, passage, (L) => byLabel.get(L)?.original);
  if (!spans || spans.length !== 5) return null;
  const ansL = String(q.answer).replace(/[()]/g, "");
  const wrongBy = new Map(q.wrong.map((w) => [w.label.replace(/[()]/g, ""), w.text]));
  const marks: ItemMark[] = spans
    .map((s) => ({
      start: s.start,
      end: s.end,
      shown: s.label === ansL ? s.shown : s.original,
      original: s.original,
      code: (byLabel.get(s.label)?.code ?? "").trim().toLowerCase() || "m",
      role: (s.label === ansL ? "answer" : "decoy") as ItemMark["role"],
      analysis: s.label === ansL ? null : wrongBy.get(s.label) ?? null,
      from: "draft",
    }))
    .sort((a, b) => a.start - b.start);
  if (marks.filter((x) => x.role === "answer").length !== 1) return null;
  if (marks.some((x) => x.end <= x.start)) return null;
  return { passage, marks, fix: q.fix, answerAnalysis: q.explanation };
}

export const answerOf = (item: Pick<ItemModel, "marks">): ItemMark => item.marks.find((m) => m.role === "answer")!;
export const decoysOf = (item: Pick<ItemModel, "marks">): ItemMark[] => item.marks.filter((m) => m.role !== "answer");

/** 원문 + 밑줄 → 표시 텍스트·뷰(각 mark 에 dStart/dEnd·wordRange 부여, 사본). */
export function displayOf<T extends Pick<ItemMark, "start" | "end" | "shown">>(text: string, marks: T[]): Omit<ItemDisplay, "marks"> & { marks: (T & DispMark)[] } {
  const sorted = [...marks].sort((a, b) => a.start - b.start);
  let d = "";
  let last = 0;
  const out: (T & DispMark)[] = [];
  for (const m of sorted) {
    d += text.slice(last, m.start);
    const dStart = d.length;
    d += m.shown;
    out.push({ ...m, dStart, dEnd: d.length, wr: null });
    last = m.end;
  }
  d += text.slice(last);
  const view = makeView(d);
  for (const m of out) m.wr = wordRange(view, m.dStart, m.dEnd);
  /** 원문 오프셋 → 표시 오프셋 */
  const toD = (off: number) => {
    let delta = 0;
    for (const m of sorted) if (m.end <= off) delta += m.shown.length - (m.end - m.start);
    return off + delta;
  };
  return { text: d, view, marks: out, toD };
}

/** 번호 지문(【① x】) — 비평 프롬프트·jev 요청용. */
export function numberedOf(text: string, marks: Pick<ItemMark, "start" | "end" | "shown">[]): string {
  const sorted = [...marks].sort((a, b) => a.start - b.start);
  let out = "";
  let last = 0;
  sorted.forEach((m, i) => {
    out += text.slice(last, m.start) + `【${NUMS[i]} ${m.shown}】`;
    last = m.end;
  });
  return out + text.slice(last);
}

/** 원문 오프셋 구간 사이 단어 수(겹침·인접 판정용). */
export function wordsBetweenOffsets(text: string, aEnd: number, bStart: number): number {
  if (bStart <= aEnd) return 0;
  return text.slice(aEnd, bStart).split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;
}
