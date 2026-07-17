import { lstatSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";

import { sha256V5, stableJsonV5, type JsonObject } from "./protocol-core";
import { observeDuplicateJsonKeysV5 } from "./strict-json-observer";

export type FrozenRuntimeRoleV5 = "CAPTURE_PRICE_METADATA" | "LIVE_CHILD" | "OPERATOR";

export interface FrozenNodeRuntimeV5 extends JsonObject {
  executableRealPath: string;
  executableBytes: number;
  executableSha256: string;
  nodeVersion: string;
  modulesAbi: string;
  v8Version: string;
  platform: NodeJS.Platform;
  arch: string;
}

export interface FrozenRuntimeArtifactV5 extends JsonObject {
  schemaVersion: "question-quality-connectivity-pilot-frozen-runtime-v5";
  bundler: {
    name: "esbuild";
    version: string;
    configuration: "BUNDLE_PLATFORM_NODE_FORMAT_ESM_TARGET_NODE24_NO_SOURCEMAP_NO_RUNTIME_PACKAGES";
  };
  bundles: Array<{
    role: FrozenRuntimeRoleV5;
    path: string;
    bytes: number;
    sha256: string;
    externalRuntimeSpecifiers: string[];
    networkContract: {
      fetchCallSites: number;
      directNetworkFetchCallSites: number;
      maximumRequestsPerInvocation: number;
      authorizedUrlTemplates: string[];
      observedHttpsLiterals: string[];
    };
    forbiddenSyntaxCounts: {
      dynamicImport: 0;
      requireCall: 0;
      evalCall: 0;
      functionConstructor: 0;
      webSocket: 0;
      eventSource: 0;
    };
  }>;
  externalRuntimeSpecifiers: string[];
  nodeRuntime: FrozenNodeRuntimeV5;
  bundleSetSha256: string;
  contentSha256: string;
}

const SHA256 = /^[a-f0-9]{64}$/u;
const EXPECTED_BUNDLE_PATHS: Record<FrozenRuntimeRoleV5, string> = {
  CAPTURE_PRICE_METADATA: "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/frozen-live/capture-price-snapshot-v5.bundle.mjs",
  LIVE_CHILD: "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/frozen-live/live-child-v5.bundle.mjs",
  OPERATOR: "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/frozen-live/operator-wrapper-v5.bundle.mjs",
};
const EXPECTED_ROLES = Object.keys(EXPECTED_BUNDLE_PATHS).sort() as FrozenRuntimeRoleV5[];
const COMMON_HTTPS_LITERALS = [
  "https://openrouter.ai/api/v1/chat/completions",
  "https://openrouter.ai/api/v1/models",
  "https://openrouter.ai/api/v1/models/${modelId}/endpoints",
] as const;
const ROLE_EXTERNAL_SPECIFIERS: Record<FrozenRuntimeRoleV5, readonly string[]> = {
  CAPTURE_PRICE_METADATA: ["node:crypto", "node:fs", "node:path", "node:url"],
  LIVE_CHILD: ["node:crypto", "node:fs", "node:path", "node:url"],
  OPERATOR: ["node:child_process", "node:crypto", "node:fs", "node:path", "node:url"],
};
const ROLE_NETWORK_CONTRACT: Record<FrozenRuntimeRoleV5, {
  fetchCallSites: number;
  directNetworkFetchCallSites: number;
  maximumRequestsPerInvocation: number;
  authorizedUrlTemplates: readonly string[];
}> = {
  CAPTURE_PRICE_METADATA: {
    fetchCallSites: 1,
    directNetworkFetchCallSites: 0,
    maximumRequestsPerInvocation: 3,
    authorizedUrlTemplates: [
      "https://openrouter.ai/api/v1/models",
      "https://openrouter.ai/api/v1/models/${modelId}/endpoints",
    ],
  },
  LIVE_CHILD: {
    fetchCallSites: 0,
    directNetworkFetchCallSites: 1,
    maximumRequestsPerInvocation: 2,
    authorizedUrlTemplates: ["https://openrouter.ai/api/v1/chat/completions"],
  },
  OPERATOR: {
    fetchCallSites: 0,
    directNetworkFetchCallSites: 0,
    maximumRequestsPerInvocation: 0,
    authorizedUrlTemplates: [],
  },
};
export const FROZEN_RUNTIME_ARTIFACT_PATH_V5 =
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/frozen-runtime-v5.json";

function object(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as JsonObject;
}

function exactKeys(value: unknown, label: string, keys: readonly string[]): JsonObject {
  const row = object(value, label);
  if (JSON.stringify(Object.keys(row).sort()) !== JSON.stringify([...keys].sort())) {
    throw new Error(`${label} keys differ`);
  }
  return row;
}

function hash(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !SHA256.test(value)) throw new Error(`${label} must be a SHA-256 hex string`);
}

function comparable(value: string): string {
  const normalized = path.normalize(value);
  return process.platform === "win32" ? normalized.toLocaleLowerCase("en-US") : normalized;
}

