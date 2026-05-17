export type M1RestorationStatus =
  | "PENDING"
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

/** Whitespace-tolerant equality. Returns true when the only differences
 *  between raw and restored are line-break / spacing changes — i.e. the
 *  pipeline produced no semantic restoration. */
export function isEffectivelyUnchanged(raw: string, restored: string): boolean {
  const normalize = (s: string) => s.replace(/\s+/g, " ").trim();
  return normalize(raw) === normalize(restored);
}

export interface RestorationDecisionInput {
  rawText: string;
  restoredText: string;
  /** Set when the AI grounded call (single or batched) failed outright
   *  (network, parse, EMPTY_OUTPUT) and we fell through to code-fallback. */
  aiCallFailed?: boolean;
  /** The model's own evaluation of its output. Ignored when aiCallFailed. */
  aiFinalStatus?: "RESTORED" | "PARTIAL" | "FAILED" | null;
  /** `checkRestorationQuality` requested a downgrade — used to keep the
   *  existing safety net intact. */
  qualityShouldDowngrade?: boolean;
}

/** Centralised post-hoc status decision.
 *
 *  Algorithm (matches the teacher-facing semantic):
 *    1. restored still contains problem-sheet markers → FAILED
 *    2. restored is whitespace-equal to raw:
 *         - raw was already clean → NO_RESTORATION_NEEDED (nothing to do)
 *         - raw had markers       → FAILED (markers weren't even stripped)
 *    3. AI call failed (only marker-strip happened) → PARTIAL
 *    4. quality check requests a downgrade → PARTIAL
 *    5. AI said "RESTORED" → RESTORED
 *    6. AI said anything else (PARTIAL / FAILED / null) → PARTIAL
 *
 *  Crucially: the model's self-reported finalStatus never overrides the
 *  post-hoc text checks. An AI claiming "RESTORED" while emitting raw-equal
 *  output is still downgraded.
 */
export function decideRestorationStatus(
  input: RestorationDecisionInput,
): M1RestorationStatus {
  const {
    rawText,
    restoredText,
    aiCallFailed = false,
    aiFinalStatus = null,
    qualityShouldDowngrade = false,
  } = input;

  if (hasUnresolvedM1ProblemArtifacts(restoredText)) return "FAILED";

  if (isEffectivelyUnchanged(rawText, restoredText)) {
    return hasUnresolvedM1ProblemArtifacts(rawText)
      ? "FAILED"
      : "NO_RESTORATION_NEEDED";
  }

  if (aiCallFailed) return "PARTIAL";
  if (qualityShouldDowngrade) return "PARTIAL";
  if (aiFinalStatus === "RESTORED") return "RESTORED";
  return "PARTIAL";
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
