/**
 * Shared input types used across multiple extraction sub-domains
 * (restoration, problem-evidence). Keeping them here breaks the previous
 * cross-file circular `import type` between m2-restoration.ts and
 * problem-evidence.ts.
 */

export interface RestorationQuestionInput {
  questionNumber: number | null;
  stem: string;
  choices: Array<{
    label: string;
    content: string;
    isAnswer: boolean;
  }>;
  explanation: string | null;
}
