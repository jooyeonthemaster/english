// Split from question-quality.ts — shared helpers in core.ts, public API via index.ts barrel.
import { QuestionQualitySeverity, contentTokens, countTokenOverlap, normalizeComparableText } from "../../core";



export function validateKillerSummaryTrapStrength(
  optionPairs: Array<{ label: string; blankA: string; blankB: string; text: string }>,
  correctLabel: string,
  blankA: string,
  blankB: string,
  add: (severity: QuestionQualitySeverity, code: string, message: string) => void,
) {
  const correctA = normalizeComparableText(blankA);
  const correctB = normalizeComparableText(blankB);
  const wrongPairs = optionPairs.filter((pair) => pair.label !== correctLabel);
  const aOnlyPairs = wrongPairs.filter(
    (pair) => normalizeComparableText(pair.blankA) === correctA && normalizeComparableText(pair.blankB) !== correctB,
  );
  const bOnlyPairs = wrongPairs.filter(
    (pair) => normalizeComparableText(pair.blankA) !== correctA && normalizeComparableText(pair.blankB) === correctB,
  );

  const blankAFamily = summarySemanticFamily(blankA);
  const blankBFamily = summarySemanticFamily(blankB);
  const hasCompetitiveBWithCorrectA = aOnlyPairs.some((pair) =>
    sameSummarySemanticField(pair.blankB, blankB),
  );
  const hasCompetitiveAWithCorrectB = bOnlyPairs.some((pair) =>
    sameSummarySemanticField(pair.blankA, blankA),
  );

  const strongBTrapBuriedBehindWrongA = wrongPairs.some(
    (pair) =>
      normalizeComparableText(pair.blankA) !== correctA &&
      normalizeComparableText(pair.blankB) !== correctB &&
      sameSummarySemanticField(pair.blankB, blankB),
  );
  const strongATrapBuriedBehindWrongB = wrongPairs.some(
    (pair) =>
      normalizeComparableText(pair.blankA) !== correctA &&
      normalizeComparableText(pair.blankB) !== correctB &&
      sameSummarySemanticField(pair.blankA, blankA),
  );

  if (blankBFamily && !hasCompetitiveBWithCorrectA) {
    add(
      "error",
      "summary-mc-killer-weak-b-trap",
      "KILLER SUMMARY_COMPLETE_MC needs a genuinely tempting wrong blankB paired with the correct blankA.",
    );
  }
  if (blankAFamily && !hasCompetitiveAWithCorrectB) {
    add(
      "error",
      "summary-mc-killer-weak-a-trap",
      "KILLER SUMMARY_COMPLETE_MC needs a genuinely tempting wrong blankA paired with the correct blankB.",
    );
  }
  if (blankBFamily && strongBTrapBuriedBehindWrongA && !hasCompetitiveBWithCorrectA) {
    add(
      "error",
      "summary-mc-killer-buried-b-trap",
      "A strong blankB trap is paired with an easily removable blankA; pair it with the correct blankA instead.",
    );
  }
  if (blankAFamily && strongATrapBuriedBehindWrongB && !hasCompetitiveAWithCorrectB) {
    add(
      "error",
      "summary-mc-killer-buried-a-trap",
      "A strong blankA trap is paired with an easily removable blankB; pair it with the correct blankB instead.",
    );
  }

  const plausibleWrongACount = new Set(
    wrongPairs
      .map((pair) => pair.blankA)
      .filter((value) => sameSummarySemanticField(value, blankA))
      .map(normalizeComparableText),
  ).size;
  const plausibleWrongBCount = new Set(
    wrongPairs
      .map((pair) => pair.blankB)
      .filter((value) => sameSummarySemanticField(value, blankB))
      .map(normalizeComparableText),
  ).size;

  if (blankAFamily && plausibleWrongACount < 1) {
    add(
      "error",
      "summary-mc-killer-too-easy-a-column",
      "KILLER SUMMARY_COMPLETE_MC blankA column is too easy; include at least one same-field wrong blankA.",
    );
  }
  if (blankBFamily && plausibleWrongBCount < 1) {
    add(
      "error",
      "summary-mc-killer-too-easy-b-column",
      "KILLER SUMMARY_COMPLETE_MC blankB column is too easy; include at least one same-field wrong blankB.",
    );
  }
}



export const SUMMARY_SEMANTIC_FAMILIES: Record<string, string[]> = {
  altruistic: [
    "altruistic",
    "cooperative",
    "supportive",
    "prosocial",
    "communal",
    "collaborative",
    "helpful",
    "helping",
    "caregiving",
    "nurturing",
    "selfless",
    "family-oriented",
    "intergenerational",
  ],
  evolutionary: [
    "evolutionary",
    "evolutionarily",
    "evolved",
    "adaptive",
    "adaptively",
    "biological",
    "biologically",
    "genetic",
    "genetically",
    "hereditary",
    "hereditarily",
    "inherited",
    "heritable",
    "generational",
    "generationally",
    "reproductive",
    "reproductively",
    "selected",
    "selective",
  ],
  responsibility: [
    "responsibility",
    "responsible",
    "accountability",
    "accountable",
    "judgment",
    "judgement",
    "ethical",
    "moral",
    "value-based",
    "human",
    "decision-making",
  ],
  technology: [
    "technological",
    "technology",
    "technical",
    "digital",
    "algorithmic",
    "automated",
    "mechanical",
    "computational",
  ],
  equality: [
    "equality",
    "equity",
    "equitable",
    "opportunity",
    "inclusive",
    "access",
    "accessible",
    "participation",
    "social",
  ],
  environmental: [
    "environmental",
    "ecological",
    "sustainable",
    "green",
    "local",
    "urban",
    "community",
    "communal",
    "social",
  ],
};



export function summarySemanticFamily(value: string): string | null {
  const normalized = normalizeComparableText(value);
  if (!normalized) return null;
  for (const [family, words] of Object.entries(SUMMARY_SEMANTIC_FAMILIES)) {
    if (words.some((word) => normalized.includes(normalizeComparableText(word)))) {
      return family;
    }
  }
  return null;
}



export function sameSummarySemanticField(candidate: string, correct: string): boolean {
  const candidateComparable = normalizeComparableText(candidate);
  const correctComparable = normalizeComparableText(correct);
  if (!candidateComparable || !correctComparable || candidateComparable === correctComparable) {
    return false;
  }

  const candidateFamily = summarySemanticFamily(candidate);
  const correctFamily = summarySemanticFamily(correct);
  if (candidateFamily && correctFamily && candidateFamily === correctFamily) {
    return true;
  }

  const candidateTokens = contentTokens(candidate);
  const correctTokens = contentTokens(correct);
  if (candidateTokens.size > 0 && correctTokens.size > 0) {
    return countTokenOverlap(candidateTokens, correctTokens) > 0;
  }

  return (
    candidateComparable.length >= 6 &&
    correctComparable.length >= 6 &&
    (candidateComparable.includes(correctComparable.slice(0, 6)) ||
      correctComparable.includes(candidateComparable.slice(0, 6)))
  );
}
