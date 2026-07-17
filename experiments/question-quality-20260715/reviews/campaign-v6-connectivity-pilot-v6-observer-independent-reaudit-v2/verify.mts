import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

type JsonRecord = Record<string, unknown>;

const reviewDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(reviewDir, "../../../../");
const manifestPath = path.join(reviewDir, "manifest.json");
const checksumPath = path.join(reviewDir, "MANIFEST.sha256");

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function asRecord(value: unknown, label: string): JsonRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as JsonRecord;
}

function asString(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`${label} must be a string`);
  return value;
}

function asNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error(`${label} must be a safe integer`);
  }
  return value;
}

const manifest = asRecord(JSON.parse(readFileSync(manifestPath, "utf8")), "manifest");
if (manifest.schemaVersion !== "campaign-v6-observer-independent-reaudit-manifest-v2") {
  throw new Error("unexpected manifest schema");
}
if (manifest.verdict !== "FAIL_BLOCKERS" || manifest.authority !== "NONE") {
  throw new Error("review verdict/authority drift");
}
if (manifest.scope !== "OBSERVER_ONLY" || manifest.authorizesV6 !== false) {
  throw new Error("observer-only/non-authorizing scope drift");
}

const expectedReviewFiles = ["AUDIT-REPORT.md", "audit.ts", "manifest.json", "verify.mts"];
const reviewFiles = manifest.reviewFiles;
if (!Array.isArray(reviewFiles) || JSON.stringify(reviewFiles) !== JSON.stringify(expectedReviewFiles)) {
  throw new Error("review file set drift");
}

const checksumLines = readFileSync(checksumPath, "utf8").trim().split(/\r?\n/u);
if (checksumLines.length !== expectedReviewFiles.length) throw new Error("MANIFEST row count drift");
const seen = new Set<string>();
for (const line of checksumLines) {
  const match = /^([a-f0-9]{64})  ([A-Za-z0-9._-]+)$/u.exec(line);
  if (!match) throw new Error(`invalid MANIFEST row: ${line}`);
  const [, expectedHash, name] = match;
  if (!expectedReviewFiles.includes(name!)) throw new Error(`unexpected MANIFEST file: ${name}`);
  if (seen.has(name!)) throw new Error(`duplicate MANIFEST file: ${name}`);
  seen.add(name!);
  const actualHash = sha256(readFileSync(path.join(reviewDir, name!)));
  if (actualHash !== expectedHash) throw new Error(`review artifact hash mismatch: ${name}`);
}
if (seen.size !== expectedReviewFiles.length) throw new Error("MANIFEST file coverage drift");

const subject = asRecord(manifest.subject, "manifest.subject");
const strictObserverPath = path.join(repoRoot, asString(subject.strictObserverPath, "strictObserverPath"));
const offlineTestPath = path.join(repoRoot, asString(subject.coordinatedOfflineTestPath, "coordinatedOfflineTestPath"));
const strictObserverSha256 = asString(subject.strictObserverSha256, "strictObserverSha256");
const offlineTestSha256 = asString(
  subject.coordinatedOfflineTestObservedSha256,
  "coordinatedOfflineTestObservedSha256",
);
if (sha256(readFileSync(strictObserverPath)) !== strictObserverSha256) {
  throw new Error("strict observer subject hash drift");
}
if (sha256(readFileSync(offlineTestPath)) !== offlineTestSha256) {
  throw new Error("coordinated offline test hash drift");
}

const tsxCli = path.join(repoRoot, "node_modules/tsx/dist/cli.mjs");
const auditPath = path.join(reviewDir, "audit.ts");
const run = spawnSync(process.execPath, [tsxCli, auditPath], {
  cwd: repoRoot,
  encoding: "utf8",
  maxBuffer: 32 * 1024 * 1024,
  env: {
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    WINDIR: process.env.WINDIR,
  },
});
if (run.status !== 0) {
  throw new Error(`audit execution failed (${run.status}): ${run.stderr}`);
}
const result = asRecord(JSON.parse(run.stdout), "audit result");
if (result.verdict !== "FAIL_BLOCKERS") throw new Error("audit no longer reproduces FAIL_BLOCKERS");
if (result.subjectSha256 !== strictObserverSha256) throw new Error("audit subject hash mismatch");
if (result.coordinatedOfflineTestSha256 !== offlineTestSha256) {
  throw new Error("audit coordinated test hash mismatch");
}

