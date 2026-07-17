import { mkdirSync, openSync, writeFileSync, closeSync, fsyncSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as priceCoreModule from "./price-snapshot-core";
import * as protocolCoreModule from "./protocol-core";

const priceCoreExports =
  (priceCoreModule as unknown as { default?: typeof priceCoreModule }).default ?? priceCoreModule;
const protocolCoreExports =
  (protocolCoreModule as unknown as { default?: typeof protocolCoreModule }).default ?? protocolCoreModule;
const { buildPublicPriceSnapshotV3 } = priceCoreExports;
const { modelIdsV3 } = protocolCoreExports;

const here = path.dirname(fileURLToPath(import.meta.url));
const privateRoot = path.join(here, "private");
const MODELS_URL = "https://openrouter.ai/api/v1/models";

async function fetchPublicJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    method: "GET",
    headers: { accept: "application/json" },
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`public price endpoint returned HTTP ${response.status}`);
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > 16 * 1024 * 1024) throw new Error("public price response exceeded 16 MiB");
  return JSON.parse(text) as unknown;
}

function assertPrivateOutput(filePath: string): string {
  const absolute = path.resolve(filePath);
  const relative = path.relative(privateRoot, absolute);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative) || path.extname(absolute) !== ".json") {
    throw new Error("price snapshot output must be a new JSON file under the v3 private directory");
  }
  return absolute;
}

async function main(): Promise<void> {
  const outputFlag = process.argv.find((value) => value.startsWith("--output="));
  if (!outputFlag) throw new Error("--output=<v3-private-json-path> is required");
  const outputPath = assertPrivateOutput(outputFlag.slice("--output=".length));
  mkdirSync(path.dirname(outputPath), { recursive: true });
  const modelsPayload = await fetchPublicJson(MODELS_URL);
  const endpointPayloads: Record<string, unknown> = {};
  for (const modelId of modelIdsV3()) {
    endpointPayloads[modelId] = await fetchPublicJson(`${MODELS_URL}/${modelId}/endpoints`);
  }
  const snapshot = buildPublicPriceSnapshotV3({
    fetchedAt: new Date().toISOString(),
    modelsPayload,
    endpointPayloads,
  });
  const bytes = `${JSON.stringify(snapshot, null, 2)}\n`;
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
    modelCount: snapshot.models.length,
    credentialValuesRead: 0,
    providerCalls: 0,
    modelCalls: 0,
    apiCandidatesConsumed: 0,
  })}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
