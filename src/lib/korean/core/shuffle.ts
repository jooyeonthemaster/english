// ============================================================================
// KO MC5 정답 위치 결정론 셔플 (KO-DESIGN-SPEC §1 — run-question-generation finalize)
// ============================================================================
// 모델의 정답 번호 편중(③ 몰림)을 서버에서 제거한다. 라벨(①~⑤) 자리는 고정하고
// 선지 "내용"만 재배치하며, correctAnswer·wrongOptionExplanations[].label·
// evidence[].optionLabel·유형 확장 필드의 라벨 키(label|optionLabel ∈ ①~⑤,
// 재귀 순회)와 해설 본문 안의 원문자 지칭까지 동기 재매핑해
// 정답표/해설/검증기 desync 를 막는다(어휘선택 셔플 desync 실측 전례의 교훈).
//
//   - 결정론: Math.random 금지 — 시드 = 선지 텍스트+정답 해시(FNV-1a → mulberry32).
//     같은 후보는 항상 같은 순열 → 재현·테스트 가능, repair 재검증에도 안정.
//   - 마커-선지 1:1 유형(meta.lockedOptionOrder)은 호출자가 제외한다.
//   - 검증(validateKoQuestion) "전에" 적용해야 셔플 결과의 일관성까지 검증된다.
// ============================================================================

import { OPTION_LABELS } from "./markers";

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** FNV-1a 32bit — 시드 파생용 문자열 해시. */
function hashString(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** mulberry32 — 시드 고정 PRNG (결정론 Fisher–Yates 용). */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 문자열 안의 원문자 라벨(①~⑤) 지칭을 순열 맵으로 동시 치환한다. */
function remapCircledLabels(text: string, labelMap: Map<string, string>): string {
  return text.replace(/[①②③④⑤]/g, (ch) => labelMap.get(ch) ?? ch);
}

// 6) 에서 라벨 키 재매핑을 건너뛰는 최상위 필드: options 는 라벨 자리 고정 규약이고,
// wrongOptionExplanations·evidence 는 3)~4) 가 라벨+본문을 함께 처리한다.
const LABEL_KEY_REMAP_SKIP_TOP_FIELDS = new Set([
  "options",
  "wrongOptionExplanations",
  "evidence",
]);

/**
 * 유형 확장 필드의 선지 라벨 키 재매핑(KO-GEN-1) — 값 그래프를 재귀 순회하며
 * key 가 label|optionLabel 이고 값이 ①~⑤ 단일 원문자(labelMap 등재)인 것만
 * 순열 맵으로 치환한다. trapDesign·distortions·wrongOptionDesigns·
 * wrongOptionTraps·distractorPrinciples·optionAnalyses·trapPrinciples 등
 * "배열 원소가 선지 라벨을 키로 갖는" 확장 스키마 전부를 유형 열거 없이 커버한다.
 *   - ㉠·(가)·(A) 등 비원문자 라벨은 labelMap 미등재라 무접촉(예: KO_GR_ELEMENT
 *     의 satisfiedConditions ㉠~㉢, KO_LIT_COMPARE 의 partVerdicts.part).
 *   - 문자열 "내부"의 원문자 지칭(해설류)은 기존 3)~5) 로직만 유지한다.
 *   - 비파괴(새 객체 반환): 셔플 전 초안(normalizedDraft)이 중첩 참조를 공유하므로
 *     제자리 변이는 repair/거절 샘플의 셔플 전 좌표를 오염시킨다.
 */
function remapLabelKeyedValues(
  value: unknown,
  labelMap: Map<string, string>,
): unknown {
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((item) => {
      const remapped = remapLabelKeyedValues(item, labelMap);
      if (remapped !== item) changed = true;
      return remapped;
    });
    return changed ? next : value;
  }
  if (!isRecord(value)) return value;
  let changed = false;
  const next: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (
      (key === "label" || key === "optionLabel") &&
      typeof raw === "string" &&
      labelMap.has(raw)
    ) {
      const remapped = labelMap.get(raw) ?? raw;
      next[key] = remapped;
      if (remapped !== raw) changed = true;
      continue;
    }
    const remapped = remapLabelKeyedValues(raw, labelMap);
    next[key] = remapped;
    if (remapped !== raw) changed = true;
  }
  return changed ? next : value;
}

/**
 * KO 5지선다 선지 내용을 결정론 순열로 재배치한다(제자리 변이).
 * 구조가 규격(라벨 ①~⑤ 정순·정답 라벨 유효)에 안 맞으면 아무것도 하지 않는다 —
 * 그 결함은 뒤따르는 validateKoQuestion(ko-option-count 등)이 차단한다.
 */
