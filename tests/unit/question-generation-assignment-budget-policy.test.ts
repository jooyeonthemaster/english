import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  createQuestionGenerationAssignmentBudgetAuditFallback,
  readQuestionGenerationAssignmentBudgetAdmission,
  reserveQuestionGenerationAssignmentCallCost,
  type QuestionGenerationAssignmentDescriptor,
} from "../../src/lib/question-generation-assignment-budget-policy";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stable(value[key])]),
  );
}

function hash(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(stable(value)))
    .digest("hex");
}

const descriptor: QuestionGenerationAssignmentDescriptor = {
  jobId: "job-policy-test",
  route: "FAST",
  generationPlan: "STANDARD",
  questionType: "BLANK_INFERENCE",
  difficulty: "KILLER",
};

function policyFixture(now: Date) {
  const provider = { order: ["Google"], allow_fallbacks: false };
  const snapshotWithoutHash = {
    id: "price-20260715-1530-kst",
    capturedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 10 * 60_000).toISOString(),
    endpointOrigin: "https://openrouter.ai",
    endpointPath: "/api/v1/chat/completions",
    providerRoutingHash: hash(provider),
    routingPriceCoverage: "PINNED_PROVIDER_SET_MAX",
    rates: {
      "google/gemini-3.5-flash": {
        inputUsdMicrosPerMillionTokens: 1_000_000,
        outputUsdMicrosPerMillionTokens: 2_000_000,
        fixedUsdMicrosPerRequest: 10,
        fixedInputTokenOverhead: 200,
      },
    },
  };
  const policy = {
    version: "policy-v1",
    priceSnapshot: {
      ...snapshotWithoutHash,
      hash: hash(snapshotWithoutHash),
    },
    cells: [
      {
        route: descriptor.route,
        generationPlan: descriptor.generationPlan,
        questionType: descriptor.questionType,
        difficulty: descriptor.difficulty,
        maxPhysicalCalls: 7,
        maxReservedCostMicros: 70_000,
        perCallMaxReservedCostMicros: 10_000,
        maxRequestBodyUtf8Bytes: 10_000,
        maxCompletionCount: 1,
      },
    ],
  };
  return { provider, policy };
}

test("OFF and AUDIT require no capped policy JSON", () => {
  assert.deepEqual(
    readQuestionGenerationAssignmentBudgetAdmission(descriptor, {}),
    { mode: "OFF" },
  );
  const audit = readQuestionGenerationAssignmentBudgetAdmission(descriptor, {
    QUESTION_GENERATION_ASSIGNMENT_BUDGET_MODE: "AUDIT",
  });
  assert.equal(audit.mode, "AUDIT");
  assert.ok("maxPhysicalCalls" in audit);
  assert.equal(audit.maxPhysicalCalls, null);
  assert.equal(audit.priceSnapshot, null);
});

test("ENFORCE requires exact policy and price hashes and computes a conservative reservation", () => {
  const now = new Date("2026-07-15T06:30:00.000Z");
  const { provider, policy } = policyFixture(now);
  const admission = readQuestionGenerationAssignmentBudgetAdmission(
    descriptor,
    {
      QUESTION_GENERATION_ASSIGNMENT_BUDGET_MODE: "ENFORCE",
      QUESTION_GENERATION_ASSIGNMENT_BUDGET_POLICY_JSON: JSON.stringify(policy),
      QUESTION_GENERATION_ASSIGNMENT_BUDGET_POLICY_SHA256: hash(policy),
    },
    now,
  );
  assert.equal(admission.mode, "ENFORCE");
  assert.ok("maxPhysicalCalls" in admission);
  const reservation = reserveQuestionGenerationAssignmentCallCost(
    admission,
    {
      method: "POST",
      endpointOrigin: "https://openrouter.ai",
      endpointPath: "/api/v1/chat/completions",
      endpointHash: "a".repeat(64),
      wireBodyHash: "b".repeat(64),
      requestBodyUtf8Bytes: 500,
      model: "google/gemini-3.5-flash",
      completionCount: 1,
      outputTokenCap: 100,
      stream: false,
      textOnly: true,
      knownCostShape: true,
      providerRoutingHash: hash(provider),
      providerRoutingPinned: true,
      reasoningOff: true,
    },
    now,
  );
  // input=(500 bytes+200 hidden-token margin)*1 micro/token,
  // output=100*2 micro/token, plus fixed 10 micros.
  assert.equal(reservation, BigInt(910));
});

