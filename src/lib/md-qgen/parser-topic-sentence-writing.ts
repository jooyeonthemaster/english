// ============================================================================
// 주제문 영작(TOPIC_SENTENCE_WRITING) md 파서.
// 견본(EXEMPLAR): parser-antonym.ts — 파서는 관대하게(드리프트 흡수), 게이트는 엄격하게.
// 파일 분리 규약(500줄)에 따라 본체가 셋으로 나뉜다:
//   parser-*.ts (이 파일 · 파싱 + 순수 비교 헬퍼) ·
//   snap-*.ts (0원 자동 보정) · gate-*.ts (0원 결정형 검사)
//
// 이 유형은 **서술형**이라 선지가 없고, 지문을 재출력하지도 않는다.
// 정답의 진실원:
//   scrambled → `주제문:` 한 줄(= modelAnswer)
//   cloze     → `정답(A):`·`정답(B):` 줄. **모범답안은 받지 않고 치환으로 합성한다**
//               (규범 §1-B 철칙1 — 파생 가능한 값을 두 번 받으면 불일치 실패 모드가 생긴다).
//
// 학생 답안 키 축(정찰 §2-5): blanks[].label 이 곧 StudentInput.texts 의 키다.
// 반드시 "(A)" 괄호 대문자로 정규화한다 — "A"/"(a)" 로 새면 저장된 응답과 desync 한다.
// ============================================================================

import { findUnbuildableWordBankBlanks } from "@/lib/question-quality/validators/summary/writing";
import type { TswMdMode } from "./prompts-topic-sentence-writing";

export interface MdTswBlank {
  /** "(A)" ~ "(J)" — 채점 키. 괄호 대문자 고정 */
  label: string;
  /** 🔒 이 빈칸의 모범 영작(다단어 어구) */
  answer: string;
  /** 🔒 동치 정답 — `동치(A):` 줄을 " / " 로 나눈 것 */
  variants: string[];
}

export interface MdTswQuestion {
  kind: "topic-sentence-writing";
  /** 설정이 확정한 모드 — 유일한 진실원(모델의 `방식:` 줄은 드리프트 신호일 뿐) */
  mode: TswMdMode;
  /** 모델이 낸 `방식:` 정규화값("scrambled"|"cloze"|"") */
  declaredMode: string;
  /** `주제문:` — scrambled 면 완성문, cloze 면 placeholder 판 */
  topic: string;
  /** `칩:`(scrambled) 또는 `보기:`(cloze) */
  chips: string[];
  /** `미끼:` — 전부 chips 안에 실재해야 한다 */
  distractors: string[];
  /** `힌트:` — koreanGloss */
  hint: string;
  /** cloze 전용 */
  blanks: MdTswBlank[];
  /** scrambled=topic · cloze=주제문 치환 합성본 */
  modelAnswer: string;
  /** scrambled 전용 `허용답:` — 칩 멀티셋이 같은 등가 어순만 살아남는다 */
  acceptedVariants: string[];
  scoringCriteria: string[];
  explanation: string;
  /** 형식 드리프트 관측용(게이트가 XOR 위반을 자리로 지목한다) */
  sawChipLabel: boolean;
  sawBankLabel: boolean;
  /** `주제문:`/`주제:` 라벨로 온 값이 있었는가(false 면 `모범답안:` 흡수분이다) */
  sawTopicLabel: boolean;
  sawAnswerLine: boolean;
  /** 출력이 진짜 마크다운 표로 보이는가 — 라벨을 못 잡았을 때 원인을 지목한다(철칙3·5) */
  sawTableLayout: boolean;
  /** 미끼를 `미끼:` 줄이 아니라 칩 타일링에서 파생 확정했는가(철칙1) */
  distractorsDerived: boolean;
  /** cloze 인데 모델이 굳이 낸 `모범답안:` 줄(계약 외 — 합성본이 이긴다) */
  strayModelAnswer: string;
}

const LABEL_KEYS = "ABCDEFGHIJ";

/**
 * 강조 토큰 — 굵게(`**`)만 관용하고 **언더스코어를 빠뜨리면** `__주제문:__` 한 줄이
 * 통째로 유실된다(전수 감사 실측: 언더스코어 계열만으로 라벨 11종 × 5형 = 55칸이 뚫렸다).
 * 이탤릭 한 글자(`*` `_`)와 코드 스팬(백틱)까지 같은 집합으로 묶어, 접두·라벨 뒤·값
 * 어느 자리에 붙어도 같은 관용을 적용한다.
 */
const EMPH = "(?:\\*\\*|__|[*_`])";

