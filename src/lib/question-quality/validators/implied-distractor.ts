// Split from question-quality.ts — shared helpers in core.ts, public API via index.ts barrel.
import { IRRELEVANT_TOKEN_STOPWORDS, contentTokens, countTokenOverlap, findMarkers, lightStemContentToken, normalizeComparableText, normalizeLabel, normalizeText, splitPassageSentences } from "../core";



export function countAttractiveImpliedMeaningWrongOptions(
  options: Record<string, unknown>[],
  correctLabels: string[],
  passage: string,
  correctText: string,
  underlinedExpression: string,
  impliedMeaning: string,
): number {
  const passageTokens = contentTokens(passage);
  const correctTokens = meaningTokens(correctText);
  const impliedTokens = meaningTokens(impliedMeaning || underlinedExpression);
  const correctLabelSet = new Set(correctLabels);

  return options
    .filter((option) => !correctLabelSet.has(normalizeLabel(option.label)))
    .filter((option) => {
      const text = normalizeText(option.text);
      const tokens = meaningTokens(text);
      return (
        text.length >= 18 ||
        countTokenOverlap(contentTokens(text), passageTokens) >= 1 ||
        countMeaningTokenOverlap(tokens, correctTokens) >= 1 ||
        countMeaningTokenOverlap(tokens, impliedTokens) >= 1
      );
    }).length;
}



export function isQuestionLikeImpliedMeaningTarget(expression: string): boolean {
  const text = expression.trim();
  return /[?？]\s*$/.test(text);
}


export function findExpressionSentenceContext(
  passage: string,
  expression: string,
): { previous: string; sentence: string; next: string } | null {
  const sentences = splitPassageSentences(passage, { includeShort: true });
  const comparableExpression = normalizeComparableText(expression).replace(/[.!?]+$/, "");
  if (!comparableExpression) return null;

  const index = sentences.findIndex((sentence) =>
    normalizeComparableText(sentence).includes(comparableExpression),
  );
  if (index === -1) return null;

  return {
    previous: sentences[index - 1] ?? "",
    sentence: sentences[index],
    next: sentences[index + 1] ?? "",
  };
}



export function findExpressionSentenceContextWithIndex(
  passage: string,
  expression: string,
): { previous: string; sentence: string; next: string; index: number; total: number } | null {
  const sentences = splitPassageSentences(passage, { includeShort: true });
  const comparableExpression = normalizeComparableText(expression).replace(/[.!?]+$/, "");
  if (!comparableExpression) return null;

  const index = sentences.findIndex((sentence) =>
    normalizeComparableText(sentence).includes(comparableExpression),
  );
  if (index === -1) return null;

  return {
    previous: sentences[index - 1] ?? "",
    sentence: sentences[index],
    next: sentences[index + 1] ?? "",
    index,
    total: sentences.length,
  };
}



export function isCentralImpliedMeaningTarget(
  sentence: string,
  sentenceIndex: number,
  sentenceCount: number,
  expression: string,
): boolean {
  if (isPeripheralDetailImpliedMeaningTarget(sentence, expression)) return false;
  if (hasCentralClaimCue(sentence)) return true;
  if (hasFigurativeOrCompressedSignal(expression)) return true;
  if (hasOpeningContrastSignal(sentence, sentenceIndex, expression)) return true;
  if (hasConclusionContrastSignal(sentence, sentenceIndex, sentenceCount, expression)) return true;
  if (sentenceIndex >= Math.max(0, sentenceCount - 2) && hasCentralSentenceSignal(sentence)) return true;
  return false;
}

export function hasCentralClaimCue(sentence: string): boolean {
  return /\b(?:central issue|in the end|for that reason|therefore|thus|consequently|as a result|this is why|the point|the lesson|a durable solution|a serious .* must|must therefore|not whether|not merely|not simply|not the same as|rather than|instead of|does not mean|it shows that|ultimately|the craft of|the result is|the consequence is)\b/i.test(sentence);
}

export function hasCentralSentenceSignal(sentence: string): boolean {
  return /\b(?:challenge|risk|value|lesson|implication|claim|conclusion|responsibility|solution|policy|learning|teaching|obstacles?|evidence|attention|change|benefit|access|justice|knowledge|promise|translation|labeling|restoration|conversation|judgment|machinery|instrument|archive|belonging|memory|public|practice|defect|history|author|action|tasks?|care|tourism|reef|fragile|means?|suggests?|implies?|reveals?|reflects?|demonstrates?|represents?|serves?|functions?|must|should)\b/i.test(sentence);
}

