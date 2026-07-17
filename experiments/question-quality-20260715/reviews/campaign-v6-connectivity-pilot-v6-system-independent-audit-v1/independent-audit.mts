import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
  writeSync,
  fsyncSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as filesystemDurabilityModule from "../../execution/campaign-v6-connectivity-pilot-v6/filesystem-durability";
import * as durableMarkerModule from "../../execution/campaign-v6-connectivity-pilot-v6/durable-private-marker";
import * as liveIoModule from "../../execution/campaign-v6-connectivity-pilot-v6/live-io";
import * as terminalModule from "../../execution/campaign-v6-connectivity-pilot-v6/terminal-reconciliation-core";
import * as authorEnvironmentModule from "../../execution/campaign-v6-connectivity-pilot-v6/author-environment";
import * as authorGateModule from "../../execution/campaign-v6-connectivity-pilot-v6/author-freeze-gate";

const filesystemDurability =
  (filesystemDurabilityModule as unknown as { default?: typeof filesystemDurabilityModule }).default ??
  filesystemDurabilityModule;
const durableMarker =
  (durableMarkerModule as unknown as { default?: typeof durableMarkerModule }).default ?? durableMarkerModule;
const liveIo = (liveIoModule as unknown as { default?: typeof liveIoModule }).default ?? liveIoModule;
const terminal = (terminalModule as unknown as { default?: typeof terminalModule }).default ?? terminalModule;
const authorEnvironment =
  (authorEnvironmentModule as unknown as { default?: typeof authorEnvironmentModule }).default ??
  authorEnvironmentModule;
const authorGate = (authorGateModule as unknown as { default?: typeof authorGateModule }).default ?? authorGateModule;
const {
  AUTHORIZED_PARENT_DIRECTORY_DURABILITY_PLATFORMS_V6,
  ParentDirectoryDurabilityErrorV6,
  UnsupportedParentDirectoryDurabilityPlatformErrorV6,
  assertParentDirectoryDurabilityPlatformSupportedV6,
  persistParentDirectoryEntryV6,
} = filesystemDurability;
const { DurablePrivateMarkerPhaseErrorV6, writeExclusiveDurablePrivateMarkerV6 } = durableMarker;
const { RepoJsonTransactionCommitUnknownErrorV6, withExclusiveRepoJsonTransactionV6 } = liveIo;
const { TerminalIntentNotDurableErrorV6, commitGlobalSettlementAfterDurableIntentV6 } = terminal;
const { assertNoAuthorToolchainEnvironmentInfluenceV6, buildExactAuthorChildEnvironmentV6 } = authorEnvironment;
const { AUTHOR_FREEZE_PERMANENTLY_NO_DISPATCH_V6, assertAuthorFreezePermanentlyNoDispatchV6 } = authorGate;

const reviewDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(reviewDirectory, "../../../..");
const subjectDirectory = path.join(
  repoRoot,
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v6",
);
const subjectRelative = "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v6";
const excludedBehavioralFiles = new Set(["strict-json-observer.ts", "offline.test.ts"]);
const scratch = path.join(reviewDirectory, "scratch-runtime");

const sha256 = (value: string | Uint8Array): string => createHash("sha256").update(value).digest("hex");
const slash = (value: string): string => value.split(path.sep).join("/");

interface SnapshotRow {
  path: string;
  bytes: number;
  sha256: string;
}

function snapshotSubject(): SnapshotRow[] {
  return readdirSync(subjectDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && !excludedBehavioralFiles.has(entry.name))
    .map((entry) => {
      const absolute = path.join(subjectDirectory, entry.name);
      const bytes = readFileSync(absolute);
      return {
        path: `${subjectRelative}/${entry.name}`,
        bytes: bytes.byteLength,
        sha256: sha256(bytes),
      };
    })
    .sort((left, right) => left.path.localeCompare(right.path));
}

const startSnapshot = snapshotSubject();
const cases: Array<{ id: string; category: string; status: "PASS" | "FAIL"; detail?: string }> = [];

async function scenario(id: string, category: string, body: () => void | Promise<void>): Promise<void> {
  try {
    await body();
    cases.push({ id, category, status: "PASS" });
  } catch (error) {
    cases.push({
      id,
      category,
      status: "FAIL",
      detail: error instanceof Error ? `${error.name}:${error.message}` : String(error),
    });
  }
}

function expectedThrow(body: () => unknown, predicate: (error: unknown) => boolean): unknown {
  try {
    body();
  } catch (error) {
    assert(predicate(error), `unexpected error: ${error instanceof Error ? error.message : String(error)}`);
    return error;
  }
  assert.fail("expected operation to throw");
}

function freshTarget(index: number): { absolute: string; relative: string } {
  const absolute = path.join(scratch, `ledger-${index}.json`);
  writeFileSync(absolute, `${JSON.stringify({ sequence: 0, invariant: "review-local" }, null, 2)}\n`, "utf8");
  return { absolute, relative: slash(path.relative(repoRoot, absolute)) };
}

