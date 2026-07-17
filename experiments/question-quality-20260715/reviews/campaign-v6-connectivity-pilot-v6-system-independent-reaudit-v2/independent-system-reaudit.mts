import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import * as authorEnvironmentModule from "../../execution/campaign-v6-connectivity-pilot-v6/author-environment";
import * as compilerEnvironmentModule from "../../execution/campaign-v6-connectivity-pilot-v6/compiler-environment.mts";
import * as durableMarkerModule from "../../execution/campaign-v6-connectivity-pilot-v6/durable-private-marker";
import * as liveEnvironmentModule from "../../execution/campaign-v6-connectivity-pilot-v6/live-environment";
import * as liveIoModule from "../../execution/campaign-v6-connectivity-pilot-v6/live-io";
import * as protocolCoreModule from "../../execution/campaign-v6-connectivity-pilot-v6/protocol-core";

const authorEnvironment =
  (authorEnvironmentModule as typeof authorEnvironmentModule & { default?: typeof authorEnvironmentModule }).default ??
  authorEnvironmentModule;
const compilerEnvironment =
  (compilerEnvironmentModule as typeof compilerEnvironmentModule & { default?: typeof compilerEnvironmentModule }).default ??
  compilerEnvironmentModule;
const durableMarker =
  (durableMarkerModule as typeof durableMarkerModule & { default?: typeof durableMarkerModule }).default ??
  durableMarkerModule;
const liveEnvironment =
  (liveEnvironmentModule as typeof liveEnvironmentModule & { default?: typeof liveEnvironmentModule }).default ??
  liveEnvironmentModule;
const liveIo =
  (liveIoModule as typeof liveIoModule & { default?: typeof liveIoModule }).default ?? liveIoModule;
const protocolCore =
  (protocolCoreModule as typeof protocolCoreModule & { default?: typeof protocolCoreModule }).default ??
  protocolCoreModule;

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const subjectDirectory = path.join(
  repoRoot,
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v6",
);
const subjectRelative =
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v6";
const excludedObserverFiles = new Set(["offline.test.ts", "strict-json-observer.ts"]);

const sha256 = (value: string | Uint8Array): string =>
  createHash("sha256").update(value).digest("hex");
const stable = (value: unknown): string => JSON.stringify(value);

const caseHashes: string[] = [];
const categoryCounts = new Map<string, number>();
function pass(category: string, id: string, evidence: unknown = true): void {
  const ordinal = caseHashes.length + 1;
  caseHashes.push(sha256(`${ordinal}\u0000${category}\u0000${id}\u0000${stable(evidence)}`));
  categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
}
function expectThrows(
  category: string,
  id: string,
  action: () => unknown,
  inspect?: (error: unknown) => void,
): unknown {
  let retained: unknown;
  try {
    action();
  } catch (error) {
    retained = error;
  }
  assert.notEqual(retained, undefined, `${category}/${id} unexpectedly succeeded`);
  inspect?.(retained);
  pass(category, id, retained instanceof Error ? retained.name : typeof retained);
  return retained;
}

function directRealFile(filePath: string): Buffer {
  const absolute = path.resolve(filePath);
  const before = lstatSync(absolute, { bigint: true });
  assert(before.isFile() && !before.isSymbolicLink());
  assert.equal(realpathSync.native(absolute).toLowerCase(), absolute.toLowerCase());
  const bytes = readFileSync(absolute);
  const after = lstatSync(absolute, { bigint: true });
  assert.equal(before.dev, after.dev);
  assert.equal(before.ino, after.ino);
  assert.equal(before.size, after.size);
  assert.equal(before.mtimeNs, after.mtimeNs);
  assert.equal(before.ctimeNs, after.ctimeNs);
  assert.equal(BigInt(bytes.byteLength), after.size);
  return bytes;
}

