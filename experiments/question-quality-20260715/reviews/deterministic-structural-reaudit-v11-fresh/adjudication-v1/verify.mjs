import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const auditRoot = path.dirname(here);
const repoRoot = path.resolve(here, "../../../../..");

const readText = (file) => fs.readFileSync(file, "utf8");
const readJson = (file) => JSON.parse(readText(file));
const sha256Text = (value) => crypto.createHash("sha256").update(value).digest("hex");
const sha256File = (file) => sha256Text(fs.readFileSync(file));
const sorted = (values) => [...values].sort((a, b) => a.localeCompare(b));

const corpusPath = path.join(auditRoot, "corpus.json");
const oraclePath = path.join(auditRoot, "oracle.json");
const resultsPath = path.join(auditRoot, "results.json");
const sealPath = path.join(auditRoot, "corpus.seal.json");
const adjudicationPath = path.join(here, "adjudication.json");
const manifestPath = path.join(here, "manifest.json");

const corpus = readJson(corpusPath);
const oracle = readJson(oraclePath);
const results = readJson(resultsPath);
const seal = readJson(sealPath);
const adjudication = readJson(adjudicationPath);
const manifest = readJson(manifestPath);

assert.equal(sha256File(corpusPath), seal.sha256["corpus.json"], "corpus seal mismatch");
assert.equal(sha256File(oraclePath), seal.sha256["oracle.json"], "oracle seal mismatch");
assert.equal(sha256File(corpusPath), adjudication.parentEvidence.corpusSha256);
assert.equal(sha256File(oraclePath), adjudication.parentEvidence.oracleSha256);
assert.equal(sha256File(resultsPath), adjudication.parentEvidence.resultsSha256);
assert.deepEqual(results.confusionMatrix.blocking, {
  tp: 144,
  tn: 132,
  fp: 12,
  fn: 0,
  total: 288,
  sensitivity: 1,
  specificity: 0.916667,
  precision: 0.923077,
  accuracy: 0.958333,
});

const expectedFalsePositives = [
  "EN-WORD-ORDER-RECONSTRUCT-v1-a",
  "EN-WORD-ORDER-UNSOLVED-v1-a",
  "EN-ORDER-PARAGRAPH-COUNT-v1-a",
  "EN-ORDER-SOURCE-BACKING-v1-a",
  "EN-WORD-ORDER-RECONSTRUCT-v2-a",
  "EN-WORD-ORDER-UNSOLVED-v2-a",
  "EN-ORDER-PARAGRAPH-COUNT-v2-a",
  "EN-ORDER-SOURCE-BACKING-v2-a",
  "EN-WORD-ORDER-RECONSTRUCT-v3-a",
  "EN-WORD-ORDER-UNSOLVED-v3-a",
  "EN-ORDER-PARAGRAPH-COUNT-v3-a",
  "EN-ORDER-SOURCE-BACKING-v3-a",
];
assert.deepEqual(sorted(results.misses.falsePositives), sorted(expectedFalsePositives));
assert.equal(new Set(adjudication.rows.map((row) => row.caseId)).size, 12, "duplicate adjudication row");
assert.deepEqual(sorted(adjudication.rows.map((row) => row.caseId)), sorted(expectedFalsePositives));

const cases = new Map(corpus.cases.map((entry) => [entry.caseId, entry]));
const oracleEntries = new Map(oracle.entries.map((entry) => [entry.caseId, entry]));
const resultCases = new Map(results.cases.map((entry) => [entry.caseId, entry]));

