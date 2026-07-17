import { randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";

import {
  QUESTION_GENERATION_ASSIGNMENT_BUDGET_EXHAUSTED,
  QuestionGenerationAssignmentBudgetError,
  runWithAtlasProductionAssignmentScope,
  type AtlasProductionAssignmentFetchController,
  type AtlasProductionCallLease,
  type AtlasProductionErrorEvidence,
  type AtlasProductionLeaseRequest,
  type AtlasProductionResponseEvidence,
} from "@/lib/atlas-production-assignment-fetch-boundary";
import {
  QUESTION_GENERATION_ASSIGNMENT_PRICE_MAX_AGE_MS,
  createQuestionGenerationAssignmentBudgetAuditFallback,
  readQuestionGenerationAssignmentBudgetAdmission,
  reserveQuestionGenerationAssignmentCallCost,
  type ActiveQuestionGenerationAssignmentBudgetPolicy,
  type QuestionGenerationAssignmentBudgetAdmission,
  type QuestionGenerationAssignmentDescriptor,
} from "@/lib/question-generation-assignment-budget-policy";
import { prisma } from "@/lib/prisma";

interface BudgetRow {
  jobId: string;
  policyVersion: string;
  policyHash: string;
  descriptorHash: string;
  mode: string;
  state: string;
  maxPhysicalCalls: number | null;
  leasedCalls: number;
  maxReservedCostMicros: bigint | null;
  reservedCostMicros: bigint;
  priceSnapshotId: string | null;
  priceSnapshotHash: string | null;
}

function persistedPolicySnapshot(
  policy: Readonly<ActiveQuestionGenerationAssignmentBudgetPolicy>,
): string {
  const snapshot = policy.priceSnapshot;
  return JSON.stringify({
    mode: policy.mode,
    policyVersion: policy.policyVersion,
    policyHash: policy.policyHash,
    descriptorHash: policy.descriptorHash,
    maxPhysicalCalls: policy.maxPhysicalCalls,
    maxReservedCostMicros: policy.maxReservedCostMicros?.toString() ?? null,
    perCallMaxReservedCostMicros:
      policy.perCallMaxReservedCostMicros?.toString() ?? null,
    maxRequestBodyUtf8Bytes: policy.maxRequestBodyUtf8Bytes,
    maxCompletionCount: policy.maxCompletionCount,
    configurationWarning: policy.configurationWarning,
    priceSnapshot: snapshot
      ? {
          id: snapshot.id,
          hash: snapshot.hash,
          capturedAt: snapshot.capturedAt.toISOString(),
          expiresAt: snapshot.expiresAt.toISOString(),
          endpointOrigin: snapshot.endpointOrigin,
          endpointPath: snapshot.endpointPath,
          providerRoutingHash: snapshot.providerRoutingHash,
          routingPriceCoverage: snapshot.routingPriceCoverage,
          rates: Object.fromEntries(
            Object.entries(snapshot.rates).map(([model, rate]) => [
              model,
              {
                inputUsdMicrosPerMillionTokens:
                  rate.inputUsdMicrosPerMillionTokens.toString(),
                outputUsdMicrosPerMillionTokens:
                  rate.outputUsdMicrosPerMillionTokens.toString(),
                fixedUsdMicrosPerRequest:
                  rate.fixedUsdMicrosPerRequest.toString(),
                fixedInputTokenOverhead: rate.fixedInputTokenOverhead.toString(),
              },
            ]),
          ),
        }
      : null,
  });
}

interface LeaseOrdinalRow {
  ordinal: number;
  reservedCostMicros: bigint;
}

function sameBigInt(left: bigint | null, right: bigint | null): boolean {
  return left === right;
}

function assertPersistedPolicyMatches(
  row: BudgetRow,
  policy: Readonly<ActiveQuestionGenerationAssignmentBudgetPolicy>,
): void {
  const snapshot = policy.priceSnapshot;
  if (row.state !== "ACTIVE") {
    throw new QuestionGenerationAssignmentBudgetError(
      "QUESTION_GENERATION_ASSIGNMENT_BUDGET_JOB_NOT_ACTIVE",
      "the assignment budget is closed",
    );
  }
  if (
    row.policyVersion !== policy.policyVersion ||
    row.policyHash !== policy.policyHash ||
    row.descriptorHash !== policy.descriptorHash ||
    row.mode !== policy.mode ||
    row.maxPhysicalCalls !== policy.maxPhysicalCalls ||
    !sameBigInt(row.maxReservedCostMicros, policy.maxReservedCostMicros) ||
    row.priceSnapshotId !== (snapshot?.id ?? null) ||
    row.priceSnapshotHash !== (snapshot?.hash ?? null)
  ) {
    throw new QuestionGenerationAssignmentBudgetError(
      "QUESTION_GENERATION_ASSIGNMENT_BUDGET_POLICY_DRIFT",
      "an existing job budget cannot be changed after enrollment",
    );
  }
}

async function ensureDurableBudget(
  jobId: string,
  policy: Readonly<ActiveQuestionGenerationAssignmentBudgetPolicy>,
): Promise<void> {
  const snapshot = policy.priceSnapshot;
  const policySnapshot = persistedPolicySnapshot(policy);
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "question_generation_call_budgets" (
        "job_id",
        "policy_version",
        "policy_hash",
        "descriptor_hash",
        "mode",
        "state",
        "policy_snapshot",
        "max_physical_calls",
        "leased_calls",
        "max_reserved_cost_micros",
        "reserved_cost_micros",
        "observed_cost_micros",
        "price_snapshot_id",
        "price_snapshot_hash",
        "created_at",
        "updated_at"
      )
      SELECT
        ${jobId},
        ${policy.policyVersion},
        ${policy.policyHash},
        ${policy.descriptorHash},
        ${policy.mode},
        'ACTIVE',
        CAST(${policySnapshot} AS JSONB),
        ${policy.maxPhysicalCalls},
        0,
        ${policy.maxReservedCostMicros},
        0,
        0,
        ${snapshot?.id ?? null},
        ${snapshot?.hash ?? null},
        NOW(),
        NOW()
      FROM "workbench_ai_jobs" AS job
      WHERE
        job."id" = ${jobId}
        AND job."domain" = 'QUESTION_GENERATION'
        AND job."status" = 'PROCESSING'
        AND job."deletedAt" IS NULL
      ON CONFLICT ("job_id") DO NOTHING
    `);
    const rows = await tx.$queryRaw<BudgetRow[]>(Prisma.sql`
      SELECT
        "job_id" AS "jobId",
        "policy_version" AS "policyVersion",
        "policy_hash" AS "policyHash",
        "descriptor_hash" AS "descriptorHash",
        "mode",
        "state",
        "max_physical_calls" AS "maxPhysicalCalls",
        "leased_calls" AS "leasedCalls",
        "max_reserved_cost_micros" AS "maxReservedCostMicros",
        "reserved_cost_micros" AS "reservedCostMicros",
        "price_snapshot_id" AS "priceSnapshotId",
        "price_snapshot_hash" AS "priceSnapshotHash"
      FROM "question_generation_call_budgets"
      WHERE "job_id" = ${jobId}
      FOR UPDATE
    `);
    if (rows.length !== 1) {
      const activeJob = await tx.$queryRaw<Array<{ active: number }>>(Prisma.sql`
        SELECT 1 AS "active"
        FROM "workbench_ai_jobs"
        WHERE
          "id" = ${jobId}
          AND "domain" = 'QUESTION_GENERATION'
          AND "status" = 'PROCESSING'
          AND "deletedAt" IS NULL
      `);
      if (activeJob.length !== 1) {
        throw new QuestionGenerationAssignmentBudgetError(
          "QUESTION_GENERATION_ASSIGNMENT_BUDGET_JOB_NOT_ACTIVE",
          "provider work is forbidden after the Workbench job leaves PROCESSING",
        );
      }
      throw new QuestionGenerationAssignmentBudgetError(
        "QUESTION_GENERATION_ASSIGNMENT_BUDGET_ENROLLMENT_FAILED",
        "durable budget row was not created",
      );
    }
    assertPersistedPolicyMatches(rows[0]!, policy);
  });
}

class PrismaAssignmentBudgetController
  implements AtlasProductionAssignmentFetchController
{
  readonly controllerId = "prisma-question-generation-assignment-budget-v1";

  constructor(
    private readonly policy: Readonly<ActiveQuestionGenerationAssignmentBudgetPolicy>,
  ) {}

  async preFetchLease(
    input: Readonly<AtlasProductionLeaseRequest>,
  ): Promise<AtlasProductionCallLease> {
    if (
      input.scope.policyVersion !== this.policy.policyVersion ||
      input.scope.policyHash !== this.policy.policyHash ||
      input.scope.mode !== this.policy.mode
    ) {
      throw new QuestionGenerationAssignmentBudgetError(
        "QUESTION_GENERATION_ASSIGNMENT_BUDGET_POLICY_DRIFT",
        "active scope does not match its durable policy",
      );
    }
    let admissionWarning: string | null = this.policy.configurationWarning;
    let reservation = BigInt(0);
    try {
      reservation = reserveQuestionGenerationAssignmentCallCost(
        this.policy,
        input.request,
      );
    } catch (error) {
      if (this.policy.mode !== "SHADOW") throw error;
      admissionWarning =
        error &&
        typeof error === "object" &&
        "code" in error &&
        typeof error.code === "string"
          ? error.code.slice(0, 200)
          : "SHADOW_RESERVATION_UNAVAILABLE";
    }
    const leaseId = randomUUID();
    const enforce =
      this.policy.mode === "CANARY_ENFORCE" || this.policy.mode === "ENFORCE";
    const shadow = this.policy.mode === "SHADOW";

    try {
      return await prisma.$transaction(async (tx) => {
        // Linearize admission against every terminal Workbench UPDATE.
        // PostgreSQL row UPDATEs take the conflicting lock automatically:
        // whichever side locks first defines whether this call was admitted
        // before or after the terminal transition.
        const activeJob = await tx.$queryRaw<Array<{ active: number }>>(Prisma.sql`
          SELECT 1 AS "active"
          FROM "workbench_ai_jobs"
          WHERE
            "id" = ${input.scope.jobId}
            AND "domain" = 'QUESTION_GENERATION'
            AND "status" = 'PROCESSING'
            AND "deletedAt" IS NULL
          FOR UPDATE
        `);
        if (activeJob.length !== 1) {
          throw new QuestionGenerationAssignmentBudgetError(
            "QUESTION_GENERATION_ASSIGNMENT_BUDGET_JOB_NOT_ACTIVE",
            "provider work is forbidden after the Workbench job leaves PROCESSING",
          );
        }
        const rows = await tx.$queryRaw<LeaseOrdinalRow[]>(Prisma.sql`
        UPDATE "question_generation_call_budgets"
        SET
          "leased_calls" = "leased_calls" + 1,
          "reserved_cost_micros" = "reserved_cost_micros" + ${reservation},
          "updated_at" = NOW()
        WHERE
          "job_id" = ${input.scope.jobId}
          AND "policy_version" = ${this.policy.policyVersion}
          AND "policy_hash" = ${this.policy.policyHash}
          AND "mode" = ${this.policy.mode}
          AND "state" = 'ACTIVE'
          AND (
            ${!enforce}
            OR (
              "max_physical_calls" IS NOT NULL
              AND "leased_calls" < "max_physical_calls"
              AND "max_reserved_cost_micros" IS NOT NULL
              AND "reserved_cost_micros" + ${reservation}
                <= "max_reserved_cost_micros"
            )
          )
        RETURNING
          "leased_calls" AS "ordinal",
          "reserved_cost_micros" AS "reservedCostMicros"
        `);
        if (rows.length !== 1) {
          const existing = await tx.$queryRaw<BudgetRow[]>(Prisma.sql`
          SELECT
            "job_id" AS "jobId",
            "policy_version" AS "policyVersion",
            "policy_hash" AS "policyHash",
            "descriptor_hash" AS "descriptorHash",
            "mode",
            "state",
            "max_physical_calls" AS "maxPhysicalCalls",
            "leased_calls" AS "leasedCalls",
            "max_reserved_cost_micros" AS "maxReservedCostMicros",
            "reserved_cost_micros" AS "reservedCostMicros",
            "price_snapshot_id" AS "priceSnapshotId",
            "price_snapshot_hash" AS "priceSnapshotHash"
          FROM "question_generation_call_budgets"
          WHERE "job_id" = ${input.scope.jobId}
          `);
          if (existing.length !== 1) {
            throw new QuestionGenerationAssignmentBudgetError(
              "QUESTION_GENERATION_ASSIGNMENT_BUDGET_NOT_ENROLLED",
              "no durable assignment budget exists",
            );
          }
          assertPersistedPolicyMatches(existing[0]!, this.policy);
          throw new QuestionGenerationAssignmentBudgetError(
            QUESTION_GENERATION_ASSIGNMENT_BUDGET_EXHAUSTED,
            "physical-call or reserved-cost capacity is exhausted",
          );
        }

        const row = rows[0]!;
        const shadowExceeded =
          shadow &&
          (admissionWarning !== null ||
            (this.policy.maxPhysicalCalls !== null &&
              row.ordinal > this.policy.maxPhysicalCalls) ||
            (this.policy.maxReservedCostMicros !== null &&
              row.reservedCostMicros > this.policy.maxReservedCostMicros));
        await tx.$executeRaw(Prisma.sql`
        INSERT INTO "question_generation_call_leases" (
          "id",
          "job_id",
          "ordinal",
          "requested_model",
          "endpoint_hash",
          "wire_body_hash",
          "reserved_cost_micros",
          "observed_cost_micros",
          "state",
          "http_status",
          "shadow_exceeded",
          "admission_warning",
          "created_at",
          "settled_at"
        ) VALUES (
          ${leaseId},
          ${input.scope.jobId},
          ${row.ordinal},
          ${input.request.model},
          ${input.request.endpointHash},
          ${input.request.wireBodyHash},
          ${reservation},
          NULL,
          'LEASED',
          NULL,
          ${shadowExceeded},
          ${admissionWarning},
          NOW(),
          NULL
        )
        `);
        const snapshot = this.policy.priceSnapshot;
        return {
          leaseId,
          ...(enforce && snapshot
            ? {
                dispatchNotAfterEpochMs: Math.min(
                  snapshot.capturedAt.getTime() +
                    QUESTION_GENERATION_ASSIGNMENT_PRICE_MAX_AGE_MS,
                  snapshot.expiresAt.getTime(),
                ),
              }
            : {}),
        };
      });
    } catch (error) {
      if (error instanceof QuestionGenerationAssignmentBudgetError) {
        throw error;
      }
      if (!enforce) {
        // Observational modes must not turn a telemetry outage into a user
        // outage. Enforcing modes never send without a committed lease.
        return { leaseId: `unpersisted:${leaseId}` };
      }
      throw error;
    }
  }

  async observeResponse(
    lease: Readonly<AtlasProductionCallLease>,
    evidence: Readonly<AtlasProductionResponseEvidence>,
  ): Promise<void> {
    const observed = evidence.observedCostMicros;
    await prisma.$transaction(async (tx) => {
      const changed = await tx.$queryRaw<Array<{ jobId: string }>>(Prisma.sql`
        UPDATE "question_generation_call_leases"
        SET
          "state" = 'HTTP_RESPONSE',
          "http_status" = ${evidence.status},
          "observed_cost_micros" = ${observed},
          "generation_id_hash" = ${evidence.generationIdHash},
          "served_model" = ${evidence.servedModel},
          "settled_at" = NOW()
        WHERE "id" = ${lease.leaseId} AND "state" = 'LEASED'
        RETURNING "job_id" AS "jobId"
      `);
      if (changed.length === 1 && observed !== null) {
        await tx.$executeRaw(Prisma.sql`
          UPDATE "question_generation_call_budgets"
          SET
            "observed_cost_micros" = "observed_cost_micros" + ${observed},
            "updated_at" = NOW()
          WHERE "job_id" = ${changed[0]!.jobId}
        `);
      }
    });
  }

  async observeError(
    lease: Readonly<AtlasProductionCallLease>,
    evidence: Readonly<AtlasProductionErrorEvidence>,
  ): Promise<void> {
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "question_generation_call_leases"
      SET
        "state" = 'NETWORK_ERROR',
        "network_error_kind" = ${evidence.terminalKind},
        "network_error_name" = ${evidence.errorName},
        "network_error_code" = ${evidence.errorCode},
        "settled_at" = NOW()
      WHERE "id" = ${lease.leaseId} AND "state" = 'LEASED'
    `);
  }
}

