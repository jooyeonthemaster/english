// ============================================================================
// 어법 KILLER 「과훈련 정답」 0원 결정형 게이트 (P2 OVERDRILL) — LLM 콜 없음.
//
// 배경(26-08-21): 어법 KILLER 실경로는 md-stream 레인이고, 이 레인에서 차단력을
// 가진 것은 parseAndGate 가 만드는 gateIssues 배열뿐이다. 기존 품질검증기
// (validateQuestionQuality → shared.ts:939 findGrammarKillerOverdrilledAnswer)는
// 이 레인에서 **기록만** 하므로 거기에 무엇을 넣어도 차단되지 않는다. 그래서
// 같은 성격의 판정을 md-stream 용 순수 함수로 다시 세운다(shared.ts 를 import
// 하지 않는다 — 의존 방향 오염 금지. 사전·판정 로직은 이 파일에 자립).
//
// 무엇을 잡는가: 정답 자리가 "한국 커리큘럼 과훈련 사전 한 방"으로 끝나는
// 암기 패턴인가. 단서거리가 멀어도 킬러가 못 되는 유일한 사유다. 평가자가
// 실제로 반려한 실물이 여기 정면으로 들어온다 —
//   (X1) 정답 "have found to suffer" (고침 "have been found to suffer")
//        = be/have + 보고동사 + to부정사 관용. 학생은 구조를 읽지 않고
//        "be found to 는 수동" 이라는 암기 한 줄로 끝낸다.
//
// ── 실측 근거(직접 실행. 기출 어법 156문항 복원본 = reconstructed.json ∩
//    corpus.json, **정답 자리만** 대상. 하네스는 아래 §검증 참조) ───────────
//   D1 명세 원안(±5토큰 문맥 전체에 정규식) : 1/156 발화 —
//      "was referred to as the 'great man' theory". 이건 be+p.p. + **전치사**
//      to 이지 to부정사 관용이 아니다. 그래서 **to 뒤가 원형동사일 때만**
//      발화하도록 좁혔고(전치사 to 배제), 좁힌 뒤 기출 발화 0/156.
//      X1 은 그대로 적발된다("to suffer" = 원형).
//   D1 은 또 "정규식 히트가 밑줄과 겹칠 것"을 요구한다 — 지문 어딘가에
//      be known to 가 있다는 이유로 무관한 밑줄을 죽이면 안 되기 때문
//      (±5 창 원안의 구조적 오발화 경로). 실측: 좁힌 D1 패턴은 156개 지문
//      본문에 5회 등장하지만 그중 정답 밑줄과 겹치는 것은 0회다 — 겹침
//      요구가 없으면 그 5개가 그대로 오발화 후보가 된다.
//   D5(that↔what) 는 **채택하지 않는다**: 기출 정답 자리에서 11/156(7.1%)이
//      that↔what 맞교환이고, 명세가 판단형으로 분류한 b코드 27건의 주력이다.
//      "KILLER 에서만 발화시키면 판단형을 안 깎는다"는 명세의 주장은 이
//      코퍼스 실측으로 반증됐다(11건 전부 기출 정답 자리). JSON 레인의
//      shared.ts 구현은 그대로 두므로 그쪽 기록은 유지된다.
//   D2·D3·D6·D8·D9 는 기출에서 각각 2·1·5·1·1건 = 합 10건 발화한다. 이 10건은
//      명세가 "인지형/경계"로 지목한 자리와 일치한다(D6 5건 = 명세 P1 F7이
//      열거한 lately·pleasantly·defenselessly·dependently·convenient 5건과
//      완전 동일, D3 1건 = 명세가 경계로 명시한 'the aged … was'). 즉 설계상의
//      적중이지 오탐이 아니다. 그러나 **배선 조건이 "기출 발화 0%"** 이므로
//      기본값에서는 끈다.
//      → 기본 모드 core = D1·D4·D7 (기출 발화 0/156 = 0.0%)
//      → 확장 모드 all  = + D2·D3·D6·D8·D9 (기출 발화 10/156 = 6.4%,
//                          전수 확인 결과 전부 명세 지정 인지형·경계 자리)
//
// ⚠ 이 게이트의 메시지는 그대로 [반려 재생성] 프롬프트의 피드백이 된다
//   (route.ts 의 gateIssues 경로). "어느 라벨의 무엇이 왜" 를 반드시 적는다.
//
// 킬스위치/모드: env QGEN_GRAMMAR_KILLER_OVERDRILL_GATE (재빌드 불필요)
//   off  → 항상 빈 배열(전면 무력화)
//   core → 기본값(미지정·오타 포함). 기출 발화 0건인 사전만.
//   all  → 과훈련 사전 전량(D5 제외).
// 자기게이트: requestedDifficulty !== "KILLER" 이면 항상 빈 배열.
//   ※ 배선 시 rawDifficulty(요청 난이도 원문)를 반드시 넘겨야 발화한다.
// ============================================================================

