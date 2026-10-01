// 구제 린트 경량 구문 휴리스틱 — LAB/rescue/replay/lib/syntax.mjs + calib/site-planner/data.mjs tokenize 의 축자 TS 이식.
// 파서 없이 규칙 태거(좌→우 1회)로 명사 머리·주어 핵·유인 명사·절 경계를 추정한다 [추론 휴리스틱].
// 토큰화는 data.mjs 정규식 분할 그대로다(planners/candidates.ts 의 sentenceSplit 판과 다르다 — 린트 보정이 이 분할로 측정됐다).
import {
  ARTICLE, BE, COORD, CONNECTIVE, DET, DO, HAVE, MODAL, PERS_SUBJ, PREP, PRON, REL, SKIP_ADV, SUBORD, ADV_OK,
  adjShaped, baseOfS, clean, isBaseVerb, isEdForm, isIng, LEX_ADJ, LEX_VERB, nounNumber, verbNumber, type Num,
} from "./lint-lex";

export interface VTok {
  i: number;
  w: string;
  lw: string;
  start: number;
  end: number;
  isWord: boolean;
  sid: number;
  id?: string;
  /** clean(w) */
  c: string;
  /** 단어 토큰 인덱스(단어만). */
  wi: number;
  /** D P C R AUX TO PRN POSS ADV NUM G E V A N */
  tag: string;
  head: boolean;
  inf?: boolean;
  afterAux?: boolean;
}

export interface VSentence {
  sid: number;
  start: number;
  end: number;
  text: string;
}

export interface SyntaxView {
  text: string;
  toks: VTok[];
  W: VTok[];
  sentences: VSentence[];
}

export interface WordRange {
  a: number;
  b: number;
}