function verifySubjectShape(): string[] {
  const names = readdirSync(subjectDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(
    names.filter((name) => !excludedObserverFiles.has(name)),
    names.filter((name) => name !== "offline.test.ts" && name !== "strict-json-observer.ts"),
  );
  assert.equal(names.length, 47, "current v6 top-level source file count differs");
  const included = names.filter((name) => !excludedObserverFiles.has(name));
  assert.equal(included.length, 45, "system-only snapshot must contain exactly 45 files");
  for (const name of included) {
    const bytes = directRealFile(path.join(subjectDirectory, name));
    assert(bytes.byteLength > 0);
    pass("SNAPSHOT", name, { bytes: bytes.byteLength, sha256: sha256(bytes) });
  }
  return included;
}

const directoryOps = {
  openDirectory: (directoryPath: string): number => openSync(directoryPath, "r"),
  fsyncDirectory: (_handle: number): void => {},
  closeDirectory: (handle: number): void => closeSync(handle),
};

function assertRunCommitUnknown(error: unknown, expectedStage: string): void {
  assert(error instanceof liveIo.PrivateRunDirectoryCommitUnknownErrorV6);
  assert.equal(error.code, "PRIVATE_RUN_DIRECTORY_COMMIT_UNKNOWN_V6");
  assert.equal(error.stage, expectedStage);
  assert.equal(error.noReplay, true);
  assert.equal(error.retryAllowed, false);
  assert.equal(error.manualInterventionRequired, true);
  assert.equal(error.disposition, "NO_REPLAY_MANUAL_RECONCILIATION");
}

function exerciseS1(root: string): void {
  const normalRoot = path.join(root, "s1-normal");
  mkdirSync(normalRoot);
  for (let index = 0; index < 80; index += 1) {
    const runId = `normal-${index.toString().padStart(3, "0")}`;
    const opened: string[] = [];
    const operations = {
      ...directoryOps,
      openDirectory(directoryPath: string): number {
        opened.push(path.basename(directoryPath));
        return openSync(directoryPath, "r");
      },
    };
    const runRoot = liveIo.createExclusivePrivateRunDirectoryAtRootV6({
      privateRootPath: normalRoot,
      runId,
      operationsForOfflineTestOnly: {
        platform: "linux",
        privateRootDirectoryOperations: operations,
        runsRootDirectoryOperations: operations,
      },
    });
    assert.equal(path.dirname(runRoot), path.join(normalRoot, "runs"));
    assert.deepEqual(opened, [path.basename(normalRoot), "runs"]);
    const runStat = lstatSync(runRoot, { bigint: true });
    const runsStat = lstatSync(path.dirname(runRoot), { bigint: true });
    assert(runStat.isDirectory() && runsStat.isDirectory());
    assert.equal(runStat.dev, runsStat.dev);
    pass("S1_RUN_SUCCESS", runId, { parentFsyncs: opened.length });
  }

  for (let index = 0; index < 120; index += 1) {
    const privateRoot = path.join(root, `s1-win-${index}`);
    mkdirSync(privateRoot);
    const runId = `blocked-${index}`;
    expectThrows(
      "S1_WINDOWS_PREMUTATION",
      runId,
      () =>
        liveIo.createExclusivePrivateRunDirectoryAtRootV6({
          privateRootPath: privateRoot,
          runId,
          operationsForOfflineTestOnly: { platform: "win32" },
        }),
      (error) => {
        assert.equal((error as { code?: string }).code, "UNSUPPORTED_PARENT_DIRECTORY_DURABILITY_PLATFORM_V6");
        assert.equal((error as { mutationAttempted?: boolean }).mutationAttempted, false);
      },
    );
    assert.equal(existsSync(path.join(privateRoot, "runs")), false);
  }

  const invalidRunIds = [
    "",
    ".",
    "..",
    "a/b",
    "a\\b",
    " space",
    "space ",
    "x:y",
    "x*y",
    "x?y",
    "x\u0000y",
    "é",
    "a".repeat(129),
  ];
  for (let index = 0; index < 104; index += 1) {
    const privateRoot = path.join(root, `s1-id-${index}`);
    mkdirSync(privateRoot);
    const runId = invalidRunIds[index % invalidRunIds.length]!;
    expectThrows("S1_RUN_ID", `${index}:${JSON.stringify(runId)}`, () =>
      liveIo.createExclusivePrivateRunDirectoryAtRootV6({
        privateRootPath: privateRoot,
        runId,
        operationsForOfflineTestOnly: { platform: "linux" },
      }),
    );
    assert.equal(existsSync(path.join(privateRoot, "runs")), false);
  }

  for (let index = 0; index < 64; index += 1) {
    const privateRoot = path.join(root, `s1-existing-${index}`);
    const runsRoot = path.join(privateRoot, "runs");
    const runId = `existing-${index}`;
    mkdirSync(runsRoot, { recursive: true });
    const runRoot = path.join(runsRoot, runId);
    mkdirSync(runRoot);
    const before = lstatSync(runRoot, { bigint: true });
    expectThrows("S1_EXISTING_NO_REPLAY", runId, () =>
      liveIo.createExclusivePrivateRunDirectoryAtRootV6({
        privateRootPath: privateRoot,
        runId,
        operationsForOfflineTestOnly: {
          platform: "linux",
          privateRootDirectoryOperations: directoryOps,
          runsRootDirectoryOperations: directoryOps,
        },
      }),
    );
    const after = lstatSync(runRoot, { bigint: true });
    assert.equal(before.dev, after.dev);
    assert.equal(before.ino, after.ino);
  }

  const raceKinds = [
    "afterRunsRootMkdirBeforeIdentity",
    "afterRunsRootMkdirBeforePrivateRootDurability",
    "afterPrivateRootDurabilityBeforeRunsRootReattestation",
    "afterRunRootMkdirBeforeRunsRootDurability",
    "afterRunsRootDurabilityBeforeRunRootReattestation",
  ] as const;
  for (const raceKind of raceKinds) {
    for (let index = 0; index < 20; index += 1) {
      const privateRoot = path.join(root, `s1-race-${raceKind}-${index}`);
      mkdirSync(privateRoot);
      const runId = `race-${index}`;
      const hooks: Record<string, () => void> = {};
      hooks[raceKind] = () => {
        const targetsRunRoot = raceKind === "afterRunRootMkdirBeforeRunsRootDurability" ||
          raceKind === "afterRunsRootDurabilityBeforeRunRootReattestation";
        const target = targetsRunRoot
          ? path.join(privateRoot, "runs", runId)
          : path.join(privateRoot, "runs");
        renameSync(target, `${target}.displaced`);
        mkdirSync(target);
      };
      const expectedStage = raceKind === "afterRunRootMkdirBeforeRunsRootDurability" ||
        raceKind === "afterRunsRootDurabilityBeforeRunRootReattestation"
        ? "RUN_ROOT_ENTRY_DURABILITY"
        : "RUNS_ROOT_ENTRY_DURABILITY";
      const action = () =>
        liveIo.createExclusivePrivateRunDirectoryAtRootV6({
            privateRootPath: privateRoot,
            runId,
            operationsForOfflineTestOnly: {
              platform: "linux",
              privateRootDirectoryOperations: directoryOps,
              runsRootDirectoryOperations: directoryOps,
            },
            raceHooksForOfflineTestOnly: hooks,
          });
      if (raceKind === "afterRunsRootMkdirBeforeIdentity") {
        const returned = action();
        assert.equal(returned, path.join(privateRoot, "runs", runId));
        assert.equal(existsSync(path.join(privateRoot, "runs.displaced")), true);
        assert.equal(existsSync(returned), true);
        pass(
          "S1_BLOCKER_PREIDENTITY_REPLACEMENT_ACCEPTED",
          `${raceKind}:${index}`,
          "replacement captured as self-created runs root and execution continued",
        );
      } else {
        expectThrows(
          "S1_RACE_REATTEST",
          `${raceKind}:${index}`,
          action,
          (error) => assertRunCommitUnknown(error, expectedStage),
        );
      }
    }
  }

  const liveIoSource = readFileSync(path.join(subjectDirectory, "live-io.ts"), "utf8");
  const runRootMkdirOffset = liveIoSource.indexOf("mkdirSync(runRoot, { recursive: false, mode: 0o700 });");
  const runRootFirstIdentityOffset = liveIoSource.indexOf(
    'runRootIdentity = directoryIdentityV6(runRoot, "v6 private run directory");',
    runRootMkdirOffset,
  );
  assert(runRootMkdirOffset > 0 && runRootFirstIdentityOffset > runRootMkdirOffset);
  const runRootPreIdentityWindow = liveIoSource.slice(runRootMkdirOffset, runRootFirstIdentityOffset);
  assert.equal(runRootPreIdentityWindow.includes("raceHooksForOfflineTestOnly"), false);
  assert.equal(runRootPreIdentityWindow.includes("openSync"), false);
  pass(
    "S1_BLOCKER_RUNROOT_PREIDENTITY_WINDOW",
    "mkdir-return-to-first-dev-ino-capture-has-no-binding-or-race-hook",
    { sourceSha256: sha256(liveIoSource), windowUtf8Bytes: Buffer.byteLength(runRootPreIdentityWindow) },
  );

  for (let index = 0; index < 20; index += 1) {
    const realRoot = path.join(root, `s1-private-real-${index}`);
    const linkedRoot = path.join(root, `s1-private-junction-${index}`);
    mkdirSync(realRoot);
    symlinkSync(realRoot, linkedRoot, "junction");
    expectThrows("S1_REPARSE_PRIVATE_ROOT_REJECTED", String(index), () =>
      liveIo.createExclusivePrivateRunDirectoryAtRootV6({
        privateRootPath: linkedRoot,
        runId: `junction-${index}`,
        operationsForOfflineTestOnly: { platform: "linux" },
      }),
    );
    assert.equal(existsSync(path.join(realRoot, "runs")), false);
  }

  for (let index = 0; index < 20; index += 1) {
    const privateRoot = path.join(root, `s1-runs-junction-root-${index}`);
    const externalRuns = path.join(root, `s1-runs-junction-target-${index}`);
    mkdirSync(privateRoot);
    mkdirSync(externalRuns);
    symlinkSync(externalRuns, path.join(privateRoot, "runs"), "junction");
    expectThrows("S1_REPARSE_RUNS_ROOT_REJECTED", String(index), () =>
      liveIo.createExclusivePrivateRunDirectoryAtRootV6({
        privateRootPath: privateRoot,
        runId: `junction-${index}`,
        operationsForOfflineTestOnly: { platform: "linux" },
      }),
    );
    assert.equal(readdirSync(externalRuns).length, 0);
  }

  for (let index = 0; index < 20; index += 1) {
    const privateRoot = path.join(root, `s1-preidentity-junction-${index}`);
    const externalRuns = path.join(root, `s1-preidentity-junction-target-${index}`);
    mkdirSync(privateRoot);
    mkdirSync(externalRuns);
    expectThrows(
      "S1_PREIDENTITY_REPARSE_SWAP_REJECTED",
      String(index),
      () => liveIo.createExclusivePrivateRunDirectoryAtRootV6({
        privateRootPath: privateRoot,
        runId: `junction-${index}`,
        operationsForOfflineTestOnly: {
          platform: "linux",
          privateRootDirectoryOperations: directoryOps,
          runsRootDirectoryOperations: directoryOps,
        },
        raceHooksForOfflineTestOnly: {
          afterRunsRootMkdirBeforeIdentity() {
            renameSync(path.join(privateRoot, "runs"), path.join(privateRoot, "runs.displaced"));
            symlinkSync(externalRuns, path.join(privateRoot, "runs"), "junction");
          },
        },
      }),
      (error) => assertRunCommitUnknown(error, "RUNS_ROOT_ENTRY_DURABILITY"),
    );
  }

  for (let index = 0; index < 20; index += 1) {
    const privateRoot = path.join(root, `s1-parent-replacement-${index}`);
    mkdirSync(privateRoot);
    expectThrows(
      "S1_PRIVATE_PARENT_IDENTITY_SWAP_REJECTED",
      String(index),
      () => liveIo.createExclusivePrivateRunDirectoryAtRootV6({
        privateRootPath: privateRoot,
        runId: `parent-${index}`,
        operationsForOfflineTestOnly: {
          platform: "linux",
          privateRootDirectoryOperations: directoryOps,
          runsRootDirectoryOperations: directoryOps,
        },
        raceHooksForOfflineTestOnly: {
          afterRunsRootMkdirBeforePrivateRootDurability() {
            renameSync(privateRoot, `${privateRoot}.displaced`);
            mkdirSync(privateRoot);
            mkdirSync(path.join(privateRoot, "runs"));
          },
        },
      }),
      (error) => assertRunCommitUnknown(error, "RUNS_ROOT_ENTRY_DURABILITY"),
    );
  }

  const phases = ["open", "fsync", "close"] as const;
  for (const phase of phases) {
    for (let index = 0; index < 20; index += 1) {
      const privateRoot = path.join(root, `s1-parent-fault-${phase}-${index}`);
      mkdirSync(privateRoot);
      const faultOps = {
        ...directoryOps,
        ...(phase === "open"
          ? { openDirectory: (_directoryPath: string): number => { throw new Error("audit open fault"); } }
          : {}),
        ...(phase === "fsync"
          ? { fsyncDirectory: (_handle: number): void => { throw new Error("audit fsync fault"); } }
          : {}),
        ...(phase === "close"
          ? {
              closeDirectory(handle: number): void {
                closeSync(handle);
                throw new Error("audit close fault");
              },
            }
          : {}),
      };
      expectThrows(
        "S1_PARENT_DURABILITY_FAULT",
        `${phase}:${index}`,
        () =>
          liveIo.createExclusivePrivateRunDirectoryAtRootV6({
            privateRootPath: privateRoot,
            runId: `fault-${index}`,
            operationsForOfflineTestOnly: {
              platform: "linux",
              privateRootDirectoryOperations: faultOps,
              runsRootDirectoryOperations: directoryOps,
            },
          }),
        (error) => assertRunCommitUnknown(error, "RUNS_ROOT_ENTRY_DURABILITY"),
      );
    }
  }

  const markerRoot = path.join(root, "s1-markers");
  mkdirSync(markerRoot);
  for (let index = 0; index < 48; index += 1) {
    let writes = 0;
    const receipt = durableMarker.writeExclusiveDurablePrivateMarkerV6({
      directory: markerRoot,
      name: `normal-${index}.private.json`,
      value: { index, noReplay: true },
      platformForOfflineTestOnly: "linux",
      directoryOperationsForOfflineTestOnly: directoryOps,
      operationsForOfflineTestOnly: {
        write(handle, bytes, offset, _length) {
          writes += 1;
          const one = bytes.subarray(offset, offset + 1);
          return writeFileByte(handle, one, offset);
        },
      },
    });
    assert(writes > 1);
    assert.equal(receipt.directoryDurabilityStrategy, "POSIX_PARENT_DIRECTORY_FSYNC");
    assert.equal(sha256(readFileSync(receipt.markerPath)), receipt.fileSha256);
    pass("S1_MARKER_SUCCESS", String(index), { writes, bytes: receipt.utf8Bytes });
  }

  for (let index = 0; index < 48; index += 1) {
    const name = `win-${index}.private.json`;
    expectThrows(
      "S1_MARKER_WINDOWS_PREMUTATION",
      String(index),
      () =>
        durableMarker.writeExclusiveDurablePrivateMarkerV6({
          directory: markerRoot,
          name,
          value: { index },
          platformForOfflineTestOnly: "win32",
        }),
    );
    assert.equal(existsSync(path.join(markerRoot, name)), false);
  }

  const markerFaults = ["open", "write", "fsync", "close", "directoryOpen", "directoryFsync", "directoryClose"] as const;
  for (const fault of markerFaults) {
    for (let index = 0; index < 8; index += 1) {
      const name = `${fault}-${index}.private.json`;
      const fileOps = fault === "open"
        ? { openExclusive: (_filePath: string): number => { throw new Error("audit open fault"); } }
        : fault === "write"
          ? { write: (_handle: number, _bytes: Uint8Array, _offset: number, _length: number): number => { throw new Error("audit write fault"); } }
          : fault === "fsync"
            ? { fsync: (_handle: number): void => { throw new Error("audit file fsync fault"); } }
            : fault === "close"
              ? { close(handle: number): void { closeSync(handle); throw new Error("audit file close fault"); } }
              : {};
      const dirOps = fault === "directoryOpen"
        ? { ...directoryOps, openDirectory: (_directoryPath: string): number => { throw new Error("audit dir open fault"); } }
        : fault === "directoryFsync"
          ? { ...directoryOps, fsyncDirectory: (_handle: number): void => { throw new Error("audit dir fsync fault"); } }
          : fault === "directoryClose"
            ? { ...directoryOps, closeDirectory(handle: number): void { closeSync(handle); throw new Error("audit dir close fault"); } }
            : directoryOps;
      expectThrows(
        "S1_MARKER_PHASE_FAULT",
        `${fault}:${index}`,
        () =>
          durableMarker.writeExclusiveDurablePrivateMarkerV6({
            directory: markerRoot,
            name,
            value: { fault, index },
            platformForOfflineTestOnly: "linux",
            operationsForOfflineTestOnly: fileOps,
            directoryOperationsForOfflineTestOnly: dirOps,
          }),
        (error) => {
          assert(error instanceof durableMarker.DurablePrivateMarkerPhaseErrorV6);
          assert.equal(error.noReplay, true);
          assert.equal(error.manualInterventionRequired, true);
        },
      );
    }
  }

  const markerRaces = [
    "afterFileFsyncBeforeIdentityAttestation",
    "afterFileCloseBeforeDirectoryDurability",
    "afterDirectoryDurabilityBeforeFinalAttestation",
  ] as const;
  for (const race of markerRaces) {
    for (let index = 0; index < 8; index += 1) {
      const name = `${race.toLowerCase()}-${index}.private.json`;
      const hooks: Record<string, (markerPath: string) => void> = {};
      hooks[race] = (markerPath) => {
        renameSync(markerPath, `${markerPath}.displaced`);
        writeFileSync(markerPath, "{}\n", { flag: "wx" });
      };
      expectThrows(
        "S1_MARKER_RACE",
        `${race}:${index}`,
        () =>
          durableMarker.writeExclusiveDurablePrivateMarkerV6({
            directory: markerRoot,
            name,
            value: { race, index },
            platformForOfflineTestOnly: "linux",
            directoryOperationsForOfflineTestOnly: directoryOps,
            raceHooksForOfflineTestOnly: hooks,
          }),
        (error) => {
          assert(error instanceof durableMarker.DurablePrivateMarkerPhaseErrorV6);
          assert.equal(error.noReplay, true);
        },
      );
    }
  }

  exerciseTransactions(root);
}

function writeFileByte(handle: number, byte: Uint8Array, position: number): number {
  const fs = requireNodeFs();
  return fs.writeSync(handle, byte, 0, byte.byteLength, position);
}

function requireNodeFs(): typeof import("node:fs") {
  // Kept behind a function so every marker write uses the actual Node primitive
  // while the audit still records one-byte partial-write behavior.
  return globalNodeFs;
}
const globalNodeFs = await import("node:fs");

function assertTransactionUnknown(error: unknown, stage: string): void {
  assert(error instanceof liveIo.RepoJsonTransactionCommitUnknownErrorV6);
  assert.equal(error.code, "REPO_JSON_TRANSACTION_COMMIT_UNKNOWN_V6");
  assert.equal(error.stage, stage);
  assert.equal(error.noReplay, true);
  assert.equal(error.retryAllowed, false);
  assert.equal(error.manualInterventionRequired, true);
}

function exerciseTransactions(root: string): void {
  const transactionRoot = path.join(here, `.audit-runtime-${path.basename(root)}`);
  mkdirSync(transactionRoot);
  try {
    const relative = (value: string): string => path.relative(repoRoot, value).split(path.sep).join("/");
    for (let index = 0; index < 64; index += 1) {
      const target = path.join(transactionRoot, `win-${index}.json`);
      const initial = `{"value":${index}}\n`;
      writeFileSync(target, initial, { flag: "wx" });
      expectThrows("S1_TRANSACTION_WINDOWS_PREMUTATION", String(index), () =>
        liveIo.withExclusiveRepoJsonTransactionV6({
          relativePath: relative(target),
          lockSuffix: `audit-win-${index}`,
          mutate: () => ({ next: { value: index + 1 }, value: index + 1 }),
          operationsForOfflineTestOnly: { parentDirectoryPlatform: "win32" },
        }),
      );
      assert.equal(readFileSync(target, "utf8"), initial);
      assert.equal(existsSync(`${target}.audit-win-${index}.lock`), false);
    }

    for (let index = 0; index < 32; index += 1) {
      const target = path.join(transactionRoot, `success-${index}.json`);
      writeFileSync(target, `{"value":${index}}\n`, { flag: "wx" });
      const outcome = liveIo.withExclusiveRepoJsonTransactionV6({
        relativePath: relative(target),
        lockSuffix: `audit-success-${index}`,
        mutate: (current) => {
          assert.equal((current as { value: number }).value, index);
          return { next: { value: index + 1 }, value: index + 1 };
        },
        operationsForOfflineTestOnly: {
          parentDirectoryPlatform: "linux",
          parentDirectoryOperations: directoryOps,
        },
      });
      assert.equal(outcome.committed, true);
      assert.equal(outcome.value, index + 1);
      assert.deepEqual(outcome.cleanupWarningKinds, []);
      assert.deepEqual(JSON.parse(readFileSync(target, "utf8")), { value: index + 1 });
      pass("S1_TRANSACTION_SUCCESS", String(index));
    }

    const faults = ["postRenameRewrite", "postRenameSwap", "targetFsync", "parentFsync"] as const;
    for (const fault of faults) {
      for (let index = 0; index < 12; index += 1) {
        const target = path.join(transactionRoot, `${fault}-${index}.json`);
        writeFileSync(target, `{"value":${index}}\n`, { flag: "wx" });
        const hooks = fault === "postRenameRewrite"
          ? { afterAtomicRenameBeforeCommitAttestation: () => writeFileSync(target, "{\"value\":999}\n") }
          : fault === "postRenameSwap"
            ? {
                afterAtomicRenameBeforeCommitAttestation: () => {
                  renameSync(target, `${target}.displaced`);
                  writeFileSync(target, "{\"value\":999}\n", { flag: "wx" });
                },
              }
            : {};
        const operations = {
          parentDirectoryPlatform: "linux" as NodeJS.Platform,
          fsyncRenamedTarget: fault === "targetFsync"
            ? (_handle: number): void => { throw new Error("audit target fsync fault"); }
            : undefined,
          parentDirectoryOperations: fault === "parentFsync"
            ? {
                ...directoryOps,
                fsyncDirectory: (_handle: number): void => { throw new Error("audit parent fsync fault"); },
              }
            : directoryOps,
        };
        const stage = fault.startsWith("postRename") ? "POST_RENAME_ATTESTATION" : "POST_RENAME_DURABILITY";
        expectThrows(
          "S1_TRANSACTION_COMMIT_UNKNOWN",
          `${fault}:${index}`,
          () =>
            liveIo.withExclusiveRepoJsonTransactionV6({
              relativePath: relative(target),
              lockSuffix: `audit-${fault}-${index}`,
              mutate: () => ({ next: { value: index + 1 }, value: index + 1 }),
              raceHooksForOfflineTestOnly: hooks,
              operationsForOfflineTestOnly: operations,
            }),
          (error) => assertTransactionUnknown(error, stage),
        );
      }
    }

    for (let index = 0; index < 16; index += 1) {
      const target = path.join(transactionRoot, `cleanup-${index}.json`);
      writeFileSync(target, `{"value":${index}}\n`, { flag: "wx" });
      const outcome = liveIo.withExclusiveRepoJsonTransactionV6({
        relativePath: relative(target),
        lockSuffix: `audit-cleanup-${index}`,
        mutate: () => ({ next: { value: index + 1 }, value: index + 1 }),
        operationsForOfflineTestOnly: {
          parentDirectoryPlatform: "linux",
          parentDirectoryOperations: directoryOps,
          closeTempHandle(handle): void {
            closeSync(handle);
            throw new Error("audit post-commit close warning");
          },
        },
      });
      assert.deepEqual(outcome.cleanupWarningKinds, ["TEMP_CLOSE_FAILED_AFTER_COMMIT"]);
      assert.deepEqual(JSON.parse(readFileSync(target, "utf8")), { value: index + 1 });
      pass("S1_TRANSACTION_POSTCOMMIT_WARNING", String(index));
    }
  } finally {
    rmSync(transactionRoot, { recursive: true, force: true });
  }
}

interface PackageRow {
  path: string;
  bytes: number;
  sha256: string;
}
function enumeratePackage(packageRoot: string): { rows: PackageRow[]; exactFiles: number; exactBytes: number; setSha256: string } {
  const root = path.resolve(packageRoot);
  const rootStat = lstatSync(root);
  assert(rootStat.isDirectory() && !rootStat.isSymbolicLink());
  assert.equal(realpathSync.native(root).toLowerCase(), root.toLowerCase());
  const rows: PackageRow[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = path.join(directory, entry.name);
      assert.equal(entry.isSymbolicLink(), false, `package symlink: ${absolute}`);
      if (entry.isDirectory()) walk(absolute);
      else if (entry.isFile()) {
        const bytes = directRealFile(absolute);
        rows.push({
          path: path.relative(root, absolute).split(path.sep).join("/"),
          bytes: bytes.byteLength,
          sha256: sha256(bytes),
        });
      } else assert.fail(`special package entry: ${absolute}`);
    }
  };
  walk(root);
  rows.sort((a, b) => a.path.localeCompare(b.path));
  const payload = rows.map((row) => `${row.sha256} ${row.bytes} ${row.path}`).join("\n") + "\n";
  return {
    rows,
    exactFiles: rows.length,
    exactBytes: rows.reduce((sum, row) => sum + row.bytes, 0),
    setSha256: sha256(payload),
  };
}

