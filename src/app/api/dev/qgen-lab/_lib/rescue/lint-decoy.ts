// 죽은 미끼 코드 린터 + 자리 분류(범주·구성·코드) — LAB/rescue/replay/lib/lint-decoy.mjs 의 축자 TS 이식. 순수 함수, LLM/jev 0콜.
// T1(교체 판정용, 고정밀) 구성은 replay eval-lint.mjs 가 Claude live 라벨로 규칙별 정밀도를 잰 뒤 고정한 것이다
// (LUNA_LOW_K 정밀도 0.871·재현율 0.409, 평가원 실물 미끼 오탐 0 — out/lint-eval.json). 규칙을 바꾸지 마라.
import { deadReasonsFor, extraPatterns, type DeadSite } from "./lint-dead-code";
import { BE, BOTH_OK, CONNECTIVE, DET, DO, HAVE, MODAL, PERS_SUBJ, PREP, PRON, REL, SKIP_ADV, TO_PREP_HEADS, adjShaped, isBaseVerb, isEdForm, isIng, isPP, nounNumber, verbNumber } from "./lint-lex";
import { attractorBetween, isFiniteTok, punctBetween, subjectOf, type SyntaxView, type VTok, type WordRange } from "./lint-syntax";

/** T1 = 고정밀 규칙(교체·하드 제외). */
export const T1_RULES = ["modalBase", "toBase", "havePP", "modalItself", "bothOk", "subjAdj0"] as const;
/** T2(새 미끼 후보 1차 제외용, 고재현) = T1 ∪ 아래. */
export const T2_EXTRA = ["connective", "article", "selfConfirm", "detAdj", "relAdjStrict", "pronRefStrict", "prepIng", "auxAdvPP", "toInf", "pronSubjVerb", "beAdj", "subjAdj1", "relAdj", "pronRef", "whToV", "noun"] as const;
const SPEC_CONNECTIVE = new Set(
  "however therefore moreover furthermore accordingly consequently thus hence instead meanwhile nevertheless including besides also even still just only very too often always never already soon then rather".split(" "),
);

/** 표시 좌표 밑줄(displayOf 결과의 mark). */
export interface DispMark {
  shown: string;
  dStart: number;
  dEnd: number;
  wr: WordRange | null;
}
/** 린트 입력 표시 문맥(item-model.ts displayOf 결과의 부분 집합). */
export interface DispContext {
  text: string;
  view: SyntaxView;
}

export interface DecoyLint {
  rules: Record<string, boolean>;
  t1: boolean;
  t1Rules: string[];
  t2: boolean;
  t2Rules: string[];
}

/** 앞 단어(부사 건너뜀) 인덱스. */
function prevSkipAdv(W: VTok[], k: number): number {
  let j = k - 1;
  while (j >= 0 && W[j].sid === W[k].sid && (SKIP_ADV.has(W[j].c) || (/ly$/.test(W[j].c) && W[j].c.length > 4))) j--;
  return j >= 0 && W[j].sid === W[k].sid ? j : -1;
}

