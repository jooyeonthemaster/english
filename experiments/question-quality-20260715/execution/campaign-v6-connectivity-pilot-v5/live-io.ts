import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { METADATA_RESPONSE_BODY_MAX_BYTES_V5 } from "./bounded-response-body";
import { observeDuplicateJsonKeysV5 } from "./strict-json-observer";

const liveModuleDirectoryV5 = path.dirname(fileURLToPath(import.meta.url));
export const livePackageRootV5 = path.basename(liveModuleDirectoryV5) === "frozen-live"
  ? path.dirname(liveModuleDirectoryV5)
  : liveModuleDirectoryV5;
export const liveRepoRootV5 = path.resolve(livePackageRootV5, "../../../..");
export const livePrivateRootV5 = path.join(livePackageRootV5, "private");
export const PRIVATE_PRICE_EVIDENCE_BUNDLE_MAX_BYTES_V5 =
  METADATA_RESPONSE_BODY_MAX_BYTES_V5 * 3 * 6 + 4 * 1024 * 1024;
const IMMUTABLE_REPOSITORY_INPUT_MAX_BYTES_V5 = 4 * 1024 * 1024;
const MUTABLE_LEDGER_INPUT_MAX_BYTES_V5 = 4 * 1024 * 1024;

interface StableFileIdentityV5 {
  dev: bigint;
  ino: bigint;
  size: bigint;
  mtimeNs: bigint;
  ctimeNs: bigint;
}

export interface JsonTransactionTargetAttestationV5 {
  targetPath: string;
  parentPath: string;
  targetIdentity: StableFileIdentityV5;
  parentIdentity: Pick<StableFileIdentityV5, "dev" | "ino">;
}

export interface JsonTransactionRaceHooksV5 {
  afterTargetOpenBeforeRead?: () => void;
  afterReadBeforePostAttestation?: () => void;
  beforeCommitReattestation?: () => void;
}

function sameNodeIdentityV5(
  left: Pick<StableFileIdentityV5, "dev" | "ino">,
  right: Pick<StableFileIdentityV5, "dev" | "ino">,
): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

function sameFileIdentityV5(left: StableFileIdentityV5, right: StableFileIdentityV5): boolean {
  return sameNodeIdentityV5(left, right) && left.size === right.size &&
    left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs;
}

function comparable(value: string): string {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

export function assertRealDirectoryV5(directoryPath: string, label: string): string {
  const absolute = path.resolve(directoryPath);
  if (!existsSync(absolute)) throw new Error(`${label} does not exist`);
  const stat = lstatSync(absolute);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`${label} must be a real directory`);
  if (comparable(realpathSync.native(absolute)) !== comparable(absolute)) {
    throw new Error(`${label} traverses a symlink or junction`);
  }
  return absolute;
}