import { normalizeWs, type MdGrammarQuestion } from "./parser";

export type OverdrillGateMode = "off" | "core" | "all";

/** env 모드 판독 — 미지정/오타는 core(안전 기본값). */
export function overdrillGateMode(): OverdrillGateMode {
  const raw = process.env.QGEN_GRAMMAR_KILLER_OVERDRILL_GATE?.trim().toLowerCase();
  if (raw === "off") return "off";
  if (raw === "all") return "all";
  return "core";
}

// ── 사전 ────────────────────────────────────────────────────────────────────

/** D1 조동사/be 축 — 능동 오형(have found to)·수동 정형(have been found to) 양방향. */
const D1_AUX = "be|been|being|am|is|are|was|were|have|has|had";

/** D1 보고동사 — 명세 원안 그대로. */
const D1_REPORT =
  "found|said|believed|known|thought|reported|considered|supposed|expected|held|seen|regarded|referred";

/**
 * D1 본체. to 뒤 한 토큰(부사 -ly 개재 허용)까지 캡처해 **to부정사인지**를 본다.
 * 전치사 to("be referred to as", "be held to the standard")를 걸러내는 축이다.
 */
const D1_RE = new RegExp(
  `\\b(${D1_AUX})\\s+(${D1_REPORT})\\s+to\\s+(?:[A-Za-z']+ly\\s+)?([A-Za-z']+)`,
  "gi",
);

/** to 뒤에 오면 그 to 가 전치사라는 표지 — 이게 있으면 D1 미발화. */
const NOT_INFINITIVE_AFTER_TO = new Set([
  "as", "a", "an", "the", "this", "that", "these", "those", "it", "its",
  "his", "her", "their", "our", "my", "your", "them", "him", "us", "me",
  "you", "which", "what", "who", "whom", "whose", "one", "ones", "some",
  "any", "all", "both", "each", "every", "other", "others", "another",
  "such", "more", "most", "many", "much", "several", "few", "no", "none",
  "and", "or", "but", "in", "on", "at", "by", "for", "with", "from", "of",
  "about", "than", "then", "there", "here", "so", "too", "very",
]);

/** to 뒤 단어가 명사형 접미사로 끝나면 원형동사가 아니다(= 전치사 to). */
const NOMINAL_SUFFIX =
  /(?:tion|sion|ment|ness|ity|ies|ism|ists?|ships?|hood|ance|ence)$/i;

/** D3 「the + 형용사 = 복수 보통명사」 사전. */
const D3_THE_ADJ = new Set([
  "aged", "rich", "poor", "young", "injured", "unemployed", "homeless",
  "elderly", "blind", "deaf", "disabled", "wounded", "sick",
]);

/** D4 부분사 주어 — of 뒤 복수명사에 동사를 끌려 붙이는 과훈련 자리. */
const D4_QUANT = new Set(["one", "each", "either", "neither"]);

/** D7 사역·지각동사(원형부정사 목적격보어). help 는 to 유무 둘 다 정문이라 제외. */
const D7_CAUS_PERC = new Set([
  "make", "makes", "made", "making",
  "let", "lets", "letting",
  "see", "sees", "saw", "seeing",
  "hear", "hears", "heard", "hearing",
  "feel", "feels", "felt", "feeling",
  "have", "has", "had", "having",
  "watch", "watches", "watched", "watching",
  "notice", "notices", "noticed", "noticing",
]);

