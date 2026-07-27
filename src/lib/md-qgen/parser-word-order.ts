// ============================================================================
// 배열 영작(WORD_ORDER) md 파서 · 칩 대수(회계·미끼 도출·어순 누수·결정론 배치).
// 0원 스냅과 0원 게이트는 gate-word-order.ts (파일 500줄 규약 · 규범 §1 [6] 이
// 스냅과 게이트를 한 계약 단계로 묶는다). 의존은 gate → parser 단방향.
// 견본: parser-antonym.ts — 파서는 관대하게(드리프트 흡수) · 게이트는 엄격하게.
// 계약 문서: docs/md-qgen-type-expansion-spec.md §1-B
//
// ⚠ 서술형이다. 선지가 없으므로 `정답:` 줄도 `오답:` 블록도 없다. 정답의 유일
//   진실원은 `모범답안:` 줄이고 **그 줄 안의 ` / ` 청크 경계가 곧 정답 칩이다**
//   (§1-B 철칙1 — 정답 문장을 `모범답안:`·`칩:` 두 줄에 축자로 두 번 받던 중복
//   계약을 철회했다). "칩으로 정답을 조립할 수 없음" 이 검사가 아니라 **항등식**
//   이 되어 최대 반려 계통이 소멸한다. 구형(`칩:` 줄) 출력은 폴백으로 흡수하고,
//   그때만 스냅이 미끼를 결정론 재도출한다.
// 토큰 정규화는 fast 검증기와 **같은 함수**(wordOrderComparableTokens)를 써서
// 게이트 판정이 validators/word-order.ts 와 한 글자도 어긋나지 않게 한다.
// 장식(마크다운 강조·감싼 따옴표) 처리는 **전량 ./decoration 공유 유틸**이다 —
// 자체 EMPH/HEADER_PREFIX/stripDecoration 은 이 라운드에 소멸했다(§1-B 철칙3).
// ============================================================================

import { wordOrderComparableTokens } from "@/lib/question-quality/validators/word-order";
import {
  chipsAreInAnswerOrder,
  reorderChipsAwayFromAnswer,
} from "@/lib/topic-sentence-writing";
import {
  cleanMdValue,
  keywordLineRe,
  readKeywordValue,
  sliceKeywordSection,
} from "./decoration";

export interface MdWordOrderQuestion {
  kind: "word-order";
  /** 완성 문장 — 정답의 유일 진실원 */
  modelAnswer: string;
  /** 학생에게 제시할 칩(미끼 포함). 셔플된 상태 */
  chips: string[];
  /**
   * 칩이 `모범답안:` 줄의 청크 마커에서 파생됐는가(신형식). true 면 파싱 직후
   * 칩은 정답 어순 그대로이고 스냅의 셔플이 **설계된 단계**다 — 그때는 재배열을
   * 보정 기록으로 남기지 않는다(모든 정상 문항이 보정 이력을 달면 포렌식이 죽는다).
   */
  chunksFromAnswer?: boolean;
  /** 칩 중 정답에 쓰이지 않는 미끼 — 전부 chips 안에 실재해야 한다 */
  distractors: string[];
  /** 한국어 문맥 힌트(선택) */
  contextHint: string;
  /** 칩만으로 조립 가능한 등가 어순 문장(선택) */
  acceptedAnswers: string[];
  explanation: string;
}

/** 모델이 "없음"으로 비워 오는 실측 드리프트 — 값 없음으로 흡수한다. */
const EMPTY_MARKERS = new Set(["", "-", "—", "–", "없음", "(없음)", "n/a", "na", "none", "null"]);

function isEmptyMarker(value: string): boolean {
  return EMPTY_MARKERS.has(value.trim().toLowerCase());
}

