import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../..");
const PRIOR_AUDIT_DIR = path.join(HERE, "../policy-severity-audit");

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function readJson(name: string): any {
  return JSON.parse(readFileSync(path.join(HERE, name), "utf8"));
}

const manifest = readJson("manifest.json");
const cases = readJson("cases.json");
const inventory = readJson("emitted-code-inventory.json");
const results = readJson("results.json");

for (const [name, expectedHash] of Object.entries(manifest.artifactFileHashes)) {
  assert.equal(
    sha256(readFileSync(path.join(HERE, name))),
    expectedHash,
    `artifact hash drift: ${name}`,
  );
}

const sourcePaths = Object.keys(manifest.sourceFileHashes).sort();
for (const relativePath of sourcePaths) {
  assert.equal(
    sha256(readFileSync(path.join(REPO_ROOT, relativePath))),
    manifest.sourceFileHashes[relativePath],
    `source snapshot drift: ${relativePath}`,
  );
}
const sourceSnapshotHash = sha256(
  sourcePaths
    .map((relativePath) =>
      `${relativePath}\0${readFileSync(path.join(REPO_ROOT, relativePath), "utf8")}`
    )
    .join("\0"),
);
assert.equal(sourceSnapshotHash, manifest.sourceSnapshotHash);
assert.equal(inventory.sourceSnapshotHash, manifest.sourceSnapshotHash);
assert.equal(results.sourceSnapshotHash, manifest.sourceSnapshotHash);

const repoHead = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: REPO_ROOT,
  encoding: "utf8",
}).trim();
assert.equal(repoHead, manifest.repoHead, "git HEAD drift");

assert.equal(
  sha256(readFileSync(path.join(PRIOR_AUDIT_DIR, "INVENTORY.json"))),
  manifest.priorArtifact.inventoryHash,
  "prior inventory drift",
);
assert.equal(
  sha256(readFileSync(path.join(PRIOR_AUDIT_DIR, "AUDIT.md"))),
  manifest.priorArtifact.auditHash,
  "prior audit drift",
);

assert.equal(cases.constraints.apiCandidatesCreated, 0);
assert.equal(cases.constraints.networkCalls, 0);
assert.equal(cases.constraints.databaseCalls, 0);
assert.equal(cases.constraints.secretsRead, 0);
assert.equal(cases.constraints.productionFilesEdited, 0);
assert.equal(manifest.invariants.apiCandidatesCreated, 0);
assert.equal(manifest.invariants.externalModelCalls, 0);
assert.equal(manifest.invariants.databaseCalls, 0);
assert.equal(manifest.invariants.productionFilesEditedByThisAudit, 0);

assert.equal(inventory.counts.activeEnglishTypes, 25);
assert.equal(inventory.typeCoverage.length, 25);
assert.equal(inventory.counts.emittedEnglishQualityCodes, 466);
assert.equal(inventory.codes.length, inventory.counts.emittedEnglishQualityCodes);
assert.equal(new Set(inventory.codes.map((row: any) => row.code)).size, inventory.codes.length);
assert.ok(inventory.codes.every((row: any) => row.rawSeverities.length >= 1));
assert.ok(inventory.codes.every((row: any) => row.postShipFirstSeverities.length >= 1));
assert.ok(inventory.codes.every((row: any) => row.activeEnglishTypeScopes.length >= 1));
assert.equal(inventory.dynamicAddSites.length, 14);
assert.equal(
  inventory.dynamicAddSites.filter(
    (row: any) => row.classification === "excluded-non-English-KO-dispatch",
  ).length,
  1,
);

assert.equal(results.verdict.overall, "BLOCK");
assert.equal(manifest.invariants.verdict, "BLOCK");
assert.equal(results.counts.apiCandidatesCreated, 0);
assert.equal(results.counts.semanticRolePairs, 5);
assert.equal(results.counts.tokenBalancedPairs, 5);
assert.equal(results.counts.semanticDefectsBlocked, 0);
assert.equal(results.semanticRoleResults.length, 5);
assert.deepEqual(
  results.semanticRoleResults.map((row: any) => row.dimension),
  ["actor", "polarity", "condition", "cause", "scope"],
);
for (const row of results.semanticRoleResults) {
  assert.equal(row.lexicalControl.equal, true, `${row.dimension}: token balance drift`);
  assert.equal(
    row.lexicalControl.faithfulTokenCount,
    row.lexicalControl.defectTokenCount,
    `${row.dimension}: unequal lexical control`,
  );
  assert.equal(row.defectBlockedForSemanticIntegrity, false, `${row.dimension}: finding changed`);
  assert.equal(row.defectSemanticErrors.length, 0, `${row.dimension}: finding changed`);
}
assert.deepEqual(results.semanticIntegrityCodeDiscovery.matchedCodes, [
  "blank-killer-polarity-shortcut",
  "blank-paraphrase-polarity-loss",
]);
assert.equal(results.narrowPolarityPositiveControl.faithful, null);
assert.equal(
  results.narrowPolarityPositiveControl.defect.code,
  cases.narrowPolarityPositiveControl.expectedDefectCode,
);
assert.equal(
  results.tokenProxyCollision.faithfulCompression.code,
  cases.tokenProxyCollision.expectedSharedCode,
);
assert.equal(
  results.tokenProxyCollision.genericMeaningLoss.code,
  cases.tokenProxyCollision.expectedSharedCode,
);

assert.equal(results.counts.priorSafetyFindings, 13);
assert.equal(results.counts.priorSafetyFindingsRemediated, 12);
assert.equal(results.counts.priorSafetyFindingsUnresolved, 1);
assert.deepEqual(
  results.priorAuditComparison
    .filter((row: any) => !row.remediated)
    .map((row: any) => row.priorCode),
  ["blank-paraphrase-correct-too-thin"],
);
assert.equal(
  results.priorAuditComparison
    .filter((row: any) => row.priorClass === "IMMEDIATE_REMOVAL")
    .every((row: any) => row.remediated),
  true,
);
assert.equal(results.counts.stalePolicyEntriesStillWithoutEnglishEmitter, 2);
assert.deepEqual(
  results.stalePolicyComparison.map((row: any) => ({
    code: row.code,
    stillNoEnglishQualityEmitter: row.stillNoEnglishQualityEmitter,
  })),
  [
    {
      code: "blank-paraphrase-killer-giveaway-distractors",
      stillNoEnglishQualityEmitter: true,
    },
    { code: "grammar-obvious-living-lived", stillNoEnglishQualityEmitter: true },
  ],
);

process.stdout.write(`${JSON.stringify({
  ok: true,
  verdict: results.verdict.overall,
  sourceSnapshotHash,
  emittedEnglishQualityCodes: inventory.codes.length,
  priorFindingsRemediated:
    `${results.counts.priorSafetyFindingsRemediated}/${results.counts.priorSafetyFindings}`,
  semanticDefectsBlocked:
    `${results.counts.semanticDefectsBlocked}/${results.counts.semanticRolePairs}`,
  apiCandidatesCreated: results.counts.apiCandidatesCreated,
}, null, 2)}\n`);
