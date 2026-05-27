/**
 * Locate the first balanced top-level JSON value (`{...}` or `[...]`) in `text`
 * and return its `[start, end)` offsets. String literals are respected so
 * braces/brackets inside `"..."` strings do not influence depth.
 *
 * Returns `null` when no balanced structure is found.
 */
function findFirstBalancedJson(
  text: string,
): { start: number; end: number } | null {
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaping = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (escaping) {
      escaping = false;
      continue;
    }

    if (char === "\\") {
      escaping = true;
      continue;
    }

    if (inString) {
      if (char === "\"") inString = false;
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{" || char === "[") {
      if (depth === 0) start = i;
      depth += 1;
      continue;
    }

    if (char === "}" || char === "]") {
      if (depth === 0) continue;
      depth -= 1;
      if (depth === 0 && start >= 0) {
        return { start, end: i + 1 };
      }
    }
  }

  return null;
}

/**
 * Repair invalid `\X` escape sequences inside JSON string literals. Gemini
 * occasionally emits `\X` where X is a non-ASCII character that snuck in after
 * a stray backslash — strict `JSON.parse` rejects the whole document on a
 * single bad escape. We drop the offending backslash and keep the following
 * character, which preserves the OCR'd text without losing data.
 */
function repairInvalidJsonEscapes(text: string): string {
  const validEscapes = new Set(['"', "\\", "/", "b", "f", "n", "r", "t"]);
  const out: string[] = [];
  let inString = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (!inString) {
      if (char === "\"") inString = true;
      out.push(char);
      continue;
    }

    if (char === "\"") {
      inString = false;
      out.push(char);
      continue;
    }

    if (char !== "\\") {
      out.push(char);
      continue;
    }

    const next = text[i + 1];
    if (next === undefined) continue;

    if (next === "u") {
      const hex = text.slice(i + 2, i + 6);
      if (/^[0-9a-fA-F]{4}$/.test(hex)) {
        out.push(text.slice(i, i + 6));
        i += 5;
      } else {
        out.push("u");
        i += 1;
      }
      continue;
    }

    if (validEscapes.has(next)) {
      out.push("\\" + next);
      i += 1;
      continue;
    }

    out.push(next);
    i += 1;
  }

  return out.join("");
}

/**
 * Repair JavaScript-like object keys that occasionally leak into otherwise
 * valid JSON, e.g. `{word":"get by"}` or `{word:"get by"}`. The scan only
 * runs outside string literals and only after `{` or `,`, so passage text such
 * as `"look at {word}"` remains untouched.
 */
function repairBareObjectKeys(text: string): string {
  const out: string[] = [];
  let inString = false;
  let escaping = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (escaping) {
      escaping = false;
      out.push(char);
      continue;
    }

    if (inString) {
      if (char === "\\") {
        escaping = true;
      } else if (char === "\"") {
        inString = false;
      }
      out.push(char);
      continue;
    }

    if (char === "\"") {
      inString = true;
      out.push(char);
      continue;
    }

    out.push(char);

    if (char !== "{" && char !== ",") continue;

    let cursor = i + 1;
    while (/\s/.test(text[cursor] ?? "")) {
      out.push(text[cursor]);
      cursor += 1;
    }

    const keyStart = cursor;
    if (!/[A-Za-z_$]/.test(text[cursor] ?? "")) {
      i = cursor - 1;
      continue;
    }

    cursor += 1;
    while (/[A-Za-z0-9_$-]/.test(text[cursor] ?? "")) {
      cursor += 1;
    }

    const key = text.slice(keyStart, cursor);
    let afterKey = cursor;
    if (text[afterKey] === "\"") afterKey += 1;
    while (/\s/.test(text[afterKey] ?? "")) afterKey += 1;

    if (text[afterKey] !== ":") {
      i = keyStart - 1;
      continue;
    }

    out.push(`"${key}"`);
    if (text[cursor] === "\"") cursor += 1;
    i = cursor - 1;
  }

  return out.join("");
}

function canParseJson(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Strip Markdown fences, leading `json` language tag, and any surrounding
 * prose from a model response, then return the first balanced JSON region
 * with invalid escapes repaired. Throws `Error("NO_BALANCED_JSON_OBJECT")`
 * when no JSON region is found.
 */
export function extractJsonFromModelResponse(raw: string): string {
  let text = raw.trim();

  for (let guard = 0; guard < 3; guard += 1) {
    const before = text;
    text = text
      .replace(/^```[ \t]*[a-zA-Z0-9_-]*[ \t]*\r?\n?/, "")
      .replace(/\r?\n?[ \t]*```[ \t]*$/, "")
      .trim();
    if (text === before) break;
  }

  text = text.replace(/^json\s*\r?\n/i, "").trim();

  let sourceText = text;
  let region = findFirstBalancedJson(sourceText);
  if (!region) {
    sourceText = repairBareObjectKeys(text);
    region = findFirstBalancedJson(sourceText);
  }
  if (!region) {
    throw new Error("NO_BALANCED_JSON_OBJECT");
  }

  const repairedEscapes = repairInvalidJsonEscapes(
    sourceText.slice(region.start, region.end).trim(),
  );
  if (canParseJson(repairedEscapes)) return repairedEscapes;

  return repairBareObjectKeys(repairedEscapes);
}
