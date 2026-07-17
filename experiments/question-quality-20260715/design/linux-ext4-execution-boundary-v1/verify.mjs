import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  lstatSync,
  readFileSync,
  realpathSync,
  statSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const SHA256_RE = /^[a-f0-9]{64}$/u;

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function readJson(absolutePath) {
  const bytes = readFileSync(absolutePath);
  return { bytes, value: JSON.parse(bytes.toString("utf8")) };
}

function expectFalse(value, label) {
  assert.equal(value, false, `${label} must remain false`);
}

function expectTrue(value, label) {
  assert.equal(value, true, `${label} must remain true`);
}

function expectAllNumericZero(record, label) {
  assert(record && typeof record === "object" && !Array.isArray(record), `${label} must be an object`);
  assert(Object.keys(record).length > 0, `${label} must not be empty`);
  for (const [name, value] of Object.entries(record)) {
    assert.equal(typeof value, "number", `${label}.${name} must be numeric`);
    assert.equal(value, 0, `${label}.${name} must remain zero`);
  }
}

function normalizedPath(value) {
  return process.platform === "win32" ? value.toLowerCase() : value;
}

function canonicalPublicFile(relativePath) {
  assert.equal(typeof relativePath, "string");
  assert(relativePath.length > 0 && !relativePath.includes("\\"), `noncanonical relative path: ${relativePath}`);
  const normalized = path.posix.normalize(relativePath);
  assert.equal(normalized, relativePath, `non-normalized relative path: ${relativePath}`);
  assert(!path.posix.isAbsolute(relativePath) && relativePath !== ".." && !relativePath.startsWith("../"), `path escaped repo: ${relativePath}`);
  const absolute = path.resolve(repoRoot, ...relativePath.split("/"));
  const back = path.relative(repoRoot, absolute);
  assert(back && back !== ".." && !back.startsWith(`..${path.sep}`) && !path.isAbsolute(back), `path escaped repo: ${relativePath}`);
  const lst = lstatSync(absolute);
  assert(lst.isFile() && !lst.isSymbolicLink(), `not a direct regular file: ${relativePath}`);
  const real = realpathSync.native(absolute);
  assert.equal(normalizedPath(real), normalizedPath(absolute), `noncanonical source file: ${relativePath}`);
  return absolute;
}

function isForbiddenPublicPath(relativePath) {
  const lower = relativePath.toLowerCase();
  const segments = lower.split("/");
  if (segments.some((segment) => [".git", "node_modules", "private", ".next", "dist", "coverage"].includes(segment))) return true;
  const base = segments.at(-1);
  return base === ".env" || base.startsWith(".env.") || base.endsWith(".pem") || base.endsWith(".key") ||
    base === "credentials.json" || base === "secrets.json" || base.endsWith(".private.json") ||
    base.includes("raw-response") || base.includes("raw-request");
}

