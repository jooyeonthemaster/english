import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REVIEW_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(REVIEW_DIR, "../../../../");
const SUBJECT_PATH = path.join(
  REPO_ROOT,
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v6/strict-json-observer.ts",
);
const OFFLINE_PATH = path.join(
  REPO_ROOT,
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v6/offline.test.ts",
);
const PRIOR_REVIEW = path.resolve(REVIEW_DIR, "../campaign-v6-connectivity-pilot-v6-observer-independent-reaudit-v3");
const EXPECTED_SUBJECT = "8df2072304c3bc48873dac05889c6d22ddf313f25fa321f9e6baac69fcc1fd3a";
const EXPECTED_OFFLINE = "212dadaad0f3812c2f4c2836bf4048694f237f8aeb618937bf09cd44149f5172";
const EXPECTED_AUDIT = "c11f6d8bc817a3a930b0530010960ebf0b499914db85a6bc7677db1fb551b85a";
const EXPECTED_LEGACY_RUNNER = "dd5b15358940875c7bfc0f541cf12ea446ae7c6c96dfa835df72e77e7753a379";
const EXPECTED_REPORT = "d83ea15fa571e53bb4750defc3c9412d175a902904f75c1c5df7695d86c77d66";
const EXPECTED_EVIDENCE = "7bcbc147566486d4965c3ed8b1a36f3b62342c8d5660be4d076e8df7a7b927cf";
const EXPECTED_PRIOR_917 = "d11331a55ecb9380cfb567de4f47b404eddb5bcb6fc01f91732a27ec184bd47a";
const EXPECTED_PRIOR_986 = "98457fdb533bf3a88b54f59351cccad6a62cc3121cfb77e042382a93ea0cb847";
const EXPECTED_917_MATRIX = "d03275523a39930086f490ef5857a95ea75797739a0caadba05061e1bf249fda";
const EXPECTED_986_MATRIX = "fd9c88b6c2838f125bb974e13a05653982fe956e821797326674076bf31ea50d";
const EXPECTED_FRESH_MATRIX = "35dd30ef4331961889d6d12196cc11e3502508b655261b84484dd2610a42eae4";
const EXPECTED_FRESH_RESULT = "a0bf61afcbe8b8d7e6a72b415fa9b01c530cf7bf3a855c7b7d079955cc091db3";
const EXPECTED_EMPTY_FAILURES = "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945";
const EXPECTED_COMBINED_BINDING = "d3fb25e744b2ac941ac9118e7a144777ac34db3f97eb9c504e2af912cf946bae";

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
const offlineBefore = sha256(readFileSync(OFFLINE_PATH));
assert(subjectBefore === EXPECTED_SUBJECT, `subject drift: ${subjectBefore}`);
assert(offlineBefore === EXPECTED_OFFLINE, `offline-test drift: ${offlineBefore}`);
assert(sha256(readFileSync(path.join(REVIEW_DIR, "audit.ts"))) === EXPECTED_AUDIT, "fresh audit drift");
assert(sha256(readFileSync(path.join(REVIEW_DIR, "legacy-replay.mts"))) === EXPECTED_LEGACY_RUNNER,
  "legacy runner drift");
assert(sha256(readFileSync(path.join(REVIEW_DIR, "REPORT.md"))) === EXPECTED_REPORT, "report drift");
assert(sha256(readFileSync(path.join(REVIEW_DIR, "evidence.json"))) === EXPECTED_EVIDENCE, "evidence drift");
assert(sha256(readFileSync(path.join(PRIOR_REVIEW, "predecessor-replay.ts"))) === EXPECTED_PRIOR_917,
  "sealed 917-case source drift");
assert(sha256(readFileSync(path.join(PRIOR_REVIEW, "audit.ts"))) === EXPECTED_PRIOR_986,
  "sealed 986-case source drift");

const allowed = [
  "MANIFEST.sha256",
  "REPORT.md",
  "audit.ts",
  "evidence.json",
  "legacy-replay.mts",
  "manifest.json",
  "verify.mts",
].sort();
assert(JSON.stringify(readdirSync(REVIEW_DIR).sort()) === JSON.stringify(allowed), "unexpected review files");