export function captureCurrentNodeRuntimeV5(): FrozenNodeRuntimeV5 {
  const executableRealPath = realpathSync.native(process.execPath);
  const stat = lstatSync(executableRealPath);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Node executable must resolve to a real regular file");
  const bytes = readFileSync(executableRealPath);
  return {
    executableRealPath,
    executableBytes: bytes.byteLength,
    executableSha256: sha256V5(bytes),
    nodeVersion: process.version,
    modulesAbi: process.versions.modules,
    v8Version: process.versions.v8,
    platform: process.platform,
    arch: process.arch,
  };
}

export function assertCurrentNodeRuntimeV5(expectedValue: unknown): FrozenNodeRuntimeV5 {
  const expected = exactKeys(expectedValue, "frozen Node runtime", [
    "executableRealPath", "executableBytes", "executableSha256", "nodeVersion",
    "modulesAbi", "v8Version", "platform", "arch",
  ]) as unknown as FrozenNodeRuntimeV5;
  const actual = captureCurrentNodeRuntimeV5();
  if (stableJsonV5(actual) !== stableJsonV5(expected)) {
    throw new Error("current Node executable identity differs from the frozen runtime contract");
  }
  return actual;
}

export function validateFrozenRuntimeArtifactV5(value: unknown): FrozenRuntimeArtifactV5 {
  const artifact = exactKeys(value, "frozen runtime artifact", [
    "schemaVersion", "bundler", "bundles", "externalRuntimeSpecifiers", "nodeRuntime",
    "bundleSetSha256", "contentSha256",
  ]);
  if (artifact.schemaVersion !== "question-quality-connectivity-pilot-frozen-runtime-v5") {
    throw new Error("frozen runtime artifact schema differs");
  }
  const bundler = exactKeys(artifact.bundler, "frozen runtime bundler", ["name", "version", "configuration"]);
  if (bundler.name !== "esbuild" || typeof bundler.version !== "string" || !bundler.version ||
      bundler.configuration !== "BUNDLE_PLATFORM_NODE_FORMAT_ESM_TARGET_NODE24_NO_SOURCEMAP_NO_RUNTIME_PACKAGES") {
    throw new Error("frozen runtime bundler contract differs");
  }
  if (!Array.isArray(artifact.bundles) || artifact.bundles.length !== 3) {
    throw new Error("frozen runtime must contain exactly three bundles");
  }
  const bundles = artifact.bundles.map((candidate, index) => {
    const row = exactKeys(candidate, `frozen runtime bundle[${index}]`, [
      "role", "path", "bytes", "sha256", "externalRuntimeSpecifiers", "networkContract",
      "forbiddenSyntaxCounts",
    ]);
    if (!EXPECTED_ROLES.includes(row.role as FrozenRuntimeRoleV5) ||
        row.path !== EXPECTED_BUNDLE_PATHS[row.role as FrozenRuntimeRoleV5] ||
        !Number.isSafeInteger(row.bytes) || (row.bytes as number) < 1) {
      throw new Error(`frozen runtime bundle[${index}] identity differs`);
    }
    hash(row.sha256, `frozen runtime bundle[${index}].sha256`);
    const role = row.role as FrozenRuntimeRoleV5;
    if (JSON.stringify(row.externalRuntimeSpecifiers) !== JSON.stringify(ROLE_EXTERNAL_SPECIFIERS[role])) {
      throw new Error(`${role} exact Node builtin allowlist differs`);
    }
    const network = exactKeys(row.networkContract, `${role}.networkContract`, [
      "fetchCallSites", "directNetworkFetchCallSites", "maximumRequestsPerInvocation",
      "authorizedUrlTemplates", "observedHttpsLiterals",
    ]);
    const expectedNetwork = ROLE_NETWORK_CONTRACT[role];
    if (network.fetchCallSites !== expectedNetwork.fetchCallSites ||
        network.directNetworkFetchCallSites !== expectedNetwork.directNetworkFetchCallSites ||
        network.maximumRequestsPerInvocation !== expectedNetwork.maximumRequestsPerInvocation ||
        JSON.stringify(network.authorizedUrlTemplates) !== JSON.stringify(expectedNetwork.authorizedUrlTemplates) ||
        JSON.stringify(network.observedHttpsLiterals) !== JSON.stringify(COMMON_HTTPS_LITERALS)) {
      throw new Error(`${role} network callsite or URL contract differs`);
    }
    const forbidden = exactKeys(row.forbiddenSyntaxCounts, `${role}.forbiddenSyntaxCounts`, [
      "dynamicImport", "requireCall", "evalCall", "functionConstructor", "webSocket", "eventSource",
    ]);
    if (Object.values(forbidden).some((count) => count !== 0)) {
      throw new Error(`${role} frozen bundle contains forbidden dynamic or alternate transport syntax`);
    }
    return row as unknown as FrozenRuntimeArtifactV5["bundles"][number];
  });
  if (JSON.stringify(bundles.map((row) => row.role)) !== JSON.stringify(EXPECTED_ROLES)) {
    throw new Error("frozen runtime bundle roles are not exact and sorted");
  }
  if (!Array.isArray(artifact.externalRuntimeSpecifiers) ||
      JSON.stringify(artifact.externalRuntimeSpecifiers) !== JSON.stringify([
        "node:child_process", "node:crypto", "node:fs", "node:path", "node:url",
      ])) {
    throw new Error("frozen runtime external specifier union differs from its exact reviewed allowlist");
  }
  exactKeys(artifact.nodeRuntime, "frozen Node runtime", [
    "executableRealPath", "executableBytes", "executableSha256", "nodeVersion",
    "modulesAbi", "v8Version", "platform", "arch",
  ]);
  hash((artifact.nodeRuntime as JsonObject).executableSha256, "frozen Node executable hash");
  hash(artifact.bundleSetSha256, "frozen runtime bundle set hash");
  hash(artifact.contentSha256, "frozen runtime content hash");
  if (artifact.bundleSetSha256 !== sha256V5(stableJsonV5(bundles))) {
    throw new Error("frozen runtime bundle set hash differs");
  }
  const core = { ...artifact };
  delete core.contentSha256;
  if (artifact.contentSha256 !== sha256V5(stableJsonV5(core))) {
    throw new Error("frozen runtime content hash differs");
  }
  return artifact as unknown as FrozenRuntimeArtifactV5;
}

