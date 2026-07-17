import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REVIEW_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(REVIEW_DIR, "../../../../");
const V2_DIR = path.join(
  REPO_ROOT,
  "experiments/question-quality-20260715/reviews/campaign-v6-connectivity-pilot-v6-observer-independent-reaudit-v2",
);
const SUBJECT_PATH = path.join(
  REPO_ROOT,
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v6/strict-json-observer.ts",
);
const OFFLINE_TEST_PATH = path.join(
  REPO_ROOT,
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v6/offline.test.ts",
);
const EXPECTED_SUBJECT = "736911a9f5763c17ec839ed30c04e960503ab803fdd4c1b8af220a49106bb2bb";
const EXPECTED_OFFLINE = "30a04ca8e82fabca47f2a432a6c1182b17053f6e195ba5c9c40abb075606a4b3";
const OLD_SUBJECT = "41969f7b9c7cad9c2e1da8568be86f646d103de4297038b9085c955a73002187";
const EXPECTED_V2_AUDIT = "ec6f91e5db2be738f3ad77d0c06e07798a24de52a59e328f7d7b10693696ba37";
const EXPECTED_PREDECESSOR_MATRIX = "d03275523a39930086f490ef5857a95ea75797739a0caadba05061e1bf249fda";
const EXPECTED_FRESH_MATRIX = "fd9c88b6c2838f125bb974e13a05653982fe956e821797326674076bf31ea50d";
const EXPECTED_FRESH_FAILURES = "6fd77d85b3e0d24a75fe7c6620f78cf0a4019770fe4fb2415453e023d70e4ca3";

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function readJson(filePath: string): any {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

const subjectBefore = sha256(readFileSync(SUBJECT_PATH));
const offlineBefore = sha256(readFileSync(OFFLINE_TEST_PATH));
assert(subjectBefore === EXPECTED_SUBJECT, `subject drift: ${subjectBefore}`);
assert(offlineBefore === EXPECTED_OFFLINE, `offline-test hash drift: ${offlineBefore}`);

const manifest = readJson(path.join(REVIEW_DIR, "manifest.json"));
assert(manifest.schemaVersion === "campaign-v6-observer-independent-reaudit-manifest-v3", "manifest schema drift");
assert(manifest.reviewId === "campaign-v6-connectivity-pilot-v6-observer-independent-reaudit-v3", "review id drift");
assert(manifest.verdict === "FAIL_BLOCKERS", "verdict drift");
assert(manifest.authority === "NONE" && manifest.scope === "OBSERVER_ONLY", "authority/scope drift");
assert(manifest.authorizesV6 === false, "review must not authorize v6");
assert(manifest.subject.strictObserverSha256 === EXPECTED_SUBJECT, "manifest subject hash drift");
assert(manifest.subject.coordinatedOfflineTestObservedSha256 === EXPECTED_OFFLINE, "manifest offline hash drift");
assert(manifest.subject.coordinatedTestImportedExecutedOrInspected === false, "offline-test independence drift");

const allowedFiles = [
  "AUDIT-REPORT.md",
  "MANIFEST.sha256",
  "audit.ts",
  "manifest.json",
  "predecessor-replay.ts",
  "verify.mts",
].sort();
const actualFiles = readdirSync(REVIEW_DIR).sort();
assert(JSON.stringify(actualFiles) === JSON.stringify(allowedFiles), `unexpected review files: ${actualFiles.join(",")}`);

const listedFiles = manifest.reviewFiles as Array<{ path: string; sha256: string }>;
assert(Array.isArray(listedFiles) && listedFiles.length === 4, "manifest review file list drift");
for (const entry of listedFiles) {
  assert(["AUDIT-REPORT.md", "audit.ts", "predecessor-replay.ts", "verify.mts"].includes(entry.path),
    `unexpected manifest review file: ${entry.path}`);
  const actual = sha256(readFileSync(path.join(REVIEW_DIR, entry.path)));
  assert(actual === entry.sha256, `review file hash mismatch: ${entry.path}`);
}

const manifestLines = readFileSync(path.join(REVIEW_DIR, "MANIFEST.sha256"), "utf8")
  .trim().split(/\r?\n/u).filter(Boolean);
assert(manifestLines.length === 5, "MANIFEST.sha256 line count drift");
const expectedManifestNames = ["AUDIT-REPORT.md", "audit.ts", "manifest.json", "predecessor-replay.ts", "verify.mts"].sort();
const parsedManifestLines = manifestLines.map((line) => {
  const match = /^([a-f0-9]{64})  (.+)$/u.exec(line);
  assert(match, `invalid MANIFEST.sha256 line: ${line}`);
  return { sha: match[1]!, name: match[2]! };
}).sort((left, right) => left.name.localeCompare(right.name));
assert(JSON.stringify(parsedManifestLines.map((entry) => entry.name)) === JSON.stringify(expectedManifestNames),
  "MANIFEST.sha256 names drift");
for (const entry of parsedManifestLines) {
  assert(sha256(readFileSync(path.join(REVIEW_DIR, entry.name))) === entry.sha,
    `MANIFEST.sha256 mismatch: ${entry.name}`);
}

// Prove that the predecessor replay uses the exact sealed v2 algorithm with
// only its expected subject hash changed to the current immutable subject.
const v2AuditBytes = readFileSync(path.join(V2_DIR, "audit.ts"));
assert(sha256(v2AuditBytes) === EXPECTED_V2_AUDIT, "sealed v2 audit algorithm drift");
const v2Audit = v2AuditBytes.toString("utf8");
assert(v2Audit.split(OLD_SUBJECT).length - 1 === 1, "old subject hash occurrence drift");
const expectedReplay = v2Audit.replace(OLD_SUBJECT, EXPECTED_SUBJECT);
const actualReplay = readFileSync(path.join(REVIEW_DIR, "predecessor-replay.ts"), "utf8");
assert(actualReplay === expectedReplay, "predecessor replay is not the exact one-line v2 transformation");

for (const name of ["audit.ts", "predecessor-replay.ts"]) {
  const source = readFileSync(path.join(REVIEW_DIR, name), "utf8");
  assert(!source.includes("require(COORDINATED_TEST_PATH)"), `${name} imports the coordinated test`);
  assert(!source.includes("import(COORDINATED_TEST_PATH)"), `${name} imports the coordinated test`);
  assert((source.match(/readFileSync\(COORDINATED_TEST_PATH\)/gu) ?? []).length === 1,
    `${name} must read the coordinated test exactly once for hashing only`);
  assert(!/readFileSync\(COORDINATED_TEST_PATH\)[\s\S]{0,80}toString/gu.test(source),
    `${name} appears to inspect coordinated test content`);
}

function runTsx(scriptName: string): any {
  const tsxCli = path.join(REPO_ROOT, "node_modules/tsx/dist/cli.mjs");
  const output = execFileSync(process.execPath, [tsxCli, path.join(REVIEW_DIR, scriptName)], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
    timeout: 240_000,
    windowsHide: true,
    env: { ...process.env, NO_COLOR: "1" },
  });
  return JSON.parse(output);
}

