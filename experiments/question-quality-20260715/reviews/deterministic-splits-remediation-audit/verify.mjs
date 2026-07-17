import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const resultsPath = path.join(here, "RESULTS.json");
const auditPath = path.join(here, "audit.mts");
const manifestPath = path.join(here, "MANIFEST.sha256");
const tsxCli = path.join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs");

const hash = (filePath) =>
  createHash("sha256").update(readFileSync(filePath)).digest("hex");

const results = JSON.parse(readFileSync(resultsPath, "utf8"));
assert.equal(results.verdict, "BLOCK");
assert.deepEqual(results.summary, {
  total: 97,
  pass: 91,
  fail: 6,
  categories: results.summary.categories,
  failedCaseIds: [
    "direction-competing-blank-plural",
    "direction-mixed-summary-and-grammar",
    "direction-mixed-summary-and-blank",
    "circled-options-can-be-seen",
    "ghost-nested-bullet-number",
    "ghost-circled-list-number",
  ],
});
assert.equal(results.passedCaseIds.length, 91);
assert.equal(results.failures.length, 6);
assert.equal(new Set([...results.passedCaseIds, ...results.summary.failedCaseIds]).size, 97);
assert.deepEqual(results.policy.violations, []);
for (const item of Object.values(results.policy.map)) {
  assert.equal(item.relaxedBlocking, true);
  assert.equal(item.salvageRelaxable, false);
  assert.equal(item.shipFirstWarning, false);
}
for (const [name, count] of Object.entries(results.safety)) {
  assert.equal(count, 0, `${name} must remain zero`);
}
assert.equal(hash(auditPath), results.provenance.auditScriptSha256);

for (const [relativePath, expectedHash] of Object.entries(
  results.provenance.preservedOriginalFailArtifactSha256,
)) {
  assert.equal(hash(path.join(repoRoot, relativePath)), expectedHash);
}

const sourceDrift = [];
for (const [relativePath, expectedHash] of Object.entries(
  results.provenance.auditedSourceAndTestSha256,
)) {
  const observedHash = hash(path.join(repoRoot, relativePath));
  if (observedHash !== expectedHash) {
    sourceDrift.push({ relativePath, expectedHash, observedHash });
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
  assert.deepEqual(observed, results, "audit replay differs from frozen RESULTS.json");
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
      frozenResult: results.summary,
      artifactManifestEntries: manifestEntries.length,
      artifactManifestSha256: hash(manifestPath),
      sourceSnapshotCurrent: sourceDrift.length === 0,
      sourceDriftPaths: sourceDrift.map((item) => item.relativePath),
      replay,
      safety: results.safety,
    },
    null,
    2,
  )}\n`,
);
