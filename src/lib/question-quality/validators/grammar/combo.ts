// Split from question-quality.ts — shared helpers in core.ts, public API via index.ts barrel.
import { QuestionQualitySeverity, collectWrongOptionExplanations, containsLoose, containsStandaloneToken, findDuplicate, isRecord, isSingleEnglishToken, isTinyFunctionWord, normalizeComparableText, normalizeLabel, normalizeText } from "../../core";
import { collectQuantityAnswerIssues, findGrammarPerceptionComplementToggle } from "./shared";



/** be/have/do/조동사 — 시제 단독변경 게이트에서 제외(수일치·법조동사 변형은 합법). */
export const TENSE_GATE_EXCLUDED = new Set([
  "is", "are", "was", "were", "be", "been", "being", "am",
  "has", "have", "had", "do", "does", "did",
  "will", "would", "shall", "should", "can", "could", "may", "might", "must",
]);



/** 동사 어간 후보 — 굴절형마다 가능한 원형 후보를 모은다(묵음 e·중복자음·-ies 대응). */
export function verbStemCandidates(w: string): Set<string> {
  const c = new Set<string>([w]);
  if (/ied$/.test(w) && w.length > 3) c.add(`${w.slice(0, -3)}y`);
  if (/ed$/.test(w) && w.length > 3) {
    c.add(w.slice(0, -2)); // walked→walk
    c.add(w.slice(0, -1)); // outpaced→outpace (묵음 e 동사: base+d)
    c.add(w.slice(0, -2).replace(/([bdgklmnprt])\1$/, "$1")); // stopped→stop
  }
  if (/ies$/.test(w) && w.length > 4) c.add(`${w.slice(0, -3)}y`);
  if (/(?:ches|shes|sses|xes|zes|oes)$/.test(w) && w.length > 4) c.add(w.slice(0, -2));
  if (/s$/.test(w) && !/ss$/.test(w) && w.length > 3) {
    c.add(w.slice(0, -1)); // outpaces→outpace, walks→walk
    c.add(w.slice(0, -2)); // -es 흡수
  }
  return c;
}



/**
 * 시제 단독변경 감지 — 같은 동사 어간의 현재(3인칭 -s 또는 원형)↔과거(-ed).
 * 정답 시비를 만드는 비검증 변형(realizes↔realized·outpaces↔outpaced).
 * 수일치(be/have/do)·법조동사는 제외. 불규칙 과거(spend↔spent)는 미커버.
 */
export function isTenseOnlyMutation(expression: string, errorExpression: string): boolean {
  const a = normalizeText(expression).toLowerCase();
  const b = normalizeText(errorExpression).toLowerCase();
  if (!/^[a-z]+$/.test(a) || !/^[a-z]+$/.test(b) || a === b) return false;
  if (TENSE_GATE_EXCLUDED.has(a) || TENSE_GATE_EXCLUDED.has(b)) return false;
  // 한쪽은 과거(-ed), 다른쪽은 비과거(원형 또는 3인칭 -s)여야 시제 변형.
  if (/ed$/.test(a) === /ed$/.test(b)) return false;
  const ca = verbStemCandidates(a);
  const cb = verbStemCandidates(b);
  for (const stem of ca) {
    if (stem.length >= 3 && cb.has(stem)) return true;
  }
  return false;
}



// do-support 시제 토글(do/does ↔ did) — 현재↔과거. do/does/did 는 TENSE_GATE_EXCLUDED
// 라 isTenseOnlyMutation 이 못 잡지만, "Only then did/does he realize" 처럼 시제가
// 문맥상 갈리면 정답 시비다. 수일치(do↔does)는 합법이라 제외 — 과거(did)가 한쪽일 때만.
export const DO_SUPPORT_TENSE_PAIRS = new Set<string>(["did|do", "did|does"]);