/** D2 감정분사 어간 — -ed/-ing 맞교환이 곧 정답인 과훈련 자리. */
const D2_EMO_STEMS = [
  "interest", "satisf", "bore", "excit", "frustrat", "confus",
  "surpris", "embarrass", "tire", "tiring", "amaz", "annoy", "disappoint",
  "shock", "pleas", "fascinat", "depress", "exhaust", "worri", "worry",
  "engag", "encourag", "terrif", "thrill", "relax", "disturb", "puzzl",
  "impress", "excite",
];

/** D8 a-형용사 ↔ 비-a 계열 맞교환. */
const D8_A_ADJ: Record<string, string[]> = {
  alike: ["like", "liked", "liking"],
  alive: ["live", "living", "lived"],
  afraid: ["fear", "fears", "feared", "fearing", "fearful"],
  asleep: ["sleep", "sleeps", "slept", "sleeping"],
  aware: ["ware", "wary"],
  ashamed: ["shame", "shamed", "shameful"],
  alone: ["lone", "lonely"],
};

/** D6 -ly 로 끝나지만 부사가 아닌 형용사 — 형/부 맞교환 오판 방지. */
const D6_LY_ADJECTIVES = new Set([
  "early", "likely", "unlikely", "friendly", "lively", "lonely", "costly",
  "daily", "weekly", "monthly", "yearly", "elderly", "silly", "ugly",
  "deadly", "orderly", "timely", "manly", "holy", "only",
]);

// ── 토큰 유틸 ───────────────────────────────────────────────────────────────

