import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CORPUS_PATH = path.join(HERE, "corpus.json");
const ORACLE_PATH = path.join(HERE, "oracle.json");
const SEAL_PATH = path.join(HERE, "corpus.seal.json");

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function clone(value) {
  return structuredClone(value);
}

function json(value) {
  return JSON.stringify(value, null, 2) + "\n";
}

function numberedOptions(texts) {
  return texts.map((text, index) => ({ label: String(index + 1), text }));
}

function variantContext(index) {
  return [
    {
      topic: "urban cooling",
      actor: "city planners",
      suffix: "The example concerns a municipal heat study.",
    },
    {
      topic: "archive preservation",
      actor: "curators",
      suffix: "The example concerns a public archive review.",
    },
    {
      topic: "coastal monitoring",
      actor: "field researchers",
      suffix: "The example concerns a coastal evidence project.",
    },
  ][index];
}

const cases = [];
const oracleEntries = [];
const familyManifest = [];

function addPair({
  familyId,
  group,
  description,
  validatorRefs,
  targetIssueCodes,
  variant,
  validInput,
  defectInput,
  scope = "EN",
  evidence,
}) {
  const pairId = familyId + "-v" + String(variant + 1);
  const validCaseId = pairId + "-a";
  const defectCaseId = pairId + "-b";
  const shared = {
    pairId,
    familyId,
    group,
    scope,
    variant: variant + 1,
    contractDescription: description,
    validatorRefs,
    syntheticEvidence: evidence,
  };
  cases.push(
    {
      caseId: validCaseId,
      ...shared,
      input: validInput,
    },
    {
      caseId: defectCaseId,
      ...shared,
      input: defectInput,
    },
  );
  oracleEntries.push(
    {
      caseId: validCaseId,
      pairId,
      expectedValid: true,
      targetIssueCodes,
      rationale:
        "Source-aware control satisfies the named structural contract; the paired mutation is absent.",
    },
    {
      caseId: defectCaseId,
      pairId,
      expectedValid: false,
      targetIssueCodes,
      rationale:
        "Exactly one named structural dimension is intentionally broken relative to its paired control.",
    },
  );
  if (!familyManifest.some((item) => item.familyId === familyId)) {
    familyManifest.push({
      familyId,
      group,
      scope,
      description,
      targetIssueCodes,
      validatorRefs,
    });
  }
}

function genericTitle(index) {
  const v = variantContext(index);
  return {
    typeId: "TITLE",
    passage:
      "A careful review combines independent evidence before reaching a conclusion. " +
      v.suffix,
    question: {
      direction: "Choose the best title for the passage.",
      options: numberedOptions([
        "A shortcut that ignores conflicting evidence",
        "Why immediate guesses outperform patient review",
        "Independent evidence and careful conclusions",
        "The disappearance of public records",
        "A method for avoiding every revision",
      ]),
      correctAnswer: "3",
      explanation:
        "The passage emphasizes the connection between independent evidence and careful conclusions.",
      difficulty: "BASIC",
    },
  };
}

function genericFamily(index, familyId, description, targetIssueCodes, mutate) {
  const base = genericTitle(index);
  const defect = clone(base);
  mutate(defect);
  addPair({
    familyId,
    group: "generic-envelope",
    description,
    validatorRefs: [
      "src/lib/question-quality/dispatcher.ts",
      "src/lib/question-quality/validators/options.ts",
      "src/lib/question-quality/validators/misc.ts",
      "src/lib/question-quality/validators/grammar/marked.ts",
    ],
    targetIssueCodes,
    variant: index,
    validInput: base,
    defectInput: defect,
    evidence: [
      base.passage,
      "The option set and answer label are wholly synthetic and source-aligned.",
    ],
  });
}

function addGenericFamilies(index) {
  genericFamily(
    index,
    "GEN-OPTION-COUNT",
    "Five-option multiple-choice envelope preserves the configured option cardinality.",
    ["option-count"],
    (input) => {
      input.question.options.pop();
    },
  );
  genericFamily(
    index,
    "GEN-DUPLICATE-LABEL",
    "Multiple-choice option labels are unique after production normalization.",
    ["duplicate-option-label"],
    (input) => {
      input.question.options[4].label = "4";
    },
  );
  genericFamily(
    index,
    "GEN-DUPLICATE-TEXT",
    "Multiple-choice option texts are distinct.",
    ["duplicate-option-text"],
    (input) => {
      input.question.options[4].text = input.question.options[3].text;
    },
  );
  genericFamily(
    index,
    "GEN-EMPTY-OPTION",
    "Every rendered option carries non-empty text.",
    ["empty-option-text"],
    (input) => {
      input.question.options[1].text = "   ";
    },
  );
  genericFamily(
    index,
    "GEN-ANSWER-MEMBERSHIP",
    "The declared correct answer resolves to an existing option.",
    ["correct-answer-mismatch"],
    (input) => {
      input.question.correctAnswer = "9";
    },
  );
  genericFamily(
    index,
    "GEN-TYPE-SIGNATURE",
    "A TITLE item does not carry blank-inference-only fields.",
    ["type-foreign-field"],
    (input) => {
      input.question.blanks = [{ label: "(A)", answer: "evidence" }];
    },
  );

  {
    const base = genericTitle(index);
    base.genericAnswerCount = 2;
    base.question.direction = "Choose all titles that match the passage.";
    base.question.correctAnswer = "2, 3";
    base.question.correctAnswers = ["2", "3"];
    const defect = clone(base);
    defect.question.correctAnswer = "3";
    defect.question.correctAnswers = ["3"];
    addPair({
      familyId: "GEN-MULTI-ANSWER-COUNT",
      group: "generic-envelope",
      description:
        "Teacher-requested multi-answer cardinality matches the declared answer-label set.",
      validatorRefs: ["src/lib/question-quality/dispatcher.ts"],
      targetIssueCodes: ["generic-answer-count"],
      variant: index,
      validInput: base,
      defectInput: defect,
      evidence: [base.passage, "Two synthetic labels are declared in the valid control."],
    });
  }

  {
    const base = genericTitle(index);
    base.genericAnswerCount = 2;
    base.question.direction = "Choose all titles that match the passage.";
    base.question.correctAnswer = "2, 3";
    base.question.correctAnswers = ["2", "3"];
    const defect = clone(base);
    defect.question.direction = "Choose the single best title for the passage.";
    addPair({
      familyId: "GEN-MULTI-ANSWER-DIRECTION",
      group: "generic-envelope",
      description:
        "A multi-answer item explicitly instructs students to choose all applicable options.",
      validatorRefs: ["src/lib/question-quality/dispatcher.ts"],
      targetIssueCodes: ["generic-multi-answer-direction"],
      variant: index,
      validInput: base,
      defectInput: defect,
      evidence: [base.passage, "The valid direction explicitly says choose all."],
    });
  }

  {
    const base = genericTitle(index);
    base.question.passageWithUnderline =
      "Careful readers compare the __central claim__ with independent evidence.";
    const defect = clone(base);
    defect.question.passageWithUnderline =
      "Careful readers compare the cen__tral cl__aim with independent evidence.";
    addPair({
      familyId: "GEN-MARKER-BOUNDARY",
      group: "generic-envelope",
      description: "Double-underscore markers begin and end on token boundaries.",
      validatorRefs: ["src/lib/question-quality/validators/grammar/marked.ts"],
      targetIssueCodes: ["mid-word-marker"],
      variant: index,
      validInput: base,
      defectInput: defect,
      evidence: [
        "The control underlines a complete synthetic phrase; the mutation cuts two words internally.",
      ],
    });
  }
}

function contextMeaningBase(index) {
  const v = variantContext(index);
  const passage =
    "A shared anchor helps reviewers compare claims across several reports. " +
    v.suffix;
  return {
    typeId: "CONTEXT_MEANING",
    passage,
    question: {
      direction: "Choose the meaning of the underlined word in context.",
      underlinedWord: "anchor",
      options: numberedOptions([
        "a stable reference point",
        "a decorative border",
        "an unrelated exception",
        "a hurried prediction",
        "a missing record",
      ]),
      correctAnswer: "1",
      explanation: "Anchor means a stable reference point in this context.",
      difficulty: "BASIC",
    },
  };
}

