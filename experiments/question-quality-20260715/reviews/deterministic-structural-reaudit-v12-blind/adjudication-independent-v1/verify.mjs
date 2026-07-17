import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const parent = resolve(here, "..");
const repo = resolve(here, "../../../../..");

function hash(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function load(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function clean(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function normalized(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function words(value) {
  return normalized(value).match(/[a-z]+(?:['-][a-z]+)*|\d+(?:[.,]\d+)*/g) ?? [];
}

function maxSourceRun(answer, passage) {
  const answerWords = words(answer);
  const passageWords = words(passage);
  let maximum = 0;
  for (let answerStart = 0; answerStart < answerWords.length; answerStart += 1) {
    for (let passageStart = 0; passageStart < passageWords.length; passageStart += 1) {
      let length = 0;
      while (
        answerStart + length < answerWords.length &&
        passageStart + length < passageWords.length &&
        answerWords[answerStart + length] === passageWords[passageStart + length]
      ) {
        length += 1;
      }
      maximum = Math.max(maximum, length);
    }
  }
  return maximum;
}

function multisetReconstructable(chips, answer) {
  const available = new Map();
  for (const token of chips.flatMap(words)) {
    available.set(token, (available.get(token) ?? 0) + 1);
  }
  for (const token of words(answer)) {
    const count = available.get(token) ?? 0;
    if (count === 0) return false;
    available.set(token, count - 1);
  }
  return [...available.values()].every((count) => count === 0);
}

function runCertificates() {
  const cli = join(repo, "node_modules", "tsx", "dist", "cli.mjs");
  const result = spawnSync(
    process.execPath,
    [cli, join(here, "production-certificates.mts")],
    { cwd: repo, encoding: "utf8", env: { ...process.env, NO_COLOR: "1" } },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

const expectedFatalCodes = [
  "generic-answer-count",
  "generic-multi-answer-direction",
  "sentence-insert-missing-given",
  "sentence-order-dependent-fragment",
  "sentence-order-paragraph-body-label",
];
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
];

const adjudication = load(join(here, "adjudication.json"));
const corpusBytes = readFileSync(join(parent, "corpus.json"));
const oracleBytes = readFileSync(join(parent, "oracle.json"));
const resultsBytes = readFileSync(join(parent, "results.json"));
const sealBytes = readFileSync(join(parent, "seal.json"));
const corpus = JSON.parse(corpusBytes);
const results = JSON.parse(resultsBytes);
const seal = JSON.parse(sealBytes);

assert.equal(hash(corpusBytes), seal.corpusSha256);
assert.equal(hash(oracleBytes), seal.oracleSha256);
assert.deepEqual(adjudication.sealedParentInputs, {
  corpus: { sha256: hash(corpusBytes), bytes: corpusBytes.length },
  oracle: { sha256: hash(oracleBytes), bytes: oracleBytes.length },
  results: { sha256: hash(resultsBytes), bytes: resultsBytes.length },
  seal: { sha256: hash(sealBytes), bytes: sealBytes.length },
});

assert.deepEqual(adjudication.scope, {
  apiCalls: 0,
  networkAccess: false,
  databaseAccess: false,
  productionSourceEdited: false,
  method:
    "Independent review of current contracts, post-processing, final validator severity/policy, and every sealed v12 control.",
});

const caseById = new Map(corpus.cases.map((item) => [item.id, item]));
const fn = adjudication.falseNegativeAdjudication;
assert.deepEqual(fn.countsByDisposition, { A: 15, B: 0, C: 36, D: 0 });
assert.deepEqual(fn.codeCountsByDisposition, { A: 5, B: 0, C: 12, D: 0 });
assert.equal(fn.rows.length, 51);
assert.deepEqual(
  fn.rows.map((row) => row.id),
  results.failures.productionFalseNegativeIds,
);

const fatalCodes = fn.codeRows
  .filter((row) => row.disposition === "A")
  .map((row) => row.code)
  .sort();
const redundantCodes = fn.codeRows
  .filter((row) => row.disposition === "C")
  .map((row) => row.code)
  .sort();
assert.deepEqual(fatalCodes, expectedFatalCodes);
assert.deepEqual(redundantCodes, expectedRedundantCodes);
assert.equal(fn.codeRows.some((row) => row.disposition === "B"), false);
assert.equal(fn.codeRows.some((row) => row.disposition === "D"), false);

for (const row of fn.rows) {
  const item = caseById.get(row.id);
  const codeDecision = fn.codeRows.find((decision) => decision.code === row.targetCode);
  assert.ok(item, row.id);
  assert.equal(item.role, "defect", row.id);
  assert.equal(item.targetCode, row.targetCode, row.id);
  assert.equal(row.disposition, codeDecision.disposition, row.id);
}
for (const decision of fn.codeRows) {
  assert.equal(decision.falseNegativeIds.length, 3, decision.code);
}

assert.deepEqual(adjudication.remediation.minimumRelaxedBlocklistAdditions, expectedFatalCodes);
assert.deepEqual(
  adjudication.remediation.explicitlyExcludedAsRedundant,
  expectedRedundantCodes,
);
assert.deepEqual(
  adjudication.remediation.acceptedCraftWarningOutsideThe17PolicyGaps,
  ["blank-target-list-like"],
);
assert.equal(adjudication.remediation.productionEditPerformed, false);

const productionCertificates = runCertificates();
assert.deepEqual(productionCertificates, adjudication.productionReachabilityCertificates);
assert.deepEqual([...productionCertificates.proposedFatalCodes].sort(), expectedFatalCodes);
assert.deepEqual(
  [...productionCertificates.expectedRedundantCodes].sort(),
  expectedRedundantCodes,
);
assert.deepEqual(
  productionCertificates.redundancyCertificates.map((row) => row.code).sort(),
  expectedRedundantCodes,
);
assert.equal(
  productionCertificates.redundancyCertificates.every((row) => row.observed),
  true,
);
for (const code of expectedFatalCodes) {
  const certificate = productionCertificates.certificates.find((row) => row.code === code);
  const policy = productionCertificates.policy.find((row) => row.code === code);
  assert.ok(certificate, code);
  assert.equal(certificate.schemaAccepted, true, code);
  assert.equal(certificate.postProcessAccepted, true, code);
  assert.equal(certificate.emitted, true, code);
  assert.equal(certificate.independentlyBlocked, false, code);
  assert.deepEqual(certificate.blockingCodes, [], code);
  assert.deepEqual(policy, {
    code,
    currentlyRelaxedBlocking: false,
    currentlyShipFirstWarning: false,
  });
}
const duplicateCertificate = productionCertificates.certificates.find(
  (row) => row.code === "multi-blank-duplicate-option",
);
assert.equal(duplicateCertificate.independentlyBlocked, true);
assert.deepEqual(duplicateCertificate.blockingCodes, ["duplicate-option-text"]);

const controls = corpus.cases.filter((item) => item.role === "control");
assert.equal(controls.length, 192);
assert.equal(adjudication.controlRevalidation.rows.length, 192);
const adjudicatedControlById = new Map(
  adjudication.controlRevalidation.rows.map((row) => [row.id, row]),
);
const independentCounts = {
  CONFIRMED_GLOBALLY_VALID: 0,
  INVALID_SEMANTIC_KEY: 0,
  INVALID_EXPLANATION_GRAMMAR: 0,
  SOURCE_UNVERIFIABLE: 0,
  VALID_UNIT_BUT_PRODUCTION_PROFILE_MISMATCH: 0,
};

for (const item of controls) {
  const q = item.input.question;
  let expectedCategory = "CONFIRMED_GLOBALLY_VALID";

  if (item.familyId === "generic-answer-count" || item.familyId === "generic-multi-direction") {
    expectedCategory = "INVALID_SEMANTIC_KEY";
    assert.match(clean(q.correctAnswer), /2/);
    assert.match(clean(q.options[1].text), /vivid anecdote/i);
    assert.match(clean(q.explanation), /first option alone/i);
  } else if (item.sourceKind === "grammar-correction") {
    expectedCategory = "INVALID_EXPLANATION_GRAMMAR";
    assert.match(clean(q.explanation), /antecedent reports requires/i);
    assert.doesNotMatch(clean(q.explanation), /["'“”]reports["'“”]/);
  } else if (item.sourceKind === "summary-complete") {
    expectedCategory = "SOURCE_UNVERIFIABLE";
    assert.equal(Object.hasOwn(item.input, "passage"), false, item.id);
  } else if (item.sourceKind === "multi-blank" || item.sourceKind === "blank-single") {
    expectedCategory = "VALID_UNIT_BUT_PRODUCTION_PROFILE_MISMATCH";
    assert.equal(q.difficulty, "INTERMEDIATE", item.id);
    assert.equal(q.blankAnswerMode, undefined, item.id);
    const correct = q.options.find((option) => clean(option.label) === clean(q.correctAnswer));
    assert.ok(correct, item.id);
    if (item.sourceKind === "multi-blank") {
      assert.deepEqual(
        correct.blankValues.map(normalized),
        q.blanks.map((blank) => normalized(blank.originalExpression)),
        item.id,
      );
    } else {
      assert.equal(normalized(correct.text), normalized(q.originalExpression), item.id);
    }
  }

  independentCounts[expectedCategory] += 1;
  assert.equal(adjudicatedControlById.get(item.id)?.category, expectedCategory, item.id);
}

assert.deepEqual(independentCounts, {
  CONFIRMED_GLOBALLY_VALID: 117,
  INVALID_SEMANTIC_KEY: 6,
  INVALID_EXPLANATION_GRAMMAR: 12,
  SOURCE_UNVERIFIABLE: 15,
  VALID_UNIT_BUT_PRODUCTION_PROFILE_MISMATCH: 42,
});
assert.deepEqual(adjudication.controlRevalidation.counts, {
  total: 192,
  ...independentCounts,
});
assert.equal(adjudication.controlRevalidation.verdict, "OVERTURNED");

const wordOrderControls = controls.filter((item) => item.sourceKind === "word-order");
const wordAudit = adjudication.specialContractRevalidation.wordOrder;
assert.equal(wordOrderControls.length, 15);
assert.equal(wordAudit.rows.length, 15);
for (const item of wordOrderControls) {
  const q = item.input.question;
  const row = wordAudit.rows.find((candidate) => candidate.id === item.id);
  assert.ok(row, item.id);
  assert.equal(multisetReconstructable(q.scrambledWords, q.modelAnswer), true, item.id);
  assert.notEqual(normalized(q.scrambledWords.join(" ")), normalized(q.modelAnswer), item.id);
  assert.equal(maxSourceRun(q.modelAnswer, item.input.passage), row.sourceMaximumContiguousRun, item.id);
  assert.ok(row.sourceMaximumContiguousRun < 6, item.id);
  assert.ok(row.inversionCount >= 4, item.id);
  assert.equal(row.forwardAdjacencyCount, 0, item.id);
}
assert.equal(wordAudit.sixTokenSourceCopyCount, 0);
assert.equal(wordAudit.maximumObservedSourceRun, 0);
assert.equal(wordAudit.allReconstructable, true);
assert.equal(wordAudit.allStronglyShuffled, true);

const sentenceOrderControls = controls.filter(
  (item) => item.sourceKind === "sentence-order",
);
const sentenceAudit = adjudication.specialContractRevalidation.sentenceOrder;
const observedBlockWords = [];
assert.equal(sentenceOrderControls.length, 42);
assert.equal(sentenceAudit.rows.length, 42);
for (const item of sentenceOrderControls) {
  const q = item.input.question;
  const row = sentenceAudit.rows.find((candidate) => candidate.id === item.id);
  const byLabel = new Map(q.paragraphs.map((paragraph) => [paragraph.label, paragraph.text]));
  const correctOption = q.options.find(
    (option) => clean(option.label) === clean(q.correctAnswer),
  );
  const order = clean(correctOption.text).match(/[ABC]/g).map((label) => `(${label})`);
  const rebuilt = [q.givenSentence, ...order.map((label) => byLabel.get(label))].join(" ");
  assert.deepEqual(order, row.correctOrder, item.id);
  assert.notDeepEqual(order, ["(A)", "(B)", "(C)"], item.id);
  assert.equal(normalized(rebuilt), normalized(item.input.passage), item.id);
  for (const [index, paragraph] of q.paragraphs.entries()) {
    const count = words(paragraph.text).length;
    observedBlockWords.push(count);
    assert.ok(count >= 24, item.id);
    assert.equal(count, row.blockWordCounts[index], item.id);
    assert.ok(clean(paragraph.text).split(/(?<=[.!?])\s+/).length >= 2, item.id);
    assert.ok(normalized(item.input.passage).includes(normalized(paragraph.text)), item.id);
  }
}
assert.equal(sentenceAudit.paragraphBlockCount, 126);
assert.equal(Math.min(...observedBlockWords), 26);
assert.equal(Math.max(...observedBlockWords), 27);
assert.equal(sentenceAudit.minimumBlockWords, 26);
assert.equal(sentenceAudit.maximumBlockWords, 27);
assert.equal(sentenceAudit.visibleAbcKeyCount, 0);
assert.equal(sentenceAudit.allBlocksAtLeast24Words, true);
assert.equal(sentenceAudit.allBlocksAtLeastTwoSentences, true);
assert.equal(sentenceAudit.allSourceBackedAndExactlyReconstructable, true);

const runtimeSource = readFileSync(
  join(repo, "src/app/api/ai/generate-questions-auto/_lib/run-question-generation.ts"),
  "utf8",
);
assert.match(
  runtimeSource,
  /effectiveDiffLabel\s*===\s*"KILLER"\s*\|\|\s*effectiveDiffLabel\s*===\s*"INTERMEDIATE"/,
);
assert.match(runtimeSource, /blankAnswerMode:\s*"PARAPHRASE"/);
assert.match(runtimeSource, /reorderChipsAwayFromAnswer/);

for (const [relativePath, expected] of Object.entries(adjudication.sourceClosure)) {
  const bytes = readFileSync(join(repo, relativePath));
  assert.deepEqual(
    { sha256: hash(bytes), bytes: bytes.length },
    expected,
    relativePath,
  );
}

const manifest = load(join(here, "manifest.json"));
assert.equal(manifest.schemaVersion, 1);
assert.equal(manifest.study, adjudication.study);
assert.equal(manifest.verdict, "PASS");
for (const [name, expected] of Object.entries(manifest.files)) {
  const bytes = readFileSync(join(here, name));
  assert.deepEqual({ sha256: hash(bytes), bytes: bytes.length }, expected, name);
}

const expectedArtifactFiles = [
  "README.md",
  "adjudication.json",
  "build-adjudication.mjs",
  "finalize-manifest.mjs",
  "manifest.json",
  "production-certificates.mts",
  "tsconfig.json",
  "verify.mjs",
].sort();
assert.deepEqual(
  readdirSync(here).filter((name) => !name.startsWith(".")).sort(),
  expectedArtifactFiles,
);

const secretPatterns = [
  /AIza[0-9A-Za-z_-]{20,}/,
  /\bsk-[0-9A-Za-z_-]{20,}/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
];
for (const name of expectedArtifactFiles.filter((file) => file !== "manifest.json")) {
  const source = readFileSync(join(here, name), "utf8");
  for (const pattern of secretPatterns) {
    assert.equal(pattern.test(source), false, `${name}: secret-like material`);
  }
}

console.log(
  JSON.stringify(
    {
      verdict: "PASS",
      falseNegativeRows: fn.rows.length,
      dispositions: fn.countsByDisposition,
      controlCounts: adjudication.controlRevalidation.counts,
      wordOrderControls: wordOrderControls.length,
      sentenceOrderControls: sentenceOrderControls.length,
      sourceClosureFiles: Object.keys(adjudication.sourceClosure).length,
      artifactFiles: Object.keys(manifest.files).length,
    },
    null,
    2,
  ),
);
