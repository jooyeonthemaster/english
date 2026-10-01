// qgen-lab 플래너 블록·표기 — PLANNER-SPEC §2 soft 블록 문구(축자, 프로덕션 정답위치 넛지의 탈출구 문구 계승),
// 포인트 코드 라벨(grammar-killer-v2.ts:27 「포인트코드」 표기와 같게), 인벤토리 → PlanSite 변환.
import type { PlanSite } from "@/lib/qgen-lab/types";
import { pairCategoryCode, type InvDecoy, type InvPair, type Inventory } from "./inventory";
import { coreAmbiguousInSentence, r3, uniqueSpanAround } from "./inventory-utils";

/** 포인트 코드 → 이름. a·b·c·d·e·f·g·h·i·k 는 v2 프롬프트 「포인트코드」 표기 그대로, j·l·m 은 교사 픽커 태그(passage-point-picker.tsx:98). */
export const CODE_NAME: Readonly<Record<string, string>> = {
  a: "정동사vs준동사", b: "관계사·접속사", c: "분사", d: "수일치", e: "태", f: "형용사vs부사", g: "대명사",
  h: "목적격보어", i: "병렬", j: "가정법", k: "to-v vs v-ing", l: "전치사vs접속사", m: "비교",
};

/** "d" → "(d)수일치", "d/a" → "(d)수일치 또는 (a)정동사vs준동사", "none" → "범주 불명". */
export function codeLabel(code: string): string {
  return code
    .split("/")
    .map((c) => (CODE_NAME[c] ? `(${c})${CODE_NAME[c]}` : "범주 불명"))
    .join(" 또는 ");
}

/** 미끼 유혹도 등급 — 보정된 코드 사전(0=low·1=medium·2=high 평균 라벨)을 셋으로: ≥1.25 상(d·b·c·i) · ≥0.9 중(h·e·f·g) · 하(l·m·k·a). */
export const temptGrade = (prior: number) => (prior >= 1.25 ? "상" : prior >= 0.9 ? "중" : "하");

// ── PlanSite 변환 ───────────────────────────────────────────────────────────────────────

function spanOf(inv: Inventory, c: InvPair["site"]["c"]): string {
  const sent = inv.sentences[c.sentenceIdx];
  const u = sent ? uniqueSpanAround(inv.passage, c, sent, { minWords: 1, maxWords: 8 }) : null;
  return u?.text ?? (sent?.text.trim() || c.word);
}

/** 블록에서 "<core>" 만으로 위치가 모호하면(같은 문장 2회+) 붙일 유일 문맥(2단어+). */
function locateOf(inv: Inventory, c: InvPair["site"]["c"]): string | null {
  const sent = inv.sentences[c.sentenceIdx];
  if (!sent || !coreAmbiguousInSentence(inv.passage, c, sent)) return null;
  return uniqueSpanAround(inv.passage, c, sent, { minWords: 2, maxWords: 8 })?.text ?? null;
}

export function answerPlanSite(inv: Inventory, p: InvPair): PlanSite {
  const c = p.site.c;
  const cat = p.category;
  return {
    span: spanOf(inv, c),
    core: c.word,
    sentenceIdx: c.sentenceIdx,
    role: "answer",
    wrongForm: p.w.wrong,
    category: pairCategoryCode(p),
    score: r3(p.score),
    evidence: {
      start: c.start, end: c.end, candId: c.id, rank: p.site.rank,
      a2: r3(p.site.a2), d: r3(p.site.d), answerRaw: r3(p.site.answerRaw),
      pValid: r3(p.pValid ?? 0), pFirst: r3(p.pFirst ?? 0), validityAsks: p.values.length,
      rule: p.w.rule, codeGuess: p.w.code, wordDelta: p.w.wordDelta, deletion: p.w.deletion ? 1 : 0,
      d4Code: cat?.code ?? "-", d4Pmax: r3(cat?.pmax ?? 0), d4Top2: cat?.top2.join("/") ?? "-", d4Asks: cat?.asks ?? 0,
      ...(p.prefilter.flags.length ? { flags: p.prefilter.flags.join(" / ") } : {}),
    },
  };
}

