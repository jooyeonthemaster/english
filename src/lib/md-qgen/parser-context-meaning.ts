// ============================================================================
// 문맥 속 의미(CONTEXT_MEANING) md 파서 · 0원 스냅.
// 견본: parser-antonym.ts / 게이트는 gate-context-meaning.ts (400줄 규칙 분할)
//
// 정본 규약 답습: **파서는 관대하게(드리프트 흡수) · 게이트는 엄격하게.**
// 이 유형은 지문을 재출력시키지 않으므로 지문 재구성 계약이 없다. 대신 유일한
// 지문 결속점이 `밑줄:` 한 줄이라, 그 한 줄을 지문 축자로 확정하는 것이
// 파서·스냅의 전부다.
//
// ⚠ 축자 확정이 왜 이 유형에서 특히 중요한가: 후처리 processContextMeaning 은
//   `replaceAtPosition(passage, found.index, found.length, "__" + underlinedWord + "__")`
//   로 **모델이 적어 온 문자열을 지문에 도로 써 넣는다**. 대소문자만 어긋나도
//   findWordInPassage 의 대소문자 무시 폴백이 걸려 지문 원문이 모델 표기로
//   조용히 바뀐다. 그래서 스냅이 지문 축자 슬라이스로 갈아 끼우고, 확정에
//   실패하면 게이트가 반려한다.
// ============================================================================

import { escapeRegExp, normalizeWs, snapExpressionSpan } from "./parser";

/** 파싱 관용 범위 — 계약은 ①~⑧(optionCount 상한 8)이지만 ⑨⑩도 읽어 게이트가 지목하게 한다. */
const CIRCLED_PARSE_TABLE = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩"];

export interface MdContextMeaningOption {
  /** 원문자 라벨 — md 내부 축. 어댑터가 "1"~"N" 숫자 축으로 변환한다. */
  label: string;
  text: string;
}

export interface MdContextMeaningQuestion {
  kind: "contextMeaning";
  /** 지문 축자 밑줄 단어(또는 짧은 구) — 이 유형의 유일한 지문 결속점 */
  word: string;
  options: MdContextMeaningOption[];
  /** 정답 라벨 집합 — `정답:` 줄이 유일 진실원(선지 줄에 정답 표시 칸을 두지 않는다) */
  answers: string[];
  /** answers[0] — 단일 정답 소비처 편의 */
  answer: string;
  explanation: string;
  wrong: MdContextMeaningOption[];
}

/** "①" | "3" | "(3)" | "3." 등 라벨 표기를 원문자 축으로 정규화한다. */
function circledLabel(raw: string): string {
  const key = raw.trim();
  if (CIRCLED_PARSE_TABLE.includes(key)) return key;
  const digits = key.replace(/[()[\].:]/g, "").trim();
  const n = Number(digits);
  if (Number.isInteger(n) && n >= 1 && n <= CIRCLED_PARSE_TABLE.length) {
    return CIRCLED_PARSE_TABLE[n - 1];
  }
  return "";
}

// ── 인라인 장식 토큰(단일 소스) ────────────────────────────────────────────
// ⚠ `**`·`__` **만** 아는 관용은 절반짜리다 — 실측 프로브에서 `_정답:_`·`*③*`·
//   `밑줄: _cheap_` 이 전부 필드 유실·거짓 반려로 떨어졌다. 굵게(2개)만이 아니라
//   기울임(1개)·강조(3개)·코드(백틱)까지 **한 토큰으로** 흡수한다.
//   이 상수를 키워드 줄(KEY_HEAD/KEY_TAIL)과 라벨 줄(OPTION_LINE_RE)이 공유하므로,
//   한쪽만 아는 비대칭이 구조적으로 생길 수 없다.
const EMPH = String.raw`(?:\*{1,3}|_{1,3}|\x60)`;

