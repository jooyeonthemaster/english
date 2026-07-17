import assert from "node:assert/strict";

const schemaModule = await import(
  "../../../../../src/lib/question-ai-schemas-mc"
);
const postProcessModule = await import(
  "../../../../../src/lib/question-postprocess"
);
const qualityModule = await import(
  "../../../../../src/lib/question-quality"
);
const topicWritingModule = await import(
  "../../../../../src/lib/topic-sentence-writing"
);
const getAiResponseSchema = schemaModule.getAiResponseSchema;
const postProcessQuestion = postProcessModule.postProcessQuestion;
const validateQuestionQuality = qualityModule.validateQuestionQuality;
const SHIP_FIRST_WARNING_CODES = qualityModule.SHIP_FIRST_WARNING_CODES as Set<string>;
const reorderChipsAwayFromAnswer = topicWritingModule.reorderChipsAwayFromAnswer;
const chipsAreInAnswerOrder = topicWritingModule.chipsAreInAnswerOrder;
const policyModule = await import(
  "../../../../../src/app/api/ai/generate-questions-auto/_lib/run-question-generation-constants"
);
const RELAXED_BLOCKING_QUALITY_CODES =
  policyModule.RELAXED_BLOCKING_QUALITY_CODES as Set<string>;

type JsonRecord = Record<string, unknown>;

const passage =
  "Reliable inquiry compares independent observations before accepting a conclusion, especially when a vivid example points in another direction.";

const titleOptions = [
  "Evidence Before Conclusion",
  "Anecdote as Final Proof",
  "Judgment Before Comparison",
  "Ignoring Conflicting Records",
  "Guessing Without a Source",
].map((text, index) => ({ label: String(index + 1), text }));

function wrongExplanations(labels: string[]) {
  return labels.map((label) => ({
    label,
    explanation: `선지 ${label}는 지문의 독립 관찰 비교 원칙과 결정적으로 어긋난다.`,
  }));
}

function titleCandidate(overrides: JsonRecord): JsonRecord {
  return {
    direction: "Choose all options that apply.",
    options: titleOptions,
    correctAnswers: ["1", "2"],
    correctAnswer: "1, 2",
    wrongOptionExplanations: wrongExplanations(["3", "4", "5"]),
    explanation: "두 정답은 독립 관찰을 비교한 뒤 결론을 내려야 한다는 원칙을 표현한다.",
    keyPoints: ["independent evidence", "comparison", "delayed judgment"],
    tags: ["title", "multi-answer"],
    difficulty: "INTERMEDIATE",
    ...overrides,
  };
}

function parseSingle(typeId: string, question: JsonRecord, options: JsonRecord = {}) {
  const schema = getAiResponseSchema(typeId, {
    ...options,
    expectedQuestionCount: 1,
  });
  const parsed = schema.safeParse({ questions: [question] });
  if (!parsed.success) {
    throw new Error(
      `${typeId} certificate failed production response schema: ${parsed.error.message}`,
    );
  }
  return (parsed.data as { questions: JsonRecord[] }).questions[0];
}

function quality(
  typeId: string,
  question: JsonRecord,
  extra: JsonRecord = {},
) {
  const issues = validateQuestionQuality({
    typeId,
    question,
    passage,
    requestedDifficulty: "INTERMEDIATE",
    ...extra,
  });
  const blockingCodes = issues
    .filter(
      (issue) =>
        issue.severity === "error" &&
        RELAXED_BLOCKING_QUALITY_CODES.has(issue.code),
    )
    .map((issue) => issue.code);
  return { issues, blockingCodes };
}

const certificates: Array<{
  code: string;
  schemaAccepted: boolean;
  postProcessAccepted: boolean;
  emitted: boolean;
  independentlyBlocked: boolean;
  issueCodes: string[];
  blockingCodes: string[];
}> = [];