function wordOrderBase(index) {
  const v = variantContext(index);
  return {
    typeId: "WORD_ORDER",
    passage:
      "Careful readers compare several sources before drawing firm conclusions. " +
      v.suffix,
    question: {
      direction: "Arrange the chunks to form a sentence.",
      modelAnswer:
        "Careful readers compare several sources before drawing firm conclusions.",
      scrambledWords: [
        "drawing firm conclusions.",
        "several sources",
        "Careful readers",
        "before",
        "compare",
      ],
      explanation:
        "Every answer token is available, but the chunks are not already in answer order.",
      difficulty: "BASIC",
    },
  };
}

function sentenceInsertBase(index) {
  const tail = variantContext(index).suffix;
  const sourceSentences = [
    "Researchers first collect observations.",
    "They then compare patterns across settings.",
    "However, this comparison can expose hidden assumptions.",
    "Those assumptions guide the next experiment.",
    "The team revises its model after each result.",
    "Finally, the model is tested on new evidence.",
  ];
  const passage = sourceSentences.join(" ") + " " + tail;
  const question = {
    direction: "Choose the best place to insert the given sentence.",
    givenSentence: sourceSentences[2],
    sourceSentenceToOmit: sourceSentences[2],
    markerAfterSentenceIndices: [0, 1, 3, 4, 5],
    passageWithMarkers:
      sourceSentences[0] +
      " ① " +
      sourceSentences[1] +
      " ② " +
      sourceSentences[3] +
      " ③ " +
      sourceSentences[4] +
      " ④ " +
      sourceSentences[5] +
      " ⑤",
    options: numberedOptions(["①", "②", "③", "④", "⑤"]),
    correctAnswer: "2",
    explanation:
      "The contrastive sentence belongs after the comparison and before the assumptions are referenced.",
    wrongOptionExplanations: {
      "1": "The comparison has not yet been introduced.",
      "3": "The assumptions are already being referenced.",
      "4": "The model-revision sequence has already begun.",
      "5": "The final test has already been introduced.",
    },
    difficulty: "INTERMEDIATE",
  };
  return { typeId: "SENTENCE_INSERT", passage, question };
}

function sentenceOrderBase(index) {
  const suffix = variantContext(index).suffix;
  const given =
    "Readers begin with a broad question. They identify the evidence needed to answer it.";
  const paragraphA =
    "Only after comparing the records do reviewers revise the initial claim. They preserve the remaining uncertainty so later readers can evaluate the conclusion independently.";
  const paragraphB =
    "First, the team gathers reports from several settings and checks how each observation was recorded. This step keeps a striking result from dominating the inquiry.";
  const paragraphC =
    "Next, the reviewers compare repeated patterns and isolate disagreements among the sources. They also examine whether different methods can explain those disagreements.";
  const passage =
    given + " " + paragraphB + " " + paragraphC + " " + paragraphA + " " + suffix;
  return {
    typeId: "SENTENCE_ORDER",
    passage,
    question: {
      direction: "Choose the most logical order of the following paragraphs.",
      givenSentence: given,
      paragraphs: [
        { label: "(A)", text: paragraphA },
        { label: "(B)", text: paragraphB },
        { label: "(C)", text: paragraphC },
      ],
      options: numberedOptions([
        "(A)-(C)-(B)",
        "(B)-(C)-(A)",
        "(B)-(A)-(C)",
        "(C)-(A)-(B)",
        "(C)-(B)-(A)",
      ]),
      correctAnswer: "2",
      explanation:
        "Collection precedes comparison, and revision follows both stages.",
      difficulty: "INTERMEDIATE",
    },
  };
}

function contentMatchBase(index) {
  const v = variantContext(index);
  return {
    typeId: "CONTENT_MATCH",
    passage:
      "Independent measurements reduce the chance that one noisy result controls a decision. " +
      v.suffix,
    contentMatchType: "일치",
    question: {
      direction: "Which statement matches the passage?",
      matchType: "일치",
      options: numberedOptions([
        "Several measurements can reduce reliance on one noisy result.",
        "One result is always sufficient for every decision.",
        "Reviewers should ignore disagreement among records.",
        "Noise guarantees that a conclusion is correct.",
        "Independent checks make evidence unnecessary.",
      ]),
      correctAnswer: "1",
      explanation:
        "The first statement preserves the relation stated in the source.",
      difficulty: "BASIC",
    },
  };
}

function referenceBase(index) {
  const v = variantContext(index);
  const passage =
    "Several reviewers compared the records. They documented every disagreement before deciding. " +
    v.suffix;
  return {
    typeId: "REFERENCE",
    passage,
    question: {
      direction: "What does the underlined pronoun refer to?",
      underlinedPronoun: "They",
      passageWithUnderline:
        "Several reviewers compared the records. __They__ documented every disagreement before deciding.",
      options: numberedOptions([
        "the reviewers",
        "the records",
        "the disagreements",
        "the decisions",
        "the settings",
      ]),
      correctAnswer: "1",
      explanation: "They refers to the plural noun reviewers.",
      difficulty: "BASIC",
    },
  };
}

function irrelevantBase(index) {
  const suffix = variantContext(index).suffix;
  const source = [
    "Scientific models improve through repeated testing.",
    "Researchers compare evidence from several independent trials.",
    "Each comparison reveals patterns that a single trial can hide.",
    "Teams revise the model when accumulated evidence conflicts with its predictions.",
    "Further trials test whether the revised model explains new observations.",
    "Public reports describe the remaining uncertainty.",
  ];
  const inserted =
    "This evidence comparison can also improve classroom discussion about models.";
  return {
    typeId: "IRRELEVANT",
    passage: source.join(" ") + " " + suffix,
    requestedDifficulty: "BASIC",
    question: {
      direction: "Choose the sentence that is irrelevant to the flow.",
      sentences: [source[1], source[2], inserted, source[3], source[4]],
      irrelevantIndex: 2,
      options: numberedOptions(["①", "②", "③", "④", "⑤"]),
      correctAnswer: "3",
      explanation:
        "The inserted classroom sentence changes the setting while borrowing evidence vocabulary.",
      wrongOptionExplanations: {
        "1": "This sentence introduces the comparison stage.",
        "2": "This sentence explains what comparison reveals.",
        "4": "This sentence gives the model-revision consequence.",
        "5": "This sentence continues the testing sequence.",
      },
      difficulty: "BASIC",
    },
  };
}