function linuxDirectoryOperations() {
  return { fsyncDirectory() { /* independent synthetic POSIX success boundary */ } };
}

rmSync(scratch, { recursive: true, force: true });
mkdirSync(scratch, { recursive: false });

// 1-100: the terminal intent must be a real control dependency, not a logging side effect.
for (let index = 0; index < 60; index += 1) {
  await scenario(`INTENT_FAIL_${index}`, "terminal-intent-gating", () => {
    let settle = 0;
    let quarantine = 0;
    const markerFailure = index % 3 === 0 ? new Error(`write-${index}`) :
      index % 3 === 1 ? { code: `FSYNC_${index}` } : `close-${index}`;
    const error = expectedThrow(
      () => commitGlobalSettlementAfterDurableIntentV6({
        persistIntent() { throw markerFailure; },
        globalCandidateQuarantineRequired: index % 2 === 0,
        settle() { settle += 1; return "settled"; },
        quarantine() { quarantine += 1; return "quarantined"; },
      }),
      (candidate) => candidate instanceof TerminalIntentNotDurableErrorV6,
    ) as TerminalIntentNotDurableErrorV6;
    assert.equal(error.persistenceError, markerFailure);
    assert.equal(error.noReplay, true);
    assert.equal(error.retryAllowed, false);
    assert.equal(error.manualInterventionRequired, true);
    assert.equal(settle, 0);
    assert.equal(quarantine, 0);
  });
}
for (let index = 0; index < 20; index += 1) {
  await scenario(`INTENT_SETTLE_${index}`, "terminal-intent-gating", () => {
    const order: string[] = [];
    const result = commitGlobalSettlementAfterDurableIntentV6({
      persistIntent() { order.push("intent"); },
      globalCandidateQuarantineRequired: false,
      settle() { order.push("settle"); return index; },
      quarantine() { order.push("quarantine"); return -1; },
    });
    assert.equal(result, index);
    assert.deepEqual(order, ["intent", "settle"]);
  });
}
for (let index = 0; index < 20; index += 1) {
  await scenario(`INTENT_QUARANTINE_${index}`, "terminal-intent-gating", () => {
    const order: string[] = [];
    const result = commitGlobalSettlementAfterDurableIntentV6({
      persistIntent() { order.push("intent"); },
      globalCandidateQuarantineRequired: true,
      settle() { order.push("settle"); return -1; },
      quarantine() { order.push("quarantine"); return index; },
    });
    assert.equal(result, index);
    assert.deepEqual(order, ["intent", "quarantine"]);
  });
}

// 101-160: unsupported platforms must reject before every mutable primitive.
for (let index = 0; index < 20; index += 1) {
  await scenario(`WIN_DIR_PREMUTATION_${index}`, "platform-pre-mutation", () => {
    let operations = 0;
    expectedThrow(
      () => persistParentDirectoryEntryV6({
        directoryPath: scratch,
        expectedDev: 0n,
        expectedIno: 0n,
        platformForOfflineTestOnly: "win32",
        operationsForOfflineTestOnly: {
          openDirectory() { operations += 1; return -1; },
          fsyncDirectory() { operations += 1; },
          closeDirectory() { operations += 1; },
        },
      }),
      (error) => error instanceof UnsupportedParentDirectoryDurabilityPlatformErrorV6,
    );
    assert.equal(operations, 0);
  });
}
for (let index = 0; index < 20; index += 1) {
  await scenario(`WIN_MARKER_PREMUTATION_${index}`, "platform-pre-mutation", () => {
    const name = `w${index}.private.json`;
    const marker = path.join(scratch, name);
    let opens = 0;
    expectedThrow(
      () => writeExclusiveDurablePrivateMarkerV6({
        directory: scratch,
        name,
        value: { index },
        platformForOfflineTestOnly: "win32",
        operationsForOfflineTestOnly: {
          openExclusive() { opens += 1; return -1; },
        },
      }),
      (error) => error instanceof UnsupportedParentDirectoryDurabilityPlatformErrorV6,
    );
    assert.equal(opens, 0);
    assert.equal(existsSync(marker), false);
  });
}
for (let index = 0; index < 20; index += 1) {
  await scenario(`WIN_TRANSACTION_PREMUTATION_${index}`, "platform-pre-mutation", () => {
    const target = freshTarget(1000 + index);
    const before = readFileSync(target.absolute);
    let mutateCalls = 0;
    expectedThrow(
      () => withExclusiveRepoJsonTransactionV6({
        relativePath: target.relative,
        lockSuffix: `win-${index}`,
        mutate(current) { mutateCalls += 1; return { next: current, value: null }; },
        operationsForOfflineTestOnly: { parentDirectoryPlatform: "win32" },
      }),
      (error) => error instanceof UnsupportedParentDirectoryDurabilityPlatformErrorV6,
    );
    assert.equal(mutateCalls, 0);
    assert.deepEqual(readFileSync(target.absolute), before);
    assert.equal(existsSync(`${target.absolute}.win-${index}.lock`), false);
  });
}