// ── 키워드 줄 — 이 파서가 인식하는 라벨 전부 ────────────────────────────────
// 머리표 장식(굵게·기울임·백틱·취소선·헤딩·인용·불릿·표 파이프·전각콜론·콜론
// **앞뒤** 강조·꼬리 공백·콜론 없는 헤딩)은 전부 공유 keywordLineRe 가 흡수한다.
// 유형마다 EMPH/HEADER_PREFIX 를 재발명하다 각자 **다른 부분집합**만 처리했고, 새는
// 조합마다 그 필드가 **통째로 사라져** 게이트가 "해설 누락"·"미끼 0개" 라는 **사실과
// 다른 원인**을 지목했다 — 그 문구가 [반려 재생성] 피드백이 된다(§1-B 철칙3).
const KW_MODEL_ANSWER = "모범[ \\t]*답안";
const KW_ANSWER = "정답";
const KW_CHIPS = "(?:칩|배열[ \\t]*단어|제시[ \\t]*단어)";
const KW_DISTRACTOR = "미끼";
const KW_HINT = "(?:문맥[ \\t]*)?힌트";
const KW_ACCEPTED = "허용[ \\t]*답(?:안)?";
const KW_EXPLANATION = "해설";
const KW_RUBRIC = "채점[ \\t]*기준";

/** 섹션 정지 키워드 원본 — 하나라도 빠지면 그 블록이 다음 섹션을 통째로 삼킨다. */
const ALL_KEYWORDS: readonly string[] = [
  KW_MODEL_ANSWER, KW_ANSWER, KW_CHIPS, KW_DISTRACTOR,
  KW_HINT, KW_ACCEPTED, KW_EXPLANATION, KW_RUBRIC,
];

function stopKeywordsExcept(keyword: string): string[] {
  return ALL_KEYWORDS.filter((k) => k !== keyword);
}

/** 공유 머리표가 유일하게 모르는 **번호 불릿**(`1. 해설:`)만 진입점에서 걷어낸다. */
function stripOrderedBullets(text: string): string {
  return text.replace(/^([ \t>|]*)\d+[.)][ \t]+/gm, "$1");
}

