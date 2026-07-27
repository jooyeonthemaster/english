// ============================================================================
// 문법 오류 수정(GRAMMAR_CORRECTION) md 파서.
// 견본: parser-antonym.ts · parser-vocab.ts / 규약 답습:
//   파서는 관대하게(드리프트 흡수) · 게이트는 엄격하게.
//
// 0원 결정형 게이트는 **gate-grammar-correction.ts**, 0원 자동보정은
// **snap-grammar-correction.ts** 로 분리했다(규범의 "400줄에서 분할" 조항 —
// vocab·combo·order 선례). 의존 방향은 gate·snap → parser 단방향이다
// (여기서 그것들을 재수출하면 순환 import 가 된다 — 하지 마라).
//
// ── 진실원 구조 ────────────────────────────────────────────────────────────
//  · 밑줄지문의 마커 안 텍스트 = displayedText(학생이 보는 변형본).
//  · `고침(X):` 줄 = 그 자리의 (틀린 표현, 올바른 표현) 두 칸.
//  · sourceText(원문 축자 구간)는 **받지 않고 코드가 복원한다** —
//    displayedText 안의 틀린 표현 1회를 올바른 표현으로 되돌린 것이 sourceText 다.
//    이 복원본을 마커 자리에 되꽂아 원 지문과 대조하는 것이 최강 게이트다.
//
// ── 장식(마크다운 강조)은 공유 유틸 **하나로만** 처리한다 (규범 §1-B 철칙 3) ─
//  종전 이 파일은 EMPH·DECOR·LABEL_TAIL·SECTION_TAIL·ITEM_TAIL 5종 머리표 상수와
//  stripWrap·dropOrphanEmphasis 2종 값 세척기를 **자체 보유**했고, 그 각각이 서로
//  다른 부분집합만 처리했다. 한쪽만 넓힌 비대칭이 곧 사고였다 — 굵게 헤더
//  (`**고침:**`)·꼬리 공백 한 칸에 고침·허용답이 통째로 사라지고 게이트가
//  "(A) 고침 줄 없음" 이라는 **사실과 다른 원인**을 지목했다(그 문구가 그대로
//  [반려 재생성] 피드백이 된다). 허용답 쪽은 쓰레기 `**` 가 채점 집합까지 저장됐다.
//  → 머리표는 `keywordLineRe`, 값 세척은 `cleanMdValue`, 섹션 절단은
//    `sliceKeywordSection` 으로 단일화했다. 이 파일에 남은 것은 장식 처리가 아니라
//    **이 유형 고유 규칙**뿐이다:
//      · 라벨 접두 제거(`고침(A):` 의 `(A)`) — takeLabelPrefix
//      · 마커 경계 장식(`**[[A:…]]**`) — 위치 한정이라 값 세척기 대상이 아니다
//      · 키워드 줄 인정 조건(구분자 또는 라벨 필수) — 한국어 해설 산문 보호
//      · 지문 경계의 일반형 드리프트 줄(계약 밖 한글 라벨 줄·수평선)
//
// ⚠ 정본 INLINE_MARK_RE 를 재사용하지 않는다 — 전역 정규식은 lastIndex 를
//   공유한다(견본 parser-antonym 과 동일 판단). 로컬 상수를 따로 선언한다.
// ⚠ 어법(GRAMMAR_ERROR)의 "변형된 마커 수 == 정답 수" 를 복사하면 안 된다.
//   이 유형은 **모든 마커가 변형본**이다(후처리가 isError=true 를 전 구간에
//   요구한다). 계약이 반대다.
// ============================================================================

import { escapeRegExp } from "./parser";
import { cleanMdValue, keywordLineRe, sliceKeywordSection } from "./decoration";

