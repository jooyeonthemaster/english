// Split from question-quality.ts — shared helpers in core.ts, public API via index.ts barrel.
import { CandidateDiversityOptions, buildSurroundingWindow, filterUsedCandidates, rotateByVariantIndex } from "./shared";
import { countContentTokens, countImpliedMeaningLexicalUnits, countWordsForQuality, hasTrailingFunctionWord, isSingleEnglishToken, isTinyFunctionWord, normalizeComparableText, normalizeText, splitPassageSentences } from "../core";



export function buildImpliedMeaningCandidateBlock(
  passage: string,
  requestedDifficulty?: string,
  diversity?: CandidateDiversityOptions,
): string {
  const sentences = splitPassageSentences(passage);
  const candidates = rotateByVariantIndex(
    filterUsedCandidates(
      findImpliedMeaningCandidates(passage),
      diversity?.usedTargets,
      (candidate) => candidate.expression,
    ).items,
    diversity?.variantIndex,
  ).slice(0, 10);

  if (candidates.length === 0) {
    return [
      "## IMPLIED_MEANING target planning guardrail",
      "- No strong automatic candidate was detected, but you may still generate a valid item.",
      "- Choose an exact SHORT phrase or clause from the passage whose meaning depends on surrounding logic. Keep it ≤6 words; never underline a whole sentence or a long clause. If the meaningful clause is longer, copy only its core noun phrase, verb phrase, contrast phrase, or figurative phrase.",
      "- The target must be one of: (1) a compressed expression of the passage's keyword/theme, (2) an expression of the OPPOSITE of that theme, or (3) a metaphorical/figurative expression (prefer (3) if any figurative wording exists).",
      "- Do not underline a single vocabulary word, pronoun, function word, or dictionary idiom.",
      "- The answer option must be an English paraphrase of the implied meaning, not a literal translation.",
    ].join("\n");
  }

  return [
    "## IMPLIED_MEANING target candidates",
    // 다양성 모드: 로테이션 후 첫 후보를 명시 지정 (병렬 배치 수렴 방지, 소프트).
    diversity?.diversityEnabled && candidates.length > 0
      ? `- ⭐ 다양성 지시: 이번 문항은 되도록 아래 후보 1번을 underlinedExpression 으로 사용하세요. 그 표현이 함축 출제에 부적합할 때만 다른 후보를 사용하고, 매번 같은 표현으로 수렴하지 마세요.`
      : "",
    "- Prefer one candidate from this list, or choose another exact source span with the same quality.",
    "- Copy underlinedExpression verbatim from the passage and provide surroundingText that contains it.",
    "- ⭐ Keep the underlinedExpression SHORT: ≤6 words. If a listed candidate is long, underline only its core nucleus (the minimal phrase/clause that carries the implied meaning), not the whole clause. Never underline a full sentence.",
    "- ⭐ The target must be one of three kinds (prefer (3) when figurative wording exists): (1) a compressed phrase expressing the passage's keyword/theme, (2) a phrase expressing the OPPOSITE of that theme (the writer's critique/negation/contrast), or (3) a metaphorical/figurative expression.",
    "- Treat this type as TOPIC/TITLE/SUMMARY family: prefer a target that restates the passage's central claim in metaphorical, compressed, unfamiliar, or conclusion-like wording.",
    "- Avoid peripheral local details. A good target should be reducible to the passage's topic/gist/title-level meaning.",
    "- Do not choose a rhetorical question or a sentence whose answer is stated in the immediately following sentence.",
    "- Prefer targets with a visible surface-to-hidden meaning gap: metaphor, conceptual compression, contrast, or a conclusion that must be unpacked.",
    "- The correct option must synthesize the expression's implied meaning from surrounding evidence.",
    "- Distractors must be near-misses anchored in real passage concepts.",
    requestedDifficulty === "KILLER"
      ? "- KILLER calibration: choose a target whose answer requires connecting at least two clues before/after the underline."
      : "",
    ...candidates.map((candidate, index) => (
      `${index + 1}. sentence ${candidate.sentenceIndex + 1}: ${candidate.sentence}\n   Suggested underlinedExpression="${candidate.expression}" | surroundingText="${candidate.surroundingText}"`
    )),
    sentences.length
      ? "Passage sentence map:\n" + sentences.slice(0, 12).map((sentence, index) => `${index + 1}. ${sentence}`).join("\n")
      : "",
  ].filter(Boolean).join("\n");
}