function comparableTokens(value) {
  return String(value ?? "")
    .toLowerCase()
    .match(/[a-z]+(?:['-][a-z]+)*|\d+(?:[.,]\d+)*/g) ?? [];
}

function countWords(value) {
  return String(value ?? "").match(/[A-Za-z]+(?:['-][A-Za-z]+)?|\d+(?:[.,]\d+)*/g)?.length ?? 0;
}

function occurrenceCount(haystack, needle) {
  let count = 0;
  let offset = 0;
  while (needle && (offset = haystack.indexOf(needle, offset)) >= 0) {
    count += 1;
    offset += needle.length;
  }
  return count;
}

for (const row of adjudication.rows) {
  const corpusCase = cases.get(row.caseId);
  const oracleEntry = oracleEntries.get(row.caseId);
  const resultCase = resultCases.get(row.caseId);
  assert.ok(corpusCase && oracleEntry && resultCase, `missing parent evidence for ${row.caseId}`);
  assert.equal(oracleEntry.expectedValid, true, `${row.caseId}: oracle is not a control`);
  assert.equal(resultCase.expectedValid, true);
  assert.equal(resultCase.predictedValid, false);
  assert.equal(resultCase.exactTargetClean, true);
  assert.deepEqual(resultCase.targetHits, []);
  assert.equal(corpusCase.input.typeId, row.typeId);
  assert.equal(corpusCase.familyId, row.familyId);
  assert.equal(corpusCase.variant, row.variant);
  assert.equal(row.classification, "ORACLE_CONTROL_INVALID");
  assert.ok(
    resultCase.issues.some(
      (issue) => issue.severity === "error" && issue.code === row.emittedBlockingCode,
    ),
    `${row.caseId}: missing adjudicated blocking code`,
  );
  assert.ok(
    resultCase.targetIssueCodes.includes(row.boundedFacts.namedTargetAbsent),
    `${row.caseId}: row does not bind the sealed target`,
  );

  const { passage, question } = corpusCase.input;
  if (row.typeId === "WORD_ORDER") {
    const answer = question.modelAnswer;
    const tokenCount = comparableTokens(answer).length;
    const occurrences = occurrenceCount(passage, answer);
    assert.equal(tokenCount, 9, `${row.caseId}: unexpected answer token count`);
    assert.equal(occurrences, 1, `${row.caseId}: answer must be exact source sentence once`);
    assert.equal(row.boundedFacts.modelAnswerTokenCount, tokenCount);
    assert.equal(row.boundedFacts.exactModelAnswerOccurrencesInPassage, occurrences);
    assert.equal(row.emittedBlockingCode, "writing-answer-verbatim-copy");
    assert.equal(row.rootCause, "WORD_ORDER_EXACT_SOURCE_ANSWER_LEAK");
  } else {
    assert.equal(row.typeId, "SENTENCE_ORDER");
    const paragraphs = question.paragraphs;
    assert.equal(paragraphs.length, 3);
    const wordCounts = paragraphs.map((paragraph) => countWords(paragraph.text));
    assert.deepEqual(wordCounts, [24, 25, 22], `${row.caseId}: paragraph count drift`);
    assert.ok(paragraphs.every((paragraph) => passage.includes(paragraph.text)));
    assert.deepEqual(row.boundedFacts.paragraphWordCounts, wordCounts);
    assert.equal(row.boundedFacts.paragraphCount, 3);
    assert.equal(row.boundedFacts.thinLabel, "(C)");
    assert.equal(row.emittedBlockingCode, "sentence-order-paragraph-too-thin");
    assert.equal(row.rootCause, "SENTENCE_ORDER_PARAGRAPH_C_BELOW_24_WORDS");
  }
}

const classCounts = Object.fromEntries(
  Object.keys(adjudication.summary.byClassification).map((classification) => [
    classification,
    adjudication.rows.filter((row) => row.classification === classification).length,
  ]),
);
assert.deepEqual(classCounts, adjudication.summary.byClassification);
assert.equal(adjudication.summary.total, adjudication.rows.length);
assert.equal(adjudication.rows.filter((row) => row.typeId === "WORD_ORDER").length, 6);
assert.equal(adjudication.rows.filter((row) => row.typeId === "SENTENCE_ORDER").length, 6);

for (const source of adjudication.sourceClosure) {
  const sourcePath = path.join(repoRoot, source.path);
  assert.ok(fs.existsSync(sourcePath), `missing source closure file ${source.path}`);
  assert.equal(sha256File(sourcePath), source.sha256, `source drift: ${source.path}`);
}

const essayPrompt = readText(path.join(repoRoot, "src/lib/question-prompts-essay.ts"));
assert.match(essayPrompt, /WORD_ORDER:[\s\S]*연속 6단어 이상/);
assert.match(essayPrompt, /WORD_ORDER:[\s\S]*modelAnswer가 지문 문장의 verbatim 복사/);
const dispatcher = readText(path.join(repoRoot, "src/lib/question-quality/dispatcher.ts"));
assert.match(dispatcher, /phraseTokens\.length < 6/);
assert.match(dispatcher, /Math\.ceil\(phraseTokens\.length \* 0\.8\)/);
assert.match(dispatcher, /writing-answer-verbatim-copy/);
const passagePolicy = readText(path.join(repoRoot, "src/components/exams/paper-builder/passage-policy.ts"));
assert.match(passagePolicy, /WORD_ORDER: "source"/);
assert.match(passagePolicy, /"WORD_ORDER"/);
const renderer = readText(path.join(repoRoot, "src/components/workbench/question-type-renderers.tsx"));
assert.match(renderer, /function SourcePassageBlock/);
assert.match(renderer, /function WordOrderRenderer[\s\S]*<SourcePassageBlock/);
const core = readText(path.join(repoRoot, "src/lib/question-quality/core.ts"));
assert.match(core, /SENTENCE_ORDER_MIN_PARAGRAPH_WORDS = 24/);
const orderValidator = readText(path.join(repoRoot, "src/lib/question-quality/validators/sentence-order.ts"));
assert.match(orderValidator, /wordCount < SENTENCE_ORDER_MIN_PARAGRAPH_WORDS/);
assert.match(orderValidator, /sentence-order-paragraph-too-thin/);

for (const [relative, expectedHash] of Object.entries(manifest.artifacts)) {
  assert.equal(sha256File(path.join(here, relative)), expectedHash, `artifact drift: ${relative}`);
}

const publicFiles = ["README.md", "adjudication.json", "verify.mjs", "manifest.json"];
const publicText = publicFiles.map((file) => readText(path.join(here, file))).join("\n");
for (const forbidden of [
  /AIza[0-9A-Za-z_-]{20,}/,
  /sk-[0-9A-Za-z_-]{20,}/,
  /OPENROUTER_API_KEY\s*=/,
  /GEMINI_API_KEY\s*=/,
  /DATABASE_URL\s*=/,
]) {
  assert.doesNotMatch(publicText, forbidden, `public-data hygiene failure: ${forbidden}`);
}

console.log(
  JSON.stringify(
    {
      verdict: "PASS",
      casesVerified: adjudication.rows.length,
      classifications: adjudication.summary.byClassification,
      parentSealsVerified: true,
      sourceClosureFilesVerified: adjudication.sourceClosure.length,
      artifactHashesVerified: Object.keys(manifest.artifacts).length,
      apiCalls: 0,
      databaseCalls: 0,
      networkCalls: 0,
    },
    null,
    2,
  ),
);
