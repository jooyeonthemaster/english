// ============================================================================
// 네모 어법(GRAMMAR_CHOICE_COMBO) 0원 결정형 게이트 — LLM 콜 없음, 정규식·문자열
// 비교만. parser-combo.ts 에서 분리했다(스펙의 "400줄에서 분할 검토" 조항).
// 견본: parser-antonym.ts 의 gateMdAntonym / 계약: recon-synthesis §3-B B-5
//
// ⚠ 이 게이트가 md 레인의 **유일한** 차단 장치다. 라우트는 후처리 뒤
//   validateQuestionQuality 를 돌리지만 error 코드를 잡 result 에 기록만 하고
//   차단하지 않는다(md-stream/route.ts:1073-1092 → :1147-1149). 그래서 fast
//   검증기가 error 로 막는 항목은 **전량** 여기로 승격 이식해야 한다:
//     ① 시제 시비(combo-tense-only-error)
//     ② 후보 누설 3분기(combo-candidate-visible-elsewhere — 단일·연어·that/what)
//     ③ 정동사 자리 준동사(combo-relative-clause-nonfinite)
//     ④ 수량 시비(grammar-quantity-* · 적대검수 26-07-26 에서 누락 실증)
//     ⑤ 지각·사역동사 보어 토글(combo-perception-toggle · 같은 검수에서 누락 실증)
//     ⑥ 보문 that 오라벨(combo-complementizer-that-mislabel · 재검증 26-07-26
//        독립 프로브에서 누락 실증 — 이 주석이 "전량 이식"을 선언하는데 정작
//        빠져 있어 주석 자체가 거짓이었다)
//   프롬프트에 금지 문구가 있어도 그건 게이트가 아니다 — 모델이 어기면 통과한다.
// ============================================================================

import { normalizeWs } from "./parser";
import {
  COMBO_CIRCLED,
  COMBO_LABEL_KEYS,
  collectComboMarks,
  comboCmp as cmp,
  rebuildComboWithSlots,
  type MdComboQuestion,
  type MdComboSlot,
} from "./parser-combo";
import {
  containsLoose,
  containsStandaloneToken,
  isSingleEnglishToken,
  isTinyFunctionWord,
} from "@/lib/question-quality/core";
import {
  COGNITION_VERB_THAT_REGEX,
  COMBO_SUBJECT_RELATIVE_PRONOUNS,
  isDisputableTenseToggle,
  isNonFiniteComboCandidate,
} from "@/lib/question-quality/validators/grammar/combo";
import {
  collectQuantityAnswerIssues,
  findGrammarPerceptionComplementToggle,
} from "@/lib/question-quality/validators/grammar/shared";

/** 후보·구분자를 무너뜨리는 문자 — 후처리(:139-147)의 '/'·'['·']' 금지에 md 축 2종을 더한다. */
const COMBO_FORBIDDEN_CANDIDATE_CHARS = /[/[\]|…]/;

/** 누설 검사 면제 기능어 — fast validators/grammar/combo.ts:267 목록과 동일. */
const COMBO_LEAK_EXEMPT_RE =
  /^(that|what|which|this|these|those|than|then|when|where|while|there|their|they|them|have|has|had|will|would|could|should|must|does|did|not|with|from|into|been|being)$/i;

/** 수량 시비 코드 → 한국어 반려 사유(재생성 프롬프트에 그대로 실린다). */
const COMBO_QUANTITY_REASON: Record<string, string> = {
  "grammar-quantity-meaning-toggle": "둘 다 정문이고 의미만 다른 수량 토글",
  "grammar-quantity-debatable": "규범 대 실사용이 갈리는 논쟁쌍이거나 진짜 비교급 수식 자리가 아님",
  "grammar-quantity-ambiguous-noun": "가산·불가산 양용 명사 앞이라 가산성 강제가 깨짐",
};

type ComboSpan = { index: number; length: number };

