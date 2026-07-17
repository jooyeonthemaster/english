import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runIsolatedCompilerV5 } from "./compiler-client.mts";
import { buildFrozenRuntimeV5 } from "./build-frozen-runtime.mts";
import { computeLiveClosureV5 } from "./live-closure.mts";
import * as protocolCoreModule from "./protocol-core";
import type { ConnectivityPilotProtocolV5 } from "./protocol-core";

const protocolCoreExports =
  (protocolCoreModule as unknown as { default?: typeof protocolCoreModule }).default ?? protocolCoreModule;
const { conservativeCostV5, sha256V5, validateProtocolV5 } = protocolCoreExports;

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const protocolPath = path.join(here, "protocol-v5.json");
const compilerClosurePath = path.join(here, "compiler-closure-v5.json");
const closurePath = path.join(here, "live-closure-v5.json");
const reportPath = path.join(here, "AUTHOR-REPORT.json");
const manifestPath = path.join(here, "MANIFEST.sha256");
const frozenRuntimePath = path.join(here, "frozen-runtime-v5.json");
const exactWireV5Paths = {
  privateArtifact: path.join(here, "private/exact-wire-v5.private.json"),
  publicArtifact: path.join(here, "offline-exact-wire-seal-v5.json"),
} as const;
const tsxCliPath = path.join(repoRoot, "node_modules/tsx/dist/cli.mjs");
const offlineTestPath = path.join(here, "offline.test.ts");

const MANIFEST_PATHS = [
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/AUTHOR-REPORT.json",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/author-freeze-gate.ts",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/README.md",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/build-offline.mts",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/build-frozen-runtime.mts",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/bounded-response-body.ts",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/capture-price-snapshot.mts",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/capture-output-boundary.ts",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/compile-exact-wire.mts",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/compiler-child.mts",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/compiler-client.mts",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/compiler-closure-v5.json",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/compiler-closure.mts",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/compiler-environment.mts",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/credential-file-boundary.ts",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/frozen-runtime-core.ts",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/frozen-runtime-v5.json",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/frozen-live/capture-price-snapshot-v5.bundle.mjs",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/frozen-live/live-child-v5.bundle.mjs",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/frozen-live/operator-wrapper-v5.bundle.mjs",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/live-child.mts",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/live-environment.ts",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/live-closure-v5.json",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/live-closure.mts",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/live-io.ts",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/offline-exact-wire-seal-v5.json",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/offline.test.ts",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/operator-wrapper.mts",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/price-snapshot-core.ts",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/private/.gitignore",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/private/exact-wire-v5.private.json",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/production-runner.ts",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/protocol-core.ts",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/protocol-v5.json",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/response-parser.ts",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/strict-json-observer.ts",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/terminal-reconciliation-core.ts",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/test-support.ts",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/tsconfig.json",
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/verify.mts",
  "experiments/question-quality-20260715/pricing/openrouter-pricing-snapshot.json",
] as const;

function hash(value: string | Uint8Array): string { return createHash("sha256").update(value).digest("hex"); }
function jsonBytes(value: unknown): string { return `${JSON.stringify(value, null, 2)}\n`; }

function writeOrCheck(filePath: string, expected: string, write: boolean): void {
  if (write) writeFileSync(filePath, expected, "utf8");
  else assert.equal(readFileSync(filePath, "utf8"), expected, `write/no-write parity failed at ${path.basename(filePath)}`);
}

function writeOrCheckBytes(filePath: string, expected: Uint8Array, write: boolean): void {
  if (write) writeFileSync(filePath, expected);
  else assert.deepEqual(readFileSync(filePath), Buffer.from(expected), `write/no-write parity failed at ${path.basename(filePath)}`);
}

interface OfflineFixtureSuiteEvidenceV5 {
  total: 72;
  passed: 72;
  failed: 0;
  cancelled: 0;
  skipped: 0;
  todo: 0;
  exitCode: 0;
}