{
  const question = parseSingle(
    "TITLE",
    titleCandidate({ correctAnswer: "1, 2, 3" }),
    { genericAnswerCount: 2 },
  );
  const observed = quality("TITLE", question, {
    genericAnswerCount: 2,
    genericOptionCount: 5,
  });
  certificates.push({
    code: "generic-answer-count",
    schemaAccepted: true,
    postProcessAccepted: true,
    emitted: observed.issues.some((issue) => issue.code === "generic-answer-count"),
    independentlyBlocked: observed.blockingCodes.length > 0,
    issueCodes: observed.issues.map((issue) => issue.code),
    blockingCodes: observed.blockingCodes,
  });
}

const redundancyCertificates: Array<{
  code: string;
  mechanism: string;
  observed: boolean;
}> = [];

{
  const parsed = parseSingle(
    "TITLE",
    titleCandidate({
      direction: "Choose the most appropriate title for the passage.",
      correctAnswers: ["1"],
      correctAnswer: "1",
      wrongOptionExplanations: wrongExplanations(["2", "3", "4", "5"]),
      originalExpression: "foreign field that must not survive",
    }),
  );
  redundancyCertificates.push({
    code: "type-foreign-field",
    mechanism: "production schema strips the foreign field",
    observed: !Object.hasOwn(parsed, "originalExpression"),
  });
}

{
  const answer =
    "Careful observers can compare several patterns before drawing conclusions";
  const nearOrder = [
    "Careful",
    "observers",
    "can",
    "compare",
    "unused distractor",
    "several",
    "patterns",
    "before",
    "drawing",
    "conclusions",
  ];
  const reordered = reorderChipsAwayFromAnswer(nearOrder, answer);
  redundancyCertificates.push({
    code: "scrambled-near-answer-order",
    mechanism: "deterministic finalizer rewrites near-answer chip order",
    observed:
      chipsAreInAnswerOrder(nearOrder, answer) &&
      !chipsAreInAnswerOrder(reordered, answer) &&
      reordered.join("\u0000") !== nearOrder.join("\u0000"),
  });
}

{
  const summarySchema = getAiResponseSchema("SUMMARY_COMPLETE", {
    expectedQuestionCount: 1,
    summaryCompleteBlankCount: 1,
  });
  const validSummary = {
    direction: "Complete the summary.",
    summaryWithBlanks: "Careful comparison supports (A).",
    blanks: [{ label: "(A)", answer: "reliable judgment" }],
    correctAnswer: "reliable judgment",
    explanation: "The answer states the conclusion supported by comparison.",
    keyPoints: ["comparison", "judgment"],
    tags: ["summary"],
    difficulty: "INTERMEDIATE",
  };
  const valid = summarySchema.safeParse({ questions: [validSummary] });
  const missing = summarySchema.safeParse({
    questions: [
      {
        ...validSummary,
        blanks: [{ label: "(A)" }],
      },
    ],
  });
  redundancyCertificates.push({
    code: "summary-complete-missing-blank-answer",
    mechanism: "production schema rejects a blank without answer",
    observed: valid.success && !missing.success,
  });
}

const redundantMultiPassage =
  "Careful teams compare multiple sources before drawing conclusions, and patient reviewers document every uncertainty before publishing results.";

function redundantMultiCandidate(): JsonRecord {
  return {
    direction: "Choose the pair that best completes both blanks.",
    blankDesign: "Two source-grounded spans and five complete combinations.",
    blanks: [
      {
        label: "(A)",
        originalExpression: "compare multiple sources",
        surroundingText: redundantMultiPassage,
      },
      {
        label: "(B)",
        originalExpression: "document every uncertainty",
        surroundingText: redundantMultiPassage,
      },
    ],
    options: [
      {
        label: "1",
        text: "compare multiple sources / document every uncertainty",
        blankValues: ["compare multiple sources", "document every uncertainty"],
      },
      {
        label: "2",
        text: "trust one anecdote / document every uncertainty",
        blankValues: ["trust one anecdote", "document every uncertainty"],
      },
      {
        label: "3",
        text: "compare multiple sources / conceal every uncertainty",
        blankValues: ["compare multiple sources", "conceal every uncertainty"],
      },
      {
        label: "4",
        text: "ignore conflicting records / conceal every uncertainty",
        blankValues: ["ignore conflicting records", "conceal every uncertainty"],
      },
      {
        label: "5",
        text: "trust one anecdote / conceal every uncertainty",
        blankValues: ["trust one anecdote", "conceal every uncertainty"],
      },
    ],
    correctAnswer: "1",
    wrongOptionExplanations: wrongExplanations(["2", "3", "4", "5"]),
    explanation: "Both source-backed expressions restore the two omitted spans.",
    keyPoints: ["comparison", "transparent reporting"],
    tags: ["multi blank"],
    difficulty: "BASIC",
  };
}

