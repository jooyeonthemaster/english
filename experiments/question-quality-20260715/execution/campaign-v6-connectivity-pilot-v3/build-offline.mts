import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { compileConnectivityPilotExactWireV3, exactWireV3Paths } from "./compile-exact-wire.mts";
import { computeLiveClosureV3 } from "./live-closure.mts";
import * as protocolCoreModule from "./protocol-core";
import type { ConnectivityPilotProtocolV3 } from "./protocol-core";

const protocolCoreExports =
  (protocolCoreModule as unknown as { default?: typeof protocolCoreModule }).default ?? protocolCoreModule;
const { conservativeCostV3, sha256V3, validateProtocolV3 } = protocolCoreExports;

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const protocolPath = path.join(here, "protocol-v3.json");
const closurePath = path.join(here, "live-closure-v3.json");
const reportPath = path.join(here, "AUTHOR-REPORT.json");
const manifestPath = path.join(here, "MANIFEST.sha256");

const MANIFEST_PATHS = [
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v3/AUTHOR-REPORT.json",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v3/README.md",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v3/build-offline.mts",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v3/capture-price-snapshot.mts",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v3/compile-exact-wire.mts",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v3/live-child.mts",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v3/live-closure-v3.json",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v3/live-closure.mts",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v3/live-io.ts",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v3/offline-exact-wire-seal-v3.json",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v3/offline.test.ts",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v3/operator-wrapper.mts",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v3/price-snapshot-core.ts",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v3/private/.gitignore",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v3/private/exact-wire-v3.private.json",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v3/production-runner.ts",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v3/protocol-core.ts",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v3/protocol-v3.json",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v3/response-parser.ts",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v3/test-support.ts",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v3/tsconfig.json",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v3/verify.mts",
] as const;

function hash(value: string | Uint8Array): string { return createHash("sha256").update(value).digest("hex"); }
function jsonBytes(value: unknown): string { return `${JSON.stringify(value, null, 2)}\n`; }

function writeOrCheck(filePath: string, expected: string, write: boolean): void {
  if (write) writeFileSync(filePath, expected, "utf8");
  else assert.equal(readFileSync(filePath, "utf8"), expected, `write/no-write parity failed at ${path.basename(filePath)}`);
}

async function main(): Promise<void> {
  const write = process.argv.includes("--write");
  const check = process.argv.includes("--check");
  if (write === check) throw new Error("choose exactly one of --write or --check");
  const compiled = await compileConnectivityPilotExactWireV3();
  const protocol = JSON.parse(readFileSync(protocolPath, "utf8")) as ConnectivityPilotProtocolV3;
  const byPlan = new Map(compiled.privateArtifact.rows.map((row) => [row.plan, row]));
  let total = 0;
  for (const assignment of protocol.durableBounds.assignments) {
    const row = byPlan.get(assignment.plan);
    if (!row) throw new Error(`compiled wire missing ${assignment.plan}`);
    assignment.exactWireBodyUtf8Bytes = row.bodyUtf8Bytes;
    assignment.exactWireBodySha256 = row.bodySha256;
    assignment.calculatedWorstCaseUsdCap = conservativeCostV3({
      bodyBytes: row.bodyUtf8Bytes,
      maxOutputTokens: assignment.maxOutputTokens,
      inputUsdPer1M: assignment.emergencyInputUsdPer1M,
      outputUsdPer1M: assignment.emergencyOutputUsdPer1M,
      serverTokenOverheadUpperBound: Number(protocol.pricingEvidenceContract.serverTokenOverheadUpperBound),
      safetyMultiplier: Number(protocol.pricingEvidenceContract.safetyMultiplier),
    });
    total += assignment.calculatedWorstCaseUsdCap;
  }
  protocol.durableBounds.sharedCostCapUsd = Math.ceil(total * 1e9) / 1e9;
  protocol.exactWireCommitment.privateArtifactSha256 = hash(compiled.privateBytes);
  protocol.exactWireCommitment.publicArtifactSha256 = hash(compiled.publicBytes);
  const protocolBytes = jsonBytes(protocol);
  validateProtocolV3(JSON.parse(protocolBytes) as unknown);
  mkdirSync(path.dirname(exactWireV3Paths.privateArtifact), { recursive: true });
  writeOrCheck(exactWireV3Paths.privateArtifact, compiled.privateBytes, write);
  writeOrCheck(exactWireV3Paths.publicArtifact, compiled.publicBytes, write);
  writeOrCheck(protocolPath, protocolBytes, write);

  const closure = computeLiveClosureV3();
  const closureBytes = jsonBytes(closure);
  writeOrCheck(closurePath, closureBytes, write);
  const report = {
    schemaVersion: "question-quality-connectivity-pilot-v3-author-report",
    verdict: "READY_FOR_INDEPENDENT_OFFLINE_AUDIT_LIVE_EXECUTION_BLOCKED",
    protocolSha256: sha256V3(protocolBytes),
    exactWirePrivateSha256: sha256V3(compiled.privateBytes),
    exactWirePublicSha256: sha256V3(compiled.publicBytes),
    liveClosureSha256: sha256V3(closureBytes),
    liveClosureSemanticSha256: closure.closureSemanticSha256,
    liveEntrypoints: closure.entrypoints,
    exactLiveClosureFiles: closure.files.length,
    bounds: {
      serialOrder: ["STANDARD", "PREMIUM"],
      candidates: 2,
      physicalFetches: 2,
      completions: 2,
      retries: 0,
      repairs: 0,
      fallbacks: 0,
      replacements: 0,
      topUps: 0,
      frozenWorstCaseCostUsd: protocol.durableBounds.sharedCostCapUsd,
    },
    globalLedger: {
      cap: 1000,
      observedUsedAtAuthorFreeze: 0,
      observedReservedAtAuthorFreeze: 0,
      futureLiveReservation: 2,
      authorFreezeReservationMutation: 0,
    },
    activity: {
      locallyInterceptedProductionCompilerFetches: 2,
      externalNetworkCalls: 0,
      providerCalls: 0,
      modelCalls: 0,
      apiCandidatesConsumed: 0,
      productionDatabaseCalls: 0,
      realCredentialValuesRead: 0,
    },
    authorization: protocol.authorization,
    scientificScope: "Two connectivity rows cannot establish quality, reliability, or comparative performance.",
  };
  const reportBytes = jsonBytes(report);
  writeOrCheck(reportPath, reportBytes, write);
  const manifest = MANIFEST_PATHS.map((relativePath) => `${hash(readFileSync(path.join(repoRoot, relativePath)))}  ${relativePath}`).join("\n") + "\n";
  writeOrCheck(manifestPath, manifest, write);
  process.stdout.write(`${JSON.stringify({
    status: write ? "V3_OFFLINE_AUTHOR_FREEZE_WRITTEN" : "V3_WRITE_NO_WRITE_PARITY_CONFIRMED",
    protocolSha256: report.protocolSha256,
    exactWirePrivateSha256: report.exactWirePrivateSha256,
    exactWirePublicSha256: report.exactWirePublicSha256,
    liveClosureSha256: report.liveClosureSha256,
    liveClosureSemanticSha256: report.liveClosureSemanticSha256,
    exactLiveClosureFiles: closure.files.length,
    manifestFiles: MANIFEST_PATHS.length,
    externalNetworkCalls: 0,
    providerCalls: 0,
    modelCalls: 0,
    apiCandidatesConsumed: 0,
    productionDatabaseCalls: 0,
    realCredentialValuesRead: 0,
    globalLedgerReservationMutations: 0,
  }, null, 2)}\n`);
}

await main();
