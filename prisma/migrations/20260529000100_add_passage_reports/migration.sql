-- A4 자유 편집 학습자료 (Canva 스타일) — 3 tables: reports / revisions / exports

-- ── PassageReport ───────────────────────────────────────────────────────────
CREATE TABLE "passage_reports" (
    "id" TEXT NOT NULL,
    "academyId" TEXT NOT NULL,
    "passageId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "pages" JSONB NOT NULL,
    "theme" JSONB,
    "templateId" TEXT,
    "generationPlan" TEXT NOT NULL DEFAULT 'STANDARD',
    "sourcedFromAnalysisId" TEXT,
    "contentHash" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "lastEditedById" TEXT,
    "lastEditedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "shareToken" TEXT,
    "sharedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "passage_reports_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "passage_reports_shareToken_key" ON "passage_reports"("shareToken");
CREATE INDEX "passage_reports_academyId_passageId_idx" ON "passage_reports"("academyId", "passageId");
CREATE INDEX "passage_reports_academyId_status_updatedAt_idx" ON "passage_reports"("academyId", "status", "updatedAt");
CREATE INDEX "passage_reports_passageId_idx" ON "passage_reports"("passageId");

ALTER TABLE "passage_reports"
  ADD CONSTRAINT "passage_reports_academyId_fkey"
  FOREIGN KEY ("academyId") REFERENCES "academies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "passage_reports"
  ADD CONSTRAINT "passage_reports_passageId_fkey"
  FOREIGN KEY ("passageId") REFERENCES "passages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "passage_reports"
  ADD CONSTRAINT "passage_reports_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "passage_reports"
  ADD CONSTRAINT "passage_reports_lastEditedById_fkey"
  FOREIGN KEY ("lastEditedById") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ── PassageReportRevision ───────────────────────────────────────────────────
CREATE TABLE "passage_report_revisions" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "pages" JSONB NOT NULL,
    "theme" JSONB,
    "authorId" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "passage_report_revisions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "passage_report_revisions_reportId_version_key" ON "passage_report_revisions"("reportId", "version");
CREATE INDEX "passage_report_revisions_reportId_createdAt_idx" ON "passage_report_revisions"("reportId", "createdAt");

ALTER TABLE "passage_report_revisions"
  ADD CONSTRAINT "passage_report_revisions_reportId_fkey"
  FOREIGN KEY ("reportId") REFERENCES "passage_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "passage_report_revisions"
  ADD CONSTRAINT "passage_report_revisions_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ── PassageReportExport ─────────────────────────────────────────────────────
CREATE TABLE "passage_report_exports" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "storageKey" TEXT,
    "fileSizeBytes" INTEGER,
    "triggerRunId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "passage_report_exports_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "passage_report_exports_reportId_format_contentHash_key" ON "passage_report_exports"("reportId", "format", "contentHash");
CREATE INDEX "passage_report_exports_reportId_idx" ON "passage_report_exports"("reportId");
CREATE INDEX "passage_report_exports_status_createdAt_idx" ON "passage_report_exports"("status", "createdAt");

ALTER TABLE "passage_report_exports"
  ADD CONSTRAINT "passage_report_exports_reportId_fkey"
  FOREIGN KEY ("reportId") REFERENCES "passage_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