export function shuffleKoMc5Options(question: Record<string, unknown>): void {
  const rawOptions = question.options;
  if (!Array.isArray(rawOptions) || rawOptions.length !== 5) return;
  const options: { label: string; text: string }[] = [];
  for (const raw of rawOptions) {
    if (!isRecord(raw) || typeof raw.label !== "string" || typeof raw.text !== "string") {
      return;
    }
    options.push({ label: raw.label, text: raw.text });
  }
  if (options.map((o) => o.label).join("") !== OPTION_LABELS.join("")) return;
  const correctAnswer =
    typeof question.correctAnswer === "string" ? question.correctAnswer : "";
  const correctIndex = (OPTION_LABELS as readonly string[]).indexOf(correctAnswer);
  if (correctIndex < 0) return;

  // 순열 생성: perm[새 자리] = 옛 인덱스. identity 로 나오면 시드 회전으로 회피.
  const seed = hashString(options.map((o) => o.text).join("") + correctAnswer);
  const rand = mulberry32(seed);
  const perm = [0, 1, 2, 3, 4];
  for (let i = perm.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  if (perm.every((oldIndex, newIndex) => oldIndex === newIndex)) {
    const shift = (seed % 4) + 1; // 1~4 회전 — 항상 비-identity
    for (let i = 0; i < 5; i++) perm[i] = (i + shift) % 5;
  }

  // 옛 라벨 → 새 라벨 맵 (동시 치환용).
  const newIndexOfOld = new Array<number>(5);
  for (let newIndex = 0; newIndex < 5; newIndex++) {
    newIndexOfOld[perm[newIndex]] = newIndex;
  }
  const labelMap = new Map<string, string>();
  for (let oldIndex = 0; oldIndex < 5; oldIndex++) {
    labelMap.set(OPTION_LABELS[oldIndex], OPTION_LABELS[newIndexOfOld[oldIndex]]);
  }

  // 1) 선지: 라벨 자리 고정, 내용만 이동.
  question.options = OPTION_LABELS.map((label, newIndex) => ({
    label,
    text: options[perm[newIndex]].text,
  }));

  // 2) 정답 라벨.
  question.correctAnswer = labelMap.get(correctAnswer) ?? correctAnswer;

  // 3) 오답 해설: label 재매핑 + 해설 본문 원문자 지칭 치환.
  if (Array.isArray(question.wrongOptionExplanations)) {
    question.wrongOptionExplanations = question.wrongOptionExplanations.map((raw) => {
      if (!isRecord(raw)) return raw;
      const next: Record<string, unknown> = { ...raw };
      if (typeof next.label === "string") {
        next.label = labelMap.get(next.label) ?? next.label;
      }
      if (typeof next.explanation === "string") {
        next.explanation = remapCircledLabels(next.explanation, labelMap);
      }
      return next;
    });
  } else if (isRecord(question.wrongOptionExplanations)) {
    // 방어(KO-GEN-2): 후처리 정규화가 배열→Record<label,string> 으로 바꾼 값이
    // 들어와도 키·본문을 함께 재매핑한다(순서 무변경). KO 봉투 계약은 배열형이라
    // 정상 경로에선 위 배열 분기만 타지만, 이 함수 단독 사용/과거 데이터를 대비.
    question.wrongOptionExplanations = Object.fromEntries(
      Object.entries(question.wrongOptionExplanations).map(([label, expl]) => [
        labelMap.get(label) ?? label,
        typeof expl === "string" ? remapCircledLabels(expl, labelMap) : expl,
      ]),
    );
  }

  // 4) 근거앵커: optionLabel 재매핑 + note 안의 원문자 지칭 치환.
  if (Array.isArray(question.evidence)) {
    question.evidence = question.evidence.map((raw) => {
      if (!isRecord(raw)) return raw;
      const next: Record<string, unknown> = { ...raw };
      if (typeof next.optionLabel === "string") {
        next.optionLabel = labelMap.get(next.optionLabel) ?? next.optionLabel;
      }
      if (typeof next.note === "string") {
        next.note = remapCircledLabels(next.note, labelMap);
      }
      return next;
    });
  }

  // 5) 해설/학습 포인트 본문의 원문자 지칭 (①~⑤ 만 — ㉠·ⓐ 마커는 무접촉).
  if (typeof question.explanation === "string") {
    question.explanation = remapCircledLabels(question.explanation, labelMap);
  }
  if (Array.isArray(question.keyPoints)) {
    question.keyPoints = question.keyPoints.map((point) =>
      typeof point === "string" ? remapCircledLabels(point, labelMap) : point,
    );
  }

  // 6) 유형 확장 필드의 선지 라벨 키(KO-GEN-1): trapDesign(KO_RD/GR_APPLY)·
  // distortions(KO_LIT_FACT)·wrongOptionDesigns(KO_RD_CRIT)·wrongOptionTraps
  // (KO_LIT_NARR)·distractorPrinciples(KO_RD_STRUCT)·optionAnalyses(KO_LIT_EXPR/
  // KO_LIT_COMPARE)·trapPrinciples(KO_RD_INFER) 등이 셔플 전 라벨 좌표로 남으면,
  // 셔플 "후"에 실행되는 유형 validate() 가 셔플 후 correctAnswer 와 대조해
  // ko-correct-answer-invalid 로 정합 후보를 결정론 반려한다. 유형 열거 대신
  // 재귀 순회 일반화 원칙으로 재매핑한다(위 skip 필드는 1)~4) 가 소관).
  for (const key of Object.keys(question)) {
    if (LABEL_KEY_REMAP_SKIP_TOP_FIELDS.has(key)) continue;
    question[key] = remapLabelKeyedValues(question[key], labelMap);
  }
}