function addEnglishStructuralFamilies(index) {
  {
    const base = contextMeaningBase(index);
    const defect = clone(base);
    defect.question.underlinedWord = "art";
    defect.passage =
      "Reviewers recorded a partial pattern but no separate target token. " +
      variantContext(index).suffix;
    addPair({
      familyId: "EN-TARGET-STANDALONE",
      group: "english-structural",
      description:
        "A single-token context target exists as a standalone token in the source passage.",
      validatorRefs: ["src/lib/question-quality/dispatcher.ts"],
      targetIssueCodes: ["target-not-standalone"],
      variant: index,
      validInput: base,
      defectInput: defect,
      evidence: [
        base.passage,
        defect.passage,
        "The mutation exposes art only as a substring of partial.",
      ],
    });
  }

  {
    const base = wordOrderBase(index);
    const defect = clone(base);
    defect.question.scrambledWords = defect.question.scrambledWords.filter(
      (chunk) => chunk !== "several sources",
    );
    addPair({
      familyId: "EN-WORD-ORDER-RECONSTRUCT",
      group: "english-structural",
      description:
        "WORD_ORDER answer tokens are reconstructable from the available chunks.",
      validatorRefs: ["src/lib/question-quality/validators/word-order.ts"],
      targetIssueCodes: ["word-order-unreconstructable"],
      variant: index,
      validInput: base,
      defectInput: defect,
      evidence: [base.passage, base.question.modelAnswer],
    });
  }

  {
    const base = wordOrderBase(index);
    const defect = clone(base);
    defect.question.scrambledWords = [defect.question.modelAnswer];
    addPair({
      familyId: "EN-WORD-ORDER-UNSOLVED",
      group: "english-structural",
      description: "WORD_ORDER chunks are not already presented in answer order.",
      validatorRefs: ["src/lib/question-quality/dispatcher.ts"],
      targetIssueCodes: ["scrambled-already-solved"],
      variant: index,
      validInput: base,
      defectInput: defect,
      evidence: [base.question.modelAnswer, "The defect exposes the complete answer as one chunk."],
    });
  }

  {
    const v = variantContext(index);
    const base = {
      typeId: "SENTENCE_TRANSFORM",
      passage:
        "Although the first result looked convincing, reviewers compared it with later trials. " +
        v.suffix,
      question: {
        direction: "Rewrite the sentence without changing its meaning.",
        originalSentence:
          "Although the first result looked convincing, reviewers compared it with later trials.",
        modelAnswer:
          "Despite the convincing first result, reviewers compared it with later trials.",
        explanation: "The concessive relation is preserved in a different form.",
        difficulty: "BASIC",
      },
    };
    const defect = clone(base);
    defect.question.modelAnswer = defect.question.originalSentence;
    addPair({
      familyId: "EN-TRANSFORM-ACTUAL-CHANGE",
      group: "english-structural",
      description:
        "SENTENCE_TRANSFORM changes the source form rather than returning it unchanged.",
      validatorRefs: ["src/lib/question-quality/dispatcher.ts"],
      targetIssueCodes: ["transform-answer-not-transformed"],
      variant: index,
      validInput: base,
      defectInput: defect,
      evidence: [base.question.originalSentence, base.question.modelAnswer],
    });
  }

  {
    const base = sentenceInsertBase(index);
    const defect = clone(base);
    defect.question.passageWithMarkers =
      defect.question.passageWithMarkers.replace(" ⑤", "");
    addPair({
      familyId: "EN-INSERT-GAP-MARKERS",
      group: "english-structural",
      description:
        "SENTENCE_INSERT rendered passage contains exactly the requested number of gap markers.",
      validatorRefs: ["src/lib/question-quality/validators/sentence-insert.ts"],
      targetIssueCodes: ["sentence-insert-gap-marker-count"],
      variant: index,
      validInput: base,
      defectInput: defect,
      evidence: [base.passage, base.question.sourceSentenceToOmit],
    });
  }

  {
    const base = sentenceInsertBase(index);
    const defect = clone(base);
    defect.question.correctAnswer = "3";
    addPair({
      familyId: "EN-INSERT-ANSWER-SYNC",
      group: "english-structural",
      description:
        "SENTENCE_INSERT answer label agrees with deterministic source reconstruction.",
      validatorRefs: ["src/lib/question-quality/validators/sentence-insert.ts"],
      targetIssueCodes: ["sentence-insert-answer-desync"],
      variant: index,
      validInput: base,
      defectInput: defect,
      evidence: [base.passage, "Restoration is source-exact only at gap 2."],
    });
  }

  {
    const base = sentenceOrderBase(index);
    const defect = clone(base);
    defect.question.paragraphs.pop();
    addPair({
      familyId: "EN-ORDER-PARAGRAPH-COUNT",
      group: "english-structural",
      description: "SENTENCE_ORDER exposes exactly three labeled paragraphs.",
      validatorRefs: ["src/lib/question-quality/validators/sentence-order.ts"],
      targetIssueCodes: ["sentence-order-paragraph-count"],
      variant: index,
      validInput: base,
      defectInput: defect,
      evidence: [base.passage, "The control carries complete (A), (B), and (C) chunks."],
    });
  }

  {
    const base = sentenceOrderBase(index);
    const defect = clone(base);
    defect.question.paragraphs[1].text =
      defect.question.paragraphs[1].text.replace("gathers reports", "invents reports");
    addPair({
      familyId: "EN-ORDER-SOURCE-BACKING",
      group: "english-structural",
      description:
        "Every SENTENCE_ORDER paragraph is a punctuation-insensitive verbatim source split.",
      validatorRefs: ["src/lib/question-quality/validators/sentence-order.ts"],
      targetIssueCodes: ["sentence-order-paragraph-not-source-backed"],
      variant: index,
      validInput: base,
      defectInput: defect,
      evidence: [base.passage, "The mutation changes gathers to invents."],
    });
  }

  {
    const base = contentMatchBase(index);
    const defect = clone(base);
    defect.question.direction = "Which statement does not match the passage?";
    addPair({
      familyId: "EN-CONTENT-POLARITY",
      group: "english-structural",
      description:
        "CONTENT_MATCH direction agrees with the forced match polarity.",
      validatorRefs: ["src/lib/question-quality/validators/content-match.ts"],
      targetIssueCodes: ["content-match-direction-polarity"],
      variant: index,
      validInput: base,
      defectInput: defect,
      evidence: [base.passage, "The forced runtime setting is 일치."],
    });
  }

  {
    const base = referenceBase(index);
    const defect = clone(base);
    defect.question.passageWithUnderline =
      "Several __reviewers__ compared the records. __They__ documented every disagreement before deciding.";
    addPair({
      familyId: "EN-REFERENCE-MARKER-SHAPE",
      group: "english-structural",
      description:
        "A standard REFERENCE item contains exactly one underline matching underlinedPronoun.",
      validatorRefs: ["src/lib/question-quality/validators/reference.ts"],
      targetIssueCodes: ["reference-marker-shape"],
      variant: index,
      validInput: base,
      defectInput: defect,
      evidence: [base.passage, "The mutation renders two underlined spans."],
    });
  }

  {
    const v = variantContext(index);
    const base = wordOrderBase(index);
    base.passage =
      "Careful readers compare several sources before drawing firm conclusions. " +
      v.suffix;
    base.question.modelAnswer =
      "Sound conclusions emerge after readers compare multiple sources.";
    base.question.scrambledWords = [
      "multiple sources.",
      "Sound conclusions",
      "after",
      "readers compare",
      "emerge",
    ];
    const defect = clone(base);
    defect.question.modelAnswer =
      "Careful readers compare several sources before drawing firm conclusions.";
    defect.question.scrambledWords = [
      "firm conclusions.",
      "Careful readers",
      "before drawing",
      "compare several sources",
    ];
    addPair({
      familyId: "EN-WRITING-NONVERBATIM",
      group: "english-structural",
      description:
        "A constructed writing answer is not substantially copied verbatim from the source.",
      validatorRefs: ["src/lib/question-quality/dispatcher.ts"],
      targetIssueCodes: ["writing-answer-verbatim-copy"],
      variant: index,
      validInput: base,
      defectInput: defect,
      evidence: [base.passage, defect.question.modelAnswer],
    });
  }

  {
    const base = irrelevantBase(index);
    const defect = clone(base);
    defect.question.sentences.pop();
    addPair({
      familyId: "EN-IRRELEVANT-SENTENCE-COUNT",
      group: "english-structural",
      description:
        "IRRELEVANT carries the exact configured number of numbered sentences.",
      validatorRefs: ["src/lib/question-quality/validators/irrelevant.ts"],
      targetIssueCodes: ["irrelevant-sentence-count"],
      variant: index,
      validInput: base,
      defectInput: defect,
      evidence: [base.passage, "The control has four source sentences and one synthetic intruder."],
    });
  }
}

function singleBlankBase(index, paraphrase = false) {
  const v = variantContext(index);
  const passage =
    "Careful teams compare independent evidence before revising a shared model. " +
    "This discipline prevents premature conclusions. " +
    v.suffix;
  const correctText = paraphrase
    ? "weigh evidence from independent sources"
    : "compare independent evidence";
  return {
    typeId: "BLANK_INFERENCE",
    passage,
    requestedDifficulty: "BASIC",
    blankInferenceParaphraseAnswer: paraphrase || undefined,
    question: {
      direction: "Choose the best expression for the blank.",
      originalExpression: "compare independent evidence",
      passageWithBlank:
        "Careful teams _____ before revising a shared model. This discipline prevents premature conclusions. " +
        v.suffix,
      options: numberedOptions([
        correctText,
        "ignore conflicting observations",
        "prefer immediate intuition",
        "avoid revising weak assumptions",
        "replace evidence with guesses",
      ]),
      correctAnswer: "1",
      explanation:
        "The blank preserves the evidence-comparison step that precedes revision.",
      answerLogic:
        "The correct option preserves comparison across independent sources without copying an unrelated sentence.",
      difficulty: "BASIC",
      ...(paraphrase ? { blankAnswerMode: "PARAPHRASE" } : {}),
    },
  };
}

