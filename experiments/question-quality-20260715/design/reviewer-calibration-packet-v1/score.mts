import { readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import {
  authorPacketSchema,
  calibrationReviewRecordSchema,
  canonicalRfc3339Micros,
  canonicalTimestampSchema,
  hashJson,
  issuedPhase1PacketSchema,
  pendingGoldSchema,
  phase1SealSchema,
  phase1SubmissionSchema,
  sha256,
} from "./contract.mts";
import {
  computeCalibrationMetrics,
  DEFAULT_THRESHOLDS,
  evaluateCalibration,
  scoreLabelSchema,
} from "./metrics.mts";
import {
  phase2RevealSchema,
  privateIssueMapSchema,
  revealPhase2,
} from "./reveal.mts";

const here = dirname(fileURLToPath(import.meta.url));
const privateRoot = resolve(here, "private");
const thresholdFractionSchema = z
  .object({ numerator: z.number().int(), denominator: z.number().int().positive() })
  .strict();
const thresholdBundleSchema = z
  .object({
    global: z.record(z.string(), thresholdFractionSchema),
    eachBlock: z.record(z.string(), thresholdFractionSchema),
  })
  .strict();
thresholdBundleSchema.parse(DEFAULT_THRESHOLDS);

export const finalGoldSchema = z
  .object({
    schemaVersion: z.literal("reviewer-calibration-final-gold-v1"),
    artifactId: z.literal("reviewer-calibration-packet-v1"),
    status: z.literal("FINAL_ADJUDICATED_GOLD"),
    packetPrivateSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    contractSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    metricsSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    independentRatersPerItem: z.literal(2),
    freshAdjudicatorsPerItem: z.literal(1),
    items: z
      .array(
        z
          .object({
            itemId: z.string().regex(/^RCAL-(G|B|N)[0-9]{2}$/u),
            block: z.enum(["GRAMMAR", "BLANK", "NONFOCUS"]),
            independentReviewRecordSha256: z.tuple([
              z.string().regex(/^[a-f0-9]{64}$/u),
              z.string().regex(/^[a-f0-9]{64}$/u),
            ]),
            adjudicatorFreshSolveSha256: z.string().regex(/^[a-f0-9]{64}$/u),
            adjudicationRecordSha256: z.string().regex(/^[a-f0-9]{64}$/u),
            finalLabel: scoreLabelSchema,
          })
          .strict(),
      )
      .length(24),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (new Set(value.items.map((item) => item.itemId)).size !== 24) {
      ctx.addIssue({ code: "custom", message: "final gold item IDs must be unique" });
    }
    for (const item of value.items) {
      if (item.independentReviewRecordSha256[0] === item.independentReviewRecordSha256[1]) {
        ctx.addIssue({ code: "custom", message: `independent review hashes duplicate for ${item.itemId}` });
      }
      if (item.finalLabel.itemId !== item.itemId || item.finalLabel.block !== item.block) {
        ctx.addIssue({ code: "custom", message: `final label identity mismatch for ${item.itemId}` });
      }
    }
  });

export type FinalGold = z.infer<typeof finalGoldSchema>;

export function finalGoldCompositionIssues(gold: FinalGold): string[] {
  const reasons: string[] = [];
  for (const block of ["GRAMMAR", "BLANK", "NONFOCUS"] as const) {
    const rows = gold.items.filter((item) => item.block === block);
    if (rows.length !== 8) reasons.push(`${block}_COUNT_NOT_8`);
    if (rows.filter((item) => item.finalLabel.anyFatal).length !== 2) reasons.push(`${block}_FATAL_COUNT_NOT_2`);
    for (const grade of ["F", "C", "B", "A"] as const) {
      if (rows.filter((item) => item.finalLabel.grade === grade).length !== 2) {
        reasons.push(`${block}_GRADE_${grade}_COUNT_NOT_2`);
      }
    }
  }
  return reasons.sort();
}

export function assertFinalGoldIssuanceEligible(gold: FinalGold): void {
  const reasons = finalGoldCompositionIssues(gold);
  if (reasons.length > 0) throw new Error(`PACKET_COMPOSITION_INELIGIBLE:${reasons.join(",")}`);
}

const certificateSchema = z
  .object({
    schemaVersion: z.literal("reviewer-calibration-certificate-v1"),
    artifactId: z.literal("reviewer-calibration-packet-v1"),
    reviewerPseudonym: z.string().regex(/^[A-Z0-9_-]{3,40}$/u),
    decision: z.enum(["CERTIFIED", "FAILED"]),
    packetPrivateSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    finalGoldSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    contractSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    metricsSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    scorerSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    phase1PacketSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    phase1SubmissionSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    phase1SealSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    phase2RevealSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    reviewRecordsSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    thresholds: thresholdBundleSchema,
    metrics: z.unknown(),
    reasonCodes: z.array(z.string()),
    scope: z
      .object({
        focusTypes: z.tuple([z.literal("GRAMMAR_ERROR"), z.literal("BLANK_INFERENCE")]),
        evidenceFamilies: z.tuple([
          z.literal("marked_selection"),
          z.literal("option_selection"),
          z.literal("ordering_or_insertion"),
          z.literal("closed_constructed"),
          z.literal("open_constructed"),
          z.literal("correction"),
          z.literal("lexical"),
        ]),
        allNonfocusTypesCertified: z.literal(false),
        supplementalS3CalibrationRequired: z.literal(true),
      })
      .strict(),
    issuedAt: canonicalTimestampSchema,
    expiresAt: canonicalTimestampSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    const issued = canonicalRfc3339Micros(value.issuedAt);
    const expires = canonicalRfc3339Micros(value.expiresAt);
    if (issued !== null && expires !== null && expires <= issued) {
      ctx.addIssue({ code: "custom", message: "certificate expiry must be strictly after issuance" });
    }
  });

function bytesSha(path: string): string {
  return sha256(readFileSync(path));
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

function exactSet(values: string[]): string {
  return JSON.stringify([...values].sort());
}

function canonicalAnswerSet(
  answer: { answerLabels: string[]; answerText: string | null },
  displayToCanonical: Record<string, string>,
): string[] {
  if (answer.answerText !== null) return [answer.answerText.trim().replace(/\s+/gu, " ")];
  return answer.answerLabels.map((label) => displayToCanonical[label] ?? label).sort();
}

export function scoreFromSealedArtifacts(input: {
  packetRaw: unknown;
  packetPrivateSha256: string;
  goldRaw: unknown;
  goldSha256: string;
  contractSha256: string;
  metricsSha256: string;
  scorerSha256: string;
  phase1Raw: unknown;
  submissionRaw: unknown;
  sealRaw: unknown;
  mapRaw: unknown;
  revealRaw: unknown;
  recordsRaw: unknown;
  issuedAt: string;
  expiresAt: string;
}) {
  const pending = pendingGoldSchema.safeParse(input.goldRaw);
  if (pending.success) throw new Error("GOLD_ADJUDICATION_PENDING");
  const packet = authorPacketSchema.parse(input.packetRaw);
  const gold = finalGoldSchema.parse(input.goldRaw);
  if (gold.packetPrivateSha256 !== input.packetPrivateSha256) throw new Error("GOLD_PACKET_BYTES_HASH_MISMATCH");
  if (gold.contractSha256 !== input.contractSha256 || gold.metricsSha256 !== input.metricsSha256) {
    throw new Error("GOLD_CONTRACT_OR_METRICS_HASH_MISMATCH");
  }
  assertFinalGoldIssuanceEligible(gold);
  const phase1 = issuedPhase1PacketSchema.parse(input.phase1Raw);
  const submission = phase1SubmissionSchema.parse(input.submissionRaw);
  const seal = phase1SealSchema.parse(input.sealRaw);
  const privateMap = privateIssueMapSchema.parse(input.mapRaw);
  const reveal = phase2RevealSchema.parse(input.revealRaw);
  const recomputedReveal = revealPhase2({ packet, phase1, submission, seal, privateMap });
  if (hashJson(recomputedReveal) !== hashJson(reveal)) throw new Error("PHASE2_REVEAL_NOT_CANONICAL");

  const records = z.array(calibrationReviewRecordSchema).length(24).parse(input.recordsRaw);
  if (new Set(records.map((record) => record.itemPseudonym)).size !== 24) throw new Error("REVIEW_ITEM_PSEUDONYM_DUPLICATE");
  if (new Set(records.map((record) => record.reviewerPseudonym)).size !== 1) throw new Error("REVIEWER_MIXED_IN_RECORD_BUNDLE");
  const reviewerPseudonym = records[0].reviewerPseudonym;
  if (reviewerPseudonym !== phase1.reviewerPseudonym) throw new Error("REVIEWER_PACKET_MISMATCH");
  const submissionHash = hashJson(submission);
  const revealHash = hashJson(reveal);
  const submissionByPseudo = new Map(submission.answers.map((answer) => [answer.itemPseudonym, answer]));
  const issuedByPseudo = new Map(phase1.items.map((item) => [item.itemPseudonym, item]));
  const mapByPseudo = new Map(privateMap.rows.map((row) => [row.itemPseudonym, row]));
  const goldByItem = new Map(gold.items.map((item) => [item.itemId, item.finalLabel]));
  const authorByItem = new Map(packet.items.map((item) => [item.itemId, item]));

  const reviewLabels = records.map((record) => {
    if (record.phase1SubmissionSha256 !== submissionHash || record.phase2RevealSha256 !== revealHash) {
      throw new Error(`REVIEW_RECORD_PHASE_HASH_MISMATCH:${record.itemPseudonym}`);
    }
    const blind = submissionByPseudo.get(record.itemPseudonym);
    const issued = issuedByPseudo.get(record.itemPseudonym);
    const map = mapByPseudo.get(record.itemPseudonym);
    if (!blind || !issued || !map) throw new Error(`REVIEW_RECORD_UNKNOWN_PSEUDONYM:${record.itemPseudonym}`);
    if (record.surfaceSha256 !== issued.surfaceSha256) {
      throw new Error(`REVIEW_RECORD_SURFACE_BINDING_MISMATCH:${record.itemPseudonym}`);
    }
    if (record.relabelMapSha256 !== hashJson(map)) {
      throw new Error(`REVIEW_RECORD_RELABEL_BINDING_MISMATCH:${record.itemPseudonym}`);
    }
    if (record.phaseOneRecordSha256 !== hashJson(blind)) {
      throw new Error(`REVIEW_RECORD_PHASE1_ITEM_BINDING_MISMATCH:${record.itemPseudonym}`);
    }
    if (
      record.disposition !== blind.disposition ||
      exactSet(record.answerLabels) !== exactSet(blind.answerLabels) ||
      record.answerText !== blind.answerText ||
      record.answerTextSha256 !== blind.answerTextSha256
    ) {
      throw new Error(`REVIEW_RECORD_BLIND_SOLVE_MUTATED_AFTER_REVEAL:${record.itemPseudonym}`);
    }
    const author = authorByItem.get(map.itemId);
    if (!author || author.block !== record.block) throw new Error(`REVIEW_RECORD_BLOCK_MISMATCH:${record.itemPseudonym}`);
    const answerSet = canonicalAnswerSet(blind, map.displayToCanonical);
    const base = {
      itemId: map.itemId,
      block: record.block,
      disposition: record.disposition,
      answerSet,
      acceptedAnswerSets: [answerSet],
      anyFatal: record.anyFatal,
      grade: record.grade,
    };
    if (record.block === "GRAMMAR") {
      const rows = record.grammarSiteJudgments
        .map((site) => ({
          site: (map.displayToCanonical[site.site] ?? site.site) as "A" | "B" | "C" | "D" | "E",
          displayedGrammaticality: site.displayedGrammaticality,
          diagnosis: site.diagnosis,
          pointFamily: site.pointFamily,
          correctionRestoresSource: site.correctionRestoresSource,
          explanationAccurate: site.explanationAccurate,
        }))
        .sort((a, b) => a.site.localeCompare(b.site));
      return scoreLabelSchema.parse({ ...base, grammarSites: rows, blankOptions: [], blankAxes: [] });
    }
    if (record.block === "BLANK") {
      const rows = record.blankOptionJudgments
        .map((option) => ({
          label: (map.displayToCanonical[option.label] ?? option.label) as "1" | "2" | "3" | "4" | "5",
          slotGrammarCompatible: option.slotGrammarCompatible,
          passageGrounded: option.passageGrounded,
          primaryIntentAxis: option.primaryIntentAxis,
          divergentAxes: option.divergentAxes,
          singleDecisiveFlaw: option.singleDecisiveFlaw,
        }))
        .sort((a, b) => a.label.localeCompare(b.label));
      const axes = record.blankAxisJudgments.map((axis) => ({
        axis: axis.axis,
        answerPreserved: axis.answerPreserved,
      }));
      return scoreLabelSchema.parse({ ...base, grammarSites: [], blankOptions: rows, blankAxes: axes });
    }
    return scoreLabelSchema.parse({ ...base, grammarSites: [], blankOptions: [], blankAxes: [] });
  });

  if (reviewLabels.some((label) => !goldByItem.has(label.itemId))) throw new Error("REVIEW_GOLD_ITEM_SET_MISMATCH");
  const metrics = computeCalibrationMetrics({
    schemaVersion: "reviewer-calibration-score-input-v1",
    goldStatus: "FINAL_ADJUDICATED_GOLD",
    packetSha256: input.packetPrivateSha256,
    oracleSha256: input.goldSha256,
    reviewerPseudonym,
    gold: gold.items.map((item) => item.finalLabel),
    review: reviewLabels,
  });
  const decision = evaluateCalibration(metrics);
  return certificateSchema.parse({
    schemaVersion: "reviewer-calibration-certificate-v1",
    artifactId: "reviewer-calibration-packet-v1",
    reviewerPseudonym,
    decision: decision.pass ? "CERTIFIED" : "FAILED",
    packetPrivateSha256: input.packetPrivateSha256,
    finalGoldSha256: input.goldSha256,
    contractSha256: input.contractSha256,
    metricsSha256: input.metricsSha256,
    scorerSha256: input.scorerSha256,
    phase1PacketSha256: hashJson(phase1),
    phase1SubmissionSha256: submissionHash,
    phase1SealSha256: hashJson(seal),
    phase2RevealSha256: revealHash,
    reviewRecordsSha256: hashJson(records),
    thresholds: DEFAULT_THRESHOLDS,
    metrics,
    reasonCodes: decision.reasonCodes,
    scope: {
      focusTypes: ["GRAMMAR_ERROR", "BLANK_INFERENCE"],
      evidenceFamilies: [
        "marked_selection",
        "option_selection",
        "ordering_or_insertion",
        "closed_constructed",
        "open_constructed",
        "correction",
        "lexical",
      ],
      allNonfocusTypesCertified: false,
      supplementalS3CalibrationRequired: true,
    },
    issuedAt: input.issuedAt,
    expiresAt: input.expiresAt,
  });
}

function arg(flag: string): string {
  const index = process.argv.indexOf(flag);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`MISSING_ARGUMENT:${flag}`);
  return process.argv[index + 1];
}

function privateOutput(pathValue: string): string {
  const absolute = resolve(pathValue);
  const relativePath = relative(privateRoot, absolute);
  if (relativePath.startsWith("..") || resolve(privateRoot, relativePath) !== absolute) throw new Error("OUTPUT_MUST_BE_UNDER_PACKET_PRIVATE");
  return absolute;
}

function main(): void {
  const goldPath = resolve(arg("--gold"));
  const packetPath = resolve(arg("--packet"));
  const contractPath = resolve(arg("--contract"));
  const metricsPath = resolve(arg("--metrics"));
  const scorerPath = resolve(arg("--scorer"));
  const certificate = scoreFromSealedArtifacts({
    packetRaw: readJson(packetPath),
    packetPrivateSha256: bytesSha(packetPath),
    goldRaw: readJson(goldPath),
    goldSha256: bytesSha(goldPath),
    contractSha256: bytesSha(contractPath),
    metricsSha256: bytesSha(metricsPath),
    scorerSha256: bytesSha(scorerPath),
    phase1Raw: readJson(resolve(arg("--phase1"))),
    submissionRaw: readJson(resolve(arg("--submission"))),
    sealRaw: readJson(resolve(arg("--seal"))),
    mapRaw: readJson(resolve(arg("--map"))),
    revealRaw: readJson(resolve(arg("--reveal"))),
    recordsRaw: readJson(resolve(arg("--records"))),
    issuedAt: arg("--issued-at"),
    expiresAt: arg("--expires-at"),
  });
  writeFileSync(privateOutput(arg("--out-certificate")), `${JSON.stringify(certificate, null, 2)}\n`, "utf8");
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) main();
