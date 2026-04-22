export function safeParseJSON<T>(str: unknown, fallback: T): T {
  if (!str) return fallback;
  if (Array.isArray(str)) return str as T;
  if (typeof str === "object") return Array.isArray(fallback) && !Array.isArray(str) ? fallback : (str as T);
  if (typeof str !== "string") return fallback;
  try { const parsed = JSON.parse(str); return Array.isArray(fallback) && !Array.isArray(parsed) ? fallback : parsed; }
  catch { return fallback; }
}

// ---------------------------------------------------------------------------
// Inline highlight renderer (unchanged from original)
// ---------------------------------------------------------------------------
export function renderHighlightedSentence(
  text: string,
  vocabs: Array<{ word: string; meaning: string }>,
  grammars: Array<{ textFragment: string; pattern: string }>
) {
  interface Segment {
    start: number;
    end: number;
    type: "vocab" | "grammar";
    label: string;
  }

  const segments: Segment[] = [];

  for (const g of grammars) {
    const idx = text.toLowerCase().indexOf(g.textFragment.toLowerCase());
    if (idx !== -1) {
      segments.push({
        start: idx,
        end: idx + g.textFragment.length,
        type: "grammar",
        label: g.pattern,
      });
    }
  }

  for (const v of vocabs) {
    const regex = new RegExp(`\\b${escapeRegex(v.word)}\\b`, "i");
    const match = regex.exec(text);
    if (match) {
      const start = match.index;
      const end = start + match[0].length;
      const overlaps = segments.some(
        (s) => start < s.end && end > s.start
      );
      if (!overlaps) {
        segments.push({ start, end, type: "vocab", label: v.meaning });
      }
    }
  }

  segments.sort((a, b) => a.start - b.start);

  if (segments.length === 0) return text;

  const parts: React.ReactNode[] = [];
  let cursor = 0;

  for (const seg of segments) {
    if (seg.start > cursor) {
      parts.push(text.slice(cursor, seg.start));
    }
    if (seg.start < cursor) continue;

    const highlighted = text.slice(seg.start, seg.end);
    if (seg.type === "grammar") {
      parts.push(
        <span
          key={`g-${seg.start}`}
          className="underline decoration-blue-400 decoration-2 underline-offset-4 cursor-help"
          title={seg.label}
        >
          {highlighted}
        </span>
      );
    } else {
      parts.push(
        <span
          key={`v-${seg.start}`}
          className="underline decoration-amber-400 decoration-dashed decoration-2 underline-offset-4 cursor-help"
          title={seg.label}
        >
          {highlighted}
        </span>
      );
    }
    cursor = seg.end;
  }

  if (cursor < text.length) {
    parts.push(text.slice(cursor));
  }

  return parts;
}

export function escapeRegex(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