function multiBlankBase(index) {
  const v = variantContext(index);
  const passage =
    "Reliable inquiry separates observation from interpretation and compares competing explanations before accepting a claim. " +
    v.suffix;
  const options = [
    {
      label: "1",
      text:
        "separates observation from interpretation / compares competing explanations",
      blankValues: [
        "separates observation from interpretation",
        "compares competing explanations",
      ],
    },
    {
      label: "2",
      text:
        "separates observation from interpretation / ignores competing explanations",
      blankValues: [
        "separates observation from interpretation",
        "ignores competing explanations",
      ],
    },
    {
      label: "3",
      text:
        "mixes observation with interpretation / compares competing explanations",
      blankValues: [
        "mixes observation with interpretation",
        "compares competing explanations",
      ],
    },
    {
      label: "4",
      text:
        "hides observation from review / accepts the first explanation",
      blankValues: [
        "hides observation from review",
        "accepts the first explanation",
      ],
    },
    {
      label: "5",
      text:
        "replaces observation with guesses / avoids rival explanations",
      blankValues: [
        "replaces observation with guesses",
        "avoids rival explanations",
      ],
    },
  ];
  return {
    typeId: "BLANK_INFERENCE",
    passage,
    blankInferenceBlankCount: 2,
    requestedDifficulty: "BASIC",
    question: {
      direction: "Choose the best pair for blanks (A) and (B).",
      blanks: [
        {
          label: "(A)",
          originalExpression: "separates observation from interpretation",
        },
        {
          label: "(B)",
          originalExpression: "compares competing explanations",
        },
      ],
      passageWithBlank:
        "Reliable inquiry (A) _____ and (B) _____ before accepting a claim. " +
        v.suffix,
      options,
      correctAnswer: "1",
      explanation:
        "The source-exact pair restores both independently anchored spans.",
      difficulty: "BASIC",
    },
  };
}

function addBlankFamilies(index) {
  {
    const base = singleBlankBase(index);
    const defect = clone(base);
    defect.question.correctAnswer = "9";
    addPair({
      familyId: "BLANK-CORRECT-OPTION",
      group: "blank-structural",
      description:
        "Single BLANK_INFERENCE resolves its correct answer to a non-empty option.",
      validatorRefs: [
        "src/lib/question-quality/validators/blank/inference.ts",
        "src/lib/question-quality/validators/options.ts",
      ],
      targetIssueCodes: ["blank-missing-answer"],
      variant: index,
      validInput: base,
      defectInput: defect,
      evidence: [base.passage, base.question.originalExpression],
    });
  }

  {
    const base = singleBlankBase(index);
    const defect = clone(base);
    defect.question.passageWithBlank +=
      " Reviewers later compare independent evidence once more.";
    addPair({
      familyId: "BLANK-NO-RESIDUAL-ANSWER",
      group: "blank-structural",
      description:
        "A source-exact blank answer does not remain visible elsewhere in the student carrier.",
      validatorRefs: ["src/lib/question-quality/validators/blank/inference.ts"],
      targetIssueCodes: ["blank-answer-residual-visible"],
      variant: index,
      validInput: base,
      defectInput: defect,
      evidence: [base.passage, defect.question.passageWithBlank],
    });
  }

  {
    const base = singleBlankBase(index, true);
    const defect = clone(base);
    defect.question.options[0].text = defect.question.originalExpression;
    addPair({
      familyId: "BLANK-PARAPHRASE-TRANSFORMED",
      group: "blank-structural",
      description:
        "PARAPHRASE blank mode transforms the correct option rather than copying the source span.",
      validatorRefs: [
        "src/lib/question-quality/validators/blank/inference.ts",
        "src/lib/question-quality/validators/blank/paraphrase.ts",
      ],
      targetIssueCodes: ["blank-paraphrase-answer-not-transformed"],
      variant: index,
      validInput: base,
      defectInput: defect,
      evidence: [base.question.originalExpression, base.question.options[0].text],
    });
  }

  {
    const base = multiBlankBase(index);
    const defect = clone(base);
    defect.question.blanks.pop();
    addPair({
      familyId: "BLANK-MULTI-COUNT",
      group: "blank-structural",
      description:
        "Multi-blank BLANK_INFERENCE carries the exact requested blank count.",
      validatorRefs: ["src/lib/question-quality/validators/blank/multi.ts"],
      targetIssueCodes: ["multi-blank-count"],
      variant: index,
      validInput: base,
      defectInput: defect,
      evidence: [base.passage, "The runtime request fixes the count at two."],
    });
  }

  {
    const base = multiBlankBase(index);
    const defect = clone(base);
    defect.question.options[4].blankValues.pop();
    addPair({
      familyId: "BLANK-MULTI-OPTION-ARITY",
      group: "blank-structural",
      description:
        "Every multi-blank option supplies one non-empty value per blank.",
      validatorRefs: ["src/lib/question-quality/validators/blank/multi.ts"],
      targetIssueCodes: ["multi-blank-option-values"],
      variant: index,
      validInput: base,
      defectInput: defect,
      evidence: [base.passage, "The mutation removes one value from option 5."],
    });
  }

  {
    const base = multiBlankBase(index);
    const defect = clone(base);
    defect.question.options[0].blankValues[1] =
      "accepts the first explanation";
    defect.question.options[0].text =
      "separates observation from interpretation / accepts the first explanation";
    addPair({
      familyId: "BLANK-MULTI-CORRECT-PAIR",
      group: "blank-structural",
      description:
        "The keyed source-exact multi-blank option restores all original expressions in order.",
      validatorRefs: ["src/lib/question-quality/validators/blank/multi.ts"],
      targetIssueCodes: ["multi-blank-correct-option-mismatch"],
      variant: index,
      validInput: base,
      defectInput: defect,
      evidence: [base.passage, "The mutation changes only the keyed (B) value."],
    });
  }

  {
    const v = variantContext(index);
    const passage =
      "Careful teams compare independent evidence before revising a model. " +
      v.suffix;
    const base = {
      typeId: "FILL_BLANK_KEY",
      passage,
      question: {
        direction: "Complete the sentence with the key expression.",
        answer: "independent evidence",
        correctAnswer: "independent evidence",
        sentenceWithBlank:
          "Careful teams compare _____ before revising a model.",
        passageWithBlank:
          "Careful teams compare _____ before revising a model.",
        explanation: "The source sentence contains one answer-bearing span.",
        difficulty: "BASIC",
      },
    };
    const defect = clone(base);
    defect.question.passageWithBlank += " They also record _____.";
    addPair({
      familyId: "BLANK-FILL-KEY-SINGLE",
      group: "blank-structural",
      description: "FILL_BLANK_KEY renders exactly one blank for its single answer.",
      validatorRefs: ["src/lib/question-quality/validators/blank/fill-key.ts"],
      targetIssueCodes: ["fbk-multiple-blanks"],
      variant: index,
      validInput: base,
      defectInput: defect,
      evidence: [passage, base.question.sentenceWithBlank],
    });
  }
}

