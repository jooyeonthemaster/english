import { z } from "zod";

import {
  answerSetSchema,
  assertAcceptedEquivalenceSets,
  BLANK_DISTRACTOR_AXES,
  BLANK_PROPOSITION_AXES,
  BLOCKS,
  GRADES,
  GRAMMAR_POINT_FAMILIES,
  type AnswerSet,
} from "./contract.mts";

const grammarSitesSchema = z.array(z.object({
  site: z.enum(["A", "B", "C", "D", "E"]), displayedGrammaticality: z.enum(["GRAMMATICAL", "UNGRAMMATICAL", "CONTESTED"]),
  diagnosis: z.enum(["ANSWER_ERROR", "VALID_DECOY", "INVALID_SITE"]), pointFamily: z.enum(GRAMMAR_POINT_FAMILIES),
  correctionRestoresSource: z.boolean(), explanationAccurate: z.boolean(),
}).strict()).length(5).refine((rows) => rows.map((row) => row.site).join("") === "ABCDE", "grammar diagnostics must be A-E");

const blankOptionsSchema = z.array(z.object({
  label: z.enum(["1", "2", "3", "4", "5"]), slotGrammarCompatible: z.boolean(), passageGrounded: z.boolean(),
  primaryIntentAxis: z.union([z.literal("CORRECT"), z.enum(BLANK_DISTRACTOR_AXES)]),
  divergentAxes: z.array(z.enum(BLANK_PROPOSITION_AXES)).max(7), singleDecisiveFlaw: z.boolean(),
}).strict()).length(5).refine((rows) => rows.map((row) => row.label).join("") === "12345", "blank diagnostics must be 1-5");

const blankAxesSchema = z.array(z.object({ axis: z.enum(BLANK_PROPOSITION_AXES), answerPreserved: z.boolean() }).strict()).length(7)
  .refine((rows) => rows.map((row) => row.axis).join("|") === BLANK_PROPOSITION_AXES.join("|"), "blank axes incomplete");

const base = {
  itemId: z.string().regex(/^RCAL2-(G|B|N)[0-9]{2}$/u), anyFatal: z.boolean(), grade: z.enum(GRADES),
  canonicalAnswer: answerSetSchema, acceptedEquivalenceSets: z.array(answerSetSchema).min(1).max(20),
};

export const scoreLabelSchema = z.discriminatedUnion("block", [
  z.object({ ...base, block: z.literal("GRAMMAR"), grammarSites: grammarSitesSchema, blankOptions: z.tuple([]), blankAxes: z.tuple([]) }).strict(),
  z.object({ ...base, block: z.literal("BLANK"), grammarSites: z.tuple([]), blankOptions: blankOptionsSchema, blankAxes: blankAxesSchema }).strict(),
  z.object({ ...base, block: z.literal("NONFOCUS"), grammarSites: z.tuple([]), blankOptions: z.tuple([]), blankAxes: z.tuple([]) }).strict(),
]).superRefine((value, ctx) => {
  if (value.anyFatal !== (value.grade === "F")) ctx.addIssue({ code: "custom", message: "fatal/grade mismatch" });
  try { assertAcceptedEquivalenceSets(value.canonicalAnswer as AnswerSet, value.acceptedEquivalenceSets as AnswerSet[]); }
  catch (error) { ctx.addIssue({ code: "custom", message: error instanceof Error ? error.message : "accepted answer sets invalid" }); }
});

export const scoreInputSchema = z.object({
  schemaVersion: z.literal("reviewer-calibration-score-input-v2"), goldStatus: z.literal("FINAL_ADJUDICATED_GOLD"),
  packetSha256: z.string().regex(/^[a-f0-9]{64}$/u), oracleSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  reviewerPseudonym: z.string().regex(/^[A-Z0-9_-]{3,40}$/u), gold: z.array(scoreLabelSchema).length(24), review: z.array(scoreLabelSchema).length(24),
}).strict();

type ScoreLabel = z.infer<typeof scoreLabelSchema>;
type Block = (typeof BLOCKS)[number];
export type MetricFraction = { numerator: number; denominator: number; value: number | null };
type BlockMetrics = {
  confusion: { tp: number; tn: number; fp: number; fn: number }; exactFatalAgreement: MetricFraction;
  fatalSensitivity: MetricFraction; fatalSpecificity: MetricFraction; quadraticWeightedKappaGrade: MetricFraction;
  focusFieldCompleteness: MetricFraction; grammarSiteAgreement: MetricFraction; blankOptionAgreement: MetricFraction; blankAxisAgreement: MetricFraction;
};
export type CalibrationMetrics = BlockMetrics & {
  gwetAc1Fatal: MetricFraction; blindSolveExactAgreement: MetricFraction;
  block: Record<Block, BlockMetrics>; blockBlindSolveExactAgreement: Record<Block, MetricFraction>;
};

