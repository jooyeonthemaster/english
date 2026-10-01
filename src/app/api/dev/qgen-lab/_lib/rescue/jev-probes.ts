// 구제 jev 프로브(RESCUE-SPEC §4.5 — crit 이 쓰는 둘만).
//   DG 죽은 미끼: LAB/rescue/rm/jev-probes.mjs DEAD_RUBRIC2·buildG 질문 **축자**(문장 전용, rubric2). 보정 조건 유지 — 요청당 문장 ≤4
//      (state {rubric2, s1..s4}, 질문 DG:1..DG:4 — replay/lib/jev-dead.mjs 와 같은 모양). 판독 noul = p_dead.
//   D7 정답 유효: planners/jev-questions.ts validityClsEx(C_cls_ex) 축자, state = applyWrongForm 문장 쌍, pBroke = P(broke_grammar).
//      밴드: 첫 값이 임계 ±0.1 안이면 2회 더 물어 평균(askBanded).
// 호출은 전부 ctx.askJev(재시도 2·5s·동시 8·원장 note run=<runId>) — 실패는 null(미상)로 돌려주고 생성물을 죽이지 않는다.
import type { JevQuestion } from "../jev-client";
import { sentenceIndexAt, sentenceSplit } from "../planners/index";
import { applyWrongForm } from "../planners/mutator";
import { readValidity, validityClsEx } from "../planners/jev-questions";
import { askBanded, markedSentence, sentencesByMarker } from "../planners/jev-questions-utils";
import type { StrategyContext } from "../strategies/index";
import { NUMS, type ItemMark } from "./item-model";

type JevHost = Pick<StrategyContext, "askJev">;

// rm/jev-probes.mjs DEAD_RUBRIC2 축자(문구 수정 금지 — AUC 0.812 보정값이 이 문구로 측정됐다).
export const DEAD_RUBRIC2 = {
  dead: {
    what: "A dead option: a strong student confirms it at a glance and never considers it as the error, because a word right next to it already forces this form or no competing form is plausible. Typical cases: a modal or do + base verb; to + base verb; have + past participle; a preposition + -ing; a subject standing directly before its verb with no other noun in between; who / which / that right after the noun it refers to, opening a clause that plainly lacks a subject; a pronoun or possessive whose referent is the only candidate nearby; a word with no grammatical alternative.",
    examples: [
      "'The old bridge could ⟦collapse⟧ any day.'",
      "'She has ⟦written⟧ three novels.'",
      "'Farmers ⟦grow⟧ rice here.'",
      "'the painters ⟦who⟧ worked on the ceiling'",
      "'Tom could not find ⟦his⟧ keys.'",
      "'She is good at ⟦drawing⟧ faces.'",
    ],
  },
  live: {
    what: "A live option: something makes a different form look right until the student analyzes the sentence — a noun of the other number between the subject and the verb, a subject or antecedent separated by a phrase or clause, a choice between a finite verb and a participle or to-infinitive that depends on how many clauses and verbs there are, the voice or the understood subject of a participle, a relative word whose choice depends on whether the following clause is complete, a parallel partner further back, or an adjective vs adverb choice after a linking or object verb.",
    examples: [
      "'The keys to the old cabinet ⟦are⟧ missing.'",
      "'Several of the tools found in the tomb ⟦were⟧ bronze.'",
      "'the town ⟦where⟧ the treaty was signed'",
      "'Left alone, the dog ⟦began⟧ to howl.'",
      "'They kept the room ⟦warm⟧.'",
    ],
  },
};
export const DG_PER_REQUEST = 4;

/** buildG 질문(축자) — k 번째 문장 키 s<k>. */
export function dgQuestion(k: number): JevQuestion {
  return {
    type: "noul",
    instructions: {
      context: `A grammar test underlines the expression marked ⟦ ⟧ in \`s${k}\`. It is grammatically correct.`,
      question: `Is the marked expression in \`s${k}\` a dead option as defined in \`rubric2.dead\`, rather than a live option as defined in \`rubric2.live\`?`,
    },
    criteria: { true: "Defined in `rubric2.dead`.", false: "Defined in `rubric2.live`." },
  };
}

/** DG 문장(대상만 ⟦⟧): 대상만 【①】로 둔 번호 지문(나머지 밑줄은 표시형 그대로) → sentencesByMarker → markedSentence. */
export function dgSentence(text: string, marks: Pick<ItemMark, "start" | "end" | "shown">[], target: Pick<ItemMark, "start" | "end" | "shown">): string {
  const sorted = [...marks.filter((m) => m !== target), target].sort((a, b) => a.start - b.start);
  let out = "";
  let last = 0;
  for (const m of sorted) {
    out += text.slice(last, m.start) + (m === target ? `【${NUMS[0]} ${m.shown}】` : m.shown);
    last = m.end;
  }
  out += text.slice(last);
  const sent = sentencesByMarker(out)[0];
  return markedSentence(sent, 1);
}

