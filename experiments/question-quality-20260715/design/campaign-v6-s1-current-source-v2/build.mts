import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const here = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(here, "../../../..");
export const oldDesignDir = path.join(
  repoRoot,
  "experiments/question-quality-20260715/design/campaign-v6-s1",
);
export const subjectDir = path.join(
  repoRoot,
  "experiments/question-quality-20260715/design/reviewer-calibration-v3-production-type-binding-v4",
);
export const auditDir = path.join(
  repoRoot,
  "experiments/question-quality-20260715/reviews/reviewer-calibration-v3-production-type-binding-v4-independent-audit-v1",
);

export const paths = {
  oldPublic: path.join(oldDesignDir, "campaign-v6-s1.json"),
  oldManifest: path.join(oldDesignDir, "MANIFEST.sha256"),
  oldPrivateQueue: path.join(oldDesignDir, "private/s1-queue-v6.json"),
  subjectManifest: path.join(subjectDir, "MANIFEST.sha256"),
  auditManifest: path.join(auditDir, "MANIFEST.sha256"),
  auditJson: path.join(auditDir, "audit.json"),
  privateQueue: path.join(here, "private/s1-queue-v6.json"),
  publicArtifact: path.join(here, "campaign-v6-s1-current-source-v2.json"),
  manifest: path.join(here, "MANIFEST.sha256"),
} as const;

export const MANIFEST_FILES = [
  "README.md",
  "build.mts",
  "verify.mts",
  "hostile-tests.mts",
  "tsconfig.json",
  "campaign-v6-s1-current-source-v2.json",
  "private/.gitignore",
] as const;

export const STATUS = "CURRENT_SOURCE_RESEAL_PREPARED_EXECUTION_BLOCKED" as const;
export const CONNECTIVITY_STATUS = "PENDING_CONNECTIVITY_V6_INDEPENDENT_PASS" as const;
export const OLD_PUBLIC_SHA256 =
  "357bb6aceb68cec6e200c47938d211d5aeaeb1d4a11ef2151404b0c0dd1d4c20" as const;
export const OLD_MANIFEST_SHA256 =
  "64f19f1083a5cdcf223e38a5d28804b764404599f2702044141e4a9ca1991dcc" as const;
export const PRIVATE_QUEUE_FILE_SHA256 =
  "6b7a8ee4aa05f089ccfe992b83547449d1923b2b65cf93ed36785f0330774971" as const;
export const PRIVATE_QUEUE_SEMANTIC_SHA256 =
  "0ab4f11551a030c0f72563bf474816d96c265f75ca6ee4b01535518cf308de1c" as const;
export const OLD_SOURCE_CLOSURE_SHA256 =
  "08fb2493f838d5954bb4fe8f72f26df401ac47bb35e9c9fb47146fab720b4114" as const;
export const TYPE_BINDING_SUBJECT_MANIFEST_SHA256 =
  "715818a82951a8c51460a3216b81d46c3184a1db934cc96e27602bc666024f04" as const;
export const TYPE_BINDING_AUDIT_MANIFEST_SHA256 =
  "796adc11ef8c4a07b0536aee6f0e60d732b09c40ac7e39d704b70a8a6ed9032d" as const;

export const DRIFT_PATHS = [
  "src/lib/atlas-research-fetch-boundary.ts",
  "experiments/question-quality-20260715/execution/campaign-v6-s1-durable-controller-v1/materialize.ts",
  "experiments/question-quality-20260715/execution/campaign-v6-s1-durable-controller-v1/runtime.ts",
  "experiments/question-quality-20260715/execution/campaign-v6-s1-durable-controller-v1/openrouter-question-parser.ts",
  "experiments/question-quality-20260715/execution/campaign-v6-s1-durable-controller-v1/MANIFEST.sha256",
  "experiments/question-quality-20260715/harness/atlas-controller.ts",
  "experiments/question-quality-20260715/harness/ledger.ts",
] as const;

type JsonRecord = Record<string, any>;

export function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right, "en"))
        .map(([key, nested]) => [key, stableValue(nested)]),
    );
  }
  return value;
}

export function stableJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

