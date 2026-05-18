import { stringifyQuestions } from "../_shared/prompt-formatters";
import type { RestorationQuestionInput } from "../_shared/types";

export function buildProblemEvidencePrompts(input: {
  rawText: string;
  questions: RestorationQuestionInput[];
}): { systemPrompt: string; userPrompt: string } {
  return {
    systemPrompt:
      "You analyze Korean English exam and school worksheet passages. " +
      "Classify question types, solve only what is needed, and extract evidence for restoring a clean reusable passage. " +
      "Do not invent missing source text. Return strict JSON only.",
    userPrompt: [
      "Analyze this passage/problem bundle for restoration evidence.",
      "",
      "Question type coverage:",
      "- CSAT/mock: blank inference, ordering, insertion, irrelevant sentence, grammar, vocabulary, reference, content match, title, topic/main idea, purpose, mood/tone, summary.",
      "- School exams: word blank, sentence blank, connector, paragraph order, textbook detail, dialogue order/response, Korean translation, English definition, conditional writing, sentence transform, word order writing, grammar correction.",
      "- If the exact type is unclear, use UNKNOWN but still extract restorationActions from visible markers.",
      "",
      "Restoration action rules:",
      "- Ordering questions: solve the best chunk order and emit REORDER_CHUNKS. Put the order such as (B)-(A)-(C) in answer and action.value.",
      "- Insertion questions: solve the insertion point and emit INSERT_SENTENCE. Put the marker such as ⑤ or (⑤) in answer/action.target and the given sentence in action.value.",
      "- If a boxed/given sentence appears before a passage with (①)~(⑤), classify it as SENTENCE_INSERT even when the Korean instruction line is missing.",
      "- Irrelevant sentence questions: identify the removable sentence and emit REMOVE_IRRELEVANT_SENTENCE. Put the numbered sentence in action.target.",
      "- Blank questions: infer the filled expression only when supported by choices/context and emit RESTORE_BLANK. Put the restored expression in action.value.",
      "- Grammar/vocabulary questions: identify the corrected original expression and emit RESTORE_GRAMMAR or RESTORE_VOCAB. Put the mutated expression in action.target and corrected expression in action.value.",
      "- Word order/writing questions: recover the model sentence and emit RESTORE_WORD_ORDER. Put the model answer in action.value.",
      "- If no question evidence exists and the passage is clean, return NO_QUESTIONS with SOURCE_MATCH_ONLY or no actions.",
      "- Mark low-confidence or unsupported recovery with TEACHER_REVIEW_REQUIRED.",
      "",
      "Return JSON matching:",
      "{ status, confidence, sourceHints, questions, globalActions, unresolved, warnings }.",
      "",
      "Raw passage/problem text:",
      input.rawText,
      "",
      "Pre-segmented linked questions:",
      stringifyQuestions(input.questions),
    ].join("\n"),
  };
}
