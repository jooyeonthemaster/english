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
const tsxCli = path.join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs");

const expected = JSON.parse(readFileSync(resultsPath, "utf8"));
const observed = JSON.parse(
  execFileSync(process.execPath, [tsxCli, auditPath], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, NODE_OPTIONS: "" },
  }),
);

assert.deepEqual(observed, expected, "fresh audit replay differs from frozen RESULTS.json");
for (const [name, count] of Object.entries(expected.safety)) {
  assert.equal(count, 0, `${name} must remain zero`);
}
assert.deepEqual(expected.policy.fatalPolicyViolations, []);
assert.equal(expected.policy.legacyTerminologyCodePresentInAnyPolicy, false);

const hash = (filePath) =>
  createHash("sha256").update(readFileSync(filePath)).digest("hex");

process.stdout.write(
  `${JSON.stringify(
    {
      ok: true,
      replay: "byte-semantics-equivalent JSON",
      artifactSha256: {
        audit: hash(auditPath),
        results: hash(resultsPath),
        verifier: hash(fileURLToPath(import.meta.url)),
      },
      fatalPolicyViolations: expected.policy.fatalPolicyViolations.length,
      safety: expected.safety,
    },
    null,
    2,
  )}\n`,
);
