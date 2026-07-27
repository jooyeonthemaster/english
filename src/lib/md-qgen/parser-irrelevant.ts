// ============================================================================
// 무관한 문장(IRRELEVANT) md 파서 · 0원 스냅 · 재구성 유틸.
// 견본(EXEMPLAR): parser-antonym.ts · 계약 문서: docs/md-qgen-type-expansion-spec.md
// 정본 규약 답습: 파서는 관대하게(드리프트 흡수) · 게이트는 엄격하게.
//
// 이 유형의 계약은 **삽입(insertion)** 이다 — 번호지문은 "원 지문 전체(축자) +
// 무관 문장 1개가 두 원문 문장 사이에 끼워진 것" 이고, 그게 그대로 학생 표면이다
// (후처리 buildSpreadMarkedPassage 가 원문 전 문장을 출력하고 무관 문장만 끼워 넣는다).
// 따라서 최강 불변식은 —
//   "정답 마커(삽입 문장)를 통째로 들어내고 나머지 마커를 걷어낸 재구성본 == 원 지문"
// 이 한 줄이 통과하면 마커 밖 무단 편집·비정답 슬롯 변형·문장 유실이 동시에 증명된다.
//
// ⚠ 게이트 본체는 gate-irrelevant.ts 로 분리했다(파일 500줄 규약).
//   의존 방향은 gate-irrelevant → parser-irrelevant 단방향이다(재수출로 순환 금지).
// ============================================================================

import { splitPassageSentences } from "@/lib/passage-sentence-utils";
import { normalizeComparableText } from "@/lib/question-quality/core";

/**
 * 번호 마커. **전역 정규식은 lastIndex 를 공유**하므로 정본 INLINE_MARK_RE 를
 * 재사용하지 않고 로컬 상수로 선언한다(라벨 축도 [A-J] 가 아니라 숫자다).
 * ⚠ 이 상수는 `matchAll` / `replace` 로만 쓴다 — `exec`/`test` 는 lastIndex 를
 *   전진시켜 다음 호출을 조용히 오작동시킨다.
 *
 * 본문은 `[\s\S]` 기반 **tempered greedy**(`(?!\]\])` 로 첫 `]]` 앞에서 멈춘다)다.
 * `.` 로 두면 개행을 못 넘어, PDF·책에서 붙여넣은 지문의 문장 중간 하드 개행
 * ("...merchant ledgers,\nand older maps...")을 모델이 지시대로 축자 복사한 순간
 * 그 마커가 통째로 소실되고 게이트에는 "번호 마커 N개" 개수 오류로만 보였다
 * (규범 §1-B 철칙 3 위반 — 진짜 원인이 은폐된다). 구분자도 전각 콜론(`[[3：문장]]`)
 * 을 함께 받는다 — ASCII 전용이면 마커 전량이 소실된다.
 */
export const INLINE_IRRELEVANT_MARK_RE =
  /\[\[\s*(\d{1,2})\s*[:：]((?:(?!\]\])[\s\S])+)\]\]/g;

/**
 * 키워드 줄 접두 관용 — 인용(`>`)·헤딩(`##`)·표 파이프(`|`)·불릿(`-*•+`)·굵게(`**`·`__`·`*`).
 *
 * ⚠ 규범 §1-B 철칙 3 (프로덕션에서 두 번 난 사고 계통): 선지·데이터 줄만 관대하게
 *   파싱하고 `정답:` `해설:` `오답:` `번호지문:` 처럼 **필드를 여는 줄**을 무관용
 *   정규식으로 잡으면, 모델이 헤더를 굵게(`**정답:**`) 쓰거나 전각 콜론(`정답：`)을
 *   쓰는 순간 그 필드가 통째로 사라진다. 그러면 게이트가 "정답 누락" 처럼 **사실과
 *   다른 원인**을 지목하고, 그 문구가 그대로 `[반려 재생성]` 피드백이 되어 모델을
 *   엉뚱한 방향으로 몬다(실측: `**정답:** **해설:** **오답:**` 한 번에 3필드 소실).
 */