/** 네모 직전 영문 단어 — 연어 누설 검사와 주격 관계대명사 검사가 공유한다. */
function precedingWordOf(clean: string, index: number): string {
  return clean.slice(0, index).match(/([A-Za-z][A-Za-z'-]*)\s*$/)?.[1] ?? "";
}

/** 슬롯 주변 창 — fast 의 slot.surroundingText 와 같은 축(수량·지각동사 게이트 입력). */
function slotWindow(clean: string, span: ComboSpan): string {
  return clean.slice(
    Math.max(0, span.index - 60),
    Math.min(clean.length, span.index + span.length + 60),
  );
}

/**
 * 정답 자리 밖(네모 스팬 제외)에 후보가 다시 노출되는지 — fast 의 error
 * `combo-candidate-visible-elsewhere`(validators/grammar/combo.ts:262-301) **3분기**
 * 이식. 평행구가 남아 있으면 학생이 그걸 베껴 풀기 때문에 문항이 죽는다.
 *  ① 단일 후보 잔존 ② 직전 단어까지 묶은 연어 잔존 ③ that/what 슬롯의 패턴 잔존.
 * ②③ 없이 ① 만 이식하면 면제 기능어 목록이 곧 누설 통로가 된다 — that/what 슬롯은
 * ① 을 통째로 빠져나가 어떤 누설 검사도 받지 않는다(적대검수 26-07-26 실증).
 */
function comboLeakIssues(
  slots: MdComboSlot[],
  clean: string,
  spans: Map<string, ComboSpan>,
): string[] {
  const issues: string[] = [];
  const entries = slots
    .map((slot) => ({ slot, span: spans.get(slot.label) }))
    .filter((e): e is { slot: MdComboSlot; span: ComboSpan } => Boolean(e.span));
  let outside = clean;
  for (const { span } of [...entries].sort((a, b) => b.span.index - a.span.index)) {
    outside = `${outside.slice(0, span.index)} ${outside.slice(span.index + span.length)}`;
  }
  const isLeakTarget = (x: string) =>
    x.length >= 4 && !isTinyFunctionWord(x) && !COMBO_LEAK_EXEMPT_RE.test(x);
  const appearsOutside = (x: string) =>
    isSingleEnglishToken(x) ? containsStandaloneToken(outside, x) : containsLoose(outside, x);
  for (const { slot, span } of entries) {
    if (isLeakTarget(slot.correct) && appearsOutside(slot.correct)) {
      issues.push(`${slot.label} 올바른 후보 '${slot.correct}' 가 네모 밖 지문에 그대로 남아 있음(정답 누설)`);
      continue;
    }
    if (isLeakTarget(slot.wrong) && appearsOutside(slot.wrong)) {
      issues.push(`${slot.label} 틀린 후보 '${slot.wrong}' 가 네모 밖 지문에 합법 표현으로 등장(정답 시비 위험)`);
      continue;
    }
    // ② 연어 누설(fast :286-289) — 면제 기능어를 구제하는 유일한 통로다.
    const preceding = precedingWordOf(clean, span.index);
    if (preceding && appearsOutside(`${preceding} ${slot.correct}`)) {
      issues.push(`${slot.label} 연어 '${preceding} ${slot.correct}' 가 네모 밖 지문에 그대로 남아 있음(정답 누설)`);
      continue;
    }
    // ③ that/what 패턴 누설(fast :294-300) — 슬롯 동사와 다른 동사여도(know vs
    //    assume) "인지·단언 동사 + that + 완전절" 이 밖에 남으면 학생이 전이한다.
    const pair = new Set([slot.correct.toLowerCase(), slot.wrong.toLowerCase()]);
    if (pair.has("that") && pair.has("what") && COGNITION_VERB_THAT_REGEX.test(outside)) {
      issues.push(`${slot.label} that·what 판단의 근거 패턴('인지 동사 + that + 완전절')이 네모 밖에 무마킹으로 남아 있음(패턴 누설)`);
    }
  }
  return issues;
}

/**
 * 명사절 보문 that 을 취하는 인지·단언 동사가 **네모 직전**에서 끝나는가.
 * fast 의 COMPLEMENT_TAKING_VERB_END_REGEX(validators/grammar/combo.ts:86)와
 * 동일한 동사 목록인데 그 상수는 export 되지 않는다(question-quality/** 는 읽기
 * 전용이라 승격도 불가). 목록을 통째로 베끼면 fast 가 동사를 늘렸을 때 이쪽만
 * 낡으므로, export 된 COGNITION_VERB_THAT_REGEX 의 소스에서 꼬리 `\s+that\b` 만
 * `\s*$` 로 갈아 끼워 **동사 목록을 한 곳에서만 관리**한다.
 * (fast 의 정규식 모양이 바뀌면 파생이 무성해지지만, 그 회귀는 픽스처
 *  "게이트 #12b 보문 that 오라벨 반려"가 즉시 잡는다.)
 */
const COMPLEMENT_VERB_END_RE = new RegExp(
  `${COGNITION_VERB_THAT_REGEX.source.replace(/\\s\+that\\b\s*$/, "")}\\s*$`,
  "i",
);

/** 보문소 that 을 관계대명사·목적어 결여로 설명하는 오라벨 표현(fast :110-112 동형). */
const COMPLEMENTIZER_MISLABEL_RES = [
  /(?:목적격\s*)?관계대명사\s*(?:인\s*)?['"]?that\b/i,
  /\bthat\b(?:은|는|이|가)\s*(?:목적격\s*)?관계대명사/i,
  /(?:목적어가|목적어는|목적어\s*)(?:빠져|빠진|생략|결여)/i,
];

/**
 * 보문 that 오라벨 — fast error `combo-complementizer-that-mislabel`
 * (validators/grammar/combo.ts:89-114 · :245-253) 이식.
 * 네모 직전이 인지·단언 동사이고 정답이 that 이면 그 that 은 **명사절 보문소**다.
 * 해설이 그것을 "목적격 관계대명사"라 부르거나 "목적어가 빠졌다"고 쓰면 사실관계
 * 오류이고, 그 설명을 그대로 믿은 학생은 what 도 된다고 배운다(jul15 Q012 실사고).
 * 말뭉치는 해설 + 오답해설이다 — fast 는 keyPoints 도 훑지만 md 어댑터는
 * keyPoints 를 합성하지 않으므로(adapter-combo.ts:117 항상 빈 배열) 대응물이 없다.
 */
function comboComplementizerMislabel(
  slot: MdComboSlot,
  clean: string,
  span: ComboSpan,
  corpus: string,
): boolean {
  const pair = new Set([cmp(slot.correct), cmp(slot.wrong)]);
  if (!pair.has("that") || !pair.has("what") || cmp(slot.correct) !== "that") return false;
  if (!COMPLEMENT_VERB_END_RE.test(clean.slice(Math.max(0, span.index - 80), span.index))) {
    return false;
  }
  return COMPLEMENTIZER_MISLABEL_RES.some((re) => re.test(corpus));
}

/** 해설이 마지막 슬롯 라벨만 적고 내용 없이 끊긴 절단 출력(fast: combo-explanation-truncated). */
function comboExplanationTruncated(explanation: string): boolean {
  const labels = [...explanation.matchAll(/\(([A-C])\)/g)];
  const last = labels[labels.length - 1];
  if (!last || last.index === undefined) return false;
  return (
    explanation
      .slice(last.index + last[0].length)
      .replace(/[\s.,;:!?~\-–—'"“”‘’()[\]]/g, "").length === 0
  );
}

/**
 * 슬롯 단위 검사(#6 변형 · #7 금지문자 · #8 코드 · #9 시제·수량·지각동사 시비).
 * context/clean 은 재구성이 정합할 때만 채워진다(fast 의 slot.surroundingText 자리).
 * 비면 문맥 의존 두 게이트를 건너뛴다 — 재구성 불일치는 #5 가 이미 하드 반려하므로
 * 손실이 없고, 빈 문맥을 넘기면 quantityCountabilityUnsafe 의 "문맥 없음 = 보수적
 * 차단" 규칙이 정상 쌍까지 전건 반려해 과잉 재생성을 부른다.
 */
function comboSlotIssues(slot: MdComboSlot, context = "", clean = ""): string[] {
  const v: string[] = [];
  if (!slot.correct || !slot.wrong) return [`${slot.label} 후보 누락(올바른 표현·틀린 표현 필수)`];
  if (cmp(slot.correct) === cmp(slot.wrong)) {
    v.push(`${slot.label} 두 후보가 동일 — 변형되지 않음: '${slot.correct}'`);
  }
  for (const [name, value] of [["올바른 표현", slot.correct], ["틀린 표현", slot.wrong]] as const) {
    if (COMBO_FORBIDDEN_CANDIDATE_CHARS.test(value)) {
      v.push(`${slot.label} ${name}에 금지 문자(/ [ ] | …) 포함: '${value.slice(0, 40)}'`);
    }
  }
  if (!slot.code || !/^[a-m]$/.test(slot.code)) {
    v.push(`${slot.label} 포인트코드 누락 또는 범위 밖: '${slot.code || "없음"}'`);
  }
  // 네모는 학생이 시제를 능동 판단해 고르므로, 시제 단독 토글은 곧 복수정답이다.
  if (isDisputableTenseToggle(slot.correct, slot.wrong)) {
    v.push(`${slot.label} 후보쌍 '${slot.correct}' ↔ '${slot.wrong}' 가 시제 단독 교체 — 문맥상 둘 다 가능해 정답 시비`);
  }
  if (!context) return v;
  // 아래 둘은 fast validators/grammar/combo.ts:214-242 에서 error 인데 md 에 대응물이
  // 없었다. few↔a few·less↔fewer 는 둘 다 방어 가능해 곧장 복수정답 이의신청이 된다.
  for (const issue of collectQuantityAnswerIssues(slot.correct, slot.wrong, context)) {
    v.push(
      `${slot.label} 수량 후보쌍 '${slot.correct}' ↔ '${slot.wrong}' 정답 금지 — ${COMBO_QUANTITY_REASON[issue.code] ?? "정답 시비"}(복수정답)`,
    );
  }
  if (findGrammarPerceptionComplementToggle(slot.correct, slot.wrong, context, clean)) {
    v.push(`${slot.label} 후보쌍 '${slot.correct}' ↔ '${slot.wrong}' 가 지각·사역동사 보어 자리 — 틀린 후보도 다른 파스로 정문이라 정답이 둘`);
  }
  return v;
}

/** 조합 선지 검사(#14~#17) — 값 정합·중복·정답 조합 유일성·near-miss·wrong 커버리지. */
function comboOptionIssues(q: MdComboQuestion, slotCount: number, optionCount: number): string[] {
  const v: string[] = [];
  const comboKeys: string[] = [];
  const wrongnessCounts: number[] = [];
  const wrongUsed = q.slots.map(() => false);
  let valuesValid = q.options.length === optionCount;
  for (const option of q.options) {
    if (option.values.length !== slotCount || option.values.some((x) => !x)) {
      v.push(`선지 ${option.label} 값 ${option.values.length}개 — 네모 ${slotCount}개와 불일치하거나 빈 값 포함(구분자는 " …… ")`);
      valuesValid = false;
      continue;
    }
    let wrongness = 0;
    let ok = true;
    option.values.forEach((value, i) => {
      const slot = q.slots[i];
      if (!slot) return;
      if (cmp(value) === cmp(slot.wrong)) {
        wrongness += 1;
        wrongUsed[i] = true;
      } else if (cmp(value) !== cmp(slot.correct)) {
        v.push(`선지 ${option.label} 의 ${slot.label} 값 '${value}' 이 두 후보 중 어느 쪽과도 다름`);
        ok = false;
      }
    });
    if (!ok) {
      valuesValid = false;
      continue;
    }
    comboKeys.push(option.values.map((x) => cmp(x)).join("|"));
    wrongnessCounts.push(wrongness);
  }
  if (!valuesValid || comboKeys.length !== optionCount) return v;

  if (new Set(comboKeys).size !== comboKeys.length) v.push("선지에 동일한 조합이 중복됨");
  const allCorrect = wrongnessCounts.map((w, i) => ({ w, i })).filter((e) => e.w === 0).map((e) => e.i);
  if (allCorrect.length !== 1) {
    v.push(`세 네모 전부 올바른 조합이 ${allCorrect.length}개 (정확히 1개 필요)`);
  } else if (!q.answer) {
    v.push("정답 누락");
  } else if (q.options[allCorrect[0]].label !== q.answer) {
    v.push(`정답 라벨(${q.answer})이 전부-올바른 조합(${q.options[allCorrect[0]].label})을 가리키지 않음`);
  }
  if (!wrongnessCounts.some((w) => w === 1)) {
    v.push("한 네모만 틀린 near-miss 선지가 없음 (최소 1개 필요)");
  }
  wrongUsed.forEach((used, i) => {
    if (!used) {
      v.push(`${q.slots[i]?.label ?? `(${COMBO_LABEL_KEYS[i]})`} 의 틀린 후보가 오답 선지에 한 번도 등장하지 않음`);
    }
  });
  return v;
}

/**
 * 오답해설 검사(#18) — 계약은 개수가 아니라 **라벨 집합**이다.
 * 라벨이 중복되면 question-wrong-option-explanations.ts:37 의 Record 정규화가
 * 뒤엣것으로 덮어써 해설 하나가 소실되고 한 선지는 해설이 통째로 빈다. 개수만
 * 세면 '중복 1 + 누락 1'이 서로 상쇄돼 보이지 않는다(적대검수 26-07-26 실증).
 * 같은 정규화가 빈 본문도 조용히 버리므로 절단 항목도 여기서 반려한다.
 */
function comboWrongExplanationIssues(q: MdComboQuestion, optionCount: number): string[] {
  const v: string[] = [];
  const labels = q.wrong.map((w) => w.label);
  if (labels.length !== optionCount - 1) {
    v.push(`오답해설 ${labels.length}개 (${optionCount - 1}개 필요)`);
  }
  if (new Set(labels).size !== labels.length) {
    v.push(`오답해설 라벨 중복 — ${labels.join("")} (선지마다 정확히 하나)`);
  }
  if (q.wrong.some((w) => !w.text.trim())) {
    v.push("오답해설 본문 없음 — 라벨만 찍고 내용이 비었음(생성 절단)");
  }
  if (q.answer && q.options.length === optionCount) {
    const missing = q.options
      .map((o) => o.label)
      .filter((l) => l !== q.answer && !labels.includes(l));
    if (missing.length > 0) {
      v.push(`오답해설 없는 선지 ${missing.join("")} — 정답 제외 선지 전부에 해설이 있어야 함`);
    }
  }
  return v;
}

/** 0원 결정형 게이트 — 빈 배열이면 클린. */
export function gateMdCombo(
  q: MdComboQuestion,
  passage: string,
  options?: { slotCount?: number; optionCount?: number; requireWrong?: boolean },
): string[] {
  const slotCount = options?.slotCount ?? 3;
  const optionCount = options?.optionCount ?? 5;
  const requireWrong = options?.requireWrong !== false;
  const v: string[] = [];

  // #1 개수 — 어긋나면 이후 검사가 전부 무의미하므로 즉시 반려.
  if (!q.markedPassage) return ["네모지문 누락"];
  const marks = collectComboMarks(q.markedPassage);
  if (marks.length !== slotCount) return [`네모 마커 ${marks.length}개 (${slotCount}개 필요)`];
  if (q.slots.length !== slotCount) {
    return [`원형·포인트 항목 ${q.slots.length}개 (${slotCount}개 필요)`];
  }

  // #2 라벨 축 — 마커·메타 모두 지문 등장순 (A)(B)(C).
  const expected = COMBO_LABEL_KEYS.slice(0, slotCount).split("").map((k) => `(${k})`);
  if (marks.map((m) => m.label).join("") !== expected.join("")) {
    v.push(`네모 라벨이 지문 등장순 ${expected.join("")} 이 아님 — 실제 ${marks.map((m) => m.label).join("") || "없음"}`);
  }
  if (q.slots.map((s) => s.label).join("") !== expected.join("")) {
    v.push(`원형·포인트 라벨 순서 오류 — ${expected.join("")} 필요`);
  }

  // #3 각 네모 후보 정확히 2개 · #4 마커와 메타 축자 일치
  const markByLabel = new Map(marks.map((m) => [m.label, m.candidates]));
  for (const slot of q.slots) {
    const candidates = markByLabel.get(slot.label);
    if (!candidates) {
      v.push(`${slot.label} 네모 마커가 지문에 없음`);
      continue;
    }
    if (candidates.length !== 2 || candidates.some((c) => !c)) {
      v.push(`${slot.label} 네모 후보 ${candidates.length}개 — '올바름|틀림' 두 개여야 함`);
      continue;
    }
    if (cmp(candidates[0]) !== cmp(slot.correct)) {
      v.push(`${slot.label} 올바른 표현이 마커 왼쪽과 불일치 ('${slot.correct}' vs '${candidates[0]}')`);
    }
    if (cmp(candidates[1]) !== cmp(slot.wrong)) {
      v.push(`${slot.label} 틀린 표현이 마커 오른쪽과 불일치 ('${slot.wrong}' vs '${candidates[1]}')`);
    }
  }

  // #5 지문 재구성 대조 ★ — 마커를 올바른 표현으로 되돌리면 원문과 완전히 같아야 한다.
  const rebuilt = rebuildComboWithSlots(q);
  const reconstructionOk = normalizeWs(rebuilt.text) === normalizeWs(passage);
  if (!reconstructionOk) {
    v.push("지문 재구성 불일치 — 마커 밖 텍스트가 원문과 다르거나 올바른 표현이 원문 축자가 아님");
  }

  // #6~#9 슬롯 단위 — 재구성이 정합하면 문맥 의존 게이트(수량·지각동사)까지 태운다.
  for (const slot of q.slots) {
    const span = reconstructionOk ? rebuilt.spans.get(slot.label) : undefined;
    v.push(...comboSlotIssues(slot, span ? slotWindow(rebuilt.text, span) : "", rebuilt.text));
  }

  // #10 포인트 코드 3개 서로 다름 (fast 는 warning · md 는 error 승격)
  const codes = q.slots.map((s) => s.code).filter(Boolean);
  if (codes.length === q.slots.length && new Set(codes).size !== codes.length) {
    v.push(`포인트코드 중복 — ${codes.join(", ")} (세 네모 모두 달라야 함)`);
  }

  // #11 누설 · #12 주격 관계대명사 직후 준동사 후보 금지 · #12b 보문 that 오라벨
  // (전부 재구성 정합일 때만 유효 — 좌표가 원문 축과 같아야 판정이 성립한다)
  if (reconstructionOk) {
    v.push(...comboLeakIssues(q.slots, rebuilt.text, rebuilt.spans));
    // fast 의 explanationCorpus(:167-175) 대응물. 오답해설에만 오라벨이 실린
    // 출력도 잡아야 하므로 해설과 함께 한 말뭉치로 합친다.
    const explanationCorpus = [q.explanation, ...q.wrong.map((w) => w.text)]
      .filter(Boolean)
      .join("\n");
    for (const slot of q.slots) {
      const span = rebuilt.spans.get(slot.label);
      if (!span) continue;
      const prev = precedingWordOf(rebuilt.text, span.index).toLowerCase();
      if (
        COMBO_SUBJECT_RELATIVE_PRONOUNS.has(prev) &&
        (isNonFiniteComboCandidate(slot.correct) || isNonFiniteComboCandidate(slot.wrong))
      ) {
        v.push(`${slot.label} 가 주격 관계대명사 '${prev}' 직후인데 준동사 후보를 제시 — 그 자리는 정동사 강제라 즉답 giveaway (수일치로 출제할 것)`);
      }
      if (comboComplementizerMislabel(slot, rebuilt.text, span, explanationCorpus)) {
        v.push(`${slot.label} 의 that 은 인지·단언 동사 뒤 명사절 보문소인데 해설이 관계대명사·목적어 결여로 설명 — 사실관계 오류다. 뒤 절이 완전하다는 점과 what 을 넣으면 잉여 명사구가 생긴다는 점으로 다시 써라`);
      }
    }
  }

  // #13 선지 형상
  if (q.options.length !== optionCount) v.push(`선지 ${q.options.length}개 (${optionCount}개 필요)`);
  const expectedCircled = COMBO_CIRCLED.slice(0, optionCount).split("");
  if (
    q.options.length === optionCount &&
    q.options.map((o) => o.label).join("") !== expectedCircled.join("")
  ) {
    v.push(`선지 라벨이 ${expectedCircled.join("")} 순서가 아님`);
  }

  // #14~#17 조합 선지
  v.push(...comboOptionIssues(q, slotCount, optionCount));
  if (!q.answer) {
    if (!v.includes("정답 누락")) v.push("정답 누락");
  } else if (!q.options.some((o) => o.label === q.answer)) {
    v.push("정답 라벨이 선지에 없음");
  }

  // #18 해설·오답해설
  if (!q.explanation) {
    v.push("해설 누락");
  } else {
    if (comboExplanationTruncated(q.explanation)) {
      v.push("해설이 슬롯 라벨에서 끊김 — 마지막 네모 설명이 통째로 누락(생성 절단)");
    }
    // 파서 lookahead 를 넓혀 흡수를 막았고, 여기서 회귀를 0원 문자열 검사로 봉인한다.
    if (/(?:^|\n)\s*정답\s*[:：]/.test(q.explanation)) {
      v.push("해설에 '정답:' 라인이 섞임 — 학생 표면에 정답 번호가 노출됨(섹션 순서 드리프트)");
    }
  }
  if (requireWrong) v.push(...comboWrongExplanationIssues(q, optionCount));
  if (q.answer && q.wrong.some((w) => w.label === q.answer)) v.push("오답해설에 정답 라벨 포함");

  return v;
}
