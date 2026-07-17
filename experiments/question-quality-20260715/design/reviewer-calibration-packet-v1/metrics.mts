import { z } from "zod";

import {
  BLANK_DISTRACTOR_AXES,
  BLANK_PROPOSITION_AXES,
  BLOCKS,
  GRADES,
  GRAMMAR_POINT_FAMILIES,
} from "./contract.mts";

const gradeSchema = z.enum(GRADES);
const answerFields = {
  disposition: z.enum(["ANSWER", "NO_ANSWER", "MULTIPLE", "UNEVALUABLE"]),
  answerSet: z.array(z.string().min(1).max(500)).max(20),
  acceptedAnswerSets: z.array(z.array(z.string().min(1).max(500)).max(20)).min(1).max(20),
};
const commonLabelFields = {
  itemId: z.string().min(3),
  anyFatal: z.boolean(),
  grade: gradeSchema,
  ...answerFields,
};
const grammarSitesSchema = z
  .array(
    z
      .object({
        site: z.enum(["A", "B", "C", "D", "E"]),
        displayedGrammaticality: z.enum(["GRAMMATICAL", "UNGRAMMATICAL", "CONTESTED"]),
        diagnosis: z.enum(["ANSWER_ERROR", "VALID_DECOY", "INVALID_SITE"]),
        pointFamily: z.enum(GRAMMAR_POINT_FAMILIES),
        correctionRestoresSource: z.boolean(),
        explanationAccurate: z.boolean(),
      })
      .strict(),
  )
  .length(5)
  .refine((rows) => rows.map((row) => row.site).join("") === "ABCDE", "grammar sites must be exact ordered A-E");
const blankOptionsSchema = z
  .array(
    z
      .object({
        label: z.enum(["1", "2", "3", "4", "5"]),
        slotGrammarCompatible: z.boolean(),
        passageGrounded: z.boolean(),
        primaryIntentAxis: z.union([z.literal("CORRECT"), z.enum(BLANK_DISTRACTOR_AXES)]),
        divergentAxes: z
          .array(z.enum(BLANK_PROPOSITION_AXES))
          .max(BLANK_PROPOSITION_AXES.length)
          .refine((rows) => new Set(rows).size === rows.length, "divergent axes must be unique"),
        singleDecisiveFlaw: z.boolean(),
      })
      .strict(),
  )
  .length(5)
  .refine((rows) => rows.map((row) => row.label).join("") === "12345", "blank options must be exact ordered 1-5");
const blankAxesSchema = z
  .array(z.object({ axis: z.enum(BLANK_PROPOSITION_AXES), answerPreserved: z.boolean() }).strict())
  .length(7)
  .refine(
    (rows) => rows.map((row) => row.axis).join("|") === BLANK_PROPOSITION_AXES.join("|"),
    "blank axes must be the exact ordered seven-axis set",
  );

export const scoreLabelSchema = z
  .discriminatedUnion("block", [
    z
      .object({
        ...commonLabelFields,
        block: z.literal("GRAMMAR"),
        grammarSites: grammarSitesSchema,
        blankOptions: z.tuple([]),
        blankAxes: z.tuple([]),
      })
      .strict(),
    z
      .object({
        ...commonLabelFields,
        block: z.literal("BLANK"),
        grammarSites: z.tuple([]),
        blankOptions: blankOptionsSchema,
        blankAxes: blankAxesSchema,
      })
      .strict(),
    z
      .object({
        ...commonLabelFields,
        block: z.literal("NONFOCUS"),
        grammarSites: z.tuple([]),
        blankOptions: z.tuple([]),
        blankAxes: z.tuple([]),
      })
      .strict(),
  ])
  .superRefine((value, ctx) => {
    if (value.anyFatal !== (value.grade === "F")) ctx.addIssue({ code: "custom", message: "fatal/grade mismatch" });
    if (value.disposition === "ANSWER" && value.answerSet.length !== 1) {
      ctx.addIssue({ code: "custom", message: "ANSWER requires one answer" });
    }
    if (value.disposition === "MULTIPLE" && value.answerSet.length < 2) {
      ctx.addIssue({ code: "custom", message: "MULTIPLE requires at least two answers" });
    }
    if (["NO_ANSWER", "UNEVALUABLE"].includes(value.disposition) && value.answerSet.length !== 0) {
      ctx.addIssue({ code: "custom", message: "empty disposition cannot carry answers" });
    }
    for (const accepted of value.acceptedAnswerSets) {
      if (value.disposition === "ANSWER" && accepted.length !== 1) {
        ctx.addIssue({ code: "custom", message: "accepted ANSWER set must have one answer" });
      }
      if (value.disposition === "MULTIPLE" && accepted.length < 2) {
        ctx.addIssue({ code: "custom", message: "accepted MULTIPLE set must have at least two answers" });
      }
      if (["NO_ANSWER", "UNEVALUABLE"].includes(value.disposition) && accepted.length !== 0) {
        ctx.addIssue({ code: "custom", message: "accepted empty disposition cannot carry answers" });
      }
    }
  });

