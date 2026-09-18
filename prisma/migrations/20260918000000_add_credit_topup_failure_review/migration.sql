-- 결제 관리 "확인 필요"(FAILED)에서 관리자가 확인(무시) 처리한 기록
ALTER TABLE "credit_top_ups" ADD COLUMN IF NOT EXISTS "failureReviewedAt" TIMESTAMP(3);
ALTER TABLE "credit_top_ups" ADD COLUMN IF NOT EXISTS "failureReviewedBy" TEXT;
