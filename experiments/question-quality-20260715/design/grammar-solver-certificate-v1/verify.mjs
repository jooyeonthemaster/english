import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const lines = readFileSync(path.join(here, "MANIFEST.sha256"), "utf8")
  .trim()
  .split(/\r?\n/u);
assert.equal(lines.length, 4);
for (const line of lines) {
  const match = line.match(/^([a-f0-9]{64})  (.+)$/u);
  assert.ok(match, `malformed manifest line: ${line}`);
  const [, expected, relativePath] = match;
  const actual = createHash("sha256")
    .update(readFileSync(path.join(repoRoot, relativePath)))
    .digest("hex");
  assert.equal(actual, expected, `hash mismatch: ${relativePath}`);
}

const tests = spawnSync(
  process.execPath,
  [
    path.join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs"),
    "--test",
    path.join(here, "contract.test.ts"),
  ],
  { cwd: repoRoot, encoding: "utf8", env: { ...process.env, NODE_OPTIONS: "" } },
);
assert.equal(tests.status, 0, tests.stderr || tests.stdout);
assert.match(tests.stdout, /tests 5/u);
assert.match(tests.stdout, /pass 5/u);
assert.match(tests.stdout, /fail 0/u);

process.stdout.write(
  `${JSON.stringify({
    verdict: "PASS_DESIGN_MECHANISM_ONLY_EXECUTION_BLOCKED",
    contractTests: "5/5",
    manifestEntries: lines.length,
    modelApiCalls: 0,
  }, null, 2)}\n`,
);
