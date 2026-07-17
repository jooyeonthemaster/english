import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const parent = resolve(here, "..");
const repo = resolve(here, "../../../../..");
const write = process.argv.includes("--write");

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function jsonBytes(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function text(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function comparable(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function tokens(value) {
  return comparable(value).match(/[a-z]+(?:['-][a-z]+)*|\d+(?:[.,]\d+)*/g) ?? [];
}

function permutations(values) {
  if (values.length < 2) return [values];
  return values.flatMap((value, index) =>
    permutations([...values.slice(0, index), ...values.slice(index + 1)]).map(
      (tail) => [value, ...tail],
    ),
  );
}

function inversionCount(order) {
  let count = 0;
  for (let left = 0; left < order.length; left += 1) {
    for (let right = left + 1; right < order.length; right += 1) {
      if (order[left] > order[right]) count += 1;
    }
  }
  return count;
}

function maximumContiguousSourceRun(answer, passage) {
  const answerTokens = tokens(answer);
  const source = ` ${tokens(passage).join(" ")} `;
  let maximum = 0;
  for (let start = 0; start < answerTokens.length; start += 1) {
    for (let end = start + 1; end <= answerTokens.length; end += 1) {
      const run = answerTokens.slice(start, end);
      if (source.includes(` ${run.join(" ")} `)) maximum = Math.max(maximum, run.length);
    }
  }
  return maximum;
}

function wordCount(value) {
  return tokens(value).length;
}

function sentenceCount(value) {
  return text(value).split(/(?<=[.!?])\s+/).filter(Boolean).length;
}

function runProductionCertificates() {
  const tsxCli = join(repo, "node_modules", "tsx", "dist", "cli.mjs");
  const script = join(here, "production-certificates.mts");
  const run = spawnSync(process.execPath, [tsxCli, script], {
    cwd: repo,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" },
  });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const parsed = JSON.parse(run.stdout);
  assert.equal(parsed.verdict, "PASS");
  return parsed;
}

const dispositionByCode = {
  "generic-answer-count": {
    disposition: "A",
    reason:
      "A schema-conforming response can expose a different number of keyed labels than the requested answer cardinality, making the scoring contract internally inconsistent.",
    productionMechanism: "Reachable after schema parsing; no independent relaxed blocker.",
    references: ["src/lib/question-quality/dispatcher.ts"],
  },
  "generic-multi-answer-direction": {
    disposition: "A",
    reason:
      "A multi-answer key can ship with a single-answer direction, so the student-facing task and scoring contract disagree.",
    productionMechanism: "Reachable after schema parsing; no independent relaxed blocker.",
    references: ["src/lib/question-quality/dispatcher.ts"],
  },
  "sentence-order-paragraph-body-label": {
    disposition: "A",
    reason:
      "A paragraph body can contain a visible ordering label that contaminates the material students must sequence and may disclose structure.",
    productionMechanism: "Schema-conforming and not repaired by post-processing; no independent relaxed blocker.",
    references: ["src/lib/question-quality/validators/sentence-order.ts"],
  },
  "sentence-order-dependent-fragment": {
    disposition: "A",
    reason:
      "A displayed order block can begin with a subordinate dependent fragment, leaving a structurally broken item even when its key is synchronized.",
    productionMechanism: "Schema-conforming and not repaired by post-processing; no independent relaxed blocker.",
    references: ["src/lib/question-quality/validators/sentence-order.ts"],
  },
  "sentence-insert-missing-given": {
    disposition: "A",
    reason:
      "The insertion sentence can be empty while sourceSentenceToOmit lets post-processing succeed, producing an unanswerable student task.",
    productionMechanism: "Reachable after schema parsing and sentence-insert post-processing; no independent relaxed blocker.",
    references: [
      "src/lib/question-postprocess/processors/sentence-insert.ts",
      "src/lib/question-quality/validators/sentence-insert.ts",
    ],
  },
  "type-foreign-field": {
    disposition: "C",
    reason:
      "The production Zod object contract strips unknown type-foreign fields before the final candidate reaches quality validation.",
    productionMechanism: "Upstream schema normalization makes the audited defect unreachable.",
    references: ["src/lib/question-ai-schemas-mc.ts", "src/lib/question-quality/validators/misc.ts"],
  },
  "scrambled-near-answer-order": {
    disposition: "C",
    reason:
      "The production finalizer deterministically reorders WORD_ORDER chips away from answer order before quality validation.",
    productionMechanism: "Upstream deterministic rewrite repairs the audited state.",
    references: [
      "src/app/api/ai/generate-questions-auto/_lib/run-question-generation.ts",
      "src/lib/topic-sentence-writing.ts",
    ],
  },
  "summary-complete-missing-blank-answer": {
    disposition: "C",
    reason: "The SUMMARY_COMPLETE response schema requires every blank answer.",
    productionMechanism: "Schema rejection precedes final quality policy.",
    references: ["src/lib/question-schemas-essay.ts"],
  },
  "multi-blank-count": {
    disposition: "C",
    reason: "The dynamic multi-blank schema fixes the requested blank count and post-processing rejects out-of-range counts.",
    productionMechanism: "Schema and post-process rejection precede final quality policy.",
    references: ["src/lib/question-ai-schemas-mc.ts", "src/lib/question-postprocess/processors/blank-inference.ts"],
  },
  "multi-blank-label": {
    disposition: "C",
    reason: "The dynamic schema restricts labels and post-processing canonicalizes labels by passage order.",
    productionMechanism: "Schema or deterministic normalization removes the audited state.",
    references: ["src/lib/question-ai-schemas-mc.ts", "src/lib/question-postprocess/processors/blank-inference.ts"],
  },
  "multi-blank-missing-expression": {
    disposition: "C",
    reason: "Multi-blank post-processing rejects an empty originalExpression before final validation.",
    productionMechanism: "Post-process rejection precedes final quality policy.",
    references: ["src/lib/question-postprocess/processors/blank-inference.ts"],
  },
  "multi-blank-expression-not-in-passage": {
    disposition: "C",
    reason: "Multi-blank post-processing must locate each originalExpression in the source and rejects a miss.",
    productionMechanism: "Post-process rejection precedes final quality policy.",
    references: ["src/lib/question-postprocess/processors/blank-inference.ts"],
  },
  "multi-blank-missing-passage": {
    disposition: "C",
    reason: "Multi-blank post-processing constructs passageWithBlank deterministically from the source passage.",
    productionMechanism: "The final candidate receives a synthesized passageWithBlank.",
    references: ["src/lib/question-postprocess/processors/blank-inference.ts"],
  },
  "multi-blank-marker-count": {
    disposition: "C",
    reason: "Multi-blank post-processing constructs exactly one canonical marker for every located source span.",
    productionMechanism: "The final candidate receives canonical markers.",
    references: ["src/lib/question-postprocess/processors/blank-inference.ts"],
  },
  "multi-blank-option-values": {
    disposition: "C",
    reason: "The dynamic schema enforces blankValues length and post-processing rejects missing or empty values.",
    productionMechanism: "Schema or post-process rejection precedes final quality policy.",
    references: ["src/lib/question-ai-schemas-mc.ts", "src/lib/question-postprocess/processors/blank-inference.ts"],
  },
  "multi-blank-duplicate-option": {
    disposition: "C",
    reason:
      "Post-processing derives option text from blankValues, so duplicate combinations also emit duplicate-option-text, which is already relaxed-blocking.",
    productionMechanism: "Existing independent relaxed blocker duplicate-option-text covers the same final candidate.",
    references: [
      "src/lib/question-postprocess/processors/blank-inference.ts",
      "src/app/api/ai/generate-questions-auto/_lib/run-question-generation-constants.ts",
    ],
  },
  "multi-blank-correct-option-mismatch": {
    disposition: "C",
    reason:
      "SOURCE_EXACT post-processing auto-fixes a mismatched correct combination; current INTERMEDIATE production forces PARAPHRASE, where the audited source-exact mismatch contract does not apply.",
    productionMechanism: "Deterministic repair or a different production mode removes the audited state.",
    references: [
      "src/lib/question-postprocess/processors/blank-inference.ts",
      "src/app/api/ai/generate-questions-auto/_lib/run-question-generation.ts",
    ],
  },
};

const fatalCodes = Object.entries(dispositionByCode)
  .filter(([, value]) => value.disposition === "A")
  .map(([code]) => code)
  .sort();
const redundantCodes = Object.entries(dispositionByCode)
  .filter(([, value]) => value.disposition === "C")
  .map(([code]) => code)
  .sort();

assert.equal(fatalCodes.length, 5);
assert.equal(redundantCodes.length, 12);

const corpusPath = join(parent, "corpus.json");
const oraclePath = join(parent, "oracle.json");
const resultsPath = join(parent, "results.json");
const sealPath = join(parent, "seal.json");
const corpusBytes = readFileSync(corpusPath);
const oracleBytes = readFileSync(oraclePath);
const resultsBytes = readFileSync(resultsPath);
const sealBytes = readFileSync(sealPath);
const corpus = JSON.parse(corpusBytes);
const results = JSON.parse(resultsBytes);
const seal = JSON.parse(sealBytes);

assert.equal(sha256(corpusBytes), seal.corpusSha256);
assert.equal(sha256(oracleBytes), seal.oracleSha256);
assert.equal(corpus.cases.length, 384);

const caseById = new Map(corpus.cases.map((item) => [item.id, item]));
const resultById = new Map(results.rows.map((row) => [row.id, row]));
const falseNegativeIds = results.failures.productionFalseNegativeIds;
assert.equal(falseNegativeIds.length, 51);

const falseNegativeRows = falseNegativeIds.map((id) => {
  const item = caseById.get(id);
  assert.ok(item, id);
  assert.equal(item.role, "defect", id);
  const decision = dispositionByCode[item.targetCode];
  assert.ok(decision, `${id}: missing adjudication for ${item.targetCode}`);
  return {
    id,
    familyId: item.familyId,
    variant: item.variant,
    targetCode: item.targetCode,
    disposition: decision.disposition,
  };
});

for (const code of Object.keys(dispositionByCode)) {
  assert.equal(falseNegativeRows.filter((row) => row.targetCode === code).length, 3, code);
}

const controls = corpus.cases.filter((item) => item.role === "control");
assert.equal(controls.length, 192);

const invalidSemanticFamilies = new Set([
  "generic-answer-count",
  "generic-multi-direction",
]);

function classifyControl(item) {
  const question = item.input.question;
  const parentRow = resultById.get(item.id);
  assert.equal(parentRow?.sourceAudit?.valid, true, item.id);

  if (invalidSemanticFamilies.has(item.familyId)) {
    const labels = text(question.correctAnswer).match(/[A-Za-z]|\d+/g) ?? [];
    return {
      category: "INVALID_SEMANTIC_KEY",
      evidence: {
        keyedLabels: labels,
        option2Text: question.options?.[1]?.text,
        explanation: question.explanation,
        conflict:
          "Option 2 is keyed although it is the vivid-anecdote claim rejected by the passage, and the explanation says the first option alone is correct.",
      },
    };
  }

  if (item.sourceKind === "grammar-correction") {
    return {
      category: "INVALID_EXPLANATION_GRAMMAR",
      evidence: {
        explanation: question.explanation,
        conflict:
          "As written, unquoted plural reports is followed by singular requires; if reports is a metalinguistic label, the required quotation delimiters are absent.",
      },
    };
  }

  if (item.sourceKind === "summary-complete") {
    assert.equal(Object.hasOwn(item.input, "passage"), false, item.id);
    return {
      category: "SOURCE_UNVERIFIABLE",
      evidence: {
        passagePresent: false,
        limitation:
          "The corpus omits the source passage, so summary fidelity and answer support cannot be independently checked.",
      },
    };
  }

  if (item.sourceKind === "multi-blank" || item.sourceKind === "blank-single") {
    assert.equal(question.difficulty, "INTERMEDIATE", item.id);
    assert.equal(question.blankAnswerMode, undefined, item.id);
    return {
      category: "VALID_UNIT_BUT_PRODUCTION_PROFILE_MISMATCH",
      evidence: {
        difficulty: question.difficulty,
        corpusBlankAnswerMode: null,
        corpusCorrectAnswerProfile: "SOURCE_EXACT",
        productionFinalizerProfile: "PARAPHRASE",
        limitation:
          "The control is internally source-exact, but it does not represent the current INTERMEDIATE finalizer profile.",
      },
    };
  }

  return {
    category: "CONFIRMED_GLOBALLY_VALID",
    evidence: {
      parentStructuralAuditValid: true,
      independentExceptionFound: false,
    },
  };
}

const controlRows = controls.map((item) => ({
  id: item.id,
  familyId: item.familyId,
  sourceKind: item.sourceKind,
  targetCode: item.targetCode,
  ...classifyControl(item),
}));

const controlCategories = [
  "CONFIRMED_GLOBALLY_VALID",
  "INVALID_SEMANTIC_KEY",
  "INVALID_EXPLANATION_GRAMMAR",
  "SOURCE_UNVERIFIABLE",
  "VALID_UNIT_BUT_PRODUCTION_PROFILE_MISMATCH",
];
const controlCounts = Object.fromEntries(
  controlCategories.map((category) => [
    category,
    controlRows.filter((row) => row.category === category).length,
  ]),
);
assert.deepEqual(controlCounts, {
  CONFIRMED_GLOBALLY_VALID: 117,
  INVALID_SEMANTIC_KEY: 6,
  INVALID_EXPLANATION_GRAMMAR: 12,
  SOURCE_UNVERIFIABLE: 15,
  VALID_UNIT_BUT_PRODUCTION_PROFILE_MISMATCH: 42,
});

const wordOrderRows = controls
  .filter((item) => item.sourceKind === "word-order")
  .map((item) => {
    const question = item.input.question;
    const chips = question.scrambledWords.map(text);
    const modelAnswer = text(question.modelAnswer);
    const reconstructionOrder = permutations(chips.map((_, index) => index)).find(
      (order) => comparable(order.map((index) => chips[index]).join(" ")) === comparable(modelAnswer),
    );
    assert.ok(reconstructionOrder, item.id);
    const inversions = inversionCount(reconstructionOrder);
    const forwardAdjacencies = reconstructionOrder
      .slice(1)
      .filter((value, index) => value === reconstructionOrder[index] + 1).length;
    const sourceMaximumContiguousRun = maximumContiguousSourceRun(
      modelAnswer,
      item.input.passage,
    );
    assert.ok(inversions >= 4, item.id);
    assert.equal(forwardAdjacencies, 0, item.id);
    assert.ok(sourceMaximumContiguousRun < 6, item.id);
    return {
      id: item.id,
      answerTokenCount: tokens(modelAnswer).length,
      reconstructionOrder,
      inversionCount: inversions,
      forwardAdjacencyCount: forwardAdjacencies,
      sourceMaximumContiguousRun,
      sixTokenSourceCopy: sourceMaximumContiguousRun >= 6,
    };
  });
assert.equal(wordOrderRows.length, 15);

const sentenceOrderRows = controls
  .filter((item) => item.sourceKind === "sentence-order")
  .map((item) => {
    const question = item.input.question;
    const paragraphByLabel = new Map(
      question.paragraphs.map((paragraph) => [paragraph.label, paragraph.text]),
    );
    const correctOption = question.options.find(
      (option) => text(option.label) === text(question.correctAnswer),
    );
    const correctOrder = text(correctOption?.text)
      .match(/[ABC]/g)
      ?.map((label) => `(${label})`) ?? [];
    const keyedParagraphs = correctOrder.map((label) => paragraphByLabel.get(label));
    const rebuilt = [question.givenSentence, ...keyedParagraphs].join(" ");
    const blockWordCounts = question.paragraphs.map((paragraph) => wordCount(paragraph.text));
    const blockSentenceCounts = question.paragraphs.map((paragraph) =>
      sentenceCount(paragraph.text),
    );
    const allBlocksSourceBacked = question.paragraphs.every((paragraph) =>
      comparable(item.input.passage).includes(comparable(paragraph.text)),
    );
    const exactSourceReconstruction = comparable(rebuilt) === comparable(item.input.passage);
    assert.deepEqual(question.paragraphs.map((paragraph) => paragraph.label), ["(A)", "(B)", "(C)"], item.id);
    assert.ok(blockWordCounts.every((count) => count >= 24), item.id);
    assert.ok(blockSentenceCounts.every((count) => count >= 2), item.id);
    assert.equal(allBlocksSourceBacked, true, item.id);
    assert.equal(exactSourceReconstruction, true, item.id);
    assert.notEqual(correctOrder.join(""), "(A)(B)(C)", item.id);
    return {
      id: item.id,
      correctOrder,
      blockWordCounts,
      blockSentenceCounts,
      allBlocksSourceBacked,
      exactSourceReconstruction,
      keyIsVisibleAbcOrder: correctOrder.join("") === "(A)(B)(C)",
    };
  });
assert.equal(sentenceOrderRows.length, 42);

const sentenceWordCounts = sentenceOrderRows.flatMap((row) => row.blockWordCounts);
const productionCertificates = runProductionCertificates();
assert.deepEqual([...productionCertificates.proposedFatalCodes].sort(), fatalCodes);

const sourceFiles = [
  "src/app/api/ai/generate-questions-auto/_lib/run-question-generation-constants.ts",
  "src/app/api/ai/generate-questions-auto/_lib/run-question-generation.ts",
  "src/lib/question-quality/core.ts",
  "src/lib/question-quality/dispatcher.ts",
  "src/lib/question-quality/validators/misc.ts",
  "src/lib/question-quality/validators/summary/complete.ts",
  "src/lib/question-quality/validators/sentence-order.ts",
  "src/lib/question-quality/validators/blank/multi.ts",
  "src/lib/question-quality/validators/sentence-insert.ts",
  "src/lib/question-postprocess/processors/blank-inference.ts",
  "src/lib/question-postprocess/processors/sentence-insert.ts",
  "src/lib/question-postprocess/types.ts",
  "src/lib/topic-sentence-writing.ts",
  "src/lib/question-ai-schemas-mc.ts",
  "src/lib/question-schemas-essay.ts",
];
const sourceClosure = Object.fromEntries(
  sourceFiles.map((relativePath) => {
    const bytes = readFileSync(join(repo, relativePath));
    return [relativePath, { sha256: sha256(bytes), bytes: bytes.length }];
  }),
);

const codeRows = Object.entries(dispositionByCode)
  .map(([code, decision]) => ({
    code,
    ...decision,
    falseNegativeIds: falseNegativeRows
      .filter((row) => row.targetCode === code)
      .map((row) => row.id),
  }))
  .sort((left, right) => left.code.localeCompare(right.code));

const artifact = {
  schemaVersion: 1,
  study: "deterministic-structural-reaudit-v12-blind/adjudication-independent-v1",
  adjudicationDate: "2026-07-15",
  scope: {
    apiCalls: 0,
    networkAccess: false,
    databaseAccess: false,
    productionSourceEdited: false,
    method:
      "Independent review of current contracts, post-processing, final validator severity/policy, and every sealed v12 control.",
  },
  sealedParentInputs: {
    corpus: { sha256: sha256(corpusBytes), bytes: corpusBytes.length },
    oracle: { sha256: sha256(oracleBytes), bytes: oracleBytes.length },
    results: { sha256: sha256(resultsBytes), bytes: resultsBytes.length },
    seal: { sha256: sha256(sealBytes), bytes: sealBytes.length },
  },
  falseNegativeAdjudication: {
    population: { rows: 51, codes: 17, variantsPerCode: 3 },
    legend: {
      A: "fatal-must-block",
      B: "deliberate-craft-warning",
      C: "already-redundantly-blocked-or-repaired-upstream",
      D: "ambiguous-needs-more-evidence",
    },
    countsByDisposition: { A: 15, B: 0, C: 36, D: 0 },
    codeCountsByDisposition: { A: 5, B: 0, C: 12, D: 0 },
    codeRows,
    rows: falseNegativeRows,
  },
  controlRevalidation: {
    claimUnderReview: "192/192 globally valid controls",
    verdict: "OVERTURNED",
    counts: { total: 192, ...controlCounts },
    conclusion:
      "Only 117 controls are independently confirmed globally valid. Six contain a contradictory semantic key, twelve contain defective explanation prose, fifteen omit the source needed for verification, and forty-two are valid source-exact units but mismatch the current INTERMEDIATE PARAPHRASE production profile.",
    rows: controlRows,
  },
  specialContractRevalidation: {
    wordOrder: {
      controlCount: wordOrderRows.length,
      allReconstructable: true,
      allStronglyShuffled: wordOrderRows.every(
        (row) => row.inversionCount >= 4 && row.forwardAdjacencyCount === 0,
      ),
      sixTokenSourceCopyCount: wordOrderRows.filter((row) => row.sixTokenSourceCopy).length,
      maximumObservedSourceRun: Math.max(
        ...wordOrderRows.map((row) => row.sourceMaximumContiguousRun),
      ),
      rows: wordOrderRows,
    },
    sentenceOrder: {
      controlCount: sentenceOrderRows.length,
      paragraphBlockCount: sentenceWordCounts.length,
      minimumBlockWords: Math.min(...sentenceWordCounts),
      maximumBlockWords: Math.max(...sentenceWordCounts),
      allBlocksAtLeast24Words: sentenceWordCounts.every((count) => count >= 24),
      allBlocksAtLeastTwoSentences: sentenceOrderRows.every((row) =>
        row.blockSentenceCounts.every((count) => count >= 2),
      ),
      allSourceBackedAndExactlyReconstructable: sentenceOrderRows.every(
        (row) => row.allBlocksSourceBacked && row.exactSourceReconstruction,
      ),
      visibleAbcKeyCount: sentenceOrderRows.filter((row) => row.keyIsVisibleAbcOrder)
        .length,
      rows: sentenceOrderRows,
    },
  },
  remediation: {
    minimumRelaxedBlocklistAdditions: fatalCodes,
    explicitlyExcludedAsRedundant: redundantCodes,
    acceptedCraftWarningOutsideThe17PolicyGaps: ["blank-target-list-like"],
    productionEditPerformed: false,
    costStatement:
      "The proposed gate additions use already-computed deterministic validator issues and add no model or API call. They can increase regeneration only when one of the five fatal states occurs; this audit does not estimate that incidence.",
  },
  productionReachabilityCertificates: productionCertificates,
  sourceClosure,
};

if (write) {
  writeFileSync(join(here, "adjudication.json"), jsonBytes(artifact));
}

console.log(
  JSON.stringify(
    {
      verdict: "PASS",
      wrote: write,
      fnDisposition: artifact.falseNegativeAdjudication.countsByDisposition,
      controls: artifact.controlRevalidation.counts,
      wordOrder: artifact.specialContractRevalidation.wordOrder.controlCount,
      sentenceOrder: artifact.specialContractRevalidation.sentenceOrder.controlCount,
      proposedAdditions: fatalCodes,
    },
    null,
    2,
  ),
);
