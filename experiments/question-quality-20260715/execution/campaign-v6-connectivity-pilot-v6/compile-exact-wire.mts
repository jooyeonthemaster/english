import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { compileConnectivityPilotExactWire as compileV2ProductionWire } from "../campaign-v6-connectivity-pilot-v2/compile-exact-wire.mts";
import { computeCompilerClosureV6 } from "./compiler-closure.mts";
import { assertAndDescribeIsolatedCompilerEnvironmentV6 } from "./compiler-environment.mts";
import * as protocolCoreModule from "./protocol-core";

const protocolCoreExports =
  (protocolCoreModule as unknown as { default?: typeof protocolCoreModule }).default ?? protocolCoreModule;
const { stableJsonV6 } = protocolCoreExports;

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const upstreamCompilerPath = path.join(here, "../campaign-v6-connectivity-pilot-v2/compile-exact-wire.mts");
const upstreamSchemaPath = path.join(here, "../campaign-v6-connectivity-pilot-v2/protocol-schema.ts");
const originalProtocolPath = path.join(here, "../campaign-v6-connectivity-pilot-v1/protocol.json");
const publicCorpusPath = path.join(repoRoot, "experiments/question-quality-20260715/corpus/original-connectivity-pilot-v1/source-public.json");

export const exactWireV6Paths = {
  privateArtifact: path.join(here, "private/exact-wire-v6.private.json"),
  publicArtifact: path.join(here, "offline-exact-wire-seal-v6.json"),
} as const;

const sha256 = (value: string | Uint8Array): string => createHash("sha256").update(value).digest("hex");

export const FROZEN_V4_WIRE_ROWS_V6 = {
  STANDARD: {
    bodyUtf8Bytes: 53_354,
    bodySha256: "5c68b632eff4f3f0e963b13c3697b41ebaf7772a9088836da54ba0f027ee2003",
  },
  PREMIUM: {
    bodyUtf8Bytes: 24_943,
    bodySha256: "aed07356a5f580be158490ef12d8cf5555a7ea910a5ccc397e53356fa295e643",
  },
} as const;

