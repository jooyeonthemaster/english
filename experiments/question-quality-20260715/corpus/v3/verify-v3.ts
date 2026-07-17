import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadEnvConfig } from "@next/env";

import { assessCandidate, contentHash, sha256, stableStringify } from "../selector-core";
import { scanHistoricalExposureV3 } from "./history-v3";
import { buildCorpusV3 } from "./selector-core-v3";
import {
  computeV3CodeHash,
  loadGlobalDatabaseV3,
  publicSnapshotV3,
  V3_REPO_ROOT,
} from "./snapshot-v3";
import type { V3PinnedSnapshot, V3RawCandidate } from "./types-v3";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_PATH = path.join(HERE, "private/input-snapshot.json");
const PUBLIC_MANIFEST_PATH = path.join(HERE, "manifest-public.json");
const PRIVATE_MANIFEST_PATH = path.join(HERE, "private/manifest-private.json");
const PREFLIGHT_REPORT_PATH = path.join(HERE, "preflight-report-public.json");
const PUBLIC_SNAPSHOT_PATH = path.join(HERE, "input-snapshot-public.json");
const BLIND_PACKET_PATH = path.resolve(HERE, "../../reviews/corpus-v3/blind-packet.json");
const REPO_PASSAGES_PATH = path.join(V3_REPO_ROOT, "src/data/exam-passages/passages.json");

export interface VerificationFinding {
  code: string;
  message: string;
}

export interface PinnedVerificationResult {
  passed: boolean;
  findings: VerificationFinding[];
  reconstructedStatus: string;
  reconstructedPublicHash: string;
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function snapshotCore(snapshot: V3PinnedSnapshot): Record<string, unknown> {
  return Object.fromEntries(Object.entries(snapshot).filter(([key]) => key !== "snapshotHash"));
}

function addFinding(
  findings: VerificationFinding[],
  condition: boolean,
  code: string,
  message: string,
): void {
  if (!condition) findings.push({ code, message });
}

function candidateProvenanceFindings(
  candidate: V3RawCandidate,
  findings: VerificationFinding[],
): void {
  const hash = contentHash(candidate.text);
  addFinding(
    findings,
    candidate.origin !== "repo-official" || candidate.id === `repo:${candidate.sourceRecordId}`,
    "REPO_ID_PROVENANCE_MISMATCH",
    `${candidate.id} does not derive from sourceRecordId.`,
  );
  addFinding(
    findings,
    candidate.origin !== "db-global" || candidate.id === `dbv3:${hash.slice(0, 24)}`,
    "DB_ID_CONTENT_MISMATCH",
    `${candidate.id} does not derive from its normalized content hash.`,
  );
  const evidence = candidate.databaseEvidence;
  addFinding(
    findings,
    evidence.candidateAcademyId === null && evidence.priorUseScope === "ALL_ACADEMIES",
    "DB_SCOPE_NOT_GLOBAL",
    `${candidate.id} lacks all-academy evidence.`,
  );
  if (candidate.origin === "db-global") {
    const privateEvidence = candidate.privateDatabaseProvenance;
    addFinding(
      findings,
      Boolean(privateEvidence),
      "DB_PRIVATE_PROVENANCE_MISSING",
      `${candidate.id} lacks sealed DB provenance.`,
    );
    if (privateEvidence) {
      addFinding(
        findings,
        privateEvidence.representativePassageId === candidate.sourceRecordId,
        "DB_REPRESENTATIVE_MISMATCH",
        `${candidate.id} representative source mismatch.`,
      );
      addFinding(
        findings,
        privateEvidence.matchedPassageIds.length === evidence.matchedPassageCount,
        "DB_GROUP_COUNT_MISMATCH",
        `${candidate.id} matched-passage count mismatch.`,
      );
      addFinding(
        findings,
        new Set(privateEvidence.matchedAcademyIds).size === evidence.matchedAcademyCount,
        "DB_ACADEMY_COUNT_MISMATCH",
        `${candidate.id} matched-academy count mismatch.`,
      );
    }
  }
  const reassessed = assessCandidate(candidate as never);
  addFinding(
    findings,
    reassessed.contentHash === hash,
    "FEATURE_RECOMPUTE_HASH_MISMATCH",
    `${candidate.id} feature recomputation changed content hash.`,
  );
}

const FORBIDDEN_PUBLIC_KEYS = new Set([
  "candidateAcademyId",
  "representativeAcademyId",
  "matchedAcademyIds",
  "matchedPassageIds",
  "representativePassageId",
  "sourceRecordId",
  "privateDatabaseProvenance",
  "passageContent",
]);

function scanPublicSecrets(
  value: unknown,
  jsonPath: string,
  findings: VerificationFinding[],
): void {
  if (Array.isArray(value)) {
    value.forEach((child, index) => scanPublicSecrets(child, `${jsonPath}[${index}]`, findings));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_PUBLIC_KEYS.has(key)) {
      findings.push({
        code: "PUBLIC_PRIVATE_PROVENANCE_LEAK",
        message: `${jsonPath}.${key} is forbidden in a public artifact.`,
      });
    }
    scanPublicSecrets(child, `${jsonPath}.${key}`, findings);
  }
}

function verifyBlindPacket(findings: VerificationFinding[]): void {
  if (!fs.existsSync(BLIND_PACKET_PATH)) return;
  const packet = readJson<{ items?: Array<Record<string, unknown>> }>(BLIND_PACKET_PATH);
  for (const [index, item] of (packet.items ?? []).entries()) {
    const keys = Object.keys(item).sort();
    addFinding(
      findings,
      stableStringify(keys) === stableStringify(["blindId", "passage"]),
      "BLIND_PACKET_FIELD_LEAK",
      `Blind item ${index + 1} has fields ${keys.join(", ")}.`,
    );
  }
}