export const scoreInputSchema = z
  .object({
    schemaVersion: z.literal("reviewer-calibration-score-input-v1"),
    goldStatus: z.literal("FINAL_ADJUDICATED_GOLD"),
    packetSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    oracleSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    reviewerPseudonym: z.string().regex(/^[A-Z0-9_-]{3,40}$/u),
    gold: z.array(scoreLabelSchema).length(24),
    review: z.array(scoreLabelSchema).length(24),
  })
  .strict();

export type ScoreInput = z.infer<typeof scoreInputSchema>;
export type MetricFraction = { numerator: number; denominator: number; value: number | null };
type ScoreLabel = z.infer<typeof scoreLabelSchema>;
type Block = (typeof BLOCKS)[number];

type BlockMetrics = {
  confusion: { tp: number; tn: number; fp: number; fn: number };
  exactFatalAgreement: MetricFraction;
  fatalSensitivity: MetricFraction;
  fatalSpecificity: MetricFraction;
  quadraticWeightedKappaGrade: MetricFraction;
  focusFieldCompleteness: MetricFraction;
  grammarSiteAgreement: MetricFraction;
  blankOptionAgreement: MetricFraction;
  blankAxisAgreement: MetricFraction;
};

export type CalibrationMetrics = {
  confusion: { tp: number; tn: number; fp: number; fn: number };
  exactFatalAgreement: MetricFraction;
  fatalSensitivity: MetricFraction;
  fatalSpecificity: MetricFraction;
  gwetAc1Fatal: MetricFraction;
  quadraticWeightedKappaGrade: MetricFraction;
  focusFieldCompleteness: MetricFraction;
  grammarSiteAgreement: MetricFraction;
  blankOptionAgreement: MetricFraction;
  blankAxisAgreement: MetricFraction;
  blindSolveExactAgreement: MetricFraction;
  block: Record<Block, BlockMetrics>;
  blockBlindSolveExactAgreement: Record<Block, MetricFraction>;
};

function fraction(numerator: number, denominator: number): MetricFraction {
  return { numerator, denominator, value: denominator === 0 ? null : numerator / denominator };
}

function normalizedSet(values: string[]): string {
  return JSON.stringify([...new Set(values.map((value) => value.trim().replace(/\s+/gu, " ")))].sort());
}

function normalizedAxes(values: readonly string[]): string {
  const order = new Map(BLANK_PROPOSITION_AXES.map((axis, index) => [axis, index] as const));
  return JSON.stringify([...new Set(values)].sort((a, b) => (order.get(a as never) ?? 99) - (order.get(b as never) ?? 99)));
}

function blindSolveMatches(gold: ScoreLabel, review: ScoreLabel): boolean {
  if (gold.disposition !== review.disposition) return false;
  const reviewSet = normalizedSet(review.answerSet);
  return gold.acceptedAnswerSets.some((set) => normalizedSet(set) === reviewSet);
}

function confusion(rows: Array<{ gold: ScoreLabel; review: ScoreLabel }>) {
  return {
    tp: rows.filter(({ gold, review }) => gold.anyFatal && review.anyFatal).length,
    tn: rows.filter(({ gold, review }) => !gold.anyFatal && !review.anyFatal).length,
    fp: rows.filter(({ gold, review }) => !gold.anyFatal && review.anyFatal).length,
    fn: rows.filter(({ gold, review }) => gold.anyFatal && !review.anyFatal).length,
  };
}

function gwetAc1Exact(counts: { tp: number; tn: number; fp: number; fn: number }): MetricFraction {
  const n = counts.tp + counts.tn + counts.fp + counts.fn;
  if (n === 0) return fraction(0, 0);
  const agreement = counts.tp + counts.tn;
  const positiveAssignments = 2 * counts.tp + counts.fp + counts.fn;
  const chanceTerm = positiveAssignments * (2 * n - positiveAssignments);
  return fraction(2 * agreement * n - chanceTerm, 2 * n * n - chanceTerm);
}

