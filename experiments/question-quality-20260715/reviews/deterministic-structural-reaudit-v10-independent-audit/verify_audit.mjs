import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const auditDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(auditDirectory, "../../../..");
const authorDirectory = path.join(
  repoRoot,
  "experiments/question-quality-20260715/reviews/deterministic-structural-reaudit-v10",
);

const manifest = await readJson(path.join(auditDirectory, "MANIFEST.json"));
assert.equal(
  manifest.schemaVersion,
  "deterministic-structural-v10-independent-final-manifest-v1",
);
assert.equal(manifest.auditId, "deterministic-structural-reaudit-v10-independent-audit");

await verifyManifestFileSet();
await verifyExternalInputs();

const [
  authorManifest,
  sourceBytes,
  extractionReceipt,
  blindBytes,
  mapBytes,
  predictionBytes,
  predictionSeal,
  adjudication,
  sourceAware,
  sourceClosure,
  accessAttestation,
  testResults,
] = await Promise.all([
  readJson(path.join(authorDirectory, "PRE_INSPECTION_MANIFEST.json")),
  readFile(path.join(authorDirectory, "cases.json")),
  readJson(path.join(auditDirectory, "BLIND_EXTRACTION.json")),
  readFile(path.join(auditDirectory, "blinded-cases.json")),
  readFile(path.join(auditDirectory, "sealed-blind-map.json")),
  readFile(path.join(auditDirectory, "predictions.json")),
  readJson(path.join(auditDirectory, "PREDICTION_SEAL.json")),
  readJson(path.join(auditDirectory, "adjudication.json")),
  readJson(path.join(auditDirectory, "source-aware-adjudication.json")),
  readJson(path.join(auditDirectory, "SOURCE_CLOSURE.json")),
  readJson(path.join(auditDirectory, "PROCESS_ACCESS_ATTESTATION.json")),
  readJson(path.join(auditDirectory, "TEST_RESULTS.json")),
]);

const source = JSON.parse(sourceBytes.toString("utf8"));
const blind = JSON.parse(blindBytes.toString("utf8"));
const blindMap = JSON.parse(mapBytes.toString("utf8"));
const predictions = JSON.parse(predictionBytes.toString("utf8"));

await verifyAuthorSeal(authorManifest);
verifySourceCorpus(source);
await verifyBlindExtraction();
await verifyPredictionSealAndSourceClosure();
verifyRawAdjudication();
await verifySourceAwareAdjudication();
await verifyIntegrityAndExternalSystems();
verifyManifestClaims();

process.stdout.write(
  [
    "VERIFY_AUDIT_OK deterministic-structural-reaudit-v10-independent-audit",
    "RAW 125/200 accuracy=0.625 TP=25 FN=75 FP=0 TN=100",
    "SOURCE_AWARE confirmed_product_contract=34 oracle_scope_mismatch=41 ambiguous=0 redundant_upstream=0",
    "FAMILIES summary=13/12 grammar=0/19 complete_units=10/10 standalone_labels=11/0",
    `AUTHOR_SEAL ${authorManifest.payloadSealSha256}`,
    `BLIND_SHA256 ${sha256(blindBytes)}`,
    `RUNNER_SHA256 ${predictionSeal.runnerSha256}`,
    `PREDICTIONS_SHA256 ${sha256(predictionBytes)}`,
    `SOURCE_CLOSURE_SHA256 ${sourceClosure.aggregateSha256}`,
    "API_CALLS 0",
    "NETWORK_ATTEMPTS 0",
    "DATABASE_CALLS 0",
    "ESTIMATED_COST_USD 0",
    "INTEGRITY_QUALIFICATION supervisor_contaminated=true computationally_sealed=true os_filesystem_sandbox=false",
  ].join("\n") + "\n",
);