// 161-200: independent parent-directory descriptor/identity/fault matrix.
const scratchIdentity = lstatSync(scratch, { bigint: true });
for (let index = 0; index < 10; index += 1) {
  await scenario(`DIR_SUCCESS_${index}`, "parent-directory-durability", () => {
    const order: string[] = [];
    const result = persistParentDirectoryEntryV6({
      directoryPath: scratch,
      expectedDev: scratchIdentity.dev,
      expectedIno: scratchIdentity.ino,
      platformForOfflineTestOnly: "linux",
      operationsForOfflineTestOnly: {
        openDirectory(directory) { order.push("open"); return openSync(directory, "r"); },
        fsyncDirectory() { order.push("fsync"); },
        closeDirectory(handle) { order.push("close"); closeSync(handle); },
      },
    });
    assert.equal(result, "POSIX_PARENT_DIRECTORY_FSYNC");
    assert.deepEqual(order, ["open", "fsync", "close"]);
  });
}
for (let index = 0; index < 10; index += 1) {
  await scenario(`DIR_OPEN_FAIL_${index}`, "parent-directory-durability", () => {
    const error = expectedThrow(
      () => persistParentDirectoryEntryV6({
        directoryPath: scratch,
        expectedDev: scratchIdentity.dev,
        expectedIno: scratchIdentity.ino,
        platformForOfflineTestOnly: "linux",
        operationsForOfflineTestOnly: { openDirectory() { throw new Error(`open-${index}`); } },
      }),
      (candidate) => candidate instanceof ParentDirectoryDurabilityErrorV6,
    ) as ParentDirectoryDurabilityErrorV6;
    assert.equal(error.phase, "DIRECTORY_OPEN");
  });
}
for (let index = 0; index < 10; index += 1) {
  await scenario(`DIR_FSYNC_FAIL_${index}`, "parent-directory-durability", () => {
    let closed = 0;
    const error = expectedThrow(
      () => persistParentDirectoryEntryV6({
        directoryPath: scratch,
        expectedDev: scratchIdentity.dev,
        expectedIno: scratchIdentity.ino,
        platformForOfflineTestOnly: "linux",
        operationsForOfflineTestOnly: {
          fsyncDirectory() { throw new Error(`fsync-${index}`); },
          closeDirectory(handle) { closed += 1; closeSync(handle); },
        },
      }),
      (candidate) => candidate instanceof ParentDirectoryDurabilityErrorV6,
    ) as ParentDirectoryDurabilityErrorV6;
    assert.equal(error.phase, "DIRECTORY_FSYNC");
    assert.equal(closed, 1);
  });
}
for (let index = 0; index < 10; index += 1) {
  await scenario(`DIR_CLOSE_FAIL_${index}`, "parent-directory-durability", () => {
    const error = expectedThrow(
      () => persistParentDirectoryEntryV6({
        directoryPath: scratch,
        expectedDev: scratchIdentity.dev,
        expectedIno: scratchIdentity.ino,
        platformForOfflineTestOnly: "linux",
        operationsForOfflineTestOnly: {
          fsyncDirectory() {},
          closeDirectory(handle) { closeSync(handle); throw new Error(`close-${index}`); },
        },
      }),
      (candidate) => candidate instanceof ParentDirectoryDurabilityErrorV6,
    ) as ParentDirectoryDurabilityErrorV6;
    assert.equal(error.phase, "DIRECTORY_CLOSE");
  });
}