function qwkExact(rows: Array<{ gold: ScoreLabel; review: ScoreLabel }>): MetricFraction {
  const n = rows.length;
  if (n === 0) return fraction(0, 0);
  const index = new Map(GRADES.map((grade, row) => [grade, row] as const));
  const goldCounts = GRADES.map((grade) => rows.filter(({ gold }) => gold.grade === grade).length);
  const reviewCounts = GRADES.map((grade) => rows.filter(({ review }) => review.grade === grade).length);
  let observed = 0;
  let expected = 0;
  for (let i = 0; i < GRADES.length; i += 1) {
    for (let j = 0; j < GRADES.length; j += 1) {
      const squaredDistance = (i - j) ** 2;
      const observedCount = rows.filter(
        ({ gold, review }) => index.get(gold.grade) === i && index.get(review.grade) === j,
      ).length;
      observed += squaredDistance * observedCount;
      expected += squaredDistance * goldCounts[i] * reviewCounts[j];
    }
  }
  return expected === 0 ? fraction(0, 0) : fraction(expected - observed * n, expected);
}

function grammarAgreement(rows: Array<{ gold: ScoreLabel; review: ScoreLabel }>): MetricFraction {
  const sites = rows.flatMap(({ gold, review }) =>
    gold.block === "GRAMMAR" && review.block === "GRAMMAR"
      ? gold.grammarSites.map((site) => ({
          gold: site,
          review: review.grammarSites.find((candidate) => candidate.site === site.site),
        }))
      : [],
  );
  const matches = sites.reduce((sum, { gold, review }) => {
    if (!review) return sum;
    return (
      sum +
      Number(review.displayedGrammaticality === gold.displayedGrammaticality) +
      Number(review.diagnosis === gold.diagnosis) +
      Number(review.pointFamily === gold.pointFamily) +
      Number(review.correctionRestoresSource === gold.correctionRestoresSource) +
      Number(review.explanationAccurate === gold.explanationAccurate)
    );
  }, 0);
  return fraction(matches, sites.length * 5);
}

function blankOptionAgreement(rows: Array<{ gold: ScoreLabel; review: ScoreLabel }>): MetricFraction {
  const options = rows.flatMap(({ gold, review }) =>
    gold.block === "BLANK" && review.block === "BLANK"
      ? gold.blankOptions.map((option) => ({
          gold: option,
          review: review.blankOptions.find((candidate) => candidate.label === option.label),
        }))
      : [],
  );
  const matches = options.reduce((sum, { gold, review }) => {
    if (!review) return sum;
    return (
      sum +
      Number(review.slotGrammarCompatible === gold.slotGrammarCompatible) +
      Number(review.passageGrounded === gold.passageGrounded) +
      Number(review.primaryIntentAxis === gold.primaryIntentAxis) +
      Number(normalizedAxes(review.divergentAxes) === normalizedAxes(gold.divergentAxes)) +
      Number(review.singleDecisiveFlaw === gold.singleDecisiveFlaw)
    );
  }, 0);
  return fraction(matches, options.length * 5);
}

function blankAxisAgreement(rows: Array<{ gold: ScoreLabel; review: ScoreLabel }>): MetricFraction {
  const axes = rows.flatMap(({ gold, review }) =>
    gold.block === "BLANK" && review.block === "BLANK"
      ? gold.blankAxes.map((axis) => ({
          gold: axis,
          review: review.blankAxes.find((candidate) => candidate.axis === axis.axis),
        }))
      : [],
  );
  return fraction(
    axes.filter(({ gold, review }) => review?.answerPreserved === gold.answerPreserved).length,
    axes.length,
  );
}