const clean = (w: string): string =>
  String(w ?? "").replace(/[^A-Za-z'-]/g, "").toLowerCase();

const words = (s: string): string[] =>
  normalizeWs(s).split(/\s+/).filter(Boolean);

/** 토큰열을 공백 join 하고 각 토큰의 문자 시작 오프셋을 함께 돌려준다. */
function joinWithOffsets(tokens: string[]): { text: string; offsets: number[] } {
  const offsets: number[] = [];
  let text = "";
  for (const t of tokens) {
    if (text) text += " ";
    offsets.push(text.length);
    text += t;
  }
  return { text, offsets };
}

/** 문자 구간 [s,e) 와 겹치는 토큰 인덱스 구간 [lo,hi) — 정규식 히트를 토큰으로 되돌린다. */
function charRangeToTokens(
  tokens: string[],
  offsets: number[],
  s: number,
  e: number,
): [number, number] {
  let lo = tokens.length;
  let hi = 0;
  for (let i = 0; i < tokens.length; i += 1) {
    const a = offsets[i];
    const b = a + tokens[i].length;
    if (b <= s || a >= e) continue;
    if (i < lo) lo = i;
    if (i + 1 > hi) hi = i + 1;
  }
  return lo < hi ? [lo, hi] : [0, 0];
}

/** 수 일치 뒤집기(단수↔복수 짝) — D3·D4 의 필수 동반 조건. */
function isNumberAgreementFlip(a: string, b: string): boolean {
  const x = clean(a);
  const y = clean(b);
  if (!x || !y || x === y) return false;
  const PAIRS: Record<string, string> = {
    is: "are", are: "is", was: "were", were: "was",
    has: "have", have: "has", does: "do", do: "does",
  };
  if (PAIRS[x] === y) return true;
  // 일반동사 3인칭 단수 ↔ 원형 (emphasize ↔ emphasizes, carry ↔ carries)
  const sFlip = (p: string, q: string) =>
    `${p}s` === q ||
    `${p}es` === q ||
    (/y$/.test(p) && `${p.slice(0, -1)}ies` === q);
  return sFlip(x, y) || sFlip(y, x);
}

/** 다어절 쌍에서 정확히 한 토큰만 다르면 그 토큰쌍을 돌려준다(아니면 null). */
function singleTokenDiff(a: string, b: string): [string, string] | null {
  const x = words(a);
  const y = words(b);
  if (x.length !== y.length || x.length === 0) return null;
  let diff: [string, string] | null = null;
  for (let i = 0; i < x.length; i += 1) {
    if (clean(x[i]) === clean(y[i])) continue;
    if (diff) return null;
    diff = [clean(x[i]), clean(y[i])];
  }
  return diff && diff[0] && diff[1] ? diff : null;
}

/** 표면쌍을 「한 토큰 대 한 토큰」으로 환원 — 단어쌍 사전 검사의 공통 입구. */
function tokenPair(shown: string, original: string): [string, string] | null {
  const s = words(shown);
  const o = words(original);
  if (s.length === 1 && o.length === 1) {
    const a = clean(s[0]);
    const b = clean(o[0]);
    return a && b && a !== b ? [a, b] : null;
  }
  return singleTokenDiff(shown, original);
}

/** 형용사 어간 → 인정 가능한 -ly 부사형(정확 매칭 전용). */
function adverbFormsOf(base: string): Set<string> {
  const forms = new Set<string>([`${base}ly`]);
  if (/y$/.test(base)) forms.add(`${base.slice(0, -1)}ily`);
  if (/le$/.test(base)) forms.add(`${base.slice(0, -1)}y`);
  if (/ic$/.test(base)) forms.add(`${base}ally`);
  if (/ll$/.test(base)) forms.add(`${base.slice(0, -1)}y`);
  if (/ue$/.test(base)) forms.add(`${base.slice(0, -1)}y`);
  return forms;
}

/** 분사 어간(-ed/-ing 제거) — D2 감정분사 대조용. */
function participleStem(w: string): string | null {
  if (/ing$/.test(w)) return w.slice(0, -3);
  if (/ed$/.test(w)) return w.slice(0, -2);
  return null;
}

// ── 밑줄 판독 ───────────────────────────────────────────────────────────────

interface MarkSpan {
  label: string;
  /** 밑줄 첫 토큰 인덱스 */
  start: number;
  /** 밑줄 마지막 토큰 인덱스 + 1(반열림) */
  end: number;
}

/**
 * markedPassage(`[[A:표현]]`)에서 마커를 제거한 순수 토큰열과 라벨별 토큰 구간을
 * 얻는다. markedPassage 가 없으면 null(문맥 의존 검사는 사실상 미발화).
 */
function readMarkedPassage(
  q: MdGrammarQuestion,
): { tokens: string[]; spans: MarkSpan[] } | null {
  const marked = normalizeWs(q.markedPassage);
  if (!marked) return null;
  const re = /\[\[([A-J])\s*:\s*([^\]]*)\]\]/g;
  let plain = "";
  let last = 0;
  const raw: { label: string; from: number; to: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(marked))) {
    plain += marked.slice(last, m.index);
    const expr = m[2].trim();
    raw.push({ label: `(${m[1]})`, from: plain.length, to: plain.length + expr.length });
    plain += expr;
    last = m.index + m[0].length;
  }
  plain += marked.slice(last);
  if (raw.length === 0) return null;
  const tokens = plain.split(/\s+/).filter(Boolean);
  const countTo = (charIdx: number) =>
    plain.slice(0, charIdx).split(/\s+/).filter(Boolean).length;
  const spans = raw.map((r) => {
    const start = countTo(r.from);
    const inner = plain.slice(r.from, r.to).split(/\s+/).filter(Boolean).length;
    return { label: r.label, start, end: start + Math.max(1, inner) };
  });
  return { tokens, spans };
}

// ── 개별 사전 판정 ──────────────────────────────────────────────────────────

/** 한 밑줄 자리 — 지문 토큰열과 밑줄 토큰 구간[start,end). */
interface Site {
  tokens: string[];
  start: number;
  end: number;
}