// 라벨 앞의 마크다운 장식(인용·표 파이프·헤딩·불릿·굵게·이탤릭·코드)을 흡수한다 —
// 모델이 목록을 꾸미는 실측 드리프트. **키워드 줄 무관용은 이 유형 계통의 1위 결함**
// 이므로(silent-drop) 모든 라벨 줄이 같은 접두·구분자 관용을 공유한다.
const LINE_PREFIX = `^[ \\t]*(?:>[ \\t]*)*\\|?[ \\t]*(?:#{1,6}[ \\t]*)?(?:[-*•][ \\t]*)?${EMPH}?`;

/**
 * 라벨과 값 사이 구분자. 반각·전각 콜론뿐 아니라 **표 셀 경계 파이프**도 받는다 —
 * 진짜 마크다운 표(`| 칩 | a / b |`)로 낸 출력이 라벨 뒤에 콜론이 없다는 이유로
 * 6줄 통째로 유실되던 실측 결함(§1-B 철칙3)의 처방이다.
 */
const LABEL_SEP = "[ \\t]*[:：|][ \\t]*";

/** 라벨 뒤 괄호 첨자(`정답(A):`) — 전각 괄호·대괄호 드리프트까지 흡수한다. */
const LABEL_INDEX = `[([（]?[ \\t]*([A-Za-z])[ \\t]*[)\\]）]?[ \\t]*${EMPH}?`;

/**
 * 섹션 경계로 쓰는 알려진 라벨 머리들. 목록·해설 구간을 여기서 끊는다.
 * ⚠ **구분자까지 요구**한다. 종전에는 라벨 글자만 보고 끊어서, `- 정답 어순이 맞으면
 * 만점입니다` 같은 평범한 채점기준 항목이 섹션 경계로 오인돼 그 아래가 통째로 사라졌다
 * (silent-drop). 첨자(`정답(A):`)는 경계가 맞으므로 선택적으로 흡수한다.
 */
const KNOWN_HEAD_RE = new RegExp(
  `${LINE_PREFIX}(?:방식|주제문|주제|칩|보기|미끼|힌트|허용답|채점기준|해설|모범답안|정답|동치)${EMPH}?(?:${LABEL_INDEX})?${LABEL_SEP}`,
);

/** 마크다운 표 행 — `| ... |` 로 여닫는 줄. */
const TABLE_ROW_RE = /^[ \t]*\|.*\|[ \t]*$/;

/**
 * 값 양끝을 감싸는 **쌍** 장식. 한쪽만 떼면 값 선두/말미가 오염되므로 짝이 맞을 때만
 * 벗긴다(따옴표는 값 안쪽에 정상적으로 들어갈 수 있어 무조건 제거가 위험하다).
 */
const PAIRED_WRAPS: ReadonlyArray<readonly [string, string]> = [
  ['"', '"'],
  ["'", "'"],
  ["“", "”"],
  ["‘", "’"],
  ["「", "」"],
  ["『", "』"],
];

/**
 * ⚠ trim 을 **먼저** 한다. 종전에는 장식 제거가 먼저라 줄 끝 공백이 하나만 있어도
 * `**` 가 값에 눌어붙어(`...of a city.**`) 게이트는 통과하고 채점만 영원히 어긋났다.
 * 후행 장식은 `**`·`__`·이탤릭·코드 스팬·표 셀 마감 `|` 가 섞여 올 수 있으므로 수렴할
 * 때까지 반복 제거한다. 짝 장식(따옴표류)은 **양끝이 다 있을 때만** 벗긴다.
 *
 * `←` 이하 절단: 출력 형식 리터럴이 `칩: <...>   ← 구분자는 슬래시 하나뿐` 처럼 화살표
 * 주석을 달고 있어 모델이 그대로 에코하면 마지막 재료에 한국어 주석이 눌어붙는다.
 */
function cleanValue(raw: string): string {
  let out = raw.replace(/\r/g, "").trim();
  for (;;) {
    let next = out
      .replace(/[ \t]*←.*$/, "")
      .replace(new RegExp(`^${EMPH}[ \\t]*`), "")
      .replace(new RegExp(`[ \\t]*${EMPH}$`), "")
      .replace(/[ \t]*\|$/, "")
      .trim();
    for (const [open, close] of PAIRED_WRAPS) {
      if (
        next.length >= open.length + close.length &&
        next.startsWith(open) &&
        next.endsWith(close)
      ) {
        next = next.slice(open.length, next.length - close.length).trim();
        break;
      }
    }
    if (next === out) return out;
    out = next;
  }
}