/** 문장들 → ≤4개씩 요청(state {rubric2, s1..}, 질문 DG:1..). */
export function buildDgRequests(sentences: string[]): { state: Record<string, unknown>; questions: Record<string, JevQuestion> }[] {
  const out: { state: Record<string, unknown>; questions: Record<string, JevQuestion> }[] = [];
  for (let i = 0; i < sentences.length; i += DG_PER_REQUEST) {
    const group = sentences.slice(i, i + DG_PER_REQUEST);
    const state: Record<string, unknown> = { rubric2: DEAD_RUBRIC2 };
    const questions: Record<string, JevQuestion> = {};
    group.forEach((s, j) => {
      state[`s${j + 1}`] = s;
      questions[`DG:${j + 1}`] = dgQuestion(j + 1);
    });
    out.push({ state, questions });
  }
  return out;
}

/** DG 질의 — 같은 문장은 한 번만. 반환은 입력 순서의 p_dead(요청 실패분은 null). */
export async function askDG(ctx: JevHost, sentences: string[], stage: string): Promise<(number | null)[]> {
  const uniq = [...new Set(sentences)];
  const reqs = buildDgRequests(uniq);
  const got = new Map<string, number | null>();
  await Promise.all(
    reqs.map(async (r, ri) => {
      const keys = uniq.slice(ri * DG_PER_REQUEST, ri * DG_PER_REQUEST + DG_PER_REQUEST);
      try {
        const res = await ctx.askJev(r.state, r.questions, { stage, note: `DG n=${keys.length}` });
        keys.forEach((k, j) => {
          const a = res.answers[`DG:${j + 1}`];
          got.set(k, a?.type === "noul" ? a.noul : null);
        });
      } catch {
        keys.forEach((k) => got.set(k, null));
      }
    }),
  );
  return sentences.map((s) => got.get(s) ?? null);
}

/** 스펙 §4.5 P_dead 계단표(t1 → 0.93; dg 구간별 관측 사망률). */
export function pDeadStep(t1: boolean, dg: number | null): number {
  if (t1) return 0.93;
  if (dg == null) return 0.25;
  return dg < 0.4 ? 0.02 : dg < 0.5 ? 0.07 : dg < 0.6 ? 0.18 : dg < 0.7 ? 0.34 : dg < 0.8 ? 0.49 : 0.61;
}
/** 순위용 연속판(구간 중점 선형 보간, 단조) — replay jev-dead.mjs pDeadSmooth. */
export function pDeadSmooth(dg: number | null): number {
  if (dg == null) return 0.25;
  const P = [[0, 0.01], [0.35, 0.021], [0.45, 0.066], [0.55, 0.18], [0.65, 0.338], [0.75, 0.493], [0.9, 0.609], [1, 0.65]];
  for (let i = 1; i < P.length; i++) if (dg <= P[i][0]) return P[i - 1][1] + ((dg - P[i - 1][0]) / (P[i][0] - P[i - 1][0])) * (P[i][1] - P[i - 1][1]);
  return 0.65;
}

/** D7 문장 쌍 — 원문 문장(리포 분할기) 안 [start,end) 를 오형으로(applyWrongForm, 따옴표·공백 정규화). */
export function d7Pair(passage: string, site: { start: number; end: number }, wrong: string): { originalSentence: string; modifiedSentence: string } | null {
  const sentences = sentenceSplit(passage);
  const si = sentenceIndexAt(sentences, site.start);
  if (si == null) return null;
  const s = sentences[si];
  if (site.end > s.end) return null;
  const r = applyWrongForm(passage, site, wrong, s);
  return { originalSentence: r.originalSentence, modifiedSentence: r.modifiedSentence };
}

/** D7 pBroke(밴드 재질의 포함). 첫 요청 실패 → null(미상), 밴드 재질의 실패는 첫 값으로. */
export async function askD7(
  ctx: JevHost,
  pair: { originalSentence: string; modifiedSentence: string },
  o: { stage: string; threshold: number; note?: string },
): Promise<{ p: number | null; asks: number }> {
  const fr = validityClsEx(pair.originalSentence, pair.modifiedSentence);
  const once = async (tag: string) => {
    const r = await ctx.askJev(fr.state, fr.questions, { stage: o.stage, note: `D7${tag}${o.note ? ` ${o.note}` : ""}` });
    return readValidity(r.answers.C_cls_ex);
  };
  let first: number;
  try {
    first = await once("");
  } catch {
    return { p: null, asks: 1 };
  }
  try {
    const b = await askBanded(first, o.threshold, () => once(" band"), { band: 0.1, extra: 2 });
    return { p: b.value, asks: b.asks };
  } catch {
    return { p: first, asks: 1 };
  }
}
