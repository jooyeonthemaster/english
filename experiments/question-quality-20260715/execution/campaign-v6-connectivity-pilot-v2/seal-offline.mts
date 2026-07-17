import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  compileConnectivityPilotExactWire,
  paths,
  type PilotExactWirePrivateRow,
} from "./compile-exact-wire.mts";
import * as protocolSchemaModule from "./protocol-schema";
import type { ConnectivityPilotProtocolV2 } from "./protocol-schema";

const protocolSchemaExports =
  (protocolSchemaModule as unknown as { default?: typeof protocolSchemaModule }).default ??
  protocolSchemaModule;
const {
  protocolAuthoritySha256,
  stablePilotJson,
  validateConnectivityPilotProtocolV2,
} = protocolSchemaExports;

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const protocolPath = path.join(here, "protocol-v2.json");
const manifestPath = path.join(here, "MANIFEST.sha256");

const SOURCE_FREEZE_PATHS = [
  "experiments/question-quality-20260715/harness/atlas-controller.ts",
  "experiments/question-quality-20260715/harness/ledger.ts",
  "experiments/question-quality-20260715/execution/campaign-v6-s1-durable-controller-v1/openrouter-question-parser.ts",
  "experiments/question-quality-20260715/execution/campaign-v6-s1-durable-controller-v1/MANIFEST.sha256",
] as const;

const MANIFEST_PATHS = [
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v2/README.md",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v2/compile-exact-wire.mts",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v2/live-child.mts",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v2/live-launcher.ts",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v2/offline-exact-wire-seal-v2.json",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v2/offline.test.ts",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v2/private/exact-wire-v2.private.json",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v2/protocol-schema.ts",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v2/protocol-v2.json",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v2/runner.ts",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v2/seal-offline.mts",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v2/tsconfig.json",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v2/verify.mts",
] as const;

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function writeJson(filePath: string, value: unknown): void {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function calculateCost(input: {
  bytes: number;
  maxOutputTokens: number;
  inputRate: number;
  outputRate: number;
  overhead: number;
  multiplier: number;
}): number {
  const raw = (
    (input.bytes + input.overhead) * input.inputRate +
    input.maxOutputTokens * input.outputRate
  ) / 1_000_000;
  return Math.ceil(raw * input.multiplier * 1e9) / 1e9;
}

async function main(): Promise<void> {
  const raw = JSON.parse(readFileSync(protocolPath, "utf8")) as ConnectivityPilotProtocolV2;
  raw.authorityCommitment.originalProtocolV1Sha256 = sha256(readFileSync(paths.originalProtocolV1));
  raw.authorityCommitment.originalPublicCorpusSha256 = sha256(readFileSync(paths.corpusPublic));
  raw.controllerSourceFreeze.files = SOURCE_FREEZE_PATHS.map((relativePath) => ({
    path: relativePath,
    sha256: sha256(readFileSync(path.join(repoRoot, relativePath))),
  }));
  raw.controllerSourceFreeze.closureSha256 = sha256(stablePilotJson(raw.controllerSourceFreeze.files));
  raw.authorityCommitment.authoritySemanticSha256 = protocolAuthoritySha256(raw);
  writeJson(protocolPath, raw);
  validateConnectivityPilotProtocolV2(JSON.parse(readFileSync(protocolPath, "utf8")) as unknown);

  const compiled = await compileConnectivityPilotExactWire();
  writeFileSync(paths.privateArtifact, compiled.privateBytes, "utf8");
  writeFileSync(paths.publicArtifact, compiled.publicBytes, "utf8");

  const byPlan = new Map<string, PilotExactWirePrivateRow>(
    compiled.privateArtifact.rows.map((row: PilotExactWirePrivateRow) => [row.plan, row]),
  );
  let total = 0;
  for (const assignment of raw.pricingAmendment.assignments) {
    const row = byPlan.get(assignment.plan);
    if (!row) throw new Error(`missing exact-wire ${assignment.plan}`);
    assignment.exactWireBodyUtf8Bytes = row.bodyUtf8Bytes;
    assignment.calculatedWorstCaseUsdCap = calculateCost({
      bytes: row.bodyUtf8Bytes,
      maxOutputTokens: assignment.maxOutputTokens,
      inputRate: assignment.emergencyInputUsdPer1M,
      outputRate: assignment.emergencyOutputUsdPer1M,
      overhead: raw.pricingAmendment.serverTokenOverheadUpperBound,
      multiplier: raw.pricingAmendment.safetyMultiplier,
    });
    if (assignment.calculatedWorstCaseUsdCap <= assignment.v1CapUsd) {
      throw new Error(`${assignment.plan} no longer demonstrates the required explicit v2 cap amendment`);
    }
    total += assignment.calculatedWorstCaseUsdCap;
  }
  raw.pricingAmendment.totalCalculatedWorstCaseUsdCap = Math.ceil(total * 1e9) / 1e9;
  raw.durableBounds.sharedBatchCostCapUsd = raw.pricingAmendment.totalCalculatedWorstCaseUsdCap;
  raw.exactWireSeal.publicArtifactSha256 = sha256(compiled.publicBytes);
  raw.exactWireSeal.privateArtifactSha256 = sha256(compiled.privateBytes);
  raw.authorityCommitment.authoritySemanticSha256 = protocolAuthoritySha256(raw);
  writeJson(protocolPath, raw);
  validateConnectivityPilotProtocolV2(JSON.parse(readFileSync(protocolPath, "utf8")) as unknown);

  const manifest = MANIFEST_PATHS.map((relativePath) => {
    const bytes = readFileSync(path.join(repoRoot, relativePath));
    return `${sha256(bytes)}  ${relativePath}`;
  });
  writeFileSync(manifestPath, `${manifest.join("\n")}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({
    status: "OFFLINE_SEALED_EXECUTION_STILL_BLOCKED",
    files: manifest.length,
    exactWireRows: compiled.privateArtifact.rows.length,
    controllerSourceFreezeSha256: raw.controllerSourceFreeze.closureSha256,
    apiCandidatesConsumed: 0,
    externalNetworkCalls: 0,
    providerCalls: 0,
    modelCalls: 0,
  })}\n`);
}

await main();