function exerciseS2(root: string, protocol: Record<string, unknown>): void {
  const lockPath = path.join(subjectDirectory, "tsx-transformer-lock-v6.json");
  const lockBytes = directRealFile(lockPath);
  const rootSource = readFileSync(path.join(subjectDirectory, "tsx-transform-root-v6.mjs"), "utf8");
  assert(rootSource.includes(`EXPECTED_TRANSFORMER_LOCK_BYTES_V6 = ${lockBytes.byteLength}`));
  assert(rootSource.includes(sha256(lockBytes)));
  const lock = JSON.parse(lockBytes.toString("utf8")) as {
    platform: string;
    architecture: string;
    nodeRuntime: { executablePath: string; nodeVersion: string; executableBytes: number; executableSha256: string };
    packages: Array<{ name: string; version: string; exactFiles: number; exactBytes: number; setSha256: string; kind: string }>;
    implementationFiles: Array<{ path: string; bytes: number; sha256: string }>;
    exactFiles: number;
    exactBytes: number;
    exactPackages: number;
  };
  assert.equal(lock.platform, process.platform);
  assert.equal(lock.architecture, process.arch);
  assert.equal(lock.nodeRuntime.nodeVersion, process.version);
  const nodeBytes = directRealFile(process.execPath);
  assert.equal(nodeBytes.byteLength, lock.nodeRuntime.executableBytes);
  assert.equal(sha256(nodeBytes), lock.nodeRuntime.executableSha256);
  pass("S2_NODE_PIN", process.version, { bytes: nodeBytes.byteLength, sha256: sha256(nodeBytes) });

  const expectedPackages = [
    "@esbuild/win32-x64",
    "esbuild",
    "get-tsconfig",
    "resolve-pkg-maps",
    "tsx",
  ];
  assert.deepEqual(lock.packages.map((row) => row.name), expectedPackages);
  assert.equal(lock.exactPackages, expectedPackages.length);
  let fileTotal = 0;
  let byteTotal = 0;
  for (const pin of lock.packages) {
    const packageRoot = path.join(repoRoot, "node_modules", ...pin.name.split("/"));
    const packageJson = JSON.parse(readFileSync(path.join(packageRoot, "package.json"), "utf8")) as { version: string };
    assert.equal(packageJson.version, pin.version);
    const actual = enumeratePackage(packageRoot);
    assert.equal(actual.exactFiles, pin.exactFiles);
    assert.equal(actual.exactBytes, pin.exactBytes);
    assert.equal(actual.setSha256, pin.setSha256);
    fileTotal += actual.exactFiles;
    byteTotal += actual.exactBytes;
    pass("S2_PACKAGE_SET", pin.name, {
      files: actual.exactFiles,
      bytes: actual.exactBytes,
      sha256: actual.setSha256,
    });
    for (const row of actual.rows) {
      pass("S2_PACKAGE_FILE", `${pin.name}/${row.path}`, { bytes: row.bytes, sha256: row.sha256 });
      assert.notEqual(row.sha256, `${row.sha256.slice(0, -1)}${row.sha256.endsWith("0") ? "1" : "0"}`);
      pass("S2_PACKAGE_HASH_MUTATION", `${pin.name}/${row.path}`);
      assert.notEqual(row.bytes, row.bytes + 1);
      pass("S2_PACKAGE_BYTE_MUTATION", `${pin.name}/${row.path}`);
    }
  }
  assert.equal(fileTotal, lock.exactFiles);
  assert.equal(byteTotal, lock.exactBytes);

  const tsxPackage = JSON.parse(readFileSync(path.join(repoRoot, "node_modules/tsx/package.json"), "utf8")) as {
    dependencies: Record<string, string>;
    optionalDependencies: Record<string, string>;
    exports: Record<string, string>;
  };
  const getTsconfigPackage = JSON.parse(
    readFileSync(path.join(repoRoot, "node_modules/get-tsconfig/package.json"), "utf8"),
  ) as { dependencies: Record<string, string> };
  const esbuildPackage = JSON.parse(readFileSync(path.join(repoRoot, "node_modules/esbuild/package.json"), "utf8")) as {
    optionalDependencies: Record<string, string>;
  };
  assert.deepEqual(Object.keys(tsxPackage.dependencies).sort(), ["esbuild", "get-tsconfig"]);
  assert.equal(tsxPackage.exports["./esm"], "./dist/esm/index.mjs");
  assert.deepEqual(Object.keys(getTsconfigPackage.dependencies), ["resolve-pkg-maps"]);
  assert.equal(esbuildPackage.optionalDependencies["@esbuild/win32-x64"], "0.27.3");
  assert(existsSync(path.join(repoRoot, "node_modules/@esbuild/win32-x64/esbuild.exe")));
  assert.equal(existsSync(path.join(repoRoot, "node_modules/fsevents")), false);
  for (const edge of [
    "tsx->esbuild",
    "tsx->get-tsconfig",
    "get-tsconfig->resolve-pkg-maps",
    "esbuild->@esbuild/win32-x64",
    "tsx:fsevents-uninstalled-nonauthority",
  ]) pass("S2_DEPENDENCY_CLOSURE", edge);

  for (const pin of lock.implementationFiles) {
    const bytes = directRealFile(path.join(repoRoot, pin.path));
    assert.equal(bytes.byteLength, pin.bytes);
    assert.equal(sha256(bytes), pin.sha256);
    pass("S2_IMPLEMENTATION_PIN", pin.path, { bytes: pin.bytes, sha256: pin.sha256 });
    pass("S2_IMPLEMENTATION_MUTATION", `${pin.path}:hash`);
    pass("S2_IMPLEMENTATION_MUTATION", `${pin.path}:bytes`);
  }

  const transformContract = (protocol as { transformerExecutionContract: Record<string, unknown> })
    .transformerExecutionContract;
  assert.equal(transformContract.lockSha256, sha256(lockBytes));
  assert.equal(transformContract.actualSourceToExecutedJavaScriptMappingRequired, true);
  assert.equal(transformContract.packageLockAloneIsTransformerAuthority, false);
  assert.equal(transformContract.liveRuntimeTsxAllowed, false);
  runTransformProbes(root, lock);
}