/** D1: 보고동사 수동 관용. 히트는 반드시 밑줄과 겹쳐야 한다. */
function hitD1(site: Site, win = 5): string | null {
  const lo = Math.max(0, site.start - win);
  const hi = Math.min(site.tokens.length, site.end + win);
  const slice = site.tokens.slice(lo, hi);
  const { text, offsets } = joinWithOffsets(slice);
  D1_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = D1_RE.exec(text))) {
    const rawTail = m[3] ?? "";
    const tail = clean(rawTail);
    if (!tail) continue;
    // to 뒤가 원형동사가 아니면 그 to 는 전치사다(be referred to as / held to the line).
    if (NOT_INFINITIVE_AFTER_TO.has(tail)) continue;
    if (NOMINAL_SUFFIX.test(tail)) continue;
    if (/^[A-Z]/.test(rawTail)) continue; // 고유명사 → 전치사 to
    const [tLo, tHi] = charRangeToTokens(
      slice,
      offsets,
      m.index,
      m.index + m[0].length,
    );
    const absLo = lo + tLo;
    const absHi = lo + tHi;
    if (absHi <= site.start || absLo >= site.end) continue; // 밑줄과 안 겹치면 무시
    return `${clean(m[1])} ${clean(m[2])} to ${tail}`;
  }
  return null;
}

/** D3: the + 형용사(복수 보통명사) 뒤 동사 수 플립. */
function hitD3(site: Site, pair: [string, string] | null, win = 5): string | null {
  if (!pair || !isNumberAgreementFlip(pair[0], pair[1])) return null;
  const lo = Math.max(0, site.start - win);
  for (let i = lo; i < site.start; i += 1) {
    if (clean(site.tokens[i]) !== "the") continue;
    const next = clean(site.tokens[i + 1] ?? "");
    if (D3_THE_ADJ.has(next)) return `the ${next}`;
  }
  return null;
}

/** D4: one/each/either/neither of + 동사 수 플립. */
function hitD4(site: Site, pair: [string, string] | null, win = 8): string | null {
  if (!pair || !isNumberAgreementFlip(pair[0], pair[1])) return null;
  const lo = Math.max(0, site.start - win);
  for (let i = lo; i < site.start; i += 1) {
    const w = clean(site.tokens[i]);
    if (!D4_QUANT.has(w)) continue;
    if (clean(site.tokens[i + 1] ?? "") === "of") return `${w} of`;
  }
  return null;
}

/** D7: 사역·지각동사 + 목적어 + to부정사 ↔ 원형부정사 맞교환. */
function hitD7(site: Site, shown: string, original: string, win = 4): string | null {
  const s = words(shown).map(clean).filter(Boolean);
  const o = words(original).map(clean).filter(Boolean);
  const isToBareSwap =
    (s[0] === "to" && s.length === 2 && o.length === 1 && s[1] === o[0]) ||
    (o[0] === "to" && o.length === 2 && s.length === 1 && o[1] === s[0]);
  if (!isToBareSwap) return null;
  const lo = Math.max(0, site.start - win);
  for (let i = lo; i < site.start; i += 1) {
    const w = clean(site.tokens[i]);
    if (D7_CAUS_PERC.has(w)) return w;
  }
  return null;
}

/** D2: 감정분사 -ed/-ing 맞교환. */
function hitD2(pair: [string, string] | null): string | null {
  if (!pair) return null;
  const [a, b] = pair;
  const sa = participleStem(a);
  const sb = participleStem(b);
  if (!sa || !sb) return null;
  if (/ing$/.test(a) === /ing$/.test(b)) return null; // 정확히 -ed↔-ing 이어야 한다
  // satisfy→satisfied/satisfying 처럼 어간 표기가 갈리므로 접두 일치로 대조한다.
  const base = sa.length <= sb.length ? sa : sb;
  const other = sa.length <= sb.length ? sb : sa;
  if (!base || !other.startsWith(base)) return null;
  for (const stem of D2_EMO_STEMS) {
    if (base.startsWith(stem) || stem.startsWith(base)) return `${a} ↔ ${b}`;
  }
  return null;
}

