// Split from question-quality.ts — shared helpers in core.ts, public API via index.ts barrel.
import { QuestionQualitySeverity, containsHangul, containsLatinLetter, countLiteral, isRecord, normalizeComparableText, normalizeLabel, normalizeText } from "../../core";
import { validateKillerSummaryTrapStrength } from "./killer-trap";



export function validateSummaryCompleteMcQuestion(
  question: Record<string, unknown>,
  requestedDifficulty: string | undefined,
  add: (severity: QuestionQualitySeverity, code: string, message: string) => void,
) {
  const direction = normalizeText(question.direction);
  const summary = normalizeText(question.summaryWithBlanks);
  const blanks = Array.isArray(question.blanks) ? question.blanks.filter(isRecord) : [];
  const options = Array.isArray(question.options) ? question.options.filter(isRecord) : [];
  const correctLabel = normalizeLabel(question.correctAnswer);
  const labelsFromBlanks = blanks
    .map((blank) => normalizeText(blank.label))
    .filter((label) => /^\([A-Z]\)$/.test(label));
  const labelsFromSummary = Array.from(summary.matchAll(/\(([A-Z])\)/g))
    .map((match) => `(${match[1]})`);
  const blankLabels = [...new Set(
    (labelsFromBlanks.length > 0
      ? labelsFromBlanks
      : labelsFromSummary.length > 0
        ? labelsFromSummary
        : ["(A)", "(B)"]).slice(0, 4),
  )].sort();
  const blankAnswers = new Map(
    blankLabels.map((label) => [label, findSummaryBlankAnswer(blanks, label)]),
  );
  const blankA = blankAnswers.get("(A)") || "";
  const blankB = blankAnswers.get("(B)") || "";

  const directionNamesSummaryTask = directionNamesSummaryCompletionTask(direction);
  const directionNamesAllBlanks = blankLabels.every((label) => direction.includes(label));
  const explicitSummaryCompletionFrame = directionNamesExplicitSummaryCompletionFrame(direction);
  const competingDirectionTask = explicitSummaryCompletionFrame
    ? directionNamesSecondaryCompetingTask(direction)
    : directionNamesCompetingTask(direction);
  if (!direction) {
    add(
      "error",
      "summary-mc-missing-direction",
      "SUMMARY_COMPLETE_MC is missing a student-facing task direction.",
    );
  } else if (competingDirectionTask) {
    add(
      "error",
      "summary-mc-direction-task-mismatch",
      `SUMMARY_COMPLETE_MC direction asks students to solve a ${competingDirectionTask} task instead of completing a summary.`,
    );
  } else if (!directionNamesSummaryTask || !directionNamesAllBlanks) {
    add(
      "warning",
      "summary-mc-direction-frame",
      `SUMMARY_COMPLETE_MC direction must ask for the best words for summary blanks ${blankLabels.join(", ")}.`,
    );
  }

  if (!summary) {
    add("error", "summary-mc-missing-summary", "SUMMARY_COMPLETE_MC is missing summaryWithBlanks.");
  }

  if (blankLabels.some((label) => countLiteral(summary, label) !== 1)) {
    add(
      "error",
      "summary-mc-blank-marker-count",
      `summaryWithBlanks must contain ${blankLabels.join(", ")} exactly once each.`,
    );
  }

  // 요약문 미종결 검출 (wave5): 문장 종결 부호 없이 끝나는 stem 은 생성이 중간에
  // 잘린 것 — 실측(26-07-05 final-prem INT 40점): "...the words for " 로 끊긴
  // 요약문이 마커 2개를 갖춰 마커 게이트는 통과하고 출하됐다. 끝의 닫는
  // 따옴표/괄호를 걷어낸 뒤 마지막 문자가 [.!?] 가 아니면 차단한다.
  if (summary) {
    const trimmedTail = summary.replace(/["'”’)\]\s]+$/g, "");
    if (trimmedTail && !/[.!?]$/.test(trimmedTail)) {
      add(
        "error",
        "summary-mc-stem-unterminated",
        `summaryWithBlanks가 문장 종결 부호 없이 끝납니다("...${trimmedTail.slice(-25)}") — 생성이 잘린 요약문입니다. 완결된 한 문장으로 다시 쓰세요.`,
      );
    }
  }

  if (summary && containsHangul(summary)) {
    add(
      "error",
      "summary-mc-summary-language",
      "SUMMARY_COMPLETE_MC summaryWithBlanks must be an English summary sentence.",
    );
  }

  const summaryForSentenceCount = summary.replace(
    /\([A-Z]\)\s*(?:_{3,}|(?:\.|\u2026|\?){2,}|[-\u2013\u2014]{2,})?/g,
    " ",
  );
  if (countSentenceEndings(summaryForSentenceCount) > 1) {
    add(
      "warning",
      "summary-mc-summary-too-many-sentences",
      "SUMMARY_COMPLETE_MC summary should be one sentence, not multiple sentences.",
    );
  }

  if (blankLabels.some((label) => !blankAnswers.get(label))) {
    add(
      "error",
      "summary-mc-missing-blank-answer",
      `SUMMARY_COMPLETE_MC blanks must include answers for ${blankLabels.join(", ")}.`,
    );
  }

  for (const label of blankLabels) {
    const answer = blankAnswers.get(label) || "";
    if (!answer) continue;
    if (containsHangul(answer) || !containsLatinLetter(answer)) {
      add(
        "error",
        "summary-mc-answer-language",
        `${label} answer must be an English word or phrase.`,
      );
      break;
    }
    const normalizedAnswer = normalizeComparableText(answer);
    if (
      normalizedAnswer.length >= 4 &&
      normalizeComparableText(summary).includes(normalizedAnswer)
    ) {
      add(
        "error",
        "summary-mc-answer-leaks-in-summary",
        `${label} answer appears in summaryWithBlanks; the student-facing summary must hide the answer behind the blank marker.`,
      );
      break;
    }
  }

  if (summary && blankLabels.every((label) => blankAnswers.get(label))) {
    const filledSummary = blankLabels.reduce(
      (next, label) => next.replace(label, blankAnswers.get(label) || ""),
      summary,
    );
    const ungrammaticalCompletion = findSummaryMcCorrectCompletionUngrammatical(filledSummary);
    if (ungrammaticalCompletion) {
      add(
        "error",
        "summary-mc-correct-completion-ungrammatical",
        `SUMMARY_COMPLETE_MC correct pair produces a high-confidence ungrammatical completion: ${ungrammaticalCompletion}.`,
      );
    }
    const awkwardCollocation = findAwkwardSummaryMcCollocation(filledSummary);
    if (awkwardCollocation) {
      add(
        "error",
        "summary-mc-awkward-collocation",
        `SUMMARY_COMPLETE_MC filled summary has an awkward English collocation: ${awkwardCollocation}.`,
      );
    }
  }

  if (!correctLabel) {
    add("error", "summary-mc-correct-answer-mismatch", "SUMMARY_COMPLETE_MC correctAnswer must be an option label.");
  }

  const optionPairs = options.map((option) => ({
    label: normalizeLabel(option.label),
    ...readSummaryPairOption(option),
  }));
  const correctPair = optionPairs.find((option) => option.label === correctLabel);

  if (!correctPair) {
    add(
      "error",
      "summary-mc-correct-answer-mismatch",
      "SUMMARY_COMPLETE_MC correctAnswer does not point to an existing option pair.",
    );
  } else if (
    blankLabels.some((label) => {
      const key = summaryBlankKey(label);
      return normalizeComparableText(correctPair.values[key] || "") !==
        normalizeComparableText(blankAnswers.get(label) || "");
    })
  ) {
    add(
      "error",
      "summary-mc-correct-pair-mismatch",
      "SUMMARY_COMPLETE_MC correct option pair must match the blanks answers exactly.",
    );
  }

  const answerObjectMismatch = [
    { surface: "direction", text: direction },
    { surface: "explanation", text: normalizeText(question.explanation) },
  ]
    .map(({ surface, text }) => ({
      surface,
      finding: findSummaryMcAnswerObjectMismatch(text, options, correctLabel),
    }))
    .find(({ finding }) => Boolean(finding));
  if (answerObjectMismatch?.finding) {
    add(
      "error",
      "summary-mc-answer-object-mismatch",
      `SUMMARY_COMPLETE_MC ${answerObjectMismatch.surface} explicitly selects an option text that disagrees with correctAnswer: ${answerObjectMismatch.finding}`,
    );
  }

  let hasAOnlyTrap = false;
  let hasBOnlyTrap = false;
  let hasAllButOneTrap = false;
  let malformedPairFound = false;
  let nonEnglishPairFound = false;
  let duplicateCorrectFound = false;

  for (const pair of optionPairs) {
    const missingBlankValue = blankLabels.some((label) => {
      const key = summaryBlankKey(label);
      return !pair.values[key];
    });
    if (missingBlankValue) {
      malformedPairFound = true;
      continue;
    }
    const pairText = blankLabels.map((label) => pair.values[summaryBlankKey(label)] || "").join(" ");
    if (containsHangul(pairText) || !containsLatinLetter(pairText)) {
      nonEnglishPairFound = true;
    }
    if (pair.label !== correctLabel) {
      const matchCount = blankLabels.filter((label) => {
        const key = summaryBlankKey(label);
        return normalizeComparableText(pair.values[key] || "") ===
          normalizeComparableText(blankAnswers.get(label) || "");
      }).length;
      if (matchCount === blankLabels.length) duplicateCorrectFound = true;
      if (matchCount === blankLabels.length - 1) hasAllButOneTrap = true;
    }
    if (pair.label !== correctLabel && blankA && blankB) {
      const aMatches = normalizeComparableText(pair.values.blankA || pair.blankA) === normalizeComparableText(blankA);
      const bMatches = normalizeComparableText(pair.values.blankB || pair.blankB) === normalizeComparableText(blankB);
      if (aMatches && !bMatches) hasAOnlyTrap = true;
      if (!aMatches && bMatches) hasBOnlyTrap = true;
    }
  }

  if (malformedPairFound) {
    add(
      "error",
      "summary-mc-option-pair-shape",
      `Every SUMMARY_COMPLETE_MC option must provide values for ${blankLabels.join(", ")}, or a clearly paired text value.`,
    );
  }

  if (nonEnglishPairFound) {
    add(
      "error",
      "summary-mc-option-language",
      "SUMMARY_COMPLETE_MC options must be English-only paired expressions.",
    );
  }

  if (duplicateCorrectFound) {
    add(
      "error",
      "summary-mc-duplicate-correct-option",
      "Only the correct SUMMARY_COMPLETE_MC option may match every blank answer.",
    );
  }

  if (blankLabels.length === 2 && (!hasAOnlyTrap || !hasBOnlyTrap)) {
    add(
      "error",
      "summary-mc-missing-half-correct-traps",
      "SUMMARY_COMPLETE_MC should include at least one A-only-correct trap and one B-only-correct trap.",
    );
  }

  if (blankLabels.length > 2 && !hasAllButOneTrap) {
    add(
      "warning",
      "summary-mc-missing-all-but-one-trap",
      "SUMMARY_COMPLETE_MC with three or more blanks should include at least one all-but-one-correct trap.",
    );
  }

  if (requestedDifficulty === "KILLER" && blankLabels.length === 2 && blankA && blankB && correctLabel) {
    validateKillerSummaryTrapStrength(optionPairs, correctLabel, blankA, blankB, add);
  }

  const wrongExplanations =
    question.wrongOptionExplanations &&
    typeof question.wrongOptionExplanations === "object" &&
    !Array.isArray(question.wrongOptionExplanations)
      ? (question.wrongOptionExplanations as Record<string, unknown>)
      : {};
  if (
    Object.values(wrongExplanations).some(
      (explanation) =>
        typeof explanation === "string" &&
        /대조군\s*설계|control\s+group|control\s+design/i.test(explanation),
    )
  ) {
    add(
      "warning",
      "summary-mc-explanation-experimental-jargon",
      "Wrong-option explanations should say 선지 배열상/지문 논리상, not 대조군 설계 or experimental control-group jargon.",
    );
  }
}



function directionNamesSummaryCompletionTask(direction: string): boolean {
  if (!direction) return false;
  return /(?:요약|\bsummary\b|\bsummari(?:s|z)(?:e|es|ed|ing)\b)/iu.test(direction);
}



function directionNamesExplicitSummaryCompletionFrame(direction: string): boolean {
  if (!directionNamesSummaryCompletionTask(direction)) return false;
  return (
    /\bcomplete\s+(?:the\s+)?summary\b/iu.test(direction) ||
    /(?:요약문?|summary)[^.!?]{0,120}(?:빈칸|들어갈\s*(?:말|단어|낱말)|\b(?:word|words|phrase|phrases|expression|expressions|pair|pairs)\b[^.!?]{0,40}\b(?:for|in)\b)/iu.test(
      direction,
    )
  );
}




function directionNamesSecondaryCompetingTask(direction: string): string | null {
  // Detect an independently targeted student task by its object (underlined
  // expression, passage blank, passage title, according-to-passage verdict),
  // not by an ever-growing list of clause separators. This catches the same
  // mixed task across "and/while/(...)/slash/em dash/완성하며/완성한 뒤" while
  // leaving grammar wording that is bound to summary blanks alone.
  const independentTask = directionNamesIndependentCompetingTask(direction);
  if (independentTask) return independentTask;

  const segments = direction
    .split(
      /(?:[.!?;:：]\s*|,\s*(?:and(?:\s+then)?|그리고)\s+|\b(?:and\s+then|then|next|also)\b|완성하고\s*)/iu,
    )
    .map((segment) => segment.trim())
    .filter(Boolean);
  for (const segment of segments.slice(1)) {
    // A second sentence may simply restate how to complete the summary. Only a
    // segment that no longer names the summary and independently names another
    // task is a mixed-direction validity defect.
    if (directionNamesSummaryCompletionTask(segment)) continue;
    const competing = directionNamesCompetingTask(segment);
    // "the grammatically correct option for each blank" is still the paired
    // summary-completion operation. Bind that grammar wording to the summary
    // blanks instead of mistaking it for an independent underlined-expression
    // task. A passage/text blank is deliberately excluded.
    if (competing === "grammar" && directionNamesBoundSummaryBlankSelection(segment)) {
      continue;
    }
    if (competing) return competing;
  }
  return null;
}



function directionNamesBoundSummaryBlankSelection(segment: string): boolean {
  if (/\bblank\s+in\s+(?:the|this)\s+(?:passage|text)\b/iu.test(segment)) {
    return false;
  }
  return (
    /\b(?:each|both|all|the\s+two)\s+blanks?\b/iu.test(segment) ||
    /\bblanks?\s*\([A-Z]\)(?:\s*(?:and|,)\s*\([A-Z]\))?/iu.test(segment) ||
    /\bfor\s+\([A-Z]\)\s*(?:and|,)\s*\([A-Z]\)/iu.test(segment) ||
    /(?:요약문?)[^.!?]{0,80}(?:각\s*|두\s*)?빈칸/iu.test(segment) ||
    /(?:각|두)\s*빈칸/iu.test(segment)
  );
}



/**
 * Detect a separately scored passage-evidence verdict by its answer object.
 *
 * Evidence words alone are not enough: a valid summary instruction may ask
 * students to choose the (A)/(B) pair "based on the passage."  A competing
 * CONTENT_MATCH task instead directs a selection verb at a claim/statement
 * and asks whether that object is supported, contradicted, true, or false
 * against the source text.  Keeping those three roles separate avoids both
 * the lexical false negatives caught by the v6 audit and the corresponding
 * evidence-bound false positives.
 */
type EvidenceSelectionObject = "claim" | "completion" | "unknown";

function classifyKoreanEvidenceSelectionObject(
  direction: string,
): EvidenceSelectionObject {
  const commands = Array.from(
    direction.matchAll(
      /(?:고르시오|선택하시오|찾으시오|판별하시오|식별하시오|판단하시오|결정하시오|가려내시오|고르라|선택하라|찾아라|판별하라|식별하라|판단하라|결정하라|가려내라|고르세요|선택하세요|찾으세요|판별하세요|식별하세요|판단하세요|결정하세요|가려내세요)/gu,
    ),
  );
  const command = commands.at(-1);
  if (command?.index === undefined) return "unknown";

  // Korean permits a source adverb between the object and the command
  // ("진술을 본문상 선택하시오").  The last explicit object particle before
  // the command is therefore a more faithful answer-object signal than a
  // fixed keyword window around the verb.
  const prefix = direction.slice(0, command.index);
  const objects = Array.from(
    prefix.matchAll(/([가-힣]{1,24})(?:을|를)(?=\s|[,;:]|$)/gu),
  );
  // In "진술을 제시문을 기준으로 고르시오", 제시문 is the source of
  // evaluation, not the answer object. Skip those source-frame objects before
  // classifying the commanded noun.
  const head = [...objects]
    .reverse()
    .map((match) => match[1] ?? "")
    .find((candidate) => !/^(?:본문|글|지문|제시문|근거|증거|정보)$/.test(candidate)) ?? "";
  if (
    /(?:쌍|조합|짝|빈칸|단어|낱말|말|표현|어구|선택지|보기)$/.test(head)
  ) {
    return "completion";
  }
  if (/(?:주장|진술|명제|설명|문장)$/.test(head)) return "claim";
  return "unknown";
}

function classifyEnglishEvidenceSelectionObject(
  direction: string,
): EvidenceSelectionObject {
  const commands = Array.from(
    direction.matchAll(/\b(?:choose|select|identify|find|determine|mark)\b/giu),
  );
  const command = commands.at(-1);
  if (command?.index === undefined) return "unknown";
  const afterCommand = direction.slice(command.index + command[0].length);
  const head = afterCommand.match(
    /\b(claims?|statements?|assertions?|propositions?|explanations?|pairs?|combinations?|words?|phrases?|expressions?|blanks?|options?)\b/iu,
  )?.[1];
  if (!head) return "unknown";
  if (/^(?:claims?|statements?|assertions?|propositions?|explanations?)$/iu.test(head)) {
    return "claim";
  }
  return "completion";
}

function directionNamesContentEvidenceVerdictTask(direction: string): boolean {
  const koreanTargetSelection =
    classifyKoreanEvidenceSelectionObject(direction) === "claim";
  const koreanSource =
    /(?:본문상|지문으로\s*볼\s*때|글에\s*비추어|제시\s*근거상|(?:본문|글|지문|제시문)\s*(?:의|에서|이|가|을|를|에|으로|내용|근거|증거|상)|(?:본문|글|지문|제시문)[^.!?]{0,28}(?:근거|증거|정보|기준)|제시\s*근거)/u.test(
      direction,
    );
  const koreanVerdict =
    /(?:근거[^.!?]{0,28}(?:없|않|부족|뒷받침)|뒷받침[^.!?]{0,28}(?:없|않|하|되)|(?:증거|근거)[^.!?]{0,32}(?:지지|정당화)|옳(?:은|지\s*않)|사실(?:인|이\s*아닌)|타당|정당|모순되|어긋나|일치(?:하는|하지\s*않))/u.test(
      direction,
    );
  if (koreanTargetSelection && koreanSource && koreanVerdict) return true;

  const englishTargetSelection =
    classifyEnglishEvidenceSelectionObject(direction) === "claim";
  const englishSource =
    /\b(?:passage|text|source(?:\s+(?:passage|text))?|reading)\b/iu.test(direction);
  const englishVerdict =
    /\b(?:unsupported|supported|unjustified|justified|false|true|incorrect|correct|contradicts?|provides?\s+no\s+(?:textual\s+)?(?:evidence|support)|not\s+supported|no\s+(?:textual\s+)?(?:evidence|support)|cannot\s+be\s+(?:justified|supported)|can\s+be\s+(?:justified|supported))\b/iu.test(
      direction,
    );
  return englishTargetSelection && englishSource && englishVerdict;
}



function directionNamesIndependentCompetingTask(direction: string): string | null {
  if (directionNamesContentEvidenceVerdictTask(direction)) return "content-match";

  const independentTasks: Array<[name: string, pattern: RegExp]> = [
    [
      "grammar",
      /(?:(?:밑줄\s*친|강조된|굵게\s*표시된|번호가\s*매겨진)\s*(?:표현|부분|어구|구절|문장|낱말)[^.!?]{0,100}(?:어법상|문법적으로)[^.!?]{0,50}(?:옳|맞|틀|잘못|오류)|(?:어법상|문법적으로)[^.!?]{0,100}(?:밑줄\s*친|강조된|굵게\s*표시된|번호가\s*매겨진)\s*(?:표현|부분|어구|구절|문장|낱말)|\b(?:underlined|highlighted|boldfaced|bold-faced|numbered)\s+(?:expression|word|part|phrase|clause|sentence)s?\b[^.!?]{0,120}\b(?:grammatically\s+(?:correct|incorrect|unacceptable)|grammar(?:\s+is)?\s+(?:wrong|incorrect)|contains?\s+(?:a\s+)?grammar(?:tical)?\s+error)\b|\b(?:grammatically\s+(?:correct|incorrect|unacceptable)|grammar(?:\s+is)?\s+(?:wrong|incorrect)|contains?\s+(?:a\s+)?grammar(?:tical)?\s+error)\b[^.!?]{0,120}\b(?:underlined|highlighted|boldfaced|bold-faced|numbered)\s+(?:expression|word|part|phrase|clause|sentence)s?\b)/iu,
    ],
    [
      "blank-inference",
      /(?:본문(?:의|에\s*있는)?\s*빈칸[^.!?]{0,100}(?:들어갈|알맞은|적절한)\s*(?:별도(?:의)?\s*)?(?:말|단어|낱말|어구|표현)|\b(?:phrase|word|expression)s?\b[^.!?]{0,80}\b(?:fits?|fit|belongs?\s+in)\s+(?:the\s+)?blanks?\s+in\s+(?:the|this)\s+(?:passage|text)\b|\b(?:fits?|fit)\s+(?:the\s+)?blanks?\s+in\s+(?:the|this)\s+(?:passage|text)\b|\bblank\s+in\s+(?:the|this)\s+(?:passage|text)\b)/iu,
    ],
    [
      "title",
      /(?:\b(?:choose|select|identify|write|supply)\b[^.!?]{0,80}\b(?:title|heading)\b[^.!?]{0,100}\b(?:passage|text)\b|\b(?:title|heading)\b[^.!?]{0,100}\b(?:best|most\s+(?:appropriately|accurately)|captures?|represents?)\b[^.!?]{0,80}\b(?:passage|text)\b)/iu,
    ],
    [
      "topic or main-idea",
      /(?:(?:본문|글)(?:의)?\s*(?:중심\s*생각|주제|요지)[^.!?]{0,60}(?:진술|고르|찾|쓰)|(?:중심\s*생각|주제|요지)[^.!?]{0,80}(?:본문|글)[^.!?]{0,40}(?:진술|고르|찾|쓰)|\b(?:state|identify|choose|select|write)\b[^.!?]{0,100}\b(?:central|main)\s+idea\b[^.!?]{0,80}\b(?:passage|text)\b)/iu,
    ],
    [
      "content-match",
      /(?:(?:본문|글)(?:의|에)?\s*(?:내용(?:과\s*모순되는|에\s*(?:어긋나는|근거하지\s*않은|뒷받침되지\s*않는))|근거하지\s*않은|뒷받침되지\s*않는)\s*(?:진술|주장)|\b(?:choose|identify|select)\b[^.!?]{0,60}\b(?:which\s+)?(?:statement|claim)\b[^.!?]{0,100}\b(?:false|true|incorrect|correct|unsupported|contradicts?)\b[^.!?]{0,100}\b(?:according\s+to\s+)?(?:the|this)\s+(?:passage|text)\b|\b(?:statement|claim)\b[^.!?]{0,80}\b(?:unsupported\s+according\s+to|contradicts?)\b[^.!?]{0,80}\b(?:the|this)\s+(?:passage|text)\b|\baccording\s+to\s+(?:the|this)\s+(?:passage|text)\b[^.!?]{0,120}\b(?:false|true|incorrect|correct|unsupported)\b)/iu,
    ],
    ["irrelevant-sentence", /(?:(?:글의\s*)?흐름(?:과\s*(?:관계없는|무관한)|을\s*(?:방해|깨뜨리|해치))|\b(?:numbered\s+)?sentence\b[^.!?]{0,100}\b(?:irrelevant\s+to\s+the\s+flow|disrupts?\s+(?:the\s+)?(?:argument(?:'s)?\s+)?coherence)\b|\b(?:irrelevant|unrelated)\s+(?:sentence|statement)\b)/iu],
    ["sentence-insertion", /(?:주어진\s*문장이\s*(?:들어가기에|삽입될\s*위치)|\b(?:where|position)\b[^.!?]{0,80}\b(?:following|supplied|given)\s+sentence\b[^.!?]{0,80}\b(?:fit|placed?|inserted?)\b|\b(?:supplied|given)\s+sentence\b[^.!?]{0,100}\b(?:should\s+be\s+)?inserted?\b)/iu],
    ["sentence-order", /(?:글의\s*순서로|(?:단락|문장)(?:의)?\s*논리적\s*순서|\b(?:arrange|order)\b[^.!?]{0,100}\b(?:following\s+)?(?:paragraphs|sentences)\b[^.!?]{0,80}\b(?:logical\s+)?order\b|\border\s+of\s+(?:the\s+)?(?:following\s+)?(?:paragraphs|sentences)\b)/iu],
    ["reference", /(?:(?:강조된|밑줄\s*친)\s*대명사[^.!?]{0,80}가리키는\s*대상|가리키는\s*대상이\s*(?:나머지|다른)|\b(?:underlined|highlighted)\s+(?:word|expression|pronoun)\b[^.!?]{0,80}\brefers?\s+to\b)/iu],
    ["vocabulary", /(?:문맥상\s*부적절한\s*(?:강조(?:된)?\s*)?(?:낱말|단어|어휘|표현)|\bcontextually\s+(?:inappropriate|incorrect)\b[^.!?]{0,80}\b(?:underlined|highlighted)\s+(?:word|expression)\b|\b(?:underlined|highlighted)\s+(?:word|expression)\b[^.!?]{0,80}\bcontextually\s+(?:inappropriate|incorrect)\b)/iu],
  ];
  for (const [name, pattern] of independentTasks) {
    if (pattern.test(direction)) return name;
  }
  return null;
}



function directionNamesCompetingTask(direction: string): string | null {
  if (!direction) return null;

  const independentTask = directionNamesIndependentCompetingTask(direction);
  if (independentTask) return independentTask;

  const competingTasks: Array<[name: string, pattern: RegExp]> = [
    ["title", /(?:제목으로\s*(?:가장\s*)?적절|가장\s*(?:잘\s*)?(?:나타내는|요약한)\s*제목|제목은\s*무엇|\b(?:best|most\s+(?:appropriate|suitable))\s+title\b|\bwhich\s+title\b|\btitle\s+(?:best|most\s+(?:appropriately|accurately))\b)/iu],
    ["topic or main-idea", /(?:(?:주제|요지)(?:로|는)?\s*(?:가장\s*)?적절|(?:주제|요지)를\s*(?:가장\s*)?(?:잘\s*)?(?:나타내|드러내)|\bwhat\s+is\s+(?:the\s+)?(?:main|central)\s+idea\b|\bwhat\s+is\s+(?:the\s+)?topic\s+of\s+(?:the|this)\s+(?:passage|text)\b|\bwhich\b[^?.!]{0,50}\b(?:best|most\s+accurately)\s+(?:states?|expresses?|captures?)\b[^?.!]{0,40}\b(?:main|central)\s+idea\b)/iu],
    ["content-match", /(?:내용과\s*(?:일치하지\s*않는|일치하는|일치하지\s*않은)|\baccording\s+to\s+(?:the|this)\s+(?:passage|text)\b[^?.!]{0,80}\b(?:true|false|correct|incorrect)\b|\bwhich\b[^?.!]{0,80}\b(?:true|false|correct|incorrect)\b[^?.!]{0,80}\baccording\s+to\s+(?:the|this)\s+(?:passage|text)\b)/iu],
    ["irrelevant-sentence", /(?:글의\s*흐름과\s*(?:관계없는|무관한)|\b(?:irrelevant|unrelated)\s+(?:sentence|statement)\b)/iu],
    ["sentence-insertion", /(?:주어진\s*문장이\s*들어가기에|\b(?:insert|insertion|belongs?)\b[^?.!]{0,60}\b(?:sentence|position|place)\b|\bwhere\b[^?.!]{0,40}\bfollowing\s+sentence\b[^?.!]{0,40}\b(?:fit|placed?)\b)/iu],
    ["sentence-order", /(?:글의\s*순서로|\border\s+of\s+(?:the\s+)?(?:following\s+)?(?:paragraphs|sentences)\b)/iu],
    ["grammar", /(?:어법상\s*(?:옳은|틀린)|\b(?:which|underlined|sentence|expression|option)[^?.!]{0,70}\bgrammatically\s+(?:correct|incorrect)\b|\bgrammatically\s+(?:correct|incorrect)\b[^?.!]{0,50}\b(?:underlined|sentence|expression|option)\b)/iu],
    ["blank-inference", /(?:빈칸에\s*(?:들어갈|알맞은|적절한)|\b(?:fits?|completes?|belongs?\s+in)\s+(?:the\s+)?blank\b|\b(?:fits?|fit)\s+(?:the\s+)?blanks?\s+in\s+(?:the|this)\s+(?:passage|text)\b|\bfill\s+(?:in\s+)?(?:the\s+)?blank\b|\bblank\s+in\s+(?:the|this)\s+passage\b)/iu],
    ["vocabulary", /(?:낱말의\s*쓰임이\s*(?:적절하지|적절한)|\bunderlined\s+(?:word|expression)\b[^?.!]{0,60}\b(?:appropriate|inappropriate)\b)/iu],
    ["reference", /(?:가리키는\s*대상이\s*(?:나머지|다른)|\bunderlined\s+(?:word|expression|pronoun)\b[^?.!]{0,60}\brefers?\s+to\b)/iu],
  ];

  for (const [name, pattern] of competingTasks) {
    if (pattern.test(direction)) return name;
  }
  return null;
}



type SummaryAnswerObjectOccurrence = {
  label: string;
  start: number;
  end: number;
  rejected: boolean;
};

/**
 * Bind an explicit selection/answer assertion to the option text actually
 * keyed by correctAnswer.
 *
 * This deliberately abstains unless a unique, sufficiently descriptive
 * option surface is quoted near a high-confidence choice/answer predicate.
 * Merely mentioning a distractor in an explanation is not an error.  The
 * nearest non-rejected object to the last decisive predicate is used so
 * contrastive explanations such as "reject X; therefore choose Y" remain
 * valid while "answer ③, choose X" cannot hide behind a correct label.
 */
export function findSummaryMcAnswerObjectMismatch(
  value: unknown,
  options: Array<Record<string, unknown>>,
  correctAnswer: unknown,
): string | null {
  const text = normalizeSummaryAnswerBindingText(value);
  const correctLabel = normalizeLabel(correctAnswer);
  if (!text || !correctLabel || !Array.isArray(options) || options.length < 2) {
    return null;
  }

  const surfaces = options
    .map((option) => ({
      label: normalizeLabel(option.label),
      text: normalizeSummaryAnswerBindingText(stripSummaryOptionPrefix(normalizeText(option.text))),
    }))
    .filter(({ label, text: optionText }) =>
      Boolean(label) && isBindableSummaryOptionSurface(optionText),
    );
  if (!surfaces.some(({ label }) => label === correctLabel)) return null;

  // If two rendered options collapse to the same surface, that surface cannot
  // identify one answer reliably.  Exclude it rather than manufacturing a
  // deterministic answer from ambiguous display text.
  const surfaceCounts = new Map<string, number>();
  for (const option of surfaces) {
    surfaceCounts.set(option.text, (surfaceCounts.get(option.text) ?? 0) + 1);
  }
  const uniqueSurfaces = surfaces.filter(
    (option) => surfaceCounts.get(option.text) === 1,
  );
  if (uniqueSurfaces.length < 2) return null;

  const occurrences: SummaryAnswerObjectOccurrence[] = [];
  for (const option of uniqueSurfaces) {
    let from = 0;
    while (from < text.length) {
      const start = text.indexOf(option.text, from);
      if (start < 0) break;
      const end = start + option.text.length;
      if (hasSummaryOptionTokenBoundary(text, start, end)) {
        occurrences.push({
          label: option.label,
          start,
          end,
          rejected: summaryOptionOccurrenceIsRejected(text, start, end),
        });
      }
      from = Math.max(end, start + 1);
    }
  }
  const selectableOccurrences = occurrences.filter(({ rejected }) => !rejected);
  if (selectableOccurrences.length === 0) return null;

  const cues = Array.from(text.matchAll(SUMMARY_ANSWER_SELECTION_CUE_RE));
  for (const cue of cues.reverse()) {
    const cueStart = cue.index;
    const cueEnd = cueStart + cue[0].length;
    const candidates = selectableOccurrences
      .map((occurrence) => ({
        ...occurrence,
        distance: occurrence.end <= cueStart
          ? cueStart - occurrence.end
          : cueEnd <= occurrence.start
            ? occurrence.start - cueEnd
            : 0,
      }))
      .filter(({ distance }) => distance <= 96)
      .sort((a, b) => a.distance - b.distance || b.start - a.start);
    if (candidates.length === 0) continue;

    const nearestDistance = candidates[0].distance;
    const nearestLabels = new Set(
      candidates
        .filter(({ distance }) => distance === nearestDistance)
        .map(({ label }) => label),
    );
    if (nearestLabels.size !== 1) return null;

    const selectedLabel = candidates[0].label;
    return selectedLabel === correctLabel
      ? null
      : `selected option ${selectedLabel}, keyed option ${correctLabel}`;
  }

  // A generated explanation can assert its answer by naming a final,
  // required, or completed summary directly, without using a separate
  // choose/select verb. Bind that surface only when the complete rendered
  // option is unique and the carrier is an affirmative, high-confidence
  // answer frame. Draft, comparison, contrast, and negated frames remain
  // abstentions. This is intentionally a literal display binding, not a
  // semantic or fuzzy option matcher.
  const authoritativeLabels = new Set(
    selectableOccurrences
      .filter(({ start, end }) =>
        summaryOptionOccurrenceHasAuthoritativeCarrier(text, start, end),
      )
      .map(({ label }) => label),
  );
  if (authoritativeLabels.size !== 1) return null;
  const [authoritativeLabel] = authoritativeLabels;
  return authoritativeLabel === correctLabel
    ? null
    : `selected option ${authoritativeLabel}, keyed option ${correctLabel}`;
}

const SUMMARY_ANSWER_SELECTION_CUE_RE =
  /(?:고르(?:시오|세요|라|기|는|면|므로|어야|도록|ㄴ다|는다|자|고|지)?|선택(?:한다|했다|해야|할|하도록|하면|하여|하고|하(?:시오|세요|라|기|는|면|도록|여야|ㄴ다|는다|자|고)?|되(?:어야|도록|ㄴ다|는다)|이\s*요구)|택하(?:시오|세요|라|기|는|면|므로|여야|ㄴ다|는다|자|고)?|취하(?:시오|세요|라|기|는|면|여야|ㄴ다|는다|자|고)?|지정하(?:시오|세요|라|기|는|면|여야|ㄴ다|는다|자|고)?|채택(?:하(?:시오|세요|라|기|는|면|여야|ㄴ다|는다)?|되(?:어야|도록|ㄴ다|는다))?|선정(?:하(?:시오|세요|라|기|는|면|여야|ㄴ다|는다)?|되(?:어야|도록|ㄴ다|는다))?|넣(?:으시오|으세요|어야|는|으면|는다|고)?|들어가(?:야\s*한다|야\s*한다|는|ㄴ다|었다|며|도록|게)?|채우(?:시오|세요|라|기|는|면|어야|ㄴ다|는다|고)?|확정(?:하(?:시오|세요|라|기|는|면|ㄴ다|는다|였다|했다)?|되(?:었|어|ㄴ|는|었다)|\s*표면)?|(?:직접\s*)?인용(?:한|된)?\s*선택지|(?:완성문|완성된\s*요약|빈칸\s*표면|선택지\s*문장|문장\s*전체|전체\s*문장|전체\s*선택지|온전한\s*문구|최종\s*표면|정답\s*표면)|(?<!오)(?:정답|답)(?:은|는|이|가|으로|이다|이\s*된다)?|완성어|귀착점|주어가\s*되는\s*것|행위자|번호(?:로)?는|\b(?:choose|select|pick|insert|fill)\b|\b(?:correct\s+(?:answer|option|pair)|answer\s+is)\b|\b(?:is|be|becomes?)\s+(?:chosen|selected)\b)/giu;

function normalizeSummaryAnswerBindingText(value: unknown): string {
  return normalizeText(value)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s*([/|])\s*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function isBindableSummaryOptionSurface(value: string): boolean {
  if (value.length < 5 || value.length > 160) return false;
  const latinLetters = value.match(/[a-z]/g)?.length ?? 0;
  if (latinLetters < 4) return false;
  return !/^(?:option\s*)?\d{1,3}$/u.test(value);
}

function hasSummaryOptionTokenBoundary(
  text: string,
  start: number,
  end: number,
): boolean {
  const first = text[start] ?? "";
  const last = text[end - 1] ?? "";
  const before = text[start - 1] ?? "";
  const after = text[end] ?? "";
  if (/[a-z0-9]/u.test(first) && /[a-z0-9]/u.test(before)) return false;
  if (/[a-z0-9]/u.test(last) && /[a-z0-9]/u.test(after)) return false;
  return true;
}

function summaryOptionOccurrenceIsRejected(
  text: string,
  start: number,
  end: number,
): boolean {
  const before = text.slice(Math.max(0, start - 28), start);
  const after = text.slice(end, Math.min(text.length, end + 32));
  return (
    /(?:반대\s*후보|오답|틀린|잘못된|배제할?|제외할?|버릴?|reject(?:ed|ing)?|distractor|wrong|incorrect|not)\s*$/iu.test(
      before,
    ) ||
    /^\s*(?:은|는|이|가|을|를|도|만)?\s*(?:아니|오답|틀리|잘못되|배제|제외|버리|(?:is\s+)?(?:wrong|incorrect|rejected)|should\s+not\s+be\s+(?:chosen|selected))/iu.test(
      after,
    )
  );
}

function summaryOptionOccurrenceHasAuthoritativeCarrier(
  text: string,
  start: number,
  end: number,
): boolean {
  const before = text.slice(Math.max(0, start - 112), start);
  const after = text.slice(end, Math.min(text.length, end + 96));

  // Do not let a later phrase such as "not the final summary" turn a draft
  // quotation into an authoritative answer object.
  if (
    /\b(?:comparison|contrast|draft|rejection|distractor|wrong|incorrect|not|never)\b[^.!?]{0,96}$/iu.test(
      before,
    ) ||
    /^[^.!?]{0,96}\b(?:comparison|contrast|draft|rejection|distractor|wrong|incorrect|not|never)\b/iu.test(
      after,
    )
  ) {
    return false;
  }

  const carrier = /(?:^|[.!?;]\s*|\buse\s+(?:this\s+)?)\s*(?:(?:the\s+)?(?:final|required|completed)\s+(?:(?:answer|one-line|single-sentence)\s+)?(?:summary|recap|conclusion)|final)\s*(?:is|reads?|states?|equals?)?\s*(?:(?:::|:|[-–—/]|=>|⇒)\s*)?(?:[\["'“”‘’«»]\s*)*$/iu;
  return carrier.test(before);
}



export function findSummaryBlankAnswer(
  blanks: Record<string, unknown>[],
  expectedLabel: string,
): string {
  const normalizedExpected = expectedLabel.replace(/[()]/g, "").toLowerCase();
  const blank = blanks.find((item) => {
    const label = normalizeText(item.label).replace(/[()]/g, "").toLowerCase();
    return label === normalizedExpected;
  });
  return normalizeText(blank?.answer);
}



export function summaryBlankKey(label: unknown): string {
  const normalized = normalizeText(label).replace(/[()]/g, "").toUpperCase();
  if (!/^[A-Z]$/.test(normalized)) return "";
  return `blank${normalized}`;
}



export function readSummaryPairOption(option: Record<string, unknown>): {
  blankA: string;
  blankB: string;
  text: string;
  values: Record<string, string>;
} {
  const text = normalizeText(option.text);
  const values: Record<string, string> = {};
  const textValues = readSummaryValuesFromOptionText(text);

  if (Array.isArray(option.blankValues)) {
    for (const item of option.blankValues) {
      if (!isRecord(item)) continue;
      const key = summaryBlankKey(item.label);
      const value = normalizeText(item.value ?? item.answer);
      if (key && value) values[key] = value;
    }
  }

  for (const [key, value] of Object.entries(option)) {
    if (!/^blank[A-Z]$/i.test(key)) continue;
    const normalizedKey = `blank${key.slice(5).toUpperCase()}`;
    const normalizedValue = normalizeText(value);
    if (normalizedValue) values[normalizedKey] = normalizedValue;
  }

  for (const [key, value] of Object.entries(textValues)) {
    if (value && !values[key]) values[key] = value;
  }

  const explicitA = values.blankA || normalizeText(option.blankA);
  const explicitB = values.blankB || normalizeText(option.blankB);
  if (Object.keys(values).length > 0 || explicitA || explicitB) {
    if (explicitA) values.blankA = explicitA;
    if (explicitB) values.blankB = explicitB;
    return { blankA: explicitA, blankB: explicitB, text, values };
  }

  const stripped = stripSummaryOptionPrefix(text);
  const parts = stripped
    .split(/\s*(?:\u2026+|\.{2,}|\?{2,}|(?:\?\s*){2,}|\/|\||;|,|\s[-\u2013\u2014]\s)\s*/u)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    parts.forEach((part, index) => {
      values[`blank${String.fromCharCode(65 + index)}`] = part;
    });
    return { blankA: parts[0], blankB: parts[1] || "", text, values };
  }

  return { blankA: "", blankB: "", text, values };
}



export function readSummaryValuesFromOptionText(text: string): Record<string, string> {
  const values: Record<string, string> = {};
  if (!text) return values;

  const stripped = stripSummaryOptionPrefix(text);
  stripped
    .split(/\s*(?:\u2026+|\.{2,}|\?{2,}|(?:\?\s*){2,}|\/|\||;|,|\s[-\u2013\u2014]\s)\s*/u)
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((part, index) => {
      values[`blank${String.fromCharCode(65 + index)}`] = part;
    });
  return values;
}



export function stripSummaryOptionPrefix(text: string): string {
  return text
    .replace(
      /^\s*(?:[\u2460-\u2473\u3251-\u325F\u32B1-\u32BF]|\((?:[A-Ja-j]|\d{1,3})\)|(?:[A-Ja-j]|\d{1,3})[.)])\s*/,
      "",
    )
    .trim();
}



export function countSentenceEndings(text: string): number {
  const matches = text.match(/[.!?]+(?:\s|$)/g);
  return matches?.length ?? 0;
}



/**
 * High-precision subset of malformed summary completions that may safely block
 * publication. Keep broad or parser-dependent collocation suspicions in
 * findAwkwardSummaryMcCollocation so grammatical noun phrases are warnings only.
 */
export function findSummaryMcCorrectCompletionUngrammatical(text: string): string | null {
  const normalized = text.replace(/\s+/g, " ").trim();
  const highConfidenceGerunds = [
    "achieving", "addressing", "allowing", "applying", "avoiding", "balancing",
    "being", "creating", "developing", "doing", "enabling", "encouraging",
    "ensuring", "establishing", "evaluating", "expanding", "implementing",
    "improving", "increasing", "learning", "limiting", "maintaining", "making",
    "managing", "participating", "preserving", "preventing", "producing",
    "promoting", "protecting", "providing", "recognizing", "reducing", "requiring",
    "responding", "restricting", "strengthening", "supporting", "understanding",
    "using", "weakening",
  ].join("|");
  const pattern = new RegExp(
    `\\b(?:equity|equality|opportunity|responsibility)\\s+to\\s+(?:${highConfidenceGerunds})\\b`,
    "i",
  );
  return normalized.match(pattern)?.[0] ?? null;
}



export function findAwkwardSummaryMcCollocation(text: string): string | null {
  const normalized = text.replace(/\s+/g, " ").trim();
  const patterns: RegExp[] = [
    /\b(?:question|matter|issue|problem)\s+of\s+[a-z][a-z-]*(?:\s+[a-z][a-z-]*){0,3}\s+to\s+[a-z]+ing\b/i,
    /\b(?:equity|equality|opportunity|responsibility)\s+to\s+[a-z]+ing\b/i,
    /\b(?:a|the)\s+(?:question|matter|issue|problem)\s+of\s+[a-z][a-z-]*(?:\s+[a-z][a-z-]*){0,2}\s+for\s+[a-z]+ing\b/i,
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match?.[0]) return match[0];
  }
  return null;
}
