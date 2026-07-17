import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
} from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const subjectRel = "experiments/question-quality-20260715/design/linux-ext4-execution-boundary-v1";
const subjectRoot = path.join(repoRoot, ...subjectRel.split("/"));
const subjectExpected = {
  "current-worktree-public-source-closure-v1.json": "69170f3f00b99c13e59ff796a672cd9658b92dbdba15435ca03af196014e51bb",
  "hostile-mutations.mjs": "a61f3b25e22cacdb10d9ab0cff585cd728d9b0cc98568d85f327ccb792f6babb",
  "MANIFEST.sha256": "16cd00dee9bfa4827aed9a3409405c991882a7c0c4c7c4cb7b294e9633827444",
  "observed-host-v1.json": "2028c357ad7320a418a7895810b6b92653e83a782a1e3ba00506b20a89adbb8a",
  "protocol-v1.json": "7a53f465ebce28500e7bcb675be79e5025c482d8ff028fe2e76aaa882c4980ed",
  "README.md": "2604e6019c489f2becff841e6b5ad1c537539f14347e2314496e57e354dc6c74",
  "THREAT-MODEL.md": "4fb7040f1d2f8cc050234763bb8437199e3ca4277e123cbe06f9b0ea3c90c2b7",
  "verify.mjs": "920a63998e1e7e37a8ddf0f36329e2ba6e2235daca1c5ce5ca6aee5eb7e0d584",
};

const expectedBlockers = [
  "B1_V6_FINAL_FREEZE_AND_INDEPENDENT_AUDIT_NOT_BOUND",
  "B2_EXECUTION_SOURCE_CLOSURE_AND_PRIVATE_INPUT_INGRESS_INCOMPLETE",
  "B3_LINUX_NATIVE_TOOLCHAIN_AND_BUNDLES_NOT_MATERIALIZED",
  "B4_NODE_AND_PRODUCTION_DEPLOYMENT_PARITY_UNKNOWN",
  "B5_SINGLE_EXT4_LEDGER_AUTHORITY_NOT_MIGRATED_OR_AUDITED",
  "B6_WSL_RESTART_RECOVERY_NOT_EXECUTED",
  "B7_LINUX_EXECUTION_AUTHORIZATION_AND_INDEPENDENT_AUDIT_ABSENT",
];

const expectedSuccessors = [
  "final audited v6 subject or immutable successor",
  "complete execution-source transfer manifest and independent recomputation",
  "separately authorized private input ingress",
  "Linux-native npm-ci/toolchain provenance and bundle freeze",
  "production deployment parity evidence",
  "single-ledger authority-migration implementation and crash tests",
  "WSL termination/restart recovery evidence",
  "Linux execution authorization package and fresh independent hostile audit",
];

