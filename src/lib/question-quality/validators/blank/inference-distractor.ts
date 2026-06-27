// Split from question-quality.ts — shared helpers in core.ts, public API via index.ts barrel.
import { contentTokens, countContentTokens, countTokenOverlap, countWordsForQuality, isLowValueKillerBlankTarget, normalizeLabel, normalizeText } from "../../core";



export function findStandardBlankKillerIssue(
  originalExpression: string,
): { code: string; message: string } | null {
  const sourceContentCount = countContentTokens(originalExpression);
  const sourceWordCount = countWordsForQuality(originalExpression);
  if (
    sourceWordCount < 6 ||
    sourceContentCount < 5 ||
    isLowValueKillerBlankTarget(originalExpression)
  ) {
    return {
      code: "blank-killer-target-too-easy",
      message:
        "KILLER BLANK_INFERENCE target is too local or surface-level; choose a central claim, relation, contrast, or evaluative turn with enough conceptual load.",
    };
  }

  return null;
}



export function countAttractiveBlankWrongOptions(
  options: Record<string, unknown>[],
  correctLabel: string,
  passage: string,
  correctText: string,
): number {
  const passageTokens = contentTokens(passage);
  const correctTokens = contentTokens(correctText);
  return options
    .filter((option) => normalizeLabel(option.label) !== correctLabel)
    .filter((option) => {
      const text = normalizeText(option.text);
      const tokens = contentTokens(text);
      const passageOverlap = countTokenOverlap(tokens, passageTokens);
      const correctOverlap = countTokenOverlap(tokens, correctTokens);
      return (
        passageOverlap >= 2 ||
        correctOverlap >= 1 ||
        (hasNegationCue(text) && passageOverlap >= 1)
      );
    }).length;
}



