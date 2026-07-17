import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
  realpathSync,
} from "node:fs";
import path from "node:path";

export const ENV_LOCAL_MAX_BYTES_V5 = 4 * 1024 * 1024;

export interface CredentialReadRaceHooksV5 {
  afterOpenBeforeRead?: () => void;
  afterReadBeforePostAttestation?: () => void;
}

interface IdentityV5 {
  dev: bigint;
  ino: bigint;
  size: bigint;
  mtimeNs: bigint;
  ctimeNs: bigint;
}

function comparable(value: string): string {
  const normalized = path.normalize(value);
  return process.platform === "win32" ? normalized.toLocaleLowerCase("en-US") : normalized;
}

function sameNode(left: IdentityV5, right: IdentityV5): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

function sameFileIdentity(left: IdentityV5, right: IdentityV5): boolean {
  return sameNode(left, right) && left.size === right.size &&
    left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs;
}

/**
 * Reads only the repository's direct, real `.env.local` through a descriptor
 * bound after pre-open identity checks. The read is exactly the attested size,
 * requires hard EOF after that size, and repeats descriptor/path/root identity
 * checks after the read. Temporary byte buffers are zeroed on every exit.
 */
export function readDirectRealEnvLocalCredentialTextV5(
  repoRoot: string,
  candidatePath: string,
  raceHooks: CredentialReadRaceHooksV5 = {},
): string {
  const resolvedRoot = path.resolve(repoRoot);
  const expectedPath = path.join(resolvedRoot, ".env.local");
  if (comparable(path.resolve(candidatePath)) !== comparable(expectedPath) ||
      comparable(path.dirname(path.resolve(candidatePath))) !== comparable(resolvedRoot)) {
    throw new Error("credential source must be the repository's direct .env.local child");
  }
  const rootBefore = lstatSync(resolvedRoot, { bigint: true });
  if (!rootBefore.isDirectory() || rootBefore.isSymbolicLink()) {
    throw new Error("credential repository root must be a real directory, not a symlink or junction");
  }
  const realRoot = realpathSync.native(resolvedRoot);
  if (comparable(realRoot) !== comparable(resolvedRoot)) {
    throw new Error("credential repository root traverses a symlink or junction");
  }
  const before = lstatSync(expectedPath, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink() || before.size < BigInt(1) ||
      before.size > BigInt(ENV_LOCAL_MAX_BYTES_V5)) {
    throw new Error("credential source must be a bounded real regular file");
  }
  if (comparable(realpathSync.native(path.dirname(expectedPath))) !== comparable(realRoot) ||
      comparable(realpathSync.native(expectedPath)) !== comparable(expectedPath)) {
    throw new Error("credential source or parent traverses a symlink or junction");
  }

  const noFollow = (constants as typeof constants & { O_NOFOLLOW?: number }).O_NOFOLLOW ?? 0;
  const fd = openSync(expectedPath, constants.O_RDONLY | noFollow);
  const bytes = Buffer.alloc(Number(before.size));
  const extra = Buffer.alloc(1);
  try {
    const opened = fstatSync(fd, { bigint: true });
    const afterOpen = lstatSync(expectedPath, { bigint: true });
    if (!opened.isFile() || !afterOpen.isFile() || afterOpen.isSymbolicLink() ||
        !sameFileIdentity(before, opened) || !sameFileIdentity(opened, afterOpen) ||
        comparable(realpathSync.native(expectedPath)) !== comparable(expectedPath)) {
      throw new Error("credential source changed identity while opening");
    }
    raceHooks.afterOpenBeforeRead?.();

    let offset = 0;
    while (offset < bytes.byteLength) {
      const count = readSync(fd, bytes, offset, bytes.byteLength - offset, null);
      if (count === 0) throw new Error("credential source truncated during bounded read");
      offset += count;
    }
    if (readSync(fd, extra, 0, 1, null) !== 0) {
      throw new Error("credential source grew beyond its attested bounded size");
    }
    raceHooks.afterReadBeforePostAttestation?.();

    const postDescriptor = fstatSync(fd, { bigint: true });
    const postPath = lstatSync(expectedPath, { bigint: true });
    const rootAfter = lstatSync(resolvedRoot, { bigint: true });
    if (!postDescriptor.isFile() || !postPath.isFile() || postPath.isSymbolicLink() ||
        !rootAfter.isDirectory() || rootAfter.isSymbolicLink() || !sameNode(rootBefore, rootAfter) ||
        !sameFileIdentity(opened, postDescriptor) || !sameFileIdentity(postDescriptor, postPath) ||
        comparable(realpathSync.native(resolvedRoot)) !== comparable(realRoot) ||
        comparable(realpathSync.native(path.dirname(expectedPath))) !== comparable(realRoot) ||
        comparable(realpathSync.native(expectedPath)) !== comparable(expectedPath)) {
      throw new Error("credential source changed during bounded read");
    }
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new Error("credential source is not fatal UTF-8");
    }
  } finally {
    bytes.fill(0);
    extra.fill(0);
    closeSync(fd);
  }
}
