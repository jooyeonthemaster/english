-- P7-D2 (원문 vs AI복원) — additive, drift-safe. 이 DB는 prisma migrate 히스토리와
-- 드리프트가 있어 `db execute`로 직접 적용한다(migrate 히스토리 미기록).
--   npx prisma db execute --file prisma/migrations/manual/20260603_p7_outputmode.sql --schema prisma/schema.prisma
-- 둘 다 nullable·default 없음 → 테이블 rewrite/락 없음, 재실행 멱등(IF NOT EXISTS).
ALTER TABLE "extraction_jobs" ADD COLUMN IF NOT EXISTS "outputMode" TEXT;
ALTER TABLE "extraction_m1_passage_drafts" ADD COLUMN IF NOT EXISTS "restorationCreditTxId" TEXT;
