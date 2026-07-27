// ============================================================================
// 문장 삽입(SENTENCE_INSERT) md 파서 · 0원 스냅 · 좌표 계산 유틸.
// 견본: parser-antonym.ts · parser-order.ts
// 정본 규약 답습: 파서는 관대하게(드리프트 흡수) · 게이트는 엄격하게.
//
// 이 유형은 지문을 **변형**하는 계열이다(문장 하나를 빼낸다). 따라서 최강 방어선은
// 지문 재구성 대조 하나다 —
//   번호지문에서 마커를 걷어내고 **정답 자리에 삽입문장을 되돌리면 원 지문과 동일**
// 이 한 줄이 통과하면 (1) 삽입문장이 지문 축자이고 (2) 나머지 지문이 무단 편집되지
// 않았고 (3) 정답 라벨이 실제 추출 자리를 가리킨다는 세 가지가 동시에 증명된다.
//
// ⚠ 전역 정규식은 lastIndex 를 공유하므로 정본 INLINE_MARK_RE 를 재사용하지 않고
//   로컬 상수로 따로 선언한다(견본 INLINE_ANTONYM_MARK_RE 와 동일 규약).
//
// ⚠ 게이트 본체는 gate-sentence-insert.ts 로 분리했다(파일 500줄 규약).
//   의존 방향은 gate-sentence-insert → parser-sentence-insert 단방향이다.
// ============================================================================

import { splitIntoSentences } from "@/lib/question-postprocess/sentence-splitter";
import { normalizeWs } from "./parser";

/** 학생 표면 자리 라벨(원문자). 슬롯은 5~8개다. */
export const INSERT_CIRCLED = "①②③④⑤⑥⑦⑧";

/**
 * 인라인 자리 마커. `[[3]]` 이 계약이고, `[[ 3 ]]` · `[[③]]` 드리프트를 흡수한다.
 * 전역 플래그이므로 **matchAll 전용**으로만 쓴다(lastIndex 공유 사고 방지).
 *
 * ⚠ 자리 범위(1~8) 밖 번호까지 **전부 수집한다**(철칙 3 — 파서가 데이터를 조용히
 *   버리게 두지 마라). `[1-8]` 로 좁히면 모델이 실수로 붙인 `[[9]]`·`[[0]]`·`[[10]]` 이
 *   매치되지 않아 리터럴이 clean 에 그대로 남고, 게이트는 그걸 '지문 무단 편집'으로
 *   오진한다 — 모델은 지문을 한 글자도 고치지 않았는데 재생성 피드백이 엉뚱한 지시를
 *   준다(실측). 범위 판정은 게이트가 자리를 지목해서 한다(철칙 5).
 */
export const INLINE_INSERT_MARK_RE = /\[\[\s*(\d{1,2}|[①-⑳])\s*\]\]/g;
/** 대괄호를 통째로 빠뜨린 드리프트 폴백 — 맨 원문자만 찍은 출력. */
export const BARE_INSERT_MARK_RE = /[①-⑳]/g;

export interface MdInsertQuestion {
  kind: "sentenceInsert";
  /** 지문에서 빼낸 문장 — 언제나 **지문 축자**다(재구성 불변식이 이 줄로 돈다) */
  given: string;
  /** 학생 표시용 재진술본(paraphrasePrefix 설정일 때만). 없으면 "" */
  givenVariant: string;
  /** [[1]]~[[N]] 마커가 박힌 잔여 지문 */
  numberedPassage: string;
  /** "①"~"⑧" — 정답의 유일한 진실원(줄마다 정답 여부를 다시 받지 않는다) */
  answer: string;
  explanation: string;
  wrong: { label: string; text: string }[];
}

/** 원문자/숫자 어느 쪽으로 적혔든 표준 라벨(원문자)로. 범위 밖이면 "". */
export function insertCircledLabel(raw: unknown): string {
  const key = String(raw ?? "").trim();
  if (!key) return "";
  if (INSERT_CIRCLED.includes(key) && key.length === 1) return key;
  const n = Number(key);
  return Number.isInteger(n) && n >= 1 && n <= INSERT_CIRCLED.length
    ? INSERT_CIRCLED[n - 1]
    : "";
}

