export type M1RestorationStatus =
  | "RESTORED"
  | "NO_RESTORATION_NEEDED"
  | "PARTIAL"
  | "FAILED";

export interface M1RestorationChangeInput {
  sentenceOrder?: number | null;
  before: string;
  after: string;
  changeType?: string | null;
  reason?: string | null;
  confidence?: number | null;
}

export interface M1RestorationFallback {
  restoredText: string;
  status: M1RestorationStatus;
  changes: M1RestorationChangeInput[];
}

const CIRCLED_OPTION_MARKER = /[\u2460-\u2468]\s*/g;
const ORDER_SEGMENT_MARKER = /(^|\n)\s*\([A-E]\)\s+/m;
const BRACKETED_BASE_FORM = /\([A-E]\)\s*\[[^\]]+\]/;
const INCOMPLETE_BRACKETED_BASE_FORM = /\([A-E]\)\s*\[[^\]\n]*$/m;
const WORD_ORDER_FRAGMENT = /\[[^\]]+,\s*[^\]]+\]/;
const INLINE_PROBLEM_MARKER = /@\s*[A-Za-z]/;

function normalizePassageWhitespace(text: string): string {
  return text
    .replace(/([A-Za-z])-\s*\n\s*([A-Za-z])/g, "$1$2")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function hasM1ProblemArtifacts(text: string): boolean {
  CIRCLED_OPTION_MARKER.lastIndex = 0;
  return (
    CIRCLED_OPTION_MARKER.test(text) ||
    ORDER_SEGMENT_MARKER.test(text) ||
    BRACKETED_BASE_FORM.test(text) ||
    INCOMPLETE_BRACKETED_BASE_FORM.test(text) ||
    WORD_ORDER_FRAGMENT.test(text) ||
    INLINE_PROBLEM_MARKER.test(text)
  );
}

export function hasUnresolvedM1ProblemArtifacts(text: string): boolean {
  return hasM1ProblemArtifacts(text);
}

export function buildFallbackM1Restoration(raw: string): M1RestorationFallback {
  const normalizedRaw = normalizePassageWhitespace(raw);
  const changes: M1RestorationChangeInput[] = [];
  const markerHits = [...normalizedRaw.matchAll(CIRCLED_OPTION_MARKER)];

  let restoredText = normalizedRaw;
  if (markerHits.length > 0) {
    restoredText = restoredText.replace(CIRCLED_OPTION_MARKER, "");
    changes.push(
      ...markerHits.map((hit) => ({
        sentenceOrder: null,
        before: hit[0],
        after: "",
        changeType: "exam-annotation",
        reason:
          "Removed exam annotation markers embedded in the passage from the restored source text.",
        confidence: 0.95,
      })),
    );
  }

  const normalizedRestored = normalizePassageWhitespace(restoredText);
  if (normalizedRestored !== restoredText) {
    changes.push({
      sentenceOrder: null,
      before: restoredText,
      after: normalizedRestored,
      changeType: "whitespace",
      reason: "Normalized passage whitespace and line breaks.",
      confidence: 0.85,
    });
    restoredText = normalizedRestored;
  }

  return {
    restoredText,
    status:
      hasUnresolvedM1ProblemArtifacts(restoredText)
        ? "FAILED"
        : changes.length > 0 || restoredText !== normalizedRaw
        ? "RESTORED"
        : "NO_RESTORATION_NEEDED",
    changes,
  };
}