const protocolScalars = new Map(Object.entries({
  "schemaVersion": "question-quality-linux-ext4-execution-boundary-v1",
  "artifactId": "linux-ext4-execution-boundary-v1",
  "status": "DESIGN_ONLY_EXECUTION_BLOCKED",
  "scope.designOnly": true,
  "scope.candidateExecutionAllowed": false,
  "scope.metadataNetworkAllowed": false,
  "scope.providerNetworkAllowed": false,
  "scope.databaseAccessAllowed": false,
  "scope.secretOrCredentialReadAllowed": false,
  "scope.privateArtifactReadAllowed": false,
  "scope.budgetLedgerMutationAllowed": false,
  "scope.repositoryCopyOrStageAllowed": false,
  "scope.packageInstallAllowed": false,
  "scope.authorFreezeOrBuildWriteAllowed": false,
  "publicBindings.gitHeadObserved": "467c6d107137a91088d3eba1620ba4036a63d709",
  "publicBindings.candidateRegistry.path": "experiments/question-quality-20260715/design/global-candidate-registry-v2/registry.json",
  "publicBindings.candidateRegistry.bytes": 2113,
  "publicBindings.candidateRegistry.sha256": "1e2fc90252de8790ebd7df86e81602825c3fd8b50f5fa96de237ec3cc8fdbab1",
  "publicBindings.candidateRegistry.status": "DESIGN_ONLY_EXECUTION_BLOCKED",
  "publicBindings.candidateRegistry.globalCap": 1000,
  "publicBindings.candidateRegistry.observedUsed": 0,
  "publicBindings.candidateRegistry.c0Cap": 2,
  "publicBindings.v6Protocol.path": "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v6/protocol-v6.json",
  "publicBindings.v6Protocol.bytes": 15741,
  "publicBindings.v6Protocol.sha256": "068024e2594cadd24daacb2b6e015a401704836774f5222b0c44e6b8d6b96d58",
  "publicBindings.v6Protocol.liveExecutionAuthorized": false,
  "publicBindings.v6Protocol.windowsLiveExecutionAllowed": false,
  "publicBindings.v6Protocol.v6FrozenNodeVersion": "v24.7.0",
  "publicBindings.v6Protocol.v6FrozenPlatform": "win32",
  "publicBindings.currentWorktreePublicSourceClosure.path": subjectRel + "/current-worktree-public-source-closure-v1.json",
  "publicBindings.currentWorktreePublicSourceClosure.bytes": 19103,
  "publicBindings.currentWorktreePublicSourceClosure.sha256": "69170f3f00b99c13e59ff796a672cd9658b92dbdba15435ca03af196014e51bb",
  "publicBindings.currentWorktreePublicSourceClosure.setSha256": "4373bd4dd737c2e729170ed2ff57d9a4f5b862c4827a10d5a3225534a02cd85e",
  "publicBindings.currentWorktreePublicSourceClosure.exactRows": 44,
  "publicBindings.currentWorktreePublicSourceClosure.materializedOnLinux": false,
  "publicBindings.currentWorktreePublicSourceClosure.executionComplete": false,
  "observedHost.distro": "Ubuntu-24.04",
  "observedHost.wslVersion": 2,
  "observedHost.kernel": "6.6.87.2-microsoft-standard-WSL2",
  "observedHost.architecture": "x86_64",
  "observedHost.nativeHomeMount.probePath": "/home",
  "observedHost.nativeHomeMount.mountTarget": "/",
  "observedHost.nativeHomeMount.source": "/dev/sdd",
  "observedHost.nativeHomeMount.filesystemType": "ext4",
  "observedHost.nativeHomeMount.statfsReportedType": "ext2/ext3",
  "observedHost.nativeHomeMount.requiredLinuxMagicHex": "0xef53",
  "observedHost.windowsDriveMount.probePath": "/mnt/d",
  "observedHost.windowsDriveMount.mountTarget": "/mnt/d",
  "observedHost.windowsDriveMount.source": "D:\\",
  "observedHost.windowsDriveMount.filesystemType": "9p",
  "observedHost.windowsDriveMount.statfsReportedType": "v9fs",
  "observedHost.windowsDriveMount.crashDurabilityClaimAllowed": false,
  "observedHost.windowsDriveMount.fsyncSuccessCountsAsCrashDurabilityEvidence": false,
  "observedHost.wslNode.version": "v22.22.0",
  "observedHost.wslNode.modulesAbi": "127",
  "observedHost.wslNode.napi": "10",
  "observedHost.wslNode.v8": "12.4.254.21-node.33",
  "observedHost.wslNode.platform": "linux",
  "observedHost.wslNode.architecture": "x64",
  "observedHost.wslNpmVersion": "10.9.4",
  "observedHost.observationIsAuthorization": false,
  "observedHost.observationProvesCrashDurability": false,
  "observedHost.observationProvesDeploymentParity": false,
  "nativeExt4Gate.futureExecutionRootPrefix": "/home",
  "nativeExt4Gate.requiredFilesystemType": "ext4",
  "nativeExt4Gate.requiredFilesystemMagicHex": "0xef53",
  "nativeExt4Gate.requiredMountSourcePattern": "^/dev/",
  "nativeExt4Gate.mostSpecificMountFromProcSelfMountinfoRequired": true,
  "nativeExt4Gate.findmntAndStatfsAgreementRequired": true,
  "nativeExt4Gate.canonicalRealDirectoryChainRequired": true,
  "nativeExt4Gate.symlinkOrBindMountInExecutionAncestorsAllowed": false,
  "nativeExt4Gate.writeFsyncFdReattestRenameFsyncParentReattestRequired": true,
  "nativeExt4Gate.successfulFileFsyncAloneIsNeverSufficient": true,
  "nativeExt4Gate.ninePProbeCanOnlyProduceDenyEvidence": true,
  "nativeExt4Gate.preflightMustRunAgainImmediatelyBeforeReservation": true,
  "sourceTransfer.currentManifestClass": "EXACT_PUBLIC_BOOTSTRAP_CLOSURE_ONLY",
  "sourceTransfer.currentManifestIsExecutionComplete": false,
  "sourceTransfer.futureExecutionManifestRequired": true,
  "sourceTransfer.transferSourceMustBeExactCurrentWorktreeBytes": true,
  "sourceTransfer.destinationMustBeEmptyNativeExt4Directory": true,
  "sourceTransfer.fdBoundExactReadAndPostReadIdentityRequired": true,
  "sourceTransfer.sourceAndDestinationHashEqualityRequired": true,
  "sourceTransfer.regularFilesOnly": true,
  "sourceTransfer.hardlinkCountMustEqualOne": true,
  "sourceTransfer.symlinksAllowed": false,
  "sourceTransfer.archiveExtractionAllowed": false,
  "sourceTransfer.recursiveRepositoryCopyAllowed": false,
  "sourceTransfer.windowsNodeModulesTransferAllowed": false,
  "sourceTransfer.privateInputTransferByThisPackageAllowed": false,
  "sourceTransfer.missingPrivateCompilerInputDisposition": "BLOCK_EXECUTION_UNTIL_SEPARATE_PRIVATE_INGRESS_IS_AUTHORIZED_AND_AUDITED",
  "sourceTransfer.sourceDriftDisposition": "CREATE_NEW_MANIFEST_AND_NEW_AUDIT_NEVER_PATCH_ACCEPTED_HASHES",
  "linuxNativeToolchainGate.currentMaterializationStatus": "NOT_STARTED",
  "linuxNativeToolchainGate.npmCiAllowedNow": false,
  "linuxNativeToolchainGate.futureInstallMustRunOnNativeExt4": true,
  "linuxNativeToolchainGate.futureInstallMustStartWithNoNodeModules": true,
  "linuxNativeToolchainGate.exactPackageLockRequired": true,
  "linuxNativeToolchainGate.npmInstallForbidden": true,
  "linuxNativeToolchainGate.networkAndLifecycleScriptPolicyMustBeSeparatelyAuthorized": true,
  "linuxNativeToolchainGate.linuxNativePackageAndBinaryProvenanceRequired": true,
  "linuxNativeToolchainGate.windowsNativeBinaryReuseForbidden": true,
  "linuxNativeToolchainGate.linuxNativeFrozenBundlesMustBeNewArtifacts": true,
  "linuxNativeToolchainGate.windowsFrozenBundlesMayNotBeExecutedOrRebrandedAsLinux": true,
  "linuxNativeToolchainGate.freshIndependentToolchainAndBundleAuditRequired": true,
  "deploymentParityGate.status": "UNKNOWN_BLOCKED",
  "deploymentParityGate.currentEvidence.packageJsonNodeEnginePinned": false,
  "deploymentParityGate.currentEvidence.vercelJsonNodeRuntimePinned": false,
  "deploymentParityGate.currentEvidence.deployedCommitParityProven": false,
  "deploymentParityGate.currentEvidence.wslNodeMatchesV6FrozenNode": false,
  "deploymentParityGate.currentEvidence.v6FrozenRuntimePlatformMatchesLinux": false,
  "deploymentParityGate.unknownOrMismatchDisposition": "BLOCK_NO_BUILD_NO_RESERVATION_NO_DISPATCH",
  "singleLedgerAuthority.status": "NOT_MIGRATED_BLOCKED",
  "singleLedgerAuthority.logicalAuthorityCountRequired": 1,
  "singleLedgerAuthority.initialAuthority": "WINDOWS_REPOSITORY_LEDGER_READ_ONLY_ORIGIN_SNAPSHOT",
  "singleLedgerAuthority.futureAuthority": "NATIVE_EXT4_AUTHORITY_EPOCH_LEDGER",
  "singleLedgerAuthority.windowsJsonAfterAcceptance": "IMMUTABLE_NONAUTHORITATIVE_ARCHIVE_OR_PUBLIC_MIRROR",
  "singleLedgerAuthority.windowsJsonMayNeverBeLiveAuthorityDuringLinuxExecution": true,
  "singleLedgerAuthority.migrationMustBeOneWayAndSeparatelyAuthorized": true,
  "singleLedgerAuthority.crashDecisionRule.durableExt4AuthorityAcceptanceAbsent": "ORIGIN_REMAINS_AUTHORITY_EXT4_PARTIAL_STATE_QUARANTINED",
  "singleLedgerAuthority.crashDecisionRule.durableExt4AuthorityAcceptancePresent": "EXT4_IS_SOLE_AUTHORITY_WINDOWS_ORIGIN_IS_NONAUTHORITATIVE",
  "singleLedgerAuthority.concurrencyControl.required": true,
  "singleLedgerAuthority.concurrencyControl.mechanism": "KERNEL_FLOCK_HELD_FOR_FULL_PREFLIGHT_RESERVATION_DISPATCH_SETTLEMENT_EXPORT_LIFETIME",
  "singleLedgerAuthority.concurrencyControl.nonblockingExclusive": true,
  "singleLedgerAuthority.concurrencyControl.exactLinuxFlockExecutableProvenanceRequired": true,
  "singleLedgerAuthority.concurrencyControl.secondExecutorDisposition": "FAIL_BEFORE_LEDGER_READ_OR_NETWORK",
  "singleLedgerAuthority.c0Reservation.candidateCount": 2,
  "singleLedgerAuthority.c0Reservation.singleAtomicCapacityReservation": true,
  "singleLedgerAuthority.c0Reservation.reserveBeforeAnyMetadataOrProviderNetwork": true,
  "singleLedgerAuthority.c0Reservation.privateJournalIsReceiptEvidenceNotSecondCapacityAuthority": true,
  "singleLedgerAuthority.c0Reservation.dualReservationLedgersForbidden": true,
  "singleLedgerAuthority.c0Reservation.v6PrivateStoreReservationRequirementMustBeReconciledBySuccessorCodeAndAudit": true,
  "singleLedgerAuthority.c0Reservation.reservationCommitUnknownDisposition": "NO_DISPATCH_MANUAL_RECOVERY_FROM_EXT4_AUTHORITY",
  "crashRecoveryAndNoReplay.restartBoundary": "WSL_DISTRO_TERMINATION_AND_RESTART_FROM_EXTERNAL_WINDOWS_HARNESS",
  "crashRecoveryAndNoReplay.restartTestAuthorizedNow": false,
  "crashRecoveryAndNoReplay.futureRestartTestMustUseNoNetworkSyntheticState": true,
  "crashRecoveryAndNoReplay.states.NO_AUTHORITY_ACCEPTANCE": "do not use ext4 partial state",
  "crashRecoveryAndNoReplay.states.AUTHORITY_ACCEPTED_NO_RESERVATION": "safe to reserve after full preflight",
  "crashRecoveryAndNoReplay.states.RESERVATION_COMMITTED_NO_DISPATCH_INTENT": "candidate was not sent; resume only under the same epoch and lock",
  "crashRecoveryAndNoReplay.states.DISPATCH_INTENT_DURABLE_NO_TERMINAL_EVIDENCE": "treat opportunity as sent-or-unknown, never replay, settle conservative/manual",
  "crashRecoveryAndNoReplay.states.TERMINAL_EVIDENCE_DURABLE_SETTLEMENT_PENDING": "settle from durable evidence, never call provider again",
  "crashRecoveryAndNoReplay.states.SETTLEMENT_COMMIT_UNKNOWN": "manual reconciliation from ext4 journal, never replay",
  "crashRecoveryAndNoReplay.states.SETTLED": "export mirrors only",
  "crashRecoveryAndNoReplay.networkSendRequiresPriorDurableNoReplayMarker": true,
  "crashRecoveryAndNoReplay.anyPostIntentCrashForbidsReplay": true,
  "crashRecoveryAndNoReplay.recoveryNeverInfersNoSendFromMissingResponse": true,
  "crashRecoveryAndNoReplay.gracefulWslRestartDoesNotProveHostPowerLossDurability": true,
  "handoffToWindowsResearchArtifacts.windowsResearchTreeCanReceivePublicMirror": true,
  "handoffToWindowsResearchArtifacts.windowsResearchTreeCanBecomeLiveAuthority": false,
  "handoffToWindowsResearchArtifacts.privateArtifactCopyByDefault": false,
  "handoffToWindowsResearchArtifacts.exportSource": "SETTLED_NATIVE_EXT4_CONTENT_ADDRESSED_PUBLIC_BUNDLE",
  "handoffToWindowsResearchArtifacts.ninePFsyncCanAuthorizeDeletionOrSettlement": false,
  "handoffToWindowsResearchArtifacts.windowsMirrorFailureCanChangeLedger": false,
  "handoffToWindowsResearchArtifacts.windowsMirrorFailureCanTriggerReplay": false,
  "publicPrivateBoundary.credentialPersistenceAllowed": false,
  "publicPrivateBoundary.privateArtifactNameOrHashDoesNotAuthorizeReadingContent": true,
  "authorization.sourceTransferMaterializationAuthorized": false,
  "authorization.privateIngressAuthorized": false,
  "authorization.toolchainInstallAuthorized": false,
  "authorization.buildOrFreezeAuthorized": false,
  "authorization.ledgerMigrationAuthorized": false,
  "authorization.ledgerReservationAuthorized": false,
  "authorization.metadataNetworkAuthorized": false,
  "authorization.providerNetworkAuthorized": false,
  "authorization.candidateExecutionAuthorized": false,
  "authorization.dispatchCommandPresent": false,
}));

