import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

type JsonRecord = Record<string, unknown>;
type SafeParseResult =
  | { success: true; data: unknown }
  | { success: false; error: unknown };
type AdjudicatedRow = {
  id: string;
  familyId: string;
  variant: number;
  targetCode: string;
  disposition: "A" | "B" | "C" | "D";
};
type AdjudicationArtifact = {
  falseNegativeAdjudication: {
    countsByDisposition: Record<"A" | "B" | "C" | "D", number>;
    codeCountsByDisposition: Record<"A" | "B" | "C" | "D", number>;
    rows: AdjudicatedRow[];
  };
};
type ParentResults = {
  failures: { productionFalseNegativeIds: string[] };
};

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../../..");
const parentDir = join(
  root,
  "experiments/question-quality-20260715/reviews/deterministic-structural-reaudit-v12-blind",
);
const adjudicationDir = join(parentDir, "adjudication-independent-v1");

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function sorted(values: readonly string[]): string[] {
  return [...values].sort((a, b) => a.localeCompare(b));
}

const importFromRoot = async (path: string) =>
  import(pathToFileURL(join(root, path)).href);

const schemaModule = await importFromRoot("src/lib/question-ai-schemas-mc.ts");
const postProcessModule = await importFromRoot("src/lib/question-postprocess/index.ts");
const qualityModule = await importFromRoot("src/lib/question-quality/index.ts");
const topicWritingModule = await importFromRoot("src/lib/topic-sentence-writing.ts");
const policyModule = await importFromRoot(
  "src/app/api/ai/generate-questions-auto/_lib/run-question-generation-constants.ts",
);

const getAiResponseSchema = schemaModule.getAiResponseSchema as (
  typeId: string,
  options: JsonRecord,
) => { safeParse: (value: unknown) => SafeParseResult };
const postProcessQuestion = postProcessModule.postProcessQuestion as (
  typeId: string,
  passage: string,
  question: JsonRecord,
) => { success: boolean; data?: JsonRecord; error?: unknown };
const validateQuestionQuality = qualityModule.validateQuestionQuality as (
  input: JsonRecord,
) => Array<{ code: string; severity: string }>;
const SHIP_FIRST_WARNING_CODES = qualityModule.SHIP_FIRST_WARNING_CODES as Set<string>;
const reorderChipsAwayFromAnswer = topicWritingModule.reorderChipsAwayFromAnswer as (
  chips: string[],
  answer: string,
) => string[];
const chipsAreInAnswerOrder = topicWritingModule.chipsAreInAnswerOrder as (
  chips: string[],
  answer: string,
) => boolean;
const RELAXED_BLOCKING_QUALITY_CODES =
  policyModule.RELAXED_BLOCKING_QUALITY_CODES as Set<string>;
const SALVAGE_RELAXABLE_CODES = policyModule.SALVAGE_RELAXABLE_CODES as Set<string>;

const expectedFatalCodes = [
  "generic-answer-count",
  "generic-multi-answer-direction",
  "sentence-insert-missing-given",
  "sentence-order-dependent-fragment",
  "sentence-order-paragraph-body-label",
] as const;

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

const adjudicationPath = join(adjudicationDir, "adjudication.json");
const adjudication = readJson<AdjudicationArtifact>(adjudicationPath);
const parentResultsPath = join(parentDir, "results.json");
const parentResults = readJson<ParentResults>(parentResultsPath);
const parentCorpusPath = join(parentDir, "corpus.json");
const parentOraclePath = join(parentDir, "oracle.json");
const parentSealPath = join(parentDir, "seal.json");

assert.deepEqual(adjudication.falseNegativeAdjudication.countsByDisposition, {
  A: 15,
  B: 0,
  C: 36,
  D: 0,
});
assert.deepEqual(adjudication.falseNegativeAdjudication.codeCountsByDisposition, {
  A: 5,
  B: 0,
  C: 12,
  D: 0,
});

const adjudicatedRows = adjudication.falseNegativeAdjudication.rows;
const aRows = adjudicatedRows.filter((row) => row.disposition === "A");
const cRows = adjudicatedRows.filter((row) => row.disposition === "C");
assert.equal(aRows.length, 15);
assert.equal(cRows.length, 36);
assert.deepEqual(sorted([...new Set(aRows.map((row) => row.targetCode))]), sorted(expectedFatalCodes));
assert.deepEqual(
  sorted([...new Set(cRows.map((row) => row.targetCode))]),
  sorted(expectedRedundantCodes),
);
assert.equal(adjudicatedRows.some((row) => row.disposition === "B"), false);
assert.equal(adjudicatedRows.some((row) => row.disposition === "D"), false);
assert.deepEqual(
  sorted(adjudicatedRows.map((row) => row.id)),
  sorted(parentResults.failures.productionFalseNegativeIds as string[]),
);

