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
import { createHash, randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { METADATA_RESPONSE_BODY_MAX_BYTES_V6 } from "./bounded-response-body";
import {
  assertParentDirectoryDurabilityPlatformSupportedV6,
  persistParentDirectoryEntryV6,
  type ParentDirectoryDurabilityOperationsV6,
} from "./filesystem-durability";
import { observeDuplicateJsonKeysV6 } from "./strict-json-observer";

const liveModuleDirectoryV6 = path.dirname(fileURLToPath(import.meta.url));
export const livePackageRootV6 = path.basename(liveModuleDirectoryV6) === "frozen-live"
  ? path.dirname(liveModuleDirectoryV6)
  : liveModuleDirectoryV6;
export const liveRepoRootV6 = path.resolve(livePackageRootV6, "../../../..");
export const livePrivateRootV6 = path.join(livePackageRootV6, "private");
export const PRIVATE_PRICE_EVIDENCE_BUNDLE_MAX_BYTES_V6 =
  METADATA_RESPONSE_BODY_MAX_BYTES_V6 * 3 * 6 + 4 * 1024 * 1024;
const IMMUTABLE_REPOSITORY_INPUT_MAX_BYTES_V6 = 4 * 1024 * 1024;
const MUTABLE_LEDGER_INPUT_MAX_BYTES_V6 = 4 * 1024 * 1024;

interface StableFileIdentityV6 {
  dev: bigint;
  ino: bigint;
  size: bigint;
  mtimeNs: bigint;
  ctimeNs: bigint;
}

export interface JsonTransactionTargetAttestationV6 {
  targetPath: string;
  parentPath: string;
  targetIdentity: StableFileIdentityV6;
  parentIdentity: Pick<StableFileIdentityV6, "dev" | "ino">;
}

export interface JsonTransactionRaceHooksV6 {
  afterTargetOpenBeforeRead?: () => void;
  afterReadBeforePostAttestation?: () => void;
  beforeCommitReattestation?: (unpredictableTempPath: string) => void;
  afterAtomicRenameBeforeCommitAttestation?: () => void;
}

export interface JsonTransactionOperationsForOfflineTestV6 {
  closeTempHandle?: (handle: number) => void;
  fsyncRenamedTarget?: (handle: number) => void;
  parentDirectoryOperations?: Partial<ParentDirectoryDurabilityOperationsV6>;
  parentDirectoryPlatform?: NodeJS.Platform;
}

export type RepoJsonTransactionCommitUnknownStageV6 =
  "POST_RENAME_ATTESTATION" | "POST_RENAME_DURABILITY";

export class RepoJsonTransactionCommitUnknownErrorV6 extends Error {
  public readonly code = "REPO_JSON_TRANSACTION_COMMIT_UNKNOWN_V6" as const;
  public readonly stage: RepoJsonTransactionCommitUnknownStageV6;
  public readonly transactionMutationState = "ATOMIC_REPLACE_COMPLETED_COMMIT_VERIFICATION_UNKNOWN" as const;
  public readonly noReplay = true as const;
  public readonly retryAllowed = false as const;
  public readonly manualInterventionRequired = true as const;
  public readonly disposition = "NO_REPLAY_MANUAL_RECONCILIATION" as const;
  public readonly transactionError: unknown;

  public constructor(stage: RepoJsonTransactionCommitUnknownStageV6, transactionError: unknown) {
    super("repository JSON atomic replace completed but verified commit state is unknown");
    this.name = "RepoJsonTransactionCommitUnknownErrorV6";
    this.stage = stage;
    this.transactionError = transactionError;
  }
}

export type PrivateRunDirectoryCommitUnknownStageV6 =
  "RUNS_ROOT_ENTRY_DURABILITY" | "RUN_ROOT_ENTRY_DURABILITY";

export class PrivateRunDirectoryCommitUnknownErrorV6 extends Error {
  public readonly code = "PRIVATE_RUN_DIRECTORY_COMMIT_UNKNOWN_V6" as const;
  public readonly stage: PrivateRunDirectoryCommitUnknownStageV6;
  public readonly directoryMutationState = "DIRECTORY_CREATED_ENTRY_DURABILITY_OR_IDENTITY_UNKNOWN" as const;
  public readonly noReplay = true as const;
  public readonly retryAllowed = false as const;
  public readonly manualInterventionRequired = true as const;
  public readonly disposition = "NO_REPLAY_MANUAL_RECONCILIATION" as const;
  public readonly createdPath: string;
  public readonly directoryError: unknown;

  public constructor(
    stage: PrivateRunDirectoryCommitUnknownStageV6,
    createdPath: string,
    directoryError: unknown,
  ) {
    super("private run directory was created but its durable entry or identity is unknown");
    this.name = "PrivateRunDirectoryCommitUnknownErrorV6";
    this.stage = stage;
    this.createdPath = createdPath;
    this.directoryError = directoryError;
  }
}

export interface PrivateRunDirectoryRaceHooksV6 {
  afterRunsRootMkdirBeforeIdentity?: () => void;
  afterRunsRootMkdirBeforePrivateRootDurability?: () => void;
  afterPrivateRootDurabilityBeforeRunsRootReattestation?: () => void;
  afterRunRootMkdirBeforeRunsRootDurability?: () => void;
  afterRunsRootDurabilityBeforeRunRootReattestation?: () => void;
}

export interface PrivateRunDirectoryOperationsForOfflineTestV6 {
  platform?: NodeJS.Platform;
  privateRootDirectoryOperations?: Partial<ParentDirectoryDurabilityOperationsV6>;
  runsRootDirectoryOperations?: Partial<ParentDirectoryDurabilityOperationsV6>;
}

function sameNodeIdentityV6(
  left: Pick<StableFileIdentityV6, "dev" | "ino">,
  right: Pick<StableFileIdentityV6, "dev" | "ino">,
): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

function sameFileIdentityV6(left: StableFileIdentityV6, right: StableFileIdentityV6): boolean {
  return sameNodeIdentityV6(left, right) && left.size === right.size &&
    left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs;
}

function sameContentNodeIdentityV6(left: StableFileIdentityV6, right: StableFileIdentityV6): boolean {
  return sameNodeIdentityV6(left, right) && left.size === right.size && left.mtimeNs === right.mtimeNs;
}

function comparable(value: string): string {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

export function assertRealDirectoryV6(directoryPath: string, label: string): string {
  const absolute = path.resolve(directoryPath);
  if (!existsSync(absolute)) throw new Error(`${label} does not exist`);
  const stat = lstatSync(absolute);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`${label} must be a real directory`);
  if (comparable(realpathSync.native(absolute)) !== comparable(absolute)) {
    throw new Error(`${label} traverses a symlink or junction`);
  }
  return absolute;
}

export function assertRealRegularFileV6(filePath: string, label: string): string {
  const absolute = path.resolve(filePath);
  if (!existsSync(absolute)) throw new Error(`${label} does not exist`);
  const stat = lstatSync(absolute);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${label} must be a real regular file`);
  if (comparable(realpathSync.native(absolute)) !== comparable(absolute)) {
    throw new Error(`${label} traverses a symlink or junction`);
  }
  assertRealDirectoryV6(path.dirname(absolute), `${label} parent`);
  return absolute;
}

interface StableDirectoryIdentityV6 {
  dev: bigint;
  ino: bigint;
}

function directoryIdentityV6(directoryPath: string, label: string): StableDirectoryIdentityV6 {
  const absolute = assertRealDirectoryV6(directoryPath, label);
  const stat = lstatSync(absolute, { bigint: true });
  return { dev: stat.dev, ino: stat.ino };
}

function attestExactDirectoryIdentityV6(input: {
  directoryPath: string;
  expected: StableDirectoryIdentityV6;
  label: string;
  directParentPath?: string;
  directParentExpected?: StableDirectoryIdentityV6;
}): void {
  const absolute = assertRealDirectoryV6(input.directoryPath, input.label);
  const observed = lstatSync(absolute, { bigint: true });
  if (observed.dev !== input.expected.dev || observed.ino !== input.expected.ino) {
    throw new Error(`${input.label} identity changed`);
  }
  if (input.directParentPath !== undefined) {
    const parent = assertRealDirectoryV6(input.directParentPath, `${input.label} direct parent`);
    if (comparable(path.dirname(absolute)) !== comparable(parent)) {
      throw new Error(`${input.label} is not a direct child of its attested parent`);
    }
    if (input.directParentExpected === undefined) {
      throw new Error(`${input.label} direct parent identity is missing`);
    }
    const parentObserved = lstatSync(parent, { bigint: true });
    if (parentObserved.dev !== input.directParentExpected.dev ||
        parentObserved.ino !== input.directParentExpected.ino ||
        observed.dev !== parentObserved.dev) {
      throw new Error(`${input.label} parent identity or device changed`);
    }
  }
}

function validatePrivateRunIdV6(runId: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(runId) || runId === "." || runId === "..") {
    throw new Error("v6 private run id must be one safe path segment");
  }
}

export function createExclusivePrivateRunDirectoryAtRootV6(input: {
  privateRootPath: string;
  runId: string;
  operationsForOfflineTestOnly?: PrivateRunDirectoryOperationsForOfflineTestV6;
  raceHooksForOfflineTestOnly?: PrivateRunDirectoryRaceHooksV6;
}): string {
  validatePrivateRunIdV6(input.runId);
  const platform = input.operationsForOfflineTestOnly?.platform ?? process.platform;
  // This check is intentionally before the first mkdir. Windows directory
  // fsync cannot be represented as a successful live durability boundary.
  assertParentDirectoryDurabilityPlatformSupportedV6(platform);
  const privateRoot = assertRealDirectoryV6(input.privateRootPath, "v6 private root");
  const privateRootIdentity = directoryIdentityV6(privateRoot, "v6 private root identity");
  const runsRoot = path.join(privateRoot, "runs");
  let runsRootCreated = false;
  if (!existsSync(runsRoot)) {
    try {
      mkdirSync(runsRoot, { recursive: false, mode: 0o700 });
      runsRootCreated = true;
    } catch (error) {
      if (existsSync(runsRoot)) {
        throw new PrivateRunDirectoryCommitUnknownErrorV6(
          "RUNS_ROOT_ENTRY_DURABILITY",
          runsRoot,
          error,
        );
      }
      throw error;
    }
  }
  let runsRootIdentity: StableDirectoryIdentityV6;
  try {
    if (runsRootCreated) input.raceHooksForOfflineTestOnly?.afterRunsRootMkdirBeforeIdentity?.();
    runsRootIdentity = directoryIdentityV6(runsRoot, "v6 private runs root");
    attestExactDirectoryIdentityV6({
      directoryPath: privateRoot,
      expected: privateRootIdentity,
      label: "v6 private root before runs-root durability",
    });
    attestExactDirectoryIdentityV6({
      directoryPath: runsRoot,
      expected: runsRootIdentity,
      label: "v6 private runs root before durability",
      directParentPath: privateRoot,
      directParentExpected: privateRootIdentity,
    });
    input.raceHooksForOfflineTestOnly?.afterRunsRootMkdirBeforePrivateRootDurability?.();
    persistParentDirectoryEntryV6({
      directoryPath: privateRoot,
      expectedDev: privateRootIdentity.dev,
      expectedIno: privateRootIdentity.ino,
      platformForOfflineTestOnly: input.operationsForOfflineTestOnly?.platform,
      operationsForOfflineTestOnly: input.operationsForOfflineTestOnly?.privateRootDirectoryOperations,
    });
    input.raceHooksForOfflineTestOnly?.afterPrivateRootDurabilityBeforeRunsRootReattestation?.();
    attestExactDirectoryIdentityV6({
      directoryPath: privateRoot,
      expected: privateRootIdentity,
      label: "v6 private root after runs-root durability",
    });
    attestExactDirectoryIdentityV6({
      directoryPath: runsRoot,
      expected: runsRootIdentity,
      label: "v6 private runs root after durability",
      directParentPath: privateRoot,
      directParentExpected: privateRootIdentity,
    });
  } catch (error) {
    if (runsRootCreated) {
      throw new PrivateRunDirectoryCommitUnknownErrorV6(
        "RUNS_ROOT_ENTRY_DURABILITY",
        runsRoot,
        error,
      );
    }
    throw error;
  }

  const runRoot = path.join(runsRoot, input.runId);
  if (existsSync(runRoot)) throw new Error("v6 private run directory already exists");
  attestExactDirectoryIdentityV6({
    directoryPath: privateRoot,
    expected: privateRootIdentity,
    label: "v6 private root before run-root mkdir",
  });
  attestExactDirectoryIdentityV6({
    directoryPath: runsRoot,
    expected: runsRootIdentity,
    label: "v6 private runs root before run-root mkdir",
    directParentPath: privateRoot,
    directParentExpected: privateRootIdentity,
  });
  try {
    mkdirSync(runRoot, { recursive: false, mode: 0o700 });
  } catch (error) {
    if (existsSync(runRoot)) {
      throw new PrivateRunDirectoryCommitUnknownErrorV6(
        "RUN_ROOT_ENTRY_DURABILITY",
        runRoot,
        error,
      );
    }
    throw error;
  }
  let runRootIdentity: StableDirectoryIdentityV6;
  try {
    runRootIdentity = directoryIdentityV6(runRoot, "v6 private run directory");
    attestExactDirectoryIdentityV6({
      directoryPath: runRoot,
      expected: runRootIdentity,
      label: "v6 private run directory before durability",
      directParentPath: runsRoot,
      directParentExpected: runsRootIdentity,
    });
    input.raceHooksForOfflineTestOnly?.afterRunRootMkdirBeforeRunsRootDurability?.();
    attestExactDirectoryIdentityV6({
      directoryPath: runsRoot,
      expected: runsRootIdentity,
      label: "v6 private runs root at run-root durability",
      directParentPath: privateRoot,
      directParentExpected: privateRootIdentity,
    });
    persistParentDirectoryEntryV6({
      directoryPath: runsRoot,
      expectedDev: runsRootIdentity.dev,
      expectedIno: runsRootIdentity.ino,
      platformForOfflineTestOnly: input.operationsForOfflineTestOnly?.platform,
      operationsForOfflineTestOnly: input.operationsForOfflineTestOnly?.runsRootDirectoryOperations,
    });
    input.raceHooksForOfflineTestOnly?.afterRunsRootDurabilityBeforeRunRootReattestation?.();
    attestExactDirectoryIdentityV6({
      directoryPath: privateRoot,
      expected: privateRootIdentity,
      label: "v6 private root after run-root durability",
    });
    attestExactDirectoryIdentityV6({
      directoryPath: runsRoot,
      expected: runsRootIdentity,
      label: "v6 private runs root after run-root durability",
      directParentPath: privateRoot,
      directParentExpected: privateRootIdentity,
    });
    attestExactDirectoryIdentityV6({
      directoryPath: runRoot,
      expected: runRootIdentity,
      label: "v6 private run directory after durability",
      directParentPath: runsRoot,
      directParentExpected: runsRootIdentity,
    });
  } catch (error) {
    throw new PrivateRunDirectoryCommitUnknownErrorV6(
      "RUN_ROOT_ENTRY_DURABILITY",
      runRoot,
      error,
    );
  }
  return runRoot;
}

export function createExclusivePrivateRunDirectoryV6(runId: string): string {
  return createExclusivePrivateRunDirectoryAtRootV6({
    privateRootPath: livePrivateRootV6,
    runId,
  });
}

function resolveRepoPath(relativePath: string): string {
  assertRealDirectoryV6(liveRepoRootV6, "live repository root");
  const absolute = path.resolve(liveRepoRootV6, relativePath);
  const relative = path.relative(liveRepoRootV6, absolute);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("runtime repository path escaped or was empty");
  }
  return absolute;
}

export function readImmutableRepoBytesV6(relativePath: string): Buffer {
  const canonical = assertRealRegularFileV6(resolveRepoPath(relativePath), "immutable repository input");
  const size = lstatSync(canonical).size;
  if (!Number.isSafeInteger(size) || size < 1 || size > IMMUTABLE_REPOSITORY_INPUT_MAX_BYTES_V6) {
    throw new Error("immutable repository input exceeds its pre-read byte ceiling");
  }
  return readFileSync(canonical);
}

export function readImmutableRepoJsonV6(relativePath: string): unknown {
  return JSON.parse(readImmutableRepoBytesV6(relativePath).toString("utf8")) as unknown;
}

export function assertDirectRealPrivateInputPathV6(
  filePath: string,
  rootPath: string = livePrivateRootV6,
): string {
  const privateRoot = assertRealDirectoryV6(rootPath, "v6 private root");
  const absolute = path.resolve(filePath);
  const relative = path.relative(privateRoot, absolute);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative) || path.extname(absolute) !== ".json" ||
      comparable(path.dirname(absolute)) !== comparable(privateRoot)) {
    throw new Error("attested private input must be a direct-child JSON file under the real v6 private root");
  }
  return assertRealRegularFileV6(absolute, "attested private input");
}

export function readPrivateAttestedJsonV6(filePath: string): unknown {
  return readPrivateAttestedJsonEvidenceV6(filePath).value;
}

export interface PrivateAttestedJsonEvidenceV6 {
  canonicalPath: string;
  fileSha256: string;
  utf8Bytes: number;
  value: unknown;
}

export function readPrivateAttestedJsonEvidenceV6(
  filePath: string,
  raceHooks: Pick<JsonTransactionRaceHooksV6, "afterTargetOpenBeforeRead" | "afterReadBeforePostAttestation"> = {},
): PrivateAttestedJsonEvidenceV6 {
  const canonical = assertDirectRealPrivateInputPathV6(filePath);
  const parent = path.dirname(canonical);
  const before = lstatSync(canonical, { bigint: true });
  const parentBefore = lstatSync(parent, { bigint: true });
  if (before.size < BigInt(1) || before.size > BigInt(PRIVATE_PRICE_EVIDENCE_BUNDLE_MAX_BYTES_V6)) {
    throw new Error("attested private price evidence bundle exceeds its pre-read byte ceiling");
  }
  const noFollow = (constants as typeof constants & { O_NOFOLLOW?: number }).O_NOFOLLOW ?? 0;
  const fd = openSync(canonical, constants.O_RDONLY | noFollow);
  const bytes = Buffer.alloc(Number(before.size));
  const extra = Buffer.alloc(1);
  try {
    const opened = fstatSync(fd, { bigint: true });
    if (!opened.isFile() || !sameFileIdentityV6(before, opened)) {
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
        !sameFileIdentityV6(opened, postDescriptor) || !sameFileIdentityV6(postDescriptor, postPath) ||
        !sameNodeIdentityV6(parentBefore, parentAfter) ||
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
      duplicates = observeDuplicateJsonKeysV6(text);
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

export function attestJsonTransactionTargetV6(targetPath: string): JsonTransactionTargetAttestationV6 {
  const target = assertRealRegularFileV6(targetPath, "repository transaction target");
  const parentPath = assertRealDirectoryV6(path.dirname(target), "repository transaction parent");
  const targetStat = lstatSync(target, { bigint: true });
  const parentStat = lstatSync(parentPath, { bigint: true });
  if (targetStat.size < BigInt(1) || targetStat.size > BigInt(MUTABLE_LEDGER_INPUT_MAX_BYTES_V6)) {
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

export function assertJsonTransactionTargetUnchangedV6(
  attestation: JsonTransactionTargetAttestationV6,
): void {
  const current = attestJsonTransactionTargetV6(attestation.targetPath);
  if (comparable(current.targetPath) !== comparable(attestation.targetPath) ||
      comparable(current.parentPath) !== comparable(attestation.parentPath) ||
      !sameFileIdentityV6(current.targetIdentity, attestation.targetIdentity) ||
      !sameNodeIdentityV6(current.parentIdentity, attestation.parentIdentity)) {
    throw new Error("repository transaction target or parent changed identity");
  }
}

export function readStableMutableJsonV6(
  attestation: JsonTransactionTargetAttestationV6,
  hooks: JsonTransactionRaceHooksV6,
): unknown {
  const noFollow = (constants as typeof constants & { O_NOFOLLOW?: number }).O_NOFOLLOW ?? 0;
  const fd = openSync(attestation.targetPath, constants.O_RDONLY | noFollow);
  const expectedSize = Number(attestation.targetIdentity.size);
  const bytes = Buffer.alloc(expectedSize);
  const extra = Buffer.alloc(1);
  try {
    const opened = fstatSync(fd, { bigint: true });
    const openedIdentity: StableFileIdentityV6 = {
      dev: opened.dev,
      ino: opened.ino,
      size: opened.size,
      mtimeNs: opened.mtimeNs,
      ctimeNs: opened.ctimeNs,
    };
    if (!opened.isFile() || !sameFileIdentityV6(openedIdentity, attestation.targetIdentity)) {
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
    const postIdentity: StableFileIdentityV6 = {
      dev: post.dev,
      ino: post.ino,
      size: post.size,
      mtimeNs: post.mtimeNs,
      ctimeNs: post.ctimeNs,
    };
    if (!post.isFile() || !sameFileIdentityV6(openedIdentity, postIdentity)) {
      throw new Error("repository transaction target changed during read");
    }
    assertJsonTransactionTargetUnchangedV6(attestation);
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
      duplicates = observeDuplicateJsonKeysV6(text);
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

export interface RepoJsonTransactionOutcomeV6<T> {
  value: T;
  committed: true;
  cleanupWarningKinds: Array<
    "TEMP_CLOSE_FAILED_AFTER_COMMIT" |
    "LOCK_CLOSE_FAILED_AFTER_COMMIT" |
    "LOCK_UNLINK_FAILED_AFTER_COMMIT"
  >;
}

export function classifyCommittedTransactionCleanupV6<T>(
  committed: boolean,
  value: T,
  cleanupWarningKinds: RepoJsonTransactionOutcomeV6<T>["cleanupWarningKinds"],
): RepoJsonTransactionOutcomeV6<T> {
  if (!committed) throw new Error("repository transaction was not committed");
  return { value, committed: true, cleanupWarningKinds: [...cleanupWarningKinds] };
}

interface TransactionTempAttestationV6 {
  tempPath: string;
  parentPath: string;
  parentIdentity: Pick<StableFileIdentityV6, "dev" | "ino">;
  fileIdentity: StableFileIdentityV6;
  utf8Bytes: number;
  fileSha256: string;
}

function exclusiveUnpredictableTransactionTempV6(target: string, lockSuffix: string): {
  tempPath: string;
  handle: number;
} {
  const parent = path.dirname(target);
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const nonce = randomBytes(24).toString("hex");
    const tempPath = path.join(parent, `.${path.basename(target)}.${lockSuffix}.${nonce}.tmp`);
    try {
      return { tempPath, handle: openSync(tempPath, "wx+", 0o600) };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  }
  throw new Error("failed to allocate an unpredictable exclusive transaction temp file");
}

function exactDescriptorBytesV6(handle: number, expectedBytes: number, label: string): Buffer {
  const bytes = Buffer.alloc(expectedBytes);
  const extra = Buffer.alloc(1);
  try {
    let offset = 0;
    while (offset < bytes.byteLength) {
      const count = readSync(handle, bytes, offset, bytes.byteLength - offset, offset);
      if (count === 0) throw new Error(`${label} truncated during exact read`);
      offset += count;
    }
    if (readSync(handle, extra, 0, 1, expectedBytes) !== 0) {
      throw new Error(`${label} grew during exact read`);
    }
    return bytes;
  } finally {
    extra.fill(0);
  }
}

function attestWrittenTransactionTempV6(input: {
  tempPath: string;
  handle: number;
  expectedBytes: Buffer;
  parentPath: string;
  parentIdentity: Pick<StableFileIdentityV6, "dev" | "ino">;
}): TransactionTempAttestationV6 {
  const descriptor = fstatSync(input.handle, { bigint: true });
  const pathStat = lstatSync(input.tempPath, { bigint: true });
  const parentStat = lstatSync(input.parentPath, { bigint: true });
  if (!descriptor.isFile() || !pathStat.isFile() || pathStat.isSymbolicLink() ||
      !sameFileIdentityV6(descriptor, pathStat) ||
      !sameNodeIdentityV6(input.parentIdentity, parentStat) ||
      comparable(realpathSync.native(input.tempPath)) !== comparable(input.tempPath) ||
      comparable(realpathSync.native(input.parentPath)) !== comparable(input.parentPath)) {
    throw new Error("transaction temp file or parent changed during write");
  }
  const observed = exactDescriptorBytesV6(input.handle, input.expectedBytes.byteLength, "transaction temp file");
  try {
    if (!observed.equals(input.expectedBytes)) throw new Error("transaction temp bytes differ after durable write");
    return {
      tempPath: input.tempPath,
      parentPath: input.parentPath,
      parentIdentity: input.parentIdentity,
      fileIdentity: descriptor,
      utf8Bytes: observed.byteLength,
      fileSha256: createHash("sha256").update(observed).digest("hex"),
    };
  } finally {
    observed.fill(0);
  }
}

function assertTransactionTempUnchangedV6(attestation: TransactionTempAttestationV6, handle: number): void {
  const parent = assertRealDirectoryV6(attestation.parentPath, "transaction temp parent immediately before commit");
  const parentStat = lstatSync(parent, { bigint: true });
  if (!sameNodeIdentityV6(attestation.parentIdentity, parentStat)) {
    throw new Error("transaction temp parent changed before commit");
  }
  const canonical = assertRealRegularFileV6(attestation.tempPath, "transaction temp immediately before commit");
  if (comparable(path.dirname(canonical)) !== comparable(parent)) {
    throw new Error("transaction temp escaped its attested direct parent");
  }
  const opened = fstatSync(handle, { bigint: true });
  const pathStat = lstatSync(canonical, { bigint: true });
  if (!opened.isFile() || !pathStat.isFile() || pathStat.isSymbolicLink() ||
      !sameFileIdentityV6(attestation.fileIdentity, opened) ||
      !sameFileIdentityV6(opened, pathStat)) {
    throw new Error("transaction temp identity changed before commit");
  }
  const bytes = exactDescriptorBytesV6(handle, attestation.utf8Bytes, "transaction temp before commit");
  try {
    if (createHash("sha256").update(bytes).digest("hex") !== attestation.fileSha256) {
      throw new Error("transaction temp hash changed before commit");
    }
  } finally {
    bytes.fill(0);
  }
  const post = fstatSync(handle, { bigint: true });
  if (!sameFileIdentityV6(opened, post)) throw new Error("transaction temp changed during commit attestation");
}

function assertCommittedTargetMatchesTempV6(
  target: string,
  attestation: TransactionTempAttestationV6,
  handle: number,
): void {
  if (existsSync(attestation.tempPath)) throw new Error("transaction temp path survived atomic replace");
  const committedPath = assertRealRegularFileV6(target, "committed transaction target");
  const committedPathStat = lstatSync(committedPath, { bigint: true });
  const committedDescriptor = fstatSync(handle, { bigint: true });
  const parentStat = lstatSync(attestation.parentPath, { bigint: true });
  if (!sameNodeIdentityV6(parentStat, attestation.parentIdentity) ||
      !sameFileIdentityV6(committedPathStat, committedDescriptor) ||
      !sameContentNodeIdentityV6(committedDescriptor, attestation.fileIdentity)) {
    throw new Error("committed transaction target does not match the attested temp identity");
  }
  const bytes = exactDescriptorBytesV6(handle, attestation.utf8Bytes, "committed transaction target");
  try {
    if (createHash("sha256").update(bytes).digest("hex") !== attestation.fileSha256) {
      throw new Error("committed transaction target hash differs from the attested temp");
    }
  } finally {
    bytes.fill(0);
  }
  const postDescriptor = fstatSync(handle, { bigint: true });
  const postPath = lstatSync(committedPath, { bigint: true });
  if (!sameFileIdentityV6(committedDescriptor, postDescriptor) ||
      !sameFileIdentityV6(postDescriptor, postPath)) {
    throw new Error("committed transaction target changed during post-commit attestation");
  }
}

export function withExclusiveRepoJsonTransactionV6<T>(input: {
  relativePath: string;
  lockSuffix: string;
  mutate: (current: unknown) => { next: unknown; value: T };
  raceHooksForOfflineTestOnly?: JsonTransactionRaceHooksV6;
  operationsForOfflineTestOnly?: JsonTransactionOperationsForOfflineTestV6;
}): RepoJsonTransactionOutcomeV6<T> {
  assertParentDirectoryDurabilityPlatformSupportedV6(
    input.operationsForOfflineTestOnly?.parentDirectoryPlatform ?? process.platform,
  );
  const target = resolveRepoPath(input.relativePath);
  const initialAttestation = attestJsonTransactionTargetV6(target);
  const lockPath = `${target}.${input.lockSuffix}.lock`;
  const lockHandle = openSync(lockPath, "wx", 0o600);
  let renameCompleted = false;
  let commitVerified = false;
  let commitUnknownStage: RepoJsonTransactionCommitUnknownStageV6 = "POST_RENAME_ATTESTATION";
  let result!: T;
  let primaryError: unknown = null;
  let tempPath: string | null = null;
  let tempCloseFailedAfterCommit = false;
  try {
    assertJsonTransactionTargetUnchangedV6(initialAttestation);
    const lockedAttestation = attestJsonTransactionTargetV6(target);
    const current = readStableMutableJsonV6(lockedAttestation, input.raceHooksForOfflineTestOnly ?? {});
    const { next, value } = input.mutate(current);
    const parentStat = lstatSync(lockedAttestation.parentPath, { bigint: true });
    const nextBytes = Buffer.from(`${JSON.stringify(next, null, 2)}\n`, "utf8");
    const allocated = exclusiveUnpredictableTransactionTempV6(target, input.lockSuffix);
    tempPath = allocated.tempPath;
    const tempHandle = allocated.handle;
    let tempPrimaryError: unknown = null;
    try {
      writeFileSync(tempHandle, nextBytes);
      fsyncSync(tempHandle);
      const tempAttestation = attestWrittenTransactionTempV6({
        tempPath,
        handle: tempHandle,
        expectedBytes: nextBytes,
        parentPath: lockedAttestation.parentPath,
        parentIdentity: { dev: parentStat.dev, ino: parentStat.ino },
      });
      input.raceHooksForOfflineTestOnly?.beforeCommitReattestation?.(tempPath);
      assertJsonTransactionTargetUnchangedV6(lockedAttestation);
      assertTransactionTempUnchangedV6(tempAttestation, tempHandle);
      assertRealDirectoryV6(path.dirname(target), "repository transaction parent immediately before commit");
      renameSync(tempPath, target);
      renameCompleted = true;
      tempPath = null;
      input.raceHooksForOfflineTestOnly?.afterAtomicRenameBeforeCommitAttestation?.();
      assertCommittedTargetMatchesTempV6(target, tempAttestation, tempHandle);
      commitUnknownStage = "POST_RENAME_DURABILITY";
      (input.operationsForOfflineTestOnly?.fsyncRenamedTarget ?? fsyncSync)(tempHandle);
      persistParentDirectoryEntryV6({
        directoryPath: lockedAttestation.parentPath,
        expectedDev: tempAttestation.parentIdentity.dev,
        expectedIno: tempAttestation.parentIdentity.ino,
        platformForOfflineTestOnly: input.operationsForOfflineTestOnly?.parentDirectoryPlatform,
        operationsForOfflineTestOnly: input.operationsForOfflineTestOnly?.parentDirectoryOperations,
      });
      assertCommittedTargetMatchesTempV6(target, tempAttestation, tempHandle);
      commitVerified = true;
      result = value;
    } catch (error) {
      tempPrimaryError = error;
    } finally {
      nextBytes.fill(0);
      try {
        (input.operationsForOfflineTestOnly?.closeTempHandle ?? closeSync)(tempHandle);
      } catch (error) {
        if (commitVerified) {
          tempCloseFailedAfterCommit = true;
        } else if (renameCompleted) {
          tempPrimaryError = tempPrimaryError === null
            ? error
            : new AggregateError([tempPrimaryError, error], "post-rename attestation and close both failed");
        } else if (tempPrimaryError === null) {
          tempPrimaryError = error;
        } else {
          tempPrimaryError = new AggregateError([tempPrimaryError, error], "transaction and temp close both failed");
        }
      }
    }
    if (tempPrimaryError !== null) throw tempPrimaryError;
  } catch (error) {
    primaryError = error;
  }
  if (!renameCompleted && tempPath !== null && existsSync(tempPath)) {
    try {
      unlinkSync(tempPath);
    } catch (error) {
      primaryError = primaryError === null ? error : new AggregateError([primaryError, error]);
    }
  }
  const cleanupWarnings: RepoJsonTransactionOutcomeV6<T>["cleanupWarningKinds"] = [];
  if (tempCloseFailedAfterCommit) cleanupWarnings.push("TEMP_CLOSE_FAILED_AFTER_COMMIT");
  try {
    closeSync(lockHandle);
  } catch (error) {
    if (!commitVerified) primaryError = primaryError === null ? error : new AggregateError([primaryError, error]);
    else cleanupWarnings.push("LOCK_CLOSE_FAILED_AFTER_COMMIT");
  }
  try {
    unlinkSync(lockPath);
  } catch (error) {
    if (!commitVerified) primaryError = primaryError === null ? error : new AggregateError([primaryError, error]);
    else cleanupWarnings.push("LOCK_UNLINK_FAILED_AFTER_COMMIT");
  }
  if (primaryError !== null) {
    if (renameCompleted && !commitVerified) {
      throw new RepoJsonTransactionCommitUnknownErrorV6(commitUnknownStage, primaryError);
    }
    throw primaryError;
  }
  return classifyCommittedTransactionCleanupV6(commitVerified, result, cleanupWarnings);
}
