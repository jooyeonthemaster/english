import type { ExamPassage } from "@/lib/exam-passages/types";

export const CODEX_NATIVE_WEBTOON_LANGUAGE = "KO_EN" as const;
export const CODEX_NATIVE_WEBTOON_CONCURRENCY = 10;
export const CODEX_NATIVE_WEBTOON_PROMPT_POLICY_VERSION =
  "codex-native-webtoon-2026-07-15-v4" as const;

export const CODEX_NATIVE_WEBTOON_CONCEPTS = [
  {
    id: "MACHO_BLACK_RED",
    label: "마초 블랙·레드",
    direction:
      "강렬한 검정·백색·붉은 포인트, 거친 먹선과 시네마틱 명암, 카리스마 있는 현대 한국 학습 액션 만화 감성. 지문 속 개념을 임무·대결·돌파·성장처럼 박력 있게 연출하되 폭력적이거나 공포스럽게 만들지 않는다.",
  },
  {
    id: "CUTE_PASTEL",
    label: "화이트톤 청소년 웹툰",
    direction:
      "사용자가 제공한 레퍼런스처럼 흰 바탕이 지배적인 담백한 한국 학습 웹툰. 얇고 깨끗한 검정·회색 선화, 부드러운 회색 명암, 아주 절제된 파스텔 포인트, 중·고등학생다운 자연스러운 인체 비율과 차분하고 호감 가는 표정. 유아용 치비, 과도하게 큰 머리와 눈, 통통한 아동 비율, 3D 장난감·동화책·키즈 앱 같은 광택과 원색은 금지한다.",
  },
] as const;

export type CodexNativeWebtoonConceptId =
  (typeof CODEX_NATIVE_WEBTOON_CONCEPTS)[number]["id"];

export interface CodexNativeWebtoonPromptInput {
  passage: ExamPassage;
  concept: CodexNativeWebtoonConceptId;
  correction?: string;
  styleReferenceNote?: string;
}

const FORBIDDEN = [
  "정답",
  "정답 사인",
  "선택지",
  "문제 유형",
  "요지 문제",
  "주제 문제",
  "제목 문제",
  "빈칸",
  "밑줄 의미",
  "삽입",
  "순서",
  "어법",
  "어휘",
  "①",
  "②",
  "③",
  "④",
  "⑤",
] as const;

