import { readFileSync } from "node:fs";
import path from "node:path";

import { sha256V6, stableJsonV6, type JsonObject } from "./protocol-core";
import { observeDuplicateJsonKeysV6 } from "./strict-json-observer";

export const V5_SUBJECT_DIRECTORY_V6 =
  "experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5";
export const V5_REVIEW_DIRECTORY_V6 =
  "experiments/question-quality-20260715/reviews/campaign-v6-connectivity-pilot-v5-independent-correctness-review-v1";

const EXPECTED_SUBJECT_HASHES_V6 = {
  protocolSha256: "0110dd37d475d3c16af6203774ddc77f0b560f803cf5a98c75455a452287ff0e",
  verifierSha256: "9b300f8335228629ee13e7a92dc2d545973dde2ecb63cbd259f3883a66279401",
  manifestFileSha256: "3e38abaf88a7cfae759b2621272c3951df19c6c95de98425d6aa7f7affe624ac",
  authorReportSha256: "b26eb140073adbe96d01ffdb992d1658636c0ff7e072837a51d81aa2d22343c2",
} as const;

const EXPECTED_REVIEW_MANIFEST_SHA256_V6 =
  "4d8b3037450e3d9d5a02d755e7a567f1dd30f0cf1f2bccc8c3f870b499e0ab55";
const EXPECTED_REVIEW_ROWS_V6: Readonly<Record<string, string>> = {
  [`${V5_REVIEW_DIRECTORY_V6}/REPORT.md`]:
    "796c75902cedab7caff02a805199bec6ca54213d197f616dd913a596fbcf106c",
  [`${V5_REVIEW_DIRECTORY_V6}/evidence.json`]:
    "b0c1f3cb619abd822474ebb088db56edae0eff636bd847af8804705823311f71",
  [`${V5_REVIEW_DIRECTORY_V6}/reproduce.mts`]:
    "c160519bdcf49380f172b3419b518aaec04be3b9589d4fa36d93e60ea208edf6",
  [`${V5_REVIEW_DIRECTORY_V6}/review.json`]:
    "0395112facc4b44f9e664ca828883cd89e81eb8717ca1ee0ad1e60de75db8e28",
};

export const V5_BLOCKER_CODES_V6 = [
  "C1_VALID_WRAPPER_CARDINALITY_UNDERCOUNT",
  "C2_CLOSED_TEMP_PATH_IDENTITY_NOT_REATTESTED",
  "C3_BUNDLER_IMPLEMENTATION_UNSEALED_NO_INDEPENDENT_EQUIVALENCE",
  "C4_INTENT_WRITE_FAILURE_DOES_NOT_GATE_SETTLEMENT",
] as const;

export interface PredecessorBindingArtifactV6 extends JsonObject {
  schemaVersion: "question-quality-connectivity-pilot-predecessor-binding-v6";
  v5Subject: JsonObject;
  independentCorrectnessReview: JsonObject;
  remediationOwnership: JsonObject;
  readPolicy: JsonObject;
  contentSha256: string;
}

function readPublicBytes(repoRoot: string, relativePath: string): Buffer {
  if (relativePath.split("/").includes("private")) {
    throw new Error("predecessor binding is forbidden from reading a private predecessor path");
  }
  const absolute = path.resolve(repoRoot, relativePath);
  const relative = path.relative(repoRoot, absolute);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("predecessor public path escaped the repository");
  }
  return readFileSync(absolute);
}

function parseStrictPublicJson(bytes: Buffer, label: string): JsonObject {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  if (text.charCodeAt(0) === 0xfeff || observeDuplicateJsonKeysV6(text).length > 0) {
    throw new Error(`${label} is BOM-prefixed or contains duplicate JSON keys`);
  }
  const value = JSON.parse(text) as unknown;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as JsonObject;
}

function assertHash(bytes: Buffer, expected: string, label: string): void {
  if (sha256V6(bytes) !== expected) throw new Error(`${label} hash differs from the immutable v5 pin`);
}