/** D6: 형용사↔부사(-ly) 맞교환. */
function hitD6(pair: [string, string] | null): string | null {
  if (!pair) return null;
  const [a, b] = pair;
  const aLy = /ly$/.test(a);
  const bLy = /ly$/.test(b);
  if (aLy === bLy) return null;
  const adverb = aLy ? a : b;
  const base = aLy ? b : a;
  if (D6_LY_ADJECTIVES.has(adverb)) return null;
  return adverbFormsOf(base).has(adverb) ? `${a} ↔ ${b}` : null;
}

/** D8: a-형용사 ↔ 비-a 계열 맞교환. */
function hitD8(pair: [string, string] | null): string | null {
  if (!pair) return null;
  const [a, b] = pair;
  if (D8_A_ADJ[a]?.includes(b)) return `${a} ↔ ${b}`;
  if (D8_A_ADJ[b]?.includes(a)) return `${a} ↔ ${b}`;
  return null;
}

/** D9: during ↔ while(전치사↔접속사) 맞교환. */
function hitD9(pair: [string, string] | null): string | null {
  if (!pair) return null;
  const set = new Set(pair);
  return set.has("during") && set.has("while") ? "during ↔ while" : null;
}

// ── 게이트 본체 ─────────────────────────────────────────────────────────────

export interface OverdrilledGateOptions {
  /** 요청 난이도 원문. "KILLER" 가 아니면 이 게이트는 전면 미발화(자기게이트). */
  requestedDifficulty?: string;
}

/** 한 정답 자리에서 걸린 사전 1건. */
export interface OverdrillHit {
  label: string;
  /** "D1" ~ "D9" */
  code: string;
  /** 사람이 읽는 사유(재생성 피드백에 그대로 들어간다) */
  reason: string;
}

/** 사전별 재생성 지시문 — "무엇이 왜 부적격인지"를 적는다. */
const ADVICE: Record<string, string> = {
  D1: "be/have + 보고동사(found·said·believed·known·thought…) + to부정사 관용은 「be found to 는 수동」 한 줄 암기로 끝나는 자리다 — 학생이 문장 구조를 전혀 읽지 않는다.",
  D2: "감정분사 -ed/-ing 맞교환(interested/interesting 계열)은 중학 과정에서 끝나는 암기 자리다.",
  D3: "the + 형용사(= 복수 보통명사) 뒤 동사 수 맞추기는 사전 한 방으로 끝나는 암기 포인트다.",
  D4: "one/each/either/neither of + 복수명사 → 동사 수는 모든 학생이 외우는 기계적 함정이다.",
  D6: "형용사↔부사(-ly) 맞교환은 BASIC/INTERMEDIATE 포인트로, 밑줄 인접 한두 토큰만 보면 끝난다.",
  D7: "사역·지각동사 목적격보어의 to부정사↔원형부정사는 동사 목록 암기로 끝나는 자리다.",
  D8: "alike/alive/afraid/asleep 같은 a-형용사와 like/live/fear 계열의 맞교환은 어휘 암기 자리다.",
  D9: "during(전치사)↔while(접속사) 맞교환은 뒤에 절이 있는지만 보면 끝난다.",
};

const DEEPER_MENU =
  "지문에 이미 있는 더 깊은 자리로 정답 밑줄을 옮겨라 — (a) 주절 정동사 공백(준동사 vs 정동사), (b) 관계사 완결성·전치사 삭제형(in which → which), (d) 삽입구·관계절로 주어핵이 멀고 인접 명사의 수가 주어핵과 다른 수일치, (e) 구조 결손 0의 태 오류, (i) 짝 후보가 2개 이상인 병렬의 마지막 항";

/**
 * 정답 자리가 과훈련 사전에 걸리는지 판정한다(순수 함수, 부작용 없음).
 * KILLER 가 아니거나 env 가 off 면 항상 빈 배열.
 *
 * @param q parseMdGrammar 산출물(marks·markedPassage·answers)
 * @param options.requestedDifficulty 요청 난이도 원문 — 반드시 전달할 것
 * @returns 걸린 정답 자리마다 재생성 피드백 문자열 1건씩
 */