{
  const multiSchema = getAiResponseSchema("BLANK_INFERENCE", {
    expectedQuestionCount: 1,
    blankInferenceBlankCount: 2,
  });
  const base = redundantMultiCandidate();
  const baseAccepted = multiSchema.safeParse({ questions: [base] }).success;
  const countDefect = structuredClone(base);
  (countDefect.blanks as JsonRecord[]).push({
    label: "(C)",
    originalExpression: "drawing conclusions",
    surroundingText: redundantMultiPassage,
  });
  const labelDefect = structuredClone(base);
  (labelDefect.blanks as JsonRecord[])[1].label = "(C)";
  const valuesDefect = structuredClone(base);
  ((valuesDefect.options as JsonRecord[])[1].blankValues as string[]).pop();
  redundancyCertificates.push(
    {
      code: "multi-blank-count",
      mechanism: "dynamic production schema rejects the wrong blank count",
      observed:
        baseAccepted &&
        !multiSchema.safeParse({ questions: [countDefect] }).success,
    },
    {
      code: "multi-blank-label",
      mechanism: "dynamic production schema rejects a non-contract label",
      observed:
        baseAccepted &&
        !multiSchema.safeParse({ questions: [labelDefect] }).success,
    },
    {
      code: "multi-blank-option-values",
      mechanism: "dynamic production schema rejects incomplete blankValues",
      observed:
        baseAccepted &&
        !multiSchema.safeParse({ questions: [valuesDefect] }).success,
    },
  );

  const missingExpression = structuredClone(base);
  (missingExpression.blanks as JsonRecord[])[0].originalExpression = "";
  const missingParsed = multiSchema.safeParse({ questions: [missingExpression] });
  assert.equal(missingParsed.success, true);
  const missingProcessed = postProcessQuestion(
    "BLANK_INFERENCE",
    redundantMultiPassage,
    (missingParsed.data as { questions: JsonRecord[] }).questions[0],
  );
  redundancyCertificates.push({
    code: "multi-blank-missing-expression",
    mechanism: "production post-process rejects an empty source expression",
    observed: !missingProcessed.success,
  });

  const alienExpression = structuredClone(base);
  (alienExpression.blanks as JsonRecord[])[0].originalExpression =
    "an expression absent from the passage";
  const alienParsed = multiSchema.safeParse({ questions: [alienExpression] });
  assert.equal(alienParsed.success, true);
  const alienProcessed = postProcessQuestion(
    "BLANK_INFERENCE",
    redundantMultiPassage,
    (alienParsed.data as { questions: JsonRecord[] }).questions[0],
  );
  redundancyCertificates.push({
    code: "multi-blank-expression-not-in-passage",
    mechanism: "production post-process rejects a source span it cannot locate",
    observed: !alienProcessed.success,
  });

  const validParsed = multiSchema.safeParse({ questions: [base] });
  assert.equal(validParsed.success, true);
  const validProcessed = postProcessQuestion(
    "BLANK_INFERENCE",
    redundantMultiPassage,
    (validParsed.data as { questions: JsonRecord[] }).questions[0],
  );
  assert.equal(validProcessed.success, true);
  const rendered = String(validProcessed.data.passageWithBlank ?? "");
  redundancyCertificates.push(
    {
      code: "multi-blank-missing-passage",
      mechanism: "production post-process synthesizes passageWithBlank",
      observed: rendered.length > 0,
    },
    {
      code: "multi-blank-marker-count",
      mechanism: "production post-process emits one canonical marker per blank",
      observed:
        rendered.split("(A) _____").length - 1 === 1 &&
        rendered.split("(B) _____").length - 1 === 1,
    },
  );

  const mismatch = redundantMultiCandidate();
  const mismatchCorrect = (mismatch.options as JsonRecord[])[0];
  mismatchCorrect.blankValues = [
    "evaluate several records",
    "record every limitation",
  ];
  mismatchCorrect.text = "evaluate several records / record every limitation";
  const mismatchParsed = multiSchema.safeParse({ questions: [mismatch] });
  assert.equal(mismatchParsed.success, true);
  const mismatchProcessed = postProcessQuestion(
    "BLANK_INFERENCE",
    redundantMultiPassage,
    (mismatchParsed.data as { questions: JsonRecord[] }).questions[0],
  );
  assert.equal(mismatchProcessed.success, true);
  const correctedOption = (mismatchProcessed.data.options as JsonRecord[]).find(
    (option) => option.label === "1",
  );
  redundancyCertificates.push({
    code: "multi-blank-correct-option-mismatch",
    mechanism: "SOURCE_EXACT production post-process auto-fixes the correct values",
    observed:
      Array.isArray(correctedOption?.blankValues) &&
      correctedOption.blankValues.join("|") ===
        "compare multiple sources|document every uncertainty",
  });
}

