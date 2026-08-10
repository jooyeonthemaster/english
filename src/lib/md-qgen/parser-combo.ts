// ============================================================================
// 네모 어법(GRAMMAR_CHOICE_COMBO) md 파서 · 0원 스냅.
// 견본: parser-antonym.ts / 정본 규약: 파서는 관대하게(드리프트 흡수) ·
// 게이트는 엄격하게. 파서가 데이터를 조용히 버리면 게이트가 결함을 볼 수 없다.
// 계약 문서: docs/md-qgen-type-expansion-spec.md §4-3 · recon-synthesis §3-B
//
// 0원 결정형 게이트는 **gate-combo.ts** 로 분리했다(적대검수 26-07-26 보강으로
// 이 파일이 500줄 한도를 넘어섰기 때문 — 스펙의 "400줄에서 분할 검토" 조항).
// 이 파일은 마크다운 → 구조체(파싱)와 무손실 보정(스냅)까지만 책임진다.
//
// 이 유형의 계약 축(다른 유형과 반대인 지점):
//  · 지문은 **변형되지 않는다**. 네모 안 파이프 왼쪽이 원문 축자이고 오른쪽은
//    제시용 변형이다 → "마커를 왼쪽 값으로 되돌린 재구성본 == 원 지문"이 최강
//    불변식이다(어법의 `changed.length === answerCount` 를 복사하면 안 된다).
//  · 정답은 라벨이 아니라 **조합**이다. 후처리(grammar-choice-combo.ts:327-332)는
//    정답 오지정을 경고만 내고 자동 교정하므로, 게이트가 안 잡으면 오지정이
//    조용히 은폐된 채 저장된다.
// ============================================================================

import { normalizeWs } from "./parser";

/**
 * 인라인 네모 마커. **관대 파싱**: 안쪽을 통째로 잡고 파이프 분해는 뒤에서 한다 —
 * `(?!\|)` 를 정규식에 박으면 파이프를 빠뜨린 출력(`[[A:expr]]`)이 매칭에서 통째로
 * 사라져 게이트가 "후보 2개 아님"을 볼 수 없다. 전역 정규식은 lastIndex 를
 * 공유하므로 정본 INLINE_MARK_RE 를 재사용하지 않고 로컬 선언(matchAll 전용).
 */
export const COMBO_INLINE_MARK_RE = /\[\[([A-C]):((?:(?!\]\]).)+)\]\]/g;

/** 값 구분자 관용 — 계약 리터럴은 " …… " 이나 말줄임표 개수·점 표기 드리프트를 흡수. */
const COMBO_VALUE_SPLIT_RE = /\s*(?:…+|\.{3,})\s*/;

/** 라벨 정본 축 — 게이트(gate-combo.ts)와 공유한다. */
export const COMBO_LABEL_KEYS = "ABC";
export const COMBO_CIRCLED = "①②③④⑤";

export interface MdComboSlot {
  /** "(A)"~"(C)" */
  label: string;
  /** 어법상 옳은 표현 = 원문 축자 */
  correct: string;
  /** 어법상 틀린 표현(제시용 변형) */
  wrong: string;
  /** 포인트 코드 a~m (adapter.ts POINT_NAME 과 1:1) */
  code: string;
}

export interface MdComboOption {
  /** "①"~"⑤" · 원문 join 문자열(" …… ") · (A)(B)(C) 순서의 값 */
  label: string;
  text: string;
  values: string[];
}

export interface MdComboQuestion {
  kind: "combo";
  /** [[A:올바름|틀림]] 로 마킹된 지문 전체 */
  markedPassage: string;
  slots: MdComboSlot[];
  options: MdComboOption[];
  answer: string;
  explanation: string;
  wrong: { label: string; text: string }[];
}

function comboParenLabel(raw: string): string {
  const key = raw.trim().replace(/[()[\].:]/g, "").toUpperCase();
  return key.length === 1 && COMBO_LABEL_KEYS.includes(key) ? `(${key})` : "";
}

/** 비교 정규화 — 대소문자 차이는 후처리(comparableText)가 이미 관용하므로 동일 축. */
export function comboCmp(value: string): string {
  return normalizeWs(value).toLowerCase();
}

/** 네모지문의 마커를 라벨 → 후보배열로 수집한다(지문 등장 순, 관대 분해). */
export function collectComboMarks(
  markedPassage: string,
): { label: string; candidates: string[] }[] {
  return [...markedPassage.matchAll(COMBO_INLINE_MARK_RE)].map((m) => ({
    label: `(${m[1]})`,
    // 파이프가 없으면 후보 1개로 남는다 — 게이트가 그걸 보고 반려한다.
    candidates: m[2].split("|").map((s) => s.trim()),
  }));
}