export function findImpliedMeaningCandidates(
  passage: string,
): Array<{ expression: string; sentence: string; sentenceIndex: number; surroundingText: string }> {
  const sentences = splitPassageSentences(passage);
  const candidates: Array<{ expression: string; sentence: string; sentenceIndex: number; surroundingText: string }> = [];
  const seen = new Set<string>();

  for (const [sentenceIndex, sentence] of sentences.entries()) {
    const expressions = suggestImpliedMeaningExpressions(sentence);
    for (const expression of expressions) {
      const normalized = normalizeComparableText(expression);
      if (
        seen.has(normalized) ||
        countContentTokens(expression) < 2 ||
        // 새 규칙(밑줄 ≤6단어)과 일관되게: 통문장/긴 절 후보는 제안 목록에서
        // 제외해 "Suggested underlinedExpression=<긴 span>" 모순을 줄인다. 짧은
        // 후보가 없어 비면 guardrail 블록(≤6·3갈래 지시)이 대신 안내한다.
        countWordsForQuality(expression) > 6 ||
        countImpliedMeaningLexicalUnits(expression) > 6 ||
        hasTrailingFunctionWord(expression) ||
        isSingleEnglishToken(expression) ||
        isTinyFunctionWord(expression)
      ) {
        continue;
      }
      const index = passage.indexOf(expression);
      if (index === -1) continue;
      seen.add(normalized);
      candidates.push({
        expression,
        sentence,
        sentenceIndex,
        surroundingText: buildSurroundingWindow(
          passage,
          index,
          expression.length,
        ),
      });
    }
  }

  return candidates.sort((a, b) =>
    impliedMeaningCandidateScore(b.expression, b.sentence, b.sentenceIndex, sentences.length) -
    impliedMeaningCandidateScore(a.expression, a.sentence, a.sentenceIndex, sentences.length),
  );
}