export function assertFrozenBundleBytesV5(
  artifactValue: unknown,
  role: FrozenRuntimeRoleV5,
  bytes: Uint8Array,
): void {
  const artifact = validateFrozenRuntimeArtifactV5(artifactValue);
  const row = artifact.bundles.find((candidate) => candidate.role === role);
  if (!row || row.bytes !== bytes.byteLength || row.sha256 !== sha256V5(bytes)) {
    throw new Error(`${role} frozen bundle bytes differ`);
  }
}

export function assertFrozenRuntimeEntrypointV5(input: {
  repoRoot: string;
  artifactPath: string;
  expectedArtifactSha256: string;
  role: FrozenRuntimeRoleV5;
  currentModulePath: string;
}): FrozenRuntimeArtifactV5 {
  const artifactAbsolute = path.resolve(input.repoRoot, input.artifactPath);
  const artifactStat = lstatSync(artifactAbsolute);
  if (!artifactStat.isFile() || artifactStat.isSymbolicLink() ||
      comparable(realpathSync.native(artifactAbsolute)) !== comparable(artifactAbsolute)) {
    throw new Error("frozen runtime artifact must be a real regular file");
  }
  const raw = readFileSync(artifactAbsolute);
  if (sha256V5(raw) !== input.expectedArtifactSha256) throw new Error("frozen runtime artifact file hash differs");
  const text = new TextDecoder("utf-8", { fatal: true }).decode(raw);
  if (text.charCodeAt(0) === 0xfeff || observeDuplicateJsonKeysV5(text).length > 0) {
    throw new Error("frozen runtime artifact is BOM-prefixed or has duplicate JSON keys");
  }
  const artifact = validateFrozenRuntimeArtifactV5(JSON.parse(text) as unknown);
  assertCurrentNodeRuntimeV5(artifact.nodeRuntime);
  for (const row of artifact.bundles) {
    const absolute = path.resolve(input.repoRoot, row.path);
    const stat = lstatSync(absolute);
    if (!stat.isFile() || stat.isSymbolicLink() || comparable(realpathSync.native(absolute)) !== comparable(absolute)) {
      throw new Error(`${row.role} frozen bundle must be a real regular file`);
    }
    assertFrozenBundleBytesV5(artifact, row.role, readFileSync(absolute));
  }
  const ownRow = artifact.bundles.find((row) => row.role === input.role)!;
  if (comparable(realpathSync.native(input.currentModulePath)) !==
      comparable(path.resolve(input.repoRoot, ownRow.path))) {
    throw new Error("source/loader execution is forbidden; use the exact frozen plain-ESM entrypoint");
  }
  return artifact;
}

export function frozenRuntimeReferenceFromProtocolV5(protocolValue: unknown): {
  artifactPath: string;
  artifactSha256: string;
} {
  const protocol = object(protocolValue, "protocol");
  const contract = object(protocol.frozenRuntimeContract, "protocol.frozenRuntimeContract");
  if (contract.artifactPath !== FROZEN_RUNTIME_ARTIFACT_PATH_V5) {
    throw new Error("protocol frozen runtime artifact path differs");
  }
  hash(contract.artifactSha256, "protocol frozen runtime artifact hash");
  return {
    artifactPath: contract.artifactPath as string,
    artifactSha256: contract.artifactSha256 as string,
  };
}

export const FROZEN_RUNTIME_BUNDLE_PATHS_V5 = EXPECTED_BUNDLE_PATHS;
