-- 장문 세트 (Long-Passage Multi-Question Sets) — additive only.
-- Adds QuestionSet + QuestionSetItem tables and two nullable Question columns.
-- Hand-authored from `prisma migrate diff` with pre-existing prod drift
-- (similar_exam_generation_jobs, updatedAt defaults, index renames) deliberately
-- EXCLUDED — that drift is out of scope and must not be touched here.

-- AlterTable
ALTER TABLE "questions" ADD COLUMN     "inSet" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "setId" TEXT;

-- CreateTable
CREATE TABLE "question_sets" (
    "id" TEXT NOT NULL,
    "jobId" TEXT,
    "academyId" TEXT NOT NULL,
    "structuralMode" TEXT NOT NULL DEFAULT 'NONE',
    "canonicalPassage" TEXT NOT NULL,
    "displayedPassageLayout" TEXT NOT NULL,
    "layoutFingerprint" TEXT NOT NULL,
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "setLabel" TEXT,
    "basePassageId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OK',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "question_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_set_items" (
    "id" TEXT NOT NULL,
    "setId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "orderInSet" INTEGER NOT NULL,
    "isStructural" BOOLEAN NOT NULL DEFAULT false,
    "spans" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "question_set_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "question_sets_jobId_idx" ON "question_sets"("jobId");

-- CreateIndex
CREATE INDEX "question_sets_academyId_idx" ON "question_sets"("academyId");

-- CreateIndex
CREATE UNIQUE INDEX "question_set_items_questionId_key" ON "question_set_items"("questionId");

-- CreateIndex
CREATE INDEX "question_set_items_setId_idx" ON "question_set_items"("setId");

-- CreateIndex
CREATE UNIQUE INDEX "question_set_items_setId_orderInSet_key" ON "question_set_items"("setId", "orderInSet");

-- CreateIndex
CREATE INDEX "questions_setId_idx" ON "questions"("setId");

-- AddForeignKey
ALTER TABLE "question_sets" ADD CONSTRAINT "question_sets_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "workbench_ai_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_sets" ADD CONSTRAINT "question_sets_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "academies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_sets" ADD CONSTRAINT "question_sets_basePassageId_fkey" FOREIGN KEY ("basePassageId") REFERENCES "passages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_set_items" ADD CONSTRAINT "question_set_items_setId_fkey" FOREIGN KEY ("setId") REFERENCES "question_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_set_items" ADD CONSTRAINT "question_set_items_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
