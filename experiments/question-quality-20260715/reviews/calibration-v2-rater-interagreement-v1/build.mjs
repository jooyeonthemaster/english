import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const outputPath = path.join(here, "report.json");
const privateOutputRoot = path.join(here, "private");
const grades = ["F", "C", "B", "A"];

const raterRoots = {
  A: "experiments/question-quality-20260715/design/reviewer-calibration-packet-v2/private/issued/rater-a",
  B: "experiments/question-quality-20260715/design/reviewer-calibration-packet-v2/private/issued/rater-b",
};
const artifactNames = ["phase1.json", "submission.json", "seal.json", "private-map.json", "reveal.json", "review-records.json"];

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort((left, right) => left.localeCompare(right)).map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function stableJson(value) {
  return JSON.stringify(canonical(value));
}

function sha(value) {
  return createHash("sha256").update(value).digest("hex");
}

function load(relative) {
  const absolute = path.join(repoRoot, relative);
  const bytes = readFileSync(absolute);
  return { relative, bytesSha256: sha(bytes), value: JSON.parse(bytes.toString("utf8")) };
}

function loadRater(root) {
  const loaded = Object.fromEntries(artifactNames.map((name) => [name, load(`${root}/${name}`)]));
  const phase1 = loaded["phase1.json"].value;
  const submission = loaded["submission.json"].value;
  const seal = loaded["seal.json"].value;
  const privateMap = loaded["private-map.json"].value;
  const reveal = loaded["reveal.json"].value;
  const records = loaded["review-records.json"].value;
  assert.equal(phase1.items.length, 24);
  assert.equal(submission.answers.length, 24);
  assert.equal(privateMap.rows.length, 24);
  assert.equal(reveal.items.length, 24);
  assert.equal(records.length, 24);
  assert.equal(submission.phase1PacketSha256, sha(stableJson(phase1)));
  assert.equal(seal.phase1PacketSha256, sha(stableJson(phase1)));
  assert.equal(seal.phase1SubmissionSha256, sha(stableJson(submission)));
  assert.equal(reveal.phase1PacketSha256, sha(stableJson(phase1)));
  assert.equal(reveal.phase1SubmissionSha256, sha(stableJson(submission)));
  assert.equal(reveal.phase1SealSha256, sha(stableJson(seal)));
  assert.equal(phase1.privateMapSha256, sha(stableJson(privateMap)));
  return { loaded, phase1, submission, seal, privateMap, reveal, records };
}

function sortedUnique(values) {
  return [...new Set(values)].sort();
}

function canonicalAnswer(answer, displayToCanonical) {
  if (answer.kind === "SINGLE_LABEL") {
    return { kind: answer.kind, labels: [displayToCanonical[answer.label] ?? answer.label] };
  }
  if (answer.kind === "MULTIPLE_LABELS") {
    return { kind: answer.kind, labels: sortedUnique(answer.labels.map((label) => displayToCanonical[label] ?? label)) };
  }
  if (answer.kind === "SINGLE_TEXT") {
    return { kind: answer.kind, normalizedTextSha256: answer.text.normalizedTextSha256 };
  }
  if (answer.kind === "MULTIPLE_TEXTS") {
    return { kind: answer.kind, normalizedTextSha256: sortedUnique(answer.texts.map((row) => row.normalizedTextSha256)) };
  }
  return { kind: answer.kind };
}

function canonicalDiagnostics(record, displayToCanonical) {
  if (record.block === "GRAMMAR") {
    return record.grammarSiteJudgments.map((row) => ({
      site: displayToCanonical[row.site] ?? row.site,
      displayedGrammaticality: row.displayedGrammaticality,
      diagnosis: row.diagnosis,
      pointFamily: row.pointFamily,
      correctionSha256: sha(row.correction),
      correctionRestoresSource: row.correctionRestoresSource,
      explanationAccurate: row.explanationAccurate,
    })).sort((left, right) => left.site.localeCompare(right.site));
  }
  if (record.block === "BLANK") {
    return {
      options: record.blankOptionJudgments.map((row) => ({
        label: displayToCanonical[row.label] ?? row.label,
        slotGrammarCompatible: row.slotGrammarCompatible,
        passageGrounded: row.passageGrounded,
        primaryIntentAxis: row.primaryIntentAxis,
        divergentAxes: sortedUnique(row.divergentAxes),
        singleDecisiveFlaw: row.singleDecisiveFlaw,
      })).sort((left, right) => left.label.localeCompare(right.label)),
      axes: record.blankAxisJudgments.map((row) => ({
        axis: row.axis,
        answerPreserved: row.answerPreserved,
      })).sort((left, right) => left.axis.localeCompare(right.axis)),
    };
  }
  return [];
}

