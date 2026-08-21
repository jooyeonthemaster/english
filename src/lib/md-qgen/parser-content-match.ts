// ============================================================================
// 내용 일치(CONTENT_MATCH) md 파서 · 0원 스냅 · 지문 문장 좌표 유틸.
// 견본: parser-antonym.ts / 계약 문서: docs/md-qgen-type-expansion-spec.md §4-7
// 정본 규약 답습: 파서는 관대하게(드리프트 흡수) · 게이트는 엄격하게.
//
// 이 유형은 **지문을 변형하지 않는다.** 다른 유형의 최강 게이트인 "지문 재구성
// 일치" 가 성립하지 않으므로, md 계약이 받아 내는 `근거:` 줄(각 선지의 판단 근거가
// 되는 지문 문장)이 그 자리를 대신한다 — 축자 존재·서로 다름·지문 등장순을 검사한다.
//
// ⚠ 게이트 본체는 gate-content-match.ts(500줄 규약). 의존은 gate→parser 단방향.
// ⚠ 후처리(PASSTHROUGH_TYPES)는 지문 필드를 안 만든다 — 어댑터가 완제품을 낸다.
// ============================================================================

import { normalizeWs } from "./parser";
import {
  cleanMdValue,
  isKeywordHead,
  readKeywordValue,
  sliceKeywordSection,
} from "./decoration";

/** md 선지 라벨 축 — 원문자 ①~⑫. 프로덕션 저장 축("1"~"12")은 어댑터가 만든다. */
export const CONTENT_MATCH_LABELS = [
  "①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩", "⑪", "⑫",
] as const;

export interface MdContentMatchOption {
  /** "①"~"⑫" */
  label: string;
  /** 진술문(선지 표면) */
  text: string;
}

export interface MdContentMatchEvidence {
  label: string;
  /** 그 진술의 참·거짓이 확정되는 지문 문장(축자) */
  sentence: string;
}

export interface MdContentMatchQuestion {
  kind: "contentMatch";
  options: MdContentMatchOption[];
  evidence: MdContentMatchEvidence[];
  /** 정답 라벨 — `정답:` 줄이 유일 진실원이다(줄마다 O/X 를 받지 않는다) */
  answers: string[];
  explanation: string;
  wrong: { label: string; text: string }[];
  /** `정답:` 줄의 원문(라벨 파싱 실패 시 게이트가 "받은 값"으로 지목한다). */
  answerLine?: string;
  /** 선지 구역에서 라벨로도 이어붙임으로도 흡수하지 못한 줄(게이트 진단용). */
  unparsedOptions?: string[];
  /** 근거 구역에서 흡수하지 못한 줄. 구역을 나눠 둬야 게이트가 자리를 지목한다. */
  unparsedEvidence?: string[];
}

/** 0-based 인덱스 → 원문자 라벨. 범위 밖은 빈 문자열(호출자가 개수를 이미 안다). */
export function contentMatchLabel(index: number): string {
  return CONTENT_MATCH_LABELS[index] ?? "";
}

/** 숫자 표기 드리프트("3." "(3)" "3)")를 원문자 축으로 정규화한다. */
function digitToCircled(raw: string): string {
  const n = Number(raw);
  return Number.isInteger(n) ? contentMatchLabel(n - 1) : "";
}

