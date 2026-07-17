import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const manifestPath = path.join(here, "MANIFEST.sha256");
const lines = readFileSync(manifestPath, "utf8").trim().split(/\r?\n/u);
assert.ok(lines.length >= 12);

for (const line of lines) {
  const match = /^([a-f0-9]{64})  (.+)$/u.exec(line);
  assert.ok(match, `malformed manifest line: ${line}`);
  const [, expected, relativePath] = match;
  const actual = createHash("sha256")
    .update(readFileSync(path.join(repoRoot, relativePath)))
    .digest("hex");
  assert.equal(actual, expected, `hash mismatch: ${relativePath}`);
}

const run = (command, args) =>
  spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, NODE_OPTIONS: "" },
  });

const replay = run(process.execPath, [
  path.join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs"),
  path.join(here, "replay.mts"),
]);
assert.equal(replay.status, 0, replay.stderr || replay.stdout);
const result = JSON.parse(replay.stdout);
assert.deepEqual(
  {
    verdict: result.verdict,
    adjudicatedDisagreements: result.adjudicatedDisagreements,
    pairedControls: result.pairedControls,
    totalExecutions: result.totalExecutions,
    failures: result.failures,
  },
  {
    verdict: "PASS_POST_FIT_CONFIRMED_ONLY_REPLAY",
    adjudicatedDisagreements: 46,
    pairedControls: 46,
    totalExecutions: 92,
    failures: 0,
  },
);
assert.match(result.qualification, /not an independent holdout PASS/u);
assert.deepEqual(result.intentionallyExcluded, {
  productContractScopeMismatchF3: 13,
  redundantWrapperF4P12: 1,
});

const tests = run(process.execPath, [
  "--test",
  "tests/unit/summary-mc-direction-split.test.mjs",
  "tests/unit/grammar-keypoint-core10.test.mjs",
  "tests/unit/sentence-order-quality.test.mjs",
  "tests/unit/grammar-generation-quality.test.mjs",
]);
assert.equal(tests.status, 0, tests.stderr || tests.stdout);

process.stdout.write(
  `${JSON.stringify({ ok: true, manifestEntries: lines.length, ...result }, null, 2)}\n`,
);