// 코드펜스·마크다운 제목 — 모델이 `## 지문` 을 되뱉는 드리프트의 섹션 경계.
const FENCE_OR_HEADING_LINE = /^[ \t]*(?:`{3,}|#{1,6}[ \t])/;

/**
 * **이름을 모르는** 라벨 줄도 경계로 본다 — 줄 첫머리의 짧은 토막 + 콜론.
 * 해설이 마지막 섹션이라 종결자가 없으면 모델의 꼬리 출력(`설계 노트: 미끼는 …`,
 * `발문: Rearrange …`)이 해설에 통째로 흡수돼 정답해설 지면이 미끼를 알려줬다.
 * `발문|설계|메모` 열거는 새 라벨마다 다시 뚫리므로 **일반 규칙**으로 끊는다.
 * ⚠ 공유 HEAD_TAIL 은 콜론을 선택으로 두지만(`## 정답` 관습) 이 규칙은 콜론을
 *   **필수**로 요구한다 — 아니면 모든 산문 줄이 경계가 되어 해설이 잘려 나간다.
 */
const ANY_LABEL_LINE =
  /^[ \t]*\|?[ \t]*(?:#{1,6}[ \t]*)?(?:[-*•>][ \t]*)?[*_~`]*[ \t]*[^\s:：][^:：\n]{0,15}[:：]/;

/**
 * 키워드 줄의 **인라인 값**만 읽는다. ⚠ 여러 줄 텍스트에 머리표 정규식을 통째로 걸지
 * 마라 — 공유 HEAD_TAIL 의 `[\s…]*` 가 개행을 삼켜 **다음 줄을 값으로 캡처**한다
 * (`허용답:` 다음 줄 불릿이 `- ` 접두째 채점 집합에 실린다). 줄 단위로 건다.
 */
function readInlineValue(text: string, keyword: string): string {
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(keywordLineRe(keyword));
    if (m) return (m[1] ?? "").trim();
  }
  return "";
}

/**
 * 키워드 섹션 절단 — 정지 키워드는 공유 sliceKeywordSection 이 맡고(손으로 쓴
 * lookahead 가 "일부 키워드만 알아서 블록 붕괴" 를 반복했다), 여기서는 유형 고유
 * 종결자만 더한다: 코드펜스·제목·이름 모를 라벨 줄(+해설은 빈 줄). `inline`(라벨 줄의
 * 값)과 `rest`(그 뒤 본문)를 갈라 반환해 이중 계상을 막는다. */
function readSection(text: string, keyword: string, stopAtBlank: boolean) {
  const inline = readInlineValue(text, keyword);
  const body = sliceKeywordSection(text, keyword, stopKeywordsExcept(keyword));
  const lines = body ? body.split(/\r?\n/) : [];
  // sliceKeywordSection 은 라벨 줄의 인라인 값을 본문 첫 줄로 넣는다.
  if (inline && lines[0] === inline) lines.shift();
  const rest: string[] = [];
  for (const line of lines) {
    if (!line.trim()) {
      if (stopAtBlank) break;
      continue;
    }
    if (FENCE_OR_HEADING_LINE.test(line) || ANY_LABEL_LINE.test(line)) break;
    rest.push(line);
  }
  return { inline, rest };
}

/** 헤더 줄 다음에 이어지는 불릿 목록을 수집한다(인라인 값이 비었을 때의 드리프트). */
function readBulletBlock(text: string, keyword: string): string[] {
  const out: string[] = [];
  // 빈 줄은 건너뛴다(불릿 사이 빈 줄 드리프트) — 종결은 정지 키워드·잡음 라벨이 맡는다.
  for (const line of readSection(text, keyword, false).rest) {
    // 장식을 벗긴 **뒤에** 비었는지 본다 — `- |` 같은 장식뿐인 줄이 빈 원소로 남으면
    // 채점 집합(허용답)이 조용히 오염된다.
    const value = cleanWordOrderValue(line);
    if (!value || isEmptyMarker(value)) continue;
    out.push(value);
  }
  return out;
}

/**
 * 값 하나의 표면 정리 — **장식 처리는 공유 cleanMdValue 에 위임**한다(강조
 * `** __ _ * ~~` 백틱 전 계통 + 값 전체를 감싼 따옴표 한 겹 + 공백 정돈). 여기 남은
 * 것은 이 유형 고유의 잔재뿐이다: 표 행 파이프 · 불릿 접두 · 대괄호 래퍼. 선두
 * 불릿은 **뒤에 공백이 따라올 때만** 벗긴다(칩이 하이픈으로 시작할 여지를 남기는
 * 보수 가드).
 * ⚠ 파이프 트림이 빠지면 **반쪽 관용**이 된다(§1-B 철칙3): `| 모범답안: | <문장> |`
 * 값이 `"| <문장> |"` 로 저장되는데 토큰화가 파이프를 버려 게이트는 클린을 낸다.
 * 그 문자열이 채점 correctAnswer 가 되어 **정답을 정확히 쓴 학생 전원이 오답**이 되고
 * 칩도 `"| the norms"` 로 학생 화면에 나간다.
 */
function cleanWordOrderValue(value: unknown): string {
  let out = cleanMdValue(value);
  for (let i = 0; i < 3; i += 1) {
    const before = out;
    out = out.replace(/^\|+[ \t]*/, "").replace(/[ \t]*\|+$/, "");
    out = out.replace(/^(?:[-•>]|\d+[.)])[ \t]+/, "");
    out = out.replace(/^\[(.+)\]$/, "$1");
    out = cleanMdValue(out);
    if (out === before) break;
  }
  return out;
}

/**
 * 줄 전체를 감싼 래퍼 중 **짝이 맞지 않는** 쪽만 벗긴다(여는 따옴표만 붙이는 드리프트).
 * 짝이 맞는 쌍은 공유 unwrapQuotes·대괄호 규칙이 이미 처리하므로 여기서는 건드리지
 * 않고, 문장 안의 정상 인용(`a "governance lag."`)도 짝이 맞아 그대로 보존된다.
 * ⚠ 아포스트로피(`'` `’`)는 **일부러 뺐다** — `regulators'` 같은 소유격이 홀수 개로
 *   세어져 정상 문장의 글자를 깎아낼 수 있다(보수 가드: 애매하면 건드리지 않는다).
 */
