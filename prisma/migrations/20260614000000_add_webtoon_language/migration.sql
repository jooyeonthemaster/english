-- Add `language` to webtoons (대사·나레이션 언어 옵션).
-- "KO" | "KO_EN" | "EN" | "EN_KO_GLOSS". 기존 행은 한글 전용(KO)로 백필.
ALTER TABLE "webtoons" ADD COLUMN "language" TEXT NOT NULL DEFAULT 'KO';
