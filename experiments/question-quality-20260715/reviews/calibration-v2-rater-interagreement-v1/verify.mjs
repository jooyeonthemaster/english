import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildReport } from "./build.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const manifestRows = readFileSync(path.join(here, "MANIFEST.sha256"), "utf8").trim().split(/\r?\n/u);
for (const row of manifestRows) {
  const match = /^([a-f0-9]{64})  (.+)$/u.exec(row);
  assert(match);
  assert.equal(sha(readFileSync(path.join(repoRoot, match[2]))), match[1]);
}
const stored = JSON.parse(readFileSync(path.join(here, "report.json"), "utf8"));
const fresh = buildReport();
assert.deepEqual(fresh, stored);
assert.equal(stored.aggregate.items, 24);
assert.equal(Object.values(stored.byBlock).every((row) => row.items === 8), true);
assert.equal(stored.status, "SOURCE_BINDING_DEFECTS_MECHANICALLY_REBOUND_INTER_RATER_DISAGREEMENT_NOT_GOLD");
assert.equal(stored.activity.apiCandidatesConsumed, 0);
assert.equal(stored.activity.externalNetworkCalls, 0);
const inputPaths = JSON.stringify(stored.inputArtifacts);
assert(!/author|gold|adjudicator/iu.test(inputPaths));
assert.deepEqual(stored.mechanicallyReboundArtifacts.permittedChangedFields, ["relabelMapSha256", "phase2RevealSha256"]);
assert.equal(stored.mechanicallyReboundArtifacts.judgmentMutationAllowed, false);
assert.equal(stored.sourceBindingAudit.A.sourcePhase2RevealBinding.ROW_INCORRECT, 24);
assert.equal(stored.sourceBindingAudit.B.sourceRelabelMapBinding.BUNDLE_INCORRECT, 24);
assert.equal(stored.disagreementItems.every((row) => /^RCAL2-(G|B|N)[0-9]{2}$/u.test(row.itemId)), true);
process.stdout.write(`${JSON.stringify({ verdict: "PASS_INTER_RATER_AUDIT_NOT_GOLD", items: 24, disagreementItems: stored.disagreementItems.length, manifestRows: manifestRows.length, candidates: 0, network: 0 }, null, 2)}\n`);
