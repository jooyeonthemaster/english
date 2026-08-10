// ============================================================================
// 동의어(SYNONYM) md 파서 · 0원 스냅 · 파생값(문맥 문장) 산출.
// 견본: parser-antonym.ts · parser-implied.ts / 게이트는 gate-synonym.ts 로 분리
// (400줄 규칙 — 1차 승차분 gate-vocab/gate-order 선례).
//
// 정본 규약 답습: **파서는 관대하게(드리프트 흡수) · 게이트는 엄격하게.**
// 이 유형은 지문을 재출력시키지 않으므로 지문 재구성 계약이 없다. 대신 유일한
// 지문 결속점이 `대상:` 한 줄이라, 그 한 줄을 지문 축자로 확정하는 것이
// 파서·스냅의 전부다 — 확정에 실패하면 후처리 processSynonym 이 밑줄을 긋지 못해
// "Word not found in passage" 경고와 함께 밑줄 없는 문항이 저장된다.
//
// ⚠ `contextSentence` 는 모델에게 받지 않는다(규범 §1-B 철칙 1·2). 표적 자리가
//    유일하게 확정되면 문맥 문장은 지문에서 잘라 낼 수 있는 **파생값**이고,
//    다시 받으면 "모델이 재진술해 축자가 깨지는" 실패 모드만 하나 늘어난다.
// ============================================================================

import { escapeRegExp } from "./parser";

/** 파싱 관용 범위 — 계약은 ①~⑧(optionCount 상한 8)이지만 ⑨⑩도 읽어 게이트가 지목하게 한다. */
const CIRCLED_PARSE_TABLE = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩"];

export interface MdSynonymOption {
  /** 원문자 라벨 — md 내부 축. 어댑터가 "1"~"N" 숫자 축으로 변환한다. */
  label: string;
  text: string;
}

export interface MdSynonymQuestion {
  kind: "synonym";
  /** 지문 축자 표적 단어 — 이 유형의 유일한 지문 결속점(→ targetWord) */
  target: string;
  options: MdSynonymOption[];
  /** 정답 라벨 집합 — `정답:` 줄이 유일 진실원(선지 줄에 정답 표시 칸을 두지 않는다) */
  answers: string[];
  /** answers[0] — 단일 정답 소비처 편의 */
  answer: string;
  explanation: string;
  wrong: MdSynonymOption[];
  /**
   * 오답 섹션에 있었지만 **정답 라벨이라서 파서가 걷어낸** 줄의 라벨.
   * 파싱 결과에는 남지 않지만(드리프트 관용), 게이트가 개수 반려 메시지에서
   * "왜 한 개가 비었는지"를 지목하는 데 쓴다(규범 §1-B 철칙 3·5).
   */
  answerLabelsInWrong?: string[];
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

// 라벨로 시작하는 줄만 선지 후보로 본다. 라벨 앞의 마크다운 장식(불릿·굵게)과
// 표 파이프는 흡수한다 — 모델이 목록을 꾸미는 실측 드리프트.
// 숫자 라벨은 반드시 괄호나 마침표를 동반해야 한다(해설 산문의 숫자 오인 방지).
const OPTION_LINE_RE =
  /^\s*\|?\s*(?:[-*•]\s*)?(?:\*\*)?(?:([①-⑩])|\(([1-9])\)|([1-9])[.)])(?:\*\*)?[.)]?\s*(.+)$/;

/**
 * 인라인 마크다운 장식을 양끝에서 반복 제거한다 — `대상:` 값과 선지 텍스트가
 * **같은 정규화 축**을 쓰게 하는 공용 함수.
 *
 * ⚠ 26-07-26 적대검수 critical: 종전 선지 정리는 후행 `**` 하나만 벗겨
 * `② **foster**` → `"**foster"` 가 남았다. 그러면 중복·정답누출·굴절형 게이트가
 * 전부 `isSingleEnglishToken("**foster") === false` 로 조용히 빗나가고, 다섯 선지 중
 * 유일하게 별표가 붙은 것이 정답이라 셔플의 정답 은닉이 통째로 무의미해진다.
 * 표적 줄과 선지 줄이 서로 다른 관용 수준을 갖는 비대칭이 그 사고의 뿌리였다.
 *
 * **문장 구두점은 벗기지 않는다** — 지문 축자일 수 있고(표적), 문장 형태 선지는
 * 게이트가 지목해야 하기 때문이다(파서가 지우면 결함이 은폐된다).
 */
