// qgen-lab 플래너 jev-hard (팔 코드 jh, 대조군) — PLANNER-SPEC §2.
// 정답 1개(D7 p_valid≥0.6 최상위 — d7-validity 권고의 hard 임계) + 미끼 4개(인벤토리에서 문장 분산·코드 다양 greedy)
// → 프로덕션 teacherPoints 와이어 형식(text = 지문 유일 축자 2~4단어 구). 준수는 프로덕션 교사 포인트 게이트가 강제한다.
// 킬러 게이트와 모순이 안 나게 배치를 미리 맞춘다: 밑줄 간격(같은 문장 ≥3단어), 미끼 깊이(넷 다 얕고 넷 다 공식 자리 금지 —
// gate-grammar-killer-decoy-depth), 접속사/전치사 머리 정답은 첫 밑줄 금지(gate-grammar-killer-answer-site).
// 준수 게이트는 부분문자열 양방향 비교라(route.ts:452-469) 포인트 텍스트에 다른 계획 밑줄의 표면이 들어 있으면 그 밑줄로도
// 통과해 버린다 — 포인트마다 다른 4자리의 원형·표시형이 안 들어간 창을 고른다(없으면 기본 창 + hardNotes 기록).
import { normalizeWs } from "@/lib/md-qgen/parser";
import type { PlannerPlan } from "@/lib/qgen-lab/types";
import type { PlannerFn } from "./index";
import {
  buildInventory, contextInventoryOptions, inventoryDebug, numParam, pairCategoryCode, placeOf,
  type InvDecoy, type InvPair, type Inventory,
} from "./inventory";
import { countWords, overlaps, pickSpread, spacedOk, uniqueSpanAround, type UniqueSpan } from "./inventory-utils";
import { answerPlanSite, buildHardBlock, codeLabel, decoyPlanSite } from "./plan-block";

export const HARD_ID = "jev-hard";

type TeacherPoint = NonNullable<PlannerPlan["teacherPoints"]>[number];

/** 교사 포인트 텍스트 — 자리를 감싸는 같은 문장 안 2~4단어 유일 축자 구(없으면 null). avoid = 들어가면 안 되는 표면들. */
function pointSpan(inv: Inventory, c: InvPair["site"]["c"], avoid: string[] = []): UniqueSpan | null {
  const sent = inv.sentences[c.sentenceIdx];
  const bad = avoid.map(normalizeWs).filter(Boolean);
  const accept = bad.length ? (t: string) => !bad.some((b) => normalizeWs(t).includes(b)) : undefined;
  const u = sent ? uniqueSpanAround(inv.passage, c, sent, { minWords: 2, maxWords: 4, accept }) : null;
  return u && u.text.trim().length > 0 && u.text.length <= 400 ? u : null;
}

const firstUnderlineBanned = (p: InvPair) => p.prefilter.flags.some((f) => f.startsWith("첫 밑줄"));