function indexedRater(data) {
  const phase1ByPseudo = new Map(data.phase1.items.map((row) => [row.itemPseudonym, row]));
  const answerByPseudo = new Map(data.submission.answers.map((row) => [row.itemPseudonym, row]));
  const revealByPseudo = new Map(data.reveal.items.map((row) => [row.itemPseudonym, row]));
  const recordByPseudo = new Map(data.records.map((row) => [row.itemPseudonym, row]));
  const seenIds = new Set();
  const indexed = new Map();
  const reboundRecords = [];
  const bindingAudit = [];
  for (const mapRow of data.privateMap.rows) {
    const pseudo = mapRow.itemPseudonym;
    const issued = phase1ByPseudo.get(pseudo);
    const answer = answerByPseudo.get(pseudo);
    const reveal = revealByPseudo.get(pseudo);
    const record = recordByPseudo.get(pseudo);
    assert(issued && answer && reveal && record, `missing bound artifact for ${pseudo}`);
    assert.equal(mapRow.surfaceSha256, issued.surfaceSha256);
    assert.equal(answer.surfaceSha256, issued.surfaceSha256);
    assert.equal(record.surfaceSha256, issued.surfaceSha256);
    const expectedMapRowSha256 = sha(stableJson(mapRow));
    const mapBundleSha256 = sha(stableJson(data.privateMap));
    const expectedRevealBundleSha256 = sha(stableJson(data.reveal));
    const revealRowSha256 = sha(stableJson(reveal));
    assert.equal(record.phase1SubmissionSha256, sha(stableJson(data.submission)));
    assert.equal(stableJson(record.blindAnswer), stableJson(answer.answer));
    assert.equal(record.blindAnswerSetSha256, answer.answerSetSha256);
    assert(!seenIds.has(mapRow.itemId), `duplicate item ID ${mapRow.itemId}`);
    seenIds.add(mapRow.itemId);
    const canonicalBlindAnswer = canonicalAnswer(answer.answer, mapRow.displayToCanonical);
    const diagnostics = canonicalDiagnostics(record, mapRow.displayToCanonical);
    const rebound = {
      ...record,
      relabelMapSha256: expectedMapRowSha256,
      phase2RevealSha256: expectedRevealBundleSha256,
    };
    const changedFields = Object.keys(record).filter((key) => stableJson(record[key]) !== stableJson(rebound[key]));
    assert(changedFields.every((field) => ["relabelMapSha256", "phase2RevealSha256"].includes(field)));
    reboundRecords.push(rebound);
    bindingAudit.push({
      itemId: mapRow.itemId,
      relabelMapBinding: record.relabelMapSha256 === expectedMapRowSha256 ? "ROW_CORRECT" : record.relabelMapSha256 === mapBundleSha256 ? "BUNDLE_INCORRECT" : "OTHER_INCORRECT",
      phase2RevealBinding: record.phase2RevealSha256 === expectedRevealBundleSha256 ? "BUNDLE_CORRECT" : record.phase2RevealSha256 === revealRowSha256 ? "ROW_INCORRECT" : "OTHER_INCORRECT",
      changedFields,
    });
    indexed.set(mapRow.itemId, {
      itemId: mapRow.itemId,
      block: record.block,
      grade: record.grade,
      anyFatal: record.anyFatal,
      fatalDomains: sortedUnique(record.fatalDomains),
      fatalCodes: sortedUnique(record.fatalCodes),
      canonicalBlindAnswerSha256: sha(stableJson(canonicalBlindAnswer)),
      diagnostics,
      diagnosticsSha256: sha(stableJson(diagnostics)),
    });
  }
  assert.equal(indexed.size, 24);
  return { indexed, reboundRecords, bindingAudit };
}

function fraction(numerator, denominator) {
  return { numerator, denominator, value: denominator === 0 ? null : numerator / denominator };
}

function qwk(rows) {
  const n = rows.length;
  const aCounts = grades.map((grade) => rows.filter((row) => row.a.grade === grade).length);
  const bCounts = grades.map((grade) => rows.filter((row) => row.b.grade === grade).length);
  let observed = 0;
  let expected = 0;
  for (let i = 0; i < grades.length; i += 1) {
    for (let j = 0; j < grades.length; j += 1) {
      const weight = ((i - j) / (grades.length - 1)) ** 2;
      observed += weight * rows.filter((row) => row.a.grade === grades[i] && row.b.grade === grades[j]).length / n;
      expected += weight * (aCounts[i] / n) * (bCounts[j] / n);
    }
  }
  return expected === 0 ? 1 : 1 - observed / expected;
}

