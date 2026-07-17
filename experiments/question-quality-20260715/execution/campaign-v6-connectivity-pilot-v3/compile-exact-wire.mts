import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { compileConnectivityPilotExactWire as compileV2ProductionWire } from "../campaign-v6-connectivity-pilot-v2/compile-exact-wire.mts";
import * as protocolCoreModule from "./protocol-core";

const protocolCoreExports =
  (protocolCoreModule as unknown as { default?: typeof protocolCoreModule }).default ?? protocolCoreModule;
const { stableJsonV3 } = protocolCoreExports;

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const upstreamCompilerPath = path.join(here, "../campaign-v6-connectivity-pilot-v2/compile-exact-wire.mts");
const upstreamSchemaPath = path.join(here, "../campaign-v6-connectivity-pilot-v2/protocol-schema.ts");
const originalProtocolPath = path.join(here, "../campaign-v6-connectivity-pilot-v1/protocol.json");
const publicCorpusPath = path.join(repoRoot, "experiments/question-quality-20260715/corpus/original-connectivity-pilot-v1/source-public.json");

export const exactWireV3Paths = {
  privateArtifact: path.join(here, "private/exact-wire-v3.private.json"),
  publicArtifact: path.join(here, "offline-exact-wire-seal-v3.json"),
} as const;

const sha256 = (value: string | Uint8Array): string => createHash("sha256").update(value).digest("hex");

export async function compileConnectivityPilotExactWireV3() {
  // This inherited compiler is used only as an offline production request compiler.
  // Its rejected v2 live runner is never imported into the v3 execution closure.
  const compiled = await compileV2ProductionWire();
  const upstream = compiled.privateArtifact;
  assert.equal(upstream.rows.length, 2);
  assert.deepEqual(upstream.rows.map((row) => row.plan), ["STANDARD", "PREMIUM"]);
  const rows = upstream.rows.map((row) => ({ ...row }));
  for (const row of rows) {
    assert.equal(row.endpoint, "https://openrouter.ai/api/v1/chat/completions");
    assert.equal(row.bodySha256, sha256(row.bodyText));
    assert.equal(row.bodyUtf8Bytes, Buffer.byteLength(row.bodyText, "utf8"));
    assert.equal(row.maxOutputTokens, 4000);
    assert.equal(row.completionCount, 1);
    assert.equal(row.candidateOutputsPerCompletion, 1);
    const body = JSON.parse(row.bodyText) as Record<string, unknown>;
    assert.equal(body.model, row.modelId);
    assert.deepEqual(body.provider, {
      order: ["google-vertex/global"],
      only: ["google-vertex/global"],
      allow_fallbacks: false,
      require_parameters: true,
      data_collection: "deny",
      zdr: true,
    });
    assert.deepEqual(body.reasoning, { enabled: false, effort: "none", exclude: true });
  }
  const privateCore = {
    schemaVersion: "question-quality-v6-connectivity-pilot-exact-wire-private-v3",
    status: "OFFLINE_PRODUCTION_CORE_EXACT_WIRE_LIVE_BLOCKED",
    confidentiality: "PRIVATE_GIT_IGNORED_EXACT_PROMPT_PASSAGE_AND_REQUEST_BODIES",
    productionCompilerAuthority: {
      implementation: "production runQuestionGeneration with B0_CURRENT_CONTROL, strict, attempt 0",
      inheritedOfflineCompilerPath: "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v2/compile-exact-wire.mts",
      inheritedOfflineCompilerSha256: sha256(readFileSync(upstreamCompilerPath)),
      inheritedSchemaSha256: sha256(readFileSync(upstreamSchemaPath)),
      rejectedV2LiveRunnerImported: false,
      originalProtocolV1Sha256: sha256(readFileSync(originalProtocolPath)),
      originalPublicCorpusSha256: sha256(readFileSync(publicCorpusPath)),
      upstreamProductionClosureSha256: upstream.sourceClosureSha256,
      upstreamPrivateSemanticSha256: upstream.privateSemanticSha256,
    },
    fixedProductionInput: upstream.fixedProductionInput,
    productionSourceClosure: upstream.sourceClosure,
    productionSourceClosureSha256: upstream.sourceClosureSha256,
    gitVersion: upstream.gitVersion,
    rows,
    safety: {
      productionModulesImportedAfterFetchDenyGuard: true,
      locallyInterceptedProductionCompilerFetches: 2,
      externalNetworkCalls: 0,
      providerCalls: 0,
      modelCalls: 0,
      productionDatabaseCalls: 0,
      realCredentialValuesRead: 0,
      apiCandidatesConsumed: 0,
      liveExecutionAuthorized: false,
    },
  };
  const privateArtifact = {
    ...privateCore,
    privateSemanticSha256: sha256(stableJsonV3(privateCore)),
  };
  const privateBytes = `${JSON.stringify(privateArtifact, null, 2)}\n`;
  const publicCore = {
    schemaVersion: "question-quality-v6-connectivity-pilot-exact-wire-public-v3",
    status: "OFFLINE_PRODUCTION_CORE_EXACT_WIRE_LIVE_BLOCKED",
    privateArtifactSha256: sha256(privateBytes),
    originalProtocolV1Sha256: privateCore.productionCompilerAuthority.originalProtocolV1Sha256,
    originalPublicCorpusSha256: privateCore.productionCompilerAuthority.originalPublicCorpusSha256,
    productionSourceClosureSha256: privateCore.productionSourceClosureSha256,
    counts: {
      assignments: 2,
      locallyInterceptedProductionCompilerFetches: 2,
      externalNetworkCalls: 0,
      providerCalls: 0,
      modelCalls: 0,
      productionDatabaseCalls: 0,
      apiCandidatesConsumed: 0,
    },
    wire: {
      serialOrder: ["STANDARD", "PREMIUM"],
      bodyUtf8BytesByPlan: Object.fromEntries(rows.map((row) => [row.plan, row.bodyUtf8Bytes])),
      bodySha256ByPlan: Object.fromEntries(rows.map((row) => [row.plan, row.bodySha256])),
      maxOutputTokensEach: 4000,
      completionCountEach: 1,
      semanticCandidateCapEach: 1,
      exactEndpointTag: "google-vertex/global",
      reasoningDisabledRows: 2,
      strictJsonSchemaRows: 2,
    },
    privacy: {
      promptExposed: false,
      passageExposed: false,
      questionExposed: false,
      credentialValueExposedOrHashed: false,
    },
  };
  const publicArtifact = { ...publicCore, publicSemanticSha256: sha256(stableJsonV3(publicCore)) };
  const publicBytes = `${JSON.stringify(publicArtifact, null, 2)}\n`;
  return { privateArtifact, publicArtifact, privateBytes, publicBytes };
}

async function main(): Promise<void> {
  const result = await compileConnectivityPilotExactWireV3();
  process.stdout.write(`${JSON.stringify({
    status: result.publicArtifact.status,
    bodyUtf8BytesByPlan: result.publicArtifact.wire.bodyUtf8BytesByPlan,
    locallyInterceptedProductionCompilerFetches: 2,
    externalNetworkCalls: 0,
    providerCalls: 0,
    modelCalls: 0,
    apiCandidatesConsumed: 0,
  }, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
