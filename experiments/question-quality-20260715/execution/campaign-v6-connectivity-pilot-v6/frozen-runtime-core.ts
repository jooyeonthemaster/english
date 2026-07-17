import { lstatSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";

import { sha256V6, stableJsonV6, type JsonObject } from "./protocol-core";
import { observeDuplicateJsonKeysV6 } from "./strict-json-observer";

export type FrozenRuntimeRoleV6 = "CAPTURE_PRICE_METADATA" | "LIVE_CHILD" | "OPERATOR";

export interface FrozenNodeRuntimeV6 extends JsonObject {
  executableRealPath: string;
  executableBytes: number;
  executableSha256: string;
  nodeVersion: string;
  modulesAbi: string;
  v8Version: string;
  platform: NodeJS.Platform;
  arch: string;
}

export interface FrozenToolchainFileV6 extends JsonObject {
  repoRelativePath: string;
  realPath: string;
  bytes: number;
  sha256: string;
}

export interface FrozenProvenanceAnalyzerV6 extends JsonObject {
  name: "typescript";
  version: string;
  resolvedEntrypoint: FrozenToolchainFileV6;
  packageJson: FrozenToolchainFileV6;
  implementationFileSetSha256: string;
  contentSha256: string;
}

export interface FrozenBundlerToolchainV6 extends JsonObject {
  schemaVersion: "question-quality-esbuild-toolchain-provenance-v6";
  platform: NodeJS.Platform;
  arch: string;
  esbuildVersion: string;
  resolvedEntrypoint: FrozenToolchainFileV6;
  packageJson: FrozenToolchainFileV6;
  transitiveJsClosure: FrozenToolchainFileV6[];
  externalStaticSpecifiers: string[];
  pnpapiResolution: "UNRESOLVED";
  esbuildPackageFiles: FrozenToolchainFileV6[];
  selectedNativePackageName: string;
  selectedNativePackageJson: FrozenToolchainFileV6;
  selectedNativeExecutable: FrozenToolchainFileV6;
  selectedNativePackageFiles: FrozenToolchainFileV6[];
  packageLock: FrozenToolchainFileV6;
  rootPackageJson: FrozenToolchainFileV6;
  provenanceAnalyzer: FrozenProvenanceAnalyzerV6;
  fileSetSha256: string;
  contentSha256: string;
}

export interface FrozenRuntimeArtifactV6 extends JsonObject {
  schemaVersion: "question-quality-connectivity-pilot-frozen-runtime-v6";
  bundler: {
    name: "esbuild";
    version: string;
    configuration: "BUNDLE_PLATFORM_NODE_FORMAT_ESM_TARGET_NODE24_NO_SOURCEMAP_NO_RUNTIME_PACKAGES";
    exactBuildOptions: JsonObject;
    exactBuildOptionsSha256: string;
    toolchain: FrozenBundlerToolchainV6;
  };
  bundles: Array<{
    role: FrozenRuntimeRoleV6;
    path: string;
    bytes: number;
    sha256: string;
    externalRuntimeSpecifiers: string[];
    sourceInputs: Array<{
      path: string;
      sourceBytes: number;
      sourceSha256: string;
      bytesInOutput: number;
    }>;
    sourceInputSetSha256: string;
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
  nodeRuntime: FrozenNodeRuntimeV6;
  bundleSetSha256: string;
  contentSha256: string;
}

const SHA256 = /^[a-f0-9]{64}$/u;
const EXPECTED_BUNDLE_PATHS: Record<FrozenRuntimeRoleV6, string> = {
  CAPTURE_PRICE_METADATA: "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v6/frozen-live/capture-price-snapshot-v6.bundle.mjs",
  LIVE_CHILD: "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v6/frozen-live/live-child-v6.bundle.mjs",
  OPERATOR: "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v6/frozen-live/operator-wrapper-v6.bundle.mjs",
};
const EXPECTED_ROLES = Object.keys(EXPECTED_BUNDLE_PATHS).sort() as FrozenRuntimeRoleV6[];
const SOURCE_ROOT_V6 = "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v6/";
const sourcePath = (name: string): string => `${SOURCE_ROOT_V6}${name}`;
const ROLE_SOURCE_INPUT_PATHS_V6: Record<FrozenRuntimeRoleV6, readonly string[]> = {
  CAPTURE_PRICE_METADATA: [
    "author-freeze-gate.ts", "bounded-response-body.ts", "capture-output-boundary.ts",
    "capture-price-snapshot.mts", "frozen-runtime-core.ts", "live-environment.ts",
    "price-snapshot-core.ts", "protocol-core.ts", "strict-json-observer.ts",
  ].map(sourcePath).sort(),
  LIVE_CHILD: [
    "author-freeze-gate.ts", "bounded-response-body.ts", "durable-private-marker.ts",
    "filesystem-durability.ts", "frozen-runtime-core.ts", "live-child.mts", "live-environment.ts",
    "live-io.ts", "price-snapshot-core.ts", "production-runner.ts", "protocol-core.ts",
    "response-parser.ts", "strict-json-observer.ts", "terminal-reconciliation-core.ts",
  ].map(sourcePath).sort(),
  OPERATOR: [
    "author-freeze-gate.ts", "bounded-response-body.ts", "credential-file-boundary.ts",
    "filesystem-durability.ts", "frozen-runtime-core.ts", "live-environment.ts", "live-io.ts",
    "operator-wrapper.mts", "price-snapshot-core.ts", "protocol-core.ts", "strict-json-observer.ts",
  ].map(sourcePath).sort(),
};
const COMMON_HTTPS_LITERALS = [
  "https://openrouter.ai/api/v1/chat/completions",
  "https://openrouter.ai/api/v1/models",
  "https://openrouter.ai/api/v1/models/${modelId}/endpoints",
] as const;
const ROLE_EXTERNAL_SPECIFIERS: Record<FrozenRuntimeRoleV6, readonly string[]> = {
  CAPTURE_PRICE_METADATA: ["node:crypto", "node:fs", "node:path", "node:url"],
  LIVE_CHILD: ["node:crypto", "node:fs", "node:path", "node:url"],
  OPERATOR: ["node:child_process", "node:crypto", "node:fs", "node:path", "node:url"],
};
const ROLE_NETWORK_CONTRACT: Record<FrozenRuntimeRoleV6, {
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
export const FROZEN_RUNTIME_ARTIFACT_PATH_V6 =
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v6/frozen-runtime-v6.json";

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

function validateToolchainFileV6(value: unknown, label: string): FrozenToolchainFileV6 {
  const file = exactKeys(value, label, ["repoRelativePath", "realPath", "bytes", "sha256"]);
  if (typeof file.repoRelativePath !== "string" || !file.repoRelativePath ||
      file.repoRelativePath.startsWith("/") || file.repoRelativePath.includes("\\") ||
      file.repoRelativePath.split("/").includes("..") ||
      typeof file.realPath !== "string" || !path.isAbsolute(file.realPath) ||
      !Number.isSafeInteger(file.bytes) || (file.bytes as number) < 1) {
    throw new Error(`${label} identity differs`);
  }
  hash(file.sha256, `${label}.sha256`);
  return file as unknown as FrozenToolchainFileV6;
}

function validateToolchainFileArrayV6(value: unknown, label: string): FrozenToolchainFileV6[] {
  if (!Array.isArray(value) || value.length < 1) throw new Error(`${label} must be a nonempty file array`);
  const files = value.map((row, index) => validateToolchainFileV6(row, `${label}[${index}]`));
  const paths = files.map((row) => row.repoRelativePath);
  if (JSON.stringify(paths) !== JSON.stringify([...paths].sort((a, b) => a.localeCompare(b))) ||
      new Set(paths).size !== paths.length) {
    throw new Error(`${label} paths must be exact, unique, and sorted`);
  }
  return files;
}

function validateBundlerToolchainV6(value: unknown, bundlerVersion: string): FrozenBundlerToolchainV6 {
  const toolchain = exactKeys(value, "frozen runtime bundler.toolchain", [
    "schemaVersion", "platform", "arch", "esbuildVersion", "resolvedEntrypoint", "packageJson",
    "transitiveJsClosure", "externalStaticSpecifiers", "pnpapiResolution", "esbuildPackageFiles", "selectedNativePackageName",
    "selectedNativePackageJson", "selectedNativeExecutable", "selectedNativePackageFiles", "packageLock",
    "rootPackageJson", "provenanceAnalyzer",
    "fileSetSha256", "contentSha256",
  ]);
  if (toolchain.schemaVersion !== "question-quality-esbuild-toolchain-provenance-v6" ||
      typeof toolchain.platform !== "string" || typeof toolchain.arch !== "string" || !toolchain.arch ||
      toolchain.esbuildVersion !== bundlerVersion || typeof toolchain.selectedNativePackageName !== "string" ||
      !toolchain.selectedNativePackageName.startsWith("@esbuild/")) {
    throw new Error("frozen runtime bundler toolchain identity differs");
  }
  const resolvedEntrypoint = validateToolchainFileV6(toolchain.resolvedEntrypoint, "esbuild resolved entrypoint");
  const packageJson = validateToolchainFileV6(toolchain.packageJson, "esbuild package.json");
  const transitiveJsClosure = validateToolchainFileArrayV6(
    toolchain.transitiveJsClosure,
    "esbuild transitive JavaScript closure",
  );
  const esbuildPackageFiles = validateToolchainFileArrayV6(toolchain.esbuildPackageFiles, "esbuild package files");
  const selectedNativePackageJson = validateToolchainFileV6(
    toolchain.selectedNativePackageJson,
    "selected native package.json",
  );
  const selectedNativeExecutable = validateToolchainFileV6(
    toolchain.selectedNativeExecutable,
    "selected native executable",
  );
  const selectedNativePackageFiles = validateToolchainFileArrayV6(
    toolchain.selectedNativePackageFiles,
    "selected native package files",
  );
  const packageLock = validateToolchainFileV6(toolchain.packageLock, "package-lock binding");
  const rootPackageJson = validateToolchainFileV6(toolchain.rootPackageJson, "root package.json binding");
  const analyzer = exactKeys(toolchain.provenanceAnalyzer, "provenance analyzer", [
    "name", "version", "resolvedEntrypoint", "packageJson", "implementationFileSetSha256", "contentSha256",
  ]);
  if (analyzer.name !== "typescript" || typeof analyzer.version !== "string" || !analyzer.version) {
    throw new Error("provenance analyzer identity differs");
  }
  const analyzerEntrypoint = validateToolchainFileV6(analyzer.resolvedEntrypoint, "provenance analyzer entrypoint");
  const analyzerPackageJson = validateToolchainFileV6(analyzer.packageJson, "provenance analyzer package.json");
  hash(analyzer.implementationFileSetSha256, "provenance analyzer implementation file set hash");
  hash(analyzer.contentSha256, "provenance analyzer content hash");
  const analyzerFiles = [analyzerEntrypoint, analyzerPackageJson]
    .sort((a, b) => a.repoRelativePath.localeCompare(b.repoRelativePath));
  if (!analyzerEntrypoint.repoRelativePath.endsWith("node_modules/typescript/lib/typescript.js") ||
      !analyzerPackageJson.repoRelativePath.endsWith("node_modules/typescript/package.json") ||
      analyzer.implementationFileSetSha256 !== sha256V6(stableJsonV6(analyzerFiles))) {
    throw new Error("provenance analyzer implementation binding differs");
  }
  const analyzerCore = { ...analyzer };
  delete analyzerCore.contentSha256;
  if (analyzer.contentSha256 !== sha256V6(stableJsonV6(analyzerCore))) {
    throw new Error("provenance analyzer content hash differs");
  }
  if (!resolvedEntrypoint.repoRelativePath.endsWith("node_modules/esbuild/lib/main.js") ||
      !packageJson.repoRelativePath.endsWith("node_modules/esbuild/package.json") ||
      packageLock.repoRelativePath !== "package-lock.json" || rootPackageJson.repoRelativePath !== "package.json" ||
      esbuildPackageFiles.length !== 7 || selectedNativePackageFiles.length !== 3 ||
      !esbuildPackageFiles.some((row) => stableJsonV6(row) === stableJsonV6(resolvedEntrypoint)) ||
      !esbuildPackageFiles.some((row) => stableJsonV6(row) === stableJsonV6(packageJson)) ||
      !transitiveJsClosure.some((row) => stableJsonV6(row) === stableJsonV6(resolvedEntrypoint)) ||
      !selectedNativePackageFiles.some((row) => stableJsonV6(row) === stableJsonV6(selectedNativePackageJson)) ||
      !selectedNativePackageFiles.some((row) => stableJsonV6(row) === stableJsonV6(selectedNativeExecutable))) {
    throw new Error("frozen runtime bundler package/closure membership differs");
  }
  if (!Array.isArray(toolchain.externalStaticSpecifiers) ||
      toolchain.externalStaticSpecifiers.some((row) => typeof row !== "string") ||
      JSON.stringify(toolchain.externalStaticSpecifiers) !==
        JSON.stringify([...toolchain.externalStaticSpecifiers].sort())) {
    throw new Error("esbuild external static specifiers must be exact and sorted");
  }
  if (toolchain.pnpapiResolution !== "UNRESOLVED") {
    throw new Error("esbuild pnpapi must remain fail-closed unresolved");
  }
  hash(toolchain.fileSetSha256, "esbuild toolchain file set hash");
  hash(toolchain.contentSha256, "esbuild toolchain content hash");
  const filesForSet = [
    ...esbuildPackageFiles,
    ...selectedNativePackageFiles,
    packageLock,
    rootPackageJson,
    ...analyzerFiles,
  ]
    .sort((a, b) => a.repoRelativePath.localeCompare(b.repoRelativePath));
  if (toolchain.fileSetSha256 !== sha256V6(stableJsonV6(filesForSet))) {
    throw new Error("esbuild toolchain file set hash differs");
  }
  const core = { ...toolchain };
  delete core.contentSha256;
  if (toolchain.contentSha256 !== sha256V6(stableJsonV6(core))) {
    throw new Error("esbuild toolchain content hash differs");
  }
  return toolchain as unknown as FrozenBundlerToolchainV6;
}

export function captureCurrentNodeRuntimeV6(): FrozenNodeRuntimeV6 {
  const executableRealPath = realpathSync.native(process.execPath);
  const stat = lstatSync(executableRealPath);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Node executable must resolve to a real regular file");
  const bytes = readFileSync(executableRealPath);
  return {
    executableRealPath,
    executableBytes: bytes.byteLength,
    executableSha256: sha256V6(bytes),
    nodeVersion: process.version,
    modulesAbi: process.versions.modules,
    v8Version: process.versions.v8,
    platform: process.platform,
    arch: process.arch,
  };
}

export function assertCurrentNodeRuntimeV6(expectedValue: unknown): FrozenNodeRuntimeV6 {
  const expected = exactKeys(expectedValue, "frozen Node runtime", [
    "executableRealPath", "executableBytes", "executableSha256", "nodeVersion",
    "modulesAbi", "v8Version", "platform", "arch",
  ]) as unknown as FrozenNodeRuntimeV6;
  const actual = captureCurrentNodeRuntimeV6();
  if (stableJsonV6(actual) !== stableJsonV6(expected)) {
    throw new Error("current Node executable identity differs from the frozen runtime contract");
  }
  return actual;
}

export function validateFrozenRuntimeArtifactV6(value: unknown): FrozenRuntimeArtifactV6 {
  const artifact = exactKeys(value, "frozen runtime artifact", [
    "schemaVersion", "bundler", "bundles", "externalRuntimeSpecifiers", "nodeRuntime",
    "bundleSetSha256", "contentSha256",
  ]);
  if (artifact.schemaVersion !== "question-quality-connectivity-pilot-frozen-runtime-v6") {
    throw new Error("frozen runtime artifact schema differs");
  }
  const bundler = exactKeys(artifact.bundler, "frozen runtime bundler", [
    "name", "version", "configuration", "exactBuildOptions", "exactBuildOptionsSha256", "toolchain",
  ]);
  if (bundler.name !== "esbuild" || typeof bundler.version !== "string" || !bundler.version ||
      bundler.configuration !== "BUNDLE_PLATFORM_NODE_FORMAT_ESM_TARGET_NODE24_NO_SOURCEMAP_NO_RUNTIME_PACKAGES") {
    throw new Error("frozen runtime bundler contract differs");
  }
  const exactBuildOptions = exactKeys(bundler.exactBuildOptions, "frozen runtime exact esbuild options", [
    "bundle", "platform", "format", "target", "packages", "sourcemap", "legalComments", "charset",
    "treeShaking", "write", "metafile", "logLevel", "outfile", "tsconfigRaw",
  ]);
  const expectedBuildOptions = {
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node24",
    packages: "bundle",
    sourcemap: false,
    legalComments: "none",
    charset: "utf8",
    treeShaking: true,
    write: false,
    metafile: true,
    logLevel: "silent",
    outfile: "frozen-entry.mjs",
    tsconfigRaw: { compilerOptions: {} },
  };
  if (stableJsonV6(exactBuildOptions) !== stableJsonV6(expectedBuildOptions)) {
    throw new Error("frozen runtime exact esbuild options differ");
  }
  hash(bundler.exactBuildOptionsSha256, "frozen runtime exact esbuild options hash");
  if (bundler.exactBuildOptionsSha256 !== sha256V6(stableJsonV6(exactBuildOptions))) {
    throw new Error("frozen runtime exact esbuild options hash differs");
  }
  const toolchain = validateBundlerToolchainV6(bundler.toolchain, bundler.version as string);
  if (!Array.isArray(artifact.bundles) || artifact.bundles.length !== 3) {
    throw new Error("frozen runtime must contain exactly three bundles");
  }
  const bundles = artifact.bundles.map((candidate, index) => {
    const row = exactKeys(candidate, `frozen runtime bundle[${index}]`, [
      "role", "path", "bytes", "sha256", "externalRuntimeSpecifiers", "sourceInputs",
      "sourceInputSetSha256", "networkContract",
      "forbiddenSyntaxCounts",
    ]);
    if (!EXPECTED_ROLES.includes(row.role as FrozenRuntimeRoleV6) ||
        row.path !== EXPECTED_BUNDLE_PATHS[row.role as FrozenRuntimeRoleV6] ||
        !Number.isSafeInteger(row.bytes) || (row.bytes as number) < 1) {
      throw new Error(`frozen runtime bundle[${index}] identity differs`);
    }
    hash(row.sha256, `frozen runtime bundle[${index}].sha256`);
    const role = row.role as FrozenRuntimeRoleV6;
    if (JSON.stringify(row.externalRuntimeSpecifiers) !== JSON.stringify(ROLE_EXTERNAL_SPECIFIERS[role])) {
      throw new Error(`${role} exact Node builtin allowlist differs`);
    }
    if (!Array.isArray(row.sourceInputs)) throw new Error(`${role} source-to-bundle inputs must be an array`);
    const sourceInputs = row.sourceInputs.map((candidateInput, inputIndex) => {
      const sourceInput = exactKeys(candidateInput, `${role}.sourceInputs[${inputIndex}]`, [
        "path", "sourceBytes", "sourceSha256", "bytesInOutput",
      ]);
      if (typeof sourceInput.path !== "string" ||
          !sourceInput.path.startsWith("experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v6/") ||
          !Number.isSafeInteger(sourceInput.sourceBytes) || (sourceInput.sourceBytes as number) < 1 ||
          !Number.isSafeInteger(sourceInput.bytesInOutput) || (sourceInput.bytesInOutput as number) < 0) {
        throw new Error(`${role}.sourceInputs[${inputIndex}] identity differs`);
      }
      hash(sourceInput.sourceSha256, `${role}.sourceInputs[${inputIndex}].sourceSha256`);
      return sourceInput;
    });
    const sourcePaths = sourceInputs.map((sourceInput) => sourceInput.path as string);
    if (JSON.stringify(sourcePaths) !== JSON.stringify([...sourcePaths].sort((a, b) => a.localeCompare(b))) ||
        new Set(sourcePaths).size !== sourcePaths.length) {
      throw new Error(`${role} source-to-bundle inputs are not exact, unique, and sorted`);
    }
    if (JSON.stringify(sourcePaths) !== JSON.stringify(ROLE_SOURCE_INPUT_PATHS_V6[role])) {
      throw new Error(`${role} exact source-to-bundle path allowlist differs`);
    }
    hash(row.sourceInputSetSha256, `${role}.sourceInputSetSha256`);
    if (row.sourceInputSetSha256 !== sha256V6(stableJsonV6(sourceInputs))) {
      throw new Error(`${role} source-to-bundle input set hash differs`);
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
    return row as unknown as FrozenRuntimeArtifactV6["bundles"][number];
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
  if ((artifact.nodeRuntime as JsonObject).platform !== toolchain.platform ||
      (artifact.nodeRuntime as JsonObject).arch !== toolchain.arch) {
    throw new Error("frozen Node runtime platform differs from the selected esbuild toolchain");
  }
  hash((artifact.nodeRuntime as JsonObject).executableSha256, "frozen Node executable hash");
  hash(artifact.bundleSetSha256, "frozen runtime bundle set hash");
  hash(artifact.contentSha256, "frozen runtime content hash");
  if (artifact.bundleSetSha256 !== sha256V6(stableJsonV6(bundles))) {
    throw new Error("frozen runtime bundle set hash differs");
  }
  const core = { ...artifact };
  delete core.contentSha256;
  if (artifact.contentSha256 !== sha256V6(stableJsonV6(core))) {
    throw new Error("frozen runtime content hash differs");
  }
  return artifact as unknown as FrozenRuntimeArtifactV6;
}

export function assertFrozenBundleBytesV6(
  artifactValue: unknown,
  role: FrozenRuntimeRoleV6,
  bytes: Uint8Array,
): void {
  const artifact = validateFrozenRuntimeArtifactV6(artifactValue);
  const row = artifact.bundles.find((candidate) => candidate.role === role);
  if (!row || row.bytes !== bytes.byteLength || row.sha256 !== sha256V6(bytes)) {
    throw new Error(`${role} frozen bundle bytes differ`);
  }
}

export function assertFrozenRuntimeEntrypointV6(input: {
  repoRoot: string;
  artifactPath: string;
  expectedArtifactSha256: string;
  role: FrozenRuntimeRoleV6;
  currentModulePath: string;
}): FrozenRuntimeArtifactV6 {
  const artifactAbsolute = path.resolve(input.repoRoot, input.artifactPath);
  const artifactStat = lstatSync(artifactAbsolute);
  if (!artifactStat.isFile() || artifactStat.isSymbolicLink() ||
      comparable(realpathSync.native(artifactAbsolute)) !== comparable(artifactAbsolute)) {
    throw new Error("frozen runtime artifact must be a real regular file");
  }
  const raw = readFileSync(artifactAbsolute);
  if (sha256V6(raw) !== input.expectedArtifactSha256) throw new Error("frozen runtime artifact file hash differs");
  const text = new TextDecoder("utf-8", { fatal: true }).decode(raw);
  if (text.charCodeAt(0) === 0xfeff || observeDuplicateJsonKeysV6(text).length > 0) {
    throw new Error("frozen runtime artifact is BOM-prefixed or has duplicate JSON keys");
  }
  const artifact = validateFrozenRuntimeArtifactV6(JSON.parse(text) as unknown);
  assertCurrentNodeRuntimeV6(artifact.nodeRuntime);
  for (const row of artifact.bundles) {
    const absolute = path.resolve(input.repoRoot, row.path);
    const stat = lstatSync(absolute);
    if (!stat.isFile() || stat.isSymbolicLink() || comparable(realpathSync.native(absolute)) !== comparable(absolute)) {
      throw new Error(`${row.role} frozen bundle must be a real regular file`);
    }
    assertFrozenBundleBytesV6(artifact, row.role, readFileSync(absolute));
  }
  const ownRow = artifact.bundles.find((row) => row.role === input.role)!;
  if (comparable(realpathSync.native(input.currentModulePath)) !==
      comparable(path.resolve(input.repoRoot, ownRow.path))) {
    throw new Error("source/loader execution is forbidden; use the exact frozen plain-ESM entrypoint");
  }
  return artifact;
}

export function frozenRuntimeReferenceFromProtocolV6(protocolValue: unknown): {
  artifactPath: string;
  artifactSha256: string;
} {
  const protocol = object(protocolValue, "protocol");
  const contract = object(protocol.frozenRuntimeContract, "protocol.frozenRuntimeContract");
  if (contract.artifactPath !== FROZEN_RUNTIME_ARTIFACT_PATH_V6) {
    throw new Error("protocol frozen runtime artifact path differs");
  }
  hash(contract.artifactSha256, "protocol frozen runtime artifact hash");
  return {
    artifactPath: contract.artifactPath as string,
    artifactSha256: contract.artifactSha256 as string,
  };
}

export const FROZEN_RUNTIME_BUNDLE_PATHS_V6 = EXPECTED_BUNDLE_PATHS;