// 201-260: marker write/fsync/fd-byte/path/close/parent ordering and fault behavior.
for (let index = 0; index < 10; index += 1) {
  await scenario(`MARKER_SUCCESS_${index}`, "durable-marker", () => {
    const name = `s${index}.private.json`;
    const marker = path.join(scratch, name);
    const order: string[] = [];
    const receipt = writeExclusiveDurablePrivateMarkerV6({
      directory: scratch,
      name,
      value: { index, invariant: "intent-before-settlement" },
      platformForOfflineTestOnly: "linux",
      operationsForOfflineTestOnly: {
        openExclusive(file) { order.push("open"); return openSync(file, "wx+", 0o600); },
        write(handle, bytes, offset, length) {
          order.push("write");
          return writeSync(handle, bytes, offset, Math.min(length, (index % 4) + 1), null);
        },
        fsync(handle) { order.push("file-fsync"); fsyncSync(handle); },
        close(handle) { order.push("file-close"); closeSync(handle); },
      },
      directoryOperationsForOfflineTestOnly: {
        fsyncDirectory() { order.push("parent-fsync"); },
      },
    });
    assert.equal(receipt.fileSha256, sha256(readFileSync(marker)));
    assert(order.indexOf("file-fsync") > order.indexOf("write"));
    assert(order.indexOf("file-close") > order.indexOf("file-fsync"));
    assert(order.indexOf("parent-fsync") > order.indexOf("file-close"));
    unlinkSync(marker);
  });
}
for (let index = 0; index < 10; index += 1) {
  await scenario(`MARKER_WRITE_FAIL_${index}`, "durable-marker", () => {
    const name = `z${index}.private.json`;
    const marker = path.join(scratch, name);
    const error = expectedThrow(
      () => writeExclusiveDurablePrivateMarkerV6({
        directory: scratch,
        name,
        value: { index },
        platformForOfflineTestOnly: "linux",
        operationsForOfflineTestOnly: { write() { return index % 2 === 0 ? 0 : -1; } },
        directoryOperationsForOfflineTestOnly: linuxDirectoryOperations(),
      }),
      (candidate) => candidate instanceof DurablePrivateMarkerPhaseErrorV6,
    ) as DurablePrivateMarkerPhaseErrorV6;
    assert.equal(error.phase, "WRITE");
    if (existsSync(marker)) unlinkSync(marker);
  });
}
for (let index = 0; index < 10; index += 1) {
  await scenario(`MARKER_FSYNC_FAIL_${index}`, "durable-marker", () => {
    const name = `f${index}.private.json`;
    const marker = path.join(scratch, name);
    const error = expectedThrow(
      () => writeExclusiveDurablePrivateMarkerV6({
        directory: scratch,
        name,
        value: { index },
        platformForOfflineTestOnly: "linux",
        operationsForOfflineTestOnly: { fsync() { throw new Error(`fsync-${index}`); } },
        directoryOperationsForOfflineTestOnly: linuxDirectoryOperations(),
      }),
      (candidate) => candidate instanceof DurablePrivateMarkerPhaseErrorV6,
    ) as DurablePrivateMarkerPhaseErrorV6;
    assert.equal(error.phase, "FSYNC");
    if (existsSync(marker)) unlinkSync(marker);
  });
}
for (let index = 0; index < 10; index += 1) {
  await scenario(`MARKER_CLOSE_FAIL_${index}`, "durable-marker", () => {
    const name = `c${index}.private.json`;
    const marker = path.join(scratch, name);
    const error = expectedThrow(
      () => writeExclusiveDurablePrivateMarkerV6({
        directory: scratch,
        name,
        value: { index },
        platformForOfflineTestOnly: "linux",
        operationsForOfflineTestOnly: {
          close(handle) { closeSync(handle); throw new Error(`close-${index}`); },
        },
        directoryOperationsForOfflineTestOnly: linuxDirectoryOperations(),
      }),
      (candidate) => candidate instanceof DurablePrivateMarkerPhaseErrorV6,
    ) as DurablePrivateMarkerPhaseErrorV6;
    assert.equal(error.phase, "CLOSE");
    if (existsSync(marker)) unlinkSync(marker);
  });
}
for (let index = 0; index < 10; index += 1) {
  await scenario(`MARKER_PRE_ATTEST_RACE_${index}`, "durable-marker", () => {
    const name = `r${index}.private.json`;
    const marker = path.join(scratch, name);
    const moved = `${marker}.moved`;
    const error = expectedThrow(
      () => writeExclusiveDurablePrivateMarkerV6({
        directory: scratch,
        name,
        value: { index },
        platformForOfflineTestOnly: "linux",
        raceHooksForOfflineTestOnly: {
          afterFileFsyncBeforeIdentityAttestation() { renameSync(marker, moved); },
        },
        directoryOperationsForOfflineTestOnly: linuxDirectoryOperations(),
      }),
      (candidate) => candidate instanceof DurablePrivateMarkerPhaseErrorV6,
    ) as DurablePrivateMarkerPhaseErrorV6;
    assert.equal(error.phase, "ATTEST");
    if (existsSync(marker)) unlinkSync(marker);
    if (existsSync(moved)) unlinkSync(moved);
  });
}
for (let index = 0; index < 10; index += 1) {
  await scenario(`MARKER_POST_DIR_RACE_${index}`, "durable-marker", () => {
    const name = `p${index}.private.json`;
    const marker = path.join(scratch, name);
    const hostile = path.join(scratch, `hostile-${index}.json`);
    writeFileSync(hostile, `${JSON.stringify({ hostile: index })}\n`, "utf8");
    const error = expectedThrow(
      () => writeExclusiveDurablePrivateMarkerV6({
        directory: scratch,
        name,
        value: { index },
        platformForOfflineTestOnly: "linux",
        raceHooksForOfflineTestOnly: {
          afterDirectoryDurabilityBeforeFinalAttestation() {
            unlinkSync(marker);
            linkSync(hostile, marker);
          },
        },
        directoryOperationsForOfflineTestOnly: linuxDirectoryOperations(),
      }),
      (candidate) => candidate instanceof DurablePrivateMarkerPhaseErrorV6,
    ) as DurablePrivateMarkerPhaseErrorV6;
    assert.equal(error.phase, "FINAL_ATTEST");
    if (existsSync(marker)) unlinkSync(marker);
    unlinkSync(hostile);
  });
}

