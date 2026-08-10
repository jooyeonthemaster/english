// ============================================================================
// 지칭 추론(REFERENCE) md 파서 · 위치 확정기 · 0원 스냅.
// 견본: parser-antonym.ts / 계약 문서: docs/md-qgen-type-expansion-spec.md §4-7
// 정본 규약 답습: 파서는 관대하게(드리프트 흡수) · 게이트는 엄격하게.
//
// 이 유형은 지문을 재출력하지 않는다 — 그래서 "지문 재구성 대조" 게이트가 없다.
// 대신 이 유형만의 급소가 하나 있다: **밑줄 자리의 유일 확정**.
//   it / they 같은 두세 글자 대명사를 순차 indexOf 로 찾으면 art"is"ts 처럼 단어
//   내부를 집거나(정본 26-07-21 실사용 사고) 같은 대명사의 다른 출현을 집는다.
// 해법은 탐색이 아니라 **지목**이다: 모델이 대명사가 든 문장을 축자로 옮기고 그
// 안에서 마커로 자리를 찍으면, 우리는 "문장 + 마커 오프셋"이라는 결정형 좌표를
// 얻는다. locateReferenceTarget 이 그 좌표를 원문 인덱스로 환산하고,
// buildReferenceContext 가 후처리(processReference → findWordInPassage,
// strictContext=true)가 **같은 자리**를 집도록 문맥 창을 만든다.
//
// ⚠ 게이트 본체와 **대명사 용법 판정**(허사 it·지시 that)은 gate-reference.ts 로
//   분리했다(파일 500줄 규약, 1차 승차분 gate-order.ts 선례). 의존 방향은
//   gate-reference → parser-reference 단방향이다.
// ============================================================================

import { escapeRegExp } from "./parser";

/**
 * 표적으로 허용하는 대명사 닫힌 집합.
 * 근거: `question-quality/candidate-blocks/reference.ts` 의 findReferenceCandidates
 * 가 쓰는 목록과 동일 축 — fast 레인과 md 레인이 같은 표적 공간을 본다.
 */
export const REFERENCE_PRONOUN_LIST = [
  "it", "its", "they", "them", "their", "theirs",
  "this", "that", "these", "those",
  "he", "him", "his", "she", "her", "hers",
  "we", "us", "our", "ours", "one", "ones",
] as const;

const REFERENCE_PRONOUN_SET: ReadonlySet<string> = new Set<string>(
  REFERENCE_PRONOUN_LIST,
);

export function isReferencePronoun(word: string): boolean {
  return REFERENCE_PRONOUN_SET.has(word.trim().toLowerCase());
}

/**
 * 밑줄 마커. 전역 정규식은 lastIndex 를 공유하므로 정본 INLINE_MARK_RE 를 재사용하지
 * 않고 로컬 선언한다(규범 §3-4 절대 재사용 금지 목록). 라벨은 **선택**이다 —
 * 마커가 하나뿐이라 라벨이 필요 없지만, 다른 유형 형식에 이끌려 `[[A:them]]` 으로
 * 쓰는 실측 드리프트를 흡수한다.
 */
export const INLINE_REFERENCE_MARK_RE =
  /\[\[(?:([A-Za-z0-9]{1,3})\s*:\s*)?((?:(?!\]\]).)+)\]\]/g;

/** `[[ ]]` 이 아예 없을 때만 인정하는 대체 마커(굵게·밑줄 표기 드리프트). */
const FALLBACK_MARK_RES: readonly RegExp[] = [
  /__([^_\n]{1,40})__/g,
  /\*\*([^*\n]{1,40})\*\*/g,
];

export interface MdReferenceOption {
  /** "①"~"⑤" */
  label: string;
  text: string;
}

export interface MdReferenceQuestion {
  kind: "reference";
  /**
   * 표적 대명사가 `[[ ]]` 로 감싸진 지문 문장(축자, 한 줄).
   * 이 한 줄이 "어느 대명사인가"와 "어디에 있는가"를 **동시에** 확정하는 유일
   * 진실원이다 — 두 칸으로 나눠 받으면 두 값이 어긋나는 실패 모드가 생긴다.
   */
  markedSentence: string;
  options: MdReferenceOption[];
  /** "①"~"⑤" — 정답의 유일 진실원 */
  answer: string;
  explanation: string;
  wrong: MdReferenceOption[];
}