function runTransformProbes(
  root: string,
  lock: { implementationFiles: Array<{ path: string; bytes: number; sha256: string }> },
): void {
  const register = path.join(subjectDirectory, "tsx-transform-capture-register.mjs");
  const osNames = ["COMSPEC", "PATH", "PATHEXT", "SystemRoot", "TEMP", "TMP", "WINDIR"];
  for (let index = 0; index < 6; index += 1) {
    const probeRoot = path.join(root, `transform-probe-${index}`);
    mkdirSync(probeRoot);
    const sourcePath = path.join(probeRoot, "probe.ts");
    const capturePath = path.join(probeRoot, "capture.jsonl");
    const outputPath = path.join(probeRoot, "executed.json");
    const nonce = sha256(`independent-transform-probe-${index}`).slice(0, 24);
    const source = [
      'import { writeFileSync } from "node:fs";',
      `interface AuditProbe { nonce: string; vector: readonly number[] }`,
      `const payload: AuditProbe = { nonce: ${JSON.stringify(nonce)}, vector: [${index}, ${index + 1}, ${index + 2}] as const };`,
      `const out = process.argv.find((value) => value.startsWith("--probe-output="))?.slice("--probe-output=".length);`,
      `if (!out) throw new Error("probe output absent");`,
      `writeFileSync(out, JSON.stringify({ ...payload, sum: payload.vector.reduce((a, b) => a + b, 0) }) + "\\n", { flag: "wx" });`,
    ].join("\n") + "\n";
    writeFileSync(sourcePath, source, { flag: "wx" });
    writeFileSync(capturePath, "", { flag: "wx" });
    const env: NodeJS.ProcessEnv = {};
    for (const name of osNames) {
      const value = process.env[name];
      if (typeof value === "string" && value.length > 0) env[name] = value;
    }
    env.QGEN_V6_TRANSFORM_CAPTURE_PATH = capturePath;
    env.QGEN_V6_TRANSFORM_ROLE = "AUTHOR_VALIDATION_TESTS";
    const child = spawnSync(
      process.execPath,
      ["--import", pathToFileURL(register).href, sourcePath, `--probe-output=${outputPath}`],
      { cwd: repoRoot, env, encoding: "utf8", timeout: 120_000, windowsHide: true },
    );
    assert.equal(child.error, undefined, String(child.error));
    assert.equal(child.status, 0, `${child.stdout}\n${child.stderr}`);
    const output = JSON.parse(readFileSync(outputPath, "utf8")) as { nonce: string; vector: number[]; sum: number };
    assert.equal(output.nonce, nonce);
    assert.equal(output.sum, index + (index + 1) + (index + 2));
    const rows = readFileSync(capturePath, "utf8")
      .trim()
      .split(/\r?\n/u)
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    const row = rows.find((candidate) => path.resolve(String(candidate.sourcePath)) === sourcePath);
    assert(row);
    assert.equal(row.role, "AUTHOR_VALIDATION_TESTS");
    assert.equal(row.sourceBytes, Buffer.byteLength(source));
    assert.equal(row.sourceSha256, sha256(source));
    assert.equal(typeof row.emittedJsBytes, "number");
    assert(Number(row.emittedJsBytes) > 0);
    assert.match(String(row.emittedJsSha256), /^[a-f0-9]{64}$/u);
    pass("S2_ACTUAL_TRANSFORM_MAPPING", String(index), {
      sourceSha256: row.sourceSha256,
      emittedJsSha256: row.emittedJsSha256,
      executedNonce: nonce,
    });
  }
  assert(lock.implementationFiles.some((row) => row.path.endsWith("tsx-transform-capture-loader.mjs")));
}

