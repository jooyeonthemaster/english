import { closeSync, existsSync, fsyncSync, openSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  assertAndDescribeIsolatedCompilerEnvironmentV5,
  sanitizeCompilerEnvironmentBeforeImportV5,
} from "./compiler-environment.mts";

function exactOutputDirectory(): string {
  const flag = process.argv.find((value) => value.startsWith("--output-dir="));
  if (!flag) throw new Error("isolated compiler requires --output-dir");
  const absolute = path.resolve(flag.slice("--output-dir=".length));
  const relative = path.relative(path.resolve(os.tmpdir()), absolute);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative) || !existsSync(absolute) || !statSync(absolute).isDirectory()) {
    throw new Error("isolated compiler output must be an existing OS-temp child directory");
  }
  return absolute;
}

function writeExclusive(filePath: string, bytes: string): void {
  const handle = openSync(filePath, "wx", 0o600);
  try {
    writeFileSync(handle, bytes, "utf8");
    fsyncSync(handle);
  } finally {
    closeSync(handle);
  }
}

async function main(): Promise<void> {
  const droppedEnvironmentNames = sanitizeCompilerEnvironmentBeforeImportV5();
  assertAndDescribeIsolatedCompilerEnvironmentV5();
  const outputDirectory = exactOutputDirectory();
  const { compileConnectivityPilotExactWireV5 } = await import("./compile-exact-wire.mts");
  const result = await compileConnectivityPilotExactWireV5();
  writeExclusive(path.join(outputDirectory, "exact-wire.private.json"), result.privateBytes);
  writeExclusive(path.join(outputDirectory, "exact-wire.public.json"), result.publicBytes);
  writeExclusive(path.join(outputDirectory, "compiler-closure.json"), result.compilerClosureBytes);
  process.stdout.write(`${JSON.stringify({
    status: "V5_ISOLATED_COMPILER_COMPLETED",
    exactWireRows: 2,
    compilerClosureFiles: result.compilerClosure.files.length,
    externalNetworkCalls: 0,
    providerCalls: 0,
    modelCalls: 0,
    apiCandidatesConsumed: 0,
    realCredentialValuesRead: 0,
    ambientEnvironmentVariablesAccepted: 0,
    ambientEnvironmentVariableNamesDroppedBeforeCompilerImport: droppedEnvironmentNames.length,
  })}\n`);
}

await main();