export function assertRealRegularFileV5(filePath: string, label: string): string {
  const absolute = path.resolve(filePath);
  if (!existsSync(absolute)) throw new Error(`${label} does not exist`);
  const stat = lstatSync(absolute);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${label} must be a real regular file`);
  if (comparable(realpathSync.native(absolute)) !== comparable(absolute)) {
    throw new Error(`${label} traverses a symlink or junction`);
  }
  assertRealDirectoryV5(path.dirname(absolute), `${label} parent`);
  return absolute;
}

export function createExclusivePrivateRunDirectoryV5(runId: string): string {
  const privateRoot = assertRealDirectoryV5(livePrivateRootV5, "v5 private root");
  const runsRoot = path.join(privateRoot, "runs");
  if (!existsSync(runsRoot)) mkdirSync(runsRoot, { recursive: false, mode: 0o700 });
  assertRealDirectoryV5(runsRoot, "v5 private runs root");
  if (comparable(path.dirname(runsRoot)) !== comparable(privateRoot)) {
    throw new Error("v5 private runs root is not a direct child");
  }
  const runRoot = path.join(runsRoot, runId);
  if (existsSync(runRoot)) throw new Error("v5 private run directory already exists");
  mkdirSync(runRoot, { recursive: false, mode: 0o700 });
  assertRealDirectoryV5(runRoot, "v5 private run directory");
  if (comparable(path.dirname(runRoot)) !== comparable(runsRoot)) {
    throw new Error("v5 private run directory is not a direct child");
  }
  return runRoot;
}

function resolveRepoPath(relativePath: string): string {
  assertRealDirectoryV5(liveRepoRootV5, "live repository root");
  const absolute = path.resolve(liveRepoRootV5, relativePath);
  const relative = path.relative(liveRepoRootV5, absolute);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("runtime repository path escaped or was empty");
  }
  return absolute;
}

export function readImmutableRepoBytesV5(relativePath: string): Buffer {
  const canonical = assertRealRegularFileV5(resolveRepoPath(relativePath), "immutable repository input");
  const size = lstatSync(canonical).size;
  if (!Number.isSafeInteger(size) || size < 1 || size > IMMUTABLE_REPOSITORY_INPUT_MAX_BYTES_V5) {
    throw new Error("immutable repository input exceeds its pre-read byte ceiling");
  }
  return readFileSync(canonical);
}

export function readImmutableRepoJsonV5(relativePath: string): unknown {
  return JSON.parse(readImmutableRepoBytesV5(relativePath).toString("utf8")) as unknown;
}

export function assertDirectRealPrivateInputPathV5(
  filePath: string,
  rootPath: string = livePrivateRootV5,
): string {
  const privateRoot = assertRealDirectoryV5(rootPath, "v5 private root");
  const absolute = path.resolve(filePath);
  const relative = path.relative(privateRoot, absolute);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative) || path.extname(absolute) !== ".json" ||
      comparable(path.dirname(absolute)) !== comparable(privateRoot)) {
    throw new Error("attested private input must be a direct-child JSON file under the real v5 private root");
  }
  return assertRealRegularFileV5(absolute, "attested private input");
}

export function readPrivateAttestedJsonV5(filePath: string): unknown {
  return readPrivateAttestedJsonEvidenceV5(filePath).value;
}

export interface PrivateAttestedJsonEvidenceV5 {
  canonicalPath: string;
  fileSha256: string;
  utf8Bytes: number;
  value: unknown;
}

export function readPrivateAttestedJsonEvidenceV5(
  filePath: string,
  raceHooks: Pick<JsonTransactionRaceHooksV5, "afterTargetOpenBeforeRead" | "afterReadBeforePostAttestation"> = {},
): PrivateAttestedJsonEvidenceV5 {
  const canonical = assertDirectRealPrivateInputPathV5(filePath);
  const parent = path.dirname(canonical);
  const before = lstatSync(canonical, { bigint: true });
  const parentBefore = lstatSync(parent, { bigint: true });
  if (before.size < BigInt(1) || before.size > BigInt(PRIVATE_PRICE_EVIDENCE_BUNDLE_MAX_BYTES_V5)) {
    throw new Error("attested private price evidence bundle exceeds its pre-read byte ceiling");
  }
  const noFollow = (constants as typeof constants & { O_NOFOLLOW?: number }).O_NOFOLLOW ?? 0;
  const fd = openSync(canonical, constants.O_RDONLY | noFollow);
  const bytes = Buffer.alloc(Number(before.size));
  const extra = Buffer.alloc(1);
  try {
    const opened = fstatSync(fd, { bigint: true });
    if (!opened.isFile() || !sameFileIdentityV5(before, opened)) {
      throw new Error("attested private price evidence changed while opening");
    }
    raceHooks.afterTargetOpenBeforeRead?.();
    let offset = 0;
    while (offset < bytes.byteLength) {
      const count = readSync(fd, bytes, offset, bytes.byteLength - offset, null);
      if (count === 0) throw new Error("attested private price evidence truncated during bounded read");
      offset += count;
    }
    if (readSync(fd, extra, 0, 1, null) !== 0) {
      throw new Error("attested private price evidence grew during bounded read");
    }
    raceHooks.afterReadBeforePostAttestation?.();
    const postDescriptor = fstatSync(fd, { bigint: true });
    const postPath = lstatSync(canonical, { bigint: true });
    const parentAfter = lstatSync(parent, { bigint: true });
    if (!postDescriptor.isFile() || !postPath.isFile() || postPath.isSymbolicLink() ||
        !sameFileIdentityV5(opened, postDescriptor) || !sameFileIdentityV5(postDescriptor, postPath) ||
        !sameNodeIdentityV5(parentBefore, parentAfter) ||
        comparable(realpathSync.native(parent)) !== comparable(parent) ||
        comparable(realpathSync.native(canonical)) !== comparable(canonical)) {
      throw new Error("attested private price evidence or parent changed during bounded read");
    }
    if (bytes.byteLength >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
      throw new Error("attested private price evidence must not contain a UTF-8 BOM");
    }
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new Error("attested private price evidence is not fatal UTF-8");
    }
    if (text.startsWith("\uFEFF")) throw new Error("attested private price evidence must not contain a UTF-8 BOM");
    let duplicates;
    try {
      duplicates = observeDuplicateJsonKeysV5(text);
    } catch {
      throw new Error("attested private price evidence failed strict JSON observation");
    }
    if (duplicates.length > 0) throw new Error("attested private price evidence contains duplicate JSON keys");
    return {
      canonicalPath: canonical,
      fileSha256: createHash("sha256").update(bytes).digest("hex"),
      utf8Bytes: bytes.byteLength,
      value: JSON.parse(text) as unknown,
    };
  } finally {
    bytes.fill(0);
    extra.fill(0);
    closeSync(fd);
  }
}

export function attestJsonTransactionTargetV5(targetPath: string): JsonTransactionTargetAttestationV5 {
  const target = assertRealRegularFileV5(targetPath, "repository transaction target");
  const parentPath = assertRealDirectoryV5(path.dirname(target), "repository transaction parent");
  const targetStat = lstatSync(target, { bigint: true });
  const parentStat = lstatSync(parentPath, { bigint: true });
  if (targetStat.size < BigInt(1) || targetStat.size > BigInt(MUTABLE_LEDGER_INPUT_MAX_BYTES_V5)) {
    throw new Error("repository transaction target exceeds its pre-read byte ceiling");
  }
  return {
    targetPath: target,
    parentPath,
    targetIdentity: {
      dev: targetStat.dev,
      ino: targetStat.ino,
      size: targetStat.size,
      mtimeNs: targetStat.mtimeNs,
      ctimeNs: targetStat.ctimeNs,
    },
    parentIdentity: { dev: parentStat.dev, ino: parentStat.ino },
  };
}

export function assertJsonTransactionTargetUnchangedV5(
  attestation: JsonTransactionTargetAttestationV5,
): void {
  const current = attestJsonTransactionTargetV5(attestation.targetPath);
  if (comparable(current.targetPath) !== comparable(attestation.targetPath) ||
      comparable(current.parentPath) !== comparable(attestation.parentPath) ||
      !sameFileIdentityV5(current.targetIdentity, attestation.targetIdentity) ||
      !sameNodeIdentityV5(current.parentIdentity, attestation.parentIdentity)) {
    throw new Error("repository transaction target or parent changed identity");
  }
}

export function readStableMutableJsonV5(
  attestation: JsonTransactionTargetAttestationV5,
  hooks: JsonTransactionRaceHooksV5,
): unknown {
  const noFollow = (constants as typeof constants & { O_NOFOLLOW?: number }).O_NOFOLLOW ?? 0;
  const fd = openSync(attestation.targetPath, constants.O_RDONLY | noFollow);
  const expectedSize = Number(attestation.targetIdentity.size);
  const bytes = Buffer.alloc(expectedSize);
  const extra = Buffer.alloc(1);
  try {
    const opened = fstatSync(fd, { bigint: true });
    const openedIdentity: StableFileIdentityV5 = {
      dev: opened.dev,
      ino: opened.ino,
      size: opened.size,
      mtimeNs: opened.mtimeNs,
      ctimeNs: opened.ctimeNs,
    };
    if (!opened.isFile() || !sameFileIdentityV5(openedIdentity, attestation.targetIdentity)) {
      throw new Error("repository transaction target changed while opening");
    }
    hooks.afterTargetOpenBeforeRead?.();
    let offset = 0;
    while (offset < bytes.byteLength) {
      const count = readSync(fd, bytes, offset, bytes.byteLength - offset, null);
      if (count === 0) throw new Error("repository transaction target truncated during read");
      offset += count;
    }
    if (readSync(fd, extra, 0, 1, null) !== 0) {
      throw new Error("repository transaction target grew during read");
    }
    hooks.afterReadBeforePostAttestation?.();
    const post = fstatSync(fd, { bigint: true });
    const postIdentity: StableFileIdentityV5 = {
      dev: post.dev,
      ino: post.ino,
      size: post.size,
      mtimeNs: post.mtimeNs,
      ctimeNs: post.ctimeNs,
    };
    if (!post.isFile() || !sameFileIdentityV5(openedIdentity, postIdentity)) {
      throw new Error("repository transaction target changed during read");
    }
    assertJsonTransactionTargetUnchangedV5(attestation);
    if (bytes.byteLength >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
      throw new Error("repository transaction target must not contain a UTF-8 BOM");
    }
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new Error("repository transaction target is not fatal UTF-8");
    }
    if (text.startsWith("\uFEFF")) throw new Error("repository transaction target must not contain a UTF-8 BOM");
    let duplicates;
    try {
      duplicates = observeDuplicateJsonKeysV5(text);
    } catch {
      throw new Error("repository transaction target failed strict JSON observation");
    }
    if (duplicates.length > 0) throw new Error("repository transaction target contains duplicate JSON keys");
    return JSON.parse(text) as unknown;
  } finally {
    bytes.fill(0);
    extra.fill(0);
    closeSync(fd);
  }
}

export interface RepoJsonTransactionOutcomeV5<T> {
  value: T;
  committed: true;
  cleanupWarningKinds: Array<"LOCK_CLOSE_FAILED_AFTER_COMMIT" | "LOCK_UNLINK_FAILED_AFTER_COMMIT">;
}

export function classifyCommittedTransactionCleanupV5<T>(
  committed: boolean,
  value: T,
  cleanupWarningKinds: RepoJsonTransactionOutcomeV5<T>["cleanupWarningKinds"],
): RepoJsonTransactionOutcomeV5<T> {
  if (!committed) throw new Error("repository transaction was not committed");
  return { value, committed: true, cleanupWarningKinds: [...cleanupWarningKinds] };
}

export function withExclusiveRepoJsonTransactionV5<T>(input: {
  relativePath: string;
  lockSuffix: string;
  mutate: (current: unknown) => { next: unknown; value: T };
  raceHooksForOfflineTestOnly?: JsonTransactionRaceHooksV5;
}): RepoJsonTransactionOutcomeV5<T> {
  const target = resolveRepoPath(input.relativePath);
  const initialAttestation = attestJsonTransactionTargetV5(target);
  const lockPath = `${target}.${input.lockSuffix}.lock`;
  const lockHandle = openSync(lockPath, "wx", 0o600);
  let committed = false;
  let result!: T;
  let primaryError: unknown = null;
  try {
    assertJsonTransactionTargetUnchangedV5(initialAttestation);
    const lockedAttestation = attestJsonTransactionTargetV5(target);
    const current = readStableMutableJsonV5(lockedAttestation, input.raceHooksForOfflineTestOnly ?? {});
    const { next, value } = input.mutate(current);
    const tempPath = `${target}.${input.lockSuffix}.${process.pid}.tmp`;
    const tempHandle = openSync(tempPath, "wx", 0o600);
    try {
      writeFileSync(tempHandle, `${JSON.stringify(next, null, 2)}\n`, "utf8");
      fsyncSync(tempHandle);
    } finally {
      closeSync(tempHandle);
    }
    input.raceHooksForOfflineTestOnly?.beforeCommitReattestation?.();
    assertJsonTransactionTargetUnchangedV5(lockedAttestation);
    assertRealDirectoryV5(path.dirname(target), "repository transaction parent immediately before commit");
    renameSync(tempPath, target);
    committed = true;
    result = value;
  } catch (error) {
    primaryError = error;
  }
  const cleanupWarnings: RepoJsonTransactionOutcomeV5<T>["cleanupWarningKinds"] = [];
  try {
    closeSync(lockHandle);
  } catch (error) {
    if (!committed) primaryError = primaryError === null ? error : new AggregateError([primaryError, error]);
    else cleanupWarnings.push("LOCK_CLOSE_FAILED_AFTER_COMMIT");
  }
  try {
    unlinkSync(lockPath);
  } catch (error) {
    if (!committed) primaryError = primaryError === null ? error : new AggregateError([primaryError, error]);
    else cleanupWarnings.push("LOCK_UNLINK_FAILED_AFTER_COMMIT");
  }
  if (primaryError !== null) throw primaryError;
  return classifyCommittedTransactionCleanupV5(committed, result, cleanupWarnings);
}