const CIRCLED: readonly string[] = ["①", "②", "③", "④", "⑤"];

function circledLabel(raw: string): string {
  const key = raw.trim();
  if (CIRCLED.includes(key)) return key;
  const digit = Number(key.replace(/[^0-9]/g, ""));
  return digit >= 1 && digit <= 5 ? CIRCLED[digit - 1] : "";
}

// ── 줄 선두·라벨 관용 (silent-drop 방지의 핵심 대칭) ─────────────────────────
// 모델이 마크다운을 꾸미는 실측 드리프트(불릿 `- `, 표 파이프 `| `, 굵게 `**`,
// 전각 콜론 `：`)를 **선지 줄과 섹션 라벨 줄이 똑같은 접두로** 흡수한다.
// 이 대칭이 이 파일의 불변식이다. 한쪽만 관대하면 실측 사고 두 계통이 난다:
//   ① 밑줄문장 종료 lookahead 가 선지 라인 정규식과 1:1이 아니면, 장식된 **첫
//      선지 줄**을 밑줄문장이 통째로 삼켜 게이트가 사실과 다른 원인(지문 축자
//      불일치)을 지목한다 — 문장은 이미 정확했는데 모델은 문장을 다시 베낀다.
//   ② `**정답:**` `- 해설:` 처럼 라벨 하나가 장식되면 그 필드가 통째로 사라져
//      게이트가 "정답 누락"이라는 **사실과 반대되는** 피드백을 재생성 프롬프트에
//      싣는다(전체 웨이브 silent-drop 최다 계통).
// 그래서 접두는 LINE_LEAD 하나, 콜론은 LABEL_COLON 하나로만 만들고 전부 여기서 파생한다.
const LINE_LEAD = String.raw`[ \t]*\|?[ \t]*(?:[-*•][ \t]*)?(?:\*\*|__)?[ \t]*`;
const LABEL_COLON = String.raw`(?:\*\*|__)?[ \t]*[:：][ \t]*(?:\*\*|__)?[ \t]*`;
/** 라벨 본문만 주면 접두·콜론 관용이 자동으로 붙는다. */
function sectionHead(body: string, tail = "", flags = "m"): RegExp {
  return new RegExp(`^${LINE_LEAD}${body}${LABEL_COLON}${tail}`, flags);
}

// `밑줄지문:` 도 받는다 — 다른 유형(어법·어휘·반의어)이 전부 그 라벨을 쓰므로
// 교차 드리프트가 실측된다. 라벨을 못 알아보면 게이트가 "밑줄문장 누락"이라는
// 사실과 반대되는 원인을 지목한다. 흡수만 하고 '문장 하나' 계약 위반 여부는
// 게이트(MAX_MARKED_SENTENCE_LENGTH)가 자리를 지목해 반려한다.
const MARKED_LABEL = String.raw`밑줄[ \t]*(?:친[ \t]*)?(?:문장|지문)?`;
/** `오답:` · `오답 해설:` · `**오답:**` — 못 알아보면 오답 4줄이 선지로 흡수된다. */
const WRONG_LABEL = String.raw`오답[ \t]*(?:해설|선지)?`;

/** 밑줄문장이 끝나는 자리 — 선지 줄 접두가 CIRCLED/DIGIT_OPTION_LINE 과 축자로 같다. */
const SENTENCE_END_LOOKAHEAD =
  `(?=^${LINE_LEAD}(?:[①②③④⑤]|[1-5][.)][ \\t])` +
  `|^${LINE_LEAD}(?:정답|해설|${WRONG_LABEL})${LABEL_COLON}` +
  `|$(?![\\s\\S]))`;

