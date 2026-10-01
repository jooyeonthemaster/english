// qgen-lab 랩 전용 지표(비차단, LAB-SPEC §3-9) — 계획 자리 채택 여부·사용 수, 정답 오형 단어수 차, 정답 문장 인덱스.
// 자리 비교 = 단어 토큰 연속 포함(어느 쪽이든) + 같은 문장(문장 인덱스를 알 때). "is" 가 "this" 에 걸리지 않는다.
import type { MdGrammarMark, MdGrammarQuestion } from "@/lib/md-qgen/parser";
import type { PlanSite, PlannerPlan, RunResult } from "@/lib/qgen-lab/types";
import { sentenceIndexAt, sentenceSplit } from "../planners/index";

const MARK_RE = /\[\[([A-J]):((?:(?!\]\]).)+)\]\]/g;

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .split(/[^a-z0-9']+/)
    .map((t) => t.replace(/^'+|'+$/g, ""))
    .filter(Boolean);
}

function containsSeq(hay: string[], needle: string[]): boolean {
  if (needle.length === 0 || needle.length > hay.length) return false;
  outer: for (let i = 0; i + needle.length <= hay.length; i++) {
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
}

/** 단어경계 겹침 — 한쪽 토큰열이 다른 쪽에 연속으로 포함되면 true. */
export function wordOverlap(a: string, b: string): boolean {
  const ta = tokens(a);
  const tb = tokens(b);
  return containsSeq(ta, tb) || containsSeq(tb, ta);
}

function wordCount(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

/** markedPassage 를 원형으로 되돌린 지문에서 각 밑줄의 문장 인덱스(라벨 → idx). */
export function markSentenceIndex(q: MdGrammarQuestion): Map<string, number | null> {
  const out = new Map<string, number | null>();
  const marked = q.markedPassage;
  if (!marked) return out;
  const byLabel = new Map(q.marks.map((m) => [m.label, m]));
  let rebuilt = "";
  let last = 0;
  const offsets: { label: string; offset: number }[] = [];
  for (const m of marked.matchAll(MARK_RE)) {
    const label = `(${m[1]})`;
    rebuilt += marked.slice(last, m.index);
    offsets.push({ label, offset: rebuilt.length });
    rebuilt += byLabel.get(label)?.original ?? m[2];
    last = (m.index ?? 0) + m[0].length;
  }
  rebuilt += marked.slice(last);
  const sentences = sentenceSplit(rebuilt);
  for (const o of offsets) out.set(o.label, sentenceIndexAt(sentences, o.offset));
  return out;
}

function siteHitsMark(site: PlanSite, mark: MdGrammarMark, markSent: number | null | undefined): boolean {
  const core = site.core || site.span;
  if (!core) return false;
  if (!wordOverlap(core, mark.original) && !wordOverlap(core, mark.shown)) return false;
  return markSent == null || markSent === site.sentenceIdx;
}

export function computeLabChecks(
  q: MdGrammarQuestion | null,
  plan: PlannerPlan | null,
): RunResult["labChecks"] {
  if (!q) {
    return { planAnswerAdopted: null, planSitesUsed: null, answerWordDelta: null, answerSentenceIdx: null };
  }
  const sentOf = markSentenceIndex(q);
  const answerMark = q.marks.find((m) => m.label === q.answer) ?? null;
  const answerWordDelta = answerMark ? wordCount(answerMark.shown) - wordCount(answerMark.original) : null;
  const answerSentenceIdx = answerMark ? (sentOf.get(answerMark.label) ?? null) : null;

  let planAnswerAdopted: boolean | null = null;
  let planSitesUsed: number | null = null;
  if (plan) {
    const top = plan.answerCandidates[0];
    planAnswerAdopted =
      top && answerMark ? siteHitsMark(top, answerMark, sentOf.get(answerMark.label)) : null;
    const sites = [...plan.answerCandidates, ...plan.decoyCandidates];
    planSitesUsed = sites.filter((s) =>
      q.marks.some((m) => siteHitsMark(s, m, sentOf.get(m.label))),
    ).length;
  }
  return { planAnswerAdopted, planSitesUsed, answerWordDelta, answerSentenceIdx };
}
