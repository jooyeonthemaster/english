// ============================================================================
// 함축 의미 추론(IMPLIED_MEANING) md 파서 · 0원 스냅.
// 견본: parser-antonym.ts / 게이트는 gate-implied.ts (400줄 규칙 분할)
//
// 정본 규약 답습: **파서는 관대하게(드리프트 흡수) · 게이트는 엄격하게.**
// 이 유형은 지문을 재출력시키지 않으므로 지문 재구성 계약이 없다. 대신 유일한
// 지문 결속점이 `밑줄:` 한 줄이라, 그 한 줄을 지문 축자로 확정하는 것이
// 파서·스냅의 전부다 — 확정에 실패하면 후처리 findExpressionInPassage 가
// "Underlined expression not found" 로 전체 실패하기 때문이다.
// ============================================================================

import { escapeRegExp, normalizeWs, snapExpressionSpan } from "./parser";

/** 파싱 관용 범위 — 계약은 ①~⑧(optionCount 상한 8)이지만 ⑨⑩도 읽어 게이트가 지목하게 한다. */
const CIRCLED_PARSE_TABLE = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩"];

export interface MdImpliedOption {
  /** 원문자 라벨 — md 내부 축. 어댑터가 "1"~"N" 숫자 축으로 변환한다. */
  label: string;
  text: string;
}