const MARKED_SENTENCE_RE = sectionHead(MARKED_LABEL, `([\\s\\S]*?)${SENTENCE_END_LOOKAHEAD}`);
const ANSWER_RE = sectionHead("정답", String.raw`[(\[（【]?[ \t]*([①②③④⑤]|[1-5])`);
const EXPLANATION_HEAD_RE = sectionHead(
  "해설",
  `([\\s\\S]*?)(?=^${LINE_LEAD}${WRONG_LABEL}${LABEL_COLON})`,
);
const EXPLANATION_TAIL_RE = sectionHead("해설", `([\\s\\S]+)$`);
const WRONG_SPLIT_RE = sectionHead(WRONG_LABEL);
const WRONG_SPLIT_LINE_RE = sectionHead(WRONG_LABEL, "$");

// 라벨로 시작하는 줄만 선지 후보로 본다.
const CIRCLED_OPTION_LINE = new RegExp(
  `^${LINE_LEAD}([①②③④⑤])(?:\\*\\*|__)?[ \\t]*[.)]?[ \\t]*(.+)$`,
  "gm",
);
const DIGIT_OPTION_LINE = new RegExp(
  `^${LINE_LEAD}([1-5])(?:\\*\\*|__)?[ \\t]*[.)][ \\t]*(.+)$`,
  "gm",
);

function parseOptionLines(section: string): MdReferenceOption[] {
  const collect = (re: RegExp): MdReferenceOption[] =>
    [...section.matchAll(re)]
      .map((m) => ({ label: circledLabel(m[1]), text: cleanOptionText(m[2]) }))
      .filter((o) => o.label !== "" && o.text.length > 0);
  const circled = collect(CIRCLED_OPTION_LINE);
  // 원문자 선지가 다 모였으면 숫자 라벨 폴백을 켜지 않는다 — 먼저 돌리면 해설 속
  // "1) ..." 열거를 선지로 오인한다(과잉 관용 방지).
  if (circled.length >= 5) return circled;
  const digits = collect(DIGIT_OPTION_LINE);
  const have = new Set(circled.map((o) => o.label));
  const extra = digits.filter((o) => !have.has(o.label));
  if (extra.length === 0) return circled;
  // 혼합 표기(일부만 "1)")를 구제한 경우에만 라벨 순으로 정렬한다. 원문자만
  // 왔을 때는 문서 순서를 그대로 두어야 게이트의 라벨 순서 검사가 살아 있다.
  return [...circled, ...extra].sort(
    (a, b) => CIRCLED.indexOf(a.label) - CIRCLED.indexOf(b.label),
  );
}

/**
 * 선지 텍스트 위생 — 잔여 표 파이프와 잔여 라벨 접두를 걷어낸다.
 *
 * ⚠ 앞뒤를 **둘 다** 지워야 한다. 표 행 드리프트 `| ③ | 계획가들 |` 에서 라인
 * 정규식의 선두 `\|?` 는 파이프를 하나만 먹으므로 캡처에는 `| 계획가들 |` 가 남는다.
 * 종전에는 뒤 파이프만 지워 `'| 계획가들'` 이라는 **부패한 선지 텍스트**가 게이트·
 * 검증기를 전부 통과해 학생 표면과 오답해설 문구까지 오염시켰다(적대검수 critical).
 * 굵게(`**`)·밑줄(`__`)은 **지우지 않는다** — 게이트가 서식 혼입으로 반려해야 할
 * 신호라, 여기서 삼키면 그 게이트가 죽는다.
 */
function cleanOptionText(raw: string): string {
  let out = raw.trim();
  for (;;) {
    const next = out
      .replace(/^\|+[ \t]*/, "")
      .replace(/^(?:[①②③④⑤]|\(?[1-5][.)])[ \t]*/, "")
      .trim();
    if (next === out) break;
    out = next;
  }
  return out.replace(/[ \t]*\|+[ \t]*$/, "").trim();
}

/**
 * 지칭 추론 md 파싱. 드리프트 관용(정본 parseMdBlank 규약):
 * 라벨 표기 흔들림(전각 콜론·`밑줄:`), 밑줄문장 개행, 숫자 선지 라벨,
 * 오답 목록에 정답 줄을 끼워 넣는 실측 패턴.
 */
