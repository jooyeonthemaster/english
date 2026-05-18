-- Append-only audit trail for extraction management actions.

CREATE TABLE IF NOT EXISTS "extraction_audit_logs" (
    "id" TEXT NOT NULL,
    "academyId" TEXT NOT NULL,
    "actorStaffId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "targetLabel" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "extraction_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "extraction_audit_logs_academyId_createdAt_idx"
    ON "extraction_audit_logs"("academyId", "createdAt");

CREATE INDEX IF NOT EXISTS "extraction_audit_logs_actorStaffId_createdAt_idx"
    ON "extraction_audit_logs"("actorStaffId", "createdAt");

CREATE INDEX IF NOT EXISTS "extraction_audit_logs_action_createdAt_idx"
    ON "extraction_audit_logs"("action", "createdAt");

CREATE INDEX IF NOT EXISTS "extraction_audit_logs_targetType_targetId_createdAt_idx"
    ON "extraction_audit_logs"("targetType", "targetId", "createdAt");

ALTER TABLE "extraction_audit_logs"
ADD CONSTRAINT "extraction_audit_logs_academyId_fkey"
FOREIGN KEY ("academyId") REFERENCES "academies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "extraction_audit_logs"
ADD CONSTRAINT "extraction_audit_logs_actorStaffId_fkey"
FOREIGN KEY ("actorStaffId") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