const KEY_LEAD = String.raw`^[ \t]*(?:>[ \t]*)*(?:#{1,6}[ \t]+)?(?:\|[ \t]*)?(?:[-*•+][ \t]+)?(?:\*\*|__|\*)?[ \t]*`;
/** 키워드와 값 사이 — 굵게 닫기 + 콜론(ASCII·전각) + 굵게 열기. */
const KEY_SEP = String.raw`[ \t]*(?:\*\*|__|\*)?[ \t]*[:：]\s*(?:\*\*|__|\*)?\s*`;

/** 키워드 줄 머리 패턴(캡처 그룹 없음 — `split`·lookahead 에 그대로 쓸 수 있다). */
export function irrelevantKeywordHead(keyword: string): string {
  return `${KEY_LEAD}${keyword}${KEY_SEP}`;
}

const PASSAGE_HEAD = irrelevantKeywordHead("번호지문");
const ANSWER_HEAD = irrelevantKeywordHead("정답");
const EXPLANATION_HEAD = irrelevantKeywordHead("해설");
const WRONG_HEAD = irrelevantKeywordHead("오답");

const ANSWER_SPLIT_RE = new RegExp(ANSWER_HEAD, "m");
const ANSWER_LINE_RE = new RegExp(`${ANSWER_HEAD}(.+)$`, "m");
const NUMBERED_RE = new RegExp(
  `${PASSAGE_HEAD}([\\s\\S]*?)(?=${ANSWER_HEAD}|${EXPLANATION_HEAD}|${WRONG_HEAD})`,
  "m",
);
const NUMBERED_TAIL_RE = new RegExp(`${PASSAGE_HEAD}([\\s\\S]+)$`, "m");
const EXPLANATION_RE = new RegExp(
  `${EXPLANATION_HEAD}([\\s\\S]*?)(?=${WRONG_HEAD})`,
  "m",
);
const EXPLANATION_TAIL_RE = new RegExp(`${EXPLANATION_HEAD}([\\s\\S]+)$`, "m");
const WRONG_SECTION_STRICT_RE = new RegExp(`${WRONG_HEAD}[ \\t]*$`, "m");
const WRONG_SECTION_LOOSE_RE = new RegExp(WRONG_HEAD, "m");

/** ①~⑳ (U+2460~U+2473) — 학생 표면·`정답:` 줄의 라벨 축. */
const CIRCLED_RANGE_RE = /[①-⑳]/;

export interface MdIrrelevantSlot {
  /** "1"~"10" — 지문 등장 순 번호(내부 축). 표면 ①~⑩ 은 어댑터·후처리가 만든다. */
  label: string;
  /** 마커가 감싼 문장 전체(비정답=지문 축자 / 정답=새로 끼워 넣은 무관 문장) */
  text: string;
}

export interface MdIrrelevantMark extends MdIrrelevantSlot {
  /** 번호지문 안에서 마커가 시작하는 위치 */
  index: number;
  /** 마커 전체 길이(`[[n:...]]` 포함) */
  length: number;
}

export interface MdIrrelevantQuestion {
  kind: "irrelevant";
  /** [[1:문장]] 로 마킹된 지문 전체(무관 문장 포함) */
  numberedPassage: string;
  slots: MdIrrelevantSlot[];
  /** 무관 문장의 번호 — 정답의 유일한 진실원(`정답:` 줄) */
  answer: string;
  explanation: string;
  wrong: { label: string; text: string }[];
}

/**
 * 라벨 표기 정규화 — `③` · `3` · `(3)` · `3번` · `[3]` 을 전부 "3" 으로.
 * 형식 계약은 원문자지만, 모델이 숫자로 쓰는 드리프트가 흔해 파서가 흡수한다.
 */
export function normalizeIrrelevantLabel(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const circled = s.match(CIRCLED_RANGE_RE);
  if (circled) {
    return String((circled[0].codePointAt(0) ?? 0) - 0x245f);
  }
  const digits = s.match(/^[^0-9]{0,4}?(\d{1,2})/);
  if (digits) {
    const n = Number(digits[1]);
    if (n >= 1 && n <= 20) return String(n);
  }
  return "";
}

