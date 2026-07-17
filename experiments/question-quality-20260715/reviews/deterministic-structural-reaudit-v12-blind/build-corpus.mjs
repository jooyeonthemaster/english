import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const write = process.argv.includes("--write");

function clone(value) {
  return structuredClone(value);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function jsonBytes(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function options(texts = [
  "evidence from several independent observations",
  "a claim based on one vivid anecdote",
  "a conclusion formed before the comparison",
  "an assumption that ignores conflicting records",
  "a guess selected without checking the source",
]) {
  return texts.map((text, index) => ({ label: String(index + 1), text }));
}

const titleControl = {
  typeId: "TITLE",
  question: {
    direction: "Choose the most appropriate title for the passage.",
    difficulty: "INTERMEDIATE",
    options: options(),
    correctAnswer: "1",
    explanation: "The first option alone captures the passage's emphasis on comparing independent evidence.",
  },
  passage: "Reliable inquiry compares independent observations before accepting a conclusion, especially when a vivid example points in another direction.",
};

const wordAnswer = "Careful observers can compare several patterns before drawing conclusions";
const wordPassage =
  "Researchers examine varied evidence cautiously and postpone judgment until competing explanations have been tested.";
const wordControl = {
  typeId: "WORD_ORDER",
  question: {
    direction: "Arrange the given chunks to complete the sentence.",
    difficulty: "INTERMEDIATE",
    scrambledWords: [
      "before drawing conclusions",
      "Careful observers",
      "several patterns",
      "can compare",
    ],
    modelAnswer: wordAnswer,
    wordBankDistractors: [],
    explanation: "The subject precedes the modal predicate, and the temporal phrase closes the sentence.",
  },
  passage: wordPassage,
};

const fbkPassage = "The committee preserved idle capacity during winter.";
const fbkControl = {
  typeId: "FILL_BLANK_KEY",
  question: {
    direction: "Complete the sentence with the key expression.",
    sentenceWithBlank: "The committee preserved _____ during winter.",
    passageWithBlank: "The committee preserved _____ during winter.",
    answer: "idle capacity",
    correctAnswer: "idle capacity",
  },
  passage: fbkPassage,
};

const summaryControl = {
  typeId: "SUMMARY_COMPLETE",
  question: {
    direction: "Complete the summary.",
    summaryWithBlanks: "The experiment links careful comparison to (A).",
    blanks: [{ label: "(A)", answer: "reliable judgment" }],
    explanation: "The missing phrase names the result of comparing evidence carefully.",
  },
};

const soGiven =
  "Initial measurements looked inconsistent, so the research team examined the full record.";
const soA =
  "Finally, the team tested the emerging explanation with an independent sample collected several weeks later. The new measurements reproduced the same pattern and strengthened the original conclusion.";
const soB =
  "First, the analysts checked every sensor against a stable laboratory reference before interpreting the unusual readings. This calibration removed several small offsets that had accumulated during transport.";
const soC =
  "Next, they compared the corrected records across neighboring stations and separated shared trends from isolated noise. The regional pattern became visible only after this second comparison.";
const soPassage = [soGiven, soB, soC, soA].join(" ");
const soOptions = [
  "(A)-(B)-(C)",
  "(A)-(C)-(B)",
  "(B)-(A)-(C)",
  "(B)-(C)-(A)",
  "(C)-(B)-(A)",
].map((text, index) => ({ label: String(index + 1), text }));
const sentenceOrderControl = {
  typeId: "SENTENCE_ORDER",
  question: {
    direction: "Choose the most coherent order of the following paragraphs.",
    difficulty: "INTERMEDIATE",
    givenSentence: soGiven,
    paragraphs: [
      { label: "(A)", text: soA },
      { label: "(B)", text: soB },
      { label: "(C)", text: soC },
    ],
    options: soOptions,
    correctAnswer: "4",
    explanation: "Calibration comes first, regional comparison follows, and independent replication closes the account.",
  },
  passage: soPassage,
};

const multiPassage =
  "Careful teams compare multiple sources before drawing conclusions, and patient reviewers document every uncertainty before publishing results.";
const multiControl = {
  typeId: "BLANK_INFERENCE",
  blankInferenceBlankCount: 2,
  question: {
    direction: "Choose the pair that best completes both blanks.",
    difficulty: "INTERMEDIATE",
    blanks: [
      { label: "(A)", originalExpression: "compare multiple sources" },
      { label: "(B)", originalExpression: "document every uncertainty" },
    ],
    passageWithBlank:
      "Careful teams (A) _____ before drawing conclusions, and patient reviewers (B) _____ before publishing results.",
    options: [
      {
        label: "1",
        text: "compare multiple sources / document every uncertainty",
        blankValues: ["compare multiple sources", "document every uncertainty"],
      },
      {
        label: "2",
        text: "trust a single example / document every uncertainty",
        blankValues: ["trust a single example", "document every uncertainty"],
      },
      {
        label: "3",
        text: "compare multiple sources / conceal every uncertainty",
        blankValues: ["compare multiple sources", "conceal every uncertainty"],
      },
      {
        label: "4",
        text: "ignore conflicting reports / conceal every uncertainty",
        blankValues: ["ignore conflicting reports", "conceal every uncertainty"],
      },
      {
        label: "5",
        text: "follow the first impression / omit all limitations",
        blankValues: ["follow the first impression", "omit all limitations"],
      },
    ],
    correctAnswer: "1",
    explanation: "Both blanks preserve the passage's demand for comparison and transparent reporting.",
  },
  passage: multiPassage,
};

const blankPassage =
  "Students remember difficult material when they connect new facts to familiar experiences. The process creates durable associations and supports later recall.";
const blankControl = {
  typeId: "BLANK_INFERENCE",
  blankInferenceBlankCount: 1,
  question: {
    direction: "Choose the best expression for the blank.",
    difficulty: "INTERMEDIATE",
    originalExpression: "connect new facts to familiar experiences",
    passageWithBlank:
      "Students remember difficult material when they _____. The process creates durable associations and supports later recall.",
    options: [
      { label: "1", text: "connect new facts to familiar experiences" },
      { label: "2", text: "separate new facts from every known example" },
      { label: "3", text: "repeat isolated terms without any context" },
      { label: "4", text: "replace later recall with immediate guessing" },
      { label: "5", text: "ignore the associations that support memory" },
    ],
    correctAnswer: "1",
    explanation: "The next sentence identifies durable associations, which supports connecting new material with familiar experience.",
  },
  passage: blankPassage,
};

const grammarPassage =
  "The reports that the committee reviewed, which were based on interviews with residents, show how policies designed to reduce waste can gradually change habits, depending on whether local leaders explain them clearly.";
const grammarControl = {
  typeId: "GRAMMAR_ERROR",
  grammarMarkerCount: 5,
  grammarAnswerCount: 1,
  requestedDifficulty: "INTERMEDIATE",
  question: {
    direction: "Choose the grammatically incorrect underlined expression.",
    difficulty: "INTERMEDIATE",
    passageWithMarkers:
      "The reports __(A) that__ the committee reviewed, __(B) which was__ based on interviews with residents, __(C) show__ how policies __(D) designed__ to reduce waste can gradually change habits, depending on __(E) whether__ local leaders explain them clearly.",
    markedExpressions: [
      {
        label: "(A)",
        expression: "that",
        isError: false,
        pointCode: "b",
        surroundingText: "reports that the committee reviewed",
      },
      {
        label: "(B)",
        expression: "which were",
        errorExpression: "which was",
        correction: "which were",
        isError: true,
        pointCode: "d",
        surroundingText: "reports that the committee reviewed, which were based on interviews",
      },
      {
        label: "(C)",
        expression: "show",
        isError: false,
        pointCode: "a",
        surroundingText: "The reports that the committee reviewed show how policies",
      },
      {
        label: "(D)",
        expression: "designed",
        isError: false,
        pointCode: "c",
        surroundingText: "policies designed to reduce waste",
      },
      {
        label: "(E)",
        expression: "whether",
        isError: false,
        pointCode: "j",
        surroundingText: "depending on whether local leaders explain them clearly",
      },
    ],
    options: [
      { label: "A", text: "that" },
      { label: "B", text: "which was" },
      { label: "C", text: "show" },
      { label: "D", text: "designed" },
      { label: "E", text: "whether" },
    ],
    correctAnswer: "B",
    wrongOptionExplanations: {
      A: "The relative marker introduces the object gap after reviewed.",
      C: "The plural head reports licenses the plural predicate show.",
      D: "Designed is a reduced passive modifier of policies.",
      E: "Whether correctly introduces the embedded alternative after depending on.",
    },
    explanation:
      "In (B), the displayed form which was is wrong because the antecedent reports is plural; the source-backed correction is which were.",
    keyPoints: [
      "(B) 복수 선행사 reports와 수 일치",
      "(A) 관계대명사 that이 이끄는 불완전한 절",
      "(C) 정동사 show의 문장 내 위치",
    ],
  },
  passage: grammarPassage,
};

const correctionSource =
  "The reports that the committee reviewed, which were based on interviews with residents, show how policies designed to reduce waste can change habits.";
const correctionControl = {
  typeId: "GRAMMAR_CORRECTION",
  grammarCorrectionErrorCount: 1,
  requestedDifficulty: "INTERMEDIATE",
  question: {
    direction: "Correct the grammatical error in the underlined sentence.",
    difficulty: "INTERMEDIATE",
    passageWithUnderline:
      "__The reports that the committee reviewed, which was based on interviews with residents, show how policies designed to reduce waste can change habits.__",
    underlinedSegments: [
      {
        sourceText: correctionSource,
        displayedText:
          "The reports that the committee reviewed, which was based on interviews with residents, show how policies designed to reduce waste can change habits.",
        isError: true,
        errorPart: "which was",
        correctedPart: "which were",
      },
    ],
    errorPart: "which was",
    correctedPart: "which were",
    correctAnswer: "(A) which were",
    explanation: "The plural antecedent reports requires the plural verb were in the relative clause.",
    keyPoints: ["relative clause", "plural antecedent", "agreement"],
  },
  passage: correctionSource,
};

const siS0 = "The market opened before sunrise in the old town.";
const siS1 = "Merchants arranged their goods in careful rows along the square.";
const siGiven = "However, the fish sellers claimed the busiest corner for themselves.";
const siS3 = "Their stalls drew the largest crowds of the whole morning.";
const siS4 = "By noon most of the goods were already gone from the tables.";
const siS5 = "The last visitors left the square as the evening bells rang.";
const siPassage = [siS0, siS1, siGiven, siS3, siS4, siS5].join(" ");
const siMarked = `${siS0} ① ${siS1} ② ${siS3} ③ ${siS4} ④ ${siS5} ⑤`;
const sentenceInsertControl = {
  typeId: "SENTENCE_INSERT",
  sentenceInsertSlotCount: 5,
  requestedDifficulty: "INTERMEDIATE",
  question: {
    direction: "Choose the best place to insert the given sentence.",
    difficulty: "INTERMEDIATE",
    givenSentence: siGiven,
    sourceSentenceToOmit: siGiven,
    omittedSourceSentence: siGiven,
    markerAfterSentenceIndices: [0, 1, 3, 4, 5],
    passageWithMarkers: siMarked,
    options: ["①", "②", "③", "④", "⑤"].map((text, index) => ({
      label: String(index + 1),
      text,
    })),
    correctAnswer: "2",
    explanation: "The contrastive sentence belongs at gap ②, where their stalls can refer to the fish sellers' stalls.",
    wrongOptionExplanations: {
      1: "The contrast has not been prepared yet.",
      3: "Their stalls would precede its antecedent.",
      4: "The market sequence has already advanced to noon.",
      5: "The closing sentence leaves no continuation for the stall reference.",
    },
  },
  passage: siPassage,
};

const families = [];

function addFamily(id, targetCode, controlInput, mutate, sourceKind) {
  const defectInput = clone(controlInput);
  mutate(defectInput);
  families.push({
    id,
    targetCode,
    sourceKind,
    productionExpectation: "blocking-error",
    controlInput: clone(controlInput),
    defectInput,
  });
}

// Generic option and type-signature contracts.
addFamily("generic-option-count", "option-count", titleControl, (x) => x.question.options.pop(), "generic-mc");
addFamily("generic-duplicate-label", "duplicate-option-label", titleControl, (x) => {
  x.question.options[4].label = "4";
}, "generic-mc");
addFamily("generic-duplicate-text", "duplicate-option-text", titleControl, (x) => {
  x.question.options[4].text = x.question.options[3].text;
}, "generic-mc");
addFamily("generic-empty-text", "empty-option-text", titleControl, (x) => {
  x.question.options[2].text = "";
}, "generic-mc");
addFamily("generic-answer-mismatch", "correct-answer-mismatch", titleControl, (x) => {
  x.question.correctAnswer = "9";
}, "generic-mc");
addFamily("generic-answer-count", "generic-answer-count", {
  ...clone(titleControl),
  genericAnswerCount: 2,
  question: { ...clone(titleControl.question), direction: "Choose all options that apply." },
}, () => {}, "generic-mc");
// The control for the preceding family must actually carry two answers; defect drops one.
families.at(-1).controlInput.question.correctAnswer = "1, 2";
families.at(-1).defectInput.question.correctAnswer = "1";
addFamily("generic-multi-direction", "generic-multi-answer-direction", {
  ...clone(titleControl),
  genericAnswerCount: 2,
  question: { ...clone(titleControl.question), correctAnswer: "1, 2", direction: "Choose all options that apply." },
}, (x) => {
  x.question.direction = "Choose the single best option.";
}, "generic-mc");
addFamily("generic-foreign-field", "type-foreign-field", titleControl, (x) => {
  x.question.passageWithBlank = "A foreign blank field should not appear here _____.";
}, "generic-mc");

// WORD_ORDER: controls are reconstructable, strongly shuffled, and not copied from the source passage.
addFamily("word-punctuation-chip", "punctuation-only-chunk", wordControl, (x) => {
  x.question.scrambledWords.push(".");
}, "word-order");
addFamily("word-already-solved", "scrambled-already-solved", wordControl, (x) => {
  x.question.scrambledWords = [x.question.modelAnswer];
}, "word-order");
addFamily("word-near-order", "scrambled-near-answer-order", wordControl, (x) => {
  x.question.scrambledWords = [
    "Careful",
    "observers",
    "can compare",
    "several patterns",
    "drawing conclusions",
    "before",
  ];
}, "word-order");
addFamily("word-unreconstructable", "word-order-unreconstructable", wordControl, (x) => {
  x.question.scrambledWords = x.question.scrambledWords.map((chip) => chip.replace("several ", ""));
}, "word-order");
addFamily("word-source-copy", "writing-answer-verbatim-copy", wordControl, (x) => {
  x.passage = `${x.question.modelAnswer}. A second sentence supplies context for the task.`;
}, "word-order");

// FILL_BLANK_KEY.
addFamily("fbk-missing-marker", "fbk-missing-blank-marker", fbkControl, (x) => {
  x.question.sentenceWithBlank = "The committee preserved idle capacity during winter.";
  x.question.passageWithBlank = x.question.sentenceWithBlank;
}, "fill-blank-key");
addFamily("fbk-multiple", "fbk-multiple-blanks", fbkControl, (x) => {
  x.question.sentenceWithBlank = "The committee preserved _____ during _____ winter.";
  x.question.passageWithBlank = x.question.sentenceWithBlank;
}, "fill-blank-key");
addFamily("fbk-residual", "fbk-answer-residual-leak", fbkControl, (x) => {
  x.question.sentenceWithBlank = "The committee preserved _____ because idle capacity mattered during winter.";
  x.question.passageWithBlank = x.question.sentenceWithBlank;
  delete x.passage;
}, "fill-blank-key");
addFamily("fbk-frame", "fbk-frame-altered", fbkControl, (x) => {
  x.question.sentenceWithBlank = "The committee carefully preserved _____ during winter.";
  x.question.passageWithBlank = x.question.sentenceWithBlank;
}, "fill-blank-key");

// SUMMARY_COMPLETE.
addFamily("summary-missing", "summary-complete-missing-summary", summaryControl, (x) => {
  x.question.summaryWithBlanks = "";
}, "summary-complete");
addFamily("summary-marker", "summary-complete-blank-marker-count", summaryControl, (x) => {
  x.question.summaryWithBlanks = "The experiment links (A) comparison to (A).";
}, "summary-complete");
addFamily("summary-answer", "summary-complete-missing-blank-answer", summaryControl, (x) => {
  delete x.question.blanks[0].answer;
}, "summary-complete");
addFamily("summary-language", "summary-complete-answer-language", summaryControl, (x) => {
  x.question.blanks[0].answer = "신뢰 판단";
}, "summary-complete");
addFamily("summary-leak", "summary-complete-answer-leaks-in-summary", summaryControl, (x) => {
  x.question.summaryWithBlanks = "The experiment links reliable judgment to (A).";
}, "summary-complete");

// SENTENCE_ORDER. Every unmutated control has three source-backed 2-sentence blocks of >=24 words.
addFamily("order-missing-given", "sentence-order-missing-given", sentenceOrderControl, (x) => {
  x.question.givenSentence = "";
}, "sentence-order");
addFamily("order-given-label", "sentence-order-given-contains-paragraph-label", sentenceOrderControl, (x) => {
  x.question.givenSentence = `${x.question.givenSentence} (A)`;
}, "sentence-order");
addFamily("order-paragraph-count", "sentence-order-paragraph-count", sentenceOrderControl, (x) => {
  x.question.paragraphs.pop();
}, "sentence-order");
addFamily("order-empty", "sentence-order-empty-paragraph", sentenceOrderControl, (x) => {
  x.question.paragraphs[0].text = "";
}, "sentence-order");
addFamily("order-body-label", "sentence-order-paragraph-body-label", sentenceOrderControl, (x) => {
  const old = x.question.paragraphs[0].text;
  x.question.paragraphs[0].text = `(A) ${old}`;
  x.passage = x.passage.replace(old, x.question.paragraphs[0].text);
}, "sentence-order");
addFamily("order-dependent-fragment", "sentence-order-dependent-fragment", sentenceOrderControl, (x) => {
  const old = x.question.paragraphs[0].text;
  const replacement =
    "Because the independent sample confirmed the shared pattern. The new measurements reproduced the same regional trend and strengthened the original conclusion for every reviewer involved.";
  x.question.paragraphs[0].text = replacement;
  x.passage = x.passage.replace(old, replacement);
}, "sentence-order");
addFamily("order-labels", "sentence-order-paragraph-labels", sentenceOrderControl, (x) => {
  x.question.paragraphs[1].label = "[B]";
}, "sentence-order");
addFamily("order-too-short", "sentence-order-paragraph-too-short", sentenceOrderControl, (x) => {
  const old = x.question.paragraphs[2].text;
  const replacement =
    "Next, the researchers compared corrected records across neighboring stations and carefully separated shared regional trends from isolated measurement noise before they accepted any explanation.";
  x.question.paragraphs[2].text = replacement;
  x.passage = x.passage.replace(old, replacement);
}, "sentence-order");
addFamily("order-too-thin", "sentence-order-paragraph-too-thin", sentenceOrderControl, (x) => {
  const old = x.question.paragraphs[2].text;
  const replacement = "Next, they compared the records. The regional pattern then became visible.";
  x.question.paragraphs[2].text = replacement;
  x.passage = x.passage.replace(old, replacement);
}, "sentence-order");
addFamily("order-option-shape", "sentence-order-option-permutation", sentenceOrderControl, (x) => {
  x.question.options[0].text = "(A)-(A)-(C)";
}, "sentence-order");
addFamily("order-option-duplicate", "sentence-order-option-duplicates", sentenceOrderControl, (x) => {
  x.question.options[0].text = x.question.options[1].text;
}, "sentence-order");
addFamily("order-unscrambled", "sentence-order-unscrambled-answer", sentenceOrderControl, (x) => {
  x.question.correctAnswer = "1";
  x.passage = [x.question.givenSentence, ...x.question.paragraphs.map((p) => p.text)].join(" ");
}, "sentence-order");
addFamily("order-answer-key", "sentence-order-answer-key-mismatch", sentenceOrderControl, (x) => {
  x.question.correctAnswer = "3";
}, "sentence-order");
addFamily("order-source-backed", "sentence-order-paragraph-not-source-backed", sentenceOrderControl, (x) => {
  x.question.paragraphs[0].text = x.question.paragraphs[0].text.replace("independent sample", "unrelated archive");
}, "sentence-order");

// Multi-blank inference.
addFamily("multi-count", "multi-blank-count", multiControl, (x) => {
  x.question.blanks.pop();
}, "multi-blank");
addFamily("multi-label", "multi-blank-label", multiControl, (x) => {
  x.question.blanks[1].label = "(C)";
}, "multi-blank");
addFamily("multi-expression", "multi-blank-missing-expression", multiControl, (x) => {
  x.question.blanks[0].originalExpression = "";
}, "multi-blank");
addFamily("multi-source", "multi-blank-expression-not-in-passage", multiControl, (x) => {
  x.question.blanks[0].originalExpression = "invent unsupported evidence";
}, "multi-blank");
addFamily("multi-passage", "multi-blank-missing-passage", multiControl, (x) => {
  x.question.passageWithBlank = "";
}, "multi-blank");
addFamily("multi-marker", "multi-blank-marker-count", multiControl, (x) => {
  x.question.passageWithBlank = x.question.passageWithBlank.replace("(B) _____", "_____");
}, "multi-blank");
addFamily("multi-visible", "multi-blank-answer-visible", multiControl, (x) => {
  x.question.passageWithBlank += " Reviewers still compare multiple sources in the appendix.";
}, "multi-blank");
addFamily("multi-option-values", "multi-blank-option-values", multiControl, (x) => {
  x.question.options[3].blankValues = ["ignore conflicting reports"];
}, "multi-blank");
addFamily("multi-duplicate", "multi-blank-duplicate-option", multiControl, (x) => {
  x.question.options[4].blankValues = clone(x.question.options[3].blankValues);
}, "multi-blank");
addFamily("multi-correct-mismatch", "multi-blank-correct-option-mismatch", multiControl, (x) => {
  x.question.options[0].blankValues[0] = "trust a single example";
}, "multi-blank");

// Single-blank inference.
addFamily("blank-missing-answer", "blank-missing-answer", blankControl, (x) => {
  x.question.correctAnswer = "9";
}, "blank-single");
addFamily("blank-residual", "blank-answer-residual-visible", blankControl, (x) => {
  x.question.passageWithBlank += " Skilled readers connect new facts to familiar experiences again during review.";
}, "blank-single");
addFamily("blank-list", "blank-target-list-like", blankControl, (x) => {
  x.question.originalExpression = "compare records: dates, locations, methods, instruments, and exceptions";
  x.question.options[0].text = x.question.originalExpression;
}, "blank-single");
families.at(-1).productionExpectation = "craft-warning";
addFamily("blank-explanation-numbering", "blank-explanation-narrative-circled-numbering", blankControl, (x) => {
  x.question.explanation = "① 빈칸 문장을 확인한다. ② 근거 문장을 비교한다. 따라서 첫 번째 선택지가 문맥을 완성한다.";
}, "blank-single");

// GRAMMAR_ERROR structural integrity.
addFamily("grammar-marker-count", "grammar-marker-count", grammarControl, (x) => {
  x.grammarMarkerCount = 6;
}, "grammar-error");
addFamily("grammar-error-count", "grammar-error-count", grammarControl, (x) => {
  x.grammarAnswerCount = 2;
}, "grammar-error");
addFamily("grammar-answer-label", "grammar-correct-answer-labels", grammarControl, (x) => {
  x.question.correctAnswer = "C";
}, "grammar-error");
addFamily("grammar-not-mutated", "grammar-error-not-mutated", grammarControl, (x) => {
  const error = x.question.markedExpressions.find((item) => item.isError);
  error.errorExpression = error.correction;
  x.question.options[1].text = error.correction;
  x.question.passageWithMarkers = x.question.passageWithMarkers.replace("which was", "which were");
}, "grammar-error");

// GRAMMAR_CORRECTION structural integrity.
addFamily("correction-segments", "grammar-correction-missing-underlined-segments", correctionControl, (x) => {
  x.question.underlinedSegments = [];
}, "grammar-correction");
addFamily("correction-error-count", "grammar-correction-error-count", correctionControl, (x) => {
  x.question.underlinedSegments[0].isError = false;
}, "grammar-correction");
addFamily("correction-part", "grammar-correction-missing-corrected-part", correctionControl, (x) => {
  x.question.underlinedSegments[0].correctedPart = "";
  x.question.correctedPart = "";
}, "grammar-correction");
addFamily("correction-answer", "grammar-correction-answer-mismatch", correctionControl, (x) => {
  x.question.correctAnswer = "which had";
}, "grammar-correction");

// SENTENCE_INSERT source omission and answer synchronization.
addFamily("insert-given", "sentence-insert-missing-given", sentenceInsertControl, (x) => {
  x.question.givenSentence = "";
}, "sentence-insert");
addFamily("insert-passage", "sentence-insert-missing-passage", sentenceInsertControl, (x) => {
  x.question.passageWithMarkers = "";
}, "sentence-insert");
addFamily("insert-markers", "sentence-insert-gap-marker-count", sentenceInsertControl, (x) => {
  x.question.passageWithMarkers = x.question.passageWithMarkers.replace("⑤", "");
}, "sentence-insert");
addFamily("insert-source", "sentence-insert-omitted-source-not-backed", sentenceInsertControl, (x) => {
  x.question.sourceSentenceToOmit = "However, an invented sentence was never present in the source.";
  x.question.omittedSourceSentence = x.question.sourceSentenceToOmit;
}, "sentence-insert");
addFamily("insert-visible", "sentence-insert-omitted-source-visible", sentenceInsertControl, (x) => {
  x.question.passageWithMarkers += ` ${x.question.omittedSourceSentence}`;
}, "sentence-insert");
addFamily("insert-answer", "sentence-insert-answer-desync", sentenceInsertControl, (x) => {
  x.question.correctAnswer = "4";
}, "sentence-insert");

const lexicalMaps = [
  [],
  [
    ["teams", "panels"],
    ["team", "panel"],
    ["analysts", "engineers"],
    ["sensor", "instrument"],
    ["sources", "records"],
    ["Students", "Readers"],
    ["students", "readers"],
    ["facts", "details"],
    ["experiences", "examples"],
    ["experiment", "review"],
    ["committee", "council"],
  ],
  [
    ["teams", "groups"],
    ["team", "group"],
    ["analysts", "auditors"],
    ["sensor", "meter"],
    ["sources", "archives"],
    ["Students", "Learners"],
    ["students", "learners"],
    ["facts", "claims"],
    ["experiences", "observations"],
    ["experiment", "assessment"],
    ["committee", "board"],
  ],
];

function variantize(value, variantIndex) {
  const map = lexicalMaps[variantIndex];
  if (typeof value === "string") {
    let out = value;
    for (const [from, to] of map) {
      out = out.replace(new RegExp(`\\b${from}\\b`, "g"), to);
    }
    return out;
  }
  if (Array.isArray(value)) return value.map((item) => variantize(item, variantIndex));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, variantize(item, variantIndex)]),
    );
  }
  return value;
}

