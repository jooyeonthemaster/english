import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { compileCampaignV5S1ControllerPreflight } from "./compile-controller-preflight.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const privatePath = path.join(here, "private/controller-preflight-v1.json");
const publicPath = path.join(here, "controller-preflight-v1.json");
const manifestPath = path.join(here, "MANIFEST.sha256");

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function fileSha256(filePath: string): string {
  return sha256(readFileSync(filePath));
}

const manifestLines = readFileSync(manifestPath, "utf8").trim().split(/\r?\n/u);
assert.equal(manifestLines.length, 6);
for (const line of manifestLines) {
  const match = line.match(/^([a-f0-9]{64})  (.+)$/u);
  assert.ok(match, `invalid manifest line: ${line}`);
  assert.equal(fileSha256(path.join(here, match[2]!)), match[1]);
}

const privateArtifact = readJson<Record<string, unknown>>(privatePath);
const publicArtifact = readJson<Record<string, unknown>>(publicPath);
assert.equal(privateArtifact.status, "OFFLINE_WIRE_COMPILED_EXECUTION_BLOCKED");
assert.equal(publicArtifact.status, "OFFLINE_WIRE_COMPILED_EXECUTION_BLOCKED");

const reproduced = await compileCampaignV5S1ControllerPreflight();
assert.deepEqual(privateArtifact, reproduced.privateArtifact);
assert.deepEqual(publicArtifact, reproduced.publicArtifact);

const rows = privateArtifact.rows as unknown as Array<Record<string, unknown>>;
assert.equal(rows.length, 180);
assert.equal(new Set(rows.map((row) => row.wireBodySha256)).size, 180);
assert.equal(rows.reduce((sum, row) => sum + Number(row.observedFetches), 0), 180);
assert.equal(
  rows.reduce((sum, row) => sum + Number(row.candidateOutputsPerCompletion), 0),
  180,
);
for (const [index, row] of rows.entries()) {
  assert.equal(row.queueOrdinal, index + 1);
  assert.equal(row.endpoint, "https://openrouter.ai/api/v1/chat/completions");
  assert.equal(row.endpointSha256, sha256(String(row.endpoint)));
  assert.equal(row.responseFormatType, "json_schema");
  assert.equal(row.completionCount, 1);
  assert.equal(row.candidateOutputsPerCompletion, 1);
  assert.equal(row.providerRequireParameters, true);
  assert.deepEqual(row.providerOnly, ["google-vertex/global"]);
  assert.deepEqual(row.providerOrder, ["google-vertex/global"]);
  assert.equal(row.providerAllowFallbacks, false);
  assert.equal(row.providerDataCollection, "deny");
  assert.equal(row.providerZdr, true);
  assert.deepEqual(row.reasoning, {
    enabled: false,
    effort: "none",
    exclude: true,
  });
}

const safety = publicArtifact.safety as Record<string, unknown>;
assert.equal(safety.externalNetworkCalls, 0);
assert.equal(safety.providerCalls, 0);
assert.equal(safety.apiCandidatesConsumed, 0);
assert.equal(safety.liveExecutionAuthorized, false);
assert.equal(safety.pricingAttached, false);
assert.equal(safety.rightsGateAttached, false);
assert.equal(safety.privacyGateAttached, false);

const publicText = readFileSync(publicPath, "utf8");
assert.equal(publicText.includes("passageContentExact"), false);
assert.equal(publicText.includes("passageToken"), false);
assert.equal(publicText.includes("assignmentId"), false);
assert.equal(publicText.includes("assignmentKey"), false);
assert.equal(publicText.includes("wireBodySha256"), false);
assert.equal(publicText.includes("requestEnvelopeSha256"), false);

process.stdout.write(
  `${JSON.stringify({
    verdict: "PASS_OFFLINE_EXACT_WIRE_PREFLIGHT_EXECUTION_BLOCKED",
    assignments: rows.length,
    interceptedFetches: rows.length,
    uniqueWireBodies: new Set(rows.map((row) => row.wireBodySha256)).size,
    externalNetworkCalls: safety.externalNetworkCalls,
    providerCalls: safety.providerCalls,
    apiCandidatesConsumed: safety.apiCandidatesConsumed,
    controllerPreflightSemanticSha256:
      publicArtifact.controllerPreflightSemanticSha256,
    publicArtifactSha256: fileSha256(publicPath),
    manifestSha256: fileSha256(manifestPath),
  }, null, 2)}\n`,
);
