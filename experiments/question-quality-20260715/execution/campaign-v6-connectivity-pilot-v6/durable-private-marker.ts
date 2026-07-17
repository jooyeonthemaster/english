import { createHash } from "node:crypto";
import {
  closeSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  openSync,
  readSync,
  realpathSync,
  writeSync,
} from "node:fs";
import type { BigIntStats } from "node:fs";
import path from "node:path";

import {
  assertParentDirectoryDurabilityPlatformSupportedV6,
  persistParentDirectoryEntryV6,
  type ParentDirectoryDurabilityOperationsV6,
  type ParentDirectoryDurabilityStrategyV6,
} from "./filesystem-durability";
import type { JsonObject } from "./protocol-core";

export type DurablePrivateMarkerPhaseV6 =
  "OPEN" | "WRITE" | "FSYNC" | "ATTEST" | "CLOSE" |
  "DIRECTORY_OPEN" | "DIRECTORY_ATTEST" | "DIRECTORY_FSYNC" | "DIRECTORY_CLOSE" | "FINAL_ATTEST";

export class DurablePrivateMarkerPhaseErrorV6 extends Error {
  public readonly code = "DURABLE_PRIVATE_MARKER_PHASE_ERROR_V6" as const;
  public readonly phase: DurablePrivateMarkerPhaseV6;
  public readonly noReplay = true as const;
  public readonly manualInterventionRequired = true as const;
  public readonly persistenceDisposition = "NO_REPLAY_MANUAL_INTERVENTION" as const;
  public readonly persistenceError: unknown;

  public constructor(phase: DurablePrivateMarkerPhaseV6, persistenceError: unknown) {
    super(`exclusive private marker ${phase.toLowerCase()} phase failed`);
    this.name = "DurablePrivateMarkerPhaseErrorV6";
    this.phase = phase;
    this.persistenceError = persistenceError;
  }
}

/**
 * Injectable only for offline fault tests. Production callers omit this field
 * and therefore use Node's real open/write/fsync/read/close primitives.
 */
export interface DurablePrivateMarkerOperationsV6 {
  openExclusive: (filePath: string) => number;
  write: (handle: number, bytes: Uint8Array, offset: number, length: number) => number;
  fsync: (handle: number) => void;
  close: (handle: number) => void;
}

export interface DurablePrivateMarkerRaceHooksV6 {
  afterFileFsyncBeforeIdentityAttestation?: (markerPath: string, directoryPath: string) => void;
  afterFileCloseBeforeDirectoryDurability?: (markerPath: string, directoryPath: string) => void;
  afterDirectoryDurabilityBeforeFinalAttestation?: (markerPath: string, directoryPath: string) => void;
}

const PRODUCTION_OPERATIONS_V6: DurablePrivateMarkerOperationsV6 = {
  openExclusive: (filePath) => openSync(filePath, "wx+", 0o600),
  write: (handle, bytes, offset, length) => writeSync(handle, bytes, offset, length, null),
  fsync: (handle) => fsyncSync(handle),
  close: (handle) => closeSync(handle),
};

export type DurablePrivateMarkerDirectoryStrategyV6 = ParentDirectoryDurabilityStrategyV6;

export interface DurablePrivateMarkerReceiptV6 {
  markerPath: string;
  utf8Bytes: number;
  fileSha256: string;
  directoryDurabilityStrategy: DurablePrivateMarkerDirectoryStrategyV6;
}

interface FileIdentityV6 {
  dev: bigint;
  ino: bigint;
  size: bigint;
  mtimeNs: bigint;
  ctimeNs: bigint;
}

function identity(stat: BigIntStats): FileIdentityV6 {
  return {
    dev: stat.dev,
    ino: stat.ino,
    size: stat.size,
    mtimeNs: stat.mtimeNs,
    ctimeNs: stat.ctimeNs,
  };
}

function sameFile(left: FileIdentityV6, right: FileIdentityV6): boolean {
  return left.dev === right.dev && left.ino === right.ino && left.size === right.size &&
    left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs;
}

