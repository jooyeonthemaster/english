import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const auditPath = path.join(here, "audit.mts");
const resultsPath = path.join(here, "RESULTS.json");
const manifestPath = path.join(here, "MANIFEST.sha256");
const tsxCli = path.join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs");
const hash = (filePath) =>
  createHash("sha256").update(readFileSync(filePath)).digest("hex");

const results = JSON.parse(readFileSync(resultsPath, "utf8"));
assert.equal(results.verdict, "BLOCK");
assert.equal(results.summary.total, 520);
assert.equal(results.summary.pass, 482);
assert.equal(results.summary.fail, 38);
assert.equal(results.summary.base242.total, 242);
assert.equal(results.summary.base242.pass, 242);
assert.equal(results.summary.base242.fail, 0);
assert.equal(results.summary.extra.total, 278);
assert.equal(results.summary.extra.pass, 240);
assert.equal(results.summary.extra.fail, 38);
assert.equal(results.summary.extra.generatedCfCodePointCount, 65);
assert.deepEqual(results.summary.extra.categories, {
  "summary-direction-v4": { total: 44, pass: 19, fail: 25 },
  "blank-circled-v4": { total: 24, pass: 15, fail: 9 },
  "grammar-ghost-v4": { total: 48, pass: 46, fail: 2 },
  "blank-residual-v4": { total: 42, pass: 42, fail: 0 },
  "grammar-terminology-v4": { total: 38, pass: 36, fail: 2 },
  "sentence-order-cf-v4": { total: 82, pass: 82, fail: 0 },
});
assert.equal(results.failures.length, 38);
assert.deepEqual(
  results.failures.map((item) => item.id),
  results.summary.failedCaseIds,
);
assert.deepEqual(results.policy.inheritedViolations, []);

const failuresByCategory = Object.groupBy(
  results.failures,
  (failure) => failure.category,
);
assert.equal(failuresByCategory["summary-direction-v4"].length, 25);
assert.ok(
  failuresByCategory["summary-direction-v4"].every(
    (failure) => failure.expected === true && failure.observed === false,
  ),
);
assert.equal(failuresByCategory["blank-circled-v4"].length, 9);
assert.ok(
  failuresByCategory["blank-circled-v4"].every(
    (failure) => failure.expected === false && failure.observed === true,
  ),
);
for (const category of ["grammar-ghost-v4", "grammar-terminology-v4"]) {
  assert.equal(failuresByCategory[category].length, 2);
  assert.ok(
    failuresByCategory[category].every(
      (failure) => failure.expected === true && failure.observed === false,
    ),
  );
}

for (const [name, count] of Object.entries(results.safety)) {
  assert.equal(count, 0, `${name} must remain zero`);
}
assert.equal(hash(auditPath), results.provenance.auditScriptSha256);
assert.equal(
  hash(
    path.join(
      repoRoot,
      "experiments/question-quality-20260715/reviews/deterministic-splits-remediation-reaudit-v3/audit.mts",
    ),
  ),
  results.provenance.baseHarnessSha256,
);
assert.equal(
  results.provenance.baseHarnessReportedSha256,
  results.provenance.baseHarnessSha256,
);
assert.equal(
  hash(
    path.join(
      repoRoot,
      "experiments/question-quality-20260715/reviews/deterministic-splits-remediation-reaudit-v3/MANIFEST.sha256",
    ),
  ),
  results.provenance.frozenV3BlockManifestSha256,
);

const sourceDrift = [];
for (const [relativePath, expectedHash] of Object.entries(
  results.provenance.auditedSourceAndTestSha256,
)) {
  if (hash(path.join(repoRoot, relativePath)) !== expectedHash) {
    sourceDrift.push(relativePath);
  }
}

let replay = "skipped: audited source snapshot has subsequent drift";
if (sourceDrift.length === 0) {
  const observed = JSON.parse(
    execFileSync(process.execPath, [tsxCli, auditPath], {
      cwd: repoRoot,
      encoding: "utf8",
      env: { ...process.env, NODE_OPTIONS: "" },
    }),
  );
  assert.deepEqual(observed, results);
  replay = "semantic JSON replay passed";
}

const manifestEntries = readFileSync(manifestPath, "utf8")
  .trim()
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => {
    const match = line.match(/^([0-9a-f]{64})  (.+)$/);
    assert.ok(match, `invalid manifest line: ${line}`);
    return { expectedHash: match[1], relativePath: match[2] };
  });
for (const entry of manifestEntries) {
  assert.equal(hash(path.join(here, entry.relativePath)), entry.expectedHash);
}

process.stdout.write(
  `${JSON.stringify(
    {
      ok: true,
      verdict: results.verdict,
      total: results.summary.total,
      pass: results.summary.pass,
      fail: results.summary.fail,
      falseNegatives: 29,
      falsePositives: 9,
      artifactManifestEntries: manifestEntries.length,
      artifactManifestSha256: hash(manifestPath),
      sourceSnapshotCurrent: sourceDrift.length === 0,
      sourceDriftPaths: sourceDrift,
      replay,
      safety: results.safety,
    },
    null,
    2,
  )}\n`,
);
