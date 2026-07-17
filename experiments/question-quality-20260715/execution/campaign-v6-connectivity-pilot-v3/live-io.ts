import {
  closeSync,
  fsyncSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const livePackageRootV3 = path.dirname(fileURLToPath(import.meta.url));
export const liveRepoRootV3 = path.resolve(livePackageRootV3, "../../../..");
export const livePrivateRootV3 = path.join(livePackageRootV3, "private");

function resolveRepoPath(relativePath: string): string {
  const absolute = path.resolve(liveRepoRootV3, relativePath);
  const relative = path.relative(liveRepoRootV3, absolute);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("runtime repository path escaped or was empty");
  }
  return absolute;
}

export function readImmutableRepoBytesV3(relativePath: string): Buffer {
  return readFileSync(resolveRepoPath(relativePath));
}

export function readImmutableRepoJsonV3(relativePath: string): unknown {
  return JSON.parse(readImmutableRepoBytesV3(relativePath).toString("utf8")) as unknown;
}

export function readPrivateAttestedJsonV3(filePath: string): unknown {
  const absolute = path.resolve(filePath);
  const relative = path.relative(livePrivateRootV3, absolute);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative) || path.extname(absolute) !== ".json") {
    throw new Error("attested private input must be a JSON file under the v3 private root");
  }
  return JSON.parse(readFileSync(absolute, "utf8")) as unknown;
}

export function withExclusiveRepoJsonTransactionV3<T>(input: {
  relativePath: string;
  lockSuffix: string;
  mutate: (current: unknown) => { next: unknown; value: T };
}): T {
  const target = resolveRepoPath(input.relativePath);
  const lockPath = `${target}.${input.lockSuffix}.lock`;
  const lockHandle = openSync(lockPath, "wx", 0o600);
  try {
    const current = JSON.parse(readFileSync(target, "utf8")) as unknown;
    const { next, value } = input.mutate(current);
    const tempPath = `${target}.${input.lockSuffix}.${process.pid}.tmp`;
    const tempHandle = openSync(tempPath, "wx", 0o600);
    try {
      writeFileSync(tempHandle, `${JSON.stringify(next, null, 2)}\n`, "utf8");
      fsyncSync(tempHandle);
    } finally {
      closeSync(tempHandle);
    }
    renameSync(tempPath, target);
    return value;
  } finally {
    closeSync(lockHandle);
    unlinkSync(lockPath);
  }
}
