import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const reviewDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(reviewDirectory, "../../../..");
const reviewRelative = "experiments/question-quality-20260715/reviews/campaign-v6-connectivity-pilot-v6-system-independent-audit-v1";
const subjectRelative = "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v6";
const subjectDirectory = path.join(repoRoot, subjectRelative);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function parseManifest(filePath, expectedPrefix, expectedNames) {
  const lines = readFileSync(filePath, "utf8").trimEnd().split(/\r?\n/u);
  assert.equal(lines.length, expectedNames.length);
  const rows = new Map();
  for (const line of lines) {
    const match = /^([a-f0-9]{64})  ([^\r\n]+)$/u.exec(line);
    assert(match, `invalid manifest row: ${line}`);
    assert(match[2].startsWith(`${expectedPrefix}/`));
    assert(!rows.has(match[2]));
    rows.set(match[2], match[1]);
  }
  assert.deepEqual([...rows.keys()].sort(), expectedNames.map((name) => `${expectedPrefix}/${name}`).sort());
  for (const [relative, expected] of rows) {
    assert.equal(sha256(readFileSync(path.join(repoRoot, relative))), expected, `hash drift: ${relative}`);
  }
  return rows;
}

const reviewNames = [
  "README.md",
  "SUBJECT.sha256",
  "evidence.json",
  "independent-audit.mts",
  "preload-probe.cjs",
  "report.json",
  "verify.mjs",
];
parseManifest(path.join(reviewDirectory, "MANIFEST.sha256"), reviewRelative, reviewNames);

const subjectNames = readdirSync(subjectDirectory, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name !== "strict-json-observer.ts" && entry.name !== "offline.test.ts")
  .map((entry) => entry.name)
  .sort();
const subjectRows = parseManifest(
  path.join(reviewDirectory, "SUBJECT.sha256"),
  subjectRelative,
  subjectNames,
);
assert.equal(subjectRows.size, 36);
const snapshotRows = [...subjectRows]
  .map(([relative, digest]) => ({
    path: relative,
    bytes: lstatSync(path.join(repoRoot, relative)).size,
    sha256: digest,
  }))
  .sort((left, right) => left.path.localeCompare(right.path));
const snapshotSha256 = sha256(JSON.stringify(snapshotRows));
assert.equal(snapshotSha256, "e70ea9adb77a75a7034e1804bd569b70f057506a7395d9533ba3bcb36287cb85");

const evidence = JSON.parse(readFileSync(path.join(reviewDirectory, "evidence.json"), "utf8"));
const report = JSON.parse(readFileSync(path.join(reviewDirectory, "report.json"), "utf8"));
assert.equal(evidence.verdict, "FAIL_BLOCKERS");
assert.equal(report.verdict, "FAIL_BLOCKERS");
assert.equal(report.executionAuthorityGranted, false);
assert.equal(report.freezeAuthorityGranted, false);
assert.equal(report.providerAuthorityGranted, false);
assert.equal(report.modelAuthorityGranted, false);
assert.equal(report.resultAuthorityGranted, false);
assert.equal(evidence.scenarioMatrix.total, 388);
assert.equal(evidence.scenarioMatrix.passed, 388);
assert.equal(evidence.scenarioMatrix.failed, 0);
assert.equal(evidence.subject.snapshotSha256, snapshotSha256);
assert.equal(evidence.blockers.length, 6);
assert.deepEqual(report.blockerCodes, evidence.blockers.map((row) => row.code));
assert.equal(evidence.accessCounters.network, 0);
assert.equal(evidence.accessCounters.provider, 0);
assert.equal(evidence.accessCounters.model, 0);
assert.equal(evidence.accessCounters.api, 0);
assert.equal(evidence.accessCounters.subjectPrivateReads, 0);
assert.equal(evidence.accessCounters.globalLedgerWrites, 0);
assert.equal(evidence.deploymentRuntimeObservation.projectOrOrganizationIdentifiersReported, false);

for (const relative of [
  "MANIFEST.sha256",
  "AUTHOR-REPORT.json",
  "frozen-runtime-v6.json",
  "live-closure-v6.json",
  "compiler-closure-v6.json",
  "offline-exact-wire-seal-v6.json",
  "frozen-live/live-child-v6.bundle.mjs",
  "frozen-live/operator-wrapper-v6.bundle.mjs",
  "frozen-live/capture-price-snapshot-v6.bundle.mjs",
]) assert.equal(existsSync(path.join(subjectDirectory, relative)), false, `unexpected current frozen artifact: ${relative}`);

const exactEnvironment = {};
for (const name of ["COMSPEC", "PATH", "PATHEXT", "SystemRoot", "TEMP", "TMP", "WINDIR"]) {
  if (typeof process.env[name] === "string" && process.env[name]) exactEnvironment[name] = process.env[name];
}
const tsxCli = path.join(repoRoot, "node_modules/tsx/dist/cli.mjs");
assert(existsSync(tsxCli));
const matrix = spawnSync(process.execPath, [
  tsxCli,
  path.join(reviewDirectory, "independent-audit.mts"),
], {
  cwd: repoRoot,
  env: exactEnvironment,
  encoding: "utf8",
  windowsHide: true,
  timeout: 120_000,
  maxBuffer: 32 * 1024 * 1024,
});
if (matrix.error) throw matrix.error;
assert.equal(matrix.status, 0, `${matrix.stdout}\n${matrix.stderr}`);
const matrixResult = JSON.parse(matrix.stdout);
assert.equal(matrixResult.verdict, "EXPECTED_BEHAVIOR_AND_BLOCKERS_REPRODUCED");
assert.equal(matrixResult.totalScenarios, 388);
assert.equal(matrixResult.passedScenarios, 388);
assert.equal(matrixResult.failedScenarios, 0);
assert.equal(matrixResult.subject.snapshotSha256, snapshotSha256);
assert.equal(matrixResult.subject.startEqualsEnd, true);
assert.equal(matrixResult.accessCounters.network, 0);
assert.equal(matrixResult.accessCounters.subjectWrites, 0);
assert.equal(existsSync(path.join(reviewDirectory, "scratch-runtime")), false);

process.stdout.write(`${JSON.stringify({
  status: "PASS_EXPECTED_SUBJECT_FAILURE_REPRODUCED",
  reviewVerdict: "FAIL_BLOCKERS",
  scenarios: 388,
  scenarioFailures: 0,
  blockers: 6,
  exactNonObserverSubjectFiles: 36,
  subjectSnapshotSha256: snapshotSha256,
  network: 0,
  provider: 0,
  model: 0,
  api: 0,
  subjectWrites: 0,
  freezeWrites: 0,
})}\n`);
