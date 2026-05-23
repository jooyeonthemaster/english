export interface BlankInferenceGenerationSettings {
  doubleNegative?: boolean;
}

export interface QuestionTypeGenerationSettings {
  BLANK_INFERENCE?: BlankInferenceGenerationSettings;
  [typeId: string]: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function getDefaultQuestionTypeGenerationSettings(): QuestionTypeGenerationSettings {
  return {
    BLANK_INFERENCE: {
      doubleNegative: false,
    },
  };
}

export function buildQuestionTypeSettingsPrompt(
  typeId: string,
  rawSettings: unknown,
): string {
  if (typeId !== "BLANK_INFERENCE" || !isRecord(rawSettings)) return "";
  if (rawSettings.doubleNegative !== true) return "";

  return [
    "## Type detail setting: BLANK_INFERENCE / double-negative trap",
    "- Apply the teacher-selected double-negative blank mode. This is a high-difficulty trap, not a simple paraphrase under a negative adverb.",
    "- If the prompt includes BLANK_INFERENCE negation-aware candidates with Suggested originalExpression values, choose one of those suggested targets exactly unless it is grammatically impossible.",
    "- Prefer a source sentence with a strong visible negation outside the blank, especially cannot/can't, not, no, never, without, fail to, or not only/not merely structures.",
    "- Prefer blanking a full predicate, causal clause, contrastive complement, or meaningful phrase after since/because/that/but/rather than a single noun such as reasoning, logic, emotion, value, or calculation.",
    "- Avoid shallow slots like 'rarely a result of ____' when the correct option would simply be a positive synonym such as reasoning, logic, calculation, or cognitive processes.",
    "- Avoid example-list slots such as 'such as ____', 'including ____', or 'for example ____'; those usually test vocabulary categories rather than double-negative inference.",
    "- The correct option must contain a negation cue or clearly negative expression: not, never, no, without, lack, fail/failure, non-, unable, impossible, anything but, other than, barrier, obstacle, enemy, exclude, eliminate, reject, neglect, undermine, erosion, collapse, or a close equivalent.",
    "- Write the correct option in natural CSAT-style English. Prefer clear academic phrases such as 'no chain of reasoning...', 'no reason can...', 'without an emotional basis', 'not free from...', 'does not exclude...'.",
    "- Avoid pseudo-technical or awkward noun piles such as 'rational tool', 'cognitive preferences', 'impulsive desires', 'ultimate emotional foundation', or 'emotional distractions' unless the passage itself uses those exact ideas.",
    "- Avoid clumsy phrases such as 'lack of erosion', 'absence of erosion', or 'lack of clear boundaries can...'. Use natural verbs instead, such as 'preventing the erosion of...', 'not allowing ... to erode', or 'boundaries keep ... from being hidden'.",
    "- All option texts should be natural lower-case English phrases unless they begin with a proper noun copied from the passage. Do not accidentally capitalize ordinary words inside an option.",
    "- If the blank follows since/because/that, every option must be a complete clause with an explicit subject. Use 'no reason can avoid ...', not 'cannot avoid ...'.",
    "- Do not blank across contrast markers such as ', but because', '; rather', or '; instead'. Preserve the original contrast structure outside the blank.",
    "- This setting overrides the default exact-answer option rule: originalExpression must still be copied verbatim from the passage for blank reconstruction, but the correct option text must be a non-verbatim transformed answer that is logically equivalent after resolving the double negative.",
    "- Do not put originalExpression itself as the correct option text, and do not use a near-synonym that has the same surface polarity as originalExpression.",
    "- Set blankAnswerMode to \"DOUBLE_NEGATIVE\".",
    "- Add answerLogic in Korean explaining how the two negatives cancel or how the negation/antonym structure restores the passage's positive meaning.",
    "- Build attractive wrong options in the current 2026 CSAT style: use the same semantic field and passage keywords, but make each one fail by a subtle polarity, scope, causal-role, or thesis-direction shift.",
    "- At least three wrong options should be genuinely tempting: one should preserve a surface keyword but reverse the negation logic, one should state a true nearby idea that does not complete the blank, and one should overgeneralize or narrow the passage's claim.",
    "- Each wrong option should include at least two passage concepts or one passage concept plus a negative-polarity cue. A negative word alone is not enough.",
    "- For the reason/emotion topic, good distractor vocabulary includes reason, reasoning, feeling, emotion, values, non-reason, basis, goal, justify, influence, and foundation. Avoid drifting into generic cognitive preferences or impulsive desires.",
    "- Avoid random external causes, obviously unrelated nouns, or options that are grammatically awkward when inserted into the blank sentence.",
  ].join("\n");
}

export function getQuestionTypeSettingsForType(
  settings: QuestionTypeGenerationSettings | undefined,
  typeId: string,
): unknown {
  return settings?.[typeId];
}