// 261-340: actual review-local repository transactions, including rename/identity/durability uncertainty.
for (let index = 0; index < 20; index += 1) {
  await scenario(`TX_SUCCESS_${index}`, "repository-transaction", () => {
    const target = freshTarget(2000 + index);
    const result = withExclusiveRepoJsonTransactionV6({
      relativePath: target.relative,
      lockSuffix: `success-${index}`,
      mutate(current) {
        const row = current as { sequence: number; invariant: string };
        return { next: { ...row, sequence: row.sequence + 1 }, value: row.sequence + 1 };
      },
      operationsForOfflineTestOnly: {
        parentDirectoryPlatform: "linux",
        parentDirectoryOperations: linuxDirectoryOperations(),
      },
    });
    assert.equal(result.committed, true);
    assert.equal(result.value, 1);
    assert.deepEqual(result.cleanupWarningKinds, []);
    assert.equal((JSON.parse(readFileSync(target.absolute, "utf8")) as { sequence: number }).sequence, 1);
  });
}
for (let index = 0; index < 10; index += 1) {
  await scenario(`TX_TEMP_REPLACEMENT_${index}`, "repository-transaction", () => {
    const target = freshTarget(2100 + index);
    const before = readFileSync(target.absolute);
    let moved = "";
    expectedThrow(
      () => withExclusiveRepoJsonTransactionV6({
        relativePath: target.relative,
        lockSuffix: `temp-race-${index}`,
        mutate() { return { next: { sequence: 1, invariant: "intended" }, value: null }; },
        raceHooksForOfflineTestOnly: {
          beforeCommitReattestation(tempPath) {
            moved = `${tempPath}.original`;
            renameSync(tempPath, moved);
            writeFileSync(tempPath, `${JSON.stringify({ sequence: 999, invariant: "replacement" })}\n`, "utf8");
          },
        },
        operationsForOfflineTestOnly: {
          parentDirectoryPlatform: "linux",
          parentDirectoryOperations: linuxDirectoryOperations(),
        },
      }),
      (error) => error instanceof Error && !(error instanceof RepoJsonTransactionCommitUnknownErrorV6),
    );
    assert.deepEqual(readFileSync(target.absolute), before);
    if (moved && existsSync(moved)) unlinkSync(moved);
  });
}
for (let index = 0; index < 10; index += 1) {
  await scenario(`TX_TARGET_REPLACEMENT_${index}`, "repository-transaction", () => {
    const target = freshTarget(2200 + index);
    const before = readFileSync(target.absolute);
    const backup = `${target.absolute}.backup`;
    expectedThrow(
      () => withExclusiveRepoJsonTransactionV6({
        relativePath: target.relative,
        lockSuffix: `target-race-${index}`,
        mutate() { return { next: { sequence: 1, invariant: "intended" }, value: null }; },
        raceHooksForOfflineTestOnly: {
          beforeCommitReattestation() {
            renameSync(target.absolute, backup);
            writeFileSync(target.absolute, `${JSON.stringify({ sequence: 777, invariant: "replacement" })}\n`, "utf8");
          },
        },
        operationsForOfflineTestOnly: {
          parentDirectoryPlatform: "linux",
          parentDirectoryOperations: linuxDirectoryOperations(),
        },
      }),
      (error) => error instanceof Error && !(error instanceof RepoJsonTransactionCommitUnknownErrorV6),
    );
    unlinkSync(target.absolute);
    renameSync(backup, target.absolute);
    assert.deepEqual(readFileSync(target.absolute), before);
  });
}
for (let index = 0; index < 10; index += 1) {
  await scenario(`TX_POST_RENAME_TAMPER_${index}`, "repository-transaction", () => {
    const target = freshTarget(2300 + index);
    const error = expectedThrow(
      () => withExclusiveRepoJsonTransactionV6({
        relativePath: target.relative,
        lockSuffix: `post-rename-${index}`,
        mutate() { return { next: { sequence: 1, invariant: "intended" }, value: null }; },
        raceHooksForOfflineTestOnly: {
          afterAtomicRenameBeforeCommitAttestation() {
            writeFileSync(target.absolute, `${JSON.stringify({ sequence: 888888, invariant: "tampered" })}\n`, "utf8");
          },
        },
        operationsForOfflineTestOnly: {
          parentDirectoryPlatform: "linux",
          parentDirectoryOperations: linuxDirectoryOperations(),
        },
      }),
      (candidate) => candidate instanceof RepoJsonTransactionCommitUnknownErrorV6,
    ) as RepoJsonTransactionCommitUnknownErrorV6;
    assert.equal(error.stage, "POST_RENAME_ATTESTATION");
    assert.equal(error.noReplay, true);
    assert.equal(error.retryAllowed, false);
  });
}
for (let index = 0; index < 10; index += 1) {
  await scenario(`TX_TARGET_FSYNC_FAIL_${index}`, "repository-transaction", () => {
    const target = freshTarget(2400 + index);
    const error = expectedThrow(
      () => withExclusiveRepoJsonTransactionV6({
        relativePath: target.relative,
        lockSuffix: `target-fsync-${index}`,
        mutate() { return { next: { sequence: 1, invariant: "intended" }, value: null }; },
        operationsForOfflineTestOnly: {
          parentDirectoryPlatform: "linux",
          fsyncRenamedTarget() { throw new Error(`target-fsync-${index}`); },
          parentDirectoryOperations: linuxDirectoryOperations(),
        },
      }),
      (candidate) => candidate instanceof RepoJsonTransactionCommitUnknownErrorV6,
    ) as RepoJsonTransactionCommitUnknownErrorV6;
    assert.equal(error.stage, "POST_RENAME_DURABILITY");
  });
}
for (let index = 0; index < 10; index += 1) {
  await scenario(`TX_PARENT_FSYNC_FAIL_${index}`, "repository-transaction", () => {
    const target = freshTarget(2500 + index);
    const error = expectedThrow(
      () => withExclusiveRepoJsonTransactionV6({
        relativePath: target.relative,
        lockSuffix: `parent-fsync-${index}`,
        mutate() { return { next: { sequence: 1, invariant: "intended" }, value: null }; },
        operationsForOfflineTestOnly: {
          parentDirectoryPlatform: "linux",
          parentDirectoryOperations: { fsyncDirectory() { throw new Error(`parent-fsync-${index}`); } },
        },
      }),
      (candidate) => candidate instanceof RepoJsonTransactionCommitUnknownErrorV6,
    ) as RepoJsonTransactionCommitUnknownErrorV6;
    assert.equal(error.stage, "POST_RENAME_DURABILITY");
  });
}
for (let index = 0; index < 10; index += 1) {
  await scenario(`TX_POST_COMMIT_CLOSE_WARNING_${index}`, "repository-transaction", () => {
    const target = freshTarget(2600 + index);
    const result = withExclusiveRepoJsonTransactionV6({
      relativePath: target.relative,
      lockSuffix: `close-warning-${index}`,
      mutate() { return { next: { sequence: 1, invariant: "intended" }, value: null }; },
      operationsForOfflineTestOnly: {
        parentDirectoryPlatform: "linux",
        parentDirectoryOperations: linuxDirectoryOperations(),
        closeTempHandle(handle) { closeSync(handle); throw new Error(`close-warning-${index}`); },
      },
    });
    assert.equal(result.committed, true);
    assert.deepEqual(result.cleanupWarningKinds, ["TEMP_CLOSE_FAILED_AFTER_COMMIT"]);
  });
}

