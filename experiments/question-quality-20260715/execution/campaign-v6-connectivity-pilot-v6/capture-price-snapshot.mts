import { mkdirSync, openSync, writeFileSync, closeSync, fsyncSync } from "node:fs";
import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import * as boundedBodyModule from "./bounded-response-body";
import * as captureOutputBoundaryModule from "./capture-output-boundary";
import * as priceCoreModule from "./price-snapshot-core";
import * as protocolCoreModule from "./protocol-core";
import * as authorGateModule from "./author-freeze-gate";
import * as frozenRuntimeModule from "./frozen-runtime-core";

const priceCoreExports =
  (priceCoreModule as unknown as { default?: typeof priceCoreModule }).default ?? priceCoreModule;
const protocolCoreExports =
  (protocolCoreModule as unknown as { default?: typeof protocolCoreModule }).default ?? protocolCoreModule;
const frozenRuntimeExports =
  (frozenRuntimeModule as unknown as { default?: typeof frozenRuntimeModule }).default ?? frozenRuntimeModule;
const authorGateExports =
  (authorGateModule as unknown as { default?: typeof authorGateModule }).default ?? authorGateModule;
const { buildPrivatePriceEvidenceBundleV6, buildPublicPriceSnapshotV6 } = priceCoreExports;
const { metadataNetworkDispatchAuthorizedV6, modelIdsV6, validateProtocolV6 } = protocolCoreExports;
const { assertFrozenRuntimeEntrypointV6, frozenRuntimeReferenceFromProtocolV6 } = frozenRuntimeExports;
const { assertAuthorFreezePermanentlyNoDispatchV6 } = authorGateExports;
const boundedBodyExports =
  (boundedBodyModule as unknown as { default?: typeof boundedBodyModule }).default ?? boundedBodyModule;
const { METADATA_RESPONSE_BODY_MAX_BYTES_V6, readBoundedUtf8ResponseBodyV6 } = boundedBodyExports;
const captureOutputBoundaryExports =
  (captureOutputBoundaryModule as unknown as { default?: typeof captureOutputBoundaryModule }).default ?? captureOutputBoundaryModule;
const {
  assertCanonicalDirectPrivateOutputV6,
  assertExactMetadataCaptureEnvironmentV6,
  parsePriceCaptureCliArgumentsV6,
} = captureOutputBoundaryExports;

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.basename(moduleDirectory) === "frozen-live" ? path.dirname(moduleDirectory) : moduleDirectory;
const repoRoot = path.resolve(packageRoot, "../../../..");
const privateRoot = path.join(packageRoot, "private");
const protocolPath = path.join(packageRoot, "protocol-v6.json");
const MODELS_URL = "https://openrouter.ai/api/v1/models";

async function fetchPublicJson(url: string): Promise<{
  payload: unknown;
  raw: { url: string; status: number; contentType: string; bodyText: string };
}> {
  const response = await fetch(url, {
    method: "GET",
    headers: { accept: "application/json" },
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  const bodyText = (await readBoundedUtf8ResponseBodyV6({
    response,
    maximumBytes: METADATA_RESPONSE_BODY_MAX_BYTES_V6,
    label: "public price metadata response",
  })).text;
  if (!response.ok) throw new Error(`public price endpoint returned HTTP ${response.status}`);
  const contentType = response.headers.get("content-type") ?? "";
  if (!/^application\/(?:[a-z0-9.+-]*\+)?json(?:\s*;|$)/iu.test(contentType.trim())) {
    throw new Error("public price endpoint did not attest a JSON Content-Type");
  }
  return {
    payload: JSON.parse(bodyText) as unknown,
    raw: { url, status: response.status, contentType, bodyText },
  };
}

async function main(): Promise<void> {
  assertAuthorFreezePermanentlyNoDispatchV6();
  assertExactMetadataCaptureEnvironmentV6();
  const protocol = validateProtocolV6(JSON.parse(readFileSync(protocolPath, "utf8").replace(/^\uFEFF/u, "")) as unknown);
  if (!metadataNetworkDispatchAuthorizedV6(protocol.authorization)) {
    throw new Error("v6 public metadata capture requires metadata authorization, hostile audit, and an explicit dispatch command");
  }
  const frozenReference = frozenRuntimeReferenceFromProtocolV6(protocol);
  assertFrozenRuntimeEntrypointV6({
    repoRoot,
    artifactPath: frozenReference.artifactPath,
    expectedArtifactSha256: frozenReference.artifactSha256,
    role: "CAPTURE_PRICE_METADATA",
    currentModulePath: fileURLToPath(import.meta.url),
  });
  const parsedArguments = parsePriceCaptureCliArgumentsV6(process.argv.slice(2));
  const outputPath = assertCanonicalDirectPrivateOutputV6(parsedArguments.outputPath, privateRoot);
  const modelsResponse = await fetchPublicJson(MODELS_URL);
  const endpointPayloads: Record<string, unknown> = {};
  const rawHttpResponses = [modelsResponse.raw];
  for (const modelId of modelIdsV6()) {
    const endpointResponse = await fetchPublicJson(`${MODELS_URL}/${modelId}/endpoints`);
    endpointPayloads[modelId] = endpointResponse.payload;
    rawHttpResponses.push(endpointResponse.raw);
  }
  const snapshot = buildPublicPriceSnapshotV6({
    fetchedAt: new Date().toISOString(),
    modelsPayload: modelsResponse.payload,
    endpointPayloads,
    rawHttpResponses,
  });
  const bundle = buildPrivatePriceEvidenceBundleV6(snapshot, rawHttpResponses);
  const bytes = `${JSON.stringify(bundle, null, 2)}\n`;
  const handle = openSync(outputPath, "wx", 0o600);
  try {
    writeFileSync(handle, bytes, "utf8");
    fsyncSync(handle);
  } finally {
    closeSync(handle);
  }
  process.stdout.write(`${JSON.stringify({
    status: "PUBLIC_PRICE_SNAPSHOT_CAPTURED",
    fetchedAt: snapshot.fetchedAt,
    contentSha256: snapshot.contentSha256,
    privateEvidenceBundleSha256: bundle.bundleSha256,
    rawResponseEvidenceCount: bundle.rawHttpResponses.length,
    modelCount: snapshot.models.length,
    credentialValuesRead: 0,
    metadataNetworkCalls: 3,
    externalNetworkCalls: 3,
    providerCalls: 0,
    modelCalls: 0,
    apiCandidatesConsumed: 0,
  })}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