/**
 * 전역 정규식 — matchAll·replace 전용(exec/test 는 lastIndex 상태를 남긴다).
 * 라벨 폭은 설정 상한(5)보다 넓은 [A-J] 다 — 모델이 6개 이상을 마킹해도 조용히
 * 버리지 않고 게이트가 "밑줄 마커 N개" 로 지목하게 하기 위함이다(철칙 3).
 *
 * 표기 관용: 소문자 `[[a:…]]` · 라벨 앞뒤 공백 · 괄호 라벨 `[[(A):…]]` · 전각
 * 콜론 `[[A：…]]`. 고침 줄 라벨은 소문자를 관용하면서 마커만 대문자·무공백으로
 * 막아 두면, 표기가 한 번 흔들리는 순간 **밑줄이 통째로 사라지고** 게이트에는
 * "밑줄 마커 0개" 라는 개수 오류로만 보인다 — 철칙 3 이 금지한 조용한 유실이다.
 */
export const INLINE_CORRECTION_MARK_RE =
  /\[\[\s*[([]?\s*([A-Ja-j])\s*[)\]]?\s*[:：]\s*((?:(?!\]\]).)+)\]\]/g;

const LABEL_KEYS = "ABCDEFGHIJ";

/** 마커 라벨 캡처를 저장 축("(A)" 대문자)으로 정규화한다. */
export function correctionMarkLabel(raw: string): string {
  return `(${raw.trim().toUpperCase()})`;
}

export interface MdCorrectionSegment {
  /** "(A)"~"(J)" — 후처리 grammarCorrectionLabel 과 같은 대문자 축 */
  label: string;
  /** 마커 안 텍스트 = 학생에게 보이는 변형본(displayedText) */
  displayedText: string;
  /** 변형본 안에 숨긴 틀린 표현 */
  errorPart: string;
  /** 원문에 있던 올바른 표현(= 학생이 써야 하는 답) */
  correctedPart: string;
  /** 채점 동치 허용답(T8a). 비어 있으면 채점이 correctedPart 단일 정답으로 폴백. */
  acceptedAnswers: string[];
}

export interface MdGrammarCorrectionQuestion {
  kind: "grammarCorrection";
  /** [[A:변형본]] 로 마킹된 지문 전체 */
  markedPassage: string;
  segments: MdCorrectionSegment[];
  /**
   * 고침 줄에서 실제로 읽은 라벨(등장 순, 중복 포함).
   * 마커에 없는 유령 라벨·중복 라벨을 게이트가 **지목**하기 위한 진단 필드다 —
   * 세그먼트를 마커 기준으로만 만들면 그런 줄이 조용히 사라진다(철칙 3).
   */
  fixLabels: string[];
  explanation: string;
}

function parenLabel(raw: string): string {
  const key = raw.trim().replace(/[()[\].:]/g, "").toUpperCase();
  return key.length === 1 && LABEL_KEYS.includes(key) ? `(${key})` : "";
}

// ── 키워드 줄 (머리표·값 장식은 전부 공유 유틸이 흡수한다) ──────────────────
/** 이 파서가 인식하는 키워드 줄 전부. */
const PASSAGE_KEY = "밑줄지문";
const FIX_KEY = "고침";
const ACCEPTED_KEY = "허용답";
const EXPLANATION_KEY = "해설";
/**
 * `정답`·`오답` 은 이 유형 계약에 **없다**(철칙 1 — 정답은 고침 줄이 이미 말한다).
 * 그래도 모델이 습관적으로 끼워 넣으므로 **경계로만** 인식한다 — 모르는 채로 두면
 * 그 줄이 지문·섹션에 흡수돼 거짓 "지문 재구성 불일치" 가 붙는다(2기 major).
 */
const ALL_KEYWORDS: readonly string[] = [
  PASSAGE_KEY,
  FIX_KEY,
  ACCEPTED_KEY,
  EXPLANATION_KEY,
  "정답",
  "오답",
];
/** 라벨(`(A)`)을 달고 오는 키워드 — 값 선두의 라벨 접두를 떼어낸다. */
const LABELED_KEYWORDS: ReadonlySet<string> = new Set([FIX_KEY, ACCEPTED_KEY]);
/** 머리표 정규식은 키워드마다 한 번만 만든다(비전역 = lastIndex 무상태). */
const HEAD_RE_BY_KEYWORD: ReadonlyMap<string, RegExp> = new Map(
  ALL_KEYWORDS.map((k) => [k, keywordLineRe(k)]),
);
/**
 * 키워드가 없는 줄의 **머리 장식만** 벗기는 공유 규칙(불릿·인용·헤딩·표 파이프·
 * 강조). 섹션 안 라벨 항목(`- **(A):** reduces → reduce`)을 읽을 때 쓴다 —
 * 여기서 자체 DECOR 상수를 다시 만들면 관용 폭이 키워드 줄과 갈라진다.
 */