const protocolArrays = new Map(Object.entries({
  "nativeExt4Gate.mustResolveOutsidePrefixes": ["/mnt", "/media", "/run/user"],
  "nativeExt4Gate.deniedFilesystemTypes": ["9p", "v9fs", "drvfs", "virtiofs", "fuse", "fuseblk", "overlay", "tmpfs", "ramfs", "nfs", "cifs"],
  "nativeExt4Gate.sameDeviceRequiredFor": ["authoritative-ledger", "authority-epoch", "executor-lock", "private-run-journal", "no-replay-markers", "temporary-files", "terminal-results"],
  "sourceTransfer.forbiddenPathSegments": [".git", "node_modules", "private", ".next", "dist", "coverage"],
  "sourceTransfer.forbiddenBasenamesOrPatterns": [".env", ".env.*", "*.pem", "*.key", "credentials.json", "secrets.json", "*.private.json", "*raw-response*", "*raw-request*"],
  "requiredSuccessorArtifacts": expectedSuccessors,
  "blockers": expectedBlockers,
}));

const hostScalars = new Map(Object.entries({
  "schemaVersion": "question-quality-linux-ext4-observed-host-v1",
  "status": "READ_ONLY_OBSERVATION_NOT_AUTHORIZATION",
  "observed.distro": "Ubuntu-24.04",
  "observed.wslVersion": 2,
  "observed.kernelRelease": "6.6.87.2-microsoft-standard-WSL2",
  "observed.machine": "x86_64",
  "observed.home.probePath": "/home",
  "observed.home.findmntTarget": "/",
  "observed.home.findmntSource": "/dev/sdd",
  "observed.home.findmntFilesystemType": "ext4",
  "observed.home.findmntOptions": "rw,relatime,discard,errors=remount-ro,data=ordered",
  "observed.home.statfsTypeLabel": "ext2/ext3",
  "observed.home.blockSize": 4096,
  "observed.home.fundamentalBlockSize": 4096,
  "observed.windowsD.probePath": "/mnt/d",
  "observed.windowsD.findmntTarget": "/mnt/d",
  "observed.windowsD.findmntSource": "D:\\",
  "observed.windowsD.findmntFilesystemType": "9p",
  "observed.windowsD.statfsTypeLabel": "v9fs",
  "observed.windowsD.blockSize": 4096,
  "observed.windowsD.fundamentalBlockSize": 4096,
  "observed.node.executable": "/usr/bin/node",
  "observed.node.version": "v22.22.0",
  "observed.node.modules": "127",
  "observed.node.napi": "10",
  "observed.node.v8": "12.4.254.21-node.33",
  "observed.node.platform": "linux",
  "observed.node.arch": "x64",
  "observed.npm.executable": "/usr/bin/npm",
  "observed.npm.version": "10.9.4",
  "interpretation.homeIsNativeExt4Candidate": true,
  "interpretation.windowsDIsNineP": true,
  "interpretation.ninePFsyncSuccessWouldProveCrashDurability": false,
  "interpretation.readOnlyObservationProvesLiveExecutionSafety": false,
  "interpretation.readOnlyObservationProvesProductionParity": false,
}));

