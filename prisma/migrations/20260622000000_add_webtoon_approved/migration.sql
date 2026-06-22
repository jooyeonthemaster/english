-- Add `approved` to webtoons (강사 검수완료 상태). 기존 행은 미검수(false)로 백필.
ALTER TABLE "webtoons" ADD COLUMN "approved" BOOLEAN NOT NULL DEFAULT false;
