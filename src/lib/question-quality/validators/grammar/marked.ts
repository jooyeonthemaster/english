// Split from question-quality.ts — shared helpers in core.ts, public API via index.ts barrel.
import { QuestionQualitySeverity, findMarkers } from "../../core";



export function validateMarkedText(
  question: Record<string, unknown>,
  add: (severity: QuestionQualitySeverity, code: string, message: string) => void,
) {
  const markerFields = [
    "passageWithUnderline",
    "passageWithMarkers",
    "passageWithBlank",
    "passageWithNumbers",
  ];

  for (const field of markerFields) {
    const rawValue = question[field];
    if (typeof rawValue !== "string") continue;

    // Blank runs (___, _____) are blank placeholders, not underline markers.
    // With two or more blanks in one passage, the trailing/leading double
    // underscores would otherwise pair up as a fake __marker__ span.
    const value = rawValue.replace(/_{3,}/g, (run) => " ".repeat(run.length));

    for (const marker of findMarkers(value)) {
      if (!hasMarkerTokenBoundaries(value, marker.start, marker.end)) {
        add("error", "mid-word-marker", `${field} contains a marker inside a word: ${marker.inner}`);
      }
    }
  }
}



export function hasMarkerTokenBoundaries(text: string, start: number, end: number): boolean {
  return !isWordChar(text[start - 1]) && !isWordChar(text[end]);
}



export function isWordChar(value: string | undefined): boolean {
  return !!value && /[A-Za-z0-9_]/.test(value);
}
