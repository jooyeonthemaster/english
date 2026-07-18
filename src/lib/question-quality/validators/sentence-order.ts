// Split from question-quality.ts — shared helpers in core.ts, public API via index.ts barrel.
import { QuestionQualitySeverity, SENTENCE_ORDER_MIN_PARAGRAPH_SENTENCES, SENTENCE_ORDER_MIN_PARAGRAPH_WORDS, collectCorrectAnswerLabels, countDisplaySentences, countWords, findDuplicate, isRecord, normalizeComparableText, normalizeLabel, normalizeText } from "../core";


export const SENTENCE_ORDER_PARAGRAPH_LABELS = ["(A)", "(B)", "(C)"] as const;


export const SENTENCE_ORDER_MAX_GIVEN_SENTENCES = 2;


export const SENTENCE_ORDER_MAX_GIVEN_WORDS = 70;


export const SENTENCE_ORDER_MAX_PARAGRAPH_WORD_RATIO = 1.9;


export const SENTENCE_ORDER_MAX_GIVEN_TO_AVG_PARAGRAPH_RATIO = 1.3;



export function validateSentenceOrderQuestion(
  question: Record<string, unknown>,
  passage: string | undefined,
  add: (severity: QuestionQualitySeverity, code: string, message: string) => void,
) {
  const givenSentence = normalizeSentenceOrderVisibleText(question.givenSentence);
  if (!givenSentence) {
    add("error", "sentence-order-missing-given", "SENTENCE_ORDER is missing givenSentence.");
  }

  const givenSentenceCount = countDisplaySentences(givenSentence);
  const givenWordCount = countWords(givenSentence);
  if (
    givenSentence &&
    (givenSentenceCount < 1 || givenSentenceCount > SENTENCE_ORDER_MAX_GIVEN_SENTENCES)
  ) {
    add(
      "error",
      "sentence-order-given-too-long",
      `SENTENCE_ORDER givenSentence must be 1-2 sentences, got ${givenSentenceCount}.`,
    );
  }
  if (givenWordCount > SENTENCE_ORDER_MAX_GIVEN_WORDS) {
    add(
      "error",
      "sentence-order-given-too-long",
      `SENTENCE_ORDER givenSentence is too long (${givenWordCount} words). Use only the first 1-2 sentences.`,
    );
  }
  // Structural paragraph labels belong only in question.paragraphs. Keep this
  // separate from the length craft signal: a short givenSentence contaminated
  // with an exact (A)/(B)/(C) marker is still structurally invalid.
  if (/[（(]\s*[ABC]\s*[）)]/i.test(givenSentence)) {
    add(
      "error",
      "sentence-order-given-contains-paragraph-label",
      "SENTENCE_ORDER givenSentence appears to contain paragraph labels; split given and (A)/(B)/(C) separately.",
    );
  }

  const paragraphs = Array.isArray(question.paragraphs)
    ? question.paragraphs.filter(isRecord)
    : [];
  if (paragraphs.length !== 3) {
    add(
      "error",
      "sentence-order-paragraph-count",
      `SENTENCE_ORDER must have exactly 3 paragraphs, got ${paragraphs.length}.`,
    );
  }

  const paragraphWordCounts: number[] = [];
  const normalizedLabels: string[] = [];
  for (let index = 0; index < paragraphs.length; index += 1) {
    const paragraph = paragraphs[index];
    const expectedLabel = SENTENCE_ORDER_PARAGRAPH_LABELS[index] ?? `(${index + 1})`;
    const label = normalizeSentenceOrderParagraphLabel(paragraph.label);
    normalizedLabels.push(label);
    const text = normalizeSentenceOrderVisibleText(paragraph.text);
    const sentenceCount = countDisplaySentences(text);
    const wordCount = countWords(text);
    paragraphWordCounts.push(wordCount);

    // An absent paragraph is a structural validity failure, not merely a thin
    // or one-sentence craft issue. Emit the dedicated code first while keeping
    // the existing minimum-sentence/word diagnostics below for observability.
    if (!text) {
      add(
        "error",
        "sentence-order-empty-paragraph",
        `SENTENCE_ORDER paragraph ${expectedLabel} is empty. Provide the complete paragraph text.`,
      );
    }

    // paragraph.label already supplies the visible (A)/(B)/(C) marker. A
    // second standalone marker copied anywhere into paragraph.text
    // duplicates/contaminates the reconstruction surface. Keep this bounded
    // to exact label tokens: quoted source notation, formulae such as f(A),
    // and ordinary parentheticals such as (advanced) are not structural
    // labels.
    const duplicatedBodyLabel = findSentenceOrderDuplicatedBodyLabel(text);
    if (duplicatedBodyLabel) {
      add(
        "error",
        "sentence-order-paragraph-body-label",
        `SENTENCE_ORDER paragraph ${expectedLabel} repeats a structural label inside its text (${duplicatedBodyLabel.trim()}). Keep the label only in paragraph.label.`,
      );
    }

    // Bounded fragment certificate: each short standalone sentence beginning
    // with an overt dependency marker must contain its own independent clause.
    // Terminal punctuation and later padding sentences cannot repair a
    // truncated subordinate clause. This deliberately does not claim to parse
    // arbitrary English; an explicit comma/main-clause boundary remains a
    // normal control.
    if (isHighConfidenceSentenceOrderDependentFragment(text)) {
      add(
        "error",
        "sentence-order-dependent-fragment",
        `SENTENCE_ORDER paragraph ${expectedLabel} contains a standalone dependent fragment. Restore the independent clause from the source passage.`,
      );
    }

    // C4-c (1) 라벨 오염: 단락 라벨에 순서 숫자(1/②)가 섞이면 정답 순서가 노출.
    const rawLabel = normalizeText(paragraph.label);
    if (/[0-9①-⑳]/.test(rawLabel)) {
      add(
        "error",
        "sentence-order-label-order-leak",
        "단락 라벨에 순서 숫자가 포함돼 정답 순서가 노출됩니다. 라벨은 (A)/(B)/(C)만 쓰세요.",
      );
    }
    // C4-c (2) 본문 선두 순서표식: 본문 앞에 순서 번호("1."·"②"·"(2)")가 붙으면 순서 노출.
    //  - bareNum: 1~2자리 숫자 + 구분자(.)·) + 뒤에 영문 → "1. The…". 소수점("3.14": 숫자 뒤
    //    또 숫자)·콜론("20: ")은 제외해 본문 수치/시각 표기 오탐 방지.
    //  - circled: 원숫자(①-⑳)/괄호숫자("(2)"/"[2]")는 구분자 없이도 순서표식 → "② Next"·"(2) Then" 포착.
    const bareNumPrefix = /^\s*[0-9]{1,2}(?![0-9])\s*[.)·]\s*(?=[A-Za-z])/;
    const circledPrefix = /^\s*(?:[①-⑳]|[(\[][0-9]{1,2}[)\]])\s*[.)·]?\s*(?=[A-Za-z])/;
    if (bareNumPrefix.test(text) || circledPrefix.test(text)) {
      add(
        "error",
        "sentence-order-text-order-prefix",
        "단락 본문 앞에 순서 번호(1./②/(2) 등)가 붙어 정답 순서가 노출됩니다. 본문은 순수 텍스트만 두세요.",
      );
    }

    // The student-facing structural contract is the literal trimmed label,
    // not the convenience-normalized value used by downstream answer
    // reconstruction. Alternate brackets, case, suffix punctuation, and bare
    // letters must not silently collapse to (A)/(B)/(C).
    if (rawLabel !== expectedLabel) {
      add(
        "error",
        "sentence-order-paragraph-labels",
        `SENTENCE_ORDER paragraph labels must be (A), (B), (C) in order; got ${normalizedLabels.join(", ")}.`,
      );
    }
    if (sentenceCount < SENTENCE_ORDER_MIN_PARAGRAPH_SENTENCES) {
      add(
        "error",
        "sentence-order-paragraph-too-short",
        `SENTENCE_ORDER paragraph ${expectedLabel} must contain at least ${SENTENCE_ORDER_MIN_PARAGRAPH_SENTENCES} sentences, got ${sentenceCount}.`,
      );
    }
    if (wordCount < SENTENCE_ORDER_MIN_PARAGRAPH_WORDS) {
      add(
        "error",
        "sentence-order-paragraph-too-thin",
        `SENTENCE_ORDER paragraph ${expectedLabel} is too short (${wordCount} words).`,
      );
    }
  }

  const positiveParagraphCounts = paragraphWordCounts.filter((count) => count > 0);
  if (positiveParagraphCounts.length === 3) {
    const minWords = Math.min(...positiveParagraphCounts);
    const maxWords = Math.max(...positiveParagraphCounts);
    const avgWords =
      positiveParagraphCounts.reduce((sum, count) => sum + count, 0) /
      positiveParagraphCounts.length;

    if (minWords > 0 && maxWords / minWords > SENTENCE_ORDER_MAX_PARAGRAPH_WORD_RATIO) {
      add(
        "error",
        "sentence-order-paragraph-imbalance",
        `SENTENCE_ORDER (A)/(B)/(C) chunks are imbalanced (${positiveParagraphCounts.join("/")} words).`,
      );
    }

    if (
      givenWordCount > 0 &&
      avgWords > 0 &&
      givenWordCount / avgWords > SENTENCE_ORDER_MAX_GIVEN_TO_AVG_PARAGRAPH_RATIO
    ) {
      add(
        "error",
        "sentence-order-given-too-long-relative",
        `SENTENCE_ORDER givenSentence (${givenWordCount} words) is longer than the balanced A/B/C chunk average (${Math.round(avgWords)} words).`,
      );
    }
  }

  validateSentenceOrderOptions(question, add);
  validateSentenceOrderAnswerReconstruction(question, passage, add);

  // T10 무손실 분할 게이트 — 조각화 때 원문 seam 문장이 유실/중복됐는지 결정형 검출.
  for (const finding of findSentenceOrderSourceCoverageIssues(question.paragraphs, passage)) {
    add("error", finding.code, finding.message);
  }
}



