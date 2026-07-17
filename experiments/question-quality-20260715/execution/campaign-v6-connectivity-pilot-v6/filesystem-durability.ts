import { closeSync, fstatSync, fsyncSync, lstatSync, openSync, realpathSync } from "node:fs";
import path from "node:path";

export type ParentDirectoryDurabilityPhaseV6 = "DIRECTORY_OPEN" | "DIRECTORY_ATTEST" | "DIRECTORY_FSYNC" | "DIRECTORY_CLOSE";

export class ParentDirectoryDurabilityErrorV6 extends Error {
  public readonly code = "PARENT_DIRECTORY_DURABILITY_ERROR_V6" as const;
  public readonly phase: ParentDirectoryDurabilityPhaseV6;
  public readonly durabilityError: unknown;

  public constructor(phase: ParentDirectoryDurabilityPhaseV6, durabilityError: unknown) {
    super(`parent directory durability ${phase.toLowerCase()} phase failed`);
    this.name = "ParentDirectoryDurabilityErrorV6";
    this.phase = phase;
    this.durabilityError = durabilityError;
  }
}

export class UnsupportedParentDirectoryDurabilityPlatformErrorV6 extends Error {
  public readonly code = "UNSUPPORTED_PARENT_DIRECTORY_DURABILITY_PLATFORM_V6" as const;
  public readonly platform: NodeJS.Platform;
  public readonly mutationAttempted = false as const;
  public readonly liveExecutionAllowed = false as const;

  public constructor(platform: NodeJS.Platform) {
    super(`parent directory durability is unavailable on platform ${platform}`);
    this.name = "UnsupportedParentDirectoryDurabilityPlatformErrorV6";
    this.platform = platform;
  }
}

export interface ParentDirectoryDurabilityOperationsV6 {
  openDirectory: (directoryPath: string) => number;
  fsyncDirectory: (handle: number) => void;
  closeDirectory: (handle: number) => void;
}

const PRODUCTION_DIRECTORY_OPERATIONS_V6: ParentDirectoryDurabilityOperationsV6 = {
  openDirectory: (directoryPath) => openSync(directoryPath, "r"),
  fsyncDirectory: (handle) => fsyncSync(handle),
  closeDirectory: (handle) => closeSync(handle),
};

export type ParentDirectoryDurabilityStrategyV6 = "POSIX_PARENT_DIRECTORY_FSYNC";

export const AUTHORIZED_PARENT_DIRECTORY_DURABILITY_PLATFORMS_V6: readonly NodeJS.Platform[] = [
  "linux", "darwin", "freebsd", "openbsd", "netbsd", "aix", "sunos",
];

export function assertParentDirectoryDurabilityPlatformSupportedV6(
  platform: NodeJS.Platform = process.platform,
): void {
  if (!AUTHORIZED_PARENT_DIRECTORY_DURABILITY_PLATFORMS_V6.includes(platform)) {
    throw new UnsupportedParentDirectoryDurabilityPlatformErrorV6(platform);
  }
}

function comparable(value: string, platform: NodeJS.Platform): string {
  const resolved = path.resolve(value);
  return platform === "win32" ? resolved.toLowerCase() : resolved;
}

function wrap(
  phase: ParentDirectoryDurabilityPhaseV6,
  error: unknown,
): ParentDirectoryDurabilityErrorV6 {
  return error instanceof ParentDirectoryDurabilityErrorV6
    ? error
    : new ParentDirectoryDurabilityErrorV6(phase, error);
}

function attestParent(input: {
  directoryPath: string;
  expectedDev: bigint;
  expectedIno: bigint;
  platform: NodeJS.Platform;
}): void {
  const stat = lstatSync(input.directoryPath, { bigint: true });
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.dev !== input.expectedDev || stat.ino !== input.expectedIno ||
      comparable(realpathSync.native(input.directoryPath), input.platform) !==
        comparable(input.directoryPath, input.platform)) {
    throw new Error("parent directory identity differs during durability proof");
  }
}

/**
 * POSIX requires fsync(parent) after a create/rename. Node on Windows opens a
 * directory but fsync returns EPERM; target fsync plus path reattestation is
 * not equivalent crash-durability proof, so Windows is rejected before any
 * caller mutation instead of being represented as a successful strategy.
 */
export function persistParentDirectoryEntryV6(input: {
  directoryPath: string;
  expectedDev: bigint;
  expectedIno: bigint;
  platformForOfflineTestOnly?: NodeJS.Platform;
  operationsForOfflineTestOnly?: Partial<ParentDirectoryDurabilityOperationsV6>;
}): ParentDirectoryDurabilityStrategyV6 {
  const platform = input.platformForOfflineTestOnly ?? process.platform;
  assertParentDirectoryDurabilityPlatformSupportedV6(platform);
  try {
    attestParent({ ...input, platform });
  } catch (error) {
    throw wrap("DIRECTORY_ATTEST", error);
  }
  const operations = {
    ...PRODUCTION_DIRECTORY_OPERATIONS_V6,
    ...(input.operationsForOfflineTestOnly ?? {}),
  };
  let handle: number;
  try {
    handle = operations.openDirectory(input.directoryPath);
  } catch (error) {
    throw wrap("DIRECTORY_OPEN", error);
  }
  let primary: ParentDirectoryDurabilityErrorV6 | null = null;
  try {
    try {
      const opened = fstatSync(handle, { bigint: true });
      if (!opened.isDirectory() || opened.dev !== input.expectedDev || opened.ino !== input.expectedIno) {
        throw new Error("opened parent directory identity differs");
      }
    } catch (error) {
      primary = wrap("DIRECTORY_ATTEST", error);
    }
    if (primary === null) {
      try {
        operations.fsyncDirectory(handle);
      } catch (error) {
        primary = wrap("DIRECTORY_FSYNC", error);
      }
    }
  } finally {
    try {
      operations.closeDirectory(handle);
    } catch (error) {
      if (primary === null) primary = wrap("DIRECTORY_CLOSE", error);
      else primary = new ParentDirectoryDurabilityErrorV6(
        primary.phase,
        new AggregateError([primary.durabilityError, error], "parent directory durability and close both failed"),
      );
    }
  }
  if (primary !== null) throw primary;
  try {
    attestParent({ ...input, platform });
  } catch (error) {
    throw wrap("DIRECTORY_ATTEST", error);
  }
  return "POSIX_PARENT_DIRECTORY_FSYNC";
}