export function hasFigurativeOrCompressedSignal(expression: string): boolean {
  return /\b(?:creatures?|beggar|grave|mirror|lens|map|upstream|downstream|weight|carry|carries|sculpt|sculpting|craft|discipline|archive|underfoot|absence|lack|instruments?|hinge|house|walls?|blindness|context|obstacles?|signpost|glass wall|blank page|civic architecture|civic promise|promise|negotiation|negotiating|famous and fragile|fragile|changed hands|conversation with the past|painted on a wall|shared instrument|history for a defect|hidden assumption|author of action|wallet with invisible doors|invisible doors|grammar|sentence|delivery of tasks|written|reorganized|shifted|tool that helps|changed what counted|lies between|less public|trapped)\b/i.test(expression);
}

export function hasOpeningContrastSignal(
  sentence: string,
  sentenceIndex: number,
  expression: string,
): boolean {
  if (sentenceIndex > 1) return false;
  const expressionHasContrast = /\b(?:but|yet|however|too narrow|not merely|not simply|rather than|instead of|does not mean)\b/i.test(expression);
  const sentenceFramesClaim = /\b(?:often described|simple replacement|too narrow|picture|view|assumption|not merely|not simply|rather than|instead of|does not mean)\b/i.test(sentence);
  return expressionHasContrast && sentenceFramesClaim;
}

export function hasConclusionContrastSignal(
  sentence: string,
  sentenceIndex: number,
  sentenceCount: number,
  expression: string,
): boolean {
  if (sentenceIndex < Math.max(0, sentenceCount - 2)) return false;
  const expressionHasContrast = /\b(?:while|whereas|although|but|yet|rather than|instead of|remaining|not merely|not simply)\b/i.test(expression);
  const sentenceFramesWarning = /\b(?:otherwise|therefore|thus|consequently|as a result|must|should|unsafe|risk|dangerous|harm|vulnerable|exposed|fails?|failure|not enough)\b/i.test(sentence);
  return expressionHasContrast && sentenceFramesWarning;
}

export function isPeripheralDetailImpliedMeaningTarget(sentence: string, expression: string): boolean {
  if (hasCentralClaimCue(sentence)) return false;
  const sentenceHasLocalDetailCue = /\b(?:for example|for instance|in a pilot|pilot lesson|pilot study|study|experiment|survey|participants?|students?\s+(?:used|watched|read|wrote|selected|reported)|researchers?|classroom|cafeteria|dashboard|lesson|minutes?|hours?|notes?|cards?|colors?|yellow|blue|red|green|food|waste)\b/i.test(sentence);
  const expressionLooksLikeLocalDetail = /\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|yellow|blue|red|green|sticky|polished|mirror|dashboard|food|waste|notes?|cards?|minutes?|hours?|students?|participants?|teachers?|classroom|cafeteria|lesson|pilot)\b/i.test(expression);
  return sentenceHasLocalDetailCue && expressionLooksLikeLocalDetail;
}


export function findDirectAnswerLeakage(expression: string, nextSentence: string): string | null {
  if (!nextSentence) return null;

  const expressionText = normalizeComparableText(expression);
  const nextText = normalizeComparableText(nextSentence);
  const questionLike = isQuestionLikeImpliedMeaningTarget(expression);
  const placeholderLike = /\b(?:something|somewhere|someone|somebody|what|why|how)\b/i.test(expressionText);

  if ((questionLike || placeholderLike) && hasDirectExplanationCue(nextSentence)) {
    return nextSentence.slice(0, 120);
  }

  if (hasFigurativeOrCompressedSignal(expression) && hasDirectExplanationCue(nextSentence)) {
    return nextSentence.slice(0, 120);
  }

  if (
    /\bbased on (?:something|what|why|which)\b/i.test(expressionText) &&
    /\bbased on\b/i.test(nextText)
  ) {
    return nextSentence.slice(0, 120);
  }

  if (
    /\breasons?\b/i.test(expressionText) &&
    /\breasons?\b[\s\S]{0,80}\b(?:ultimately|based on|come from|derive from)\b/i.test(nextSentence)
  ) {
    return nextSentence.slice(0, 120);
  }

  return null;
}

export function findSameSentenceDirectAnswerLeakage(expression: string, sentence: string): string | null {
  if (!sentence) return null;
  const expressionIndex = normalizeComparableText(sentence).indexOf(normalizeComparableText(expression));
  if (expressionIndex === -1) return null;
  const afterExpression = sentence.slice(expressionIndex + expression.length);
  if (
    afterExpression.length <= 180 &&
    /\b(?:that is|namely|in other words|this means|that means|meaning that|which means)\b/i.test(afterExpression)
  ) {
    return afterExpression.slice(0, 120);
  }
  return null;
}


