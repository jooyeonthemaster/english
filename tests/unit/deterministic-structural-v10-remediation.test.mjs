import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const tsx = path.join(repoRoot, "node_modules/tsx/dist/cli.mjs");
const artifact = path.join(
  repoRoot,
  "experiments/question-quality-20260715/reviews/deterministic-structural-remediation-v10",
);

function run(name) {
  return JSON.parse(
    execFileSync(process.execPath, [tsx, path.join(artifact, name)], {
      cwd: repoRoot,
      encoding: "utf8",
      env: { ...process.env, NODE_OPTIONS: "" },
    }),
  );
}

test("v10 confirmed-only remediation catches 34 defects and preserves all controls", () => {
  const result = run("replay.mts");
  assert.equal(result.verdict, "PASS_POST_FIT_CONFIRMED_ONLY_REPLAY");
  assert.deepEqual(result.before, { tp: 25, fn: 75, fp: 0, tn: 100 });
  assert.deepEqual(result.after, { tp: 59, fn: 41, fp: 0, tn: 100 });
  assert.deepEqual(result.delta, { tp: 34, fn: -34, fp: 0, tn: 0 });
  assert.equal(result.confirmedProductContract.caught, 34);
  assert.equal(result.confirmedProductContract.pairedControlsPreserved, 34);
  assert.equal(result.intentionallyUntargeted.remainedNormal, 41);
  assert.equal(result.allNormalControlsPreserved, 100);
});

test("v10 remediation passes separately authored paired and semantic-truth controls", () => {
  const result = run("novel-regressions.mts");
  assert.equal(result.verdict, "PASS_NOVEL_PAIRED_REGRESSIONS");
  assert.equal(result.fragmentPairs, 9);
  assert.equal(result.semanticTruthControls, 4);
  assert.equal(result.failures, 0);
});