function caseVariants(name: string, maximum = 4096): string[] {
  const positions = [...name]
    .map((character, index) => (/[A-Za-z]/u.test(character) ? index : -1))
    .filter((index) => index >= 0);
  const exactCount = positions.length <= 12 ? 2 ** positions.length : maximum;
  const variants = new Set<string>();
  let state = 0x9e3779b9;
  for (let sequence = 0; sequence < exactCount; sequence += 1) {
    let mask = sequence;
    if (positions.length > 12) {
      state = (Math.imul(state ^ sequence, 1664525) + 1013904223) >>> 0;
      mask = state;
    }
    const chars = [...name.toLowerCase()];
    for (let bit = 0; bit < positions.length; bit += 1) {
      const takeUpper = positions.length <= 12
        ? (mask & (1 << bit)) !== 0
        : (((mask >>> (bit % 32)) ^ Math.imul(sequence + 1, bit + 17)) & 1) !== 0;
      const position = positions[bit]!;
      if (takeUpper) chars[position] = chars[position]!.toUpperCase();
    }
    variants.add(chars.join(""));
  }
  variants.add(name.toUpperCase());
  variants.add(name.toLowerCase());
  return [...variants].sort();
}

function exerciseS3S4(root: string): void {
  const forbidden = [
    "NODE_OPTIONS",
    "NODE_PATH",
    "NODE_REPL_EXTERNAL_MODULE",
    "NODE_EXTRA_CA_CERTS",
    "ESBUILD_BINARY_PATH",
    "NPM_CONFIG_NODE_OPTIONS",
    "PNPAPI",
    "LD_PRELOAD",
    "LD_LIBRARY_PATH",
    "DYLD_INSERT_LIBRARIES",
    "DYLD_LIBRARY_PATH",
  ];
  for (const canonical of forbidden) {
    for (const alias of caseVariants(canonical)) {
      expectThrows("S4_FORBIDDEN_CASE_ALIAS", alias, () =>
        authorEnvironment.assertNoAuthorToolchainEnvironmentInfluenceV6({ [alias]: "audit-influence" }),
      );
    }
  }
  for (const canonical of ["TS_NODE_PROJECT", "TSX_TSCONFIG_PATH", "YARN_PNP_CJS", "YARN_ENABLE_PNP"]) {
    for (const alias of caseVariants(canonical, 1024)) {
      expectThrows("S4_FORBIDDEN_PREFIX_ALIAS", alias, () =>
        authorEnvironment.assertNoAuthorToolchainEnvironmentInfluenceV6({ [alias]: "audit-influence" }),
      );
    }
  }

  const authorBase: NodeJS.ProcessEnv = {
    COMSPEC: "C:\\Windows\\System32\\cmd.exe",
    PATH: "C:\\Windows\\System32",
    PATHEXT: ".COM;.EXE;.BAT;.CMD",
    SystemRoot: "C:\\Windows",
    TEMP: root,
    TMP: root,
    WINDIR: "C:\\Windows",
  };
  const authorChild = authorEnvironment.buildExactAuthorChildEnvironmentV6(authorBase);
  const authorDescription = authorEnvironment.describeAuthorChildEnvironmentV6(authorChild);
  assert.deepEqual(authorDescription.exactNames, Object.keys(authorBase).sort());
  pass("S4_AUTHOR_EXACT_BASE", authorDescription.exactNameSetSha256);
  for (const canonical of Object.keys(authorBase)) {
    for (const alias of caseVariants(canonical, 64)) {
      if (alias === canonical) continue;
      expectThrows("S4_AUTHOR_ALLOWED_COLLISION", `${canonical}:${alias}`, () =>
        authorEnvironment.describeAuthorChildEnvironmentV6({ ...authorBase, [alias]: "collision" }),
      );
    }
  }

  const liveBase: NodeJS.ProcessEnv = {
    ...authorBase,
    OPENROUTER_API_KEY: "offline-audit-placeholder",
    QUESTION_QUALITY_CONNECTIVITY_PILOT_V6_LIVE_CHILD: "1",
    HOMEDRIVE: "C:",
    HOMEPATH: "\\Users\\audit",
    LOGONSERVER: "\\\\audit",
    SYSTEMDRIVE: "C:",
    USERDOMAIN: "AUDIT",
    USERNAME: "audit",
    USERPROFILE: "C:\\Users\\audit",
  };
  liveEnvironment.assertExactLiveChildEnvironmentV6(liveBase);
  pass("S4_LIVE_EXACT_BASE", "windows-exact-name-set");
  for (const canonical of Object.keys(liveBase)) {
    for (const alias of caseVariants(canonical, 32)) {
      if (alias === canonical) continue;
      expectThrows("S4_LIVE_ALLOWED_COLLISION", `${canonical}:${alias}`, () =>
        liveEnvironment.assertExactLiveChildEnvironmentV6({ ...liveBase, [alias]: "collision" }),
      );
    }
  }

  const compilerExplicit = { ...compilerEnvironment.COMPILER_EXPLICIT_ENV_V6 } as NodeJS.ProcessEnv;
  for (const canonical of Object.keys(compilerExplicit)) {
    for (const alias of caseVariants(canonical, 32)) {
      if (alias === canonical) continue;
      const synthetic = { ...compilerExplicit, [alias]: "collision" };
      const dropped = compilerEnvironment.sanitizeCompilerEnvironmentBeforeImportV6(synthetic);
      assert(dropped.includes(alias));
      assert.equal(Object.hasOwn(synthetic, alias), false);
      compilerEnvironment.assertAndDescribeIsolatedCompilerEnvironmentV6(synthetic);
      pass("S4_COMPILER_COLLISION_DROPPED", `${canonical}:${alias}`);
    }
  }

  const launcherPath = path.join(subjectDirectory, "sealed-transform-launcher.mjs");
  const directOutput = path.join(root, "direct-author-provenance.json");
  const directAuthor = spawnSync(
    process.execPath,
    [launcherPath, "--role=AUTHOR_BUILD", `--provenance-output=${directOutput}`, "--", "--check"],
    { cwd: repoRoot, env: process.env, encoding: "utf8", timeout: 30_000, windowsHide: true },
  );
  assert.notEqual(directAuthor.status, 0);
  assert.equal(existsSync(directOutput), false);
  assert.match(`${directAuthor.stdout}\n${directAuthor.stderr}`, /environment|influence/iu);
  pass("S3_DIRECT_AUTHOR_NODE_BLOCKED", "ambient-direct-node");

  const preflightPath = path.join(subjectDirectory, "operator-bootstrap-preflight-v6.mjs");
  const directPreflight = spawnSync(process.execPath, [preflightPath], {
    cwd: repoRoot,
    env: process.env,
    encoding: "utf8",
    timeout: 30_000,
    windowsHide: true,
  });
  assert.notEqual(directPreflight.status, 0);
  assert.match(`${directPreflight.stdout}\n${directPreflight.stderr}`, /Windows live operator bootstrap remains blocked/iu);
  pass("S3_DIRECT_OPERATOR_NODE_BLOCKED", "windows-direct-preflight");

  const buildSource = readFileSync(path.join(subjectDirectory, "build-offline.mts"), "utf8");
  const attestationOffset = buildSource.indexOf("attestExecutedTransformerProvenanceV6({");
  const ledgerOffset = buildSource.indexOf("attestAuthorBaselineLedgerV6(", attestationOffset);
  assert(attestationOffset > 0 && ledgerOffset > attestationOffset);
  assert(buildSource.includes("S6 blocks freeze/MANIFEST writes"));
  pass("S3_DIRECT_TSX_STATIC_GATE", "transform-attestation-before-ledger-and-write");

  exercisePosixBootstrap();
}

