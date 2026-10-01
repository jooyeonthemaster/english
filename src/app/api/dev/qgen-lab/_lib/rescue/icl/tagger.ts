// 구제 ICL 태거(RESCUE-SPEC §5.1) — 대상 지문의 "구조 군"을 코드로 검출한다(LLM·jev 0콜, 결정론).
// 검출 결과는 시연 검색(retrieve.ts)에만 쓰고 생성 프롬프트에는 넣지 않는다.
// 규칙은 스펙 §5.1 태거 10종의 휴리스틱 이식이다 — 정밀한 파서가 아니라 "이 지문에 이런 구조가 있는가"의 거친 신호.
// 토큰·어휘는 planners/candidates.ts(tokenizePassage · LEX_VERB/LEX_ADJ · BE/HAVE/DO/MODAL/REL/PREP/DET/PRON/IRREG)를 그대로 쓴다.
import {
  BE,
  DET,
  DO,
  HAVE,
  IRREG,
  LEX_ADJ,
  LEX_VERB,
  MODAL,
  PREP,
  PRON,
  REL,
  tokenizePassage,
  type LabToken,
} from "../../planners/candidates";

export const ICL_TAGS = [
  "NOUN_CLAUSE_INITIAL",
  "REL_COMPLETE",
  "PREP_REL",
  "LONG_AGREE",
  "PARALLEL",
  "PARTICIPLE",
  "FINITE",
  "PROFORM",
  "COMPLEMENT",
  "VOICE",
] as const;
export type IclTag = (typeof ICL_TAGS)[number];

/** 은행 정답 범주(시연 family). 스펙 §5.1 대응표의 이름판(d/b/a/c/i/e/h/대동사/g/f/k). */
export type IclFamily =
  | "agreement"
  | "relative"
  | "finite"
  | "participle"
  | "parallel"
  | "voice"
  | "complement"
  | "proform"
  | "pronoun"
  | "adjadv"
  | "infger"
  | "other";

/** family → 태거 구조 군(스펙 §5.1). 대응 군이 없는 family(pronoun·adjadv·infger·other)는 "family ∈ T" 가 항상 거짓. */
export const FAMILY_TAGS: Record<IclFamily, readonly IclTag[]> = {
  agreement: ["LONG_AGREE"],
  relative: ["REL_COMPLETE", "NOUN_CLAUSE_INITIAL", "PREP_REL"],
  finite: ["FINITE"],
  participle: ["PARTICIPLE"],
  parallel: ["PARALLEL"],
  voice: ["VOICE"],
  complement: ["COMPLEMENT"],
  proform: ["PROFORM"],
  pronoun: [],
  adjadv: [],
  infger: [],
  other: [],
};

/** 포인트코드(a~k) → family. 대동사는 코드가 없어 호출측이 proform 으로 덮어쓴다. */
export const CODE_FAMILY: Record<string, IclFamily> = {
  a: "finite",
  b: "relative",
  c: "participle",
  d: "agreement",
  e: "voice",
  f: "adjadv",
  g: "pronoun",
  h: "complement",
  i: "parallel",
  k: "infger",
};

export function familyInTags(family: IclFamily, tags: ReadonlySet<IclTag> | readonly IclTag[]): boolean {
  const set = tags instanceof Set ? tags : new Set(tags as readonly IclTag[]);
  return FAMILY_TAGS[family].some((t) => set.has(t));
}

export interface TagResult {
  /** 검출된 군(ICL_TAGS 순서). */
  tags: IclTag[];
  /** 군별 적중 수(설명·기록용). */
  counts: Record<IclTag, number>;
}

const set = (s: string) => new Set(s.split(/\s+/).filter(Boolean));
const SUBJ_PRON = set("i you he she it we they who which that");
const COORD = set("and or but nor yet so");
const SUBORD = set("because although though while when whenever if unless until since as whereas once before after whether");
const OC_VERB = set(
  "make makes made making keep keeps kept keeping find finds found finding leave leaves left leaving consider considers considered considering help helps helped helping let lets letting have has had having",
);
const NOT_ING = set("thing things something nothing anything everything during morning evening king ring spring string ceiling bring sing swing sting wing cling fling sling according including");
const NOT_ED = set("need needs seed feed speed indeed bed red hundred shed breed deed weed creed proceed exceed succeed bleed heed embed");
const CLAUSE_PUNCT = set(", ; : — ― – ( ) \" “ ” ! ?");

