// ============================================================================
// 요약문 영작(SUMMARY_WRITING) md 파서.
// 견본: parser-antonym.ts · parser-summary-mc.ts
// 정본 규약: 파서는 관대하게(드리프트 흡수) · 게이트는 엄격하게.
// 0원 결정형 게이트는 gate-summary-writing.ts, 0원 자동 보정은 snap-summary-writing.ts
// 로 분리(400줄 분할 조항 · gate-combo 선례).
//
// 【장식 처리 단일화 — 26-07-27】 머리표(들여쓰기·인용·헤딩·불릿·표 파이프·콜론 앞뒤
//   강조·전각콜론)와 값 장식(** __ _ * ~~ 백틱·감싼 따옴표) 흡수는 공용 유틸
//   ./decoration.ts **하나로** 단일화했다. 자체 EMPH/LINE_PREFIX/COLON/SECTION_BREAK_RE/
//   stripLineDecoration/stripEmphasisEdges 는 전량 삭제했다 — 유형마다 각자 다른
//   부분집합만 처리하다 (a) 필드가 통째로 사라져 게이트가 **사실과 다른 원인**을 재생성
//   피드백으로 내보내고 (b) 한쪽만 벗겨진 장식이 학생 표면까지 새던 계통의 근인이 그것이다.
//   이 파일에 남은 고유 조각은 셋뿐이고 셋 다 장식이 아니라 이 유형의 **의미 축**이다:
//     ① 빈칸 라벨 `(A)` 조각 ② 목록 항목의 구조 줄머리 ③ 요약문 빈칸선(`____`) 보존.
//   의존은 ./decoration 하나이며 그 역시 의존성 0 순수 모듈이다.
//
// 이 유형의 계약 축(다른 유형과 다른 지점):
//  · **선지가 없다.** 빈칸별 `정답(A):` 가 각자 진실원이고, 라벨은 `(A)` 괄호 대문자
//    **고정**이다 — 그 문자열이 그대로 채점 입력 키다(answer-spec.ts:210 →
//    grade.ts:115). `A`·`(a)` 로 새면 학생 답안 키가 desync 되고 전건 보류가 된다.
//  · **모범답안·미끼를 받지 않는다**(철칙 1: 같은 사실을 두 곳에서 받지 않는다).
//    모범답안 = 요약문의 라벨을 정답으로 치환한 것 → summaryWritingMdModelAnswer.
//    미끼 = 어느 정답에도 안 쓰이는 칩 → gate-summary-writing.ts 가 조립 잔여로 파생.
//  · 지문을 변형하지 않는다 → 지문 재구성 게이트가 없다. 그 자리를 "정답이 지문
//    축자 복사인가"(answerRunInPassage) 게이트가 대신한다.
//  · 정본 굴절 매처(wordBankChipCoversAnswerToken) 의존은 스냅으로 옮겼다 —
//    재구현하면 게이트·검증기와 판정이 갈리므로 그쪽에서 정본을 그대로 호출한다.
// ============================================================================

import {
  cleanMdValue,
  keywordLineRe,
  readKeywordValue,
  sliceKeywordSection,
} from "./decoration";

export interface MdSummaryWritingBlank {
  label: string; // "(A)"~"(C)" — 채점 입력 키. 괄호 대문자 고정.
  answer: string; // 이 빈칸에 들어갈 영어 어구(다단어)
  variants: string[]; // 동치 정답 — 없으면 빈 배열
  lemmas: string[]; // 부분점수용 표제어(한 단어씩 소문자)
}

export interface MdSummaryWritingQuestion {
  kind: "summaryWriting";
  summary: string; // (A)(B) 라벨이 박힌 영어 요약문 한 줄
  gloss: string; // 한국어 해석 — glossEnabled 일 때만
  chips: string[]; // [보기] 칩 — wordBankEnabled 일 때만
  blanks: MdSummaryWritingBlank[];
  criteria: string[]; // 부분점수 루브릭(한국어, 교사 전용)
  explanation: string;
  /**
   * 그 줄이 **텍스트에 있기는 했는가**(값 판독 성공 여부와 무관). 게이트가
   * "줄이 아예 없음" 과 "줄은 있는데 값을 못 읽음" 을 갈라 말하기 위한 것뿐이다 —
   * 원인을 틀리게 지목한 문구가 그대로 [반려 재생성] 피드백이 되는 것을 막는다(철칙 3·5).
   * 선택 필드다(구형 호출자·직접 조립 픽스처 무회귀).
   */
  headsSeen?: string[];
}