function fraction(numerator: number, denominator: number): MetricFraction { return { numerator, denominator, value: denominator === 0 ? null : numerator / denominator }; }
function confusion(rows: Array<{ gold: ScoreLabel; review: ScoreLabel }>) {
  return {
    tp: rows.filter(({ gold, review }) => gold.anyFatal && review.anyFatal).length,
    tn: rows.filter(({ gold, review }) => !gold.anyFatal && !review.anyFatal).length,
    fp: rows.filter(({ gold, review }) => !gold.anyFatal && review.anyFatal).length,
    fn: rows.filter(({ gold, review }) => gold.anyFatal && !review.anyFatal).length,
  };
}
function gwetAc1(counts: ReturnType<typeof confusion>): MetricFraction {
  const n = counts.tp + counts.tn + counts.fp + counts.fn; if (!n) return fraction(0, 0);
  const agreement = counts.tp + counts.tn; const positives = 2 * counts.tp + counts.fp + counts.fn; const chanceTerm = positives * (2 * n - positives);
  return fraction(2 * agreement * n - chanceTerm, 2 * n * n - chanceTerm);
}
function qwk(rows: Array<{ gold: ScoreLabel; review: ScoreLabel }>): MetricFraction {
  const n = rows.length; if (!n) return fraction(0, 0);
  const goldCounts = GRADES.map((grade) => rows.filter((row) => row.gold.grade === grade).length);
  const reviewCounts = GRADES.map((grade) => rows.filter((row) => row.review.grade === grade).length);
  let observed = 0; let expected = 0;
  for (let i = 0; i < 4; i += 1) for (let j = 0; j < 4; j += 1) {
    const weight = (i - j) ** 2; observed += weight * rows.filter((row) => row.gold.grade === GRADES[i] && row.review.grade === GRADES[j]).length;
    expected += weight * goldCounts[i] * reviewCounts[j];
  }
  return expected === 0 ? fraction(0, 0) : fraction(expected - observed * n, expected);
}
function siteAgreement(rows: Array<{ gold: ScoreLabel; review: ScoreLabel }>): MetricFraction {
  const pairs = rows.flatMap(({ gold, review }) => gold.block === "GRAMMAR" && review.block === "GRAMMAR" ? gold.grammarSites.map((g) => ({ g, r: review.grammarSites.find((row) => row.site === g.site) })) : []);
  let hits = 0; const fields = ["displayedGrammaticality", "diagnosis", "pointFamily", "correctionRestoresSource", "explanationAccurate"] as const;
  for (const pair of pairs) for (const field of fields) if (pair.r && pair.g[field] === pair.r[field]) hits += 1;
  return fraction(hits, pairs.length * fields.length);
}
function optionAgreement(rows: Array<{ gold: ScoreLabel; review: ScoreLabel }>): MetricFraction {
  const pairs = rows.flatMap(({ gold, review }) => gold.block === "BLANK" && review.block === "BLANK" ? gold.blankOptions.map((g) => ({ g, r: review.blankOptions.find((row) => row.label === g.label) })) : []);
  let hits = 0; const fields = ["slotGrammarCompatible", "passageGrounded", "primaryIntentAxis", "singleDecisiveFlaw"] as const;
  for (const pair of pairs) {
    for (const field of fields) if (pair.r && pair.g[field] === pair.r[field]) hits += 1;
    if (pair.r && JSON.stringify([...pair.g.divergentAxes].sort()) === JSON.stringify([...pair.r.divergentAxes].sort())) hits += 1;
  }
  return fraction(hits, pairs.length * 5);
}
function axisAgreement(rows: Array<{ gold: ScoreLabel; review: ScoreLabel }>): MetricFraction {
  const pairs = rows.flatMap(({ gold, review }) => gold.block === "BLANK" && review.block === "BLANK" ? gold.blankAxes.map((g) => ({ g, r: review.blankAxes.find((row) => row.axis === g.axis) })) : []);
  return fraction(pairs.filter((pair) => pair.r?.answerPreserved === pair.g.answerPreserved).length, pairs.length);
}
function blockMetrics(rows: Array<{ gold: ScoreLabel; review: ScoreLabel }>): BlockMetrics {
  const c = confusion(rows);
  return {
    confusion: c, exactFatalAgreement: fraction(c.tp + c.tn, rows.length), fatalSensitivity: fraction(c.tp, c.tp + c.fn), fatalSpecificity: fraction(c.tn, c.tn + c.fp),
    quadraticWeightedKappaGrade: qwk(rows), focusFieldCompleteness: fraction(rows.filter(({ gold, review }) => gold.block === review.block).length, rows.length),
    grammarSiteAgreement: siteAgreement(rows), blankOptionAgreement: optionAgreement(rows), blankAxisAgreement: axisAgreement(rows),
  };
}
function blindMatch(gold: ScoreLabel, review: ScoreLabel): boolean { return gold.acceptedEquivalenceSets.some((accepted) => accepted.setSha256 === review.canonicalAnswer.setSha256); }