const predecessor = runTsx("predecessor-replay.ts");
assert(predecessor.verdict === "PASS_NO_BLOCKERS", "predecessor replay verdict drift");
assert(predecessor.subjectSha256 === EXPECTED_SUBJECT, "predecessor subject drift");
assert(predecessor.coordinatedOfflineTestSha256 === EXPECTED_OFFLINE, "predecessor offline hash drift");
assert(predecessor.totalCases === 917 && predecessor.passingCases === 917 && predecessor.failingCases === 0,
  "predecessor 917-case result drift");
assert(predecessor.matrixFingerprintSha256 === EXPECTED_PREDECESSOR_MATRIX, "predecessor matrix fingerprint drift");
assert(predecessor.matrixComposition.predecessorCases === 461 && predecessor.matrixComposition.freshCases === 456,
  "predecessor matrix composition drift");
assert(predecessor.matrixComposition.exactFullOutputCases === 753 && predecessor.matrixComposition.safetyPredicateCases === 164,
  "predecessor assertion composition drift");
assert(predecessor.independence.subjectTestsImportedOrExecuted === false &&
  predecessor.independence.subjectTestsContentInspected === false, "predecessor independence drift");

const fresh = runTsx("audit.ts");
assert(fresh.verdict === "FAIL_BLOCKERS", "fresh verdict drift");
assert(fresh.subjectSha256 === EXPECTED_SUBJECT && fresh.coordinatedOfflineTestSha256 === EXPECTED_OFFLINE,
  "fresh subject binding drift");
assert(fresh.totalCases === 986 && fresh.passingCases === 956 && fresh.failingCases === 30,
  "fresh matrix counts drift");
