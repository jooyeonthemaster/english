import { z } from "zod";
import { stringifyQuestions } from "../../_shared/prompt-formatters";
import { restorationChangeSchema } from "../schemas";
import type { RestorationQuestionInput } from "../types";

export function buildVerificationPrompts(input: {
  problemText: string;
  restoredText: string;
  questions: RestorationQuestionInput[];
  changes: Array<z.infer<typeof restorationChangeSchema>>;
}): { systemPrompt: string; userPrompt: string } {
  return {
    systemPrompt:
      "You verify restored English passages for school worksheet extraction. " +
      "Check for unsupported restoration, leftover problem markers, and mismatches with question evidence. Return strict JSON only.",
    userPrompt: [
      "Verify this restored passage.",
      "",
      "Return JSON matching: { status, confidence, warnings, remainingProblemMarkers, suspiciousChanges, teacherReviewRequired }.",
      "",
      "Problem-sheet passage:",
      input.problemText,
      "",
      "Restored passage:",
      input.restoredText,
      "",
      "Linked questions:",
      stringifyQuestions(input.questions),
      "",
      "Restoration changes:",
      JSON.stringify(input.changes, null, 2),
    ].join("\n"),
  };
}
