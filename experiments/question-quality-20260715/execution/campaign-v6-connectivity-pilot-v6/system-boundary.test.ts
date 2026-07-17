import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  DurablePrivateMarkerPhaseErrorV6,
  writeExclusiveDurablePrivateMarkerV6,
  type DurablePrivateMarkerOperationsV6,
} from "./durable-private-marker";
import { assertBundlerExternalResolutionPolicyV6 } from "./bundler-toolchain-provenance";
import {
  assertNoAuthorToolchainEnvironmentInfluenceV6,
  buildExactAuthorChildEnvironmentV6,
} from "./author-environment";
import {
  createExclusivePrivateRunDirectoryAtRootV6,
  PrivateRunDirectoryCommitUnknownErrorV6,
  RepoJsonTransactionCommitUnknownErrorV6,
  withExclusiveRepoJsonTransactionV6,
} from "./live-io";
import { UnsupportedParentDirectoryDurabilityPlatformErrorV6 } from "./filesystem-durability";
import {
  commitGlobalSettlementAfterDurableIntentV6,
  TerminalIntentNotDurableErrorV6,
} from "./terminal-reconciliation-core";
import { validateProtocolV6 } from "./protocol-core";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const privateRoot = path.join(here, "private");

function repoRelative(absolute: string): string {
  const relative = path.relative(repoRoot, absolute).split(path.sep).join("/");
  assert(!relative.startsWith("../") && !path.isAbsolute(relative));
  return relative;
}