const LINE_LEAD_RE = keywordLineRe("");

/** 자기 자신을 뺀 정지 키워드 — 섹션 절단에 **빠짐없이** 넘긴다. */
function stopsExcept(keyword: string): string[] {
  return ALL_KEYWORDS.filter((k) => k !== keyword);
}

/**
 * 값 선두의 **라벨 접두**를 떼어낸다(장식은 이미 cleanMdValue 가 벗겼다).
 * `(A): x` · `[A]: x` · `A: x` · `A) x` · `A. x` · `(A) x`(콜론 없는 섹션 항목) ·
 * `(A) | x`(표 행).
 *
 * ⚠ 라벨 뒤 경계를 **반드시** 요구한다. 요구하지 않으면 `고침: is → are` 의 `i`,
 *   `허용답: a | b` 의 `a` 를 라벨로 오인해 값을 통째로 잘라먹는다.
 */
function takeLabelPrefix(value: string): { label: string; rest: string } {
  const bracketed = /^[([]\s*([A-Ja-j])\s*[)\]]\s*[:：|]?\s*/.exec(value);
  if (bracketed) return { label: bracketed[1], rest: value.slice(bracketed[0].length) };
  const bare = /^([A-Ja-j])\s*(?:[)\]]\s*[:：|]?|[:：]|\.(?=\s))\s*/.exec(value);
  if (bare) return { label: bare[1], rest: value.slice(bare[0].length) };
  return { label: "", rest: value };
}

interface KeywordLine {
  /** 라벨 캡처 원문(라벨이 없거나 라벨을 달지 않는 키워드면 "") */
  label: string;
  /** cleanMdValue 를 통과한 값. "" 면 값 없는 섹션 헤더(`고침:` · `## 고침`). */
  value: string;
}

/**
 * 키워드 줄을 읽는다. null 이면 그 줄은 이 키워드의 줄이 **아니다**.
 *
 * 공유 `keywordLineRe` 는 콜론 없는 헤딩(`## 고침`)까지 관용한다 — 그대로 경계로
 * 쓰면 `고침이 필요한 이유는…` 같은 **한국어 산문**이 키워드 줄로 오인돼 해설이
 * 그 줄에서 통째로 잘린다(이 유형의 해설은 한국어다). → 키워드 뒤에 구분자
 * (`:`·`：`·`|`)가 실제로 있거나 · 값이 아예 없는 헤딩형이거나 · 라벨(`고침(A):`)이
 * 붙은 줄만 키워드 줄로 인정한다. **장식 흡수는 전부 공유 유틸이 한 뒤**의 판정이라
 * 관용 폭이 라벨마다 갈라지지 않는다.
 */
function readKeywordLine(line: string, keyword: string): KeywordLine | null {
  const m = HEAD_RE_BY_KEYWORD.get(keyword)?.exec(line);
  if (!m) return null;
  const raw = m[1] ?? "";
  // 머리표가 실제로 먹은 구간 = 매치 전체에서 값(캡처 그룹 1)을 뺀 앞부분.
  const head = m[0].slice(0, m[0].length - raw.length);
  const tail = head.slice(head.lastIndexOf(keyword) + keyword.length);
  const cleaned = cleanMdValue(raw);
  if (!cleaned) return { label: "", value: "" };
  // 표 행(`| 고침 | reduces → reduce |`)은 값 선두의 파이프가 구분자다 —
  // 공유 머리표는 콜론만 먹으므로 여기서 받는다(라벨 없는 표 행이 유실되던 자리).
  const piped = /^\|\s*/.exec(cleaned);
  const value = piped ? cleaned.slice(piped[0].length) : cleaned;
  const taken = LABELED_KEYWORDS.has(keyword)
    ? takeLabelPrefix(value)
    : { label: "", rest: value };
  if (!/[:：|]/.test(tail) && !piped && !taken.label) return null;
  // 라벨 접두를 떼어낸 **나머지도** 다시 세척한다 — `고침: **(B)** reduces` 처럼
  // 라벨이 장식에 감싸인 경우, 접두 제거 후 짝 잃은 표식이 값 선두에 눌어붙는다
  // (26-07-27 재검증 실측 · 반쪽 관용은 이번 웨이브 지배 결함 계통).
  return { label: taken.label, value: cleanMdValue(taken.rest) };
}