/** 시제 시비형 정답 토글 — 규칙동사 현재↔과거(isTenseOnlyMutation) + do-support did↔do/does. */
export function isDisputableTenseToggle(a: string, b: string): boolean {
  if (isTenseOnlyMutation(a, b)) return true;
  const key = [normalizeComparableText(a), normalizeComparableText(b)].sort().join("|");
  return DO_SUPPORT_TENSE_PAIRS.has(key);
}



/** 네모 어법 — 렌더된 "(A) [x / y]" 네모 카운트용. */
export const COMBO_SLOT_RENDER_REGEX = /\([A-C]\)\s*\[[^\[\]]*\/[^\[\]]*\]/g;


export const COMBO_HARD_POINT_CODES = new Set(["b", "c", "i"]);


// that/what 슬롯의 패턴 누설 검출용 — 명사절 that 보문을 취하는 인지·단언 동사.
// 관계절·지시사 that 위양성을 막기 위해 동사를 화이트리스트로 한정한다.
export const COGNITION_VERB_THAT_REGEX =
  /\b(?:acknowledge|acknowledges|acknowledged|acknowledging|know|knows|knew|known|think|thinks|thought|believe|believes|believed|assume|assumes|assumed|realize|realizes|realized|suggest|suggests|suggested|show|shows|showed|shown|find|finds|found|argue|argues|argued|claim|claims|claimed|say|says|said|hope|hopes|hoped|feel|feels|felt|notice|notices|noticed|understand|understands|understood|mean|means|meant|prove|proves|proved|conclude|concludes|concluded|recognize|recognizes|recognized)\s+that\b/i;

const COMPLEMENT_TAKING_VERB_END_REGEX =
  /\b(?:acknowledge|acknowledges|acknowledged|acknowledging|know|knows|knew|known|think|thinks|thought|believe|believes|believed|assume|assumes|assumed|realize|realizes|realized|suggest|suggests|suggested|show|shows|showed|shown|find|finds|found|argue|argues|argued|claim|claims|claimed|say|says|said|hope|hopes|hoped|feel|feels|felt|notice|notices|noticed|understand|understands|understood|mean|means|meant|prove|proves|proved|conclude|concludes|concluded|recognize|recognizes|recognized)\s*$/i;