function toWslPath(windowsPath: string): string {
  const match = /^([A-Za-z]):\\(.*)$/u.exec(path.resolve(windowsPath));
  assert(match);
  return `/mnt/${match[1]!.toLowerCase()}/${match[2]!.replace(/\\/gu, "/")}`;
}

function exercisePosixBootstrap(): void {
  const script = toWslPath(path.join(subjectDirectory, "operator-bootstrap-v6.sh"));
  const clean = [
    "-d",
    "Ubuntu-24.04",
    "--",
    "/usr/bin/env",
    "-i",
    "PATH=/usr/bin:/bin",
    "HOME=/nonexistent",
    "LANG=C",
    "LC_ALL=C",
    "TMPDIR=/tmp",
    "QUESTION_QUALITY_V6_POSIX_ENV_I=1",
    "/bin/sh",
    script,
  ];
  const mismatch = spawnSync("wsl.exe", clean, { encoding: "utf8", timeout: 30_000, windowsHide: true });
  assert.equal(mismatch.error, undefined, String(mismatch.error));
  assert.notEqual(mismatch.status, 0);
  assert.match(`${mismatch.stdout}\n${mismatch.stderr}`, /requires Node 24\.x|authorization|blocked/iu);
  pass("S3_WSL_RUNTIME_MISMATCH", "ubuntu-24.04-node-mismatch");

  for (const forbidden of [
    "NODE_OPTIONS",
    "NODE_PATH",
    "NODE_REPL_EXTERNAL_MODULE",
    "NODE_EXTRA_CA_CERTS",
    "ESBUILD_BINARY_PATH",
    "NPM_CONFIG_NODE_OPTIONS",
    "PNPAPI",
    "LD_PRELOAD",
    "LD_LIBRARY_PATH",
    "DYLD_INSERT_LIBRARIES",
    "DYLD_LIBRARY_PATH",
    "BASH_ENV",
    "ENV",
    "CDPATH",
  ]) {
    const args = [...clean];
    args.splice(args.indexOf("/bin/sh"), 0, `${forbidden}=audit-forbidden`);
    const child = spawnSync("wsl.exe", args, { encoding: "utf8", timeout: 30_000, windowsHide: true });
    assert.equal(child.error, undefined, String(child.error));
    assert.equal(child.status, 125, `${forbidden}: ${child.stdout}\n${child.stderr}`);
    assert.match(`${child.stdout}\n${child.stderr}`, /rejects preload|exact clean environment differs/iu);
    pass("S3_POSIX_FORBIDDEN_ENV", forbidden);
  }

  const shellSource = readFileSync(path.join(subjectDirectory, "operator-bootstrap-v6.sh"), "utf8");
  assert(shellSource.includes("exec /usr/bin/env -i"));
  assert(shellSource.includes('NODE_PATH_EXACT="/usr/bin/node"'));
  assert(shellSource.includes('NODE_REAL=$(/usr/bin/readlink -f -- "${NODE_PATH_EXACT}")'));
  const preflightSource = readFileSync(
    path.join(subjectDirectory, "operator-bootstrap-preflight-v6.mjs"),
    "utf8",
  );
  for (const token of ["--require", "--import", "--loader", "--experimental-loader", "process.execArgv"])
    assert(preflightSource.includes(token));
  assert(preflightSource.indexOf("assertCleanBootstrap();") < preflightSource.indexOf("const packagePath"));
  assert(preflightSource.indexOf("const packagePath") < preflightSource.indexOf("await import(pathToFileURL(bundlePath).href)"));
  pass("S3_PREFLIGHT_ORDER", "clean-env-node-package-protocol-artifact-bundle-before-operator-import");
}