test("enforcement fails closed on stale price, route drift, reasoning, and output cap", () => {
  const now = new Date("2026-07-15T06:30:00.000Z");
  const { provider, policy } = policyFixture(now);
  const env = {
    QUESTION_GENERATION_ASSIGNMENT_BUDGET_MODE: "ENFORCE",
    QUESTION_GENERATION_ASSIGNMENT_BUDGET_POLICY_JSON: JSON.stringify(policy),
    QUESTION_GENERATION_ASSIGNMENT_BUDGET_POLICY_SHA256: hash(policy),
  };
  assert.throws(
    () =>
      readQuestionGenerationAssignmentBudgetAdmission(
        descriptor,
        env,
        new Date(now.getTime() + 16 * 60_000),
      ),
    /PRICE_SNAPSHOT_STALE/,
  );
  const admission = readQuestionGenerationAssignmentBudgetAdmission(
    descriptor,
    env,
    now,
  );
  assert.ok("maxPhysicalCalls" in admission);
  const base = {
    method: "POST" as const,
    endpointOrigin: "https://openrouter.ai",
    endpointPath: "/api/v1/chat/completions",
    endpointHash: "a".repeat(64),
    wireBodyHash: "b".repeat(64),
    requestBodyUtf8Bytes: 500,
    model: "google/gemini-3.5-flash",
    completionCount: 1,
    outputTokenCap: 100,
    stream: false as const,
    textOnly: true,
    knownCostShape: true,
    providerRoutingHash: hash(provider),
    providerRoutingPinned: true,
    reasoningOff: true,
  };
  assert.throws(
    () =>
      reserveQuestionGenerationAssignmentCallCost(
        admission,
        { ...base, providerRoutingHash: "c".repeat(64) },
        now,
      ),
    /PROVIDER_ROUTE_MISMATCH/,
  );
  assert.throws(
    () =>
      reserveQuestionGenerationAssignmentCallCost(
        admission,
        { ...base, reasoningOff: false },
        now,
      ),
    /REASONING_NOT_DISABLED/,
  );
  assert.throws(
    () =>
      reserveQuestionGenerationAssignmentCallCost(
        admission,
        { ...base, outputTokenCap: null },
        now,
      ),
    /OUTPUT_CAP_MISSING/,
  );
  assert.throws(
    () =>
      reserveQuestionGenerationAssignmentCallCost(
        admission,
        { ...base, knownCostShape: false },
        now,
      ),
    /WIRE_SHAPE_UNPRICED/,
  );
});

test("invalid SHADOW config can be converted to a durable AUDIT warning policy", () => {
  const fallback = createQuestionGenerationAssignmentBudgetAuditFallback(
    descriptor,
    "ASSIGNMENT_BUDGET_PRICE_HASH_MISMATCH",
  );
  assert.equal(fallback.mode, "AUDIT");
  assert.equal(
    fallback.configurationWarning,
    "ASSIGNMENT_BUDGET_PRICE_HASH_MISMATCH",
  );
  assert.equal(fallback.maxPhysicalCalls, null);
  assert.equal(fallback.policyHash.length, 64);
});

test("CANARY_ENFORCE leaves non-selected jobs observational even when the price is stale", () => {
  const now = new Date("2026-07-15T06:30:00.000Z");
  const { policy } = policyFixture(now);
  const canaryPolicy = { ...policy, canaryBasisPoints: 0 };
  const admission = readQuestionGenerationAssignmentBudgetAdmission(
    descriptor,
    {
      QUESTION_GENERATION_ASSIGNMENT_BUDGET_MODE: "CANARY_ENFORCE",
      QUESTION_GENERATION_ASSIGNMENT_BUDGET_POLICY_JSON:
        JSON.stringify(canaryPolicy),
      QUESTION_GENERATION_ASSIGNMENT_BUDGET_POLICY_SHA256: hash(canaryPolicy),
    },
    new Date(now.getTime() + 16 * 60_000),
  );
  assert.equal(admission.mode, "SHADOW");
  assert.ok("configurationWarning" in admission);
  assert.equal(admission.configurationWarning, null);
});