const cases = [];
const oracleCases = [];
for (const family of families) {
  for (let variant = 0; variant < 3; variant += 1) {
    for (const role of ["control", "defect"]) {
      const id = `${family.id}-v${variant + 1}-${role}`;
      const input = variantize(
        role === "control" ? family.controlInput : family.defectInput,
        variant,
      );
      input.question.holdoutVariant = `blind-v12-${variant + 1}`;
      cases.push({
        id,
        pairId: `${family.id}-v${variant + 1}`,
        familyId: family.id,
        variant: variant + 1,
        role,
        targetCode: family.targetCode,
        sourceKind: family.sourceKind,
        productionExpectation: family.productionExpectation,
        input,
      });
      oracleCases.push({
        id,
        expectedTargetPresent: role === "defect",
        expectedProductionBlocking:
          role === "defect" && family.productionExpectation === "blocking-error",
        expectedProductionDisposition:
          role === "control" ? "pass" : family.productionExpectation,
        expectedControlSourceValid: role === "control",
      });
    }
  }
}

const corpus = {
  schemaVersion: 1,
  study: "deterministic-structural-reaudit-v12-blind",
  independence: {
    forbiddenPriorPayloads: ["v9", "v10", "v11"],
    authoringBasis: "current production validator/contract/source only",
    apiCalls: 0,
    networkAccess: false,
    databaseAccess: false,
  },
  construction: {
    familyCount: families.length,
    variantsPerFamily: 3,
    rolesPerPair: 2,
    caseCount: cases.length,
    lexicalVariantCount: lexicalMaps.length,
  },
  cases,
};
const oracle = {
  schemaVersion: 1,
  study: corpus.study,
  cases: oracleCases,
};

