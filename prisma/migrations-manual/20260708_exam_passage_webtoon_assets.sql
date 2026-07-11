-- Platform-owned, pre-generated webtoons for static 수능·모평 기출 passages.
-- These are not teacher-generated Webtoon rows. They remain locked until a
-- separately reviewed asset reaches status='APPROVED', then academies can
-- unlock/download each language version for the reduced 기출 price.

CREATE TABLE IF NOT EXISTS "exam_passage_webtoon_assets" (
  "id" TEXT PRIMARY KEY,
  "examPassageId" TEXT NOT NULL,
  "style" TEXT NOT NULL DEFAULT 'KOREAN_WEBTOON',
  "language" TEXT NOT NULL DEFAULT 'KO',
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "imageUrl" TEXT,
  "storagePath" TEXT,
  "rawAtlasUrl" TEXT,
  "promptSnapshot" TEXT,
  "promptHash" TEXT,
  "imageModel" TEXT,
  "imageSize" TEXT,
  "imageQuality" TEXT,
  "imageOutputFormat" TEXT,
  "atlasPredictionId" TEXT,
  "sourceHash" TEXT,
  "sourceMeta" JSONB,
  "qaReport" JSONB,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "errorMessage" TEXT,
  "generatedAt" TIMESTAMPTZ,
  "reviewedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS "exam_passage_webtoon_assets_examPassageId_language_style_key"
  ON "exam_passage_webtoon_assets"("examPassageId", "language", "style");

CREATE INDEX IF NOT EXISTS "exam_passage_webtoon_assets_examPassageId_idx"
  ON "exam_passage_webtoon_assets"("examPassageId");

CREATE INDEX IF NOT EXISTS "exam_passage_webtoon_assets_status_idx"
  ON "exam_passage_webtoon_assets"("status");

CREATE INDEX IF NOT EXISTS "exam_passage_webtoon_assets_updatedAt_idx"
  ON "exam_passage_webtoon_assets"("updatedAt");

CREATE TABLE IF NOT EXISTS "exam_passage_webtoon_purchases" (
  "id" TEXT PRIMARY KEY,
  "academyId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "examPassageId" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "language" TEXT NOT NULL,
  "style" TEXT NOT NULL DEFAULT 'KOREAN_WEBTOON',
  "creditTransactionId" TEXT NOT NULL UNIQUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS "exam_passage_webtoon_purchases_academy_exam_language_style_key"
  ON "exam_passage_webtoon_purchases"("academyId", "examPassageId", "language", "style");

CREATE INDEX IF NOT EXISTS "exam_passage_webtoon_purchases_academyId_idx"
  ON "exam_passage_webtoon_purchases"("academyId");

CREATE INDEX IF NOT EXISTS "exam_passage_webtoon_purchases_assetId_idx"
  ON "exam_passage_webtoon_purchases"("assetId");

CREATE INDEX IF NOT EXISTS "exam_passage_webtoon_purchases_examPassageId_idx"
  ON "exam_passage_webtoon_purchases"("examPassageId");
