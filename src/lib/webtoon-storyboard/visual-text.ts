// ============================================================================
// Lettering / figures smuggled into VISUAL fields (composition, action, setting,
// mood, cast appearance, world, palette, art notes).
// ----------------------------------------------------------------------------
// 26-09-30 bench: the storyboard wrote "'Cost Reduction: -80%' highlighted on
// screen" into an action field and the image model printed the invented figure.
// The validator (repair round) and the compiler (last line of defense) share
// these rules so they agree on what counts as text-to-print:
//   · a quoted span next to a text-bearing object (sign, screen, poster, "reads")
//     → lettering instruction → flagged / replaced with "abstract icons"
//   · any other quoted span is emphasis or tone ("an 'I told you so' look")
//     → not flagged; the compiler just drops the quote marks
//   · "70% of the frame" is framing → "most of the frame"; any other percentage
//     or comma-grouped figure (10,000,000+) is flagged and removed
// ============================================================================

const TEXT_BEARING =
  /\b(sign|signs|signboard|screen|screens|monitor|display|tablet|phone|laptop|computer|chart|graph|poster|banner|board|whiteboard|blackboard|label|labels|labeled|labelled|stamp|stamped|note|notes|paper|papers|document|documents|file|folder|report|book|cover|title|titled|caption|headline|newspaper|menu|slide|slides|ui|reads?|reading|says?|saying|written|writes?|writing|text|lettering|words?|message|notification|headline|t-shirt|shirt|badge|tag)\b/i;

const CONTEXT_CHARS = 30;

/** Quoted spans: straight/curly double quotes, or single quotes that open after a boundary. */
const QUOTED = [
  /["“]([^"“”\s][^"“”]{0,79})["”]/g,
  /(?<=^|[\s(:])['‘]([^'’\s][^'’]{1,59})['’](?=[\s,.;:)!?]|$)/g,
];

const FRAMING_PERCENT = /\b\d{1,3}\s?%\s+of\s+(?:the\s+)?(frame|panel|shot|page|image|composition|picture)\b/gi;
const PERCENT = /[-+−]?\d+(?:[.,]\d+)?\s?%/g;
const GROUPED_NUMBER = /\d{1,3}(?:,\d{3})+\+?/g;

function isTextBearingContext(text: string, start: number, end: number): boolean {
  const before = text.slice(Math.max(0, start - CONTEXT_CHARS), start);
  const after = text.slice(end, end + CONTEXT_CHARS);
  return TEXT_BEARING.test(before) || TEXT_BEARING.test(after);
}

/** Offending snippets (empty = clean). Used by the validator to trigger a repair round. */
export function findVisualText(text: string): string[] {
  const found: string[] = [];
  for (const re of QUOTED) {
    for (const m of text.matchAll(re)) {
      const start = m.index ?? 0;
      if (isTextBearingContext(text, start, start + m[0].length)) found.push(m[0]);
    }
  }
  const withoutFraming = text.replace(FRAMING_PERCENT, "");
  for (const m of withoutFraming.matchAll(PERCENT)) found.push(m[0]);
  for (const m of text.matchAll(GROUPED_NUMBER)) found.push(m[0]);
  return found;
}

export function hasVisualText(text: string): boolean {
  return findVisualText(text).length > 0;
}

/**
 * Compile-time sanitizer. Text-bearing quoted spans become "abstract icons", other
 * quotes lose their quote marks, framing percentages become "most of the …", other
 * percentages are dropped and grouped figures become "many". Clean text is returned
 * byte-for-byte.
 */
export function sanitizeVisualText(text: string): string {
  let out = text;
  for (const re of QUOTED) {
    out = out.replace(re, (whole: string, inner: string, offset: number, full: string) =>
      isTextBearingContext(full, offset, offset + whole.length) ? "abstract icons" : inner,
    );
  }
  out = out
    .replace(FRAMING_PERCENT, (_m: string, target: string) => `most of the ${target}`)
    .replace(PERCENT, "")
    .replace(GROUPED_NUMBER, "many");
  return out === text ? text : out.replace(/\s{2,}/g, " ").replace(/\s+([,.;:!?])/g, "$1").trim();
}
