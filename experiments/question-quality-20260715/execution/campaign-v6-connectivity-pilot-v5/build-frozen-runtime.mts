import { build, version as esbuildVersion, type Metafile } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as frozenRuntimeModule from "./frozen-runtime-core";
import type { FrozenRuntimeArtifactV5, FrozenRuntimeRoleV5 } from "./frozen-runtime-core";
import * as protocolCoreModule from "./protocol-core";

const frozenRuntimeExports =
  (frozenRuntimeModule as unknown as { default?: typeof frozenRuntimeModule }).default ?? frozenRuntimeModule;
const protocolCoreExports =
  (protocolCoreModule as unknown as { default?: typeof protocolCoreModule }).default ?? protocolCoreModule;
const {
  FROZEN_RUNTIME_BUNDLE_PATHS_V5,
  captureCurrentNodeRuntimeV5,
  validateFrozenRuntimeArtifactV5,
} = frozenRuntimeExports;
const { sha256V5, stableJsonV5 } = protocolCoreExports;

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");

const ENTRIES: Record<FrozenRuntimeRoleV5, string> = {
  CAPTURE_PRICE_METADATA: "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/capture-price-snapshot.mts",
  LIVE_CHILD: "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/live-child.mts",
  OPERATOR: "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/operator-wrapper.mts",
};
const MAXIMUM_REQUESTS: Record<FrozenRuntimeRoleV5, number> = {
  CAPTURE_PRICE_METADATA: 3,
  LIVE_CHILD: 2,
  OPERATOR: 0,
};
const AUTHORIZED_URL_TEMPLATES: Record<FrozenRuntimeRoleV5, string[]> = {
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

function count(source: string, expression: RegExp): number {
  return [...source.matchAll(expression)].length;
}

function scanBundle(role: FrozenRuntimeRoleV5, bytes: Buffer) {
  const source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  return {
    networkContract: {
      fetchCallSites: count(source, /\bfetch\s*\(/gu),
      directNetworkFetchCallSites: count(source, /\bdirectNetworkFetchV5\s*\(/gu),
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

export async function buildFrozenRuntimeV5(): Promise<{
  artifact: FrozenRuntimeArtifactV5;
  artifactBytes: Buffer;
  bundleBytesByRole: ReadonlyMap<FrozenRuntimeRoleV5, Buffer>;
}> {
  const roles = (Object.keys(ENTRIES) as FrozenRuntimeRoleV5[]).sort();
  const bundleBytesByRole = new Map<FrozenRuntimeRoleV5, Buffer>();
  const external = new Set<string>();
  const externalByRole = new Map<FrozenRuntimeRoleV5, string[]>();
  for (const role of roles) {
    const result = await build({
      absWorkingDir: repoRoot,
      entryPoints: [ENTRIES[role]],
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
    });
    if (result.outputFiles.length !== 1 || !result.metafile) {
      throw new Error(`${role} frozen build output cardinality differs`);
    }
    const bytes = Buffer.from(result.outputFiles[0]!.contents);
    if (bytes.byteLength < 1) throw new Error(`${role} frozen bundle is empty`);
    bundleBytesByRole.set(role, bytes);
    const roleExternal = externalSpecifiers(result.metafile);
    externalByRole.set(role, roleExternal);
    roleExternal.forEach((specifier) => external.add(specifier));
  }
  const bundles = roles.map((role) => {
    const bytes = bundleBytesByRole.get(role)!;
    return {
      role,
      path: FROZEN_RUNTIME_BUNDLE_PATHS_V5[role],
      bytes: bytes.byteLength,
      sha256: sha256V5(bytes),
      externalRuntimeSpecifiers: externalByRole.get(role)!,
      ...scanBundle(role, bytes),
    };
  });
  const core = {
    schemaVersion: "question-quality-connectivity-pilot-frozen-runtime-v5" as const,
    bundler: {
      name: "esbuild" as const,
      version: esbuildVersion,
      configuration: "BUNDLE_PLATFORM_NODE_FORMAT_ESM_TARGET_NODE24_NO_SOURCEMAP_NO_RUNTIME_PACKAGES" as const,
    },
    bundles,
    externalRuntimeSpecifiers: [...external].sort(),
    nodeRuntime: captureCurrentNodeRuntimeV5(),
    bundleSetSha256: sha256V5(stableJsonV5(bundles)),
  };
  const artifact = validateFrozenRuntimeArtifactV5({
    ...core,
    contentSha256: sha256V5(stableJsonV5(core)),
  });
  const artifactBytes = Buffer.from(`${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  return { artifact, artifactBytes, bundleBytesByRole };
}
