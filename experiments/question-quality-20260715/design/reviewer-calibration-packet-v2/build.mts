import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ARTIFACT_ID,
  assertPacketComposition,
  authorPacketSchema,
  hashJson,
  pendingGoldSchema,
  sha256,
  stableJson,
  type AuthorPacket,
} from "./contract.mts";
import { rawAuthorPacket } from "./private/authored-items.private.mts";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../../..");
const writeMode = process.argv.includes("--write");

function readUtf8(path: string): string { return readFileSync(path, "utf8").replace(/^\uFEFF/u, ""); }
function fileSha(path: string): string { return createHash("sha256").update(readFileSync(path)).digest("hex"); }
function tokens(text: string): string[] { return text.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/gu) ?? []; }
function normalized(text: string): string { return tokens(text).join(" "); }
function ngrams(text: string, size = 8): string[] {
  const words = tokens(text);
  return Array.from({ length: Math.max(0, words.length - size + 1) }, (_row, index) => words.slice(index, index + size).join(" "));
}

const piiPatterns: Array<[string, RegExp]> = [
  ["EMAIL", /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu], ["URL", /\bhttps?:\/\/\S+/giu],
  ["IP", /\b(?:\d{1,3}\.){3}\d{1,3}\b/gu], ["PHONE", /\b(?:\+?\d[\d .()-]{7,}\d)\b/gu],
  ["KOREAN_RRN", /\b\d{6}-[1-4]\d{6}\b/gu], ["LONG_NUMBER", /\b\d{8,}\b/gu],
];

function assertNoPii(packet: AuthorPacket): void {
  for (const item of packet.items) for (const [name, pattern] of piiPatterns) {
    pattern.lastIndex = 0;
    if (pattern.test(stableJson({ phase1: item.phase1, phase2: item.phase2 }))) throw new Error(`PII_PATTERN_${name}_${item.itemId}`);
  }
}

function internalOverlap(packet: AuthorPacket) {
  const rows = packet.items.map((item) => ({ id: item.itemId, set: new Set(ngrams(item.phase2.authorizedSource)) }));
  let comparedPairs = 0; let sharedEightGrams = 0; const affected = new Set<string>();
  for (let i = 0; i < rows.length; i += 1) for (let j = i + 1; j < rows.length; j += 1) {
    comparedPairs += 1;
    const shared = [...rows[i].set].filter((gram) => rows[j].set.has(gram));
    sharedEightGrams += shared.length;
    if (shared.length) { affected.add(rows[i].id); affected.add(rows[j].id); }
  }
  return { comparedPairs, sharedEightGrams, rowsWithOverlap: affected.size };
}

function s1Overlap(packet: AuthorPacket) {
  const path = resolve(repoRoot, "experiments/question-quality-20260715/corpus/original-s1-v6/private/original-passages.private.json");
  if (!existsSync(path)) throw new Error("S1_PRIVATE_REFERENCE_MISSING");
  const parsed = JSON.parse(readUtf8(path)) as { rows?: Array<{ passageText?: unknown }> };
  const reference = (parsed.rows ?? []).map((row) => String(row.passageText ?? "")).filter(Boolean);
  if (reference.length !== 12) throw new Error("S1_PRIVATE_REFERENCE_COUNT");
  const exact = new Set(reference.map(normalized));
  const grams = new Set(reference.flatMap((text) => ngrams(text)));
  let exactNormalizedDuplicates = 0; let sharedEightGrams = 0; let calibrationRowsWithOverlap = 0;
  for (const item of packet.items) {
    const source = item.phase2.authorizedSource;
    if (exact.has(normalized(source))) exactNormalizedDuplicates += 1;
    const shared = ngrams(source).filter((gram) => grams.has(gram));
    sharedEightGrams += shared.length;
    if (shared.length) calibrationRowsWithOverlap += 1;
  }
  return { referenceRows: reference.length, comparedPairs: reference.length * packet.items.length, exactNormalizedDuplicates, sharedEightGrams, calibrationRowsWithOverlap, referenceArtifactSha256: fileSha(path) };
}

