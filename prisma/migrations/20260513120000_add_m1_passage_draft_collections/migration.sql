-- Folder organization for M1 passage drafts (자료 관리 페이지 폴더 기능).
-- Mirrors passage_collections / exam_collections, but bound to
-- extraction_m1_passage_drafts so teachers can group drafts before
-- they are saved as final Passages.

CREATE TABLE IF NOT EXISTS "extraction_m1_passage_draft_collections" (
    "id" TEXT NOT NULL,
    "academyId" TEXT NOT NULL,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "extraction_m1_passage_draft_collections_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "extraction_m1_passage_draft_collections_academyId_idx"
  ON "extraction_m1_passage_draft_collections"("academyId");

CREATE INDEX IF NOT EXISTS "extraction_m1_passage_draft_collections_parentId_idx"
  ON "extraction_m1_passage_draft_collections"("parentId");

ALTER TABLE "extraction_m1_passage_draft_collections"
ADD CONSTRAINT "extraction_m1_passage_draft_collections_academyId_fkey"
FOREIGN KEY ("academyId") REFERENCES "academies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "extraction_m1_passage_draft_collections"
ADD CONSTRAINT "extraction_m1_passage_draft_collections_parentId_fkey"
FOREIGN KEY ("parentId") REFERENCES "extraction_m1_passage_draft_collections"("id") ON DELETE SET NULL ON UPDATE CASCADE;


CREATE TABLE IF NOT EXISTS "extraction_m1_passage_draft_collection_items" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "orderNum" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "extraction_m1_passage_draft_collection_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "extraction_m1_passage_draft_collection_items_collectionId_draftId_key"
  ON "extraction_m1_passage_draft_collection_items"("collectionId", "draftId");

CREATE INDEX IF NOT EXISTS "extraction_m1_passage_draft_collection_items_collectionId_idx"
  ON "extraction_m1_passage_draft_collection_items"("collectionId");

ALTER TABLE "extraction_m1_passage_draft_collection_items"
ADD CONSTRAINT "extraction_m1_passage_draft_collection_items_collectionId_fkey"
FOREIGN KEY ("collectionId") REFERENCES "extraction_m1_passage_draft_collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "extraction_m1_passage_draft_collection_items"
ADD CONSTRAINT "extraction_m1_passage_draft_collection_items_draftId_fkey"
FOREIGN KEY ("draftId") REFERENCES "extraction_m1_passage_drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