{
  const question = parseSingle(
    "TITLE",
    titleCandidate({ direction: "Choose the single best option." }),
    { genericAnswerCount: 2 },
  );
  const observed = quality("TITLE", question, {
    genericAnswerCount: 2,
    genericOptionCount: 5,
  });
  certificates.push({
    code: "generic-multi-answer-direction",
    schemaAccepted: true,
    postProcessAccepted: true,
    emitted: observed.issues.some(
      (issue) => issue.code === "generic-multi-answer-direction",
    ),
    independentlyBlocked: observed.blockingCodes.length > 0,
    issueCodes: observed.issues.map((issue) => issue.code),
    blockingCodes: observed.blockingCodes,
  });
}

const orderGiven =
  "Initial measurements looked inconsistent, so the research team examined the full record.";
const orderA =
  "Finally, the team tested the emerging explanation with an independent sample collected several weeks later. The new measurements reproduced the same pattern and strengthened the original conclusion.";
const orderB =
  "First, the analysts checked every sensor against a stable laboratory reference before interpreting the unusual readings. This calibration removed several small offsets that had accumulated during transport.";
const orderC =
  "Next, they compared the corrected records across neighboring stations and separated shared trends from isolated noise. The regional pattern became visible only after this second comparison.";
const orderOptions = [
  "(A)-(B)-(C)",
  "(A)-(C)-(B)",
  "(B)-(A)-(C)",
  "(B)-(C)-(A)",
  "(C)-(B)-(A)",
].map((text, index) => ({ label: String(index + 1), text }));

function orderCandidate(aText: string): JsonRecord {
  return {
    direction: "Choose the most coherent order of the following paragraphs.",
    givenSentence: orderGiven,
    paragraphs: [
      { label: "(A)", text: aText },
      { label: "(B)", text: orderB },
      { label: "(C)", text: orderC },
    ],
    options: orderOptions,
    correctAnswer: "4",
    wrongOptionExplanations: wrongExplanations(["1", "2", "3", "5"]),
    explanation: "Calibration comes first, regional comparison follows, and replication closes the account.",
    keyPoints: ["calibration", "regional comparison", "replication"],
    tags: ["sentence order"],
    difficulty: "INTERMEDIATE",
  };
}

for (const [code, aText] of [
  ["sentence-order-paragraph-body-label", `(A) ${orderA}`],
  [
    "sentence-order-dependent-fragment",
    "Because the independent sample confirmed the shared pattern. The new measurements reproduced the same regional trend and strengthened the original conclusion for every reviewer involved.",
  ],
] as const) {
  const question = parseSingle("SENTENCE_ORDER", orderCandidate(aText));
  const orderPassage = [orderGiven, orderB, orderC, aText].join(" ");
  const issues = validateQuestionQuality({
    typeId: "SENTENCE_ORDER",
    question,
    passage: orderPassage,
    requestedDifficulty: "INTERMEDIATE",
  });
  const blockingCodes = issues
    .filter(
      (issue) =>
        issue.severity === "error" &&
        RELAXED_BLOCKING_QUALITY_CODES.has(issue.code),
    )
    .map((issue) => issue.code);
  certificates.push({
    code,
    schemaAccepted: true,
    postProcessAccepted: true,
    emitted: issues.some((issue) => issue.code === code),
    independentlyBlocked: blockingCodes.length > 0,
    issueCodes: issues.map((issue) => issue.code),
    blockingCodes,
  });
}