function metrics(rows) {
  const exact = (field) => rows.filter((row) => stableJson(row.a[field]) === stableJson(row.b[field])).length;
  const gradeConfusion = Object.fromEntries(grades.map((aGrade) => [aGrade, Object.fromEntries(grades.map((bGrade) => [bGrade, rows.filter((row) => row.a.grade === aGrade && row.b.grade === bGrade).length]))]));
  return {
    items: rows.length,
    blindAnswerExact: fraction(exact("canonicalBlindAnswerSha256"), rows.length),
    fatalFlagExact: fraction(exact("anyFatal"), rows.length),
    fatalDomainSetExact: fraction(exact("fatalDomains"), rows.length),
    gradeExact: fraction(exact("grade"), rows.length),
    typeDiagnosticExact: fraction(exact("diagnosticsSha256"), rows.length),
    quadraticWeightedKappaGrade: qwk(rows),
    gradeConfusionAByB: gradeConfusion,
    fatalConfusionAByB: {
      fatal_fatal: rows.filter((row) => row.a.anyFatal && row.b.anyFatal).length,
      fatal_nonfatal: rows.filter((row) => row.a.anyFatal && !row.b.anyFatal).length,
      nonfatal_fatal: rows.filter((row) => !row.a.anyFatal && row.b.anyFatal).length,
      nonfatal_nonfatal: rows.filter((row) => !row.a.anyFatal && !row.b.anyFatal).length,
    },
  };
}

function fieldAgreement(pairs, fields) {
  return Object.fromEntries(fields.map((field) => {
    const agree = pairs.filter(([left, right]) => stableJson(left?.[field]) === stableJson(right?.[field])).length;
    return [field, fraction(agree, pairs.length)];
  }));
}

function focusDiagnosticFieldAgreement(rows) {
  const grammarPairs = rows.filter((row) => row.block === "GRAMMAR").flatMap((row) =>
    row.a.diagnostics.map((left) => [left, row.b.diagnostics.find((right) => right.site === left.site)]));
  const blankOptionPairs = rows.filter((row) => row.block === "BLANK").flatMap((row) =>
    row.a.diagnostics.options.map((left) => [left, row.b.diagnostics.options.find((right) => right.label === left.label)]));
  const blankAxisPairs = rows.filter((row) => row.block === "BLANK").flatMap((row) =>
    row.a.diagnostics.axes.map((left) => [left, row.b.diagnostics.axes.find((right) => right.axis === left.axis)]));
  return {
    grammarSites: {
      comparisons: grammarPairs.length,
      fields: fieldAgreement(grammarPairs, ["displayedGrammaticality", "diagnosis", "pointFamily", "correctionSha256", "correctionRestoresSource", "explanationAccurate"]),
    },
    blankOptions: {
      comparisons: blankOptionPairs.length,
      fields: fieldAgreement(blankOptionPairs, ["slotGrammarCompatible", "passageGrounded", "primaryIntentAxis", "divergentAxes", "singleDecisiveFlaw"]),
    },
    blankAxes: {
      comparisons: blankAxisPairs.length,
      fields: fieldAgreement(blankAxisPairs, ["answerPreserved"]),
    },
  };
}