/** "③" → 2 (0-based 서수). 라벨이 아니면 -1. */
export function insertMarkerOrdinal(label: string): number {
  return INSERT_CIRCLED.indexOf(label);
}

/** 문장 경계 정렬 판정용 토큰 수 — 구두점·공백 드리프트에 영향받지 않는 축. */
export function insertTokenCount(text: string): number {
  return (String(text ?? "").match(/[\p{L}\p{N}]+/gu) ?? []).length;
}

/** 구두점·대소문자 무관 비교(스냅 보수 가드 전용). */
export function foldForInsertMatch(text: string): string {
  return (String(text ?? "").toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).join(" ");
}

export interface MdInsertMark {
  /** 모델이 적은 번호(1-based) — 원문자로 적었어도 숫자로 환산. 0 = 범위 밖·해독 불가 */
  num: number;
  /** 지문 등장 서수(0-based) — 학생 표면 번호의 진짜 근거 */
  ordinal: number;
  /** 마커를 걷어낸 텍스트(clean) 기준 문자 위치 */
  at: number;
  /** 모델이 실제로 적은 문자열(`[[9]]`) — 게이트가 자리를 지목할 때 쓴다(철칙 5) */
  raw: string;
}

// ── 마커 자리 공백 주입 판정축 ───────────────────────────────────────────────
// 마커 자리를 구분자 없이 이어 붙이면, 모델이 마커를 문장 사이에 **붙여** 쓴 순간
// (`…road designs.[[1]]Field measurements…` — 프롬프트가 '문장과 문장 사이'라고만
// 지시하므로 흔한 실측 드리프트) clean 이 `designs.Field` 가 되어, 원문을 한 글자도
// 고치지 않은 출력까지 '지문 무단 편집'으로 거짓 반려된다.
//
// ⚠ 반대로 무조건 넣거나 '양옆이 모두 낱말 문자'만 예외로 두면 **새 거짓 반려**가 난다.
//   `…writes it down[[2]].` · `…close that gap[[2]],` · `a vessel[[2]]'s position` 은
//   낱말 뒤 + 구두점 앞이라 원문에 공백이 없던 자리인데, 거기 공백을 넣으면 재구성이
//   깨져 '지문 재구성 불일치'(= 지문을 고쳐 썼다는 **거짓 원인**)로 하드 반려된다.
//   그 자리들의 참 진단은 '문장 경계가 아님'이고, 그건 마커 좌표가 이미 말해 준다.
// → 왼쪽이 **구두점으로 닫힌 자리**이고 오른쪽이 **낱말·여는 인용으로 열리는 자리**일
//   때만 넣는다 — 영어 조판에서 원문에 공백이 있었을 자리가 정확히 그때다.
const LEFT_TOKEN_CLOSED_RE = /[.!?,;:][)\]"'”’」』›»]*$/;
const RIGHT_TOKEN_OPENS_RE = /^[\p{L}\p{N}("'“‘「『«]/u;

/**
 * 번호지문을 "마커 없는 지문 + 마커 좌표"로 가른다.
 * `[[n]]` 이 하나도 안 잡히면 맨 원문자 폴백으로 한 번 더 훑는다 — 파서는 관대하게.
 */
export function splitInsertMarkers(numberedPassage: string): {
  clean: string;
  marks: MdInsertMark[];
} {
  const src = String(numberedPassage ?? "");
  const bracket = [...src.matchAll(INLINE_INSERT_MARK_RE)];
  const matches = bracket.length > 0 ? bracket : [...src.matchAll(BARE_INSERT_MARK_RE)];
  const marks: MdInsertMark[] = [];
  let clean = "";
  let cursor = 0;
  for (const [ordinal, m] of matches.entries()) {
    const start = m.index ?? 0;
    clean += src.slice(cursor, start);
    cursor = start + m[0].length;
    // 공백 한 칸 주입 — normalizeWs 가 연속 공백을 접으므로 정상 케이스의 좌표·비교는
    // 불변이다. 판정축 근거는 LEFT_TOKEN_CLOSED_RE 위 주석 참조.
    const next = src.slice(cursor, cursor + 1);
    if (
      next !== "" &&
      !/\s/.test(next) &&
      !/\s$/.test(clean) &&
      LEFT_TOKEN_CLOSED_RE.test(clean.slice(-8)) &&
      RIGHT_TOKEN_OPENS_RE.test(next)
    ) {
      clean += " ";
    }
    const label = insertCircledLabel(m[1] ?? m[0]);
    marks.push({
      num: label ? insertMarkerOrdinal(label) + 1 : 0,
      ordinal,
      at: clean.length,
      raw: m[0],
    });
  }
  clean += src.slice(cursor);
  return { clean, marks };
}

/** 마커를 전부 걷어낸 순수 지문(잔여 지문). 재구성 대조·표시 검사 공용. */
export function stripInsertMarks(numberedPassage: string): string {
  return splitInsertMarkers(numberedPassage).clean;
}

export interface MdInsertLayout {
  /** 마커를 걷어낸 잔여 지문 */
  clean: string;
  marks: MdInsertMark[];
  /** 원 지문 문장 분할(후처리 processSentenceInsert 과 **같은 분할기**) */
  sentences: string[];
  /** 빼낸 문장의 원 지문 인덱스. -1 = "지문에서 문장 하나만 뺀 형태"가 아님 */
  omittedIndex: number;
  /** 학생에게 보이는 문장들(원 지문 − 빼낸 문장) */
  displaySentences: string[];
  /** 마커별 직전 표시 문장 인덱스. -1 = 문장 경계 아님, -2 = 지문 맨 앞 */
  afterDisplayIndex: number[];
  /** 삽입문장을 되돌렸을 때 원 지문이 복원되는 마커 서수(0-based) 목록 */
  matchingGaps: number[];
}

/**
 * 마커 자리에 given 을 되끼웠을 때 원 지문이 복원되는 마커 서수 목록.
 * `fold` 를 갈아 끼워 축자 축(normalizeWs)과 구두점 무관 축(foldForInsertMatch)에
 * 모두 쓴다. 이 축이 비어 있지 않다는 것은 **지문이 온전하다는 증명**이다.
 */
function insertMatchingGaps(
  clean: string,
  marks: MdInsertMark[],
  given: string,
  passage: string,
  fold: (text: string) => string,
): number[] {
  const gaps: number[] = [];
  if (!given) return gaps;
  const target = fold(passage);
  for (const m of marks) {
    const rebuilt = `${clean.slice(0, m.at)} ${given} ${clean.slice(m.at)}`;
    if (fold(rebuilt) === target) gaps.push(m.ordinal);
  }
  return gaps;
}

/**
 * 빼낸 문장 인덱스의 **분할기 왕복 손실 폴백**.
 *
 * `splitIntoSentences` 는 무손실 왕복이 아니다 — 곧은따옴표를 다음 문장 선두로 흘리고
 * (`…we own." Field…` → [`…we own.`, `" Field…`]) `U.S.` 를 `U.` / `S.` 로 쪼갠다
 * (단일문자 약어 분기가 lastWord 를 소문자화한 뒤 `/^[A-Z]$/` 로 검사해 죽어 있다).
 * 그래서 `sentences.filter(k!==i).join(" ")` 축에는 유령 공백이 생기고, 모델이 지문을
 * 한 글자도 안 바꾸고 완벽히 옮겨 적어도 **어떤 i 로도** 일치하지 않는다(실측).
 *
 * → 이미 올바르게 계산돼 있는 원지문 축(복원이 성립하는 마커)에서 역산한다. 분할기는
 *   공백만 흔들 뿐 비공백 문자와 그 순서는 보존하므로 **마커 앞 토큰 수**가 손실 없는
 *   좌표축이다. 토큰 수가 같은 문장까지 확인해야 반 문장·두 문장 동시 추출과 구분된다
 *   (아니면 게이트의 '완결된 한 문장이 아님' 진단이 죽는다).
 */
function omittedIndexFromGaps(
  sentences: string[],
  clean: string,
  marks: MdInsertMark[],
  gaps: number[],
  given: string,
): number {
  const need = insertTokenCount(given);
  if (need === 0) return -1;
  for (const ordinal of gaps) {
    const mark = marks.find((m) => m.ordinal === ordinal);
    if (!mark) continue;
    const before = insertTokenCount(clean.slice(0, mark.at));
    let acc = 0;
    for (let i = 0; i < sentences.length; i += 1) {
      if (acc === before && insertTokenCount(sentences[i]) === need) return i;
      acc += insertTokenCount(sentences[i]);
    }
  }
  return -1;
}

/**
 * 게이트·어댑터가 **공유하는 단일 좌표 계산**. 두 면이 서로 다른 계산을 하면
 * "게이트는 통과했는데 저장 형상은 다른 자리를 가리키는" 오염 문항이 나온다
 * (정본 봉합 이력: 게이트와 어댑터가 서로 다른 축을 보던 사고).
 *
 * 마커 자리는 **토큰 수 정렬**로 판정한다. 모델 텍스트를 다시 문장 분할하면
 * 후처리(splitIntoSentences(passage) − 1문장)와 미세하게 어긋날 수 있어서,
 * 후처리가 실제로 쓰는 분할을 기준으로 삼고 마커 앞 토큰 수만 대조한다.
 */
export function computeInsertLayout(
  q: MdInsertQuestion,
  passage: string,
): MdInsertLayout {
  const { clean, marks } = splitInsertMarkers(q.numberedPassage);
  const sentences = splitIntoSentences(passage);
  const cleanNorm = normalizeWs(clean);

  // 복원 축을 먼저 세운다 — 지문이 온전한지의 유일한 증명이고, 아래 분할기 폴백은
  // 이 증명이 선 뒤에만 발동한다(증명 없이 폴백을 돌리면 모델이 공백 하나를 지운
  // 파손 지문까지 '정상'으로 통과시켜 재구성 게이트가 무력화된다).
  const matchingGaps = insertMatchingGaps(clean, marks, q.given, passage, normalizeWs);

  // 빼낸 문장 확정 — "원 지문에서 문장 i 하나만 뺀 것"이 잔여 지문과 같은가.
  // 동일 문장이 두 번 나오는 퇴화 지문에서는 첫 일치를 택한다(후처리
  // findSourceSentenceToOmit 의 findIndex 와 같은 규칙 — 두 면이 어긋나지 않는다).
  let omittedIndex = -1;
  for (let i = 0; i < sentences.length; i += 1) {
    const candidate = normalizeWs(sentences.filter((_, k) => k !== i).join(" "));
    if (candidate === cleanNorm) {
      omittedIndex = i;
      break;
    }
  }
  if (omittedIndex < 0 && matchingGaps.length > 0) {
    omittedIndex = omittedIndexFromGaps(sentences, clean, marks, matchingGaps, q.given);
  }
  const displaySentences =
    omittedIndex >= 0 ? sentences.filter((_, k) => k !== omittedIndex) : [];

  const cumulative: number[] = [];
  let acc = 0;
  for (const s of displaySentences) {
    acc += insertTokenCount(s);
    cumulative.push(acc);
  }
  const afterDisplayIndex = marks.map((m) => {
    if (displaySentences.length === 0) return -1;
    const before = insertTokenCount(clean.slice(0, m.at));
    if (before === 0) return -2;
    return cumulative.indexOf(before);
  });

  return {
    clean,
    marks,
    sentences,
    omittedIndex,
    displaySentences,
    afterDisplayIndex,
    matchingGaps,
  };
}

// ── 키워드 줄 관용 (형식 설계 철칙 3) ────────────────────────────────────────
// 선지·데이터 줄만 관대하게 파싱하고 `정답:` `해설:` `오답:` 같은 **키워드 줄은
// 무관용 정규식**으로 잡으면, 모델이 머리표를 굵게(`**정답:**`) 쓰거나 전각 콜론
// (`정답：`)을 쓰는 순간 그 필드가 통째로 사라진다. 그러면 게이트가 '정답 누락' 처럼
// **사실과 다른 원인**을 지목하고(정답이 명백히 적혀 있는데도), 그 문구가 그대로
// [반려 재생성] 피드백이 되어 모델을 엉뚱한 방향으로 몬다 — 이번 웨이브 최대 결함 계통.
// → 모든 키워드 줄에 같은 수준의 관용을 준다: 불릿·인용(>)·헤딩(#)·굵게(**)·기울임(*)·
//   언더스코어(__ · _)·전각 콜론·앞뒤 공백, 그리고 **머리표와 값 양쪽** 장식.
/** 마크다운 강조 런 — `*`·`_` 를 겹쳐 쓴 것까지 한 덩어리로 본다(`***`·`__`·`___`). */
const EMPH = String.raw`[*_]{1,6}`;
/** 줄 앞 장식 — 인용(중첩 포함)·헤딩·불릿·강조. */
const LINE_HEAD = String.raw`^[ \t]*(?:>[ \t]*)*(?:#{1,6}[ \t]*)?(?:[-+•][ \t]*|\*[ \t]+)?(?:${EMPH}[ \t]*)?`;
/** 키워드와 값 사이 — 콜론 **앞** 장식(`**정답**:`)과 **뒤** 장식(`**정답:**`)을 함께. */
const LINE_SEP = String.raw`[ \t]*(?:${EMPH})?[ \t]*[:：][ \t]*(?:${EMPH}[ \t]*)?`;
/**
 * 값 쪽 장식 슬롯. 머리표를 닫는 굵게가 LINE_SEP 의 콜론 뒤 슬롯을 **이미 소진**하므로,
 * 머리표와 값을 동시에 꾸민 `**정답:** **②**` 는 값 토큰에 관용이 하나도 남지 않아
 * 정답이 통째로 사라졌다(실측: `정답: **②**` 통과 · `**정답:** ②` 통과 · 둘을 겹치면
 * DROP → 게이트가 '정답 누락'이라는 **사실과 다른 원인**을 재생성 피드백으로 흘린다).
 * 여는 따옴표(`정답: "②"`)도 같은 계통의 DROP 이었다 — 쌍 장식 한쪽만 관용하면 값 선두가
 * 오염된다. 값이 `(.+)$` 인 줄(삽입문장·해설)은 stripInsertEmphasis 가 뒤에서 벗긴다.
 */
const VALUE_DECOR = String.raw`(?:${EMPH}[ \t]*)?["'“‘「『]?[ \t]*`;
/**
 * 블록 경계 — 번호지문·해설 캡처가 **뒤 블록을 통째로 삼키지** 않게 한다.
 * 일부 키워드만 알면 사이에 다른 줄이 끼는 순간 블록이 붕괴하므로 **전 섹션 키워드**를
 * 넣는다(예: 해설이 정답보다 먼저 나오는 순서 드리프트에서 해설이 정답 줄을 삼키면
 * 게이트가 '해설이 자리 번호로 위치를 지칭함'이라는 거짓 진단을 낸다).
 */
const VARIANT_TAG = String.raw`[ \t]*[,，、]?[ \t]*[(（\[]?[ \t]*변형[ \t]*[)）\]]?`;
const SECTION_KEY = String.raw`(?:삽입문장(?:${VARIANT_TAG})?|번호지문|정답|해설|오답)`;
const BLOCK_BREAK = `(?=${LINE_HEAD}${SECTION_KEY}${LINE_SEP})`;

const GIVEN_RE = new RegExp(`${LINE_HEAD}삽입문장${LINE_SEP}(.+)$`, "m");
const GIVEN_VARIANT_RE = new RegExp(`${LINE_HEAD}삽입문장${VARIANT_TAG}${LINE_SEP}(.+)$`, "m");
const NUMBERED_RE = new RegExp(
  `${LINE_HEAD}번호지문${LINE_SEP}\\r?\\n?([\\s\\S]*?)${BLOCK_BREAK}`,
  "m",
);
const NUMBERED_TAIL_RE = new RegExp(`${LINE_HEAD}번호지문${LINE_SEP}\\r?\\n?([\\s\\S]+)$`, "m");
const ANSWER_RE = new RegExp(
  `${LINE_HEAD}정답${LINE_SEP}${VALUE_DECOR}\\[{0,2}[ \\t]*[(（]?[ \\t]*([①-⑧]|[1-8])[ \\t]*[)）]?`,
  "m",
);
const WRONG_HEAD_ONLY_RE = new RegExp(`${LINE_HEAD}오답${LINE_SEP}$`, "m");
const WRONG_HEAD_RE = new RegExp(`${LINE_HEAD}오답${LINE_SEP}`, "m");
const EXPLANATION_RE = new RegExp(`${LINE_HEAD}해설${LINE_SEP}([\\s\\S]*?)${BLOCK_BREAK}`, "m");
const EXPLANATION_TAIL_RE = new RegExp(`${LINE_HEAD}해설${LINE_SEP}([\\s\\S]+)$`, "m");

// 오답 줄은 라벨로 시작하는 줄만 후보로 본다. 라벨 앞뒤의 마크다운 장식(불릿·인용·헤딩·
// 굵게·언더스코어)과 표 파이프, 라벨 표기 흔들림([[3]]·(3)·3.)을 흡수한다 — 실측 드리프트.
// 머리표 줄(LINE_HEAD)과 **같은 관용 수준**을 유지한다: 한쪽만 넓히면 오답해설이 통째로
// 사라져 게이트가 '오답해설 0개'라는 사실과 다른 원인을 낸다(실측: `### ① …`).
const WRONG_LINE_HEAD =
  /^[ \t]*(?:>[ \t]*)*(?:#{1,6}[ \t]*)?\|?[ \t]*(?:[-+•][ \t]*|\*[ \t]+)?[*_]{0,3}\[{0,2}[ \t]*[(（]?[ \t]*([①-⑧]|[1-8])[ \t]*[)）]?[ \t]*\]{0,2}[*_]{0,3}[ \t]*[.)．]?[ \t]*(.+)$/;

/**
 * 값에 씌워진 굵게/기울임/언더스코어 마크업을 벗긴다(`**값**` · `__값__`).
 * 짝이 맞을 때만 벗겨 오작동을 막고, 겹쳐 씌운 형태(`**_값_**`)를 위해 최대 3겹까지 본다.
 * ⚠ 따옴표(`"값"`)는 벗기지 않는다 — 지문 문장 자체가 통째로 인용문일 수 있어(축자
 *   계약) 여기서 벗기면 멀쩡한 축자가 깨진다. 장식으로 씌운 경우는 autoSnapInsertGiven
 *   이 구두점 무관 축으로 축자 복원하므로 이미 흡수된다.
 */
function stripInsertEmphasis(value: string): string {
  let out = String(value ?? "").trim();
  for (let round = 0; round < 3; round += 1) {
    const before = out;
    for (const mark of ["***", "**", "*", "___", "__", "_"]) {
      if (out.length > mark.length * 2 && out.startsWith(mark) && out.endsWith(mark)) {
        out = out.slice(mark.length, -mark.length).trim();
        break;
      }
    }
    if (out === before) break;
  }
  // 머리표만 장식을 닫고 값 끝에 짝 없는 장식이 남은 형태(`**오답:** ① …**` 의 꼬리).
  return out.replace(/[*_]{2,3}$/, "").trimEnd();
}

/**
 * 문장 삽입 md 파싱. 드리프트 관용(정본 parseMdBlank 규약):
 * 라벨 표기 흔들림, 콜론 전각, 굵게 머리표, 번호지문 머리표 뒤 개행 유무,
 * 오답 목록에 정답 줄을 끼워 넣는 실측 패턴.
 */
export function parseMdSentenceInsert(text: string): MdInsertQuestion {
  // `삽입문장(변형):` 은 `삽입문장` 뒤가 괄호라 아래 축자 정규식과 서로 배타적이다.
  const given = stripInsertEmphasis(text.match(GIVEN_RE)?.[1] ?? "");
  const givenVariant = stripInsertEmphasis(text.match(GIVEN_VARIANT_RE)?.[1] ?? "");

  const numberedPassage =
    text.match(NUMBERED_RE)?.[1]?.trim() ??
    text.match(NUMBERED_TAIL_RE)?.[1]?.trim() ??
    "";

  const answer = insertCircledLabel(text.match(ANSWER_RE)?.[1] ?? "");

  const wrongSection =
    text.split(WRONG_HEAD_ONLY_RE)[1] ?? text.split(WRONG_HEAD_RE)[1] ?? "";
  // 드리프트 관용: 오답 목록에 정답 줄을 끼워 넣는 실측 — 파서가 걸러낸다.
  // 조용한 데이터 버림이 아니다: 게이트가 남은 라벨 **집합**을 자리 집합과 대조하므로
  // 필터로 생긴 결손·중복은 전부 게이트 진단에 드러난다.
  const wrong: { label: string; text: string }[] = [];
  for (const rawLine of wrongSection.split(/\r?\n/)) {
    const head = rawLine.match(WRONG_LINE_HEAD);
    if (!head) continue;
    const label = insertCircledLabel(head[1]);
    if (!label || label === answer) continue;
    wrong.push({ label, text: stripInsertEmphasis(head[2]) });
  }

  const explanation = stripInsertEmphasis(
    text.match(EXPLANATION_RE)?.[1] ?? text.match(EXPLANATION_TAIL_RE)?.[1] ?? "",
  );

  return {
    kind: "sentenceInsert",
    given,
    givenVariant,
    numberedPassage,
    answer,
    explanation,
    wrong,
  };
}

/**
 * 0원 자동 보정. 이 유형의 위치 진실원은 **번호지문**이다(어느 문장이 빠졌는지가
 * 거기 이미 확정돼 있다). `삽입문장:` 줄이 그 문장을 구두점·대소문자만 다르게 옮겨
 * 적은 실측 드리프트를 원문 축자로 갈아 끼운다 — autoSnapAntonymPairs 와 동일 사상.
 *
 * 보수 가드: **구두점·대소문자만 다른 경우에만** 보정한다. 단어가 다르면(모델이
 * 문장을 지어냈거나 다른 문장을 적었다) 손대지 않고 게이트가 반려하게 둔다 —
 * 여기서 통째로 갈아 끼우면 해설이 설명하는 문장과 저장되는 문장이 어긋난다.
 * 변형본(givenVariant)은 학생 표시면이라 **절대 건드리지 않는다.**
 */
export function autoSnapInsertGiven(
  q: MdInsertQuestion,
  passage: string,
): { question: MdInsertQuestion; corrections: string[] } {
  const corrections: string[] = [];
  if (!q.given || !q.numberedPassage) return { question: q, corrections };

  const { clean, marks } = splitInsertMarkers(q.numberedPassage);
  // 이미 복원이 성립하면 삽입문장은 **축자**다 — 분할기 단위와 글자가 달라도
  // (인용부호 stranding 으로 분할기가 닫는 따옴표를 다음 단위로 흘린 지문) 절대
  // 건드리지 않는다. 여기서 분할기 단위로 갈아 끼우면 멀쩡한 축자가 깨져
  // 재구성 게이트가 반려한다.
  if (insertMatchingGaps(clean, marks, q.given, passage, normalizeWs).length > 0) {
    return { question: q, corrections };
  }

  const cleanNorm = normalizeWs(clean);
  const sentences = splitIntoSentences(passage);
  let omitted = -1;
  for (let i = 0; i < sentences.length; i += 1) {
    if (normalizeWs(sentences.filter((_, k) => k !== i).join(" ")) === cleanNorm) {
      omitted = i;
      break;
    }
  }
  if (omitted < 0) {
    // computeInsertLayout 과 같은 분할기 왕복 손실 폴백. 여기서는 given 이 아직
    // 구두점 드리프트 상태이므로 축자 축이 아니라 구두점 무관 축으로 복원을 센다.
    omitted = omittedIndexFromGaps(
      sentences,
      clean,
      marks,
      insertMatchingGaps(clean, marks, q.given, passage, foldForInsertMatch),
      q.given,
    );
  }
  if (omitted < 0) return { question: q, corrections };

  const exact = sentences[omitted];
  if (normalizeWs(exact) === normalizeWs(q.given)) return { question: q, corrections };
  if (foldForInsertMatch(exact) !== foldForInsertMatch(q.given)) {
    return { question: q, corrections };
  }
  corrections.push("삽입문장을 지문 축자로 보정(구두점·대소문자 드리프트)");
  return { question: { ...q, given: exact }, corrections };
}