{
  const blankPassage =
    "Careful teams compare multiple sources before drawing conclusions, and patient reviewers document every uncertainty before publishing results.";
  const raw = {
    direction: "Choose the pair that best completes both blanks.",
    blankDesign: "Two source-grounded claims with one duplicated wrong combination.",
    blanks: [
      {
        label: "(A)",
        originalExpression: "compare multiple sources",
        surroundingText: blankPassage,
      },
      {
        label: "(B)",
        originalExpression: "document every uncertainty",
        surroundingText: blankPassage,
      },
    ],
    options: [
      {
        label: "1",
        text: "evaluate several records / record all limitations",
        blankValues: ["evaluate several records", "record all limitations"],
      },
      {
        label: "2",
        text: "trust one anecdote / record all limitations",
        blankValues: ["trust one anecdote", "record all limitations"],
      },
      {
        label: "3",
        text: "evaluate several records / conceal all limitations",
        blankValues: ["evaluate several records", "conceal all limitations"],
      },
      {
        label: "4",
        text: "ignore conflicting reports / conceal all limitations",
        blankValues: ["ignore conflicting reports", "conceal all limitations"],
      },
      {
        label: "5",
        text: "ignore conflicting reports / conceal all limitations",
        blankValues: ["ignore conflicting reports", "conceal all limitations"],
      },
    ],
    correctAnswer: "1",
    wrongOptionExplanations: wrongExplanations(["2", "3", "4", "5"]),
    explanation: "두 빈칸 모두 지문의 비교와 투명한 기록 원칙을 보존해야 한다.",
    keyPoints: ["comparison", "transparent reporting", "two-blank consistency"],
    tags: ["multi blank"],
    difficulty: "INTERMEDIATE",
  };
  const parsed = parseSingle("BLANK_INFERENCE", raw, {
    blankInferenceBlankCount: 2,
  });
  const processed = postProcessQuestion("BLANK_INFERENCE", blankPassage, {
    ...parsed,
    blankAnswerMode: "PARAPHRASE",
  });
  assert.equal(processed.success, true, "multi-blank certificate post-process must succeed");
  const issues = validateQuestionQuality({
    typeId: "BLANK_INFERENCE",
    question: processed.data,
    passage: blankPassage,
    requestedDifficulty: "INTERMEDIATE",
    blankInferenceBlankCount: 2,
    blankInferenceParaphraseAnswer: true,
  });
  const blockingCodes = issues
    .filter(
      (issue) =>
        issue.severity === "error" &&
        RELAXED_BLOCKING_QUALITY_CODES.has(issue.code),
    )
    .map((issue) => issue.code);
  certificates.push({
    code: "multi-blank-duplicate-option",
    schemaAccepted: true,
    postProcessAccepted: processed.success,
    emitted: issues.some((issue) => issue.code === "multi-blank-duplicate-option"),
    independentlyBlocked: blockingCodes.length > 0,
    issueCodes: issues.map((issue) => issue.code),
    blockingCodes,
  });
}

