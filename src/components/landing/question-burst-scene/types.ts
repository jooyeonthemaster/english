export type Phase = "stem" | "given" | "options" | "answer" | "done";

export type GenerationState = {
  phase: Phase;
  stem: string;
  given: string;
  options: string[];
  activeOptionIndex: number;
  answerVisible: boolean;
};

export const CIRCLED = ["①", "②", "③", "④", "⑤"];
