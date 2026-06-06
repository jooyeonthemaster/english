import type { SingleItemAnalysis } from "./schema";

export type AnalysisGroup = SingleItemAnalysis["groups"][number];
export type AnalysisQuestion = AnalysisGroup["questions"][number];

export interface LocatedAnalysisQuestion {
  group: AnalysisGroup;
  question: AnalysisQuestion;
}

export function flattenAnalysisQuestions(
  analysis: SingleItemAnalysis,
): LocatedAnalysisQuestion[] {
  const questions: LocatedAnalysisQuestion[] = [];
  for (const group of analysis.groups) {
    for (const question of group.questions) {
      questions.push({ group, question });
    }
  }
  return questions;
}

export function singleQuestionAnalysisFrom(
  located: LocatedAnalysisQuestion,
): SingleItemAnalysis {
  return {
    inventory: [],
    groups: [
      {
        ...located.group,
        questions: [located.question],
      },
    ],
  };
}

export function pickFirstQuestionOnly(
  analysis: SingleItemAnalysis,
): SingleItemAnalysis | null {
  const [first] = flattenAnalysisQuestions(analysis);
  return first ? singleQuestionAnalysisFrom(first) : null;
}

export function preservePrimaryLocator(
  analysis: SingleItemAnalysis,
  target: LocatedAnalysisQuestion,
): void {
  const [located] = flattenAnalysisQuestions(analysis);
  if (!located) return;

  located.question.source.boundingBox = target.question.source.boundingBox;
  if (
    located.question.source.questionNumber == null &&
    target.question.source.questionNumber != null
  ) {
    located.question.source.questionNumber = target.question.source.questionNumber;
  }
}
