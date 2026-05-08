CREATE TABLE IF NOT EXISTS "class_materials" (
  "id" TEXT NOT NULL,
  "academyId" TEXT NOT NULL,
  "classId" TEXT,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "fileUrl" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "fileType" TEXT NOT NULL,
  "fileSize" INTEGER NOT NULL,
  "uploadedBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "class_materials_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "class_materials_academyId_idx"
  ON "class_materials"("academyId");

CREATE INDEX IF NOT EXISTS "class_materials_classId_idx"
  ON "class_materials"("classId");

CREATE INDEX IF NOT EXISTS "class_materials_uploadedBy_idx"
  ON "class_materials"("uploadedBy");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'class_materials_academyId_fkey'
  ) THEN
    ALTER TABLE "class_materials"
      ADD CONSTRAINT "class_materials_academyId_fkey"
      FOREIGN KEY ("academyId") REFERENCES "academies"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'class_materials_classId_fkey'
  ) THEN
    ALTER TABLE "class_materials"
      ADD CONSTRAINT "class_materials_classId_fkey"
      FOREIGN KEY ("classId") REFERENCES "classes"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'class_materials_uploadedBy_fkey'
  ) THEN
    ALTER TABLE "class_materials"
      ADD CONSTRAINT "class_materials_uploadedBy_fkey"
      FOREIGN KEY ("uploadedBy") REFERENCES "staff"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