function firstLabelValue(text: string, label: string): string {
  const re = new RegExp(`${LINE_PREFIX}${label}${EMPH}?${LABEL_SEP}(.+)$`, "m");
  const hit = re.exec(text);
  return hit ? cleanValue(hit[1]) : "";
}

function hasLabel(text: string, label: string): boolean {
  return new RegExp(`${LINE_PREFIX}${label}${EMPH}?${LABEL_SEP}`, "m").test(text);
}

/**
 * 라벨 줄 + **접힘(줄바꿈) 흡수**. 모델이 긴 주제문을 두 줄로 접어 내면 종전 파서는
 * 첫 줄만 잡아 정답 키를 문장 조각으로 잘랐고, 조각이 단어수 범위 안이면 게이트도
 * 클린이라 조각이 그대로 정답지로 출하됐다(critical silent-drop).
 *
 * 보수 가드 — 다음을 **전부** 만족하는 줄만 이어 붙인다(최대 2줄):
 *  ① 알려진 라벨 머리가 아니고 빈 줄도 아니다  ② 한글이 없다(한국어 사족 줄 차단)
 *  ③ 소문자 알파벳으로 시작한다(새 문장·새 항목 차단)
 *  ④ 지금까지 모은 값이 문말 부호로 끝나지 않는다(이미 완결된 값에는 붙이지 않는다)
 *
 * 예외 — 머리 줄의 값이 **비어 있으면**(`**주제문:**` 뒤 줄바꿈) ③을 대문자까지 완화한다.
 * 그 경우 값이 통째로 유실돼 "주제문 줄 누락"이라는 거짓 원인이 붙으므로(줄은 실제로
 * 있다) 새 문장 차단 가드를 적용할 값 자체가 없다.
 */