function grammarErrorBase(index) {
  const source =
    "The reports that the committee reviewed, which were based on interviews with residents, show how policies designed to reduce waste can gradually change habits, depending on whether local leaders explain them clearly.";
  return {
    typeId: "GRAMMAR_ERROR",
    passage: source + " " + variantContext(index).suffix,
    requestedDifficulty: "KILLER",
    grammarMarkerCount: 5,
    grammarAnswerCount: 1,
    question: {
      direction: "다음 글의 밑줄 친 부분 중 어법상 틀린 것은?",
      difficulty: "KILLER",
      passageWithMarkers:
        "The reports __(A) that__ the committee reviewed, __(B) which was__ based on interviews with residents, __(C) show__ how policies __(D) designed__ to reduce waste can gradually change habits, depending on __(E) whether__ local leaders explain them clearly.",
      markedExpressions: [
        {
          label: "A",
          expression: "that",
          isError: false,
          pointCode: "b",
          surroundingText: "reports that the committee reviewed",
        },
        {
          label: "B",
          expression: "which were",
          errorExpression: "which was",
          correction: "which were",
          isError: true,
          pointCode: "d",
          surroundingText:
            "reports that the committee reviewed, which were based on interviews",
        },
        {
          label: "C",
          expression: "show",
          isError: false,
          pointCode: "a",
          surroundingText: "The reports show how policies",
        },
        {
          label: "D",
          expression: "designed",
          isError: false,
          pointCode: "c",
          surroundingText: "policies designed to reduce waste",
        },
        {
          label: "E",
          expression: "whether",
          isError: false,
          pointCode: "j",
          surroundingText: "depending on whether local leaders explain them",
        },
      ],
      options: numberedOptions([
        "that",
        "which was",
        "show",
        "designed",
        "whether",
      ]).map((option, optionIndex) => ({
        ...option,
        label: String.fromCharCode(65 + optionIndex),
      })),
      correctAnswer: "B",
      correctAnswers: ["B"],
      wrongOptionExplanations: {
        A: "that can function as the object relative pronoun here.",
        C: "show agrees with the plural head reports.",
        D: "designed is a reduced modifier of policies.",
        E: "whether introduces the clause after depending on.",
      },
      explanation:
        "In (B), the displayed 'which was' is wrong because the antecedent is the plural noun reports; it should be 'which were'.",
    },
  };
}

function grammarComboBase(index) {
  const passage =
    "Writers develop a clear style by acknowledging that readers expect stable cues. This attention may be even more important online. Writers anticipate the absent reader's response. " +
    variantContext(index).suffix;
  return {
    typeId: "GRAMMAR_CHOICE_COMBO",
    passage,
    requestedDifficulty: "INTERMEDIATE",
    question: {
      direction: "Choose the grammatically correct combination.",
      difficulty: "INTERMEDIATE",
      passageWithMarkers:
        "Writers develop a clear style by acknowledging (A) [what / that] readers expect stable cues. This attention may be (B) [very / even] more important online. Writers anticipate the (C) [absently / absent] reader's response.",
      slots: [
        {
          label: "(A)",
          pointCode: "b",
          wrongExpression: "what",
          correctExpression: "that",
          surroundingText: "acknowledging that readers expect stable cues",
        },
        {
          label: "(B)",
          pointCode: "m",
          wrongExpression: "very",
          correctExpression: "even",
          surroundingText: "even more important online",
        },
        {
          label: "(C)",
          pointCode: "f",
          wrongExpression: "absently",
          correctExpression: "absent",
          surroundingText: "the absent reader's response",
        },
      ],
      options: [
        {
          label: "1",
          text: "what - even - absent",
          slotValues: ["what", "even", "absent"],
        },
        {
          label: "2",
          text: "what - very - absently",
          slotValues: ["what", "very", "absently"],
        },
        {
          label: "3",
          text: "that - even - absent",
          slotValues: ["that", "even", "absent"],
        },
        {
          label: "4",
          text: "that - very - absent",
          slotValues: ["that", "very", "absent"],
        },
        {
          label: "5",
          text: "that - even - absently",
          slotValues: ["that", "even", "absently"],
        },
      ],
      correctAnswer: "3",
      explanation:
        "(A) A complete noun-clause complement requires that, whereas what would add an unnecessary nominal element. (B) Even correctly intensifies the comparative. (C) Absent is the adjective modifying reader.",
      keyPoints: [
        "noun-clause complementizer",
        "comparative intensifier",
        "adjective modifier",
      ],
    },
  };
}

function grammarCorrectionBase(index) {
  const source =
    "The reports that the committee reviewed, which were based on interviews with residents, show how policies designed to reduce waste can change habits.";
  const displayed =
    "The reports that the committee reviewed, which was based on interviews with residents, show how policies designed to reduce waste can change habits.";
  return {
    typeId: "GRAMMAR_CORRECTION",
    passage: source + " " + variantContext(index).suffix,
    requestedDifficulty: "KILLER",
    grammarCorrectionErrorCount: 1,
    question: {
      direction:
        "다음 글의 밑줄 친 부분에서 어법상 틀린 부분을 찾아 바르게 고쳐 쓰시오.",
      difficulty: "KILLER",
      passageWithUnderline: "__" + displayed + "__",
      underlinedSegments: [
        {
          sourceText: source,
          displayedText: displayed,
          isError: true,
          errorPart: "which was",
          correctedPart: "which were",
        },
      ],
      errorPart: "which was",
      correctedPart: "which were",
      correctAnswer: "(A) which were",
      explanation:
        "The antecedent reports is plural, so the relative-clause verb must be which were.",
      keyPoints: ["relative clause", "plural antecedent", "agreement"],
    },
  };
}

function addGrammarFamilies(index) {
  {
    const base = grammarErrorBase(index);
    const defect = clone(base);
    defect.question.markedExpressions.pop();
    addPair({
      familyId: "GRAMMAR-MARKER-COUNT",
      group: "grammar-structural",
      description:
        "GRAMMAR_ERROR metadata carries the requested number of marked expressions.",
      validatorRefs: ["src/lib/question-quality/dispatcher.ts"],
      targetIssueCodes: ["grammar-marker-count"],
      variant: index,
      validInput: base,
      defectInput: defect,
      evidence: [base.passage, "The control metadata and render both carry A through E."],
    });
  }

  {
    const base = grammarErrorBase(index);
    const defect = clone(base);
    defect.question.markedExpressions[1].isError = false;
    addPair({
      familyId: "GRAMMAR-ERROR-COUNT",
      group: "grammar-structural",
      description:
        "GRAMMAR_ERROR carries exactly the requested number of error flags.",
      validatorRefs: ["src/lib/question-quality/dispatcher.ts"],
      targetIssueCodes: ["grammar-error-count"],
      variant: index,
      validInput: base,
      defectInput: defect,
      evidence: [base.passage, "The control has exactly one isError=true marker."],
    });
  }

  {
    const base = grammarErrorBase(index);
    const defect = clone(base);
    defect.question.correctAnswer = "C";
    defect.question.correctAnswers = ["C"];
    addPair({
      familyId: "GRAMMAR-ANSWER-LABELS",
      group: "grammar-structural",
      description:
        "GRAMMAR_ERROR answer labels exactly match the isError label set.",
      validatorRefs: ["src/lib/question-quality/dispatcher.ts"],
      targetIssueCodes: ["grammar-correct-answer-labels"],
      variant: index,
      validInput: base,
      defectInput: defect,
      evidence: [base.passage, "Only marker B is mutated in the student surface."],
    });
  }

  {
    const base = grammarComboBase(index);
    const defect = clone(base);
    defect.question.slots.pop();
    addPair({
      familyId: "GRAMMAR-COMBO-SLOT-COUNT",
      group: "grammar-structural",
      description:
        "GRAMMAR_CHOICE_COMBO carries exactly three declared choice slots.",
      validatorRefs: ["src/lib/question-quality/validators/grammar/combo.ts"],
      targetIssueCodes: ["combo-slot-count"],
      variant: index,
      validInput: base,
      defectInput: defect,
      evidence: [base.passage, "The control declares (A), (B), and (C)."],
    });
  }

  {
    const base = grammarComboBase(index);
    const defect = clone(base);
    defect.question.slots[0].wrongExpression = "that";
    addPair({
      familyId: "GRAMMAR-COMBO-MUTATION",
      group: "grammar-structural",
      description:
        "Each grammar-combo slot offers distinct correct and intentionally wrong candidates.",
      validatorRefs: ["src/lib/question-quality/validators/grammar/combo.ts"],
      targetIssueCodes: ["combo-slot-not-mutated"],
      variant: index,
      validInput: base,
      defectInput: defect,
      evidence: [base.passage, "The mutation makes slot A's two candidates identical."],
    });
  }

  {
    const base = grammarCorrectionBase(index);
    const defect = clone(base);
    const segment = defect.question.underlinedSegments[0];
    segment.errorPart = "which were";
    segment.displayedText = segment.sourceText;
    defect.question.errorPart = "which were";
    defect.question.passageWithUnderline = "__" + segment.sourceText + "__";
    addPair({
      familyId: "GRAMMAR-CORRECTION-MUTATION",
      group: "grammar-structural",
      description:
        "GRAMMAR_CORRECTION student text actually differs from the source correction.",
      validatorRefs: [
        "src/lib/question-quality/validators/grammar/correction.ts",
      ],
      targetIssueCodes: [
        "grammar-correction-not-mutated",
        "grammar-correction-displayed-not-mutated",
      ],
      variant: index,
      validInput: base,
      defectInput: defect,
      evidence: [base.passage, "The mutation restores the source form on the student surface."],
    });
  }

  {
    const base = grammarCorrectionBase(index);
    const defect = clone(base);
    defect.question.correctAnswer = "(A) that";
    addPair({
      familyId: "GRAMMAR-CORRECTION-ANSWER",
      group: "grammar-structural",
      description:
        "GRAMMAR_CORRECTION answer text equals each label and correctedPart in order.",
      validatorRefs: [
        "src/lib/question-quality/validators/grammar/correction.ts",
      ],
      targetIssueCodes: ["grammar-correction-answer-mismatch"],
      variant: index,
      validInput: base,
      defectInput: defect,
      evidence: [base.passage, "The source-backed correction is which were."],
    });
  }
}