export function hasNegationCue(text: string): boolean {
  if (!text) return false;
  if (/\b(?:cannot|can't|not|never|no|none|neither|nor|little|few|hardly|rarely|scarcely|seldom|without|fail|fails|failed|failing|failure|lack|lacks|lacking|absence|absent|devoid|barrier|obstacle|enemy|unable|impossible|irrational|prevent|prevents|preventing|keep|keeps|keeping|exclude|excludes|excluding|eliminate|eliminates|eliminating|reject|rejects|rejecting|neglect|neglects|neglecting|collapse|collapses|collapsing|erosion|erode|erodes|eroding|compromise|compromises|compromising|undermine|undermines|undermining|disconnect|disconnects|disconnected|isolate|isolates|isolated|drift|drifts|drifting)\b/i.test(text)) {
    return true;
  }
  if (/\b(?:non-[a-z]+|nonreason|nonrational|unconnected|unchanged|unclear|uncertain|undefended|unprotected|uncontrolled|unfocused|unproductive|unresolved|unjustified|incapable|incomplete|inaccurate|inconsistent|insufficient|ineffective|imprecise|imbalanced|irrelevant|irregular|disordered|disorganized|misdirected|misleading)\b/i.test(text)) {
    return true;
  }
  if (/\b(?:anything but|nothing but|other than|free from|not based on|not derived from|not a result of|not beyond|not independent of|not distorted by|not undermining|rather than)\b/i.test(text)) {
    return true;
  }
  return false;
}



export function negationCueCount(text: string): number {
  if (!text) return 0;
  const patterns = [
    /\b(?:cannot|can't|not|never|no|none|neither|nor|little|few|hardly|rarely|scarcely|seldom|without|fail|fails|failed|failing|failure|lack|lacks|lacking|absence|absent|devoid|unable|impossible)\b/gi,
    /\b(?:prevent|prevents|preventing|keep|keeps|keeping|free from|anything but|nothing but|other than|exclude|excludes|excluding|undermine|undermines|undermining|compromise|compromises|compromising)\b/gi,
    /\b(?:non-[a-z]+|nonreason|nonrational|unconnected|unchanged|unclear|uncertain|undefended|unprotected|uncontrolled|unfocused|unproductive|unresolved|unjustified|incapable|incomplete|inaccurate|inconsistent|insufficient|ineffective|imprecise|imbalanced|irrelevant|irregular|disconnected|disordered|disorganized|misdirected|misleading)\b/gi,
  ];
  return patterns.reduce((sum, pattern) => sum + [...text.matchAll(pattern)].length, 0);
}



export function findNegativeParaphraseSlotIssue(
  blankCarrierText: string,
  correctText: string,
): { code: string; message: string } | null {
  const blankIndex = blankCarrierText.indexOf("_____");
  if (blankIndex < 0) return null;

  const leftOfBlank = blankCarrierText.slice(0, blankIndex);
  const followsCopula = /\b(?:is|are|was|were|be|being|been|become|becomes|became|remain|remains|seem|seems)\s+$/i.test(leftOfBlank);
  const followsPreposition = /\b(?:by|of|to|for|with|without|from|in|on|at|as|than|about|toward|towards)\s+$/i.test(leftOfBlank);
  const followsModal = /\b(?:can|could|should|would|will|must|may|might)\s+$/i.test(leftOfBlank);
  const followsModalBe = /\b(?:can|could|should|would|will|must|may|might)(?:\s+\w+ly)?\s+be\s+$/i.test(leftOfBlank);
  const followsInfinitiveTo = /\bto\s+$/i.test(leftOfBlank);
  const startsLikeFinitePredicate = /^(?:do|does|did|can(?:not)?|can't|could|couldn't|will|won't|would|wouldn't|should|shouldn't|must|might|may|prevent|prevents|keep|keeps|make|makes|allow|allows|refuse|refuses|fail|fails)\b/i.test(correctText);
  const startsLikeAuxiliaryPredicate = /^(?:do|does|did|cannot|can't|can|could|should|would|will|must|may|might|is|are|was|were|has|have|had)\b/i.test(correctText);
  const startsLikeNegatedComplement = /^(?:not|no|never)\b/i.test(correctText);
  const startsLikePrepositionalPhrase = /^(?:without|with|by|of|from|to|in|on|at|for|as|than|about|toward|towards)\b/i.test(correctText);

  if (followsCopula && startsLikeFinitePredicate) {
    return {
      code: "negative-paraphrase-copula-slot-mismatch",
      message: "Correct option does not fit a be/linking-verb complement slot.",
    };
  }

  if (followsPreposition && startsLikePrepositionalPhrase) {
    return {
      code: "negative-paraphrase-stacked-prepositions",
      message: "Correct option creates stacked prepositions in the blank sentence.",
    };
  }

  if ((followsModal || followsInfinitiveTo) && startsLikeAuxiliaryPredicate) {
    return {
      code: "negative-paraphrase-verb-slot-mismatch",
      message: "Correct option does not fit the verb phrase slot after a modal or infinitive marker.",
    };
  }

  if (followsModalBe && startsLikeNegatedComplement) {
    return {
      code: "negative-paraphrase-modal-be-negated-complement",
      message: "Correct option creates awkward modal-be + negated complement phrasing.",
    };
  }

  return null;
}



export function findTangledNegativeParaphraseIssue(
  correctText: string,
): { code: string; message: string } | null {
  const normalized = normalizeText(correctText);
  const cueCount = negationCueCount(normalized);
  if (cueCount > 3) {
    return {
      code: "negative-paraphrase-too-many-negation-cues",
      message: `Correct option has too many negation cues (${cueCount}) and may become logically unstable.`,
    };
  }

  if (
    /\bnot\b[\s\S]+\bwithout\b/i.test(normalized) ||
    /\bwithout\b[\s\S]+\bnot\b/i.test(normalized) ||
    /\bfail\w*\b[\s\S]+\bwithout\b/i.test(normalized) ||
    /\bwithout\b[\s\S]+\bfail\w*\b/i.test(normalized) ||
    /\bfail\w*\b[\s\S]+\bfail\w*\b/i.test(normalized) ||
    /\bunable\b[\s\S]+\bwithout\b/i.test(normalized) ||
    /\bwithout\b[\s\S]+\bunable\b/i.test(normalized) ||
    /\bimpossible\b[\s\S]+\bwithout\b/i.test(normalized) ||
    /\bwithout\b[\s\S]+\bimpossible\b/i.test(normalized) ||
    /\b(?:excluding|exclude|excludes)\b[\s\S]+\b(?:past|previous|spent|investment|investments)\b/i.test(normalized) ||
    /\b(?:past|previous|spent|investment|investments)\b[\s\S]+\b(?:excluding|exclude|excludes)\b/i.test(normalized)
  ) {
    return {
      code: "negative-paraphrase-tangled-negation",
      message: "Correct option uses tangled or logically unstable negation.",
    };
  }

  return null;
}



export function findNoSubjectDoubleNegationIssue(
  blankCarrierText: string,
  correctText: string,
): { code: string; message: string } | null {
  const option = normalizeText(correctText);
  const completedSentence = normalizeText(blankCarrierText.replace("_____", option));
  const offending =
    findNoSubjectPlusNegativePredicate(option) ||
    findNoSubjectPlusNegativePredicate(completedSentence);
  if (!offending) return null;

  return {
    code: "negative-paraphrase-no-subject-double-negation",
    message: `Avoid no-subject + negative predicate double negation in DOUBLE_NEGATIVE blanks: "${offending}".`,
  };
}



export function findNoSubjectPlusNegativePredicate(text: string): string | null {
  const normalized = normalizeText(text);
  const patterns = [
    /\bno\s+(?!matter\b)(?:[A-Za-z][A-Za-z'-]*\s+){0,7}(?:do|does|did)\s+not\b[^.;:,]*/i,
    /\bno\s+(?!matter\b)(?:[A-Za-z][A-Za-z'-]*\s+){0,7}(?:is|are|was|were|be|being|been)\s+not\b[^.;:,]*/i,
    /\bno\s+(?!matter\b)(?:[A-Za-z][A-Za-z'-]*\s+){0,7}(?:can|could|should|would|will|must|may|might)\s+not\b[^.;:,]*/i,
    /\bno\s+(?!matter\b)(?:[A-Za-z][A-Za-z'-]*\s+){0,7}(?:cannot|can't|don't|doesn't|didn't|isn't|aren't|wasn't|weren't|won't|wouldn't|shouldn't|couldn't)\b[^.;:,]*/i,
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match) return match[0];
  }
  return null;
}



export function crossesStrongContrastBoundary(text: string): boolean {
  return (
    /\b(?:but because|but whether)\b/i.test(text) ||
    /\bnot\s+whether\b[\s\S]+\bbut\b/i.test(text) ||
    /[,;]\s*(?:rather|instead)\b/i.test(text)
  );
}



export function findAdjacentBlankConclusionIssue(
  passageWithBlank: string,
  correctText: string,
): { code: string; message: string } | null {
  const nextSentence = extractSentenceAfterBlank(passageWithBlank);
  if (!nextSentence || !hasConclusionSignal(nextSentence)) return null;

  if (
    mentionsReducedForeignDependence(nextSentence) &&
    stressesImportRelianceWithoutBalance(correctText)
  ) {
    return {
      code: "blank-adjacent-conclusion-conflict",
      message:
        "Correct option stresses import reliance but the adjacent conclusion says the strategy reduces excessive foreign dependence.",
    };
  }

  if (
    mentionsBalancedResilience(nextSentence) &&
    usesAbsoluteDisruptionClaim(correctText)
  ) {
    return {
      code: "blank-result-declaration",
      message:
        "Correct option declares an absolute no-disruption result instead of supporting the adjacent balanced/resilient strategy.",
    };
  }

  return null;
}



export function extractSentenceAfterBlank(passageWithBlank: string): string {
  const blankIndex = passageWithBlank.indexOf("_____");
  if (blankIndex < 0) return "";

  const sentenceEndCandidates = [".", "!", "?"]
    .map((mark) => passageWithBlank.indexOf(mark, blankIndex))
    .filter((index) => index >= 0);
  if (!sentenceEndCandidates.length) return "";

  const currentSentenceEnd = Math.min(...sentenceEndCandidates);
  const rest = passageWithBlank.slice(currentSentenceEnd + 1).trim();
  if (!rest) return "";

  const nextEndCandidates = [".", "!", "?"]
    .map((mark) => rest.indexOf(mark))
    .filter((index) => index >= 0);
  const nextEnd = nextEndCandidates.length
    ? Math.min(...nextEndCandidates)
    : rest.length;

  return normalizeText(rest.slice(0, nextEnd + 1));
}



export function hasConclusionSignal(text: string): boolean {
  return /\b(?:by adopting this strategy|therefore|thus|for this reason|as a result|in this way|consequently|accordingly)\b/i.test(text);
}



export function mentionsReducedForeignDependence(text: string): boolean {
  return /\breduc\w*\s+(?:excessive\s+)?dependence\s+on\s+(?:foreign|external|overseas)\b/i.test(text) ||
    /\breduc\w*[\s\S]+\bforeign sources\b/i.test(text);
}



export function mentionsBalancedResilience(text: string): boolean {
  return /\b(?:balanced|resilient|resilience|diversified|diversify)\b/i.test(text);
}



export function stressesImportRelianceWithoutBalance(text: string): boolean {
  if (!/\b(?:imports?|imported|importing|foreign suppliers?|foreign sources?|foreign grain producers?|import supply chains?)\b/i.test(text)) {
    return false;
  }

  const hasBalanceCue = /\b(?:diversif\w*|domestic|balanced|resilien\w*|reduc\w*|excessive|less|limit\w*|avoid\w* overdependence|multiple|reserve|stockpile|long-term contracts?)\b/i.test(text);
  const hasImportEscalation = /\b(?:solely|only|entirely|exclusively|unlimited|complete|heavily|heavy|avoid domestic|replace domestic)\b/i.test(text);
  return hasImportEscalation && !hasBalanceCue;
}



export function usesAbsoluteDisruptionClaim(text: string): boolean {
  return /\b(?:not|never|no|without)\s+(?:allow(?:ing)?|permit(?:ting)?|tolerat(?:e|ing))\s+(?:any|all)\s+disruption\b/i.test(text) ||
    /\bnot\s+allow\s+any\s+disruption\b/i.test(text);
}



export function isStrongDoubleNegativeSourceSentence(text: string): boolean {
  if (!text) return false;
  const strongLexicalCue = /\b(?:cannot|can't|can\s+not|not|never|no|none|neither|nor|without|fail|fails|failed|failing|lack|lacks|lacking|not merely|not only)\b/i.test(text);
  if (!strongLexicalCue && /\b(?:such as|including|for example)\b/i.test(text)) {
    return false;
  }
  const hasStrongCue =
    strongLexicalCue ||
    /\b(?:non-[a-z]+|anything but|other than|free from)\b/i.test(text);
  const hasRelationalCue = /\b(?:since|because|that|as|but|rather|rather than|while|whereas|unless|if|when|means?|implies?|suggests?)\b/i.test(text);
  return hasStrongCue && hasRelationalCue;
}



export function hasOnlyWeakNegationCue(text: string): boolean {
  if (!hasNegationCue(text)) return false;
  return (
    /\b(?:little|few|hardly|rarely|scarcely)\b/i.test(text) &&
    !isStrongDoubleNegativeSourceSentence(text)
  );
}



export function extractBlankCarrierText(passageWithBlank: string): string {
  const blankIndex = passageWithBlank.indexOf("_____");
  if (blankIndex < 0) return passageWithBlank;

  const leftBoundary = Math.max(
    passageWithBlank.lastIndexOf(".", blankIndex - 1),
    passageWithBlank.lastIndexOf("!", blankIndex - 1),
    passageWithBlank.lastIndexOf("?", blankIndex - 1),
  );
  const rightPeriod = passageWithBlank.indexOf(".", blankIndex);
  const rightExclamation = passageWithBlank.indexOf("!", blankIndex);
  const rightQuestion = passageWithBlank.indexOf("?", blankIndex);
  const rightCandidates = [rightPeriod, rightExclamation, rightQuestion]
    .filter((index) => index >= 0);
  const rightBoundary = rightCandidates.length
    ? Math.min(...rightCandidates)
    : passageWithBlank.length;

  return passageWithBlank
    .slice(leftBoundary + 1, rightBoundary + 1)
    .replace(/\s+/g, " ")
    .trim();
}



export function requiresCompleteClauseAfterConnector(blankCarrierText: string): boolean {
  return /\b(?:since|because|that)\s+_____/.test(blankCarrierText);
}



export function startsWithoutClauseSubject(text: string): boolean {
  return /^(?:cannot|can't|can\s+not|can|could|should|would|will|must|may|might|do|does|did|is|are|was|were|be|being|been|has|have|had|fail|fails|failed|failing)\b/i.test(text.trim());
}



export function findAwkwardBlankOptionPhrase(text: string): string | null {
  const patterns = [
    "rational tool",
    "rational tools",
    "cognitive preference",
    "cognitive preferences",
    "impulsive desire",
    "impulsive desires",
    "ultimate emotional foundation",
    "emotional distractions",
    "intellectual choices",
    "lack of erosion",
    "absence of erosion",
    "that lack of",
    "which lack of",
    "following evaluations or estimations",
    "act as an active filter",
    "active filter amidst",
    "global cultural influxes",
    "external cultural influxes",
    "cultural influxes",
    "sovereignly filtering",
    "moral terrains",
    "environmental degraders",
    "degraders",
    "making degraders",
    "degraders internalize",
    "financial accountability of their ecological footprint",
    "property of shared choices",
    "synergistic channels",
    "collective boundaries",
    "compassionate comprehension",
    "compromising alternatives",
    "reality that envelopes us",
    "envelopes us",
  ];
  const normalized = text.toLowerCase();
  const listedPattern = patterns.find((pattern) => normalized.includes(pattern));
  if (listedPattern) return listedPattern;

  const regexPatterns: Array<{ pattern: RegExp; label: string }> = [
    {
      pattern: /\bachievements?\s+from\s+failing\b/i,
      label: "achievement(s) from failing",
    },
    {
      pattern: /\bachievements?\s+(?:can\s+|could\s+|will\s+|would\s+)?(?:fail|fails|failed|failing)\b/i,
      label: "achievement(s) failing",
    },
    {
      pattern: /\bachieved\s+success\b/i,
      label: "achieved success",
    },
    {
      pattern: /\bcapacity\s+to\s+lack\b/i,
      label: "capacity to lack",
    },
    {
      pattern: /\bguarantee\s+major\s+crops\b/i,
      label: "guarantee major crops",
    },
    {
      pattern: /\bnot\s+allow\s+any\s+disruption\b/i,
      label: "not allow any disruption",
    },
    {
      pattern: /\bevents?\s+(?:can\s+|could\s+|will\s+|would\s+)?(?:not\s+)?survive\b/i,
      label: "event(s) survive",
    },
    {
      pattern: /\bcan\s+(?:certainly\s+|clearly\s+|fully\s+|really\s+)?be\s+not\b/i,
      label: "can be not",
    },
  ];
  return regexPatterns.find(({ pattern }) => pattern.test(text))?.label ?? null;
}



export function findContextualAwkwardBlankOptionPhrase(
  blankCarrierText: string,
  optionText: string,
): string | null {
  const blankIndex = blankCarrierText.indexOf("_____");
  const leftOfBlank =
    blankIndex >= 0 ? blankCarrierText.slice(0, blankIndex) : "";

  if (
    /\b(?:by|of|to|for|with|without|from|in|on|at|as|than|about|toward|towards)\s+$/i.test(leftOfBlank) &&
    /^(?:by|of|to|for|with|without|from|in|on|at|as|than|about|toward|towards)\b/i.test(optionText)
  ) {
    return "stacked prepositions";
  }

  if (
    /\bways?\s+in\s+which\s+$/i.test(leftOfBlank) &&
    /\bways?\s+in\s+which\b/i.test(optionText)
  ) {
    return "duplicated ways in which";
  }

  if (
    /\bprocess\s+by\s+which\s+$/i.test(leftOfBlank) &&
    /\bprocess\s+by\s+which\b/i.test(optionText)
  ) {
    return "duplicated process by which";
  }

  const blankSubjectSuggestsEvent =
    /\b(?:events?|phenomena|processes|consequences|effects|outcomes)\s+_____/.test(blankCarrierText);
  if (blankSubjectSuggestsEvent && /^(?:can(?:not)?|can't|could|will|would|do\s+not|does\s+not|cannot)\s+survive\b/i.test(optionText)) {
    return "event(s) survive";
  }

  return null;
}



export function findOddCapitalizedOptionToken(text: string): string | null {
  const matches = text.matchAll(/\b[A-Z][a-z]{2,}\b/g);
  for (const match of matches) {
    if (match.index === 0) continue;
    return match[0];
  }
  return null;
}