const constantsPath = join(
  root,
  "src/app/api/ai/generate-questions-auto/_lib/run-question-generation-constants.ts",
);
const constantsText = readFileSync(constantsPath, "utf8");
const remediationStart = constantsText.indexOf("// v12 blind holdout + independent production-path adjudication");
const remediationEnd = constantsText.indexOf('  "mid-word-marker",', remediationStart);
assert.ok(remediationStart >= 0, "v12 remediation anchor is missing");
assert.ok(remediationEnd > remediationStart, "v12 remediation terminator is missing");
const remediationBlock = constantsText.slice(remediationStart, remediationEnd);
const anchoredAdditions = [...remediationBlock.matchAll(/"([a-z0-9-]+)"/g)].map(
  (match) => match[1],
);
assert.deepEqual(sorted(anchoredAdditions), sorted(expectedFatalCodes));

const policyRows = expectedFatalCodes.map((code) => ({
  code,
  relaxedBlocking: RELAXED_BLOCKING_QUALITY_CODES.has(code),
  salvageRelaxable: SALVAGE_RELAXABLE_CODES.has(code),
  shipFirstWarning: SHIP_FIRST_WARNING_CODES.has(code),
}));
for (const row of policyRows) {
  assert.equal(row.relaxedBlocking, true, `${row.code}: relaxed blocker missing`);
  assert.equal(row.salvageRelaxable, false, `${row.code}: salvage escape remains`);
  assert.equal(row.shipFirstWarning, false, `${row.code}: SHIP_FIRST downgrade remains`);
}

const redundantPolicyRows = expectedRedundantCodes.map((code) => ({
  code,
  relaxedBlocking: RELAXED_BLOCKING_QUALITY_CODES.has(code),
  salvageRelaxable: SALVAGE_RELAXABLE_CODES.has(code),
  shipFirstWarning: SHIP_FIRST_WARNING_CODES.has(code),
}));
for (const row of redundantPolicyRows) {
  assert.equal(row.relaxedBlocking, false, `${row.code}: unintended v12 relaxed blocker`);
  assert.equal(row.salvageRelaxable, false, `${row.code}: unexpected salvage listing`);
  assert.equal(row.shipFirstWarning, false, `${row.code}: unexpected SHIP_FIRST listing`);
}

const basePassage =
  "Reliable inquiry compares independent observations before accepting a conclusion, especially when a vivid example points in another direction.";

const baseOptions = [
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
    options: baseOptions,
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

function parseSingle(typeId: string, question: JsonRecord, options: JsonRecord = {}): JsonRecord {
  const schema = getAiResponseSchema(typeId, { ...options, expectedQuestionCount: 1 });
  const parsed = schema.safeParse({ questions: [question] });
  if (!parsed.success) {
    throw new Error(`${typeId}: production response schema rejected certificate: ${parsed.error}`);
  }
  return (parsed.data as { questions: JsonRecord[] }).questions[0];
}

function runQuality(
  typeId: string,
  question: JsonRecord,
  passage: string,
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
        issue.severity === "error" && RELAXED_BLOCKING_QUALITY_CODES.has(issue.code),
    )
    .map((issue) => issue.code);
  return { issues, blockingCodes };
}

type FatalCertificate = {
  code: string;
  schemaAccepted: boolean;
  postProcessAccepted: boolean;
  targetIssueEmitted: boolean;
  blockedByTarget: boolean;
  otherBlockingCodes: string[];
  issueCodes: string[];
  blockingCodes: string[];
};

const fatalCertificates: FatalCertificate[] = [];

function addFatalCertificate(
  code: string,
  typeId: string,
  parsed: JsonRecord,
  passage: string,
  extra: JsonRecord = {},
) {
  const processed = postProcessQuestion(typeId, passage, parsed);
  assert.equal(processed.success, true, `${code}: production post-process rejected certificate`);
  const observed = runQuality(typeId, processed.data as JsonRecord, passage, extra);
  const otherBlockingCodes = observed.blockingCodes.filter((item) => item !== code);
  fatalCertificates.push({
    code,
    schemaAccepted: true,
    postProcessAccepted: processed.success,
    targetIssueEmitted: observed.issues.some((issue) => issue.code === code),
    blockedByTarget: observed.blockingCodes.includes(code),
    otherBlockingCodes,
    issueCodes: observed.issues.map((issue) => issue.code),
    blockingCodes: observed.blockingCodes,
  });
}