if (cases.length < 288 || cases.length % 2 !== 0) {
  throw new Error(`Expected at least 288 paired cases, got ${cases.length}.`);
}
if (new Set(cases.map((item) => item.id)).size !== cases.length) {
  throw new Error("Case ids are not unique.");
}
for (const family of families) {
  const familyCases = cases.filter((item) => item.familyId === family.id);
  if (familyCases.length !== 6) throw new Error(`Family ${family.id} is not 3 paired variants.`);
}

const corpusBytes = jsonBytes(corpus);
const oracleBytes = jsonBytes(oracle);
const seal = {
  schemaVersion: 1,
  study: corpus.study,
  caseCount: cases.length,
  familyCount: families.length,
  corpusSha256: sha256(corpusBytes),
  oracleSha256: sha256(oracleBytes),
  buildScriptSha256: sha256(readFileSync(fileURLToPath(import.meta.url))),
};

if (!write) {
  process.stdout.write(`${JSON.stringify(seal, null, 2)}\n`);
  process.exit(0);
}

writeFileSync(join(here, "corpus.json"), corpusBytes);
writeFileSync(join(here, "oracle.json"), oracleBytes);
writeFileSync(join(here, "seal.json"), jsonBytes(seal));
console.log(
  `SEALED families=${families.length} cases=${cases.length} corpus=${seal.corpusSha256} oracle=${seal.oracleSha256}`,
);