export function suggestImpliedMeaningExpressions(sentence: string): string[] {
  const normalizedSentence = sentence.replace(/\s+/g, " ").trim();
  const candidates: string[] = [];
  const patterns = [
    /\b(not\s+(?:merely|simply|only|just)\s+[^.;:!?]{8,100}?\s+but\s+[^.;:!?]{8,120})/gi,
    /\b(rather than\s+[^.;:!?]{8,100})/gi,
    /\b(not\s+whether\s+[^.;:!?]{8,120}?\s+but\s+[^.;:!?]{8,120})/gi,
    /\b(instead of\s+[^.;:!?]{8,100})/gi,
    /\b(no longer\s+[^.;:!?]{8,100})/gi,
    /\b(cannot\s+be\s+[^.;:!?]{8,100})/gi,
    /\b(serves?\s+as\s+[^.;:!?]{8,100})/gi,
    /\b(functions?\s+as\s+[^.;:!?]{8,100})/gi,
    /\b(represents?\s+[^.;:!?]{8,100})/gi,
    /\b(reflects?\s+[^.;:!?]{8,100})/gi,
    /\b(demonstrates?\s+that\s+[^.;:!?]{8,120})/gi,
    /\b(suggests?\s+that\s+[^.;:!?]{8,120})/gi,
    /\b(reveals?\s+that\s+[^.;:!?]{8,120})/gi,
    /\b(means?\s+that\s+[^.;:!?]{8,120})/gi,
    /\b(points?\s+to\s+[^.;:!?]{8,100})/gi,
    /\b(lies?\s+between\s+[^.;:!?]{8,120})/gi,
    /\b(move\s+upstream\s+as\s+well\s+as\s+downstream)/gi,
    /\b(living\s+archive\s+of\s+[^.;:!?]{4,80})/gi,
    /\b(written\s+underfoot)/gi,
    /\b(absence\s+is\s+not\s+always\s+a\s+lack)/gi,
    /\b(a\s+house\s+gradually\s+losing\s+its\s+walls)/gi,
    /\b(a\s+quiet\s+hinge)/gi,
    /\b(a\s+negotiation\s+between\s+meanings)/gi,
    /\b(a\s+civic\s+promise\s+about\s+knowledge)/gi,
    /\b(whom\s+it\s+actually\s+carries)/gi,
    /\b(the\s+benefit\s+has\s+changed\s+hands)/gi,
    /\b(putting\s+every\s+fact\s+on\s+the\s+package)/gi,
    /\b(a\s+conversation\s+with\s+the\s+past)/gi,
    /\b(stop\s+negotiating\s+with\s+the\s+day)/gi,
    /\b(famous\s+and\s+fragile)/gi,
    /\b(read\s+the\s+land\s+around\s+it)/gi,
    /\b(freeze\s+yesterday's\s+judgment\s+inside\s+today's\s+machinery)/gi,
    /\b(a\s+door\s+painted\s+on\s+a\s+wall)/gi,
    /\b(turns\s+observation\s+into\s+a\s+shared\s+instrument)/gi,
    /\b(the\s+place\s+where\s+someone\s+is\s+trapped)/gi,
    /\b(mistake\s+a\s+history\s+for\s+a\s+defect)/gi,
    /\b(less\s+public\s+in\s+practice)/gi,
    /\b(reveal\s+a\s+hidden\s+assumption)/gi,
    /\b(a\s+small\s+archive\s+of\s+belonging)/gi,
    /\b(the\s+author\s+of\s+action)/gi,
    /\b(a\s+wallet\s+with\s+invisible\s+doors)/gi,
    /\b(what\s+it\s+asks\s+memory\s+to\s+praise)/gi,
    /\b(the\s+delivery\s+of\s+tasks)/gi,
    /\b(which\s+obstacles\s+are\s+worth\s+keeping)/gi,
    /\b(changed\s+what\s+counted\s+as\s+valuable\s+[^.;:!?]{4,80})/gi,
    /\b(we\s+are\s+creatures?\s+of\s+[^.;:!?]{8,120})/gi,
    /\b(tool\s+that\s+helps\s+[^.;:!?]{8,80})/gi,
    /\b(how\s+human\s+responsibility\s+is\s+reorganized\s+around\s+them)/gi,
    /\b(less\s+a\s+mirror\s+than\s+a\s+negotiation\s+between\s+meanings)/gi,
    /\b(not\s+the\s+same\s+as\s+putting\s+every\s+fact\s+on\s+the\s+package)/gi,
    /\b(reasons?\s+have\s+to\s+be\s+based\s+on\s+something)/gi,
    /\b(we\s+begin\s+to\s+reason\s+long\s+before\s+[^.;:!?]{8,120})/gi,
    /\b(the\s+(?:point|problem|challenge|risk|value|result|lesson|implication)\s+[^.;:!?]{8,100})/gi,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(normalizedSentence))) {
      const expression = normalizeSuggestedImpliedExpression(match[1] ?? "");
      const variants = [
        expression,
        ...extractCompactImpliedMeaningNuclei(expression),
      ];
      for (const variant of variants) {
        if (isUsableImpliedMeaningExpression(variant)) {
          candidates.push(variant);
        }
      }
    }
  }

  if (candidates.length === 0 && isImpliedMeaningSourceSentence(normalizedSentence)) {
    candidates.push(...extractCentralSentenceSpans(normalizedSentence));
  }

  return [...new Set(candidates)].slice(0, 3);
}



export function normalizeSuggestedImpliedExpression(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/^[,;:\-\s]+/g, "")
    .replace(/[;:]+$/g, "")
    .trim();
}

export function extractCompactImpliedMeaningNuclei(expression: string): string[] {
  const text = normalizeSuggestedImpliedExpression(expression);
  const nuclei: string[] = [];
  const contrastMatches = [
    /\bnot\s+(?:merely|simply|only|just)\s+[\s\S]+?\s+but\s+(.+)$/i,
    /\bnot\s+whether\s+[\s\S]+?\s+but\s+(.+)$/i,
    /\bless\s+a\s+mirror\s+than\s+(.+)$/i,
    /\bnot\s+the\s+same\s+as\s+(.+)$/i,
  ];

  for (const pattern of contrastMatches) {
    const match = text.match(pattern);
    if (match?.[1]) {
      nuclei.push(compactImpliedMeaningNucleus(match[1]));
    }
  }

  return nuclei
    .map(normalizeSuggestedImpliedExpression)
    .filter(Boolean);
}

export function compactImpliedMeaningNucleus(value: string): string {
  const words = value.trim().split(/\s+/).filter(Boolean).slice(0, 6);
  while (words.length > 2 && /^(?:a|an|the|of|for|to|with|and|or|but)$/i.test(words[words.length - 1] ?? "")) {
    words.pop();
  }
  return words.join(" ");
}