function runAndAttestOfflineFixtureSuite(): OfflineFixtureSuiteEvidenceV5 {
  const result = spawnSync(process.execPath, [tsxCliPath, "--test", offlineTestPath], {
    cwd: repoRoot,
    env: process.env,
    encoding: "utf8",
    windowsHide: true,
    timeout: 120_000,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `offline fixture suite failed:\n${result.stdout}\n${result.stderr}`);
  const output = `${result.stdout}\n${result.stderr}`;
  const metric = (name: string): number => {
    const match = new RegExp(`(?:^|\\n)(?:#|ℹ)?\\s*${name}\\s+(\\d+)(?:\\r?\\n|$)`, "u").exec(output);
    assert(match, `offline fixture suite omitted ${name} metric`);
    return Number(match[1]);
  };
  const evidence = {
    total: metric("tests"),
    passed: metric("pass"),
    failed: metric("fail"),
    cancelled: metric("cancelled"),
    skipped: metric("skipped"),
    todo: metric("todo"),
    exitCode: result.status,
  };
  assert.deepEqual(evidence, {
    total: 72,
    passed: 72,
    failed: 0,
    cancelled: 0,
    skipped: 0,
    todo: 0,
    exitCode: 0,
  });
  return evidence as OfflineFixtureSuiteEvidenceV5;
}

const V4_AUDIT_DIRECTORY = "experiments/question-quality-20260715/reviews/campaign-v6-connectivity-pilot-v4-independent-audit-v1";
const V4_AUDIT_ROWS: Record<string, string> = {
  [`${V4_AUDIT_DIRECTORY}/author-gates.json`]: "5b0346fb581b5cd12381484061fee8b4fc17e56a10882d7e29651ee8cbf613b0",
  [`${V4_AUDIT_DIRECTORY}/build.mts`]: "45d21b186aac9d39f928bbbf5e65c787cd602ad06968131c4dae7d424b5d3f2a",
  [`${V4_AUDIT_DIRECTORY}/evidence.json`]: "2aff0d69c81169f2f806dcd59f9053ce939927603d75cb7d7c2a60cab501f3b6",
  [`${V4_AUDIT_DIRECTORY}/independent-audit.mts`]: "1b6ce550cf2e109f106834695318460ca8a6eec2d5a80a9e7e706520317140d6",
  [`${V4_AUDIT_DIRECTORY}/README.md`]: "dcc562b826a79618006482af4bfff209832715af5d0f6a43ec1e0fad66b25e6e",
  [`${V4_AUDIT_DIRECTORY}/report.json`]: "8f135466efc5182843cf5a257c5bb361cafb2c91122798c29768839d0f31fae3",
  [`${V4_AUDIT_DIRECTORY}/run-author-gates.mts`]: "b5e5fb904a9f6f11fb7d25e402584099ffbf4ddbdc64ae5eb93133173328ae29",
  [`${V4_AUDIT_DIRECTORY}/tsconfig.json`]: "1b2c619dd51b41bbc1b05c5f8753a2fe5440bba07f58effd3a21a134f66bc48a",
  [`${V4_AUDIT_DIRECTORY}/verify.mts`]: "2211da72c2249c1302eddac8f138acf91c4c302a36fbb7810d24f20035c73dd0",
};

function verifyV4AuditPins(): void {
  const manifestAbsolute = path.join(repoRoot, V4_AUDIT_DIRECTORY, "MANIFEST.sha256");
  const manifestBytes = readFileSync(manifestAbsolute);
  assert.equal(hash(manifestBytes), "2b7fb398cad98647698c7dd4120f819c50645116c71e8ffe79ccb53530ba0791");
  const lines = manifestBytes.toString("utf8").trimEnd().split(/\r?\n/u);
  assert.equal(lines.length, 9, "v4 independent-audit manifest must contain exactly nine rows");
  const observed = new Map<string, string>();
  for (const line of lines) {
    const match = /^([a-f0-9]{64})  (experiments\/[^\r\n]+)$/u.exec(line);
    assert(match, `invalid v4 independent-audit manifest row: ${line}`);
    assert(match[2]!.startsWith(`${V4_AUDIT_DIRECTORY}/`), "v4 audit manifest row escaped its exact directory");
    assert(!observed.has(match[2]!), "v4 audit manifest contains a duplicate path");
    observed.set(match[2]!, match[1]!);
  }
  assert.deepEqual(Object.fromEntries(observed), V4_AUDIT_ROWS, "v4 audit manifest exact rows differ");
  for (const [relative, expected] of Object.entries(V4_AUDIT_ROWS)) {
    assert.equal(hash(readFileSync(path.join(repoRoot, relative))), expected, `v4 audit pinned file drift: ${relative}`);
  }
  assert.equal(
    hash(readFileSync(path.join(repoRoot, "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v4/protocol-v4.json"))),
    "18d7eb7c60fdfc1d4b49fb868ef887d64e62db6d217abf8eaec0fbbeab8ffec9",
  );
  const report = JSON.parse(readFileSync(path.join(repoRoot, V4_AUDIT_DIRECTORY, "report.json"), "utf8")) as Record<string, unknown>;
  assert.equal(report.verdict, "FAIL");
  assert.equal(report.target, "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v4");
  assert.equal((report.sourceListHashes as Record<string, unknown>).targetManifestSha256, "33a7cd93fdf4bb5af4cb8bf8f320e79203c7365bf257896f9fb67a8c05d3d37d");
}

async function main(): Promise<void> {
  const write = process.argv.includes("--write");
  const check = process.argv.includes("--check");
  if (write === check) throw new Error("choose exactly one of --write or --check");
  verifyV4AuditPins();
  const compiled = runIsolatedCompilerV5() as ReturnType<typeof runIsolatedCompilerV5> & {
    privateArtifact: { rows: Array<{
      plan: "STANDARD" | "PREMIUM";
      bodyUtf8Bytes: number;
      bodySha256: string;
    }> };
  };
  const compilerClosure = compiled.compilerClosure;
  const compilerClosureBytes = compiled.compilerClosureBytes;
  const protocol = JSON.parse(readFileSync(protocolPath, "utf8").replace(/^\uFEFF/u, "")) as ConnectivityPilotProtocolV5;
  const frozenRuntime = await buildFrozenRuntimeV5();
  const offlineFixtureSuite = runAndAttestOfflineFixtureSuite();
  const frozenContract = protocol.frozenRuntimeContract as Record<string, unknown>;
  frozenContract.artifactSha256 = sha256V5(frozenRuntime.artifactBytes);
  frozenContract.artifactContentSha256 = frozenRuntime.artifact.contentSha256;
  frozenContract.bundleSetSha256 = frozenRuntime.artifact.bundleSetSha256;
  frozenContract.nodeVersion = frozenRuntime.artifact.nodeRuntime.nodeVersion;
  frozenContract.nodeExecutableSha256 = frozenRuntime.artifact.nodeRuntime.executableSha256;
  const byPlan = new Map(compiled.privateArtifact.rows.map((row) => [row.plan, row]));
  let total = 0;
  for (const assignment of protocol.durableBounds.assignments) {
    const row = byPlan.get(assignment.plan);
    if (!row) throw new Error(`compiled wire missing ${assignment.plan}`);
    assignment.exactWireBodyUtf8Bytes = row.bodyUtf8Bytes;
    assignment.exactWireBodySha256 = row.bodySha256;
    assignment.calculatedWorstCaseUsdCap = conservativeCostV5({
      bodyBytes: row.bodyUtf8Bytes,
      maxOutputTokens: assignment.maxOutputTokens,
      inputUsdPer1M: assignment.emergencyInputUsdPer1M,
      outputUsdPer1M: assignment.emergencyOutputUsdPer1M,
      fixedRequestUsd: assignment.emergencyRequestUsd,
      serverTokenOverheadUpperBound: Number(protocol.pricingEvidenceContract.serverTokenOverheadUpperBound),
      safetyMultiplier: Number(protocol.pricingEvidenceContract.safetyMultiplier),
    });
    total += assignment.calculatedWorstCaseUsdCap;
  }
  protocol.durableBounds.sharedCostCapUsd = Math.ceil(total * 1e9) / 1e9;
  protocol.exactWireCommitment.privateArtifactSha256 = hash(compiled.privateBytes);
  protocol.exactWireCommitment.publicArtifactSha256 = hash(compiled.publicBytes);
  protocol.compilerClosureContract.artifactSha256 = hash(compilerClosureBytes);
  protocol.compilerClosureContract.semanticSha256 = compilerClosure.compilerClosureSemanticSha256;
  protocol.compilerClosureContract.exactSourceFiles = compilerClosure.sourceFiles.length;
  protocol.compilerClosureContract.exactDynamicSourceInputs = compilerClosure.dynamicSourceInputs.length;
  protocol.compilerClosureContract.exactDeclaredDataInputs = compilerClosure.declaredDataInputs.length;
  protocol.compilerClosureContract.exactTotalFiles = compilerClosure.files.length;
  const protocolBytes = jsonBytes(protocol);
  validateProtocolV5(JSON.parse(protocolBytes) as unknown);
  mkdirSync(path.dirname(exactWireV5Paths.privateArtifact), { recursive: true });
  mkdirSync(path.join(here, "frozen-live"), { recursive: true });
  writeOrCheckBytes(frozenRuntimePath, frozenRuntime.artifactBytes, write);
  for (const bundle of frozenRuntime.artifact.bundles) {
    writeOrCheckBytes(path.join(repoRoot, bundle.path), frozenRuntime.bundleBytesByRole.get(bundle.role)!, write);
  }
  writeOrCheck(exactWireV5Paths.privateArtifact, compiled.privateBytes, write);
  writeOrCheck(exactWireV5Paths.publicArtifact, compiled.publicBytes, write);
  writeOrCheck(compilerClosurePath, compilerClosureBytes, write);
  writeOrCheck(protocolPath, protocolBytes, write);

  const closure = computeLiveClosureV5();
  const closureBytes = jsonBytes(closure);
  writeOrCheck(closurePath, closureBytes, write);
  const report = {
    schemaVersion: "question-quality-connectivity-pilot-v5-author-report",
    verdict: "READY_FOR_INDEPENDENT_OFFLINE_AUDIT_LIVE_EXECUTION_BLOCKED",
    protocolSha256: sha256V5(protocolBytes),
    exactWirePrivateSha256: sha256V5(compiled.privateBytes),
    exactWirePublicSha256: sha256V5(compiled.publicBytes),
    compilerClosureSha256: sha256V5(compilerClosureBytes),
    compilerClosureSemanticSha256: compilerClosure.compilerClosureSemanticSha256,
    exactCompilerSourceFiles: compilerClosure.sourceFiles.length,
    exactCompilerDynamicSourceInputs: compilerClosure.dynamicSourceInputs.length,
    exactCompilerDeclaredDataInputs: compilerClosure.declaredDataInputs.length,
    exactCompilerClosureFiles: compilerClosure.files.length,
    liveClosureSha256: sha256V5(closureBytes),
    liveClosureSemanticSha256: closure.closureSemanticSha256,
    liveEntrypoints: closure.entrypoints,
    exactLiveClosureFiles: closure.files.length,
    frozenRuntime: {
      artifactSha256: sha256V5(frozenRuntime.artifactBytes),
      contentSha256: frozenRuntime.artifact.contentSha256,
      bundleSetSha256: frozenRuntime.artifact.bundleSetSha256,
      bundles: frozenRuntime.artifact.bundles,
      externalRuntimeSpecifiers: frozenRuntime.artifact.externalRuntimeSpecifiers,
      nodeRuntime: frozenRuntime.artifact.nodeRuntime,
      sourceTsxRuntimeAllowed: false,
    },
    offlineFixtureSuite: {
      runner: "NODE_TSX_TEST_OFFLINE_TEST_TS",
      testSourcePath: "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/offline.test.ts",
      testSourceSha256: hash(readFileSync(offlineTestPath)),
      ...offlineFixtureSuite,
    },
    priceEvidenceAndInputPins: {
      historicalPublicPriceInputPath: "experiments/question-quality-20260715/pricing/openrouter-pricing-snapshot.json",
      historicalPublicPriceInputSha256: hash(readFileSync(path.join(
        repoRoot,
        "experiments/question-quality-20260715/pricing/openrouter-pricing-snapshot.json",
      ))),
      rawHttpEvidenceBundleRequired: true,
      privateBundleFdBoundExactReadRequired: true,
      captureToLiveInMemoryFileAndBundleHashHandoffRequired: true,
      cacheReadWriteRatesIncludedInEmergencyInputCeiling: true,
      reasoningRatesIncludedInEmergencyOutputCeiling: true,
      topLevelPromptCompletionAndFixedRequestIncluded: true,
      assignments: protocol.durableBounds.assignments.map((assignment) => ({
        plan: assignment.plan,
        modelId: assignment.modelId,
        exactWireBodyUtf8Bytes: assignment.exactWireBodyUtf8Bytes,
        exactWireBodySha256: assignment.exactWireBodySha256,
        emergencyInputUsdPer1M: assignment.emergencyInputUsdPer1M,
        emergencyOutputUsdPer1M: assignment.emergencyOutputUsdPer1M,
        emergencyRequestUsd: assignment.emergencyRequestUsd,
        calculatedWorstCaseUsdCap: assignment.calculatedWorstCaseUsdCap,
      })),
    },
    v4IndependentAuditPins: protocol.lineage.v4IndependentAuditPins,
    closureSeparation: {
      compilerClosureAuthority: `compiler-closure-v5.json exact ${compilerClosure.sourceFiles.length} AST source + ${compilerClosure.dynamicSourceInputs.length} dynamic source + ${compilerClosure.declaredDataInputs.length} declared data rows plus exact git/environment inputs`,
      liveRuntimeClosureAuthority: `live-closure-v5.json exact ${closure.files.length} total source/runtime-data rows`,
      inheritedV3ThirtyTwoRowSubsetAuthority: false,
      minimumCountAcceptanceUsed: false,
    },
    closedV4AuditFindings: {
      "V4-CLOSURE-004": "195 AST source + 3 dynamic SOURCE_PATHS source + 4 data plus exact git/environment input sealing",
      "V4-CLI-001": "metadata authorization + hostile audit + dispatch required before any GET; author metadata calls zero",
      "V4-COST-005": "HTTP/schema/parser/cap failures independently attribute representable actual cost; absent cost uses effective reserve",
      "V4-PARSER-002": "exact top-level, choice, and assistant role/content shape rejects tool/function/refusal/audio extras",
      "V4-LEDGER-003": "pre-reserve durable no-replay marker and post-reserve try/finally terminal settlement",
    },
    parserContract: {
      allowedFinishReasons: ["stop"],
      exactWireResponseSchemaRequired: true,
      nonnegativeSafeIntegerUsageRequired: true,
      exactTokenTotalConsistencyRequired: true,
      exactTopLevelChoiceAndAssistantMessageShapeRequired: true,
      independentBillingExtractionOnHttpSchemaParserAndCostCapFailure: true,
      maximumActualCostUsdPerResponse: 1000,
      maximumUsageTokensPerResponse: 10000000,
      negativeRegressions: [
        "finish_reason_length", "schema_invalid_single_object", "fractional_usage",
        "message_tool_calls", "message_function_call", "message_refusal", "message_audio",
        "top_level_extra", "choice_extra", "huge_finite_cost", "two_row_usage_aggregate_overflow",
      ],
    },
    terminalReconciliation: {
      durableNoReplayMarkerBeforeGlobalReservation: true,
      terminalIntentBeforeSettlement: true,
      journalFailureAfterReservationStillSettled: true,
      actualKnownAndEffectiveCostSeparated: true,
      absentOrMalformedBillingUsesReservedCap: true,
      explicitPositiveUnrepresentableCostForcesManualReconciliation: true,
      settlementFailureRequiresManualReconciliationAndForbidsReplay: true,
    },
    boundedResponseBodies: {
      modelBytesBeforeMaterialization: 2097152,
      priceMetadataBytesBeforeMaterialization: 16777216,
      contentLengthPreflightRequiredWhenPresent: true,
      streamOverflowCancellationRequired: true,
    },
    v4WirePreservation: Object.fromEntries(compiled.privateArtifact.rows.map((row) => [row.plan, {
      bodyUtf8Bytes: row.bodyUtf8Bytes,
      bodySha256: row.bodySha256,
    }])),
    preservedPackages: {
      v2Unmodified: true,
      v3Unmodified: true,
      v4Unmodified: true,
    },
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
      metadataNetworkCalls: 0,
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
    status: write ? "V5_OFFLINE_AUTHOR_FREEZE_WRITTEN" : "V5_WRITE_NO_WRITE_PARITY_CONFIRMED",
    protocolSha256: report.protocolSha256,
    exactWirePrivateSha256: report.exactWirePrivateSha256,
    exactWirePublicSha256: report.exactWirePublicSha256,
    compilerClosureSha256: report.compilerClosureSha256,
    compilerClosureSemanticSha256: report.compilerClosureSemanticSha256,
    exactCompilerSourceFiles: report.exactCompilerSourceFiles,
    exactCompilerDynamicSourceInputs: report.exactCompilerDynamicSourceInputs,
    exactCompilerDeclaredDataInputs: report.exactCompilerDeclaredDataInputs,
    exactCompilerClosureFiles: report.exactCompilerClosureFiles,
    liveClosureSha256: report.liveClosureSha256,
    liveClosureSemanticSha256: report.liveClosureSemanticSha256,
    exactLiveClosureFiles: closure.files.length,
    manifestFiles: MANIFEST_PATHS.length,
    externalNetworkCalls: 0,
    metadataNetworkCalls: 0,
    providerCalls: 0,
    modelCalls: 0,
    apiCandidatesConsumed: 0,
    productionDatabaseCalls: 0,
    realCredentialValuesRead: 0,
    globalLedgerReservationMutations: 0,
  }, null, 2)}\n`);
}

await main();
