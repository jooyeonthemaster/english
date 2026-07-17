import assert from "node:assert/strict";
import test from "node:test";

import {
  CORPUS_V3_QUEUE_SPECS,
  FOCUS_QUEUE_SPECS,
  GENERAL_NEW_STRATUM_SPECS,
  QueueSizingError,
  binomialReachProbability,
  clopperPearsonLowerBound,
  conservativePassRate,
  minimumQueueSize,
  planQueueSize,
  requiredQueueSize,
  sizeCorpusV3Queues,
  sizeQueue,
} from "./queue-sizing";

function assertClose(actual: number, expected: number, tolerance = 1e-12): void {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`,
  );
}

function assertQueueError(
  action: () => unknown,
  expectedCode: QueueSizingError["code"],
): QueueSizingError {
  let caught: unknown;
  try {
    action();
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof QueueSizingError);
  assert.equal(caught.code, expectedCode);
  return caught;
}

test("exact binomial target probability handles known elementary cases", () => {
  assertClose(binomialReachProbability(3, 2, 0.5), 0.5);
  assertClose(binomialReachProbability(10, 1, 0.2), 1 - 0.8 ** 10);
  assert.equal(binomialReachProbability(4, 5, 0.9), 0);
  assert.equal(binomialReachProbability(0, 0, 0), 1);
});

test("focus observations use exact one-sided 95% Clopper-Pearson lower bounds", () => {
  // Independently reproducible as Beta.ppf(0.05, x, n - x + 1).
  assertClose(clopperPearsonLowerBound(19, 52), 0.2541665012621334);
  assertClose(clopperPearsonLowerBound(19, 45), 0.2969581120673509);
  assert.equal(clopperPearsonLowerBound(0, 52), 0);
  assertClose(clopperPearsonLowerBound(52, 52), 0.05 ** (1 / 52));
});

test("selector-facing helpers expose conservative rate, queue size, and aliases", () => {
  const lowerBound = conservativePassRate({ passed: 19, audited: 52 });
  assertClose(lowerBound, 0.2541665012621334);
  assert.equal(
    conservativePassRate({ passed: 0, audited: 0, zeroHistoryFloor: 0.2 }),
    0.2,
  );
  assert.equal(requiredQueueSize({ target: 66, passRate: lowerBound, assurance: 0.95 }), 307);

  const plan = planQueueSize(FOCUS_QUEUE_SPECS[0]);
  assert.equal(plan.lowerBound, plan.conservativePassRate);
  assert.equal(plan.queueSize, plan.requiredCandidates);
  assert.equal(plan.attainmentProbability, plan.achievedReachProbability);
  assertQueueError(
    () => conservativePassRate({ passed: 0, audited: 0 }),
    "ZERO_HISTORY_REQUIRES_FLOOR",
  );
});

test("focus target 66 queue calculations are frozen and genuinely minimal", () => {
  const plans = sizeCorpusV3Queues(FOCUS_QUEUE_SPECS);
  assert.deepEqual(
    plans.map((plan) => ({
      id: plan.id,
      target: plan.targetPasses,
      required: plan.requiredCandidates,
      reserve: plan.reserveCandidates,
    })),
    [
      { id: "focus-grammar-killer", target: 66, required: 307, reserve: 241 },
      { id: "focus-blank-killer", target: 66, required: 262, reserve: 196 },
    ],
  );
  assertClose(plans[0].achievedReachProbability, 0.9518051045012428);
  assertClose(plans[0].previousSizeReachProbability, 0.9485279200338969);
  assertClose(plans[1].achievedReachProbability, 0.9536749870460991);
  assertClose(plans[1].previousSizeReachProbability, 0.9498391924228783);
  for (const plan of plans) {
    assert.equal(plan.rateBasis.kind, "one-sided-clopper-pearson");
    assert.ok(plan.achievedReachProbability >= 0.95);
    assert.ok(plan.previousSizeReachProbability < 0.95);
  }
});

test("general origin x split strata use frozen v1 audit observations", () => {
  const plans = sizeCorpusV3Queues(GENERAL_NEW_STRATUM_SPECS);
  assert.deepEqual(
    plans.map((plan) => ({
      id: plan.id,
      target: plan.targetPasses,
      rate: plan.conservativePassRate,
      required: plan.requiredCandidates,
      reserve: plan.reserveCandidates,
    })),
    [
      { id: "general-dev-db", target: 23, rate: 0.19330842112059338, required: 158, reserve: 135 },
      { id: "general-dev-repo", target: 11, rate: 0.5700660661937071, required: 26, reserve: 15 },
      { id: "general-holdout-db", target: 29, rate: 0.04685482691460076, required: 815, reserve: 786 },
      { id: "general-holdout-repo", target: 12, rate: 0.5349272934296914, required: 30, reserve: 18 },
    ],
  );
  for (const plan of plans) {
    assert.equal(plan.rateBasis.kind, "one-sided-clopper-pearson");
    assert.ok(plan.achievedReachProbability >= 0.95);
    assert.ok(plan.previousSizeReachProbability < 0.95);
  }
});

test("an explicitly preregistered zero-history floor exposes sensitivity", () => {
  const plan = sizeQueue({
    id: "future-unobserved-stratum",
    targetPasses: 23,
    observation: { passed: 0, audited: 0 },
    zeroHistoryPolicy: {
      passRateFloor: 0.2,
      sensitivityRates: [0.1, 0.15, 0.2, 0.25, 0.3],
    },
  });
  assert.equal(plan.requiredCandidates, 153);
  assert.deepEqual(
    plan.sensitivity.map((point) => point.requiredCandidates),
    [310, 205, 153, 121, 100],
  );
  for (const point of plan.sensitivity) {
    assert.ok(point.targetReachProbability >= 0.95);
    assert.ok(
      binomialReachProbability(
        point.requiredCandidates - 1,
        plan.targetPasses,
        point.assumedPassRate,
      ) < 0.95,
    );
  }
});

test("zero observations without an explicit floor hard-fail", () => {
  assertQueueError(
    () =>
      sizeQueue({
        id: "unregistered-new-stratum",
        targetPasses: 4,
        observation: { passed: 0, audited: 0 },
      }),
    "ZERO_HISTORY_REQUIRES_FLOOR",
  );
});

test("an observed zero-success history hard-fails as statistically impossible", () => {
  const error = assertQueueError(
    () =>
      sizeQueue({
        id: "observed-zero-pass",
        targetPasses: 1,
        observation: { passed: 0, audited: 10 },
      }),
    "IMPOSSIBLE_RATE",
  );
  assert.equal(error.details.passProbability, 0);
});

test("supply one below the calculated queue hard-fails without shrinking it", () => {
  const base = GENERAL_NEW_STRATUM_SPECS[0];
  const error = assertQueueError(
    () => sizeQueue({ ...base, availableSupply: 157 }),
    "SUPPLY_SHORTAGE",
  );
  assert.deepEqual(error.details, {
    id: "general-dev-db",
    availableSupply: 157,
    requiredCandidates: 158,
    shortfall: 1,
  });
  assert.equal(sizeQueue({ ...base, availableSupply: 158 }).requiredCandidates, 158);
});

test("max queue and duplicate identifiers fail closed", () => {
  assertQueueError(() => minimumQueueSize(20, 0.2, 0.95, 20), "MAX_QUEUE_EXCEEDED");
  assertQueueError(
    () => sizeCorpusV3Queues([CORPUS_V3_QUEUE_SPECS[0], CORPUS_V3_QUEUE_SPECS[0]]),
    "INVALID_INPUT",
  );
});