/**
 * 본문 **중간**의 굵게·백틱 스팬을 내용만 남기고 벗긴다.
 * 양끝 장식(stripInlineDecoration)만으로는 `① **다의어 오축** — …` 처럼 앞부분만
 * 강조한 실측 드리프트에서 닫는 `**` 가 문장 한복판에 남아 저장 표면이 깨진다.
 */
function stripEmphasisSpans(text: string): string {
  return text
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/`([^`\n]+)`/g, "$1");
}

function stripInlineDecoration(raw: string): string {
  let text = raw.trim();
  text = text.replace(/^\|\s*/, "").replace(/\s*\|\s*$/, "").trim();
  for (let i = 0; i < 4; i += 1) {
    const before = text;
    // 굵게·기울임·밑줄 마크다운은 짝이 안 맞아도(여는 별표가 라벨 쪽에 남는 실측
    // 드리프트) 양끝에서 걷어낸다. 따옴표는 짝이 맞을 때만 벗긴다(본문 인용 보존).
    text = text
      .replace(/^\*\*\s*/, "")
      .replace(/\s*\*\*$/, "")
      .replace(/^\*(?!\*)\s*/, "")
      .replace(/\s*\*$/, "")
      .replace(/^__([\s\S]*)__$/, "$1")
      .replace(/^_([\s\S]*)_$/, "$1")
      .replace(/^`+([\s\S]*?)`+$/, "$1")
      .replace(/^~~([\s\S]*)~~$/, "$1")
      .replace(/^"([\s\S]*)"$/, "$1")
      .replace(/^'([\s\S]*)'$/, "$1")
      .replace(/^“([\s\S]*)”$/, "$1")
      .replace(/^‘([\s\S]*)’$/, "$1")
      .trim();
    if (text === before) break;
  }
  return text;
}

/**
 * 선지·오답 줄 본문 정리 — 표 파이프 잔재·마크다운 장식·라벨 뒤 구분자 잔재·
 * 목록 후행 쉼표를 걷어낸다.
 *
 * 후행 쉼표만 지운다(`fabricate,` → `fabricate`). 중간 쉼표(`fabricate, invent`)는
 * 뜻풀이 병기라 **남겨서 게이트가 반려**하게 한다 — 파서가 지우면 학생 표면에서만
 * 사라지고 결함은 그대로 남는다.
 */
function cleanOptionText(raw: string): string {
  let text = stripInlineDecoration(stripEmphasisSpans(raw));
  for (let i = 0; i < 3; i += 1) {
    const before = text;
    text = stripInlineDecoration(
      stripEmphasisSpans(text)
        .replace(/^[-–—:：]\s+/, "")
        .replace(/[,;]+$/, "")
        .trim(),
    );
    if (text === before) break;
  }
  return text;
}

function parseLabeledLines(section: string): MdSynonymOption[] {
  const items: MdSynonymOption[] = [];
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
 * `대상:` 값 정리 — 모델이 표현을 따옴표·굵게·밑줄 마크다운으로 감싸는 실측
 * 드리프트를 벗긴다. **문장 구두점은 벗기지 않는다**(지문 축자일 수 있으므로) —
 * 그건 스냅이 지문과 대조해 판단한다.
 */
function stripTargetDecoration(raw: string): string {
  return stripInlineDecoration(raw);
}

// ── 키워드 줄 관용 ──────────────────────────────────────────────────────────
// ⚠ 26-07-26 적대검수 major(전 유형 웨이브 1위 결함 계통 · 프로덕션 2연속 사고):
//    선지·데이터 줄은 관대하게 파싱하면서 `정답:`·`해설:`·`오답:` 같은 **키워드 줄만
//    무관용 정규식**으로 잡으면, 모델이 라벨을 굵게(`**정답:**`) 쓰거나 불릿(`- 정답:`)을
//    붙이는 순간 그 필드가 통째로 사라진다. 그러면 게이트가 "정답 누락 / 해설 누락 /
//    오답해설 0개" 라는 **사실과 다른 원인**을 지목하고, 그 문구가 그대로 [반려 재생성]
//    피드백이 되어 모델을 엉뚱한 방향으로 몬다(재생성 1회 소진 → 실패 + 환불).
//    → 모든 키워드 줄은 아래 두 조각을 **공유**한다. 하나만 고치는 비대칭을 만들지 마라.
/** 줄머리 관용 — 마크다운 헤더(`##`)·불릿(`-`/`*`/`•`)·굵게 여는 별표. */
const KEY_LINE_HEAD = "^#{0,6}[ \\t]*(?:[-*•][ \\t]*)?(?:\\*\\*)?[ \\t]*";
/** 라벨↔값 사이 관용 — 굵게 마감이 콜론 앞/뒤 어디에 붙어도 읽는다. 전각 콜론 포함. */
const KEY_LINE_SEP = "(?:\\*\\*)?[ \\t]*[:：][ \\t]*(?:\\*\\*)?[ \\t]*";