function vocabBase(index) {
  const passage =
    "Reviewers reconstruct the sequence, assess significant evidence, choose the easier check, confirm the presence of cues, and demonstrate mastery. " +
    variantContext(index).suffix;
  return {
    typeId: "VOCAB_CHOICE",
    passage,
    vocabChoiceMarkerCount: 5,
    vocabChoiceAnswerCount: 1,
    question: {
      direction:
        "다음 글의 밑줄 친 부분 중, 문맥상 낱말의 쓰임이 적절하지 않은 것은?",
      markedWords: [
        {
          label: "(a)",
          originalWord: "reconstruct",
          isInappropriate: false,
          surroundingText: "Reviewers reconstruct the sequence",
        },
        {
          label: "(b)",
          originalWord: "significant",
          isInappropriate: false,
          surroundingText: "assess significant evidence",
        },
        {
          label: "(c)",
          originalWord: "easier",
          isInappropriate: false,
          surroundingText: "choose the easier check",
        },
        {
          label: "(d)",
          originalWord: "presence",
          substituteWord: "absence",
          betterWord: "presence",
          isInappropriate: true,
          surroundingText: "confirm the presence of cues",
        },
        {
          label: "(e)",
          originalWord: "mastery",
          isInappropriate: false,
          surroundingText: "demonstrate mastery",
        },
      ],
      passageWithMarkers:
        "Reviewers __(a) reconstruct__ the sequence, assess __(b) significant__ evidence, choose the __(c) easier__ check, confirm the __(d) absence__ of cues, and demonstrate __(e) mastery__.",
      options: numberedOptions([
        "reconstruct",
        "significant",
        "easier",
        "absence",
        "mastery",
      ]),
      correctAnswer: "4",
      explanation:
        "The context requires the presence of cues, so absence is inappropriate.",
      difficulty: "INTERMEDIATE",
    },
  };
}

function antonymBase(index) {
  const passage =
    "Officials accepted the proposal, expanded the program, strengthened the rule, increased the budget, and protected workers during the crisis. " +
    variantContext(index).suffix;
  return {
    typeId: "ANTONYM",
    passage,
    antonymPairCount: 5,
    question: {
      direction:
        "지문의 밑줄 친 단어와 짝 단어의 반의어 관계가 바르지 않은 것은?",
      markedWords: [
        {
          label: "(A)",
          word: "accepted",
          antonym: "rejected",
          isIncorrectPair: false,
        },
        {
          label: "(B)",
          word: "expanded",
          antonym: "contracted",
          isIncorrectPair: false,
        },
        {
          label: "(C)",
          word: "strengthened",
          antonym: "weakened",
          isIncorrectPair: false,
        },
        {
          label: "(D)",
          word: "increased",
          antonym: "raised",
          isIncorrectPair: true,
          correctAntonym: "decreased",
        },
        {
          label: "(E)",
          word: "protected",
          antonym: "exposed",
          isIncorrectPair: false,
        },
      ],
      passageWithMarkers:
        "Officials __(A) accepted__ the proposal, __(B) expanded__ the program, __(C) strengthened__ the rule, __(D) increased__ the budget, and __(E) protected__ workers during the crisis.",
      options: numberedOptions([
        "(A) accepted - rejected",
        "(B) expanded - contracted",
        "(C) strengthened - weakened",
        "(D) increased - raised",
        "(E) protected - exposed",
      ]),
      correctAnswer: "4",
      explanation:
        "The antonym of increased is decreased; raised is close in meaning.",
      wrongOptionExplanations: {
        "1": "Accepted and rejected form a direct opposition.",
        "2": "Expanded and contracted form a direct opposition.",
        "3": "Strengthened and weakened form a direct opposition.",
        "5": "Protected and exposed form a direct opposition.",
      },
      difficulty: "INTERMEDIATE",
    },
  };
}

function impliedBase(index) {
  const passage =
    "A serious solution must move upstream as well as downstream toward real change. " +
    "Downstream actions treat visible symptoms, but upstream changes address the causes that shape those symptoms. " +
    "The point is not merely to react quickly but to understand the source of the problem. " +
    variantContext(index).suffix;
  const target = "move upstream as well as downstream";
  return {
    typeId: "IMPLIED_MEANING",
    passage,
    requestedDifficulty: "INTERMEDIATE",
    question: {
      direction:
        "다음 글에서 밑줄 친 부분이 함축 의미하는 바로 가장 적절한 것은?",
      underlinedExpression: target,
      passageWithUnderline: passage.replace(target, "__" + target + "__"),
      surfaceMeaning: "It literally describes movement in two river directions.",
      impliedMeaning:
        "A solution should address both visible symptoms and underlying causes.",
      reasoningGap:
        "Upstream represents causes and downstream represents visible symptoms, so both levels matter.",
      evidenceChain: [
        "The second sentence links downstream action to visible symptoms.",
        "The same sentence links upstream change to underlying causes.",
      ],
      options: numberedOptions([
        "addressing both symptoms and underlying causes",
        "reacting quickly to every visible symptom",
        "avoiding the causes behind the problem",
        "moving physically along a river system",
        "choosing speed over careful understanding",
      ]),
      correctAnswer: "1",
      wrongOptionExplanations: {
        "2": "It omits the causal level.",
        "3": "It reverses the passage's position.",
        "4": "It reads the metaphor literally.",
        "5": "It contradicts the final sentence.",
      },
      explanation:
        "The river image distinguishes surface symptoms from the causes beneath them.",
      difficulty: "INTERMEDIATE",
    },
  };
}

function summaryMcBase(index) {
  return {
    typeId: "SUMMARY_COMPLETE_MC",
    passage:
      "Careful teams compare independent measurements before making a decision. " +
      "This practice reduces the risk that one noisy result will determine the outcome. " +
      variantContext(index).suffix,
    requestedDifficulty: "INTERMEDIATE",
    question: {
      direction:
        "다음 글의 내용을 한 문장으로 요약하고자 한다. 빈칸 (A), (B)에 들어갈 말로 가장 적절한 것은?",
      summaryWithBlanks:
        "Teams can make more (A) decisions by comparing measurements, thereby reducing their reliance on (B) results.",
      blanks: [
        { label: "(A)", answer: "reliable" },
        { label: "(B)", answer: "noisy" },
      ],
      options: [
        {
          label: "1",
          text: "reliable / noisy",
          blankA: "reliable",
          blankB: "noisy",
        },
        {
          label: "2",
          text: "reliable / consistent",
          blankA: "reliable",
          blankB: "consistent",
        },
        {
          label: "3",
          text: "hasty / noisy",
          blankA: "hasty",
          blankB: "noisy",
        },
        {
          label: "4",
          text: "hasty / consistent",
          blankA: "hasty",
          blankB: "consistent",
        },
        {
          label: "5",
          text: "random / stable",
          blankA: "random",
          blankB: "stable",
        },
      ],
      correctAnswer: "1",
      explanation:
        "Independent measurements support reliable decisions and reduce reliance on noisy results.",
      difficulty: "INTERMEDIATE",
    },
  };
}

