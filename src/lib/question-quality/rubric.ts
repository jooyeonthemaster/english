// Split from question-quality.ts — shared helpers in core.ts, public API via index.ts barrel.


export const TYPE_QUALITY_RUBRICS: Record<string, string[]> = {
  BLANK_INFERENCE: [
    "Choose a blank that controls the paragraph logic, not a removable adjective or a local detail.",
    "All five options must fit the same grammatical slot; distractors should be plausible but fail the author's logic.",
    "If the sentence after the blank begins with a conclusion signal such as therefore, thus, for this reason, or by adopting this strategy, the correct answer must directly support that adjacent conclusion.",
    "Avoid result-declaration or over-absolute answers such as no disruption, unlimited imports, complete independence, or guarantee major crops unless the passage explicitly warrants that strength.",
    "For KILLER, the answer should require connecting at least two sentences or a concession/cause-effect relation.",
    "If blankAnswerMode is PARAPHRASE, originalExpression is still the exact source span, but the correct option must be a non-verbatim paraphrase calibrated to the requested difficulty.",
  ],
  GRAMMAR_ERROR: [
    "Mark 5-10 real expressions from the original passage. Detailed settings control both marked-position count and the exact answer count, including the case where every label is an answer.",
    "The error must test a meaningful grammar point such as agreement, parallelism, modification, tense/aspect, reference, or verb form.",
    "Every non-error marked expression must still be a defensible grammar judgment point with a clear explanation, not padding.",
    "For KILLER, avoid an obvious spelling-level error; the wrong expression should look natural until the sentence structure is checked.",
  ],
  GRAMMAR_CHOICE_COMBO: [
    "Create exactly three boxed slots (A)/(B)/(C) in three different sentences, each testing a different grammar point code.",
    "Each slot's correctExpression must be verbatim passage text; the wrongExpression must be clearly ungrammatical in that position, not a debatable stylistic preference or a tense-only change.",
    "Exactly one option combines all three correct expressions. Wrong options must mix single-slot and multi-slot traps, and every slot's wrong candidate must appear in at least one wrong option.",
    "One slot's judgment must not reveal another slot's answer (keep the three grammar decisions independent).",
    "For KILLER, use hard points (relatives, participles, parallelism) on at least two slots and include at least two options that are wrong in two or more slots.",
  ],
  VOCAB_CHOICE: [
    "Mark five context-bearing words from the passage. Do not use tiny function words or words whose meaning is obvious without context.",
    "Only one marked word should be contextually inappropriate; its substitute must be close enough to look tempting.",
    "For KILLER, test register, collocation, stance, causality, or discourse role, not a simple dictionary antonym.",
  ],
  SENTENCE_ORDER: [
    "The givenSentence must be only the opening 1-2 sentences and should stay under 65 words; if two opening sentences are too long, use only the first.",
    "Never put a whole introductory paragraph in givenSentence. Do not create a given part with 3+ sentences.",
    "Each of (A), (B), and (C) must be a real chunk with at least two sentences; avoid one-line or one-sentence chunks.",
    "Keep (A)/(B)/(C) balanced in length; no chunk should be roughly twice as long as another.",
    "The three reordered paragraphs must have explicit discourse clues such as pronoun reference, chronology, contrast, or cause-effect.",
    "Shuffle paragraph labels so the correct order is not simply (A)-(B)-(C).",
    "All options should be plausible permutations; avoid an answer that is forced by a single first-word connector only.",
    "For KILLER, the correct order should require checking both local cohesion and the whole paragraph argument.",
  ],
  SENTENCE_INSERT: [
    "givenSentence must be copied from or very lightly transformed from one original passage sentence; never invent a new bridge sentence or add outside background information.",
    "Always provide sourceSentenceToOmit as the original verbatim passage sentence that was removed from the displayed passage.",
    "The given sentence must carry at least one explicit cohesive cue (demonstrative/pronoun anaphora, definite-article old information, a directional connective, or a temporal/causal link). A self-contained 'neutral' sentence that fits anywhere yields multiple answers and must be rejected.",
    "The correct gap is decided by asymmetry: at the answer it closes BOTH the link to the preceding sentence and the link to the following sentence, while every other gap breaks at least one link (and inserting there splits two originally adjacent sentences).",
    "Referent uniqueness: the cue's antecedent must exist only just before the correct gap; if a demonstrative/the-noun could resolve at two or more gaps the item has multiple answers.",
    "Place the answer in the middle (②③④), not at the first or last gap, and keep the given sentence's length/register/abstraction homogeneous with the passage so position cannot be back-traced from style.",
    "Each of the four distractor gaps must have one tempting clue (e.g. shared keyword, connective surface form) yet fail for a DIFFERENT decisive reason (missing antecedent, broken back-link, mismatched connective logic, undefined the/this). Avoid gaps that are obviously wrong.",
    "For KILLER, weaken and spread surface cues so no single cue forces the answer; converge 2-3 cues on the correct gap while leaving only one cue at each distractor, and raise difficulty through abstract/argumentative passage logic, not through a missing cue.",
  ],
  TOPIC_MAIN_IDEA: [
    "The correct option must paraphrase the whole passage, not repeat a surface keyword.",
    "Distractors should be partial, too broad, too narrow, reversed, or unsupported versions of the passage.",
    "For KILLER, options should be close in wording and differ by scope, causal direction, or author stance.",
  ],
  TOPIC: [
    "The correct option must be an English topic phrase that states the passage's central topic plus controlling viewpoint, not only name the subject matter.",
    "Distractors should be topic-only, example-only, too broad, too narrow, reversed in stance, or focused on a side detail.",
    "For KILLER, every option should sound like a plausible topic until the full passage scope and author stance are checked.",
  ],
  MAIN_IDEA: [
    "The correct option must express the passage's overall point, claim, or conclusion as a complete Korean statement.",
    "Do not write a title-like noun phrase or a mere topic label for a main-idea item.",
    "Distractors should preserve real passage concepts while distorting conclusion, recommendation, cause-effect relation, scope, or stance.",
    "For KILLER, options should differ by subtle logical relation rather than by obvious factual absence.",
  ],
  TITLE: [
    "The title must capture the central tension or outcome of the passage, not only name the topic.",
    "Distractors should sound like valid titles but miss the passage's controlling idea.",
    "For KILLER, avoid giveaway wording; make the title choice depend on the full development of the text.",
  ],
  IMPLIED_MEANING: [
    "Underline a phrase, clause, or short sentence whose meaning is determined by the passage logic, not by dictionary translation.",
    "Treat implied meaning as a main-idea family item: the underline should be a paraphrased, metaphorical, compressed, or conclusion-like expression of the passage's central claim.",
    "Avoid underlining a peripheral local detail even if it has a surface-to-hidden gap; the answer should connect back to the passage's topic/gist/title-level meaning.",
    "Do not use a single vocabulary word, pronoun, or trivial phrase as the target; that belongs to CONTEXT_MEANING or REFERENCE.",
    "Do not underline a rhetorical question or a self-answering question whose answer is stated in the next sentence.",
    "Reject targets whose correct answer is directly paraphrased by the immediately following sentence; there must be a real surface-to-hidden meaning gap.",
    "The correct option must be written in English and paraphrase the implied meaning of the underlined expression, not merely translate its surface wording.",
    "Distractors must borrow real passage concepts and fail by scope, cause-effect, stance, example/generalization, or local-vs-global evidence; avoid absolute-word giveaway distractors.",
    "For KILLER, the answer should require connecting at least two clues before and after the underlined expression, and every distractor should be a near-miss.",
  ],
  REFERENCE: [
    "Underline a standalone pronoun or demonstrative that appears as its own token in the passage.",
    "The surroundingText must be the exact sentence window that contains that pronoun; the explanation must discuss that same sentence, not a different sentence or the passage conclusion.",
    "Before finalizing, verify that surroundingText contains the standalone underlinedPronoun with token boundaries. If it does not, choose another pronoun occurrence.",
    "Options must include several grammatically or semantically plausible antecedents from the nearby context.",
    "For KILLER, the answer should require resolving grammar, number, discourse role, and meaning; never underline inside another word.",
  ],
  CONTENT_MATCH: [
    "Every option must be traceable to a specific passage claim.",
    "The incorrect option should be subtly distorted by degree, cause-effect, comparison, time, or condition.",
    "For KILLER, avoid invented statements that are obviously absent from the passage.",
  ],
  SUMMARY_COMPLETE_MC: [
    "Use the CSAT-style frame: passage, down arrow/summary, then five paired options for (A) and (B).",
    "The summary must be one natural English sentence that abstracts the whole passage; it must not copy a single passage sentence.",
    "After filling the correct pair, the sentence must read as native English; reject awkward bridges such as question of equity to ensuring.",
    "The two blanks should carry distinct core ideas, such as cause/result, problem/solution, contrast/concession, or concept/effect.",
    "Every option must be an English pair with parallel grammar slots. Wrong pairs should be near-misses, not random vocabulary.",
    "Include at least one A-only-correct trap and one B-only-correct trap so students must verify both blanks.",
    "For KILLER, the half-correct traps must be genuinely competitive: pair the correct blankA with the strongest wrong blankB, and pair the correct blankB with the strongest wrong blankA.",
    "For KILLER, do not bury the best trap behind an instantly removable partner. For example, if evolutionarily is correct, genetically should be tested with the correct blankA, not paired with an obviously wrong blankA.",
    "For KILLER, make the correct pair depend on global relation mapping, and make every distractor passage-grounded.",
  ],
  IRRELEVANT: [
    "The irrelevant sentence must share the passage's central topic word, nearby keywords, and style while breaking only the paragraph's discourse function. It must bridge to the sentence right before it (echo a word or open with This/Such/These/However) so it looks connected on a skim.",
    "Every non-answer sentence must be copied verbatim from the source passage; spread the four chosen choices across the whole passage body (not bunched at the top) but keep them in original order.",
    "Apply the remove-and-reconnect test: deleting the answer must leave a seamless paragraph, and deleting any other choice must damage coherence (unique answer). Bias the answer to ②/③/④ and vary it; never ① or ⑤.",
    "Do not use a random outside fact as the intruder; make it fail by discourse function such as evaluation reversal, scope/actor shift, cause-effect swap, example/advice jump, sub-topic drift, or over-generalization.",
    "For BASIC, the intruder may be a clear but still passage-related focus shift; do not make it a completely unrelated topic.",
    "For INTERMEDIATE, prefer a same-topic sentence that shifts the local role, evidence target, or practical focus without using an obvious counterclaim cue.",
    "For KILLER, make the sentence locally cohesive and vocabulary-rich, but wrong only after checking how the surrounding sentences build the claim. Do not use explicit opposition markers, regulation-backlash claims, blunt advice, or a simple direct contradiction of the thesis.",
  ],
  CONDITIONAL_WRITING: [
    "Require an answer that combines passage meaning with at least one explicit grammatical or lexical condition.",
    "The model answer must be a natural English sentence and satisfy every condition exactly.",
    "For KILLER, include two or more constraints that interact, such as a required structure plus a specific meaning relation.",
  ],
  SENTENCE_TRANSFORM: [
    "Transform a meaningful sentence from the passage without changing the intended meaning.",
    "Conditions must be specific enough to make one answer shape clearly preferable.",
    "For KILLER, require multiple transformations while preserving tense, reference, and logical emphasis.",
  ],
  FILL_BLANK_KEY: [
    "Blank a key phrase whose recovery depends on passage logic, not a generic word.",
    "The answer should be exact, concise, and naturally fit the sentence.",
    "For KILLER, the blank should test a central inference or collocation that cannot be guessed from grammar alone.",
  ],
  SUMMARY_COMPLETE: [
    "The summary must be faithful to the whole passage and use natural English collocations.",
    "Each blank should correspond to a distinct core idea, not repeated wording.",
    "For KILLER, make blanks require abstraction and relation mapping; avoid awkward phrases or redundant word pairs.",
  ],
  WORD_ORDER: [
    "Use meaningful chunks that form one natural English sentence from the passage idea.",
    "Keep punctuation attached to a neighboring word/chunk and never create punctuation-only pieces.",
    "For KILLER, the order should require grammar plus meaning; the scrambledWords order must not already equal the model answer.",
  ],
  GRAMMAR_CORRECTION: [
    "Underline a sentence-level or clause-level segment from the source passage; the exact wrong word/form must be hidden inside that wider underline.",
    "Do not underline only the wrong expression itself. The underlined segment must be meaningfully wider than errorPart.",
    "Use underlinedSegments: sourceText is the original correct source segment, displayedText is the same segment with one grammar mutation, and every underlined segment has isError=true.",
    "passageWithUnderline must contain the full passage with the wider underlined segment(s), not a separate error sentence below the passage.",
    "Avoid controversial style edits and low-value targets such as articles, tiny prepositions, spelling, punctuation, or preference-only active/passive infinitives.",
    "For KILLER, test a higher-value grammar point such as modifier attachment, parallelism, tense logic, or agreement across distance.",
  ],
  CONTEXT_MEANING: [
    "Underline a context-rich word or phrase, not a trivial word whose meaning is obvious in isolation.",
    "Options must be close semantic alternatives; the correct meaning should depend on the sentence's role in the passage.",
    "For KILLER, test nuance, stance, register, collocation, or metaphorical use rather than a dictionary synonym.",
  ],
  SYNONYM: [
    "Choose a target word with enough semantic weight to test context-sensitive synonymy.",
    "Distractors should be the same part of speech and close in meaning but wrong in context or register.",
    "For KILLER, avoid elementary pairs; the answer should require discriminating fine semantic nuance.",
  ],
  ANTONYM: [
    "Use this as a 'wrong antonym pair' item: exactly one word-pair must be incorrectly matched, and the other four must be clean contextual antonym pairs.",
    "Every pair must match part of speech, inflection, and semantic axis; avoid form mismatches such as forces-restrain.",
    "Reject contestable pairs such as force-restrain, mastery-ignorance, rational-emotional, dim-clear, justify-excuse, or unproductive-passive.",
    "For the incorrect pair, provide correctAntonym so the decisive fix is explicit and not merely a vague explanation.",
    "For KILLER, make the wrong pair a subtle but unambiguous semantic-axis error, not a pair that could be defended as an opposite in another sense.",
  ],
};



export function getTypeQualityRubric(typeId: string, difficulty?: string): string {
  const rules = TYPE_QUALITY_RUBRICS[typeId];
  if (!rules?.length) return "";

  const difficultyRule =
    difficulty === "KILLER"
      ? "- Treat KILLER as an actual top-tier exam item: subtle, evidence-based, and resistant to shortcut guessing."
      : difficulty === "BASIC"
        ? "- Keep the item direct and clearly grounded in the passage, without artificial trickiness."
        : "- Require a real passage-based inference while keeping the evidence reasonably accessible.";

  return [
    "## Type-specific quality bar",
    difficultyRule,
    ...rules.map((rule) => `- ${rule}`),
  ].join("\n");
}