// ── 장식 관용 — 전량 공용 유틸(decoration.ts)에 위임 ─────────────────────────
// 이번 웨이브 최다 결함 계통(silent-drop): 키워드 줄(`정답:` `해설:` `오답:`)을
// 무관용 정규식으로 잡으면 모델이 굵게·헤딩·전각콜론·불릿을 쓰는 순간 그 필드가
// 통째로 사라지고, 게이트가 **사실과 다른 원인**("정답 누락")을 지목한다. 그 문구가
// 그대로 [반려 재생성] 피드백이 되어 1회뿐인 재생성을 오지시로 태운다(철칙 3·5).
//
// 근본 원인은 유형마다 이 처리를 재발명해 **각자 다른 부분집합**만 덮은 것이었다.
// 그래서 이 파일은 장식(강조·따옴표·머리표 형상)을 한 줄도 자체 구현하지 않는다 —
// keywordLineRe/cleanMdValue/readKeywordValue/sliceKeywordSection 이 전부 처리한다.
//
// 다만 **내용 글자 가드** 하나는 이 유형 고유다(장식 알파벳이 아니라 산문 판정이다).
// 공유 머리표는 콜론을 선택으로 보므로 `오답 진술은 …` · `정답과 어긋납니다` ·
// `근거 문장이 이를 확정합니다` 같은 **한국어 해설·오답 줄**까지 머리표로 읽는다.
// 이 유형은 해설·오답 해설이 전부 한국어라 그런 줄이 실제로 나오고, 그 지점에서
// 섹션이 잘리면 뒤 항목이 통째로 사라져 게이트가 "오답해설 2개(4개 필요)" 라는
// 거짓 원인을 지목한다. 가드는 키워드와 콜론(또는 줄 끝) 사이에 글자·숫자가 오면
// 그 줄을 머리표로 보지 않는다 — 사이의 장식·공백은 공유 유틸이 알아서 흡수한다.
const HEAD_CONTENT_GUARD = "(?=[^0-9A-Za-z가-힣ㄱ-ㆎ]*(?:[:：]|$))";

// 섹션 키워드 — 공유 유틸에 그대로 넘긴다(값은 유틸이 그룹 1 로 돌려주므로
// **캡처 그룹을 쓰지 않는다**). 별칭 순서는 긴 것 먼저다(`진술문` 이 `진술` 보다 앞).
const OPTION_KW = `(?:선지|보기|진술문|진술)${HEAD_CONTENT_GUARD}`;
const EVIDENCE_KW = `근거(?:[ \\t]*문장)?${HEAD_CONTENT_GUARD}`;
const ANSWER_KW = `정답${HEAD_CONTENT_GUARD}`;
const EXPLAIN_KW = `해설${HEAD_CONTENT_GUARD}`;
const WRONG_KW = `오답(?:[ \\t]*해설)?${HEAD_CONTENT_GUARD}`;
/** 다섯 구역 전부. 정지 키워드를 **빠짐없이** 넘기는 것이 섹션 붕괴 방지의 핵심이다. */
const SECTION_KEYWORDS = [OPTION_KW, EVIDENCE_KW, ANSWER_KW, EXPLAIN_KW, WRONG_KW] as const;

/** 자기 자신을 뺀 나머지 넷 — 구역 순서가 뒤바뀌어도 서로를 삼키지 않는다. */
function stopsFor(keyword: string): string[] {
  return SECTION_KEYWORDS.filter((kw) => kw !== keyword);
}

/** 그 키워드의 머리표 줄이 있는가 — "구역 누락" 과 "빈 구역" 을 구분한다. */
function hasHead(text: string, keyword: string): boolean {
  return text.split(/\r?\n/).some((line) => isKeywordHead(line, keyword));
}

// 줄머리 장식을 라벨 탐색 **전에** 일괄로 흘린다. 불릿 문자 열거 방식은 CommonMark
// 표준 `+`·en/em 대시 불릿을 놓쳐 줄을 소멸시켰고(실측), 소멸한 줄은 게이트에
// "선지 4개" 로만 보여 진짜 원인이 은폐된다.
const LINE_LEAD_DECORATION = /^[^\p{L}\p{N}]*/u;

// 장식을 걷어낸 줄이 라벨로 시작할 때만 항목 후보다.
const LABELED_LINE = /^(?:([①-⑫])|[([]?(\d{1,2})[)\].])[ \t]*(.*)$/;

