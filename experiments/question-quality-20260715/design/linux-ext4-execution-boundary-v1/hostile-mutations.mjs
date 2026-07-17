import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  validateClosureObject,
  validateHostObject,
  validateProtocolObject,
} from "./verify.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const protocol = JSON.parse(readFileSync(path.join(here, "protocol-v1.json"), "utf8"));
const host = JSON.parse(readFileSync(path.join(here, "observed-host-v1.json"), "utf8"));
const closure = JSON.parse(readFileSync(path.join(here, "current-worktree-public-source-closure-v1.json"), "utf8"));
const clone = (value) => structuredClone(value);

const cases = [];
function hostile(name, base, mutate, validate) {
  cases.push({ name, base, mutate, validate });
}

hostile("protocol status cannot become ready", protocol, (x) => { x.status = "READY"; }, validateProtocolObject);
hostile("design-only cannot be removed", protocol, (x) => { x.scope.designOnly = false; }, validateProtocolObject);
hostile("candidate execution cannot be enabled", protocol, (x) => { x.scope.candidateExecutionAllowed = true; }, validateProtocolObject);
hostile("metadata network cannot be enabled", protocol, (x) => { x.scope.metadataNetworkAllowed = true; }, validateProtocolObject);
hostile("provider network cannot be enabled", protocol, (x) => { x.scope.providerNetworkAllowed = true; }, validateProtocolObject);
hostile("ledger mutation cannot be enabled", protocol, (x) => { x.scope.budgetLedgerMutationAllowed = true; }, validateProtocolObject);
hostile("private reads cannot be enabled", protocol, (x) => { x.scope.privateArtifactReadAllowed = true; }, validateProtocolObject);
hostile("9p fsync cannot become durability evidence", protocol, (x) => { x.observedHost.windowsDriveMount.fsyncSuccessCountsAsCrashDurabilityEvidence = true; }, validateProtocolObject);
hostile("execution filesystem cannot become 9p", protocol, (x) => { x.nativeExt4Gate.requiredFilesystemType = "9p"; }, validateProtocolObject);
hostile("9p cannot leave deny list", protocol, (x) => { x.nativeExt4Gate.deniedFilesystemTypes = x.nativeExt4Gate.deniedFilesystemTypes.filter((v) => v !== "9p"); }, validateProtocolObject);
hostile("file fsync alone cannot suffice", protocol, (x) => { x.nativeExt4Gate.successfulFileFsyncAloneIsNeverSufficient = false; }, validateProtocolObject);
hostile("reservation preflight cannot be skipped", protocol, (x) => { x.nativeExt4Gate.preflightMustRunAgainImmediatelyBeforeReservation = false; }, validateProtocolObject);
hostile("current public closure cannot become complete", protocol, (x) => { x.sourceTransfer.currentManifestIsExecutionComplete = true; }, validateProtocolObject);
hostile("recursive repo copy cannot be enabled", protocol, (x) => { x.sourceTransfer.recursiveRepositoryCopyAllowed = true; }, validateProtocolObject);
hostile("git exclusion cannot be removed", protocol, (x) => { x.sourceTransfer.forbiddenPathSegments = x.sourceTransfer.forbiddenPathSegments.filter((v) => v !== ".git"); }, validateProtocolObject);
hostile("private filename exclusion cannot be removed", protocol, (x) => { x.sourceTransfer.forbiddenBasenamesOrPatterns = x.sourceTransfer.forbiddenBasenamesOrPatterns.filter((v) => v !== "*.private.json"); }, validateProtocolObject);
hostile("hardlinks cannot be accepted", protocol, (x) => { x.sourceTransfer.hardlinkCountMustEqualOne = false; }, validateProtocolObject);
hostile("Windows node_modules cannot transfer", protocol, (x) => { x.sourceTransfer.windowsNodeModulesTransferAllowed = true; }, validateProtocolObject);
hostile("npm ci cannot be authorized by design", protocol, (x) => { x.linuxNativeToolchainGate.npmCiAllowedNow = true; }, validateProtocolObject);
hostile("parity cannot be declared ready", protocol, (x) => { x.deploymentParityGate.status = "READY"; }, validateProtocolObject);
hostile("unproven package engine cannot become evidence", protocol, (x) => { x.deploymentParityGate.currentEvidence.packageJsonNodeEnginePinned = true; }, validateProtocolObject);
hostile("WSL Node mismatch cannot be hidden", protocol, (x) => { x.deploymentParityGate.currentEvidence.wslNodeMatchesV6FrozenNode = true; }, validateProtocolObject);
hostile("ledger cannot be declared migrated", protocol, (x) => { x.singleLedgerAuthority.status = "MIGRATED"; }, validateProtocolObject);
hostile("authority count cannot become two", protocol, (x) => { x.singleLedgerAuthority.logicalAuthorityCountRequired = 2; }, validateProtocolObject);
hostile("Windows cannot become live authority", protocol, (x) => { x.singleLedgerAuthority.windowsJsonMayNeverBeLiveAuthorityDuringLinuxExecution = false; }, validateProtocolObject);
hostile("executor flock cannot be optional", protocol, (x) => { x.singleLedgerAuthority.concurrencyControl.required = false; }, validateProtocolObject);
hostile("C0 reservation cannot become three", protocol, (x) => { x.singleLedgerAuthority.c0Reservation.candidateCount = 3; }, validateProtocolObject);
hostile("dual ledgers cannot be allowed", protocol, (x) => { x.singleLedgerAuthority.c0Reservation.dualReservationLedgersForbidden = false; }, validateProtocolObject);
hostile("private journal cannot become capacity authority", protocol, (x) => { x.singleLedgerAuthority.c0Reservation.privateJournalIsReceiptEvidenceNotSecondCapacityAuthority = false; }, validateProtocolObject);
hostile("network cannot precede no-replay marker", protocol, (x) => { x.crashRecoveryAndNoReplay.networkSendRequiresPriorDurableNoReplayMarker = false; }, validateProtocolObject);
hostile("post-intent crash cannot allow replay", protocol, (x) => { x.crashRecoveryAndNoReplay.anyPostIntentCrashForbidsReplay = false; }, validateProtocolObject);
hostile("missing response cannot prove no send", protocol, (x) => { x.crashRecoveryAndNoReplay.recoveryNeverInfersNoSendFromMissingResponse = false; }, validateProtocolObject);
hostile("Windows mirror cannot become authority", protocol, (x) => { x.handoffToWindowsResearchArtifacts.windowsResearchTreeCanBecomeLiveAuthority = true; }, validateProtocolObject);
hostile("9p mirror cannot authorize settlement", protocol, (x) => { x.handoffToWindowsResearchArtifacts.ninePFsyncCanAuthorizeDeletionOrSettlement = true; }, validateProtocolObject);
hostile("blocker cannot be removed", protocol, (x) => { x.blockers.pop(); }, validateProtocolObject);
hostile("dispatch command cannot appear", protocol, (x) => { x.authorization.dispatchCommandPresent = true; }, validateProtocolObject);
hostile("activity cannot hide a network call", protocol, (x) => { x.activity.networkCalls = 1; }, validateProtocolObject);