function mislabelsComplementizerThat(
  candidate: { correct: string; wrong: string; label: string },
  passageWithMarkers: string,
  explanation: string,
): boolean {
  const pair = new Set([
    candidate.correct.toLowerCase(),
    candidate.wrong.toLowerCase(),
  ]);
  if (!pair.has("that") || !pair.has("what") || candidate.correct.toLowerCase() !== "that") {
    return false;
  }
  const markerIndex = passageWithMarkers.indexOf(candidate.label);
  if (markerIndex < 0) return false;
  const before = passageWithMarkers.slice(Math.max(0, markerIndex - 80), markerIndex);
  if (!COMPLEMENT_TAKING_VERB_END_REGEX.test(before)) return false;

  // This frame is V + complementizer that + a complete clause. Calling that a
  // relative pronoun, inventing an antecedent, or claiming the embedded verb is
  // missing its object is a factual explanation error (jul15 Q012).
  return (
    /(?:목적격\s*)?관계대명사\s*(?:인\s*)?['"]?that\b/i.test(explanation) ||
    /\bthat\b(?:은|는|이|가)\s*(?:목적격\s*)?관계대명사/i.test(explanation) ||
    /(?:목적어가|목적어는|목적어\s*)(?:빠져|빠진|생략|결여)/i.test(explanation)
  );
}



/**
 * 네모 어법 검증 — 모델 메타데이터(slots/options)와 렌더된 지문을 각각 세고
 * 상호 대조한다. 세 슬롯 전부가 정답 키를 구성하므로 슬롯/조합 결함은 error
 * (RELAXED 차단 대상), 오답 믹스·포인트 구성은 warning (strict 압력).
 */
// 네모 후보가 비정형(준동사 — 동명사/현재분사 -ing 또는 to-부정사)인가.
// 주격 관계대명사·주어 뒤 정동사 자리에서 이 형태가 나오면 즉답 giveaway(평택 1618 피드백).
// p.p.(수동 시험)는 정오 판별이 모호해 제외하고, 명백한 -ing / to-v 만 잡는다.
export function isNonFiniteComboCandidate(expr: string): boolean {
  const e = normalizeText(expr).toLowerCase();
  if (!e) return false;
  if (/^to\s+[a-z][a-z-]*$/.test(e)) return true; // to 부정사
  if (/^[a-z][a-z-]*ing$/.test(e)) return true; // 단일 토큰 -ing
  return false;
}



export const COMBO_SUBJECT_RELATIVE_PRONOUNS = new Set(["who", "which", "that"]);



export function validateGrammarChoiceComboQuestion(
  question: Record<string, unknown>,
  passage: string | undefined,
  requestedDifficulty: string | undefined,
  add: (severity: QuestionQualitySeverity, code: string, message: string) => void,
) {
  const slots = Array.isArray(question.slots)
    ? question.slots.filter(isRecord)
    : [];
  if (slots.length !== 3) {
    add("error", "combo-slot-count", `Expected exactly 3 combo slots, got ${slots.length}.`);
  }

  const passageWithMarkers = normalizeText(question.passageWithMarkers);
  if (passageWithMarkers) {
    const rendered = passageWithMarkers.match(COMBO_SLOT_RENDER_REGEX) ?? [];
    if (rendered.length !== 3) {
      add("error", "combo-render-slot-count", `Expected 3 rendered combo slots "(A) [x / y]", got ${rendered.length}.`);
    }
  }

  // 해설 잘림 게이트 (wave2: combo-explanation-truncated) — 베이스라인 실측
  // (runIndex 5): 해설이 "… (C) "로 끝나 (C) 슬롯 설명이 통째로 누락된 채 출하.
  // 결정론 규칙: 해설 안 마지막 슬롯 라벨 뒤에 실질 내용(문장부호/공백 제외)이
  // 전혀 없으면 생성이 잘린 것. 중간 라벨의 짧은 연결("(A)와 (B)는 …")은
  // 오탐이라 마지막 라벨의 빈 꼬리만 잡는다(보수 원칙).
  const explanationText = normalizeText(question.explanation);
  const explanationCorpus = [
    explanationText,
    ...(Array.isArray(question.keyPoints)
      ? question.keyPoints.map((value) => normalizeText(value))
      : []),
    ...collectWrongOptionExplanations(question.wrongOptionExplanations).values(),
  ]
    .filter(Boolean)
    .join("\n");
  if (explanationText) {
    const labelMatches = [...explanationText.matchAll(/\(([A-C])\)/g)];
    const lastLabel = labelMatches[labelMatches.length - 1];
    if (lastLabel && lastLabel.index !== undefined) {
      const tail = explanationText
        .slice(lastLabel.index + lastLabel[0].length)
        .replace(/[\s.,;:!?~\-–—'"“”‘’()[\]]/g, "");
      if (tail.length === 0) {
        add(
          "error",
          "combo-explanation-truncated",
          `Explanation ends with slot label ${lastLabel[0]} but no content follows — the ${lastLabel[0]} slot is never explained (truncated generation).`,
        );
      }
    }
  }

  const slotCandidates: Array<{ correct: string; wrong: string; label: string }> = [];
  for (const [slotIndex, slot] of slots.entries()) {
    const correct = normalizeText(slot.correctExpression);
    const wrong = normalizeText(slot.wrongExpression);
    if (!correct || !wrong) {
      add("error", "combo-slot-missing-candidate", `Combo slot ${slotIndex + 1} is missing correctExpression/wrongExpression.`);
      continue;
    }
    slotCandidates.push({
      correct,
      wrong,
      label: normalizeText(slot.label) || `slot ${slotIndex + 1}`,
    });
    if (normalizeComparableText(correct) === normalizeComparableText(wrong)) {
      add("error", "combo-slot-not-mutated", `Combo slot ${slotIndex + 1} candidates are identical: "${correct}".`);
    }
    // 원문 실재 검사 — 지문에 오류가 인쇄된 추출/재현 흐름은 passage 를 넘기지
    // 않으므로 가드 필수 (grammar-error-not-mutated 와 동일 관례).
    if (passage && !containsLoose(passage, correct)) {
      add("error", "combo-correct-not-in-source", `Combo slot correctExpression not found in the passage: "${correct.slice(0, 60)}".`);
    }
    // 수량(m) 정답 시비 게이트 — 네모 후보쌍에도 동일 적용(세 슬롯 전부가 정답 키).
    for (const qIssue of collectQuantityAnswerIssues(
      correct,
      wrong,
      normalizeText(slot.surroundingText),
    )) {
      add("error", qIssue.code, qIssue.message);
    }
    // 시제 시비 게이트 — 네모는 학생이 시제를 능동 판단해 고르므로(밑줄 디코이와 달리)
    // 틀린 시제 후보가 방어 가능하면 즉시 복수정답. 밑줄(정답)과 동일하게 차단한다.
    // (기존엔 네모 경로에 시제 게이트가 없어 무방비였음 — 적대검증 2026-06-23 갭.)
    if (isDisputableTenseToggle(correct, wrong)) {
      add(
        "error",
        "combo-tense-only-error",
        `Combo slot candidates "${correct}" ↔ "${wrong}" are a tense-only/do-support toggle, which is contextually disputable; a box choice must be unambiguously ungrammatical.`,
      );
    }
    // 지각동사 보어 토글 게이트 (wave1) — 틀린 후보가 지각동사 구문/명사+to-V
    // 파스로 정문이 되면 두 후보 모두 옳아 복수정답 시비가 된다(정답 무효급).
    const perceptionToggle = findGrammarPerceptionComplementToggle(
      correct,
      wrong,
      normalizeText(slot.surroundingText),
      passage,
    );
    if (perceptionToggle) {
      add("error", "combo-perception-toggle", perceptionToggle);
    }
  }

  for (const candidate of slotCandidates) {
    if (mislabelsComplementizerThat(candidate, passageWithMarkers, explanationCorpus)) {
      add(
        "error",
        "combo-complementizer-that-mislabel",
        `Combo slot ${candidate.label} uses complementizer that after a clause-taking verb, but the explanation calls it a relative pronoun/antecedent gap. Explain that the following clause is complete and that what would create an extra nominal object.`,
      );
    }
  }

  // 정답 후보 누설 — 네모 밖 지문에 후보와 동일한 내용어 표현이 무마킹으로
  // 남아 있으면 학생이 평행구를 베껴 푼다 (실측: 'composed of' 평행구 5/8).
  // wrong 후보의 잔존도 같은 코드로 잡는다 — 오답형이 지문 다른 곳에서 합법
  // 표현으로 등장하면 "둘 다 가능" 시비의 신호다.
  // 기능어 후보(that/be 등)는 단독 잔존이 불가피해 면제하되, 직전 단어까지
  // 같은 연어("know that"·"assume that")가 잔존하면 실질 누설로 잡는다
  // (실측 라운드2: 기능어 연어 평행 3/8).
  if (passageWithMarkers) {
    const outsideSlots = passageWithMarkers.replace(COMBO_SLOT_RENDER_REGEX, " ");
    const isLeakTarget = (expr: string) =>
      expr.length >= 4 &&
      !isTinyFunctionWord(expr) &&
      !/^(that|what|which|this|these|those|than|then|when|where|while|there|their|they|them|have|has|had|will|would|could|should|must|does|did|not|with|from|into|been|being)$/i.test(expr);
    const appearsOutside = (expr: string) =>
      isSingleEnglishToken(expr)
        ? containsStandaloneToken(outsideSlots, expr)
        : containsLoose(outsideSlots, expr);
    const precedingWordByLabel = new Map<string, string>();
    for (const match of passageWithMarkers.matchAll(/([A-Za-z][A-Za-z'-]*)\s*\(([A-C])\)\s*\[/g)) {
      precedingWordByLabel.set(`(${match[2]})`, match[1]);
    }
    for (const candidate of slotCandidates) {
      if (isLeakTarget(candidate.correct) && appearsOutside(candidate.correct)) {
        add("error", "combo-candidate-visible-elsewhere", `Combo slot ${candidate.label} correct candidate "${candidate.correct}" also appears unmarked elsewhere in the passage (answer leak).`);
        continue;
      }
      if (isLeakTarget(candidate.wrong) && appearsOutside(candidate.wrong)) {
        add("error", "combo-candidate-visible-elsewhere", `Combo slot ${candidate.label} wrong candidate "${candidate.wrong}" appears as legitimate text elsewhere in the passage (dispute risk).`);
        continue;
      }
      const preceding = precedingWordByLabel.get(candidate.label);
      if (preceding && appearsOutside(`${preceding} ${candidate.correct}`)) {
        add("error", "combo-candidate-visible-elsewhere", `Combo slot ${candidate.label} collocation "${preceding} ${candidate.correct}" also appears unmarked elsewhere in the passage (answer leak).`);
        continue;
      }
      // that/what 슬롯 전용 패턴 누설: 슬롯 동사와 누설 동사가 달라도(know vs
      // assume) "인지·단언 동사 + that + 완전절" 패턴이 네모 밖에 남아 있으면
      // 학생이 그 패턴을 (A)에 전이한다 (실측 R3: 'assume that' 평행 2/8).
      // 인지동사 화이트리스트로 한정해 관계절·지시사 that 위양성을 배제한다.
      const pair = new Set([
        candidate.correct.toLowerCase(),
        candidate.wrong.toLowerCase(),
      ]);
      if (pair.has("that") && pair.has("what") && COGNITION_VERB_THAT_REGEX.test(outsideSlots)) {
        add("error", "combo-candidate-visible-elsewhere", `Combo slot ${candidate.label} (that/what) is modeled by an unmarked "동사 + that + clause" elsewhere in the passage (pattern leak).`);
      }
    }

    // 주격 관계대명사(who/which/that) 바로 뒤 동사 자리에 준동사(-ing/to-v) 후보가 있으면
    // 그 자리는 정동사가 필수라 준동사가 즉답 giveaway다. 그 자리는 수일치(정동사 vs 정동사)
    // 로 출제돼야 한다(평택 1618 피드백). error 로 잡아 교정 재생성을 유도한다.
    for (const candidate of slotCandidates) {
      const preceding = (precedingWordByLabel.get(candidate.label) || "").toLowerCase();
      if (
        COMBO_SUBJECT_RELATIVE_PRONOUNS.has(preceding) &&
        (isNonFiniteComboCandidate(candidate.correct) ||
          isNonFiniteComboCandidate(candidate.wrong))
      ) {
        add(
          "error",
          "combo-relative-clause-nonfinite",
          `Combo slot ${candidate.label} sits right after the subject relative pronoun "${preceding}" but offers a non-finite candidate ([${candidate.correct} / ${candidate.wrong}]). That position requires a finite verb, so the non-finite form is a giveaway — test subject-verb agreement (수일치: finite vs finite, e.g. wears/wear) instead.`,
        );
      }
    }
  }

  const pointCodes = slots
    .map((slot) => normalizeText(slot.pointCode).toLowerCase())
    .filter(Boolean);
  if (pointCodes.length === slots.length && new Set(pointCodes).size < pointCodes.length) {
    add("warning", "combo-duplicate-point-code", `Combo slots repeat a pointCode: ${pointCodes.join(", ")}.`);
  }

  // 조합 선지 검증 — slotValues 가 각 슬롯의 두 후보 중 하나인지, 전부-옳은
  // 조합이 유일하고 correctAnswer 와 일치하는지.
  const options = Array.isArray(question.options)
    ? question.options.filter(isRecord)
    : [];
  if (slotCandidates.length !== 3 || options.length !== 5) return;

  const comboKeys: string[] = [];
  const wrongnessCounts: number[] = [];
  const wrongCandidateUsed = [false, false, false];
  let valuesValid = true;
  for (const [optionIndex, option] of options.entries()) {
    const values = Array.isArray(option.slotValues)
      ? option.slotValues.map((value) => normalizeText(value))
      : [];
    if (values.length !== 3 || values.some((value) => !value)) {
      add("error", "combo-option-value-mismatch", `Combo option ${optionIndex + 1} must provide 3 slotValues.`);
      valuesValid = false;
      continue;
    }
    let wrongness = 0;
    for (const [slotIndex, value] of values.entries()) {
      const candidate = slotCandidates[slotIndex];
      const comparable = normalizeComparableText(value);
      if (comparable === normalizeComparableText(candidate.wrong)) {
        wrongness += 1;
        wrongCandidateUsed[slotIndex] = true;
      } else if (comparable !== normalizeComparableText(candidate.correct)) {
        add("error", "combo-option-value-mismatch", `Combo option ${optionIndex + 1} value "${value}" matches neither candidate of slot ${slotIndex + 1}.`);
        valuesValid = false;
      }
    }
    comboKeys.push(values.map((value) => normalizeComparableText(value)).join("|"));
    wrongnessCounts.push(wrongness);
  }
  if (!valuesValid) return;

  const duplicateCombo = findDuplicate(comboKeys);
  if (duplicateCombo) {
    add("error", "combo-duplicate-option", "Combo options repeat the same slotValues combination.");
  }

  const allCorrectIndices = wrongnessCounts
    .map((wrongness, index) => ({ wrongness, index }))
    .filter((entry) => entry.wrongness === 0)
    .map((entry) => entry.index);
  const correctLabel = normalizeLabel(question.correctAnswer);
  if (allCorrectIndices.length !== 1) {
    add("error", "combo-answer-combo-mismatch", `Expected exactly 1 all-correct combo option, got ${allCorrectIndices.length}.`);
  } else {
    const answerOptionLabel = normalizeLabel(options[allCorrectIndices[0]].label);
    if (answerOptionLabel !== correctLabel) {
      add("error", "combo-answer-combo-mismatch", `correctAnswer "${normalizeText(question.correctAnswer)}" does not point at the all-correct combination.`);
    }
  }

  if (!wrongCandidateUsed.every(Boolean)) {
    add("warning", "combo-wrong-candidate-unused", "Some slot's wrongExpression never appears in any wrong option.");
  }
  if (!wrongnessCounts.some((wrongness) => wrongness === 1)) {
    add("warning", "combo-missing-single-slot-trap", "No option is wrong in exactly one slot; include at least one near-miss option.");
  }

  if (requestedDifficulty === "KILLER") {
    const multiSlotTraps = wrongnessCounts.filter((wrongness) => wrongness >= 2).length;
    if (multiSlotTraps < 2) {
      add("warning", "combo-killer-trap-mix", `KILLER combo should include at least 2 options wrong in two or more slots, got ${multiSlotTraps}.`);
    }
    const hardPoints = pointCodes.filter((code) => COMBO_HARD_POINT_CODES.has(code)).length;
    if (pointCodes.length === 3 && hardPoints < 2) {
      add("warning", "combo-killer-point-mix", `KILLER combo should test hard points (b/c/i) on at least 2 slots, got ${hardPoints}.`);
    }
  }
}