function expectedArtifacts() {
  const packet = authorPacketSchema.parse(rawAuthorPacket);
  assertPacketComposition(packet);
  assertNoPii(packet);
  const within = internalOverlap(packet);
  if (within.sharedEightGrams !== 0) throw new Error("CALIBRATION_CROSS_ROW_EIGHT_GRAM_OVERLAP");
  const againstS1 = s1Overlap(packet);
  if (againstS1.exactNormalizedDuplicates || againstS1.sharedEightGrams) throw new Error("CALIBRATION_S1_OVERLAP");

  const packetPrivateText = `${JSON.stringify(packet, null, 2)}\n`;
  const packetPrivateSha256 = sha256(packetPrivateText);
  const pendingGold = pendingGoldSchema.parse({
    schemaVersion: "reviewer-calibration-gold-v2", artifactId: ARTIFACT_ID, status: "GOLD_ADJUDICATION_PENDING",
    authorHypothesesAreGold: false, packetPrivateSha256, requiredIndependentRaters: 2, requiredFreshAdjudicators: 1,
    items: packet.items.map((item) => ({ itemId: item.itemId, status: "PENDING", independentReviewRecordSha256: [], adjudicatorFreshSolveSha256: null, finalGold: null })),
  });
  const pendingGoldText = `${JSON.stringify(pendingGold, null, 2)}\n`;
  const exclusion = {
    schemaVersion: "reviewer-calibration-exclusion-commitments-v2", status: "PRIVATE_FUTURE_CORPUS_EXCLUSION_INPUT",
    rows: packet.items.map((item) => ({ itemId: item.itemId, normalizedSourceSha256: sha256(normalized(item.phase2.authorizedSource)), eightGramSha256: [...new Set(ngrams(item.phase2.authorizedSource))].sort().map(sha256) })),
  };
  const exclusionText = `${JSON.stringify(exclusion, null, 2)}\n`;

  const v1Root = resolve(here, "../reviewer-calibration-packet-v1");
  const migrationEvidencePaths = [
    "INVALIDATED.md",
    "private/issued/rater-1/phase2-grading.json",
    "private/issued/rater-1/phase2-notes.md",
    "private/issued/rater-2/phase1-notes.md",
    "private/issued/rater-2/submission.json",
  ];
  const migrationEvidence = migrationEvidencePaths.map((path) => {
    const absolute = resolve(v1Root, path);
    if (!existsSync(absolute)) throw new Error(`V1_MIGRATION_EVIDENCE_MISSING:${path}`);
    return { path: `../reviewer-calibration-packet-v1/${path}`, sha256: fileSha(absolute) };
  });
  const publicArtifact = {
    schemaVersion: "reviewer-calibration-packet-public-v2", artifactId: ARTIFACT_ID,
    status: "GOLD_ADJUDICATION_PENDING", authoredDate: "2026-07-15",
    candidateAccounting: { newFullQuestionCandidates: 0, modelApiCalls: 0, networkCalls: 0, databaseCalls: 0, secretReads: 0 },
    confidentiality: {
      exactItemsPrivateAndGitIgnored: true, authorHypothesesPrivateAndNotGold: true, publicContainsQuestionText: false,
      publicContainsAnswers: false, publicContainsGold: false, packetPrivateUtf8Bytes: Buffer.byteLength(packetPrivateText),
      packetPrivateSha256, pendingGoldSha256: sha256(pendingGoldText), exclusionCommitmentsSha256: sha256(exclusionText),
    },
    migration: {
      from: "reviewer-calibration-packet-v1", v1CertificationValidity: "INVALIDATED_FOR_CERTIFICATION",
      v1UseInV2: "CONTENT_AUDIT_INPUT_ONLY", v1ReviewWorkMigratedAsGold: false, freshBlindIssueRequired: true,
      evidence: migrationEvidence,
    },
    responseContract: {
      discriminants: ["SINGLE_LABEL", "MULTIPLE_LABELS", "SINGLE_TEXT", "MULTIPLE_TEXTS", "NO_ANSWER", "UNEVALUABLE"],
      constructedSyntheticLabelsForbidden: true, exactTextHashesBound: true, normalizedDuplicateTextRejected: true,
      answerSetOrderInsensitive: true, acceptedEquivalenceSetsBoundEndToEnd: true,
    },
    composition: {
      itemCount: 24,
      byBlock: Object.fromEntries(["GRAMMAR", "BLANK", "NONFOCUS"].map((block) => [block, packet.items.filter((row) => row.block === block).length])),
      authorHypothesisByBlock: Object.fromEntries(["GRAMMAR", "BLANK", "NONFOCUS"].map((block) => [block, Object.fromEntries(["F", "C", "B", "A"].map((grade) => [grade, packet.items.filter((row) => row.block === block && row.authorStratum === grade).length]))])),
      authorHypothesesAreGold: false, truthfulAdjudicationMayMakePacketCompositionIneligible: true,
      uniqueTopicTags: new Set(packet.items.map((row) => row.topicTag)).size,
      nonfocusFamilies: Object.fromEntries([...new Set(packet.items.filter((row) => row.block === "NONFOCUS").map((row) => row.evidenceFamily))].sort().map((family) => [family, packet.items.filter((row) => row.block === "NONFOCUS" && row.evidenceFamily === family).length])),
    },
    rightsAndPrivacy: { directOriginalRows: 24, copiedOrAdaptedRows: 0, thirdPartySourceRows: 0, manualPiiObservedRows: 0, machinePiiPatternHits: 0, externalProviderApiDispatchAuthorizedRows: 0 },
    disjointness: { method: "normalized exact plus hashed eight-word windows", withinPacket: within, currentS1Reference: againstS1 },
    gold: { status: "GOLD_ADJUDICATION_PENDING", independentRatersCompleted: 0, freshAdjudicatorsCompleted: 0, certifiableReviewers: 0 },
    rows: packet.items.map((item) => ({ itemId: item.itemId, block: item.block, type: item.type, evidenceFamily: item.evidenceFamily, difficulty: item.difficulty, topicTag: item.topicTag, surfaceSha256: hashJson(item.phase1), revealSha256: hashJson(item.phase2), fullPrivateItemSha256: hashJson(item) })),
  };
  return { packetPrivateText, pendingGoldText, exclusionText, publicText: `${JSON.stringify(publicArtifact, null, 2)}\n` };
}

function assertOrWrite(path: string, expected: string): void {
  if (writeMode) { writeFileSync(path, expected, "utf8"); return; }
  if (!existsSync(path)) throw new Error(`ARTIFACT_MISSING:${relative(repoRoot, path)}`);
  if (readUtf8(path) !== expected) throw new Error(`ARTIFACT_DRIFT:${relative(repoRoot, path)}`);
}

const artifacts = expectedArtifacts();
assertOrWrite(join(here, "private", "items.private.json"), artifacts.packetPrivateText);
assertOrWrite(join(here, "private", "gold.private.json"), artifacts.pendingGoldText);
assertOrWrite(join(here, "private", "exclusion-commitments.private.json"), artifacts.exclusionText);
assertOrWrite(join(here, "packet-public.json"), artifacts.publicText);

process.stdout.write(`${JSON.stringify({ verdict: writeMode ? "WROTE_PENDING_PACKET_V2" : "PASS_DETERMINISTIC_REPLAY_V2", items: 24, goldStatus: "GOLD_ADJUDICATION_PENDING", candidateCalls: 0, networkCalls: 0, databaseCalls: 0 }, null, 2)}\n`);