export function buildCodexNativeWebtoonPrompt(
  input: CodexNativeWebtoonPromptInput,
): string {
  const { passage } = input;
  const concept = CODEX_NATIVE_WEBTOON_CONCEPTS.find(
    (item) => item.id === input.concept,
  );
  if (!concept) throw new Error(`Unknown Codex webtoon concept: ${input.concept}`);

  const phrases = extractCodexNativeCorePhrases(passage.text, input.concept);
  const isCute = input.concept === "CUTE_PASTEL";
  const correction = input.correction?.trim()
    ? `IMPORTANT CORRECTION FROM THE PREVIOUS PIXEL QA:\n${input.correction.trim()}\n\n`
    : "";
  const reference = input.styleReferenceNote?.trim()
    ? `Style reference role: ${input.styleReferenceNote.trim()}\n`
    : "";

  const compositionContract = isCute
    ? `- Exactly 10 clearly separated rectangular panels on one tall page, with the complete bottom border visible.
- Match the user's white-tone reference: two-column or varied roomy panel rhythm, white-dominant backgrounds, thin black/gray line art, soft gray shading, and only sparse pastel accents.
- Characters must read as Korean middle/high-school students or young adult mentors, not toddlers or children's mascots. No chibi, super-deformed, baby proportions, giant childlike eyes, glossy 3D, toy, picture-book, or kids-app styling.
- Keep illustration dominant. Text should occupy roughly one quarter to one third of the page, with generous white space and no wall-of-text panels.
- Use one short title panel, 7-8 visual story panels, and one memorable final panel. Let scenes, facial acting, and simple diagrams carry most of the explanation.`
    : `- One tall 9:16 page, 10-12 clearly separated rectangular panels, complete page visible with no cropped edge.
- Large phone-readable narration boxes; generous internal padding; no tiny filler writing.
- Use concrete scenes and recurring characters so the logic is memorable and fun.
- Title panel, concept setup, step-by-step development, concrete example/contrast, and a strong final memory panel.`;
  const bilingualContract = isCute
    ? `- Use only the short exact source-English excerpts listed below. Render every excerpt exactly, letter for letter, but do NOT print the full passage or expand excerpts into long English paragraphs.
- Place one excerpt in a relevant story panel and pair it immediately with a concise, natural Korean meaning or explanation of one or two short lines. Korean wording may be a meaning-preserving translation; it does not need to copy one frozen sentence.
- Keep total text only slightly denser than the user's reference. A normal content panel should have at most one short English excerpt plus one or two short Korean lines. Avoid more than three compact text lines in one box and avoid dense bottom summary grids.
- Explain remaining logic through the drawings and brief Korean narration. Preserve the passage's full flow without copying every source sentence.
- Exact source-English excerpts that must appear once each, in reading order:\n${phrases.map((phrase) => `  ${phrase}`).join("\n")}`
    : `- Every important information unit must appear as an English line immediately paired with a natural Korean meaning/explanation.
- Render each source-English paragraph in the block below EXACTLY, letter for letter. The blank lines only separate entries. Do not add quotation marks, numbering, bullets, labels, or other punctuation around them. Line wrapping and spaces between lines are allowed; changed, missing, invented, or misspelled words are forbidden.
${phrases.join("\n\n")}
- Put a natural, correctly spelled Korean translation directly next to or below each exact English phrase.
- Other Korean narration may connect the logic, but do not invent unsupported facts.`;

  return `${correction}Use case: illustration-story
Asset type: ONE complete vertical educational Korean webtoon page for high-school English passage comprehension
Native generation rule: Generate the artwork AND every Korean/English character together inside the image pixels in this single generation. Never leave space for later text. No text overlay, compositing, inpainting, or post-added typography.

Passage ID: ${passage.id}
Exam metadata: ${passage.year} ${passage.exam}, ${passage.grade ?? "고3"}, questions ${passage.qNumbers.join(", ")}
Concept: ${concept.id} — ${concept.label}
${reference}Visual direction: ${concept.direction}
Reference safety: Use references only for broad mood, panel rhythm, text-box integration, and polish. Do not copy exact characters, mascots, layouts, logos, wording, or a recognizable existing work.

Primary request: Turn the SOURCE PASSAGE below into a genuinely entertaining, high-quality content-understanding webtoon. Preserve the passage's central claim, logical flow, examples, contrast, cause-and-effect, and final takeaway. This is not a test-solution page.

Format and composition:
${compositionContract}
- Keep every panel visually purposeful. Do not reduce the required bilingual content to avoid text difficulty.

Bilingual text contract — first principle:
${bilingualContract}
- No nonsense glyphs, pseudo-Korean, pseudo-English, blank bubbles, clipped words, watermarks, signatures, or brand names.

Content restrictions:
- Never mention the answer, choices, option numbers, question type, test-taking strategy, or deliberate exam error.
- Forbidden visible strings/concepts: ${FORBIDDEN.map((item) => `"${item}"`).join(", ")}.
- Do not add a person, place, date, number, mechanism, scientific claim, or causal claim absent from the source.
- If the source is abstract, visualize it with an analogy while clearly preserving the original meaning.

SOURCE PASSAGE:
"""
${passage.text.trim()}
"""

Final pixel QA reminder: Before finishing, visually check every Korean and English character, every text-box edge, every panel, the full tall page, the audience age/style, and the reference-like text density. A single broken character, misspelling, cropped caption, missing phrase, childish visual downgrade, excessive text block, blank bubble, or content contradiction makes the image unacceptable.`;
}