/** 번호지문의 마커를 등장 순으로 수집한다(위치·길이 포함 — 인접성 게이트가 쓴다). */
export function collectIrrelevantMarks(numberedPassage: string): MdIrrelevantMark[] {
  return [...numberedPassage.matchAll(INLINE_IRRELEVANT_MARK_RE)].map((m) => ({
    label: normalizeIrrelevantLabel(m[1]),
    // 저장 형상은 항상 한 줄 — 모델의 개행 줄바꿈을 접는다(후처리 sentences[] 계약).
    text: m[2].replace(/\s+/g, " ").trim(),
    index: m.index ?? 0,
    length: m[0].length,
  }));
}

/**
 * 마커 개수가 어긋났을 때 **어느 `[[` 가 인식에 실패했는지** 지목한다(규범 §1-B 철칙 5).
 * "번호 마커 4개 (5개 필요)" 만으로는 모델이 진짜 원인(닫는 `]]` 누락·번호 자리 오염)을
 * 알 수 없고, 같은 지문이면 재생성도 같은 형상으로 수렴한다.
 * 인식 실패가 없으면(단순 개수 부족) `null` 을 돌려 기본 문구를 쓰게 한다.
 */
export function describeUnrecognizedIrrelevantMark(
  numberedPassage: string,
): { openers: number; recognized: number; snippet: string } | null {
  const openers = [...numberedPassage.matchAll(/\[\[/g)].map((m) => m.index ?? 0);
  const marks = collectIrrelevantMarks(numberedPassage);
  if (openers.length <= marks.length) return null;
  const recognized = new Set(marks.map((m) => m.index));
  const bad = openers.find((index) => !recognized.has(index));
  if (bad === undefined) return null;
  return {
    openers: openers.length,
    recognized: marks.length,
    snippet: numberedPassage.slice(bad, bad + 60).replace(/\s+/g, " ").trim(),
  };
}

/** 마커만 걷어낸 텍스트(무관 문장은 남긴다) — 학생 표면 등가 확인용. */
export function stripIrrelevantMarks(numberedPassage: string): string {
  return numberedPassage.replace(
    INLINE_IRRELEVANT_MARK_RE,
    (_full, _label, body: string) => String(body),
  );
}

/**
 * ★ 재구성 — 정답 마커(삽입 문장)를 통째로 들어내고 나머지 마커를 걷어낸다.
 * 이 결과가 원 지문과 `normalizeWs` 기준으로 완전히 일치해야 통과다.
 *
 * 드리프트 흡수 1건: 모델이 종결 부호를 마커 **밖**에 남기는 경우
 * (`[[3:This is an intruder]]. Next…`) 삽입 문장만 지우면 고아 마침표가 남는다.
 * 마커 안이 종결 부호로 끝나지 않을 때만 뒤따르는 고아 부호를 함께 걷는다
 * (보수 가드 — 정상 출력에는 영향이 없다).
 */
export function reconstructIrrelevantPassage(
  numberedPassage: string,
  answerLabel: string,
): string {
  let out = "";
  let cursor = 0;
  for (const m of numberedPassage.matchAll(INLINE_IRRELEVANT_MARK_RE)) {
    const start = m.index ?? 0;
    const label = normalizeIrrelevantLabel(m[1]);
    const body = String(m[2]);
    out += numberedPassage.slice(cursor, start);
    cursor = start + m[0].length;
    if (!answerLabel || label !== answerLabel) {
      out += body;
      continue;
    }
    if (!/[.!?]["'”’)\]]*\s*$/.test(body)) {
      const orphan = numberedPassage.slice(cursor).match(/^[ \t]*[.!?]+["'”’)\]]*/);
      if (orphan) cursor += orphan[0].length;
    }
  }
  out += numberedPassage.slice(cursor);
  return out;
}

// 라벨로 시작하는 줄만 오답 후보로 본다. 라벨 앞의 마크다운 장식(불릿·굵게·인용)과
// 표 파이프는 흡수한다 — 모델이 목록을 꾸미는 실측 드리프트.
const WRONG_LINE_RE =
  /^\s*(?:>\s*)*\|?\s*(?:[-*•+]\s*)?(?:\*\*|__)?[([]?\s*([①-⑳]|\d{1,2})\s*[)\].：]?(?:\*\*|__)?\s*(.+)$/gm;

/**
 * 무관한 문장 md 파싱. 드리프트 관용(정본 parseMdBlank 규약):
 * 머리표 콜론 전각·굵게·불릿·인용·헤딩 접두, 번호지문 머리표 뒤 개행 유무,
 * 마커 본문의 하드 개행, 라벨 표기 흔들림(원문자·숫자·괄호),
 * 오답 줄의 마크다운 장식·표 파이프, 오답 목록에 정답 줄을 끼워 넣는 실측 패턴.
 */
export function parseMdIrrelevant(text: string): MdIrrelevantQuestion {
  const beforeAnswer = text.split(ANSWER_SPLIT_RE)[0] ?? text;
  const headed =
    text.match(NUMBERED_RE)?.[1]?.trim() ??
    text.match(NUMBERED_TAIL_RE)?.[1]?.trim() ??
    "";
  // 머리표가 통째로 빠진 실측 드리프트 — 마커가 있으면 `정답:` 앞 본문을 지문으로 본다.
  // (줄 하나를 통째로 버리면 게이트에는 "마커 0개"로만 보여 원인이 은폐된다 — 철칙 3.)
  const numberedPassage =
    headed || ([...beforeAnswer.matchAll(INLINE_IRRELEVANT_MARK_RE)].length > 0
      ? beforeAnswer.trim()
      : "");

  const answer = normalizeIrrelevantLabel(text.match(ANSWER_LINE_RE)?.[1] ?? "");

  const wrongSection =
    text.split(WRONG_SECTION_STRICT_RE)[1] ??
    text.split(WRONG_SECTION_LOOSE_RE)[1] ??
    "";
  const wrong = [...wrongSection.matchAll(WRONG_LINE_RE)]
    .map((m) => ({
      label: normalizeIrrelevantLabel(m[1]),
      text: m[2]
        .trim()
        .replace(/^\|\s*/, "")
        .replace(/\s*\|\s*$/, "")
        .trim(),
    }))
    // 드리프트 관용: 오답 목록에 정답 줄을 끼워 넣는 실측 — 파서가 걸러낸다.
    // 조용한 버림이 아니다: 게이트가 남은 개수와 라벨 집합을 대조한다.
    .filter((w) => w.label && w.text && w.label !== answer);

  return {
    kind: "irrelevant",
    numberedPassage,
    slots: collectIrrelevantMarks(numberedPassage).map((m) => ({
      label: m.label,
      text: m.text,
    })),
    answer,
    explanation:
      text.match(EXPLANATION_RE)?.[1]?.trim() ??
      text.match(EXPLANATION_TAIL_RE)?.[1]?.trim() ??
      "",
    wrong,
  };
}

/** 비교용 정규화 — 종결 부호·대소문자·따옴표 차이를 무시한다. */
export function comparableIrrelevantSentence(value: string): string {
  return normalizeComparableText(value).replace(/[.!?]+$/, "").trim();
}

/** 번호지문의 마커 라벨을 등장 순 1..N 으로 다시 찍는다(재번호 스냅 전용). */
function relabelNumberedPassage(numberedPassage: string): string {
  let n = 0;
  return numberedPassage.replace(
    INLINE_IRRELEVANT_MARK_RE,
    (_full, _label, body: string) => {
      n += 1;
      return `[[${n}:${body}]]`;
    },
  );
}

/**
 * 0원 자동 보정.
 *  (1) 번호 재부여 — 라벨이 오름차순이되 1..N 이 아닐 때(모델이 지문 문장 번호로
 *      매기는 드리프트) 위치 기준으로 1..N 로 되돌리고 정답·오답 라벨도 함께 옮긴다.
 *      ⚠ **번호지문의 마커 라벨도 같이 찍어야 한다** — 게이트의 재구성·인접 검사는
 *      번호지문을 읽으므로, 슬롯만 옮기면 정답 라벨이 엉뚱한 마커를 가리킨다.
 *      정답 라벨이 슬롯 집합 밖이면 손대지 않는다(보수 가드 — 게이트가 반려).
 *  (2) 종결 부호 흡수 — 모델이 문장 끝 부호를 마커 밖에 남긴 드리프트.
 *      마커 바로 뒤의 고아 부호를 슬롯 텍스트로 되돌린다(번호지문은 건드리지 않는다 —
 *      재구성 대조가 이미 같은 드리프트를 관용한다).
 *  (3) 비정답 슬롯 축자 스냅 — 곱슬따옴표·대소문자·종결 부호만 어긋난 슬롯을
 *      원 지문 문장 축자로 되돌린다(저장되는 sentences[] 를 축자로 만든다).
 *      후보가 유일할 때만 채택한다. 정답 슬롯은 **절대 스냅하지 않는다** —
 *      삽입 문장이 지문 문장으로 둔갑하면 "삽입문 신규성" 게이트가 무력화된다.
 */
export function autoSnapIrrelevantSlots(
  q: MdIrrelevantQuestion,
  passage: string,
): { question: MdIrrelevantQuestion; corrections: string[] } {
  const corrections: string[] = [];
  let numberedPassage = q.numberedPassage;
  let slots = q.slots;
  let answer = q.answer;
  let wrong = q.wrong;

  // (1) 번호 재부여
  const nums = slots.map((s) => Number(s.label));
  const usable = nums.every((n) => Number.isFinite(n) && n > 0);
  const ascending = nums.every((n, i) => i === 0 || n > nums[i - 1]);
  const canonical = nums.every((n, i) => n === i + 1);
  if (slots.length > 0 && usable && ascending && !canonical) {
    const remap = new Map(slots.map((s, i) => [s.label, String(i + 1)]));
    if (!answer || remap.has(answer)) {
      slots = slots.map((s, i) => ({ ...s, label: String(i + 1) }));
      if (answer) answer = remap.get(answer) ?? answer;
      wrong = wrong.map((w) => ({ ...w, label: remap.get(w.label) ?? w.label }));
      numberedPassage = relabelNumberedPassage(numberedPassage);
      corrections.push(
        `번호 라벨을 지문 등장순 1~${slots.length} 로 재부여(원본: ${nums.join(",")})`,
      );
    }
  }

  // (2) 종결 부호 흡수 — 마커와 슬롯은 등장 순으로 1:1 대응한다.
  const marks = collectIrrelevantMarks(numberedPassage);
  slots = slots.map((slot, i) => {
    const mark = marks[i];
    if (!mark || !slot.text || /[.!?]["'”’)\]]*$/.test(slot.text)) return slot;
    const orphan = numberedPassage
      .slice(mark.index + mark.length)
      .match(/^[ \t]*([.!?]+["'”’)\]]*)/);
    if (!orphan) return slot;
    corrections.push(`${slot.label}번 문장의 종결 부호를 마커 안으로 흡수`);
    return { ...slot, text: `${slot.text}${orphan[1]}` };
  });

  // (3) 비정답 슬롯 축자 스냅
  const passageSentences = splitPassageSentences(passage);
  const byKey = new Map<string, string[]>();
  for (const sentence of passageSentences) {
    const key = comparableIrrelevantSentence(sentence);
    if (!key) continue;
    byKey.set(key, [...(byKey.get(key) ?? []), sentence]);
  }
  slots = slots.map((slot) => {
    if (!slot.text || (answer && slot.label === answer)) return slot;
    const hits = byKey.get(comparableIrrelevantSentence(slot.text));
    if (!hits || hits.length !== 1) return slot;
    const verbatim = hits[0];
    if (verbatim === slot.text) return slot;
    corrections.push(`${slot.label}번 문장을 지문 축자로 보정`);
    return { ...slot, text: verbatim };
  });

  return { question: { ...q, numberedPassage, slots, answer, wrong }, corrections };
}