function foldedLabelValue(text: string, label: string): string {
  const lines = text.split(/\r?\n/);
  const headRe = new RegExp(`${LINE_PREFIX}${label}${EMPH}?${LABEL_SEP}(.*)$`);
  for (let i = 0; i < lines.length; i += 1) {
    const head = headRe.exec(lines[i]);
    if (!head) continue;
    let value = cleanValue(head[1] ?? "");
    for (let j = i + 1; j < lines.length && j <= i + 2; j += 1) {
      const line = lines[j];
      if (!line.trim() || KNOWN_HEAD_RE.test(line) || TABLE_ROW_RE.test(line)) break;
      if (/[.!?]["'’)\]]?$/.test(value)) break;
      if (/[가-힣]/.test(line)) break;
      if (!new RegExp(`^[ \\t]*${EMPH}?[ \\t]*${value ? "[a-z]" : "[A-Za-z]"}`).test(line)) {
        break;
      }
      value = `${value} ${cleanValue(line)}`.replace(/\s{2,}/g, " ").trim();
    }
    if (value) return value;
  }
  return "";
}

/** "(a)" · "A." · "[B]" → "(A)". 범위 밖이면 "" (게이트가 지목한다). */
export function tswParenLabel(raw: string): string {
  const key = raw.trim().replace(/[()[\].:]/g, "").toUpperCase();
  return key.length === 1 && LABEL_KEYS.includes(key) ? `(${key})` : "";
}

/**
 * 나열 구분자는 슬래시 하나뿐이다(규범 §7-8). 표 파이프 드리프트도 같은 경계로 흡수한다.
 * 쉼표로 나누지 않는 이유: 영어 어구에는 쉼표가 실제로 들어가서, 쉼표 구분자는 정답을
 * 조각으로 쪼개 "조각 하나가 만점"이 되는 조용한 채점 사고를 만든다.
 */
export function splitTswChips(raw: string): string[] {
  return raw
    .split(/\s*[/|]\s*/)
    .map((chip) => cleanValue(chip))
    .filter(Boolean);
}

/**
 * `허용답:`/`채점기준:` 목록. **불릿 없는 평문 줄도 항목으로 받는다** — 종전에는 첫
 * 비-불릿 줄에서 break 해서, 불릿을 빠뜨린 `허용답:` 항목이 corrections 에도 게이트에도
 * 흔적 없이 사라졌다(등가 어순 답안이 조용히 자동 오답 — major silent-drop).
 * 파서는 관대하게 받고, 오염은 스냅이 절삭하며 기록한다(위험 #2 경로 재사용).
 * 경계: 알려진 라벨 머리 · 마크다운 헤딩 · 표 행 · 빈 줄 2연속.
 */
function parseListSection(text: string, label: string): string[] {
  const lines = text.split(/\r?\n/);
  const headRe = new RegExp(`${LINE_PREFIX}${label}${EMPH}?${LABEL_SEP}(.*)$`);
  const out: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const head = headRe.exec(lines[i]);
    if (!head) continue;
    const inline = cleanValue(head[1] ?? "");
    if (inline) out.push(inline); // `허용답: 한 줄짜리` 드리프트 흡수
    let blanks = 0;
    for (let j = i + 1; j < lines.length; j += 1) {
      if (!lines[j].trim()) {
        blanks += 1;
        if (blanks >= 2) break;
        continue;
      }
      blanks = 0;
      if (KNOWN_HEAD_RE.test(lines[j]) || /^[ \t]*#{1,6}[ \t]/.test(lines[j])) break;
      if (TABLE_ROW_RE.test(lines[j])) break;
      const item = /^[ \t]*(?:[-*•]|\d+[.)])[ \t]+(.+)$/.exec(lines[j]);
      out.push(cleanValue(item ? item[1] : lines[j]));
    }
    break;
  }
  return out.filter(Boolean);
}

function parseExplanation(text: string): string {
  const lines = text.split(/\r?\n/);
  const headRe = new RegExp(`${LINE_PREFIX}해설${EMPH}?${LABEL_SEP}(.*)$`);
  for (let i = 0; i < lines.length; i += 1) {
    const head = headRe.exec(lines[i]);
    if (!head) continue;
    const body = [cleanValue(head[1] ?? "")];
    for (let j = i + 1; j < lines.length; j += 1) {
      if (KNOWN_HEAD_RE.test(lines[j]) || TABLE_ROW_RE.test(lines[j])) break;
      // 이어지는 줄도 같은 장식 관용을 받는다 — 종전에는 trim 만 해서 굵게·이탤릭이
      // 해설 본문에 그대로 눌어붙었다(라벨 줄만 관용하고 값 줄은 아니던 비대칭).
      body.push(cleanValue(lines[j]));
    }
    return body.join(" ").replace(/\s{2,}/g, " ").trim();
  }
  return "";
}

/**
 * `방식:` 은 프롬프트에 박힌 상수의 에코라 정보량이 0이다(모드의 진실원은 설정).
 * 종전에는 '빈칸'을 'scrambled' 보다 먼저 검사해서, `방식: scrambled (배열 — 빈칸
 * 완성이 아님)` 같은 자기 해설 사족이 붙으면 declaredMode='cloze' 로 뒤집혀 완벽한
 * 문항이 오반려됐다. **설정 모드의 키워드가 포함돼 있으면 일치로 본다.**
 */
function normalizeDeclaredMode(raw: string, mode: TswMdMode): string {
  const v = raw.toLowerCase();
  const scrambled = v.includes("scrambled") || v.includes("배열");
  const cloze = v.includes("cloze") || v.includes("빈칸");
  if (!scrambled && !cloze) return "";
  if (mode === "scrambled" && scrambled) return "scrambled";
  if (mode === "cloze" && cloze) return "cloze";
  return scrambled ? "scrambled" : "cloze";
}

/** cloze 모범답안 = 주제문의 placeholder 를 빈칸 정답으로 치환한 결정론 파생값. */
export function synthesizeTswModelAnswer(
  topic: string,
  blanks: MdTswBlank[],
): string {
  let out = topic;
  for (const blank of blanks) {
    if (!blank.label || !blank.answer) continue;
    out = out.split(blank.label).join(blank.answer);
  }
  return out.replace(/\s{2,}/g, " ").replace(/\s+([,.;:!?])/g, "$1").trim();
}

/** 영어 단어 토큰(기능어 포함) — 칩 타일링·멀티셋 대조용. */
export function tswWordTokens(value: string): string[] {
  return (value.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g) ?? []).map((token) =>
    token.toLowerCase().replace(/[’]/g, "'"),
  );
}

/** 두 문장이 완전히 같은 토큰 멀티셋인가(word-order.ts:96-142 의 등가 판정 이식). */
export function sameTswTokenMultiset(a: string, b: string): boolean {
  const ta = [...tswWordTokens(a)].sort();
  const tb = [...tswWordTokens(b)].sort();
  return ta.length === tb.length && ta.every((token, i) => token === tb[i]);
}

/** 칩 멀티셋으로 이 어구를 조립할 수 있는가(SW 조립 판정 알고리즘 그대로 재사용). */
export function tswBuildableFromChips(chips: string[], phrase: string): boolean {
  if (chips.length === 0) return true; // 보기가 없으면 조립 제약 자체가 없다
  return (
    findUnbuildableWordBankBlanks(chips, [
      { label: "(A)", candidates: [phrase] },
    ]).length === 0
  );
}