// 라벨로 시작하는 줄만 선지 후보로 본다. 라벨 앞의 마크다운 장식(인용·헤딩·불릿·
// 굵게/기울임/코드)과 표 파이프는 흡수한다 — 모델이 목록을 꾸미는 실측 드리프트.
// 숫자 라벨은 반드시 괄호나 마침표를 동반해야 한다(해설 산문의 숫자 오인 방지).
const OPTION_LINE_RE = new RegExp(
  String.raw`^\s*(?:>\s*)?#{0,6}\s*\|?\s*(?:[-*•+]\s*)?${EMPH}?\s*(?:([①-⑩])|\(([1-9])\)|([1-9])[.)])${EMPH}?[.)]?\s*(.+)$`,
);

/**
 * 마크다운 인라인 장식(굵게·기울임·코드·밑줄표기)을 벗긴다.
 * 짝이 맞으면 안쪽만 남기고, 짝이 깨져 **양끝**에 남은 잔재는 잘라 낸다.
 * 문장 한가운데의 짝 없는 별표는 일부러 남긴다 — 그건 게이트가 자리를 지목한다.
 *
 * ⚠ 양끝 잔재 절단에 언더스코어 **1개**도 포함한다. 키워드 줄의 콜론 뒤 장식 슬롯이
 *   여는 표지 하나를 먼저 먹으므로(`해설: _본문_` → 값 `본문_`), 짝수 개만 지우는
 *   처리는 반드시 한쪽을 남긴다 — 그 한 글자가 그대로 학생 표면에 나간다.
 */
function stripInlineEmphasis(raw: string): string {
  let text = raw;
  for (let i = 0; i < 3; i += 1) {
    const before = text;
    text = text
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/__([^_]+)__/g, "$1")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1");
    if (text === before) break;
  }
  return text
    .replace(/^[\s*`_]+/, "")
    .replace(/[\s*`_]+$/, "")
    .trim();
}

/**
 * 선지·오답 줄 본문 정리 — 표 파이프 잔재와 마크다운 장식을 걷어낸다.
 *
 * ⚠ **양끝을 대칭으로** 벗겨야 한다. 종전에는 뒤쪽 `**` 만 지워서, 모델이 정답
 *   선지 하나만 굵게 쓴 실측 드리프트(`③ **won without real sacrifice**`)가
 *   `**won without real sacrifice` 로 확정됐다. 게이트·후처리(sanitize)·검증기
 *   어느 층도 별표를 보지 않으므로 그 별표가 그대로 학생 표면까지 가서
 *   **정답을 눈으로 알려 준다**(굵은 선지 = 정답). 대칭 아티팩트를 비대칭으로
 *   만드는 처리라 안 하느니만 못했다.
 */
function cleanOptionText(raw: string): string {
  const text = raw
    .trim()
    .replace(/^\|\s*/, "")
    .replace(/\s*\|\s*$/, "")
    .trim();
  return stripInlineEmphasis(text);
}

function parseLabeledLines(section: string): MdContextMeaningOption[] {
  const items: MdContextMeaningOption[] = [];
  // ⚠ `\r` 단독도 반드시 줄 구분자로 다뤄라. JS 정규식의 `m` 플래그는 `\r` **뒤에서도**
  //   `^` 를 성립시키므로, CRLF 입력에서 섹션 분할 정규식이 `\r` 과 `\n` **사이**를
  //   경계로 잡는다 → 구역 마지막 줄에 `\r` 이 남고, `(.+)$` 의 `.` 는 `\r` 을 못 먹어
  //   그 줄이 통째로 사라진다. 실측: CRLF 입력에서 `정답:` 바로 앞 선지 한 줄만 유실 →
  //   "선지 4개 (5개 필요)" 라는 **사실과 다른 원인**(모델은 5개를 다 썼다).
  for (const rawLine of section.split(/\r\n|[\r\n]/)) {
    const m = rawLine.match(OPTION_LINE_RE);
    if (!m) continue;
    const label = circledLabel(m[1] ?? m[2] ?? m[3] ?? "");
    if (!label) continue;
    const text = cleanOptionText(m[4] ?? "");
    if (!text) continue;
    // 같은 라벨이 두 번 나오면 첫 줄만 취한다(게이트가 개수로 잡게 둔다).
    if (items.some((it) => it.label === label)) continue;
    items.push({ label, text });
  }
  return items;
}

