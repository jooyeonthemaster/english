// ============================================================================
// page-meta-parser — deterministic regex extraction of pageMeta fields from
// Document AI raw text.
//
// Why this exists:
//   The Gemini classify call writes `structured.pageMeta` (pageNumber /
//   pageTotal / examCode), but in multimodal mode (image + text) Gemini
//   sometimes leaves those fields null on pages where the footer/header
//   markup is visually weak. The page-ordering / cluster algorithm then
//   spreads those pages into a `__unknown__` cluster, splitting one
//   booklet into multiple SourceMaterials.
//
//   Document AI's raw text DOES contain the markup on every page — the
//   header "과목코드 ... 03" and footer "3/(8)" survive intact. So we
//   extract pageMeta deterministically from the raw text and use it to
//   OVERRIDE whatever Gemini wrote (or fill in nulls when Gemini wrote
//   nothing). Pure regex, no LLM, no extra calls.
//
// Scope: only the fields used by cluster fingerprinting + in-cluster sort
// (examCode / pageNumber / pageTotal). subject / year / round / school
// remain Gemini-only because schema constrains them to enums.
// ============================================================================

export interface ParsedPageMeta {
  pageNumber: number | null;
  pageTotal: number | null;
  examCode: string | null;
}

const HEADER_SCAN_CHARS = 800;
const FOOTER_SCAN_CHARS = 400;

/** Korean school exam-code label can appear as "과목코드" (joined) or
 *  "과목\n코드" (line-broken — Document AI splits cells of the metadata
 *  table). Match both. */
const EXAM_CODE_LABEL_RE = /과목\s*[\r\n]*\s*코드/;

/** Look for a line containing ONLY a 2–3 digit number. Used as the
 *  examCode candidate after the "과목코드" label is found. We accept 2–3
 *  digits because real-world codes can be "03", "05", "21", or even
 *  "100"+. Single digits are too ambiguous (collides with 교시/학년). */
const ISOLATED_CODE_LINE_RE = /^\s*(\d{2,3})\s*$/;

/** Page-number markup. Document AI preserves footer markers like:
 *    "3/(8)"     — page 3 of 8
 *    "(3)/8"     — same, different paren placement
 *    "3 / 8"     — spaced
 *    "1 / 8"     — header variant
 *  We capture both numerator and (optional) denominator. */
const PAGE_SLASH_RE = /\(?\s*(\d{1,2})\s*\)?\s*\/\s*\(?\s*(\d{1,2})\s*\)?/;

export function parsePageMetaFromDocumentAiText(
  rawText: string,
): ParsedPageMeta {
  return {
    examCode: extractExamCode(rawText),
    ...extractPageNumberAndTotal(rawText),
  };
}

function extractExamCode(rawText: string): string | null {
  const header = rawText.slice(0, HEADER_SCAN_CHARS);
  const labelMatch = header.match(EXAM_CODE_LABEL_RE);
  if (!labelMatch || labelMatch.index === undefined) return null;

  // Scan the lines AFTER the "과목코드" label until we hit an isolated
  // 2-3 digit line. The lines in between are typically the exam title
  // ("2026학년도 1학기 중간고사") and the subject name ("공통영어1") —
  // none of which match ISOLATED_CODE_LINE_RE, so they're skipped
  // naturally.
  const afterLabel = header.slice(labelMatch.index + labelMatch[0].length);
  const lines = afterLabel.split(/[\r\n]+/);
  for (let i = 0; i < Math.min(lines.length, 15); i++) {
    const m = lines[i].match(ISOLATED_CODE_LINE_RE);
    if (!m) continue;
    const code = m[1];
    // Reject obvious non-code numbers that might appear in the header
    // area (e.g. "10" if a free-floating page number sneaks in). Real
    // exam codes on the Korean exam papers we've seen are always
    // 2-digit "0X" (e.g. "03", "05", "07", "09") or 2-digit non-zero-
    // leading on the few outliers. Codes "11"-"99" are possible but
    // rarely used; accept all 2-3 digit values for forward compat.
    return code;
  }
  return null;
}

function extractPageNumberAndTotal(rawText: string): {
  pageNumber: number | null;
  pageTotal: number | null;
} {
  // Footer is where N/M markup almost always lives ("3/(8)" right before
  // the school-name footer). Scan tail first.
  const tail = rawText.slice(-FOOTER_SCAN_CHARS);
  const tailMatch = tail.match(PAGE_SLASH_RE);
  if (tailMatch) {
    return {
      pageNumber: parseIntSafe(tailMatch[1]),
      pageTotal: parseIntSafe(tailMatch[2]),
    };
  }

  // Some exam sheets stamp it in the header instead. Scan header as
  // fallback, but skip the "2026학년도" year and similar 4-digit values
  // by limiting the denominator to 1-2 digits (PAGE_SLASH_RE already
  // restricts to {1,2}).
  const header = rawText.slice(0, HEADER_SCAN_CHARS);
  const headerMatch = header.match(PAGE_SLASH_RE);
  if (headerMatch) {
    const num = parseIntSafe(headerMatch[1]);
    const tot = parseIntSafe(headerMatch[2]);
    // Sanity check: page number must be <= page total when both present.
    if (num !== null && tot !== null && num <= tot && tot <= 99) {
      return { pageNumber: num, pageTotal: tot };
    }
  }

  return { pageNumber: null, pageTotal: null };
}

function parseIntSafe(s: string): number | null {
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Merge deterministic regex result INTO Gemini's pageMeta. Deterministic
 * values WIN when present; only nulls fall through to Gemini's value.
 *
 * Why deterministic wins: Gemini in multimodal mode sometimes hallucinates
 * pageTotal from the upload-bundle size or drops examCode entirely. The
 * Document AI raw text is canonical — if it says "03", that's the booklet
 * code, full stop.
 */
export function mergePageMeta(
  geminiPageMeta: unknown,
  parsed: ParsedPageMeta,
): Record<string, unknown> {
  const base: Record<string, unknown> =
    geminiPageMeta && typeof geminiPageMeta === "object"
      ? { ...(geminiPageMeta as Record<string, unknown>) }
      : {};
  if (parsed.examCode !== null) base.examCode = parsed.examCode;
  if (parsed.pageNumber !== null) base.pageNumber = parsed.pageNumber;
  if (parsed.pageTotal !== null) base.pageTotal = parsed.pageTotal;
  return base;
}