export function buildArtifacts() {
  const rawA = loadRater(raterRoots.A);
  const rawB = loadRater(raterRoots.B);
  const indexedA = indexedRater(rawA);
  const indexedB = indexedRater(rawB);
  const a = indexedA.indexed;
  const b = indexedB.indexed;
  assert.deepEqual([...a.keys()].sort(), [...b.keys()].sort());
  const rows = [...a.keys()].sort().map((itemId) => {
    const left = a.get(itemId);
    const right = b.get(itemId);
    assert.equal(left.block, right.block);
    return { itemId, block: left.block, a: left, b: right };
  });
  const disagreementRows = rows.filter((row) =>
    row.a.canonicalBlindAnswerSha256 !== row.b.canonicalBlindAnswerSha256 ||
    row.a.anyFatal !== row.b.anyFatal || row.a.grade !== row.b.grade ||
    stableJson(row.a.fatalDomains) !== stableJson(row.b.fatalDomains) ||
    row.a.diagnosticsSha256 !== row.b.diagnosticsSha256
  ).map((row) => ({
    itemId: row.itemId,
    block: row.block,
    blindAnswerExact: row.a.canonicalBlindAnswerSha256 === row.b.canonicalBlindAnswerSha256,
    fatalFlagExact: row.a.anyFatal === row.b.anyFatal,
    fatalDomainSetExact: stableJson(row.a.fatalDomains) === stableJson(row.b.fatalDomains),
    gradeExact: row.a.grade === row.b.grade,
    typeDiagnosticExact: row.a.diagnosticsSha256 === row.b.diagnosticsSha256,
    raterA: { grade: row.a.grade, anyFatal: row.a.anyFatal, fatalDomains: row.a.fatalDomains },
    raterB: { grade: row.b.grade, anyFatal: row.b.anyFatal, fatalDomains: row.b.fatalDomains },
  }));
  const inputArtifacts = Object.fromEntries(Object.entries({ A: rawA, B: rawB }).map(([key, raw]) => [key, Object.fromEntries(Object.entries(raw.loaded).map(([name, loaded]) => [name, { path: loaded.relative, bytesSha256: loaded.bytesSha256 }]))]));
  const derivedTexts = {
    A: `${JSON.stringify(indexedA.reboundRecords, null, 2)}\n`,
    B: `${JSON.stringify(indexedB.reboundRecords, null, 2)}\n`,
  };
  const bindingSummary = (audit) => ({
    items: audit.length,
    sourceRelabelMapBinding: Object.fromEntries(sortedUnique(audit.map((row) => row.relabelMapBinding)).map((mode) => [mode, audit.filter((row) => row.relabelMapBinding === mode).length])),
    sourcePhase2RevealBinding: Object.fromEntries(sortedUnique(audit.map((row) => row.phase2RevealBinding)).map((mode) => [mode, audit.filter((row) => row.phase2RevealBinding === mode).length])),
    mechanicallyChangedFieldCounts: Object.fromEntries(["relabelMapSha256", "phase2RevealSha256"].map((field) => [field, audit.filter((row) => row.changedFields.includes(field)).length])),
  });
  const core = {
    schemaVersion: "question-quality-calibration-v2-rater-interagreement-v1",
    status: "SOURCE_BINDING_DEFECTS_MECHANICALLY_REBOUND_INTER_RATER_DISAGREEMENT_NOT_GOLD",
    scope: "Two independently sealed reviewer judgments only; no author hypothesis, adjudicator result, or gold is an input. Derived bundles change only scorer-binding hashes.",
    inputArtifacts,
    sourceBindingAudit: { A: bindingSummary(indexedA.bindingAudit), B: bindingSummary(indexedB.bindingAudit) },
    mechanicallyReboundArtifacts: {
      A: { path: "private/rater-a-review-records-score-bound.json", bytesSha256: sha(derivedTexts.A), semanticSha256: sha(stableJson(indexedA.reboundRecords)) },
      B: { path: "private/rater-b-review-records-score-bound.json", bytesSha256: sha(derivedTexts.B), semanticSha256: sha(stableJson(indexedB.reboundRecords)) },
      permittedChangedFields: ["relabelMapSha256", "phase2RevealSha256"],
      judgmentMutationAllowed: false,
    },
    aggregate: metrics(rows),
    byBlock: Object.fromEntries(["GRAMMAR", "BLANK", "NONFOCUS"].map((block) => [block, metrics(rows.filter((row) => row.block === block))])),
    focusDiagnosticFieldAgreement: focusDiagnosticFieldAgreement(rows),
    disagreementItems: disagreementRows,
    activity: { externalNetworkCalls: 0, providerCalls: 0, modelCalls: 0, apiCandidatesConsumed: 0, databaseCalls: 0, secretReads: 0 },
  };
  return { report: { ...core, reportSemanticSha256: sha(stableJson(core)) }, derivedTexts };
}

export function buildReport() {
  return buildArtifacts().report;
}

function main() {
  const mode = process.argv[2];
  if (!["--write", "--check"].includes(mode)) throw new Error("choose exactly one of --write or --check");
  const built = buildArtifacts();
  const text = `${JSON.stringify(built.report, null, 2)}\n`;
  if (mode === "--write") {
    mkdirSync(here, { recursive: true });
    mkdirSync(privateOutputRoot, { recursive: true, mode: 0o700 });
    writeFileSync(path.join(privateOutputRoot, "rater-a-review-records-score-bound.json"), built.derivedTexts.A, { encoding: "utf8", mode: 0o600 });
    writeFileSync(path.join(privateOutputRoot, "rater-b-review-records-score-bound.json"), built.derivedTexts.B, { encoding: "utf8", mode: 0o600 });
    writeFileSync(outputPath, text, "utf8");
  } else {
    assert.equal(readFileSync(outputPath, "utf8"), text, "inter-rater report drift");
    assert.equal(readFileSync(path.join(privateOutputRoot, "rater-a-review-records-score-bound.json"), "utf8"), built.derivedTexts.A, "rater A rebound drift");
    assert.equal(readFileSync(path.join(privateOutputRoot, "rater-b-review-records-score-bound.json"), "utf8"), built.derivedTexts.B, "rater B rebound drift");
  }
  process.stdout.write(`${JSON.stringify({ verdict: "PASS_INTER_RATER_REPRODUCIBLE_NOT_GOLD", reportSha256: sha(text), candidates: 0, network: 0 }, null, 2)}\n`);
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) main();