export function decoyPlanSite(inv: Inventory, d: InvDecoy, extra: Record<string, number | string> = {}): PlanSite {
  const c = d.site.c;
  return {
    span: spanOf(inv, c),
    core: c.word,
    sentenceIdx: c.sentenceIdx,
    role: "decoy",
    category: d.site.code,
    score: r3(d.site.decoyScore),
    evidence: {
      start: c.start, end: c.end, candId: c.id, a2: r3(d.site.a2), d: r3(d.site.d), prior: d.site.prior,
      decoyScore: r3(d.site.decoyScore), grade: temptGrade(d.site.prior), deep: d.deep ? 1 : 0,
      ...(d.depthSignals.length ? { depthSignals: d.depthSignals.join(",") } : {}),
      ...(d.formula ? { formula: d.formula } : {}),
      ...(d.flags.length ? { flags: d.flags.join(" / ") } : {}),
      ...extra,
    },
  };
}

// ── soft 블록(축자 템플릿) ──────────────────────────────────────────────────────────────

const where = (inv: Inventory, c: InvPair["site"]["c"]) => {
  const loc = locateOf(inv, c);
  return loc ? `문장 ${c.sentenceIdx + 1}, "${loc}" 속` : `문장 ${c.sentenceIdx + 1}`;
};

/**
 * PLANNER-SPEC §2 soft 블록. 줄 문구·순서는 스펙 템플릿 그대로이고 두 곳만 보강했다(보고서 gaps):
 *  (1) 자리 표면이 자기 문장에 2번 이상 나오면 "(문장 n, "<유일 문맥>" 속)" — 모델이 엉뚱한 등장을 짚지 않게.
 *  (2) jf 미끼 항목에 유혹도 등급, 다음 줄에 「이 중 4개 추천(문장 분산·범주 다양)」.
 */
export function buildSoftBlock(
  inv: Inventory,
  answers: InvPair[],
  decoys?: { list: InvDecoy[]; recommended: InvDecoy[] },
): string {
  const lines = [
    "## 사전 출제 포인트 분석 (참고 — 강제 아님)",
    '별도 문법 판정 모델이 이 지문의 후보 자리를 미리 검사했다. 아래 후보는 "틀리게 바꾸면 어떤 해석으로도 비문이 된다"는 판정을 통과한 자리다.',
    "정답 후보(우선순위순):",
    ...answers.map(
      (p, i) =>
        `${i + 1}. "${p.site.c.word}" (${where(inv, p.site.c)}) → 오형 제안 "${p.w.wrong}" · ${codeLabel(pairCategoryCode(p))} · 유효도 ${(p.pValid ?? 0).toFixed(2)}`,
    ),
  ];
  if (decoys && decoys.list.length) {
    const item = (d: InvDecoy) => `"${d.site.c.word}"(${codeLabel(d.site.code)}, ${where(inv, d.site.c)}, 유혹도 ${temptGrade(d.site.prior)})`;
    lines.push(`미끼 후보(유혹도 높은 순): ${decoys.list.map(item).join(" · ")}`);
    if (decoys.recommended.length) {
      lines.push(
        `이 중 ${decoys.recommended.length}개 추천(문장 분산·범주 다양): ${decoys.recommended.map((d) => `"${d.site.c.word}"(문장 ${d.site.c.sentenceIdx + 1})`).join(" · ")}`,
      );
    }
  }
  lines.push(
    "단 **자리 품질이 항상 우선**이다: 네 자리 조사에서 더 좋은 자리가 있으면 이 목록을 무시하고 네 1순위를 써라. 목록의 자리를 쓰더라도 다른 해석으로 문법적이 되지 않는지 다시 확인하라.",
  );
  return lines.join("\n");
}

/** hard 요약 블록(표시·기록용 — 오케스트레이터는 hard 에서 promptBlock 을 넣지 않고 teacherPoints 로 강제한다). */
export function buildHardBlock(inv: Inventory, answer: InvPair, decoys: InvDecoy[]): string {
  return [
    "## 사전 출제 포인트 (jev 지정 — 교사 포인트 채널로 강제)",
    `정답: "${answer.site.c.word}" (${where(inv, answer.site.c)}) → 오형 "${answer.w.wrong}" · ${codeLabel(pairCategoryCode(answer))} · 유효도 ${(answer.pValid ?? 0).toFixed(2)}`,
    `미끼: ${decoys.map((d) => `"${d.site.c.word}"(${codeLabel(d.site.code)}, ${where(inv, d.site.c)})`).join(" · ")}`,
  ].join("\n");
}
