import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import * as boundaryModule from "../../../../src/lib/atlas-production-assignment-fetch-boundary.js";
import * as budgetModule from "../../../../src/lib/question-generation-assignment-budget.js";
import type { QuestionGenerationAssignmentDescriptor } from "../../../../src/lib/question-generation-assignment-budget-policy.js";
import * as prismaModule from "../../../../src/lib/prisma.js";

type JsonRecord = Record<string, unknown>;

const boundaryRuntime =
  (boundaryModule as unknown as { default?: typeof boundaryModule }).default ??
  boundaryModule;
const budgetRuntime =
  (budgetModule as unknown as { default?: typeof budgetModule }).default ??
  budgetModule;
const prismaRuntime =
  (prismaModule as unknown as { default?: typeof prismaModule }).default ??
  prismaModule;
const { createAtlasProductionAssignmentFetchDispatcher } = boundaryRuntime;
const {
  closeQuestionGenerationAssignmentBudget,
  runWithQuestionGenerationAssignmentBudget,
} = budgetRuntime;
const { prisma } = prismaRuntime;

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../../..");
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");
const parsedDatabaseUrl = new URL(databaseUrl);
if (
  !["127.0.0.1", "localhost", "::1"].includes(parsedDatabaseUrl.hostname) ||
  !parsedDatabaseUrl.pathname.slice(1).startsWith("qgen_budget_ephemeral_")
) {
  throw new Error(
    "Refusing to run outside a loopback qgen_budget_ephemeral_* database.",
  );
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as JsonRecord)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, stableValue(nested)]),
  );
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function stableHash(value: unknown): string {
  return sha256(JSON.stringify(stableValue(value)));
}

function sourceHash(relative: string): string {
  return sha256(readFileSync(join(root, relative)));
}

const provider = { order: ["Google"], allow_fallbacks: false };
const model = "google/gemini-3.5-flash";
const endpoint = "https://openrouter.ai/api/v1/chat/completions";

function descriptor(jobId: string): QuestionGenerationAssignmentDescriptor {
  return {
    jobId,
    route: "FAST",
    generationPlan: "STANDARD",
    questionType: "BLANK_INFERENCE",
    difficulty: "KILLER",
  };
}

function installPolicy(input: {
  descriptor: QuestionGenerationAssignmentDescriptor;
  mode: "AUDIT" | "SHADOW" | "CANARY_ENFORCE" | "ENFORCE";
  version: string;
  maxPhysicalCalls: number;
  maxReservedCostMicros?: number;
}): void {
  const now = new Date();
  const snapshotWithoutHash = {
    id: `${input.version}-price`,
    capturedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 10 * 60_000).toISOString(),
    endpointOrigin: "https://openrouter.ai",
    endpointPath: "/api/v1/chat/completions",
    providerRoutingHash: stableHash(provider),
    routingPriceCoverage: "PINNED_PROVIDER_SET_MAX",
    rates: {
      [model]: {
        inputUsdMicrosPerMillionTokens: 1_000_000,
        outputUsdMicrosPerMillionTokens: 2_000_000,
        fixedUsdMicrosPerRequest: 10,
        fixedInputTokenOverhead: 200,
      },
    },
  };
  const maxReservedCostMicros =
    input.maxReservedCostMicros ?? input.maxPhysicalCalls * 10_000;
  const policy = {
    version: input.version,
    ...(input.mode === "CANARY_ENFORCE" ? { canaryBasisPoints: 10_000 } : {}),
    priceSnapshot: {
      ...snapshotWithoutHash,
      hash: stableHash(snapshotWithoutHash),
    },
    cells: [
      {
        route: input.descriptor.route,
        generationPlan: input.descriptor.generationPlan,
        questionType: input.descriptor.questionType,
        difficulty: input.descriptor.difficulty,
        maxPhysicalCalls: input.maxPhysicalCalls,
        maxReservedCostMicros,
        perCallMaxReservedCostMicros: Math.min(
          10_000,
          maxReservedCostMicros,
        ),
        maxRequestBodyUtf8Bytes: 10_000,
        maxCompletionCount: 1,
      },
    ],
  };
  process.env.QUESTION_GENERATION_ASSIGNMENT_BUDGET_MODE = input.mode;
  process.env.QUESTION_GENERATION_ASSIGNMENT_BUDGET_POLICY_JSON =
    JSON.stringify(policy);
  process.env.QUESTION_GENERATION_ASSIGNMENT_BUDGET_POLICY_SHA256 =
    stableHash(policy);
}

