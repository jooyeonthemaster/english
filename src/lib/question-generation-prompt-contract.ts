import type { QuestionGenerationPlan } from "@/lib/question-generation-plans";

const GEMINI_QUESTION_QUALITY_CONTRACT = `
## Gemini item quality contract
Use this checklist silently before writing the final JSON. Do not output notes, markdown, or hidden analysis outside the JSON object.

Core evidence:
- Choose the exact passage sentence(s), phrase(s), or discourse clue that prove the answer.
- Make the correct answer require passage reasoning, not generic English knowledge.
- Keep every answer, distractor, and explanation grounded in the passage.

Distractor design for multiple-choice items:
- Create four plausible wrong options before finalizing the correct option.
- Each wrong option must have a distinct trap role. Use four different roles from this pool: too broad, too narrow, partial truth, reversed logic, wrong cause/effect, wrong contrast/concession, unsupported inference, wrong reference, wrong grammar relation, wrong context meaning, dictionary-meaning trap, example-only trap, emotional-overreach trap.
- Do not make any wrong option obviously absurd, much shorter/longer, or stylistically different from the correct option.
- For vocabulary/context items, keep distractors in the same part of speech and make them contextually tempting.
- If a wrong option can be eliminated without reading the passage closely, rewrite it.
- If two wrong options fail for the same reason, rewrite one of them.
- Keep all options parallel in grammar, register, length, and abstraction level so the correct answer is not visible by style.
- The correct option should be the best synthesis of the passage, not merely the only reasonable-looking option.
- Every wrong option must be anchored in a real passage phrase, example, or concept. Do not add an unrelated filler distractor just to satisfy a trap role.
- Prefer "near-miss" distractors over opposite or random distractors. A near-miss borrows true passage language but distorts scope, relation, timing, target, or author stance.

Silent trap blueprint:
- Before final JSON, silently make a 5-option blueprint: correct evidence path + four wrong-option trap roles.
- Use the blueprint to write the options, but do not output the blueprint.
- Make the wrongOptionExplanations reveal the trap logic in Korean without using role labels such as "too broad" unless that is natural.
- Prefer traps that a strong student would actually consider for 5-15 seconds, not choices that a weak student would eliminate instantly.

wrongOptionExplanations requirements:
- For every multiple-choice item, wrongOptionExplanations must contain exactly four entries, one for each wrong option label.
- Follow the schema shape exactly. If the schema is an array, each entry must be { "label": "...", "explanation": "..." }. If the schema is an object, use the wrong option label as the key.
- Each wrong option explanation must explain both why the option may look tempting and the concrete passage clue that makes it wrong.
- Avoid generic phrases such as "it is not in the passage" unless you also name the exact missing or contradicted passage evidence.
- Use concise Korean, preferably 1-2 sentences per wrong option.
- For Korean visible options, especially REFERENCE/TOPIC_MAIN_IDEA/CONTENT_MATCH, name the visible Korean option text first. Do not start the explanation only with the English source phrase; English passage terms may be used as evidence after the Korean option is identified.

Type-specific checks:
- SENTENCE_ORDER and SENTENCE_INSERT: cite ordering clues such as reference words, contrast, chronology, cause/effect, or topic flow.
- TITLE and TOPIC_MAIN_IDEA: build the four wrong options as different title/main-idea traps: topic-only, example-only, too broad, too narrow, reversed stance, or attractive but unsupported implication. Avoid title options that are merely silly.
- CONTENT_MATCH: the false statement should be a subtle distortion of a real passage claim, not an invented fact. Use traps such as cause reversal, future/past criterion confusion, scope exaggeration, condition loss, or example-to-claim shift.
- BLANK_INFERENCE: all options must fit the same grammatical slot. Wrong options should echo real passage vocabulary or concepts while violating the sentence's logical relation. Do not use unrelated distractors such as social comparison, vague life lessons, or generic experience unless they are explicitly in the passage.
- SENTENCE_ORDER and SENTENCE_INSERT: every wrong order/location should have one tempting local clue but fail on a later reference, contrast, chronology, or conclusion signal.
- GRAMMAR_ERROR and GRAMMAR_CORRECTION: ensure the marked expression actually appears in the passage and the explanation names the grammar rule. Avoid controversial errors where a standard grammar reader could accept both versions. Grammar explanations must label parts of speech and syntax accurately; never call a finite verb, modal, conjunction, or clause by the wrong category. Use simple reliable labels such as subject, object, finite verb, auxiliary, conjunction, preposition, gerund, participle, relative pronoun, or noun clause; if unsure, describe the structure without inventing a category.
- When writing Korean grammar explanations, never call ask, asking, require, requires, spend, spent, developing, or similar verb forms "전치사". Never write phrases like "전치사 'asking'", "전치사 asking", "전치사 'spend'", "전치사 'require'", or "전치사 'developing'". Use "동사", "분사구문", "동명사", "현재분사", or "목적어를 취하는 구조" only when accurate.
- If you explain "asking", say "asking 뒤의 목적어 자리" or "asking이 이끄는 분사구문" as appropriate. Do not put the word "전치사" anywhere in the same sentence as asking/ask/requires/require/spend/spent/developing.
- GRAMMAR_ERROR schema rule: expression/correction must be the original correct passage wording; errorExpression must be the intentionally wrong displayed wording. The original correct wording must exist verbatim in the passage. Never mark the original author's wording as wrong, and never "improve" a grammatically acceptable original phrase into a different preferred phrase.
- GRAMMAR_ERROR explanation rule: explain the displayed wrong expression (errorExpression) as wrong and the original expression/correction as the fix. Do not say or imply that the original correct expression is the error. Start the explanation by naming the displayed wrong expression, for example: "④번에 표시된 'requiring'은 ...이므로 원문 표현인 'requires'가 필요합니다."
- GRAMMAR_ERROR safety rule: assume the original passage is grammatically correct. If you think an original phrase might be improved, do not use that phrase as the error target. Prefer unambiguous mutations such as subject-verb agreement, because/because of mismatch, modal + base verb, parallel verb form, spend + money/time + -ing, or what/that replacement when the following clause has a clear gap.
- Forbidden GRAMMAR_ERROR target: do not test active/passive infinitive preference such as "to gain" vs "to be gained", "to lose" vs "to be lost", or similar stylistic rewrites. These are too debatable for this item type.
- Forbidden GRAMMAR_ERROR source words: do not choose a marked error expression containing gain, gained, to gain, to be gained, lose, lost, to lose, or to be lost. Choose another grammar point.
- VOCAB_CHOICE, CONTEXT_MEANING, SYNONYM, and ANTONYM: keep all options in the same part of speech and semantic field. Avoid elementary synonym/antonym pairs; use context, register, metaphor, collocation, or stance as the deciding factor. The correct answer must be the most natural exam answer in the actual collocation, not merely the rarest or most advanced dictionary synonym. If a distractor could be argued as equally good, rewrite it.
- SYNONYM uniqueness test: silently substitute every option into the original sentence. Exactly one option may preserve the sentence's meaning, tone, collocation, and argument structure. Do not use a wrong option that is also a normal dictionary synonym in that sentence, such as a metaphorically valid near-synonym. A good distractor should be semantically nearby but fail one specific contextual requirement, not merely be a less common synonym.
- ANTONYM uniqueness test: exactly one option pair should fail the contextual antonym relation. Other pairs must be defensibly opposite in the passage's actual sense, not merely dictionary opposites in a different sense.
- REFERENCE: include nearby grammatically plausible antecedents as distractors, then make the correct answer depend on number, role, and sentence meaning. Options must be Korean antecedent descriptions, and wrongOptionExplanations must refer to those Korean option texts before mentioning English source phrases.
- IRRELEVANT: the irrelevant sentence must share keywords with the passage but break the paragraph's discourse function.
`;

