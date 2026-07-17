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
assert.ok(lines.length >= 10);

for (const line of lines) {
  const match = line.match(/^([a-f0-9]{64})  (.+)$/u);
  assert.ok(match, `malformed manifest line: ${line}`);
  const [, expected, relativePath] = match;
  const actual = createHash("sha256")
    .update(readFileSync(path.join(repoRoot, relativePath)))
    .digest("hex");
  assert.equal(actual, expected, `hash mismatch: ${relativePath}`);
}

const replay = spawnSync(
  process.execPath,
  [
    path.join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs"),
    path.join(here, "replay.mts"),
  ],
  { cwd: repoRoot, encoding: "utf8", env: { ...process.env, NODE_OPTIONS: "" } },
);
assert.equal(replay.status, 0, replay.stderr || replay.stdout);
const result = JSON.parse(replay.stdout);
assert.equal(result.verdict, "PASS_POST_FIT_REPLAY_ONLY");
assert.deepEqual(
  {
    total: result.total,
    pass: result.pass,
    falseNegative: result.falseNegative,
    falsePositive: result.falsePositive,
  },
  { total: 128, pass: 128, falseNegative: 0, falsePositive: 0 },
);
assert.match(result.qualification, /not an independent holdout PASS/u);

const tests = spawnSync(
  process.execPath,
  [
    "--test",
    "tests/unit/summary-mc-direction-split.test.mjs",
    "tests/unit/grammar-keypoint-core10.test.mjs",
    "tests/unit/sentence-order-quality.test.mjs",
    "tests/unit/grammar-generation-quality.test.mjs",
  ],
  { cwd: repoRoot, encoding: "utf8", env: { ...process.env, NODE_OPTIONS: "" } },
);
assert.equal(tests.status, 0, tests.stderr || tests.stdout);

process.stdout.write(
  `${JSON.stringify({ ok: true, ...result, manifestEntries: lines.length }, null, 2)}\n`,
);