function wireBody(maxTokens = 100, marker = ""): string {
  return JSON.stringify({
    model,
    messages: [
      {
        role: "user",
        content: `ephemeral PostgreSQL race probe ${marker}`.trim(),
      },
    ],
    max_tokens: maxTokens,
    n: 1,
    stream: false,
    provider,
    reasoning: { enabled: false, effort: "none", exclude: true },
  });
}

function response(): Response {
  return new Response(
    JSON.stringify({
      id: "local-ephemeral-generation",
      model,
      choices: [],
      usage: { cost: 0.0001 },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

async function insertJob(jobId: string): Promise<void> {
  await prisma.$executeRawUnsafe(
    `INSERT INTO "workbench_ai_jobs" ("id", "domain", "status", "deletedAt") VALUES ($1, 'QUESTION_GENERATION', 'PROCESSING', NULL)`,
    jobId,
  );
}

async function settleObservers(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 100));
}

const results: JsonRecord = {
  study: "production-assignment-budget-v1-postgres-integration",
  database: {
    hostClass: "loopback",
    namePrefix: "qgen_budget_ephemeral_",
  },
  tests: {},
  sourceHashes: {
    migration: sourceHash(
      "prisma/migrations/20260715000000_add_question_generation_call_budgets/migration.sql",
    ),
    boundary: sourceHash(
      "src/lib/atlas-production-assignment-fetch-boundary.ts",
    ),
    policy: sourceHash(
      "src/lib/question-generation-assignment-budget-policy.ts",
    ),
    runtime: sourceHash("src/lib/question-generation-assignment-budget.ts"),
    trigger: sourceHash("src/trigger/workbench-question-generation.ts"),
  },
};

try {
  const server = await prisma.$queryRawUnsafe<Array<{ version: string }>>(
    "SELECT version() AS version",
  );
  results.postgresVersion = server[0]?.version ?? "unknown";

  // 1) One durable assignment, 100 concurrent physical fetches, cap seven.
  const capJob = "pg-cap-100-way";
  const capDescriptor = descriptor(capJob);
  await insertJob(capJob);
  installPolicy({
    descriptor: capDescriptor,
    mode: "ENFORCE",
    version: "pg-cap-v1",
    maxPhysicalCalls: 7,
  });
  let capDelegates = 0;
  const capDispatcher = createAtlasProductionAssignmentFetchDispatcher(
    async () => {
      capDelegates += 1;
      return response();
    },
  );
  const capOutcomes = await runWithQuestionGenerationAssignmentBudget(
    capDescriptor,
    () =>
      Promise.allSettled(
        Array.from({ length: 100 }, () =>
          capDispatcher(endpoint, { method: "POST", body: wireBody() }),
        ),
      ),
  );
  await settleObservers();
  const capRows = await prisma.$queryRawUnsafe<
    Array<{
      leasedCalls: number;
      leaseRows: bigint;
      distinctOrdinals: bigint;
      minOrdinal: number;
      maxOrdinal: number;
    }>
  >(`
    SELECT
      b."leased_calls" AS "leasedCalls",
      COUNT(l."id") AS "leaseRows",
      COUNT(DISTINCT l."ordinal") AS "distinctOrdinals",
      MIN(l."ordinal") AS "minOrdinal",
      MAX(l."ordinal") AS "maxOrdinal"
    FROM "question_generation_call_budgets" b
    LEFT JOIN "question_generation_call_leases" l ON l."job_id" = b."job_id"
    WHERE b."job_id" = '${capJob}'
    GROUP BY b."leased_calls"
  `);
  const capFulfilled = capOutcomes.filter(
    (outcome) => outcome.status === "fulfilled",
  ).length;
  const capRejected = capOutcomes.length - capFulfilled;
  assert.equal(capDelegates, 7);
  assert.equal(capFulfilled, 7);
  assert.equal(capRejected, 93);
  assert.equal(capRows[0]?.leasedCalls, 7);
  assert.equal(capRows[0]?.leaseRows, BigInt(7));
  assert.equal(capRows[0]?.distinctOrdinals, BigInt(7));
  assert.equal(capRows[0]?.minOrdinal, 1);
  assert.equal(capRows[0]?.maxOrdinal, 7);
  (results.tests as JsonRecord).sameJob100Way = {
    verdict: "PASS",
    attempted: 100,
    delegated: capDelegates,
    rejected: capRejected,
    durableLeases: Number(capRows[0]?.leaseRows ?? 0),
    ordinalRange: [capRows[0]?.minOrdinal, capRows[0]?.maxOrdinal],
  };

  // 2) Mixed request sizes contend on the same USD reservation cap. The
  // physical cap is deliberately non-binding, so every rejection is monetary.
  const mixedJob = "pg-mixed-cost-cap";
  const mixedDescriptor = descriptor(mixedJob);
  await insertJob(mixedJob);
  installPolicy({
    descriptor: mixedDescriptor,
    mode: "ENFORCE",
    version: "pg-mixed-cost-v1",
    maxPhysicalCalls: 100,
    maxReservedCostMicros: 8_000,
  });
  let mixedDelegates = 0;
  const mixedDispatcher = createAtlasProductionAssignmentFetchDispatcher(
    async () => {
      mixedDelegates += 1;
      return response();
    },
  );
  const mixedOutcomes = await runWithQuestionGenerationAssignmentBudget(
    mixedDescriptor,
    async () => {
      // Prime both price classes, then contend the remaining capacity.
      await mixedDispatcher(endpoint, {
        method: "POST",
        body: wireBody(100, "small-primer"),
      });
      await mixedDispatcher(endpoint, {
        method: "POST",
        body: wireBody(1_000, "large-primer"),
      });
      return Promise.allSettled(
        Array.from({ length: 98 }, (_, index) =>
          mixedDispatcher(endpoint, {
            method: "POST",
            body: wireBody(
              index % 2 === 0 ? 100 : 1_000,
              `${index % 2 === 0 ? "small" : "large"}-${index}`,
            ),
          }),
        ),
      );
    },
  );
  const mixedBudget = await prisma.$queryRawUnsafe<
    Array<{
      leasedCalls: number;
      reservedCostMicros: bigint;
      maxReservedCostMicros: bigint;
      leaseRows: bigint;
      distinctReservationSizes: bigint;
    }>
  >(`
    SELECT
      b."leased_calls" AS "leasedCalls",
      b."reserved_cost_micros" AS "reservedCostMicros",
      b."max_reserved_cost_micros" AS "maxReservedCostMicros",
      COUNT(l."id") AS "leaseRows",
      COUNT(DISTINCT l."reserved_cost_micros") AS "distinctReservationSizes"
    FROM "question_generation_call_budgets" b
    LEFT JOIN "question_generation_call_leases" l ON l."job_id" = b."job_id"
    WHERE b."job_id" = '${mixedJob}'
    GROUP BY b."leased_calls", b."reserved_cost_micros", b."max_reserved_cost_micros"
  `);
  const mixedRejected = mixedOutcomes.filter(
    (outcome) => outcome.status === "rejected",
  ).length;
  assert.ok(mixedRejected > 0);
  assert.ok(mixedDelegates < 100);
  assert.equal(mixedBudget[0]?.leasedCalls, mixedDelegates);
  assert.equal(mixedBudget[0]?.leaseRows, BigInt(mixedDelegates));
  assert.ok(
    (mixedBudget[0]?.reservedCostMicros ?? BigInt(8_001)) <=
      (mixedBudget[0]?.maxReservedCostMicros ?? BigInt(0)),
  );
  assert.ok((mixedBudget[0]?.distinctReservationSizes ?? BigInt(0)) >= BigInt(2));
  (results.tests as JsonRecord).mixedReservedCost100Way = {
    verdict: "PASS",
    attempted: 100,
    concurrentPhase: 98,
    delegated: mixedDelegates,
    rejected: mixedRejected,
    physicalCap: 100,
    reservedCostMicros: Number(mixedBudget[0]?.reservedCostMicros ?? 0),
    maxReservedCostMicros: Number(
      mixedBudget[0]?.maxReservedCostMicros ?? 0,
    ),
    distinctReservationSizes: Number(
      mixedBudget[0]?.distinctReservationSizes ?? 0,
    ),
  };

  // 3) Re-entering the same job/policy creates a fresh controller but resumes
  // durable ordinals. The fifth lease is final and no ordinal is reclaimed.
  const continuationJob = "pg-ordinal-continuation";
  const continuationDescriptor = descriptor(continuationJob);
  await insertJob(continuationJob);
  installPolicy({
    descriptor: continuationDescriptor,
    mode: "ENFORCE",
    version: "pg-continuation-v1",
    maxPhysicalCalls: 5,
  });
  let continuationDelegates = 0;
  const continuationDispatcher =
    createAtlasProductionAssignmentFetchDispatcher(async () => {
      continuationDelegates += 1;
      return response();
    });
  for (let scopeIndex = 0; scopeIndex < 2; scopeIndex += 1) {
    await runWithQuestionGenerationAssignmentBudget(
      continuationDescriptor,
      async () => {
        await continuationDispatcher(endpoint, {
          method: "POST",
          body: wireBody(100, `scope-${scopeIndex}-a`),
        });
        await continuationDispatcher(endpoint, {
          method: "POST",
          body: wireBody(100, `scope-${scopeIndex}-b`),
        });
      },
    );
  }
  const continuationOutcomes =
    await runWithQuestionGenerationAssignmentBudget(
      continuationDescriptor,
      () =>
        Promise.allSettled(
          Array.from({ length: 10 }, (_, index) =>
            continuationDispatcher(endpoint, {
              method: "POST",
              body: wireBody(100, `final-${index}`),
            }),
          ),
        ),
    );
  const continuationOrdinals = await prisma.$queryRawUnsafe<
    Array<{ ordinal: number }>
  >(
    `SELECT "ordinal" FROM "question_generation_call_leases" WHERE "job_id" = $1 ORDER BY "ordinal"`,
    continuationJob,
  );
  assert.equal(continuationDelegates, 5);
  assert.deepEqual(
    continuationOrdinals.map((row) => row.ordinal),
    [1, 2, 3, 4, 5],
  );
  assert.equal(
    continuationOutcomes.filter((outcome) => outcome.status === "fulfilled")
      .length,
    1,
  );
  (results.tests as JsonRecord).ordinalContinuation = {
    verdict: "PASS",
    controllerScopes: 3,
    durableOrdinals: continuationOrdinals.map((row) => row.ordinal),
    delegated: continuationDelegates,
  };

  // 4) A terminal UPDATE that wins the Workbench row lock forbids dispatch.
  const terminalWinsJob = "pg-terminal-wins";
  const terminalWinsDescriptor = descriptor(terminalWinsJob);
  await insertJob(terminalWinsJob);
  installPolicy({
    descriptor: terminalWinsDescriptor,
    mode: "ENFORCE",
    version: "pg-terminal-wins-v1",
    maxPhysicalCalls: 3,
  });
  let terminalUpdated!: () => void;
  let releaseTerminal!: () => void;
  const terminalUpdatedSignal = new Promise<void>((resolveSignal) => {
    terminalUpdated = resolveSignal;
  });
  const releaseTerminalSignal = new Promise<void>((resolveSignal) => {
    releaseTerminal = resolveSignal;
  });
  const terminalTransaction = prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `UPDATE "workbench_ai_jobs" SET "status" = 'FAILED' WHERE "id" = $1`,
      terminalWinsJob,
    );
    terminalUpdated();
    await releaseTerminalSignal;
  });
  await terminalUpdatedSignal;
  let terminalWinsDelegates = 0;
  const terminalWinsDispatcher = createAtlasProductionAssignmentFetchDispatcher(
    async () => {
      terminalWinsDelegates += 1;
      return response();
    },
  );
  const terminalBlocked = Promise.resolve(
    runWithQuestionGenerationAssignmentBudget(terminalWinsDescriptor, () =>
      terminalWinsDispatcher(endpoint, { method: "POST", body: wireBody() }),
    ),
  );
  const earlyState = await Promise.race([
    terminalBlocked.then(
      () => "settled",
      () => "settled",
    ),
    new Promise<"waiting">((resolveSignal) =>
      setTimeout(() => resolveSignal("waiting"), 100),
    ),
  ]);
  assert.equal(earlyState, "waiting");
  assert.equal(terminalWinsDelegates, 0);
  releaseTerminal();
  await terminalTransaction;
  await assert.rejects(terminalBlocked, /JOB_NOT_ACTIVE/);
  assert.equal(terminalWinsDelegates, 0);
  (results.tests as JsonRecord).terminalWins = {
    verdict: "PASS",
    blockedWhileLockHeld: earlyState === "waiting",
    delegated: terminalWinsDelegates,
  };

  // 5) A committed lease may dispatch once; a later terminal state forbids the
  // next physical call under the same assignment scope.
  const leaseWinsJob = "pg-lease-wins";
  const leaseWinsDescriptor = descriptor(leaseWinsJob);
  await insertJob(leaseWinsJob);
  installPolicy({
    descriptor: leaseWinsDescriptor,
    mode: "ENFORCE",
    version: "pg-lease-wins-v1",
    maxPhysicalCalls: 3,
  });
  let leaseWinsDelegates = 0;
  const leaseWinsDispatcher = createAtlasProductionAssignmentFetchDispatcher(
    async () => {
      leaseWinsDelegates += 1;
      return response();
    },
  );
  await runWithQuestionGenerationAssignmentBudget(
    leaseWinsDescriptor,
    async () => {
      await leaseWinsDispatcher(endpoint, { method: "POST", body: wireBody() });
      await prisma.$executeRawUnsafe(
        `UPDATE "workbench_ai_jobs" SET "status" = 'FAILED' WHERE "id" = $1`,
        leaseWinsJob,
      );
      await assert.rejects(
        leaseWinsDispatcher(endpoint, { method: "POST", body: wireBody() }),
        /JOB_NOT_ACTIVE/,
      );
    },
  );
  assert.equal(leaseWinsDelegates, 1);
  const leaseWinsRows = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
    `SELECT COUNT(*) AS "count" FROM "question_generation_call_leases" WHERE "job_id" = $1`,
    leaseWinsJob,
  );
  assert.equal(leaseWinsRows[0]?.count, BigInt(1));
  (results.tests as JsonRecord).leaseWinsThenTerminal = {
    verdict: "PASS",
    delegatedBeforeTerminal: leaseWinsDelegates,
    durableLeases: Number(leaseWinsRows[0]?.count ?? 0),
    delegatedAfterTerminal: 0,
  };

  // 6) An existing enforcing row cannot silently fail open after policy/mode
  // drift makes the same job observational.
  const driftJob = "pg-policy-drift";
  const driftDescriptor = descriptor(driftJob);
  await insertJob(driftJob);
  installPolicy({
    descriptor: driftDescriptor,
    mode: "ENFORCE",
    version: "pg-drift-enforce-v1",
    maxPhysicalCalls: 3,
  });
  await runWithQuestionGenerationAssignmentBudget(driftDescriptor, () =>
    Promise.resolve("enrolled"),
  );
  installPolicy({
    descriptor: driftDescriptor,
    mode: "SHADOW",
    version: "pg-drift-shadow-v2",
    maxPhysicalCalls: 3,
  });
  let driftCallbacks = 0;
  await assert.rejects(
    Promise.resolve(
      runWithQuestionGenerationAssignmentBudget(driftDescriptor, () => {
        driftCallbacks += 1;
        return Promise.resolve("must-not-run");
      }),
    ),
    /POLICY_DRIFT/,
  );
  assert.equal(driftCallbacks, 0);
  (results.tests as JsonRecord).enforceToShadowDrift = {
    verdict: "PASS",
    unscopedCallbacks: driftCallbacks,
  };

  // 7) Apply-time table constraints reject illegal durable states.
  await assert.rejects(
    prisma.$executeRawUnsafe(
      `UPDATE "question_generation_call_budgets" SET "state" = 'BROKEN' WHERE "job_id" = $1`,
      capJob,
    ),
  );
  await assert.rejects(
    prisma.$executeRawUnsafe(
      `UPDATE "question_generation_call_leases" SET "state" = 'BROKEN' WHERE "job_id" = $1`,
      capJob,
    ),
  );
  (results.tests as JsonRecord).migrationStateConstraints = {
    verdict: "PASS",
    illegalBudgetStateRejected: true,
    illegalLeaseStateRejected: true,
  };

  for (const jobId of [
    capJob,
    mixedJob,
    continuationJob,
    terminalWinsJob,
    leaseWinsJob,
    driftJob,
  ]) {
    await closeQuestionGenerationAssignmentBudget(jobId).catch(() => undefined);
  }
  await settleObservers();

  results.verdict = "PASS";
  results.apiCalls = 0;
  results.externalNetworkCalls = 0;
  results.localPostgresOnly = true;
  results.productionDatabaseWrites = 0;
  if (process.argv.includes("--write")) {
    writeFileSync(join(here, "results.json"), `${JSON.stringify(results, null, 2)}\n`);
  }
  console.log(JSON.stringify(results, null, 2));
} finally {
  delete process.env.QUESTION_GENERATION_ASSIGNMENT_BUDGET_MODE;
  delete process.env.QUESTION_GENERATION_ASSIGNMENT_BUDGET_POLICY_JSON;
  delete process.env.QUESTION_GENERATION_ASSIGNMENT_BUDGET_POLICY_SHA256;
  await prisma.$disconnect();
}
