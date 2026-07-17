import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const auditDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(auditDirectory, "../../../..");
const authorDirectory = path.join(
  repoRoot,
  "experiments/question-quality-20260715/reviews/deterministic-structural-reaudit-v10",
);

const [adjudication, sourceAware, predictionSeal, sourceClosure] = await Promise.all(
  [
    "adjudication.json",
    "source-aware-adjudication.json",
    "PREDICTION_SEAL.json",
    "SOURCE_CLOSURE.json",
  ].map((name) => readJson(path.join(auditDirectory, name))),
);

const artifactNames = (await readdir(auditDirectory, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && entry.name !== "MANIFEST.json")
  .map((entry) => entry.name)
  .sort();
const artifactFiles = await Promise.all(
  artifactNames.map(async (name) => describeFile(path.join(auditDirectory, name), name)),
);

const externalRelativePaths = [
  "PRE_INSPECTION_MANIFEST.json",
  "cases.json",
  "ORACLE_PROTOCOL.md",
  "verify_author_seal.ps1",
  "IMMUTABILITY.md",
].sort();
const externalSealedInputs = await Promise.all(
  externalRelativePaths.map(async (name) =>
    describeFile(
      path.join(authorDirectory, name),
      `../deterministic-structural-reaudit-v10/${name}`,
    ),
  ),
);

const manifest = {
  schemaVersion: "deterministic-structural-v10-independent-final-manifest-v1",
  auditId: "deterministic-structural-reaudit-v10-independent-audit",
  sealedOn: "2026-07-15",
  verdict: {
    rawOracleVerdict: "BLOCK_CANDIDATE",
    productionPatchAuthorization: "NONE_FROM_THIS_AUDIT",
    total: adjudication.overall.total,
    correct: adjudication.overall.correct,
    rawAccuracy: adjudication.overall.accuracy,
    confusion: adjudication.overall.confusion,
    confirmedProductContractDefects:
      sourceAware.summary.byAdjudication.CONFIRMED_PRODUCT_CONTRACT,
    oracleScopeMismatches:
      sourceAware.summary.byAdjudication.ORACLE_SCOPE_MISMATCH,
    ambiguous: sourceAware.summary.byAdjudication.AMBIGUOUS,
    redundantUpstream: sourceAware.summary.byAdjudication.REDUNDANT_UPSTREAM,
  },
  chainOfCustody: {
    authorPayloadSeal:
      "2ddce4ecbebdcbb5d411a812185f2613d3639a727ab4ded3e8aa594c231fbc03",
    casesSha256:
      "002ed425202c28f3dc7476d9381a6b65bce8e66f0616ebbeddb000d56221a222",
    blindProjectionSha256: predictionSeal.blindSha256,
    executedPreAdjudicationRunnerSha256: predictionSeal.runnerSha256,
    preAdjudicationPredictionsSha256: predictionSeal.predictionsSha256,
    productionSourceClosureSha256: sourceClosure.aggregateSha256,
    productionSourceClosureFiles: sourceClosure.fileCount,
  },
  integrityQualification: {
    supervisorLevelBlindness: false,
    computationalPredictionSeparation: true,
    osEnforcedFilesystemIsolation: false,
    disclosure: "PROCESS_INTEGRITY.md",
    executedRunnerPreservation: "run_blind_predictions.pre-adjudication-sealed.txt",
  },
  externalSystems: {
    apiCalls: 0,
    networkAttempts: 0,
    databaseCalls: 0,
    secretsReadByPredictionProcess: 0,
    estimatedCostUsd: 0,
  },
  artifactFiles,
  externalSealedInputs,
  verification: {
    command:
      "node experiments/question-quality-20260715/reviews/deterministic-structural-reaudit-v10-independent-audit/verify_audit.mjs",
    expectedTerminalLine:
      "VERIFY_AUDIT_OK deterministic-structural-reaudit-v10-independent-audit",
  },
};

await writeFile(
  path.join(auditDirectory, "MANIFEST.json"),
  Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8"),
);
process.stdout.write(
  [
    "MANIFEST_BUILT",
    `ARTIFACT_FILES ${artifactFiles.length}`,
    `EXTERNAL_INPUTS ${externalSealedInputs.length}`,
  ].join("\n") + "\n",
);

async function readJson(filePath) {
  return JSON.parse((await readFile(filePath)).toString("utf8"));
}

async function describeFile(filePath, manifestPath) {
  const bytes = await readFile(filePath);
  return {
    path: manifestPath.replaceAll("\\", "/"),
    bytes: bytes.length,
    sha256: sha256(bytes),
  };
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
