// 정답 린트 — answerFamily · R-lint(인지형 정답) · 코드 단서 거리 · depthClass · 선행사 모호.
// LAB/rescue/replay/lib/lint-answer.mjs 의 축자 TS 이식(검증: diagnosis answerSites 120곳 대조 R 정밀도 0.833·재현율 0.714,
// 거리 ≥5 일치 0.81 — out/lint-eval.json). 규칙을 바꾸지 마라. D7 면제 쌍은 verify.ts isProFormPair 를 쓴다(호출측).
import { BE, DET, HAVE, LEX_ADJ, MODAL, PERS_SUBJ, PREP, PRON, REL, adjShaped, baseOfS, isBaseVerb, isEdForm, isIng, isSToggle, nounNumber, verbNumber } from "./lint-lex";
import type { DispContext, DispMark } from "./lint-decoy";
import { attractorBetween, governorOf, isFiniteTok, nearestFiniteVerb, nearestNounLeft, punctBetween, subjectOf, type SyntaxView, type VTok } from "./lint-syntax";

const toks = (s: string) => String(s ?? "").toLowerCase().replace(/[’]/g, "'").replace(/[^a-z' ]/g, " ").split(/\s+/).filter(Boolean);

/** 공통 앞뒤 제거 후 바뀐 토큰 {a:shown쪽, b:fix쪽, i:앞 공통 수}. */
export function diffTokens(shown: string, fix: string): { a: string[]; b: string[]; i: number; A: string[]; B: string[] } {
  const a = toks(shown);
  const b = toks(fix);
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  let j = 0;
  while (j < a.length - i && j < b.length - i && a[a.length - 1 - j] === b[b.length - 1 - j]) j++;
  return { a: a.slice(i, a.length - j), b: b.slice(i, b.length - j), i, A: a, B: b };
}

const AGR_PAIRS = [["is", "are"], ["was", "were"], ["has", "have"], ["does", "do"]];
const PROVERB = new Set(["do", "does", "did"]);
const AUXB = new Set(["is", "are", "was", "were", "am", "be", "has", "have", "had"]);
const finiteLike = (w: string) => !!verbNumber(w) || AUXB.has(w) || PROVERB.has(w) || MODAL.has(w) || (isEdForm(w) && !isIng(w));

export type AnswerFamily =
  | "agreement" | "relative" | "proform" | "pronoun" | "adjadv" | "finite" | "infinitive" | "voice" | "participle" | "parallel" | "other";

/** 정답 범주(스펙 §4.4 answerFamily + infinitive/voice). */
export function answerFamily(shown: string, fix: string): AnswerFamily {
  const { a, b, A, B } = diffTokens(shown, fix);
  const x = a.join(" ");
  const y = b.join(" ");
  if (a.length === 1 && b.length === 1) {
    if (AGR_PAIRS.some(([p, q]) => (x === p && y === q) || (x === q && y === p)) || isSToggle(x, y)) return "agreement";
  }
  if ([...a, ...b].some((w) => REL.has(w)) && ![...a, ...b].some((w) => PERS_SUBJ.has(w))) return "relative";
  if ([...a, ...b].every((w) => PREP.has(w)) && [...A, ...B].some((w) => REL.has(w))) return "relative";
  if ((a.some((w) => PROVERB.has(w)) && b.length && b.every((w) => AUXB.has(w))) || (b.some((w) => PROVERB.has(w)) && a.length && a.every((w) => AUXB.has(w)))) return "proform";
  if ([...a, ...b].some((w) => PRON.has(w))) return "pronoun";
  if (
    a.length === 1 &&
    b.length === 1 &&
    (x === y + "ly" ||
      y === x + "ly" ||
      x.replace(/ily$/, "y") === y ||
      y.replace(/ily$/, "y") === x ||
      (/ly$/.test(x) !== /ly$/.test(y) && (adjShaped(x) || adjShaped(y) || LEX_ADJ.has(x) || LEX_ADJ.has(y))))
  )
    return "adjadv";
  if (A[0] === "to" || B[0] === "to" || a.includes("to") || b.includes("to")) return b.some(finiteLike) || a.some(finiteLike) ? "finite" : "infinitive";
  if (a.includes("been") || b.includes("been") || (a.length !== b.length && [...a, ...b].some((w) => BE.has(w)))) return "voice";
  const ha = a[a.length - 1] ?? "";
  const hb = b[b.length - 1] ?? "";
  if ((isIng(ha) && isEdForm(hb)) || (isEdForm(ha) && isIng(hb))) return "participle";
  if ((finiteLike(ha) && (isIng(hb) || isEdForm(hb))) || (finiteLike(hb) && (isIng(ha) || isEdForm(ha))) || isIng(ha) !== isIng(hb)) return "finite";
  if (finiteLike(ha) && finiteLike(hb)) return "finite";
  return "other";
}
/** answerFamily → picker 범주(classifySite.cat 와 같은 어휘). */
export const FAMILY_CAT: Readonly<Record<AnswerFamily, string>> = {
  agreement: "agreement", relative: "relative", finite: "finite", participle: "participle", pronoun: "pronoun", proform: "pronoun",
  adjadv: "adjadv", voice: "voice", infinitive: "infinitive", parallel: "parallel", other: "other",
};
/** answerFamily → 포인트 코드(원형·포인트 줄). */
export const FAMILY_CODE: Readonly<Record<AnswerFamily, string>> = {
  agreement: "d", relative: "b", finite: "a", participle: "c", pronoun: "g", proform: "g", adjadv: "f", voice: "e", infinitive: "k", parallel: "i", other: "m",
};

const DISTINCT_PP = new Set("taken given gone seen known grown drawn thrown flown written ridden risen driven spoken broken chosen frozen stolen forgotten begun sung swum eaten fallen shaken worn torn born hidden bitten forgiven undertaken withdrawn overtaken undergone foreseen woken arisen lain done been shown proven".split(" "));
const CONJ_PREP = new Set(["because", "although", "while", "though", "despite", "during", "unless", "whereas", "since"]);

export interface AnswerAnalysis {
  fam: AnswerFamily;
  cat: string;
  rlint: string[];
  /** 코드 단서 거리(단어) [추론]. */
  dist: number | null;
  attractor: boolean | null;
  depth: "J" | "M" | "R" | null;
  ambiguousAntecedent: boolean;
  /** 수일치일 때 추정 주어 핵(표면). */
  clue: string | null;
  note?: string;
}

/** 정답 분석. disp=표시 문맥, m=표시 좌표 정답 mark, fix=고침, memoDist=메모 자기 거리(선택). */
export function analyzeAnswer(disp: DispContext, m: DispMark, fix: string, opts: { memoDist?: number | null } = {}): AnswerAnalysis {
  const memoDist = opts.memoDist ?? null;
  const { view } = disp;
  const W = view.W;
  let fam = answerFamily(m.shown, fix);
  const out: AnswerAnalysis = { fam, cat: FAMILY_CAT[fam], rlint: [], dist: null, attractor: null, depth: null, ambiguousAntecedent: false, clue: null };
  if (!m.wr) return { ...out, depth: "M", note: "no-word-range" };
  const d = diffTokens(m.shown, fix);
  // 바뀐 토큰의 표시 좌표 단어 인덱스
  const v = Math.min(m.wr.b, m.wr.a + d.i);
  const vt = W[v];
  const prevRaw = v > 0 && W[v - 1].sid === vt.sid ? W[v - 1] : null;
  const comma = prevRaw ? punctBetween(view, v - 1, v).some((p) => /[,;:]/.test(p)) : false;
  let pj = v - 1;
  while (pj >= 0 && W[pj].sid === vt.sid && W[pj].tag === "ADV") pj--;
  const prevW = pj >= 0 && W[pj].sid === vt.sid ? W[pj] : null;
  const nx = W[m.wr.b + 1] && W[m.wr.b + 1].sid === vt.sid ? W[m.wr.b + 1] : null;
  // 병렬: 바뀐 자리 바로 앞(부사 건너뜀)이 and/or/but 이면 병렬 짝이 단서(수일치·정동사 범주를 덮어씀)
  const partner = prevW && ["and", "or", "but"].includes(prevW.c) && ["agreement", "finite", "other"].includes(fam) ? parallelPartner(view, v, prevW.wi) : null;
  if (partner) {
    fam = "parallel";
    out.fam = fam;
    out.cat = "parallel";
  }
  const wHead = d.a[d.a.length - 1] ?? "";
  const oHead = d.b[d.b.length - 1] ?? "";
  const R = out.rlint;
  // ── R-lint ──
  if (fam === "agreement") {
    const fixNum = verbNumber(d.b[0]) ?? null;
    const nn = nearestNounLeft(view, v, 6);
    if (nn && fixNum && nn.num === fixNum && nn.blockers.length === 0) R.push("R-ADJ");
    if (prevW && ["that", "which", "who"].includes(prevW.c) && prevW.tag === "R") {
      const ante = W[prevW.wi - 1];
      if (ante && ante.head && nounNumber(ante.c) === fixNum && !punctBetween(view, prevW.wi - 1, prevW.wi).length) R.push("R-ADJ-rel");
    }
    if (prevRaw && PERS_SUBJ.has(prevRaw.c) && !comma) R.push("R-PRON");
    const subj = subjectOf(view, v, fixNum);
    out.dist = subj ? subj.dist : null;
    out.clue = subj ? W[subj.k].w : null;
    const near = nn && nn.blockers.length === 0 ? nn : nearestNounLeft(view, v, 12);
    out.attractor = !!(near && fixNum && near.num && near.num !== fixNum) || !!(subj && fixNum && attractorBetween(view, subj.k, v, fixNum));
  }
  if (fam === "relative") {
    const fixW = d.b[d.b.length - 1];
    if (nx && (isFiniteTok(nx) || MODAL.has(nx.c)) && ["who", "which", "that"].includes(fixW) && ["whom", "whose", "what", "where", "when"].includes(wHead)) R.push("R-REL");
  }
  if ((fam === "finite" || fam === "parallel") && prevW && ["who", "which", "that"].includes(prevW.c) && prevW.tag === "R" && (isIng(wHead) || d.a[0] === "to") && finiteLike(oHead)) R.push("R-REL-V");
  if (fam === "finite" && prevRaw && !comma && PERS_SUBJ.has(prevRaw.c) && (isIng(wHead) || d.a[0] === "to") && finiteLike(oHead)) R.push("R-PRON-V");
  if (fam === "relative" && prevRaw && !comma && PREP.has(prevRaw.c) && ["who", "that", "what"].includes(wHead) && ["which", "whom"].includes(oHead)) R.push("R-REL-PREP");
  // RECOG(code-prior.ts recognitionBanFlags 이식)
  const ppOnly = DISTINCT_PP.has(wHead) || (!!prevW && BE.has(prevW.c) && isEdForm(wHead));
  if (ppOnly && !isEdForm(oHead) && nx && DET.has(nx.c)) R.push("RECOG-pp-object");
  if (wHead === "what" && prevRaw && !comma && prevRaw.head && prevRaw.tag === "N") R.push("RECOG-what-after-antecedent");
  if (comma && /(ing|ed)$/.test(oHead) && !/(ing|ed)$/.test(wHead) && (baseOfS(wHead) || isBaseVerb(wHead))) {
    if (W.slice(Math.max(0, v - 3), v).some((t) => t.sid === vt.sid && isFiniteTok(t))) R.push("RECOG-comma-finite");
  }
  if ((CONJ_PREP.has(wHead) || CONJ_PREP.has(oHead)) && m.dStart < disp.text.length / 2) R.push("RECOG-conj-prep-first-half");
  if (prevW && MODAL.has(prevW.c) && !isBaseVerb(wHead)) R.push("RECOG-modal-nonbase");
  if (prevRaw && PREP.has(prevRaw.c) && !comma && /ing$/.test(oHead) && !/ing$/.test(wHead)) R.push("RECOG-prep-gerund");
  // 국소 비문: be+원형, have+원형/-ing, to+비원형, 의문사+원형, 접속사 자리 관계대명사
  const wTok = vt.c; // 변경 지점의 표시 토큰
  const bareV = isBaseVerb(wTok) && !/(ing|ed|s)$/.test(wTok) && !HAVE.has(wTok) && !LEX_ADJ.has(wTok) && (wTok === "be" || !BE.has(wTok));
  const toDel = d.b[0] === "to" && d.a.length === 0;
  if (d.a.length === 1 && prevW && BE.has(prevW.c) && bareV) R.push("R-LOCAL-be-base");
  if (d.a.length === 1 && prevW && HAVE.has(prevW.c) && prevW.c !== "having" && (bareV || isIng(wHead))) R.push("R-LOCAL-have-nonpp");
  if (d.a.length === 1 && prevRaw && prevRaw.c === "to" && !comma && (isIng(wHead) || baseOfS(wHead) || /ed$/.test(wHead)) && !isIng(oHead) && isBaseVerb(oHead)) R.push("R-LOCAL-to-nonbase");
  if (prevRaw && !comma && ["whether", "how", "what", "where", "when", "which", "who"].includes(prevRaw.c) && bareV && toDel) R.push("R-LOCAL-wh-base");
  // to 탈락 원형이 명사·대명사 뒤가 아니면(동사·형용사·need 뒤) 국소 비문 — 명사 뒤면 '주어+정동사'로 읽혀 국소적으로 자연스럽다
  if (toDel && bareV && prevRaw && !comma && !prevRaw.head && !/^(make|makes|made|let|lets|help|helps|helped|have|has|had|see|saw|watch|hear|heard|feel|felt|notice|would|rather)$/.test(prevRaw.c)) R.push("R-LOCAL-to-deletion");
  if (fam === "relative" && wHead === "that" && comma) R.push("R-LOCAL-comma-that");
  if (["when", "if", "while", "where", "because", "although"].includes(oHead) && REL.has(wHead) && !(prevRaw && prevRaw.head && !comma)) R.push("R-LOCAL-conj-rel");
  // ── 단서 거리(비수일치) ──
  if (fam === "parallel") out.dist = partner!.dist;
  else if (fam !== "agreement") out.dist = cueDistance(view, v, fam, d, { prevRaw, comma, nx });
  // 선행사 모호(relative·pronoun)
  if (fam === "relative" || fam === "pronoun") {
    const want = ["they", "them", "their", "themselves", "these", "those"].includes(d.b[0]) ? "pl" : null;
    let n = 0;
    for (let j = v - 1; j >= Math.max(0, v - 8) && W[j].sid === vt.sid; j--) if (W[j].head && W[j].tag === "N" && (!want || nounNumber(W[j].c) === want)) n++;
    out.ambiguousAntecedent = n >= 2;
  }
  // ── depth ──
  if (R.length) out.depth = "R";
  else if (fam === "agreement") out.depth = out.attractor && (out.dist ?? 0) >= 5 ? "J" : "M";
  else {
    const dd = out.dist ?? memoDist;
    out.depth = dd != null && dd >= 5 ? "J" : "M";
  }
  return out;
}

/** 비수일치 범주 단서 거리(단어) [추론 휴리스틱]. */
function cueDistance(
  view: SyntaxView,
  v: number,
  fam: AnswerFamily,
  d: { a: string[]; b: string[] },
  ctx: { prevRaw: VTok | null; comma: boolean; nx: VTok | null },
): number {
  const { prevRaw, comma } = ctx;
  const W = view.W;
  const vt = W[v];
  const sameS = (j: number) => !!W[j] && W[j].sid === vt.sid;
  if (fam === "finite" || fam === "voice") {
    const fixFinite = d.b.some(finiteLike) && !d.b.some((w) => isIng(w)) && d.b[0] !== "to";
    if (fixFinite) {
      const s = clauseSubject(view, v);
      return s ? s.dist : 0;
    }
    // 준동사가 맞는 자리. to V → V-ing/원형 교체 중 V-ing(to 부정사↔동명사)는 바로 앞 지배어가 단서(0).
    if (d.b[0] === "to" && d.a.length && isIng(d.a[d.a.length - 1])) return 0;
    // 그 밖: 왼쪽 가장 가까운 동사류 / 오른쪽 첫 정동사(절 경계 전) 중 가까운 쪽
    let left: number | null = null;
    for (let j = v - 1; j >= 0 && sameS(j); j--)
      if (["V", "AUX", "E", "G"].includes(W[j].tag)) {
        left = v - j - 1;
        break;
      }
    let right: number | null = null;
    for (let j = v + 1; sameS(j); j++) {
      if (W[j].tag === "R" || (W[j].tag === "C" && !["and", "or"].includes(W[j].c))) break;
      if (isFiniteTok(W[j])) {
        right = j - v - 1;
        break;
      }
    }
    const cands = [left, right].filter((x): x is number => x != null);
    if (cands.length) return Math.min(...cands);
    const f = nearestFiniteVerb(view, v);
    return f ? f.dist : 0;
  }
  if (fam === "relative") {
    if (prevRaw && !comma && prevRaw.head && prevRaw.tag === "N") return 0;
    if (prevRaw && PREP.has(prevRaw.c)) return W[v - 2]?.head ? 1 : 2;
    // 명사절·선행사 없는 자리: 관계사 절의 동사 다음 정동사(주절 동사)까지
    let first = -1;
    for (let j = v + 1; sameS(j); j++)
      if (isFiniteTok(W[j])) {
        if (first < 0) first = j;
        else return j - v - 1;
      }
    let e = v;
    while (sameS(e + 1)) e++;
    return Math.max(0, Math.min(e - v, first > 0 ? first - v + 3 : e - v));
  }
  if (fam === "participle") {
    if (comma || !prevRaw) {
      // 분사구문: 주절 주어(다음 쉼표 뒤 첫 명사 머리) 또는 앞 절 주어
      for (let j = v + 1; sameS(j); j++)
        if (punctBetween(view, j - 1, j).some((p) => p === ",")) {
          for (let q = j; sameS(q); q++) if (W[q].head) return q - v - 1;
        }
      for (let j = v - 1; j >= 0 && sameS(j); j--) if (W[j].head && governorOf(view, j).tag !== "P") return v - j - 1;
      return 3;
    }
    for (let j = v - 1; j >= Math.max(0, v - 12) && sameS(j); j--) if (W[j].head) return v - j - 1;
    return 2;
  }
  if (fam === "pronoun") {
    const want = ["they", "them", "their", "themselves", "these", "those"].includes(d.b[0])
      ? "pl"
      : ["it", "its", "itself", "this", "that", "he", "she", "him", "her", "his"].includes(d.b[0])
        ? "sg"
        : null;
    for (let j = v - 1; j >= Math.max(0, v - 40); j--) if (W[j].head && W[j].tag === "N" && (!want || nounNumber(W[j].c) === want)) return v - j - 1;
    return 10;
  }
  if (fam === "proform") {
    for (let j = v - 1; j >= Math.max(0, v - 40); j--) if (isFiniteTok(W[j]) || (W[j].tag === "V" && !W[j].inf)) return v - j - 1;
    return 10;
  }
  if (fam === "parallel" || (fam === "other" && prevRaw && ["and", "or"].includes(prevRaw.c))) {
    for (let j = v - 2; j >= Math.max(0, v - 20) && sameS(j); j--) if (["V", "G", "E", "AUX"].includes(W[j].tag)) return v - j - 1;
    return 3;
  }
  if (fam === "adjadv") return prevRaw ? 1 : 0;
  return prevRaw ? 1 : 0;
}

/** 병렬 짝: 등위접속사(ci) 앞 같은 문장의 가장 가까운 동사류(V·E·AUX·G). */
function parallelPartner(view: SyntaxView, v: number, ci: number): { k: number; dist: number } | null {
  const W = view.W;
  for (let j = ci - 1; j >= Math.max(0, ci - 25) && W[j].sid === W[v].sid; j--) {
    const t = W[j];
    if (["V", "E", "G"].includes(t.tag) || (t.tag === "AUX" && !["to"].includes(t.c))) return { k: j, dist: v - j - 1 };
  }
  return null;
}
/** 절 주어(정동사 결손 자리용): 왼쪽 절 경계 뒤 첫 주어 자리 명사 머리·대명사·동명사. */
function clauseSubject(view: SyntaxView, v: number): { k: number; dist: number } | null {
  const W = view.W;
  let b = v - 1;
  while (b >= 0 && W[b].sid === W[v].sid) {
    const t = W[b];
    const semi = b + 1 <= v && punctBetween(view, b, b + 1).some((p) => /[;:]/.test(p));
    const commaCoord = t.tag === "C" && ["and", "or", "but", "yet"].includes(t.c) && b > 0 && punctBetween(view, b - 1, b).some((p) => p === ",");
    if (semi || commaCoord || t.tag === "R" || (t.tag === "C" && !["and", "or", "but", "nor", "yet"].includes(t.c))) break;
    b--;
  }
  for (let k = b + 1; k < v; k++) {
    const t = W[k];
    if ((t.head || t.tag === "G") && governorOf(view, k).tag !== "P") return { k, dist: v - k - 1 };
  }
  return null;
}

/** answerFamily → 한국어 범주명(비평 프롬프트 메뉴 줄). */
export const FAMILY_KO: Readonly<Record<AnswerFamily, string>> = {
  agreement: "수일치", relative: "관계사·명사절", finite: "정동사·준동사", participle: "분사", pronoun: "대명사", proform: "대동사",
  adjadv: "형용사·부사", voice: "태", infinitive: "to부정사·동명사", parallel: "병렬", other: "기타",
};
