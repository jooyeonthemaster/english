/**
 * Output sanitizers for the OCR Gemini responses.
 *
 *   - sanitizeOcrOutput: legacy plain-text OCR (M1). Strips Markdown fences.
 *   - sanitizeStructuredJson: structured JSON mode (M2 / M4). Strips fences,
 *     locates the first balanced top-level JSON region using a string-aware
 *     brace counter, and repairs invalid \X escape sequences that come from
 *     stray backslashes glued to non-ASCII characters.
 */

/** If the model starts its reply with Markdown fences, strip them.
 *  Defensive — Gemini occasionally wraps long text in ``` regardless of prompt.
 *
 *  NOTE: This helper is for LEGACY plain-text OCR output (M1). For structured
 *  JSON mode (M2 / M4) use `sanitizeStructuredJson()` instead — it is aware of
 *  leading/trailing non-JSON prose that Gemini sometimes emits around the
 *  JSON payload even when `responseMimeType: application/json` is set. */
export function sanitizeOcrOutput(raw: string): string {
  let text = raw.trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```[a-zA-Z]*\n?/, "").replace(/```\s*$/, "");
  }
  return text.trim();
}

/**
 * Walk `str` and return the `[start, end)` offsets of the first balanced
 * top-level JSON value (`{...}` or `[...]`). String literals are respected —
 * braces/brackets inside double-quoted strings do NOT affect the depth
 * counter, which guards against false positives when prose around the JSON
 * contains `{` / `}` or `[` / `]` (e.g. "returned {foo: bar} yesterday").
 *
 * Returns `null` when no balanced top-level structure is present.
 */
function findFirstTopLevelJson(
  str: string,
): { start: number; end: number } | null {
  let depth = 0;
  let start = -1;
  let inStr = false;
  let escape = false;
  for (let i = 0; i < str.length; i += 1) {
    const c = str[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (c === "\\") {
      escape = true;
      continue;
    }
    if (inStr) {
      if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') {
      inStr = true;
      continue;
    }
    if (c === "{" || c === "[") {
      if (depth === 0) start = i;
      depth += 1;
    } else if (c === "}" || c === "]") {
      if (depth === 0) continue; // stray closer before any opener — skip
      depth -= 1;
      if (depth === 0 && start >= 0) {
        return { start, end: i + 1 };
      }
    }
  }
  return null;
}

/**
 * Repair invalid backslash-escape sequences inside JSON string literals.
 *
 * Gemini's structured output occasionally emits `\X` where X is not a valid
 * JSON escape character — most commonly when the model includes a non-ASCII
 * character (CJK ideograph, Hangul, fullwidth punctuation) right after a
 * backslash that the OCR layer dropped in by accident. Example failure:
 *
 *     "...and are\热情ly adopt..."   ← `\热` is not a valid JSON escape
 *
 * Strict JSON.parse rejects the whole document on a single bad escape, even
 * when the rest of the response is fine. We pre-process the text:
 *
 *   - Walk the string. Track whether we are inside a `"..."` string literal.
 *   - Outside a string: leave bytes alone.
 *   - Inside a string: when we see `\`, look at the next character. If it is
 *     one of the seven canonical escape chars (`"\\/bfnrt`) or the unicode
 *     `u` (followed by 4 hex digits), we keep the backslash. Otherwise we
 *     drop the backslash and keep just the following character.
 *
 * This is intentionally conservative — we only strip the offending backslash;
 * the character that followed it remains in the string content, so the OCR
 * text is preserved as-is.
 */
function repairInvalidEscapes(text: string): string {
  const VALID_ESCAPE_CHARS = new Set([
    '"',
    "\\",
    "/",
    "b",
    "f",
    "n",
    "r",
    "t",
  ]);
  const out: string[] = [];
  let inStr = false;
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (!inStr) {
      if (c === '"') inStr = true;
      out.push(c);
      i += 1;
      continue;
    }
    // Inside a string literal.
    if (c === '"') {
      inStr = false;
      out.push(c);
      i += 1;
      continue;
    }
    if (c === "\\") {
      const next = text[i + 1];
      if (next === undefined) {
        // Trailing backslash with no following char — drop it.
        i += 1;
        continue;
      }
      if (next === "u") {
        // \uXXXX — peek 4 hex digits; if valid, keep entire 6-char run.
        const hex = text.slice(i + 2, i + 6);
        if (/^[0-9a-fA-F]{4}$/.test(hex)) {
          out.push(text.slice(i, i + 6));
          i += 6;
          continue;
        }
        // Invalid \uXXXX — drop the backslash, keep the 'u'.
        out.push("u");
        i += 2;
        continue;
      }
      if (VALID_ESCAPE_CHARS.has(next)) {
        out.push("\\" + next);
        i += 2;
        continue;
      }
      // Invalid escape — drop the backslash, keep the following character.
      out.push(next);
      i += 2;
      continue;
    }
    out.push(c);
    i += 1;
  }
  return out.join("");
}

/**
 * Strip Markdown fences / extra prose around a JSON payload returned by the
 * structured OCR prompt. Produces a string that is safe to pass to
 * `JSON.parse` in the happy path.
 *
 * Robust against these Gemini quirks:
 *   - ` ```json\n{...}\n``` ` fenced block
 *   - ` ```\n{...}\n``` ` unlabeled fence
 *   - Leading/trailing whitespace or explanatory sentences
 *   - Trailing commentary after the closing `}` / `]`
 *   - Prose containing stray `{` / `}` characters (handled by the
 *     string-aware `findFirstTopLevelJson` scanner — a pure `indexOf("{")`
 *     approach would misidentify the payload's start).
 *
 * If no balanced brace/bracket block is found, throws
 * `Error("SANITIZE_STRUCTURED_JSON_NO_OBJECT")`. Callers should classify that
 * as `PARSE_ERROR` and surface it upstream instead of retrying into an
 * infinite loop.
 */
export function sanitizeStructuredJson(raw: string): string {
  if (typeof raw !== "string") {
    throw new Error("SANITIZE_STRUCTURED_JSON_NOT_STRING");
  }
  let text = raw.trim();

  // 1) Strip Markdown fences (```json ... ``` / ``` ... ```), including
  //    variants with CRLF, tabs, or language tags like ```JSON / ```json5.
  //    We loop because Gemini sometimes double-wraps.
  for (let guard = 0; guard < 3; guard += 1) {
    const fenceOpen = /^```[ \t]*[a-zA-Z0-9_-]*[ \t]*\r?\n?/;
    const fenceClose = /\r?\n?[ \t]*```[ \t]*$/;
    if (fenceOpen.test(text) || fenceClose.test(text)) {
      text = text.replace(fenceOpen, "").replace(fenceClose, "").trim();
      continue;
    }
    break;
  }

  // 2) Locate the first balanced top-level JSON region via a brace/bracket
  //    counter that is aware of string literals. This replaces the old
  //    `indexOf("{") + lastIndexOf("}")` heuristic, which happily matched
  //    braces sitting inside prose (e.g. "see {docs} for details").
  const region = findFirstTopLevelJson(text);
  if (!region) {
    throw new Error("SANITIZE_STRUCTURED_JSON_NO_OBJECT");
  }
  text = text.slice(region.start, region.end);

  // 3) Repair invalid `\X` escape sequences (e.g. `\热` from CJK characters
  //    that leaked into the OCR text after a stray backslash). Without this
  //    the JSON.parse call rejects the whole response with "Unexpected token".
  text = repairInvalidEscapes(text);

  return text.trim();
}
