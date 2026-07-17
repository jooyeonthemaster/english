import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../../..");
const sha256 = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const result = spawnSync(process.execPath, [path.join(root, "node_modules/tsx/dist/cli.mjs"), path.join(here, "build.mts"), "--check"], { cwd: root, encoding: "utf8", windowsHide: true });
assert.equal(result.status, 0, result.stderr);
const manifestRows = readFileSync(path.join(here, "MANIFEST.sha256"), "utf8").trim().split(/\r?\n/u);
assert.equal(manifestRows.length, 4);
for (const row of manifestRows) {
  const match = /^([a-f0-9]{64})  (.+)$/u.exec(row);
  assert(match);
  assert.equal(sha256(readFileSync(path.join(root, match[2]!))), match[1]);
}
const report = JSON.parse(readFileSync(path.join(here, "report.json"), "utf8"));
assert.equal(report.status, "OFFLINE_MEDIATOR_DIAGNOSTIC_NOT_QUALITY_EVIDENCE");
assert.equal(report.source.assignments, 180);
assert.equal(report.activity.apiCandidatesConsumed, 0);
assert.equal(report.profileBodyBytes.G0_CURRENT_CONTROL.sumBodyUtf8Bytes, 2_073_542);
assert.equal(report.profileBodyBytes.B0_CURRENT_CONTROL.sumBodyUtf8Bytes, 990_492);
process.stdout.write(`${JSON.stringify({ valid: true, rows: 180, profiles: 8, reportSemanticSha256: report.semanticSha256 })}\n`);