export function hasDirectExplanationCue(sentence: string): boolean {
  return /\b(?:the answer|this means|that means|in other words|that is|namely|ultimately|is based on|are based on|based on|is that|are that|because|since|therefore|thus|for this reason)\b/i.test(sentence);
}



export function hasSurfaceHiddenGapSignal(expression: string, reasoningGap: string): boolean {
  const combined = `${expression} ${reasoningGap}`;
  return (
    /\b(?:not merely|not simply|rather than|instead of|while|although|whereas|but|yet|creatures?|beggar|currency|map|mirror|bridge|mask|lens|architecture|grave|shadow|tool|upstream|downstream|answerable|reorganized|surface|hidden|literal|metaphor|표면|직역|비유|압축|대조|역설|겉보기|실제|함축|간극)\b/i.test(combined) ||
    /[가-힣]*(?:표면|직역|비유|압축|대조|역설|겉보기|실제|함축|간극)[가-힣]*/.test(combined)
  );
}



export function findImpliedMeaningAbsoluteGiveawayOption(
  options: Record<string, unknown>[],
  correctLabels: string[],
  passage: string,
): string | null {
  const passageText = normalizeComparableText(passage);
  const correctLabelSet = new Set(correctLabels);
  const cues: Array<[string, RegExp, RegExp?]> = [
    ["완전히", /완전(?:히|하게)/, /\b(?:completely|entirely|fully)\b/i],
    ["완전히 극복/해결", /완전(?:히|하게)\s*(?:극복|해소|해결|제거|사라지|대체)/, /\b(?:completely|entirely|fully)\s+(?:overcome|solve|eliminate|remove|replace)\b/i],
    ["전적으로", /전적(?:으로|인)/, /\b(?:entirely|solely|exclusively)\b/i],
    ["항상", /항상/, /\balways\b/i],
    ["언제나", /언제나/, /\balways\b/i],
    ["절대", /절대/, /\bnever\b/i],
    ["오직", /오직/, /\b(?:only|solely|exclusively)\b/i],
    ["무조건", /무조건/, /\bwithout exception\b/i],
    ["반드시", /반드시/, /\bmust\b/i],
    ["예외 없이", /예외\s*없이/, /\bwithout exception\b/i],
    ["해야만", /(?:해야만|하여야만|일\s*때만)/],
    ["만을/만이/만으로", /(?:만을|만이|만으로(?:는|도)?)/],
    ["배제", /배제/],
    ["완벽한/완벽하게", /완벽(?:한|히|하게)?/],
    ["완벽하게 이해/설명/해결", /완벽(?:히|하게)?\s*(?:이해|파악|분석|설명|해결|예측|통제|보장|대체)/, /\bperfect(?:ly)?\s+(?:understand|grasp|analyze|explain|solve|predict|control|guarantee|replace)\b/i],
    ["always", /\balways\b/i],
    ["never", /\bnever\b/i],
    ["completely", /\bcompletely\b/i],
    ["entirely", /\bentirely\b/i],
    ["solely", /\bsolely\b/i],
    ["exclusively", /\bexclusively\b/i],
    ["only", /\bonly\b/i],
  ];

  for (const option of options) {
    if (correctLabelSet.has(normalizeLabel(option.label))) continue;
    const text = normalizeText(option.text);
    for (const [label, pattern, passagePattern] of cues) {
      if (!pattern.test(text)) continue;
      if (passagePattern?.test(passage) || passageText.includes(label.toLowerCase())) {
        continue;
      }
      return `${normalizeText(option.label) || "wrong option"} contains "${label}"`;
    }
  }

  return null;
}

export function extractSingleUnderlineMarkerText(text: string): string | null {
  const markers = findMarkers(text);
  return markers.length === 1 ? normalizeText(markers[0].inner) : null;
}



export function meaningTokens(text: string): Set<string> {
  const tokens = text
    .toLowerCase()
    .match(/[a-z][a-z'-]{3,}|[가-힣]{2,}/g) ?? [];
  const content = new Set<string>();
  for (const token of tokens) {
    if (IRRELEVANT_TOKEN_STOPWORDS.has(token)) continue;
    content.add(token);
    if (/^[a-z]/.test(token)) {
      const stem = lightStemContentToken(token);
      if (stem !== token && !IRRELEVANT_TOKEN_STOPWORDS.has(stem)) {
        content.add(stem);
      }
    }
  }
  return content;
}



export const countMeaningTokenOverlap = countTokenOverlap;



export function englishWordCount(text: string): number {
  return (text.match(/[A-Za-z]+(?:[-'][A-Za-z]+)*/g) ?? []).length;
}
