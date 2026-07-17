import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../../../..");
const RESULT_PATH = path.join(HERE, "audit-result.json");
const README_PATH = path.join(HERE, "README.md");
const MANIFEST_PATH = path.join(HERE, "MANIFEST.sha256");

const PRIVATE_QUEUE_PATH =
  "experiments/question-quality-20260715/design/campaign-v5-s1/private/s1-queue-v5.json";
const CAMPAIGN_PATH =
  "experiments/question-quality-20260715/design/campaign-v5-s1/campaign-v5-s1.json";
const GRAMMAR_FRAME_PATH =
  "experiments/question-quality-20260715/corpus/cross-type-grammar-source-frame-v2/source-frame-public.json";
const BLANK_FRAME_PATH =
  "experiments/question-quality-20260715/corpus/cross-type-blank-source-frame-v2/source-frame-public.json";
const SNAPSHOT_PATH =
  "experiments/question-quality-20260715/corpus/v3/private/input-snapshot.json";
const REPO_CORPUS_PATH = "src/data/exam-passages/passages.json";
const SCHEMA_PATH = "prisma/schema.prisma";
const TERMS_PATH = "src/app/terms/page.tsx";
const PRIVACY_PATH = "src/app/privacy/page.tsx";
const ONBOARDING_PAGE_PATH = "src/app/auth/onboarding/page.tsx";
const ONBOARDING_ROUTE_PATH = "src/app/api/auth/onboarding/route.ts";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const readBuffer = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath));
const readText = (relativePath) => readBuffer(relativePath).toString("utf8");
const readJson = (relativePath) => JSON.parse(readText(relativePath));
const normalizePath = (value) => value.split(path.sep).join("/");

function aggregate(rows, keyFn) {
  const counts = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort(([a], [b]) => a.localeCompare(b, "en")));
}

function rightsLikeFieldNames(value) {
  if (!value || typeof value !== "object") return [];
  return Object.keys(value)
    .filter((key) => /right|licen[cs]e|copyright|permission|contentConsent|sourceConsent/i.test(key))
    .sort((a, b) => a.localeCompare(b, "en"));
}

function extractPrismaModelFields(schema, modelName) {
  const match = schema.match(new RegExp(`model\\s+${modelName}\\s*\\{([\\s\\S]*?)\\n\\}`));
  assert.ok(match, `missing Prisma model ${modelName}`);
  const fields = [];
  for (const rawLine of match[1].split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("//") || line.startsWith("///") || line.startsWith("@@")) continue;
    const field = line.match(/^([A-Za-z][A-Za-z0-9_]*)\s+/)?.[1];
    if (field) fields.push(field);
  }
  return fields;
}

function collectSourceFiles() {
  const directories = [
    "src/app/(director)/director/workbench/generate/intake",
    "src/app/(director)/director/workbench/passages/import",
    "src/app/api/extraction",
  ];
  const individualFiles = [
    "src/actions/workbench/passages.ts",
    "src/actions/workbench/exam-passages.ts",
    "src/trigger/_lib/extraction-finalize/source-material.ts",
    "src/app/api/extraction/jobs/[jobId]/commit/_lib/ensure-source-material.ts",
  ];
  const output = [];
  const visit = (absolutePath) => {
    for (const entry of fs.readdirSync(absolutePath, { withFileTypes: true })) {
      const child = path.join(absolutePath, entry.name);
      if (entry.isDirectory()) visit(child);
      else if (/\.tsx?$/.test(entry.name)) output.push(normalizePath(path.relative(ROOT, child)));
    }
  };
  for (const directory of directories) visit(path.join(ROOT, directory));
  output.push(...individualFiles);
  return [...new Set(output)].sort((a, b) => a.localeCompare(b, "en"));
}

function sourceProjection(files) {
  return files
    .map((relativePath) => {
      const bytes = readBuffer(relativePath);
      return `${relativePath}|${bytes.length}|${sha256(bytes)}`;
    })
    .join("\n");
}

function gitShow(commit, relativePath) {
  return execFileSync("git", ["show", `${commit}:${relativePath}`], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });
}

function gitStatus(relativePaths) {
  return execFileSync("git", ["status", "--short", "--", ...relativePaths], {
    cwd: ROOT,
    encoding: "utf8",
    windowsHide: true,
  })
    .split(/\r?\n/)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "en"));
}