function comparable(value: string): string {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function assertRealMarkerDirectoryV6(directoryPath: string): string {
  const absolute = path.resolve(directoryPath);
  const stat = lstatSync(absolute);
  if (!stat.isDirectory() || stat.isSymbolicLink() ||
      comparable(realpathSync.native(absolute)) !== comparable(absolute)) {
    throw new Error("v6 private marker directory must be a direct real directory");
  }
  return absolute;
}

function phaseErrorV6(phase: DurablePrivateMarkerPhaseV6, error: unknown): DurablePrivateMarkerPhaseErrorV6 {
  return error instanceof DurablePrivateMarkerPhaseErrorV6
    ? error
    : new DurablePrivateMarkerPhaseErrorV6(phase, error);
}

function exactDescriptorBytesV6(handle: number, expectedBytes: number): Buffer {
  const observed = Buffer.alloc(expectedBytes);
  const extra = Buffer.alloc(1);
  try {
    let offset = 0;
    while (offset < observed.byteLength) {
      const count = readSync(handle, observed, offset, observed.byteLength - offset, offset);
      if (count === 0) throw new Error("private marker descriptor truncated during exact read");
      offset += count;
    }
    if (readSync(handle, extra, 0, 1, expectedBytes) !== 0) {
      throw new Error("private marker descriptor grew during exact read");
    }
    return observed;
  } finally {
    extra.fill(0);
  }
}

function attestOpenMarkerV6(input: {
  handle: number;
  markerPath: string;
  directory: string;
  parentDev: bigint;
  parentIno: bigint;
  expectedBytes: Buffer;
}): FileIdentityV6 {
  const descriptorBefore = fstatSync(input.handle, { bigint: true });
  const markerPathStat = lstatSync(input.markerPath, { bigint: true });
  const parentStat = lstatSync(input.directory, { bigint: true });
  const descriptorIdentity = identity(descriptorBefore);
  const pathIdentity = identity(markerPathStat);
  if (!descriptorBefore.isFile() || !markerPathStat.isFile() || markerPathStat.isSymbolicLink() ||
      !sameFile(descriptorIdentity, pathIdentity) ||
      descriptorIdentity.size !== BigInt(input.expectedBytes.byteLength) ||
      parentStat.dev !== input.parentDev || parentStat.ino !== input.parentIno ||
      comparable(realpathSync.native(input.markerPath)) !== comparable(input.markerPath) ||
      comparable(realpathSync.native(input.directory)) !== comparable(input.directory)) {
    throw new Error("private marker descriptor, path, or parent identity differs after fsync");
  }
  const observed = exactDescriptorBytesV6(input.handle, input.expectedBytes.byteLength);
  try {
    if (!observed.equals(input.expectedBytes)) throw new Error("private marker descriptor bytes differ after fsync");
  } finally {
    observed.fill(0);
  }
  const descriptorAfter = fstatSync(input.handle, { bigint: true });
  if (!descriptorAfter.isFile() || !sameFile(descriptorIdentity, identity(descriptorAfter))) {
    throw new Error("private marker descriptor identity changed during exact byte attestation");
  }
  return descriptorIdentity;
}

export function writeExclusiveDurablePrivateMarkerV6(input: {
  directory: string;
  name: string;
  value: JsonObject;
  operationsForOfflineTestOnly?: Partial<DurablePrivateMarkerOperationsV6>;
  directoryOperationsForOfflineTestOnly?: Partial<ParentDirectoryDurabilityOperationsV6>;
  raceHooksForOfflineTestOnly?: DurablePrivateMarkerRaceHooksV6;
  platformForOfflineTestOnly?: NodeJS.Platform;
}): DurablePrivateMarkerReceiptV6 {
  if (!/^[a-z0-9][a-z0-9.-]{1,80}\.private\.json$/u.test(input.name)) {
    throw new Error("private marker name is invalid");
  }
  const directory = assertRealMarkerDirectoryV6(input.directory);
  assertParentDirectoryDurabilityPlatformSupportedV6(input.platformForOfflineTestOnly ?? process.platform);
  const markerPath = path.join(directory, input.name);
  if (path.dirname(markerPath) !== directory) throw new Error("private marker escaped its direct parent");
  const parentBefore = lstatSync(directory, { bigint: true });
  const serialized = JSON.stringify(input.value, null, 2);
  if (typeof serialized !== "string") throw new Error("private marker value is not JSON serializable");
  const bytes = Buffer.from(`${serialized}\n`, "utf8");
  if (bytes.byteLength < 3) throw new Error("private marker payload is empty");
  const expectedSha256 = createHash("sha256").update(bytes).digest("hex");

  const operations: DurablePrivateMarkerOperationsV6 = {
    ...PRODUCTION_OPERATIONS_V6,
    ...(input.operationsForOfflineTestOnly ?? {}),
  };
  let handle: number;
  try {
    handle = operations.openExclusive(markerPath);
  } catch (error) {
    bytes.fill(0);
    throw phaseErrorV6("OPEN", error);
  }

  let primaryError: DurablePrivateMarkerPhaseErrorV6 | null = null;
  let attestedIdentity: FileIdentityV6 | null = null;
  try {
    try {
      let offset = 0;
      while (offset < bytes.byteLength) {
        const written = operations.write(handle, bytes, offset, bytes.byteLength - offset);
        if (!Number.isSafeInteger(written) || written < 1 || written > bytes.byteLength - offset) {
          throw new Error("exclusive private marker write returned an invalid byte count");
        }
        offset += written;
      }
    } catch (error) {
      primaryError = phaseErrorV6("WRITE", error);
    }
    if (primaryError === null) {
      try {
        operations.fsync(handle);
      } catch (error) {
        primaryError = phaseErrorV6("FSYNC", error);
      }
    }
    if (primaryError === null) {
      try {
        input.raceHooksForOfflineTestOnly?.afterFileFsyncBeforeIdentityAttestation?.(markerPath, directory);
        attestedIdentity = attestOpenMarkerV6({
          handle,
          markerPath,
          directory,
          parentDev: parentBefore.dev,
          parentIno: parentBefore.ino,
          expectedBytes: bytes,
        });
      } catch (error) {
        primaryError = phaseErrorV6("ATTEST", error);
      }
    }
  } finally {
    try {
      operations.close(handle);
    } catch (error) {
      if (primaryError === null) primaryError = phaseErrorV6("CLOSE", error);
      else primaryError = new DurablePrivateMarkerPhaseErrorV6(
        primaryError.phase,
        new AggregateError([primaryError.persistenceError, error], "private marker primary and close phases failed"),
      );
    }
    bytes.fill(0);
  }
  if (primaryError !== null) throw primaryError;
  if (attestedIdentity === null) throw phaseErrorV6("ATTEST", new Error("private marker attestation was omitted"));

  input.raceHooksForOfflineTestOnly?.afterFileCloseBeforeDirectoryDurability?.(markerPath, directory);
  let directoryDurabilityStrategy: DurablePrivateMarkerDirectoryStrategyV6;
  try {
    directoryDurabilityStrategy = persistParentDirectoryEntryV6({
      directoryPath: directory,
      expectedDev: parentBefore.dev,
      expectedIno: parentBefore.ino,
      platformForOfflineTestOnly: input.platformForOfflineTestOnly,
      operationsForOfflineTestOnly: input.directoryOperationsForOfflineTestOnly,
    });
  } catch (error) {
    const phase = error && typeof error === "object" && "phase" in error
      ? String((error as { phase: unknown }).phase)
      : "DIRECTORY_FSYNC";
    const mapped = phase === "DIRECTORY_OPEN" ? "DIRECTORY_OPEN" :
      phase === "DIRECTORY_ATTEST" ? "DIRECTORY_ATTEST" :
      phase === "DIRECTORY_CLOSE" ? "DIRECTORY_CLOSE" : "DIRECTORY_FSYNC";
    throw phaseErrorV6(mapped, error);
  }
  input.raceHooksForOfflineTestOnly?.afterDirectoryDurabilityBeforeFinalAttestation?.(markerPath, directory);
  try {
    const parentAfter = lstatSync(directory, { bigint: true });
    const markerAfter = lstatSync(markerPath, { bigint: true });
    if (!markerAfter.isFile() || markerAfter.isSymbolicLink() ||
        !sameFile(attestedIdentity, identity(markerAfter)) ||
        parentAfter.dev !== parentBefore.dev || parentAfter.ino !== parentBefore.ino ||
        comparable(realpathSync.native(markerPath)) !== comparable(markerPath) ||
        comparable(realpathSync.native(directory)) !== comparable(directory)) {
      throw new Error("private marker path or parent identity differs after directory durability");
    }
  } catch (error) {
    throw phaseErrorV6("FINAL_ATTEST", error);
  }
  return {
    markerPath,
    utf8Bytes: Number(attestedIdentity.size),
    fileSha256: expectedSha256,
    directoryDurabilityStrategy,
  };
}