/** 공백 토큰 좌표(dead-code 입력 형식): tokens = 표시 텍스트 공백 분할, tokenIndex = dStart 앞 토큰 수. */
function wsSite(disp: DispContext, m: DispMark): { tokens: string[]; site: DeadSite } {
  const tokens = disp.text.split(/\s+/).filter(Boolean);
  const before = disp.text.slice(0, m.dStart).split(/\s+/).filter(Boolean).length;
  const head = String(m.shown).trim().split(/\s+/)[0].replace(/[^A-Za-z'-]/g, "").toLowerCase();
  return { tokens, site: { label: "(X)", expr: m.shown, head, tokenIndex: before } };
}

const PR = new Set("it its itself they them their themselves he him his himself she her herself".split(" "));

/** 한 밑줄(표시 좌표)의 죽은 미끼 규칙. */
export function lintDecoy(disp: DispContext, m: DispMark): DecoyLint {
  const { view } = disp;
  const W = view.W;
  const r: Record<string, boolean> = {};
  if (!m.wr) return { rules: {}, t1: false, t1Rules: [], t2: false, t2Rules: [] };
  const k = m.wr.a;
  const head = W[k].c;
  const width = m.wr.b - m.wr.a + 1;
  const pj = prevSkipAdv(W, k);
  const prevW = pj >= 0 ? W[pj] : null;
  const prevRaw = k > 0 && W[k - 1].sid === W[k].sid && !punctBetween(view, k - 1, k).length ? W[k - 1] : null;
  const nx = W[m.wr.b + 1] && W[m.wr.b + 1].sid === W[k].sid ? W[m.wr.b + 1] : null;
  // ── 프로덕션 게이트 + dead-code extraPatterns(축자 재사용) ──
  const { tokens, site } = wsSite(disp, m);
  for (const reason of deadReasonsFor(site, tokens)) r[reason.split(":")[0]] = true; // article selfConfirm prepIng auxAdvPP
  const ex = extraPatterns(site, tokens, m.shown);
  for (const [key, v] of Object.entries(ex)) if (v) r[key] = true;
  // ── 스펙 §4.4 T1 보강(부사 건너뛰기·예외 목록) ──
  const base = isBaseVerb(head) && !/(s|ed|ing)$/.test(head);
  if (prevW && (MODAL.has(prevW.c) || DO.has(prevW.c)) && base) r.modalBase = true;
  if (prevRaw && prevRaw.c === "to" && base) {
    const g = W.slice(Math.max(0, k - 3), k - 1).map((t) => t.c);
    const exempt = TO_PREP_HEADS.some((h) => h.every((x, i) => g[g.length - h.length + i] === x));
    if (exempt) delete r.toBase;
    else r.toBase = true;
  }
  if (prevW && HAVE.has(prevW.c) && isPP(head)) r.havePP = true;
  if (MODAL.has(head) && width <= 2) r.modalItself = true;
  if (SPEC_CONNECTIVE.has(head) || (CONNECTIVE.has(head) && width === 1)) r.connective = true;
  // like 는 앞이 동사(felt/looks like)면 전치사 — 양형 허용 아님(실물 G 오탐 1건 수리)
  const likePrep = !!prevW && /^like[sd]?$/.test(prevW.c) && pj > 0 && ["V", "E", "AUX"].includes(W[pj - 1].tag);
  if (prevW && BOTH_OK.has(prevW.c) && !likePrep && (isIng(head) || head === "to")) r.bothOk = true;
  if (REL.has(head) && nx && nx.c === "to") r.whToV = true;
  if (W[k].tag === "N" && width === 1 && !isIng(head) && !isEdForm(head) && !verbNumber(head)) r.noun = true;
  // ── 과제 지정 추가 패턴 ──
  const vnum = verbNumber(head);
  const finiteSlot = vnum && (W[k].tag === "V" || W[k].tag === "AUX") && !W[k].inf && !W[k].afterAux && !(prevRaw && prevRaw.c === "to");
  if (finiteSlot) {
    const subj = subjectOf(view, k, vnum);
    if (subj && subj.num === vnum) {
      const attr = attractorBetween(view, subj.k, k, vnum);
      // 절 전체(주어 앞 포함, 같은 문장) 안 반대 수 명사도 없으면 strict
      let oppInClause = false;
      for (let j = k - 1; j >= Math.max(0, k - 8) && W[j].sid === W[k].sid; j--) if (W[j].head && nounNumber(W[j].c) && nounNumber(W[j].c) !== vnum) oppInClause = true;
      if (subj.dist === 0 && !attr && !oppInClause) r.subjAdj0 = true;
      if (subj.dist <= 1 && !attr) r.subjAdj1 = true;
    }
  }
  if (["who", "which", "that", "whom"].includes(head) && width === 1 && prevRaw && prevRaw.head && W[k].tag === "R") {
    r.relAdj = true;
    let other = false;
    for (let j = k - 2; j >= Math.max(0, k - 5) && W[j].sid === W[k].sid; j--) if (W[j].head && W[j].tag === "N") other = true;
    const gapClause = nx && (isFiniteTok(nx) || (nx.tag === "V" && !nx.inf));
    if (!other && gapClause && head !== "whom") r.relAdjStrict = true;
  }
  if (PR.has(head) && width === 1) {
    const want = ["they", "them", "their", "themselves"].includes(head) ? "pl" : "sg";
    const refs: number[] = [];
    for (let j = k - 1; j >= Math.max(0, k - 8) && W[j].sid === W[k].sid; j--) if (W[j].head && W[j].tag === "N" && nounNumber(W[j].c) === want) refs.push(j);
    if (refs.length >= 1) r.pronRef = true;
    if (refs.length === 1 && k - refs[0] <= 5) r.pronRefStrict = true;
  }
  const t1Rules: string[] = T1_RULES.filter((x) => r[x]);
  const t2Rules: string[] = [...t1Rules, ...T2_EXTRA.filter((x) => r[x])];
  return { rules: r, t1: t1Rules.length > 0, t1Rules, t2: t2Rules.length > 0, t2Rules };
}

export interface SiteClass {
  cat: string;
  config: string;
  code: string;
}

const OC = /^(let|lets|letting|make|makes|made|making|have|has|had|having|help|helps|helped|helping|see|sees|saw|watch|watches|watched|watching|hear|hears|heard|feel|feels|felt|notice|notices|noticed)$/;
const LINK = /^(be|is|are|was|were|been|being|seem|seems|seemed|become|becomes|became|remain|remains|remained|stay|stays|stayed|appear|appears|appeared|look|looks|looked|feel|feels|felt|sound|sounds|sounded|prove|proves|proved|keep|keeps|kept|make|makes|made|find|finds|found|leave|leaves|left|consider|considers|considered)$/;

/** 자리 분류 — picker 의 범주 제외·livePrior 구성 키·출력 code. */
export function classifySite(disp: DispContext, m: DispMark): SiteClass {
  const { view } = disp;
  const W = view.W;
  if (!m.wr) return { cat: "other", config: "other", code: "m" };
  const k = m.wr.a;
  const words = String(m.shown).trim().toLowerCase().split(/\s+/);
  const head = W[k].c;
  const last = W[m.wr.b].c;
  const prevRaw = k > 0 && W[k - 1].sid === W[k].sid ? W[k - 1] : null;
  const comma = prevRaw ? punctBetween(view, k - 1, k).some((p) => /[,;:]/.test(p)) : false;
  const pj = prevSkipAdv(W, k);
  const prevW = pj >= 0 ? W[pj] : null;
  if (words.length === 2 && words[0] === "to") return { cat: "infinitive", config: "to-inf", code: "k" };
  if (words.length === 2 && PREP.has(words[0]) && REL.has(words[1])) return { cat: "relative", config: "rel-prep", code: "b" };
  if (REL.has(head)) {
    let config = "rel-other";
    if (!prevRaw || comma) config = comma ? "rel-comma" : "rel-initial";
    else if (prevRaw.head && prevRaw.tag === "N") config = "rel-adj";
    else if (["V", "AUX", "P", "G", "E", "TO"].includes(prevRaw.tag) || ["what", "whether"].includes(head)) config = "rel-noun-clause";
    return { cat: "relative", config, code: "b" };
  }
  if (PRON.has(head) && !["this", "these", "those", "that"].includes(head)) return { cat: "pronoun", config: /sel(f|ves)$/.test(head) ? "pron-reflexive" : "pron", code: "g" };
  if (MODAL.has(head)) return { cat: "other", config: "modal", code: "a" };
  const vnum = verbNumber(head);
  if (prevRaw && prevRaw.c === "to" && isBaseVerb(head)) return { cat: "infinitive", config: "to-base", code: "k" };
  if (prevW && (MODAL.has(prevW.c) || DO.has(prevW.c)) && isBaseVerb(head)) return { cat: "finite", config: "modal-base", code: "a" };
  const ocAt = W.slice(Math.max(0, k - 4), k).filter((t) => t.sid === W[k].sid && OC.test(t.c)).map((t) => t.wi).pop();
  if (isBaseVerb(head) && !/(s|ed|ing)$/.test(head) && ocAt != null && !punctBetween(view, ocAt, k).length && prevRaw && ["PRN", "N"].includes(prevRaw.tag) && !comma)
    return { cat: "objcomp", config: "oc-bare", code: "h" };
  if (vnum && (W[k].tag === "V" || W[k].tag === "AUX") && !W[k].inf && !W[k].afterAux) {
    const subj = subjectOf(view, k, vnum);
    if (!subj) return { cat: "agreement", config: "agr-nosubj", code: "d" };
    const attr = attractorBetween(view, subj.k, k, vnum);
    const config = attr ? "agr-attractor" : subj.dist <= 1 ? "agr-adjacent" : "agr-distant";
    return { cat: "agreement", config, code: "d" };
  }
  if (isIng(last)) {
    if (prevW && BE.has(prevW.c)) return { cat: "voice", config: "be-ing", code: "e" };
    if (prevRaw && PREP.has(prevRaw.c) && !comma) return { cat: "participle", config: "prep-ing", code: "c" };
    if (comma) return { cat: "participle", config: "part-comma", code: "c" };
    if (!prevRaw) return { cat: "participle", config: "part-initial", code: "c" };
    if (prevRaw.head) return { cat: "participle", config: "part-postmod", code: "c" };
    if (["V", "AUX", "E"].includes(prevRaw.tag)) return { cat: "participle", config: "ing-after-verb", code: "c" };
    return { cat: "participle", config: "part-other", code: "c" };
  }
  if (isEdForm(last) && !/^(was|were|had|did)$/.test(last)) {
    if (prevW && BE.has(prevW.c)) return { cat: "voice", config: "be-pp", code: "e" };
    if (prevW && HAVE.has(prevW.c)) return { cat: "finite", config: "have-pp", code: "a" };
    if (comma || !prevRaw) return { cat: "participle", config: comma ? "part-comma" : "part-initial", code: "c" };
    if (prevRaw.head) return { cat: "participle", config: "part-postmod", code: "c" };
    return { cat: "finite", config: "ed-finite", code: "a" };
  }
  if (isBaseVerb(head) && prevRaw && ["and", "or"].includes(prevRaw.c)) return { cat: "parallel", config: "parallel", code: "i" };
  if (/ly$/.test(head) && head.length > 4) return { cat: "adjadv", config: "adv", code: "f" };
  if (adjShaped(head) || W[k].tag === "A") {
    if (prevW && LINK.test(prevW.c)) return { cat: "adjadv", config: "adj-complement", code: "f" };
    if (prevRaw && DET.has(prevRaw.c)) return { cat: "adjadv", config: "adj-attrib", code: "f" };
    return { cat: "adjadv", config: "adj-other", code: "f" };
  }
  if (["because", "despite", "although", "though", "while", "during", "unless", "whereas", "since", "like", "alike"].includes(head)) return { cat: "conj", config: "conj", code: "l" };
  if (["more", "most", "less", "least", "much", "very", "many", "few", "little", "fewer"].includes(head)) return { cat: "cmp", config: "cmp", code: "m" };
  if (PERS_SUBJ.has(head) || ["this", "these", "those", "that"].includes(head)) return { cat: "pronoun", config: "pron-demonstrative", code: "g" };
  if (W[k].tag === "N") return { cat: "other", config: "noun", code: "m" };
  return { cat: "other", config: "other", code: "m" };
}

/** T1 규칙 이름 → 비평 프롬프트 사유(한국어). */
export const T1_REASON_KO: Readonly<Record<string, string>> = {
  modalBase: "조동사·do 바로 뒤 동사원형이라 다른 형태가 성립하지 않는 자리",
  toBase: "to 바로 뒤 동사원형이라 다른 형태가 성립하지 않는 자리",
  havePP: "have 바로 뒤 과거분사라 다른 형태가 성립하지 않는 자리",
  modalItself: "조동사 자체라 경쟁 형태가 없는 자리",
  bothOk: "to부정사·동명사가 둘 다 가능한 동사 뒤라 판정이 갈리지 않는 자리",
  subjAdj0: "주어 바로 뒤 동사라 사이에 반대 수 명사가 없어 수일치가 즉시 확정되는 자리",
};