const result = JSON.parse(fs.readFileSync(RESULT_PATH, "utf8"));
for (const line of fs.readFileSync(MANIFEST_PATH, "utf8").trim().split(/\r?\n/)) {
  const match = line.match(/^([a-f0-9]{64})  ([^/\\]+)$/);
  assert.ok(match, `invalid manifest line: ${line}`);
  const [, expectedHash, fileName] = match;
  assert.equal(
    sha256(fs.readFileSync(path.join(HERE, fileName))),
    expectedHash,
    `artifact manifest drift: ${fileName}`,
  );
}
assert.equal(result.schemaVersion, 1);
assert.equal(result.status, "LOCAL_RIGHTS_EVIDENCE_AUDITED_EXECUTION_BLOCKED");
assert.equal(result.verdict, "BLOCKED_NO_DOCUMENTED_SELECTED_ROW_PROVIDER_PROCESSING_RIGHTS");
assert.equal(result.scope.networkCalls, 0);
assert.equal(result.scope.databaseCalls, 0);
assert.equal(result.scope.modelApiCalls, 0);
assert.equal(result.scope.apiCandidateCount, 0);

for (const evidence of result.evidenceFiles) {
  const bytes = readBuffer(evidence.path);
  assert.equal(bytes.length, evidence.bytes, `byte drift: ${evidence.path}`);
  assert.equal(sha256(bytes), evidence.sha256, `hash drift: ${evidence.path}`);
}

const queue = readJson(PRIVATE_QUEUE_PATH);
const campaign = readJson(CAMPAIGN_PATH);
const grammarFrame = readJson(GRAMMAR_FRAME_PATH);
const blankFrame = readJson(BLANK_FRAME_PATH);
const snapshot = readJson(SNAPSHOT_PATH);
const repoCorpus = readJson(REPO_CORPUS_PATH);
const schema = readText(SCHEMA_PATH);
const terms = readText(TERMS_PATH);
const privacy = readText(PRIVACY_PATH);
const onboardingPage = readText(ONBOARDING_PAGE_PATH);
const onboardingRoute = readText(ONBOARDING_ROUTE_PATH);

assert.equal(queue.generationAuthorized, false);
assert.equal(queue.campaignEligibleAssignments, 0);
assert.equal(queue.passages.length, 12);
assert.equal(queue.assignments.length, 180);
assert.equal(campaign.authorization.generationAuthorized, false);
assert.equal(campaign.authorization.campaignEligibleAssignments, 0);
assert.equal(
  campaign.executionHolds.sourceRights,
  "BLOCKED_PENDING_DOCUMENTED_PROVIDER_PROCESSING_RIGHTS",
);

const frameByType = new Map([
  ["GRAMMAR_ERROR", grammarFrame],
  ["BLANK_INFERENCE", blankFrame],
]);
const sourceRowsByType = new Map();
for (const [questionType, frame] of frameByType) {
  const rows = new Map();
  for (const row of frame.rows) {
    assert.equal(rows.has(row.contentHash), false, `duplicate public source hash for ${questionType}`);
    rows.set(row.contentHash, row);
  }
  sourceRowsByType.set(questionType, rows);
}

const snapshotById = new Map(snapshot.candidates.map((candidate) => [candidate.id, candidate]));
const passageClass = new Map();
const joined = [];
for (const passage of queue.passages) {
  const sourceRow = sourceRowsByType.get(passage.questionType)?.get(passage.contentHash);
  assert.ok(sourceRow, `missing public source-frame join for ${passage.questionType}`);
  assert.equal(sourceRow.rightsRecord, "NOT_PRESENT_IN_SNAPSHOT");
  assert.equal(sourceRow.campaignEligible, false);
  assert.equal(passage.campaignEligible, false);
  const candidate = snapshotById.get(passage.candidateId);
  assert.ok(candidate, "missing frozen v3 candidate join");
  assert.equal(candidate.sourceKind, sourceRow.sourceKind);
  assert.deepEqual(rightsLikeFieldNames(candidate), []);
  assert.deepEqual(rightsLikeFieldNames(candidate.document), []);
  const provenanceClass = `${candidate.origin}|${candidate.sourceKind}`;
  passageClass.set(passage.passageToken, provenanceClass);
  joined.push({ questionType: passage.questionType, provenanceClass, candidate });
}
assert.equal(joined.length, 12);

