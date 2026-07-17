/**
 * Deterministic corpus-v3 candidate-queue sizing.
 *
 * Design contract (preregister before any v3 audit outcomes are inspected):
 * - A stratum with observations uses the exact one-sided 95% Clopper-Pearson
 *   lower confidence bound, never its raw pass rate.
 * - A brand-new stratum cannot manufacture a confidence interval. It uses the
 *   explicitly declared 20% planning floor and reports 10/15/20/25/30%
 *   sensitivity. The 20% value is an assumption, not empirical evidence.
 * - The queue is the smallest n for which Binomial(n, conservativeRate) reaches
 *   the target with probability >= 0.95. Merely dividing target by a point
 *   estimate is deliberately forbidden.
 * - Supply is checked only after the unconstrained requirement is calculated,
 *   so a short pool fails loudly instead of silently weakening the guarantee.
 *
 * This module is pure: it performs no I/O, API calls, randomness, or DB access.
 */

export const ONE_SIDED_CONFIDENCE = 0.95;
export const REQUIRED_TARGET_REACH_PROBABILITY = 0.95;
export const ZERO_HISTORY_PASS_RATE_FLOOR = 0.2;
export const ZERO_HISTORY_SENSITIVITY = [0.1, 0.15, 0.2, 0.25, 0.3] as const;

const DEFAULT_MAX_QUEUE = 1_000_000;

export type QueueSizingErrorCode =
  | "INVALID_INPUT"
  | "ZERO_HISTORY_REQUIRES_FLOOR"
  | "IMPOSSIBLE_RATE"
  | "MAX_QUEUE_EXCEEDED"
  | "SUPPLY_SHORTAGE";

export class QueueSizingError extends Error {
  readonly code: QueueSizingErrorCode;
  readonly details: Readonly<Record<string, number | string>>;

  constructor(
    code: QueueSizingErrorCode,
    message: string,
    details: Readonly<Record<string, number | string>> = {},
  ) {
    super(message);
    this.name = "QueueSizingError";
    this.code = code;
    this.details = details;
  }
}

export interface HistoricalPassObservation {
  readonly passed: number;
  readonly audited: number;
}

export interface ZeroHistoryPolicy {
  /** Precommitted planning assumption; it is not a statistical lower bound. */
  readonly passRateFloor: number;
  readonly sensitivityRates: readonly number[];
}

export interface QueuePlanSpec {
  readonly id: string;
  readonly targetPasses: number;
  readonly observation: HistoricalPassObservation;
  /** Required exactly when observation.audited === 0. */
  readonly zeroHistoryPolicy?: ZeroHistoryPolicy;
  readonly confidence?: number;
  readonly requiredReachProbability?: number;
  readonly availableSupply?: number;
  readonly maxQueue?: number;
}

export interface QueueSensitivityPoint {
  readonly assumedPassRate: number;
  readonly requiredCandidates: number;
  readonly reserveCandidates: number;
  readonly targetReachProbability: number;
}

export interface QueuePlan {
  readonly id: string;
  readonly targetPasses: number;
  readonly requiredCandidates: number;
  readonly reserveCandidates: number;
  readonly conservativePassRate: number;
  readonly rateBasis:
    | {
        readonly kind: "one-sided-clopper-pearson";
        readonly confidence: number;
        readonly passed: number;
        readonly audited: number;
      }
    | {
        readonly kind: "zero-history-explicit-floor";
        readonly passRateFloor: number;
      };
  readonly requiredReachProbability: number;
  readonly achievedReachProbability: number;
  readonly previousSizeReachProbability: number;
  readonly sensitivity: readonly QueueSensitivityPoint[];
}

export interface ConservativePassRateInput {
  readonly passed: number;
  readonly audited: number;
  readonly confidence?: number;
  /** Mandatory only when audited is zero. */
  readonly zeroHistoryFloor?: number;
}

export interface RequiredQueueSizeInput {
  readonly target: number;
  readonly passRate: number;
  readonly assurance?: number;
  readonly maxQueue?: number;
}