const isIng = (w: string) => w.length > 4 && w.endsWith("ing") && !NOT_ING.has(w);
const isEd = (w: string) => (w.length >= 4 && w.endsWith("ed") && !NOT_ED.has(w)) || IRREG.has(w);
const verbStemOfS = (w: string): string | null => {
  if (!w.endsWith("s") || w.length < 3 || w.endsWith("ss")) return null;
  const c = [w.slice(0, -1)];
  if (w.endsWith("es")) c.push(w.slice(0, -2));
  if (w.endsWith("ies")) c.push(w.slice(0, -3) + "y");
  return c.find((x) => LEX_VERB.has(x)) ?? null;
};
const isFunc = (w: string) => DET.has(w) || PREP.has(w) || PRON.has(w) || REL.has(w) || COORD.has(w) || SUBORD.has(w) || w === "to" || w === "not";

interface Tok {
  w: string;
  sid: number;
  /** 같은 문장 안에서 앞 토큰과의 사이에 구두점이 있는가(절 경계 근사). */
  punctBefore: boolean;
  /** 뒤따르는 구두점(있으면 첫 문자). */
  punctAfter: string | null;
}

function words(text: string): Tok[] {
  const { toks } = tokenizePassage(text);
  const out: Tok[] = [];
  let pendingPunct = false;
  let last: Tok | null = null;
  for (const t of toks as LabToken[]) {
    if (!t.isWord) {
      if (CLAUSE_PUNCT.has(t.w) || t.w === ",") {
        pendingPunct = true;
        if (last && last.punctAfter === null) last.punctAfter = t.w;
      }
      continue;
    }
    const tok: Tok = { w: t.lw.replace(/[’]/g, "'"), sid: t.sid, punctBefore: pendingPunct, punctAfter: null };
    if (last && last.sid !== tok.sid) tok.punctBefore = true;
    out.push(tok);
    last = tok;
    pendingPunct = false;
  }
  return out;
}

/** 정동사형(수·시제 표지가 있는 형태) 근사 — be/have/do/조동사, -s 동사, 주어 대명사 뒤 원형·과거형. */
function isFiniteAt(W: Tok[], k: number): boolean {
  const w = W[k].w;
  const prev = k > 0 && W[k - 1].sid === W[k].sid ? W[k - 1].w : null;
  if (["is", "are", "was", "were", "am", "has", "have", "had", "does", "do", "did"].includes(w) || MODAL.has(w)) {
    return !(prev === "to" || (prev !== null && MODAL.has(prev)));
  }
  if (prev && (DET.has(prev) || PREP.has(prev) || prev === "to")) return false;
  if (verbStemOfS(w)) return true;
  if (prev && SUBJ_PRON.has(prev) && (LEX_VERB.has(w) || isEd(w)) && !isIng(w)) return true;
  return false;
}

function sentences(W: Tok[]): Tok[][] {
  const out: Tok[][] = [];
  for (const t of W) {
    if (!out.length || out[out.length - 1][0].sid !== t.sid) out.push([]);
    out[out.length - 1].push(t);
  }
  return out;
}