function isCorrectionKeywordLine(line: string, keyword: string): boolean {
  return readKeywordLine(line, keyword) !== null;
}

/**
 * 해설 전용 섹션 절단 — 하는 일은 공유 `sliceKeywordSection` 과 같고, **경계 판정만**
 * 위의 `readKeywordLine`(구분자 또는 라벨 필수)으로 바꾼다. 공유판은 콜론 없는
 * 헤딩까지 경계로 보는데, 이 유형의 해설은 한국어 산문이라 그 관용을 그대로 쓰면
 * "고침이 필요한 이유는…" · "정답은 …" 같은 정상 문장에서 해설이 잘린다.
 * 장식 처리는 여전히 전부 공유 유틸 소관이다 — 여기서 다시 만드는 것은 **경계
 * 정책**뿐이다(영어 지문에는 이 위험이 없으므로 밑줄지문은 공유판을 그대로 쓴다).
 */
function sliceKoreanSection(
  text: string,
  keyword: string,
  stopKeywords: readonly string[],
): string {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => isCorrectionKeywordLine(l, keyword));
  if (start < 0) return "";
  const body: string[] = [];
  const head = readKeywordLine(lines[start], keyword);
  if (head?.value) body.push(head.value);
  for (let i = start + 1; i < lines.length; i += 1) {
    if (stopKeywords.some((kw) => isCorrectionKeywordLine(lines[i], kw))) break;
    body.push(lines[i]);
  }
  return body.join("\n").trim();
}

/**
 * 지문 흡수를 막는 **일반형** 경계 — 계약 밖 한글 라벨 줄(`포인트: (d)수일치` ·
 * `출제 의도: …`)과 수평선(`---`·`***`).
 * 키워드 **목록만** 아는 경계는 그 사이에 오는 어떤 줄이든 지문에 흡수해, 지문을
 * 한 글자도 안 건드린 출력에도 거짓 "지문 재구성 불일치" 를 100% 붙인다 — 그 문구가
 * 피드백이 되면 모델은 멀쩡한 지문을 고치라는 지시만 받는다(2기 major).
 * 지문은 영어이므로 이 두 규칙에 절대 걸리지 않는다.
 */
const KOREAN_LABEL_LINE_RE = /^[가-힣][^\n:：]{0,14}[:：]/;
const HORIZONTAL_RULE_RE = /^\s*(?:[-*_=]\s*){3,}$/;

function isPassageDriftLine(line: string): boolean {
  if (HORIZONTAL_RULE_RE.test(line)) return true;
  return KOREAN_LABEL_LINE_RE.test(cleanMdValue(LINE_LEAD_RE.exec(line)?.[1] ?? line));
}

function cutPassageAtDrift(body: string): string {
  const lines = body.split(/\r?\n/);
  const at = lines.findIndex(isPassageDriftLine);
  return (at < 0 ? lines : lines.slice(0, at)).join("\n").trim();
}

/**
 * 마커 경계에 딱 붙은 장식(`**[[A:구간]]**` · `__[[A:…]]` · `[[A:…]]**`).
 * 그대로 두면 재구성본에 `**` 가 남아 지문 대조가 어긋나고, 게이트는 지문을 한
 * 글자도 안 건드린 출력에 "마커 밖 텍스트가 원문과 다르다" 는 **거짓 지적**을
 * 낸다(모델은 밑줄을 굵게 표시했을 뿐이다). 지문 산문에 `[[`·`]]` 가 붙은
 * 굵게 표기가 있을 수 없으므로 짝이 안 맞는 한쪽도 함께 벗긴다.
 *
 * ⚠ 지문 **전체**에 stripEmphasis 를 걸지 않는 이유: 원문에 실재하는 `*`·`_` 까지
 *   지워 버리면 지문을 그대로 옮긴 출력이 축자 대조에서 어긋난다(과잉 차단).
 *   여기는 값 세척이 아니라 **위치 한정** 규칙이라 공유 유틸 소관이 아니다.
 */