/** 라벨과 본문 사이의 **잔여 구분자**(표 파이프·콜론·대시·마침표)를 흡수한다. 남겨
 *  두면 그 문자가 학생 표면 선지에 그대로 저장되고(`": 진술문"`), 이 유형은
 *  PASSTHROUGH 라 게이트도 후처리도 씻어 주지 않는다.
 *  구분자 제거는 이 유형 고유 정리이고, **장식 제거는 cleanMdValue 에 위임**한다. */
function cleanEntryText(raw: string): string {
  let text = raw.trim();
  // 표 행 잔재: 파이프로 쪼개 비어 있지 않은 첫 칸(견본 parser-antonym 관습).
  if (text.includes("|")) {
    text = text.split("|").map((cell) => cell.trim()).find((cell) => cell.length > 0) ?? "";
  }
  // 구분자와 장식은 서로를 가린다(`③ *- 진술*`). 안정될 때까지 번갈아 벗긴다.
  for (;;) {
    const next = cleanMdValue(text.replace(/^[\s:：.,、·•\-–—)\]]+/, ""));
    if (next === text) return text;
    text = next;
  }
}

/** `선지:` 머리표 누락 드리프트 — 다른 구역 머리표 앞까지가 선지 구역이다. */
function headlessOptionSection(text: string): string {
  const lines = text.split(/\r?\n/);
  const stops = stopsFor(OPTION_KW);
  const end = lines.findIndex((line) => stops.some((kw) => isKeywordHead(line, kw)));
  return (end < 0 ? lines : lines.slice(0, end)).join("\n");
}

/**
 * 라벨 줄을 관대하게 수집한다. 라벨 없는 줄은 **직전 항목이 문장 종결로 끝나지
 * 않았을 때만** 이어 붙인다 — 모델이 긴 문장을 접어 쓰는 드리프트는 복원하되,
 * 섹션에 섞인 산문("아래 다섯 진술은 …")은 항목으로 오인하지 않는 경계다.
 * 어느 쪽으로도 흡수하지 못한 줄은 `unparsed` 로 남겨 게이트가 지목하게 한다
 * (§1-B 철칙 3 — 파서가 데이터를 조용히 버리게 두지 마라).
 */