export function parseMdReference(text: string): MdReferenceQuestion {
  // 한 줄 계약이 기본이지만, 라벨 뒤 개행 드리프트를 같은 정규식이 함께 흡수한다.
  // 다음 섹션(선지·정답·해설·오답) 앞에서 멈춘다.
  const rawSentence = text.match(MARKED_SENTENCE_RE)?.[1] ?? "";
  const markedSentence = rawSentence.replace(/\s+/g, " ").trim();

  const beforeWrong = text.split(WRONG_SPLIT_RE)[0] ?? text;
  const answer = circledLabel(text.match(ANSWER_RE)?.[1] ?? "");

  const options = parseOptionLines(beforeWrong);

  const wrongSection =
    text.split(WRONG_SPLIT_LINE_RE)[1] ?? text.split(WRONG_SPLIT_RE)[1] ?? "";
  // 드리프트 관용: 오답 목록에 정답 줄을 끼워 넣는 실측 — 파서가 걸러낸다.
  // 조용한 버림이 아니다: 게이트가 남은 라벨의 **개수와 집합**을 선지·정답과
  // 대조하므로 이 필터로 생긴 결손은 전부 게이트 메시지에 드러난다.
  const wrong = parseOptionLines(wrongSection).filter((w) => w.label !== answer);

  return {
    kind: "reference",
    markedSentence,
    options,
    answer,
    explanation:
      text.match(EXPLANATION_HEAD_RE)?.[1]?.trim() ??
      text.match(EXPLANATION_TAIL_RE)?.[1]?.trim() ??
      "",
    wrong,
  };
}

// ── 마커 해석 ────────────────────────────────────────────────────────────────

export interface MdReferenceTarget {
  /** 마커 앞 축자 텍스트(마커 제거본 기준) */
  before: string;
  /** 표적 대명사 — 마커 안 축자에서 앞뒤 비알파벳을 떼어낸 것 */
  pronoun: string;
  /** 마커 뒤 축자 텍스트 */
  after: string;
  /** 인식된 마커 개수 — 1이 아니면 게이트가 반려한다 */
  markCount: number;
}

interface RawMark {
  index: number;
  length: number;
  inner: string;
}

function collectMarks(sentence: string): RawMark[] {
  const primary = [...sentence.matchAll(INLINE_REFERENCE_MARK_RE)].map((m) => ({
    index: m.index ?? 0,
    length: m[0].length,
    inner: String(m[2] ?? "").trim(),
  }));
  if (primary.length > 0) return primary;
  for (const re of FALLBACK_MARK_RES) {
    const alt = [...sentence.matchAll(re)].map((m) => ({
      index: m.index ?? 0,
      length: m[0].length,
      inner: String(m[1] ?? "").trim(),
    }));
    if (alt.length > 0) return alt;
  }
  return [];
}

/** 마커를 걷어낸 순수 문장으로 되돌린다(축자 대조·진단 인용용). */
export function stripReferenceMarks(sentence: string): string {
  const marks = collectMarks(sentence);
  if (marks.length === 0) return sentence;
  let out = "";
  let cursor = 0;
  for (const mark of marks) {
    out += sentence.slice(cursor, mark.index) + mark.inner;
    cursor = mark.index + mark.length;
  }
  return out + sentence.slice(cursor);
}

/**
 * 밑줄문장에서 표적을 해석한다. `[[them,]]` 처럼 구두점을 함께 감싼 드리프트는
 * 대명사에서 떼어 before/after 로 되돌린다 — 마커 안이 대명사 한 단어라는 계약을
 * 파서가 흡수하고, 어긋난 것은 게이트가 지목한다.
 */
export function referenceTargetOf(markedSentence: string): MdReferenceTarget {
  const sentence = markedSentence.trim();
  const marks = collectMarks(sentence);
  if (marks.length === 0) {
    return { before: sentence, pronoun: "", after: "", markCount: 0 };
  }
  const first = marks[0];
  const before = sentence.slice(0, first.index);
  const after = stripReferenceMarks(sentence.slice(first.index + first.length));
  const inner = first.inner;
  const lead = inner.match(/^[^A-Za-z]*/)?.[0] ?? "";
  const trail = inner.slice(lead.length).match(/[^A-Za-z]*$/)?.[0] ?? "";
  const pronoun = inner.slice(lead.length, inner.length - trail.length);
  return {
    before: before + lead,
    pronoun,
    after: trail + after,
    markCount: marks.length,
  };
}

