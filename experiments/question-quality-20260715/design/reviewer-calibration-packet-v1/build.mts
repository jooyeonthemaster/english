import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
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

function readUtf8(path: string): string {
  return readFileSync(path, "utf8").replace(/^\uFEFF/u, "");
}

function fileSha(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function tokens(text: string): string[] {
  return text.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/gu) ?? [];
}

function ngrams(text: string, size: number): string[] {
  const words = tokens(text);
  return Array.from({ length: Math.max(0, words.length - size + 1) }, (_, index) => words.slice(index, index + size).join(" "));
}

function normalized(text: string): string {
  return tokens(text).join(" ");
}

const piiPatterns: Array<[string, RegExp]> = [
  ["EMAIL", /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu],
  ["URL", /\bhttps?:\/\/\S+/giu],
  ["IP", /\b(?:\d{1,3}\.){3}\d{1,3}\b/gu],
  ["PHONE", /\b(?:\+?\d[\d .()-]{7,}\d)\b/gu],
  ["KOREAN_RRN", /\b\d{6}-[1-4]\d{6}\b/gu],
  ["LONG_NUMBER", /\b\d{8,}\b/gu],
];

function assertNoPii(packet: AuthorPacket): void {
  for (const item of packet.items) {
    const text = stableJson({ phase1: item.phase1, phase2: item.phase2 });
    for (const [name, pattern] of piiPatterns) {
      pattern.lastIndex = 0;
      if (pattern.test(text)) throw new Error(`PII_PATTERN_${name}_${item.itemId}`);
    }
  }
}

function crossRowOverlap(packet: AuthorPacket, size = 8): { comparedPairs: number; sharedNgrams: number; rowsWithOverlap: number } {
  const rows = packet.items.map((item) => ({ id: item.itemId, set: new Set(ngrams(item.phase2.authorizedSource, size)) }));
  let comparedPairs = 0;
  let sharedNgrams = 0;
  const overlapping = new Set<string>();
  for (let i = 0; i < rows.length; i += 1) {
    for (let j = i + 1; j < rows.length; j += 1) {
      comparedPairs += 1;
      const shared = [...rows[i].set].filter((gram) => rows[j].set.has(gram));
      sharedNgrams += shared.length;
      if (shared.length > 0) {
        overlapping.add(rows[i].id);
        overlapping.add(rows[j].id);
      }
    }
  }
  return { comparedPairs, sharedNgrams, rowsWithOverlap: overlapping.size };
}

function compareS1(packet: AuthorPacket): {
  referenceRows: number;
  comparedPairs: number;
  exactNormalizedDuplicates: number;
  sharedEightGrams: number;
  calibrationRowsWithOverlap: number;
  referenceArtifactSha256: string;
} {
  const path = resolve(repoRoot, "experiments/question-quality-20260715/corpus/original-s1-v6/private/original-passages.private.json");
  if (!existsSync(path)) throw new Error("S1_PRIVATE_REFERENCE_MISSING");
  const raw = JSON.parse(readUtf8(path)) as { rows?: Array<{ passageText?: unknown }> };
  const reference = (raw.rows ?? []).map((row) => String(row.passageText ?? "")).filter(Boolean);
  if (reference.length !== 12) throw new Error("S1_PRIVATE_REFERENCE_COUNT");
  const referenceNormalized = new Set(reference.map(normalized));
  const referenceGrams = new Set(reference.flatMap((text) => ngrams(text, 8)));
  let exactNormalizedDuplicates = 0;
  let sharedEightGrams = 0;
  let calibrationRowsWithOverlap = 0;
  for (const item of packet.items) {
    const source = item.phase2.authorizedSource;
    if (referenceNormalized.has(normalized(source))) exactNormalizedDuplicates += 1;
    const shared = ngrams(source, 8).filter((gram) => referenceGrams.has(gram));
    sharedEightGrams += shared.length;
    if (shared.length > 0) calibrationRowsWithOverlap += 1;
  }
  return {
    referenceRows: reference.length,
    comparedPairs: reference.length * packet.items.length,
    exactNormalizedDuplicates,
    sharedEightGrams,
    calibrationRowsWithOverlap,
    referenceArtifactSha256: fileSha(path),
  };
}