export type SelectorQueuePlan = QueuePlan & {
  /** Selector-friendly aliases; the canonical QueuePlan fields remain present. */
  readonly lowerBound: number;
  readonly queueSize: number;
  readonly attainmentProbability: number;
};

/** Focus queues retain the only eligible strict historical observations. */
export const FOCUS_QUEUE_SPECS = [
  {
    id: "focus-grammar-killer",
    targetPasses: 66,
    observation: { passed: 19, audited: 52 },
  },
  {
    id: "focus-blank-killer",
    targetPasses: 66,
    observation: { passed: 19, audited: 45 },
  },
] as const satisfies readonly QueuePlanSpec[];

/**
 * General origin x split strata reuse only the frozen v1 two-rater audit
 * observations.  The v3 target is new, but the stratum is not unobserved.
 * Keeping each origin/split separate prevents an abundant origin from masking
 * the low-yield DB holdout stratum.
 */
export const GENERAL_NEW_STRATUM_SPECS = [
  {
    id: "general-dev-db",
    targetPasses: 23,
    observation: { passed: 10, audited: 30 },
  },
  {
    id: "general-dev-repo",
    targetPasses: 11,
    observation: { passed: 22, audited: 30 },
  },
  {
    id: "general-holdout-db",
    targetPasses: 29,
    observation: { passed: 4, audited: 30 },
  },
  {
    id: "general-holdout-repo",
    targetPasses: 12,
    observation: { passed: 21, audited: 30 },
  },
] as const satisfies readonly QueuePlanSpec[];

export const CORPUS_V3_QUEUE_SPECS = [
  ...FOCUS_QUEUE_SPECS,
  ...GENERAL_NEW_STRATUM_SPECS,
] as const satisfies readonly QueuePlanSpec[];

function assertIntegerAtLeast(value: number, minimum: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new QueueSizingError("INVALID_INPUT", `${label} must be a safe integer >= ${minimum}`, {
      [label]: value,
    });
  }
}

function assertOpenProbability(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0 || value >= 1) {
    throw new QueueSizingError("INVALID_INPUT", `${label} must be strictly between 0 and 1`, {
      [label]: value,
    });
  }
}

function assertClosedProbability(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new QueueSizingError("INVALID_INPUT", `${label} must be between 0 and 1`, {
      [label]: value,
    });
  }
}

// Lanczos log-gamma and the standard continued fraction keep the exact-binomial
// calculation stable for queues much larger than the v3 preregistered sizes.
function logGamma(value: number): number {
  const coefficients = [
    676.5203681218851,
    -1259.1392167224028,
    771.3234287776531,
    -176.6150291621406,
    12.507343278686905,
    -0.13857109526572012,
    9.984369578019572e-6,
    1.5056327351493116e-7,
  ];

  if (value < 0.5) {
    return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * value)) - logGamma(1 - value);
  }

  const shifted = value - 1;
  let series = 0.9999999999998099;
  for (let index = 0; index < coefficients.length; index += 1) {
    series += coefficients[index] / (shifted + index + 1);
  }
  const scale = shifted + coefficients.length - 0.5;
  return (
    0.5 * Math.log(2 * Math.PI) +
    (shifted + 0.5) * Math.log(scale) -
    scale +
    Math.log(series)
  );
}

function betaContinuedFraction(a: number, b: number, x: number): number {
  const maxIterations = 300;
  const convergence = 3e-14;
  const minimum = 1e-300;
  const total = a + b;
  const aPlusOne = a + 1;
  const aMinusOne = a - 1;
  let c = 1;
  let d = 1 - (total * x) / aPlusOne;
  d = Math.abs(d) < minimum ? minimum : d;
  d = 1 / d;
  let fraction = d;

  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    const twice = 2 * iteration;
    let coefficient =
      (iteration * (b - iteration) * x) /
      ((aMinusOne + twice) * (a + twice));
    d = 1 + coefficient * d;
    d = Math.abs(d) < minimum ? minimum : d;
    c = 1 + coefficient / c;
    c = Math.abs(c) < minimum ? minimum : c;
    d = 1 / d;
    fraction *= d * c;

    coefficient =
      (-(a + iteration) * (total + iteration) * x) /
      ((a + twice) * (aPlusOne + twice));
    d = 1 + coefficient * d;
    d = Math.abs(d) < minimum ? minimum : d;
    c = 1 + coefficient / c;
    c = Math.abs(c) < minimum ? minimum : c;
    d = 1 / d;
    const delta = d * c;
    fraction *= delta;
    if (Math.abs(delta - 1) <= convergence) return fraction;
  }

  throw new QueueSizingError("INVALID_INPUT", "incomplete-beta calculation did not converge", {
    a,
    b,
    x,
  });
}

function regularizedIncompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const logScale =
    logGamma(a + b) -
    logGamma(a) -
    logGamma(b) +
    a * Math.log(x) +
    b * Math.log1p(-x);
  const scale = Math.exp(logScale);
  const result =
    x < (a + 1) / (a + b + 2)
      ? (scale * betaContinuedFraction(a, b, x)) / a
      : 1 - (scale * betaContinuedFraction(b, a, 1 - x)) / b;
  return Math.min(1, Math.max(0, result));
}

/** Exact Binomial(n, p) probability of obtaining at least targetPasses. */
export function binomialReachProbability(
  trials: number,
  targetPasses: number,
  passProbability: number,
): number {
  assertIntegerAtLeast(trials, 0, "trials");
  assertIntegerAtLeast(targetPasses, 0, "targetPasses");
  assertClosedProbability(passProbability, "passProbability");
  if (targetPasses === 0) return 1;
  if (targetPasses > trials || passProbability === 0) return 0;
  if (passProbability === 1) return 1;
  return regularizedIncompleteBeta(
    passProbability,
    targetPasses,
    trials - targetPasses + 1,
  );
}

/** Exact one-sided Clopper-Pearson lower confidence bound. */
export function clopperPearsonLowerBound(
  passed: number,
  audited: number,
  confidence = ONE_SIDED_CONFIDENCE,
): number {
  assertIntegerAtLeast(audited, 1, "audited");
  assertIntegerAtLeast(passed, 0, "passed");
  if (passed > audited) {
    throw new QueueSizingError("INVALID_INPUT", "passed cannot exceed audited", {
      passed,
      audited,
    });
  }
  assertOpenProbability(confidence, "confidence");
  if (passed === 0) return 0;

  const alpha = 1 - confidence;
  let lower = 0;
  let upper = 1;
  for (let iteration = 0; iteration < 100; iteration += 1) {
    const candidate = (lower + upper) / 2;
    const tail = binomialReachProbability(audited, passed, candidate);
    if (tail < alpha) lower = candidate;
    else upper = candidate;
  }
  return (lower + upper) / 2;
}

/**
 * Selector-facing conservative rate helper. Observed strata always use the
 * one-sided exact bound; only a truly unobserved stratum may use an explicit
 * floor.
 */
export function conservativePassRate(input: ConservativePassRateInput): number {
  assertIntegerAtLeast(input.audited, 0, "audited");
  assertIntegerAtLeast(input.passed, 0, "passed");
  if (input.passed > input.audited) {
    throw new QueueSizingError("INVALID_INPUT", "passed cannot exceed audited", {
      passed: input.passed,
      audited: input.audited,
    });
  }
  if (input.audited > 0) {
    return clopperPearsonLowerBound(
      input.passed,
      input.audited,
      input.confidence ?? ONE_SIDED_CONFIDENCE,
    );
  }
  if (input.zeroHistoryFloor === undefined) {
    throw new QueueSizingError(
      "ZERO_HISTORY_REQUIRES_FLOOR",
      "a zero-history stratum requires an explicit preregistered pass-rate floor",
    );
  }
  assertOpenProbability(input.zeroHistoryFloor, "zeroHistoryFloor");
  return input.zeroHistoryFloor;
}