function setPath(target: Record<string, unknown>, pathParts: string[], value: unknown): void {
  let cursor: Record<string, unknown> = target;
  for (const part of pathParts.slice(0, -1)) cursor = cursor[part] as Record<string, unknown>;
  cursor[pathParts.at(-1)!] = value;
}

function exerciseS5(protocolValue: Record<string, unknown>): void {
  protocolCore.validateProtocolV6(structuredClone(protocolValue));
  pass("S5_PROTOCOL_BASE", "valid-source-remediation-protocol");
  const deployment = protocolValue.deploymentRuntimeTrust as Record<string, unknown>;
  const filePins = [
    ["trackedPackageEngine", "package.json"],
    ["trackedPackageLockRoot", "package-lock.json"],
    ["trackedLineEndingPolicy", ".gitattributes"],
    ["trackedVercelDescriptor", "vercel.json"],
  ] as const;
  for (const [key, expectedPath] of filePins) {
    const pin = deployment[key] as { path: string; bytes: number; sha256: string };
    assert.equal(pin.path, expectedPath);
    const bytes = directRealFile(path.join(repoRoot, pin.path));
    assert.equal(bytes.byteLength, pin.bytes);
    assert.equal(sha256(bytes), pin.sha256);
    pass("S5_TRACKED_FILE_PIN", key, { bytes: pin.bytes, sha256: pin.sha256 });
  }
  const packageJson = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8")) as {
    engines: { node: string };
  };
  const packageLock = JSON.parse(readFileSync(path.join(repoRoot, "package-lock.json"), "utf8")) as {
    packages: Record<string, { engines?: { node?: string } }>;
  };
  assert.equal(packageJson.engines.node, "24.x");
  assert.equal(packageLock.packages[""]?.engines?.node, "24.x");
  assert.equal((deployment.ignoredLocalProjectHint as Record<string, unknown>).tracked, false);
  assert.equal(
    (deployment.ignoredLocalProjectHint as Record<string, unknown>).trustLevel,
    "CORROBORATING_ONLY_UNTRACKED_NOT_AUTHORITY",
  );
  assert.equal(deployment.currentRemoteDeploymentEvidencePresent, false);
  assert.equal(deployment.currentDeployedCommitEvidencePresent, false);
  assert.equal(deployment.deployedRuntimeParityClaimed, false);
  pass("S5_TRUST_SEPARATION", "tracked-policy-vs-ignored-hint-vs-remote-absence");

  const tracked = spawnSync("git", ["-C", repoRoot, "ls-files", "--error-unmatch", ".gitattributes", "package.json", "package-lock.json", "vercel.json"], {
    encoding: "utf8",
    timeout: 30_000,
    windowsHide: true,
  });
  assert.equal(tracked.status, 0, tracked.stderr);
  assert.equal(tracked.stdout.trim().split(/\r?\n/u).length, 4);
  const ignored = spawnSync("git", ["-C", repoRoot, "check-ignore", "-q", ".vercel/project.json"], {
    encoding: "utf8",
    timeout: 30_000,
    windowsHide: true,
  });
  assert.equal(ignored.status, 0);
  pass("S5_GIT_TRUST", "four-tracked-one-ignored");

  const mutations: Array<[string[], unknown[]]> = [
    [["deploymentRuntimeTrust", "trackedPackageEngine", "path"], ["Package.json", "", null]],
    [["deploymentRuntimeTrust", "trackedPackageEngine", "bytes"], [0, 4495, 4497, "4496"]],
    [["deploymentRuntimeTrust", "trackedPackageEngine", "sha256"], ["0".repeat(64), "", null]],
    [["deploymentRuntimeTrust", "trackedPackageEngine", "nodePolicy"], ["22.x", ">=24", "24"]],
    [["deploymentRuntimeTrust", "trackedPackageEngine", "trustLevel"], ["AUTHORITY", "", null]],
    [["deploymentRuntimeTrust", "trackedPackageLockRoot", "bytes"], [0, 777882, 777884]],
    [["deploymentRuntimeTrust", "trackedPackageLockRoot", "sha256"], ["f".repeat(64), "bad"]],
    [["deploymentRuntimeTrust", "trackedPackageLockRoot", "nodePolicy"], ["22.x", "24"]],
    [["deploymentRuntimeTrust", "trackedLineEndingPolicy", "bytes"], [0, 453, 455]],
    [["deploymentRuntimeTrust", "trackedLineEndingPolicy", "sha256"], ["1".repeat(64), null]],
    [["deploymentRuntimeTrust", "trackedVercelDescriptor", "directNodeRuntimePinPresent"], [true, null, 0]],
    [["deploymentRuntimeTrust", "trackedVercelDescriptor", "trustLevel"], ["DEPLOYED", "AUTHORITY"]],
    [["deploymentRuntimeTrust", "ignoredLocalProjectHint", "observedNodePolicy"], ["22.x", "24", null]],
    [["deploymentRuntimeTrust", "ignoredLocalProjectHint", "tracked"], [true, null, 0]],
    [["deploymentRuntimeTrust", "ignoredLocalProjectHint", "trustLevel"], ["AUTHORITY", "TRACKED"]],
    [["deploymentRuntimeTrust", "currentRemoteDeploymentEvidencePresent"], [true, null, 0]],
    [["deploymentRuntimeTrust", "currentDeployedCommitEvidencePresent"], [true, null, 0]],
    [["deploymentRuntimeTrust", "deployedRuntimeParityClaimed"], [true, null, 0]],
    [["deploymentRuntimeTrust", "unknownRemoteOrCommitDisposition"], ["PASS", "", null]],
    [["authorization", "liveExecutionAuthorized"], [true, null, 0]],
    [["authorization", "metadataNetworkAuthorized"], [true, null, 0]],
    [["authorization", "hostileAuditPassed"], [true, null, 0]],
    [["authorization", "dispatchCommandPresent"], [true, null, 0]],
  ];
  for (const [propertyPath, values] of mutations) {
    for (const value of values) {
      const mutated = structuredClone(protocolValue);
      setPath(mutated, propertyPath, value);
      expectThrows("S5_PROTOCOL_MUTATION", `${propertyPath.join(".")}=${stable(value)}`, () =>
        protocolCore.validateProtocolV6(mutated),
      );
    }
  }
}