const LABEL_KEYS = "ABC";

/** "(a)" · "A" · "［A］" → "(A)". 형식 밖이면 빈 문자열. */
export function summaryWritingLabel(raw: string): string {
  const key = String(raw ?? "")
    .trim()
    .replace(/[()[\]（）［］.:：]/g, "")
    .toUpperCase();
  return key.length === 1 && LABEL_KEYS.includes(key) ? `(${key})` : "";
}

/** 요약문에서 라벨을 등장 순으로 뽑는다(개수·순서 게이트 공용). */
export function summaryWritingLabelSequence(summary: string): string[] {
  return [...summary.matchAll(/[(（]\s*([A-Ca-c])\s*[)）]/g)].map(
    (m) => `(${m[1].toUpperCase()})`,
  );
}

/**
 * 학생 렌더가 **빈칸으로 마스킹하는 축**의 라벨 전수(반각 괄호 + 대문자 한 글자).
 * summaryWritingMaskedSummary 가 `/(\([A-Z]\))\s*(?:_{3,})?/g` 로 치환하므로, 정답 줄이
 * 없는 `(D)` 가 요약문에 남으면 학생 화면에 **채점되지 않는 빈칸**이 하나 더 생긴다.
 * 파서의 빈칸 축은 (A)~(C) 고정이라 `정답(D):` 줄은 버려지고 — 이 검사가 없으면 그
 * 문항이 게이트 클린으로 출하된다(실측: 게이트 [] · 학생 화면에 `(D) _____`).
 */
export function summaryWritingRenderedLabels(summary: string): string[] {
  return [...String(summary ?? "").matchAll(/\(([A-Z])\)/g)].map((m) => `(${m[1]})`);
}

