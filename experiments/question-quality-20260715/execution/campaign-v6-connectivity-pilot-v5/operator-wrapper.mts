import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as protocolCoreModule from "./protocol-core";
import * as authorGateModule from "./author-freeze-gate";
import * as credentialBoundaryModule from "./credential-file-boundary";
import * as frozenRuntimeModule from "./frozen-runtime-core";
import * as liveEnvironmentModule from "./live-environment";
import * as liveIoModule from "./live-io";
import * as priceSnapshotModule from "./price-snapshot-core";

const protocolCoreExports =
  (protocolCoreModule as unknown as { default?: typeof protocolCoreModule }).default ?? protocolCoreModule;
const frozenRuntimeExports =
  (frozenRuntimeModule as unknown as { default?: typeof frozenRuntimeModule }).default ?? frozenRuntimeModule;
const credentialBoundaryExports =
  (credentialBoundaryModule as unknown as { default?: typeof credentialBoundaryModule }).default ?? credentialBoundaryModule;
const liveEnvironmentExports =
  (liveEnvironmentModule as unknown as { default?: typeof liveEnvironmentModule }).default ?? liveEnvironmentModule;
const authorGateExports =
  (authorGateModule as unknown as { default?: typeof authorGateModule }).default ?? authorGateModule;
const liveIoExports = (liveIoModule as unknown as { default?: typeof liveIoModule }).default ?? liveIoModule;
const priceSnapshotExports =
  (priceSnapshotModule as unknown as { default?: typeof priceSnapshotModule }).default ?? priceSnapshotModule;
const { metadataNetworkDispatchAuthorizedV5, validateProtocolV5 } = protocolCoreExports;
const { assertFrozenRuntimeEntrypointV5, frozenRuntimeReferenceFromProtocolV5 } = frozenRuntimeExports;
const { readDirectRealEnvLocalCredentialTextV5 } = credentialBoundaryExports;
const { buildExactLiveChildEnvironmentV5, buildExactMetadataEnvironmentV5 } = liveEnvironmentExports;
const { assertAuthorFreezePermanentlyNoDispatchV5 } = authorGateExports;
const { readPrivateAttestedJsonEvidenceV5 } = liveIoExports;
const { validatePrivatePriceEvidenceBundleV5, validatePinnedPrivatePriceEvidenceBundleV5 } = priceSnapshotExports;

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.basename(moduleDirectory) === "frozen-live" ? path.dirname(moduleDirectory) : moduleDirectory;
const repoRoot = path.resolve(packageRoot, "../../../..");
const protocolPath = path.join(packageRoot, "protocol-v5.json");
const childPath = path.join(packageRoot, "frozen-live/live-child-v5.bundle.mjs");
const metadataCapturePath = path.join(packageRoot, "frozen-live/capture-price-snapshot-v5.bundle.mjs");
const envLocalPath = path.join(repoRoot, ".env.local");
const priceCaptureHandoffsV5 = new Map<string, { fileSha256: string; bundleSha256: string }>();

function canonicalPricePath(value: string): string {
  return path.resolve(value);
}

function waitForChild(child: ReturnType<typeof spawn>, signalLabel: string): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) reject(new Error(`${signalLabel} child terminated by signal`));
      else resolve(code ?? 1);
    });
  });
}

function assertFrozenOperator(protocol: unknown): void {
  const reference = frozenRuntimeReferenceFromProtocolV5(protocol);
  assertFrozenRuntimeEntrypointV5({
    repoRoot,
    artifactPath: reference.artifactPath,
    expectedArtifactSha256: reference.artifactSha256,
    role: "OPERATOR",
    currentModulePath: fileURLToPath(import.meta.url),
  });
}