export function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function fileSha256(filePath: string): string {
  return sha256(readFileSync(filePath));
}

function git(args: readonly string[], allowFailure = false): string {
  const result = spawnSync("git", [...args], {
    cwd: repoRoot,
    encoding: "utf8",
    windowsHide: true,
  });
  if (!allowFailure) {
    assert.equal(result.status, 0, `git ${args.join(" ")} failed: ${result.stderr}`);
  }
  return result.status === 0 ? result.stdout.trim() : "";
}

function verifyManifestFile(dir: string, manifestPath: string): void {
  const lines = readFileSync(manifestPath, "utf8").trim().split(/\r?\n/u);
  assert(lines.length > 0);
  for (const line of lines) {
    const match = /^([a-f0-9]{64})  (.+)$/u.exec(line);
    assert(match, `invalid manifest line: ${line}`);
    assert.equal(fileSha256(path.join(dir, match[2])), match[1]);
  }
}

function countBy(values: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) => left.localeCompare(right, "en")),
  );
}

function currentSourceRows(oldPublic: JsonRecord) {
  const oldRows = oldPublic.sourceClosure.files as JsonRecord[];
  assert.equal(oldRows.length, 55);
  assert.equal(sha256(stableJson(oldRows)), OLD_SOURCE_CLOSURE_SHA256);
  return oldRows.map((row) => {
    assert.equal(typeof row.role, "string");
    assert.equal(typeof row.path, "string");
    const absolute = path.resolve(repoRoot, row.path);
    assert(
      absolute.startsWith(`${repoRoot}${path.sep}`),
      `source escapes repository: ${row.path}`,
    );
    const bytes = statSync(absolute).size;
    const currentSha256 = fileSha256(absolute);
    return {
      role: row.role,
      path: row.path,
      bytes,
      sha256: currentSha256,
      priorSeal: {
        bytes: row.bytes,
        sha256: row.sha256,
        equalToCurrent: row.bytes === bytes && row.sha256 === currentSha256,
      },
    };
  });
}

function gitLineage(relativePath: string) {
  const trackedPath = git(["ls-files", "--error-unmatch", "--", relativePath], true);
  const indexBlob = git(["rev-parse", `:${relativePath}`], true);
  const headBlob = git(["rev-parse", `HEAD:${relativePath}`], true);
  const historyRaw = git([
    "log",
    "--all",
    "--follow",
    "--format=%H|%aI|%s",
    "--",
    relativePath,
  ], true);
  const worktreeDiff = git(["diff", "--no-ext-diff", "--binary", "--", relativePath]);
  const stagedDiff = git(["diff", "--cached", "--no-ext-diff", "--binary", "--", relativePath]);
  return {
    porcelainV1: git(["status", "--porcelain=v1", "--untracked-files=all", "--", relativePath]),
    trackedInIndex: trackedPath.length > 0,
    indexBlobOid: indexBlob || null,
    headBlobOid: headBlob || null,
    worktreeBlobOid: git(["hash-object", "--", relativePath]),
    recentPathHistory: historyRaw ? historyRaw.split(/\r?\n/u) : [],
    trackedWorktreeDiffSha256: sha256(worktreeDiff),
    stagedDiffSha256: sha256(stagedDiff),
    interpretation: "UNTRACKED_WHOLE_FILE_DIFF_AGAINST_ABSENT_HEAD_AND_INDEX",
  };
}