function focusCompleteness(rows: Array<{ gold: ScoreLabel; review: ScoreLabel }>): MetricFraction {
  let completed = 0;
  let required = 0;
  for (const { gold, review } of rows) {
    if (gold.block === "GRAMMAR" && review.block === "GRAMMAR") {
      required += 5 * 5;
      for (const site of review.grammarSites) {
        completed += Number(site.displayedGrammaticality !== undefined);
        completed += Number(site.diagnosis !== undefined);
        completed += Number(site.pointFamily !== undefined);
        completed += Number(site.correctionRestoresSource !== undefined);
        completed += Number(site.explanationAccurate !== undefined);
      }
    }
    if (gold.block === "BLANK" && review.block === "BLANK") {
      required += 5 * 5 + 7;
      for (const option of review.blankOptions) {
        completed += Number(option.slotGrammarCompatible !== undefined);
        completed += Number(option.passageGrounded !== undefined);
        completed += Number(option.primaryIntentAxis !== undefined);
        completed += Number(option.divergentAxes !== undefined);
        completed += Number(option.singleDecisiveFlaw !== undefined);
      }
      completed += review.blankAxes.filter((axis) => axis.answerPreserved !== undefined).length;
    }
  }
  return fraction(completed, required);
}

function blockMetrics(rows: Array<{ gold: ScoreLabel; review: ScoreLabel }>): BlockMetrics {
  const counts = confusion(rows);
  return {
    confusion: counts,
    exactFatalAgreement: fraction(counts.tp + counts.tn, rows.length),
    fatalSensitivity: fraction(counts.tp, counts.tp + counts.fn),
    fatalSpecificity: fraction(counts.tn, counts.tn + counts.fp),
    quadraticWeightedKappaGrade: qwkExact(rows),
    focusFieldCompleteness: focusCompleteness(rows),
    grammarSiteAgreement: grammarAgreement(rows),
    blankOptionAgreement: blankOptionAgreement(rows),
    blankAxisAgreement: blankAxisAgreement(rows),
  };
}

export function computeCalibrationMetrics(raw: unknown): CalibrationMetrics {
  const input = scoreInputSchema.parse(raw);
  const goldById = new Map(input.gold.map((row) => [row.itemId, row]));
  const reviewById = new Map(input.review.map((row) => [row.itemId, row]));
  if (goldById.size !== 24 || reviewById.size !== 24) throw new Error("ITEM_IDS_NOT_UNIQUE");
  if ([...goldById.keys()].some((id) => !reviewById.has(id))) throw new Error("ITEM_ID_SET_MISMATCH");
  const pairs = [...goldById.entries()].map(([id, gold]) => ({ gold, review: reviewById.get(id)! }));
  if (pairs.some(({ gold, review }) => gold.block !== review.block)) throw new Error("BLOCK_MISMATCH");

  const counts = confusion(pairs);
  const block = Object.fromEntries(
    BLOCKS.map((name) => [name, blockMetrics(pairs.filter(({ gold }) => gold.block === name))]),
  ) as CalibrationMetrics["block"];
  const blockBlindSolveExactAgreement = Object.fromEntries(
    BLOCKS.map((name) => {
      const rows = pairs.filter(({ gold }) => gold.block === name);
      return [name, fraction(rows.filter(({ gold, review }) => blindSolveMatches(gold, review)).length, rows.length)];
    }),
  ) as CalibrationMetrics["blockBlindSolveExactAgreement"];

  return {
    confusion: counts,
    exactFatalAgreement: fraction(counts.tp + counts.tn, pairs.length),
    fatalSensitivity: fraction(counts.tp, counts.tp + counts.fn),
    fatalSpecificity: fraction(counts.tn, counts.tn + counts.fp),
    gwetAc1Fatal: gwetAc1Exact(counts),
    quadraticWeightedKappaGrade: qwkExact(pairs),
    focusFieldCompleteness: focusCompleteness(pairs),
    grammarSiteAgreement: grammarAgreement(pairs),
    blankOptionAgreement: blankOptionAgreement(pairs),
    blankAxisAgreement: blankAxisAgreement(pairs),
    blindSolveExactAgreement: fraction(
      pairs.filter(({ gold, review }) => blindSolveMatches(gold, review)).length,
      pairs.length,
    ),
    block,
    blockBlindSolveExactAgreement,
  };
}

