import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

import * as productionRunnerModule from "./production-runner";
import * as authorGateModule from "./author-freeze-gate";
import * as liveEnvironmentModule from "./live-environment";
import * as frozenRuntimeModule from "./frozen-runtime-core";
import * as protocolCoreModule from "./protocol-core";

const frozenRuntimeExports =
  (frozenRuntimeModule as unknown as { default?: typeof frozenRuntimeModule }).default ?? frozenRuntimeModule;
const protocolCoreExports =
  (protocolCoreModule as unknown as { default?: typeof protocolCoreModule }).default ?? protocolCoreModule;
const liveEnvironmentExports =
  (liveEnvironmentModule as unknown as { default?: typeof liveEnvironmentModule }).default ?? liveEnvironmentModule;
const authorGateExports =
  (authorGateModule as unknown as { default?: typeof authorGateModule }).default ?? authorGateModule;
const { assertFrozenRuntimeEntrypointV5, frozenRuntimeReferenceFromProtocolV5 } = frozenRuntimeExports;
const { validateProtocolV5 } = protocolCoreExports;
const { assertExactLiveChildEnvironmentV5 } = liveEnvironmentExports;
const { assertAuthorFreezePermanentlyNoDispatchV5 } = authorGateExports;

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.basename(moduleDirectory) === "frozen-live" ? path.dirname(moduleDirectory) : moduleDirectory;
const repoRoot = path.resolve(packageRoot, "../../../..");

const productionRunnerExports =
  (productionRunnerModule as unknown as { default?: typeof productionRunnerModule }).default ?? productionRunnerModule;
const { runSealedConnectivityPilotV5 } = productionRunnerExports;

function exactArguments(): {
  runId: string;
  priceSnapshotPath: string;
  priceSnapshotFileSha256: string;
  priceSnapshotBundleSha256: string;
} {
  const args = process.argv.slice(2);
  if (args.length !== 4 || !args[0]!.startsWith("--run-id=") || !args[1]!.startsWith("--price-snapshot=") ||
      !args[2]!.startsWith("--price-snapshot-file-sha256=") ||
      !args[3]!.startsWith("--price-snapshot-bundle-sha256=") ||
      args[0]!.split("--run-id=").length !== 2 || args[1]!.split("--price-snapshot=").length !== 2 ||
      args[2]!.split("--price-snapshot-file-sha256=").length !== 2 ||
      args[3]!.split("--price-snapshot-bundle-sha256=").length !== 2) {
    throw new Error("live child requires exactly ordered run, price path, file hash, and bundle hash arguments");
  }
  const runId = args[0]!.slice("--run-id=".length);
  const priceSnapshotPath = args[1]!.slice("--price-snapshot=".length);
  const priceSnapshotFileSha256 = args[2]!.slice("--price-snapshot-file-sha256=".length);
  const priceSnapshotBundleSha256 = args[3]!.slice("--price-snapshot-bundle-sha256=".length);
  if (!runId || !priceSnapshotPath || !/^[a-f0-9]{64}$/u.test(priceSnapshotFileSha256) ||
      !/^[a-f0-9]{64}$/u.test(priceSnapshotBundleSha256)) {
    throw new Error("live child arguments are empty or their capture handoff hashes are malformed");
  }
  return { runId, priceSnapshotPath, priceSnapshotFileSha256, priceSnapshotBundleSha256 };
}

async function main(): Promise<void> {
  assertAuthorFreezePermanentlyNoDispatchV5();
  assertExactLiveChildEnvironmentV5();
  const protocol = validateProtocolV5(JSON.parse(readFileSync(path.join(packageRoot, "protocol-v5.json"), "utf8")) as unknown);
  const frozenReference = frozenRuntimeReferenceFromProtocolV5(protocol);
  assertFrozenRuntimeEntrypointV5({
    repoRoot,
    artifactPath: frozenReference.artifactPath,
    expectedArtifactSha256: frozenReference.artifactSha256,
    role: "LIVE_CHILD",
    currentModulePath: fileURLToPath(import.meta.url),
  });
  const args = exactArguments();
  const result = await runSealedConnectivityPilotV5({
    runId: args.runId,
    priceSnapshotPath: args.priceSnapshotPath,
    priceSnapshotFileSha256: args.priceSnapshotFileSha256,
    priceSnapshotBundleSha256: args.priceSnapshotBundleSha256,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