const closureScalars = new Map(Object.entries({
  "schemaVersion": "question-quality-current-worktree-public-source-closure-v1",
  "status": "EXACT_PUBLIC_BOOTSTRAP_CLOSURE_ATTESTED_TRANSFER_NOT_MATERIALIZED",
  "executionComplete": false,
  "sourceRoot": "D:/Desktop/2026project/nara",
  "sourceRootIsTransferDestination": false,
  "closureDefinition": "Exact explicit allowlist of public bootstrap files observed in the current worktree; not the complete future Linux execution/compiler/private-input closure.",
  "setHashAlgorithm": "SHA256_OF_UTF8_ROWS_SHA256_SPACE_BYTES_SPACE_KIND_SPACE_PATH_LF_IN_PATH_ORDER",
  "setSha256": "4373bd4dd737c2e729170ed2ff57d9a4f5b862c4827a10d5a3225534a02cd85e",
  "exactRows": 44,
  "exactTotalBytes": 1489112,
  "kindCounts.public_registry_binding": 3,
  "kindCounts.v6_public_source_or_design": 38,
  "kindCounts.toolchain_declaration": 1,
  "kindCounts.toolchain_lock": 1,
  "kindCounts.deployment_descriptor": 1,
  "materialization.attempted": false,
  "materialization.destination": null,
  "materialization.filesCopiedOrStaged": 0,
  "materialization.transferAuthorized": false,
}));

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function jsonFile(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function getAt(object, dotted) {
  let value = object;
  for (const part of dotted.split(".")) value = value[part];
  return value;
}

function setAt(object, dotted, value) {
  const parts = dotted.split(".");
  const last = parts.pop();
  let target = object;
  for (const part of parts) target = target[part];
  target[last] = value;
}

function checkScalars(object, expected, label) {
  for (const [key, value] of expected) {
    assert.deepEqual(getAt(object, key), value, label + "." + key);
  }
}

function checkArrays(object, expected, label) {
  for (const [key, value] of expected) {
    assert.deepEqual(getAt(object, key), value, label + "." + key);
  }
}

function allNumericZero(record, label) {
  assert(record && typeof record === "object" && !Array.isArray(record), label);
  assert(Object.keys(record).length > 0, label + " empty");
  for (const [key, value] of Object.entries(record)) {
    assert.equal(typeof value, "number", label + "." + key + " type");
    assert.equal(value, 0, label + "." + key + " zero");
  }
}

function validateProtocol(protocol) {
  checkScalars(protocol, protocolScalars, "protocol");
  checkArrays(protocol, protocolArrays, "protocol");
  allNumericZero(protocol.activity, "protocol.activity");
  assert.equal(protocol.observedHost.wslNode.version === protocol.publicBindings.v6Protocol.v6FrozenNodeVersion, false, "runtime mismatch must remain explicit");
  assert.equal(protocol.observedHost.wslNode.platform === protocol.publicBindings.v6Protocol.v6FrozenPlatform, false, "platform mismatch must remain explicit");
  assert(protocol.nativeExt4Gate.deniedFilesystemTypes.includes(protocol.observedHost.windowsDriveMount.filesystemType), "9p must be denied");
  assert(protocol.nativeExt4Gate.deniedFilesystemTypes.includes(protocol.observedHost.windowsDriveMount.statfsReportedType), "v9fs must be denied");
  assert.equal(protocol.blockers.length, 7, "all blockers retained");
  assert.equal(protocol.requiredSuccessorArtifacts.length, 8, "all successor artifacts retained");
  return true;
}

function validateHost(host) {
  checkScalars(host, hostScalars, "host");
  allNumericZero(host.activity, "host.activity");
  return true;
}

const forbiddenSegments = new Set([".git", "node_modules", "private", ".next", "dist", "coverage"]);
function forbiddenPublicPath(rel) {
  const normalized = rel.replaceAll("\\", "/");
  const segments = normalized.split("/");
  if (segments.some((part) => forbiddenSegments.has(part))) return true;
  const base = segments.at(-1).toLowerCase();
  return (
    base === ".env" ||
    base.startsWith(".env.") ||
    base.endsWith(".pem") ||
    base.endsWith(".key") ||
    base === "credentials.json" ||
    base === "secrets.json" ||
    base.endsWith(".private.json") ||
    base.includes("raw-response") ||
    base.includes("raw-request")
  );
}

function closureSetHash(files) {
  const rows = files.map((row) => row.sha256 + " " + row.bytes + " " + row.kind + " " + row.path).join("\n") + "\n";
  return sha256(Buffer.from(rows, "utf8"));
}

function validateClosure(closure) {
  checkScalars(closure, closureScalars, "closure");
  allNumericZero(closure.activity, "closure.activity");
  for (const value of Object.values(closure.exclusions)) assert.equal(value, 0, "closure exclusion count");
  for (const value of Object.values(closure.missingBeforeExecution)) assert.equal(value, true, "closure missing blocker");
  assert(Array.isArray(closure.files), "closure files array");
  assert.equal(closure.files.length, 44, "closure row count");
  assert.equal(new Set(closure.files.map((row) => row.path)).size, 44, "closure unique paths");
  assert.equal(closure.files.reduce((sum, row) => sum + row.bytes, 0), closure.exactTotalBytes, "closure byte sum");
  assert.equal(closureSetHash(closure.files), closure.setSha256, "closure set hash");
  for (const row of closure.files) {
    assert.equal(typeof row.path, "string", "closure path");
    assert.equal(forbiddenPublicPath(row.path), false, "forbidden closure path " + row.path);
    assert.match(row.sha256, /^[a-f0-9]{64}$/u, "closure row sha");
    assert(Number.isSafeInteger(row.bytes) && row.bytes >= 0, "closure row bytes");
  }
  return true;
}

function validateSubjectAndClosure(closure) {
  const names = readdirSync(subjectRoot).sort();
  assert.deepEqual(names, Object.keys(subjectExpected).sort(), "subject exact file set");
  const hashes = {};
  for (const [name, expected] of Object.entries(subjectExpected)) {
    const file = path.join(subjectRoot, name);
    const st = lstatSync(file);
    assert(st.isFile() && !st.isSymbolicLink(), "subject direct regular file " + name);
    hashes[name] = sha256(readFileSync(file));
    assert.equal(hashes[name], expected, "subject hash " + name);
  }

  const manifestRows = readFileSync(path.join(subjectRoot, "MANIFEST.sha256"), "utf8")
    .trim()
    .split(/\r?\n/u)
    .map((line) => {
      const match = line.match(/^([a-f0-9]{64})  (.+)$/u);
      assert(match, "subject manifest row");
      return { sha256: match[1], path: match[2] };
    });
  assert.equal(manifestRows.length, 7, "subject manifest row count");
  for (const row of manifestRows) {
    assert(row.path.startsWith(subjectRel + "/"), "manifest path confined");
    const name = row.path.slice(subjectRel.length + 1);
    assert.notEqual(name, "MANIFEST.sha256", "manifest nonrecursive");
    assert.equal(row.sha256, subjectExpected[name], "manifest expected hash " + name);
  }

  const scriptFiles = ["verify.mjs", "hostile-mutations.mjs"];
  const allowedImports = new Set([
    "node:assert/strict",
    "node:crypto",
    "node:fs",
    "node:path",
    "node:url",
    "./verify.mjs",
  ]);
  const forbiddenExecutableSurface = /node:child_process|node:(?:http|https|net|tls|dgram)|\bfetch\s*\(|\b(?:writeFileSync|writeFile|appendFileSync|appendFile|copyFileSync|copyFile|renameSync|rename|mkdirSync|mkdir|unlinkSync|unlink|rmSync|rmdirSync)\s*\(/u;
  for (const name of scriptFiles) {
    const source = readFileSync(path.join(subjectRoot, name), "utf8");
    assert.equal(forbiddenExecutableSurface.test(source), false, "subject script executable surface " + name);
    for (const match of source.matchAll(/from\s+["']([^"']+)["']/gu)) {
      assert(allowedImports.has(match[1]), "unexpected subject import " + match[1]);
    }
  }

  const diskRows = [];
  let totalBytes = 0;
  for (const row of closure.files) {
    assert.equal(forbiddenPublicPath(row.path), false, "closure read allowlist");
    assert(!path.isAbsolute(row.path), "closure relative path");
    const absolute = path.resolve(repoRoot, ...row.path.split("/"));
    const relBack = path.relative(repoRoot, absolute);
    assert(relBack && !relBack.startsWith("..") && !path.isAbsolute(relBack), "closure confinement");
    let cursor = repoRoot;
    for (const segment of row.path.split("/")) {
      cursor = path.join(cursor, segment);
      const st = lstatSync(cursor);
      assert(!st.isSymbolicLink(), "closure no symlink ancestor " + row.path);
    }
    const st = statSync(absolute);
    assert(st.isFile(), "closure regular file " + row.path);
    assert.equal(st.size, row.bytes, "closure disk bytes " + row.path);
    const actual = sha256(readFileSync(absolute));
    assert.equal(actual, row.sha256, "closure disk hash " + row.path);
    const real = realpathSync(absolute);
    const realRel = path.relative(realpathSync(repoRoot), real);
    assert(realRel && !realRel.startsWith("..") && !path.isAbsolute(realRel), "closure realpath confinement");
    diskRows.push({ path: row.path, bytes: st.size, sha256: actual, kind: row.kind });
    totalBytes += st.size;
  }
  assert.equal(closureSetHash(diskRows), closure.setSha256, "independent disk set hash");
  assert.equal(totalBytes, 1489112, "independent disk total");

  const packageJson = jsonFile(path.join(repoRoot, "package.json"));
  const vercelJson = jsonFile(path.join(repoRoot, "vercel.json"));
  const packageNodePinned = Boolean(packageJson.engines && packageJson.engines.node);
  const vercelText = JSON.stringify(vercelJson).toLowerCase();
  const vercelRuntimePinned = vercelText.includes("runtime") || vercelText.includes("nodeversion") || vercelText.includes("node_version");
  assert.equal(packageNodePinned, false, "package Node pin remains missing");
  assert.equal(vercelRuntimePinned, false, "Vercel Node runtime pin remains missing");

  return {
    subjectHashes: hashes,
    manifestRows: manifestRows.length,
    closureRows: diskRows.length,
    closureBytes: totalBytes,
    closureSetSha256: closureSetHash(diskRows),
    forbiddenClosurePaths: 0,
    symlinkOrJunctionRows: 0,
    packageJsonNodeEnginePinned: packageNodePinned,
    vercelJsonNodeRuntimePinned: vercelRuntimePinned,
    subjectExecutableDispatchInstallCopyMigrationBuildSurface: false,
  };
}

function runRaw(exe, args) {
  const result = spawnSync(exe, args, {
    shell: false,
    windowsHide: true,
    encoding: null,
    maxBuffer: 1024 * 1024,
  });
  assert.equal(result.error, undefined, "probe spawn " + exe);
  assert.equal(result.status, 0, "probe exit " + exe + " " + args.join(" ") + " stderr=" + Buffer.from(result.stderr || []).toString("utf8"));
  return Buffer.from(result.stdout || []);
}

function runText(exe, args) {
  return runRaw(exe, args).toString("utf8").trim();
}

function wsl(args) {
  return runText("wsl.exe", ["-d", "Ubuntu-24.04", "--", ...args]);
}

function probeHostReadOnly() {
  const listRaw = runRaw("wsl.exe", ["-l", "-v"]);
  const list = listRaw.includes(0) ? listRaw.toString("utf16le") : listRaw.toString("utf8");
  assert(list.includes("Ubuntu-24.04"), "WSL distro list");
  assert(/Ubuntu-24\.04[\s\S]*\b2\b/u.test(list), "WSL2 distro row");

  const kernel = wsl(["uname", "-r"]);
  const machine = wsl(["uname", "-m"]);
  const nodeVersion = wsl(["/usr/bin/node", "--version"]);
  const nodeExecutable = wsl(["/usr/bin/node", "-p", "process.execPath"]);
  const nodePlatform = wsl(["/usr/bin/node", "-p", "process.platform"]);
  const nodeArch = wsl(["/usr/bin/node", "-p", "process.arch"]);
  const modules = wsl(["/usr/bin/node", "-p", "process.versions.modules"]);
  const napi = wsl(["/usr/bin/node", "-p", "process.versions.napi"]);
  const v8 = wsl(["/usr/bin/node", "-p", "process.versions.v8"]);
  const npmVersion = wsl(["/usr/bin/npm", "--version"]);
  const nodePath = wsl(["readlink", "-f", "/usr/bin/node"]);
  const npmPath = wsl(["readlink", "-f", "/usr/bin/npm"]);
  const homeMount = wsl(["findmnt", "-T", "/home", "-n", "-o", "TARGET,SOURCE,FSTYPE,OPTIONS"]).replace(/\s+/gu, " ");
  const windowsMount = wsl(["findmnt", "-T", "/mnt/d", "-n", "-o", "TARGET,SOURCE,FSTYPE,OPTIONS"]).replace(/\s+/gu, " ");
  const homeStatType = wsl(["stat", "-f", "-c", "%T", "/home"]);
  const homeMagic = wsl(["stat", "-f", "-c", "%t", "/home"]);
  const windowsStatType = wsl(["stat", "-f", "-c", "%T", "/mnt/d"]);
  const homeReal = wsl(["readlink", "-f", "/home"]);
  const windowsReal = wsl(["readlink", "-f", "/mnt/d"]);

  assert.equal(kernel, "6.6.87.2-microsoft-standard-WSL2", "kernel reprobe");
  assert.equal(machine, "x86_64", "machine reprobe");
  assert.equal(nodeVersion, "v22.22.0", "WSL Node reprobe");
  assert.equal(nodeExecutable, "/usr/bin/node", "WSL Node executable");
  assert.equal(nodePlatform, "linux", "WSL Node platform");
  assert.equal(nodeArch, "x64", "WSL Node arch");
  assert.equal(modules, "127", "WSL modules ABI");
  assert.equal(napi, "10", "WSL N-API");
  assert.equal(v8, "12.4.254.21-node.33", "WSL V8");
  assert.equal(npmVersion, "10.9.4", "WSL npm reprobe");
  assert.equal(nodePath, "/usr/bin/node", "WSL Node canonical path");
  assert(npmPath.endsWith("/npm-cli.js"), "WSL npm canonical target");
  assert(homeMount.startsWith("/ /dev/sdd ext4 "), "home ext4 findmnt");
  assert(windowsMount.startsWith("/mnt/d D:\\ 9p "), "Windows drive 9p findmnt");
  assert.equal(homeStatType, "ext2/ext3", "home statfs label");
  assert.equal(homeMagic, "ef53", "home ext4 magic");
  assert.equal(windowsStatType, "v9fs", "Windows drive statfs label");
  assert.equal(homeReal, "/home", "home canonical path");
  assert.equal(windowsReal, "/mnt/d", "Windows drive canonical path");
  assert.equal(process.version, "v24.7.0", "Windows audit Node pin");
  assert.equal(process.platform, "win32", "Windows audit platform");
  assert.notEqual(process.version, nodeVersion, "Windows/WSL version mismatch");
  assert.notEqual(process.platform, nodePlatform, "Windows/WSL platform mismatch");

  return {
    distro: "Ubuntu-24.04",
    wslVersion: 2,
    kernel,
    machine,
    home: {
      findmnt: homeMount,
      statfsType: homeStatType,
      magicHex: "0x" + homeMagic,
      canonicalPath: homeReal,
    },
    windowsD: {
      findmnt: windowsMount,
      statfsType: windowsStatType,
      canonicalPath: windowsReal,
      fsyncAttempted: false,
      durabilityProven: false,
    },
    wslNode: {
      executable: nodeExecutable,
      version: nodeVersion,
      platform: nodePlatform,
      arch: nodeArch,
      modules,
      napi,
      v8,
    },
    wslNpm: {
      executable: npmPath,
      version: npmVersion,
    },
    windowsNode: {
      executable: process.execPath,
      version: process.version,
      platform: process.platform,
      arch: process.arch,
      modules: process.versions.modules,
      napi: process.versions.napi,
      v8: process.versions.v8,
    },
    runtimeMismatchConfirmed: true,
    readOnlyProbeCommands: 20,
    filesystemProbeWrites: 0,
  };
}

function wrong(value) {
  if (typeof value === "boolean") return !value;
  if (typeof value === "number") return value + 1;
  if (typeof value === "string") return value + "__MUTATED";
  if (value === null) return "/tmp/not-null";
  throw new Error("unsupported mutation value");
}

function expectRejected(name, base, mutate, validate, accepted) {
  const copy = structuredClone(base);
  mutate(copy);
  let rejected = false;
  try {
    validate(copy);
  } catch {
    rejected = true;
  }
  assert.equal(rejected, true, "mutation escaped validator: " + name);
  accepted.push(name);
}

function runHostile(protocol, host, closure) {
  const accepted = [];
  for (const [key, value] of protocolScalars) {
    expectRejected("protocol scalar: " + key, protocol, (x) => setAt(x, key, wrong(value)), validateProtocol, accepted);
  }
  for (const [key] of protocolArrays) {
    expectRejected("protocol array removal: " + key, protocol, (x) => getAt(x, key).pop(), validateProtocol, accepted);
  }
  for (const key of Object.keys(protocol.activity)) {
    expectRejected("protocol activity nonzero: " + key, protocol, (x) => { x.activity[key] = 1; }, validateProtocol, accepted);
  }
  for (const blocker of expectedBlockers) {
    expectRejected("blocker removed: " + blocker, protocol, (x) => { x.blockers = x.blockers.filter((v) => v !== blocker); }, validateProtocol, accepted);
  }
  for (const artifact of expectedSuccessors) {
    expectRejected("successor artifact removed: " + artifact, protocol, (x) => { x.requiredSuccessorArtifacts = x.requiredSuccessorArtifacts.filter((v) => v !== artifact); }, validateProtocol, accepted);
  }
  for (const [key, value] of hostScalars) {
    expectRejected("host scalar: " + key, host, (x) => setAt(x, key, wrong(value)), validateHost, accepted);
  }
  for (const key of Object.keys(host.activity)) {
    expectRejected("host activity nonzero: " + key, host, (x) => { x.activity[key] = 1; }, validateHost, accepted);
  }
  for (const [key, value] of closureScalars) {
    expectRejected("closure scalar: " + key, closure, (x) => setAt(x, key, wrong(value)), validateClosure, accepted);
  }
  for (const key of Object.keys(closure.activity)) {
    expectRejected("closure activity nonzero: " + key, closure, (x) => { x.activity[key] = 1; }, validateClosure, accepted);
  }
  for (const key of Object.keys(closure.exclusions)) {
    expectRejected("closure exclusion nonzero: " + key, closure, (x) => { x.exclusions[key] = 1; }, validateClosure, accepted);
  }
  for (const key of Object.keys(closure.missingBeforeExecution)) {
    expectRejected("closure missing blocker cleared: " + key, closure, (x) => { x.missingBeforeExecution[key] = false; }, validateClosure, accepted);
  }
  for (let index = 0; index < closure.files.length; index += 1) {
    expectRejected("closure source drift row " + String(index + 1), closure, (x) => { x.files[index].sha256 = "0".repeat(64); }, validateClosure, accepted);
  }

  const explicit = [
    ["9p fsync-success laundering", protocol, (x) => { x.observedHost.windowsDriveMount.fsyncSuccessCountsAsCrashDurabilityEvidence = true; }, validateProtocol],
    ["/mnt/d removed from outside-prefix denylist", protocol, (x) => { x.nativeExt4Gate.mustResolveOutsidePrefixes = x.nativeExt4Gate.mustResolveOutsidePrefixes.filter((v) => v !== "/mnt"); }, validateProtocol],
    ["9p removed from denied filesystems", protocol, (x) => { x.nativeExt4Gate.deniedFilesystemTypes = x.nativeExt4Gate.deniedFilesystemTypes.filter((v) => v !== "9p"); }, validateProtocol],
    ["v9fs removed from denied filesystems", protocol, (x) => { x.nativeExt4Gate.deniedFilesystemTypes = x.nativeExt4Gate.deniedFilesystemTypes.filter((v) => v !== "v9fs"); }, validateProtocol],
    ["symlink or bind ancestor allowed", protocol, (x) => { x.nativeExt4Gate.symlinkOrBindMountInExecutionAncestorsAllowed = true; }, validateProtocol],
    ["most-specific mountinfo check removed", protocol, (x) => { x.nativeExt4Gate.mostSpecificMountFromProcSelfMountinfoRequired = false; }, validateProtocol],
    ["statfs/findmnt disagreement tolerated", protocol, (x) => { x.nativeExt4Gate.findmntAndStatfsAgreementRequired = false; }, validateProtocol],
    ["single file fsync laundered as durability", protocol, (x) => { x.nativeExt4Gate.successfulFileFsyncAloneIsNeverSufficient = false; }, validateProtocol],
    ["future pre-reservation reattestation removed", protocol, (x) => { x.nativeExt4Gate.preflightMustRunAgainImmediatelyBeforeReservation = false; }, validateProtocol],
    ["source bytes allowed to drift", protocol, (x) => { x.sourceTransfer.transferSourceMustBeExactCurrentWorktreeBytes = false; }, validateProtocol],
    ["recursive repository copy allowed", protocol, (x) => { x.sourceTransfer.recursiveRepositoryCopyAllowed = true; }, validateProtocol],
    ["Windows node_modules transfer allowed", protocol, (x) => { x.sourceTransfer.windowsNodeModulesTransferAllowed = true; }, validateProtocol],
    ["public closure relabeled complete", protocol, (x) => { x.sourceTransfer.currentManifestIsExecutionComplete = true; }, validateProtocol],
    ["private compiler ingress declared complete", closure, (x) => { x.missingBeforeExecution.separatelyAuthorizedPrivateInputIngress = false; }, validateClosure],
    ["compiler closure declared complete", closure, (x) => { x.missingBeforeExecution.completeProductionCompilerClosure = false; }, validateClosure],
    ["Linux toolchain declared materialized", protocol, (x) => { x.linuxNativeToolchainGate.currentMaterializationStatus = "READY"; }, validateProtocol],
    ["Windows bundle reuse allowed", protocol, (x) => { x.linuxNativeToolchainGate.windowsNativeBinaryReuseForbidden = false; }, validateProtocol],
    ["package runtime pin falsely claimed", protocol, (x) => { x.deploymentParityGate.currentEvidence.packageJsonNodeEnginePinned = true; }, validateProtocol],
    ["Vercel runtime pin falsely claimed", protocol, (x) => { x.deploymentParityGate.currentEvidence.vercelJsonNodeRuntimePinned = true; }, validateProtocol],
    ["deployed commit parity falsely claimed", protocol, (x) => { x.deploymentParityGate.currentEvidence.deployedCommitParityProven = true; }, validateProtocol],
    ["Windows/WSL Node mismatch hidden", protocol, (x) => { x.deploymentParityGate.currentEvidence.wslNodeMatchesV6FrozenNode = true; }, validateProtocol],
    ["platform mismatch hidden", protocol, (x) => { x.deploymentParityGate.currentEvidence.v6FrozenRuntimePlatformMatchesLinux = true; }, validateProtocol],
    ["dual ledger authority count", protocol, (x) => { x.singleLedgerAuthority.logicalAuthorityCountRequired = 2; }, validateProtocol],
    ["Windows mirror promoted to authority", protocol, (x) => { x.handoffToWindowsResearchArtifacts.windowsResearchTreeCanBecomeLiveAuthority = true; }, validateProtocol],
    ["one-way migration weakened", protocol, (x) => { x.singleLedgerAuthority.migrationMustBeOneWayAndSeparatelyAuthorized = false; }, validateProtocol],
    ["flock reduced from full lifecycle", protocol, (x) => { x.singleLedgerAuthority.concurrencyControl.mechanism = "FLOCK_ONLY_DURING_RESERVATION"; }, validateProtocol],
    ["flock made blocking", protocol, (x) => { x.singleLedgerAuthority.concurrencyControl.nonblockingExclusive = false; }, validateProtocol],
    ["second executor reads ledger first", protocol, (x) => { x.singleLedgerAuthority.concurrencyControl.secondExecutorDisposition = "FAIL_AFTER_LEDGER_READ"; }, validateProtocol],
    ["C0 reservation not exactly two", protocol, (x) => { x.singleLedgerAuthority.c0Reservation.candidateCount = 3; }, validateProtocol],
    ["C0 reservation split into two commits", protocol, (x) => { x.singleLedgerAuthority.c0Reservation.singleAtomicCapacityReservation = false; }, validateProtocol],
    ["private journal promoted to second authority", protocol, (x) => { x.singleLedgerAuthority.c0Reservation.privateJournalIsReceiptEvidenceNotSecondCapacityAuthority = false; }, validateProtocol],
    ["unknown reservation allowed to dispatch", protocol, (x) => { x.singleLedgerAuthority.c0Reservation.reservationCommitUnknownDisposition = "DISPATCH"; }, validateProtocol],
    ["pre-acceptance partial ext4 made authority", protocol, (x) => { x.singleLedgerAuthority.crashDecisionRule.durableExt4AuthorityAcceptanceAbsent = "EXT4_IS_AUTHORITY"; }, validateProtocol],
    ["post-acceptance Windows remains authority", protocol, (x) => { x.singleLedgerAuthority.crashDecisionRule.durableExt4AuthorityAcceptancePresent = "DUAL_AUTHORITY"; }, validateProtocol],
    ["post-intent replay allowed", protocol, (x) => { x.crashRecoveryAndNoReplay.anyPostIntentCrashForbidsReplay = false; }, validateProtocol],
    ["missing response inferred as unsent", protocol, (x) => { x.crashRecoveryAndNoReplay.recoveryNeverInfersNoSendFromMissingResponse = false; }, validateProtocol],
    ["restart test falsely authorized", protocol, (x) => { x.crashRecoveryAndNoReplay.restartTestAuthorizedNow = true; }, validateProtocol],
    ["graceful restart treated as power-loss proof", protocol, (x) => { x.crashRecoveryAndNoReplay.gracefulWslRestartDoesNotProveHostPowerLossDurability = false; }, validateProtocol],
    ["stale Windows export changes ledger", protocol, (x) => { x.handoffToWindowsResearchArtifacts.windowsMirrorFailureCanChangeLedger = true; }, validateProtocol],
    ["stale Windows export triggers replay", protocol, (x) => { x.handoffToWindowsResearchArtifacts.windowsMirrorFailureCanTriggerReplay = true; }, validateProtocol],
    ["9p mirror fsync authorizes settlement", protocol, (x) => { x.handoffToWindowsResearchArtifacts.ninePFsyncCanAuthorizeDeletionOrSettlement = true; }, validateProtocol],
    ["blocker removed without evidence", protocol, (x) => { x.blockers.splice(3, 1); }, validateProtocol],
    ["dispatch command injected", protocol, (x) => { x.authorization.dispatchCommandPresent = true; }, validateProtocol],
    ["candidate execution authorized", protocol, (x) => { x.authorization.candidateExecutionAuthorized = true; }, validateProtocol],
    ["budget ledger read activity hidden", protocol, (x) => { x.activity.budgetLedgerReads = 1; }, validateProtocol],
    ["filesystem probe write activity hidden", host, (x) => { x.activity.filesystemProbeWrites = 1; }, validateHost],
    ["forbidden .env closure row", closure, (x) => { x.files[0].path = ".env.local"; }, validateClosure],
    ["forbidden node_modules closure row", closure, (x) => { x.files[0].path = "node_modules/pkg/index.js"; }, validateClosure],
    ["forbidden private closure row", closure, (x) => { x.files[0].path = "private/question.json"; }, validateClosure],
    ["Windows source root mislabeled destination", closure, (x) => { x.sourceRootIsTransferDestination = true; }, validateClosure],
  ];
  for (const [name, base, mutate, validate] of explicit) {
    expectRejected("explicit: " + name, base, mutate, validate, accepted);
  }

  assert(accepted.length >= 100, "minimum hostile mutation count");
  return {
    totalMutationCases: accepted.length,
    allRejected: accepted.length,
    escaped: 0,
    explicitAttackCases: explicit.length,
    requiredMinimum: 100,
    coverage: explicit.map((row) => row[0]),
  };
}

function validateAuditPackage(result) {
  const expectedNames = [
    "MANIFEST.sha256",
    "REPORT.md",
    "audit.json",
    "hostile-evidence.json",
    "independent-verify.mjs",
  ].sort();
  assert.deepEqual(readdirSync(here).sort(), expectedNames, "audit exact package files");

  const rows = readFileSync(path.join(here, "MANIFEST.sha256"), "utf8")
    .trim()
    .split(/\r?\n/u)
    .map((line) => {
      const match = line.match(/^([a-f0-9]{64})  (.+)$/u);
      assert(match, "audit manifest row");
      return { sha256: match[1], path: match[2] };
    });
  assert.equal(rows.length, 4, "audit manifest row count");
  const expectedRowNames = expectedNames.filter((name) => name !== "MANIFEST.sha256").sort();
  const rowNames = rows.map((row) => path.basename(row.path)).sort();
  assert.deepEqual(rowNames, expectedRowNames, "audit manifest exact rows");
  for (const row of rows) {
    assert(row.path.startsWith("experiments/question-quality-20260715/reviews/linux-ext4-execution-boundary-v1-independent-audit-v1/"), "audit manifest path confinement");
    const name = path.basename(row.path);
    assert.equal(row.sha256, sha256(readFileSync(path.join(here, name))), "audit manifest hash " + name);
  }

  const audit = jsonFile(path.join(here, "audit.json"));
  const evidence = jsonFile(path.join(here, "hostile-evidence.json"));
  assert.equal(audit.verdict, result.verdict, "sealed audit verdict");
  assert.equal(audit.subject, result.subject, "sealed audit subject");
  assert.deepEqual(audit.subjectHashes, result.publicClosure.subjectHashes, "sealed subject hashes");
  assert.equal(audit.publicClosure.closureRows, result.publicClosure.closureRows, "sealed closure rows");
  assert.equal(audit.publicClosure.closureBytes, result.publicClosure.closureBytes, "sealed closure bytes");
  assert.equal(audit.publicClosure.closureSetSha256, result.publicClosure.closureSetSha256, "sealed closure set hash");
  assert.equal(audit.hostProbe.kernel, result.hostProbe.kernel, "sealed kernel");
  assert.equal(audit.hostProbe.home.magicHex, result.hostProbe.home.magicHex, "sealed ext4 magic");
  assert.equal(audit.hostProbe.windowsD.filesystemType, "9p", "sealed 9p");
  assert.deepEqual(audit.hostProbe.wslNode, result.hostProbe.wslNode, "sealed WSL Node");
  assert.deepEqual(audit.hostProbe.windowsNode, result.hostProbe.windowsNode, "sealed Windows Node");
  assert.equal(audit.hostile.totalMutationCases, result.hostile.totalMutationCases, "sealed mutation count");
  assert.equal(audit.hostile.allRejected, result.hostile.allRejected, "sealed rejection count");
  assert.equal(audit.hostile.escaped, 0, "sealed escaped count");
  assert.deepEqual(audit.activity, result.activity, "sealed prohibited activity");
  assert.equal(evidence.totalMutationCases, result.hostile.totalMutationCases, "hostile evidence count");
  assert.equal(evidence.allRejected, result.hostile.allRejected, "hostile evidence rejected");
  assert.equal(evidence.escaped, 0, "hostile evidence escaped");
  assert.deepEqual(evidence.targetedCoverage, result.hostile.coverage, "hostile named coverage");
  allNumericZero(evidence.prohibitedActivity, "hostile evidence prohibited activity");
  return {
    exactFiles: expectedNames.length,
    manifestRows: rows.length,
    manifestRowsVerified: rows.length,
    sealedAuditConsistent: true,
    hostileEvidenceConsistent: true,
  };
}

function main() {
  const protocol = jsonFile(path.join(subjectRoot, "protocol-v1.json"));
  const host = jsonFile(path.join(subjectRoot, "observed-host-v1.json"));
  const closure = jsonFile(path.join(subjectRoot, "current-worktree-public-source-closure-v1.json"));
  validateProtocol(protocol);
  validateHost(host);
  validateClosure(closure);
  const publicClosure = validateSubjectAndClosure(closure);
  const hostProbe = probeHostReadOnly();
  const hostile = runHostile(protocol, host, closure);

  const result = {
    schemaVersion: "linux-ext4-execution-boundary-v1-independent-audit-v1",
    verdict: "PASS_DESIGN_BLOCKERS_CORRECT",
    verdictScope: "The design correctly remains fail-closed. This is not execution authorization, ext4 crash-durability proof, deployment parity proof, source materialization, ledger migration, or restart evidence.",
    subject: subjectRel,
    independentMethod: {
      subjectVerifierExecuted: false,
      subjectHostileSuiteExecuted: false,
      subjectVerifierTrusted: false,
      networkOrApiUsed: false,
      providerOrModelUsed: false,
      databaseUsed: false,
      secretOrPrivateArtifactRead: false,
      budgetLedgerReadOrMutated: false,
      filesystemProbeWrites: 0,
      packageInstallBuildCopyMigrationDispatch: 0,
    },
    publicClosure,
    hostProbe,
    hostile,
    blockerDisposition: {
      blockersPresent: expectedBlockers,
      blockersRemoved: [],
      executionAuthorized: false,
      materializationAuthorized: false,
      installOrBuildAuthorized: false,
      ledgerMigrationOrReservationAuthorized: false,
      restartTestAuthorized: false,
      networkOrDispatchAuthorized: false,
    },
    activity: {
      networkCalls: 0,
      providerCalls: 0,
      modelCalls: 0,
      apiCandidatesConsumed: 0,
      databaseCalls: 0,
      secretReads: 0,
      privateArtifactReads: 0,
      budgetLedgerReads: 0,
      budgetLedgerMutations: 0,
      filesystemProbeWrites: 0,
      packageInstalls: 0,
      buildOrFreezeWrites: 0,
      sourceFilesCopiedOrStaged: 0,
      wslRestartTests: 0,
    },
  };
  result.auditPackageIntegrity = validateAuditPackage(result);
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}

main();