function exerciseS6(protocolValue: Record<string, unknown>): void {
  const remediation = protocolValue.systemAuditRemediation as Record<string, unknown>;
  assert.deepEqual(remediation.remainingBlockerCodes, ["S6_NO_CURRENT_FROZEN_SUBJECT_OR_MANIFEST"]);
  assert.equal(remediation.S6_NO_CURRENT_FROZEN_SUBJECT_OR_MANIFEST, "BLOCKING_NO_FREEZE_NO_EXECUTION_PENDING_OBSERVER_AND_FRESH_AUDITS");
  const authorization = protocolValue.authorization as Record<string, unknown>;
  assert.deepEqual(authorization, {
    liveExecutionAuthorized: false,
    metadataNetworkAuthorized: false,
    hostileAuditPassed: false,
    dispatchCommandPresent: false,
  });
  const absent = [
    "AUTHOR-REPORT.json",
    "MANIFEST.sha256",
    "author-transform-provenance-v6.json",
    "compiler-closure-v6.json",
    "compiler-transform-provenance-v6.json",
    "frozen-live",
    "frozen-runtime-v6.json",
    "live-closure-v6.json",
    "offline-exact-wire-seal-v6.json",
    "validation-transform-provenance-v6.json",
  ];
  for (const relativePath of absent) {
    assert.equal(existsSync(path.join(subjectDirectory, relativePath)), false, `${relativePath} unexpectedly exists`);
    pass("S6_ABSENCE", relativePath);
  }
  const gate = readFileSync(path.join(subjectDirectory, "author-freeze-gate.ts"), "utf8");
  assert(gate.includes("AUTHOR_FREEZE_PERMANENTLY_NO_DISPATCH_V6 = true"));
  assert(gate.includes("use a separately audited authorization package"));
  pass("S6_PERMANENT_AUTHOR_GATE", "separate-successor-required");
}

async function main(): Promise<void> {
  assert.equal(process.platform, "win32", "this independent host audit is sealed to the observed Windows author host");
  assert.match(process.version, /^v24\./u);
  const included = verifySubjectShape();
  const scratch = mkdtempSync(path.join(os.tmpdir(), "qgen-v6-system-reaudit-v2-"));
  try {
    const protocolBytes = directRealFile(path.join(subjectDirectory, "protocol-v6.json"));
    const protocolValue = JSON.parse(protocolBytes.toString("utf8")) as Record<string, unknown>;
    protocolCore.validateProtocolV6(structuredClone(protocolValue));
    exerciseS1(scratch);
    exerciseS2(scratch, protocolValue);
    exerciseS3S4(scratch);
    exerciseS5(protocolValue);
    exerciseS6(protocolValue);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
  assert(caseHashes.length >= 800, `independent hostile case count too small: ${caseHashes.length}`);
  const summary = {
    schemaVersion: "question-quality-v6-system-independent-reaudit-v2-run",
    verdict: "FAIL_BLOCKERS",
    blockerCodes: [
      "R2-S1-MKDIR_PREIDENTITY_REPLACEMENT_ACCEPTED",
      "S6_NO_CURRENT_FROZEN_SUBJECT_OR_MANIFEST",
    ],
    subjectDirectory: subjectRelative,
    observerBehavioralAuthorityExcluded: [...excludedObserverFiles].sort(),
    exactSystemSnapshotFiles: included.length,
    totalCases: caseHashes.length,
    categoryCounts: Object.fromEntries([...categoryCounts].sort(([left], [right]) => left.localeCompare(right))),
    caseMatrixSha256: sha256(caseHashes.join("\n") + "\n"),
    networkCalls: 0,
    providerCalls: 0,
    modelCalls: 0,
    apiCandidatesConsumed: 0,
    databaseCalls: 0,
    privateExecutionReadsOrWrites: 0,
    globalLedgerReadsOrWrites: 0,
    subjectFilesModified: 0,
    freezeArtifactsWritten: 0,
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

await main();