assert(fresh.matrixFingerprintSha256 === EXPECTED_FRESH_MATRIX, "fresh matrix fingerprint drift");
assert(fresh.failureFingerprintSha256 === EXPECTED_FRESH_FAILURES, "fresh failure fingerprint drift");
assert(fresh.exactFullOutputCases === 234 && fresh.safetyPredicateCases === 752, "fresh assertion composition drift");
assert(JSON.stringify(fresh.categoryFailures) === JSON.stringify({
  "quote-backslash-parity": 20,
  "raw-later-root": 1,
  "quote-storm-liveness": 7,
  "quote-storm-exact-boundary": 2,
}), "fresh failure categories drift");
assert(JSON.stringify(fresh.evidenceCounts) === JSON.stringify({
  AFFIRMATIVE_MULTIPLICITY: 752,
  NEUTRAL_LIVENESS: 96,
  EXACT_ACCOUNTING: 138,
}), "fresh evidence counts drift");
assert(JSON.stringify(fresh.evidenceFailures) === JSON.stringify({
  AFFIRMATIVE_MULTIPLICITY: 21,
  NEUTRAL_LIVENESS: 9,
  EXACT_ACCOUNTING: 0,
}), "fresh evidence failure counts drift");

const affirmativeFailureIds = fresh.failures
  .filter((entry: any) => entry.evidenceClass === "AFFIRMATIVE_MULTIPLICITY")
  .map((entry: any) => entry.id);
const neutralFailureIds = fresh.failures
  .filter((entry: any) => entry.evidenceClass === "NEUTRAL_LIVENESS")
  .map((entry: any) => entry.id);
assert(affirmativeFailureIds.length === 21 && neutralFailureIds.length === 9, "failure partition drift");
for (const entry of fresh.failures.filter((failure: any) => failure.evidenceClass === "AFFIRMATIVE_MULTIPLICITY")) {
  assert(entry.actual.choicesObserved === 0 && entry.actual.fullQuestionObjectsObserved === 0 &&
    entry.actual.candidateUnitsEffective === 1 && entry.actual.cardinalityAmbiguous === false &&
    entry.actual.observationSaturated === false, `affirmative unsafe state drift: ${entry.id}`);
}
for (const entry of fresh.failures.filter((failure: any) => failure.evidenceClass === "NEUTRAL_LIVENESS")) {
  assert(entry.actual.choicesObserved === 0 && entry.actual.fullQuestionObjectsObserved === 0 &&
    entry.actual.candidateUnitsEffective === 1 && entry.actual.cardinalityAmbiguous === true &&
    entry.actual.observationSaturated === true, `neutral liveness unsafe state drift: ${entry.id}`);
}
assert(affirmativeFailureIds.includes("raw-quote-backslash-parity-1-two-choices"), "B1 representative missing");
assert(affirmativeFailureIds.includes("later-root-quoted-7"), "B2 representative missing");
assert(neutralFailureIds.includes("neutral-quote-storm-recovery-exact-4096"), "B3 representative missing");
assert(neutralFailureIds.includes("neutral-quote-storm-recovery-plus-one-4097"), "B3 plus-one representative missing");

for (const value of Object.values(fresh.staticRecoveryProof)) assert(value !== false, "static recovery proof drift");
for (const [key, value] of Object.entries(fresh.independence)) {
  if (["subjectTestsImportedOrExecuted", "subjectTestsContentInspected", "matrixDerivedFromSubjectTests",
    "providerCalls", "modelCalls", "networkCalls", "databaseReads", "databaseWrites", "secretReads",
    "privateArtifactReads", "ledgerReads", "ledgerWrites", "buildOrFreezeCommands", "liveCommands",
    "subjectEdits"].includes(key)) {
    assert(value === false || value === 0, `fresh independence/activity drift: ${key}`);
  }
}

const subjectAfter = sha256(readFileSync(SUBJECT_PATH));
const offlineAfter = sha256(readFileSync(OFFLINE_TEST_PATH));
assert(subjectAfter === subjectBefore, "subject changed during verification");
assert(offlineAfter === offlineBefore, "offline-test changed during verification");

process.stdout.write(`${JSON.stringify({
  verdict: "PASS_REVIEW_INTEGRITY_EXPECTED_SUBJECT_FAILURE",
  reviewVerdict: "FAIL_BLOCKERS",
  authority: "NONE",
  subjectSha256: subjectAfter,
  offlineTestSha256: offlineAfter,
  predecessor: {
    cases: predecessor.totalCases,
    passing: predecessor.passingCases,
    matrixFingerprintSha256: predecessor.matrixFingerprintSha256,
  },
  fresh: {
    cases: fresh.totalCases,
    passing: fresh.passingCases,
    failing: fresh.failingCases,
    matrixFingerprintSha256: fresh.matrixFingerprintSha256,
    failureFingerprintSha256: fresh.failureFingerprintSha256,
  },
  combined: { cases: 1_903, passing: 1_873, failing: 30 },
  blockerClasses: [
    "ODD_BACKSLASH_QUOTED_ROOT_BLIND_SPOT",
    "MALFORMED_STRING_LATER_QUOTED_ROOT_DESYNC",
    "NEUTRAL_QUOTED_PROSE_RECOVERY_CAP_EXHAUSTION",
  ],
}, null, 2)}\n`);
