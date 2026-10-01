// qgen-lab 후보 자리 추출(코드, LLM 0콜) — calib/site-planner/extract.mjs 의 TS 이식
// (+ data.mjs tokenize 의 토큰 규칙, score.mjs coarse 범주). 보정: 실물 정답 25/25·미끼 100/100 포함, 지문당 ~65 후보.
// 이식 차이는 하나 — 문장 경계를 data.mjs 정규식 대신 planners/index.ts sentenceSplit(리포 정본 분할기)으로 잡는다
// (labChecks 의 문장 인덱스와 맞추기 위해). 평가 25지문은 두 분할이 같아 후보 집합이 동일하다(plncore-test 로 확인).
// 코퍼스 유도 어휘는 lexicon.json(calib 복사본) import — 런타임에 passages.json 을 읽지 않는다.
import LEXICON from "./lexicon.json";
import { sentenceIndexAt, sentenceSplit, type LabSentence } from "./index";

export type CandTag =
  | "aux/finite" | "ed/pp" | "ing" | "verb-s" | "to-inf" | "verb-base"
  | "rel" | "pron" | "adv-ly" | "adj" | "cmp" | "conj";

/** score.mjs coarse — 후보 거친 범주. */
export type CoarseKind = "rel" | "to-inf" | "ing" | "ed/pp" | "verb" | "pron" | "adj/adv" | "other";

export interface SiteCandidate {
  /** 단어 토큰 id(T000…, extract.mjs tokId) — jev 질문 키로도 쓴다. */
  id: string;
  /** 원문 표면(자리 span 전체: "to limit", "in which" 등). */
  word: string;
  /** 원문 오프셋 [start, end). */
  start: number;
  end: number;
  sentenceIdx: number;
  /** 자리가 든 문장(공백 접힘), 대상만 ⟦ ⟧. */
  marked_sentence: string;
  kind: CoarseKind;
  tags: CandTag[];
  /** span 단어 토큰 id(정렬). */
  tokenIds: string[];
  /** 앞 6·뒤 6 단어 문맥(같은 문장), 대상 ⟦ ⟧. */
  ctx: string;
  /** 단어 토큰 배열 안 위치(extract.mjs c.idx). */
  tokenIndex: number;
}

export interface LabToken {
  i: number;
  w: string;
  lw: string;
  start: number;
  end: number;
  isWord: boolean;
  sid: number;
  id?: string;
}

export interface TokenizedPassage {
  text: string;
  toks: LabToken[];
  sentences: LabSentence[];
}

const set = (s: string) => new Set(s.split(/\s+/).filter(Boolean));
export const BE = set("am is are was were be been being");
export const HAVE = set("have has had having");
export const DO = set("do does did");
export const MODAL = set("can could will would shall should may might must");
export const REL = set("which that what who whom whose where when whether if how why whatever whichever whoever wherever whenever");
export const PRON = set("it its itself they them their theirs themselves those this these one ones he him his himself she her herself we us our ourselves you your yourself yourselves me my myself");
export const CONJ = set("because despite although though while during as like unless whereas since until");
export const CMP = set("more most less least fewer much very far even many few little");
export const DET = set("the a an this these those my his her its our their your some many few several all both each every no any such another other");
export const PREP = set("of in on at by for with from into onto about over under between among through without within across against toward towards upon behind beyond around along");
const LINK = set("be is are was were been being am seem seems seemed become becomes became remain remains remained look looks looked sound sounds sounded feel feels felt appear appears appeared stay stays stayed prove proves proved grow grows grew get gets got turn turns turned");
const OC_VERB = set("make makes made making find finds found keep keeps kept leave leaves left consider considers considered render renders rendered call calls called");
const NOT_ING = set("thing things something nothing anything everything during morning evening king ring spring string ceiling bring sing swing sting wing cling fling sling");
const NOT_LY = set("only family early likely friendly lonely costly lively deadly holy ugly silly reply supply apply rely ally italy july fly belly jelly bully");
export const IRREG = set(`arose awoke was were bore born beat beaten became begun began bent bet bound bit bitten bled blew blown broke broken bred brought built burnt bought caught chose chosen came clung cost crept cut dealt dug did done drew drawn dreamt drank drunk drove driven ate eaten fell fallen fed felt fought found fled flung flew flown forbade forbidden forgot forgotten forgave forgiven froze frozen got gotten gave given went gone ground grew grown hung had heard hid hidden hit held hurt kept knelt knew known laid led leant leapt learnt left lent let lay lain lit lost made meant met paid put quit read rode ridden rang rung rose risen ran said saw seen sought sold sent set shook shaken shed shone shot shown showed shrank shut sang sung sank sunk sat slept slid slung spoke spoken sped spent spun spread sprang stood stole stolen stuck stung stank strode struck strung strove swore sworn swept swam swum swung took taken taught tore torn told thought threw thrown thrust trod understood undertook undertaken woke woken wore worn wove woven wept won wound withdrew withdrawn wrote written overcame overcome overtook overtaken undergone underwent forgone foresaw foreseen misunderstood`);
// 빈도부사·-ly 부사·주어 대명사 바로 뒤의 사전 밖 원형 동사 보강(extract.mjs ADVV).
const ADVV = ["sometimes", "often", "always", "never", "also", "still", "usually", "rarely", "seldom", "just", "then", "thus", "therefore", "actually", "ultimately", "eventually", "typically", "generally", "they", "we", "you", "i", "who"];
const LINK_EXTRA = ["so", "too", "very", "more", "most", "less", "as", "how"];