export function validateProtocolObject(protocol) {
  assert.equal(protocol.schemaVersion, "question-quality-linux-ext4-execution-boundary-v1");
  assert.equal(protocol.artifactId, "linux-ext4-execution-boundary-v1");
  assert.equal(protocol.status, "DESIGN_ONLY_EXECUTION_BLOCKED");

  expectTrue(protocol.scope.designOnly, "scope.designOnly");
  for (const [name, value] of Object.entries(protocol.scope)) {
    if (name !== "designOnly") expectFalse(value, `scope.${name}`);
  }

  assert.equal(protocol.publicBindings.gitHeadObserved, "467c6d107137a91088d3eba1620ba4036a63d709");
  assert.equal(protocol.publicBindings.candidateRegistry.sha256, "1e2fc90252de8790ebd7df86e81602825c3fd8b50f5fa96de237ec3cc8fdbab1");
  assert.equal(protocol.publicBindings.candidateRegistry.globalCap, 1000);
  assert.equal(protocol.publicBindings.candidateRegistry.observedUsed, 0);
  assert.equal(protocol.publicBindings.candidateRegistry.c0Cap, 2);
  assert.equal(protocol.publicBindings.v6Protocol.sha256, "068024e2594cadd24daacb2b6e015a401704836774f5222b0c44e6b8d6b96d58");
  expectFalse(protocol.publicBindings.v6Protocol.liveExecutionAuthorized, "v6 live authorization");
  expectFalse(protocol.publicBindings.v6Protocol.windowsLiveExecutionAllowed, "v6 Windows execution");
  assert.equal(protocol.publicBindings.v6Protocol.v6FrozenNodeVersion, "v24.7.0");
  assert.equal(protocol.publicBindings.v6Protocol.v6FrozenPlatform, "win32");
  assert.equal(protocol.publicBindings.currentWorktreePublicSourceClosure.sha256, "69170f3f00b99c13e59ff796a672cd9658b92dbdba15435ca03af196014e51bb");
  assert.equal(protocol.publicBindings.currentWorktreePublicSourceClosure.setSha256, "4373bd4dd737c2e729170ed2ff57d9a4f5b862c4827a10d5a3225534a02cd85e");
  assert.equal(protocol.publicBindings.currentWorktreePublicSourceClosure.exactRows, 44);
  expectFalse(protocol.publicBindings.currentWorktreePublicSourceClosure.materializedOnLinux, "closure materialization");
  expectFalse(protocol.publicBindings.currentWorktreePublicSourceClosure.executionComplete, "closure completeness");

  assert.equal(protocol.observedHost.nativeHomeMount.filesystemType, "ext4");
  assert.equal(protocol.observedHost.nativeHomeMount.source, "/dev/sdd");
  assert.equal(protocol.observedHost.windowsDriveMount.filesystemType, "9p");
  assert.equal(protocol.observedHost.windowsDriveMount.statfsReportedType, "v9fs");
  expectFalse(protocol.observedHost.windowsDriveMount.crashDurabilityClaimAllowed, "9p durability claim");
  expectFalse(protocol.observedHost.windowsDriveMount.fsyncSuccessCountsAsCrashDurabilityEvidence, "9p fsync evidence");
  assert.equal(protocol.observedHost.wslNode.version, "v22.22.0");
  expectFalse(protocol.observedHost.observationIsAuthorization, "host observation authorization");
  expectFalse(protocol.observedHost.observationProvesCrashDurability, "host observation durability proof");
  expectFalse(protocol.observedHost.observationProvesDeploymentParity, "host observation parity proof");

  assert.equal(protocol.nativeExt4Gate.requiredFilesystemType, "ext4");
  assert.equal(protocol.nativeExt4Gate.requiredFilesystemMagicHex, "0xef53");
  assert.equal(protocol.nativeExt4Gate.requiredMountSourcePattern, "^/dev/");
  assert(protocol.nativeExt4Gate.deniedFilesystemTypes.includes("9p"));
  assert(protocol.nativeExt4Gate.deniedFilesystemTypes.includes("v9fs"));
  assert(protocol.nativeExt4Gate.deniedFilesystemTypes.includes("drvfs"));
  assert(protocol.nativeExt4Gate.mustResolveOutsidePrefixes.includes("/mnt"));
  expectTrue(protocol.nativeExt4Gate.mostSpecificMountFromProcSelfMountinfoRequired, "mountinfo gate");
  expectTrue(protocol.nativeExt4Gate.findmntAndStatfsAgreementRequired, "mount probe agreement");
  expectTrue(protocol.nativeExt4Gate.canonicalRealDirectoryChainRequired, "canonical directory gate");
  expectFalse(protocol.nativeExt4Gate.symlinkOrBindMountInExecutionAncestorsAllowed, "symlink/bind mount allowance");
  assert.equal(protocol.nativeExt4Gate.sameDeviceRequiredFor.length, 7);
  expectTrue(protocol.nativeExt4Gate.writeFsyncFdReattestRenameFsyncParentReattestRequired, "durable commit sequence");
  expectTrue(protocol.nativeExt4Gate.successfulFileFsyncAloneIsNeverSufficient, "file fsync insufficiency");
  expectTrue(protocol.nativeExt4Gate.ninePProbeCanOnlyProduceDenyEvidence, "9p deny-only rule");
  expectTrue(protocol.nativeExt4Gate.preflightMustRunAgainImmediatelyBeforeReservation, "reservation preflight");

  assert.equal(protocol.sourceTransfer.currentManifestClass, "EXACT_PUBLIC_BOOTSTRAP_CLOSURE_ONLY");
  expectFalse(protocol.sourceTransfer.currentManifestIsExecutionComplete, "current transfer closure completeness");
  expectTrue(protocol.sourceTransfer.futureExecutionManifestRequired, "future execution manifest");
  expectTrue(protocol.sourceTransfer.transferSourceMustBeExactCurrentWorktreeBytes, "exact worktree transfer");
  expectTrue(protocol.sourceTransfer.destinationMustBeEmptyNativeExt4Directory, "empty ext4 destination");
  expectTrue(protocol.sourceTransfer.fdBoundExactReadAndPostReadIdentityRequired, "fd-bound transfer reads");
  expectTrue(protocol.sourceTransfer.sourceAndDestinationHashEqualityRequired, "transfer hash equality");
  expectTrue(protocol.sourceTransfer.regularFilesOnly, "regular file transfer");
  assert.equal(protocol.sourceTransfer.hardlinkCountMustEqualOne, true);
  expectFalse(protocol.sourceTransfer.symlinksAllowed, "transfer symlinks");
  expectFalse(protocol.sourceTransfer.archiveExtractionAllowed, "archive extraction");
  expectFalse(protocol.sourceTransfer.recursiveRepositoryCopyAllowed, "recursive repo copy");
  assert.deepEqual(protocol.sourceTransfer.forbiddenPathSegments, [".git", "node_modules", "private", ".next", "dist", "coverage"]);
  assert.deepEqual(protocol.sourceTransfer.forbiddenBasenamesOrPatterns, [
    ".env", ".env.*", "*.pem", "*.key", "credentials.json", "secrets.json", "*.private.json", "*raw-response*", "*raw-request*",
  ]);
  expectFalse(protocol.sourceTransfer.windowsNodeModulesTransferAllowed, "Windows node_modules transfer");
  expectFalse(protocol.sourceTransfer.privateInputTransferByThisPackageAllowed, "private input transfer");
  assert.equal(protocol.sourceTransfer.missingPrivateCompilerInputDisposition, "BLOCK_EXECUTION_UNTIL_SEPARATE_PRIVATE_INGRESS_IS_AUTHORIZED_AND_AUDITED");
  assert.equal(protocol.sourceTransfer.sourceDriftDisposition, "CREATE_NEW_MANIFEST_AND_NEW_AUDIT_NEVER_PATCH_ACCEPTED_HASHES");

  assert.equal(protocol.linuxNativeToolchainGate.currentMaterializationStatus, "NOT_STARTED");
  expectFalse(protocol.linuxNativeToolchainGate.npmCiAllowedNow, "npm ci authorization");
  expectTrue(protocol.linuxNativeToolchainGate.futureInstallMustRunOnNativeExt4, "native ext4 install");
  expectTrue(protocol.linuxNativeToolchainGate.futureInstallMustStartWithNoNodeModules, "clean install root");
  expectTrue(protocol.linuxNativeToolchainGate.exactPackageLockRequired, "exact package lock");
  expectTrue(protocol.linuxNativeToolchainGate.npmInstallForbidden, "npm install prohibition");
  expectTrue(protocol.linuxNativeToolchainGate.networkAndLifecycleScriptPolicyMustBeSeparatelyAuthorized, "install policy authorization");
  expectTrue(protocol.linuxNativeToolchainGate.linuxNativePackageAndBinaryProvenanceRequired, "Linux package provenance");
  expectTrue(protocol.linuxNativeToolchainGate.windowsNativeBinaryReuseForbidden, "Windows binary prohibition");
  expectTrue(protocol.linuxNativeToolchainGate.linuxNativeFrozenBundlesMustBeNewArtifacts, "Linux-native bundles");
  expectTrue(protocol.linuxNativeToolchainGate.windowsFrozenBundlesMayNotBeExecutedOrRebrandedAsLinux, "Windows bundle execution prohibition");
  expectTrue(protocol.linuxNativeToolchainGate.freshIndependentToolchainAndBundleAuditRequired, "fresh Linux toolchain audit");

  assert.equal(protocol.deploymentParityGate.status, "UNKNOWN_BLOCKED");
  for (const [name, value] of Object.entries(protocol.deploymentParityGate.currentEvidence)) {
    expectFalse(value, `deployment parity evidence.${name}`);
  }
  assert.equal(protocol.deploymentParityGate.unknownOrMismatchDisposition, "BLOCK_NO_BUILD_NO_RESERVATION_NO_DISPATCH");

  assert.equal(protocol.singleLedgerAuthority.status, "NOT_MIGRATED_BLOCKED");
  assert.equal(protocol.singleLedgerAuthority.logicalAuthorityCountRequired, 1);
  assert.equal(protocol.singleLedgerAuthority.initialAuthority, "WINDOWS_REPOSITORY_LEDGER_READ_ONLY_ORIGIN_SNAPSHOT");
  assert.equal(protocol.singleLedgerAuthority.futureAuthority, "NATIVE_EXT4_AUTHORITY_EPOCH_LEDGER");
  expectTrue(protocol.singleLedgerAuthority.windowsJsonMayNeverBeLiveAuthorityDuringLinuxExecution, "Windows live authority prohibition");
  expectTrue(protocol.singleLedgerAuthority.migrationMustBeOneWayAndSeparatelyAuthorized, "one-way ledger migration");
  assert.equal(protocol.singleLedgerAuthority.crashDecisionRule.durableExt4AuthorityAcceptanceAbsent, "ORIGIN_REMAINS_AUTHORITY_EXT4_PARTIAL_STATE_QUARANTINED");
  assert.equal(protocol.singleLedgerAuthority.crashDecisionRule.durableExt4AuthorityAcceptancePresent, "EXT4_IS_SOLE_AUTHORITY_WINDOWS_ORIGIN_IS_NONAUTHORITATIVE");
  assert.equal(protocol.singleLedgerAuthority.migrationProtocol.length, 6);
  expectTrue(protocol.singleLedgerAuthority.concurrencyControl.required, "executor lock");
  assert.equal(protocol.singleLedgerAuthority.concurrencyControl.mechanism, "KERNEL_FLOCK_HELD_FOR_FULL_PREFLIGHT_RESERVATION_DISPATCH_SETTLEMENT_EXPORT_LIFETIME");
  expectTrue(protocol.singleLedgerAuthority.concurrencyControl.nonblockingExclusive, "nonblocking exclusive flock");
  assert.equal(protocol.singleLedgerAuthority.concurrencyControl.secondExecutorDisposition, "FAIL_BEFORE_LEDGER_READ_OR_NETWORK");
  assert.equal(protocol.singleLedgerAuthority.c0Reservation.candidateCount, 2);
  expectTrue(protocol.singleLedgerAuthority.c0Reservation.singleAtomicCapacityReservation, "single C0 reservation");
  expectTrue(protocol.singleLedgerAuthority.c0Reservation.reserveBeforeAnyMetadataOrProviderNetwork, "reserve before network");
  expectTrue(protocol.singleLedgerAuthority.c0Reservation.privateJournalIsReceiptEvidenceNotSecondCapacityAuthority, "receipt-only private journal");
  expectTrue(protocol.singleLedgerAuthority.c0Reservation.dualReservationLedgersForbidden, "dual ledger prohibition");

  expectFalse(protocol.crashRecoveryAndNoReplay.restartTestAuthorizedNow, "restart test authorization");
  expectTrue(protocol.crashRecoveryAndNoReplay.futureRestartTestMustUseNoNetworkSyntheticState, "synthetic restart test");
  assert.equal(protocol.crashRecoveryAndNoReplay.restartTestMustCover.length, 5);
  assert.deepEqual(Object.keys(protocol.crashRecoveryAndNoReplay.states), [
    "NO_AUTHORITY_ACCEPTANCE",
    "AUTHORITY_ACCEPTED_NO_RESERVATION",
    "RESERVATION_COMMITTED_NO_DISPATCH_INTENT",
    "DISPATCH_INTENT_DURABLE_NO_TERMINAL_EVIDENCE",
    "TERMINAL_EVIDENCE_DURABLE_SETTLEMENT_PENDING",
    "SETTLEMENT_COMMIT_UNKNOWN",
    "SETTLED",
  ]);
  expectTrue(protocol.crashRecoveryAndNoReplay.networkSendRequiresPriorDurableNoReplayMarker, "pre-send durable marker");
  expectTrue(protocol.crashRecoveryAndNoReplay.anyPostIntentCrashForbidsReplay, "post-intent replay prohibition");
  expectTrue(protocol.crashRecoveryAndNoReplay.recoveryNeverInfersNoSendFromMissingResponse, "missing response rule");
  expectTrue(protocol.crashRecoveryAndNoReplay.gracefulWslRestartDoesNotProveHostPowerLossDurability, "restart evidence limit");

  expectTrue(protocol.handoffToWindowsResearchArtifacts.windowsResearchTreeCanReceivePublicMirror, "Windows public mirror");
  expectFalse(protocol.handoffToWindowsResearchArtifacts.windowsResearchTreeCanBecomeLiveAuthority, "Windows mirror authority");
  expectFalse(protocol.handoffToWindowsResearchArtifacts.privateArtifactCopyByDefault, "private Windows export");
  expectFalse(protocol.handoffToWindowsResearchArtifacts.ninePFsyncCanAuthorizeDeletionOrSettlement, "9p settlement authority");
  expectFalse(protocol.handoffToWindowsResearchArtifacts.windowsMirrorFailureCanChangeLedger, "mirror ledger mutation");
  expectFalse(protocol.handoffToWindowsResearchArtifacts.windowsMirrorFailureCanTriggerReplay, "mirror replay");
  assert.equal(protocol.handoffToWindowsResearchArtifacts.exportRequirements.length, 6);
  expectFalse(protocol.publicPrivateBoundary.credentialPersistenceAllowed, "credential persistence");
  expectTrue(protocol.publicPrivateBoundary.privateArtifactNameOrHashDoesNotAuthorizeReadingContent, "private read boundary");
  assert.equal(protocol.requiredSuccessorArtifacts.length, 8);

  assert.deepEqual(protocol.blockers, [
    "B1_V6_FINAL_FREEZE_AND_INDEPENDENT_AUDIT_NOT_BOUND",
    "B2_EXECUTION_SOURCE_CLOSURE_AND_PRIVATE_INPUT_INGRESS_INCOMPLETE",
    "B3_LINUX_NATIVE_TOOLCHAIN_AND_BUNDLES_NOT_MATERIALIZED",
    "B4_NODE_AND_PRODUCTION_DEPLOYMENT_PARITY_UNKNOWN",
    "B5_SINGLE_EXT4_LEDGER_AUTHORITY_NOT_MIGRATED_OR_AUDITED",
    "B6_WSL_RESTART_RECOVERY_NOT_EXECUTED",
    "B7_LINUX_EXECUTION_AUTHORIZATION_AND_INDEPENDENT_AUDIT_ABSENT",
  ]);
  for (const [name, value] of Object.entries(protocol.authorization)) {
    expectFalse(value, `authorization.${name}`);
  }
  expectAllNumericZero(protocol.activity, "protocol.activity");
  return true;
}

