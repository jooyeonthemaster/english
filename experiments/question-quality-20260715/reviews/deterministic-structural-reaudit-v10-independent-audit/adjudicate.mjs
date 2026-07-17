import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const [sealedCasesArg, auditDirectoryArg] = process.argv.slice(2);
if (!sealedCasesArg || !auditDirectoryArg) {
  throw new Error("usage: node adjudicate.mjs <sealed-cases.json> <audit-directory>");
}

const sealedCasesPath = path.resolve(sealedCasesArg);
const auditDirectory = path.resolve(auditDirectoryArg);
const paths = {
  predictions: path.join(auditDirectory, "predictions.json"),
  predictionSeal: path.join(auditDirectory, "PREDICTION_SEAL.json"),
  blindMap: path.join(auditDirectory, "sealed-blind-map.json"),
  blindReceipt: path.join(auditDirectory, "BLIND_EXTRACTION.json"),
  blindCases: path.join(auditDirectory, "blinded-cases.json"),
};

const [
  sealedCasesBytes,
  predictionsBytes,
  predictionSealBytes,
  blindMapBytes,
  blindReceiptBytes,
  blindCasesBytes,
] = await Promise.all([
  readFile(sealedCasesPath),
  readFile(paths.predictions),
  readFile(paths.predictionSeal),
  readFile(paths.blindMap),
  readFile(paths.blindReceipt),
  readFile(paths.blindCases),
]);

const source = JSON.parse(sealedCasesBytes.toString("utf8"));
const predictionsPayload = JSON.parse(predictionsBytes.toString("utf8"));
const predictionSeal = JSON.parse(predictionSealBytes.toString("utf8"));
const blindMap = JSON.parse(blindMapBytes.toString("utf8"));
const blindReceipt = JSON.parse(blindReceiptBytes.toString("utf8"));

assertEqual(
  sha256(sealedCasesBytes),
  blindReceipt.sourceSha256,
  "sealed cases hash versus extraction receipt",
);
assertEqual(
  sha256(blindCasesBytes),
  blindReceipt.blindSha256,
  "blinded cases hash versus extraction receipt",
);
assertEqual(
  sha256(blindMapBytes),
  blindReceipt.mappingSha256,
  "blind map hash versus extraction receipt",
);
assertEqual(
  sha256(predictionsBytes),
  predictionSeal.predictionsSha256,
  "predictions hash versus pre-adjudication seal",
);
assertEqual(
  predictionsPayload.blindSha256,
  blindReceipt.blindSha256,
  "prediction input versus extracted blind payload",
);

const predictionByBlindId = new Map(
  predictionsPayload.predictions.map((item) => [item.blindId, item]),
);
const joined = blindMap.mapping.map((mapping) => {
  const prediction = predictionByBlindId.get(mapping.blindId);
  const sourceCase = source.cases[mapping.sourceIndex];
  if (!prediction) throw new Error(`missing prediction for ${mapping.blindId}`);
  if (!sourceCase) throw new Error(`missing source case at index ${mapping.sourceIndex}`);
  assertEqual(sourceCase.id, mapping.sourceId, `source id at ${mapping.blindId}`);
  assertEqual(sourceCase.family, prediction.family, `family at ${mapping.blindId}`);
  return {
    blindId: mapping.blindId,
    sourceId: sourceCase.id,
    family: sourceCase.family,
    language: sourceCase.language,
    expected: sourceCase.expected,
    prediction: prediction.prediction,
    correct: sourceCase.expected === prediction.prediction,
    productionEvidence: Object.fromEntries(
      Object.entries(prediction).filter(
        ([key]) =>
          !["blindId", "family", "language", "prediction"].includes(key),
      ),
    ),
    fixture: sourceCase.fixture,
    oracleReason: sourceCase.oracleReason,
  };
});

if (joined.length !== 200 || predictionByBlindId.size !== 200) {
  throw new Error("adjudication did not join exactly 200 unique predictions");
}

const familyNames = [...new Set(joined.map(({ family }) => family))].sort();
const scoreFamily = (items) => {
  const confusion = {
    expectedDefectPredictedDefect: 0,
    expectedDefectPredictedNormal: 0,
    expectedNormalPredictedDefect: 0,
    expectedNormalPredictedNormal: 0,
  };
  for (const item of items) {
    if (item.expected === "DEFECT" && item.prediction === "DEFECT") {
      confusion.expectedDefectPredictedDefect += 1;
    } else if (item.expected === "DEFECT" && item.prediction === "NORMAL") {
      confusion.expectedDefectPredictedNormal += 1;
    } else if (item.expected === "NORMAL" && item.prediction === "DEFECT") {
      confusion.expectedNormalPredictedDefect += 1;
    } else if (item.expected === "NORMAL" && item.prediction === "NORMAL") {
      confusion.expectedNormalPredictedNormal += 1;
    } else {
      throw new Error(`invalid labels in ${item.sourceId}`);
    }
  }
  const correct = items.filter(({ correct }) => correct).length;
  const expectedDefect = items.filter(({ expected }) => expected === "DEFECT").length;
  const expectedNormal = items.length - expectedDefect;
  const predictedDefect = items.filter(({ prediction }) => prediction === "DEFECT").length;
  const predictedNormal = items.length - predictedDefect;
  return {
    total: items.length,
    correct,
    disagreements: items.length - correct,
    accuracy: correct / items.length,
    expected: { defect: expectedDefect, normal: expectedNormal },
    predicted: { defect: predictedDefect, normal: predictedNormal },
    confusion,
  };
};

const overall = scoreFamily(joined);
const byFamily = Object.fromEntries(
  familyNames.map((family) => [
    family,
    scoreFamily(joined.filter((item) => item.family === family)),
  ]),
);
const disagreements = joined.filter(({ correct }) => !correct);
const adjudication = {
  schemaVersion: "deterministic-structural-v10-independent-adjudication-v1",
  preAdjudicationSealVerified: true,
  authorPayloadSha256: sha256(sealedCasesBytes),
  blindSha256: sha256(blindCasesBytes),
  predictionsSha256: sha256(predictionsBytes),
  caseCount: joined.length,
  overall,
  byFamily,
  disagreements: disagreements.map(({ fixture: _fixture, ...item }) => item),
};

await Promise.all([
  writeFile(
    path.join(auditDirectory, "adjudication.json"),
    canonicalJsonBytes(adjudication),
  ),
  writeFile(
    path.join(auditDirectory, "disagreements-with-fixtures.json"),
    canonicalJsonBytes({
      schemaVersion: "deterministic-structural-v10-independent-disagreements-v1",
      count: disagreements.length,
      disagreements,
    }),
  ),
]);

process.stdout.write(
  [
    "ADJUDICATION_OK",
    `TOTAL ${overall.total}`,
    `CORRECT ${overall.correct}`,
    `DISAGREEMENTS ${overall.disagreements}`,
    `ACCURACY ${overall.accuracy.toFixed(6)}`,
    ...familyNames.map((family) => {
      const score = byFamily[family];
      return `FAMILY ${family} correct=${score.correct}/${score.total} disagreements=${score.disagreements}`;
    }),
  ].join("\n") + "\n",
);

function assertEqual(actual, expected, description) {
  if (actual !== expected) {
    throw new Error(`${description}: expected ${expected}, received ${actual}`);
  }
}

function canonicalJsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
