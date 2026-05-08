CREATE TABLE IF NOT EXISTS "prebuilt_sessions" (
  "id" TEXT NOT NULL,
  "passageId" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "sessionSeq" INTEGER NOT NULL,
  "questionIds" TEXT NOT NULL,
  "questionCount" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "prebuilt_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "prebuilt_sessions_passageId_category_sessionSeq_key"
  ON "prebuilt_sessions"("passageId", "category", "sessionSeq");

CREATE INDEX IF NOT EXISTS "prebuilt_sessions_passageId_idx"
  ON "prebuilt_sessions"("passageId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'prebuilt_sessions_passageId_fkey'
  ) THEN
    ALTER TABLE "prebuilt_sessions"
      ADD CONSTRAINT "prebuilt_sessions_passageId_fkey"
      FOREIGN KEY ("passageId") REFERENCES "passages"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
