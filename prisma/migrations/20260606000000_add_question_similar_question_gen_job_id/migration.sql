-- AlterTable
ALTER TABLE "questions" ADD COLUMN "similarQuestionGenJobId" TEXT;

-- CreateIndex
CREATE INDEX "questions_similarQuestionGenJobId_idx" ON "questions"("similarQuestionGenJobId");
