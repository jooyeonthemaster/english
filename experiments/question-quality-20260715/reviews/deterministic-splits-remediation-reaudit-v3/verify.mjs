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
assert.equal(results.summary.total, 242);
assert.equal(results.summary.pass, 201);
assert.equal(results.summary.fail, 41);
assert.equal(results.summary.base144.pass, 144);
assert.equal(results.summary.extra.total, 98);
assert.equal(results.failures.length, 41);
assert.deepEqual(
  results.failures.map((item) => item.id),
  results.summary.failedCaseIds,
);
assert.deepEqual(results.policy.inheritedViolations, []);
for (const [name, count] of Object.entries(results.safety)) {
  assert.equal(count, 0, `${name} must remain zero`);
}
assert.equal(hash(auditPath), results.provenance.auditScriptSha256);
assert.equal(
  hash(
    path.join(
      repoRoot,
      "experiments/question-quality-20260715/reviews/deterministic-splits-remediation-reaudit-v2/audit.mts",
    ),
  ),
  results.provenance.baseHarnessSha256,
);
assert.equal(
  hash(
    path.join(
      repoRoot,
      "experiments/question-quality-20260715/reviews/deterministic-splits-remediation-reaudit-v2/MANIFEST.sha256",
    ),
  ),
  results.provenance.frozenV2BlockManifestSha256,
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