// 표식 집합은 공유 유틸(decoration.ts EMPHASIS_RUN)과 동일해야 한다 — 손으로 쓴
// 부분집합이 이번 웨이브 반복 결함의 근인이었다. 백틱까지 포함한다.
const MARK_LEAD_EMPH_RE = /(?:\*{1,3}|_{1,3}|~{1,2}|`{1,3})+(?=\[\[)/g;
const MARK_TAIL_EMPH_RE = /(?<=\]\])(?:\*{1,3}|_{1,3}|~{1,2}|`{1,3})+/g;

/** 실질 문자가 있는 값인가(장식·구분자만 남은 껍데기는 채점 집합에 들어가면 안 된다). */
const SUBSTANTIVE_RE = /[^\s*_~`"'|]/;

/**
 * `틀린 표현 → 올바른 표현` 을 분리한다.
 * 화살표 계열을 1순위로 보고, 파이프·공백대시는 폴백이다 — 표현 자체에 하이픈이
 * 들어가도(well-being 류) 공백 경계 덕에 안전하게 갈린다.
 * 두 칸은 **저장·표시로 나가는 값**이므로 cleanMdValue 로 세척한다.
 */
export function splitCorrectionPair(
  segment: string,
): { errorPart: string; correctedPart: string } | null {
  const body = segment.replace(/\s*\|\s*$/, "").trim();
  const patterns = [
    /^([\s\S]+?)\s*(?:→|⟶|⇒|➔|➞|-->|->|=>)\s*([\s\S]+)$/,
    /^([\s\S]+?)\s*\|\s*([\s\S]+)$/,
    /^([\s\S]+?)\s+[-–—]\s+([\s\S]+)$/,
  ];
  for (const re of patterns) {
    const m = re.exec(body);
    if (!m) continue;
    const errorPart = cleanMdValue(m[1]);
    const correctedPart = cleanMdValue(m[2]);
    // 장식만 남은 껍데기는 값이 아니다 — 통과시키면 거짓 사유를 낳는다.
    if (SUBSTANTIVE_RE.test(errorPart) && SUBSTANTIVE_RE.test(correctedPart)) {
      return { errorPart, correctedPart };
    }
  }
  return null;
}

function parseAcceptedValues(raw: string): string[] {
  return raw
    .replace(/\s*\|\s*$/, "")
    .split("|")
    .map((part) => cleanMdValue(part))
    .filter((part) => SUBSTANTIVE_RE.test(part));
}

interface CorrectionKeyLine {
  kind: "fix" | "accepted";
  /** 라벨 캡처 원문(라벨이 없으면 "") */
  label: string;
  value: string;
}

/**
 * `고침`·`허용답` 키워드 줄을 줄 단위로 관대하게 수집한다.
 * 값이 붙은 한 줄 형태와, `고침:` 섹션 헤더 아래 라벨 항목이 나열되는 형태를
 * 모두 받는다 — 후자를 못 읽으면 고침 줄 전량이 조용히 사라지고 게이트에는
 * "(A) 고침 줄 없음" 만 보여 진짜 원인(섹션 헤더형 표기)이 은폐된다.
 *
 * 값 줄과 섹션 헤더를 **같은 정규식 한 번**으로 가른다(값이 비면 헤더). 종전에는
 * 둘을 다른 상수로 따로 시험하다 시험 순서에 따라 `**고침:**` 의 닫는 `**` 나 꼬리
 * 공백 한 칸이 값으로 잡혀 헤더가 값 줄로 오인됐고, section 이 리셋돼 뒤따르는
 * 항목이 한 건도 수집되지 않았다(2기 major — 고침 전량 유실·채점 집합 오염).
 */
function collectCorrectionKeyLines(text: string): CorrectionKeyLine[] {
  const out: CorrectionKeyLine[] = [];
  let section: "fix" | "accepted" | null = null;
  for (const rawLine of text.split(/\r?\n/)) {
    const keyed = ([
      ["fix", FIX_KEY],
      ["accepted", ACCEPTED_KEY],
    ] as const)
      .map(([kind, keyword]) => ({ kind, line: readKeywordLine(rawLine, keyword) }))
      .find((entry) => entry.line !== null);
    if (keyed?.line) {
      // 값이 없으면 섹션 헤더 — 아래에 라벨 항목이 나열된다.
      if (!keyed.line.value) section = keyed.kind;
      else {
        section = null;
        out.push({ kind: keyed.kind, label: keyed.line.label, value: keyed.line.value });
      }
      continue;
    }
    if (!section) continue;
    // 다른 키워드 줄이 시작되면 항목 수집을 멈춘다. **모르는 줄은 종료 신호가
    // 아니다** — `포인트: 수일치` 한 줄에 뒤따르는 `- (B) …` 가 통째로 버려지면
    // 게이트가 "(B) 고침 줄 없음" 이라는 거짓 사유를 낸다.
    if (ALL_KEYWORDS.some((kw) => isCorrectionKeywordLine(rawLine, kw))) {
      section = null;
      continue;
    }
    // 섹션 안 항목 — 라벨이 있어야 항목이다. 라벨을 요구하지 않으면
    // `A row of young saplings…` 같은 지문 산문이 항목으로 오인된다.
    const item = takeLabelPrefix(cleanMdValue(LINE_LEAD_RE.exec(rawLine)?.[1] ?? rawLine));
    if (item.label && item.rest) {
      out.push({ kind: section, label: item.label, value: item.rest });
    }
  }
  return out;
}

/**
 * 문법 오류 수정 md 파싱. 드리프트 관용(정본 규약):
 * 섹션 라벨 장식(불릿·굵게·언더스코어·백틱·인용·헤딩·표 행), 굵게 헤더의 닫는
 * 장식이 값으로 새는 형태, 전각 콜론·꼬리 공백, 라벨 괄호 누락·소문자, 화살표
 * 표기 흔들림, `고침:` 섹션 헤더형, 라벨 없는 구형 `고침:` 단일 줄.
 */
export function parseMdGrammarCorrection(text: string): MdGrammarCorrectionQuestion {
  const markedPassage = cutPassageAtDrift(
    sliceKeywordSection(text, PASSAGE_KEY, stopsExcept(PASSAGE_KEY)),
  )
    .replace(MARK_LEAD_EMPH_RE, "")
    .replace(MARK_TAIL_EMPH_RE, "");

  const fixByLabel = new Map<string, { errorPart: string; correctedPart: string }>();
  const fixLabels: string[] = [];
  let legacyFix: { errorPart: string; correctedPart: string } | null = null;
  const acceptedByLabel = new Map<string, string[]>();
  let legacyAccepted: string[] | null = null;

  for (const line of collectCorrectionKeyLines(text)) {
    const label = line.label ? parenLabel(line.label) : "";
    if (line.kind === "fix") {
      const pair = splitCorrectionPair(line.value);
      if (!pair) continue;
      if (label) {
        fixLabels.push(label);
        if (!fixByLabel.has(label)) fixByLabel.set(label, pair);
      } else if (!legacyFix) {
        legacyFix = pair;
      }
      continue;
    }
    const values = parseAcceptedValues(line.value);
    if (values.length === 0) continue;
    if (label) {
      if (!acceptedByLabel.has(label)) acceptedByLabel.set(label, values);
    } else if (!legacyAccepted) {
      legacyAccepted = values;
    }
  }

  // 세그먼트의 진실원은 **마커**다 — 고침 줄이 없어도 자리를 남겨 게이트가
  // "(B) 고침 줄 없음" 을 지목할 수 있게 한다(줄 유실 은폐 금지).
  const marks = [...markedPassage.matchAll(INLINE_CORRECTION_MARK_RE)];
  const segments: MdCorrectionSegment[] = marks.map((m, index) => {
    const label = correctionMarkLabel(m[1]);
    const pair =
      fixByLabel.get(label) ??
      // 라벨 없는 구형 `고침:` 줄은 첫 밑줄에 귀속한다(라벨 줄이 하나도 없을 때만).
      (index === 0 && fixByLabel.size === 0 && legacyFix ? legacyFix : undefined);
    const accepted =
      acceptedByLabel.get(label) ??
      (index === 0 && acceptedByLabel.size === 0 && legacyAccepted
        ? legacyAccepted
        : []);
    return {
      label,
      // 학생 표면으로 그대로 나가는 값이다(PASSTHROUGH — 후처리가 씻어 주지 않는다).
      displayedText: cleanMdValue(m[2]),
      errorPart: pair?.errorPart ?? "",
      correctedPart: pair?.correctedPart ?? "",
      acceptedAnswers: accepted,
    };
  });

  return {
    kind: "grammarCorrection",
    markedPassage,
    segments,
    fixLabels,
    explanation: cleanMdValue(
      sliceKoreanSection(text, EXPLANATION_KEY, stopsExcept(EXPLANATION_KEY)),
    ),
  };
}

/** 밑줄지문의 마커를 라벨→변형본으로 수집한다(지문 등장 순). */
export function collectCorrectionMarks(
  markedPassage: string,
): { label: string; shown: string }[] {
  return [...markedPassage.matchAll(INLINE_CORRECTION_MARK_RE)].map((m) => ({
    label: correctionMarkLabel(m[1]),
    shown: cleanMdValue(m[2]),
  }));
}

/**
 * 밑줄 구간의 **원문 축자본(sourceText)** 복원 — 변형본에서 틀린 표현 1회를
 * 올바른 표현으로 되돌린다. 틀린 표현이 0회 또는 2회 이상이면 자리가 유일하지
 * 않으므로 null(게이트가 그 사실을 지목한다).
 */
export function deriveCorrectionSourceText(
  segment: MdCorrectionSegment,
): string | null {
  const { displayedText, errorPart, correctedPart } = segment;
  if (!displayedText || !errorPart || !correctedPart) return null;
  const hits = [...displayedText.matchAll(wordBoundaryGlobal(errorPart))];
  if (hits.length !== 1) return null;
  const hit = hits[0];
  const at = hit.index ?? 0;
  return (
    displayedText.slice(0, at) + correctedPart + displayedText.slice(at + hit[0].length)
  );
}

/**
 * 마커를 각 자리의 **복원 원문**으로 되돌린 재구성 지문 — 최강 게이트의 입력.
 *
 * `opts.unresolved` 를 주면 복원 실패 자리를 그 문자열(보통 센티널)로 치환한다.
 * 기본값(변형본 되꽂기)으로 대조하면 복원 실패 자리 때문에 재구성이 **반드시**
 * 어긋나, 지문을 한 글자도 안 건드린 출력에도 "마커 밖 텍스트가 원문과 다르다"
 * 는 거짓 지적이 항상 따라붙는다 — 게이트는 센티널 모드로 부분 대조하라.
 */
export function reconstructCorrectionPassage(
  q: MdGrammarCorrectionQuestion,
  opts?: { unresolved?: string },
): string {
  let out = "";
  let cursor = 0;
  let index = 0;
  for (const m of q.markedPassage.matchAll(INLINE_CORRECTION_MARK_RE)) {
    const at = m.index ?? 0;
    const segment = q.segments[index];
    index += 1;
    const restored = segment
      ? (deriveCorrectionSourceText(segment) ??
        opts?.unresolved ??
        segment.displayedText)
      : cleanMdValue(m[2]);
    out += q.markedPassage.slice(cursor, at) + restored;
    cursor = at + m[0].length;
  }
  return out + q.markedPassage.slice(cursor);
}

function wordBoundaryGlobal(expr: string): RegExp {
  const body = escapeRegExp(expr.trim()).replace(/\s+/g, "\\s+");
  return new RegExp(`(?<![A-Za-z])${body}(?![A-Za-z])`, "g");
}