export function planHard(inv: Inventory, t0: number, o: { minValid?: number } = {}): PlannerPlan {
  const minValid = o.minValid ?? 0.6;
  const notes: string[] = [];
  let answer: InvPair | null = null;
  // 감독 수리 26-09-25(통합 검사 지적): inv.answers 는 p≥0.5 로 문장당 1쌍만 남긴 목록이라, 같은 문장의 p∈[0.5,0.6)
  // 고득점 쌍이 p≥0.6 쌍을 가려 거짓 "지정 불가"가 날 수 있다 → hard 임계로 전체 쌍을 다시 순위화한다.
  const hardRanked = inv.pairs
    .filter((p) => p.pValid !== null && p.pValid >= minValid && p.prefilter.ok)
    .sort((a, b) => b.score - a.score);
  for (const p of hardRanked.length ? hardRanked : inv.answers) {
    if ((p.pValid ?? 0) < minValid) continue;
    if (!pointSpan(inv, p.site.c)) {
      notes.push(`정답 후보 '${p.site.c.word}' 건너뜀 — 2~4단어 유일 구 없음`);
      continue;
    }
    answer = p;
    break;
  }
  if (!answer) {
    const best = inv.answers[0]?.pValid;
    throw new Error(`${HARD_ID}: p_valid≥${minValid} 정답 쌍 없음(유효 ${inv.answers.length}개, 최고 ${best?.toFixed(2) ?? "-"}) — hard 지정 불가`);
  }
  const ans = answer;
  const ansPlace = placeOf(ans.site);

  // 미끼 4: 인벤토리 우선, 모자라면 사전 필터 통과 풀 전체
  const pool = [...inv.decoys, ...inv.decoyPool.filter((d) => !inv.decoys.includes(d))].filter(
    (d) => !overlaps(d.site.c, ans.site.c) && pointSpan(inv, d.site.c) !== null,
  );
  const place = (d: InvDecoy) => placeOf(d.site);
  const code = (d: InvDecoy) => d.site.code;
  const decoys = pickSpread(inv.passage, pool, place, code, {
    n: 4,
    avoidSentences: new Set([ans.site.c.sentenceIdx]),
    perSentence: 1,
    perCode: 1,
    perCodeRelaxed: 2,
    fixed: [ansPlace],
  });
  if (decoys.length < 4) notes.push(`미끼 ${decoys.length}/4 — 문장 분산·간격 제약으로 부족(나머지는 모델 재량)`);

  // 킬러 게이트 대비 조건(교체가 이 조건을 깨지 않게 늘 같이 본다)
  const gatesOk = (list: InvDecoy[]) =>
    (list.length < 4 || list.some((d) => d.deep || d.formula === null)) &&
    (!firstUnderlineBanned(ans) || list.some((d) => d.site.c.start < ans.site.c.start));
  const fits = (d: InvDecoy, i: number) => {
    const rest = decoys.filter((_, k) => k !== i);
    return (
      !decoys.includes(d) &&
      [ansPlace, ...rest.map(place)].every((q) => spacedOk(inv.passage, place(d), q)) &&
      !rest.some((y) => place(y).sentenceIdx === place(d).sentenceIdx) &&
      rest.filter((y) => code(y) === code(d)).length < 2
    );
  };
  /** i 번 미끼를 조건 맞는 풀 최상위 후보로 교체. */
  const swapAt = (i: number, want: (d: InvDecoy) => boolean, why: string): boolean => {
    const x = pool.find((d) => fits(d, i) && want(d));
    if (!x) return false;
    notes.push(`${why}: '${decoys[i].site.c.word}' → '${x.site.c.word}'`);
    decoys[i] = x;
    return true;
  };
  const swapLast = (want: (d: InvDecoy) => boolean, why: string) => {
    for (let i = decoys.length - 1; i >= 0; i--) if (swapAt(i, want, why)) return;
    notes.push(`${why}: 교체 후보 없음`);
  };
  if (decoys.length === 4 && !decoys.some((d) => d.deep || d.formula === null)) {
    swapLast((d) => d.deep || d.formula === null, "미끼 깊이 게이트 회피(넷 다 얕은 공식 자리)");
  }
  if (firstUnderlineBanned(ans) && !decoys.some((d) => d.site.c.start < ans.site.c.start)) {
    swapLast((d) => d.site.c.start < ans.site.c.start, "첫 밑줄 정답 금지 회피(정답 앞 미끼 확보)");
  }

  // 포인트 창: 다른 계획 밑줄의 원형·표시형(정답은 오형)이 부분문자열로 안 들어가게. 창을 옮겨도 못 피하면 그 표면의 미끼를 교체.
  const surfaces = (o: number) => (o < 0 ? [ans.site.c.word, ans.w.wrong] : [decoys[o].site.c.word]);
  const computeSpans = () => {
    const owners = [-1, ...decoys.map((_, i) => i)];
    const spans = new Map<number, UniqueSpan>();
    const culprits = new Set<number>();
    for (const o of owners) {
      const c = o < 0 ? ans.site.c : decoys[o].site.c;
      const clean = pointSpan(inv, c, owners.filter((x) => x !== o).flatMap(surfaces));
      if (clean) {
        spans.set(o, clean);
        continue;
      }
      const fb = pointSpan(inv, c)!;
      spans.set(o, fb);
      for (const x of owners) {
        if (x !== o && surfaces(x).some((sf) => normalizeWs(fb.text).includes(normalizeWs(sf)))) culprits.add(x < 0 ? o : x);
      }
    }
    return { spans, culprits };
  };
  let S = computeSpans();
  for (let round = 0; round < 3 && S.culprits.size > 0; round++) {
    const texts = [...S.spans.values()].map((u) => normalizeWs(u.text));
    let changed = false;
    for (const i of S.culprits) {
      const want = (d: InvDecoy) =>
        !texts.some((t) => t.includes(normalizeWs(d.site.c.word))) &&
        (gatesOk(decoys.map((y, k) => (k === i ? d : y))) || !gatesOk(decoys));
      changed = swapAt(i, want, "준수 게이트 표면 충돌 회피") || changed;
    }
    if (!changed) break;
    S = computeSpans();
  }
  if (S.culprits.size > 0) notes.push(`표면 충돌 미해소 — 준수 게이트가 다른 밑줄로도 통과할 수 있는 포인트 있음`);
  const ansSpan = S.spans.get(-1)!;
  const decoySpans = decoys.map((_, i) => S.spans.get(i)!);
  const points: (TeacherPoint & { at: number })[] = [
    {
      at: ans.site.c.start,
      text: ansSpan.text,
      unit: countWords(ans.site.c.word) > 1 ? "phrase" : "word",
      tag: codeLabel(pairCategoryCode(ans)),
      note: `정답 자리: '${ans.site.c.word}'→'${ans.w.wrong}' 로 틀리게`,
    },
    ...decoys.map((d, i) => ({
      at: d.site.c.start,
      text: decoySpans[i].text,
      unit: (countWords(d.site.c.word) > 1 ? "phrase" : "word") as TeacherPoint["unit"],
      tag: codeLabel(d.site.code),
      note: `미끼: '${d.site.c.word}' 원형 그대로 밑줄만`,
    })),
  ];
  const teacherPoints: TeacherPoint[] = points.sort((a, b) => a.at - b.at).map((x) => ({ text: x.text, unit: x.unit, tag: x.tag, note: x.note }));

  const answerSite = { ...answerPlanSite(inv, ans), span: ansSpan.text };
  return {
    plannerId: HARD_ID,
    mode: "hard",
    answerCandidates: [answerSite],
    decoyCandidates: decoys.map((d, i) => ({ ...decoyPlanSite(inv, d), span: decoySpans[i].text })),
    promptBlock: buildHardBlock(inv, ans, decoys),
    teacherPoints,
    ms: Math.round(performance.now() - t0),
    jevCalls: inv.stats.jevCalls,
    jevCostUsd: inv.stats.jevCostUsd,
    llmCostUsd: 0,
    llmMs: 0,
    debug: { inventory: inventoryDebug(inv), hardNotes: notes, minValid },
  };
}

export const jevHard: PlannerFn = async (ctx) => {
  const t0 = performance.now();
  const inv = await buildInventory(ctx.passage.text, contextInventoryOptions(ctx));
  return planHard(inv, t0, { minValid: numParam(ctx.params, "minValid", 0.5, 0.95) });
};