addFatalCertificate(
  "generic-answer-count",
  "TITLE",
  parseSingle("TITLE", titleCandidate({ correctAnswer: "1, 2, 3" }), {
    genericAnswerCount: 2,
  }),
  basePassage,
  { genericAnswerCount: 2, genericOptionCount: 5 },
);

addFatalCertificate(
  "generic-multi-answer-direction",
  "TITLE",
  parseSingle(
    "TITLE",
    titleCandidate({ direction: "Choose the single best option." }),
    { genericAnswerCount: 2 },
  ),
  basePassage,
  { genericAnswerCount: 2, genericOptionCount: 5 },
);

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
  addFatalCertificate(
    code,
    "SENTENCE_ORDER",
    parseSingle("SENTENCE_ORDER", orderCandidate(aText)),
    [orderGiven, orderB, orderC, aText].join(" "),
  );
}

const insertPassage = [
  "The market opened before sunrise in the old town.",
  "Merchants arranged their goods in careful rows along the square.",
  "However, the fish sellers claimed the busiest corner for themselves.",
  "Their stalls drew the largest crowds of the whole morning.",
  "By noon most of the goods were already gone from the tables.",
  "The last visitors left the square as the evening bells rang.",
].join(" ");
const insertRaw = {
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
addFatalCertificate(
  "sentence-insert-missing-given",
  "SENTENCE_INSERT",
  parseSingle("SENTENCE_INSERT", insertRaw, { sentenceInsertSlotCount: 5 }),
  insertPassage,
  { sentenceInsertSlotCount: 5 },
);

assert.deepEqual(sorted(fatalCertificates.map((row) => row.code)), sorted(expectedFatalCodes));
for (const certificate of fatalCertificates) {
  assert.equal(certificate.schemaAccepted, true);
  assert.equal(certificate.postProcessAccepted, true);
  assert.equal(certificate.targetIssueEmitted, true, `${certificate.code}: target not emitted`);
  assert.equal(certificate.blockedByTarget, true, `${certificate.code}: target did not block`);
  assert.deepEqual(
    certificate.otherBlockingCodes,
    [],
    `${certificate.code}: certificate relies on an unrelated blocker`,
  );
}

type RedundancyCertificate = {
  code: string;
  mechanism: string;
  observed: boolean;
  evidence: JsonRecord;
};
const redundancyCertificates: RedundancyCertificate[] = [];

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
    evidence: { foreignFieldPresentAfterParse: Object.hasOwn(parsed, "originalExpression") },
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
  const before = chipsAreInAnswerOrder(nearOrder, answer);
  const after = chipsAreInAnswerOrder(reordered, answer);
  const changed = reordered.join("\u0000") !== nearOrder.join("\u0000");
  redundancyCertificates.push({
    code: "scrambled-near-answer-order",
    mechanism: "deterministic finalizer rewrites near-answer chip order",
    observed: before && !after && changed,
    evidence: { before, after, changed },
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
    questions: [{ ...validSummary, blanks: [{ label: "(A)" }] }],
  });
  redundancyCertificates.push({
    code: "summary-complete-missing-blank-answer",
    mechanism: "production schema rejects a blank without answer",
    observed: valid.success && !missing.success,
    evidence: { validAccepted: valid.success, missingAnswerAccepted: missing.success },
  });
}

const multiPassage =
  "Careful teams compare multiple sources before drawing conclusions, and patient reviewers document every uncertainty before publishing results.";