async function runActive<T>(
  descriptor: QuestionGenerationAssignmentDescriptor,
  policy: Readonly<ActiveQuestionGenerationAssignmentBudgetPolicy>,
  fn: () => T | Promise<T>,
): Promise<T> {
  try {
    await ensureDurableBudget(descriptor.jobId, policy);
  } catch (error) {
    // Semantic errors (inactive job, policy drift, malformed durable state)
    // are never telemetry outages. In particular, a previously enforcing row
    // must not become an unscoped provider call after a config/mode change.
    if (error instanceof QuestionGenerationAssignmentBudgetError) {
      throw error;
    }
    if (policy.mode === "AUDIT" || policy.mode === "SHADOW") {
      console.warn("[qgen-assignment-budget] observational enrollment unavailable");
      return fn();
    }
    throw error;
  }
  return runWithAtlasProductionAssignmentScope(
    {
      jobId: descriptor.jobId,
      policyVersion: policy.policyVersion,
      policyHash: policy.policyHash,
      mode: policy.mode,
    },
    new PrismaAssignmentBudgetController(policy),
    fn,
  );
}

/**
 * OFF is an exact opt-out: no promise wrapper, ALS, Prisma call, or argument
 * mutation is introduced. Active modes enroll by immutable Workbench job ID.
 */