// ── 원문 좌표 확정 ───────────────────────────────────────────────────────────
// 모델이 지문을 옮겨 적을 때 곱슬따옴표·대시·말줄임·공백을 정규화하는 것은 실측된
// 상수다(정본 normalizeWs 주석 #10). 정규화 비교로는 "있다/없다"만 알 수 있고
// **원문 인덱스**를 못 얻으므로, 그 변종들을 문자 클래스로 흡수하는 느슨한 정규식을
// 세워 원문 위에서 직접 매칭한다 — 좌표가 그대로 나온다.

function looseSource(text: string): string {
  let out = "";
  for (const ch of text.replace(/\.\.\./g, "…")) {
    if (/\s/.test(ch)) {
      out += "\\s+";
    } else if ("'‘’ʼ".includes(ch)) {
      out += "['‘’ʼ]";
    } else if ('"“”'.includes(ch)) {
      out += '["“”]';
    } else if ("-–—".includes(ch)) {
      out += "[-–—]";
    } else if (ch === "…") {
      out += "(?:…|\\.\\.\\.)";
    } else {
      out += escapeRegExp(ch);
    }
  }
  return out;
}

export interface MdReferenceLocation {
  /** 원문에서 대명사가 시작하는 인덱스 */
  index: number;
  /** 원문 축자 기준 대명사 길이 */
  length: number;
  /** 밑줄문장 전체가 차지하는 원문 구간 */
  spanStart: number;
  spanEnd: number;
  /** 원문에서 이 문장이 몇 번 나오는가 — 2 이상이면 자리가 유일하지 않다 */
  matchCount: number;
  /** 대소문자를 완화해야 찾아진 경우(스냅 대상) */
  caseRelaxed: boolean;
}

/**
 * 밑줄문장 + 마커 오프셋 → 원문 좌표. 대명사 앞뒤에 단어 경계를 강제하므로
 * 단어 내부(art"is"ts)에 자리가 잡히는 일이 구조적으로 불가능하다.
 */
export function locateReferenceTarget(
  passage: string,
  target: MdReferenceTarget,
): MdReferenceLocation | null {
  if (!target.pronoun.trim() || !passage) return null;
  const pattern =
    `(${looseSource(target.before)})` +
    `(?<![A-Za-z])(${looseSource(target.pronoun)})(?![A-Za-z])` +
    `(${looseSource(target.after)})`;
  for (const flags of ["g", "gi"]) {
    let re: RegExp;
    try {
      re = new RegExp(pattern, flags);
    } catch {
      return null;
    }
    const matches = [...passage.matchAll(re)];
    if (matches.length === 0) continue;
    const m = matches[0];
    const start = m.index ?? 0;
    return {
      index: start + m[1].length,
      length: m[2].length,
      spanStart: start,
      spanEnd: start + m[0].length,
      matchCount: matches.length,
      caseRelaxed: flags === "gi",
    };
  }
  return null;
}

/**
 * 후처리(processReference)가 **우리와 같은 자리**를 집도록 문맥 창을 만든다.
 *
 * 후처리는 `findWordInPassage(passage, pronoun, surroundingText, strictContext=true)`
 * 를 쓰는데, 그 구현은 창을 원문에서 indexOf 로 찾은 뒤 **창 안의 첫 단어경계
 * 일치**를 채택한다. 그래서 창 왼쪽에 같은 대명사가 하나라도 더 있으면 엉뚱한
 * 출현이 밑줄 처리된다 — 창의 왼쪽 끝을 그 마지막 등장 뒤로 밀어 우리 자리를
 * 창의 첫 등장으로 만든다. (게이트와 어댑터가 이 함수 하나를 공유해야 두 면이
 * 어긋날 수 없다 — 1차 승차분 orderDisplayParagraphs 와 같은 원칙.)
 */