export function verifyPinnedArtifactsV3(
  snapshot: V3PinnedSnapshot,
  publicArtifact?: unknown,
): PinnedVerificationResult {
  const findings: VerificationFinding[] = [];
  addFinding(
    findings,
    sha256(stableStringify(snapshotCore(snapshot))) === snapshot.snapshotHash,
    "SNAPSHOT_HASH_MISMATCH",
    "Pinned snapshot bytes do not match snapshotHash.",
  );
  for (const candidate of snapshot.candidates) candidateProvenanceFindings(candidate, findings);
  const reconstructed = buildCorpusV3(snapshot);
  const expectedPublic =
    reconstructed.status === "READY_FOR_BLIND_AUDIT"
      ? reconstructed.publicManifest
      : reconstructed.publicReport;
  if (publicArtifact !== undefined) {
    addFinding(
      findings,
      stableStringify(publicArtifact) === stableStringify(expectedPublic),
      "PUBLIC_ARTIFACT_REBUILD_MISMATCH",
      "Public manifest/preflight report does not equal a rebuild from the pinned snapshot.",
    );
    scanPublicSecrets(publicArtifact, "$", findings);
  }
  verifyBlindPacket(findings);
  return {
    passed: findings.length === 0,
    findings,
    reconstructedStatus: reconstructed.status,
    reconstructedPublicHash: sha256(stableStringify(expectedPublic)),
  };
}

async function liveDrift(snapshot: V3PinnedSnapshot): Promise<Record<string, unknown>> {
  const repoRaw = fs.readFileSync(REPO_PASSAGES_PATH, "utf8");
  const history = scanHistoricalExposureV3(V3_REPO_ROOT, [
    path.join(V3_REPO_ROOT, "experiments"),
    path.join(V3_REPO_ROOT, "scripts"),
  ]);
  const database = await loadGlobalDatabaseV3();
  const current = {
    codeHash: computeV3CodeHash(V3_REPO_ROOT),
    repoPassagesFileHash: sha256(repoRaw),
    historicalFilesHash: history.filesHash,
    historicalExtractHash: history.extractHash,
    databaseExtractHash: database.extractHash,
  };
  const expected = {
    codeHash: snapshot.codeHash,
    repoPassagesFileHash: snapshot.repoPassagesFileHash,
    historicalFilesHash: snapshot.historicalFilesHash,
    historicalExtractHash: snapshot.historicalExtractHash,
    databaseExtractHash: snapshot.databaseExtractHash,
  };
  const mismatches = Object.keys(expected).filter(
    (key) =>
      current[key as keyof typeof current] !== expected[key as keyof typeof expected],
  );
  return {
    passed: mismatches.length === 0 && history.parseFailures.length === 0,
    expected,
    current,
    mismatches,
    historyParseFailures: history.parseFailures,
    v3DerivedFilesExcluded: history.excludedDerivedFiles.length,
    databaseWrites: 0,
  };
}

async function main(): Promise<void> {
  loadEnvConfig(V3_REPO_ROOT);
  if (!fs.existsSync(SNAPSHOT_PATH)) throw new Error("Pinned private snapshot is missing.");
  const snapshot = readJson<V3PinnedSnapshot>(SNAPSHOT_PATH);
  const publicPaths = [PUBLIC_MANIFEST_PATH, PREFLIGHT_REPORT_PATH].filter(fs.existsSync);
  if (publicPaths.length !== 1) {
    throw new Error(`Expected exactly one public manifest/preflight report; found ${publicPaths.length}.`);
  }
  if (fs.existsSync(PUBLIC_MANIFEST_PATH) !== fs.existsSync(PRIVATE_MANIFEST_PATH)) {
    throw new Error("Public/private operational manifest presence is inconsistent.");
  }
  if (!fs.existsSync(PUBLIC_SNAPSHOT_PATH)) throw new Error("Public snapshot receipt is missing.");
  const publicSnapshotReceipt = readJson<unknown>(PUBLIC_SNAPSHOT_PATH);
  if (stableStringify(publicSnapshotReceipt) !== stableStringify(publicSnapshotV3(snapshot))) {
    throw new Error("Public snapshot receipt does not match the pinned private snapshot.");
  }
  const receiptFindings: VerificationFinding[] = [];
  scanPublicSecrets(publicSnapshotReceipt, "$", receiptFindings);
  if (receiptFindings.length > 0) {
    throw new Error(`Public snapshot leaks private provenance: ${stableStringify(receiptFindings)}`);
  }
  const publicArtifact = readJson<unknown>(publicPaths[0]);
  const pinned = verifyPinnedArtifactsV3(snapshot, publicArtifact);
  const drift = await liveDrift(snapshot);
  const report = {
    schemaVersion: 3,
    status: pinned.passed && (drift.passed as boolean) ? "PASS" : "FAIL",
    pinnedRebuild: pinned,
    liveDrift: drift,
    publicArtifact: path.relative(V3_REPO_ROOT, publicPaths[0]).replace(/\\/g, "/"),
    databaseWrites: 0,
    apiCalls: 0,
  };
  process.stdout.write(stableStringify(report));
  if (report.status !== "PASS") process.exitCode = 1;
}

const invoked = process.argv[1] ? path.resolve(process.argv[1]).toLowerCase() : "";
if (invoked === fileURLToPath(import.meta.url).toLowerCase()) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