/** 라벨을 공백으로 치환한 요약문(누수 검사·영어 검사 공용). */
export function stripSummaryWritingLabels(summary: string): string {
  return summary
    .replace(/[(（]\s*[A-Ca-c]\s*[)）]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ── 키워드 축 ────────────────────────────────────────────────────────────────
/**
 * 이 파서가 **인식하거나 경계로 삼는 키워드 전수**. 섹션 절단(sliceKeywordSection)에
 * 정지 키워드로 **빠짐없이** 넘긴다 — 일부만 넘기면 그 키워드에서 블록이 안 끊겨
 * 다음 섹션이 앞 값에 통째로 삼켜진다(실측 계통). 게이트의 오염 탐지기도 이 목록을 쓴다.
 */
export const SUMMARY_WRITING_SECTION_KEYWORDS = [
  "요약문",
  "해석",
  "보기",
  "미끼",
  "정답",
  "동치",
  "핵심어",
  "모범답안",
  "채점기준",
  "해설",
  "오답",
] as const;

/**
 * 머리표 판정 전용 가드 — 키워드 뒤에 (장식·공백을 제외하고) 콜론이나 줄끝만 올 때만
 * 섹션 머리표로 본다.
 *
 * 공유 keywordLineRe 는 콜론을 **선택**으로 본다(`## 해설` 같은 마크다운 헤딩 관습).
 * 그런데 이 유형의 채점기준 항목은 한국어 산문이라 섹션 키워드로 시작하기 쉽다
 * (`정답 표현을 그대로 옮기면 감점`). 가드가 없으면 그 항목 줄이 **그 섹션의 머리표**로
 * 인식돼, 뒤에 오는 진짜 섹션 값이 루브릭 조각으로 조용히 대체된다
 * (26-07-27 재검증 실측 major). content-match 가 같은 계통을 해결한 선례를 따른다.
 * 콜론 없는 진짜 머리표(`## 해설`)는 그대로 인정되므로 과잉 차단이 아니다.
 */
const HEAD_CONTENT_GUARD = "(?=[^0-9A-Za-z가-힣ㄱ-ㆎ]*(?:[:：]|$))";
const headKw = (keyword: string): string => `${keyword}${HEAD_CONTENT_GUARD}`;

/** 그 키워드를 뺀 나머지 전부 — 섹션 절단의 정지 키워드(머리표 가드 포함). */
function stopKeywords(keyword: string): string[] {
  return SUMMARY_WRITING_SECTION_KEYWORDS.filter((k) => k !== keyword).map(headKw);
}

// ── 줄 인식 ─────────────────────────────────────────────────────────────────
// 머리표 관용은 전부 keywordLineRe 가 처리한다. 여기 남은 것은 **빈칸 라벨** 조각뿐이다.

/** 라벨 주변 이음쇠(공백 + 강조 표식). 라벨은 키워드와 콜론 **사이**라 공용 머리표
 *  정규식의 관용 범위 밖이고, 이 유형에만 있는 축이라 여기서 잇는다. */
const GAP = String.raw`[ \t*_~\x60]*`;
/** 라벨 관용 — 괄호(반각·전각·대괄호)는 **선택**. `정답 A:` 맨몸 라벨,
 *  `정답 **(A)**:` `정답(__A__):` `**정답**(A):` 처럼 라벨을 감싼 강조까지 흡수한다. */
const LABEL_PART = String.raw`${GAP}[（([]?${GAP}([A-Za-z])${GAP}[)）\]]?`;
/**
 * 라벨 뒤에는 콜론이 **반드시** 온다. keywordLineRe 는 콜론을 선택으로 본다(`## 정답`
 * 헤딩 관습을 흡수하려고) — 라벨 줄에까지 그 관용을 열어 두면 `정답 A 부터 보자` 같은
 * 산문 줄이 빈칸으로 굳어 정상 문항이 "빈칸 2개(1개 필요)" 로 반려된다(과잉 관용 금지).
 */
const COLON_AHEAD = String.raw`(?=[ \t*_~\x60"'”’]*[:：])`;

/** `정답(A):` · `**동치(B)**:` · `- 핵심어(C):` · `정답 A:` 전부 흡수.
 *  m[1]=키워드 · m[2]=라벨 문자 · m[3]=값.
 *  ⚠ **반드시 한 줄씩** 물린다(공유 유틸의 readKeywordValue·sliceKeywordSection 도 그렇게 쓴다).
 *  여러 줄 텍스트에 통째로 물리면 머리표 꼬리의 공백류가 개행을 삼켜, 값이 빈 줄
 *  (`정답(A):`)에서 **다음 줄이 값으로 딸려 오고 그 줄이 통째로 소비**된다 —
 *  `정답(A):` 의 값이 아래 `동치(A):` 줄 전체가 되고 동치 줄은 사라진다(실측). */
const LABELED_LINE_RE = keywordLineRe(
  String.raw`(정답|동치|핵심어)${LABEL_PART}${COLON_AHEAD}`,
);

// ── 값 정리 ─────────────────────────────────────────────────────────────────

/** 표 행 잔여 파이프(`| 핵심어(A): a, b |` 의 꼬리). 장식이 아니라 표 구조물이다. */
const TABLE_PIPE_TAIL_RE = /\s*\|+\s*$/;

/**
 * 값 정리 — 장식·감싼 따옴표·공백은 공유 cleanMdValue 에 위임하고, 이 유형 고유의
 * 잔여물(표 행 파이프·꼬리 구두점)만 여기서 턴다. 저장·표시로 나가는 모든 값이 통과한다.
 */
function cleanValue(raw: unknown): string {
  const raw2 = typeof raw === "string" ? raw.replace(TABLE_PIPE_TAIL_RE, "") : raw;
  return cleanMdValue(raw2).replace(TABLE_PIPE_TAIL_RE, "").replace(/[,;]+$/, "").trim();
}

// 요약문의 빈칸선(`____`)은 **게이트가 지목해야 할 결함**이다(gate #2 밑줄 검사 ·
// 스냅 S2 라벨 뒤 빈칸선 제거). 공유 stripEmphasis 는 언더스코어를 강조 표식으로 보고
// 지우는 것이 옳은 기본값이라, 요약문에서만 빈칸선을 치환해 두고 정리 후 되돌린다.
// 경계는 **4개 이상** — `_`·`__`·`___` 는 마크다운 강조 문법 그 자체라 공유 유틸의
// 관할이고(그걸 빈칸선으로 보면 `__요약문 값__` 의 닫는 표식이 학생 화면까지 남는다),
// 실제 빈칸선 드리프트는 `____` 이상으로 온다. 표식은 제어문자 — 장식·따옴표·공백
// 정돈 어디에도 걸리지 않고 산출물에 실재할 수 없다.
const BLANK_RUN_RE = /_{4,}/g;
const BLANK_RUN_MARK = "\u0011";
const BLANK_RUN_SLOT_RE = new RegExp(`${BLANK_RUN_MARK}(\\d+)${BLANK_RUN_MARK}`, "g");

/** 요약문 전용 값 정리 — 빈칸선을 보존한 채 나머지 장식만 벗긴다. */
function cleanSummaryValue(raw: string): string {
  const runs: string[] = [];
  const masked = raw.replace(BLANK_RUN_RE, (run) => {
    runs.push(run);
    return `${BLANK_RUN_MARK}${runs.length - 1}${BLANK_RUN_MARK}`;
  });
  const cleaned = cleanValue(masked);
  if (runs.length === 0) return cleaned;
  return cleaned.replace(BLANK_RUN_SLOT_RE, (_m, i: string) => runs[Number(i)] ?? "");
}

/** 핵심어 목록 — 한 단어씩이라 쉼표가 안전한 구분자다(` / ` 드리프트도 흡수). */
function splitLemmaList(raw: string): string[] {
  const value = cleanValue(raw);
  if (!value) return [];
  const parts = value.includes(",") ? value.split(",") : value.split(/\s+\/\s+/);
  return parts.map((p) => cleanValue(p)).filter(Boolean);
}

/**
 * 동치 정답 목록 — **쉼표로 쪼개지 않는다.** 동치는 영어 어구(절)라 그 안에 쉼표가
 * 실재한다("Not only A, but also B"). 쪼개면 반쪽 두 개가 그대로 만점 정답 집합에
 * 실려 반쪽만 쓴 학생이 CORRECT 를 받는다(실측 critical). 구분자는 ` / `·`;` 뿐이고
 * 동치가 여럿이면 `동치(A):` 줄을 여러 번 쓰는 것이 계약이다(§1-B 철칙 2).
 */
function splitVariantList(raw: string): string[] {
  const value = cleanValue(raw);
  if (!value) return [];
  return value
    .split(/\s+\/\s+|\s*;\s*/)
    .map((p) => cleanValue(p))
    .filter(Boolean);
}

/** 한 줄 안에 나열된 칩에 붙은 목록 기호(`보기: - without / - sample`)를 벗긴다.
 *  기호 뒤 **공백이 있을 때만** 벗겨 `-ing` 류를 잘라 먹지 않는다(줄머리는
 *  stripListLead 가 이미 처리한다 — 여기는 두 번째 칩부터의 방어선이다). */
const CHIP_BULLET_RE = /^(?:[-*•]|\d+[.)])[ \t]+/;

/** 칩 구분자는 ` / ` 하나. 구분자가 아예 없을 때만 쉼표로 폴백한다. */
function splitChips(raw: string): string[] {
  const value = cleanValue(raw).replace(/^\[|\]$/g, "").trim();
  if (!value) return [];
  const clean = (chip: string): string =>
    cleanValue(cleanValue(chip).replace(CHIP_BULLET_RE, ""));
  const bySlash = value.split(/\s*[/｜|]\s*/).map(clean).filter(Boolean);
  if (bySlash.length >= 2) return bySlash;
  return value.split(",").map(clean).filter(Boolean);
}

// ── 블록 판독 ────────────────────────────────────────────────────────────────

/** `Note:` `정답 A:` 처럼 **무엇이든 라벨성인 줄**. 산문·접기 블록 전용 가드다.
 *  ⚠ 목록 블록(보기·채점기준)에는 쓰지 마라 — `- 의미: 2점` 같은 **정상 항목**이
 *  라벨성으로 보여 첫 항목에서 블록이 통째로 끊긴다(루브릭이 게이트 클린으로 소실). */
const LABELY_LINE_RE = /^\S+[ \t]*[:：]/;
/** 문장이 닫힌 자리 — 산문 블록(요약문·해석)은 여기서 멈춘다(뒤 메모 흡수 차단). */
const SENTENCE_END_RE = /[.!?…]["'”’)\]]?$/;
/**
 * 목록·이어짐 줄의 **구조** 줄머리(인용·헤딩·표 파이프·불릿·번호)만 벗긴다.
 * 강조(`**` `__` 백틱)는 **손대지 않는다** — 값 정리에서 cleanMdValue 가 일괄 처리한다.
 * (한쪽만 벗겨 값 선두가 `*값**` 로 오염된 채 학생 화면까지 나가던 계통이 그것이다.)
 * 불릿은 **뒤에 공백이 있을 때만** 벗겨 `**굵게**`·`-ing` 를 잘라 먹지 않는다.
 */
const LIST_LEAD_RE = /^[ \t]*(?:>[ \t]*|#{1,6}[ \t]+|\|[ \t]*|(?:[-*•]|\d+[.)])[ \t]+)/;
function stripListLead(raw: string): string {
  let line = raw;
  for (let guard = 0; guard < 4; guard += 1) {
    const next = line.replace(LIST_LEAD_RE, "");
    if (next === line) break;
    line = next;
  }
  return line.trim();
}

/** 첫 키워드 줄에 **같은 줄로** 적힌 값. 줄 단위로 본다(LABELED_LINE_RE 주석의 개행 함정). */
function headInlineValue(text: string, keyword: string): string {
  const re = keywordLineRe(headKw(keyword));
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(re);
    if (m) return (m[1] ?? "").trim();
  }
  return "";
}

/**
 * `키워드:` 섹션 본문의 줄들을 반환한다(개행 드리프트 흡수).
 * **블록 경계는 공유 sliceKeywordSection 이 정지 키워드 전량으로 잡고**, 이 함수는
 * 이 유형 고유의 절단 규칙만 얹는다:
 *  · "prose"(요약문·해석) — 계약상 한 문장이라 문장이 닫히면 멈춘다. 없으면 뒤따르는
 *    `(Note: ...)` 메모가 요약문에 병합돼 학생 화면·모범답안까지 오염된다(실측 major).
 *  · "fold"(해설) 여러 줄을 접는다 · "list"(보기·채점기준) 줄이 항목 구분자다.
 * 산문·접기 모드에서는 `Note:` `정답 A:` 같은 라벨성 줄을 붙이지 않는다 — 값에 삼켜지면
 * 게이트가 엉뚱한 원인(빈칸 0개)만 말한다(철칙 3). 단 **머리표 줄에 같이 적힌 값**은
 * 정의상 그 섹션의 값이므로 그 가드에서 면제한다(정상 값을 버리는 쪽이 더 나쁘다).
 * ⚠ **목록 모드에는 라벨성 가드를 걸지 않는다.** 채점기준 항목은 `- 의미: 2점` 처럼
 * 그 자체가 `라벨: 값` 형태라, 라벨성 줄을 끊으면 프롬프트가 시킨 정상 산출물이
 * **첫 항목부터** 통째로 사라진다(rubric 은 "채점기준 누락" 이라는 사실과 다른 원인을
 * 재생성 프롬프트에 실어 보내고, keyword/exact 는 게이트 클린인 채로 루브릭이 저장
 * 문항에서 소실됐다 — 실측 major).
 */
function readBlockLines(
  text: string,
  keyword: string,
  mode: "prose" | "fold" | "list",
): string[] {
  const body = sliceKeywordSection(text, headKw(keyword), stopKeywords(keyword));
  if (!body) return [];
  // 머리표 줄에 값이 같이 적혔는가 — sliceKeywordSection 은 그 값을 본문 첫 줄로 올린다.
  const headInline = headInlineValue(text, keyword);
  const collected: string[] = [];
  let index = 0;
  for (const rawLine of body.split(/\r?\n/)) {
    const isHeadInline = index === 0 && headInline !== "";
    index += 1;
    const line = stripListLead(rawLine);
    if (!line) {
      // 빈 줄은 블록의 끝이다(뒤에 붙은 메모·잡문 흡수 차단). 선두 빈 줄은 건너뛴다.
      if (collected.length > 0) break;
      continue;
    }
    if (!isHeadInline && mode !== "list" && LABELY_LINE_RE.test(line)) break;
    collected.push(line);
    if (mode === "prose" && SENTENCE_END_RE.test(cleanValue(line))) break;
  }
  return collected;
}

/** 산문 블록(해석) — 한 줄로 접어 정리한다. */
const readBlockValue = (text: string, keyword: string): string =>
  cleanValue(readBlockLines(text, keyword, "prose").join(" "));

/** 요약문 — 산문 블록이되 빈칸선을 보존한다(게이트가 봐야 할 결함이다). */
const readSummary = (text: string): string =>
  cleanSummaryValue(readBlockLines(text, "요약문", "prose").join(" "));

/**
 * `보기:` 칩 판독. 여러 줄로 오면 **줄바꿈 자체가 칩 구분자**다 — 접어 붙이면
 * `- gathering` 같은 쓰레기 칩이 학생 화면에 나가거나, 쉼표 없는 불릿 목록에서는
 * 칩이 통째로 1개가 돼 게이트가 "칩 1개" 라는 엉뚱한 개수 오류만 말한다(실측 major).
 */
function readChips(text: string): string[] {
  const lines = readBlockLines(text, "보기", "list");
  if (lines.length <= 1) return lines.length === 1 ? splitChips(lines[0]) : [];
  return lines.flatMap((line) => splitChips(line));
}

/** `해설:` 블록 — 불릿·파이프·강조·인용·헤딩·전각콜론 전부 흡수(무관용이면 통째 소실). */
function readExplanation(text: string): string {
  return cleanValue(readBlockLines(text, "해설", "fold").join(" "));
}

/** 그 키워드 줄이 **텍스트에 존재하기는 했는가**(값 판독 성공과 무관). */
const HEAD_KEYWORDS = ["요약문", "해석", "보기", "채점기준", "해설"] as const;
const HEAD_KEYWORD_RE = new Map(HEAD_KEYWORDS.map((k) => [k, keywordLineRe(k)]));
function readHeadsSeen(text: string): string[] {
  const lines = text.split(/\r?\n/);
  return HEAD_KEYWORDS.filter((keyword) =>
    lines.some((line) => HEAD_KEYWORD_RE.get(keyword)?.test(line)),
  );
}

/** `채점기준:` 항목 — 불릿·번호·맨몸 줄을 모두 흡수한다. */
function readCriteria(text: string): string[] {
  return readBlockLines(text, "채점기준", "list")
    .map((line) => cleanValue(line))
    .filter(Boolean);
}

/**
 * 라벨 없는 단일형(`정답: ...`) — blankCount=1 구형 드리프트 흡수용. 값이 다음 줄에
 * 있어도 흡수한다(공유 readKeywordValue).
 * ⚠ 키워드 **바로 뒤가 콜론**인 줄만 본다. 라벨 줄(`정답(A):`)까지 잡으면 그 값으로
 *   `(A): …` 라는 라벨 조각이 정답에 실려, 값이 빈 줄을 "인식할 수 없음" 으로 지목해야
 *   할 게이트가 엉뚱한 정답을 통과시킨다(철칙 3).
 */
function bareKeywordValue(text: string, keyword: string): string {
  return cleanValue(
    readKeywordValue(text, `${keyword}${COLON_AHEAD}`, stopKeywords(keyword)),
  );
}

/**
 * 요약문 영작 md 파싱. 드리프트 관용: 라벨 표기 흔들림(소문자·전각·대괄호·**괄호 없는
 * 맨몸 라벨**), 굵게·언더스코어·백틱·불릿·번호·인용·헤딩·표 파이프 장식, 전각 콜론,
 * 라벨 없는 단일형 `정답:`.
 * ⚠ 파서는 **줄을 버리지 않는다** — 범위 밖 라벨((D))도 실어 보내 게이트가 지목한다(철칙 3).
 */
export function parseMdSummaryWriting(text: string): MdSummaryWritingQuestion {
  type Entry = { answer: string; variants: string[]; lemmas: string[] };
  const byLabel = new Map<string, Entry>();
  const order: string[] = [];
  const touch = (label: string) => {
    let entry = byLabel.get(label);
    if (!entry) {
      entry = { answer: "", variants: [], lemmas: [] };
      byLabel.set(label, entry);
      order.push(label);
    }
    return entry;
  };

  for (const line of text.split(/\r?\n/)) {
    const m = line.match(LABELED_LINE_RE);
    if (!m) continue;
    const keyword = m[1];
    const label = summaryWritingLabel(m[2]);
    if (!label) continue;
    const entry = touch(label);
    if (keyword === "정답") {
      if (!entry.answer) entry.answer = cleanValue(m[3]);
    } else if (keyword === "동치") {
      entry.variants.push(...splitVariantList(m[3] ?? ""));
    } else {
      entry.lemmas.push(...splitLemmaList(m[3] ?? ""));
    }
  }

  // 라벨 없는 단일형 흡수 — 빈칸이 하나뿐일 때 모델이 자주 흘리는 형태.
  // ⚠ 라벨 줄과 **섞여 오는** 드리프트(`정답:` 은 맨몸인데 `동치(A):` 는 라벨)까지 흡수한다.
  //   라벨 줄이 하나라도 있으면 맨몸 줄을 안 봤던 탓에, 값이 멀쩡히 적힌 `정답:` 줄이
  //   통째로 버려지고 게이트가 "정답(A) 줄을 인식할 수 없음(받은 값: '')" 이라는
  //   **사실과 다른 원인**을 냈다(실측). 빈칸이 하나로 확정된 경우에만 적용한다.
  const soleLabel = order.length === 1 ? order[0] : null;
  if (byLabel.size === 0 || soleLabel) {
    const bareValue = bareKeywordValue(text, "정답");
    const target = soleLabel ?? (bareValue ? "(A)" : null);
    if (target) {
      const entry = touch(target);
      if (!entry.answer && bareValue) entry.answer = bareValue;
      if (entry.variants.length === 0) {
        entry.variants.push(...splitVariantList(bareKeywordValue(text, "동치")));
      }
      if (entry.lemmas.length === 0) {
        entry.lemmas.push(...splitLemmaList(bareKeywordValue(text, "핵심어")));
      }
    }
  }

  const blanks: MdSummaryWritingBlank[] = order.map((label) => {
    const entry = byLabel.get(label) ?? { answer: "", variants: [], lemmas: [] };
    return {
      label,
      answer: entry.answer,
      variants: entry.variants,
      lemmas: entry.lemmas,
    };
  });
  blanks.sort((a, b) => a.label.localeCompare(b.label));

  return {
    kind: "summaryWriting",
    summary: readSummary(text),
    gloss: readBlockValue(text, "해석"),
    chips: readChips(text),
    blanks,
    criteria: readCriteria(text),
    explanation: readExplanation(text),
    headsSeen: readHeadsSeen(text),
  };
}

// ── 결정형 파생 ──────────────────────────────────────────────────────────────

/**
 * 모범답안 = 요약문의 라벨을 각 빈칸 정답으로 치환한 문장. **받지 않고 파생한다**
 * (철칙 1) — "모범답안 ≠ 요약문+정답" 이라는 실패 모드가 구조적으로 사라진다.
 */
export function summaryWritingMdModelAnswer(q: MdSummaryWritingQuestion): string {
  if (!q.summary) return "";
  let out = q.summary;
  for (const blank of q.blanks) {
    if (!blank.label || !blank.answer) continue;
    out = out.split(blank.label).join(blank.answer);
  }
  return out
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

/** grade.ts:58 과 동일한 단어 토큰화(아포스트로피 보존). */
export function summaryWritingAnswerTokens(value: string): string[] {
  return String(value ?? "")
    .toLowerCase()
    .split(/[^a-z0-9']+/)
    .filter((t) => t.length > 0);
}