function normalizeSentenceOrderVisibleText(value: unknown): string {
  if (typeof value !== "string") return "";
  // Unicode format controls (Cf) have no visible glyph. Treat a paragraph
  // made only from bidi marks, zero-width controls, soft hyphens, or BOMs as
  // structurally empty instead of allowing it to masquerade as content.
  return normalizeText(value.replace(/\p{Cf}/gu, ""));
}



function findSentenceOrderDuplicatedBodyLabel(text: string): string | undefined {
  const labelPattern = /(?:[（(]\s*[ABC]\s*[）)]|[［[]\s*[ABC]\s*[］\]]|[ⒶⒷⒸⓐⓑⓒ])/giu;
  for (const match of text.matchAll(labelPattern)) {
    const start = match.index;
    const end = start + match[0].length;
    const before = text[start - 1] ?? "";
    const after = text[end] ?? "";

    // Embedded mathematical/lexical notation (f(A), (A)level) is not a
    // standalone structural label.
    if (/\p{L}|\p{N}/u.test(before) || /\p{L}|\p{N}/u.test(after)) continue;
    if (isDirectlyQuotedSentenceOrderToken(text, start, end)) continue;
    return match[0];
  }
  return undefined;
}



function isDirectlyQuotedSentenceOrderToken(text: string, start: number, end: number): boolean {
  let left = start - 1;
  while (left >= 0 && /\s/u.test(text[left] ?? "")) left -= 1;
  let right = end;
  while (right < text.length && /\s/u.test(text[right] ?? "")) right += 1;

  const quotePairs: Record<string, string> = {
    '"': '"',
    "'": "'",
    "“": "”",
    "‘": "’",
    "「": "」",
    "『": "』",
  };
  const opening = text[left] ?? "";
  return quotePairs[opening] === (text[right] ?? "");
}