/** cloze 보기 어순 검사 기준 — 빈칸 정답을 라벨 순으로 이어 붙인 문자열. */
export function tswBlankAnswerSequence(blanks: MdTswBlank[]): string {
  return [...blanks]
    .filter((blank) => blank.answer)
    .sort((a, b) => a.label.localeCompare(b.label))
    .map((blank) => blank.answer)
    .join(" ");
}

/**
 * 주제문 영작 md 파싱. 드리프트 관용(정본 parseMdBlank 규약):
 * 라벨 표기 흔들림(굵게·불릿·표 파이프·전각 콜론), 구분자 주변 공백,
 * `칩:`/`보기:` 라벨 혼용, 라벨 없는 단일 `정답:`(blankCount=1 실측 드리프트).
 */
export function parseMdTopicSentenceWriting(
  text: string,
  mode: TswMdMode,
): MdTswQuestion {
  const strayModelAnswer = foldedLabelValue(text, "모범답안");
  const labelledTopic =
    foldedLabelValue(text, "주제문") || foldedLabelValue(text, "주제");
  // scrambled 는 `주제문:` 줄이 곧 모범답안이다 — 모델이 그 줄을 `모범답안:` 으로 내면
  // 종전에는 topic="" 이 되어 "주제문 줄 누락"이라는 **거짓 원인**으로 반려됐다(줄은
  // 있고 값도 정확한데 라벨만 다른 실측 드리프트). 파서는 관대하게 흡수하고 스냅이 기록한다.
  const topic =
    labelledTopic || (mode === "scrambled" ? strayModelAnswer : "");
  const chipLine = firstLabelValue(text, "칩");
  const bankLine = firstLabelValue(text, "보기");
  const sawChipLabel = hasLabel(text, "칩");
  const sawBankLabel = hasLabel(text, "보기");

  // 모드에 맞는 라벨을 우선하되, 반대 라벨로 온 것도 흡수한다(게이트가 아니라 스냅이 기록).
  const chipsRaw =
    mode === "scrambled" ? chipLine || bankLine : bankLine || chipLine;

  const blankMap = new Map<string, MdTswBlank>();
  const answerRe = new RegExp(
    `${LINE_PREFIX}정답${EMPH}?[ \\t]*${LABEL_INDEX}${LABEL_SEP}(.+)$`,
    "gm",
  );
  for (const hit of text.matchAll(answerRe)) {
    const label = tswParenLabel(hit[1]);
    if (!label || blankMap.has(label)) continue;
    blankMap.set(label, { label, answer: cleanValue(hit[2]), variants: [] });
  }
  // 라벨 없는 단일 `정답:` — blankCount 1 에서 모델이 라벨을 생략하는 실측 드리프트.
  if (blankMap.size === 0) {
    const bare = firstLabelValue(text, "정답");
    if (bare) blankMap.set("(A)", { label: "(A)", answer: bare, variants: [] });
  }

  const variantRe = new RegExp(
    `${LINE_PREFIX}동치${EMPH}?[ \\t]*${LABEL_INDEX}${LABEL_SEP}(.+)$`,
    "gm",
  );
  for (const hit of text.matchAll(variantRe)) {
    const label = tswParenLabel(hit[1]);
    const target = blankMap.get(label);
    if (!target) continue;
    target.variants = splitTswChips(cleanValue(hit[2]));
  }
  if (blankMap.size === 1 && blankMap.has("(A)")) {
    const bare = firstLabelValue(text, "동치");
    const only = blankMap.get("(A)");
    if (bare && only && only.variants.length === 0) {
      only.variants = splitTswChips(bare);
    }
  }

  const blanks = [...blankMap.values()].sort((a, b) => a.label.localeCompare(b.label));

  return {
    kind: "topic-sentence-writing",
    mode,
    declaredMode: normalizeDeclaredMode(firstLabelValue(text, "방식"), mode),
    topic,
    chips: splitTswChips(chipsRaw),
    distractors: splitTswChips(firstLabelValue(text, "미끼")),
    hint: firstLabelValue(text, "힌트"),
    blanks: mode === "cloze" ? blanks : [],
    modelAnswer:
      mode === "scrambled" ? topic : synthesizeTswModelAnswer(topic, blanks),
    acceptedVariants:
      mode === "scrambled" ? parseListSection(text, "허용답") : [],
    scoringCriteria: parseListSection(text, "채점기준"),
    explanation: parseExplanation(text),
    sawChipLabel,
    sawBankLabel,
    sawTopicLabel: Boolean(labelledTopic),
    sawAnswerLine: blankMap.size > 0,
    sawTableLayout:
      text.split(/\r?\n/).filter((line) => TABLE_ROW_RE.test(line)).length >= 2,
    distractorsDerived: false,
    strayModelAnswer,
  };
}