export function buildReferenceContext(
  passage: string,
  index: number,
  length: number,
  pad = 45,
): string {
  if (index < 0 || length <= 0 || index + length > passage.length) return "";
  const pronoun = passage.slice(index, index + length);
  let start = Math.max(0, index - pad);
  const lead = passage.slice(start, index);
  let lastEnd = -1;
  try {
    const re = new RegExp(
      `(?<![A-Za-z0-9_])${escapeRegExp(pronoun)}(?![A-Za-z0-9_])`,
      "gi",
    );
    for (const m of lead.matchAll(re)) {
      lastEnd = (m.index ?? 0) + m[0].length;
    }
  } catch {
    return "";
  }
  if (lastEnd >= 0) start += lastEnd;
  // 단어 중간 절단 방지 — 앞은 다음 경계까지 밀고, 선행 공백은 버린다.
  while (
    start < index &&
    start > 0 &&
    /[A-Za-z0-9]/.test(passage[start - 1]) &&
    /[A-Za-z0-9]/.test(passage[start])
  ) {
    start += 1;
  }
  while (start < index && /\s/.test(passage[start])) start += 1;

  let end = Math.min(passage.length, index + length + pad);
  while (
    end > index + length &&
    end < passage.length &&
    /[A-Za-z0-9]/.test(passage[end - 1]) &&
    /[A-Za-z0-9]/.test(passage[end])
  ) {
    end -= 1;
  }
  while (end > index + length && /\s/.test(passage[end - 1])) end -= 1;
  return passage.slice(start, end);
}

/** 창이 정말 그 자리를 지목하는지 후처리 규칙 그대로 재현해 검산한다. */
export function referenceContextResolves(
  passage: string,
  context: string,
  index: number,
  length: number,
): boolean {
  if (!context) return false;
  const ctxIdx = passage.indexOf(context);
  if (ctxIdx < 0) return false;
  const slice = passage.slice(ctxIdx, ctxIdx + context.length);
  const pronoun = passage.slice(index, index + length);
  const body = `(?<![A-Za-z0-9_])${escapeRegExp(pronoun)}(?![A-Za-z0-9_])`;
  for (const flags of ["", "i"]) {
    let m: RegExpExecArray | null = null;
    try {
      m = new RegExp(body, flags).exec(slice);
    } catch {
      return false;
    }
    if (m) return ctxIdx + m.index === index;
  }
  return false;
}

// ── 0원 자동 보정 ────────────────────────────────────────────────────────────

/**
 * 밑줄문장을 원문 축자로 되돌린다. 보수 가드: **자리가 확정된 경우에만** 손댄다
 * (자리를 못 찾으면 그대로 두고 게이트가 반려하게 한다 — 정본 규약).
 * 흡수 대상: 곱슬따옴표·대시·말줄임 정규화, 공백·개행 접힘, 문장 첫 글자 대소문자.
 */
export function autoSnapReference(
  q: MdReferenceQuestion,
  passage: string,
): { question: MdReferenceQuestion; corrections: string[] } {
  const corrections: string[] = [];
  const target = referenceTargetOf(q.markedSentence);
  if (target.markCount !== 1 || !target.pronoun) return { question: q, corrections };
  const loc = locateReferenceTarget(passage, target);
  if (!loc) return { question: q, corrections };

  const rebuilt = (
    passage.slice(loc.spanStart, loc.index) +
    `[[${passage.slice(loc.index, loc.index + loc.length)}]]` +
    passage.slice(loc.index + loc.length, loc.spanEnd)
  )
    .replace(/\s+/g, " ")
    .trim();
  // 축자 동일이면 손대지 않는다. normalizeWs 동치로 넘기면 안 된다 — 곱슬따옴표·
  // 대시 드리프트가 바로 그 정규화에 흡수되어, 복원해야 할 차이가 "차이 없음"으로
  // 보이기 때문이다(이 스냅의 존재 이유가 사라진다).
  if (rebuilt === q.markedSentence) return { question: q, corrections };
  corrections.push("밑줄문장을 지문 축자로 보정(구두점·대소문자·공백 드리프트)");
  return { question: { ...q, markedSentence: rebuilt }, corrections };
}
