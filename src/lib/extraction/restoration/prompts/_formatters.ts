import type { ProblemEvidenceResponse } from "../../problem-evidence/schemas";
import type { SourceMatchInput } from "../types";

export function stringifySourceMatches(matches: SourceMatchInput[]): string {
  if (matches.length === 0) return "(no source candidates)";
  return matches
    .map((m, idx) =>
      [
        `Candidate ${idx + 1}: ${m.title}`,
        `type=${m.sourceType}; confidence=${m.confidence}`,
        `reason=${m.reason}`,
        m.content ? `content=${m.content.slice(0, 4000)}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");
}

export function stringifyLocalSourceMatches(matches: SourceMatchInput[]): string {
  if (matches.length === 0) return "(no local DB candidates)";
  return matches
    .slice(0, 3)
    .map((m, idx) =>
      [
        `Local candidate ${idx + 1}: ${m.title}`,
        `confidence=${m.confidence}; reason=${m.reason}`,
        m.content ? `content=${m.content.slice(0, 1500)}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");
}

export function stringifyProblemEvidence(
  evidence: ProblemEvidenceResponse | null | undefined,
): string {
  if (!evidence) return "(no first-pass problem evidence)";
  return JSON.stringify(
    {
      status: evidence.status,
      confidence: evidence.confidence,
      sourceHints: evidence.sourceHints,
      questions: evidence.questions.map((question) => ({
        questionNumber: question.questionNumber ?? null,
        questionType: question.questionType,
        typeLabel: question.typeLabel,
        confidence: question.confidence,
        answer: question.answer ?? null,
        answerConfidence: question.answerConfidence ?? null,
        evidence: question.evidence,
        restorationActions: question.restorationActions,
        warnings: question.warnings,
      })),
      globalActions: evidence.globalActions,
      unresolved: evidence.unresolved,
      warnings: evidence.warnings,
    },
    null,
    2,
  );
}
