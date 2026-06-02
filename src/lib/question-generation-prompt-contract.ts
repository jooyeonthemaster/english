import type { QuestionGenerationPlan } from "@/lib/question-generation-plans";

const GEMINI_QUESTION_QUALITY_CONTRACT = `
## Gemini item quality contract
Use this checklist silently before writing the final JSON. Do not output notes, markdown, or hidden analysis outside the JSON object.

Core evidence:
- Choose the exact passage sentence(s), phrase(s), or discourse clue that prove the answer.
- Make the correct answer require passage reasoning, not generic English knowledge.
- Keep every answer, distractor, and explanation grounded in the passage.

Distractor design for multiple-choice items:
- Create one plausible wrong option for every non-correct option slot before finalizing the correct option. For standard 5-option items this means four wrong options; for IRRELEVANT with a larger slotCount, this means slotCount - 1 wrong options; for multi-answer GRAMMAR_ERROR this means option count minus the configured answer count.
- Each wrong option must have a distinct trap role where possible. Use different roles from this pool: too broad, too narrow, partial truth, reversed logic, wrong cause/effect, wrong contrast/concession, unsupported inference, wrong reference, wrong grammar relation, wrong context meaning, dictionary-meaning trap, example-only trap, emotional-overreach trap.
- Do not make any wrong option obviously absurd, much shorter/longer, or stylistically different from the correct option.
- For vocabulary/context items, keep distractors in the same part of speech and make them contextually tempting.
- If a wrong option can be eliminated without reading the passage closely, rewrite it.
- If two wrong options fail for the same reason, rewrite one of them.
- Keep all options parallel in grammar, register, length, and abstraction level so the correct answer is not visible by style.
- The correct option should be the best synthesis of the passage, not merely the only reasonable-looking option.
- Every wrong option must be anchored in a real passage phrase, example, or concept. Do not add an unrelated filler distractor just to satisfy a trap role.
- Prefer "near-miss" distractors over opposite or random distractors. A near-miss borrows true passage language but distorts scope, relation, timing, target, or author stance.

Silent trap blueprint:
- Before final JSON, silently make an option blueprint: correct evidence path + one wrong-option trap role for every wrong option.
- Use the blueprint to write the options, but do not output the blueprint.
- Make the wrongOptionExplanations reveal the trap logic in Korean without using role labels such as "too broad" unless that is natural.
- Prefer traps that a strong student would actually consider for 5-15 seconds, not choices that a weak student would eliminate instantly.

wrongOptionExplanations requirements:
- For every multiple-choice item, wrongOptionExplanations must contain exactly one entry for each wrong option label. Standard 5-option items have four entries; IRRELEVANT with slotCount N must have N - 1 entries; multi-answer GRAMMAR_ERROR has one entry for each grammatically correct non-answer label, or zero entries when the configured answer count makes every label an answer.
- Follow the schema shape exactly. If the schema is an array, each entry must be { "label": "...", "explanation": "..." }. If the schema is an object, use the wrong option label as the key.
- Each wrong option explanation must explain both why the option may look tempting and the concrete passage clue that makes it wrong.
- Avoid generic phrases such as "it is not in the passage" unless you also name the exact missing or contradicted passage evidence.
- Use concise Korean, preferably 1-2 sentences per wrong option.
- For Korean visible options, especially REFERENCE/TOPIC_MAIN_IDEA/MAIN_IDEA/CONTENT_MATCH, name the visible Korean option text first. Do not start the explanation only with the English source phrase; English passage terms may be used as evidence after the Korean option is identified.

Type-specific checks:
- SENTENCE_ORDER and SENTENCE_INSERT: cite ordering clues such as reference words, contrast, chronology, cause/effect, or topic flow.
- TITLE, TOPIC, TOPIC_MAIN_IDEA, and MAIN_IDEA: build the four wrong options as different title/topic/main-idea traps: topic-only, example-only, too broad, too narrow, reversed stance, or attractive but unsupported implication. Avoid options that are merely silly.
- CONTENT_MATCH: the false statement should be a subtle distortion of a real passage claim, not an invented fact. Use traps such as cause reversal, future/past criterion confusion, scope exaggeration, condition loss, or example-to-claim shift.
- SUMMARY_COMPLETE_MC: this is the CSAT-style objective summary completion item, not the constructed-response summary item. Use the exact frame "다음 글의 내용을 한 문장으로 요약하고자 한다. 빈칸 (A), (B)에 들어갈 말로 가장 적절한 것은?" The summaryWithBlanks must be one English sentence with (A) and (B) exactly once each. After inserting the correct pair, the sentence must read as native, natural exam English. Do not force awkward bridges such as "a question/matter/issue of (A) to (B)"; if (B) follows "to", it normally needs a base verb, while a gerund blank needs a natural preposition such as by/through/of. Options must be five English pairs; each option should include blankA, blankB, and text in "blankA …… blankB" form. The correct pair must match blanks exactly. Wrong pairs must be passage-grounded near-misses. Include one A-only-correct option by copying the exact correct blankA string and changing only blankB. Include a different B-only-correct option by copying the exact correct blankB string and changing only blankA. For KILLER, those half-correct traps must be genuinely competitive: pair the correct blankA with the most tempting wrong blankB, and pair the correct blankB with the most tempting wrong blankA. Do not bury a strong trap such as genetically behind an obviously wrong blankA such as individualistic. Wrong blankA/blankB values should stay in the same semantic field as the correct answer, not be instant antonyms or silly contrasts. Wrong-option explanations should say "선지 배열상/지문 논리상/요약문의 관계상", not "대조군 설계".
- TOPIC vs MAIN_IDEA distinction: TOPIC asks what the passage is centrally about, so all TOPIC options must be compact English topic phrases with the controlling viewpoint. MAIN_IDEA asks what the passage says/argues, so the correct option must be a complete Korean claim statement. Do not generate a title-like noun phrase for MAIN_IDEA.
- IMPLIED_MEANING: treat this as a main-idea/gist family item, like TOPIC, TITLE, and SUMMARY_COMPLETE_MC. Underline a phrase, clause, or short sentence that paraphrases the passage's central claim in a metaphorical, unfamiliar, compressed, or conclusion-like form. Do not use a peripheral local detail, a single vocabulary word, pronoun, dictionary idiom, rhetorical question, or self-answering question. All five options must be English-only. The correct English option must paraphrase the central implied meaning of the underline, not translate the surface text. There must be a real surface-to-central-meaning gap; if the next sentence directly paraphrases the answer, choose a different underline. Wrong options must be near-misses anchored in passage concepts and fail by scope, cause-effect, stance, example/generalization, or local-vs-global evidence. For KILLER, require at least two evidence links before/after the underlined expression, fill surfaceMeaning and reasoningGap honestly for internal audit, avoid giveaway absolutes such as completely, entirely, always, never, only, solely, exclusively, must, without exception, and keep all five options similar in length and abstraction.
- BLANK_INFERENCE: all options must fit the same grammatical slot. Wrong options should echo real passage vocabulary or concepts while violating the sentence's logical relation. Do not use unrelated distractors such as social comparison, vague life lessons, or generic experience unless they are explicitly in the passage.
- BLANK_INFERENCE with blankAnswerMode DOUBLE_NEGATIVE: treat it as a negative-paraphrase blank. The passage itself does not need a visible negation cue. The correct option must be a non-verbatim negative/privative paraphrase of originalExpression, and at least two wrong options must also contain negative/privative language so the negative-looking option is not a shortcut. Avoid tangled negation such as "not ... without", "unable ... without", or "impossible ... without" when it changes a helpful function into a strict necessity.
- BLANK_INFERENCE native-English check: reject awkward collocations such as "achievement(s) failing", "prevent your achievement from failing", "achieved success", "capacity to lack", "events cannot survive", "guarantee major crops", "not allow any disruption", or "can be not entirely immune". Use natural exam English such as "prevent success from eroding/collapsing", "keep current success from eroding", "freedom from dependence on...", "cannot be dismissed as trivial", "secure stable supplies of major crops", or "are not immune to...".
- BLANK_INFERENCE slot check: if the source says "can/could certainly be influenced by X", blank the whole modal passive span such as "can certainly be influenced by reasoning"; do not leave "can certainly be _____" for a correct option beginning with "not..." or "are not...".
- BLANK_INFERENCE adjacent-conclusion check: if the sentence right after the blank begins with a conclusion signal such as "By adopting this strategy", "Therefore", "Thus", "For this reason", or "As a result", the correct option must directly support that next sentence. Reject answers that only strengthen one side of a policy when the next sentence says the strategy reduces excessive dependence or creates a balanced/resilient system.
- BLANK_INFERENCE wrong-option explanations: cite the decisive clue that eliminates each option. Do not explain a wrong option only by saying it is positive, negative, or close to the author's ideal. For conclusion blanks, name the conclusion signal or adjacent evidence that the option fails to match.
- SENTENCE_ORDER and SENTENCE_INSERT: every wrong order/location should have one tempting local clue but fail on a later reference, contrast, chronology, or conclusion signal.
  - GRAMMAR_ERROR and GRAMMAR_CORRECTION: ensure the marked expression actually appears in the passage and the explanation names the grammar rule. Avoid controversial errors where a standard grammar reader could accept both versions. Grammar explanations must label parts of speech and syntax accurately; never call a finite verb, modal, conjunction, or clause by the wrong category. Use simple reliable labels such as subject, object, finite verb, auxiliary, conjunction, preposition, gerund, participle, relative pronoun, or noun clause; if unsure, describe the structure without inventing a category.
  - GRAMMAR_CORRECTION display contract: underline a sentence-level or clause-level passage segment, not the exact wrong word/form. The student must find the grammar error hidden inside that wider underline. Do not print a separate error sentence that reveals the location.
  - GRAMMAR_CORRECTION source contract: underlinedSegments[].sourceText must be an original passage segment. Every underlined segment is an error segment with a label starting at (A); displayedText is sourceText with correctedPart changed to errorPart, and correctAnswer lists every label + correctedPart in order joined by comma + space.
  - GRAMMAR_CORRECTION target quality: prefer agreement, finite/non-finite verb choice, parallelism, modifier active/passive, relative/nominal clause choice, pronoun agreement, complement form, comparison structure, or preposition-vs-conjunction. Avoid articles, tiny prepositions, spelling, punctuation, style-only improvements, or debatable active/passive infinitive preferences.
- GRAMMAR_ERROR with detailed settings: the setting controls both the number of marked expressions and the exact number of answers. correctAnswers must list every isError=true label, correctAnswer must repeat those labels joined by comma + space, and the explanation must explicitly cover every displayed wrong expression and its correction. If the configured answer count is 2 or more, the direction must use "모두" without revealing the number. Do not silently fall back to a single answer; when the configured answer count equals the marked expression count, every label can be an answer.
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
- IRRELEVANT: choose four source sentences verbatim and keep them in their original passage order, then insert exactly one newly written irrelevant sentence between two consecutive originals. Do not replace, delete, paraphrase, merge, or split any source sentence. The original first passage sentence is context only: it must be shown before the marked choices without a marker and must never appear as a choice. DISTRIBUTE the four chosen source sentences across the whole passage body (early, middle, and late) so the marked choices are not bunched at the top — this matters most for long passages; a short passage may have adjacent choices. Apply the remove-and-reconnect test: deleting the inserted sentence must leave its two neighboring originals reading as one seamless flow, while deleting any of the four real sentences must instead damage the coherence (unique answer). Bias the answer to the middle (②/③/④, never the first or last marked sentence) and vary it across items rather than always answering ③. The inserted sentence must not be a random outside topic. It must reuse meaningful English content words from the source window, and a substantial share of its meaningful words should come from that window. Share the passage's semantic field and nearby keywords, but fail by discourse function such as scope shift, actor/purpose shift, cause/effect target shift, evidence/procedure focus shift, example-to-advice shift, or local conclusion mismatch. Make it a plausible skim-reading trap, not an obvious alien sentence. Prefer neutral explanatory prose; do not rely on awkward grammar, absolute/extreme words, blunt advice markers, explicit opposition cues such as however/instead, regulation-backlash claims, intellectual-property detours, academic-freedom detours, sponsor-relationship advice, or a simple direct contradiction of the thesis to make it removable.
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
  "- Any underlinedPronoun, underlinedWord, underlinedExpression, originalExpression, markedWords, or markedExpressions must exist verbatim in the original passage.",
  "- For GRAMMAR_CORRECTION, underlinedSegments must identify 1-5 wider original passage segments; every item must be isError=true, and each displayedText must hide errorPart inside a sentence/clause-level underline rather than underlining only errorPart.",
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
Multiple choice: BLANK_INFERENCE, GRAMMAR_ERROR, VOCAB_CHOICE, SENTENCE_ORDER, SENTENCE_INSERT, TOPIC, MAIN_IDEA, TOPIC_MAIN_IDEA, TITLE, IMPLIED_MEANING, REFERENCE, CONTENT_MATCH, SUMMARY_COMPLETE_MC, IRRELEVANT
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
- Multiple-choice items must have exactly the requested number of options in {label, text} form. Most types use 5 options; IRRELEVANT may use the passage-length-based slot count, and multi-answer GRAMMAR_ERROR settings may use 5~10 options.
- explanation: Korean, 3-5 concise evidence-based sentences.
- keyPoints: exactly 3 Korean learning points.
- wrongOptionExplanations is required for every multiple-choice item: exactly one entry for each wrong option. Multi-answer items have fewer wrong options. If the schema is an array, each entry must be {label, explanation}.
- tags: Korean grammar/vocabulary/question-type tags.

Generate exactly ${count} question(s).`;
}
