-- Per-banner targeting: expose a banner to everyone (ALL) or only to specific
-- academies (SPECIFIC + target_academy_ids). Existing banners default to ALL
-- (전체 노출) so behavior is unchanged.

ALTER TABLE "site_banners"
  ADD COLUMN IF NOT EXISTS "target_mode" TEXT NOT NULL DEFAULT 'ALL';

ALTER TABLE "site_banners"
  ADD COLUMN IF NOT EXISTS "target_academy_ids" JSONB NOT NULL DEFAULT '[]';