/** data.mjs tokenize 축자 — 토큰(단어·구두점) + 문장 번호(정규식 분할). */
export function tokenizeLint(text: string): { toks: Omit<VTok, "c" | "wi" | "tag" | "head">[]; sentences: VSentence[] } {
  const sentStarts = [0];
  const sre = /[.!?]["”’')]*\s+(?=["“'‘(]?[A-Z])/g;
  let m: RegExpExecArray | null;
  while ((m = sre.exec(text))) sentStarts.push(m.index + m[0].length);
  const sentOf = (pos: number) => {
    let s = 0;
    for (let i = 0; i < sentStarts.length; i++) if (pos >= sentStarts[i]) s = i;
    return s;
  };
  const toks: Omit<VTok, "c" | "wi" | "tag" | "head">[] = [];
  const tre = /[A-Za-z]+(?:['’][A-Za-z]+)*|[0-9]+(?:[.,][0-9]+)*|[^\sA-Za-z0-9]/g;
  while ((m = tre.exec(text))) {
    const isWord = /[A-Za-z0-9]/.test(m[0][0]);
    toks.push({ i: toks.length, w: m[0], lw: m[0].toLowerCase(), start: m.index, end: m.index + m[0].length, isWord, sid: sentOf(m.index) });
  }
  let wi = 0;
  for (const t of toks) if (t.isWord) t.id = "T" + String(wi++).padStart(3, "0");
  const sentences = sentStarts.map((st, k) => ({
    sid: k,
    start: st,
    end: k + 1 < sentStarts.length ? sentStarts[k + 1] : text.length,
    text: "",
  }));
  for (const s of sentences) s.text = text.slice(s.start, s.end).trim();
  return { toks, sentences };
}

/** 표시 텍스트 → 뷰 {text, toks, W(단어 토큰, wi·tag), sentences}. */
export function makeView(text: string): SyntaxView {
  const P = tokenizeLint(text);
  const toks: VTok[] = P.toks.map((t) => ({ ...t, c: clean(t.w), wi: -1, tag: "", head: false }));
  const W = toks.filter((t) => t.isWord);
  W.forEach((t, k) => (t.wi = k));
  tagWords(W, toks);
  return { text, toks, W, sentences: P.sentences };
}

const punctBefore = (toks: VTok[], t: VTok): string | null => {
  const p = toks[t.i - 1];
  return p && !p.isWord ? p.w : null;
};

function punctBetween2(toks: VTok[], a: VTok, b: VTok): boolean {
  return toks.slice(a.i + 1, b.i).some((x) => !x.isWord && /[,;:()]/.test(x.w));
}
function peekTag(t: VTok): string {
  const w = t.c;
  if (PREP.has(w)) return "P";
  if (SUBORD.has(w) || COORD.has(w)) return "C";
  if (BE.has(w) || HAVE.has(w) || MODAL.has(w)) return "AUX";
  return "?";
}

function tagWords(W: VTok[], toks: VTok[]): void {
  for (let k = 0; k < W.length; k++) {
    const t = W[k];
    const w = t.c;
    const prev = k > 0 && W[k - 1].sid === t.sid ? W[k - 1] : null;
    const pb = punctBefore(toks, t);
    const prevTag = prev && !(pb && /[,;:()]/.test(pb)) ? prev.tag : null;
    // 부사 건너뛴 앞 태그(조동사+부사+원형)
    let pv = prev;
    while (pv && pv.tag === "ADV" && W[pv.wi - 1]?.sid === t.sid) pv = W[pv.wi - 1];
    // 부사를 건너뛴 앞 태그(주어 + 부사 + 동사: "Employees also need")
    const pvTag = pv && pv !== prev ? (punctBetween2(toks, pv, t) ? null : pv.tag) : prevTag;
    let tag: string;
    if (/^[0-9]/.test(t.w)) tag = "NUM";
    else if (/['’]s$/.test(t.w.toLowerCase()) && w.length > 2 && !["it's", "that's", "there's", "what's", "he's", "she's", "let's"].includes(w)) tag = "POSS";
    else if (w === "to") tag = "TO";
    else if (MODAL.has(w)) tag = "AUX";
    else if (BE.has(w) || HAVE.has(w) || DO.has(w)) tag = "AUX";
    else if (w === "that")
      tag =
        prevTag === "N" || prevTag === "PRN"
          ? "R"
          : W[k + 1]?.c === "of"
            ? "PRN"
            : prevTag && ["V", "AUX", "A", "E", "G", "ADV"].includes(prevTag)
              ? "C"
              : pb && /,/.test(pb)
                ? "R"
                : "D";
    else if (REL.has(w)) tag = "R";
    else if (PERS_SUBJ.has(w) || PRON.has(w)) tag = ["my", "his", "her", "its", "our", "their", "your"].includes(w) ? "D" : "PRN";
    else if (DET.has(w) || ["most", "more", "less", "least", "same"].includes(w)) tag = "D";
    else if (PREP.has(w)) tag = "P";
    else if (
      ["so", "as", "too"].includes(w) &&
      W[k + 1] &&
      W[k + 1].sid === t.sid &&
      (adjShaped(W[k + 1].c) || /(ing|ly)$/.test(W[k + 1].c) || ["much", "many", "few", "little", "well"].includes(W[k + 1].c))
    )
      tag = "ADV";
    else if (SUBORD.has(w) || COORD.has(w)) tag = "C";
    else if (CONNECTIVE.has(w) || SKIP_ADV.has(w) || ADV_OK.has(w) || (/ly$/.test(w) && w.length > 4 && !LEX_ADJ.has(w))) tag = "ADV";
    else if (pv && (pv.c === "to" || MODAL.has(pv.c) || DO.has(pv.c)) && isBaseVerb(w) && !/(ing|ed)$/.test(w)) {
      tag = "V";
      t.inf = pv.c === "to";
      t.afterAux = pv.c !== "to";
    } else if (isIng(w)) tag = prevTag === "D" || prevTag === "POSS" ? "N" : "G";
    else if (isEdForm(w)) tag = prevTag === "D" && !LEX_VERB.has(w.replace(/e?d$/, "")) ? "N" : "E";
    else if (baseOfS(w) && !LEX_ADJ.has(w)) {
      // -s: 주어(명사·대명사) 바로 뒤면 정동사, 한정사·형용사·전치사 뒤면 명사
      tag = prevTag && ["N", "PRN", "R"].includes(prevTag) && !["D", "POSS"].includes(prevTag) ? "V" : "N";
    } else if (
      isBaseVerb(w) &&
      !LEX_ADJ.has(w) &&
      !/s$/.test(w) &&
      pvTag &&
      (["N", "PRN"].includes(pvTag) || (pvTag === "R" && ["who", "which", "that"].includes(pv!.c))) &&
      (pvTag !== "PRN" || PERS_SUBJ.has(pv!.c) || ["these", "those"].includes(pv!.c))
    )
      tag = "V";
    else if (adjShaped(w) && !(W[k + 1] && W[k + 1].sid === t.sid && ["P", "C", "AUX"].includes(peekTag(W[k + 1])) && prevTag === "D")) tag = "A";
    else tag = "N";
    t.tag = tag;
  }
  // 명사 머리: N 뒤가 N 이 아니면 머리(복합명사 앞 요소는 수식어)
  for (let k = 0; k < W.length; k++) {
    const t = W[k];
    const nx = W[k + 1];
    t.head = (t.tag === "N" || t.tag === "PRN") && !(t.tag === "N" && nx && nx.sid === t.sid && nx.tag === "N" && !punctBefore(toks, nx));
  }
}

/** 오프셋 [start,end) 를 덮는 단어 토큰 범위 {a,b}(포함). 없으면 null. */
export function wordRange(view: SyntaxView, start: number, end: number): WordRange | null {
  const idx = view.W.filter((t) => t.start < end && t.end > start).map((t) => t.wi);
  return idx.length ? { a: idx[0], b: idx[idx.length - 1] } : null;
}
/** k1<k2 단어 사이 구두점 토큰 목록. */
export function punctBetween(view: SyntaxView, k1: number, k2: number): string[] {
  const a = view.W[k1];
  const b = view.W[k2];
  if (!a || !b) return [];
  return view.toks.slice(a.i + 1, b.i).filter((t) => !t.isWord).map((t) => t.w);
}
export const sameSent = (view: SyntaxView, k1: number, k2: number): boolean =>
  !!(view.W[k1] && view.W[k2] && view.W[k1].sid === view.W[k2].sid);

/** 명사구 머리 k 의 지배어(명사구 시작 바로 앞 토큰): {tag, c, punct} — 주어 자리 판정용. */
export function governorOf(view: SyntaxView, k: number): { tag: string; c: string | null; punct: string[]; npStart: number } {
  let s = k;
  while (s - 1 >= 0 && sameSent(view, s - 1, k) && ["A", "D", "POSS", "NUM", "N", "ADV"].includes(view.W[s - 1].tag) && !punctBetween(view, s - 1, s).length) s--;
  const pb = s > 0 ? punctBetween(view, s - 1, s) : [];
  if (s === 0 || !sameSent(view, s - 1, k)) return { tag: "START", c: null, punct: pb, npStart: s };
  if (pb.some((p) => /[,;:(—–-]/.test(p))) return { tag: "PUNCT", c: pb.join(""), punct: pb, npStart: s };
  const g = view.W[s - 1];
  return { tag: g.tag, c: g.c, punct: pb, npStart: s };
}
const SUBJ_GOV = new Set(["START", "PUNCT", "C", "R"]);
export const isFiniteTok = (t: VTok | undefined | null): boolean =>
  !!t &&
  ((t.tag === "AUX" && !["be", "been", "being", "having", "to"].includes(t.c)) ||
    (t.tag === "V" && !t.inf && !t.afterAux && verbNumber(t.c) !== null && !/ing$/.test(t.c)));

export interface SubjectGuess {
  k: number;
  via: "there" | "rel" | "np" | "clausal";
  dist: number;
  num: Num | null;
}

/** 동사 v(단어 인덱스)의 주어 핵 추정. fixNum = 맞는 형태의 수. */
export function subjectOf(view: SyntaxView, v: number, fixNum: Num | null = null): SubjectGuess | null {
  const W = view.W;
  const t = W[v];
  if (!t) return null;
  // there/here + be: 주어는 오른쪽
  const p1 = W[v - 1];
  if (p1 && sameSent(view, v - 1, v) && ["there", "here"].includes(p1.c)) {
    for (let k = v + 1; k < Math.min(W.length, v + 8) && sameSent(view, k, v); k++)
      if (W[k].head) return { k, via: "there", dist: k - v - 1, num: nounNumber(W[k].c) };
  }
  // 관계절 동사: 바로 앞(부사 건너뜀)이 who/which/that → 선행사
  let q = v - 1;
  while (q >= 0 && W[q].tag === "ADV" && sameSent(view, q, v)) q--;
  if (q >= 0 && sameSent(view, q, v) && ["who", "which", "that"].includes(W[q].c) && W[q].tag === "R") {
    for (let k = q - 1; k >= Math.max(0, q - 4) && sameSent(view, k, q); k--)
      if (W[k].head) return { k, via: "rel", dist: v - k - 1, num: nounNumber(W[k].c) };
  }
  const cands: SubjectGuess[] = [];
  for (let k = v - 1; k >= 0 && sameSent(view, k, v); k--) {
    const c = W[k];
    let isHead: boolean | "clausal" = c.head;
    // 문두·절두 동명사/명사절 주어
    if (!isHead && (c.tag === "G" || (c.tag === "R" && ["what", "whether", "how", "why"].includes(c.c)))) {
      const g = governorOf(view, k);
      if (SUBJ_GOV.has(g.tag) && g.tag !== "R") isHead = "clausal";
    }
    if (!isHead) continue;
    const g = governorOf(view, k);
    if (isHead !== "clausal" && !SUBJ_GOV.has(g.tag)) continue; // 전치사·동사·to 의 목적어
    // k 와 v 사이 첫 동사류가 정동사이고 사이에 관계사가 없으면 k 는 다른 절의 주어
    let other = false;
    let sawRel = false;
    for (let j = k + 1; j < v; j++) {
      if (W[j].tag === "R" || W[j].tag === "C") sawRel = true;
      if (isFiniteTok(W[j])) {
        if (!sawRel) other = true;
        break;
      }
    }
    if (other) continue;
    const num: Num | null = isHead === "clausal" ? "sg" : nounNumber(c.c);
    cands.push({ k, via: isHead === "clausal" ? "clausal" : "np", dist: v - k - 1, num });
  }
  if (!cands.length) return null;
  const match = fixNum ? cands.find((c) => c.num === fixNum) : null;
  return match ?? cands[0];
}

/** v 왼쪽 같은 절(최대 maxBack 단어) 안 가장 가까운 명사 머리·대명사. */
export function nearestNounLeft(
  view: SyntaxView,
  v: number,
  maxBack = 6,
): { k: number; num: Num | null; gap: number; blockers: string[]; c: string } | null {
  const W = view.W;
  for (let k = v - 1; k >= Math.max(0, v - maxBack) && sameSent(view, k, v); k--) {
    const t = W[k];
    if (t.tag === "C" && ["and", "or", "but"].includes(t.c) === false && SUBORD.has(t.c)) return null;
    if (t.head) {
      const between = W.slice(k + 1, v);
      const blockers = between.filter((x) => x.tag === "P" || x.tag === "R" || x.tag === "TO" || isFiniteTok(x)).map((x) => x.c);
      if (punctBetween(view, k, v).some((p) => /[,;:]/.test(p))) blockers.push(",");
      return { k, num: nounNumber(t.c), gap: v - k - 1, blockers, c: t.c };
    }
  }
  return null;
}

/** 주어 핵과 v 사이 유인 명사(수가 num 과 다른 명사 머리) 존재. */
export function attractorBetween(view: SyntaxView, subjK: number, v: number, num: Num | null): { k: number; c: string } | null {
  for (let k = subjK + 1; k < v; k++) {
    const t = view.W[k];
    if (t.head && nounNumber(t.c) && nounNumber(t.c) !== num) return { k, c: t.c };
  }
  return null;
}

/** 같은 문장 안 다른 정동사까지 최소 단어 거리(자기 자신 제외). */
export function nearestFiniteVerb(view: SyntaxView, v: number): { k: number; dist: number } | null {
  const W = view.W;
  let best: { k: number; dist: number } | null = null;
  for (let k = 0; k < W.length; k++) {
    if (k === v || !sameSent(view, k, v) || !isFiniteTok(W[k])) continue;
    const d = Math.abs(k - v) - 1;
    if (best === null || d < best.dist) best = { k, dist: d };
  }
  return best;
}
export { ARTICLE };