{
  const insertPassage = [
    "The market opened before sunrise in the old town.",
    "Merchants arranged their goods in careful rows along the square.",
    "However, the fish sellers claimed the busiest corner for themselves.",
    "Their stalls drew the largest crowds of the whole morning.",
    "By noon most of the goods were already gone from the tables.",
    "The last visitors left the square as the evening bells rang.",
  ].join(" ");
  const raw = {
    direction: "Choose the best place to insert the given sentence.",
    sourceSentenceToOmit:
      "However, the fish sellers claimed the busiest corner for themselves.",
    givenSentence: "",
    markerAfterSentenceIndices: [0, 1, 3, 4, 5],
    options: ["①", "②", "③", "④", "⑤"].map((text, index) => ({
      label: String(index + 1),
      text,
    })),
    correctAnswer: "2",
    wrongOptionExplanations: wrongExplanations(["1", "3", "4", "5"]),
    explanation: "The omitted contrastive sentence belongs at gap ②.",
    keyPoints: ["contrast", "antecedent", "chronology"],
    tags: ["sentence insertion"],
    difficulty: "INTERMEDIATE",
  };
  const parsed = parseSingle("SENTENCE_INSERT", raw, {
    sentenceInsertSlotCount: 5,
  });
  const processed = postProcessQuestion("SENTENCE_INSERT", insertPassage, parsed);
  assert.equal(processed.success, true, "sentence-insert certificate post-process must succeed");
  const issues = validateQuestionQuality({
    typeId: "SENTENCE_INSERT",
    question: processed.data,
    passage: insertPassage,
    requestedDifficulty: "INTERMEDIATE",
    sentenceInsertSlotCount: 5,
  });
  const blockingCodes = issues
    .filter(
      (issue) =>
        issue.severity === "error" &&
        RELAXED_BLOCKING_QUALITY_CODES.has(issue.code),
    )
    .map((issue) => issue.code);
  certificates.push({
    code: "sentence-insert-missing-given",
    schemaAccepted: true,
    postProcessAccepted: processed.success,
    emitted: issues.some((issue) => issue.code === "sentence-insert-missing-given"),
    independentlyBlocked: blockingCodes.length > 0,
    issueCodes: issues.map((issue) => issue.code),
    blockingCodes,
  });
}

redundancyCertificates.push({
  code: "multi-blank-duplicate-option",
  mechanism: "existing duplicate-option-text relaxed blocker covers the final candidate",
  observed:
    certificates.find((row) => row.code === "multi-blank-duplicate-option")
      ?.blockingCodes.join("|") === "duplicate-option-text",
});

for (const certificate of certificates) {
  assert.equal(certificate.schemaAccepted, true);
  assert.equal(certificate.postProcessAccepted, true);
  assert.equal(certificate.emitted, true, `${certificate.code} certificate did not emit`);
  const expectedIndependentBlock =
    certificate.code === "multi-blank-duplicate-option";
  assert.equal(certificate.independentlyBlocked, expectedIndependentBlock);
  if (expectedIndependentBlock) {
    assert.deepEqual(certificate.blockingCodes, ["duplicate-option-text"]);
  }
}

const expectedRedundantCodes = [
  "multi-blank-correct-option-mismatch",
  "multi-blank-count",
  "multi-blank-duplicate-option",
  "multi-blank-expression-not-in-passage",
  "multi-blank-label",
  "multi-blank-marker-count",
  "multi-blank-missing-expression",
  "multi-blank-missing-passage",
  "multi-blank-option-values",
  "scrambled-near-answer-order",
  "summary-complete-missing-blank-answer",
  "type-foreign-field",
] as const;
assert.deepEqual(
  redundancyCertificates.map((row) => row.code).sort(),
  [...expectedRedundantCodes].sort(),
);
for (const certificate of redundancyCertificates) {
  assert.equal(certificate.observed, true, `${certificate.code} redundancy was not reproduced`);
}

const proposedFatalCodes = [
  "generic-answer-count",
  "generic-multi-answer-direction",
  "sentence-order-paragraph-body-label",
  "sentence-order-dependent-fragment",
  "sentence-insert-missing-given",
] as const;

const policy = proposedFatalCodes.map((code) => ({
  code,
  currentlyRelaxedBlocking: RELAXED_BLOCKING_QUALITY_CODES.has(code),
  currentlyShipFirstWarning: SHIP_FIRST_WARNING_CODES.has(code),
}));
for (const row of policy) {
  assert.equal(row.currentlyRelaxedBlocking, false, `${row.code} is already relaxed-blocking`);
  assert.equal(row.currentlyShipFirstWarning, false, `${row.code} is a deliberate craft warning`);
}

console.log(
  JSON.stringify(
    {
      verdict: "PASS",
      proposedFatalCodes,
      expectedRedundantCodes,
      policy,
      certificates,
      redundancyCertificates,
    },
    null,
    2,
  ),
);
