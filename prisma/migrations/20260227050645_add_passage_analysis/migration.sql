-- CreateTable
CREATE TABLE "passage_analyses" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "passageId" TEXT NOT NULL,
    "analysisData" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "passage_analyses_passageId_fkey" FOREIGN KEY ("passageId") REFERENCES "passages" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "passage_analyses_passageId_key" ON "passage_analyses"("passageId");