function keywordLineRe(label: string, tail = ""): RegExp {
  return new RegExp(`${KEY_LINE_HEAD}(?:${label})${KEY_LINE_SEP}${tail}`, "m");
}

// 섹션 헤더 — `## 오답:`·`**오답:**`·`- 오답:` 을 흡수하고, **콜론이 없는 헤더**
// (`### 오답`)도 그 줄이 헤더뿐일 때 받아 준다. 여기서 못 읽으면 오답 섹션이 통째로
// 해설에 먹혀(126자 → 331자 오염) "오답해설 0개" 로만 보인다.
const WRONG_SECTION_SOURCE = `${KEY_LINE_HEAD}오답(?:[ \\t]*해설)?(?:\\*\\*)?[ \\t]*(?:[:：][ \\t]*(?:\\*\\*)?[ \\t]*|(?=[ \\t]*\\*{0,2}[ \\t]*\\r?$))`;
const WRONG_SECTION_RE = new RegExp(WRONG_SECTION_SOURCE, "m");
const ANSWER_SECTION_RE = keywordLineRe("정답");
const ANSWER_LINE_RE = keywordLineRe("정답", "(.+)$");
const EXPLANATION_LINE_RE = keywordLineRe(
  "해설",
  `([\\s\\S]*?)(?=${WRONG_SECTION_SOURCE})`,
);
const EXPLANATION_TAIL_RE = keywordLineRe("해설", "([\\s\\S]+)$");
// 표적 줄 라벨 관용 — `대상:` 이 계약이지만 `밑줄:`·`대상 단어:`·`표적:` 도 읽는다.
// (라벨 한 글자 차이로 줄이 통째로 사라져 "표적 누락" 으로만 보이는 은폐 차단 — 철칙 3)
const TARGET_LINE_RE = keywordLineRe(
  "대상(?:[ \\t]*단어)?|밑줄(?:[ \\t]*단어)?|표적(?:[ \\t]*단어)?",
  "(.+)$",
);

/**
 * 동의어 md 파싱. 드리프트 관용(정본 parseMdBlank 규약):
 * 라벨 표기 흔들림(원문자·숫자·괄호·불릿·굵게), 전각 콜론, 마크다운 헤더,
 * 표 행 파이프, 오답 목록에 정답 줄을 끼워 넣는 실측 패턴.
 */