export async function compileConnectivityPilotExactWireV6() {
  assertAndDescribeIsolatedCompilerEnvironmentV6();
  // This inherited compiler is used only as an offline production request compiler.
  // Its rejected v2 live runner is never imported into the v6 execution closure.
  const compiled = await compileV2ProductionWire();
  const upstream = compiled.privateArtifact;
  const compilerClosure = computeCompilerClosureV6();
  const compilerClosureBytes = `${JSON.stringify(compilerClosure, null, 2)}\n`;
  assert.equal(compilerClosure.dynamicSourceInputs.length, 3);
  assert.equal(compilerClosure.declaredDataInputs.length, 4);
  assert.equal(
    compilerClosure.files.length,
    compilerClosure.sourceFiles.length + compilerClosure.dynamicSourceInputs.length + compilerClosure.declaredDataInputs.length,
  );
  assert.equal(compilerClosure.completeness.inheritedThirtyTwoRowSubsetTrustedAsAuthority, false);
  assert.equal(compilerClosure.completeness.minimumCountAcceptanceUsed, false);
  assert.equal(compilerClosure.completeness.compilerFileSystemReadSitesStaticallyEnumerated, true);
  assert.equal(compilerClosure.completeness.externalGitAndEnvironmentInputsBound, true);
  assert.equal(compilerClosure.externalInputContract.realCredentialValuesRead, 0);
  assert.equal(compilerClosure.externalInputContract.ambientEnvironmentVariablesAccepted, 0);
  assert.equal(
    upstream.gitVersion.split("-worktree-")[0],
    compilerClosure.externalInputContract.git.canonicalHead,
    "inherited compiler git provenance differs from isolated child git input",
  );
  assert.equal(upstream.rows.length, 2);
  assert.deepEqual(upstream.rows.map((row) => row.plan), ["STANDARD", "PREMIUM"]);
  const rows = upstream.rows.map((row) => ({ ...row }));
  for (const row of rows) {
    const frozen = FROZEN_V4_WIRE_ROWS_V6[row.plan as keyof typeof FROZEN_V4_WIRE_ROWS_V6];
    assert(frozen, `v6 inherited an unexpected plan: ${row.plan}`);
    assert.equal(row.bodyUtf8Bytes, frozen.bodyUtf8Bytes, `${row.plan} body bytes differ from frozen v4 wire`);
    assert.equal(row.bodySha256, frozen.bodySha256, `${row.plan} body hash differs from frozen v4 wire`);
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
    schemaVersion: "question-quality-v6-connectivity-pilot-exact-wire-private-v6",
    status: "OFFLINE_PRODUCTION_CORE_EXACT_WIRE_LIVE_BLOCKED",
    confidentiality: "PRIVATE_GIT_IGNORED_EXACT_PROMPT_PASSAGE_AND_REQUEST_BODIES",
    productionCompilerAuthority: {
      implementation: "production runQuestionGeneration with B0_CURRENT_CONTROL, strict, attempt 0",
      inheritedOfflineCompilerPath: "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v2/compile-exact-wire.mts",
      inheritedOfflineCompilerSha256: sha256(readFileSync(upstreamCompilerPath)),
      inheritedSchemaSha256: sha256(readFileSync(upstreamSchemaPath)),
      rejectedV2LiveRunnerImported: false,
      v4WireBodyBytesAndHashesExactEqualityRequired: true,
      originalProtocolV1Sha256: sha256(readFileSync(originalProtocolPath)),
      originalPublicCorpusSha256: sha256(readFileSync(publicCorpusPath)),
      inheritedThirtyTwoRowClosureSha256: upstream.sourceClosureSha256,
      inheritedThirtyTwoRowClosureRows: upstream.sourceClosure.length,
      inheritedThirtyTwoRowClosureAuthority: false,
      upstreamPrivateSemanticSha256: upstream.privateSemanticSha256,
    },
    fixedProductionInput: upstream.fixedProductionInput,
    productionCompilerClosure: compilerClosure.files,
    productionCompilerSourceFiles: compilerClosure.sourceFiles.length,
    productionCompilerDynamicSourceInputs: compilerClosure.dynamicSourceInputs.length,
    productionCompilerDeclaredDataInputs: compilerClosure.declaredDataInputs.length,
    productionCompilerClosureSha256: compilerClosure.exactCompilerClosureSetAndBytesSha256,
    productionCompilerClosureSemanticSha256: compilerClosure.compilerClosureSemanticSha256,
    productionCompilerClosureArtifactSha256: sha256(compilerClosureBytes),
    gitVersion: upstream.gitVersion,
    rows,
    safety: {
      productionModulesImportedAfterFetchDenyGuard: true,
      locallyInterceptedProductionCompilerFetches: 2,
      externalNetworkCalls: 0,
      metadataNetworkCalls: 0,
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
    privateSemanticSha256: sha256(stableJsonV6(privateCore)),
  };
  const privateBytes = `${JSON.stringify(privateArtifact, null, 2)}\n`;
  const publicCore = {
    schemaVersion: "question-quality-v6-connectivity-pilot-exact-wire-public-v6",
    status: "OFFLINE_PRODUCTION_CORE_EXACT_WIRE_LIVE_BLOCKED",
    privateArtifactSha256: sha256(privateBytes),
    originalProtocolV1Sha256: privateCore.productionCompilerAuthority.originalProtocolV1Sha256,
    originalPublicCorpusSha256: privateCore.productionCompilerAuthority.originalPublicCorpusSha256,
    productionCompilerClosureSha256: privateCore.productionCompilerClosureSha256,
    productionCompilerClosureSemanticSha256: privateCore.productionCompilerClosureSemanticSha256,
    productionCompilerClosureArtifactSha256: privateCore.productionCompilerClosureArtifactSha256,
    productionCompilerSourceFiles: privateCore.productionCompilerSourceFiles,
    productionCompilerDynamicSourceInputs: privateCore.productionCompilerDynamicSourceInputs,
    productionCompilerDeclaredDataInputs: privateCore.productionCompilerDeclaredDataInputs,
    counts: {
      assignments: 2,
      locallyInterceptedProductionCompilerFetches: 2,
      externalNetworkCalls: 0,
      metadataNetworkCalls: 0,
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
  const publicArtifact = { ...publicCore, publicSemanticSha256: sha256(stableJsonV6(publicCore)) };
  const publicBytes = `${JSON.stringify(publicArtifact, null, 2)}\n`;
  return {
    privateArtifact,
    publicArtifact,
    privateBytes,
    publicBytes,
    compilerClosure,
    compilerClosureBytes,
  };
}

async function main(): Promise<void> {
  throw new Error("v6 compiler has no ambient CLI; use compiler-child.mts through compiler-client.mts");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