hostile("home observation cannot become 9p", host, (x) => { x.observed.home.findmntFilesystemType = "9p"; }, validateHostObject);
hostile("Windows observation cannot become ext4", host, (x) => { x.observed.windowsD.findmntFilesystemType = "ext4"; }, validateHostObject);
hostile("host 9p fsync inference cannot flip", host, (x) => { x.interpretation.ninePFsyncSuccessWouldProveCrashDurability = true; }, validateHostObject);
hostile("host observation cannot authorize execution", host, (x) => { x.interpretation.readOnlyObservationProvesLiveExecutionSafety = true; }, validateHostObject);
hostile("host activity cannot hide a probe write", host, (x) => { x.activity.filesystemProbeWrites = 1; }, validateHostObject);

hostile("closure cannot become execution complete", closure, (x) => { x.executionComplete = true; }, validateClosureObject);
hostile("closure cannot claim transfer destination", closure, (x) => { x.sourceRootIsTransferDestination = true; }, validateClosureObject);
hostile("closure path cannot enter private", closure, (x) => { x.files[0].path = "experiments/private/secret.json"; }, validateClosureObject);
hostile("closure hash cannot drift", closure, (x) => { x.files[0].sha256 = "0".repeat(64); }, validateClosureObject);
hostile("closure bytes cannot drift", closure, (x) => { x.files[0].bytes += 1; }, validateClosureObject);
hostile("closure rows must remain sorted", closure, (x) => { [x.files[0], x.files[1]] = [x.files[1], x.files[0]]; }, validateClosureObject);
hostile("closure cannot gain an unbound row", closure, (x) => { x.files.push(clone(x.files.at(-1))); x.exactRows += 1; }, validateClosureObject);
hostile("closure exclusions cannot hide private input", closure, (x) => { x.exclusions.privatePathsIncluded = 1; }, validateClosureObject);
hostile("closure cannot claim materialization", closure, (x) => { x.materialization.attempted = true; }, validateClosureObject);
hostile("closure cannot authorize transfer", closure, (x) => { x.materialization.transferAuthorized = true; }, validateClosureObject);
hostile("closure activity cannot hide package install", closure, (x) => { x.activity.packageInstalls = 1; }, validateClosureObject);

validateProtocolObject(protocol);
validateHostObject(host);
validateClosureObject(closure);
let rejected = 0;
for (const testCase of cases) {
  const mutated = clone(testCase.base);
  testCase.mutate(mutated);
  assert.throws(() => testCase.validate(mutated), undefined, `hostile mutation accepted: ${testCase.name}`);
  rejected += 1;
}

process.stdout.write(`${JSON.stringify({
  schemaVersion: "question-quality-linux-ext4-execution-boundary-v1-hostile-report",
  verdict: "PASS_ALL_HOSTILE_MUTATIONS_REJECTED",
  hostileCases: cases.length,
  rejected,
  networkCalls: 0,
  providerCalls: 0,
  modelCalls: 0,
  apiCandidatesConsumed: 0,
  databaseCalls: 0,
  secretReads: 0,
  privateArtifactReads: 0,
  budgetLedgerReads: 0,
  budgetLedgerMutations: 0,
}, null, 2)}\n`);