/** 대상 지문 → 구조 군. 결정론(같은 지문은 같은 결과). */
export function tagPassage(text: string): TagResult {
  const counts = Object.fromEntries(ICL_TAGS.map((t) => [t, 0])) as Record<IclTag, number>;
  const W = words(text);
  for (const S of sentences(W)) {
    const n = S.length;
    const finIdx: number[] = [];
    for (let k = 0; k < n; k++) if (isFiniteAt(S, k)) finIdx.push(k);
    const connectors = S.filter((t, k) => k > 0 && (REL.has(t.w) || SUBORD.has(t.w) || (COORD.has(t.w) && t.w !== "and"))).length;
    const andCount = S.filter((t) => t.w === "and").length;
    // 1. 문두 명사절 What/That/Whether + 8토큰 안 정동사 + 정동사형 2개 이상
    if (["what", "that", "whether"].includes(S[0].w) && finIdx.some((k) => k >= 1 && k <= 8) && finIdx.length >= 2) {
      counts.NOUN_CLAUSE_INITIAL++;
    }
    for (let k = 0; k < n; k++) {
      const w = S[k].w;
      const prev = k > 0 ? S[k - 1].w : null;
      // 2. 문두가 아닌 관계사 + 같은 절(구두점 전)로 5토큰 이상
      if (k > 0 && REL.has(w) && !["if", "how", "why", "whether"].includes(w)) {
        let len = 0;
        for (let j = k + 1; j < n && !S[j].punctBefore; j++) len++;
        if (len >= 5) counts.REL_COMPLETE++;
      }
      // 3. 전치사 + which/whom
      if ((w === "which" || w === "whom") && prev && PREP.has(prev)) counts.PREP_REL++;
      // 4. 원거리 수일치: 수 표지 정동사 왼쪽 2~8토큰 안 전치사·관계사, 그 앞에 명사
      const numbered = ["is", "are", "was", "were", "has", "have", "does", "do"].includes(w) || !!verbStemOfS(w);
      if (numbered && finIdx.includes(k)) {
        for (let j = k - 2; j >= Math.max(1, k - 8); j--) {
          if (PREP.has(S[j].w) || REL.has(S[j].w)) {
            const before = S[j - 1].w;
            if (!isFunc(before) && !LEX_ADJ.has(before) && !verbStemOfS(before)) {
              counts.LONG_AGREE++;
              break;
            }
          }
        }
      }
      // 5. 병렬: and/or/but 뒤 3토큰 안 동사 후보가 4토큰 이상 앞의 같은 형태 동사와 짝
      if (["and", "or", "but"].includes(w)) {
        const shape = (x: string) => (isIng(x) ? "ing" : verbStemOfS(x) ? "s" : isEd(x) ? "ed" : LEX_VERB.has(x) ? "base" : null);
        for (let j = k + 1; j <= Math.min(n - 1, k + 3); j++) {
          const sh = shape(S[j].w);
          if (!sh || (sh === "base" && S[j - 1].w === "the")) continue;
          const paired = S.slice(0, Math.max(0, k - 3)).some((t, i) => shape(t.w) === sh && (sh !== "base" || S[i - 1]?.w === "to"));
          if (paired) {
            counts.PARALLEL++;
            break;
          }
        }
      }
      // 6. 분사구문: 문두 -ing/-ed + 8토큰 안 쉼표, 또는 완결 절 뒤 ", -ing/-ed"
      if (k === 0 && (isIng(w) || isEd(w)) && S.slice(0, 9).some((t) => t.punctAfter === ",")) counts.PARTICIPLE++;
      if (k > 0 && S[k].punctBefore && S[k - 1].punctAfter === "," && (isIng(w) || isEd(w)) && finIdx.some((f) => f < k)) {
        counts.PARTICIPLE++;
      }
      // 8. 대동사: do/does/did 뒤 원형 없음, 또는 as/than + do·be
      if (DO.has(w)) {
        const nx = S[k + 1]?.w === "not" ? S[k + 2] : S[k + 1];
        if (!nx || S[k].punctAfter || !(LEX_VERB.has(nx.w) && !verbStemOfS(nx.w) && !isIng(nx.w))) counts.PROFORM++;
      } else if ((prev === "as" || prev === "than") && BE.has(w)) counts.PROFORM++;
      // 9. 목적격보어: make/keep/find/leave/consider/help/let/have + ≤4토큰 + 형용사/-ed/-ing/원형
      if (OC_VERB.has(w) && !(HAVE.has(w) && S[k + 1] && (isEd(S[k + 1].w) || S[k + 1].w === "been"))) {
        for (let j = k + 2; j <= Math.min(n - 1, k + 5); j++) {
          const x = S[j].w;
          if (S[j].punctBefore) break;
          if (LEX_ADJ.has(x) || isEd(x) || isIng(x) || (LEX_VERB.has(x) && !verbStemOfS(x) && !isFunc(S[j - 1].w))) {
            counts.COMPLEMENT++;
            break;
          }
        }
      }
      // 10. 태: be + (부사) + -ed/-ing
      if (BE.has(w)) {
        const nx = S[k + 1] && /ly$/.test(S[k + 1].w) ? S[k + 2] : S[k + 1];
        if (nx && (isEd(nx.w) || isIng(nx.w))) counts.VOICE++;
      }
    }
    // 7. 정동사↔준동사: 연결어 없이 정동사형 2개 이상, 또는 절 첫 명사구 직후의 -ing/-ed
    if (finIdx.length >= 2 && connectors + andCount === 0) counts.FINITE++;
    for (let k = 0; k < n; k++) {
      const clauseStart = k === 0 || S[k].punctBefore || SUBORD.has(S[k - 1].w) || COORD.has(S[k - 1].w);
      if (!clauseStart) continue;
      let j = k;
      while (j < n && j < k + 5 && (DET.has(S[j].w) || LEX_ADJ.has(S[j].w))) j++;
      let nounEnd = -1;
      for (let m = j; m < n && m < j + 3; m++) {
        if (isFunc(S[m].w) || isFiniteAt(S, m) || isIng(S[m].w) || isEd(S[m].w)) break;
        nounEnd = m;
      }
      const nx = nounEnd >= 0 ? S[nounEnd + 1] : undefined;
      if (nx && !nx.punctBefore && (isIng(nx.w) || isEd(nx.w))) {
        counts.FINITE++;
        break;
      }
    }
  }
  return { tags: ICL_TAGS.filter((t) => counts[t] > 0), counts };
}
