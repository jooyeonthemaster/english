-- Add nullable customLabel for teacher overrides shown in the 자료 관리 page.
-- Auto-set `title` stays untouched (other pages still read it); the manage UI
-- reads `customLabel` first and falls back to a derived label.
ALTER TABLE "source_materials" ADD COLUMN "customLabel" TEXT;