const UNPAIRED_WRAPPERS: readonly (readonly [string, string])[] = [
  ['"', '"'],
  ["“", "”"],
  ["[", "]"],
  ["(", ")"],
];

function countChar(text: string, ch: string): number {
  let n = 0;
  for (const c of text) if (c === ch) n += 1;
  return n;
}

/**
 * 구분자로 쪼개기 **전에** 줄 전체를 감싼 장식을 벗긴다.
 * ⚠ 쌍 규칙(공유 unwrapQuotes · `^\[(.+)\]$`)은 여는 기호와 닫는 기호가 **같은 조각
 *   안에** 있어야 발화한다. ` / ` 로 청크를 쪼갠 뒤에는 여는 따옴표가 1번 청크에,
 *   닫는 따옴표가 N번 청크에 흩어져 영영 매칭되지 않는다 — 파이프·`**`·백틱이
 *   살아남았던 이유(양끝을 **독립적으로** 트림한다)와 정확히 대비되는 사각이다.
 *   그 결과 correctAnswer 가 `"…"` 째로 저장되는데 exam-scoring/normalize.ts 의
 *   normalizeText 는 `" “ ” [ ]` 를 지우지 않아 **정답 문장을 정확히 입력한 학생 전원이
 *   WRONG(0점)** 이 되고, 칩도 `"Restored by planners,` 로 학생 화면에 나간다.
 *   게이트는 토큰화가 이 문자들을 버리므로 끝까지 조용하다(silent-drop).
 */
export function stripWordOrderLineWrappers(value: string): string {
  let out = cleanWordOrderValue(value);
  for (let i = 0; i < 4; i += 1) {
    const before = out;
    for (const [open, close] of UNPAIRED_WRAPPERS) {
      if (out.length < 2) break;
      const opens = countChar(out, open);
      const balanced = open === close ? opens % 2 === 0 : opens === countChar(out, close);
      if (balanced) continue;
      if (out.startsWith(open)) out = out.slice(1);
      else if (out.endsWith(close)) out = out.slice(0, -1);
    }
    out = cleanWordOrderValue(out);
    if (out === before) break;
  }
  return out;
}

/**
 * 칩/청크 구분자 — 계약은 ` / `(양옆 공백)다. **공백이 한쪽에도 없는 슬래시는
 * 구분자가 아니라 칩 안의 문자**로 본다. 이 좁힘이 없으면 `and/or` · `km/h` ·
 * `3/4` 칩이 조용히 두 조각으로 쪼개지는데, 토큰 회계가 슬래시를 버려 게이트는
 * 전부 클린이고 학생은 칩을 정답 순서로 남김없이 배열해도 `and or` ≠ `and/or`
 * 라 오답이 된다 — **정답자가 구조적으로 0명**인 실측 결함이다.
 * 한쪽 공백만 있는 드리프트(`a/ b`)는 계속 흡수한다.
 */
const CHIP_SLASH_SPLIT = /[ \t]+[/／][ \t]*|[ \t]*[/／][ \t]+/;
const CHIP_PIPE_SPLIT = /[ \t]*\|[ \t]*/;

/**
 * 구분 줄 → 조각 배열(정답 청크·미끼·구형 칩 공용). 슬래시가 하나도 없고
 * 파이프만 있는 표 드리프트는 흡수한다. **쉼표로는 절대 나누지 않는다** —
 * 칩이 쉼표를 담을 수 있어(", which can lead to") 나누면 조용히 쪼개진다.
 */
export function splitWordOrderChips(line: string): string[] {
  const raw = line.trim();
  if (!raw || isEmptyMarker(raw)) return [];
  const parts = CHIP_SLASH_SPLIT.test(raw)
    ? raw.split(CHIP_SLASH_SPLIT)
    : raw.includes("|")
      ? raw.split(CHIP_PIPE_SPLIT)
      : [raw];
  return parts
    .map((part) => cleanWordOrderValue(part))
    .filter((c) => c.length > 0 && !isEmptyMarker(c));
}

/**
 * 정답 청크를 이어 붙여 완성 문장으로 되돌린다. 청크 경계가 구두점 앞에 놓이는
 * 드리프트(`respond , / the norms`)만 흡수한다 — 영어에서 구두점 앞 공백은
 * 언제나 오식이라 보수 가드에 걸리지 않는다.
 */