function assertPrivateQueueContract(queue: JsonRecord, raw: string): void {
  assert.equal(sha256(raw), PRIVATE_QUEUE_FILE_SHA256);
  assert.equal(queue.privateQueueSemanticSha256, PRIVATE_QUEUE_SEMANTIC_SHA256);
  const core = { ...queue };
  delete core.privateQueueSemanticSha256;
  assert.equal(sha256(stableJson(core)), PRIVATE_QUEUE_SEMANTIC_SHA256);
  assert.equal(queue.status, "IMMUTABLE_QUEUE_EXECUTION_BLOCKED");
  assert.equal(queue.passages.length, 12);
  assert.equal(queue.assignments.length, 180);
  assert.equal(queue.noReplacementOrTopUp, true);
  assert.equal(queue.campaignEligibleAssignments, 0);
  assert.equal(queue.generationAuthorized, false);
  assert.deepEqual(queue.safety, {
    modelApiCalls: 0,
    providerCalls: 0,
    networkCalls: 0,
    databaseCalls: 0,
    secretReads: 0,
    apiCandidatesConsumed: 0,
  });
  assert.equal(new Set(queue.assignments.map((row: JsonRecord) => row.assignmentId)).size, 180);
  assert.equal(new Set(queue.assignments.map((row: JsonRecord) => row.assignmentKey)).size, 180);
  assert.deepEqual(queue.assignments.map((row: JsonRecord) => row.queueOrdinal),
    Array.from({ length: 180 }, (_, index) => index + 1));
  assert.deepEqual(countBy(queue.assignments.map((row: JsonRecord) => row.questionType)), {
    BLANK_INFERENCE: 84,
    GRAMMAR_ERROR: 96,
  });
  assert.deepEqual(countBy(queue.assignments.map((row: JsonRecord) => row.plan)), {
    PREMIUM: 84,
    STANDARD: 96,
  });
  assert.deepEqual(countBy(queue.assignments.map((row: JsonRecord) => row.difficulty)), {
    INTERMEDIATE: 90,
    KILLER: 90,
  });
  assert.deepEqual(countBy(queue.assignments.map((row: JsonRecord) => row.profileId)), {
    B0_CURRENT_CONTROL: 24,
    B1_TYPE_SCOPED_TAIL: 12,
    B2_POSITIVE_COMPACT: 24,
    B3_OPTION_INTENT_LEDGER: 24,
    G0_CURRENT_CONTROL: 24,
    G1_FINAL_CHECKLIST_ABLATION: 24,
    G2_POSITIVE_COMPACT: 24,
    G3_SITE_CERTIFICATE: 24,
  });
  for (const passage of queue.passages as JsonRecord[]) {
    assert.equal(passage.rights.authorship, "CAMPAIGN_ORIGINAL");
    assert.equal(passage.rights.externalModelProcessingAuthorized, true);
    assert.equal(passage.rights.piiReview, "NO_PII_FOUND");
    assert.equal(passage.rights.passageUtf8Sha256, passage.passageUtf8Sha256);
  }
  for (const row of queue.assignments as JsonRecord[]) {
    assert.equal(row.modelId,
      row.plan === "STANDARD" ? "google/gemini-3.5-flash" : "google/gemini-3.1-pro-preview");
    assert.deepEqual(row.wireContract.providerRouting, {
      order: ["google-vertex/global"],
      only: ["google-vertex/global"],
      allow_fallbacks: false,
      require_parameters: true,
      data_collection: "deny",
      zdr: true,
    });
    assert.deepEqual(row.wireContract.reasoning, {
      enabled: false,
      effort: "none",
      exclude: true,
    });
    assert.equal(row.admission.candidateOpportunityCap, 1);
    assert.equal(row.admission.physicalFetchCap, 1);
    assert.equal(row.admission.fullQuestionSemanticCap, 1);
    assert.equal(row.admission.outerAttempts, 1);
    assert.equal(row.admission.sdkRetries, 0);
    assert.equal(row.replacementAllowed, false);
    assert.equal(row.topUpAllowed, false);
    assert.equal(row.campaignEligible, false);
    assert.equal(row.generationAuthorized, false);
  }
}