export function extractCodexNativeCorePhrases(
  text: string,
  concept: CodexNativeWebtoonConceptId = "MACHO_BLACK_RED",
): string[] {
  if (!text.trim()) return [];

  if (concept === "CUTE_PASTEL") {
    return extractCuteReferencePhrases(text);
  }

  // Keep source offsets throughout. Normalising whitespace before slicing made a
  // visually plausible phrase that was not necessarily an exact source substring.
  const sentences = splitSentenceSpans(text);
  const sentencePhrases = selectEvenlySpacedPhrases(text, sentences, 8);
  if (sentencePhrases.length >= 5) return sentencePhrases;

  // Notices, quotations, and truncated legacy records can contain fewer than five
  // sentences. Prefer their clauses before falling back to balanced word windows.
  const clauses = sentences.flatMap((sentence) => splitClauseSpan(text, sentence));
  const clausePhrases = selectEvenlySpacedPhrases(text, clauses, 8);
  if (clausePhrases.length >= 5) return clausePhrases;

  return buildNonOverlappingWordWindows(text, 8);
}

function extractCuteReferencePhrases(text: string): string[] {
  const sentences = splitSentenceSpans(text);
  const target = Math.min(7, Math.max(5, sentences.length));
  const selected = selectEvenlySpacedSpans(sentences, target)
    .map((span) => compactExactPhrase(text, span))
    .filter((phrase): phrase is string => Boolean(phrase));
  const unique = selected.filter((phrase, index) => selected.indexOf(phrase) === index);
  if (unique.length >= 5) return unique.slice(0, 7);

  const clauses = sentences.flatMap((sentence) => splitClauseSpan(text, sentence));
  const clauseTarget = Math.min(7, Math.max(5, clauses.length));
  const fromClauses = selectEvenlySpacedSpans(clauses, clauseTarget)
    .map((span) => compactExactPhrase(text, span))
    .filter((phrase): phrase is string => Boolean(phrase));
  const uniqueClauses = fromClauses.filter(
    (phrase, index) => fromClauses.indexOf(phrase) === index,
  );
  if (uniqueClauses.length >= 5) return uniqueClauses.slice(0, 7);

  return buildShortNonOverlappingWordWindows(text, 7);
}

function selectEvenlySpacedSpans(spans: SourceSpan[], target: number): SourceSpan[] {
  if (spans.length === 0 || target <= 0) return [];
  const count = Math.min(target, spans.length);
  const step = count === 1 ? 0 : (spans.length - 1) / (count - 1);
  return Array.from({ length: count }, (_, index) => spans[Math.round(index * step)])
    .filter((span): span is SourceSpan => Boolean(span));
}

const PHRASE_EDGE_STOP_WORDS = new Set([
  "a", "an", "and", "as", "at", "because", "but", "by", "for", "from",
  "her", "his", "if", "in", "into", "its", "of", "on", "or", "our",
  "than", "that", "the", "their", "to", "toward", "when", "which", "who",
  "with", "your",
]);

const PHRASE_DISCOURSE_STARTS = new Set([
  "although", "however", "moreover", "nevertheless", "therefore",
]);

const PHRASE_LIKELY_INCOMPLETE_ENDS = new Set([
  "activities", "activity", "before", "blindly", "expect", "follow", "level", "participants", "physical",
  "training",
]);

const PHRASE_LOGIC_WEIGHTS: Record<string, number> = {
  awareness: 15,
  because: 8,
  cause: 10,
  determine: 20,
  effect: 10,
  enable: 14,
  enhance: 14,
  expect: 5,
  explain: 10,
  focus: 9,
  important: 7,
  improve: 14,
  instead: 8,
  mean: 8,
  not: 6,
  ownership: 18,
  principle: 14,
  result: 10,
  sufficient: 12,
  understand: 14,
  unrelated: 14,
};