const evidence = readJson(path.join(REVIEW_DIR, "evidence.json"));
const manifest = readJson(path.join(REVIEW_DIR, "manifest.json"));
assert(evidence.schemaVersion === "campaign-v6-observer-independent-reaudit-evidence-v4", "evidence schema drift");
assert(evidence.reviewId === "campaign-v6-connectivity-pilot-v6-observer-independent-reaudit-v4", "review id drift");
assert(evidence.verdict === "PASS_NO_BLOCKERS" && manifest.verdict === "PASS_NO_BLOCKERS", "verdict drift");
assert(evidence.authority === "NONE" && evidence.scope === "OBSERVER_ONLY" && evidence.authorizesV6 === false,
  "evidence authority drift");
assert(manifest.authority === "NONE" && manifest.scope === "OBSERVER_ONLY" && manifest.authorizesV6 === false,
  "manifest authority drift");
assert(evidence.subject.strictObserverSha256 === EXPECTED_SUBJECT, "evidence subject drift");
assert(evidence.subject.coordinatedOfflineTestObservedSha256 === EXPECTED_OFFLINE, "evidence offline drift");
assert(evidence.subject.coordinatedTestImportedExecutedOrInspected === false, "test independence drift");
assert(evidence.combined.cases === 3_853 && evidence.combined.passing === 3_853 && evidence.combined.failing === 0,
  "combined evidence counts drift");
assert(evidence.combined.matrixBindingFingerprintSha256 === EXPECTED_COMBINED_BINDING,
  "combined matrix binding drift");

const listed = manifest.reviewFiles as Array<{ path: string; sha256: string }>;
assert(Array.isArray(listed) && listed.length === 5, "manifest reviewFiles drift");
const expectedListed = ["REPORT.md", "audit.ts", "evidence.json", "legacy-replay.mts", "verify.mts"].sort();
assert(JSON.stringify(listed.map((entry) => entry.path).sort()) === JSON.stringify(expectedListed),
  "manifest review file names drift");
for (const entry of listed) {
  assert(sha256(readFileSync(path.join(REVIEW_DIR, entry.path))) === entry.sha256,
    `manifest file hash mismatch: ${entry.path}`);
}

const hashLines = readFileSync(path.join(REVIEW_DIR, "MANIFEST.sha256"), "utf8")
  .trim().split(/\r?\n/u).filter(Boolean);
assert(hashLines.length === 6, "MANIFEST.sha256 line count drift");
const parsedLines = hashLines.map((line) => {
  const match = /^([a-f0-9]{64})  (.+)$/u.exec(line);
  assert(match, `invalid hash line: ${line}`);
  return { sha256: match[1]!, path: match[2]! };
});
const expectedHashNames = ["REPORT.md", "audit.ts", "evidence.json", "legacy-replay.mts", "manifest.json", "verify.mts"].sort();
assert(JSON.stringify(parsedLines.map((entry) => entry.path).sort()) === JSON.stringify(expectedHashNames),
  "MANIFEST.sha256 names drift");
for (const entry of parsedLines) {
  assert(sha256(readFileSync(path.join(REVIEW_DIR, entry.path))) === entry.sha256,
    `MANIFEST.sha256 mismatch: ${entry.path}`);
}

const auditSource = readFileSync(path.join(REVIEW_DIR, "audit.ts"), "utf8");
assert(!auditSource.includes("require(OFFLINE_PATH)"), "audit imports coordinated test");
assert(!auditSource.includes("import(OFFLINE_PATH)"), "audit imports coordinated test");
assert((auditSource.match(/readFileSync\(OFFLINE_PATH\)/gu) ?? []).length === 1,
  "audit must hash-read coordinated test exactly once");
assert(!/readFileSync\(OFFLINE_PATH\)[\s\S]{0,80}(?:toString|JSON\.parse)/gu.test(auditSource),
  "audit appears to inspect coordinated test content");

function execute(script: string, args: string[] = []): any {
  const output = execFileSync(process.execPath, ["--import", "tsx", path.join(REVIEW_DIR, script), ...args], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    timeout: 240_000,
    maxBuffer: 128 * 1024 * 1024,
    windowsHide: true,
    env: { ...process.env, NO_COLOR: "1" },
  });
  return JSON.parse(output);
}

const legacy917 = execute("legacy-replay.mts", ["917"]);
assert(legacy917.verdict === "PASS_NO_BLOCKERS", "917-case replay verdict drift");
assert(legacy917.subjectSha256 === EXPECTED_SUBJECT && legacy917.coordinatedOfflineTestSha256 === EXPECTED_OFFLINE,
  "917-case subject binding drift");