export function buildCurrentSourceReseal() {
  assert.equal(fileSha256(paths.oldPublic), OLD_PUBLIC_SHA256);
  assert.equal(fileSha256(paths.oldManifest), OLD_MANIFEST_SHA256);
  verifyManifestFile(oldDesignDir, paths.oldManifest);
  assert.equal(fileSha256(paths.subjectManifest), TYPE_BINDING_SUBJECT_MANIFEST_SHA256);
  assert.equal(fileSha256(paths.auditManifest), TYPE_BINDING_AUDIT_MANIFEST_SHA256);
  verifyManifestFile(subjectDir, paths.subjectManifest);
  verifyManifestFile(auditDir, paths.auditManifest);

  const audit = JSON.parse(readFileSync(paths.auditJson, "utf8")) as JsonRecord;
  assert.equal(audit.verdict, "PASS_NO_BLOCKERS");
  assert.equal(audit.subject.manifestSha256, TYPE_BINDING_SUBJECT_MANIFEST_SHA256);

  const oldPublicRaw = readFileSync(paths.oldPublic, "utf8");
  const oldPublic = JSON.parse(oldPublicRaw) as JsonRecord;
  const privateRaw = readFileSync(paths.oldPrivateQueue, "utf8");
  const queue = JSON.parse(privateRaw) as JsonRecord;
  assertPrivateQueueContract(queue, privateRaw);

  const sourceRows = currentSourceRows(oldPublic);
  const drift = sourceRows.filter((row) => !row.priorSeal.equalToCurrent);
  assert.deepEqual(drift.map((row) => row.path), [...DRIFT_PATHS]);
  const driftLineage = drift.map((row) => ({
    role: row.role,
    path: row.path,
    oldSealBytes: row.priorSeal.bytes,
    oldSealSha256: row.priorSeal.sha256,
    currentBytes: row.bytes,
    currentSha256: row.sha256,
    git: gitLineage(row.path),
  }));
  for (const row of driftLineage) {
    assert.equal(row.git.porcelainV1, `?? ${row.path}`);
    assert.equal(row.git.trackedInIndex, false);
    assert.equal(row.git.indexBlobOid, null);
    assert.equal(row.git.headBlobOid, null);
    assert.deepEqual(row.git.recentPathHistory, []);
    assert.equal(row.git.trackedWorktreeDiffSha256, sha256(""));
    assert.equal(row.git.stagedDiffSha256, sha256(""));
  }

  const passageCommitmentSha256 = sha256(stableJson(queue.passages));
  const assignmentMembershipAndOrderSha256 = sha256(stableJson(queue.assignments));
  const sourceClosureSha256 = sha256(stableJson(sourceRows));
  const repoHead = git(["rev-parse", "HEAD"]);
  const publicCore = {
    schemaVersion: "question-quality-s1-current-source-reseal-v2-public-1",
    artifactId: "campaign-v6-s1-current-source-v2",
    status: STATUS,
    campaignId: queue.campaignId,
    preparationOnly: true,
    immutableQueuePreservation: {
      sourceDesignRole: "STALE_IMMUTABLE_LINEAGE_ONLY_NOT_CURRENT_SOURCE_AUTHORITY",
      sourceDesignPath: "experiments/question-quality-20260715/design/campaign-v6-s1",
      sourcePublicSha256: OLD_PUBLIC_SHA256,
      sourceManifestSha256: OLD_MANIFEST_SHA256,
      privateQueueFileSha256: PRIVATE_QUEUE_FILE_SHA256,
      privateQueueSemanticSha256: PRIVATE_QUEUE_SEMANTIC_SHA256,
      privateQueueUtf8Bytes: Buffer.byteLength(privateRaw, "utf8"),
      byteIdenticalToSourceQueue: true,
      semanticIdenticalToSourceQueue: true,
      passages: 12,
      assignments: 180,
      passageCommitmentSha256,
      assignmentMembershipAndOrderSha256,
      reassignmentAllowed: false,
      replacementAllowed: false,
      topUpAllowed: false,
    },
    exactExperimentContract: {
      byType: countBy(queue.assignments.map((row: JsonRecord) => row.questionType)),
      byPlan: countBy(queue.assignments.map((row: JsonRecord) => row.plan)),
      byDifficulty: countBy(queue.assignments.map((row: JsonRecord) => row.difficulty)),
      byProfile: countBy(queue.assignments.map((row: JsonRecord) => row.profileId)),
      candidateOpportunityPerAssignment: 1,
      physicalFetchPerAssignment: 1,
      semanticQuestionPerAssignment: 1,
      outerAttemptPerAssignment: 1,
      sdkRetryPerAssignment: 0,
      models: queue.fixedRequestContext.models,
      providerRouting: queue.fixedRequestContext.providerRouting,
      reasoning: queue.fixedRequestContext.reasoning,
    },
    corpusRightsAndPii: {
      corpusBinding: queue.corpusBinding,
      exactPrivatePassageCommitmentSha256: passageCommitmentSha256,
      rowLevelOriginalAuthorshipBound: true,
      rowLevelNoPiiObservedBound: true,
      rowLevelExternalModelProcessingScopeBound: true,
      unchangedFromImmutableQueue: true,
    },
    currentSourceClosure: {
      repositoryHeadObservedReadOnly: repoHead,
      membershipSourcePublicSha256: OLD_PUBLIC_SHA256,
      membershipRows: sourceRows.length,
      sha256: sourceClosureSha256,
      files: sourceRows,
      driftFromOldSeal: {
        count: driftLineage.length,
        exactExpectedPaths: DRIFT_PATHS,
        rows: driftLineage,
        oldClosureRole: "STALE_LINEAGE_ONLY",
        currentBytesAreResealAuthority: true,
      },
    },
    productionTypeAuthority: {
      status: "PASS_PINNED_NOT_DISPATCH_AUTHORIZATION",
      subjectArtifactId: "reviewer-calibration-v3-production-type-binding-v4",
      subjectManifestSha256: TYPE_BINDING_SUBJECT_MANIFEST_SHA256,
      independentAuditArtifactId:
        "reviewer-calibration-v3-production-type-binding-v4-independent-audit-v1",
      independentAuditManifestSha256: TYPE_BINDING_AUDIT_MANIFEST_SHA256,
      independentAuditVerdict: "PASS_NO_BLOCKERS",
    },
    connectivityAuthority: {
      status: CONNECTIVITY_STATUS,
      version: 6,
      subjectManifestSha256: null,
      independentAuditManifestSha256: null,
      v5AcceptedAsAuthority: false,
      placeholderHashAccepted: false,
      executionBlocked: true,
    },
    authorization: {
      status: "BLOCKED",
      frozenForExecution: false,
      generationAuthorized: false,
      campaignEligibleAssignments: 0,
      requiredNextEvidence: CONNECTIVITY_STATUS,
      laterSeparateAuthorizationArtifactRequired: true,
    },
    safety: {
      networkCalls: 0,
      providerCalls: 0,
      modelCalls: 0,
      apiCalls: 0,
      databaseCalls: 0,
      secretReads: 0,
      budgetLedgerReads: 0,
      budgetLedgerWrites: 0,
      apiCandidatesConsumed: 0,
    },
  } as const;
  const publicArtifact = {
    ...publicCore,
    publicArtifactSemanticSha256: sha256(stableJson(publicCore)),
  };
  const publicBytes = `${JSON.stringify(publicArtifact, null, 2)}\n`;
  return { privateRaw, queue, publicArtifact, publicBytes };
}

