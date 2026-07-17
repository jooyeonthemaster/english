import { build, version as esbuildVersion, type BuildOptions, type Metafile } from "esbuild";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as frozenRuntimeModule from "./frozen-runtime-core";
import type { FrozenRuntimeArtifactV6, FrozenRuntimeRoleV6 } from "./frozen-runtime-core";
import * as protocolCoreModule from "./protocol-core";
import * as bundlerToolchainModule from "./bundler-toolchain-provenance";
import * as authorEnvironmentModule from "./author-environment";

const frozenRuntimeExports =
  (frozenRuntimeModule as unknown as { default?: typeof frozenRuntimeModule }).default ?? frozenRuntimeModule;
const protocolCoreExports =
  (protocolCoreModule as unknown as { default?: typeof protocolCoreModule }).default ?? protocolCoreModule;
const bundlerToolchainExports =
  (bundlerToolchainModule as unknown as { default?: typeof bundlerToolchainModule }).default ?? bundlerToolchainModule;
const authorEnvironmentExports =
  (authorEnvironmentModule as unknown as { default?: typeof authorEnvironmentModule }).default ?? authorEnvironmentModule;
const {
  FROZEN_RUNTIME_BUNDLE_PATHS_V6,
  captureCurrentNodeRuntimeV6,
  validateFrozenRuntimeArtifactV6,
} = frozenRuntimeExports;
const { sha256V6, stableJsonV6 } = protocolCoreExports;
const { captureBundlerToolchainProvenanceV6 } = bundlerToolchainExports;
const { assertNoAuthorToolchainEnvironmentInfluenceV6 } = authorEnvironmentExports;

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");

const EXACT_BUILD_OPTIONS_V6 = {
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
  // An explicit empty raw config forbids ambient discovery of the repository
  // tsconfig while preserving esbuild's own documented defaults.
  tsconfigRaw: { compilerOptions: {} },
} satisfies BuildOptions;

const ENTRIES: Record<FrozenRuntimeRoleV6, string> = {
  CAPTURE_PRICE_METADATA: "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v6/capture-price-snapshot.mts",
  LIVE_CHILD: "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v6/live-child.mts",
  OPERATOR: "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v6/operator-wrapper.mts",
};
const MAXIMUM_REQUESTS: Record<FrozenRuntimeRoleV6, number> = {
  CAPTURE_PRICE_METADATA: 3,
  LIVE_CHILD: 2,
  OPERATOR: 0,
};
const AUTHORIZED_URL_TEMPLATES: Record<FrozenRuntimeRoleV6, string[]> = {
  CAPTURE_PRICE_METADATA: [
    "https://openrouter.ai/api/v1/models",
    "https://openrouter.ai/api/v1/models/${modelId}/endpoints",
  ],
  LIVE_CHILD: ["https://openrouter.ai/api/v1/chat/completions"],
  OPERATOR: [],
};

function externalSpecifiers(metafile: Metafile): string[] {
  const result = new Set<string>();
  for (const output of Object.values(metafile.outputs)) {
    for (const imported of output.imports) {
      if (!imported.external || !imported.path.startsWith("node:")) {
        throw new Error(`frozen bundle retained non-Node runtime dependency ${imported.path}`);
      }
      result.add(imported.path);
    }
  }
  return [...result].sort();
}

function sourceToBundleInputs(metafile: Metafile) {
  const outputs = Object.values(metafile.outputs);
  if (outputs.length !== 1) throw new Error("frozen build metafile output cardinality differs");
  const outputInputs = outputs[0]!.inputs;
  const sourceInputs = Object.entries(metafile.inputs).map(([inputPath, input]) => {
    const normalized = inputPath.split(path.sep).join("/");
    if (!normalized.startsWith(
      "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v6/",
    )) {
      throw new Error(`frozen bundle source input escaped the exact v6 package: ${normalized}`);
    }
    const bytes = readFileSync(path.join(repoRoot, normalized));
    if (bytes.byteLength !== input.bytes) {
      throw new Error(`frozen bundle metafile source byte count differs: ${normalized}`);
    }
    const outputInput = outputInputs[inputPath];
    if (!outputInput || !Number.isSafeInteger(outputInput.bytesInOutput) || outputInput.bytesInOutput < 0) {
      throw new Error(`frozen bundle output mapping omitted source input: ${normalized}`);
    }
    return {
      path: normalized,
      sourceBytes: bytes.byteLength,
      sourceSha256: sha256V6(bytes),
      bytesInOutput: outputInput.bytesInOutput,
    };
  }).sort((a, b) => a.path.localeCompare(b.path));
  return {
    sourceInputs,
    sourceInputSetSha256: sha256V6(stableJsonV6(sourceInputs)),
  };
}

function count(source: string, expression: RegExp): number {
  return [...source.matchAll(expression)].length;
}