function multiCandidate(): JsonRecord {
  return {
    direction: "Choose the pair that best completes both blanks.",
    blankDesign: "Two source-grounded spans and five complete combinations.",
    blanks: [
      {
        label: "(A)",
        originalExpression: "compare multiple sources",
        surroundingText: multiPassage,
      },
      {
        label: "(B)",
        originalExpression: "document every uncertainty",
        surroundingText: multiPassage,
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
  const base = multiCandidate();
  const baseAccepted = multiSchema.safeParse({ questions: [base] }).success;

  const countDefect = structuredClone(base);
  (countDefect.blanks as JsonRecord[]).push({
    label: "(C)",
    originalExpression: "drawing conclusions",
    surroundingText: multiPassage,
  });
  const countAccepted = multiSchema.safeParse({ questions: [countDefect] }).success;

  const labelDefect = structuredClone(base);
  (labelDefect.blanks as JsonRecord[])[1].label = "(C)";
  const labelAccepted = multiSchema.safeParse({ questions: [labelDefect] }).success;

  const valuesDefect = structuredClone(base);
  ((valuesDefect.options as JsonRecord[])[1].blankValues as string[]).pop();
  const valuesAccepted = multiSchema.safeParse({ questions: [valuesDefect] }).success;

  redundancyCertificates.push(
    {
      code: "multi-blank-count",
      mechanism: "dynamic production schema rejects the wrong blank count",
      observed: baseAccepted && !countAccepted,
      evidence: { baseAccepted, defectAccepted: countAccepted },
    },
    {
      code: "multi-blank-label",
      mechanism: "dynamic production schema rejects a non-contract label",
      observed: baseAccepted && !labelAccepted,
      evidence: { baseAccepted, defectAccepted: labelAccepted },
    },
    {
      code: "multi-blank-option-values",
      mechanism: "dynamic production schema rejects incomplete blankValues",
      observed: baseAccepted && !valuesAccepted,
      evidence: { baseAccepted, defectAccepted: valuesAccepted },
    },
  );

  const missingExpression = structuredClone(base);
  (missingExpression.blanks as JsonRecord[])[0].originalExpression = "";
  const missingParsed = multiSchema.safeParse({ questions: [missingExpression] });
  assert.equal(missingParsed.success, true);
  const missingProcessed = postProcessQuestion(
    "BLANK_INFERENCE",
    multiPassage,
    (missingParsed.data as { questions: JsonRecord[] }).questions[0],
  );
  redundancyCertificates.push({
    code: "multi-blank-missing-expression",
    mechanism: "production post-process rejects an empty source expression",
    observed: !missingProcessed.success,
    evidence: { schemaAccepted: missingParsed.success, postProcessAccepted: missingProcessed.success },
  });

  const alienExpression = structuredClone(base);
  (alienExpression.blanks as JsonRecord[])[0].originalExpression =
    "an expression absent from the passage";
  const alienParsed = multiSchema.safeParse({ questions: [alienExpression] });
  assert.equal(alienParsed.success, true);
  const alienProcessed = postProcessQuestion(
    "BLANK_INFERENCE",
    multiPassage,
    (alienParsed.data as { questions: JsonRecord[] }).questions[0],
  );
  redundancyCertificates.push({
    code: "multi-blank-expression-not-in-passage",
    mechanism: "production post-process rejects a source span it cannot locate",
    observed: !alienProcessed.success,
    evidence: { schemaAccepted: alienParsed.success, postProcessAccepted: alienProcessed.success },
  });

  const validParsed = multiSchema.safeParse({ questions: [base] });
  assert.equal(validParsed.success, true);
  const validProcessed = postProcessQuestion(
    "BLANK_INFERENCE",
    multiPassage,
    (validParsed.data as { questions: JsonRecord[] }).questions[0],
  );
  assert.equal(validProcessed.success, true);
  const rendered = String(validProcessed.data?.passageWithBlank ?? "");
  const markerA = rendered.split("(A) _____").length - 1;
  const markerB = rendered.split("(B) _____").length - 1;
  redundancyCertificates.push(
    {
      code: "multi-blank-missing-passage",
      mechanism: "production post-process synthesizes passageWithBlank",
      observed: rendered.length > 0,
      evidence: { renderedLength: rendered.length },
    },
    {
      code: "multi-blank-marker-count",
      mechanism: "production post-process emits one canonical marker per blank",
      observed: markerA === 1 && markerB === 1,
      evidence: { markerA, markerB },
    },
  );

  const mismatch = multiCandidate();
  const mismatchCorrect = (mismatch.options as JsonRecord[])[0];
  mismatchCorrect.blankValues = ["evaluate several records", "record every limitation"];
  mismatchCorrect.text = "evaluate several records / record every limitation";
  const mismatchParsed = multiSchema.safeParse({ questions: [mismatch] });
  assert.equal(mismatchParsed.success, true);
  const mismatchProcessed = postProcessQuestion(
    "BLANK_INFERENCE",
    multiPassage,
    (mismatchParsed.data as { questions: JsonRecord[] }).questions[0],
  );
  assert.equal(mismatchProcessed.success, true);
  const corrected = (mismatchProcessed.data?.options as JsonRecord[]).find(
    (option) => option.label === "1",
  );
  const correctedValues = Array.isArray(corrected?.blankValues)
    ? (corrected.blankValues as string[]).join("|")
    : "";
  redundancyCertificates.push({
    code: "multi-blank-correct-option-mismatch",
    mechanism: "SOURCE_EXACT production post-process auto-fixes the correct values",
    observed:
      correctedValues === "compare multiple sources|document every uncertainty",
    evidence: { correctedValues },
  });
}

{
  const duplicate = multiCandidate();
  const options = duplicate.options as JsonRecord[];
  options[0].text = "evaluate several records / record all limitations";
  options[0].blankValues = ["evaluate several records", "record all limitations"];
  options[1].text = "trust one anecdote / record all limitations";
  options[1].blankValues = ["trust one anecdote", "record all limitations"];
  options[2].text = "evaluate several records / conceal all limitations";
  options[2].blankValues = ["evaluate several records", "conceal all limitations"];
  options[3].text = "ignore conflicting reports / conceal all limitations";
  options[3].blankValues = ["ignore conflicting reports", "conceal all limitations"];
  options[4].text = "ignore conflicting reports / conceal all limitations";
  options[4].blankValues = ["ignore conflicting reports", "conceal all limitations"];
  const parsed = parseSingle("BLANK_INFERENCE", duplicate, {
    blankInferenceBlankCount: 2,
  });
  const processed = postProcessQuestion("BLANK_INFERENCE", multiPassage, {
    ...parsed,
    blankAnswerMode: "PARAPHRASE",
  });
  assert.equal(processed.success, true);
  const observed = runQuality("BLANK_INFERENCE", processed.data as JsonRecord, multiPassage, {
    blankInferenceBlankCount: 2,
    blankInferenceParaphraseAnswer: true,
  });
  const targetEmitted = observed.issues.some(
    (issue) => issue.code === "multi-blank-duplicate-option",
  );
  const duplicateTextBlocks = observed.blockingCodes.includes("duplicate-option-text");
  assert.deepEqual(
    observed.blockingCodes,
    ["duplicate-option-text"],
    "duplicate-option certificate must isolate the pre-existing blocker",
  );
  redundancyCertificates.push({
    code: "multi-blank-duplicate-option",
    mechanism: "existing duplicate-option-text relaxed blocker covers the final candidate",
    observed: targetEmitted && duplicateTextBlocks,
    evidence: {
      schemaAccepted: true,
      postProcessAccepted: processed.success,
      targetEmitted,
      blockingCodes: observed.blockingCodes,
    },
  });
}

assert.deepEqual(
  sorted(redundancyCertificates.map((row) => row.code)),
  sorted(expectedRedundantCodes),
);
for (const certificate of redundancyCertificates) {
  assert.equal(certificate.observed, true, `${certificate.code}: redundancy not reproduced`);
}

const fatalByCode = new Map(fatalCertificates.map((row) => [row.code, row]));
const redundantByCode = new Map(redundancyCertificates.map((row) => [row.code, row]));
const aRowCertificates = aRows.map((row) => {
  const certificate = fatalByCode.get(row.targetCode);
  assert.ok(certificate, `${row.id}: no fatal certificate`);
  return {
    id: row.id,
    variant: row.variant,
    targetCode: row.targetCode,
    relaxedBlocking: RELAXED_BLOCKING_QUALITY_CODES.has(row.targetCode),
    salvageRelaxable: SALVAGE_RELAXABLE_CODES.has(row.targetCode),
    shipFirstWarning: SHIP_FIRST_WARNING_CODES.has(row.targetCode),
    schemaCertificatePassed:
      certificate.schemaAccepted &&
      certificate.postProcessAccepted &&
      certificate.targetIssueEmitted &&
      certificate.blockedByTarget &&
      certificate.otherBlockingCodes.length === 0,
  };
});
for (const row of aRowCertificates) {
  assert.equal(row.relaxedBlocking, true);
  assert.equal(row.salvageRelaxable, false);
  assert.equal(row.shipFirstWarning, false);
  assert.equal(row.schemaCertificatePassed, true);
}

const cRowCertificates = cRows.map((row) => {
  const certificate = redundantByCode.get(row.targetCode);
  assert.ok(certificate, `${row.id}: no upstream/redundancy certificate`);
  return {
    id: row.id,
    variant: row.variant,
    targetCode: row.targetCode,
    relaxedBlocking: RELAXED_BLOCKING_QUALITY_CODES.has(row.targetCode),
    certificateObserved: certificate.observed,
    mechanism: certificate.mechanism,
  };
});
for (const row of cRowCertificates) {
  assert.equal(row.relaxedBlocking, false);
  assert.equal(row.certificateObserved, true);
}

const sourceClosurePaths = [
  "src/app/api/ai/generate-questions-auto/_lib/run-question-generation-constants.ts",
  "src/app/api/ai/generate-questions-auto/_lib/run-question-generation.ts",
  "src/lib/question-ai-schemas-mc.ts",
  "src/lib/question-postprocess/index.ts",
  "src/lib/question-postprocess/processors/blank-inference.ts",
  "src/lib/question-postprocess/processors/sentence-insert.ts",
  "src/lib/question-postprocess/types.ts",
  "src/lib/question-quality/core.ts",
  "src/lib/question-quality/dispatcher.ts",
  "src/lib/question-quality/index.ts",
  "src/lib/question-quality/validators/blank/multi.ts",
  "src/lib/question-quality/validators/misc.ts",
  "src/lib/question-quality/validators/sentence-insert.ts",
  "src/lib/question-quality/validators/sentence-order.ts",
  "src/lib/question-quality/validators/summary/complete.ts",
  "src/lib/topic-sentence-writing.ts",
  "tests/unit/deterministic-structural-v12-remediation.test.ts",
] as const;

const sourceClosure = Object.fromEntries(
  sourceClosurePaths.map((path) => [
    path,
    { sha256: sha256(join(root, path)), bytes: readFileSync(join(root, path)).byteLength },
  ]),
);

const artifact = {
  schemaVersion: 1,
  study: "deterministic-structural-v12-remediation-independent-v1",
  auditDate: "2026-07-15",
  verdict: "PASS",
  scope: {
    apiCalls: 0,
    networkAccess: false,
    databaseAccess: false,
    productionSourceEditedByAudit: false,
    claim:
      "The minimal five-code v12 remediation closes all 15 A rows while all 36 C rows remain covered by independently rerun upstream/redundancy certificates.",
  },
  sealedInputs: {
    parentCorpus: { path: relative(root, parentCorpusPath).replaceAll("\\", "/"), sha256: sha256(parentCorpusPath) },
    parentOracle: { path: relative(root, parentOraclePath).replaceAll("\\", "/"), sha256: sha256(parentOraclePath) },
    parentResults: { path: relative(root, parentResultsPath).replaceAll("\\", "/"), sha256: sha256(parentResultsPath) },
    parentSeal: { path: relative(root, parentSealPath).replaceAll("\\", "/"), sha256: sha256(parentSealPath) },
    independentAdjudication: {
      path: relative(root, adjudicationPath).replaceAll("\\", "/"),
      sha256: sha256(adjudicationPath),
    },
  },
  adjudicationPopulation: {
    rowCounts: { A: 15, B: 0, C: 36, D: 0 },
    codeCounts: { A: 5, B: 0, C: 12, D: 0 },
    productionFalseNegativePopulationMatched: true,
  },
  remediationPolicy: {
    expectedFatalCodes,
    anchoredAdditions,
    exactAnchoredAdditions: true,
    policyRows,
    redundantPolicyRows,
    noUnintendedAdditionsWithinAdjudicated17: true,
  },
  fatalCertificates,
  aRowCertificates,
  redundancyCertificates,
  cRowCertificates,
  sourceClosure,
};

const outputPath = join(here, "audit.json");
const serialized = `${JSON.stringify(artifact, null, 2)}\n`;
if (process.argv.includes("--write")) {
  writeFileSync(outputPath, serialized, "utf8");
} else if (process.argv.includes("--check")) {
  assert.equal(readFileSync(outputPath, "utf8"), serialized, "audit.json is stale");
}

console.log(
  JSON.stringify({
    verdict: artifact.verdict,
    aRows: artifact.aRowCertificates.length,
    aCodes: artifact.fatalCertificates.length,
    cRows: artifact.cRowCertificates.length,
    cCodes: artifact.redundancyCertificates.length,
    bRows: artifact.adjudicationPopulation.rowCounts.B,
    dRows: artifact.adjudicationPopulation.rowCounts.D,
    sourceClosureFiles: Object.keys(sourceClosure).length,
    auditSha256: createHash("sha256").update(serialized).digest("hex"),
  }),
);