const passageCells = aggregate(
  joined,
  (row) => `${row.questionType}|${row.provenanceClass}`,
);
const assignmentCells = aggregate(
  queue.assignments,
  (row) => `${row.questionType}|${passageClass.get(row.passageToken)}`,
);
assert.deepEqual(passageCells, result.aggregates.passagesByQuestionTypeAndProvenance);
assert.deepEqual(assignmentCells, result.aggregates.assignmentsByQuestionTypeAndProvenance);
assert.deepEqual(aggregate(joined, (row) => row.provenanceClass), result.aggregates.passagesByProvenance);
assert.deepEqual(
  aggregate(queue.assignments, (row) => passageClass.get(row.passageToken)),
  result.aggregates.assignmentsByProvenance,
);
assert.equal(joined.filter((row) => row.candidate.origin === "repo-official").length, 9);
assert.equal(joined.filter((row) => row.candidate.origin === "db-global").length, 3);

const repoById = new Map(repoCorpus.map((row) => [row.id, row]));
const selectedRepoRows = joined
  .filter((row) => row.candidate.origin === "repo-official")
  .map((row) => repoById.get(row.candidate.sourceRecordId));
assert.equal(selectedRepoRows.length, 9);
assert.equal(selectedRepoRows.every(Boolean), true);
assert.equal(repoCorpus.length, result.aggregates.currentRepoCorpusRows);
assert.equal(
  repoCorpus.reduce((count, row) => count + rightsLikeFieldNames(row).length, 0),
  0,
);
assert.equal(selectedRepoRows.reduce((count, row) => count + rightsLikeFieldNames(row).length, 0), 0);

assert.equal(grammarFrame.rows.length, 186);
assert.equal(blankFrame.rows.length, 157);
assert.equal(grammarFrame.rows.every((row) => row.rightsRecord === "NOT_PRESENT_IN_SNAPSHOT"), true);
assert.equal(blankFrame.rows.every((row) => row.rightsRecord === "NOT_PRESENT_IN_SNAPSHOT"), true);
assert.equal(grammarFrame.aggregate.rightsRecordAbsent, grammarFrame.rows.length);
assert.equal(blankFrame.aggregate.rightsRecordAbsent, blankFrame.rows.length);

const passageFields = extractPrismaModelFields(schema, "Passage");
const sourceMaterialFields = extractPrismaModelFields(schema, "SourceMaterial");
assert.deepEqual(
  passageFields.filter((field) => /right|licen[cs]e|copyright|permission|contentConsent|sourceConsent/i.test(field)),
  [],
);
assert.deepEqual(
  sourceMaterialFields.filter((field) =>
    /right|licen[cs]e|copyright|permission|contentConsent|sourceConsent/i.test(field),
  ),
  [],
);
assert.equal(passageFields.length, result.schemaEvidence.passageFieldCount);
assert.equal(sourceMaterialFields.length, result.schemaEvidence.sourceMaterialFieldCount);

assert.match(terms, /회원은 저작권, 개인정보, 초상권, 학습자료 이용 권한 등 제3자의 권리를 침해하는 자료를 업로드하거나 처리해서는 안 됩니다/);
assert.match(terms, /회사는 서비스 제공, 장애 대응, 품질 개선, 보안 점검을 위해 필요한 범위에서 입력·출력 데이터 및 사용 로그를 처리할 수 있습니다/);
assert.match(privacy, /AI 문제 생성, 학습지 생성, 텍스트 추출 등 서비스 기능 제공을 위해 회원이 입력하거나 업로드한 자료와 사용 로그를 처리할 수 있습니다/);
for (const marker of [
  "OpenRouter",
  "Gemini",
  "모델 제공업체에 전송",
  "AI 제공업체에 전송",
  "콘텐츠 이용허락",
  "저작물 이용허락",
  "재허락",
  "sublicense",
]) {
  assert.equal(terms.includes(marker), false, `terms now contain a provider-rights marker requiring re-audit: ${marker}`);
}
assert.match(onboardingPage, /register\("agree"\)/);
assert.match(onboardingRoute, /agree:\s*z\.boolean\(\)\.refine\(Boolean,\s*"agreement_required"\)/);
assert.equal(/parsed\.data\.agree(?!Marketing)/.test(onboardingRoute), false);
for (const marker of ["termsAcceptedAt", "termsVersion", "contentRightsAttestedAt", "sourceRightsAttestedAt"]) {
  assert.equal(schema.includes(marker), false, `schema now contains ${marker}; re-audit required`);
  assert.equal(onboardingRoute.includes(marker), false, `onboarding now contains ${marker}; re-audit required`);
}