async function verifyManifestFileSet() {
  const actualNames = (await readdir(auditDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name !== "MANIFEST.json")
    .map((entry) => entry.name)
    .sort();
  const declaredNames = manifest.artifactFiles.map(({ path: filePath }) => filePath);
  assert.deepEqual(declaredNames, actualNames, "manifest must seal every audit file exactly once");
  assert.equal(new Set(declaredNames).size, declaredNames.length);
  for (const entry of manifest.artifactFiles) {
    const bytes = await readFile(path.join(auditDirectory, entry.path));
    assert.equal(bytes.length, entry.bytes, `${entry.path} byte count`);
    assert.equal(sha256(bytes), entry.sha256, `${entry.path} hash`);
  }
}

async function verifyExternalInputs() {
  const expected = [
    "IMMUTABILITY.md",
    "ORACLE_PROTOCOL.md",
    "PRE_INSPECTION_MANIFEST.json",
    "cases.json",
    "verify_author_seal.ps1",
  ].sort();
  const declared = manifest.externalSealedInputs
    .map(({ path: filePath }) => path.basename(filePath))
    .sort();
  assert.deepEqual(declared, expected);
  for (const entry of manifest.externalSealedInputs) {
    const bytes = await readFile(path.join(authorDirectory, path.basename(entry.path)));
    assert.equal(bytes.length, entry.bytes, `${entry.path} byte count`);
    assert.equal(sha256(bytes), entry.sha256, `${entry.path} hash`);
  }
}

async function verifyAuthorSeal(authorManifest) {
  assert.equal(authorManifest.sealedBeforeProductionInspection, true);
  assert.equal(authorManifest.counts.total, 200);
  const lines = [];
  for (const entry of authorManifest.sealedFiles) {
    const bytes = await readFile(path.join(authorDirectory, entry.path));
    assert.equal(bytes.length, entry.bytes, `author ${entry.path} byte count`);
    assert.equal(sha256(bytes), entry.sha256, `author ${entry.path} hash`);
    lines.push(`${entry.path}\t${entry.bytes}\t${entry.sha256}\n`);
  }
  assert.equal(sha256(lines.join("")), authorManifest.payloadSealSha256);
  assert.equal(
    authorManifest.payloadSealSha256,
    "2ddce4ecbebdcbb5d411a812185f2613d3639a727ab4ded3e8aa594c231fbc03",
  );
  assert.equal(
    sha256(sourceBytes),
    "002ed425202c28f3dc7476d9381a6b65bce8e66f0616ebbeddb000d56221a222",
  );
}

function verifySourceCorpus(source) {
  assert.equal(source.cases.length, 200);
  assert.equal(new Set(source.cases.map(({ id }) => id)).size, 200);
  const families = [
    "SUMMARY_COMPLETE_MC",
    "GRAMMAR_ERROR_LEADING_LABEL",
    "SENTENCE_ORDER_COMPLETE_UNITS",
    "SENTENCE_ORDER_STANDALONE_LABELS",
  ];
  for (const family of families) {
    const rows = source.cases.filter((row) => row.family === family);
    assert.equal(rows.length, 50, `${family} row count`);
    assert.equal(rows.filter(({ expected }) => expected === "DEFECT").length, 25);
    assert.equal(rows.filter(({ expected }) => expected === "NORMAL").length, 25);
  }
  const pairs = Map.groupBy(source.cases, ({ pairId }) => pairId);
  assert.equal(pairs.size, 100);
  for (const [pairId, rows] of pairs) {
    assert.equal(rows.length, 2, `${pairId} pair cardinality`);
    assert.deepEqual(
      rows.map(({ expected }) => expected).sort(),
      ["DEFECT", "NORMAL"],
      `${pairId} labels`,
    );
    assert.equal(new Set(rows.map(({ family }) => family)).size, 1);
  }
}

async function verifyBlindExtraction() {
  assert.equal(extractionReceipt.sourceSha256, sha256(sourceBytes));
  assert.equal(extractionReceipt.blindSha256, sha256(blindBytes));
  assert.equal(extractionReceipt.mappingSha256, sha256(mapBytes));
  assert.equal(
    extractionReceipt.extractorSha256,
    sha256(await readFile(path.join(auditDirectory, "extract_blind.mjs"))),
  );
  assert.equal(blind.caseCount, 200);
  assert.equal(blindMap.caseCount, 200);
  assert.equal(new Set(blind.cases.map(({ blindId }) => blindId)).size, 200);
  assert.equal(new Set(blindMap.mapping.map(({ sourceId }) => sourceId)).size, 200);

  const ordered = source.cases
    .map((caseValue, sourceIndex) => ({
      caseValue,
      sourceIndex,
      orderKey: sha256(
        `${authorManifest.payloadSealSha256}\0independent-v10-blind-order\0${sourceIndex}`,
      ),
    }))
    .sort((left, right) => left.orderKey.localeCompare(right.orderKey));
  const expectedCases = [];
  const expectedMap = [];
  for (const [blindIndex, { caseValue, sourceIndex }] of ordered.entries()) {
    const blindId = `B${String(blindIndex + 1).padStart(3, "0")}`;
    expectedMap.push({ blindId, sourceIndex, sourceId: caseValue.id });
    expectedCases.push({
      blindId,
      family: caseValue.family,
      language: caseValue.language,
      fixture: projectFixture(caseValue.fixture, caseValue.family),
    });
  }
  assert.deepEqual(blindMap.mapping, expectedMap, "blind map deterministic replay");
  assert.deepEqual(blind.cases, expectedCases, "blind projection deterministic replay");
  assertProjectionContainsNoOracleMetadata(blind);
}

async function verifyPredictionSealAndSourceClosure() {
  assert.equal(predictionSeal.predictionsSha256, sha256(predictionBytes));
  assert.equal(predictionSeal.blindSha256, sha256(blindBytes));
  assert.equal(predictionSeal.caseCount, 200);
  const sealedRunnerBytes = await readFile(
    path.join(auditDirectory, "run_blind_predictions.pre-adjudication-sealed.txt"),
  );
  assert.equal(predictionSeal.runnerSha256, sha256(sealedRunnerBytes));
  assert.equal(
    predictionSeal.runnerSha256,
    "9586c15b3ac1eeb1eb36ea83ff1c7de89b15203982692196c286cb1b18ba9e79",
  );
  assert.equal(predictions.runnerSha256, predictionSeal.runnerSha256);
  assert.equal(predictions.caseCount, 200);
  assert.equal(predictions.predictions.length, 200);
  assert.equal(new Set(predictions.predictions.map(({ blindId }) => blindId)).size, 200);

  assert.equal(sourceClosure.fileCount, sourceClosure.files.length);
  assert.equal(sourceClosure.fileCount, 56);
  const closureLines = [];
  for (const entry of sourceClosure.files) {
    const bytes = await readFile(path.join(repoRoot, entry.path));
    assert.equal(bytes.length, entry.bytes, `${entry.path} source byte count`);
    assert.equal(sha256(bytes), entry.sha256, `${entry.path} source hash`);
    closureLines.push(`${entry.path}\t${entry.bytes}\t${entry.sha256}\n`);
  }
  assert.equal(sha256(closureLines.join("")), sourceClosure.aggregateSha256);
  assert.equal(
    sourceClosure.aggregateSha256,
    "c77ed3b68eaf67da61ef157a182c84d4366833d6a5c0373bec318440517427f7",
  );
  const closureByPath = new Map(sourceClosure.files.map((entry) => [entry.path, entry]));
  for (const entry of predictions.productionSourceHashes) {
    assert.equal(closureByPath.get(entry.path)?.sha256, entry.sha256);
  }
}

function verifyRawAdjudication() {
  const predictionByBlindId = new Map(
    predictions.predictions.map((prediction) => [prediction.blindId, prediction]),
  );
  const joined = blindMap.mapping.map((entry) => {
    const sourceCase = source.cases[entry.sourceIndex];
    const prediction = predictionByBlindId.get(entry.blindId);
    assert.equal(sourceCase.id, entry.sourceId);
    assert.equal(prediction.family, sourceCase.family);
    assert.equal(prediction.language, sourceCase.language);
    assert.ok(["DEFECT", "NORMAL"].includes(prediction.prediction));
    return { sourceCase, prediction };
  });
  const confusion = confusionFor(joined);
  assert.deepEqual(confusion, { tp: 25, fn: 75, fp: 0, tn: 100 });
  assert.equal(adjudication.caseCount, 200);
  assert.equal(adjudication.overall.correct, 125);
  assert.equal(adjudication.overall.accuracy, 0.625);
  assert.deepEqual(adjudication.overall.confusion, {
    expectedDefectPredictedDefect: 25,
    expectedDefectPredictedNormal: 75,
    expectedNormalPredictedDefect: 0,
    expectedNormalPredictedNormal: 100,
  });

  const expectedFamilies = {
    SUMMARY_COMPLETE_MC: { tp: 0, fn: 25, fp: 0, tn: 25 },
    GRAMMAR_ERROR_LEADING_LABEL: { tp: 6, fn: 19, fp: 0, tn: 25 },
    SENTENCE_ORDER_COMPLETE_UNITS: { tp: 5, fn: 20, fp: 0, tn: 25 },
    SENTENCE_ORDER_STANDALONE_LABELS: { tp: 14, fn: 11, fp: 0, tn: 25 },
  };
  for (const [family, expected] of Object.entries(expectedFamilies)) {
    assert.deepEqual(
      confusionFor(joined.filter(({ sourceCase }) => sourceCase.family === family)),
      expected,
      `${family} confusion`,
    );
  }
}

async function verifySourceAwareAdjudication() {
  const mapBySourceId = new Map(blindMap.mapping.map((entry) => [entry.sourceId, entry]));
  const predictionByBlindId = new Map(
    predictions.predictions.map((prediction) => [prediction.blindId, prediction]),
  );
  const sourceById = new Map(source.cases.map((row) => [row.id, row]));
  const falseNegativeIds = new Set(
    source.cases
      .filter((row) => {
        const mapping = mapBySourceId.get(row.id);
        return (
          row.expected === "DEFECT" &&
          predictionByBlindId.get(mapping.blindId).prediction === "NORMAL"
        );
      })
      .map(({ id }) => id),
  );
  assert.equal(falseNegativeIds.size, 75);
  assert.equal(sourceAware.rows.length, 75);
  assert.equal(new Set(sourceAware.rows.map(({ caseId }) => caseId)).size, 75);
  assert.equal(
    new Set(sourceAware.rows.map(({ pairedControlCaseId }) => pairedControlCaseId)).size,
    75,
  );
  assert.deepEqual(
    new Set(sourceAware.rows.map(({ caseId }) => caseId)),
    falseNegativeIds,
  );

  for (const row of sourceAware.rows) {
    const defect = sourceById.get(row.caseId);
    const control = sourceById.get(row.pairedControlCaseId);
    assert.equal(defect.expected, "DEFECT");
    assert.equal(control.expected, "NORMAL");
    assert.equal(defect.pairId, row.pairId);
    assert.equal(control.pairId, row.pairId);
    assert.equal(row.family, defect.family);
    assert.equal(row.language, defect.language);
    assert.equal(
      predictionByBlindId.get(mapBySourceId.get(defect.id).blindId).prediction,
      "NORMAL",
    );
    assert.equal(
      predictionByBlindId.get(mapBySourceId.get(control.id).blindId).prediction,
      "NORMAL",
    );
    assert.equal(row.adjudication, expectedDisposition(defect));
    assert.equal(row.matchedControl.reviewResult.length > 0, true);
    for (const reference of row.sourceReferences) {
      assert.equal(
        sha256(await readFile(path.join(repoRoot, reference.path))),
        reference.sha256,
        `${row.caseId} source reference ${reference.path}`,
      );
    }
  }

  assert.deepEqual(sourceAware.summary.byAdjudication, {
    CONFIRMED_PRODUCT_CONTRACT: 34,
    ORACLE_SCOPE_MISMATCH: 41,
    AMBIGUOUS: 0,
    REDUNDANT_UPSTREAM: 0,
  });
  assert.deepEqual(sourceAware.summary.byFamily, {
    GRAMMAR_ERROR_LEADING_LABEL: {
      CONFIRMED_PRODUCT_CONTRACT: 0,
      ORACLE_SCOPE_MISMATCH: 19,
      AMBIGUOUS: 0,
      REDUNDANT_UPSTREAM: 0,
    },
    SENTENCE_ORDER_COMPLETE_UNITS: {
      CONFIRMED_PRODUCT_CONTRACT: 10,
      ORACLE_SCOPE_MISMATCH: 10,
      AMBIGUOUS: 0,
      REDUNDANT_UPSTREAM: 0,
    },
    SENTENCE_ORDER_STANDALONE_LABELS: {
      CONFIRMED_PRODUCT_CONTRACT: 11,
      ORACLE_SCOPE_MISMATCH: 0,
      AMBIGUOUS: 0,
      REDUNDANT_UPSTREAM: 0,
    },
    SUMMARY_COMPLETE_MC: {
      CONFIRMED_PRODUCT_CONTRACT: 13,
      ORACLE_SCOPE_MISMATCH: 12,
      AMBIGUOUS: 0,
      REDUNDANT_UPSTREAM: 0,
    },
  });
  assert.equal(sourceAware.methodology.falseNegativesReviewed, 75);
  assert.equal(sourceAware.methodology.matchedControlsReviewed, 75);
  assert.equal(sourceAware.methodology.oneToOnePairingVerified, true);
  assert.equal(sourceAware.methodology.noSourceOrOracleEdits, true);
  assert.equal(sourceAware.methodology.noApiNetworkDatabaseSecrets, true);
}

async function verifyIntegrityAndExternalSystems() {
  const attestation = predictions.executionAttestation;
  for (const [name, value] of Object.entries({
    apiCalls: attestation.apiCalls,
    networkAttempts: attestation.networkAttempts,
    databaseCalls: attestation.databaseCalls,
    secretsRead: attestation.secretsRead,
    estimatedCostUsd: attestation.estimatedCostUsd,
  })) {
    assert.equal(value, 0, `prediction ${name}`);
  }
  assert.equal(accessAttestation.freshProcess, true);
  assert.equal(accessAttestation.externalSystems.apiCalls, 0);
  assert.equal(accessAttestation.externalSystems.networkAttempts, 0);
  assert.equal(accessAttestation.externalSystems.databaseCalls, 0);
  assert.equal(accessAttestation.externalSystems.estimatedCostUsd, 0);
  assert.equal(accessAttestation.environment.secretsRead, 0);
  assert.equal(accessAttestation.supervisorContaminationDisclosed, true);
  assert.match(accessAttestation.qualification, /no OS-level file-access trace/u);

  const integrity = await readFile(
    path.join(auditDirectory, "PROCESS_INTEGRITY.md"),
    "utf8",
  );
  assert.match(integrity, /does \*\*not\*\* claim perfect supervisor-level blindness/u);
  assert.match(integrity, /supervising agent before predictions were generated/u);
  assert.match(integrity, /not an OS-enforced proof/u);
  assert.match(integrity, new RegExp(predictionSeal.runnerSha256, "u"));

  assert.equal(testResults.authorSealVerification.status, "PASS");
  assert.equal(testResults.scopedTypeScript.status, "PASS");
  assert.equal(testResults.eslint.status, "PASS");
  assert.equal(testResults.relevantUnitTests.status, "PASS");
  assert.equal(testResults.relevantUnitTests.tests, 42);
  assert.equal(testResults.relevantUnitTests.passed, 42);
  assert.equal(testResults.predictionReplay.status, "PASS");
  assert.equal(testResults.predictionReplay.predictionArrayExactMatch, true);
  assert.equal(testResults.globalTypeScript.status, "PASS");
}

function verifyManifestClaims() {
  assert.deepEqual(manifest.verdict.confusion, adjudication.overall.confusion);
  assert.equal(manifest.verdict.total, 200);
  assert.equal(manifest.verdict.correct, 125);
  assert.equal(manifest.verdict.rawAccuracy, 0.625);
  assert.equal(manifest.verdict.confirmedProductContractDefects, 34);
  assert.equal(manifest.verdict.oracleScopeMismatches, 41);
  assert.equal(manifest.verdict.ambiguous, 0);
  assert.equal(manifest.verdict.redundantUpstream, 0);
  assert.equal(manifest.integrityQualification.supervisorLevelBlindness, false);
  assert.equal(manifest.integrityQualification.computationalPredictionSeparation, true);
  assert.equal(manifest.integrityQualification.osEnforcedFilesystemIsolation, false);
  for (const value of Object.values(manifest.externalSystems)) assert.equal(value, 0);
  assert.equal(manifest.chainOfCustody.authorPayloadSeal, authorManifest.payloadSealSha256);
  assert.equal(manifest.chainOfCustody.blindProjectionSha256, sha256(blindBytes));
  assert.equal(manifest.chainOfCustody.preAdjudicationPredictionsSha256, sha256(predictionBytes));
  assert.equal(manifest.chainOfCustody.productionSourceClosureSha256, sourceClosure.aggregateSha256);
}

function expectedDisposition(caseValue) {
  if (caseValue.family === "SUMMARY_COMPLETE_MC") {
    return caseValue.language === "ko"
      ? "ORACLE_SCOPE_MISMATCH"
      : "CONFIRMED_PRODUCT_CONTRACT";
  }
  if (caseValue.family === "GRAMMAR_ERROR_LEADING_LABEL") {
    return "ORACLE_SCOPE_MISMATCH";
  }
  if (caseValue.family === "SENTENCE_ORDER_COMPLETE_UNITS") {
    return caseValue.language === "ko"
      ? "ORACLE_SCOPE_MISMATCH"
      : "CONFIRMED_PRODUCT_CONTRACT";
  }
  if (caseValue.family === "SENTENCE_ORDER_STANDALONE_LABELS") {
    return "CONFIRMED_PRODUCT_CONTRACT";
  }
  throw new Error(`unexpected family ${caseValue.family}`);
}

function confusionFor(rows) {
  const result = { tp: 0, fn: 0, fp: 0, tn: 0 };
  for (const { sourceCase, prediction } of rows) {
    if (sourceCase.expected === "DEFECT" && prediction.prediction === "DEFECT") result.tp += 1;
    if (sourceCase.expected === "DEFECT" && prediction.prediction === "NORMAL") result.fn += 1;
    if (sourceCase.expected === "NORMAL" && prediction.prediction === "DEFECT") result.fp += 1;
    if (sourceCase.expected === "NORMAL" && prediction.prediction === "NORMAL") result.tn += 1;
  }
  return result;
}

function projectFixture(fixture, family) {
  if (family === "SUMMARY_COMPLETE_MC") {
    return {
      type: fixture.type,
      options: fixture.options,
      storedKey: fixture.storedKey,
      carrier: {
        authority: fixture.carrier?.authority,
        kind: fixture.carrier?.kind,
        text: fixture.carrier?.text,
      },
    };
  }
  if (family === "GRAMMAR_ERROR_LEADING_LABEL") {
    return {
      type: fixture.type,
      renderedLabels: fixture.renderedLabelInventory?.labels,
      keyPoint: fixture.keyPoint,
    };
  }
  if (family === "SENTENCE_ORDER_COMPLETE_UNITS") {
    return { type: fixture.type, paragraphs: fixture.paragraphs };
  }
  if (family === "SENTENCE_ORDER_STANDALONE_LABELS") {
    return {
      type: fixture.type,
      entries: fixture.entries,
      incidentalMentions: fixture.incidentalMentions,
    };
  }
  throw new Error(`unexpected projection family ${family}`);
}

function assertProjectionContainsNoOracleMetadata(value) {
  const forbidden = /^(?:id|pair(?:id)?|expected|oracle(?:reason)?|reason|rationale|classificationlabels|unitanalysis|leadingreference|quotedtext)$/iu;
  const visit = (node, pointer) => {
    if (Array.isArray(node)) {
      node.forEach((child, index) => visit(child, `${pointer}/${index}`));
      return;
    }
    if (!node || typeof node !== "object") return;
    for (const [key, child] of Object.entries(node)) {
      if (key !== "blindId" && forbidden.test(key)) {
        throw new Error(`oracle-bearing field ${key} in blind projection at ${pointer}`);
      }
      visit(child, `${pointer}/${key}`);
    }
  };
  visit(value, "$");
}

async function readJson(filePath) {
  return JSON.parse((await readFile(filePath)).toString("utf8"));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