export function isUsableImpliedMeaningExpression(value: string): boolean {
  const text = normalizeText(value);
  const tokenCount = countContentTokens(text);
  return (
    text.length >= 12 &&
    text.length <= 90 &&
    tokenCount >= 2 &&
    countWordsForQuality(text) <= 6 &&
    countImpliedMeaningLexicalUnits(text) <= 6 &&
    !/[?？]\s*$/.test(text) &&
    !hasTrailingFunctionWord(text) &&
    !isSingleEnglishToken(text) &&
    !isTinyFunctionWord(text) &&
    !/^(?:such as|including|for example)\b/i.test(text)
  );
}



export function isImpliedMeaningSourceSentence(sentence: string): boolean {
  if (sentence.length < 45 || sentence.length > 260) return false;
  return /\b(?:although|while|whereas|but|yet|therefore|thus|consequently|in this way|as a result|not merely|not simply|rather than|instead of|means?|suggests?|implies?|reveals?|reflects?|demonstrates?|represents?|serves?|functions?|challenge|risk|value|lesson|implication|creatures?|reason|emotion|effectively)\b/i.test(sentence);
}



export function extractCentralSentenceSpans(sentence: string): string[] {
  const spans: string[] = [];
  const clauses = sentence
    .split(/[,;:]\s+/)
    .map(normalizeSuggestedImpliedExpression)
    .filter(isUsableImpliedMeaningExpression);

  spans.push(...clauses.filter((clause) =>
    /\b(?:because|therefore|thus|but|yet|while|although|rather|instead|means?|suggests?|reveals?|reflects?|demonstrates?|represents?|serves?|functions?)\b/i.test(clause),
  ));

  if (spans.length === 0 && isUsableImpliedMeaningExpression(sentence)) {
    spans.push(sentence);
  }

  return spans.slice(0, 2);
}



export function impliedMeaningCandidateScore(
  expression: string,
  sentence: string,
  sentenceIndex = 0,
  sentenceCount = 1,
): number {
  // 짧은 핵심 구/절 선호(강사 피드백: 6단어 이내). 길수록 감점해 긴 절·문장 후보를 뒤로 민다.
  const tokenCount = countContentTokens(expression);
  const wordCount = countWordsForQuality(expression);
  let score = 0;
  if (wordCount <= 6 && tokenCount >= 2 && tokenCount <= 6) score += 8;
  else score -= Math.max(1, wordCount - 6) * 4;
  // (3) 비유·은유 표현 최우선
  if (/\b(?:creatures?|beggar|grave|mirror|lens|map|upstream|downstream|weight|carry|sculpt|sculpting|craft|discipline)\b/i.test(expression)) score += 6;
  if (/\b(?:long before|based on something|reason and emotion|changed what counted|human responsibility is reorganized|tool that helps learning happen)\b/i.test(expression)) score += 4;
  // (2) 핵심·주제와 정반대 방향(대조·부정·평가)
  if (/\b(?:not merely|not simply|rather than|instead of|while|although|whereas|but|yet)\b/i.test(expression)) score += 4;
  // (1) 핵심·주제 함축 동사
  if (/\b(?:means?|suggests?|implies?|reveals?|reflects?|demonstrates?|represents?|serves?|functions?)\b/i.test(expression)) score += 3;
  if (/\b(?:therefore|thus|consequently|as a result|in this way)\b/i.test(sentence)) score += 2;
  score += impliedMeaningCentralityScore(sentence, sentenceIndex, sentenceCount);
  if (expression.length > 90) score -= 3;
  return score;
}



export function impliedMeaningCentralityScore(
  sentence: string,
  sentenceIndex: number,
  sentenceCount: number,
): number {
  let score = 0;
  if (sentenceIndex >= Math.max(0, sentenceCount - 2)) score += 4;
  if (sentenceIndex === 0 && sentenceCount <= 4) score += 1;
  if (/\b(?:central issue|in the end|for that reason|therefore|thus|consequently|as a result|this is why|the point|the lesson|a durable solution|a serious .* must|must therefore|not whether|not merely|rather than|instead of|does not mean|it shows that|ultimately)\b/i.test(sentence)) {
    score += 5;
  }
  if (/\b(?:topic|gist|claim|conclusion|responsibility|value|equality|opportunity|solution|policy|learning|evidence)\b/i.test(sentence)) {
    score += 1;
  }
  return score;
}
