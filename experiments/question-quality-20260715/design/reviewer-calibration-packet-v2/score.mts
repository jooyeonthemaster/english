import { readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import {
  ARTIFACT_ID,
  answerSetSchema,
  authorPacketSchema,
  calibrationReviewRecordSchema,
  canonicalRfc3339Micros,
  canonicalTimestampSchema,
  hashJson,
  issuedPhase1PacketSchema,
  pendingGoldSchema,
  phase1SealSchema,
  phase1SubmissionSchema,
  phaseOneRecordSha,
  sha256,
  withAnswerSetSha,
  type AnswerSet,
} from "./contract.mts";
import { computeCalibrationMetrics, DEFAULT_THRESHOLDS, evaluateCalibration, scoreLabelSchema } from "./metrics.mts";
import { phase2RevealSchema, privateIssueMapSchema, revealPhase2 } from "./reveal.mts";

const here = dirname(fileURLToPath(import.meta.url));
const privateRoot = resolve(here, "private");
const trustedGoldPath = resolve(privateRoot, "gold.private.json");
const shaSchema = z.string().regex(/^[a-f0-9]{64}$/u);

export const finalGoldSchema = z.object({
  schemaVersion: z.literal("reviewer-calibration-final-gold-v2"), artifactId: z.literal(ARTIFACT_ID), status: z.literal("FINAL_ADJUDICATED_GOLD"),
  packetPrivateSha256: shaSchema, contractSha256: shaSchema, metricsSha256: shaSchema,
  independentRatersPerItem: z.literal(2), freshAdjudicatorsPerItem: z.literal(1),
  items: z.array(z.object({
    itemId: z.string().regex(/^RCAL2-(G|B|N)[0-9]{2}$/u), block: z.enum(["GRAMMAR", "BLANK", "NONFOCUS"]),
    independentReviewRecordSha256: z.tuple([shaSchema, shaSchema]),
    adjudicatorFreshSolve: z.object({ recordSha256: shaSchema, answer: answerSetSchema, answerSetSha256: shaSchema }).strict(),
    adjudicationRecordSha256: shaSchema, finalLabel: scoreLabelSchema,
  }).strict()).length(24),
}).strict().superRefine((value, ctx) => {
  if (new Set(value.items.map((row) => row.itemId)).size !== 24) ctx.addIssue({ code: "custom", message: "final-gold item IDs must be unique" });
  const independentHashes = value.items.flatMap((row) => [...row.independentReviewRecordSha256]);
  if (new Set(independentHashes).size !== independentHashes.length) ctx.addIssue({ code: "custom", message: "independent review hashes cannot be reused across items" });
  if (new Set(value.items.map((row) => row.adjudicatorFreshSolve.recordSha256)).size !== value.items.length) ctx.addIssue({ code: "custom", message: "adjudicator solve hashes cannot be reused across items" });
  if (new Set(value.items.map((row) => row.adjudicationRecordSha256)).size !== value.items.length) ctx.addIssue({ code: "custom", message: "adjudication hashes cannot be reused across items" });
  for (const row of value.items) {
    if (row.independentReviewRecordSha256[0] === row.independentReviewRecordSha256[1]) ctx.addIssue({ code: "custom", message: `independent hashes duplicate ${row.itemId}` });
    if (row.finalLabel.itemId !== row.itemId || row.finalLabel.block !== row.block) ctx.addIssue({ code: "custom", message: `final-label identity mismatch ${row.itemId}` });
    if (row.adjudicatorFreshSolve.answer.setSha256 !== row.adjudicatorFreshSolve.answerSetSha256) ctx.addIssue({ code: "custom", message: `adjudicator answer hash mismatch ${row.itemId}` });
  }
});

export type FinalGold = z.infer<typeof finalGoldSchema>;

export function finalGoldCompositionIssues(gold: FinalGold): string[] {
  const reasons: string[] = [];
  for (const block of ["GRAMMAR", "BLANK", "NONFOCUS"] as const) {
    const rows = gold.items.filter((row) => row.block === block);
    if (rows.length !== 8) reasons.push(`${block}_COUNT_NOT_8`);
    if (rows.filter((row) => row.finalLabel.anyFatal).length !== 2) reasons.push(`${block}_FATAL_COUNT_NOT_2`);
    for (const grade of ["F", "C", "B", "A"] as const) if (rows.filter((row) => row.finalLabel.grade === grade).length !== 2) reasons.push(`${block}_GRADE_${grade}_COUNT_NOT_2`);
  }
  return reasons.sort();
}

export function assertFinalGoldIssuanceEligible(gold: FinalGold): void {
  const reasons = finalGoldCompositionIssues(gold);
  if (reasons.length) throw new Error(`PACKET_COMPOSITION_INELIGIBLE:${reasons.join(",")}`);
}

export const certificateSchema = z.object({
  schemaVersion: z.literal("reviewer-calibration-certificate-v2"), artifactId: z.literal(ARTIFACT_ID), reviewerPseudonym: z.string().regex(/^[A-Z0-9_-]{3,40}$/u),
  decision: z.enum(["CERTIFIED", "FAILED"]), packetPrivateSha256: shaSchema, finalGoldSha256: shaSchema,
  contractSha256: shaSchema, metricsSha256: shaSchema, scorerSha256: shaSchema,
  phase1PacketSha256: shaSchema, phase1SubmissionSha256: shaSchema, phase1SealSha256: shaSchema, phase2RevealSha256: shaSchema, reviewRecordsSha256: shaSchema,
  thresholds: z.unknown(), metrics: z.unknown(), reasonCodes: z.array(z.string()),
  scope: z.object({ focusTypes: z.tuple([z.literal("GRAMMAR_ERROR"), z.literal("BLANK_INFERENCE")]), allNonfocusTypesCertified: z.literal(false), supplementalS3CalibrationRequired: z.literal(true) }).strict(),
  issuedAt: canonicalTimestampSchema, expiresAt: canonicalTimestampSchema,
}).strict().superRefine((value, ctx) => {
  const issued = canonicalRfc3339Micros(value.issuedAt); const expires = canonicalRfc3339Micros(value.expiresAt);
  if (issued !== null && expires !== null && expires <= issued) ctx.addIssue({ code: "custom", message: "certificate expiry must be after issuance" });
});

function mapToCanonical(answer: AnswerSet, displayToCanonical: Record<string, string>): AnswerSet {
  if (answer.kind === "SINGLE_LABEL") return withAnswerSetSha({ kind: "SINGLE_LABEL", label: displayToCanonical[answer.label] ?? answer.label });
  if (answer.kind === "MULTIPLE_LABELS") return withAnswerSetSha({ kind: "MULTIPLE_LABELS", labels: answer.labels.map((label) => displayToCanonical[label] ?? label) });
  return answer;
}

function trustedGold(): { raw: unknown; parsed: FinalGold; bytesSha256: string } {
  const bytes = readFileSync(trustedGoldPath); const raw: unknown = JSON.parse(bytes.toString("utf8"));
  if (pendingGoldSchema.safeParse(raw).success) throw new Error("GOLD_ADJUDICATION_PENDING");
  return { raw, parsed: finalGoldSchema.parse(raw), bytesSha256: sha256(bytes) };
}

const scorerInputSchema = z.object({
  packetRaw: z.unknown(), packetPrivateSha256: shaSchema, contractSha256: shaSchema, metricsSha256: shaSchema, scorerSha256: shaSchema,
  phase1Raw: z.unknown(), submissionRaw: z.unknown(), sealRaw: z.unknown(), mapRaw: z.unknown(), revealRaw: z.unknown(), recordsRaw: z.unknown(),
  issuedAt: canonicalTimestampSchema, expiresAt: canonicalTimestampSchema,
}).strict();

export function scoreFromSealedArtifacts(untrustedInput: unknown) {
  const input = scorerInputSchema.parse(untrustedInput);
  const packet = authorPacketSchema.parse(input.packetRaw);
  const phase1 = issuedPhase1PacketSchema.parse(input.phase1Raw); const submission = phase1SubmissionSchema.parse(input.submissionRaw);
  const seal = phase1SealSchema.parse(input.sealRaw); const map = privateIssueMapSchema.parse(input.mapRaw); const reveal = phase2RevealSchema.parse(input.revealRaw);
  if (hashJson(revealPhase2({ packet, phase1, submission, seal, privateMap: map })) !== hashJson(reveal)) throw new Error("PHASE2_REVEAL_NOT_CANONICAL");
  const records = z.array(calibrationReviewRecordSchema).length(24).parse(input.recordsRaw);
  if (new Set(records.map((row) => row.itemPseudonym)).size !== 24) throw new Error("REVIEW_ITEM_PSEUDONYM_DUPLICATE");
  if (new Set(records.map((row) => row.reviewerPseudonym)).size !== 1) throw new Error("REVIEWER_MIXED_IN_RECORD_BUNDLE");
  if (records[0].reviewerPseudonym !== phase1.reviewerPseudonym) throw new Error("REVIEWER_PACKET_MISMATCH");
  if (new Set(records.map((row) => row.phaseOneRecordSha256)).size !== 24) throw new Error("REVIEW_PHASE1_RECORD_CROSS_ITEM_REUSE");

  const submissionHash = hashJson(submission); const revealHash = hashJson(reveal);
  const blindByPseudo = new Map(submission.answers.map((row) => [row.itemPseudonym, row]));
  const issuedByPseudo = new Map(phase1.items.map((row) => [row.itemPseudonym, row]));
  const mapByPseudo = new Map(map.rows.map((row) => [row.itemPseudonym, row]));
  const authorById = new Map(packet.items.map((row) => [row.itemId, row]));

  const reviewLabels = records.map((record) => {
    const blind = blindByPseudo.get(record.itemPseudonym); const issued = issuedByPseudo.get(record.itemPseudonym); const mapRow = mapByPseudo.get(record.itemPseudonym);
    if (!blind || !issued || !mapRow) throw new Error(`REVIEW_UNKNOWN_PSEUDONYM:${record.itemPseudonym}`);
    if (record.phase1SubmissionSha256 !== submissionHash || record.phase2RevealSha256 !== revealHash) throw new Error(`REVIEW_PHASE_HASH_MISMATCH:${record.itemPseudonym}`);
    if (record.surfaceSha256 !== issued.surfaceSha256 || record.relabelMapSha256 !== hashJson(mapRow)) throw new Error(`REVIEW_SURFACE_OR_MAP_MISMATCH:${record.itemPseudonym}`);
    const recordHash = phaseOneRecordSha(blind.itemPseudonym, blind.surfaceSha256, blind.answer, blind.confidence);
    if (record.phaseOneRecordSha256 !== recordHash) throw new Error(`REVIEW_PHASE1_ITEM_BINDING_MISMATCH:${record.itemPseudonym}`);
    if (hashJson(record.blindAnswer) !== hashJson(blind.answer) || record.blindAnswerSetSha256 !== blind.answerSetSha256) throw new Error(`REVIEW_BLIND_SOLVE_MUTATED:${record.itemPseudonym}`);
    const author = authorById.get(mapRow.itemId); if (!author || author.block !== record.block) throw new Error(`REVIEW_BLOCK_MISMATCH:${record.itemPseudonym}`);
    const canonicalAnswer = mapToCanonical(blind.answer as AnswerSet, mapRow.displayToCanonical);
    const common = { itemId: mapRow.itemId, block: record.block, canonicalAnswer, acceptedEquivalenceSets: [canonicalAnswer], anyFatal: record.anyFatal, grade: record.grade };
    if (record.block === "GRAMMAR") {
      const grammarSites = record.grammarSiteJudgments.map((row) => ({
        site: (mapRow.displayToCanonical[row.site] ?? row.site) as "A" | "B" | "C" | "D" | "E", displayedGrammaticality: row.displayedGrammaticality,
        diagnosis: row.diagnosis, pointFamily: row.pointFamily, correctionRestoresSource: row.correctionRestoresSource, explanationAccurate: row.explanationAccurate,
      })).sort((a, b) => a.site.localeCompare(b.site));
      return scoreLabelSchema.parse({ ...common, grammarSites, blankOptions: [], blankAxes: [] });
    }
    if (record.block === "BLANK") {
      const blankOptions = record.blankOptionJudgments.map((row) => ({
        label: (mapRow.displayToCanonical[row.label] ?? row.label) as "1" | "2" | "3" | "4" | "5", slotGrammarCompatible: row.slotGrammarCompatible,
        passageGrounded: row.passageGrounded, primaryIntentAxis: row.primaryIntentAxis, divergentAxes: row.divergentAxes, singleDecisiveFlaw: row.singleDecisiveFlaw,
      })).sort((a, b) => a.label.localeCompare(b.label));
      const blankAxes = record.blankAxisJudgments.map((row) => ({ axis: row.axis, answerPreserved: row.answerPreserved }));
      return scoreLabelSchema.parse({ ...common, grammarSites: [], blankOptions, blankAxes });
    }
    return scoreLabelSchema.parse({ ...common, grammarSites: [], blankOptions: [], blankAxes: [] });
  });

  const goldLoad = trustedGold(); const gold = goldLoad.parsed;
  if (gold.packetPrivateSha256 !== input.packetPrivateSha256) throw new Error("GOLD_PACKET_BYTES_HASH_MISMATCH");
  if (gold.contractSha256 !== input.contractSha256 || gold.metricsSha256 !== input.metricsSha256) throw new Error("GOLD_CONTRACT_OR_METRICS_HASH_MISMATCH");
  assertFinalGoldIssuanceEligible(gold);
  const metrics = computeCalibrationMetrics({ schemaVersion: "reviewer-calibration-score-input-v2", goldStatus: "FINAL_ADJUDICATED_GOLD", packetSha256: input.packetPrivateSha256, oracleSha256: goldLoad.bytesSha256, reviewerPseudonym: records[0].reviewerPseudonym, gold: gold.items.map((row) => row.finalLabel), review: reviewLabels });
  const decision = evaluateCalibration(metrics);
  return certificateSchema.parse({
    schemaVersion: "reviewer-calibration-certificate-v2", artifactId: ARTIFACT_ID, reviewerPseudonym: records[0].reviewerPseudonym,
    decision: decision.pass ? "CERTIFIED" : "FAILED", packetPrivateSha256: input.packetPrivateSha256, finalGoldSha256: goldLoad.bytesSha256,
    contractSha256: input.contractSha256, metricsSha256: input.metricsSha256, scorerSha256: input.scorerSha256,
    phase1PacketSha256: hashJson(phase1), phase1SubmissionSha256: submissionHash, phase1SealSha256: hashJson(seal), phase2RevealSha256: revealHash,
    reviewRecordsSha256: hashJson(records), thresholds: DEFAULT_THRESHOLDS, metrics, reasonCodes: decision.reasonCodes,
    scope: { focusTypes: ["GRAMMAR_ERROR", "BLANK_INFERENCE"], allNonfocusTypesCertified: false, supplementalS3CalibrationRequired: true },
    issuedAt: input.issuedAt, expiresAt: input.expiresAt,
  });
}

function arg(flag: string): string { const index = process.argv.indexOf(flag); if (index < 0 || !process.argv[index + 1]) throw new Error(`MISSING_ARGUMENT:${flag}`); return process.argv[index + 1]; }
function json(path: string): unknown { return JSON.parse(readFileSync(resolve(path), "utf8")); }
function bytesSha(path: string): string { return sha256(readFileSync(resolve(path))); }
function privateOutput(pathValue: string): string {
  const absolute = resolve(pathValue); const rel = relative(privateRoot, absolute);
  if (rel.startsWith("..") || resolve(privateRoot, rel) !== absolute) throw new Error("OUTPUT_MUST_BE_UNDER_PACKET_PRIVATE"); return absolute;
}

async function main(): Promise<void> {
  if (!process.argv[2]) return;
  if (process.argv[2] !== "score") throw new Error(`UNKNOWN_COMMAND:${process.argv[2]}`);
  if (process.argv.includes("--gold") || process.argv.includes("--oracle")) throw new Error("ORACLE_INJECTION_FORBIDDEN");
  const packetPath = arg("--packet"); const contractPath = resolve(here, "contract.mts"); const metricsPath = resolve(here, "metrics.mts"); const scorerPath = resolve(here, "score.mts");
  const certificate = scoreFromSealedArtifacts({
    packetRaw: json(packetPath), packetPrivateSha256: bytesSha(packetPath), contractSha256: bytesSha(contractPath), metricsSha256: bytesSha(metricsPath), scorerSha256: bytesSha(scorerPath),
    phase1Raw: json(arg("--phase1")), submissionRaw: json(arg("--submission")), sealRaw: json(arg("--seal")), mapRaw: json(arg("--map")), revealRaw: json(arg("--reveal")), recordsRaw: json(arg("--records")),
    issuedAt: arg("--issued-at"), expiresAt: arg("--expires-at"),
  });
  writeFileSync(privateOutput(arg("--out-certificate")), `${JSON.stringify(certificate, null, 2)}\n`, "utf8");
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) await main();
