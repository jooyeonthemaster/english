import type { FoundPosition, Replacement } from "./types";

/**
 * Normalize whitespace artifacts in passage text: non-breaking spaces
 * (웹/워드 붙여넣기 잔재 — 줄바꿈이 불가능해 렌더 시 문단이 한 줄로 잘림)
 * and blank-line runs. Word spacing and single line breaks are preserved.
 */
export function normalizePassageWhitespace(text: string): string {
  return text
    // 아래 문자 클래스는 비가시 문자 리터럴 3개: U+00A0(NBSP), U+202F, U+2007
    .replace(/[   ]/g, " ")
    .replace(/\n(?:[ \t]*\n)+/g, "\n\n");
}

/**
 * Normalize text for comparison: collapse whitespace, normalize Unicode quotes
 * and dashes, trim.
 */
export function normalizeForComparison(text: string): string {
  return text
    .replace(/[‘’‚‛]/g, "'") // smart single quotes
    .replace(/[“”„‟]/g, '"') // smart double quotes
    .replace(/[–—]/g, "-") // en/em dashes
    .replace(/ /g, " ") // non-breaking space
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Map an index in normalized text back to original text index.
 * Returns null if mapping fails.
 */
export function mapNormalizedIndexToOriginal(
  original: string,
  normalizedIdx: number,
): number | null {
  let normPos = 0;
  let origPos = 0;

  // Skip leading whitespace in the same way normalizeForComparison trims
  while (origPos < original.length && /\s/.test(original[origPos])) {
    origPos++;
  }

  let prevWasSpace = false;

  while (origPos < original.length && normPos < normalizedIdx) {
    const ch = original[origPos];
    if (/\s/.test(ch)) {
      if (!prevWasSpace) {
        normPos++;
        prevWasSpace = true;
      }
      origPos++;
    } else {
      normPos++;
      origPos++;
      prevWasSpace = false;
    }
  }

  return normPos === normalizedIdx ? origPos : null;
}

/**
 * Find expression near the surroundingText region.
 */
export function findWithSurroundingContext(
  passage: string,
  expression: string,
  surroundingText: string,
): FoundPosition | null {
  // Find the surrounding text in the passage
  const contextIdx = findSurroundingContextIndex(passage, surroundingText);
  if (contextIdx === null) return null;

  const preferWordBoundary = isSingleTokenExpression(expression);

  // First search inside the matched surroundingText itself. This is the most
  // reliable signal the model gives us; widening the window too early lets
  // short targets such as "it" match inside words like "digital" or
  // "commitments" before the intended pronoun.
  const exactContext = passage.slice(
    contextIdx,
    contextIdx + surroundingText.length,
  );
  const inContext = findInSlice(
    exactContext,
    expression,
    preferWordBoundary,
  );
  if (inContext) {
    return { index: contextIdx + inContext.index, length: inContext.length };
  }

  // Define a search window around the context: a generous margin.
  const margin = 50;
  const windowStart = Math.max(0, contextIdx - margin);
  const windowEnd = Math.min(
    passage.length,
    contextIdx + surroundingText.length + margin,
  );
  const window = passage.slice(windowStart, windowEnd);

  // Find expression within this window, still respecting token boundaries for
  // single-word/pronoun targets.
  const inWindow = findInSlice(window, expression, preferWordBoundary);
  if (inWindow) {
    return { index: windowStart + inWindow.index, length: inWindow.length };
  }

  return null;
}

function findSurroundingContextIndex(
  passage: string,
  surroundingText: string,
): number | null {
  let contextIdx = passage.indexOf(surroundingText);

  // Fallback: case-insensitive
  if (contextIdx === -1) {
    contextIdx = passage.toLowerCase().indexOf(surroundingText.toLowerCase());
  }

  // Fallback: normalized
  if (contextIdx === -1) {
    const normPassage = normalizeForComparison(passage);
    const normCtx = normalizeForComparison(surroundingText);
    const normIdx = normPassage.indexOf(normCtx);
    if (normIdx !== -1) {
      const mapped = mapNormalizedIndexToOriginal(passage, normIdx);
      if (mapped !== null) contextIdx = mapped;
    }
  }

  return contextIdx === -1 ? null : contextIdx;
}

function isSingleTokenExpression(expression: string): boolean {
  const trimmed = expression.trim();
  return /^[A-Za-z][A-Za-z'-]*$/.test(trimmed);
}

function isWordChar(ch: string | undefined): boolean {
  return !!ch && /[A-Za-z0-9_]/.test(ch);
}

function hasTokenBoundaries(text: string, index: number, length: number): boolean {
  return !isWordChar(text[index - 1]) && !isWordChar(text[index + length]);
}

function findInSlice(
  text: string,
  expression: string,
  requireTokenBoundaries: boolean,
): FoundPosition | null {
  const candidates = [expression, expression.trim()].filter(Boolean);

  for (const candidate of candidates) {
    let idx = text.indexOf(candidate);
    while (idx !== -1) {
      if (
        !requireTokenBoundaries ||
        hasTokenBoundaries(text, idx, candidate.length)
      ) {
        return { index: idx, length: candidate.length };
      }
      idx = text.indexOf(candidate, idx + 1);
    }
  }

  const lowerText = text.toLowerCase();
  for (const candidate of candidates) {
    const lowerCandidate = candidate.toLowerCase();
    let idx = lowerText.indexOf(lowerCandidate);
    while (idx !== -1) {
      if (
        !requireTokenBoundaries ||
        hasTokenBoundaries(text, idx, candidate.length)
      ) {
        return { index: idx, length: candidate.length };
      }
      idx = lowerText.indexOf(lowerCandidate, idx + 1);
    }
  }

  return null;
}

/**
 * Find an expression within a passage, optionally using surrounding text
 * for disambiguation when there are multiple occurrences.
 */
export function findExpressionInPassage(
  passage: string,
  expression: string,
  surroundingText?: string,
  strictContext = false,
): FoundPosition | null {
  if (!expression || !passage) return null;

  // --- Strategy 1: Use surroundingText for disambiguation ---
  if (surroundingText && surroundingText.trim().length > 0) {
    const result = findWithSurroundingContext(passage, expression, surroundingText);
    if (result) return result;

    // strictContext: 윈도우 안에서 못 찾으면 전역 폴백 없이 실패시킨다.
    // (어법 마커처럼 위치가 의미를 결정하는 호출자가 변형 체인을 윈도우 안에서
    // 모두 시도한 뒤에만 전역 폴백하도록 단계를 분리할 때 사용.)
    if (strictContext) return null;
  }

  // --- Strategy 2: Exact match ---
  const exactIdx = passage.indexOf(expression);
  if (exactIdx !== -1) {
    return { index: exactIdx, length: expression.length };
  }

  // --- Strategy 3: Case-insensitive match ---
  const lowerPassage = passage.toLowerCase();
  const lowerExpr = expression.toLowerCase();
  const ciIdx = lowerPassage.indexOf(lowerExpr);
  if (ciIdx !== -1) {
    return { index: ciIdx, length: expression.length };
  }

  // --- Strategy 4: Normalized match ---
  const normPassage = normalizeForComparison(passage);
  const normExpr = normalizeForComparison(expression);
  if (normExpr.length === 0) return null;

  const normIdx = normPassage.indexOf(normExpr);
  if (normIdx !== -1) {
    // Map normalized index back to original. Walk through original passage
    // consuming characters and matching against normalized position.
    const mappedIdx = mapNormalizedIndexToOriginal(passage, normIdx);
    if (mappedIdx !== null) {
      // Find the actual length in original text that covers normExpr.length normalized chars
      const mappedEnd = mapNormalizedIndexToOriginal(passage, normIdx + normExpr.length);
      const origLen = mappedEnd !== null ? mappedEnd - mappedIdx : expression.length;
      return { index: mappedIdx, length: origLen };
    }
  }

  return null;
}

/**
 * 빈칸/표현 매칭 보강 폴백. findExpressionInPassage 가 verbatim/정규화로 못 찾을
 * 때에만 호출한다(통과 케이스 동작 불변 — 회귀 없음). 두 단계로 near-verbatim 선택을
 * 구제한다:
 *  1) 앞뒤 말줄임표(…/...)·따옴표·구두점을 떼고 verbatim/정규화 재시도.
 *  2) 여전히 실패 + 다단어면, 내용 토큰을 순서대로 `\b토큰[\s구두점]+토큰\b` 로 묶어
 *     원문에서 토큰 사이의 구두점/공백 차이만 허용해 연속 매칭한다. 토큰 사이에
 *     다른 "단어"가 삽입된 경우는 매칭하지 않으며(분리자 클래스는 글자를 못 먹음),
 *     매칭 길이가 표현 길이+여유를 넘으면 과매칭으로 보고 거부한다.
 * 모델이 빈칸 정답 구간을 고를 때 내부 쉼표/공백/하이픈을 빠뜨린 사례
 * (prod "Expression not found" 다수)를 안전하게 살린다.
 */
export function findExpressionInPassageFuzzy(
  passage: string,
  expression: string,
  surroundingText?: string,
): FoundPosition | null {
  if (!expression || !passage) return null;

  // 1) 앞뒤 말줄임표/따옴표/구두점 트림 후 재시도(정규화 경로 포함, surroundingText 존중)
  const trimmed = expression
    .replace(/^[\s"'“”‘’.…]+/u, "")
    .replace(/[\s"'“”‘’.…]+$/u, "")
    .trim();
  if (trimmed && trimmed !== expression) {
    const retried = findExpressionInPassage(passage, trimmed, surroundingText);
    if (retried) return retried;
  }

  // 2) 구두점/공백 관용 연속 매칭 (다단어 전용)
  const base = trimmed || expression;
  const tokens = base.match(/[A-Za-z0-9][A-Za-z0-9'’-]*/g) ?? [];
  if (tokens.length < 2) return null;

  let re: RegExp;
  try {
    const pattern =
      "\\b" +
      tokens
        .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join("[\\s\\p{P}]+") +
      "\\b";
    re = new RegExp(pattern, "iu");
  } catch {
    // 정규식 구성 실패 시 폴백 포기 (거부 유지)
    return null;
  }

  const maxLen = base.length + Math.max(8, tokens.length * 2);
  const tryMatch = (text: string, offset: number): FoundPosition | null => {
    const m = re.exec(text);
    if (!m) return null;
    // 문장/문단 경계(.!? 또는 줄바꿈)를 가로지르는 매치는 거부한다 — 이 폴백은
    // 토큰 사이의 쉼표/공백/하이픈 누락만 구제하려는 것이고, 문장 경계를 넘는 빈칸은
    // T3 프롬프트가 금지하는 결함(과매칭으로 엉뚱한 구간 빈칸화)이기 때문.
    if (m[0].length > maxLen || /[.!?\n\r]/.test(m[0])) return null;
    return { index: offset + m.index, length: m[0].length };
  };

  // surroundingText 가 있으면 그 윈도우 안에서 먼저 찾는다(동형 표현 다중 출현 시
  // 모델의 위치 힌트를 존중 — 첫 출현을 무조건 집어 엉뚱한 곳을 빈칸화하는 것 방지).
  // 못 찾으면 전역 폴백.
  if (surroundingText && surroundingText.trim().length > 0) {
    let ctxIdx = passage.indexOf(surroundingText);
    if (ctxIdx === -1) {
      ctxIdx = passage.toLowerCase().indexOf(surroundingText.toLowerCase());
    }
    if (ctxIdx !== -1) {
      const start = Math.max(0, ctxIdx - 20);
      const end = Math.min(passage.length, ctxIdx + surroundingText.length + 20);
      const inWindow = tryMatch(passage.slice(start, end), start);
      if (inWindow) return inWindow;
    }
  }

  return tryMatch(passage, 0);
}

/**
 * Find an expression using word-boundary awareness (for single words/pronouns).
 * Prefers exact word boundaries over substring matches.
 */
export function findWordInPassage(
  passage: string,
  word: string,
  surroundingText?: string,
  strictContext = false,
): FoundPosition | null {
  if (!word || !passage) return null;

  // --- Strategy 1: Use surroundingText context ---
  if (surroundingText && surroundingText.trim().length > 0) {
    const result = findWithSurroundingContext(passage, word, surroundingText);
    if (result) return result;

    // For REFERENCE, the context is the only safe disambiguator. When it is
    // stale, too broad, or does not contain the token as a standalone word,
    // failing is better than silently underlining a different pronoun elsewhere.
    if (strictContext) return null;
  }

  // --- Strategy 2: Word-boundary regex ---
  try {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const wbRegex = new RegExp(`\\b${escaped}\\b`);
    const match = wbRegex.exec(passage);
    if (match) {
      return { index: match.index, length: word.length };
    }
  } catch {
    // If regex fails, fall through
  }

  // --- Strategy 3: Case-insensitive word-boundary regex ---
  try {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const wbRegex = new RegExp(`\\b${escaped}\\b`, "i");
    const match = wbRegex.exec(passage);
    if (match) {
      return { index: match.index, length: match[0].length };
    }
  } catch {
    // If regex fails, fall through
  }

  // --- Strategy 4: Normalized word-boundary match ---
  // 모델이 ASCII 따옴표/하이픈을 쓰는데 지문은 유니코드 변종(곡선따옴표 ’,
  // en/em 대시 –—, NBSP)을 가진 경우를 메운다 (don't↔don’t, co-op↔co–op).
  // 정규화한 사본 위에서 \b...\b 단어 경계를 그대로 요구하므로 dig__it__al
  // 같은 부분문자열 homograph 스냅은 여전히 차단된다. 매치 인덱스는
  // mapNormalizedIndexToOriginal 로 원문 위치로 되돌린다(따옴표/대시 치환은
  // 1:1 이라 인덱스 불변, 공백 축약만 매핑이 보정).
  const normPassage = normalizeForComparison(passage);
  const normWord = normalizeForComparison(word);
  if (normWord.length > 0) {
    try {
      const escaped = normWord.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const wbRegex = new RegExp(`\\b${escaped}\\b`, "i");
      const match = wbRegex.exec(normPassage);
      if (match) {
        const mappedIdx = mapNormalizedIndexToOriginal(passage, match.index);
        if (mappedIdx !== null) {
          // mapNormalizedIndexToOriginal 은 다중 공백 런 뒤를 가리킬 때 시작
          // 인덱스를 공백 위에 둘 수 있다(off-by-one). 단일 토큰 단어이므로
          // 실제 첫 글자까지 전진하고, 끝 인덱스의 후행 공백은 트림한다.
          let startIdx = mappedIdx;
          while (startIdx < passage.length && /\s/.test(passage[startIdx])) {
            startIdx += 1;
          }
          const mappedEnd = mapNormalizedIndexToOriginal(
            passage,
            match.index + match[0].length,
          );
          let endIdx = mappedEnd !== null ? mappedEnd : startIdx + word.length;
          while (endIdx > startIdx && /\s/.test(passage[endIdx - 1])) {
            endIdx -= 1;
          }
          const origLen = Math.max(1, endIdx - startIdx);
          return { index: startIdx, length: origLen };
        }
      }
    } catch {
      // If regex fails, fall through
    }
  }

  // Do not fall back to plain substring matching for word/pronoun targets.
  // A failed lookup is safer than producing dig__it__al / comm__it__ments.
  return null;
}

/**
 * Match a narrow OCR-noise pattern where a source token has one extra leading
 * letter, but the model copied the intended English token without that artifact.
 *
 * Example: "Coutpaces" in OCR text can be matched by model output "outpaces".
 */
export function findOcrNoisyExpressionInPassage(
  passage: string,
  expression: string,
  surroundingText?: string,
): FoundPosition | null {
  const target = expression.trim();
  if (!/^[A-Za-z][A-Za-z'-]{4,}$/.test(target)) return null;

  const targetLower = target.toLowerCase();
  const matches: FoundPosition[] = [];
  const tokenRegex = /[A-Za-z][A-Za-z'-]*/g;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(passage))) {
    const token = match[0];
    const tokenLower = token.toLowerCase();
    if (
      tokenLower.length === targetLower.length + 1 &&
      tokenLower.endsWith(targetLower)
    ) {
      matches.push({ index: match.index, length: token.length });
    }
  }

  if (matches.length <= 1 || !surroundingText?.trim()) {
    return matches[0] ?? null;
  }

  const contextTokens = contentTokenSet(surroundingText);
  let best = matches[0];
  let bestScore = -1;

  for (const candidate of matches) {
    const window = passage.slice(
      Math.max(0, candidate.index - 80),
      Math.min(passage.length, candidate.index + candidate.length + 80),
    );
    const windowTokens = contentTokenSet(window);
    let score = 0;
    for (const token of contextTokens) {
      if (windowTokens.has(token)) score += 1;
    }
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return best;
}

/**
 * Replace exactly `length` chars at `position` with `replacement`.
 */
export function replaceAtPosition(
  text: string,
  position: number,
  length: number,
  replacement: string,
): string {
  return text.slice(0, position) + replacement + text.slice(position + length);
}

/**
 * Apply multiple replacements to text, sorted RTL (right-to-left) to avoid
 * offset drift.
 */
export function applyReplacementsRTL(text: string, replacements: Replacement[]): string {
  // Sort by position descending
  const sorted = [...replacements].sort((a, b) => b.position - a.position);
  let result = text;
  for (const r of sorted) {
    result = replaceAtPosition(result, r.position, r.originalLength, r.newText);
  }
  return result;
}

/**
 * Ensure an expression does NOT contain sequences of underscores that would
 * break the /__([^_]+)__/g regex. Replaces internal underscores with hyphens.
 */
export function sanitizeExpressionForMarker(expr: string): string {
  // Replace runs of 2+ underscores inside expression with dashes
  return expr.replace(/_{2,}/g, "--");
}

/**
 * Count occurrences of `expression` in `text`, honoring token boundaries for
 * single-word/pronoun targets so "it" does not match inside "digital".
 */
function countMatches(
  text: string,
  expression: string,
  requireWordBoundary: boolean,
): number {
  const needle = expression.trim();
  if (!needle) return 0;
  const hay = text.toLowerCase();
  const low = needle.toLowerCase();
  let count = 0;
  let idx = hay.indexOf(low);
  while (idx !== -1) {
    if (!requireWordBoundary || hasTokenBoundaries(text, idx, needle.length)) {
      count += 1;
    }
    idx = hay.indexOf(low, idx + 1);
  }
  return count;
}

function contentTokenSet(text: string): Set<string> {
  return new Set(
    (text.toLowerCase().match(/[a-z][a-z'-]{2,}/g) ?? []).map((token) =>
      token.replace(/^'+|'+$/g, ""),
    ),
  );
}

export interface StrictFindResult {
  pos: FoundPosition | null;
  /** Occurrences within the resolution scope (surroundingText window, else whole passage). */
  count: number;
  /** True when the target is NOT uniquely located (count !== 1) — caller should reject. */
  ambiguous: boolean;
}

/**
 * 장문 세트 strict locator. Unlike findExpressionInPassage (which silently returns
 * the FIRST match), this reports the occurrence COUNT within the resolution scope
 * so the set orchestrator can mark an anchor DEGRADED instead of leaking by
 * pinning the wrong occurrence. Scope = a ±50-char window around surroundingText
 * when given, else the whole passage.
 */
export function findExpressionInPassageStrict(
  passage: string,
  expression: string,
  surroundingText?: string,
): StrictFindResult {
  const pos = findExpressionInPassage(passage, expression, surroundingText);
  if (!pos) return { pos: null, count: 0, ambiguous: true };

  let scopeText = passage;
  if (surroundingText && surroundingText.trim().length > 0) {
    const ctxIdx = findSurroundingContextIndex(passage, surroundingText);
    if (ctxIdx !== null) {
      const start = Math.max(0, ctxIdx - 50);
      const end = Math.min(passage.length, ctxIdx + surroundingText.length + 50);
      scopeText = passage.slice(start, end);
    }
  }

  const requireWordBoundary = isSingleTokenExpression(expression);
  const count = countMatches(scopeText, expression, requireWordBoundary);
  return { pos, count, ambiguous: count !== 1 };
}