/** Smallest queue n whose exact binomial target-reach probability meets q. */
export function minimumQueueSize(
  targetPasses: number,
  passProbability: number,
  requiredReachProbability = REQUIRED_TARGET_REACH_PROBABILITY,
  maxQueue = DEFAULT_MAX_QUEUE,
): number {
  assertIntegerAtLeast(targetPasses, 0, "targetPasses");
  assertClosedProbability(passProbability, "passProbability");
  assertOpenProbability(requiredReachProbability, "requiredReachProbability");
  assertIntegerAtLeast(maxQueue, 0, "maxQueue");
  if (targetPasses === 0) return 0;
  if (passProbability === 0) {
    throw new QueueSizingError(
      "IMPOSSIBLE_RATE",
      "a positive target is impossible at a zero conservative pass rate",
      { targetPasses, passProbability },
    );
  }
  if (maxQueue < targetPasses) {
    throw new QueueSizingError("MAX_QUEUE_EXCEEDED", "maxQueue is smaller than the target", {
      targetPasses,
      maxQueue,
    });
  }

  let lower = targetPasses;
  let upper = targetPasses;
  while (
    upper < maxQueue &&
    binomialReachProbability(upper, targetPasses, passProbability) < requiredReachProbability
  ) {
    lower = upper + 1;
    upper = Math.min(maxQueue, upper * 2);
  }
  if (
    binomialReachProbability(upper, targetPasses, passProbability) < requiredReachProbability
  ) {
    throw new QueueSizingError(
      "MAX_QUEUE_EXCEEDED",
      "no queue within maxQueue reaches the required probability",
      { targetPasses, passProbability, requiredReachProbability, maxQueue },
    );
  }

  let left = Math.min(lower, upper);
  let right = upper;
  while (left < right) {
    const middle = Math.floor((left + right) / 2);
    if (
      binomialReachProbability(middle, targetPasses, passProbability) >= requiredReachProbability
    ) {
      right = middle;
    } else {
      left = middle + 1;
    }
  }
  return left;
}

/** Selector-facing named-argument wrapper around minimumQueueSize. */
export function requiredQueueSize(input: RequiredQueueSizeInput): number {
  return minimumQueueSize(
    input.target,
    input.passRate,
    input.assurance ?? REQUIRED_TARGET_REACH_PROBABILITY,
    input.maxQueue ?? DEFAULT_MAX_QUEUE,
  );
}

function sensitivityPoint(
  targetPasses: number,
  passRate: number,
  requiredReachProbability: number,
  maxQueue: number,
): QueueSensitivityPoint {
  const requiredCandidates = minimumQueueSize(
    targetPasses,
    passRate,
    requiredReachProbability,
    maxQueue,
  );
  return {
    assumedPassRate: passRate,
    requiredCandidates,
    reserveCandidates: requiredCandidates - targetPasses,
    targetReachProbability: binomialReachProbability(
      requiredCandidates,
      targetPasses,
      passRate,
    ),
  };
}