function topicBase(index) {
  return {
    typeId: "TOPIC",
    passage:
      "Independent checks make public conclusions more reliable. " +
      variantContext(index).suffix,
    stemLanguage: "ko",
    optionLanguage: "en",
    question: {
      direction: "다음 글의 주제로 가장 적절한 것은?",
      options: numberedOptions([
        "the value of independent checks for reliable conclusions",
        "the benefits of relying on one noisy result",
        "the disappearance of all public records",
        "the danger of comparing different sources",
        "the need to avoid revising any claim",
      ]),
      correctAnswer: "1",
      explanation:
        "The source emphasizes independent checks and reliable conclusions.",
      difficulty: "BASIC",
    },
  };
}

function addSpecializedFamilies(index) {
  {
    const base = vocabBase(index);
    const defect = clone(base);
    defect.question.markedWords.pop();
    addPair({
      familyId: "VOCAB-MARKER-COUNT",
      group: "specialized-structural",
      description:
        "VOCAB_CHOICE metadata contains the configured number of source-anchored words.",
      validatorRefs: ["src/lib/question-quality/validators/vocab.ts"],
      targetIssueCodes: ["vocab-marker-count"],
      variant: index,
      validInput: base,
      defectInput: defect,
      evidence: [base.passage, "The control anchors five source words."],
    });
  }

  {
    const base = antonymBase(index);
    const defect = clone(base);
    defect.question.markedWords.pop();
    addPair({
      familyId: "ANTONYM-MARKER-COUNT",
      group: "specialized-structural",
      description:
        "ANTONYM metadata contains the configured number of source-anchored pairs.",
      validatorRefs: ["src/lib/question-quality/validators/antonym.ts"],
      targetIssueCodes: ["antonym-marker-count"],
      variant: index,
      validInput: base,
      defectInput: defect,
      evidence: [base.passage, "The control anchors five marked source words."],
    });
  }

  {
    const base = impliedBase(index);
    const defect = clone(base);
    defect.question.passageWithUnderline = defect.passage;
    addPair({
      familyId: "IMPLIED-UNDERLINE-PRESENCE",
      group: "specialized-structural",
      description:
        "IMPLIED_MEANING renders exactly one underline for its declared target.",
      validatorRefs: ["src/lib/question-quality/validators/implied.ts"],
      targetIssueCodes: ["implied-meaning-missing-underline"],
      variant: index,
      validInput: base,
      defectInput: defect,
      evidence: [base.passage, base.question.underlinedExpression],
    });
  }

  {
    const base = summaryMcBase(index);
    const defect = clone(base);
    defect.question.summaryWithBlanks =
      "Teams can make more (A) decisions by comparing measurements and reducing noisy results.";
    addPair({
      familyId: "SUMMARY-MC-MARKERS",
      group: "specialized-structural",
      description:
        "SUMMARY_COMPLETE_MC renders each declared blank label exactly once.",
      validatorRefs: ["src/lib/question-quality/validators/summary/mc.ts"],
      targetIssueCodes: ["summary-mc-blank-marker-count"],
      variant: index,
      validInput: base,
      defectInput: defect,
      evidence: [base.passage, "The mutation removes the declared (B) marker."],
    });
  }

  {
    const v = variantContext(index);
    const base = {
      typeId: "SUMMARY_COMPLETE",
      question: {
        direction: "Complete the summary.",
        summaryWithBlanks:
          "Careful comparison produces more (A) decisions in " + v.topic + ".",
        blanks: [{ label: "(A)", answer: "reliable" }],
        explanation: "The blank completes the source-grounded summary.",
        difficulty: "BASIC",
      },
    };
    const defect = clone(base);
    defect.question.summaryWithBlanks =
      "Careful comparison produces more dependable decisions in " + v.topic + ".";
    addPair({
      familyId: "SUMMARY-SHORT-MARKERS",
      group: "specialized-structural",
      description:
        "SUMMARY_COMPLETE renders each declared blank label exactly once.",
      validatorRefs: [
        "src/lib/question-quality/validators/summary/complete.ts",
      ],
      targetIssueCodes: ["summary-complete-blank-marker-count"],
      variant: index,
      validInput: base,
      defectInput: defect,
      evidence: [base.question.summaryWithBlanks, "The mutation removes (A)."],
    });
  }

  {
    const base = topicBase(index);
    const defect = clone(base);
    defect.question.options[3].text = "서로 다른 근거를 비교하는 일의 가치";
    addPair({
      familyId: "TOPIC-OPTION-LANGUAGE",
      group: "specialized-structural",
      description:
        "TOPIC option text obeys the explicitly requested English language setting.",
      validatorRefs: ["src/lib/question-quality/validators/topic.ts"],
      targetIssueCodes: ["topic-option-language"],
      variant: index,
      validInput: base,
      defectInput: defect,
      evidence: [base.passage, "The mutation inserts Hangul into one English option."],
    });
  }
}

function koBase(index) {
  const suffix = [
    "이 연구는 여름 관측 자료를 바탕으로 한다.",
    "이 설명은 공공 기록의 보존 사례를 다룬다.",
    "이 조사는 해안 지역의 관측 결과를 다룬다.",
  ][index];
  const source = [
    "도시의 나무는 여름철 그늘을 제공한다.",
    "잎의 증산 작용은 주변 온도를 낮추는 데 도움을 준다.",
    "그러나 물이 부족하면 이런 냉각 효과가 줄어든다.",
    "관리자는 토양 수분과 수종의 특성을 함께 고려해야 한다.",
    "다양한 수종을 심으면 병해충 위험을 분산할 수 있다.",
    suffix,
  ];
  const passage = source.join(" ");
  return {
    typeId: "KO_RD_FACT",
    passage,
    requestedDifficulty: "INTERMEDIATE",
    question: {
      direction: "윗글의 내용과 일치하지 않는 것은?",
      stemPolarity: "NEGATIVE",
      distortionPrinciple: "AGENT_SWAP",
      koContext: { examMode: "SUNEUNG", passageKind: "READING_SCI" },
      options: [
        { label: "①", text: "도시의 나무는 여름에 그늘을 제공한다." },
        { label: "②", text: "잎의 증산 작용은 주변 온도를 낮추는 데 기여한다." },
        { label: "③", text: "물이 부족할수록 나무의 냉각 효과가 커진다." },
        { label: "④", text: "관리자는 토양 수분과 수종 특성을 함께 살펴야 한다." },
        { label: "⑤", text: "다양한 수종은 병해충 위험을 분산하는 데 도움이 된다." },
      ],
      correctAnswer: "③",
      evidence: [
        { optionLabel: "①", spanText: source[0], relation: "SUPPORTS" },
        { optionLabel: "②", spanText: source[1], relation: "SUPPORTS" },
        { optionLabel: "③", spanText: source[2], relation: "CONTRADICTS" },
        { optionLabel: "④", spanText: source[3], relation: "SUPPORTS" },
        { optionLabel: "⑤", spanText: source[4], relation: "SUPPORTS" },
      ],
      explanation:
        "물이 부족하면 냉각 효과가 줄어든다고 했으므로 세 번째 선지는 글과 일치하지 않는다.",
      difficulty: "INTERMEDIATE",
    },
  };
}