export interface MdImpliedQuestion {
  kind: "implied";
  /** 지문 축자 밑줄 표현 — 이 유형의 유일한 지문 결속점 */
  expression: string;
  options: MdImpliedOption[];
  /** 정답 라벨 집합 — `정답:` 줄이 유일 진실원(선지 줄에 정답 표시 칸을 두지 않는다) */
  answers: string[];
  /** answers[0] — 단일 정답 소비처 편의 */
  answer: string;
  explanation: string;
  wrong: MdImpliedOption[];
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

// ── 마크다운 장식 관용 조각 ─────────────────────────────────────────────────
/** 줄머리 장식 — 불릿·인용·표 파이프·헤더 샵. (강조 표식은 EM 이 따로 먹는다.) */
const LEAD = String.raw`[\s>|#•‧-]*`;
/** 강조 표식 한 덩이 — 굵게/이탤릭, 별표/밑줄 양쪽 표기. */
const EM = String.raw`(?:\*\*|__|\*|_)`;

/**
 * 짝이 깨진 강조 표식만 걷어낸다.
 * - 전체를 감싼 짝은 벗긴다: `**본문**` → `본문`
 * - 한쪽만 남은 고아 표식도 벗긴다: `**본문` / `본문**` → `본문`
 * - **본문 중간의 정상 강조는 보존한다**: `*표면직역* — …` 는 그대로.
 *   반쪽만 지우면 학생 표면에 리터럴 `*` 가 남아 결함이 오히려 커진다.
 */
function stripUnbalancedEmphasis(raw: string): string {
  let text = String(raw ?? "").trim();
  for (let i = 0; i < 2; i += 1) {
    const wrapped = text.match(/^(\*\*|__|\*|_)([\s\S]+)\1$/);
    if (!wrapped || wrapped[2].includes(wrapped[1])) break;
    text = wrapped[2].trim();
  }
  const opened = text.match(/^([*_]+)([\s\S]*)$/);
  if (opened && !/[*_]/.test(opened[2])) text = opened[2].trim();
  const closed = text.match(/^([\s\S]*?)([*_]+)$/);
  if (closed && !/[*_]/.test(closed[1])) text = closed[1].trim();
  return text;
}

/** 표 행 잔재(양끝 파이프)를 걷어낸다. */
function stripTablePipes(raw: string): string {
  return String(raw ?? "")
    .replace(/^\|\s*/, "")
    .replace(/\s*\|+\s*$/, "")
    .trim();
}

// 라벨로 시작하는 줄만 선지 후보로 본다. 라벨 앞의 마크다운 장식(불릿·인용·굵게)과
// 표 파이프는 흡수한다 — 모델이 목록을 꾸미는 실측 드리프트.
// 숫자 라벨은 반드시 괄호나 마침표를 동반해야 한다(해설 산문의 숫자 오인 방지).
const OPTION_LINE_RE = new RegExp(
  `^${LEAD}${EM}?\\s*(?:([①-⑩])|\\(([1-9])\\)|([1-9])[.)])${EM}?[.)]?\\s*(.+)$`,
);

/**
 * 선지·오답 줄 본문 정리 — 표 파이프 잔재와 **짝이 깨진** 강조 표식을 걷어낸다.
 * 여는 `**` 만 남겨 두면 그 별표가 DB 에 저장돼 어느 렌더 경로에서도 리터럴로
 * 학생 표면에 노출된다(실측 결함) — 대칭으로 처리한다.
 */
function cleanOptionText(raw: string): string {
  return stripUnbalancedEmphasis(stripTablePipes(raw.trim()));
}

function parseLabeledLines(section: string): MdImpliedOption[] {
  const items: MdImpliedOption[] = [];
  for (const rawLine of section.split(/\r?\n/)) {
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
  let text = stripTablePipes(raw.trim());
  for (let i = 0; i < 3; i += 1) {
    const before = text;
    // 굵게·이탤릭 마크다운은 짝이 안 맞아도(머리표 쪽에 여는 별표가 남는 실측
    // 드리프트) 걷어낸다 — 지문 축자 표현이 `*`·`_` 로 시작·끝나는 일은 없다.
    // 따옴표는 짝이 맞을 때만 벗긴다(본문 인용 보존).
    text = stripUnbalancedEmphasis(text)
      .replace(/^`([\s\S]*)`$/, "$1")
      .replace(/^"([\s\S]*)"$/, "$1")
      .replace(/^'([\s\S]*)'$/, "$1")
      .replace(/^“([\s\S]*)”$/, "$1")
      .replace(/^‘([\s\S]*)’$/, "$1")
      .trim();
    if (text === before) break;
  }
  return text;
}

// ── 섹션 머리표 관용 (규범 §1-B 철칙 3: 파서가 데이터를 조용히 버리게 두지 마라) ──
// 선지 줄은 관대하게 읽으면서 키워드 줄(`밑줄:` `정답:` `해설:` `오답:`)만 무관용
// 정규식으로 잡으면, 모델이 머리표를 굵게(`**정답:** ③`)·인용(`> 정답:`)·표
// (`| 정답: | ③ |`)·불릿(`- 정답:`)으로 꾸민 순간 그 필드가 통째로 사라진다.
// 그때 게이트에는 "정답 누락 / 해설 누락 / 오답해설 0개" 라는 **사실과 다른 원인**
// 으로만 보이고, 그 문구가 그대로 [반려 재생성] 피드백이 되어 모델을 엉뚱한 방향
// 으로 몬다(실사용 2연속 반려의 계통). 형제 레인 parser-topic.ts 의 HEAD 선례와
// 같은 처방이되, 값 훼손을 막기 위해 분기를 둘로 나눴다.
//
//  - 장식 분기: **여는 표식이 있을 때만** 콜론 뒤의 닫는 표식까지 먹는다.
//  - 평범 분기: 값을 한 글자도 건드리지 않는다 —
//    `해설: **핵심**은 …` 처럼 값 안의 정상 강조가 깨지지 않게 하기 위해서다.
function sectionHead(keyword: string): string {
  return (
    `(?:^${LEAD}${EM}\\s*${keyword}\\s*${EM}?\\s*[:：]\\s*${EM}?` +
    `|^${LEAD}${keyword}\\s*[:：])`
  );
}

/** 머리표 뒤 값 캡처 조각 — 캡처 그룹은 항상 1번 하나다. */
function sectionValueRe(keyword: string): RegExp {
  return new RegExp(`${sectionHead(keyword)}\\s*(.+)$`, "m");
}

const WRONG_SECTION_RE = new RegExp(sectionHead("오답"), "m");
const ANSWER_SECTION_RE = new RegExp(sectionHead("정답"), "m");
const ANSWER_VALUE_RE = sectionValueRe("정답");
const TARGET_VALUE_RE = sectionValueRe(String.raw`밑줄(?:\s*표현)?`);
const EXPLANATION_TO_WRONG_RE = new RegExp(
  `${sectionHead("해설")}\\s*([\\s\\S]*?)(?=${sectionHead("오답")})`,
  "m",
);
const EXPLANATION_TAIL_RE = new RegExp(
  `${sectionHead("해설")}\\s*([\\s\\S]+)$`,
  "m",
);

/**
 * 함축 md 파싱. 드리프트 관용(정본 parseMdBlank 규약):
 * 라벨 표기 흔들림(원문자·숫자·괄호·불릿·굵게), 전각 콜론, 마크다운 헤더,
 * 표 행 파이프, 오답 목록에 정답 줄을 끼워 넣는 실측 패턴.
 */
export function parseMdImplied(text: string): MdImpliedQuestion {
  const beforeWrong = text.split(WRONG_SECTION_RE)[0] ?? text;
  // 선지 구역은 `정답:` 앞까지 — 해설 산문의 번호 목록을 선지로 오인하지 않는다.
  const optionSection = beforeWrong.split(ANSWER_SECTION_RE)[0] ?? beforeWrong;
  const wrongSection = text.split(WRONG_SECTION_RE)[1] ?? "";

  const rawTarget = text.match(TARGET_VALUE_RE)?.[1] ?? "";

  const answerLine = stripUnbalancedEmphasis(
    stripTablePipes(text.match(ANSWER_VALUE_RE)?.[1] ?? ""),
  );
  // 선행 라벨 런만 수집(정본 parseGrammarAnswerFix 규약): "정답: ②, ④" 는 둘 다,
  // "정답: ② — ④는 표면 직역" 류 부가 설명 속 라벨은 무시.
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

  let options = parseLabeledLines(optionSection);
  if (options.length === 0) {
    // 선지를 `정답:` 뒤에 쓴 순서 드리프트 구제 — 엄격 구역이 **완전히 비었을 때만**
    // 넓혀 읽는다. 줄이 통째로 사라져 "선지 0개" 로만 보이는 은폐를 막는다(철칙 3).
    options = parseLabeledLines(beforeWrong);
  }
  const answerSet = new Set(answers);
  const wrong = parseLabeledLines(wrongSection).filter(
    (w) => !answerSet.has(w.label),
  );

  return {
    kind: "implied",
    expression: stripTargetDecoration(rawTarget),
    options,
    answers,
    answer: answers[0] ?? "",
    explanation: stripUnbalancedEmphasis(
      stripTablePipes(
        text.match(EXPLANATION_TO_WRONG_RE)?.[1] ??
          text.match(EXPLANATION_TAIL_RE)?.[1] ??
          "",
      ),
    ),
    wrong,
  };
}

// ── 밑줄 표적 위치 확정 ──────────────────────────────────────────────────────
// 후처리 findExpressionInPassage 는 축자 → 대소문자무시 → 정규화 순으로 찾는다.
// 게이트·어댑터·스냅이 **같은 탐색기**를 써야 "게이트는 통과했는데 후처리가 못
// 찾음" 이라는 층간 불일치가 생기지 않는다. 여기가 그 단일 탐색기다.

/** 곱슬따옴표·대시 변형을 흡수하는 문자 클래스(normalizeWs 축과 동일 대상). */
function flexiblePunctuation(escaped: string): string {
  return escaped
    .replace(/['‘’ʼ]/g, "['‘’ʼ]")
    .replace(/["“”]/g, '["“”]')
    .replace(/[-–—]/g, "[-–—]");
}

/**
 * 지문에서 밑줄 표현을 찾는다 — 공백량·따옴표/대시 변형·대소문자를 흡수하고,
 * 표현이 영문자로 시작/끝나면 단어 경계를 강제한다(art"is"ts 사고 방지).
 * count 는 지문 전체 등장 횟수 — 게이트가 "자리 모호"를 잡는 근거다.
 */
export function locateImpliedTarget(
  passage: string,
  expression: string,
): { index: number; length: number; count: number } | null {
  const trimmed = expression.trim();
  if (!trimmed || !passage) return null;
  const body = trimmed
    .split(/\s+/)
    .map((token) => flexiblePunctuation(escapeRegExp(token)))
    .join("\\s+");
  const pre = /^[A-Za-z]/.test(trimmed) ? "(?<![A-Za-z])" : "";
  const post = /[A-Za-z]$/.test(trimmed) ? "(?![A-Za-z])" : "";
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
function uniqueSlice(passage: string, expression: string): string | null {
  const hit = locateImpliedTarget(passage, expression);
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
export function autoSnapImpliedTarget(
  q: MdImpliedQuestion,
  passage: string,
): { question: MdImpliedQuestion; corrections: string[] } {
  const corrections: string[] = [];
  const expr = q.expression.trim();
  if (!expr) return { question: q, corrections };

  // 이미 축자면 손대지 않는다(최다 경로 — 무보정).
  if (passage.includes(expr)) return { question: q, corrections };

  const direct = uniqueSlice(passage, expr);
  if (direct) {
    corrections.push(
      `밑줄 표현을 지문 축자로 보정: '${expr.slice(0, 60)}' → '${direct.slice(0, 60)}'`,
    );
    return { question: { ...q, expression: direct }, corrections };
  }

  // 앞뒤 구두점·장식만 어긋난 경우(문장 끝 마침표를 함께 적어 온 실측 드리프트).
  const punctTrimmed = expr
    .replace(/^[\s"'“”‘’.,;:!?…—–-]+/u, "")
    .replace(/[\s"'“”‘’.,;:!?…—–-]+$/u, "")
    .trim();
  if (punctTrimmed && punctTrimmed !== expr) {
    const trimmedSlice = uniqueSlice(passage, punctTrimmed);
    if (trimmedSlice) {
      corrections.push(
        `밑줄 표현 앞뒤 구두점 정리 후 지문 축자로 보정: '${expr.slice(0, 60)}' → '${trimmedSlice.slice(0, 60)}'`,
      );
      return { question: { ...q, expression: trimmedSlice }, corrections };
    }
  }

  // 사이 단어를 빠뜨린 경우(정본 빈칸 스냅 코어 재사용 — 4단어 이상 구 전용,
  // 유일 구간 + 자카드 0.66 가드가 걸려 있어 오스냅이 나지 않는다).
  const spanned = snapExpressionSpan(passage, expr);
  if (spanned && normalizeWs(spanned) !== normalizeWs(expr)) {
    corrections.push(
      `밑줄 표현 구간 스냅: '${expr.slice(0, 60)}' → 지문 축자 '${spanned.slice(0, 60)}'`,
    );
    return { question: { ...q, expression: spanned }, corrections };
  }

  return { question: q, corrections };
}
