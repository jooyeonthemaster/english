-- ============================================================================
-- add_extraction_pipeline
-- ----------------------------------------------------------------------------
-- Captures the previously-drifted extraction pipeline schema as a formal
-- Prisma migration so `_prisma_migrations` reflects reality.
--
-- The tables and columns in this migration were originally applied via
-- `prisma db push` / `prisma db execute`. This migration is idempotent:
-- every CREATE uses `IF NOT EXISTS` and every ALTER uses `ADD COLUMN IF NOT
-- EXISTS` so it can be safely replayed against a database that already has
-- them (which is the expected production state).
--
-- After placing this file, mark it applied:
--     npx prisma migrate resolve --applied 20260418000000_add_extraction_pipeline
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. source_materials — hub table for "one physical source document"
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "source_materials" (
    "id" TEXT NOT NULL,
    "academyId" TEXT NOT NULL,
    "schoolId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "subject" TEXT DEFAULT 'ENGLISH',
    "grade" INTEGER,
    "semester" TEXT,
    "year" INTEGER,
    "round" TEXT,
    "examType" TEXT,
    "publisher" TEXT,
    "sourceRef" TEXT,
    "originalFileUrl" TEXT,
    "contentHash" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "source_materials_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "source_materials_academyId_type_idx" ON "source_materials"("academyId", "type");
CREATE INDEX IF NOT EXISTS "source_materials_academyId_grade_year_idx" ON "source_materials"("academyId", "grade", "year");
CREATE INDEX IF NOT EXISTS "source_materials_academyId_createdAt_idx" ON "source_materials"("academyId", "createdAt");
CREATE INDEX IF NOT EXISTS "source_materials_schoolId_idx" ON "source_materials"("schoolId");
CREATE INDEX IF NOT EXISTS "source_materials_contentHash_idx" ON "source_materials"("contentHash");
CREATE UNIQUE INDEX IF NOT EXISTS "source_materials_academyId_contentHash_key" ON "source_materials"("academyId", "contentHash");

-- ---------------------------------------------------------------------------
-- 2. passage_bundles — shared-passage question groups (e.g. CSAT [32~34])
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "passage_bundles" (
    "id" TEXT NOT NULL,
    "sourceMaterialId" TEXT NOT NULL,
    "passageId" TEXT NOT NULL,
    "orderInMaterial" INTEGER NOT NULL,
    "sharedLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "passage_bundles_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "passage_bundles_sourceMaterialId_idx" ON "passage_bundles"("sourceMaterialId");
CREATE INDEX IF NOT EXISTS "passage_bundles_passageId_idx" ON "passage_bundles"("passageId");
CREATE UNIQUE INDEX IF NOT EXISTS "passage_bundles_sourceMaterialId_passageId_key" ON "passage_bundles"("sourceMaterialId", "passageId");

-- ---------------------------------------------------------------------------
-- 3. extraction_jobs — per-upload job tracking
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "extraction_jobs" (
    "id" TEXT NOT NULL,
    "academyId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'PASSAGE_ONLY',
    "originalFileUrl" TEXT,
    "originalFileName" TEXT,
    "sourceMaterialId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "totalPages" INTEGER NOT NULL,
    "successPages" INTEGER NOT NULL DEFAULT 0,
    "failedPages" INTEGER NOT NULL DEFAULT 0,
    "pendingPages" INTEGER NOT NULL,
    "creditsReserved" INTEGER NOT NULL DEFAULT 0,
    "creditsConsumed" INTEGER NOT NULL DEFAULT 0,
    "creditsRefunded" INTEGER NOT NULL DEFAULT 0,
    "concurrencyLimit" INTEGER NOT NULL DEFAULT 5,
    "triggerRunId" TEXT,
    "errorSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "extraction_jobs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "extraction_jobs_academyId_status_idx" ON "extraction_jobs"("academyId", "status");
CREATE INDEX IF NOT EXISTS "extraction_jobs_academyId_createdAt_idx" ON "extraction_jobs"("academyId", "createdAt");
CREATE INDEX IF NOT EXISTS "extraction_jobs_status_createdAt_idx" ON "extraction_jobs"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "extraction_jobs_sourceMaterialId_idx" ON "extraction_jobs"("sourceMaterialId");

-- ---------------------------------------------------------------------------
-- 4. extraction_pages — per-page OCR unit
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "extraction_pages" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "pageIndex" INTEGER NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "imageBytes" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "idempotencyKey" TEXT NOT NULL,
    "leaseOwner" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "extractedText" TEXT,
    "confidence" DOUBLE PRECISION,
    "modelUsed" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "latencyMs" INTEGER,
    "creditTxId" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "extraction_pages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "extraction_pages_jobId_status_idx" ON "extraction_pages"("jobId", "status");
CREATE INDEX IF NOT EXISTS "extraction_pages_status_leaseExpiresAt_idx" ON "extraction_pages"("status", "leaseExpiresAt");
CREATE UNIQUE INDEX IF NOT EXISTS "extraction_pages_idempotencyKey_key" ON "extraction_pages"("idempotencyKey");
CREATE UNIQUE INDEX IF NOT EXISTS "extraction_pages_jobId_pageIndex_key" ON "extraction_pages"("jobId", "pageIndex");

-- ---------------------------------------------------------------------------
-- 5. extraction_results — legacy passage-level output
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "extraction_results" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "passageOrder" INTEGER NOT NULL,
    "sourcePageIndex" INTEGER[],
    "title" TEXT,
    "content" TEXT NOT NULL,
    "meta" JSONB,
    "confidence" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "savedPassageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "extraction_results_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "extraction_results_jobId_passageOrder_idx" ON "extraction_results"("jobId", "passageOrder");
CREATE INDEX IF NOT EXISTS "extraction_results_jobId_status_idx" ON "extraction_results"("jobId", "status");

-- ---------------------------------------------------------------------------
-- 6. extraction_items — granular typed-block output
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "extraction_items" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "pageId" TEXT,
    "sourcePageIndex" INTEGER[],
    "blockType" TEXT NOT NULL,
    "groupId" TEXT,
    "parentItemId" TEXT,
    "order" INTEGER NOT NULL,
    "localOrder" INTEGER,
    "title" TEXT,
    "content" TEXT NOT NULL,
    "rawText" TEXT,
    "questionMeta" JSONB,
    "choiceMeta" JSONB,
    "passageMeta" JSONB,
    "examMeta" JSONB,
    "boundingBox" JSONB,
    "confidence" DOUBLE PRECISION,
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "promotedTo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "extraction_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "extraction_items_jobId_order_idx" ON "extraction_items"("jobId", "order");
CREATE INDEX IF NOT EXISTS "extraction_items_jobId_blockType_idx" ON "extraction_items"("jobId", "blockType");
CREATE INDEX IF NOT EXISTS "extraction_items_jobId_groupId_idx" ON "extraction_items"("jobId", "groupId");
CREATE INDEX IF NOT EXISTS "extraction_items_parentItemId_idx" ON "extraction_items"("parentItemId");

-- ---------------------------------------------------------------------------
-- 7. Extraction lineage columns on existing tables (idempotent)
-- ---------------------------------------------------------------------------
ALTER TABLE "passages" ADD COLUMN IF NOT EXISTS "sourceMaterialId" TEXT;
ALTER TABLE "passages" ADD COLUMN IF NOT EXISTS "sourceExtractionItemId" TEXT;
ALTER TABLE "passages" ADD COLUMN IF NOT EXISTS "contentHash" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "passages_sourceExtractionItemId_key" ON "passages"("sourceExtractionItemId");
CREATE INDEX IF NOT EXISTS "passages_sourceMaterialId_idx" ON "passages"("sourceMaterialId");
CREATE INDEX IF NOT EXISTS "passages_contentHash_idx" ON "passages"("contentHash");

ALTER TABLE "questions" ADD COLUMN IF NOT EXISTS "sourceMaterialId" TEXT;
ALTER TABLE "questions" ADD COLUMN IF NOT EXISTS "bundleId" TEXT;
ALTER TABLE "questions" ADD COLUMN IF NOT EXISTS "sourceExtractionItemId" TEXT;
ALTER TABLE "questions" ADD COLUMN IF NOT EXISTS "questionNumber" INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS "questions_sourceExtractionItemId_key" ON "questions"("sourceExtractionItemId");
CREATE INDEX IF NOT EXISTS "questions_sourceMaterialId_idx" ON "questions"("sourceMaterialId");
CREATE INDEX IF NOT EXISTS "questions_bundleId_idx" ON "questions"("bundleId");

-- ---------------------------------------------------------------------------
-- 8. Foreign keys (guarded — drop-if-exists + re-add for idempotency)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    -- source_materials FKs
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'source_materials_academyId_fkey') THEN
        ALTER TABLE "source_materials" ADD CONSTRAINT "source_materials_academyId_fkey"
            FOREIGN KEY ("academyId") REFERENCES "academies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'source_materials_schoolId_fkey') THEN
        ALTER TABLE "source_materials" ADD CONSTRAINT "source_materials_schoolId_fkey"
            FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'source_materials_createdById_fkey') THEN
        ALTER TABLE "source_materials" ADD CONSTRAINT "source_materials_createdById_fkey"
            FOREIGN KEY ("createdById") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    -- passage_bundles FKs
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'passage_bundles_sourceMaterialId_fkey') THEN
        ALTER TABLE "passage_bundles" ADD CONSTRAINT "passage_bundles_sourceMaterialId_fkey"
            FOREIGN KEY ("sourceMaterialId") REFERENCES "source_materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'passage_bundles_passageId_fkey') THEN
        ALTER TABLE "passage_bundles" ADD CONSTRAINT "passage_bundles_passageId_fkey"
            FOREIGN KEY ("passageId") REFERENCES "passages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    -- extraction_jobs FKs
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'extraction_jobs_academyId_fkey') THEN
        ALTER TABLE "extraction_jobs" ADD CONSTRAINT "extraction_jobs_academyId_fkey"
            FOREIGN KEY ("academyId") REFERENCES "academies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'extraction_jobs_createdById_fkey') THEN
        ALTER TABLE "extraction_jobs" ADD CONSTRAINT "extraction_jobs_createdById_fkey"
            FOREIGN KEY ("createdById") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'extraction_jobs_sourceMaterialId_fkey') THEN
        ALTER TABLE "extraction_jobs" ADD CONSTRAINT "extraction_jobs_sourceMaterialId_fkey"
            FOREIGN KEY ("sourceMaterialId") REFERENCES "source_materials"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    -- extraction_pages FK
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'extraction_pages_jobId_fkey') THEN
        ALTER TABLE "extraction_pages" ADD CONSTRAINT "extraction_pages_jobId_fkey"
            FOREIGN KEY ("jobId") REFERENCES "extraction_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    -- extraction_results FK
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'extraction_results_jobId_fkey') THEN
        ALTER TABLE "extraction_results" ADD CONSTRAINT "extraction_results_jobId_fkey"
            FOREIGN KEY ("jobId") REFERENCES "extraction_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    -- extraction_items FKs
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'extraction_items_jobId_fkey') THEN
        ALTER TABLE "extraction_items" ADD CONSTRAINT "extraction_items_jobId_fkey"
            FOREIGN KEY ("jobId") REFERENCES "extraction_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'extraction_items_pageId_fkey') THEN
        ALTER TABLE "extraction_items" ADD CONSTRAINT "extraction_items_pageId_fkey"
            FOREIGN KEY ("pageId") REFERENCES "extraction_pages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'extraction_items_parentItemId_fkey') THEN
        ALTER TABLE "extraction_items" ADD CONSTRAINT "extraction_items_parentItemId_fkey"
            FOREIGN KEY ("parentItemId") REFERENCES "extraction_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    -- passages.sourceMaterialId FK
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'passages_sourceMaterialId_fkey') THEN
        ALTER TABLE "passages" ADD CONSTRAINT "passages_sourceMaterialId_fkey"
            FOREIGN KEY ("sourceMaterialId") REFERENCES "source_materials"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    -- questions.sourceMaterialId + bundleId FKs
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'questions_sourceMaterialId_fkey') THEN
        ALTER TABLE "questions" ADD CONSTRAINT "questions_sourceMaterialId_fkey"
            FOREIGN KEY ("sourceMaterialId") REFERENCES "source_materials"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'questions_bundleId_fkey') THEN
        ALTER TABLE "questions" ADD CONSTRAINT "questions_bundleId_fkey"
            FOREIGN KEY ("bundleId") REFERENCES "passage_bundles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
