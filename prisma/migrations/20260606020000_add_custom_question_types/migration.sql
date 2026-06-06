-- CreateTable
CREATE TABLE "custom_question_types" (
    "id" TEXT NOT NULL,
    "academyId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "nearestBuiltin" TEXT,
    "matchConfidence" TEXT,
    "activeVersionId" TEXT,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "generatedCount" INTEGER NOT NULL DEFAULT 0,
    "approvedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "custom_question_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_question_type_versions" (
    "id" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "spec" JSONB NOT NULL,
    "examples" JSONB,
    "source" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "custom_question_type_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_question_generation_jobs" (
    "id" TEXT NOT NULL,
    "academyId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "customTypeId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "passageIds" JSONB NOT NULL,
    "countPerPassage" INTEGER NOT NULL DEFAULT 1,
    "gradeInfo" TEXT,
    "passageCount" INTEGER NOT NULL DEFAULT 0,
    "totalCount" INTEGER NOT NULL DEFAULT 0,
    "savedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "custom_question_generation_jobs_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "questions" ADD COLUMN "customTypeId" TEXT;

-- CreateIndex
CREATE INDEX "custom_question_types_academyId_status_idx" ON "custom_question_types"("academyId", "status");

-- CreateIndex
CREATE INDEX "custom_question_types_academyId_createdAt_idx" ON "custom_question_types"("academyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "custom_question_type_versions_typeId_version_key" ON "custom_question_type_versions"("typeId", "version");

-- CreateIndex
CREATE INDEX "custom_question_type_versions_typeId_idx" ON "custom_question_type_versions"("typeId");

-- CreateIndex
CREATE INDEX "custom_question_generation_jobs_academyId_status_idx" ON "custom_question_generation_jobs"("academyId", "status");

-- CreateIndex
CREATE INDEX "custom_question_generation_jobs_academyId_createdAt_idx" ON "custom_question_generation_jobs"("academyId", "createdAt");

-- CreateIndex
CREATE INDEX "custom_question_generation_jobs_customTypeId_idx" ON "custom_question_generation_jobs"("customTypeId");

-- CreateIndex
CREATE INDEX "questions_customTypeId_idx" ON "questions"("customTypeId");

-- AddForeignKey
ALTER TABLE "custom_question_type_versions" ADD CONSTRAINT "custom_question_type_versions_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "custom_question_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;