test("CANARY_ENFORCE converts invalid policy detail to AUDIT only for non-selected jobs", () => {
  const now = new Date("2026-07-15T06:30:00.000Z");
  const { policy } = policyFixture(now);
  policy.priceSnapshot.hash = "0".repeat(64);

  const nonSelected = { ...policy, canaryBasisPoints: 0 };
  const fallback = readQuestionGenerationAssignmentBudgetAdmission(
    descriptor,
    {
      QUESTION_GENERATION_ASSIGNMENT_BUDGET_MODE: "CANARY_ENFORCE",
      QUESTION_GENERATION_ASSIGNMENT_BUDGET_POLICY_JSON:
        JSON.stringify(nonSelected),
      QUESTION_GENERATION_ASSIGNMENT_BUDGET_POLICY_SHA256: hash(nonSelected),
    },
    now,
  );
  assert.equal(fallback.mode, "AUDIT");
  assert.ok("configurationWarning" in fallback);
  assert.equal(
    fallback.configurationWarning,
    "ASSIGNMENT_BUDGET_PRICE_HASH_MISMATCH",
  );

  const selected = { ...policy, canaryBasisPoints: 10_000 };
  assert.throws(
    () =>
      readQuestionGenerationAssignmentBudgetAdmission(
        descriptor,
        {
          QUESTION_GENERATION_ASSIGNMENT_BUDGET_MODE: "CANARY_ENFORCE",
          QUESTION_GENERATION_ASSIGNMENT_BUDGET_POLICY_JSON:
            JSON.stringify(selected),
          QUESTION_GENERATION_ASSIGNMENT_BUDGET_POLICY_SHA256: hash(selected),
        },
        now,
      ),
    /PRICE_HASH_MISMATCH/,
  );
});

test("price snapshot rejects a non-SHA provider routing hash", () => {
  const now = new Date("2026-07-15T06:30:00.000Z");
  const { policy } = policyFixture(now);
  policy.priceSnapshot.providerRoutingHash = "not-a-sha";
  const snapshotWithoutHash = Object.fromEntries(
    Object.entries(policy.priceSnapshot).filter(([key]) => key !== "hash"),
  );
  policy.priceSnapshot.hash = hash(snapshotWithoutHash);
  assert.throws(
    () =>
      readQuestionGenerationAssignmentBudgetAdmission(
        descriptor,
        {
          QUESTION_GENERATION_ASSIGNMENT_BUDGET_MODE: "ENFORCE",
          QUESTION_GENERATION_ASSIGNMENT_BUDGET_POLICY_JSON:
            JSON.stringify(policy),
          QUESTION_GENERATION_ASSIGNMENT_BUDGET_POLICY_SHA256: hash(policy),
        },
        now,
      ),
    /providerRoutingHash must be SHA-256/,
  );
});

test("automatic router routing is accepted only with an all-upstreams maximum attestation", () => {
  const now = new Date("2026-07-15T06:30:00.000Z");
  const { policy } = policyFixture(now);
  policy.priceSnapshot.routingPriceCoverage = "ALL_ROUTER_UPSTREAMS_MAX";
  policy.priceSnapshot.providerRoutingHash = hash(null);
  const snapshotWithoutHash = Object.fromEntries(
    Object.entries(policy.priceSnapshot).filter(([key]) => key !== "hash"),
  );
  policy.priceSnapshot.hash = hash(snapshotWithoutHash);
  const admission = readQuestionGenerationAssignmentBudgetAdmission(
    descriptor,
    {
      QUESTION_GENERATION_ASSIGNMENT_BUDGET_MODE: "ENFORCE",
      QUESTION_GENERATION_ASSIGNMENT_BUDGET_POLICY_JSON: JSON.stringify(policy),
      QUESTION_GENERATION_ASSIGNMENT_BUDGET_POLICY_SHA256: hash(policy),
    },
    now,
  );
  assert.ok("maxPhysicalCalls" in admission);
  assert.doesNotThrow(() =>
    reserveQuestionGenerationAssignmentCallCost(
      admission,
      {
        method: "POST",
        endpointOrigin: "https://openrouter.ai",
        endpointPath: "/api/v1/chat/completions",
        endpointHash: "a".repeat(64),
        wireBodyHash: "b".repeat(64),
        requestBodyUtf8Bytes: 500,
        model: "google/gemini-3.5-flash",
        completionCount: 1,
        outputTokenCap: 100,
        stream: false,
        textOnly: true,
        knownCostShape: true,
        providerRoutingHash: hash(null),
        providerRoutingPinned: false,
        reasoningOff: true,
      },
      now,
    ),
  );
});