const matrix = asRecord(manifest.matrix, "manifest.matrix");
for (const key of ["totalCases", "passingCases", "failingCases"] as const) {
  if (asNumber(result[key], `result.${key}`) !== asNumber(matrix[key], `matrix.${key}`)) {
    throw new Error(`${key} drift`);
  }
}
if (asNumber(matrix.totalCases, "matrix.totalCases") !== 917 ||
    asNumber(matrix.predecessorCases, "matrix.predecessorCases") !== 461 ||
    asNumber(matrix.predecessorPassingCases, "matrix.predecessorPassingCases") !== 461 ||
    asNumber(matrix.freshNonDerivedCases, "matrix.freshNonDerivedCases") !== 456 ||
    asNumber(matrix.freshFailingCases, "matrix.freshFailingCases") !== 144) {
  throw new Error("matrix composition drift");
}
const resultComposition = asRecord(result.matrixComposition, "result.matrixComposition");
if (asNumber(resultComposition.predecessorCases, "composition.predecessorCases") !== 461 ||
    asNumber(resultComposition.freshCases, "composition.freshCases") !== 456 ||
    asNumber(resultComposition.exactFullOutputCases, "composition.exactFullOutputCases") !== 753 ||
    asNumber(resultComposition.safetyPredicateCases, "composition.safetyPredicateCases") !== 164) {
  throw new Error("runtime matrix composition drift");
}
for (const key of ["matrixFingerprintSha256", "failureFingerprintSha256"] as const) {
  if (asString(result[key], `result.${key}`) !== asString(matrix[key], `matrix.${key}`)) {
    throw new Error(`${key} drift`);
  }
}
const actualFailureCategories = asRecord(result.categoryFailures, "result.categoryFailures");
const expectedFailureCategories = asRecord(matrix.failureCategories, "matrix.failureCategories");
if (JSON.stringify(actualFailureCategories) !== JSON.stringify(expectedFailureCategories)) {
  throw new Error("failure category distribution drift");
}
const staticProof = asRecord(result.staticRecoveryProof, "result.staticRecoveryProof");
if (staticProof.parserOffsetInitializations !== 1 ||
    staticProof.parserOffsetIncrements !== 19 ||
    staticProof.parserOffsetDecrements !== 0 ||
    staticProof.scanStartsAtPriorOffset !== true ||
    staticProof.recoveryParsesAtFoundStart !== true ||
    staticProof.recoveryAdvancesPastAttemptAndParsedEnd !== true ||
    staticProof.recoveryAttemptCapBound !== true ||
    staticProof.decodedExpansionByteBound !== true) {
  throw new Error("static monotonic/bounded recovery proof drift");
}

const independence = asRecord(result.independence, "result.independence");
for (const key of [
  "providerCalls",
  "modelCalls",
  "networkCalls",
  "ledgerReads",
  "ledgerWrites",
  "privateArtifactReads",
  "liveOrFreezeCommands",
] as const) {
  if (independence[key] !== 0) throw new Error(`forbidden audit activity: ${key}`);
}
if (independence.subjectTestsImportedOrExecuted !== false ||
    independence.subjectTestsContentInspected !== false ||
    independence.coordinatedTestHashRead !== true) {
  throw new Error("independence declaration drift");
}

const activity = asRecord(manifest.activity, "manifest.activity");
for (const [key, value] of Object.entries(activity)) {
  if (value !== 0) throw new Error(`manifest activity is not zero: ${key}`);
}

if (sha256(readFileSync(strictObserverPath)) !== strictObserverSha256) {
  throw new Error("strict observer changed during verification");
}

process.stdout.write(`${JSON.stringify({
  status: "PASS_REVIEW_INTEGRITY_EXPECTED_OBSERVER_FAILURE_V2",
  reviewVerdict: "FAIL_BLOCKERS",
  totalCases: result.totalCases,
  passingCases: result.passingCases,
  failingCases: result.failingCases,
  matrixFingerprintSha256: result.matrixFingerprintSha256,
  failureFingerprintSha256: result.failureFingerprintSha256,
})}\n`);