export function sizeQueue(spec: QueuePlanSpec): QueuePlan {
  if (!spec.id.trim()) {
    throw new QueueSizingError("INVALID_INPUT", "id must not be empty");
  }
  assertIntegerAtLeast(spec.targetPasses, 0, "targetPasses");
  assertIntegerAtLeast(spec.observation.audited, 0, "audited");
  assertIntegerAtLeast(spec.observation.passed, 0, "passed");
  if (spec.observation.passed > spec.observation.audited) {
    throw new QueueSizingError("INVALID_INPUT", "passed cannot exceed audited", {
      passed: spec.observation.passed,
      audited: spec.observation.audited,
    });
  }

  const confidence = spec.confidence ?? ONE_SIDED_CONFIDENCE;
  const requiredReachProbability =
    spec.requiredReachProbability ?? REQUIRED_TARGET_REACH_PROBABILITY;
  const maxQueue = spec.maxQueue ?? DEFAULT_MAX_QUEUE;
  assertOpenProbability(confidence, "confidence");
  assertOpenProbability(requiredReachProbability, "requiredReachProbability");
  assertIntegerAtLeast(maxQueue, 0, "maxQueue");

  let conservativePassRate: number;
  let rateBasis: QueuePlan["rateBasis"];
  let sensitivity: readonly QueueSensitivityPoint[] = [];

  if (spec.observation.audited > 0) {
    conservativePassRate = clopperPearsonLowerBound(
      spec.observation.passed,
      spec.observation.audited,
      confidence,
    );
    rateBasis = {
      kind: "one-sided-clopper-pearson",
      confidence,
      passed: spec.observation.passed,
      audited: spec.observation.audited,
    };
  } else {
    const policy = spec.zeroHistoryPolicy;
    if (!policy) {
      throw new QueueSizingError(
        "ZERO_HISTORY_REQUIRES_FLOOR",
        "a zero-history stratum requires an explicit preregistered pass-rate floor",
        { id: spec.id },
      );
    }
    assertOpenProbability(policy.passRateFloor, "passRateFloor");
    const uniqueSensitivityRates = [...new Set(policy.sensitivityRates)].sort((a, b) => a - b);
    for (const passRate of uniqueSensitivityRates) {
      assertOpenProbability(passRate, "sensitivityRate");
    }
    if (!uniqueSensitivityRates.some((rate) => rate === policy.passRateFloor)) {
      throw new QueueSizingError(
        "INVALID_INPUT",
        "sensitivityRates must include the selected passRateFloor",
        { passRateFloor: policy.passRateFloor },
      );
    }
    conservativePassRate = policy.passRateFloor;
    rateBasis = {
      kind: "zero-history-explicit-floor",
      passRateFloor: policy.passRateFloor,
    };
    sensitivity = uniqueSensitivityRates.map((passRate) =>
      sensitivityPoint(
        spec.targetPasses,
        passRate,
        requiredReachProbability,
        maxQueue,
      ),
    );
  }

  const requiredCandidates = minimumQueueSize(
    spec.targetPasses,
    conservativePassRate,
    requiredReachProbability,
    maxQueue,
  );
  if (spec.availableSupply !== undefined) {
    assertIntegerAtLeast(spec.availableSupply, 0, "availableSupply");
    if (spec.availableSupply < requiredCandidates) {
      throw new QueueSizingError(
        "SUPPLY_SHORTAGE",
        `${spec.id} has ${spec.availableSupply} candidates but requires ${requiredCandidates}`,
        {
          id: spec.id,
          availableSupply: spec.availableSupply,
          requiredCandidates,
          shortfall: requiredCandidates - spec.availableSupply,
        },
      );
    }
  }

  return {
    id: spec.id,
    targetPasses: spec.targetPasses,
    requiredCandidates,
    reserveCandidates: requiredCandidates - spec.targetPasses,
    conservativePassRate,
    rateBasis,
    requiredReachProbability,
    achievedReachProbability: binomialReachProbability(
      requiredCandidates,
      spec.targetPasses,
      conservativePassRate,
    ),
    previousSizeReachProbability:
      requiredCandidates === 0
        ? 0
        : binomialReachProbability(
            requiredCandidates - 1,
            spec.targetPasses,
            conservativePassRate,
          ),
    sensitivity,
  };
}

/** QueuePlan with concise aliases expected by the v3 selector. */
export function planQueueSize(spec: QueuePlanSpec): SelectorQueuePlan {
  const plan = sizeQueue(spec);
  return {
    ...plan,
    lowerBound: plan.conservativePassRate,
    queueSize: plan.requiredCandidates,
    attainmentProbability: plan.achievedReachProbability,
  };
}

export function sizeCorpusV3Queues(
  specs: readonly QueuePlanSpec[] = CORPUS_V3_QUEUE_SPECS,
): readonly QueuePlan[] {
  const ids = new Set<string>();
  return specs.map((spec) => {
    if (ids.has(spec.id)) {
      throw new QueueSizingError("INVALID_INPUT", `duplicate queue id: ${spec.id}`, {
        id: spec.id,
      });
    }
    ids.add(spec.id);
    return sizeQueue(spec);
  });
}
