-- Durable provider-call admission for Workbench question-generation jobs.
-- Operational rollback is QUESTION_GENERATION_ASSIGNMENT_BUDGET_MODE=OFF.
-- Historical leases remain intact for audit; this migration never enables a
-- mode or chooses a cap by itself.
CREATE TABLE "question_generation_call_budgets" (
  "job_id" TEXT NOT NULL,
  "policy_version" TEXT NOT NULL,
  "policy_hash" TEXT NOT NULL,
  "descriptor_hash" TEXT NOT NULL,
  "mode" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'ACTIVE',
  "policy_snapshot" JSONB NOT NULL,
  "max_physical_calls" INTEGER,
  "leased_calls" INTEGER NOT NULL DEFAULT 0,
  "max_reserved_cost_micros" BIGINT,
  "reserved_cost_micros" BIGINT NOT NULL DEFAULT 0,
  "observed_cost_micros" BIGINT NOT NULL DEFAULT 0,
  "price_snapshot_id" TEXT,
  "price_snapshot_hash" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closed_at" TIMESTAMPTZ(3),

  CONSTRAINT "question_generation_call_budgets_pkey" PRIMARY KEY ("job_id"),
  CONSTRAINT "question_generation_call_budgets_nonnegative_check" CHECK (
    "leased_calls" >= 0
    AND "reserved_cost_micros" >= 0
    AND "observed_cost_micros" >= 0
    AND "mode" IN ('AUDIT', 'SHADOW', 'CANARY_ENFORCE', 'ENFORCE')
    AND "state" IN ('ACTIVE', 'CLOSED')
    AND length("policy_hash") = 64
    AND "policy_hash" ~ '^[0-9a-f]{64}$'
    AND length("descriptor_hash") = 64
    AND "descriptor_hash" ~ '^[0-9a-f]{64}$'
    AND ("max_physical_calls" IS NULL OR "max_physical_calls" > 0)
    AND (
      "max_reserved_cost_micros" IS NULL
      OR "max_reserved_cost_micros" > 0
    )
    AND (
      "mode" = 'AUDIT'
      OR (
        "max_physical_calls" IS NOT NULL
        AND "max_reserved_cost_micros" IS NOT NULL
        AND "price_snapshot_id" IS NOT NULL
        AND "price_snapshot_hash" IS NOT NULL
        AND length("price_snapshot_hash") = 64
        AND "price_snapshot_hash" ~ '^[0-9a-f]{64}$'
      )
    )
  )
);

CREATE TABLE "question_generation_call_leases" (
  "id" TEXT NOT NULL,
  "job_id" TEXT NOT NULL,
  "ordinal" INTEGER NOT NULL,
  "requested_model" TEXT NOT NULL,
  "endpoint_hash" TEXT NOT NULL,
  "wire_body_hash" TEXT NOT NULL,
  "reserved_cost_micros" BIGINT NOT NULL,
  "observed_cost_micros" BIGINT,
  "state" TEXT NOT NULL,
  "http_status" INTEGER,
  "shadow_exceeded" BOOLEAN NOT NULL DEFAULT false,
  "generation_id_hash" TEXT,
  "served_model" TEXT,
  "network_error_kind" TEXT,
  "network_error_name" TEXT,
  "network_error_code" TEXT,
  "admission_warning" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "settled_at" TIMESTAMPTZ(3),

  CONSTRAINT "question_generation_call_leases_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "question_generation_call_leases_job_ordinal_key"
    UNIQUE ("job_id", "ordinal"),
  CONSTRAINT "question_generation_call_leases_values_check" CHECK (
    "ordinal" > 0
    AND "reserved_cost_micros" >= 0
    AND ("observed_cost_micros" IS NULL OR "observed_cost_micros" >= 0)
    AND "state" IN ('LEASED', 'HTTP_RESPONSE', 'NETWORK_ERROR')
  ),
  CONSTRAINT "question_generation_call_leases_job_id_fkey"
    FOREIGN KEY ("job_id") REFERENCES "question_generation_call_budgets"("job_id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "question_generation_call_budgets_mode_created_at_idx"
  ON "question_generation_call_budgets"("mode", "created_at");
CREATE INDEX "question_generation_call_leases_job_id_state_idx"
  ON "question_generation_call_leases"("job_id", "state");
CREATE INDEX "question_generation_call_leases_created_at_idx"
  ON "question_generation_call_leases"("created_at");