export function validateHostObject(host) {
  assert.equal(host.schemaVersion, "question-quality-linux-ext4-observed-host-v1");
  assert.equal(host.status, "READ_ONLY_OBSERVATION_NOT_AUTHORIZATION");
  assert.equal(host.observed.distro, "Ubuntu-24.04");
  assert.equal(host.observed.wslVersion, 2);
  assert.equal(host.observed.home.findmntSource, "/dev/sdd");
  assert.equal(host.observed.home.findmntFilesystemType, "ext4");
  assert.equal(host.observed.windowsD.findmntFilesystemType, "9p");
  assert.equal(host.observed.windowsD.statfsTypeLabel, "v9fs");
  assert.equal(host.observed.node.version, "v22.22.0");
  expectTrue(host.interpretation.homeIsNativeExt4Candidate, "host ext4 candidate");
  expectTrue(host.interpretation.windowsDIsNineP, "host 9p observation");
  expectFalse(host.interpretation.ninePFsyncSuccessWouldProveCrashDurability, "host 9p durability inference");
  expectFalse(host.interpretation.readOnlyObservationProvesLiveExecutionSafety, "host authorization inference");
  expectFalse(host.interpretation.readOnlyObservationProvesProductionParity, "host parity inference");
  expectAllNumericZero(host.activity, "host.activity");
  return true;
}