function isHighConfidenceSentenceOrderDependentFragment(text: string): boolean {
  // Independently adjudicated v9 additions. These certificates are kept
  // structural and paired-control bounded; they do not broaden the product's
  // required (A)/(B)/(C) label system and they intentionally exclude the
  // separately redundant quoted-whether wrapper case.
  const sentences = splitSentenceOrderSentences(text);
  const lexicalSentenceCount = sentences.filter((sentence) =>
    /[A-Za-z]/u.test(sentence),
  ).length;
  if (lexicalSentenceCount <= 1 && isConfirmedDependentFragmentSurface(text)) {
    return true;
  }

  return sentences.some((sentence) => {
    const certificateSentence = sentence
      .replace(/^\s*[“‘"']\s*/u, "")
      .replace(/\s*[”’"']\s*$/u, "");
    if (isConfirmedDependentFragmentSurface(certificateSentence)) return true;
    const terminal = sentence.match(/[.!?]+\s*$/u)?.[0].trim() ?? "";
    // A wh-question such as "When did the reading change?" is an independent
    // interrogative, not a truncated adverbial clause. Exclamations are also
    // left outside this bounded prose certificate.
    if (terminal.includes("?") || terminal.includes("!")) return false;
    const surface = sentence.replace(/[.!?]+\s*$/u, "").trim();
    if (!surface || /[,;:—]\s*\S/u.test(surface)) return false;
    const words = surface.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g) ?? [];
    if (words.length === 0 || words.length > 12) return false;
    return (
      /^(?:(?:even\s+)?though|although|because|while|whereas|unless|if|since|when|whenever|after|before|once|as\s+soon\s+as|provided(?:\s+that)?|providing\s+that|so\s+that)\b/i.test(
        surface,
      ) ||
      // Preserve complete infinitival-subject sentences such as "To err is
      // human." The no-punctuation form remains a high-confidence truncation
      // certificate used by the existing structural gate.
      (!terminal && /^to\s+[a-z]+\b/i.test(surface)) ||
      // Exclude "that": sentence-initial demonstrative subjects such as
      // "That was the result." are complete independent clauses.
      /^(?:which|who|whom|whose)\s+(?:had|has|have|was|were|is|are|did|does|do|would|could|should|might|may|must|will)\b/i.test(
        surface,
      )
    );
  });
}

function isConfirmedDependentFragmentSurface(value: string): boolean {
  const sentence = value.trim();
  if (!sentence) return false;
  const unquoted = stripSentenceOrderOuterQuotes(sentence);
  const surface = unquoted.replace(/[.!?]+\s*$/u, "").trim();
  const words = surface.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g) ?? [];
  if (words.length === 0 || words.length > 18) return false;

  // Independently adjudicated v10 certificates. Each rule is paired with a
  // structurally complete control and remains language-bounded to English.
  // Punctuation alone cannot supply the missing matrix predicate.
  if (
    /^having\s+(?:been\s+)?[a-z][a-z'-]*(?:ed|en)\b/iu.test(surface) &&
    !surface.includes(",")
  ) {
    return true;
  }
  if (
    /^(?:asked|told|required|invited|forced|allowed|expected|encouraged|advised|instructed|reminded|warned)\s+to\b/iu.test(
      surface,
    ) &&
    !surface.includes(",")
  ) {
    return true;
  }
  if (
    /^(?:without|by|upon|on)\s+[a-z][a-z'-]*ing\b/iu.test(surface) &&
    !surface.includes(",")
  ) {
    return true;
  }
  if (
    /^(?:although|because|though|unless|if|since|when|whenever|after|before|once|while|whereas)\b/iu.test(
      surface,
    ) &&
    !surface.includes(",") &&
    !/\?\s*[”’"']?$/u.test(unquoted)
  ) {
    return true;
  }
  if (isHighConfidenceSentenceOrderNominalFragment(surface)) return true;

  // Participial opener with no finite matrix clause: "Including ..., e.g., ..."
  if (/^including\b/iu.test(surface) && !hasFiniteClauseAfterSentenceOrderComma(surface)) {
    return true;
  }

  // A quoted command cannot serve as the matrix clause of an outer because
  // clause. A genuine reporting clause ("..., the curator whispered") is not
  // shaped like this certificate.
  if (/^because\b[^,]{1,100},\s*[“‘"']/iu.test(surface)) return true;

  // Embedded wh-order with terminal question punctuation, paired against
  // auxiliary inversion ("Why did ...?").
  if (
    /\?\s*[”’"']?$/u.test(unquoted) &&
    /^(?:why|when|where|how)\s+(?:the|a|an|this|that|these|those|my|your|his|her|our|their)\s+[a-z][a-z'-]*\s+(?!do\b|does\b|did\b|is\b|are\b|was\b|were\b|has\b|have\b|had\b|can\b|could\b|will\b|would\b|should\b|may\b|might\b|must\b)[a-z][a-z'-]*\b/iu.test(
      surface,
    )
  ) {
    return true;
  }

  // Standalone purpose infinitive. Preserve infinitival-subject sentences
  // with an overt finite predicate ("To apologize now would help") and
  // introductory infinitives followed by a finite main clause.
  if (/^to\s+[a-z]+\b/iu.test(surface) && !hasSentenceOrderInfinitiveMatrix(surface)) {
    return true;
  }

  // Head NP + relative clause, but no finite predicate outside that clause.
  if (isSentenceOrderRelativeClauseOnlyNounPhrase(surface)) return true;

  // Two explicitly nonfinite/verbless semicolon halves. This is deliberately
  // narrower than a general semicolon grammar checker.
  if (
    /^(?:the|a|an)\s+[a-z][a-z'-]*\s+[a-z][a-z'-]*ing\s*;\s*(?:the|a|an)\s+[a-z][a-z'-]*\s+[a-z][a-z'-]*$/iu.test(
      surface,
    )
  ) {
    return true;
  }

  // An initial subordinator still governs the sole finite clause across a
  // colon when the supplement is only a gerund/infinitive phrase.
  if (
    /^(?:because|although|though|if|unless|while|when|after|before|since)\b[^:]{1,120}:\s*(?:[a-z][a-z'-]*ing|to\s+[a-z]+)\b/iu.test(
      surface,
    )
  ) {
    return true;
  }

  // Parenthetical dashes do not supply the missing predicate of an outer NP.
  if (
    /^(?:the|a|an)\s+[a-z][a-z'-]*(?:\s+[a-z][a-z'-]*)?\s*—[^—]{1,80}—\s*(?:at|in|on|before|after|during|near|by|with|without|under|over)\b/iu.test(
      surface,
    )
  ) {
    return true;
  }

  // Participial noun phrase followed by quoted content, paired against a
  // finite reporting verb ("The sign read, ...").
  if (
    /^(?:the|a|an)\s+[a-z][a-z'-]*\s+(?:reading|saying|stating)\s*,\s*[“‘"']/iu.test(
      surface,
    )
  ) {
    return true;
  }

  // Embedded whether question without a matrix clause. The comma+quotation
  // shape from v9 p12 is intentionally excluded because its wrapper already
  // provides the expected rejection and was not authorized for remediation.
  if (/^whether\b[^,“”"']+\?$/iu.test(unquoted)) return true;

  // Standalone fused-relative nominal ("What the witness remembered ...")
  // versus the paired subject+matrix-predicate control.
  if (isSentenceOrderFusedRelativeOnly(surface)) return true;

  return false;
}

function isHighConfidenceSentenceOrderNominalFragment(surface: string): boolean {
  // Nominal head plus an infinitival complement: "The plan: to ...". A
  // copular control ("The plan was to ...") does not have this shape.
  if (
    /^(?:the|a|an)\s+(?:[a-z][a-z'-]*\s+){0,3}[a-z][a-z'-]*\s*:\s*to\s+[a-z][a-z'-]*\b/iu.test(
      surface,
    )
  ) {
    return true;
  }

  // A single dash joining two noun phrases is not a finite predication.
  const dashParts = surface.split(/\s*[–—]\s*/u);
  if (
    dashParts.length === 2 &&
    isBoundedSentenceOrderNounPhrase(dashParts[0] ?? "", true) &&
    isBoundedSentenceOrderNounPhrase(dashParts[1] ?? "", true)
  ) {
    return true;
  }

  // A prepositional/dependent phrase and a noun phrase do not become a
  // sentence merely because a semicolon is placed between them.
  const semicolonParts = surface.split(/\s*;\s*/u);
  if (
    semicolonParts.length === 2 &&
    /^(?:after|before|during|without|with|in|on|at|near|under|over|beside)\b/iu.test(
      semicolonParts[0] ?? "",
    ) &&
    !containsLikelySentenceOrderFiniteVerb(semicolonParts[0] ?? "") &&
    isBoundedSentenceOrderNounPhrase(semicolonParts[1] ?? "", true)
  ) {
    return true;
  }

  return isBoundedSentenceOrderNounPhrase(surface);
}

function isBoundedSentenceOrderNounPhrase(
  value: string,
  allowBarePostmodifier = false,
): boolean {
  const text = value.trim();
  if (!/^(?:the|a|an|one|two|three|four|five)\b/iu.test(text)) return false;
  if (/[,;:–—]/u.test(text)) return false;

  const tokens = text.match(/[A-Za-z]+(?:-[A-Za-z]+)*/gu) ?? [];
  if (tokens.length < 2 || tokens.length > 10) return false;
  const prepositions = new Set([
    "of", "with", "near", "by", "under", "over", "beside", "inside",
    "outside", "at", "in", "on", "along", "around", "before", "after",
    "during",
  ]);
  const firstPreposition = tokens.findIndex((token, index) =>
    index > 0 && prepositions.has(token.toLowerCase()),
  );
  if (firstPreposition < 2 && !allowBarePostmodifier) return false;
  if (firstPreposition < 0 && !allowBarePostmodifier) return false;

  const headEnd = firstPreposition < 0 ? tokens.length : firstPreposition;
  const head = tokens.slice(1, headEnd);
  if (head.length === 0 || head.length > 4) return false;
  const finiteLookingHead = head.filter((token) =>
    isLikelySentenceOrderFiniteVerbToken(token),
  );
  const quantifiedPluralHead =
    /^(?:one|two|three|four|five)\b/iu.test(text) &&
    finiteLookingHead.length >= 1 &&
    finiteLookingHead.at(-1) === head.at(-1) &&
    /s$/iu.test(finiteLookingHead.at(-1) ?? "") &&
    finiteLookingHead.slice(0, -1).every((token) => /(?:ed|en)$/iu.test(token));
  if (finiteLookingHead.length > 0 && !quantifiedPluralHead) return false;
  return !containsLikelySentenceOrderFiniteVerbAfterNominalBoundary(
    tokens,
    Math.max(firstPreposition, 1),
  );
}

function containsLikelySentenceOrderFiniteVerb(value: string): boolean {
  const tokens = value.match(/[A-Za-z]+(?:-[A-Za-z]+)*/gu) ?? [];
  return tokens.some((token) => isLikelySentenceOrderFiniteVerbToken(token));
}

function containsLikelySentenceOrderFiniteVerbAfterNominalBoundary(
  tokens: string[],
  start: number,
): boolean {
  const prepositions = new Set([
    "of", "with", "near", "by", "under", "over", "beside", "inside",
    "outside", "at", "in", "on", "along", "around", "before", "after",
    "during",
  ]);
  let lastPreposition = start;
  for (let index = start; index < tokens.length; index += 1) {
    const token = tokens[index] ?? "";
    if (prepositions.has(token.toLowerCase())) {
      lastPreposition = index;
      continue;
    }
    if (!isLikelySentenceOrderFiniteVerbToken(token)) continue;
    const segmentLength = index - lastPreposition;
    // A final plural noun in a short prepositional object ("the stairs",
    // "rain-spotted pages") is not a finite -s verb. Elsewhere, a finite
    // looking token is enough to preserve the complete-sentence control.
    const finalShortNominal = index === tokens.length - 1 && segmentLength <= 2;
    if (!finalShortNominal) return true;
  }
  return false;
}

function isLikelySentenceOrderFiniteVerbToken(value: string): boolean {
  const token = value.toLowerCase();
  if (token.includes("-")) return false;
  if (
    /^(?:am|is|are|was|were|has|have|had|does|do|did|will|would|shall|should|can|could|may|might|must|became|began|bent|broke|brought|built|came|fell|felt|found|gave|grew|heard|held|kept|knew|lay|led|left|lost|made|met|read|rang|ran|rose|said|sat|saw|sent|slept|spoke|stood|took|told|went|woke|wore|wrote)$/u.test(
      token,
    )
  ) {
    return true;
  }
  return /(?:ed|en)$/u.test(token) || (token.length > 3 && /s$/u.test(token));
}

function stripSentenceOrderOuterQuotes(value: string): string {
  const quotePairs: Array<[string, string]> = [
    ["“", "”"],
    ["‘", "’"],
    ['"', '"'],
    ["'", "'"],
  ];
  let result = value.trim();
  for (const [open, close] of quotePairs) {
    if (result.startsWith(open) && result.endsWith(close)) {
      result = result.slice(open.length, -close.length).trim();
      break;
    }
  }
  return result;
}

function hasFiniteClauseAfterSentenceOrderComma(surface: string): boolean {
  const tail = surface.split(",").slice(1).join(",").trim();
  return /^(?:the|a|an|this|that|these|those|he|she|it|they|we|i|you|[A-Z][a-z'-]+)\s+[a-z][a-z'-]*(?:ed|s)\b/iu.test(
    tail,
  );
}

function hasSentenceOrderInfinitiveMatrix(surface: string): boolean {
  if (/\b(?:am|is|are|was|were|has|have|had|does|do|did|will|would|shall|should|can|could|may|might|must)\b/iu.test(surface)) {
    return true;
  }
  return /,\s*(?:the|a|an|this|that|these|those|he|she|it|they|we|i|you|[A-Z][a-z'-]+)(?:\s+[a-z][a-z'-]*){0,3}\s+[a-z][a-z'-]*(?:ed|s)\b/iu.test(
    surface,
  );
}

function isSentenceOrderRelativeClauseOnlyNounPhrase(surface: string): boolean {
  const match = /^(?:the|a|an)\s+[a-z][a-z'-]*(?:\s+[a-z][a-z'-]*){0,2}\s+(?:who|which|that)\s+(.+)$/iu.exec(
    surface,
  );
  if (!match) return false;
  const clause = match[1];
  const finiteTokens = clause.match(
    /\b(?:am|is|are|was|were|has|have|had|does|do|did|will|would|shall|should|can|could|may|might|must|found|fell|read|left|made|took|came|went|saw|wrote|[a-z][a-z'-]*(?:ed|s))\b/giu,
  ) ?? [];
  return finiteTokens.length === 1;
}

function isSentenceOrderFusedRelativeOnly(surface: string): boolean {
  const match = /^what\s+(?:the|a|an|this|that|these|those|he|she|it|they|we|i|you)\s+[a-z][a-z'-]*\s+(.+)$/iu.exec(
    surface,
  );
  if (!match) return false;
  const finiteTokens = match[1].match(
    /\b(?:am|is|are|was|were|has|have|had|does|do|did|will|would|shall|should|can|could|may|might|must|found|fell|read|left|made|took|came|went|saw|wrote|[a-z][a-z'-]*(?:ed|s))\b/giu,
  ) ?? [];
  return finiteTokens.length === 1;
}



function splitSentenceOrderSentences(text: string): string[] {
  const sentences: string[] = [];
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    const punctuation = text[index];
    if (punctuation !== "." && punctuation !== "!" && punctuation !== "?") continue;
    if (punctuation === "." && isNonTerminalSentenceOrderPeriod(text, index)) continue;

    sentences.push(text.slice(start, index + 1).trim());
    start = index + 1;
  }
  const remainder = text.slice(start).trim();
  if (remainder) sentences.push(remainder);
  return sentences.filter(Boolean);
}



function isNonTerminalSentenceOrderPeriod(text: string, index: number): boolean {
  const previous = text[index - 1] ?? "";
  const next = text[index + 1] ?? "";
  if (/\d/u.test(previous) && /\d/u.test(next)) return true;

  const prefix = text.slice(0, index + 1);
  // Initials and compact Latin abbreviations (e.g., U.S.) contain periods
  // that are not sentence boundaries.
  if (/(?:^|\s)(?:[A-Za-z]\.){2,}$/u.test(prefix)) return true;
  if (/[A-Za-z]\.$/u.test(prefix) && /[A-Za-z]/u.test(next)) return true;
  const token = prefix.match(/(?:^|\s)([A-Za-z]+)\.$/u)?.[1]?.toLowerCase();
  if (!token) return false;
  return new Set([
    "mr",
    "mrs",
    "ms",
    "dr",
    "prof",
    "sr",
    "jr",
    "st",
    "vs",
    "etc",
    "fig",
    "no",
  ]).has(token);
}



/**
 * 정답 키 재구성 게이트 (wave1) — (A)/(B)/(C) 단락은 원본 지문의 verbatim 분할이므로,
 * 주장된 정답 순열대로 단락을 늘어놓았을 때 각 단락의 "원문 내 위치"가 엄격히
 * 증가해야 한다. 아니면 정답 키가 원문 흐름과 어긋난 것(정답 무효급).
 * 단락이 정규화 후에도 원문에서 verbatim 으로 발견되지 않으면 추측하지 않고
 * sentence-order-paragraph-not-source-backed 로 차단한다. (givenSentence 는
 * 패러프레이즈가 허용되므로 대조하지 않는다.) 두 코드 모두 RELAXED_BLOCKING.
 */
export function validateSentenceOrderAnswerReconstruction(
  question: Record<string, unknown>,
  passage: string | undefined,
  add: (severity: QuestionQualitySeverity, code: string, message: string) => void,
) {
  // 구두점 무관 대조 (wave5 오탐 수정): normalizeComparableText 는 곡선따옴표만
  // 접고 em-dash(—)·수평바(―)·말줄임(…)·NBSP 는 못 접는다 — sonnet-5 가 출력에서
  // 구두점을 정규화하면 verbatim 대조가 깨져 정상 문항이 전멸했다(실측 26-07-05
  // final-prem: PREMIUM 두 난이도 0생성, 베이스라인 98점 셀). 알파넘+공백만 남겨
  // 대조하면 구두점 변형은 통과시키되 단어 수준 재작성은 여전히 차단한다.
  const foldForSourceMatch = (value: string) =>
    normalizeComparableText(value)
      .replace(/[^a-z0-9 ]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const normalizedPassage = foldForSourceMatch(passage ?? "");
  if (!normalizedPassage) return;

  const paragraphs = Array.isArray(question.paragraphs)
    ? question.paragraphs.filter(isRecord)
    : [];
  if (paragraphs.length !== 3) return; // 개수 결함은 별도 게이트가 차단.

  const positionByLabel = new Map<string, number>();
  for (const paragraph of paragraphs) {
    const label = normalizeSentenceOrderParagraphLabel(paragraph.label);
    const text = foldForSourceMatch(normalizeText(paragraph.text));
    if (!/^\([ABC]\)$/.test(label) || !text) return; // 라벨/본문 결함은 별도 게이트.
    const index = normalizedPassage.indexOf(text);
    if (index < 0) {
      add(
        "error",
        "sentence-order-paragraph-not-source-backed",
        `SENTENCE_ORDER paragraph ${label} is not found in the source passage even after punctuation-insensitive normalization; paragraphs must be verbatim source splits (do not rewrite their words), so the answer key cannot be verified.`,
      );
      return;
    }
    positionByLabel.set(label, index);
  }
  if (positionByLabel.size !== 3) return; // 라벨 중복 등은 별도 게이트가 차단.

  const answerLabel = collectCorrectAnswerLabels(question)[0];
  if (!answerLabel) return;
  const options = Array.isArray(question.options) ? question.options.filter(isRecord) : [];
  const correctOption = options.find(
    (option) => normalizeLabel(option.label) === answerLabel,
  );
  const correctOrder = parseSentenceOrderPermutation(correctOption?.text);
  if (!correctOrder) return; // 순열 형태 결함은 별도 게이트가 차단.

  const orderedPositions = correctOrder.map((label) => positionByLabel.get(label) ?? -1);
  const isStrictlyIncreasing = orderedPositions.every(
    (position, index) => index === 0 || position > orderedPositions[index - 1],
  );
  if (!isStrictlyIncreasing) {
    const sourceOrder = [...positionByLabel.entries()]
      .sort((a, b) => a[1] - b[1])
      .map(([label]) => label)
      .join("-");
    add(
      "error",
      "sentence-order-answer-key-mismatch",
      `SENTENCE_ORDER answer key ${correctOrder.join("-")} does not reconstruct the source passage; reading the paragraphs in source order gives ${sourceOrder}. Fix correctAnswer to point at the option matching the source order.`,
    );
  }
}



/**
 * T10 무손실 분할 게이트 — givenSentence + (A)/(B)/(C) 가 원문을 무손실로 분할하는지
 * 결정형 검증(실측 결함 V1-SENTENCE-OMISSION / V1-SENTENCE-DROPPED-SEAM, campaign-20260716
 * P006·P007). (A)/(B)/(C) 단락은 원문의 verbatim 분할이므로, 세 단락이 원문에서 차지하는
 * 구간을 "원문 위치순"으로 정렬하면 (정답 순열과 무관하게) 서로 인접해야 한다. 두 단락
 * 구간 사이에 상당한 토큰 갭이 있으면 그 자리의 원문 문장이 조각화 때 통째로 유실된 것이고
 * (seam 누락), 구간이 겹치면 같은 원문 텍스트를 두 단락이 중복 사용한 것이다.
 *
 * 보수 원칙(오탐 배제):
 *  - givenSentence 는 리드 문장으로 패러프레이즈가 허용되므로 대조 대상에서 제외한다.
 *    따라서 given 이 덮는 원문 prefix 나 마지막 단락 뒤 trailing 절삭은 검출하지 않는다
 *    (수락 문항에서 흔한 정상 변형 — DB 실측 trailing 절삭 12%). 잡는 것은 오직 "두 단락
 *    사이"의 결손/중복뿐이다.
 *  - 세 단락이 원문 verbatim 으로 위치하지 않으면(패러프레이즈된 단락 등) 조용히 침묵한다.
 *    그 축은 sentence-order-paragraph-not-source-backed 가 담당하며, 그 전제가 성립할 때만
 *    (= 기존 재구성 게이트와 동일 전제) 이 게이트가 동작하므로 패러프레이즈 오탐이 없다.
 *  - fold 는 재구성 게이트(foldForSourceMatch)와 동일 — 구두점/곡선따옴표 무관 대조.
 *
 * DB 실측(수락 SENTENCE_ORDER 중 verbatim-backed 78건) 갭 토큰 히스토그램 {0:77, 15:1} 로
 * 이분 → 임계 4토큰에서 발동 1건(진탐: 실측 seam 유실), 오탐 0. error(strict 차단).
 * W2-D 정정(26-07-18, 지휘관 판정): 조각화 유실/중복은 정답 순열 재구성 불가(정답
 * 무효급 F결함)이므로 RELAXED_BLOCKING_QUALITY_CODES 에 등재해 전 레인 차단한다.
 */
export interface SentenceOrderCoverageFinding {
  code:
    | "sentence-order-source-sentence-omitted"
    | "sentence-order-source-sentence-duplicated";
  message: string;
  evidence: Record<string, unknown>;
}

export const SENTENCE_ORDER_SEAM_GAP_MIN_TOKENS = 4;

export function findSentenceOrderSourceCoverageIssues(
  paragraphs: unknown,
  passage: string | undefined,
): SentenceOrderCoverageFinding[] {
  if (!passage) return [];
  const paras = Array.isArray(paragraphs) ? paragraphs.filter(isRecord) : [];
  if (paras.length !== 3) return []; // 개수 결함은 sentence-order-paragraph-count 담당.

  // 재구성 게이트와 동일한 구두점 무관 fold — alnum+공백만 남긴다.
  const fold = (value: string) =>
    normalizeComparableText(value)
      .replace(/[^a-z0-9 ]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const foldedPassage = fold(passage);
  if (!foldedPassage) return [];

  // indexOf 첫 등장 고정은 반복 구/부분 일치에서 한 단락의 span 을 다른 단락 구간과
  // 겹치게 잡아 가짜 중복/누락 오탐을 낸다(W2-D 정정, 26-07-18). 각 단락의 모든 출현
  // 위치를 모은 뒤, 서로 겹치지 않는 배치를 찾아(3단락 소규모 완전탐색) span 을 정한다.
  const occurrencesByParagraph: Array<{ label: string; length: number; starts: number[] }> = [];
  for (const paragraph of paras) {
    const label = normalizeSentenceOrderParagraphLabel(paragraph.label);
    const foldedText = fold(normalizeText(paragraph.text));
    if (!foldedText) return []; // 빈 단락은 sentence-order-empty-paragraph 담당.
    const starts = collectAllOccurrences(foldedPassage, foldedText);
    if (starts.length === 0) return []; // 비-verbatim 단락 → not-source-backed 가 담당(패러프레이즈 침묵).
    occurrencesByParagraph.push({ label, length: foldedText.length, starts });
  }
  const spans = chooseNonOverlappingSpans(occurrencesByParagraph);
  spans.sort((a, b) => a.start - b.start);

  const countTokens = (value: string) => (value.match(/[a-z0-9]+/g) ?? []).length;
  const findings: SentenceOrderCoverageFinding[] = [];
  for (let i = 1; i < spans.length; i += 1) {
    const previous = spans[i - 1];
    const current = spans[i];
    if (current.start < previous.end) {
      // 구간 중첩 → 같은 원문 텍스트를 두 단락이 중복 사용(정답 순열 재구성 불가).
      const overlapTokens = countTokens(
        foldedPassage.slice(current.start, Math.min(previous.end, current.end)),
      );
      if (overlapTokens >= SENTENCE_ORDER_SEAM_GAP_MIN_TOKENS) {
        findings.push({
          code: "sentence-order-source-sentence-duplicated",
          message: `SENTENCE_ORDER paragraphs ${previous.label} and ${current.label} cover overlapping source text (${overlapTokens} shared tokens); the same passage span cannot belong to two chunks.`,
          evidence: {
            previousLabel: previous.label,
            currentLabel: current.label,
            overlapTokens,
          },
        });
      }
      continue;
    }
    const gap = foldedPassage.slice(previous.end, current.start);
    const gapTokens = countTokens(gap);
    if (gapTokens >= SENTENCE_ORDER_SEAM_GAP_MIN_TOKENS) {
      findings.push({
        code: "sentence-order-source-sentence-omitted",
        message: `SENTENCE_ORDER dropped source text at the seam between chunks ${previous.label} and ${current.label}: "${gap.slice(0, 120)}". givenSentence + (A)/(B)/(C) must partition the source without losing a sentence.`,
        evidence: {
          betweenLabels: `${previous.label}->${current.label}`,
          gapTokens,
          gap: gap.slice(0, 160),
        },
      });
    }
  }
  return findings;
}

/** haystack 안 needle 의 모든 시작 인덱스(겹치는 출현 포함). */
function collectAllOccurrences(haystack: string, needle: string): number[] {
  const starts: number[] = [];
  if (!needle) return starts;
  let from = 0;
  for (;;) {
    const index = haystack.indexOf(needle, from);
    if (index < 0) break;
    starts.push(index);
    from = index + 1;
  }
  return starts;
}

/**
 * 각 단락의 출현 후보 중 서로 겹치지 않는 배치를 완전탐색으로 고른다(3단락 소규모).
 * indexOf 첫 등장 고정은 반복 구/부분 일치에서 다른 단락과 겹치는 위치를 잡아 가짜
 * 중복/누락을 냈다. 겹치지 않는 조합이 여럿이면 전체 폭(첫 시작~끝)이 최소인, 가장
 * 촘촘한 타일링을 고른다 — 실제 연속 분할을 재현하되 진짜 누락 갭은 그대로 보존한다.
 * 겹치지 않는 조합이 아예 없으면(진짜 중복: 동일 텍스트가 원문에 1회뿐이라 두 단락이
 * 같은 구간을 쓸 수밖에 없음) 첫 등장 배치로 폴백해 중복 검출을 유지한다.
 */
interface SentenceOrderSpan {
  label: string;
  start: number;
  end: number;
}

function chooseNonOverlappingSpans(
  paragraphs: Array<{ label: string; length: number; starts: number[] }>,
): SentenceOrderSpan[] {
  const fallback: SentenceOrderSpan[] = paragraphs.map((paragraph) => ({
    label: paragraph.label,
    start: paragraph.starts[0],
    end: paragraph.starts[0] + paragraph.length,
  }));

  const overlaps = (a: SentenceOrderSpan, b: SentenceOrderSpan) =>
    a.start < b.end && b.start < a.end;

  const validCombinations: SentenceOrderSpan[][] = [];
  const current: SentenceOrderSpan[] = [];
  const recurse = (index: number) => {
    if (index === paragraphs.length) {
      validCombinations.push(current.map((span) => ({ ...span })));
      return;
    }
    const paragraph = paragraphs[index];
    for (const start of paragraph.starts) {
      const candidate: SentenceOrderSpan = {
        label: paragraph.label,
        start,
        end: start + paragraph.length,
      };
      if (current.some((placed) => overlaps(placed, candidate))) continue;
      current.push(candidate);
      recurse(index + 1);
      current.pop();
    }
  };
  recurse(0);

  // 겹치지 않는 배치가 없으면(진짜 중복: 동일 텍스트가 원문에 1회뿐) 첫 등장 폴백.
  if (validCombinations.length === 0) return fallback;
  const spanWidth = (combo: SentenceOrderSpan[]) =>
    Math.max(...combo.map((span) => span.end)) -
    Math.min(...combo.map((span) => span.start));
  // 겹치지 않는 조합이 여럿이면 전체 폭이 최소인, 가장 촘촘한 타일링을 고른다.
  return validCombinations.reduce((best, combo) =>
    spanWidth(combo) < spanWidth(best) ? combo : best,
  );
}

export function validateSentenceOrderOptions(
  question: Record<string, unknown>,
  add: (severity: QuestionQualitySeverity, code: string, message: string) => void,
) {
  const options = Array.isArray(question.options) ? question.options.filter(isRecord) : [];
  if (!options.length) return;

  const optionOrders = options.map((option) =>
    parseSentenceOrderPermutation(option.text),
  );
  const invalidOptionIndex = optionOrders.findIndex((order) => !order);
  if (invalidOptionIndex >= 0) {
    add(
      "error",
      "sentence-order-option-permutation",
      `SENTENCE_ORDER option ${invalidOptionIndex + 1} is not a valid (A)/(B)/(C) permutation.`,
    );
  }

  const validOrderTexts = optionOrders
    .filter((order): order is string[] => Array.isArray(order))
    .map((order) => order.join("-"));
  const duplicateOrder = findDuplicate(validOrderTexts);
  if (duplicateOrder) {
    add(
      "error",
      "sentence-order-option-duplicates",
      `SENTENCE_ORDER has duplicate order option: ${duplicateOrder}.`,
    );
  }

  const answerLabels = collectCorrectAnswerLabels(question);
  const answerLabel = answerLabels[0];
  if (!answerLabel) return;
  const correctOption = options.find(
    (option) => normalizeLabel(option.label) === answerLabel,
  );
  if (!correctOption) return;

  const correctOrder = parseSentenceOrderPermutation(correctOption.text);
  if (!correctOrder) {
    add(
      "error",
      "sentence-order-correct-option-shape",
      "SENTENCE_ORDER correct option must be a valid (A)/(B)/(C) permutation.",
    );
    return;
  }
  if (correctOrder.join("-") === "(A)-(B)-(C)") {
    add(
      "error",
      "sentence-order-unscrambled-answer",
      "SENTENCE_ORDER correct order must not be the displayed (A)-(B)-(C) order; shuffle labels so students cannot pick the visible order.",
    );
  }
}



export function normalizeSentenceOrderParagraphLabel(value: unknown): string {
  const text = normalizeText(value).toUpperCase();
  const match = text.match(/[ABC]/);
  return match ? `(${match[0]})` : text;
}



export function parseSentenceOrderPermutation(value: unknown): string[] | null {
  const text = normalizeText(value).toUpperCase();
  const labels = [...text.matchAll(/[（(]\s*([ABC])\s*[）)]/g)].map(
    (match) => `(${match[1]})`,
  );
  if (labels.length !== 3) return null;
  const unique = new Set(labels);
  if (unique.size !== 3) return null;
  return SENTENCE_ORDER_PARAGRAPH_LABELS.every((label) => unique.has(label))
    ? labels
    : null;
}
