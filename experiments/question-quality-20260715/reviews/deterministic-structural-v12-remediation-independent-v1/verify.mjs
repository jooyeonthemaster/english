import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../../..");

function load(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function sorted(values) {
  return [...values].sort((a, b) => a.localeCompare(b));
}

const expectedFatalCodes = [
  "generic-answer-count",
  "generic-multi-answer-direction",
  "sentence-insert-missing-given",
  "sentence-order-dependent-fragment",
  "sentence-order-paragraph-body-label",
];
const expectedRedundantCodes = [
  "multi-blank-correct-option-mismatch",
  "multi-blank-count",
  "multi-blank-duplicate-option",
  "multi-blank-expression-not-in-passage",
  "multi-blank-label",
  "multi-blank-marker-count",
  "multi-blank-missing-expression",
  "multi-blank-missing-passage",
  "multi-blank-option-values",
  "scrambled-near-answer-order",
  "summary-complete-missing-blank-answer",
  "type-foreign-field",
];

const auditPath = join(here, "audit.json");
const audit = load(auditPath);
assert.equal(audit.schemaVersion, 1);
assert.equal(audit.study, "deterministic-structural-v12-remediation-independent-v1");
assert.equal(audit.auditDate, "2026-07-15");
assert.equal(audit.verdict, "PASS");
assert.deepEqual(audit.scope, {
  apiCalls: 0,
  networkAccess: false,
  databaseAccess: false,
  productionSourceEditedByAudit: false,
  claim:
    "The minimal five-code v12 remediation closes all 15 A rows while all 36 C rows remain covered by independently rerun upstream/redundancy certificates.",
});
assert.deepEqual(audit.adjudicationPopulation, {
  rowCounts: { A: 15, B: 0, C: 36, D: 0 },
  codeCounts: { A: 5, B: 0, C: 12, D: 0 },
  productionFalseNegativePopulationMatched: true,
});

assert.deepEqual(audit.remediationPolicy.expectedFatalCodes, expectedFatalCodes);
assert.deepEqual(sorted(audit.remediationPolicy.anchoredAdditions), sorted(expectedFatalCodes));
assert.equal(audit.remediationPolicy.exactAnchoredAdditions, true);
assert.equal(audit.remediationPolicy.noUnintendedAdditionsWithinAdjudicated17, true);
assert.equal(audit.remediationPolicy.policyRows.length, 5);
for (const row of audit.remediationPolicy.policyRows) {
  assert.ok(expectedFatalCodes.includes(row.code));
  assert.equal(row.relaxedBlocking, true, `${row.code}: relaxed blocking drift`);
  assert.equal(row.salvageRelaxable, false, `${row.code}: salvage drift`);
  assert.equal(row.shipFirstWarning, false, `${row.code}: SHIP_FIRST drift`);
}
assert.equal(audit.remediationPolicy.redundantPolicyRows.length, 12);
for (const row of audit.remediationPolicy.redundantPolicyRows) {
  assert.ok(expectedRedundantCodes.includes(row.code));
  assert.equal(row.relaxedBlocking, false, `${row.code}: unintended blocker`);
  assert.equal(row.salvageRelaxable, false, `${row.code}: unintended salvage listing`);
  assert.equal(row.shipFirstWarning, false, `${row.code}: unintended SHIP_FIRST listing`);
}

assert.equal(audit.fatalCertificates.length, 5);
assert.deepEqual(
  sorted(audit.fatalCertificates.map((row) => row.code)),
  sorted(expectedFatalCodes),
);
for (const row of audit.fatalCertificates) {
  assert.equal(row.schemaAccepted, true);
  assert.equal(row.postProcessAccepted, true);
  assert.equal(row.targetIssueEmitted, true);
  assert.equal(row.blockedByTarget, true);
  assert.deepEqual(row.otherBlockingCodes, []);
  assert.deepEqual(row.blockingCodes, [row.code]);
}

assert.equal(audit.aRowCertificates.length, 15);
assert.equal(new Set(audit.aRowCertificates.map((row) => row.id)).size, 15);
for (const code of expectedFatalCodes) {
  const rows = audit.aRowCertificates.filter((row) => row.targetCode === code);
  assert.equal(rows.length, 3, `${code}: expected three blind rows`);
  assert.deepEqual(sorted(rows.map((row) => String(row.variant))), ["1", "2", "3"]);
}
for (const row of audit.aRowCertificates) {
  assert.equal(row.relaxedBlocking, true);
  assert.equal(row.salvageRelaxable, false);
  assert.equal(row.shipFirstWarning, false);
  assert.equal(row.schemaCertificatePassed, true);
}

assert.equal(audit.redundancyCertificates.length, 12);
assert.deepEqual(
  sorted(audit.redundancyCertificates.map((row) => row.code)),
  sorted(expectedRedundantCodes),
);
for (const row of audit.redundancyCertificates) {
  assert.equal(row.observed, true, `${row.code}: certificate drift`);
}
const duplicateCertificate = audit.redundancyCertificates.find(
  (row) => row.code === "multi-blank-duplicate-option",
);
assert.ok(duplicateCertificate);
assert.deepEqual(duplicateCertificate.evidence.blockingCodes, ["duplicate-option-text"]);

assert.equal(audit.cRowCertificates.length, 36);
assert.equal(new Set(audit.cRowCertificates.map((row) => row.id)).size, 36);
for (const code of expectedRedundantCodes) {
  const rows = audit.cRowCertificates.filter((row) => row.targetCode === code);
  assert.equal(rows.length, 3, `${code}: expected three blind rows`);
  assert.deepEqual(sorted(rows.map((row) => String(row.variant))), ["1", "2", "3"]);
}
for (const row of audit.cRowCertificates) {
  assert.equal(row.relaxedBlocking, false);
  assert.equal(row.certificateObserved, true);
}

for (const input of Object.values(audit.sealedInputs)) {
  const absolutePath = join(root, input.path);
  assert.equal(sha256(absolutePath), input.sha256, `${input.path}: sealed input drift`);
}
assert.equal(Object.keys(audit.sourceClosure).length, 17);
for (const [path, expected] of Object.entries(audit.sourceClosure)) {
  const absolutePath = join(root, path);
  const bytes = readFileSync(absolutePath);
  assert.equal(sha256(absolutePath), expected.sha256, `${path}: source closure drift`);
  assert.equal(bytes.byteLength, expected.bytes, `${path}: byte length drift`);
}

const rerun = spawnSync(
  process.execPath,
  [join(root, "node_modules/tsx/dist/cli.mjs"), join(here, "run-audit.mts"), "--check"],
  { cwd: root, encoding: "utf8", shell: false },
);
assert.equal(
  rerun.status,
  0,
  `independent certificate rerun failed:\n${rerun.stdout}\n${rerun.stderr}`,
);
const rerunSummary = JSON.parse(rerun.stdout.trim().split(/\r?\n/).at(-1));
assert.deepEqual(
  {
    verdict: rerunSummary.verdict,
    aRows: rerunSummary.aRows,
    aCodes: rerunSummary.aCodes,
    cRows: rerunSummary.cRows,
    cCodes: rerunSummary.cCodes,
    bRows: rerunSummary.bRows,
    dRows: rerunSummary.dRows,
  },
  { verdict: "PASS", aRows: 15, aCodes: 5, cRows: 36, cCodes: 12, bRows: 0, dRows: 0 },
);
assert.equal(rerunSummary.auditSha256, sha256(auditPath));

const manifest = load(join(here, "manifest.json"));
assert.equal(manifest.schemaVersion, 1);
assert.equal(manifest.study, audit.study);
const expectedManifestFiles = [
  "README.md",
  "audit.json",
  "finalize-manifest.mjs",
  "run-audit.mts",
  "tsconfig.json",
  "verify.mjs",
];
assert.deepEqual(sorted(Object.keys(manifest.files)), sorted(expectedManifestFiles));
for (const [name, expected] of Object.entries(manifest.files)) {
  const path = join(here, name);
  const bytes = readFileSync(path);
  assert.equal(sha256(path), expected.sha256, `${name}: manifest hash drift`);
  assert.equal(bytes.byteLength, expected.bytes, `${name}: manifest byte drift`);
}
const aggregatePayload = expectedManifestFiles
  .sort((a, b) => a.localeCompare(b))
  .map((name) => `${name}\0${manifest.files[name].sha256}\0${manifest.files[name].bytes}\n`)
  .join("");
assert.equal(
  createHash("sha256").update(aggregatePayload).digest("hex"),
  manifest.aggregateSha256,
  "manifest aggregate drift",
);

const secretPatterns = [
  /AIza[0-9A-Za-z_-]{20,}/,
  /\bsk-[0-9A-Za-z_-]{16,}/,
  /Bearer\s+[0-9A-Za-z._-]{16,}/i,
];
for (const name of expectedManifestFiles) {
  const text = readFileSync(join(here, name), "utf8");
  for (const pattern of secretPatterns) {
    assert.equal(pattern.test(text), false, `${name}: secret-like material found`);
  }
}

console.log(
  JSON.stringify({
    verdict: "PASS",
    auditSha256: sha256(auditPath),
    manifestSha256: sha256(join(here, "manifest.json")),
    aggregateSha256: manifest.aggregateSha256,
    aRows: 15,
    cRows: 36,
    rerun: rerunSummary,
  }),
);
