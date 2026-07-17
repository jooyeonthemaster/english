import { existsSync, lstatSync, realpathSync } from "node:fs";
import path from "node:path";
import { assertExactMetadataEnvironmentV6 } from "./live-environment";

export function assertExactMetadataCaptureEnvironmentV6(env: NodeJS.ProcessEnv = process.env): void {
  assertExactMetadataEnvironmentV6(env);
}

function normalized(value: string): string {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

export function parsePriceCaptureCliArgumentsV6(args: readonly string[]): { outputPath: string } {
  if (args.length !== 1 || !args[0]!.startsWith("--output=") ||
      args[0]!.split("--output=").length !== 2) {
    throw new Error("price capture requires exactly one --output=<direct-v6-private-json> argument");
  }
  const outputPath = args[0]!.slice("--output=".length);
  if (!outputPath || outputPath.includes("\0")) throw new Error("price capture output argument is invalid");
  return { outputPath };
}

export function assertCanonicalDirectPrivateOutputV6(rawPath: string, privateRoot: string): string {
  const root = path.resolve(privateRoot);
  if (!existsSync(root) || !lstatSync(root).isDirectory() || lstatSync(root).isSymbolicLink()) {
    throw new Error("v6 private output root must be an existing real directory");
  }
  if (normalized(realpathSync.native(root)) !== normalized(root)) {
    throw new Error("v6 private output root must not traverse a symlink or junction");
  }
  const absolute = path.resolve(rawPath);
  if (normalized(path.dirname(absolute)) !== normalized(root)) {
    throw new Error("price snapshot output must be a direct child of the canonical v6 private directory");
  }
  const name = path.basename(absolute);
  if (!/^[a-z0-9][a-z0-9.-]{1,78}\.json$/u.test(name)) {
    throw new Error("price snapshot output filename is invalid");
  }
  if (existsSync(absolute)) {
    throw new Error("price snapshot output must be a new non-existing file");
  }
  return absolute;
}
