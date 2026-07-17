import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFileSync(join(here, name), "utf8");
const json = (name) => JSON.parse(read(name));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const corpus = json("corpus.json");
const oracle = json("oracle.json");
const seal = json("seal.json");
const results = json("results.json");

function comparable(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function tokens(value) {
  return comparable(value).split(/\s+/).filter(Boolean);
}

function containsRun(answer, passage, minRun) {
  const answerTokens = tokens(answer);
  const passageTokens = ` ${tokens(passage).join(" ")} `;
  for (let size = answerTokens.length; size >= minRun; size -= 1) {
    for (let index = 0; index + size <= answerTokens.length; index += 1) {
      if (passageTokens.includes(` ${answerTokens.slice(index, index + size).join(" ")} `)) return true;
    }
  }
  return false;
}

test("sealed corpus and oracle bytes match the pre-run seal", () => {
  assert.equal(sha256(read("corpus.json")), seal.corpusSha256);
  assert.equal(sha256(read("oracle.json")), seal.oracleSha256);
  assert.equal(corpus.cases.length, seal.caseCount);
  assert.equal(corpus.construction.familyCount, seal.familyCount);
});

test("384 cases form 64 families with three lexical defect/control pairs each", () => {
  assert.equal(corpus.cases.length, 384);
  assert.equal(corpus.construction.familyCount, 64);
  const families = new Map();
  for (const item of corpus.cases) {
    const rows = families.get(item.familyId) ?? [];
    rows.push(item);
    families.set(item.familyId, rows);
  }
  assert.equal(families.size, 64);
  for (const rows of families.values()) {
    assert.equal(rows.length, 6);
    assert.deepEqual([...new Set(rows.map((row) => row.variant))], [1, 2, 3]);
    for (const variant of [1, 2, 3]) {
      assert.deepEqual(rows.filter((row) => row.variant === variant).map((row) => row.role).sort(), ["control", "defect"]);
    }
  }
  assert.equal(oracle.cases.length, corpus.cases.length);
});

test("target-code exactness is perfect and every control is globally valid", () => {
  assert.deepEqual(results.targetExactness, {
    tp: 192,
    tn: 192,
    fp: 0,
    fn: 0,
    sensitivity: 1,
    specificity: 1,
  });
  assert.deepEqual(results.sourceAwareControlValidity, {
    controlCount: 192,
    validCount: 192,
    invalidCount: 0,
    invalidIds: [],
  });
  assert.deepEqual(results.failures.targetFalsePositiveIds, []);
  assert.deepEqual(results.failures.targetFalseNegativeIds, []);
  assert.deepEqual(results.failures.productionFalsePositiveIds, []);
});

test("production policy gap is preserved rather than hidden by target exactness", () => {
  assert.equal(results.verdict, "PARTIAL");
  assert.deepEqual(results.productionBlocking, {
    tp: 138,
    tn: 195,
    fp: 0,
    fn: 51,
    sensitivity: 138 / 189,
    specificity: 1,
  });
  assert.equal(results.targetPolicy.policyGapTargetCount, 17);
  assert.equal(results.targetPolicy.policyGapTargets.length, 17);
  assert.equal(results.failures.productionFalseNegativeIds.length, 51);
  assert.deepEqual(results.targetPolicy.acceptedNonblockingTargets, ["blank-target-list-like"]);
});

test("WORD_ORDER controls are reconstructable without a six-token source copy", () => {
  const controls = corpus.cases.filter((item) => item.role === "control" && item.sourceKind === "word-order");
  assert.ok(controls.length > 0);
  for (const item of controls) {
    const { question, passage } = item.input;
    const answerTokens = tokens(question.modelAnswer);
    const chipTokens = question.scrambledWords.flatMap(tokens);
    assert.deepEqual([...chipTokens].sort(), [...answerTokens].sort(), item.id);
    assert.notEqual(question.scrambledWords.join(" "), question.modelAnswer, item.id);
    assert.equal(containsRun(question.modelAnswer, passage, 6), false, item.id);
  }
});

test("SENTENCE_ORDER controls satisfy source, sentence, word, and nontrivial-key contracts", () => {
  const controls = corpus.cases.filter((item) => item.role === "control" && item.sourceKind === "sentence-order");
  assert.ok(controls.length > 0);
  for (const item of controls) {
    const { question, passage } = item.input;
    assert.equal(question.paragraphs.length, 3, item.id);
    assert.deepEqual(question.paragraphs.map((paragraph) => paragraph.label), ["(A)", "(B)", "(C)"], item.id);
    for (const paragraph of question.paragraphs) {
      assert.ok(paragraph.text.split(/(?<=[.!?])\s+/).length >= 2, item.id);
      assert.ok(tokens(paragraph.text).length >= 24, item.id);
      assert.ok(comparable(passage).includes(comparable(paragraph.text)), item.id);
    }
    const correct = question.options.find((option) => option.label === question.correctAnswer);
    assert.notEqual(correct.text, "(A)-(B)-(C)", item.id);
  }
});