export function parseMdSynonym(text: string): MdSynonymQuestion {
  const beforeWrong = text.split(WRONG_SECTION_RE)[0] ?? text;
  // 선지 구역은 `정답:` 앞까지 — 해설 산문의 번호 목록을 선지로 오인하지 않는다.
  const optionSection = beforeWrong.split(ANSWER_SECTION_RE)[0] ?? beforeWrong;
  const wrongSection = text.split(WRONG_SECTION_RE)[1] ?? "";

  const rawTarget = text.match(TARGET_LINE_RE)?.[1] ?? "";

  const answerLine = text.match(ANSWER_LINE_RE)?.[1] ?? "";
  // 선행 라벨 런만 수집(정본 parseGrammarAnswerFix 규약): "정답: ②, ④" 는 둘 다,
  // "정답: ② — ④는 사전 동의어이나 연어 위반" 류 부가 설명 속 라벨은 무시.
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
  const wrongLines = parseLabeledLines(wrongSection);
  const wrong = wrongLines.filter((w) => !answerSet.has(w.label));
  // 걷어낸 정답 줄의 라벨은 버리지 말고 남긴다 — 개수가 하나 비는 진짜 이유를
  // 게이트가 지목할 수 있어야 한다(철칙 3: 파서가 데이터를 조용히 버리지 마라).
  const answerLabelsInWrong = wrongLines
    .filter((w) => answerSet.has(w.label))
    .map((w) => w.label);

  return {
    kind: "synonym",
    target: stripTargetDecoration(rawTarget),
    options,
    answers,
    answer: answers[0] ?? "",
    explanation: stripEmphasisSpans(
      text.match(EXPLANATION_LINE_RE)?.[1] ??
        text.match(EXPLANATION_TAIL_RE)?.[1] ??
        "",
    )
      .replace(/\s*\*\*$/, "")
      .trim(),
    wrong,
    answerLabelsInWrong,
  };
}

// ── 표적 위치 확정 ──────────────────────────────────────────────────────────
// 후처리 findWordInPassage/findExpressionInPassage 는 축자 → 대소문자무시 →
// 정규화 순으로 찾는다. 게이트·어댑터·스냅이 **같은 탐색기**를 써야 "게이트는
// 통과했는데 후처리가 못 찾음" 이라는 층간 불일치가 생기지 않는다. 여기가 그
// 단일 탐색기다.