/**
 * 마커를 `pick(label, candidates)` 값으로 되돌린 지문과 각 네모의 위치를 만든다.
 * 재구성 대조 · surroundingText · 누설 검사가 이 한 번의 순회를 공유한다.
 */
export function rebuildComboPassage(
  markedPassage: string,
  pick: (label: string, candidates: string[]) => string,
): { text: string; spans: Map<string, { index: number; length: number }> } {
  const spans = new Map<string, { index: number; length: number }>();
  let text = "";
  let cursor = 0;
  for (const m of markedPassage.matchAll(COMBO_INLINE_MARK_RE)) {
    const label = `(${m[1]})`;
    const value = pick(label, m[2].split("|").map((s) => s.trim()));
    text += markedPassage.slice(cursor, m.index);
    spans.set(label, { index: text.length, length: value.length });
    text += value;
    cursor = (m.index ?? 0) + m[0].length;
  }
  text += markedPassage.slice(cursor);
  return { text, spans };
}

/** 슬롯 메타의 올바른 표현으로 되돌린다(어댑터·게이트 공용 진실원). */
export function rebuildComboWithSlots(q: MdComboQuestion) {
  return rebuildComboPassage(q.markedPassage, (label, candidates) => {
    const slot = q.slots.find((s) => s.label === label);
    return slot?.correct ?? candidates[0] ?? "";
  });
}

/**
 * 네모 어법 md 파싱. 드리프트 관용(정본 parseMdBlank·parseMdGrammar 규약):
 * 라벨 표기 흔들림, 포인트코드에 붙는 괄호·한글 설명, 구분자 주변 공백,
 * `선지:` 헤더 누락, 오답 목록에 정답 줄을 끼워 넣는 실측 패턴.
 */
export function parseMdCombo(text: string): MdComboQuestion {
  const markedPassage =
    text.match(/^네모지문:\s*\n([\s\S]*?)(?=^원형·포인트:|^원형:|^선지:)/m)?.[1]?.trim() ?? "";

  const metaSection =
    text.match(/^원형·포인트:\s*\n([\s\S]*?)(?=^선지:|^정답:)/m)?.[1] ??
    text.match(/^원형:\s*\n([\s\S]*?)(?=^선지:|^정답:)/m)?.[1] ??
    "";
  // 코드에 괄호·한글 설명이 붙는 드리프트 실측("(c) 분사")을 정본과 동일하게 흡수.
  const slots: MdComboSlot[] = [];
  for (const m of metaSection.matchAll(
    /^[([]?([A-Ca-c])[)\].]?\s*(.+?)\s*\|\s*(.+?)\s*\|\s*\(?\s*([a-mA-M])\s*\)?(?:\s+[^|]*)?$/gm,
  )) {
    const label = comboParenLabel(m[1]);
    if (!label) continue;
    slots.push({ label, correct: m[2].trim(), wrong: m[3].trim(), code: m[4].toLowerCase() });
  }

  const beforeWrong = text.split(/^오답:/m)[0] ?? text;
  // `선지:` 헤더가 있으면 그 뒤 전부(정답/해설 라인은 원문자로 시작하지 않아 안전),
  // 없으면 메타 섹션 뒤를 훑는다 — 헤더 누락 드리프트 흡수.
  const optionSection =
    beforeWrong.match(/^선지:\s*\n?([\s\S]*)$/m)?.[1] ??
    beforeWrong.split(/^원형·포인트:|^원형:/m)[1] ??
    beforeWrong;
  const options: MdComboOption[] = [
    ...optionSection.matchAll(/^([①②③④⑤])\s*(.+)$/gm),
  ].map((m) => {
    const optionText = m[2].trim();
    return {
      label: m[1],
      text: optionText,
      values: optionText.split(COMBO_VALUE_SPLIT_RE).map((s) => s.trim()).filter(Boolean),
    };
  });

  const answer = text.match(/^정답:\s*([①②③④⑤])/m)?.[1] ?? "";
  const wrongSection = text.split(/^오답:\s*$/m)[1] ?? text.split(/^오답:/m)[1] ?? "";
  // 드리프트 관용: 오답 목록에 정답 줄을 끼워 넣는 실측 — 파서가 걸러낸다.
  // ⚠ 본문이 빈 항목(`⑤ ` 절단)은 **버리지 않는다**. 버리면 게이트가 '절단'을 못 보고,
  //   어댑터까지 조용히 지우면 해설 없는 선지가 무결성 검사를 통과한 것으로 기록된다.
  const wrong = [...wrongSection.matchAll(/^([①②③④⑤])\s*(.+)$/gm)]
    .map((m) => ({ label: m[1], text: m[2].trim() }))
    .filter((w) => w.label !== answer);

  return {
    kind: "combo",
    markedPassage,
    slots,
    options,
    answer,
    explanation:
      // lookahead 를 `오답:` 하나로 두면 섹션 순서 드리프트(해설이 정답보다 앞)에서
      // '정답: ③' 라인을 통째로 흡수해 학생 표면 해설에 정답 번호가 박힌다(실측).
      text.match(
        /^해설:\s*([\s\S]*?)(?=^오답:|^정답:|^선지:|^네모지문:|^원형·포인트:|^원형:)/m,
      )?.[1]?.trim() ??
      text.match(/^해설:\s*([\s\S]+)$/m)?.[1]?.trim() ??
      "",
    wrong,
  };
}