function jsonHash(filePath: string): string {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

const syntheticPosixTransactionDurability = {
  parentDirectoryPlatform: "linux" as const,
  parentDirectoryOperations: {
    fsyncDirectory() {
      /* synthetic successful POSIX fsync boundary */
    },
  },
};

const syntheticPosixMarkerDurability = {
  platformForOfflineTestOnly: "linux" as const,
  directoryOperationsForOfflineTestOnly: {
    fsyncDirectory() {
      /* synthetic successful POSIX fsync boundary */
    },
  },
};

test("private run directory durably persists each new directory entry in its exact existing parent", () => {
  const root = mkdtempSync(
    path.join(privateRoot, "system-boundary-run-directory-success-"),
  );
  const fsyncedParents: string[] = [];
  try {
    const runRoot = createExclusivePrivateRunDirectoryAtRootV6({
      privateRootPath: root,
      runId: "run-success",
      operationsForOfflineTestOnly: {
        platform: "linux",
        privateRootDirectoryOperations: {
          openDirectory(directoryPath) {
            fsyncedParents.push(path.resolve(directoryPath));
            return openSync(directoryPath, "r");
          },
          fsyncDirectory() {
            /* synthetic successful POSIX fsync */
          },
        },
        runsRootDirectoryOperations: {
          openDirectory(directoryPath) {
            fsyncedParents.push(path.resolve(directoryPath));
            return openSync(directoryPath, "r");
          },
          fsyncDirectory() {
            /* synthetic successful POSIX fsync */
          },
        },
      },
    });
    assert.equal(runRoot, path.join(root, "runs", "run-success"));
    assert.deepEqual(fsyncedParents, [
      path.resolve(root),
      path.resolve(root, "runs"),
    ]);
    assert.equal(existsSync(runRoot), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("private run directory rejects unsupported platform and unsafe run id before mkdir", () => {
  const root = mkdtempSync(
    path.join(privateRoot, "system-boundary-run-directory-preflight-"),
  );
  try {
    assert.throws(
      () =>
        createExclusivePrivateRunDirectoryAtRootV6({
          privateRootPath: root,
          runId: "run-win32",
          operationsForOfflineTestOnly: { platform: "win32" },
        }),
      UnsupportedParentDirectoryDurabilityPlatformErrorV6,
    );
    assert.equal(existsSync(path.join(root, "runs")), false);
    assert.throws(
      () =>
        createExclusivePrivateRunDirectoryAtRootV6({
          privateRootPath: root,
          runId: "../escape",
          operationsForOfflineTestOnly: { platform: "linux" },
        }),
      /one safe path segment/u,
    );
    assert.equal(existsSync(path.join(root, "runs")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("runs-root parent fsync fault is typed COMMIT_UNKNOWN and cannot create a run", () => {
  const root = mkdtempSync(
    path.join(privateRoot, "system-boundary-runs-root-fsync-fault-"),
  );
  try {
    let observed: unknown = null;
    try {
      createExclusivePrivateRunDirectoryAtRootV6({
        privateRootPath: root,
        runId: "must-not-exist",
        operationsForOfflineTestOnly: {
          platform: "linux",
          privateRootDirectoryOperations: {
            fsyncDirectory() {
              throw new Error("injected private-root fsync fault");
            },
          },
        },
      });
    } catch (error) {
      observed = error;
    }
    assert(observed instanceof PrivateRunDirectoryCommitUnknownErrorV6);
    assert.equal(observed.stage, "RUNS_ROOT_ENTRY_DURABILITY");
    assert.equal(observed.noReplay, true);
    assert.equal(observed.retryAllowed, false);
    assert.equal(observed.manualInterventionRequired, true);
    assert.equal(existsSync(path.join(root, "runs")), true);
    assert.equal(existsSync(path.join(root, "runs", "must-not-exist")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("runs-root identity failure immediately after successful mkdir is typed COMMIT_UNKNOWN", () => {
  const root = mkdtempSync(
    path.join(privateRoot, "system-boundary-runs-root-immediate-identity-"),
  );
  try {
    assert.throws(
      () =>
        createExclusivePrivateRunDirectoryAtRootV6({
          privateRootPath: root,
          runId: "must-not-run",
          operationsForOfflineTestOnly: { platform: "linux" },
          raceHooksForOfflineTestOnly: {
            afterRunsRootMkdirBeforeIdentity() {
              rmSync(path.join(root, "runs"), { recursive: true, force: true });
            },
          },
        }),
      (error: unknown) => {
        assert(error instanceof PrivateRunDirectoryCommitUnknownErrorV6);
        assert.equal(error.stage, "RUNS_ROOT_ENTRY_DURABILITY");
        assert.equal(error.noReplay, true);
        assert.equal(error.retryAllowed, false);
        return true;
      },
    );
    assert.equal(existsSync(path.join(root, "runs", "must-not-run")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("run-root parent fsync fault is typed COMMIT_UNKNOWN with no retry authority", () => {
  const root = mkdtempSync(
    path.join(privateRoot, "system-boundary-run-root-fsync-fault-"),
  );
  try {
    let observed: unknown = null;
    try {
      createExclusivePrivateRunDirectoryAtRootV6({
        privateRootPath: root,
        runId: "created-unknown",
        operationsForOfflineTestOnly: {
          platform: "linux",
          privateRootDirectoryOperations: {
            fsyncDirectory() {
              /* synthetic successful POSIX fsync */
            },
          },
          runsRootDirectoryOperations: {
            fsyncDirectory() {
              throw new Error("injected runs-root fsync fault");
            },
          },
        },
      });
    } catch (error) {
      observed = error;
    }
    assert(observed instanceof PrivateRunDirectoryCommitUnknownErrorV6);
    assert.equal(observed.stage, "RUN_ROOT_ENTRY_DURABILITY");
    assert.equal(observed.noReplay, true);
    assert.equal(observed.retryAllowed, false);
    assert.equal(existsSync(path.join(root, "runs", "created-unknown")), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("directory replacement races after each ancestor fsync are reattested and typed COMMIT_UNKNOWN", () => {
  const root = mkdtempSync(
    path.join(privateRoot, "system-boundary-run-directory-races-"),
  );
  try {
    let runsRace: unknown = null;
    try {
      createExclusivePrivateRunDirectoryAtRootV6({
        privateRootPath: root,
        runId: "runs-race",
        operationsForOfflineTestOnly: {
          platform: "linux",
          privateRootDirectoryOperations: { fsyncDirectory() {} },
        },
        raceHooksForOfflineTestOnly: {
          afterPrivateRootDurabilityBeforeRunsRootReattestation() {
            renameSync(
              path.join(root, "runs"),
              path.join(root, "runs-displaced"),
            );
            mkdirSync(path.join(root, "runs"));
          },
        },
      });
    } catch (error) {
      runsRace = error;
    }
    assert(runsRace instanceof PrivateRunDirectoryCommitUnknownErrorV6);
    assert.equal(runsRace.stage, "RUNS_ROOT_ENTRY_DURABILITY");

    rmSync(path.join(root, "runs"), { recursive: true, force: true });
    rmSync(path.join(root, "runs-displaced"), { recursive: true, force: true });
    let runRace: unknown = null;
    try {
      createExclusivePrivateRunDirectoryAtRootV6({
        privateRootPath: root,
        runId: "run-race",
        operationsForOfflineTestOnly: {
          platform: "linux",
          privateRootDirectoryOperations: { fsyncDirectory() {} },
          runsRootDirectoryOperations: { fsyncDirectory() {} },
        },
        raceHooksForOfflineTestOnly: {
          afterRunsRootDurabilityBeforeRunRootReattestation() {
            const runPath = path.join(root, "runs", "run-race");
            renameSync(runPath, path.join(root, "runs", "run-race-displaced"));
            mkdirSync(runPath);
          },
        },
      });
    } catch (error) {
      runRace = error;
    }
    assert(runRace instanceof PrivateRunDirectoryCommitUnknownErrorV6);
    assert.equal(runRace.stage, "RUN_ROOT_ENTRY_DURABILITY");
    assert.equal(runRace.noReplay, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Windows can atomically rename a synthetic file while its descriptor remains open", () => {
  const root = mkdtempSync(
    path.join(privateRoot, "system-boundary-raw-open-rename-"),
  );
  try {
    const source = path.join(root, "source.tmp");
    const target = path.join(root, "target.json");
    const handle = openSync(source, "wx+");
    try {
      writeSync(handle, Buffer.from("{}\n", "utf8"), 0, 3, null);
      fsyncSync(handle);
      renameSync(source, target);
      assert.equal(readFileSync(target, "utf8"), "{}\n");
    } finally {
      closeSync(handle);
    }
    assert.equal(process.platform, "win32");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Windows parent-entry durability is rejected before marker or ledger mutation", () => {
  const root = mkdtempSync(
    path.join(privateRoot, "system-boundary-win32-durability-reject-"),
  );
  try {
    const markerPath = path.join(root, "unsupported.private.json");
    let settleCalls = 0;
    let quarantineCalls = 0;
    assert.throws(
      () =>
        commitGlobalSettlementAfterDurableIntentV6({
          persistIntent: () => {
            writeExclusiveDurablePrivateMarkerV6({
              directory: root,
              name: "unsupported.private.json",
              value: { status: "MUST_NOT_CREATE" },
            });
          },
          globalCandidateQuarantineRequired: false,
          settle: () => {
            settleCalls += 1;
          },
          quarantine: () => {
            quarantineCalls += 1;
          },
        }),
      (error: unknown) =>
        error instanceof TerminalIntentNotDurableErrorV6 &&
        error.persistenceError instanceof
          UnsupportedParentDirectoryDurabilityPlatformErrorV6,
    );
    assert.equal(existsSync(markerPath), false);
    assert.equal(settleCalls, 0);
    assert.equal(quarantineCalls, 0);

    const target = path.join(root, "synthetic-ledger.json");
    writeFileSync(target, '{"revision":0}\n', "utf8");
    assert.throws(
      () =>
        withExclusiveRepoJsonTransactionV6({
          relativePath: repoRelative(target),
          lockSuffix: "unsupported-win32",
          mutate: () => ({ next: { revision: 1 }, value: null }),
        }),
      UnsupportedParentDirectoryDurabilityPlatformErrorV6,
    );
    assert.deepEqual(JSON.parse(readFileSync(target, "utf8")), { revision: 0 });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("synthetic POSIX-durability JSON transaction keeps the temp handle open through atomic replace", () => {
  const root = mkdtempSync(
    path.join(privateRoot, "system-boundary-rename-success-"),
  );
  try {
    const target = path.join(root, "synthetic-ledger.json");
    writeFileSync(target, '{"revision":0}\n', "utf8");
    const before = jsonHash(target);
    const outcome = withExclusiveRepoJsonTransactionV6({
      relativePath: repoRelative(target),
      lockSuffix: "system-boundary-success",
      mutate: () => ({ next: { revision: 1 }, value: "verified" }),
      operationsForOfflineTestOnly: syntheticPosixTransactionDurability,
    });
    assert.equal(outcome.committed, true);
    assert.equal(outcome.value, "verified");
    assert.notEqual(jsonHash(target), before);
    assert.deepEqual(JSON.parse(readFileSync(target, "utf8")), { revision: 1 });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("post-rename attestation failure is typed COMMIT_UNKNOWN and the replacement is never reported uncommitted", () => {
  const root = mkdtempSync(
    path.join(privateRoot, "system-boundary-post-rename-"),
  );
  try {
    const target = path.join(root, "synthetic-ledger.json");
    writeFileSync(target, '{"revision":0}\n', "utf8");
    let observed: unknown = null;
    try {
      withExclusiveRepoJsonTransactionV6({
        relativePath: repoRelative(target),
        lockSuffix: "system-boundary-post-rename",
        mutate: () => ({ next: { revision: 1 }, value: "must-not-return" }),
        operationsForOfflineTestOnly: syntheticPosixTransactionDurability,
        raceHooksForOfflineTestOnly: {
          afterAtomicRenameBeforeCommitAttestation() {
            throw new Error("injected post-rename attestation fault");
          },
        },
      });
    } catch (error) {
      observed = error;
    }
    assert(observed instanceof RepoJsonTransactionCommitUnknownErrorV6);
    assert.equal(observed.stage, "POST_RENAME_ATTESTATION");
    assert.equal(
      observed.transactionMutationState,
      "ATOMIC_REPLACE_COMPLETED_COMMIT_VERIFICATION_UNKNOWN",
    );
    assert.equal(observed.noReplay, true);
    assert.equal(observed.retryAllowed, false);
    assert.equal(observed.manualInterventionRequired, true);
    assert.deepEqual(JSON.parse(readFileSync(target, "utf8")), { revision: 1 });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("temp close after verified post-rename attestation is a committed cleanup warning", () => {
  const root = mkdtempSync(
    path.join(privateRoot, "system-boundary-post-close-"),
  );
  try {
    const target = path.join(root, "synthetic-ledger.json");
    writeFileSync(target, '{"revision":0}\n', "utf8");
    const outcome = withExclusiveRepoJsonTransactionV6({
      relativePath: repoRelative(target),
      lockSuffix: "system-boundary-post-close",
      mutate: () => ({ next: { revision: 1 }, value: "verified-before-close" }),
      operationsForOfflineTestOnly: {
        ...syntheticPosixTransactionDurability,
        closeTempHandle(handle) {
          closeSync(handle);
          closeSync(handle); // Real second close deterministically raises EBADF.
        },
      },
    });
    assert.equal(outcome.committed, true);
    assert.equal(outcome.value, "verified-before-close");
    assert.deepEqual(outcome.cleanupWarningKinds, [
      "TEMP_CLOSE_FAILED_AFTER_COMMIT",
    ]);
    assert.deepEqual(JSON.parse(readFileSync(target, "utf8")), { revision: 1 });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("post-rename parent-directory fsync failure is typed COMMIT_UNKNOWN", () => {
  const root = mkdtempSync(
    path.join(privateRoot, "system-boundary-post-directory-fsync-"),
  );
  try {
    const target = path.join(root, "synthetic-ledger.json");
    writeFileSync(target, '{"revision":0}\n', "utf8");
    let observed: unknown = null;
    try {
      withExclusiveRepoJsonTransactionV6({
        relativePath: repoRelative(target),
        lockSuffix: "system-boundary-post-directory-fsync",
        mutate: () => ({ next: { revision: 1 }, value: "must-not-return" }),
        operationsForOfflineTestOnly: {
          parentDirectoryPlatform: "linux",
          parentDirectoryOperations: {
            fsyncDirectory(handle) {
              fsyncSync(handle); // Windows returns EPERM for a directory handle.
            },
          },
        },
      });
    } catch (error) {
      observed = error;
    }
    assert(observed instanceof RepoJsonTransactionCommitUnknownErrorV6);
    assert.equal(observed.stage, "POST_RENAME_DURABILITY");
    assert.equal(observed.noReplay, true);
    assert.equal(observed.retryAllowed, false);
    assert.deepEqual(JSON.parse(readFileSync(target, "utf8")), { revision: 1 });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

type MarkerFaultCase = {
  phase: "WRITE" | "FSYNC" | "CLOSE";
  operations: Partial<DurablePrivateMarkerOperationsV6>;
};

const markerFaultCases: MarkerFaultCase[] = [
  {
    phase: "WRITE",
    operations: {
      write(handle, bytes, offset, length) {
        const partial = Math.max(1, Math.floor(length / 2));
        writeSync(handle, bytes, offset, partial, null);
        throw new Error("injected failure after a real partial write");
      },
    },
  },
  {
    phase: "FSYNC",
    operations: {
      fsync(handle) {
        closeSync(handle);
        fsyncSync(handle); // Real fsync on the closed descriptor raises EBADF.
      },
    },
  },
  {
    phase: "CLOSE",
    operations: {
      close(handle) {
        closeSync(handle);
        closeSync(handle); // Real second close deterministically raises EBADF.
      },
    },
  },
];

test("marker file primitive uses real exclusive open/write/fsync/close under a synthetic POSIX directory boundary", () => {
  const root = mkdtempSync(
    path.join(privateRoot, "system-boundary-marker-success-"),
  );
  try {
    const receipt = writeExclusiveDurablePrivateMarkerV6({
      directory: root,
      name: "actual-primitive.private.json",
      value: { status: "DURABLE", noReplay: true },
      ...syntheticPosixMarkerDurability,
    });
    assert.equal(jsonHash(receipt.markerPath), receipt.fileSha256);
    assert.equal(
      receipt.directoryDurabilityStrategy,
      "POSIX_PARENT_DIRECTORY_FSYNC",
    );
    assert.equal(readFileSync(receipt.markerPath, "utf8").endsWith("\n"), true);
    assert.throws(
      () =>
        writeExclusiveDurablePrivateMarkerV6({
          directory: root,
          name: "actual-primitive.private.json",
          value: { status: "DUPLICATE" },
          ...syntheticPosixMarkerDurability,
        }),
      (error: unknown) =>
        error instanceof DurablePrivateMarkerPhaseErrorV6 &&
        error.phase === "OPEN",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("marker path replacement after fsync fails identity attestation and keeps settlement unreachable", () => {
  const root = mkdtempSync(
    path.join(privateRoot, "system-boundary-marker-path-swap-"),
  );
  try {
    let settleCalls = 0;
    let quarantineCalls = 0;
    let observed: unknown = null;
    try {
      commitGlobalSettlementAfterDurableIntentV6({
        persistIntent: () => {
          writeExclusiveDurablePrivateMarkerV6({
            directory: root,
            name: "path-swap.private.json",
            value: { status: "EXPECTED", noReplay: true },
            platformForOfflineTestOnly: "linux",
            raceHooksForOfflineTestOnly: {
              afterFileFsyncBeforeIdentityAttestation(markerPath) {
                unlinkSync(markerPath);
                writeFileSync(markerPath, '{"status":"HOSTILE"}\n', "utf8");
              },
            },
          });
        },
        globalCandidateQuarantineRequired: false,
        settle: () => {
          settleCalls += 1;
        },
        quarantine: () => {
          quarantineCalls += 1;
        },
      });
    } catch (error) {
      observed = error;
    }
    assert(observed instanceof TerminalIntentNotDurableErrorV6);
    assert(
      observed.persistenceError instanceof DurablePrivateMarkerPhaseErrorV6,
    );
    assert.equal(observed.persistenceError.phase, "ATTEST");
    assert.equal(settleCalls, 0);
    assert.equal(quarantineCalls, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("marker parent replacement after file close fails final attestation and keeps settlement unreachable", () => {
  const root = mkdtempSync(
    path.join(privateRoot, "system-boundary-marker-parent-swap-"),
  );
  const moved = `${root}-moved`;
  try {
    let settleCalls = 0;
    let quarantineCalls = 0;
    let observed: unknown = null;
    try {
      commitGlobalSettlementAfterDurableIntentV6({
        persistIntent: () => {
          writeExclusiveDurablePrivateMarkerV6({
            directory: root,
            name: "parent-swap.private.json",
            value: { status: "EXPECTED", noReplay: true },
            platformForOfflineTestOnly: "linux",
            raceHooksForOfflineTestOnly: {
              afterFileCloseBeforeDirectoryDurability() {
                renameSync(root, moved);
                mkdirSync(root);
              },
            },
          });
        },
        globalCandidateQuarantineRequired: true,
        settle: () => {
          settleCalls += 1;
        },
        quarantine: () => {
          quarantineCalls += 1;
        },
      });
    } catch (error) {
      observed = error;
    }
    assert(observed instanceof TerminalIntentNotDurableErrorV6);
    assert(
      observed.persistenceError instanceof DurablePrivateMarkerPhaseErrorV6,
    );
    assert.equal(observed.persistenceError.phase, "DIRECTORY_ATTEST");
    assert.equal(settleCalls, 0);
    assert.equal(quarantineCalls, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(moved, { recursive: true, force: true });
  }
});

test("POSIX directory-fsync requirement fails closed when the primitive fails", () => {
  const root = mkdtempSync(
    path.join(privateRoot, "system-boundary-marker-directory-fsync-"),
  );
  try {
    let settleCalls = 0;
    let quarantineCalls = 0;
    let observed: unknown = null;
    try {
      commitGlobalSettlementAfterDurableIntentV6({
        persistIntent: () => {
          writeExclusiveDurablePrivateMarkerV6({
            directory: root,
            name: "directory-fsync.private.json",
            value: { status: "EXPECTED", noReplay: true },
            platformForOfflineTestOnly: "linux",
            directoryOperationsForOfflineTestOnly: {
              fsyncDirectory(handle) {
                fsyncSync(handle); // Windows returns EPERM for a directory handle.
              },
            },
          });
        },
        globalCandidateQuarantineRequired: false,
        settle: () => {
          settleCalls += 1;
        },
        quarantine: () => {
          quarantineCalls += 1;
        },
      });
    } catch (error) {
      observed = error;
    }
    assert(observed instanceof TerminalIntentNotDurableErrorV6);
    assert(
      observed.persistenceError instanceof DurablePrivateMarkerPhaseErrorV6,
    );
    assert.equal(observed.persistenceError.phase, "DIRECTORY_FSYNC");
    assert.equal(settleCalls, 0);
    assert.equal(quarantineCalls, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("real marker partial-write/fsync/close faults keep settlement and quarantine callbacks unreachable", () => {
  const root = mkdtempSync(
    path.join(privateRoot, "system-boundary-marker-faults-"),
  );
  try {
    for (const [index, fault] of markerFaultCases.entries()) {
      let settleCalls = 0;
      let quarantineCalls = 0;
      let observed: unknown = null;
      try {
        commitGlobalSettlementAfterDurableIntentV6({
          persistIntent: () => {
            writeExclusiveDurablePrivateMarkerV6({
              directory: root,
              name: `intent-${fault.phase.toLowerCase()}.private.json`,
              value: { status: "TERMINAL", noReplay: true },
              platformForOfflineTestOnly: "linux",
              operationsForOfflineTestOnly: fault.operations,
            });
          },
          globalCandidateQuarantineRequired: index % 2 === 1,
          settle: () => {
            settleCalls += 1;
          },
          quarantine: () => {
            quarantineCalls += 1;
          },
        });
      } catch (error) {
        observed = error;
      }
      assert(observed instanceof TerminalIntentNotDurableErrorV6, fault.phase);
      assert(
        observed.persistenceError instanceof DurablePrivateMarkerPhaseErrorV6,
        fault.phase,
      );
      assert.equal(observed.persistenceError.phase, fault.phase);
      assert.equal(observed.noReplay, true);
      assert.equal(observed.retryAllowed, false);
      assert.equal(settleCalls, 0, fault.phase);
      assert.equal(quarantineCalls, 0, fault.phase);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("marker exclusive-open failure keeps settlement and quarantine callbacks unreachable", () => {
  const root = mkdtempSync(
    path.join(privateRoot, "system-boundary-marker-open-fault-"),
  );
  try {
    writeFileSync(path.join(root, "intent-open.private.json"), "{}\n", "utf8");
    let settleCalls = 0;
    let quarantineCalls = 0;
    let observed: unknown = null;
    try {
      commitGlobalSettlementAfterDurableIntentV6({
        persistIntent: () => {
          writeExclusiveDurablePrivateMarkerV6({
            directory: root,
            name: "intent-open.private.json",
            value: { status: "TERMINAL" },
            platformForOfflineTestOnly: "linux",
          });
        },
        globalCandidateQuarantineRequired: false,
        settle: () => {
          settleCalls += 1;
        },
        quarantine: () => {
          quarantineCalls += 1;
        },
      });
    } catch (error) {
      observed = error;
    }
    assert(observed instanceof TerminalIntentNotDurableErrorV6);
    assert(
      observed.persistenceError instanceof DurablePrivateMarkerPhaseErrorV6,
    );
    assert.equal(observed.persistenceError.phase, "OPEN");
    assert.equal(settleCalls, 0);
    assert.equal(quarantineCalls, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("directory open and close faults keep both global callbacks unreachable", () => {
  for (const phase of ["DIRECTORY_OPEN", "DIRECTORY_CLOSE"] as const) {
    const root = mkdtempSync(
      path.join(privateRoot, `system-boundary-marker-${phase.toLowerCase()}-`),
    );
    try {
      let settleCalls = 0;
      let quarantineCalls = 0;
      let observed: unknown = null;
      try {
        commitGlobalSettlementAfterDurableIntentV6({
          persistIntent: () => {
            writeExclusiveDurablePrivateMarkerV6({
              directory: root,
              name: `intent-${phase.toLowerCase().replaceAll("_", "-")}.private.json`,
              value: { status: "TERMINAL" },
              platformForOfflineTestOnly: "linux",
              directoryOperationsForOfflineTestOnly:
                phase === "DIRECTORY_OPEN"
                  ? {
                      openDirectory(directoryPath) {
                        const handle = openSync(directoryPath, "r");
                        closeSync(handle);
                        throw new Error(
                          "injected failure after a real directory open",
                        );
                      },
                    }
                  : {
                      fsyncDirectory() {
                        // Isolate the subsequent close phase; DIRECTORY_FSYNC has a
                        // separate real-primitive fail-closed test above.
                      },
                      closeDirectory(handle) {
                        closeSync(handle);
                        closeSync(handle);
                      },
                    },
            });
          },
          globalCandidateQuarantineRequired: phase === "DIRECTORY_CLOSE",
          settle: () => {
            settleCalls += 1;
          },
          quarantine: () => {
            quarantineCalls += 1;
          },
        });
      } catch (error) {
        observed = error;
      }
      assert(observed instanceof TerminalIntentNotDurableErrorV6, phase);
      assert(
        observed.persistenceError instanceof DurablePrivateMarkerPhaseErrorV6,
        phase,
      );
      assert.equal(observed.persistenceError.phase, phase);
      assert.equal(settleCalls, 0, phase);
      assert.equal(quarantineCalls, 0, phase);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("post-directory marker path swap fails final attestation and keeps both callbacks unreachable", () => {
  const root = mkdtempSync(
    path.join(privateRoot, "system-boundary-marker-final-swap-"),
  );
  try {
    let settleCalls = 0;
    let quarantineCalls = 0;
    let observed: unknown = null;
    try {
      commitGlobalSettlementAfterDurableIntentV6({
        persistIntent: () => {
          writeExclusiveDurablePrivateMarkerV6({
            directory: root,
            name: "final-swap.private.json",
            value: { status: "EXPECTED" },
            ...syntheticPosixMarkerDurability,
            raceHooksForOfflineTestOnly: {
              afterDirectoryDurabilityBeforeFinalAttestation(markerPath) {
                unlinkSync(markerPath);
                writeFileSync(markerPath, '{"status":"HOSTILE"}\n', "utf8");
              },
            },
          });
        },
        globalCandidateQuarantineRequired: false,
        settle: () => {
          settleCalls += 1;
        },
        quarantine: () => {
          quarantineCalls += 1;
        },
      });
    } catch (error) {
      observed = error;
    }
    assert(observed instanceof TerminalIntentNotDurableErrorV6);
    assert(
      observed.persistenceError instanceof DurablePrivateMarkerPhaseErrorV6,
    );
    assert.equal(observed.persistenceError.phase, "FINAL_ATTEST");
    assert.equal(settleCalls, 0);
    assert.equal(quarantineCalls, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("production runner has distinct reservation and settlement COMMIT_UNKNOWN terminal dispositions", () => {
  const source = readFileSync(path.join(here, "production-runner.ts"), "utf8");
  assert.match(
    source,
    /GLOBAL_RESERVATION_COMMIT_UNKNOWN_NO_DISPATCH_NO_REPLAY_MANUAL_RECONCILIATION/u,
  );
  assert.match(
    source,
    /GLOBAL_SETTLEMENT_COMMIT_UNKNOWN_TERMINAL_NO_REPLAY_MANUAL_RECONCILIATION/u,
  );
  assert.match(source, /providerDispatchAllowed:\s*false/u);
  assert.match(
    source,
    /error instanceof RepoJsonTransactionCommitUnknownErrorV6/u,
  );
  assert.match(
    source,
    /globalReservationCommitUnknown\)\s*\{[\s\S]*Provider dispatch,[\s\S]*forbidden/u,
  );
});

test("bundler provenance allows reviewed builtins only and fails closed if ambient pnpapi resolves", () => {
  const absent = () => {
    throw Object.assign(new Error("module not found"), {
      code: "MODULE_NOT_FOUND",
    });
  };
  assert.equal(
    assertBundlerExternalResolutionPolicyV6(
      ["fs", "node:path", "pnpapi"],
      absent,
    ),
    "UNRESOLVED",
  );
  assert.throws(
    () =>
      assertBundlerExternalResolutionPolicyV6(
        ["fs", "pnpapi"],
        () => "C:/hostile/pnpapi.js",
      ),
    /pnpapi unexpectedly resolved/u,
  );
  assert.throws(
    () =>
      assertBundlerExternalResolutionPolicyV6(["hostile-nonbuiltin"], absent),
    /unreviewed external/u,
  );
});

test("author child environment drops ambient state and parent rejects preload, TSX, and Yarn PnP influence", () => {
  const base = {
    SystemRoot: "C:/Windows",
    WINDIR: "C:/Windows",
    PATH: "C:/Windows/System32",
    PATHEXT: ".EXE",
    TEMP: "C:/Temp",
    TMP: "C:/Temp",
    COMSPEC: "C:/Windows/System32/cmd.exe",
    UNRELATED: "ignored",
  } as unknown as NodeJS.ProcessEnv;
  assert.deepEqual(
    Object.keys(buildExactAuthorChildEnvironmentV6(base)).sort(),
    [
      "COMSPEC",
      "PATH",
      "PATHEXT",
      "SystemRoot",
      "TEMP",
      "TMP",
      "WINDIR",
    ].sort(),
  );
  for (const name of [
    "NODE_OPTIONS",
    "node_options",
    "NoDe_OpTiOnS",
    "NODE_PATH",
    "node_path",
    "NoDe_PaTh",
    "ESBUILD_BINARY_PATH",
    "esbuild_binary_path",
    "EsBuIlD_BiNaRy_PaTh",
    "NPM_CONFIG_NODE_OPTIONS",
    "npm_config_node_options",
    "Npm_Config_Node_Options",
    "LD_PRELOAD",
    "ld_preload",
    "Ld_PrElOaD",
    "DYLD_INSERT_LIBRARIES",
    "dyld_insert_libraries",
    "DyLd_InSeRt_LiBrArIeS",
    "TS_NODE_PROJECT",
    "tsx_tsconfig_path",
    "YaRn_PnP_CjS",
    "pNpApI",
  ]) {
    assert.throws(
      () =>
        assertNoAuthorToolchainEnvironmentInfluenceV6({
          ...base,
          [name]: "hostile",
        }),
      /forbidden preload\/resolution influence/u,
      name,
    );
  }
  assert.throws(
    () =>
      assertNoAuthorToolchainEnvironmentInfluenceV6({
        ...base,
        node_options: "",
      }),
    /forbidden preload\/resolution influence/u,
    "empty alias name is still outside the exact author environment policy",
  );
});

test("sealed transformer installation binds complete tsx, transitive, and native implementation bytes", () => {
  const launcher = pathToFileURL(
    path.join(here, "sealed-transform-launcher.mjs"),
  ).href;
  const source = [
    `import { verifySealedTransformerInstallationV6 } from ${JSON.stringify(launcher)};`,
    "process.stdout.write(JSON.stringify(verifySealedTransformerInstallationV6()));",
  ].join("\n");
  const result = spawnSync(
    process.execPath,
    ["--input-type=module", "--eval", source],
    {
      cwd: repoRoot,
      env: buildExactAuthorChildEnvironmentV6(process.env),
      encoding: "utf8",
      windowsHide: true,
    },
  );
  assert.equal(result.status, 0, String(result.stderr));
  const evidence = JSON.parse(String(result.stdout)) as Record<string, unknown>;
  assert.equal(evidence.exactPackages, 5);
  assert.equal(evidence.exactFiles, 74);
  assert.equal(evidence.exactBytes, 12115785);
  assert.equal(evidence.exactImplementationFiles, 5);
  assert.equal(evidence.exactImplementationBytes, 30143);
  assert.equal(evidence.independentPreTransformLockRoot, true);
  assert.equal(
    evidence.nodeExecutableSha256,
    "c1b274a8d0a23e060fc42ce71c3cdfa1569b83d91ba82cc59fa907da97a425e9",
  );
  assert.equal(evidence.liveRuntimeTsxAllowed, false);
  const protocol = JSON.parse(
    readFileSync(path.join(here, "protocol-v6.json"), "utf8"),
  ) as Record<string, unknown>;
  const transformer = protocol.transformerExecutionContract as Record<
    string,
    unknown
  >;
  for (const [name, bytesKey, hashKey] of [
    ["tsx-transformer-lock-v6.json", "lockBytes", "lockSha256"],
    [
      "tsx-transform-root-v6.mjs",
      "independentPreTransformRootBytes",
      "independentPreTransformRootSha256",
    ],
  ] as const) {
    const bytes = readFileSync(path.join(here, name));
    assert.equal(bytes.byteLength, transformer[bytesKey]);
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      transformer[hashKey],
    );
  }
});

test("tsx loader capture records the actual source-to-executed-JavaScript mapping", () => {
  const root = mkdtempSync(
    path.join(privateRoot, "system-boundary-transform-capture-"),
  );
  try {
    const capture = path.join(root, "capture.jsonl");
    writeFileSync(capture, "", { encoding: "utf8", mode: 0o600 });
    const register = pathToFileURL(
      path.join(here, "tsx-transform-capture-register.mjs"),
    ).href;
    const entry = path.join(here, "author-environment.ts");
    const environment = buildExactAuthorChildEnvironmentV6(process.env);
    environment.QGEN_V6_TRANSFORM_CAPTURE_PATH = capture;
    environment.QGEN_V6_TRANSFORM_ROLE = "AUTHOR_BUILD";
    const result = spawnSync(process.execPath, ["--import", register, entry], {
      cwd: repoRoot,
      env: environment,
      encoding: "utf8",
      windowsHide: true,
    });
    assert.equal(result.status, 0, String(result.stderr));
    const rows = readFileSync(capture, "utf8")
      .trimEnd()
      .split(/\r?\n/u)
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    const row = rows.find(
      (value) => path.resolve(String(value.sourcePath)) === path.resolve(entry),
    );
    assert(row);
    assert.equal(row.role, "AUTHOR_BUILD");
    assert.equal(
      row.sourceSha256,
      createHash("sha256").update(readFileSync(entry)).digest("hex"),
    );
    assert(Number(row.emittedJsBytes) > 0);
    assert.match(String(row.emittedJsSha256), /^[a-f0-9]{64}$/u);
    assert.notEqual(row.sourceSha256, row.emittedJsSha256);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("author and compiler authority paths require sealed launcher provenance and live runtime stays plain ESM", () => {
  const compilerClient = readFileSync(
    path.join(here, "compiler-client.mts"),
    "utf8",
  );
  const compilerChild = readFileSync(
    path.join(here, "compiler-child.mts"),
    "utf8",
  );
  const authorBuild = readFileSync(
    path.join(here, "build-offline.mts"),
    "utf8",
  );
  const authorBootstrap = readFileSync(
    path.join(here, "author-bootstrap-v6.ps1"),
    "utf8",
  );
  const launcher = readFileSync(
    path.join(here, "sealed-transform-launcher.mjs"),
    "utf8",
  );
  const protocol = JSON.parse(
    readFileSync(path.join(here, "protocol-v6.json"), "utf8"),
  ) as Record<string, unknown>;
  assert.match(compilerClient, /sealed-transform-launcher\.mjs/u);
  assert.doesNotMatch(compilerClient, /tsx\/dist\/cli\.mjs/u);
  assert.match(
    compilerChild,
    /must enter through the sealed transform launcher/u,
  );
  assert.match(compilerChild, /assertSealedTransformerInvocationV6/u);
  assert.match(authorBuild, /attestExecutedTransformerProvenanceV6/u);
  assert.match(authorBuild, /--role=AUTHOR_VALIDATION_TESTS/u);
  assert.match(authorBuild, /validation-transform-provenance-v6\.json/u);
  assert.doesNotMatch(authorBuild, /tsx\/dist\/cli\.mjs/u);
  assert.match(authorBootstrap, /GetEnvironmentVariables\("Process"\)/u);
  assert.match(
    authorBootstrap,
    /SetEnvironmentVariable\(\[string\]\$entry\.Key, \$null, "Process"\)/u,
  );
  assert.match(authorBootstrap, /QGEN_V6_AUTHOR_EXTERNAL_BOOTSTRAP/u);
  assert.match(
    authorBootstrap,
    /c1b274a8d0a23e060fc42ce71c3cdfa1569b83d91ba82cc59fa907da97a425e9/u,
  );
  assert(
    authorBootstrap.indexOf("SetEnvironmentVariable") <
      authorBootstrap.indexOf("& $node.FullName"),
  );
  assert.match(
    launcher,
    /assertExactLauncherParentEnvironment\(args\.role, process\.env\)/u,
  );
  const transformer = protocol.transformerExecutionContract as Record<
    string,
    unknown
  >;
  assert.equal(transformer.scope, "AUTHOR_COMPILER_AND_AUTHOR_VALIDATION_ONLY");
  assert.equal(transformer.directPlainNodeAuthorRoleAllowed, false);
  assert.equal(
    transformer.externalAuthorBootstrapPath,
    "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v6/author-bootstrap-v6.ps1",
  );
  assert.deepEqual(transformer.validationNodeArguments, [
    "--test",
    "--test-isolation=none",
    "--test-concurrency=1",
  ]);
  assert.equal(
    (protocol.frozenRuntimeContract as Record<string, unknown>)
      .sourceTsxRuntimeAllowed,
    false,
  );
});

test("direct tsx author and compiler invocations are rejected before producing output", () => {
  const root = mkdtempSync(
    path.join(privateRoot, "system-boundary-direct-tsx-reject-"),
  );
  try {
    const capture = path.join(root, "forged-capture.jsonl");
    writeFileSync(capture, "", { encoding: "utf8", mode: 0o600 });
    const environment = buildExactAuthorChildEnvironmentV6(process.env);
    environment.QGEN_V6_TRANSFORM_CAPTURE_PATH = capture;
    environment.QGEN_V6_TRANSFORM_ROLE = "ISOLATED_COMPILER";
    const result = spawnSync(
      process.execPath,
      [
        path.join(repoRoot, "node_modules/tsx/dist/cli.mjs"),
        path.join(here, "compiler-child.mts"),
        `--output-dir=${root}`,
      ],
      { cwd: repoRoot, env: environment, encoding: "utf8", windowsHide: true },
    );
    assert.notEqual(result.status, 0);
    assert.match(
      String(result.stderr),
      /exact sealed plain-Node register invocation/u,
    );
    assert.equal(existsSync(path.join(root, "exact-wire.private.json")), false);
    environment.QGEN_V6_TRANSFORM_ROLE = "AUTHOR_BUILD";
    const author = spawnSync(
      process.execPath,
      [
        path.join(repoRoot, "node_modules/tsx/dist/cli.mjs"),
        path.join(here, "build-offline.mts"),
        "--check",
      ],
      { cwd: repoRoot, env: environment, encoding: "utf8", windowsHide: true },
    );
    assert.notEqual(author.status, 0);
    assert.match(
      String(author.stderr),
      /exact sealed plain-Node register invocation/u,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("protocol binds S1 through S5 remediation while S6 remains the sole explicit blocker", () => {
  const protocol = validateProtocolV6(
    JSON.parse(readFileSync(path.join(here, "protocol-v6.json"), "utf8")),
  );
  const remediation = protocol.systemAuditRemediation as Record<
    string,
    unknown
  >;
  assert.deepEqual(remediation.remainingBlockerCodes, [
    "S6_NO_CURRENT_FROZEN_SUBJECT_OR_MANIFEST",
  ]);
  assert.equal(remediation.reviewVerdict, "FAIL_BLOCKERS");
  assert.equal(remediation.reviewFilesModified, false);
  const persistence = protocol.privatePersistence as Record<string, unknown>;
  for (const name of [
    "runsRootEntryFsyncInExactPrivateRootRequired",
    "runRootEntryFsyncInExactRunsRootRequired",
    "directoryIdentityAndDirectAncestorReattestationRequired",
    "postMkdirFailureTypedCommitUnknownNoReplay",
  ])
    assert.equal(persistence[name], true, name);
  const isolation = protocol.processIsolation as Record<string, unknown>;
  assert.equal(
    isolation.soleAuthorizedAuthorBuildEntry,
    "WINDOWS_POWERSHELL_NO_PROFILE_EXACT_ENV_THEN_PINNED_NODE_LAUNCHER",
  );
  assert.equal(isolation.directAuthorNodeLauncherAuthorized, false);
  assert.equal(isolation.ambientPreloadProbeMustRemainUnexecuted, true);
  assert.deepEqual(protocol.authorization, {
    liveExecutionAuthorized: false,
    metadataNetworkAuthorized: false,
    hostileAuditPassed: false,
    dispatchCommandPresent: false,
  });
});

test("external author bootstrap clears ambient preload before S6 rejects freeze materialization", () => {
  const root = mkdtempSync(
    path.join(privateRoot, "system-boundary-s6-freeze-reject-"),
  );
  try {
    const preloadMarker = path.join(root, "preload-must-not-run.txt");
    const preload = path.join(root, "preload-probe.cjs");
    writeFileSync(
      preload,
      `require("node:fs").writeFileSync(${JSON.stringify(preloadMarker)}, "PRELOAD_RAN");\n`,
      "utf8",
    );
    for (const alias of ["NODE_OPTIONS", "node_options", "NoDe_OpTiOnS"]) {
      const result = spawnSync(
        "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
        [
          "-NoLogo",
          "-NoProfile",
          "-NonInteractive",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          path.join(here, "author-bootstrap-v6.ps1"),
          "-Mode",
          "write",
        ],
        {
          cwd: repoRoot,
          env: { ...process.env, [alias]: `--require=${preload}` },
          encoding: "utf8",
          windowsHide: true,
          timeout: 120_000,
          maxBuffer: 32 * 1024 * 1024,
        },
      );
      assert.notEqual(result.status, 0, alias);
      assert.match(
        `${result.stdout}\n${result.stderr}`,
        /S6 blocks freeze\/MANIFEST writes/u,
        alias,
      );
      assert.equal(
        existsSync(preloadMarker),
        false,
        `${alias} preload ran inside the author child`,
      );
    }
    assert.equal(existsSync(path.join(here, "MANIFEST.sha256")), false);
    assert.equal(existsSync(path.join(here, "frozen-runtime-v6.json")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("direct plain-Node AUTHOR_BUILD launcher is unauthorized before TypeScript execution", () => {
  const root = mkdtempSync(
    path.join(privateRoot, "system-boundary-direct-author-launcher-"),
  );
  try {
    const proof = path.join(root, "must-not-exist.json");
    const result = spawnSync(
      process.execPath,
      [
        path.join(here, "sealed-transform-launcher.mjs"),
        "--role=AUTHOR_BUILD",
        `--provenance-output=${proof}`,
        "--",
        "--write",
      ],
      {
        cwd: repoRoot,
        env: buildExactAuthorChildEnvironmentV6(process.env),
        encoding: "utf8",
        windowsHide: true,
      },
    );
    assert.notEqual(result.status, 0);
    assert.match(
      String(result.stderr),
      /launcher parent environment differs|external bootstrap marker differs/u,
    );
    assert.equal(existsSync(proof), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("POSIX operator authority starts outside Node with env -i and rejects direct bundle invocation", () => {
  const protocol = validateProtocolV6(
    JSON.parse(readFileSync(path.join(here, "protocol-v6.json"), "utf8")),
  );
  const isolation = protocol.processIsolation as Record<string, unknown>;
  assert.equal(
    isolation.soleAuthorizedOperatorEntry,
    "POSIX_EXTERNAL_ENV_I_THEN_PLAIN_NODE_PREFLIGHT",
  );
  assert.equal(isolation.externalBootstrapExactPath, "/usr/bin:/bin");
  assert.equal(isolation.externalBootstrapNodeRealpath, "/usr/bin/node");
  assert.equal(isolation.secondEnvIAtNodeExecRequired, true);
  assert.equal(isolation.windowsLiveExecutionAllowed, false);
  assert.equal(isolation.directOperatorBundleInvocationAuthorized, false);
  const shell = readFileSync(
    path.join(here, "operator-bootstrap-v6.sh"),
    "utf8",
  );
  const preflight = readFileSync(
    path.join(here, "operator-bootstrap-preflight-v6.mjs"),
    "utf8",
  );
  const wrapper = readFileSync(path.join(here, "operator-wrapper.mts"), "utf8");
  assert.match(shell, /\/usr\/bin\/env -i PATH=\/usr\/bin:\/bin/u);
  assert.match(
    shell,
    /NODE_OPTIONS NODE_PATH NODE_REPL_EXTERNAL_MODULE NODE_EXTRA_CA_CERTS/u,
  );
  assert.match(
    shell,
    /exec \/usr\/bin\/env -i[\s\S]*"\$\{NODE_PATH_EXACT\}" "\$\{SCRIPT_DIR\}\/operator-bootstrap-preflight-v6\.mjs"/u,
  );
  assert.doesNotMatch(shell, /\bunset\b/u);
  assert.match(
    preflight,
    /JSON\.stringify\(names\) !== JSON\.stringify\(allowedEnvironment\)/u,
  );
  assert.match(
    preflight,
    /realpathSync\.native\(process\.execPath\) !== "\/usr\/bin\/node"/u,
  );
  assert.match(preflight, /authorization\?\.liveExecutionAuthorized !== true/u);
  assert.match(
    wrapper,
    /realpathSync\.native\(process\.argv\[1\]\).*expectedPreflight/u,
  );
  assert.match(wrapper, /operator bundle was invoked directly/u);
});

test("real POSIX shell bootstrap removes shell-added PWD before Node preflight", (context) => {
  if (process.platform !== "win32") {
    context.skip(
      "Windows-hosted WSL regression; POSIX CI invokes the shell directly",
    );
    return;
  }
  const translated = spawnSync("wsl.exe", ["-e", "wslpath", "-a", here], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (translated.status !== 0 || !String(translated.stdout).trim()) {
    context.skip("WSL is unavailable");
    return;
  }
  const script = `${String(translated.stdout).trim()}/operator-bootstrap-v6.sh`;
  const result = spawnSync(
    "wsl.exe",
    [
      "-e",
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
    ],
    { encoding: "utf8", windowsHide: true },
  );
  assert.notEqual(
    result.status,
    0,
    "current S6/bootstrap authorization must remain blocked",
  );
  const diagnostic = `${result.stdout}\n${result.stderr}`;
  assert.doesNotMatch(
    diagnostic,
    /environment is not the exact sealed set|exact clean environment differs/u,
  );
  assert.match(
    diagnostic,
    /requires Node 24\.x|remains blocked pending fresh authorization/u,
  );
});

test("POSIX preflight rejects Node split short-form -r preload arguments", (context) => {
  let preflight = path.join(here, "operator-bootstrap-preflight-v6.mjs");
  let command = "/usr/bin/env";
  const prefix: string[] = [];
  if (process.platform === "win32") {
    const translated = spawnSync(
      "wsl.exe",
      ["-e", "wslpath", "-a", preflight],
      {
        encoding: "utf8",
        windowsHide: true,
      },
    );
    if (translated.status !== 0 || !String(translated.stdout).trim()) {
      context.skip("WSL is unavailable");
      return;
    }
    preflight = String(translated.stdout).trim();
    command = "wsl.exe";
    prefix.push("-e", "/usr/bin/env");
  }
  const result = spawnSync(
    command,
    [
      ...prefix,
      "-i",
      "PATH=/usr/bin:/bin",
      "HOME=/nonexistent",
      "LANG=C",
      "LC_ALL=C",
      "TMPDIR=/tmp",
      "QUESTION_QUALITY_V6_POSIX_ENV_I=1",
      "/usr/bin/node",
      "-r",
      "node:path",
      preflight,
    ],
    { encoding: "utf8", windowsHide: true },
  );
  assert.notEqual(result.status, 0);
  assert.match(
    `${result.stdout}\n${result.stderr}`,
    /rejects Node preload or loader arguments/u,
  );
});

test("tracked Node 24 policy has separated local, descriptor, lock, and remote trust levels", () => {
  const protocol = validateProtocolV6(
    JSON.parse(readFileSync(path.join(here, "protocol-v6.json"), "utf8")),
  );
  const deployment = protocol.deploymentRuntimeTrust as Record<string, unknown>;
  const packagePin = deployment.trackedPackageEngine as Record<string, unknown>;
  const lockPin = deployment.trackedPackageLockRoot as Record<string, unknown>;
  const attributesPin = deployment.trackedLineEndingPolicy as Record<
    string,
    unknown
  >;
  const vercelPin = deployment.trackedVercelDescriptor as Record<
    string,
    unknown
  >;
  const localHint = deployment.ignoredLocalProjectHint as Record<
    string,
    unknown
  >;
  const packagePath = path.join(repoRoot, "package.json");
  const lockPath = path.join(repoRoot, "package-lock.json");
  const attributesPath = path.join(repoRoot, ".gitattributes");
  const vercelPath = path.join(repoRoot, "vercel.json");
  for (const [pin, file] of [
    [packagePin, packagePath],
    [lockPin, lockPath],
    [attributesPin, attributesPath],
    [vercelPin, vercelPath],
  ] as const) {
    assert.equal(pin.bytes, statSync(file).size);
    assert.equal(pin.sha256, jsonHash(file));
  }
  assert.equal(
    JSON.parse(readFileSync(packagePath, "utf8")).engines.node,
    "24.x",
  );
  assert.equal(
    JSON.parse(readFileSync(lockPath, "utf8")).packages[""].engines.node,
    "24.x",
  );
  for (const rule of attributesPin.exactRules as string[]) {
    assert(readFileSync(attributesPath, "utf8").split(/\r?\n/u).includes(rule));
  }
  assert.equal(vercelPin.directNodeRuntimePinPresent, false);
  assert.equal(localHint.tracked, false);
  assert.equal(deployment.currentRemoteDeploymentEvidencePresent, false);
  assert.equal(deployment.currentDeployedCommitEvidencePresent, false);
  assert.equal(deployment.deployedRuntimeParityClaimed, false);
});
