-- Minimal Workbench parent used only in the isolated qgen_budget_ephemeral_*
-- database. The budget migration itself is applied verbatim after this file.
CREATE TABLE "workbench_ai_jobs" (
  "id" TEXT PRIMARY KEY,
  "domain" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "deletedAt" TIMESTAMPTZ(3)
);