// 341-375: policy, closure, bootstrap, manifest, deployment-parity, and explicit blocker reproductions.
const liveIoSource = readFileSync(path.join(subjectDirectory, "live-io.ts"), "utf8");
const runnerSource = readFileSync(path.join(subjectDirectory, "production-runner.ts"), "utf8");
const markerSource = readFileSync(path.join(subjectDirectory, "durable-private-marker.ts"), "utf8");
const buildSource = readFileSync(path.join(subjectDirectory, "build-offline.mts"), "utf8");
const buildFrozenSource = readFileSync(path.join(subjectDirectory, "build-frozen-runtime.mts"), "utf8");
const operatorSource = readFileSync(path.join(subjectDirectory, "operator-wrapper.mts"), "utf8");
const frozenCoreSource = readFileSync(path.join(subjectDirectory, "frozen-runtime-core.ts"), "utf8");
const protocol = JSON.parse(readFileSync(path.join(subjectDirectory, "protocol-v6.json"), "utf8")) as Record<string, unknown>;
const packageJson = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8")) as Record<string, unknown>;

for (let index = 0; index < 5; index += 1) {
  await scenario(`STATIC_RUN_DIR_DURABILITY_GAP_${index}`, "blocker-reproduction", () => {
    const start = liveIoSource.indexOf("export function createExclusivePrivateRunDirectoryV6");
    const end = liveIoSource.indexOf("function resolveRepoPath", start);
    const body = liveIoSource.slice(start, end);
    assert(start >= 0 && end > start);
    assert((body.match(/\bmkdirSync\s*\(/gu) ?? []).length >= 2);
    assert.equal(/persistParentDirectoryEntryV6|fsyncSync|openSync/.test(body), false);
    assert(markerSource.includes("persistParentDirectoryEntryV6({\n      directoryPath: directory"));
    assert(runnerSource.includes("durableBeforeGlobalReservation: true"));
  });
}
for (let index = 0; index < 5; index += 1) {
  await scenario(`STATIC_UNSEALED_TSX_${index}`, "blocker-reproduction", () => {
    assert(buildSource.includes("node_modules/tsx/dist/cli.mjs"));
    assert(buildSource.includes("const MANIFEST_PATHS = ["));
    assert.equal(/MANIFEST_PATHS[\s\S]*node_modules\/tsx/u.test(buildSource), false);
    assert.equal(/tsx|loader/iu.test(buildFrozenSource.slice(buildFrozenSource.indexOf("const EXACT_BUILD_OPTIONS_V6"))), false);
    assert.equal(/tsx/i.test(frozenCoreSource.slice(frozenCoreSource.indexOf("function validateBundlerToolchainV6"), frozenCoreSource.indexOf("export function captureCurrentNodeRuntimeV6"))), false);
  });
}
for (let index = 0; index < 5; index += 1) {
  await scenario(`STATIC_OPERATOR_PRELOAD_GAP_${index}`, "blocker-reproduction", () => {
    assert(operatorSource.startsWith("import { spawn }"));
    assert.equal(operatorSource.includes("assertExactOperatorEnvironment"), false);
    assert.equal(operatorSource.includes("NODE_OPTIONS"), false);
    const preload = path.join(reviewDirectory, "preload-probe.cjs");
    const child = spawnSync(process.execPath, ["-e", "process.stdout.write(String(globalThis.__v6AuditPreloaded === true))"], {
      cwd: repoRoot,
      env: { ...process.env, NODE_OPTIONS: `--require=${preload}` },
      encoding: "utf8",
      windowsHide: true,
    });
    assert.equal(child.status, 0);
    assert.equal(child.stdout, "true");
  });
}
for (let index = 0; index < 5; index += 1) {
  await scenario(`STATIC_CASE_ALIAS_ENV_GAP_${index}`, "blocker-reproduction", () => {
    assert.doesNotThrow(() => assertNoAuthorToolchainEnvironmentInfluenceV6({
      PATH: "x", COMSPEC: "x", PATHEXT: "x", SystemRoot: "x", TEMP: "x", TMP: "x", WINDIR: "x",
      node_options: "--require=review-local-preload.cjs",
      node_path: "review-local-module-path",
      esbuild_binary_path: "review-local-binary",
    }));
    const child = buildExactAuthorChildEnvironmentV6({
      PATH: "x", COMSPEC: "x", PATHEXT: "x", SystemRoot: "x", TEMP: "x", TMP: "x", WINDIR: "x",
      node_options: "--require=review-local-preload.cjs",
    });
    assert.equal(Object.hasOwn(child, "node_options"), false);
  });
}
for (let index = 0; index < 5; index += 1) {
  await scenario(`STATIC_DEPLOY_RUNTIME_UNBOUND_${index}`, "blocker-reproduction", () => {
    assert.equal(Object.hasOwn(packageJson, "engines"), false);
    const vercelConfig = JSON.parse(readFileSync(path.join(repoRoot, "vercel.json"), "utf8")) as Record<string, unknown>;
    assert.equal(Object.hasOwn(vercelConfig, "nodeVersion"), false);
    const ignoredProjectBytes = readFileSync(path.join(repoRoot, ".vercel/project.json"));
    const ignoredProject = JSON.parse(ignoredProjectBytes.toString("utf8")) as { settings?: { nodeVersion?: unknown } };
    assert.equal(ignoredProject.settings?.nodeVersion, "24.x");
    const tracked = spawnSync("git", ["ls-files", "--error-unmatch", ".vercel/project.json"], {
      cwd: repoRoot, encoding: "utf8", windowsHide: true,
    });
    assert.notEqual(tracked.status, 0);
    assert.equal(buildSource.includes(".vercel/project.json"), false);
    assert.equal(buildSource.includes("vercel.json"), false);
  });
}
for (let index = 0; index < 5; index += 1) {
  await scenario(`STATIC_UNFROZEN_SUBJECT_${index}`, "blocker-reproduction", () => {
    for (const relative of [
      "MANIFEST.sha256", "AUTHOR-REPORT.json", "frozen-runtime-v6.json", "live-closure-v6.json",
      "compiler-closure-v6.json", "offline-exact-wire-seal-v6.json",
      "frozen-live/live-child-v6.bundle.mjs", "frozen-live/operator-wrapper-v6.bundle.mjs",
      "frozen-live/capture-price-snapshot-v6.bundle.mjs",
    ]) assert.equal(existsSync(path.join(subjectDirectory, relative)), false, relative);
    const frozen = protocol.frozenRuntimeContract as Record<string, unknown>;
    assert.equal(typeof frozen.artifactSha256, "string");
    assert.equal(existsSync(path.join(repoRoot, String(frozen.artifactPath))), false);
  });
}
for (let index = 0; index < 5; index += 1) {
  await scenario(`STATIC_POSITIVE_SYSTEM_ORDERING_${index}`, "system-ordering", () => {
    const rename = liveIoSource.indexOf("renameSync(tempPath, target)");
    const targetFsync = liveIoSource.indexOf("fsyncRenamedTarget ?? fsyncSync", rename);
    const parentFsync = liveIoSource.indexOf("persistParentDirectoryEntryV6({", targetFsync);
    const postAttest = liveIoSource.indexOf("assertCommittedTargetMatchesTempV6", parentFsync);
    assert(rename >= 0 && targetFsync > rename && parentFsync > targetFsync && postAttest > parentFsync);
    const intent = runnerSource.indexOf("commitGlobalSettlementAfterDurableIntentV6({");
    const settle = runnerSource.indexOf("settle: () => settleGlobal(settlement)", intent);
    assert(intent >= 0 && settle > intent);
    assert.equal(AUTHOR_FREEZE_PERMANENTLY_NO_DISPATCH_V6, true);
    expectedThrow(() => assertAuthorFreezePermanentlyNoDispatchV6(), (error) => error instanceof Error);
  });
}

// Direct policy matrix (not dependent on author tests).
for (const [index, platform] of AUTHORIZED_PARENT_DIRECTORY_DURABILITY_PLATFORMS_V6.entries()) {
  await scenario(`PLATFORM_ALLOW_${index}_${platform}`, "platform-policy", () => {
    assert.doesNotThrow(() => assertParentDirectoryDurabilityPlatformSupportedV6(platform));
  });
}
for (const [index, platform] of ["win32", "android", "haiku", "cygwin", "unknown-a", "unknown-b"].entries()) {
  await scenario(`PLATFORM_DENY_${index}_${platform}`, "platform-policy", () => {
    expectedThrow(
      () => assertParentDirectoryDurabilityPlatformSupportedV6(platform as NodeJS.Platform),
      (error) => error instanceof UnsupportedParentDirectoryDurabilityPlatformErrorV6,
    );
  });
}

rmSync(scratch, { recursive: true, force: true });
const endSnapshot = snapshotSubject();
assert.deepEqual(endSnapshot, startSnapshot, "non-observer system subject changed during independent audit");
const failed = cases.filter((candidate) => candidate.status === "FAIL");
const categoryCounts = Object.fromEntries(
  [...new Set(cases.map((candidate) => candidate.category))].sort().map((category) => [
    category,
    {
      total: cases.filter((candidate) => candidate.category === category).length,
      passed: cases.filter((candidate) => candidate.category === category && candidate.status === "PASS").length,
      failed: cases.filter((candidate) => candidate.category === category && candidate.status === "FAIL").length,
    },
  ]),
);
const ignoredProjectBytes = readFileSync(path.join(repoRoot, ".vercel/project.json"));
const output = {
  schemaVersion: "campaign-v6-connectivity-pilot-v6-system-independent-audit-v1-matrix",
  verdict: failed.length === 0 ? "EXPECTED_BEHAVIOR_AND_BLOCKERS_REPRODUCED" : "AUDIT_HARNESS_FAILURE",
  totalScenarios: cases.length,
  passedScenarios: cases.length - failed.length,
  failedScenarios: failed.length,
  categoryCounts,
  failedCases: failed,
  subject: {
    path: subjectRelative,
    excludedBehavioralAuthority: [...excludedBehavioralFiles].sort(),
    exactNonObserverTopLevelFiles: startSnapshot.length,
    rows: startSnapshot,
    snapshotSha256: sha256(JSON.stringify(startSnapshot)),
    startEqualsEnd: true,
  },
  blockerReproductions: {
    newRunDirectoryParentDurabilityMissing: true,
    authorAndCompilerTsxImplementationUnsealed: true,
    operatorBootstrapPreloadEnvironmentUnsealed: true,
    caseAliasEnvironmentPolicyAccepted: true,
    deployedNodeRuntimeAuthorityMissing: true,
    currentFrozenManifestAndArtifactsMissing: true,
  },
  deploymentRuntimeObservation: {
    ignoredProjectMetadataSha256: sha256(ignoredProjectBytes),
    ignoredProjectMetadataTracked: false,
    observedIgnoredNodeMajorPolicy: "24.x",
    packageEnginesNodePresent: false,
    trackedVercelNodePinPresent: false,
    productionParityAuthority: false,
  },
  accessCounters: {
    network: 0,
    metadata: 0,
    provider: 0,
    model: 0,
    api: 0,
    database: 0,
    credentials: 0,
    subjectPrivateReads: 0,
    subjectPrivateWrites: 0,
    globalLedgerReads: 0,
    globalLedgerWrites: 0,
    subjectWrites: 0,
    freezeWrites: 0,
    reviewLocalRepositoryTransactionScenarios: 100,
    reviewLocalMarkerScenarios: 80,
    reviewLocalParentDirectoryScenarios: 60,
  },
};
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