export function capturePredecessorBindingV6(repoRoot: string): PredecessorBindingArtifactV6 {
  const protocolBytes = readPublicBytes(repoRoot, `${V5_SUBJECT_DIRECTORY_V6}/protocol-v5.json`);
  const verifierBytes = readPublicBytes(repoRoot, `${V5_SUBJECT_DIRECTORY_V6}/verify.mts`);
  const subjectManifestBytes = readPublicBytes(repoRoot, `${V5_SUBJECT_DIRECTORY_V6}/MANIFEST.sha256`);
  const authorReportBytes = readPublicBytes(repoRoot, `${V5_SUBJECT_DIRECTORY_V6}/AUTHOR-REPORT.json`);
  assertHash(protocolBytes, EXPECTED_SUBJECT_HASHES_V6.protocolSha256, "v5 protocol");
  assertHash(verifierBytes, EXPECTED_SUBJECT_HASHES_V6.verifierSha256, "v5 verifier");
  assertHash(subjectManifestBytes, EXPECTED_SUBJECT_HASHES_V6.manifestFileSha256, "v5 subject manifest file");
  assertHash(authorReportBytes, EXPECTED_SUBJECT_HASHES_V6.authorReportSha256, "v5 author report");
  const subjectProtocol = parseStrictPublicJson(protocolBytes, "v5 public protocol");
  const subjectReport = parseStrictPublicJson(authorReportBytes, "v5 public author report");
  if (subjectProtocol.schemaVersion !== "question-quality-v6-connectivity-pilot-protocol-v5" ||
      subjectProtocol.artifactId !== "campaign-v6-connectivity-pilot-v5" ||
      subjectReport.verdict !== "READY_FOR_INDEPENDENT_OFFLINE_AUDIT_LIVE_EXECUTION_BLOCKED" ||
      subjectReport.protocolSha256 !== EXPECTED_SUBJECT_HASHES_V6.protocolSha256) {
    throw new Error("v5 subject public identity differs from its exact predecessor contract");
  }

  const reviewManifestBytes = readPublicBytes(repoRoot, `${V5_REVIEW_DIRECTORY_V6}/MANIFEST.sha256`);
  assertHash(reviewManifestBytes, EXPECTED_REVIEW_MANIFEST_SHA256_V6, "v5 independent correctness review manifest");
  const manifestRows = reviewManifestBytes.toString("utf8").trimEnd().split(/\r?\n/u);
  if (manifestRows.length !== 4) throw new Error("v5 independent correctness review manifest row count differs");
  const observedRows: Record<string, string> = {};
  for (const line of manifestRows) {
    const match = /^([a-f0-9]{64})  (.+)$/u.exec(line);
    if (!match || match[2]!.split("/").includes("private") || observedRows[match[2]!] !== undefined) {
      throw new Error("v5 independent correctness review manifest contains an invalid public row");
    }
    observedRows[match[2]!] = match[1]!;
  }
  if (stableJsonV6(observedRows) !== stableJsonV6(EXPECTED_REVIEW_ROWS_V6)) {
    throw new Error("v5 independent correctness review manifest exact rows differ");
  }
  for (const [relativePath, expected] of Object.entries(EXPECTED_REVIEW_ROWS_V6)) {
    assertHash(readPublicBytes(repoRoot, relativePath), expected, `v5 review row ${relativePath}`);
  }
  const evidence = parseStrictPublicJson(
    readPublicBytes(repoRoot, `${V5_REVIEW_DIRECTORY_V6}/evidence.json`),
    "v5 independent correctness evidence",
  );
  const review = parseStrictPublicJson(
    readPublicBytes(repoRoot, `${V5_REVIEW_DIRECTORY_V6}/review.json`),
    "v5 independent correctness verdict",
  );
  const evidenceBlockers = evidence.blockerCodes;
  const reviewFindings = review.blockers;
  if (evidence.verdict !== "FAIL_BLOCKERS" || review.verdict !== "FAIL_BLOCKERS" ||
      !Array.isArray(evidenceBlockers) || stableJsonV6(evidenceBlockers) !== stableJsonV6(V5_BLOCKER_CODES_V6) ||
      !Array.isArray(reviewFindings) ||
      stableJsonV6(reviewFindings.map((row) => (row as JsonObject).code)) !== stableJsonV6(V5_BLOCKER_CODES_V6)) {
    throw new Error("v5 independent correctness review verdict or C1-C4 blocker set differs");
  }

  const core = {
    schemaVersion: "question-quality-connectivity-pilot-predecessor-binding-v6" as const,
    v5Subject: {
      directory: V5_SUBJECT_DIRECTORY_V6,
      ...EXPECTED_SUBJECT_HASHES_V6,
      publicFilesRead: 4,
      privateFilesRead: 0,
    },
    independentCorrectnessReview: {
      directory: V5_REVIEW_DIRECTORY_V6,
      manifestFileSha256: EXPECTED_REVIEW_MANIFEST_SHA256_V6,
      manifestRows: 4,
      verdict: "FAIL_BLOCKERS",
      blockerCodes: [...V5_BLOCKER_CODES_V6],
      exactPublicRows: EXPECTED_REVIEW_ROWS_V6,
    },
    remediationOwnership: {
      C1_VALID_WRAPPER_CARDINALITY_UNDERCOUNT: "strict-json-observer.ts + offline.test.ts",
      C2_CLOSED_TEMP_PATH_IDENTITY_NOT_REATTESTED: "live-io.ts + system-boundary.test.ts",
      C3_BUNDLER_IMPLEMENTATION_UNSEALED_NO_INDEPENDENT_EQUIVALENCE:
        "bundler-toolchain-provenance.ts + build-frozen-runtime.mts + frozen-runtime-core.ts",
      C4_INTENT_WRITE_FAILURE_DOES_NOT_GATE_SETTLEMENT:
        "durable-private-marker.ts + terminal-reconciliation-core.ts + system-boundary.test.ts",
      status: "IMPLEMENTED_PENDING_AUTHOR_FREEZE_AND_INDEPENDENT_AUDIT",
    },
    readPolicy: {
      predecessorPublicFilesOnly: true,
      predecessorPrivateFilesRead: 0,
      networkCalls: 0,
      modelCalls: 0,
      databaseCalls: 0,
      globalLedgerReadsOrWrites: 0,
    },
  };
  return { ...core, contentSha256: sha256V6(stableJsonV6(core)) };
}

export function assertPredecessorBindingV6(repoRoot: string, value: unknown): PredecessorBindingArtifactV6 {
  const expected = capturePredecessorBindingV6(repoRoot);
  if (stableJsonV6(value) !== stableJsonV6(expected)) {
    throw new Error("v6 predecessor binding artifact differs from current immutable public predecessor evidence");
  }
  return expected;
}