/**
 * `밑줄:` 값 정리 — 모델이 표현을 따옴표·굵게·밑줄 마크다운으로 감싸는 실측
 * 드리프트를 벗긴다. **문장 구두점은 벗기지 않는다**(지문 축자일 수 있으므로) —
 * 그건 스냅이 지문과 대조해 판단한다.
 */
function stripTargetDecoration(raw: string): string {
  // 마크다운 장식 문자는 **전량** 제거한다. 표적은 지문 축자여야 하고 영어 지문에는
  // `*`·`_`·백틱이 없으므로 남길 이유가 하나도 없다.
  // ⚠ 부분 절단(뒤쪽만 · 짝이 맞을 때만)은 반드시 어느 한 자리를 남긴다. 실측으로
  //   `밑줄: __cheap__` → `cheap__`, `밑줄: **set out** to change` →
  //   `set out** to change` 가 그 자리에서 났고, 게이트는 "지문에 축자로 없음" 이라는
  //   **사실과 다른 원인**을 뱉었다(모델은 지문 그대로 적었는데도). 종전에 `**` 만
  //   비대칭 관용이고 `__`·`_`·`*` 는 짝이 맞을 때만이던 내부 비일관이 그 원인이다.
  let text = raw.replace(/[*_`]/g, "").trim();
  text = text.replace(/^\|\s*/, "").replace(/\s*\|\s*$/, "").trim();
  for (let i = 0; i < 3; i += 1) {
    const before = text;
    // 따옴표는 짝이 맞을 때만 벗긴다(본문 인용 보존).
    text = text
      .replace(/^"([\s\S]*)"$/, "$1")
      .replace(/^'([\s\S]*)'$/, "$1")
      .replace(/^“([\s\S]*)”$/, "$1")
      .replace(/^‘([\s\S]*)’$/, "$1")
      .trim();
    if (text === before) break;
  }
  return text;
}

// ── 키워드 줄 관용 (§1-B 철칙 3) ────────────────────────────────────────────
// 프로덕션 사고의 주계통: 선지·데이터 줄은 관대하게 읽으면서 `정답:`·`해설:`·
// `오답:` 같은 **키워드 줄만 무관용 정규식**으로 잡는 비대칭. 모델이 헤더를
// 굵게(`**정답:**`) 쓰거나 라벨을 늘리면(`오답 해설:`) 그 필드가 통째로 사라지고,
// 게이트는 "정답 누락"·"오답해설 0개" 라는 **사실과 다른 원인**을 지목한다.
// 그 문구가 그대로 [반려 재생성] 프롬프트에 실리므로, 네 필드를 이미 정확히 쓴
// 모델은 "없는 것을 쓰라"는 말을 듣고 같은 굵게 습관으로 2차도 같은 자리에서
// 반려된다 = 생성 실패 + 크레딧 환불. 같은 파일이 `밑줄:` 에는 이 관용을 이미
// 갖고 있었으니 비대칭이기까지 했다.
// → 이제 **모든 키워드 줄이 아래 빌더 하나를 공유**한다(밑줄·정답·해설·오답).
//   관용 범위: 앞 공백 · `>` 인용 · `#` 헤더 · `-`/`*`/`•`/`+` 불릿 ·
//   굵게/기울임/강조/백틱(콜론 안쪽·바깥쪽 모두) · 전각 콜론 `：` · 라벨 확장.
// ⚠ **머리표만 관용하고 값 쪽 장식을 남기면 아무것도 고친 게 아니다.** 콜론 뒤
//   장식 슬롯은 헤더의 **닫는** 표지에게 먼저 먹히므로(`**정답:** **③**` →
//   슬롯이 헤더 마감 `**` 를 먹고 값 자신의 여는 `**` 가 캡처로 들어온다),
//   캡처된 값은 반드시 stripInlineEmphasis 로 **양끝 대칭** 절단해야 한다.
//   슬롯을 늘려 값의 여는 표지까지 먹이는 처방은 오답이다 — 닫는 표지가 그대로
//   남아 값 말미가 오염된다. 진실원은 "슬롯 하나 + 값 대칭 절단" 조합이다.
// ⚠ label 소스에 **캡처 그룹을 쓰지 마라** — 섹션 정규식은 String.split 에 그대로
//   들어가고, 캡처가 있으면 분리 결과에 캡처값이 끼어들어 구역이 어긋난다.
const KEY_HEAD = String.raw`^\s*(?:>\s*)?#{0,6}\s*(?:[-*•+]\s*)?${EMPH}?\s*`;
const KEY_TAIL = String.raw`\s*${EMPH}?\s*[:：]\s*${EMPH}?\s*`;

function keywordLineSource(label: string, tail = ""): string {
  return `${KEY_HEAD}(?:${label})${KEY_TAIL}${tail}`;
}

const TARGET_LABEL = String.raw`밑줄(?:\s*(?:단어|표현|어휘|어구))?`;
const ANSWER_LABEL = String.raw`정답(?:\s*(?:및|과)\s*해설)?`;
/** `정답 및 해설:` 한 줄로 합쳐 쓰는 드리프트에서도 해설을 건진다(정답은 라벨 런이 가져간다). */
const EXPLANATION_LABEL = String.raw`(?:정답\s*(?:및|과)\s*)?해설`;
const WRONG_LABEL = String.raw`오답(?:\s*(?:해설|선지))?`;

// 섹션 헤더 — `## 오답:`·`**오답:**`·`오답 해설:` 을 전부 흡수한다.
// (여기서 못 읽으면 오답 섹션이 통째로 해설에 먹혀 "오답해설 0개" 로만 보인다.)
const WRONG_SECTION_SRC = keywordLineSource(WRONG_LABEL);
const WRONG_SECTION_RE = new RegExp(WRONG_SECTION_SRC, "m");
const ANSWER_SECTION_RE = new RegExp(keywordLineSource(ANSWER_LABEL), "m");
const TARGET_LINE_RE = new RegExp(
  keywordLineSource(TARGET_LABEL, String.raw`(.+)$`),
  "m",
);
const ANSWER_LINE_RE = new RegExp(
  keywordLineSource(ANSWER_LABEL, String.raw`(.+)$`),
  "m",
);

// 해설 블록의 종료선 — **모든 키워드 줄**이 종료선이다(문서 끝도 종료선).
// ⚠ 종전에는 `오답:` 하나만 종료선이라, 모델이 `해설:` 뒤에 `정답:`·`밑줄:` 을 쓰는
//   순서 드리프트에서 그 줄이 통째로 해설 본문에 삼켜져 **학생 표면에 형식 원문이
//   노출**됐다(게이트는 클린이라 아무도 못 잡는다). 종료선이 일부 키워드만 아는
//   lookahead 는 사이에 다른 줄이 오는 순간 블록이 붕괴한다.
const SECTION_STOP_SRC = keywordLineSource(
  `${WRONG_LABEL}|${ANSWER_LABEL}|${TARGET_LABEL}`,
);
const EXPLANATION_RE = new RegExp(
  keywordLineSource(
    EXPLANATION_LABEL,
    `([\\s\\S]*?)(?=${SECTION_STOP_SRC}|$(?![\\s\\S]))`,
  ),
  "m",
);

/**
 * 문맥 속 의미 md 파싱. 드리프트 관용(정본 parseMdBlank 규약):
 * 라벨 표기 흔들림(원문자·숫자·괄호·불릿·굵게), 전각 콜론, 마크다운 헤더,
 * 표 행 파이프, 오답 목록에 정답 줄을 끼워 넣는 실측 패턴.
 */
export function parseMdContextMeaning(text: string): MdContextMeaningQuestion {
  const beforeWrong = text.split(WRONG_SECTION_RE)[0] ?? text;
  // 선지 구역은 `정답:` 앞까지 — 해설 산문의 번호 목록을 선지로 오인하지 않는다.
  const strictOptionSection = beforeWrong.split(ANSWER_SECTION_RE)[0] ?? beforeWrong;
  const wrongSection = text.split(WRONG_SECTION_RE)[1] ?? "";

  const rawTarget = text.match(TARGET_LINE_RE)?.[1] ?? "";

  // `정답:` 값은 **라벨 목록**이라 장식 문자에 담길 정보가 하나도 없다 → 남김없이
  // 지운다(부분 절단은 반드시 어느 한 자리를 남긴다).
  // ⚠ 뒤쪽만 지우던 종전 처리는 `**정답:** **③**` 을 `**③` 으로 확정했고, 아래
  //   leadingRun 정규식이 선두 `*` 에서 실패해 answers=[] 가 됐다 — 게이트가
  //   "정답 누락" 이라는 **사실과 다른 원인**을 뱉고 그 문구가 그대로 [반려 재생성]
  //   피드백이 되어 2차도 같은 자리에서 반려된다(생성 실패 + 크레딧 환불).
  // ⚠ 양끝 대칭 절단(stripInlineEmphasis)만으로도 부족하다: 콜론 뒤 슬롯이 첫
  //   라벨의 **여는** 표지를 먹으면 고아가 된 닫는 표지가 라벨 사이에 남아
  //   (`정답: _②_, _④_` → `②_, _④_`) 뒤 라벨이 통째로 잘린다("정답 1개" 거짓 원인).
  const answerLine = (text.match(ANSWER_LINE_RE)?.[1] ?? "")
    .replace(/[*_`]/g, "")
    .trim();
  // 선행 라벨 런만 수집(정본 parseGrammarAnswerFix 규약): "정답: ②, ④" 는 둘 다,
  // "정답: ② — ④는 사전 1번 뜻" 류 부가 설명 속 라벨은 무시.
  const leadingRun =
    answerLine.match(
      /^\s*((?:[①-⑩]|\(?[1-9]\)?)(?:\s*[,·]\s*(?:[①-⑩]|\(?[1-9]\)?))*)/,
    )?.[1] ?? "";
  const answers = [
    ...new Set(
      [...leadingRun.matchAll(/[①-⑩]|[1-9]/g)]
        .map((m) => circledLabel(m[0]))
        .filter(Boolean),
    ),
  ];

  // 엄격 구역(정답 줄 앞)이 비었을 때만 넓혀 읽는다 — 모델이 선지를 해설 뒤에 쓴
  // 순서 드리프트 구제. 넓힐 때도 오답 섹션은 제외해 오답 줄을 선지로 오인하지 않는다.
  const strictOptions = parseLabeledLines(strictOptionSection);
  const options =
    strictOptions.length > 0 ? strictOptions : parseLabeledLines(beforeWrong);

  const answerSet = new Set(answers);
  const wrong = parseLabeledLines(wrongSection).filter(
    (w) => !answerSet.has(w.label),
  );

  return {
    kind: "contextMeaning",
    word: stripTargetDecoration(rawTarget),
    options,
    answers,
    answer: answers[0] ?? "",
    explanation: stripInlineEmphasis(text.match(EXPLANATION_RE)?.[1] ?? ""),
    wrong,
  };
}

// ── 밑줄 표적 위치 확정 ──────────────────────────────────────────────────────
// 후처리 findWordInPassage 는 **단어 경계**(\b...\b)로 찾고, 못 찾으면 실패한다
// (부분문자열 폴백 없음 — dig__it__al 사고 방지). 게이트·어댑터·스냅이 후처리와
// **같은 축의 탐색기**를 써야 "게이트는 통과했는데 후처리가 못 찾음" 이라는 층간
// 불일치가 생기지 않는다. 여기가 그 단일 탐색기다.
//
// ⚠ 정본 wordBoundaryRegex 를 그대로 쓰지 않는 이유: 그쪽은 대소문자 구분 + 곱슬
//   따옴표 변형 비관용이라, 이 유형의 실측 드리프트(대문자 표기·따옴표 변형)를
//   스냅으로 구제할 수 없다. 로컬 탐색기를 따로 둔다(규범 §3-4 로컬 상수 규칙).

/** 곱슬따옴표·대시 변형을 흡수하는 문자 클래스(normalizeWs 축과 동일 대상). */
function flexiblePunctuation(escaped: string): string {
  return escaped
    .replace(/['‘’ʼ]/g, "['‘’ʼ]")
    .replace(/["“”]/g, '["“”]')
    .replace(/[-–—]/g, "[-–—]");
}

/**
 * 지문에서 밑줄 표적을 찾는다 — 공백량·따옴표/대시 변형·대소문자를 흡수하고,
 * 표현이 영숫자로 시작/끝나면 단어 경계를 강제한다(art"is"ts 사고 방지).
 * count 는 지문 전체 등장 횟수 — 게이트가 "자리 모호"를 잡는 근거다.
 */
export function locateContextMeaningTarget(
  passage: string,
  word: string,
): { index: number; length: number; count: number } | null {
  const trimmed = word.trim();
  if (!trimmed || !passage) return null;
  const body = trimmed
    .split(/\s+/)
    .map((token) => flexiblePunctuation(escapeRegExp(token)))
    .join("\\s+");
  const pre = /^[A-Za-z0-9]/.test(trimmed) ? "(?<![A-Za-z0-9])" : "";
  const post = /[A-Za-z0-9]$/.test(trimmed) ? "(?![A-Za-z0-9])" : "";
  let re: RegExp;
  try {
    re = new RegExp(`${pre}${body}${post}`, "gi");
  } catch {
    return null;
  }
  const matches = [...passage.matchAll(re)];
  if (matches.length === 0) return null;
  const first = matches[0];
  return {
    index: first.index ?? 0,
    length: first[0].length,
    count: matches.length,
  };
}

/** 지문 축자 슬라이스를 돌려준다(위치가 유일할 때만). 실패 시 null. */
function uniqueSlice(passage: string, word: string): string | null {
  const hit = locateContextMeaningTarget(passage, word);
  if (!hit || hit.count !== 1) return null;
  return passage.slice(hit.index, hit.index + hit.length);
}

/**
 * 0원 자동 보정. 진실원은 **지문**이다 — 모델이 적어 온 밑줄 표현을 지문의
 * 축자 슬라이스로 갈아 끼운다(대소문자·공백량·곱슬따옴표 드리프트 흡수).
 *
 * 보수 가드: 위치가 지문에서 **유일할 때만** 교정한다. 두 곳 이상 걸리면
 * 손대지 않고 게이트가 "자리 모호"로 반려하게 둔다 — 엉뚱한 자리에 밑줄을
 * 긋느니 반려가 낫다(정본 규약).
 */
export function autoSnapContextMeaningTarget(
  q: MdContextMeaningQuestion,
  passage: string,
): { question: MdContextMeaningQuestion; corrections: string[] } {
  const corrections: string[] = [];
  const word = q.word.trim();
  if (!word) return { question: q, corrections };

  // 이미 축자면 손대지 않는다(최다 경로 — 무보정).
  if (passage.includes(word)) return { question: q, corrections };

  const direct = uniqueSlice(passage, word);
  if (direct) {
    corrections.push(
      `밑줄 표현을 지문 축자로 보정: '${word.slice(0, 60)}' → '${direct.slice(0, 60)}'`,
    );
    return { question: { ...q, word: direct }, corrections };
  }

  // 앞뒤 구두점·장식만 어긋난 경우(문장 끝 마침표를 함께 적어 온 실측 드리프트).
  const punctTrimmed = word
    .replace(/^[\s"'“”‘’.,;:!?…—–-]+/u, "")
    .replace(/[\s"'“”‘’.,;:!?…—–-]+$/u, "")
    .trim();
  if (punctTrimmed && punctTrimmed !== word) {
    const trimmedSlice = uniqueSlice(passage, punctTrimmed);
    if (trimmedSlice) {
      corrections.push(
        `밑줄 표현 앞뒤 구두점 정리 후 지문 축자로 보정: '${word.slice(0, 60)}' → '${trimmedSlice.slice(0, 60)}'`,
      );
      return { question: { ...q, word: trimmedSlice }, corrections };
    }
  }

  // 사이 단어를 빠뜨린 경우(정본 빈칸 스냅 코어 재사용 — 4단어 이상 구 전용,
  // 유일 구간 + 자카드 0.66 가드가 걸려 있어 오스냅이 나지 않는다).
  const spanned = snapExpressionSpan(passage, word);
  if (spanned && normalizeWs(spanned) !== normalizeWs(word)) {
    corrections.push(
      `밑줄 표현 구간 스냅: '${word.slice(0, 60)}' → 지문 축자 '${spanned.slice(0, 60)}'`,
    );
    return { question: { ...q, word: spanned }, corrections };
  }

  return { question: q, corrections };
}