export function runWithQuestionGenerationAssignmentBudget<T>(
  descriptor: QuestionGenerationAssignmentDescriptor,
  fn: () => T | Promise<T>,
): T | Promise<T> {
  let admission: QuestionGenerationAssignmentBudgetAdmission;
  try {
    admission = readQuestionGenerationAssignmentBudgetAdmission(descriptor);
  } catch (error) {
    const configuredMode =
      process.env.QUESTION_GENERATION_ASSIGNMENT_BUDGET_MODE?.trim();
    if (configuredMode === "SHADOW") {
      const warningCode =
        error && typeof error === "object" && "code" in error &&
        typeof error.code === "string"
          ? error.code
          : "INVALID_ASSIGNMENT_BUDGET_POLICY";
      admission = createQuestionGenerationAssignmentBudgetAuditFallback(
        descriptor,
        warningCode,
      );
    } else if (configuredMode === "AUDIT") {
      console.warn("[qgen-assignment-budget] observational policy unavailable");
      return fn();
    } else {
      throw error;
    }
  }
  if (admission.mode === "OFF") return fn();
  return runActive(descriptor, admission, fn);
}

/** Best-effort terminal marker. OFF retains zero dependency on the new table. */
export function closeQuestionGenerationAssignmentBudget(
  jobId: string,
): Promise<void> {
  if (
    !process.env.QUESTION_GENERATION_ASSIGNMENT_BUDGET_MODE?.trim() ||
    process.env.QUESTION_GENERATION_ASSIGNMENT_BUDGET_MODE?.trim() === "OFF"
  ) {
    return Promise.resolve();
  }
  return prisma
    .$executeRaw(Prisma.sql`
      UPDATE "question_generation_call_budgets"
      SET "state" = 'CLOSED', "closed_at" = NOW(), "updated_at" = NOW()
      WHERE "job_id" = ${jobId} AND "state" = 'ACTIVE'
    `)
    .then(() => undefined);
}
