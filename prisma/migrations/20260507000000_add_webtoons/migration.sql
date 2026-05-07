CREATE TABLE IF NOT EXISTS "webtoons" (
  "id" TEXT NOT NULL,
  "academyId" TEXT NOT NULL,
  "passageId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "style" TEXT NOT NULL,
  "customPrompt" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "imageUrl" TEXT,
  "storagePath" TEXT,
  "rawAtlasUrl" TEXT,
  "errorMessage" TEXT,
  "triggerRunId" TEXT,
  "creditTransactionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "webtoons_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "webtoons_creditTransactionId_key"
  ON "webtoons"("creditTransactionId");

CREATE INDEX IF NOT EXISTS "webtoons_academyId_idx"
  ON "webtoons"("academyId");

CREATE INDEX IF NOT EXISTS "webtoons_passageId_idx"
  ON "webtoons"("passageId");

CREATE INDEX IF NOT EXISTS "webtoons_status_idx"
  ON "webtoons"("status");

CREATE INDEX IF NOT EXISTS "webtoons_academyId_status_idx"
  ON "webtoons"("academyId", "status");

CREATE INDEX IF NOT EXISTS "webtoons_createdAt_idx"
  ON "webtoons"("createdAt");

DO $$
BEGIN
  ALTER TABLE "webtoons"
    ADD CONSTRAINT "webtoons_academyId_fkey"
    FOREIGN KEY ("academyId") REFERENCES "academies"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "webtoons"
    ADD CONSTRAINT "webtoons_passageId_fkey"
    FOREIGN KEY ("passageId") REFERENCES "passages"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "webtoons"
    ADD CONSTRAINT "webtoons_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "staff"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