function parseLabeledEntries(section: string): {
  rows: { label: string; text: string }[];
  unparsed: string[];
} {
  const rows: { label: string; text: string }[] = [];
  const unparsed: string[] = [];
  for (const raw of section.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    // 라벨 탐색 **전에** 장식을 먼저 흘린다 — 줄 전체를 감싼 굵게·따옴표(`"③ 진술"`)를
    // 남겨 두면 줄머리 장식 제거가 짝 잃은 표식을 본문에 눌어붙인 채 저장한다.
    const stripped = cleanMdValue(line).replace(LINE_LEAD_DECORATION, "");
    // 장식만 있는 줄(구분선 `---`, 표 구분행 `|---|`)은 데이터가 아니다.
    if (!stripped) continue;
    const m = stripped.match(LABELED_LINE);
    const label = m ? (m[1] ? m[1] : digitToCircled(m[2])) : "";
    if (m && label) {
      rows.push({ label, text: cleanEntryText(m[3]) });
      continue;
    }
    const last = rows[rows.length - 1];
    if (last && !/[.!?。！？]["'”’)\]]*$/.test(last.text) && !/^[#>|]/.test(line)) {
      // 접힌 줄을 이어 붙인 **뒤에** 장식을 다시 벗긴다 — 굵게가 두 줄에 걸치면
      // 닫는 표식이 뒷줄 끝에 있어 조각 단위 정리로는 잡히지 않는다.
      last.text = cleanMdValue(`${last.text} ${stripped}`);
      continue;
    }
    unparsed.push(line);
  }
  return { rows, unparsed };
}

// 정답 줄은 **라벨 런**이라 산문이 아니다 — 장식은 무조건 흘려도 안전하다.
// 값 가장자리만 벗기는 처리로는 `정답: **③**, **⑤**` 에서 ③ 소비 후 rest 가
// `**, **⑤` 라 구분자가 불일치해 ⑤ 가 사라지고, 게이트가 "정답 1개(2개 필요)" 라는
// 사실과 다른 진단과 "⑤ 오답해설 누락"(진짜 정답에 오답해설을 쓰라는 **유해한
// 지시**)을 낸다. cleanMdValue 는 값 **안쪽** 강조까지 전부 흘리므로 이 계통이 없다.
// 남는 것은 짝을 이루지 못한 따옴표뿐이다(`"③", "⑤"` — 감싼 한 겹이 아니라 보존된다).
const ANSWER_LEAD = /^[\s"'“”‘’]+/;
// 복수 정답 나열의 실측 구분자. 라벨이 뒤따를 때만 소비되므로 사족을 삼키지 않는다.
const ANSWER_SEP = /^(?:[,·、;/&]|및|와|과|그리고|and\b)[ \t]*/i;

/**
 * `정답:` 줄의 **선행 라벨 런**만 수집한다(정본 parseGrammarAnswerFix 계승).
 * "정답: ②, ④" 는 둘 다, "정답: ② — ④는 참" 의 ④ 는 무시한다.
 */
export function parseContentMatchAnswerRun(line: string): string[] {
  const labels: string[] = [];
  let rest = cleanMdValue(line);
  for (;;) {
    rest = rest.replace(ANSWER_LEAD, "");
    const m = rest.match(/^[([]?([①-⑫]|\d{1,2})[)\].]?(?:번)?/);
    if (!m) break;
    const label = /\d/.test(m[1]) ? digitToCircled(m[1]) : m[1];
    if (!label) break;
    if (!labels.includes(label)) labels.push(label);
    rest = rest.slice(m[0].length).replace(ANSWER_LEAD, "");
    const sep = rest.match(ANSWER_SEP);
    if (!sep) break;
    rest = rest.slice(sep[0].length);
  }
  return labels;
}

/**
 * 내용 일치 md 파싱. 드리프트 관용(정본 parseMdBlank 규약):
 * 라벨 표기 흔들림(원문자·숫자·불릿·굵게·표 행), 머리표 누락, 줄 접힘,
 * 오답 목록에 정답 줄을 끼워 넣는 실측 패턴.
 */
export function parseMdContentMatch(text: string): MdContentMatchQuestion {
  // 모든 구역이 **다른 네 머리표 전부**를 정지 조건으로 안다(일부만 알면 순서
  // 드리프트에서 뒤 구역을 통째로 삼킨다) — stopsFor 가 그 누락을 구조적으로 막는다.
  const optionSection = hasHead(text, OPTION_KW)
    ? sliceKeywordSection(text, OPTION_KW, stopsFor(OPTION_KW))
    : headlessOptionSection(text);
  // 정지 목록에 OPTION_KW 가 들어 있으므로 두 구역의 순서가 뒤바뀌어 나와도
  // (근거 먼저, 선지 나중) 서로를 삼키지 않는다.
  const evidenceSection = sliceKeywordSection(text, EVIDENCE_KW, stopsFor(EVIDENCE_KW));
  const wrongSection = sliceKeywordSection(text, WRONG_KW, stopsFor(WRONG_KW));

  // 값을 머리표 **다음 줄**에 쓰는 드리프트(`정답:` 개행 `③`)까지 공유 유틸이
  // 흡수한다. 다음 구역 머리표를 넘지 않으므로 뒤 구역을 집어 오지 않는다.
  const answerLine = readKeywordValue(text, ANSWER_KW, stopsFor(ANSWER_KW));
  const answers = parseContentMatchAnswerRun(answerLine);

  const optionRows = parseLabeledEntries(optionSection);
  const evidenceRows = parseLabeledEntries(evidenceSection);
  const options = optionRows.rows;
  const evidence = evidenceRows.rows.map((row) => ({
    label: row.label,
    sentence: row.text,
  }));
  // 드리프트 관용: 오답 목록에 정답 줄을 끼워 넣는 실측 — 파서가 걸러낸다.
  // 결손·중복은 게이트 #14 가 라벨 **집합** 대조로 전부 지목하므로 은폐되지 않는다.
  const wrong = parseLabeledEntries(wrongSection).rows.filter((w) => !answers.includes(w.label));

  // 해설은 교사 표면으로 그대로 나간다 — 저장 전에 cleanMdValue 를 통과시킨다.
  const explanation = cleanMdValue(
    sliceKeywordSection(text, EXPLAIN_KW, stopsFor(EXPLAIN_KW)),
  );

  return {
    kind: "contentMatch",
    options,
    evidence,
    answers,
    explanation,
    wrong,
    answerLine,
    unparsedOptions: optionRows.unparsed,
    unparsedEvidence: evidenceRows.unparsed,
  };
}

// ── 지문 문장 좌표 · 구두점 무관 대조 ────────────────────────────────────────
// 구두점 무관 fold 는 순서 유형의 실측 교훈과 같은 계통이다: 모델이 곱슬따옴표·
// em-dash·말줄임을 정규화해 옮겨 적으면 축자 대조가 깨져 정상 문항이 반려된다.
// fold 로 자리를 찾고 원문 좌표로 되돌려 **지문 문자 그대로** 복원한다.
// (레이어 규칙상 다른 유형 소유 파일을 import 하지 않고 로컬로 둔다.)

function foldWithMap(source: string): { folded: string; map: number[] } {
  const chars: string[] = [];
  const map: number[] = [];
  let pendingSpace = false;
  for (let i = 0; i < source.length; i += 1) {
    const lower = source[i].toLowerCase();
    const c = lower.length === 1 ? lower : " ";
    if (!((c >= "a" && c <= "z") || (c >= "0" && c <= "9"))) {
      pendingSpace = true;
      continue;
    }
    if (pendingSpace && chars.length > 0) {
      chars.push(" ");
      map.push(i);
    }
    pendingSpace = false;
    chars.push(c);
    map.push(i);
  }
  return { folded: chars.join(""), map };
}

/** 구두점 무관 비교용 정규화(alnum + 단일 공백, 소문자). */
export function foldForContentMatch(source: string): string {
  return foldWithMap(source).folded;
}

export interface ContentMatchSentence {
  index: number;
  start: number;
  end: number;
  text: string;
}

// 문장 끝처럼 보이지만 뒤에 말이 더 오는 약어 — 문장 분해가 여기서 깨지면
// 근거 축자 검사가 통째로 오탐이 된다.
// 선행 경계에 여는 괄호를 포함한다 — `(e.g. Seoul)` 처럼 괄호 안 약어가 대문자
// 낱말 앞에 오면 소문자 규칙이 못 잡고 문장이 잘못 쪼개진다.
const SENTENCE_ABBR =
  /(?:^|[\s([])(?:mr|mrs|ms|dr|prof|rev|gen|sen|rep|gov|col|lt|sgt|capt|fig|vol|vs|cf|viz|sr|jr|st|no|e\.g|i\.e)\.$/i;

/** 지문을 문장 단위로 쪼갠다(소수점·이니셜·약어 마침표는 문장 끝이 아니다). */
export function splitPassageSentences(passage: string): ContentMatchSentence[] {
  const out: ContentMatchSentence[] = [];
  let cursor = 0;
  for (let i = 0; i < passage.length; i += 1) {
    const ch = passage[i];
    if (ch !== "." && ch !== "!" && ch !== "?") continue;
    if (ch === ".") {
      const prefix = passage.slice(cursor, i + 1);
      if (/\d/.test(passage[i - 1] ?? "") && /\d/.test(passage[i + 1] ?? "")) continue;
      if (SENTENCE_ABBR.test(prefix)) continue;
      if (/(?:^|[\s([])[A-Za-z]\.$/.test(prefix) && /^[A-Za-z]/.test(passage.slice(i + 1).trim())) {
        continue;
      }
    }
    // 종결부호(.!?) 공통 — 뒤가 소문자면 문장 끝이 아니다(`U.S. once`·`(e.g. in`·
    // `3 p.m. and`). 약어 열거는 반드시 새고, 게이트 #6-b 가 "근거 = 지문 문장
    // 전체" 를 요구하므로 잘못 쪼개진 순간 **정상 문항이 반려된다**.
    // ⚠ 이 가드는 26-08-22 까지 `.` 분기 안에만 있었다 — E2E 실측에서
    // "…this product?' should be…" 류 문중 인용 의문부호가 경계로 오판돼
    // 정상 문항이 2연속 반려로 죽었다(거짓 반려 실증). `!`·`?` 에도 적용한다.
    // 대시 경유 소문자('…out there! - but…')도 같은 이유로 비경계.
    {
      let next = i + 1;
      while (next < passage.length && /[\s"'”’)\]—–-]/.test(passage[next])) next += 1;
      if (/[a-z]/.test(passage[next] ?? "")) continue;
    }
    let end = i + 1;
    while (end < passage.length && /[.!?”’"')\]]/.test(passage[end])) end += 1;
    const text = passage.slice(cursor, end).trim();
    if (text) out.push({ index: out.length, start: cursor, end, text });
    cursor = end;
    while (cursor < passage.length && /\s/.test(passage[cursor])) cursor += 1;
    i = cursor - 1;
  }
  const tail = passage.slice(cursor).trim();
  if (tail) out.push({ index: out.length, start: cursor, end: passage.length, text: tail });
  return out;
}

/**
 * 근거 문자열의 지문 내 구간(원문 좌표). 구두점 드리프트를 흡수하되
 * **단어 경계**와 **유일 등장**을 강제한다.
 *
 * 경계가 없으면 needle `the` 가 ra`the`r 안에, `res` 가 temperatu`res` 안에 걸린다 —
 * 정본 §1-[6] 의 실사고("is" 를 순차 indexOf 로 찾아 art"is"ts 에 마커가 박힘)와 같은
 * 계통이고, 그 좌표가 스냅으로 흘러가면 **선지와 무관한 지문 문장**이 근거로 확신
 * 있게 인용되는데 게이트는 축자·분포·순서를 전부 통과시켜 CLEAN 을 준다.
 * 2회 이상 등장하면 자리가 확정되지 않으므로 null 을 돌려 게이트에 맡긴다.
 * (fold 는 alnum + 단일 공백뿐이라 "앞뒤가 공백" 이 곧 단어 경계다.)
 */
export function locateContentMatchSpan(
  passage: string,
  evidence: string,
): { start: number; end: number } | null {
  const needle = foldForContentMatch(evidence);
  if (!needle) return null;
  const { folded, map } = foldWithMap(passage);
  let at = -1;
  for (let from = 0; from <= folded.length; ) {
    const hit = folded.indexOf(needle, from);
    if (hit < 0) break;
    const tail = hit + needle.length;
    const boundedLeft = hit === 0 || folded[hit - 1] === " ";
    const boundedRight = tail >= folded.length || folded[tail] === " ";
    if (boundedLeft && boundedRight) {
      if (at >= 0) return null; // 2회 이상 — 자리가 모호하다
      at = hit;
    }
    from = hit + 1;
  }
  if (at < 0) return null;
  return { start: map[at] ?? 0, end: (map[at + needle.length - 1] ?? passage.length - 1) + 1 };
}

/** 내용어 토큰(3자 이상 alnum) — 재진술 드리프트 복원의 유사도 재료. */
function contentTokens(source: string): string[] {
  return (foldForContentMatch(source).match(/[a-z0-9]+/g) ?? []).filter((t) => t.length >= 3);
}

/**
 * 절 인용을 문장 전문으로 확장할 때 요구하는 내용어 최소 개수.
 * 재진술 복원 분기의 하한(4)과 같은 값으로 맞춘다 — 두 분기의 보수 강도가
 * 달라서 첫 분기만 무방비였던 것이 이 유형의 critical 결함이었다.
 */
const MIN_SNAP_CONTENT_TOKENS = 4;

/**
 * 0원 자동 보정 — 반려 주계통 두 가지를 흡수한다.
 * (1) 구두점·공백 드리프트: fold 로 자리를 찾아 **그 문장 전체의 지문 축자**로 복원.
 * (2) 근거를 살짝 재진술해 적은 드리프트: 토큰 포함률이 압도적인 문장 하나에만
 *     스냅한다(보수 가드 — 애매하면 손대지 않고 게이트가 반려하게 둔다).
 * 지어낸 근거(어느 문장과도 안 겹침)는 스냅되지 않는다 = 게이트가 잡는다.
 */
export function autoSnapContentMatchEvidence(
  q: MdContentMatchQuestion,
  passage: string,
): { question: MdContentMatchQuestion; corrections: string[] } {
  const corrections: string[] = [];
  const sentences = splitPassageSentences(passage);
  if (sentences.length === 0) return { question: q, corrections };

  const evidence = q.evidence.map((row) => {
    const current = row.sentence?.trim();
    if (!current) return row;

    const span = locateContentMatchSpan(passage, current);
    if (span) {
      const host = sentences.find((s) => span.start >= s.start && span.start < s.end);
      // 한 문장 안에 들어가는 인용만 문장 축자로 확장한다. 두 문장에 걸친 인용을
      // 앞 문장으로 줄이면 근거의 내용이 바뀌므로 손대지 않는다(게이트 소관).
      if (host && span.end <= host.end && normalizeWs(host.text) !== normalizeWs(current)) {
        // 보수 가드(critical 실사고) — 짧고 모호한 인용("measurements" 한 단어)을
        // 문장 전문으로 갈아 끼우면 **선지와 무관한 문장**이 확신 있게 근거로
        // 인용되고 게이트는 CLEAN 을 준다. 확장은 두 경우에만 한다:
        //   (1) 사실상 그 문장 전체를 옮긴 표기 드리프트(마침표·따옴표 차이)
        //   (2) 내용어가 충분한(>= 4) 절 인용
        // 그 밖에는 손대지 않고 게이트가 "문장 전체가 아님" 으로 반려하게 둔다.
        const wholeSentence = foldForContentMatch(host.text) === foldForContentMatch(current);
        if (wholeSentence || contentTokens(current).length >= MIN_SNAP_CONTENT_TOKENS) {
          corrections.push(`${row.label} 근거를 지문 문장 축자로 보정`);
          return { ...row, sentence: host.text };
        }
      }
      return row;
    }

    const tokens = contentTokens(current);
    if (tokens.length < MIN_SNAP_CONTENT_TOKENS) return row;
    const scored = sentences
      .map((s) => {
        const pool = new Set(contentTokens(s.text));
        const hit = tokens.filter((t) => pool.has(t)).length;
        return { sentence: s, ratio: hit / tokens.length };
      })
      .sort((a, b) => b.ratio - a.ratio);
    const best = scored[0];
    const runnerUp = scored[1]?.ratio ?? 0;
    if (best && best.ratio >= 0.75 && best.ratio - runnerUp >= 0.15) {
      corrections.push(`${row.label} 근거를 지문 문장으로 복원(재진술 드리프트)`);
      return { ...row, sentence: best.sentence.text };
    }
    return row;
  });

  return {
    question: corrections.length > 0 ? { ...q, evidence } : q,
    corrections,
  };
}