function scanBundle(role: FrozenRuntimeRoleV6, bytes: Buffer) {
  const source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  return {
    networkContract: {
      fetchCallSites: count(source, /\bfetch\s*\(/gu),
      directNetworkFetchCallSites: count(source, /\bdirectNetworkFetchV6\s*\(/gu),
      maximumRequestsPerInvocation: MAXIMUM_REQUESTS[role],
      authorizedUrlTemplates: AUTHORIZED_URL_TEMPLATES[role],
      observedHttpsLiterals: [...new Set(source.match(/https:\/\/[^"'`\s)]+/gu) ?? [])].sort(),
    },
    forbiddenSyntaxCounts: {
      dynamicImport: count(source, /\bimport\s*\(/gu),
      requireCall: count(source, /\brequire\s*\(/gu),
      evalCall: count(source, /\beval\s*\(/gu),
      functionConstructor: count(source, /\bFunction\s*\(/gu),
      webSocket: count(source, /\bWebSocket\b/gu),
      eventSource: count(source, /\bEventSource\b/gu),
    },
  };
}

export async function buildFrozenRuntimeV6(): Promise<{
  artifact: FrozenRuntimeArtifactV6;
  artifactBytes: Buffer;
  bundleBytesByRole: ReadonlyMap<FrozenRuntimeRoleV6, Buffer>;
}> {
  assertNoAuthorToolchainEnvironmentInfluenceV6(process.env);
  const toolchainBefore = captureBundlerToolchainProvenanceV6();
  if (toolchainBefore.esbuildVersion !== esbuildVersion) {
    throw new Error("imported esbuild version differs from the resolved sealed package metadata");
  }
  const roles = (Object.keys(ENTRIES) as FrozenRuntimeRoleV6[]).sort();
  const bundleBytesByRole = new Map<FrozenRuntimeRoleV6, Buffer>();
  const external = new Set<string>();
  const externalByRole = new Map<FrozenRuntimeRoleV6, string[]>();
  const sourceInputsByRole = new Map<FrozenRuntimeRoleV6, ReturnType<typeof sourceToBundleInputs>>();
  for (const role of roles) {
    const result = await build({
      absWorkingDir: repoRoot,
      entryPoints: [ENTRIES[role]],
      ...EXACT_BUILD_OPTIONS_V6,
    });
    if (result.outputFiles.length !== 1 || !result.metafile) {
      throw new Error(`${role} frozen build output cardinality differs`);
    }
    const bytes = Buffer.from(result.outputFiles[0]!.contents);
    if (bytes.byteLength < 1) throw new Error(`${role} frozen bundle is empty`);
    bundleBytesByRole.set(role, bytes);
    const roleExternal = externalSpecifiers(result.metafile);
    externalByRole.set(role, roleExternal);
    sourceInputsByRole.set(role, sourceToBundleInputs(result.metafile));
    roleExternal.forEach((specifier) => external.add(specifier));
  }
  const bundles = roles.map((role) => {
    const bytes = bundleBytesByRole.get(role)!;
    return {
      role,
      path: FROZEN_RUNTIME_BUNDLE_PATHS_V6[role],
      bytes: bytes.byteLength,
      sha256: sha256V6(bytes),
      externalRuntimeSpecifiers: externalByRole.get(role)!,
      ...sourceInputsByRole.get(role)!,
      ...scanBundle(role, bytes),
    };
  });
  const toolchainAfter = captureBundlerToolchainProvenanceV6();
  if (stableJsonV6(toolchainAfter) !== stableJsonV6(toolchainBefore)) {
    throw new Error("esbuild toolchain identity changed between pre-build and post-build capture");
  }
  const core = {
    schemaVersion: "question-quality-connectivity-pilot-frozen-runtime-v6" as const,
    bundler: {
      name: "esbuild" as const,
      version: esbuildVersion,
      configuration: "BUNDLE_PLATFORM_NODE_FORMAT_ESM_TARGET_NODE24_NO_SOURCEMAP_NO_RUNTIME_PACKAGES" as const,
      exactBuildOptions: EXACT_BUILD_OPTIONS_V6,
      exactBuildOptionsSha256: sha256V6(stableJsonV6(EXACT_BUILD_OPTIONS_V6)),
      toolchain: toolchainBefore,
    },
    bundles,
    externalRuntimeSpecifiers: [...external].sort(),
    nodeRuntime: captureCurrentNodeRuntimeV6(),
    bundleSetSha256: sha256V6(stableJsonV6(bundles)),
  };
  const artifact = validateFrozenRuntimeArtifactV6({
    ...core,
    contentSha256: sha256V6(stableJsonV6(core)),
  });
  const artifactBytes = Buffer.from(`${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  return { artifact, artifactBytes, bundleBytesByRole };
}