assert(legacy917.totalCases === 917 && legacy917.passingCases === 917 && legacy917.failingCases === 0,
  "917-case replay counts drift");
assert(legacy917.matrixFingerprintSha256 === EXPECTED_917_MATRIX, "917-case matrix drift");

const legacy986 = execute("legacy-replay.mts", ["986"]);
assert(legacy986.verdict === "PASS_NO_BLOCKERS", "986-case replay verdict drift");
assert(legacy986.subjectSha256 === EXPECTED_SUBJECT && legacy986.coordinatedOfflineTestSha256 === EXPECTED_OFFLINE,
  "986-case subject binding drift");
assert(legacy986.totalCases === 986 && legacy986.passingCases === 986 && legacy986.failingCases === 0,
  "986-case replay counts drift");
assert(legacy986.matrixFingerprintSha256 === EXPECTED_986_MATRIX, "986-case matrix drift");

const fresh = execute("audit.ts");
assert(fresh.verdict === "PASS_NO_BLOCKERS", "fresh verdict drift");
assert(fresh.subjectSha256 === EXPECTED_SUBJECT && fresh.coordinatedOfflineTestSha256 === EXPECTED_OFFLINE,
  "fresh subject binding drift");
assert(fresh.totalCases === 1_950 && fresh.passingCases === 1_950 && fresh.failingCases === 0,
  "fresh counts drift");
assert(fresh.distinctRawBodies === 1_627 && fresh.streamScheduleCases === 320, "fresh diversity counts drift");
assert(fresh.referenceScannerCases === 720 && fresh.handClassCases === 1_230, "fresh oracle source counts drift");
assert(JSON.stringify(fresh.oracleCounts) === JSON.stringify({ EXACT: 884, QUARANTINE: 664, INVARIANTS: 402 }),
  "fresh oracle composition drift");
assert(fresh.matrixFingerprintSha256 === EXPECTED_FRESH_MATRIX, "fresh matrix drift");
assert(fresh.resultFingerprintSha256 === EXPECTED_FRESH_RESULT, "fresh result drift");
assert(fresh.failureFingerprintSha256 === EXPECTED_EMPTY_FAILURES, "fresh failure fingerprint drift");
assert(Array.isArray(fresh.failures) && fresh.failures.length === 0, "fresh failures not empty");
assert(JSON.stringify(fresh.categoryCounts) === JSON.stringify(evidence.freshIndependentMatrix.categoryCounts),
  "fresh/evidence category drift");

for (const activity of [legacy917.independence, legacy986.independence, fresh.independence, evidence.independence]) {
  for (const [key, value] of Object.entries(activity)) {
    if (/Calls|Reads|Writes|Commands|Edits/iu.test(key)) {
      assert(value === 0, `nonzero prohibited activity: ${key}=${value}`);
    }
  }
}

const combinedBinding = sha256(`${EXPECTED_917_MATRIX}|${EXPECTED_986_MATRIX}|${EXPECTED_FRESH_MATRIX}`);
assert(combinedBinding === EXPECTED_COMBINED_BINDING, "combined fingerprint computation drift");
const subjectAfter = sha256(readFileSync(SUBJECT_PATH));
const offlineAfter = sha256(readFileSync(OFFLINE_PATH));
assert(subjectAfter === subjectBefore, "subject changed during verification");
assert(offlineAfter === offlineBefore, "offline test changed during verification");

process.stdout.write(`${JSON.stringify({
  verdict: "PASS_REVIEW_INTEGRITY",
  reviewVerdict: "PASS_NO_BLOCKERS",
  authority: "NONE",
  scope: "OBSERVER_ONLY",
  subjectSha256: subjectAfter,
  offlineTestSha256: offlineAfter,
  legacy: { cases: 1_903, passing: 1_903, failing: 0 },
  fresh: {
    cases: fresh.totalCases,
    passing: fresh.passingCases,
    failing: fresh.failingCases,
    distinctRawBodies: fresh.distinctRawBodies,
    streamSchedules: fresh.streamScheduleCases,
    matrixFingerprintSha256: fresh.matrixFingerprintSha256,
  },
  combined: { cases: 3_853, passing: 3_853, failing: 0 },
  combinedMatrixBindingFingerprintSha256: combinedBinding,
}, null, 2)}\n`);