/** 곱슬따옴표·대시 변형을 흡수하는 문자 클래스(normalizeWs 축과 동일 대상). */
function flexiblePunctuation(escaped: string): string {
  return escaped
    .replace(/['‘’ʼ]/g, "['‘’ʼ]")
    .replace(/["“”]/g, '["“”]')
    .replace(/[-–—]/g, "[-–—]");
}

/**
 * 지문에서 표적 단어를 찾는다 — 공백량·따옴표/대시 변형·대소문자를 흡수하고,
 * 표현이 영문자로 시작/끝나면 단어 경계를 강제한다(art"is"ts 사고 방지 — 정본
 * wordBoundaryRegex 와 같은 사상). count 는 지문 전체 등장 횟수로, 게이트가
 * "밑줄 자리 모호" 를 잡는 근거다.
 */
export function locateSynonymTarget(
  passage: string,
  target: string,
): { index: number; length: number; count: number } | null {
  const trimmed = target.trim();
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
function uniqueSlice(passage: string, target: string): string | null {
  const hit = locateSynonymTarget(passage, target);
  if (!hit || hit.count !== 1) return null;
  return passage.slice(hit.index, hit.index + hit.length);
}

/** 문맥 문장 파생 상한 — 이보다 길면 문장 분해가 실패한 것으로 보고 윈도우로 폴백. */
const CONTEXT_SENTENCE_MAX = 400;

/**
 * 표적 자리를 감싸는 **지문 축자 문장**을 잘라 낸다 → `contextSentence`.
 *
 * 이 값은 두 곳에서 쓰인다:
 *  1) 후처리 findWordInPassage 의 1순위 전략(surroundingText 윈도우 우선 탐색)
 *  2) 렌더러 폴백 표면(passageWithUnderline 이 없을 때 이 문장을 보여 준다)
 * 두 용도 모두 **지문에서 그대로 잘라 낸 문자열**이어야 하므로 모델에게 받지 않고
 * 여기서 만든다(철칙 1: 한 정보는 한 곳에서만 — 진실원은 지문이다).
 */
export function synonymContextSentence(
  passage: string,
  index: number,
  length: number,
): string {
  if (index < 0 || index >= passage.length) return "";
  // 뒤로: 직전 문장 종결부호(뒤에 공백이 오는 . ! ?)를 찾아 그 다음부터.
  let start = 0;
  for (let i = index - 1; i > 0; i -= 1) {
    const ch = passage[i];
    if ((ch === "." || ch === "!" || ch === "?") && /\s/.test(passage[i + 1] ?? " ")) {
      start = i + 1;
      break;
    }
    if (ch === "\n" && passage[i - 1] === "\n") {
      start = i + 1;
      break;
    }
  }
  // 앞으로: 표적 뒤 첫 종결부호(뒤가 공백이거나 문서 끝)까지 포함.
  let end = passage.length;
  for (let i = index + length; i < passage.length; i += 1) {
    const ch = passage[i];
    if (ch === "." || ch === "!" || ch === "?") {
      const next = passage[i + 1];
      if (next === undefined || /\s/.test(next)) {
        end = i + 1;
        break;
      }
    }
  }
  const sentence = passage.slice(start, end).trim();
  if (!sentence || sentence.length > CONTEXT_SENTENCE_MAX) {
    // 문장 분해 실패(구두점 없는 지문 등) — 위치 힌트로만 쓰이는 값이므로
    // 표적 주변 고정 윈도우로 폴백한다. 엉뚱한 좌표를 넘기지 않는 것이 우선.
    const from = Math.max(0, index - 60);
    const to = Math.min(passage.length, index + length + 60);
    return passage.slice(from, to).trim();
  }
  return sentence;
}

/**
 * 0원 자동 보정. 진실원은 **지문**이다 — 모델이 적어 온 표적 단어를 지문의
 * 축자 슬라이스로 갈아 끼운다(대소문자·공백량·곱슬따옴표 드리프트 흡수).
 *
 * 보수 가드: 위치가 지문에서 **유일할 때만** 교정한다. 두 곳 이상 걸리면
 * 손대지 않고 게이트가 "자리 모호"로 반려하게 둔다 — 엉뚱한 자리에 밑줄을
 * 긋느니 반려가 낫다(정본 규약).
 */
export function autoSnapSynonymTarget(
  q: MdSynonymQuestion,
  passage: string,
): { question: MdSynonymQuestion; corrections: string[] } {
  const corrections: string[] = [];
  const target = q.target.trim();
  if (!target) return { question: q, corrections };

  // 이미 축자면 손대지 않는다(최다 경로 — 무보정).
  if (passage.includes(target)) return { question: q, corrections };

  const direct = uniqueSlice(passage, target);
  if (direct) {
    corrections.push(
      `대상 단어를 지문 축자로 보정: '${target.slice(0, 60)}' → '${direct.slice(0, 60)}'`,
    );
    return { question: { ...q, target: direct }, corrections };
  }

  // 앞뒤 구두점·장식만 어긋난 경우(문장 끝 쉼표·마침표를 함께 적어 온 실측 드리프트).
  const punctTrimmed = target
    .replace(/^[\s"'“”‘’.,;:!?…—–-]+/u, "")
    .replace(/[\s"'“”‘’.,;:!?…—–-]+$/u, "")
    .trim();
  if (punctTrimmed && punctTrimmed !== target) {
    const trimmedSlice = uniqueSlice(passage, punctTrimmed);
    if (trimmedSlice) {
      corrections.push(
        `대상 단어 앞뒤 구두점 정리 후 지문 축자로 보정: '${target.slice(0, 60)}' → '${trimmedSlice.slice(0, 60)}'`,
      );
      return { question: { ...q, target: trimmedSlice }, corrections };
    }
  }

  // 관사·소유격을 함께 적어 온 경우(the cultivation / its cultivation) — 선행
  // 한정어만 떼고 재시도한다. 표적은 내용어 하나가 계약이므로 안전한 축소다.
  const determinerStripped = target.replace(
    /^(?:the|a|an|its|their|his|her|our|your|this|that|these|those)\s+/i,
    "",
  );
  if (determinerStripped !== target) {
    const stripped = uniqueSlice(passage, determinerStripped);
    if (stripped) {
      corrections.push(
        `대상 단어 선행 한정어 제거 후 지문 축자로 보정: '${target.slice(0, 60)}' → '${stripped.slice(0, 60)}'`,
      );
      return { question: { ...q, target: stripped }, corrections };
    }
  }

  return { question: q, corrections };
}