function compactExactPhrase(text: string, span: SourceSpan): string {
  const trimmed = trimSourceSpan(text, span);
  if (!trimmed) return "";
  const whole = text.slice(trimmed.start, trimmed.end);
  if (whole.length <= 96 && wordCount(whole) <= 15) return whole;

  const clauses = splitClauseSpan(text, trimmed)
    .map((clause) => trimSourceSpan(text, clause))
    .filter((clause): clause is SourceSpan => Boolean(clause))
    .map((clause) => ({
      span: clause,
      value: text.slice(clause.start, clause.end).replace(/[,:;]\s*$/, ""),
    }))
    .filter(({ value }) => value.length >= 20 && value.length <= 96 && wordCount(value) >= 4 && wordCount(value) <= 15)
    .sort((a, b) => compactPhraseScore(b.value) - compactPhraseScore(a.value));
  if (clauses[0]) return clauses[0].value;

  const tokens = [...whole.matchAll(/\S+/g)].map((match) => ({
    start: trimmed.start + match.index,
    end: trimmed.start + match.index + match[0].length,
  }));
  let best = "";
  let bestScore = Number.NEGATIVE_INFINITY;
  let bestTerminal = "";
  let bestTerminalScore = Number.NEGATIVE_INFINITY;
  for (let size = Math.min(15, tokens.length); size >= Math.min(4, tokens.length); size -= 1) {
    for (let start = 0; start + size <= tokens.length; start += 1) {
      const first = tokens[start];
      const last = tokens[start + size - 1];
      if (!first || !last) continue;
      const candidate = text.slice(first.start, last.end).replace(/[,:;]\s*$/, "");
      if (candidate.length > 96 || (candidate.match(/"/g) ?? []).length % 2 === 1) continue;
      const score =
        compactPhraseScore(candidate) +
        (last.end === trimmed.end ? 12 : 0) +
        (first.start === trimmed.start ? 3 : 0);
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
      if (last.end === trimmed.end && score > bestTerminalScore) {
        bestTerminal = candidate;
        bestTerminalScore = score;
      }
    }
  }
  if (
    best &&
    !/[.!?]["')\]]?$/.test(best.trim()) &&
    bestTerminal &&
    bestTerminalScore >= bestScore - 30
  ) {
    return bestTerminal;
  }
  return best || exactReadableSlice(text, trimmed, 96);
}

function compactPhraseScore(value: string): number {
  const words: string[] = value.toLowerCase().match(/[a-z0-9']+/g) ?? [];
  const first = words[0] ?? "";
  const last = words.at(-1) ?? "";
  const contentWords = words.filter((word) => !PHRASE_EDGE_STOP_WORDS.has(word)).length;
  const logicWeight = words.reduce(
    (sum, word) => sum + (PHRASE_LOGIC_WEIGHTS[word] ?? 0),
    0,
  );
  const pairedComparison = words.includes("more") && words.includes("than") ? 12 : 0;
  const negativeContrast = words.includes("not") || words.includes("unrelated") ? 6 : 0;
  const hasTerminalPunctuation = /[.!?]["')\]]?$/.test(value.trim());
  return (
    contentWords * 4 -
    Math.abs(words.length - 10) * 2 -
    (PHRASE_EDGE_STOP_WORDS.has(first) ? 5 : 0) -
    (PHRASE_DISCOURSE_STARTS.has(first) ? 18 : 0) -
    (PHRASE_EDGE_STOP_WORDS.has(last) ? 30 : 0) -
    (!hasTerminalPunctuation && PHRASE_LIKELY_INCOMPLETE_ENDS.has(last) ? 20 : 0) -
    Math.max(0, value.length - 64) +
    logicWeight +
    pairedComparison +
    negativeContrast
  );
}

function wordCount(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function buildShortNonOverlappingWordWindows(text: string, maximum: number): string[] {
  const tokens = [...text.matchAll(/\S+/g)].map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
  }));
  if (tokens.length === 0) return [];
  const target = Math.min(maximum, Math.max(1, Math.min(tokens.length, 5)));
  const phrases: string[] = [];
  let cursor = 0;
  for (let index = 0; index < target; index += 1) {
    const remaining = tokens.length - cursor;
    const groups = target - index;
    const groupSize = Math.ceil(remaining / groups);
    const endExclusive = Math.min(tokens.length, cursor + groupSize);
    const candidates: string[] = [];
    for (let size = Math.min(15, endExclusive - cursor); size >= 1; size -= 1) {
      for (let offset = 0; cursor + offset + size <= endExclusive; offset += 1) {
        const first = tokens[cursor + offset];
        const last = tokens[cursor + offset + size - 1];
        if (!first || !last) continue;
        const value = text.slice(first.start, last.end).replace(/[,:;]\s*$/, "");
        if (
          value &&
          value.length <= 96 &&
          (value.match(/"/g) ?? []).length % 2 === 0 &&
          !candidates.includes(value)
        ) {
          candidates.push(value);
        }
      }
    }
    const phrase = candidates
      .sort((a, b) => compactPhraseScore(b) - compactPhraseScore(a))
      .find((candidate) => !phrases.includes(candidate));
    if (phrase) phrases.push(phrase);
    cursor += groupSize;
  }
  return phrases;
}

interface SourceSpan {
  start: number;
  end: number;
}

const SENTENCE_ABBREVIATIONS = new Set([
  "dr",
  "e.g",
  "etc",
  "fig",
  "i.e",
  "inc",
  "jr",
  "mr",
  "mrs",
  "ms",
  "no",
  "prof",
  "sr",
  "st",
  "u.k",
  "u.s",
  "vs",
]);

function trimSourceSpan(text: string, span: SourceSpan): SourceSpan | null {
  let { start, end } = span;
  while (start < end && /\s/.test(text[start] ?? "")) start += 1;
  while (end > start && /\s/.test(text[end - 1] ?? "")) end -= 1;
  return start < end ? { start, end } : null;
}

function splitSentenceSpans(text: string): SourceSpan[] {
  const spans: SourceSpan[] = [];
  const punctuation = /[.!?]+/g;
  let start = 0;
  let match: RegExpExecArray | null;

  while ((match = punctuation.exec(text))) {
    const end = match.index + match[0].length;
    const isLast = !text.slice(end).trim();
    const beginsAnotherSentence = /^\s+["'([{]*[A-Z0-9]/.test(text.slice(end));
    if (!isLast && !beginsAnotherSentence) continue;
    if (match[0] === "." && isLikelyAbbreviation(text, match.index)) continue;

    const span = trimSourceSpan(text, { start, end });
    if (span) spans.push(span);
    start = end;
  }

  const tail = trimSourceSpan(text, { start, end: text.length });
  if (tail) spans.push(tail);
  return spans;
}

function isLikelyAbbreviation(text: string, periodIndex: number): boolean {
  if (/\d/.test(text[periodIndex - 1] ?? "") && /\d/.test(text[periodIndex + 1] ?? "")) {
    return true;
  }
  const before = text.slice(0, periodIndex);
  const token = before.match(/([A-Za-z](?:[A-Za-z.]*)?)$/)?.[1] ?? "";
  const normalized = token.toLowerCase().replace(/\.$/, "");
  return (
    SENTENCE_ABBREVIATIONS.has(normalized) ||
    /^[A-Z]$/.test(token) ||
    /^(?:[A-Za-z]\.)+[A-Za-z]$/.test(token)
  );
}

function splitClauseSpan(text: string, span: SourceSpan): SourceSpan[] {
  const spans: SourceSpan[] = [];
  const clauseBreak = /[;:]|,(?=\s+(?:and|but|or|yet|so|however|therefore)\b)|[\u2013\u2014]/gi;
  clauseBreak.lastIndex = span.start;
  let start = span.start;
  let match: RegExpExecArray | null;

  while ((match = clauseBreak.exec(text)) && match.index < span.end) {
    const end = match.index + match[0].length;
    const clause = trimSourceSpan(text, { start, end });
    if (clause) spans.push(clause);
    start = end;
  }

  const tail = trimSourceSpan(text, { start, end: span.end });
  if (tail) spans.push(tail);
  return spans;
}

function selectEvenlySpacedPhrases(
  text: string,
  spans: SourceSpan[],
  maximum: number,
): string[] {
  if (spans.length === 0) return [];
  const target = Math.min(maximum, spans.length);
  const step = target === 1 ? 0 : (spans.length - 1) / (target - 1);
  const phrases: string[] = [];

  for (let index = 0; index < target; index += 1) {
    const span = spans[Math.round(index * step)];
    if (!span) continue;
    const phrase = exactReadableSlice(text, span, 168);
    if (phrase && !phrases.includes(phrase)) phrases.push(phrase);
  }
  return phrases;
}

function exactReadableSlice(text: string, span: SourceSpan, maxLength: number): string {
  const trimmed = trimSourceSpan(text, span);
  if (!trimmed) return "";
  if (trimmed.end - trimmed.start <= maxLength) {
    return text.slice(trimmed.start, trimmed.end);
  }

  const maximumEnd = Math.min(trimmed.end, trimmed.start + maxLength + 1);
  const prefix = text.slice(trimmed.start, maximumEnd);
  const preferredCuts = [
    prefix.lastIndexOf("; "),
    prefix.lastIndexOf(": "),
    prefix.lastIndexOf(", "),
    prefix.lastIndexOf(" \u2014 "),
    prefix.lastIndexOf(" \u2013 "),
    prefix.lastIndexOf(" - "),
  ];
  const preferredCut = Math.max(...preferredCuts);
  const wordCut = prefix.lastIndexOf(" ");
  const relativeEnd = preferredCut >= 58 ? preferredCut : wordCut;
  const cut = trimSourceSpan(text, {
    start: trimmed.start,
    end: trimmed.start + Math.max(1, relativeEnd),
  });
  if (!cut) return "";

  let { start, end } = cut;
  const value = text.slice(start, end);
  if ((value.match(/"/g) ?? []).length % 2 === 1) {
    if (value.startsWith('"')) start += 1;
    else {
      const unmatched = value.lastIndexOf('"');
      if (unmatched > 0) end = start + unmatched;
    }
  }
  return text.slice(start, end).trim();
}

function buildNonOverlappingWordWindows(text: string, maximum: number): string[] {
  const tokens = [...text.matchAll(/\S+/g)].map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
  }));
  if (tokens.length === 0) return [];

  const target = Math.min(maximum, tokens.length);
  const phrases: string[] = [];
  let tokenStart = 0;

  for (let group = 0; group < target; group += 1) {
    const remainingTokens = tokens.length - tokenStart;
    const remainingGroups = target - group;
    const groupSize = Math.ceil(remainingTokens / remainingGroups);
    const tokenEnd = tokenStart + groupSize;
    const variants: string[] = [];

    // Each candidate stays inside its own disjoint group. Progressively shorter
    // asymmetric variants keep repeated sentences unique without invented text.
    for (let removed = 0; removed < groupSize; removed += 1) {
      for (let fromLeft = 0; fromLeft <= removed; fromLeft += 1) {
        const fromRight = removed - fromLeft;
        const first = tokens[tokenStart + fromLeft];
        const last = tokens[tokenEnd - fromRight - 1];
        if (!first || !last || first.start >= last.end) continue;
        variants.push(text.slice(first.start, last.end));
      }
    }

    const phrase =
      variants.find(
        (candidate) =>
          candidate.length <= 168 &&
          (candidate.match(/"/g) ?? []).length % 2 === 0 &&
          !phrases.includes(candidate),
      ) ??
      variants.find(
        (candidate) => candidate.length <= 168 && !phrases.includes(candidate),
      ) ??
      variants.find((candidate) => !phrases.includes(candidate));
    if (phrase) phrases.push(phrase);
    tokenStart = tokenEnd;
  }

  return phrases.slice(0, maximum);
}