const uploadSources = collectSourceFiles();
const attestationPattern =
  /(저작권|학습자료\s*이용\s*권한).{0,80}(보유|허가|동의|확인)|rightsAttestation|contentRights|permissionToProcess|licenseGrant/is;
const uploadAttestationMatches = uploadSources.filter((relativePath) =>
  attestationPattern.test(readText(relativePath)),
);
assert.equal(uploadSources.length, result.uploadFlowEvidence.scannedSourceFiles);
assert.equal(uploadAttestationMatches.length, 0);
assert.equal(sha256(sourceProjection(uploadSources)), result.uploadFlowEvidence.sourceProjectionSha256);

for (const revision of result.gitHistory.repoCorpusRevisions) {
  const historicalRows = JSON.parse(gitShow(revision.commit, REPO_CORPUS_PATH));
  assert.equal(historicalRows.length, revision.rows);
  assert.equal(
    historicalRows.reduce((count, row) => count + rightsLikeFieldNames(row).length, 0),
    0,
  );
  const keys = [...new Set(historicalRows.flatMap((row) => Object.keys(row)))].sort((a, b) =>
    a.localeCompare(b, "en"),
  );
  assert.equal(sha256(JSON.stringify(keys)), revision.unionKeysSha256);
}

const relevantWorktreeStatus = gitStatus(result.gitHistory.worktreePaths);
assert.deepEqual(relevantWorktreeStatus, result.gitHistory.worktreeStatus);

const publicArtifacts = [fs.readFileSync(RESULT_PATH, "utf8"), fs.readFileSync(README_PATH, "utf8")];
const sensitiveValues = new Set();
for (const passage of queue.passages) {
  for (const value of [
    passage.passageContentExact,
    passage.candidateId,
    passage.sourceRecordId,
    passage.documentKey,
    passage.sourceDocumentId,
    passage.frameId,
    passage.passageToken,
    passage.contentHash,
    passage.passageUtf8Sha256,
  ]) {
    if (typeof value === "string" && value.length >= 8) sensitiveValues.add(value);
  }
}
for (const assignment of queue.assignments) {
  for (const value of [assignment.assignmentId, assignment.assignmentKey]) {
    if (typeof value === "string" && value.length >= 8) sensitiveValues.add(value);
  }
}
for (const artifact of publicArtifacts) {
  for (const sensitive of sensitiveValues) {
    assert.equal(artifact.includes(sensitive), false, "public audit artifact contains a private row value");
  }
}

assert.deepEqual(result.provenanceVerdicts, {
  "db-global|HANDOUT": {
    assignments: 46,
    passages: 3,
    verdict: "BLOCKED_NO_ROW_BOUND_UPLOADER_OR_OWNER_RIGHTS_ATTESTATION",
  },
  "repo-official|EXAM": {
    assignments: 134,
    passages: 9,
    verdict: "BLOCKED_OFFICIAL_PROVENANCE_IS_NOT_A_PROVIDER_PROCESSING_LICENSE",
  },
});
assert.equal(result.aggregates.selectedRightsRecordAbsent, 12);
assert.equal(result.aggregates.assignmentsBlockedByRightsHold, 180);
assert.equal(result.aggregates.campaignEligibleAssignments, 0);
assert.equal(result.authorization.generationAuthorized, false);

process.stdout.write(
  `${JSON.stringify({
    verdict: result.verdict,
    passages: queue.passages.length,
    assignments: queue.assignments.length,
    rightsRecordAbsent: result.aggregates.selectedRightsRecordAbsent,
    uploadAttestationMatches: uploadAttestationMatches.length,
    campaignEligibleAssignments: result.aggregates.campaignEligibleAssignments,
    apiCandidateCount: result.scope.apiCandidateCount,
    privacySafe: true,
  })}\n`,
);