export function assertExactResealBytes(publicBytes: string, privateBytes: string): void {
  const rebuilt = buildCurrentSourceReseal();
  assert.equal(privateBytes, rebuilt.privateRaw, "private queue bytes differ from immutable source");
  assert.equal(publicBytes, rebuilt.publicBytes, "public artifact differs from current-source rebuild");
}

function writeManifest(): void {
  const lines = MANIFEST_FILES.map((relativePath) =>
    `${fileSha256(path.join(here, relativePath))}  ${relativePath.replaceAll("\\", "/")}`,
  );
  writeFileSync(paths.manifest, `${lines.join("\n")}\n`, "utf8");
}

async function main(): Promise<void> {
  const output = buildCurrentSourceReseal();
  if (process.argv.includes("--write")) {
    mkdirSync(path.dirname(paths.privateQueue), { recursive: true });
    writeFileSync(paths.privateQueue, output.privateRaw, "utf8");
    writeFileSync(paths.publicArtifact, output.publicBytes, "utf8");
    writeManifest();
  }
  process.stdout.write(`${JSON.stringify({
    status: output.publicArtifact.status,
    assignments: output.queue.assignments.length,
    sourceRows: output.publicArtifact.currentSourceClosure.membershipRows,
    driftRows: output.publicArtifact.currentSourceClosure.driftFromOldSeal.count,
    connectivity: output.publicArtifact.connectivityAuthority.status,
    generationAuthorized: false,
    apiCandidatesConsumed: 0,
  }, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