/**
 * 0원 자동 보정. 보수 가드 — 확실할 때만 교정하고 애매하면 게이트가 반려하게 둔다.
 *  S1 메타의 올바른 표현이 마커 왼쪽과 **축자로** 다를 때: 마커로 되돌린 재구성본만
 *     원문과 일치하면 마커를 진실원으로 채택(위치가 이미 지문에 확정돼 있다).
 *     ⚠ 비교는 comboCmp() 가 아니라 리터럴이다 — 표 셀 첫 글자 대문자화 같은
 *     대소문자 전용 드리프트를 cmp 로 보면 "같음"이라 스냅을 건너뛰는데, 게이트 #5
 *     재구성 대조는 대소문자에 민감해 하드 반려한다. 스냅이 흡수해야 할 바로 그
 *     케이스가 사각지대였다(적대검수 26-07-26). markerMatches && !metaMatches 가
 *     안전장치라 "마커가 원문을 정확히 복원할 때"만 손댄다.
 *  S2 메타의 틀린 표현이 마커 오른쪽과 다를 때: 선지 값이 마커 쪽만 지지하면 채택.
 *  S3 선지 값이 후보와 대소문자·공백만 다르면 후보 정본 문자열로 정규화.
 */
export function autoSnapComboSlots(
  q: MdComboQuestion,
  passage: string,
): { question: MdComboQuestion; corrections: string[] } {
  const corrections: string[] = [];
  const marks = new Map(collectComboMarks(q.markedPassage).map((m) => [m.label, m.candidates]));
  const pn = normalizeWs(passage);
  const metaMatches = normalizeWs(rebuildComboWithSlots(q).text) === pn;
  const markerMatches =
    normalizeWs(rebuildComboPassage(q.markedPassage, (_l, c) => c[0] ?? "").text) === pn;
  const optionValueKeys = new Set(q.options.flatMap((o) => o.values.map((v) => comboCmp(v))));

  const slots = q.slots.map((slot) => {
    const candidates = marks.get(slot.label);
    if (!candidates || candidates.length !== 2) return slot;
    let next = slot;
    if (candidates[0] !== slot.correct && markerMatches && !metaMatches) {
      corrections.push(
        `${slot.label} 올바른 표현을 네모지문 마커 축자로 보정 ('${slot.correct}' → '${candidates[0]}')`,
      );
      next = { ...next, correct: candidates[0] };
    }
    if (
      comboCmp(candidates[1]) !== comboCmp(slot.wrong) &&
      optionValueKeys.has(comboCmp(candidates[1])) &&
      !optionValueKeys.has(comboCmp(slot.wrong))
    ) {
      corrections.push(
        `${slot.label} 틀린 표현을 네모지문 마커 축자로 보정 ('${slot.wrong}' → '${candidates[1]}')`,
      );
      next = { ...next, wrong: candidates[1] };
    }
    return next;
  });

  // S3 — 선지 값 표기를 후보 정본으로 정규화(후처리 canonical 화의 선반영).
  let snappedValues = 0;
  const options = q.options.map((option) => {
    if (option.values.length !== slots.length) return option;
    const values = option.values.map((value, i) => {
      const slot = slots[i];
      if (!slot) return value;
      for (const canonical of [slot.correct, slot.wrong]) {
        if (canonical && value !== canonical && comboCmp(value) === comboCmp(canonical)) {
          snappedValues += 1;
          return canonical;
        }
      }
      return value;
    });
    return { ...option, values };
  });
  if (snappedValues > 0) corrections.push(`선지 값 ${snappedValues}개를 후보 정본 표기로 정규화`);

  return { question: { ...q, slots, options }, corrections };
}