export function computeCalibrationMetrics(raw: unknown): CalibrationMetrics {
  const input = scoreInputSchema.parse(raw);
  const goldById = new Map(input.gold.map((row) => [row.itemId, row]));
  if (new Set(input.gold.map((row) => row.itemId)).size !== 24 || new Set(input.review.map((row) => row.itemId)).size !== 24) throw new Error("SCORE_ITEM_IDS_NOT_UNIQUE");
  const rows = input.review.map((review) => { const gold = goldById.get(review.itemId); if (!gold || gold.block !== review.block) throw new Error(`SCORE_ITEM_SET_MISMATCH:${review.itemId}`); return { gold, review }; });
  const global = blockMetrics(rows); const c = global.confusion;
  const byBlock = Object.fromEntries(BLOCKS.map((block) => [block, blockMetrics(rows.filter((row) => row.gold.block === block))])) as Record<Block, BlockMetrics>;
  return {
    ...global, gwetAc1Fatal: gwetAc1(c), blindSolveExactAgreement: fraction(rows.filter((row) => blindMatch(row.gold, row.review)).length, rows.length),
    block: byBlock,
    blockBlindSolveExactAgreement: Object.fromEntries(BLOCKS.map((block) => { const subset = rows.filter((row) => row.gold.block === block); return [block, fraction(subset.filter((row) => blindMatch(row.gold, row.review)).length, subset.length)]; })) as Record<Block, MetricFraction>,
  };
}

export const DEFAULT_THRESHOLDS = {
  global: {
    blindSolveExactAgreement: { numerator: 9, denominator: 10 }, exactFatalAgreement: { numerator: 9, denominator: 10 }, gwetAc1Fatal: { numerator: 4, denominator: 5 },
    fatalSensitivity: { numerator: 9, denominator: 10 }, fatalSpecificity: { numerator: 17, denominator: 20 }, quadraticWeightedKappaGrade: { numerator: 7, denominator: 10 },
    focusFieldCompleteness: { numerator: 1, denominator: 1 }, grammarSiteAgreement: { numerator: 19, denominator: 20 }, blankOptionAgreement: { numerator: 19, denominator: 20 }, blankAxisAgreement: { numerator: 1, denominator: 1 },
  },
  eachBlock: {
    blindSolveExactAgreement: { numerator: 7, denominator: 8 }, exactFatalAgreement: { numerator: 7, denominator: 8 }, fatalSensitivity: { numerator: 1, denominator: 1 },
    fatalSpecificity: { numerator: 5, denominator: 6 }, quadraticWeightedKappaGrade: { numerator: 3, denominator: 5 }, focusFieldCompleteness: { numerator: 1, denominator: 1 },
    grammarSiteAgreement: { numerator: 19, denominator: 20 }, blankOptionAgreement: { numerator: 19, denominator: 20 }, blankAxisAgreement: { numerator: 1, denominator: 1 },
  },
} as const;

function meets(value: MetricFraction, threshold: { numerator: number; denominator: number }): boolean {
  return value.denominator > 0 && value.numerator * threshold.denominator >= threshold.numerator * value.denominator;
}

export function evaluateCalibration(metrics: CalibrationMetrics): { pass: boolean; reasonCodes: string[] } {
  const reasons: string[] = [];
  for (const [name, threshold] of Object.entries(DEFAULT_THRESHOLDS.global)) {
    const value = metrics[name as keyof typeof DEFAULT_THRESHOLDS.global] as MetricFraction;
    if (!meets(value, threshold)) reasons.push(`GLOBAL_${name.toUpperCase()}`);
  }
  for (const block of BLOCKS) for (const [name, threshold] of Object.entries(DEFAULT_THRESHOLDS.eachBlock)) {
    if (name === "grammarSiteAgreement" && block !== "GRAMMAR") continue;
    if ((name === "blankOptionAgreement" || name === "blankAxisAgreement") && block !== "BLANK") continue;
    const value = name === "blindSolveExactAgreement" ? metrics.blockBlindSolveExactAgreement[block] : metrics.block[block][name as keyof BlockMetrics] as MetricFraction;
    if (!meets(value, threshold)) reasons.push(`${block}_${name.toUpperCase()}`);
  }
  return { pass: reasons.length === 0, reasonCodes: reasons };
}