export const LEX_VERB: ReadonlySet<string> = new Set(LEXICON.verb);
export const LEX_ADJ: ReadonlySet<string> = new Set(LEXICON.adj);

/** data.mjs tokenize 의 토큰 규칙 + sentenceSplit 문장 번호. 단어 토큰만 id(T000…). */
export function tokenizePassage(text: string): TokenizedPassage {
  const sentences = sentenceSplit(text);
  const lastIdx = Math.max(0, sentences.length - 1);
  const toks: LabToken[] = [];
  const tre = /[A-Za-z]+(?:['’][A-Za-z]+)*|[0-9]+(?:[.,][0-9]+)*|[^\sA-Za-z0-9]/g;
  let m: RegExpExecArray | null;
  while ((m = tre.exec(text))) {
    const isWord = /[A-Za-z0-9]/.test(m[0][0]);
    const sid = sentenceIndexAt(sentences, m.index) ?? lastIdx;
    toks.push({ i: toks.length, w: m[0], lw: m[0].toLowerCase(), start: m.index, end: m.index + m[0].length, isWord, sid });
  }
  let wi = 0;
  for (const t of toks) if (t.isWord) t.id = "T" + String(wi++).padStart(3, "0");
  return { text, toks, sentences };
}

function verbStemOfS(w: string, V: ReadonlySet<string>): string | null {
  if (!w.endsWith("s") || w.length < 3 || w.endsWith("ss")) return null;
  const cands = [w.slice(0, -1)];
  if (w.endsWith("es")) cands.push(w.slice(0, -2));
  if (w.endsWith("ies")) cands.push(w.slice(0, -3) + "y");
  return cands.find((c) => V.has(c)) || null;
}

/** score.mjs coarse(c) 이식. */
export function coarseKind(tags: readonly string[]): CoarseKind {
  const t = tags;
  if (t.includes("rel")) return "rel";
  if (t.includes("to-inf")) return "to-inf";
  if (t.includes("ing")) return "ing";
  if (t.includes("ed/pp") && !t.includes("aux/finite")) return "ed/pp";
  if (t.some((x) => ["aux/finite", "verb-s", "verb-base"].includes(x))) return "verb";
  if (t.includes("pron")) return "pron";
  if (t.includes("adj") || t.includes("adv-ly")) return "adj/adv";
  return "other";
}

interface RawCand {
  tokId: string;
  sid: number;
  w: string;
  tags: CandTag[];
  span: Set<string>;
}

/**
 * 후보 추출(extract.mjs extractCandidates 이식). 토큰 순서로 반환.
 * variant: 'full'(재현율 우선, 기본) | 'lean'(조동사 바로 뒤 원형 단독 후보 제외 — 보정 비교용)
 */
export function extractCandidates(
  passageText: string,
  opts: { variant?: "full" | "lean" } = {},
): SiteCandidate[] {
  const variant = opts.variant ?? "full";
  const P = tokenizePassage(passageText);
  const V = LEX_VERB;
  const A = LEX_ADJ;
  const W = P.toks.filter((t) => t.isWord);
  const byId = new Map<string, RawCand>();
  const add = (t: LabToken, tag: CandTag, spanToks?: LabToken[]) => {
    let c = byId.get(t.id!);
    if (!c) byId.set(t.id!, (c = { tokId: t.id!, sid: t.sid, w: t.w, tags: [], span: new Set() }));
    if (!c.tags.includes(tag)) c.tags.push(tag);
    for (const s of spanToks || [t]) c.span.add(s.id!);
  };
  for (let k = 0; k < W.length; k++) {
    const t = W[k];
    const lw = t.lw;
    const prev = W[k - 1]?.sid === t.sid ? W[k - 1] : null;
    const next = W[k + 1]?.sid === t.sid ? W[k + 1] : null;
    const pl = prev?.lw;
    if (BE.has(lw) || HAVE.has(lw) || DO.has(lw) || MODAL.has(lw)) add(t, "aux/finite");
    if (IRREG.has(lw) || (lw.endsWith("ed") && lw.length >= 4)) add(t, "ed/pp");
    if (lw.endsWith("ing") && lw.length > 4 && !NOT_ING.has(lw)) add(t, "ing");
    const sStem = verbStemOfS(lw, V);
    if (sStem && !(pl && DET.has(pl))) add(t, "verb-s");
    const bareByContext =
      !!pl &&
      (ADVV.includes(pl) || (pl.endsWith("ly") && pl.length > 4)) &&
      !DET.has(lw) && !PREP.has(lw) && !REL.has(lw) && !PRON.has(lw) &&
      !BE.has(lw) && !HAVE.has(lw) && !MODAL.has(lw) && !/(ly|ing|ed)$/.test(lw);
    // 기능어 제외(코퍼스 유도 오류: the→thing, to/but/not 등 — extract.mjs 사후 수리분 유지)
    const FUNC =
      lw === "to" || lw === "and" || lw === "or" || lw === "but" || lw === "nor" || lw === "not" ||
      lw === "out" || lw === "own" || lw === "well" || lw === "even" || DET.has(lw) || PREP.has(lw) || PRON.has(lw);
    if ((V.has(lw) || bareByContext) && !FUNC && !(pl && (DET.has(pl) || PREP.has(pl)))) {
      if (pl === "to") add(t, "to-inf", [prev!, t]);
      else add(t, "verb-base");
    }
    if (REL.has(lw)) {
      if (pl && PREP.has(pl) && (lw === "which" || lw === "whom")) add(t, "rel", [prev!, t]);
      else add(t, "rel");
    }
    if (PRON.has(lw)) add(t, "pron");
    if (lw.endsWith("ly") && lw.length > 4 && !NOT_LY.has(lw)) add(t, "adv-ly");
    const adjLike = A.has(lw) || /(ible|able|ful|ous|ive|less|ical|ary)$/.test(lw);
    if (adjLike && !V.has(lw) && !DET.has(lw)) {
      const p2 = W[k - 2]?.sid === t.sid ? W[k - 2].lw : null;
      const p3 = W[k - 3]?.sid === t.sid ? W[k - 3].lw : null;
      const afterLink = !!pl && (LINK.has(pl) || /ly$/.test(pl) || LINK_EXTRA.includes(pl));
      const oc = [pl, p2, p3].some((x) => !!x && OC_VERB.has(x));
      const nounNext =
        !!next && !A.has(next.lw) && !PREP.has(next.lw) && next.lw !== "and" && next.lw !== "than" && next.lw !== "to";
      if (afterLink || oc || !nounNext) add(t, "adj");
    }
    if (CMP.has(lw) || (lw.endsWith("er") && next?.lw === "than")) add(t, "cmp");
    if (CONJ.has(lw)) add(t, "conj");
  }
  let cands = [...byId.values()].map((c) => ({ ...c, span: [...c.span].sort() }));
  const widx = new Map(W.map((x, i) => [x.id!, i]));
  if (variant === "lean") {
    cands = cands.filter(
      (c) => !(c.tags.length === 1 && c.tags[0] === "verb-base" && MODAL.has(W[(widx.get(c.tokId) ?? 0) - 1]?.lw ?? "")),
    );
  }
  return cands.map((c) => {
    const k = widx.get(c.tokId)!;
    const s0 = P.sentences[c.sid];
    const spanIdx = c.span.map((id) => widx.get(id)!);
    const a = Math.min(...spanIdx);
    const b = Math.max(...spanIdx);
    const left = W.slice(Math.max(0, a - 6), a).filter((x) => x.sid === c.sid).map((x) => x.w).join(" ");
    const right = W.slice(b + 1, b + 7).filter((x) => x.sid === c.sid).map((x) => x.w).join(" ");
    const surface = P.text.slice(W[a].start, W[b].end);
    const ctx = `${left ? "…" + left + " " : ""}⟦${surface}⟧${right ? " " + right + "…" : ""}`;
    // 문장 안에서 대상 표시(문자 좌표 기반 — extract.mjs 와 같은 계산)
    const seg = P.text.slice(s0.start, s0.end);
    const off = W[a].start - s0.start - (seg.length - seg.trimStart().length);
    const raw = seg.trim();
    const marked = (raw.slice(0, off) + "⟦" + surface + "⟧" + raw.slice(off + surface.length)).replace(/\s+/g, " ");
    return {
      id: c.tokId,
      word: surface,
      start: W[a].start,
      end: W[b].end,
      sentenceIdx: c.sid,
      marked_sentence: marked,
      kind: coarseKind(c.tags),
      tags: c.tags,
      tokenIds: c.span,
      ctx,
      tokenIndex: k,
    };
  });
}

/** 후보가 원문 구간 [start,end) 와 겹치는가(gold·계획 자리 대조용). */
export function candidateOverlaps(c: Pick<SiteCandidate, "start" | "end">, start: number, end: number): boolean {
  return c.start < end && c.end > start;
}
