export type TutorSubmitFeedback = {
  isCorrect: boolean;
  scoreEarned: number;
  scoreMax: number;
  explanation: string;
  degraded?: boolean;
};

export type ActionResult = { ok: true; id?: string; feedback?: TutorSubmitFeedback } | { ok: false; error: string };

export type CoverageDimension = "interpret" | "memorize" | "order" | "vocab" | "grammar" | "transfer";