export function validateClosureObject(closure) {
  assert.equal(closure.schemaVersion, "question-quality-current-worktree-public-source-closure-v1");
  assert.equal(closure.status, "EXACT_PUBLIC_BOOTSTRAP_CLOSURE_ATTESTED_TRANSFER_NOT_MATERIALIZED");
  expectFalse(closure.executionComplete, "closure execution completeness");
  expectFalse(closure.sourceRootIsTransferDestination, "source root as destination");
  assert.equal(closure.sourceRepoGitHead, "467c6d107137a91088d3eba1620ba4036a63d709");
  assert.equal(closure.setHashAlgorithm, "SHA256_OF_UTF8_ROWS_SHA256_SPACE_BYTES_SPACE_KIND_SPACE_PATH_LF_IN_PATH_ORDER");
  assert.equal(closure.exactRows, 44);
  assert.equal(closure.files.length, closure.exactRows);
  assert.equal(closure.exactTotalBytes, 1489112);
  assert.deepEqual(closure.kindCounts, {
    public_registry_binding: 3,
    v6_public_source_or_design: 38,
    toolchain_declaration: 1,
    toolchain_lock: 1,
    deployment_descriptor: 1,
  });
  const paths = closure.files.map((row) => row.path);
  assert.equal(new Set(paths).size, paths.length, "closure paths must be unique");
  let total = 0;
  let setRows = "";
  for (const row of closure.files) {
    assert.equal(typeof row.path, "string");
    assert.equal(typeof row.bytes, "number");
    assert(Number.isSafeInteger(row.bytes) && row.bytes > 0, `invalid bytes: ${row.path}`);
    assert(SHA256_RE.test(row.sha256), `invalid sha256: ${row.path}`);
    assert(["public_registry_binding", "v6_public_source_or_design", "toolchain_declaration", "toolchain_lock", "deployment_descriptor"].includes(row.kind), `invalid kind: ${row.path}`);
    assert(!isForbiddenPublicPath(row.path), `forbidden public source path: ${row.path}`);
    total += row.bytes;
    setRows += `${row.sha256} ${row.bytes} ${row.kind} ${row.path}\n`;
  }
  assert.equal(total, closure.exactTotalBytes);
  assert.equal(sha256(setRows), closure.setSha256);
  assert.equal(closure.setSha256, "4373bd4dd737c2e729170ed2ff57d9a4f5b862c4827a10d5a3225534a02cd85e");
  for (const [name, value] of Object.entries(closure.exclusions)) assert.equal(value, 0, `closure.exclusions.${name} must be zero`);
  for (const [name, value] of Object.entries(closure.missingBeforeExecution)) expectTrue(value, `closure.missingBeforeExecution.${name}`);
  expectFalse(closure.materialization.attempted, "closure materialization attempt");
  assert.equal(closure.materialization.destination, null);
  assert.equal(closure.materialization.filesCopiedOrStaged, 0);
  expectFalse(closure.materialization.transferAuthorized, "closure transfer authorization");
  expectAllNumericZero(closure.activity, "closure.activity");
  return true;
}