type Threshold = { numerator: number; denominator: number };
export const DEFAULT_THRESHOLDS = {
  global: {
    blindSolveExactAgreement: { numerator: 9, denominator: 10 },
    exactFatalAgreement: { numerator: 9, denominator: 10 },
    gwetAc1Fatal: { numerator: 4, denominator: 5 },
    fatalSensitivity: { numerator: 9, denominator: 10 },
    fatalSpecificity: { numerator: 17, denominator: 20 },
    quadraticWeightedKappaGrade: { numerator: 7, denominator: 10 },
    focusFieldCompleteness: { numerator: 1, denominator: 1 },
    grammarSiteAgreement: { numerator: 19, denominator: 20 },
    blankOptionAgreement: { numerator: 19, denominator: 20 },
    blankAxisAgreement: { numerator: 1, denominator: 1 },
  },
  eachBlock: {
    blindSolveExactAgreement: { numerator: 7, denominator: 8 },
    exactFatalAgreement: { numerator: 7, denominator: 8 },
    fatalSensitivity: { numerator: 1, denominator: 1 },
    fatalSpecificity: { numerator: 5, denominator: 6 },
    quadraticWeightedKappaGrade: { numerator: 3, denominator: 5 },
    focusFieldCompletenessWhenApplicable: { numerator: 1, denominator: 1 },
    grammarSiteAgreementWhenApplicable: { numerator: 19, denominator: 20 },
    blankOptionAgreementWhenApplicable: { numerator: 19, denominator: 20 },
    blankAxisAgreementWhenApplicable: { numerator: 1, denominator: 1 },
  },
} as const;

function meets(metric: MetricFraction, threshold: Threshold): boolean {
  return (
    metric.denominator > 0 &&
    metric.numerator * threshold.denominator >= threshold.numerator * metric.denominator
  );
}

export function evaluateCalibration(metrics: CalibrationMetrics): { pass: boolean; reasonCodes: string[] } {
  const reasons: string[] = [];
  const requireMetric = (name: string, metric: MetricFraction, threshold: Threshold) => {
    if (!meets(metric, threshold)) reasons.push(`${name.toUpperCase()}_BELOW_THRESHOLD`);
  };
  const global = DEFAULT_THRESHOLDS.global;
  requireMetric("global_blind_solve_exact_agreement", metrics.blindSolveExactAgreement, global.blindSolveExactAgreement);
  requireMetric("exact_fatal_agreement", metrics.exactFatalAgreement, global.exactFatalAgreement);
  requireMetric("gwet_ac1_fatal", metrics.gwetAc1Fatal, global.gwetAc1Fatal);
  requireMetric("fatal_sensitivity", metrics.fatalSensitivity, global.fatalSensitivity);
  requireMetric("fatal_specificity", metrics.fatalSpecificity, global.fatalSpecificity);
  requireMetric("grade_qwk", metrics.quadraticWeightedKappaGrade, global.quadraticWeightedKappaGrade);
  requireMetric("focus_field_completeness", metrics.focusFieldCompleteness, global.focusFieldCompleteness);
  requireMetric("grammar_site_agreement", metrics.grammarSiteAgreement, global.grammarSiteAgreement);
  requireMetric("blank_option_agreement", metrics.blankOptionAgreement, global.blankOptionAgreement);
  requireMetric("blank_axis_agreement", metrics.blankAxisAgreement, global.blankAxisAgreement);

  const each = DEFAULT_THRESHOLDS.eachBlock;
  for (const name of BLOCKS) {
    const current = metrics.block[name];
    requireMetric(
      `${name}_blind_solve_exact_agreement`,
      metrics.blockBlindSolveExactAgreement[name],
      each.blindSolveExactAgreement,
    );
    requireMetric(`${name}_exact_fatal`, current.exactFatalAgreement, each.exactFatalAgreement);
    requireMetric(`${name}_fatal_sensitivity`, current.fatalSensitivity, each.fatalSensitivity);
    requireMetric(`${name}_fatal_specificity`, current.fatalSpecificity, each.fatalSpecificity);
    requireMetric(`${name}_grade_qwk`, current.quadraticWeightedKappaGrade, each.quadraticWeightedKappaGrade);
    if (name !== "NONFOCUS") {
      requireMetric(
        `${name}_focus_field_completeness`,
        current.focusFieldCompleteness,
        each.focusFieldCompletenessWhenApplicable,
      );
    }
    if (name === "GRAMMAR") {
      requireMetric(
        "GRAMMAR_grammar_site_agreement",
        current.grammarSiteAgreement,
        each.grammarSiteAgreementWhenApplicable,
      );
    }
    if (name === "BLANK") {
      requireMetric(
        "BLANK_blank_option_agreement",
        current.blankOptionAgreement,
        each.blankOptionAgreementWhenApplicable,
      );
      requireMetric("BLANK_blank_axis_agreement", current.blankAxisAgreement, each.blankAxisAgreementWhenApplicable);
    }
  }
  return { pass: reasons.length === 0, reasonCodes: reasons };
}
