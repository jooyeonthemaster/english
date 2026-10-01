// 지문 렌더 분해(순수) — 최종 문항(밑줄 ①~⑤)과 계획 후보(정답/미끼 하이라이트).

import {
  circledForMarkIndex,
  segmentPassage,
  type MdGrammarMark,
  type MdGrammarQuestion,
} from "@/lib/md-qgen/parser";
import type { PlannerPlan, PlanSite } from "@/lib/qgen-lab/types";

export interface QuestionSegment {
  type: "text" | "mark";
  text: string;
  circled?: string;
  mark?: MdGrammarMark;
  isAnswer?: boolean;
}

/** markedPassage 의 [[X:shown]] 마커(없으면 원문 축자 탐색)를 ①~⑤ 밑줄로 분해한다.
 *  라벨 ↔ 원 번호는 파서 규약(marks 배열 순서 = circledForMarkIndex)을 그대로 따른다. */
export function questionSegments(
  passage: string,
  q: MdGrammarQuestion,
): { segments: QuestionSegment[]; unmatched: string[] } {
  const { segments, unmatched } = segmentPassage(passage, q);
  const answers = new Set(q.answers?.length ? q.answers : [q.answer]);
  const byCircled = new Map(q.marks.map((m, i) => [circledForMarkIndex(i), m]));
  return {
    unmatched,
    segments: segments.map((s) => {
      if (s.type !== "mark") return { type: "text", text: s.text };
      const mark = s.label ? byCircled.get(s.label) : undefined;
      return {
        type: "mark",
        text: s.text,
        circled: s.label,
        mark,
        isAnswer: mark ? answers.has(mark.label) : false,
      };
    }),
  };
}

/** 라벨 "(C)" → 원 번호 "③"(marks 순서 기준). 못 찾으면 라벨 그대로. */
export function circledOfLabel(q: MdGrammarQuestion, label: string): string {
  const i = q.marks.findIndex((m) => m.label === label);
  return i >= 0 ? circledForMarkIndex(i) : label;
}

export interface RankedSite extends PlanSite {
  rank: number;
}

export interface PlanSegment {
  type: "text" | "site";
  text: string;
  site?: RankedSite;
}

/** 계획 후보를 지문 위에 얹는다 — span 축자 위치 안에서 core 만 칠한다. 겹치거나 못 찾은 후보는 missing. */
export function planSegments(
  passage: string,
  plan: PlannerPlan,
): { segments: PlanSegment[]; missing: { site: RankedSite; why: string }[] } {
  const sites: RankedSite[] = [
    ...plan.answerCandidates.map((s, i) => ({ ...s, role: "answer" as const, rank: i + 1 })),
    ...plan.decoyCandidates.map((s, i) => ({ ...s, role: "decoy" as const, rank: i + 1 })),
  ];
  const missing: { site: RankedSite; why: string }[] = [];
  const placed: { start: number; end: number; site: RankedSite }[] = [];
  for (const site of sites) {
    const at = site.span ? passage.indexOf(site.span) : -1;
    if (at < 0) {
      missing.push({ site, why: "span 이 지문에 없음" });
      continue;
    }
    const coreAt = site.core ? site.span.indexOf(site.core) : -1;
    const start = at + Math.max(0, coreAt);
    const end = coreAt >= 0 ? start + site.core.length : at + site.span.length;
    if (placed.some((p) => start < p.end && end > p.start)) {
      missing.push({ site, why: "다른 후보와 겹침" });
      continue;
    }
    placed.push({ start, end, site });
  }
  placed.sort((a, b) => a.start - b.start);
  const segments: PlanSegment[] = [];
  let cursor = 0;
  for (const p of placed) {
    if (p.start > cursor) segments.push({ type: "text", text: passage.slice(cursor, p.start) });
    segments.push({ type: "site", text: passage.slice(p.start, p.end), site: p.site });
    cursor = p.end;
  }
  segments.push({ type: "text", text: passage.slice(cursor) });
  return { segments, missing };
}