export function joinWordOrderChunks(chunks: readonly string[]): string {
  return chunks
    .join(" ")
    .replace(/[ \t]+([,.;:!?])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 배열 영작 md 파싱. 드리프트 관용(정본 parseMdBlank 규약): 라벨 표기 흔들림
 * (모범답안/모범 답안/정답), 구분자 주변 공백, 불릿·굵게·제목·표 파이프 접두,
 * 전각 콜론, 인라인 값 대신 다음 줄 불릿 목록으로 내는 실측 패턴.
 */
export function parseMdWordOrder(raw: string): MdWordOrderQuestion {
  // 번호 불릿만 먼저 정규화하고(공유 머리표가 유일하게 모르는 표기), 나머지 장식은
  // 전부 공유 유틸이 흡수한다.
  const text = stripOrderedBullets(raw);

  // ⚠ 구분자로 쪼개기 **전에** 줄 전체 래퍼를 벗긴다 — 쪼갠 뒤에는 여는 기호와 닫는
  //   기호가 서로 다른 청크로 흩어져 쌍 규칙이 영영 발화하지 못한다. 리스트 값을 받는
  //   세 줄(모범답안·칩·미끼)에 **모두** 건다 — 한 줄만 고치면 같은 결함이 다른
  //   입구로 그대로 들어온다(§1-B 철칙3 반쪽 관용 금지). readKeywordValue 는 값이
  //   **다음 줄**에 있는 드리프트까지 흡수하되 정지 키워드에서 멈춘다.
  const modelAnswerLine = stripWordOrderLineWrappers(
    readKeywordValue(text, KW_MODEL_ANSWER, stopKeywordsExcept(KW_MODEL_ANSWER)) ||
      readKeywordValue(text, KW_ANSWER, stopKeywordsExcept(KW_ANSWER)),
  );

  // 칩·미끼·허용답은 **인라인 값만** 읽는다 — 다음 줄 흡수를 걸면 불릿 목록의 첫
  // 줄이 인라인 값으로 빨려 들어가 목록 전체가 칩 하나로 무너진다(실측 계통).
  const chipInline = readInlineValue(text, KW_CHIPS);
  const legacyChips = chipInline
    ? splitWordOrderChips(stripWordOrderLineWrappers(chipInline))
    : readBulletBlock(text, KW_CHIPS);

  const distractorInline = readInlineValue(text, KW_DISTRACTOR);
  const distractors = distractorInline
    ? splitWordOrderChips(stripWordOrderLineWrappers(distractorInline))
    : readBulletBlock(text, KW_DISTRACTOR);

  // 신형식: 정답 문장과 청크 경계를 `모범답안:` **한 줄에서만** 받는다. 칩 = 정답
  // 청크 ∪ 미끼이므로 "칩으로 모범답안을 조립할 수 없음" 이 검사가 아니라 항등식이
  // 된다(§1-B 철칙1). 마커가 없으면 구형(`칩:` 줄) 폴백 — 계약은 하나, 파싱은 관대.
  const answerChunks = splitWordOrderChips(modelAnswerLine);
  const chunksFromAnswer = answerChunks.length > 1;
  const modelAnswer = chunksFromAnswer
    ? joinWordOrderChunks(answerChunks)
    : modelAnswerLine;
  const chips = chunksFromAnswer ? [...answerChunks, ...distractors] : legacyChips;

  const hintRaw = readKeywordValue(text, KW_HINT, stopKeywordsExcept(KW_HINT));

  // 인라인 값은 **장식을 벗긴 뒤** 비었는지 본다 — `| 허용답: |`(표 행)처럼 값이
  // 장식뿐이면 벗긴 결과가 빈 문자열인데, 벗기기 전에 판정하면 빈 원소가 허용답
  // 집합에 실린다(채점 집합에 들어가는 값이라 조용한 오염이 된다).
  const acceptedInline = stripWordOrderLineWrappers(readInlineValue(text, KW_ACCEPTED));
  const acceptedBullets = readBulletBlock(text, KW_ACCEPTED);
  const acceptedAnswers = [
    ...(acceptedInline && !isEmptyMarker(acceptedInline) ? [acceptedInline] : []),
    ...acceptedBullets,
  ];

  // 해설은 **마지막** 섹션이라 종결자가 필요하다. 두 문장이 개행으로 갈려 오는
  // 드리프트는 계속 흡수하되 ①첫 빈 줄 ②다른 섹션 키워드(공유 sliceKeywordSection)
  // ③코드펜스·제목 ④이름 모를 라벨 줄 중 먼저 오는 곳에서 끊는다(게이트 #12 는
  // 한글 포함만 보므로 꼬리 흡수를 못 잡는다).
  const explanationSection = readSection(text, KW_EXPLANATION, true);
  const explanation = cleanWordOrderValue(
    [explanationSection.inline, ...explanationSection.rest].join(" "),
  );

  return {
    kind: "word-order",
    modelAnswer,
    chips,
    chunksFromAnswer,
    distractors,
    contextHint: isEmptyMarker(hintRaw) ? "" : stripWordOrderLineWrappers(hintRaw),
    acceptedAnswers,
    explanation,
  };
}

// ── 토큰 회계 ────────────────────────────────────────────────────────────────

export function wordOrderTokenMultiset(tokens: string[]): Map<string, number> {
  const multiset = new Map<string, number>();
  for (const token of tokens) multiset.set(token, (multiset.get(token) ?? 0) + 1);
  return multiset;
}

export interface WordOrderAccounting {
  /** 정답이 요구하는데 (칩 − 미끼) 에 없는 토큰 — 학생이 정답을 만들 수 없다 */
  missing: string[];
  /** (칩 − 미끼) 에 남는 토큰 — 선언되지 않은 미끼가 있다는 뜻 */
  surplus: string[];
}

/** (칩 − 선언미끼) 멀티셋 ↔ modelAnswer 멀티셋 과부족 회계. */
export function wordOrderAccounting(
  chips: readonly string[],
  distractors: readonly string[],
  modelAnswer: string,
): WordOrderAccounting {
  const available = new Map<string, number>();
  for (const chip of chips) {
    for (const token of wordOrderComparableTokens(chip)) {
      available.set(token, (available.get(token) ?? 0) + 1);
    }
  }
  for (const distractor of distractors) {
    for (const token of wordOrderComparableTokens(distractor)) {
      const count = available.get(token) ?? 0;
      if (count > 0) available.set(token, count - 1);
    }
  }
  const missing: string[] = [];
  for (const token of wordOrderComparableTokens(modelAnswer)) {
    const count = available.get(token) ?? 0;
    if (count > 0) available.set(token, count - 1);
    else missing.push(token);
  }
  const surplus: string[] = [];
  for (const [token, count] of available) {
    for (let i = 0; i < count; i += 1) surplus.push(token);
  }
  return { missing, surplus };
}

/**
 * 칩·모범답안만으로 미끼 칩을 결정론 재도출한다(구형 폴백 경로의 0원 복구).
 * "남은 정답 토큰으로 전부 덮이는" 칩만 정답 칩으로 소비하고 못 덮는 칩은 미끼로
 * 돌린다. 정답 토큰이 하나라도 남으면(= 조립 불가) null 을 돌려 **보정하지 않는다**
 * — 그건 게이트가 지목해야 할 진짜 결함이다. 소비 순서는 토큰 수 내림차순(동수면
 * 원래 순서): 왼→오 순진 탐욕은 짧은 칩이 긴 칩의 토큰을 먼저 먹어 조립 가능한
 * 조합을 놓친다(정답 "…were shaped…" · 칩 [shaped][were shaped]).
 */
export function deriveWordOrderDistractors(
  chips: readonly string[],
  modelAnswer: string,
): string[] | null {
  const remaining = wordOrderTokenMultiset(wordOrderComparableTokens(modelAnswer));
  if (remaining.size === 0) return null;
  const isDistractor = new Array<boolean>(chips.length).fill(false);
  const order = chips
    .map((chip, index) => ({ index, tokens: wordOrderComparableTokens(chip) }))
    .sort((a, b) => b.tokens.length - a.tokens.length || a.index - b.index);
  for (const { index, tokens } of order) {
    if (tokens.length === 0) {
      // 구두점 전용 칩 — 정답에 쓰이지 않는다(게이트가 따로 반려한다).
      isDistractor[index] = true;
      continue;
    }
    const need = wordOrderTokenMultiset(tokens);
    let coverable = true;
    for (const [token, count] of need) {
      if ((remaining.get(token) ?? 0) < count) {
        coverable = false;
        break;
      }
    }
    if (!coverable) {
      isDistractor[index] = true;
      continue;
    }
    for (const [token, count] of need) remaining.set(token, (remaining.get(token) ?? 0) - count);
  }
  const leftover = [...remaining.values()].reduce((a, b) => a + b, 0);
  return leftover === 0 ? chips.filter((_, i) => isDistractor[i]) : null;
}

// ── 정답 어순 누수 판정 · 결정론 배치 ────────────────────────────────────────

/** 선언 미끼를 (문자열당 1개씩) 걷어낸 "정답 칩" 목록. */
export function wordOrderAnswerChips(
  chips: readonly string[],
  distractors: readonly string[],
): string[] {
  const budget = new Map<string, number>();
  for (const d of distractors) budget.set(d, (budget.get(d) ?? 0) + 1);
  const out: string[] = [];
  for (const chip of chips) {
    const left = budget.get(chip) ?? 0;
    if (left > 0) {
      budget.set(chip, left - 1);
      continue;
    }
    out.push(chip);
  }
  return out;
}

/**
 * 칩을 왼→오로 읽되 미끼만 건너뛰면 정답 문장이 그대로 나오는가.
 * fast 의 `scrambled-already-solved`(칩 **전체** 이어붙임 == 정답)는 미끼가 하나만
 * 있어도 발화하지 않고, `chipsAreInAnswerOrder` 는 어간 커버리지 60% 규칙이라
 * 다단어 청크 설계에서 구조적으로 미달한다 — 두 검사 사이로 "정답 칩만 순서대로
 * 늘어놓은" 실질 누수가 통째로 빠져나간다. 여기서 토큰열을 직접 대조해 막는다.
 */
export function chipsRevealAnswerOrder(
  chips: readonly string[],
  distractors: readonly string[],
  modelAnswer: string,
): boolean {
  const answer = wordOrderComparableTokens(modelAnswer).join(" ");
  if (!answer) return false;
  const shown = wordOrderComparableTokens(
    wordOrderAnswerChips(chips, distractors).join(" "),
  ).join(" ");
  return shown === answer;
}

/**
 * 칩 최종 배치 — **파서 스냅과 어댑터가 반드시 같은 함수를 쓴다.** 게이트가 본
 * 배열과 저장되는 배열이 어긋나면 게이트가 통과시킨 형상이 아닌 것이 학생에게 간다.
 * reorderChipsAwayFromAnswer(fast 동형·해시 정렬이라 내용만으로 결정)로 먼저 배치하고,
 * 여전히 어순을 노출하면 결정론 회전으로 탈출한다. 해시 정렬이 입력 순서와 무관해
 * 이 함수는 **멱등**이다(이중 호출 안전).
 */
export function arrangeWordOrderChips(
  chips: readonly string[],
  distractors: readonly string[],
  modelAnswer: string,
): string[] {
  const arr = chips.map((c) => String(c));
  if (arr.length < 2 || !modelAnswer) return arr;
  const base = reorderChipsAwayFromAnswer(arr, modelAnswer);
  if (!chipsRevealAnswerOrder(base, distractors, modelAnswer)) return base;
  for (let k = 1; k < base.length; k += 1) {
    const rotated = [...base.slice(k), ...base.slice(0, k)];
    if (
      !chipsRevealAnswerOrder(rotated, distractors, modelAnswer) &&
      !chipsAreInAnswerOrder(rotated, modelAnswer)
    ) {
      return rotated;
    }
  }
  return [...base].reverse();
}