export function buildQuestionGenerationPromptContract(
  generationPlan: QuestionGenerationPlan,
): string {
  return generationPlan === "STANDARD" ? GEMINI_QUESTION_QUALITY_CONTRACT : "";
}

interface GeminiCompactGenerationPromptInput {
  schoolType?: string;
  gradeInfo?: string;
  passageContent: string;
  teacherIntentBlock?: string;
  analysisContext?: string;
  targetPoints?: string[];
  targetCandidateBlock?: string;
  typePrompt: string;
  typeQualityRubric?: string;
  count: number;
  difficulty: string;
  difficultyInstruction?: string;
  customPrompt?: string;
}

interface GeminiCompactPlanningPromptInput {
  schoolType?: string;
  gradeInfo?: string;
  count: number;
  passageContent: string;
  teacherIntentBlock?: string;
  analysisContext?: string;
  customPrompt?: string;
  diffLabel: string;
}

const GEMINI_COMPACT_DIFFICULTY_RUBRIC: Record<string, string> = {
  BASIC: [
    "- BASIC: make the answer directly supported by a visible passage clue.",
    "- Distractors should be clearly wrong only after checking the passage, not random.",
  ].join("\n"),
  INTERMEDIATE: [
    "- INTERMEDIATE: require connecting at least two nearby clues, such as meaning plus logic or grammar plus context.",
    "- Distractors should borrow real passage language but distort relation, scope, or cause.",
  ].join("\n"),
  KILLER: [
    "- KILLER: require at least two reasoning steps from passage evidence to answer.",
    "- The correct answer must not be visible by length, style, rarity, or generic plausibility.",
    "- Distractors must be near-misses: true words or concepts from the passage with one subtle flaw.",
    "- For grammar items, test a defensible grammar rule, not a stylistic preference.",
  ].join("\n"),
};

