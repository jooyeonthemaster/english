// 죽은 미끼 코드 신호 — LAB/rescue/rm/dead-code.mjs 의 축자 TS 이식(lint-decoy.ts 가 쓴다).
// (1) 프로덕션 게이트 gate-grammar-killer-decoys.ts deadReasons 축자 재구현(사유 문자열만 영문 코드)
// (2) 추가 국소 강제 패턴(to+원형·조동사+원형·전치사+ing·have+pp·한정사+형용사·인접 주어+정동사·be+분사/형용사) [추론 휴리스틱].
// 이 모듈의 형태 판정(isPP·isIng·isBaseVerb·adjShaped)은 lint-lex.ts 와 **일부러 다르다**(dead-code.mjs 원본 그대로 —
// replay 의 T1 정밀도가 이 조합으로 측정됐다). 통일하지 마라.
import LEXICON from "../planners/lexicon.json";

const VERB: ReadonlySet<string> = new Set(LEXICON.verb);
const ADJ: ReadonlySet<string> = new Set(LEXICON.adj);
const set = (s: string): ReadonlySet<string> => new Set(s.split(/\s+/).filter(Boolean));

// ── (1) 프로덕션 상수(gate-grammar-killer-decoys.ts:57-94 축자) ──
const SELF_CONFIRM_WINDOW = 30;
const ARTICLES = new Set(["a", "an", "the"]);
const PREPOSITIONS = new Set(["by", "of", "in", "on", "at", "for", "with", "from", "about", "through", "after", "before", "without", "into", "upon", "despite", "besides", "via"]);
const AUXILIARIES = new Set(["is", "are", "was", "were", "be", "been", "being", "am", "has", "have", "had", "do", "does", "did", "will", "would", "can", "could", "may", "might", "shall", "should", "must"]);
const SELF_CONFIRM_STOPWORDS = new Set([
  "having", "being", "doing", "making", "taking", "giving", "using", "become", "becomes", "became", "through", "without", "between",
  "because", "although", "however", "people", "things", "something", "someone", "another", "others", "before", "during", "within",
  "toward", "towards", "around", "across", "against", "result", "results", "number", "numbers", "system", "systems", "process", "processes",
]);
export const cleanToken = (w: unknown): string => String(w ?? "").replace(/[^A-Za-z'-]/g, "").toLowerCase();

export interface DeadSite {
  label: string;
  expr: string;
  head: string;
  tokenIndex: number;
}

/** gate deadReasons 축자 — 사유 코드: article / selfConfirm / prepIng / auxAdvPP. */
export function deadReasonsFor(site: DeadSite, tokens: string[]): string[] {
  const reasons: string[] = [];
  const { head, tokenIndex: i } = site;
  if (!head) return reasons;
  const prev = i > 0 ? cleanToken(tokens[i - 1] ?? "") : "";
  const next = cleanToken(tokens[i + 1] ?? "");
  if (ARTICLES.has(prev)) reasons.push(`article:${prev}`);
  const isReflexive = /(?:self|selves)$/.test(head);
  if (isReflexive || (head.length >= 6 && !SELF_CONFIRM_STOPWORDS.has(head))) {
    let near = 0;
    for (let k = 0; k < tokens.length; k += 1) {
      if (k === i) continue;
      if (Math.abs(k - i) > SELF_CONFIRM_WINDOW) continue;
      if (cleanToken(tokens[k] ?? "") === head) near += 1;
    }
    if (near >= 1) reasons.push(`selfConfirm:${head}`);
  }
  if (PREPOSITIONS.has(prev) && /ing$/.test(head)) reasons.push(`prepIng:${prev}`);
  if (/ly$/.test(head) && AUXILIARIES.has(prev) && /(?:ed|en)$/.test(next)) reasons.push(`auxAdvPP:${prev}_${next}`);
  return reasons;
}

// ── (2) 추가 패턴 ──
const MODALS = set("can could will would shall should may might must do does did cannot");
const HAVE = set("have has had having");
const BE = set("be is are was were been being am");
const LINKV = set("seem seems seemed become becomes became remain remains remained appear appears appeared stay stays stayed");
const PREP_BROAD = set(
  "by of in on at for with from about through after before without into upon despite besides via like against toward towards among over under between within across beyond around along behind instead",
);
const DET = set("the a an this these those my his her its our their your some many few several all both each every no any such another other");
const SUBJ_PRON = set("he she it they we i you this that these those who which there one");
const FUNC = set(
  "the a an and or but of in on at by for with from to into as than that which who whom whose what when where why how if whether because although though while since until unless so not no very too also only just even still already often always never ever more most less least much many few little such then there here it its they them their he him his she her we us our you your i me my this these those some any each every all both either neither is are was were be been being am has have had do does did can could will would shall should may might must",
);
const IRREG_PP = set(
  "born beaten become begun bent bound bitten bled blown broken bred brought built burnt bought caught chosen come clung cost crept cut dealt dug done drawn dreamt drunk driven eaten fallen fed felt fought found fled flung flown forbidden forgotten forgiven frozen got gotten given gone ground grown hung had heard hidden hit held hurt kept knelt known laid led leant leapt learnt left lent let lain lit lost made meant met paid put quit read ridden rung risen run said seen sought sold sent set shaken shed shone shot shown shrunk shut sung sunk sat slept slid slung spoken sped spent spun spread sprung stood stolen stuck stung stunk struck strung sworn swept swum swung taken taught torn told thought thrown thrust trodden understood undertaken woken worn woven wept won wound withdrawn written overcome overtaken undergone foreseen misunderstood",
);
const BASE_EXTRA = set(
  "be have do go make take give get come see know think find say keep let put run set show tell feel leave bring begin seem help turn start hold stand hear play move live believe happen provide sit lose pay meet include continue learn change lead understand watch follow stop create speak read spend grow open walk win offer remember love consider appear buy wait serve die send expect build stay fall cut reach kill remain suggest raise pass sell require report decide pull",
);
const FINITE_AUX = set("is are was were has have does do");
const isPP = (w: string) => IRREG_PP.has(w) || (/(ed|en)$/.test(w) && w.length >= 4);
const isIng = (w: string) => /ing$/.test(w) && w.length > 4;
const isBaseVerb = (w: string) => VERB.has(w) || BASE_EXTRA.has(w);
const adjShaped = (w: string) => ADJ.has(w) || /(ive|ous|able|ible|al|ful|less|ic|ent|ant|ary)$/.test(w);
const finiteShaped = (w: string) =>
  FINITE_AUX.has(w) ||
  (/[^s]s$/.test(w) && w.length > 3 && (VERB.has(w.replace(/es$/, "")) || VERB.has(w.replace(/s$/, "")) || VERB.has(w.replace(/ies$/, "y"))));

export type ExtraPatterns = Record<"toBase" | "toInf" | "modalBase" | "prepIng" | "havePP" | "detAdj" | "pronSubjVerb" | "beAdj", 0 | 1>;

/** 한 밑줄의 국소 강제 패턴(참/거짓). expr = 밑줄 표현 전체. */
export function extraPatterns(site: DeadSite, tokens: string[], expr: string): ExtraPatterns {
  const i = site.tokenIndex;
  const w = String(expr ?? site.expr ?? "").trim().split(/\s+/).filter(Boolean).map(cleanToken);
  const head = w[0] ?? "";
  const prev = i > 0 ? cleanToken(tokens[i - 1] ?? "") : "";
  const prevRaw = i > 0 ? String(tokens[i - 1] ?? "") : "";
  const after = cleanToken(tokens[i + w.length] ?? "");
  const b = (x: boolean): 0 | 1 => (x ? 1 : 0);
  const prevIsSubjPron = SUBJ_PRON.has(prev);
  const prevIsContent = !!prev && !FUNC.has(prev) && !PREP_BROAD.has(prev) && !/ly$/.test(prev) && !/[,;:]$/.test(prevRaw);
  return {
    // to + 동사원형(밑줄이 원형 1단어, 바로 앞이 to)
    toBase: b(prev === "to" && !isIng(head) && !/ed$/.test(head) && isBaseVerb(head)),
    // 밑줄이 "to V" 형태(to부정사 자체 — 앞 명사/형용사가 형태를 정함: ability to, enough to)
    toInf: b(head === "to" && w.length >= 2 && isBaseVerb(w[1])),
    // 조동사·do + 원형
    modalBase: b(MODALS.has(prev) && isBaseVerb(head) && !/(ing|ed|s)$/.test(head)),
    // 전치사 + -ing (프로덕션보다 넓은 전치사 목록)
    prepIng: b(PREP_BROAD.has(prev) && isIng(head)),
    // have + p.p. (they've 포함)
    havePP: b((HAVE.has(prev) || /'ve$/.test(prev)) && isPP(head)),
    // 한정사 + 형용사/분사형 형용사 + 명사(한정 용법 — 문장 판단 없음)
    detAdj: b(DET.has(prev) && (adjShaped(head) || isIng(head) || /ed$/.test(head)) && !!after && !FUNC.has(after)),
    // 인접 주어(대명사 또는 내용어) + 정동사 형태(수일치 판정이 한 칸 거리)
    pronSubjVerb: b((prevIsSubjPron || prevIsContent) && finiteShaped(head) && w.length === 1),
    // be/연결동사 + 분사(수동·진행) 또는 형용사 보어
    beAdj: b((BE.has(prev) || LINKV.has(prev)) && (isPP(head) || isIng(head) || adjShaped(head))),
  };
}
