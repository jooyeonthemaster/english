import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

test("sealed v11 structural audit artifacts verify end to end", () => {
  const raw = execFileSync(process.execPath, [path.join(here, "verify.mjs")], {
    cwd: here,
    encoding: "utf8",
    env: { ...process.env, NODE_OPTIONS: "" },
  });
  const summary = JSON.parse(raw);
  assert.equal(summary.status, "verified");
  assert.ok(summary.caseCount >= 240);
  assert.ok(summary.familyCount >= 40);
  assert.equal(summary.blocking.total, summary.caseCount);
  assert.equal(summary.exactTarget.total, summary.caseCount);
});