function addKoFamilies(index) {
  {
    const base = koBase(index);
    const defect = clone(base);
    defect.question.options.pop();
    addPair({
      familyId: "KO-OPTION-COUNT",
      group: "korean-structural",
      description: "A Korean MC5 envelope carries labels ① through ⑤.",
      validatorRefs: ["src/lib/korean/quality/common.ts"],
      targetIssueCodes: ["ko-option-count"],
      variant: index,
      validInput: base,
      defectInput: defect,
      scope: "KO",
      evidence: [base.passage, "The control has a complete ①~⑤ envelope."],
    });
  }

  {
    const base = koBase(index);
    const defect = clone(base);
    defect.question.evidence.pop();
    addPair({
      familyId: "KO-EVIDENCE-COVERAGE",
      group: "korean-structural",
      description: "Every Korean MC5 option has at least one evidence anchor.",
      validatorRefs: ["src/lib/korean/quality/common.ts"],
      targetIssueCodes: ["ko-evidence-missing"],
      variant: index,
      validInput: base,
      defectInput: defect,
      scope: "KO",
      evidence: [base.passage, "The mutation removes only the ⑤ evidence entry."],
    });
  }

  {
    const base = koBase(index);
    const defect = clone(base);
    defect.question.evidence[1].spanText = "지문에 존재하지 않는 합성 근거 문장";
    addPair({
      familyId: "KO-EVIDENCE-SURFACE",
      group: "korean-structural",
      description:
        "Korean evidence anchors occur verbatim on a student-visible source surface.",
      validatorRefs: ["src/lib/korean/quality/common.ts"],
      targetIssueCodes: ["ko-evidence-not-in-passage"],
      variant: index,
      validInput: base,
      defectInput: defect,
      scope: "KO",
      evidence: [base.passage, defect.question.evidence[1].spanText],
    });
  }

  {
    const base = koBase(index);
    const defect = clone(base);
    defect.question.correctAnswer = "3";
    addPair({
      familyId: "KO-ANSWER-LABEL",
      group: "korean-structural",
      description: "A Korean MC5 correct answer uses a ①~⑤ label.",
      validatorRefs: ["src/lib/korean/quality/common.ts"],
      targetIssueCodes: ["ko-correct-answer-invalid"],
      variant: index,
      validInput: base,
      defectInput: defect,
      scope: "KO",
      evidence: [base.passage, "The mutation uses ASCII 3 instead of ③."],
    });
  }

  {
    const base = koBase(index);
    const defect = clone(base);
    defect.question.options[3].text =
      "도시는 '없는 인용문'을 기준으로 수종을 정한다.";
    addPair({
      familyId: "KO-QUOTE-VERBATIM",
      group: "korean-structural",
      description:
        "A Korean option's quoted source phrase exists verbatim on a visible source surface.",
      validatorRefs: ["src/lib/korean/quality/common.ts"],
      targetIssueCodes: ["ko-quote-not-verbatim"],
      variant: index,
      validInput: base,
      defectInput: defect,
      scope: "KO",
      evidence: [base.passage, "The quoted mutation does not occur in the passage."],
    });
  }

  {
    const base = genericTitle(index);
    base.question.evidence = [];
    const defect = clone(base);
    defect.typeId = "KO_RD_FACT";
    addPair({
      familyId: "SCOPE-EN-SKIPS-KO",
      group: "language-scope-boundary",
      description:
        "KO evidence enforcement is dispatched only for registered Korean question types.",
      validatorRefs: [
        "src/lib/question-quality/dispatcher.ts",
        "src/lib/korean/quality/dispatch.ts",
        "src/lib/korean/quality/common.ts",
      ],
      targetIssueCodes: ["ko-evidence-missing"],
      variant: index,
      validInput: base,
      defectInput: defect,
      scope: "EN/KO-boundary",
      evidence: [
        base.passage,
        "The paired inputs differ at the registered type boundary, while evidence stays empty.",
      ],
    });
  }

  {
    const base = koBase(index);
    base.question.blanks = [{ label: "(A)", answer: "cooling" }];
    base.question.passageWithBlank = "Synthetic _____ carrier.";
    const defect = clone(base);
    defect.typeId = "TITLE";
    addPair({
      familyId: "SCOPE-KO-SKIPS-EN-SIGNATURE",
      group: "language-scope-boundary",
      description:
        "English TITLE foreign-field enforcement does not leak into registered Korean types.",
      validatorRefs: [
        "src/lib/question-quality/dispatcher.ts",
        "src/lib/question-quality/validators/misc.ts",
        "src/lib/korean/quality/dispatch.ts",
      ],
      targetIssueCodes: ["type-foreign-field"],
      variant: index,
      validInput: base,
      defectInput: defect,
      scope: "KO/EN-boundary",
      evidence: [
        base.passage,
        "The same foreign field is harmless in KO_RD_FACT and forbidden in TITLE.",
      ],
    });
  }
}

for (let variant = 0; variant < 3; variant += 1) {
  addGenericFamilies(variant);
  addEnglishStructuralFamilies(variant);
  addBlankFamilies(variant);
  addGrammarFamilies(variant);
  addSpecializedFamilies(variant);
  addKoFamilies(variant);
}

const corpus = {
  schemaVersion: 1,
  auditId: "deterministic-structural-reaudit-v11-fresh",
  constructionPolicy: {
    sourceAware: true,
    syntheticOnly: true,
    pairedMinimalMutations: true,
    validatorResultsObservedDuringConstruction: false,
    networkCalls: 0,
    apiCalls: 0,
    databaseCalls: 0,
    generationCalls: 0,
    prohibitedData:
      "No production database passage, database identifier, credential, or secret.",
  },
  caseCount: cases.length,
  familyCount: familyManifest.length,
  families: familyManifest,
  cases,
};

const expectedValid = oracleEntries.filter((entry) => entry.expectedValid).length;
const expectedInvalid = oracleEntries.length - expectedValid;
const oracle = {
  schemaVersion: 1,
  auditId: corpus.auditId,
  caseCount: oracleEntries.length,
  classBalance: { expectedValid, expectedInvalid },
  entries: oracleEntries,
};

if (cases.length < 240) {
  throw new Error("Holdout must contain at least 240 cases.");
}
if (expectedValid !== expectedInvalid) {
  throw new Error("Holdout must be class-balanced.");
}
if (new Set(cases.map((item) => item.caseId)).size !== cases.length) {
  throw new Error("Duplicate caseId found.");
}
for (const family of familyManifest) {
  const familyCases = cases.filter((item) => item.familyId === family.familyId);
  if (familyCases.length !== 6) {
    throw new Error(
      "Each family must have three valid/defect pairs: " + family.familyId,
    );
  }
}

const corpusText = json(corpus);
const oracleText = json(oracle);
const builderText = readFileSync(fileURLToPath(import.meta.url));
const computedSeal = {
  schemaVersion: 1,
  auditId: corpus.auditId,
  chronology:
    "corpus-and-oracle-written-and-hashed-before-production-validator-execution",
  sealedOn: "2026-07-15",
  caseCount: cases.length,
  familyCount: familyManifest.length,
  classBalance: oracle.classBalance,
  sha256: {
    "build-corpus.mjs": sha256(builderText),
    "corpus.json": sha256(corpusText),
    "oracle.json": sha256(oracleText),
  },
};

if (existsSync(SEAL_PATH)) {
  const existingSeal = JSON.parse(readFileSync(SEAL_PATH, "utf8"));
  const onDiskCorpus = readFileSync(CORPUS_PATH, "utf8");
  const onDiskOracle = readFileSync(ORACLE_PATH, "utf8");
  const stable =
    sha256(onDiskCorpus) === existingSeal.sha256["corpus.json"] &&
    sha256(onDiskOracle) === existingSeal.sha256["oracle.json"] &&
    sha256(corpusText) === existingSeal.sha256["corpus.json"] &&
    sha256(oracleText) === existingSeal.sha256["oracle.json"];
  if (!stable) {
    throw new Error("Existing seal does not match deterministic rebuild.");
  }
  process.stdout.write(
    JSON.stringify({
      status: "already-sealed",
      caseCount: cases.length,
      familyCount: familyManifest.length,
      sha256: existingSeal.sha256,
    }) + "\n",
  );
} else {
  writeFileSync(CORPUS_PATH, corpusText, "utf8");
  writeFileSync(ORACLE_PATH, oracleText, "utf8");
  writeFileSync(SEAL_PATH, json(computedSeal), "utf8");
  process.stdout.write(
    JSON.stringify({
      status: "sealed",
      caseCount: cases.length,
      familyCount: familyManifest.length,
      classBalance: oracle.classBalance,
      sha256: computedSeal.sha256,
    }) + "\n",
  );
}
