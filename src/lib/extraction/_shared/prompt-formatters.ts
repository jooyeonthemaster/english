import type { RestorationQuestionInput } from "./types";

/**
 * Render a list of linked questions as the canonical text block embedded in
 * both restoration prompts and problem-evidence prompts. Previously duplicated
 * across m2-restoration.ts and problem-evidence.ts.
 */
export function stringifyQuestions(
  questions: RestorationQuestionInput[],
): string {
  if (questions.length === 0) return "(no linked questions)";
  return questions
    .map((q, idx) => {
      const choices = q.choices
        .map(
          (c) =>
            `${c.label}${c.isAnswer ? " [ANSWER_MARK]" : ""}: ${c.content}`,
        )
        .join("\n");
      return [
        `Question ${q.questionNumber ?? idx + 1}`,
        `Stem: ${q.stem}`,
        choices ? `Choices:\n${choices}` : "Choices: (none)",
        q.explanation ? `Explanation: ${q.explanation}` : null,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");
}
