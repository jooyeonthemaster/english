-- AlterTable: 시험지 활동 카운터 (저장/수정/인쇄 횟수)
ALTER TABLE "exams"
  ADD COLUMN "saveCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "editCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "printCount" INTEGER NOT NULL DEFAULT 0;