const GEMINI_COMPACT_MARKING_RUBRIC = [
  "- Any underlinedPronoun, underlinedWord, originalExpression, markedWords, or markedExpressions must exist verbatim in the original passage.",
  "- Very short words such as it, is, in, as, or to may only be selected as standalone tokens, never as substrings.",
  "- surroundingText must be an exact 40-80 character slice around the selected expression.",
  "- Do not generate full-passage display fields such as passageWithBlank, passageWithMarkers, passageWithUnderline, or passageWithNumbers. The server reconstructs them.",
].join("\n");

export function buildGeminiCompactPlanningPrompt({
  schoolType = "",
  gradeInfo = "",
  count,
  passageContent,
  teacherIntentBlock,
  analysisContext,
  customPrompt,
  diffLabel,
}: GeminiCompactPlanningPromptInput): string {
  const analysisBlock = analysisContext?.trim()
    ? analysisContext
    : "None. Plan from the original passage and teacher annotations only.";

  return `You are a Korean English exam item planning expert for ${schoolType} ${gradeInfo}.

Read the passage and plan exactly ${count} exam questions.

## Passage
${passageContent}
${teacherIntentBlock?.trim() ? `\n\n## Teacher annotations\n${teacherIntentBlock}` : ""}

## Saved passage analysis
${analysisBlock}

## Available question types
Multiple choice: BLANK_INFERENCE, GRAMMAR_ERROR, VOCAB_CHOICE, SENTENCE_ORDER, SENTENCE_INSERT, TOPIC_MAIN_IDEA, TITLE, REFERENCE, CONTENT_MATCH, IRRELEVANT
Constructed response: CONDITIONAL_WRITING, SENTENCE_TRANSFORM, FILL_BLANK_KEY, SUMMARY_COMPLETE, WORD_ORDER, GRAMMAR_CORRECTION
Vocabulary: CONTEXT_MEANING, SYNONYM, ANTONYM

## Planning rules
- Return a balanced plan with concrete targetPoints from the passage.
- Do not assign more than 3 questions to the same type unless the teacher specifically asks.
- Every targetPoint must cite a word, phrase, sentence, relation, or grammar feature actually present in the passage.
- Difficulty is ${diffLabel}.
${GEMINI_COMPACT_DIFFICULTY_RUBRIC[diffLabel] ?? GEMINI_COMPACT_DIFFICULTY_RUBRIC.INTERMEDIATE}
${customPrompt?.trim() ? `\n## Teacher instructions\n${customPrompt}` : ""}

Return the planning JSON only.`;
}

export function buildGeminiCompactGenerationPrompt({
  schoolType = "",
  gradeInfo = "",
  passageContent,
  teacherIntentBlock,
  analysisContext,
  targetPoints = [],
  targetCandidateBlock,
  typePrompt,
  typeQualityRubric,
  count,
  difficulty,
  difficultyInstruction,
  customPrompt,
}: GeminiCompactGenerationPromptInput): string {
  const analysisBlock = analysisContext?.trim()
    ? analysisContext
    : "None. Generate directly from the original passage.";
  const targetPointBlock = targetPoints.length
    ? `\n\n## Required target points\n${targetPoints.map((point) => `- ${point}`).join("\n")}`
    : "";

  return `You are a Korean high-school English exam item writer for ${schoolType} ${gradeInfo}.

## Passage
${passageContent}
${targetCandidateBlock?.trim() ? `\n${targetCandidateBlock}` : ""}
${teacherIntentBlock?.trim() ? `\n\n## Teacher annotations\n${teacherIntentBlock}` : ""}

## Saved passage analysis
${analysisBlock}
${targetPointBlock}

## Question type instructions
${typePrompt}
${typeQualityRubric?.trim() ? `\n${typeQualityRubric}` : ""}

## Output schema requirements
- Return JSON matching the provided schema exactly.
- Use exactly the field names required by the schema.
- Write direction, explanation, keyPoints, wrongOptionExplanations, and tags in Korean.
- correctAnswer must be the option label for multiple-choice items, or the exact answer text for constructed-response items.
- Do not include full-passage display fields. The server reconstructs them.

## Generation requirements
- Generate exactly ${count} question(s).
- Difficulty: ${difficulty}${difficultyInstruction ? ` (${difficultyInstruction})` : ""}
${GEMINI_COMPACT_DIFFICULTY_RUBRIC[difficulty] ?? GEMINI_COMPACT_DIFFICULTY_RUBRIC.INTERMEDIATE}
${GEMINI_COMPACT_MARKING_RUBRIC}
${buildQuestionGenerationPromptContract("STANDARD")}
${customPrompt?.trim() ? `\n## Teacher instructions\n${customPrompt}` : ""}
- difficulty field must be exactly "${difficulty}".
- Multiple-choice items must have exactly 5 options in {label, text} form.
- explanation: Korean, 3-5 concise evidence-based sentences.
- keyPoints: exactly 3 Korean learning points.
- wrongOptionExplanations is required for every multiple-choice item: exactly four entries, one for each wrong option. If the schema is an array, each entry must be {label, explanation}.
- tags: Korean grammar/vocabulary/question-type tags.

Generate exactly ${count} question(s).`;
}