export function verifyDisk() {
  const protocolFile = readJson(path.join(here, "protocol-v1.json"));
  const hostFile = readJson(path.join(here, "observed-host-v1.json"));
  const closureFile = readJson(path.join(here, "current-worktree-public-source-closure-v1.json"));
  const protocol = protocolFile.value;
  const host = hostFile.value;
  const closure = closureFile.value;
  validateProtocolObject(protocol);
  validateHostObject(host);
  validateClosureObject(closure);

  assert.equal(protocolFile.bytes.length, statSync(path.join(here, "protocol-v1.json")).size);
  assert.equal(closureFile.bytes.length, protocol.publicBindings.currentWorktreePublicSourceClosure.bytes);
  assert.equal(sha256(closureFile.bytes), protocol.publicBindings.currentWorktreePublicSourceClosure.sha256);

  for (const binding of [protocol.publicBindings.candidateRegistry, protocol.publicBindings.v6Protocol]) {
    const absolute = canonicalPublicFile(binding.path);
    const bytes = readFileSync(absolute);
    assert.equal(bytes.length, binding.bytes, `bound byte count drift: ${binding.path}`);
    assert.equal(sha256(bytes), binding.sha256, `bound hash drift: ${binding.path}`);
  }
  const registry = readJson(canonicalPublicFile(protocol.publicBindings.candidateRegistry.path)).value;
  assert.equal(registry.status, "DESIGN_ONLY_EXECUTION_BLOCKED");
  assert.equal(registry.capFullQuestionCandidates, 1000);
  assert.equal(registry.currentUsed, 0);
  const c0 = registry.stages.find((row) => row.stage === "C0_CONNECTIVITY");
  assert(c0 && c0.cap === 2 && c0.topology === "SINGLE_SHOT_SERIAL");
  expectAllNumericZero(registry.activity, "registry.activity");

  const v6 = readJson(canonicalPublicFile(protocol.publicBindings.v6Protocol.path)).value;
  expectFalse(v6.authorization.liveExecutionAuthorized, "bound v6 live authorization");
  expectFalse(v6.authorization.metadataNetworkAuthorized, "bound v6 metadata authorization");
  expectFalse(v6.authorization.dispatchCommandPresent, "bound v6 dispatch command");
  expectFalse(v6.privatePersistence.windowsLiveExecutionAllowed, "bound v6 Windows execution");
  assert.equal(v6.frozenRuntimeContract.nodeVersion, "v24.7.0");

  const packageJson = readJson(canonicalPublicFile("package.json")).value;
  assert.equal(packageJson.engines?.node, undefined, "package.json unexpectedly acquired a Node runtime pin; parity package must be regenerated");
  const vercelJson = readJson(canonicalPublicFile("vercel.json")).value;
  assert.equal(vercelJson.runtime, undefined, "vercel.json unexpectedly acquired a top-level runtime pin; parity package must be regenerated");
  assert.equal(vercelJson.functions, undefined, "vercel.json unexpectedly acquired function runtime pins; parity package must be regenerated");

  for (const row of closure.files) {
    const absolute = canonicalPublicFile(row.path);
    const bytes = readFileSync(absolute);
    assert.equal(bytes.length, row.bytes, `source byte count drift: ${row.path}`);
    assert.equal(sha256(bytes), row.sha256, `source hash drift: ${row.path}`);
  }

  const manifestPath = path.join(here, "MANIFEST.sha256");
  const manifestBytes = readFileSync(manifestPath);
  const manifestLines = manifestBytes.toString("utf8").trimEnd().split("\n");
  assert.equal(manifestLines.length, 7, "package manifest must contain exactly seven non-self rows");
  const manifestRows = manifestLines.map((line) => {
    const match = line.match(/^([a-f0-9]{64})  (.+)$/u);
    assert(match, `invalid package manifest row: ${line}`);
    return { sha256: match[1], path: match[2] };
  });
  const expectedManifestPaths = [
    "current-worktree-public-source-closure-v1.json",
    "hostile-mutations.mjs",
    "observed-host-v1.json",
    "protocol-v1.json",
    "README.md",
    "THREAT-MODEL.md",
    "verify.mjs",
  ].map((name) => `experiments/question-quality-20260715/design/linux-ext4-execution-boundary-v1/${name}`);
  assert.deepEqual(manifestRows.map((row) => row.path), expectedManifestPaths);
  for (const row of manifestRows) {
    const bytes = readFileSync(canonicalPublicFile(row.path));
    assert.equal(sha256(bytes), row.sha256, `package manifest hash drift: ${row.path}`);
  }

  return {
    schemaVersion: "question-quality-linux-ext4-execution-boundary-v1-verifier-report",
    verdict: "PASS_DESIGN_ONLY_EXECUTION_BLOCKED",
    protocolSha256: sha256(protocolFile.bytes),
    observedHostSha256: sha256(hostFile.bytes),
    sourceClosureSha256: sha256(closureFile.bytes),
    sourceClosureSetSha256: closure.setSha256,
    sourceClosureRows: closure.exactRows,
    manifestFileSha256: sha256(manifestBytes),
    manifestRows: manifestRows.length,
    blockerCount: protocol.blockers.length,
    activity: protocol.activity,
  };
}

const invokedAsScript = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedAsScript) process.stdout.write(`${JSON.stringify(verifyDisk(), null, 2)}\n`);
