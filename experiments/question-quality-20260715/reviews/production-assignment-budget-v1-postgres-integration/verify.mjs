import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../../..");
const readJson = (name) => JSON.parse(readFileSync(join(here, name), "utf8"));
const hashFile = (path) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");

const results = readJson("results.json");
assert.equal(results.verdict, "PASS");
assert.equal(results.database.hostClass, "loopback");
assert.equal(results.database.namePrefix, "qgen_budget_ephemeral_");
assert.equal(results.apiCalls, 0);
assert.equal(results.externalNetworkCalls, 0);
assert.equal(results.localPostgresOnly, true);
assert.equal(results.productionDatabaseWrites, 0);

const sameJob = results.tests.sameJob100Way;
assert.deepEqual(
  [sameJob.attempted, sameJob.delegated, sameJob.rejected, sameJob.durableLeases],
  [100, 7, 93, 7],
);
assert.deepEqual(sameJob.ordinalRange, [1, 7]);

const mixed = results.tests.mixedReservedCost100Way;
assert.equal(mixed.attempted, 100);
assert.equal(mixed.concurrentPhase, 98);
assert.ok(mixed.delegated < mixed.physicalCap);
assert.ok(mixed.rejected > 0);
assert.ok(mixed.reservedCostMicros <= mixed.maxReservedCostMicros);
assert.ok(mixed.distinctReservationSizes >= 2);

assert.deepEqual(results.tests.ordinalContinuation.durableOrdinals, [1, 2, 3, 4, 5]);
assert.equal(results.tests.terminalWins.blockedWhileLockHeld, true);
assert.equal(results.tests.terminalWins.delegated, 0);
assert.equal(results.tests.leaseWinsThenTerminal.delegatedBeforeTerminal, 1);
assert.equal(results.tests.leaseWinsThenTerminal.delegatedAfterTerminal, 0);
assert.equal(results.tests.enforceToShadowDrift.unscopedCallbacks, 0);
assert.equal(results.tests.migrationStateConstraints.illegalBudgetStateRejected, true);
assert.equal(results.tests.migrationStateConstraints.illegalLeaseStateRejected, true);

const sourcePaths = {
  migration:
    "prisma/migrations/20260715000000_add_question_generation_call_budgets/migration.sql",
  boundary: "src/lib/atlas-production-assignment-fetch-boundary.ts",
  policy: "src/lib/question-generation-assignment-budget-policy.ts",
  runtime: "src/lib/question-generation-assignment-budget.ts",
  trigger: "src/trigger/workbench-question-generation.ts",
};
for (const [key, relative] of Object.entries(sourcePaths)) {
  assert.equal(results.sourceHashes[key], hashFile(join(root, relative)), `${key} drift`);
}

const manifest = readJson("manifest.json");
const artifactFiles = readdirSync(here)
  .filter((name) => name !== "manifest.json")
  .sort();
assert.deepEqual(Object.keys(manifest.files).sort(), artifactFiles);
for (const name of artifactFiles) {
  assert.equal(manifest.files[name], hashFile(join(here, name)), `${name} hash drift`);
}

const artifactText = artifactFiles
  .map((name) => readFileSync(join(here, name), "utf8"))
  .join("\n");
assert.doesNotMatch(artifactText, /(?:sk|AIza|OPENROUTER_API_KEY)[-_A-Za-z0-9]{16,}/);
assert.doesNotMatch(artifactText, /postgres(?:ql)?:\/\//i);

console.log(
  JSON.stringify(
    {
      verdict: "PASS",
      postgresVersion: results.postgresVersion,
      tests: Object.keys(results.tests).length,
      sourceHashes: Object.keys(results.sourceHashes).length,
      artifactFiles: artifactFiles.length,
    },
    null,
    2,
  ),
);