function decodeAssignmentValue(raw: string): string {
  const value = raw.trim();
  if (!value) throw new Error("OPENROUTER_API_KEY assignment is empty");
  if (value.startsWith("'") || value.startsWith('"')) {
    const quote = value[0]!;
    if (!value.endsWith(quote) || value.length < 2) throw new Error("OPENROUTER_API_KEY quoting is malformed");
    const inner = value.slice(1, -1);
    if (quote === "'" && inner.includes("'")) throw new Error("single-quoted OPENROUTER_API_KEY is malformed");
    if (quote === '"') return inner.replace(/\\([\\"nrt])/gu, (_match, token: string) => ({ "\\": "\\", '"': '"', n: "\n", r: "\r", t: "\t" })[token]!);
    return inner;
  }
  if (/\s/u.test(value) || /[#`$]/u.test(value)) throw new Error("unquoted OPENROUTER_API_KEY contains unsupported syntax");
  return value;
}

function readOnlyOpenRouterAssignment(): string {
  const text = readDirectRealEnvLocalCredentialTextV5(repoRoot, envLocalPath);
  let retained: string | null = null;
  for (const line of text.split(/\r\n|\n|\r/u)) {
    const match = /^\s*(?:export\s+)?OPENROUTER_API_KEY\s*=\s*(.*)$/u.exec(line);
    if (!match) continue;
    if (retained !== null) throw new Error("OPENROUTER_API_KEY assignment is duplicated");
    retained = decodeAssignmentValue(match[1]!);
  }
  if (retained === null || retained.length < 8) throw new Error("OPENROUTER_API_KEY assignment was not found");
  return retained;
}

export async function launchConnectivityPilotV5AfterFutureAuthorization(input: {
  runId: string;
  priceSnapshotPath: string;
}): Promise<number> {
  assertAuthorFreezePermanentlyNoDispatchV5();
  const protocol = validateProtocolV5(JSON.parse(readFileSync(protocolPath, "utf8")) as unknown);
  const authorization = protocol.authorization as unknown as Record<string, unknown>;
  if (authorization.liveExecutionAuthorized !== true || authorization.hostileAuditPassed !== true ||
      authorization.dispatchCommandPresent !== true) {
    throw new Error("v5 dispatch command is absent and live execution remains blocked");
  }
  assertFrozenOperator(protocol);
  const canonicalSnapshotPath = canonicalPricePath(input.priceSnapshotPath);
  const handoff = priceCaptureHandoffsV5.get(canonicalSnapshotPath);
  if (!handoff) throw new Error("live launch lacks an in-memory attestation from this operator's metadata capture");
  const observed = readPrivateAttestedJsonEvidenceV5(canonicalSnapshotPath);
  validatePinnedPrivatePriceEvidenceBundleV5({
    value: observed.value,
    observedFileSha256: observed.fileSha256,
    expectedFileSha256: handoff.fileSha256,
    expectedBundleSha256: handoff.bundleSha256,
  });
  priceCaptureHandoffsV5.delete(canonicalSnapshotPath);
  const key = readOnlyOpenRouterAssignment();
  const child = spawn(process.execPath, [
    childPath,
    `--run-id=${input.runId}`,
    `--price-snapshot=${canonicalSnapshotPath}`,
    `--price-snapshot-file-sha256=${handoff.fileSha256}`,
    `--price-snapshot-bundle-sha256=${handoff.bundleSha256}`,
  ], {
    cwd: repoRoot,
    env: buildExactLiveChildEnvironmentV5(process.env, key),
    stdio: ["ignore", "inherit", "inherit"],
    windowsHide: true,
  });
  return await waitForChild(child, "live");
}

export async function launchPriceMetadataCaptureV5AfterFutureAuthorization(input: {
  outputPath: string;
}): Promise<number> {
  assertAuthorFreezePermanentlyNoDispatchV5();
  const protocol = validateProtocolV5(JSON.parse(readFileSync(protocolPath, "utf8")) as unknown);
  if (!metadataNetworkDispatchAuthorizedV5(protocol.authorization)) {
    throw new Error("v5 metadata dispatch command is absent and public metadata capture remains blocked");
  }
  assertFrozenOperator(protocol);
  const child = spawn(process.execPath, [
    metadataCapturePath,
    `--output=${path.resolve(input.outputPath)}`,
  ], {
    cwd: repoRoot,
    env: buildExactMetadataEnvironmentV5(process.env),
    stdio: ["ignore", "inherit", "inherit"],
    windowsHide: true,
  });
  const exitCode = await waitForChild(child, "metadata capture");
  if (exitCode === 0) {
    const observed = readPrivateAttestedJsonEvidenceV5(canonicalPricePath(input.outputPath));
    const bundle = validatePrivatePriceEvidenceBundleV5(observed.value);
    priceCaptureHandoffsV5.set(observed.canonicalPath, {
      fileSha256: observed.fileSha256,
      bundleSha256: bundle.bundleSha256,
    });
  }
  return exitCode;
}

async function blockedEntrypoint(): Promise<void> {
  assertAuthorFreezePermanentlyNoDispatchV5();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await blockedEntrypoint();
}