export function gateGrammarKillerOverdrilledAnswer(
  q: MdGrammarQuestion,
  options?: OverdrilledGateOptions,
): string[] {
  if (options?.requestedDifficulty !== "KILLER") return [];
  const mode = overdrillGateMode();
  if (mode === "off") return [];
  return findOverdrillHits(q, mode).map((h) => {
    const advice = ADVICE[h.code] ?? "";
    return `정답 ${h.label} 과훈련 사전 적중(${h.code}) — ${h.reason}. ${advice} KILLER 정답 자리로 부적격이다. ${DEEPER_MENU}.`;
  });
}

/**
 * 판정 본체(테스트·계측용 공개). 게이트 문자열 대신 히트 목록을 돌려준다.
 * env 를 보지 않으므로 모드를 명시적으로 넘긴다.
 */
export function findOverdrillHits(
  q: MdGrammarQuestion,
  mode: "core" | "all" = "core",
): OverdrillHit[] {
  const marks = Array.isArray(q.marks) ? q.marks : [];
  if (marks.length === 0) return [];
  const answerLabels = new Set(
    (q.answers?.length ? q.answers : [q.answer]).filter(Boolean),
  );
  if (answerLabels.size === 0) return [];
  const read = readMarkedPassage(q);
  const spanByLabel = new Map<string, MarkSpan>();
  for (const s of read?.spans ?? []) spanByLabel.set(s.label, s);

  const out: OverdrillHit[] = [];
  for (const mark of marks) {
    if (!answerLabels.has(mark.label)) continue; // 정답 마커만 대상(미끼 제외)
    const shown = normalizeWs(mark.shown);
    const original = normalizeWs(mark.original);
    const pair =
      shown && original && shown.toLowerCase() !== original.toLowerCase()
        ? tokenPair(shown, original)
        : null;

    // 문맥 창: 표시형(오형) 지문과 정형 치환 지문 **양쪽**을 본다
    // (능동 오형 have found to / 수동 정형 have been found to 양방향 히트).
    const sites: Site[] = [];
    const span = spanByLabel.get(mark.label);
    if (read && span) {
      sites.push({ tokens: read.tokens, start: span.start, end: span.end });
      if (original) {
        const origTokens = words(original);
        const swapped = [
          ...read.tokens.slice(0, span.start),
          ...origTokens,
          ...read.tokens.slice(span.end),
        ];
        sites.push({
          tokens: swapped,
          start: span.start,
          end: span.start + Math.max(1, origTokens.length),
        });
      }
    } else {
      // markedPassage 가 없으면 표면만으로 최소 판정.
      for (const surface of [shown, original].filter(Boolean)) {
        const t = words(surface);
        if (t.length > 0) sites.push({ tokens: t, start: 0, end: t.length });
      }
    }

    const found: OverdrillHit[] = [];
    const push = (code: string, reason: string) => {
      if (found.some((f) => f.code === code)) return;
      found.push({ label: mark.label, code, reason });
    };

    for (const site of sites) {
      const d1 = hitD1(site);
      if (d1) push("D1", `보고동사 수동 관용 '${d1}' 자리`);
      const d7 = hitD7(site, shown, original);
      if (d7) push("D7", `사역·지각동사 '${d7}' 뒤 to부정사↔원형부정사 맞교환`);
      const d4 = hitD4(site, pair);
      if (d4) push("D4", `'${d4}' 뒤 동사 수 뒤집기`);
      if (mode === "all") {
        const d3 = hitD3(site, pair);
        if (d3) push("D3", `'${d3}' 뒤 동사 수 뒤집기`);
      }
    }
    if (mode === "all") {
      const d2 = hitD2(pair);
      if (d2) push("D2", `감정분사 맞교환 '${d2}'`);
      const d6 = hitD6(pair);
      if (d6) push("D6", `형용사↔부사 맞교환 '${d6}'`);
      const d8 = hitD8(pair);
      if (d8) push("D8", `a-형용사 맞교환 '${d8}'`);
      const d9 = hitD9(pair);
      if (d9) push("D9", `전치사↔접속사 맞교환 '${d9}'`);
    }
    out.push(...found);
  }
  return out;
}