function expectedArtifacts() {
  const packet = authorPacketSchema.parse(rawAuthorPacket);
  assertPacketComposition(packet);
  assertNoPii(packet);
  const internalOverlap = crossRowOverlap(packet);
  if (internalOverlap.sharedNgrams !== 0) throw new Error("CALIBRATION_CROSS_ROW_EIGHT_GRAM_OVERLAP");
  const s1Overlap = compareS1(packet);
  if (s1Overlap.exactNormalizedDuplicates !== 0 || s1Overlap.sharedEightGrams !== 0) {
    throw new Error("CALIBRATION_S1_OVERLAP");
  }

  const packetPrivateText = `${JSON.stringify(packet, null, 2)}\n`;
  const packetPrivateSha256 = sha256(packetPrivateText);
  const pendingGold = pendingGoldSchema.parse({
    schemaVersion: "reviewer-calibration-gold-v1",
    artifactId: "reviewer-calibration-packet-v1",
    status: "GOLD_ADJUDICATION_PENDING",
    authorHypothesesAreGold: false,
    packetPrivateSha256,
    requiredIndependentRaters: 2,
    requiredFreshAdjudicators: 1,
    items: packet.items.map((item) => ({
      itemId: item.itemId,
      status: "PENDING",
      independentReviewRecordSha256: [],
      adjudicatorFreshSolveSha256: null,
      finalGold: null,
    })),
  });
  const pendingGoldText = `${JSON.stringify(pendingGold, null, 2)}\n`;

  const exclusionRows = packet.items.map((item) => ({
    itemId: item.itemId,
    normalizedSourceSha256: sha256(normalized(item.phase2.authorizedSource)),
    eightGramSha256: [...new Set(ngrams(item.phase2.authorizedSource, 8))].sort().map((gram) => sha256(gram)),
  }));
  const exclusion = {
    schemaVersion: "reviewer-calibration-exclusion-commitments-v1",
    status: "PRIVATE_FUTURE_CORPUS_EXCLUSION_INPUT",
    rows: exclusionRows,
  };
  const exclusionText = `${JSON.stringify(exclusion, null, 2)}\n`;

  const byBlock = Object.fromEntries(["GRAMMAR", "BLANK", "NONFOCUS"].map((block) => [block, packet.items.filter((item) => item.block === block).length]));
  const byAuthorStratum = Object.fromEntries(["F", "C", "B", "A"].map((grade) => [grade, packet.items.filter((item) => item.authorStratum === grade).length]));
  const nonfocusFamilies = Object.fromEntries(
    [...new Set(packet.items.filter((item) => item.block === "NONFOCUS").map((item) => item.evidenceFamily))]
      .sort()
      .map((family) => [family, packet.items.filter((item) => item.block === "NONFOCUS" && item.evidenceFamily === family).length]),
  );
  const publicRows = packet.items.map((item) => ({
    itemId: item.itemId,
    block: item.block,
    type: item.type,
    evidenceFamily: item.evidenceFamily,
    difficulty: item.difficulty,
    topicTag: item.topicTag,
    surfaceSha256: hashJson(item.phase1),
    revealSha256: hashJson(item.phase2),
    provenanceSha256: hashJson(item.provenance),
    fullPrivateItemSha256: hashJson(item),
  }));
  const upstreamPaths = [
    "experiments/question-quality-20260715/design/blind-adjudication-power-v1/design.json",
    "experiments/question-quality-20260715/design/blind-adjudication-power-v1/review-record.schema.json",
    "experiments/question-quality-20260715/design/blind-adjudication-power-v1/calibration-certificate.schema.json",
    "experiments/question-quality-20260715/design/blind-adjudication-power-v1/calibration-scoring.mjs",
    "experiments/question-quality-20260715/design/blind-adjudication-power-v1/MANIFEST.sha256",
    "experiments/question-quality-20260715/design/all-types-evaluation-rubric-v1/rubric.json",
    "experiments/question-quality-20260715/design/all-types-evaluation-rubric-v1/MANIFEST.sha256",
  ];
  const publicArtifact = {
    schemaVersion: "reviewer-calibration-packet-public-v1",
    artifactId: "reviewer-calibration-packet-v1",
    status: "GOLD_ADJUDICATION_PENDING",
    authoredDate: "2026-07-15",
    candidateAccounting: { newFullQuestionCandidates: 0, modelApiCalls: 0, networkCalls: 0, databaseCalls: 0, secretReads: 0 },
    confidentiality: {
      exactItemsPrivateAndGitIgnored: true,
      authorHypothesesPrivateAndNotGold: true,
      publicContainsQuestionText: false,
      publicContainsAnswers: false,
      publicContainsGold: false,
      packetPrivateUtf8Bytes: Buffer.byteLength(packetPrivateText),
      packetPrivateSha256,
      pendingGoldSha256: sha256(pendingGoldText),
      exclusionCommitmentsSha256: sha256(exclusionText),
    },
    composition: {
      itemCount: packet.items.length,
      byBlock,
      byAuthorStratum,
      authorStratumPerBlock: Object.fromEntries(
        ["GRAMMAR", "BLANK", "NONFOCUS"].map((block) => [
          block,
          Object.fromEntries(["F", "C", "B", "A"].map((grade) => [grade, packet.items.filter((item) => item.block === block && item.authorStratum === grade).length])),
        ])),
      nonfocusFamilies,
      uniqueTopicTags: new Set(packet.items.map((item) => item.topicTag)).size,
    },
    rightsAndPrivacy: {
      directOriginalRows: packet.items.filter((item) => item.provenance.copiedOrAdapted === false).length,
      thirdPartySourceRows: packet.items.filter((item) => item.provenance.thirdPartySourceCount > 0).length,
      manualPiiObservedRows: packet.items.filter((item) => item.provenance.piiObserved).length,
      machinePiiPatternHits: 0,
      independentCodexAgentReviewAuthorizedRows: packet.items.filter((item) => item.provenance.independentCodexAgentReviewAuthorized).length,
      externalProviderApiDispatchAuthorizedRows: packet.items.filter((item) => item.provenance.externalProviderApiDispatchAuthorized).length,
      permittedUse: "LOCAL_REVIEWER_CALIBRATION_ONLY",
    },
    disjointness: {
      method: "normalized exact plus hashed eight-word windows",
      withinPacket: internalOverlap,
      currentS1Reference: s1Overlap,
      futureCampaignRule: "Every later development, sentinel, or confirmation corpus must exclude these private normalized-source and eight-gram commitments before assignment.",
      currentConfirmationCorpusExists: false,
    },
    gold: {
      status: "GOLD_ADJUDICATION_PENDING",
      independentRatersCompleted: 0,
      freshAdjudicatorsCompleted: 0,
      certifiableReviewers: 0,
      authorHypothesesAreGold: false,
    },
    upstreamBindings: upstreamPaths.map((path) => ({ path, sha256: fileSha(resolve(repoRoot, path)) })),
    rows: publicRows,
  };
  const publicText = `${JSON.stringify(publicArtifact, null, 2)}\n`;
  return { packetPrivateText, pendingGoldText, exclusionText, publicText };
}

function assertOrWrite(path: string, expected: string): void {
  if (writeMode) {
    writeFileSync(path, expected, "utf8");
    return;
  }
  if (!existsSync(path)) throw new Error(`ARTIFACT_MISSING:${relative(repoRoot, path)}`);
  if (readUtf8(path) !== expected) throw new Error(`ARTIFACT_DRIFT:${relative(repoRoot, path)}`);
}

const artifacts = expectedArtifacts();
assertOrWrite(join(here, "private", "items.private.json"), artifacts.packetPrivateText);
assertOrWrite(join(here, "private", "gold.private.json"), artifacts.pendingGoldText);
assertOrWrite(join(here, "private", "exclusion-commitments.private.json"), artifacts.exclusionText);
assertOrWrite(join(here, "packet-public.json"), artifacts.publicText);

process.stdout.write(
  `${JSON.stringify({
    verdict: writeMode ? "WROTE_PENDING_PACKET" : "PASS_DETERMINISTIC_REPLAY",
    items: 24,
    goldStatus: "GOLD_ADJUDICATION_PENDING",
    modelApiCalls: 0,
    networkCalls: 0,
    databaseCalls: 0,
  }, null, 2)}\n`,
);
